import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildReportsAssistantPrompt } from "../prompt";
import { runReportsAssistant } from "../loop";
import { ACTIVE_SKILL_NAMES } from "../skills";

const originalFetch = globalThis.fetch;
const dummySupabase = {} as SupabaseClient;
const period = { from: "2026-08-01", to: "2026-08-19" };

/**
 * Answers any PostgREST chain with no rows. The metric computations still emit
 * their full set of ids at zero, which is all these tests need — they are about
 * whether a looked-up figure becomes a citable key, not about arithmetic.
 */
function metricSupabase(): SupabaseClient {
  const result = { data: [], error: null, count: 0 };
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return async () => ({ data: null, error: null });
        }
        return () => builder;
      },
    },
  );
  return { from: () => builder, rpc: () => builder } as unknown as SupabaseClient;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function completionResponse(message: Record<string, unknown>, status = 200) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", ...message } }],
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function catalogToolCall() {
  return {
    id: "call_catalog_1",
    type: "function",
    function: { name: "get_catalog", arguments: "{}" },
  };
}

describe("buildReportsAssistantPrompt", () => {
  it("injects the period under discussion", () => {
    const prompt = buildReportsAssistantPrompt(period);
    assert.match(prompt, /LoanStar/);
    assert.match(prompt, /LoanBot/);
    assert.match(prompt, /2026-08-01/);
    assert.match(prompt, /2026-08-19/);
  });

  it("leaves skill routing to the tool descriptions", () => {
    // Routing used to be duplicated here and drifted out of sync with the
    // code. Tool descriptions are now the single source of truth.
    const prompt = buildReportsAssistantPrompt(period);
    for (const name of ACTIVE_SKILL_NAMES) {
      assert.doesNotMatch(prompt, new RegExp(name), `prompt should not name ${name}`);
    }
  });

  it("states the grounding, coverage and omission rules", () => {
    const prompt = buildReportsAssistantPrompt(period);
    assert.match(prompt, /never invent/i);
    assert.match(prompt, /coverage note/i);
    assert.match(prompt, /omitted rows/i);
  });

  it("forbids talking about its own workings rather than denying being an AI", () => {
    const prompt = buildReportsAssistantPrompt(period);
    assert.match(prompt, /do not discuss your own workings/i);
    assert.doesNotMatch(prompt, /never say you are an ai/i);
  });

  it("directs block choice but leaves the shape to the schema", () => {
    // Asking for shape in prose is what produced nine bullets of metric-speak.
    // ANSWER_CARD_JSON_SCHEMA enforces it now, so the prompt only says which
    // block answers which kind of question.
    const prompt = buildReportsAssistantPrompt(period);
    assert.match(prompt, /kpi block/i);
    assert.match(prompt, /chart block/i);
    assert.match(prompt, /table block/i);
    assert.doesNotMatch(prompt, /\b2 to 5\b/);
    assert.doesNotMatch(prompt, /bold/i);
  });

  it("tells the model its citations are checked", () => {
    assert.match(buildReportsAssistantPrompt(period), /cite only those keys/i);
  });
});

describe("runReportsAssistant", () => {
  it("returns model content with no tools and empty skillsUsed", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return completionResponse({ content: "Collections rose this period." });
    };

    const result = await runReportsAssistant({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      period,
      messages: [{ role: "user", content: "How are collections?" }],
      supabase: dummySupabase,
    });

    assert.equal(calls, 1);
    assert.equal(result.reply, "Collections rose this period.");
    assert.deepEqual(result.skillsUsed, []);
  });

  it("echoes assistant tool_calls then a tool result before the follow-up", async () => {
    const bodies: unknown[] = [];
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(String(init?.body)));
      if (calls === 1) {
        return completionResponse({
          content: null,
          tool_calls: [catalogToolCall()],
        });
      }
      return completionResponse({ content: "The catalog includes money.collected." });
    };

    const result = await runReportsAssistant({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      period,
      messages: [{ role: "user", content: "What metrics exist?" }],
      supabase: dummySupabase,
    });

    assert.equal(calls, 2);
    assert.deepEqual(result.skillsUsed, ["get_catalog"]);
    assert.equal(result.reply, "The catalog includes money.collected.");

    const second = bodies[1] as {
      messages: Array<{
        role: string;
        tool_calls?: unknown;
        tool_call_id?: string;
      }>;
    };
    const assistantEcho = second.messages.find(
      (m) => m.role === "assistant" && Array.isArray(m.tool_calls),
    );
    const toolMsg = second.messages.find((m) => m.role === "tool");
    assert.ok(assistantEcho, "second request must echo the assistant tool_calls message");
    assert.ok(toolMsg, "second request must include a role:tool message");
    assert.equal(toolMsg?.tool_call_id, "call_catalog_1");
    const assistantIndex = second.messages.indexOf(assistantEcho!);
    const toolIndex = second.messages.indexOf(toolMsg!);
    assert.ok(assistantIndex < toolIndex, "assistant tool_calls must come before role:tool");
  });

  it("throws OpenAI HTTP error on non-OK response", async () => {
    globalThis.fetch = async () =>
      new Response("invalid_api_key", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      });

    await assert.rejects(
      () =>
        runReportsAssistant({
          apiKey: "sk-bad",
          model: "gpt-4o-mini",
          period,
          messages: [{ role: "user", content: "Hi" }],
          supabase: dummySupabase,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /^OpenAI/);
        assert.match(err.message, /HTTP 401/);
        return true;
      },
    );
  });

  it("returns fallback when the model content is empty", async () => {
    globalThis.fetch = async () => completionResponse({ content: "" });

    const result = await runReportsAssistant({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      period,
      messages: [{ role: "user", content: "Hi" }],
      supabase: dummySupabase,
    });

    assert.equal(result.reply, "I didn't get a reply back — try that question once more.");
  });

  it("stops after 6 OpenAI calls if the model still wants a tool", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return completionResponse({
        content: null,
        tool_calls: [catalogToolCall()],
      });
    };

    const result = await runReportsAssistant({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      period,
      messages: [{ role: "user", content: "Keep looking" }],
      supabase: dummySupabase,
    });

    assert.equal(calls, 6);
    assert.equal(
      result.reply,
      "That one ran long. Narrow it a bit and I'll look again.",
    );
  });

  it("asks OpenAI for the card shape rather than requesting it in prose", async () => {
    let sent: { response_format?: { type?: string; json_schema?: { name?: string } } } = {};
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as typeof sent;
      return completionResponse({ content: "ok" });
    };

    await runReportsAssistant({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      period,
      messages: [{ role: "user", content: "Hi" }],
      supabase: dummySupabase,
    });

    assert.equal(sent.response_format?.type, "json_schema");
    assert.equal(sent.response_format?.json_schema?.name, "answer_card");
  });

  it("returns a card when the model cites figures it actually looked up", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return completionResponse({
          content: null,
          tool_calls: [
            {
              id: "call_metric_1",
              type: "function",
              function: {
                name: "get_metric",
                arguments: JSON.stringify({ id: "money.collected" }),
              },
            },
          ],
        });
      }
      return completionResponse({
        content: JSON.stringify({
          headline: "Collections ran well ahead of what was due.",
          bottomLine: "Nothing to act on this week.",
          blocks: [
            {
              kind: "kpi",
              metricIds: ["money.collected"],
              trendId: "",
              tableId: "",
              limit: 0,
              items: [],
              text: "",
            },
          ],
        }),
      });
    };

    const result = await runReportsAssistant({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      period,
      messages: [{ role: "user", content: "How much did we collect?" }],
      supabase: metricSupabase(),
    });

    assert.equal(result.card?.headline, "Collections ran well ahead of what was due.");
    assert.deepEqual(result.card?.blocks, [
      { kind: "kpi", metricIds: ["money.collected"] },
    ]);
    // Evidence comes back pruned to exactly what the card cites.
    assert.deepEqual(Object.keys(result.evidence.metrics), ["money.collected"]);
    assert.match(result.reply, /Collections ran well ahead/);
  });

  it("falls back to prose when the model cites nothing real", async () => {
    globalThis.fetch = async () =>
      completionResponse({
        content: JSON.stringify({
          headline: "Collection efficiency is what came in against what was due.",
          bottomLine: "Ask again with a period if you want the number.",
          blocks: [
            {
              kind: "kpi",
              metricIds: ["money.collected"],
              trendId: "",
              tableId: "",
              limit: 0,
              items: [],
              text: "",
            },
          ],
        }),
      });

    const result = await runReportsAssistant({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      period,
      messages: [{ role: "user", content: "What is collection efficiency?" }],
      supabase: dummySupabase,
    });

    // Nothing was looked up, so the citation is dropped and the prose halves of
    // the schema stand in — never raw JSON.
    assert.equal(result.card, null);
    assert.match(result.reply, /^Collection efficiency is what came in/);
    assert.match(result.reply, /Ask again with a period/);
    assert.doesNotMatch(result.reply, /[{}]/);
  });

  it("names the citable keys back to the model after each tool round", async () => {
    const bodies: Array<{ messages: Array<{ role: string; content?: string }> }> = [];
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(String(init?.body)));
      if (calls === 1) {
        return completionResponse({
          content: null,
          tool_calls: [
            {
              id: "call_metric_1",
              type: "function",
              function: {
                name: "get_metric",
                arguments: JSON.stringify({ id: "money.collected" }),
              },
            },
          ],
        });
      }
      return completionResponse({ content: "ok" });
    };

    await runReportsAssistant({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      period,
      messages: [{ role: "user", content: "How much did we collect?" }],
      supabase: metricSupabase(),
    });

    const listed = bodies[1]?.messages.filter(
      (m) => m.role === "system" && /money\.collected/.test(String(m.content)),
    );
    assert.equal(listed?.length, 1, "second request must list the citable keys");
  });

  it("sends only the last 8 input messages", async () => {
    let sent: { messages?: Array<{ role: string; content?: string }> } = {};
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as typeof sent;
      return completionResponse({ content: "ok" });
    };

    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m${i}`,
    }));

    await runReportsAssistant({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      period,
      messages,
      supabase: dummySupabase,
    });

    const nonSystem = (sent.messages ?? []).filter((m) => m.role !== "system");
    assert.equal(nonSystem.length, 8);
    assert.deepEqual(
      nonSystem.map((m) => m.content),
      messages.slice(-8).map((m) => m.content),
    );
  });
});
