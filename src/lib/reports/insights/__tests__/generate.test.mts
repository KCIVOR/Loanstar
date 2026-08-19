import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { collectEvidenceKeys } from "../evidence";
import { buildBriefPrompt, generateExecutiveBrief, validateBrief } from "../generate";
import { BRIEF_SECTION_IDS, EXECUTIVE_BRIEF_JSON_SCHEMA } from "../schema";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const BUNDLE = { keys: ["metric.money.collected", "trend.delinquency.par30", "bottleneck.cig"] };

function goodBrief(overrides: Record<string, unknown> = {}) {
  return {
    headline: "The book is growing faster than collections are keeping up.",
    sections: BRIEF_SECTION_IDS.map((id) => ({
      id,
      title: id,
      verdict: "watch",
      summary: "Steady.",
      highlights: ["One thing."],
    })),
    recommendations: [
      {
        priority: "high",
        action: "Put a second officer on credit investigation this week.",
        why: "Files are sitting past target.",
        evidenceKeys: ["bottleneck.cig"],
      },
    ],
    dataNotes: ["Committee decisions only reach back two months."],
    ...overrides,
  };
}

describe("EXECUTIVE_BRIEF_JSON_SCHEMA", () => {
  it("is strict and closed at every level", () => {
    assert.equal(EXECUTIVE_BRIEF_JSON_SCHEMA.strict, true);

    const seen: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (obj.type === "object") {
        seen.push(path);
        assert.equal(obj.additionalProperties, false, `${path} must be closed`);
        const properties = Object.keys((obj.properties ?? {}) as object);
        assert.deepEqual(
          [...(obj.required as string[])].sort(),
          properties.sort(),
          `${path} must require every property`,
        );
      }
      for (const [key, value] of Object.entries(obj)) walk(value, `${path}.${key}`);
    };

    walk(EXECUTIVE_BRIEF_JSON_SCHEMA.schema, "root");
    assert.ok(seen.length >= 3, "expected nested objects to be checked");
  });

  it("has no place to put a number", () => {
    const serialized = JSON.stringify(EXECUTIVE_BRIEF_JSON_SCHEMA.schema);
    assert.doesNotMatch(serialized, /"type":"number"/);
    assert.doesNotMatch(serialized, /"type":"integer"/);
  });
});

describe("buildBriefPrompt", () => {
  it("names every section the schema expects", () => {
    const prompt = buildBriefPrompt();
    for (const id of BRIEF_SECTION_IDS) assert.match(prompt, new RegExp(id));
  });

  it("forbids emitting figures", () => {
    assert.match(buildBriefPrompt(), /do not put numbers in your output/i);
  });
});

describe("validateBrief", () => {
  it("keeps a recommendation grounded in a real key", () => {
    const { brief, droppedRecommendations } = validateBrief(goodBrief(), BUNDLE);
    assert.equal(droppedRecommendations, 0);
    assert.equal(brief.recommendations.length, 1);
    assert.deepEqual(brief.recommendations[0]!.evidenceKeys, ["bottleneck.cig"]);
  });

  it("drops a recommendation that cites evidence which does not exist", () => {
    const { brief, droppedRecommendations } = validateBrief(
      goodBrief({
        recommendations: [
          {
            priority: "high",
            action: "Act on a number nobody computed.",
            why: "Because.",
            evidenceKeys: ["metric.invented.thing"],
          },
        ],
      }),
      BUNDLE,
    );
    assert.equal(droppedRecommendations, 1);
    assert.deepEqual(brief.recommendations, []);
  });

  it("keeps only the citations that check out", () => {
    const { brief } = validateBrief(
      goodBrief({
        recommendations: [
          {
            priority: "low",
            action: "Chase the oldest arrears.",
            why: "PAR is drifting.",
            evidenceKeys: ["trend.delinquency.par30", "metric.does.not.exist"],
          },
        ],
      }),
      BUNDLE,
    );
    assert.deepEqual(brief.recommendations[0]!.evidenceKeys, ["trend.delinquency.par30"]);
  });

  it("drops a recommendation with no action text", () => {
    const { droppedRecommendations } = validateBrief(
      goodBrief({
        recommendations: [{ priority: "high", action: "  ", why: "x", evidenceKeys: ["bottleneck.cig"] }],
      }),
      BUNDLE,
    );
    assert.equal(droppedRecommendations, 1);
  });

  it("orders recommendations by priority", () => {
    const { brief } = validateBrief(
      goodBrief({
        recommendations: [
          { priority: "low", action: "C", why: "", evidenceKeys: ["bottleneck.cig"] },
          { priority: "high", action: "A", why: "", evidenceKeys: ["bottleneck.cig"] },
          { priority: "medium", action: "B", why: "", evidenceKeys: ["bottleneck.cig"] },
        ],
      }),
      BUNDLE,
    );
    assert.deepEqual(brief.recommendations.map((r) => r.action), ["A", "B", "C"]);
  });

  it("ignores an unknown section id and de-duplicates repeats", () => {
    const { brief } = validateBrief(
      goodBrief({
        sections: [
          { id: "portfolio", title: "One", verdict: "good", summary: "", highlights: [] },
          { id: "portfolio", title: "Duplicate", verdict: "action", summary: "", highlights: [] },
          { id: "not_a_section", title: "Bogus", verdict: "good", summary: "", highlights: [] },
        ],
      }),
      BUNDLE,
    );
    assert.equal(brief.sections.length, 1);
    assert.equal(brief.sections[0]!.title, "One");
  });

  it("falls back to a safe verdict when the model sends nonsense", () => {
    const { brief } = validateBrief(
      goodBrief({
        sections: [{ id: "staff", title: "Staff", verdict: "catastrophic", summary: "", highlights: [] }],
      }),
      BUNDLE,
    );
    assert.equal(brief.sections[0]!.verdict, "watch");
  });

  it("survives a completely empty response", () => {
    const { brief } = validateBrief({}, BUNDLE);
    assert.equal(brief.headline, "");
    assert.deepEqual(brief.sections, []);
    assert.deepEqual(brief.recommendations, []);
  });
});

describe("collectEvidenceKeys", () => {
  it("builds citable keys from metrics, trend series and bottlenecks", () => {
    const keys = collectEvidenceKeys({
      metrics: [{ id: "money.collected" }] as never,
      trends: {
        groups: [
          { series: [{ id: "delinquency.par30" }, { id: "delinquency.par90" }] },
        ],
      } as never,
      bottlenecks: { entries: [{ id: "bottleneck.cig" }] } as never,
    });

    assert.ok(keys.includes("metric.money.collected"));
    assert.ok(keys.includes("trend.delinquency.par30"));
    assert.ok(keys.includes("trend.delinquency.par90"));
    assert.ok(keys.includes("bottleneck.cig"));
    assert.ok(keys.includes("staff.collectors"));
    assert.deepEqual(keys, [...keys].sort(), "keys should be stable and sorted");
  });
});

describe("generateExecutiveBrief", () => {
  const args = {
    apiKey: "sk-test",
    model: "gpt-4o-mini",
    bundle: {
      keys: BUNDLE.keys,
      period: { from: "2026-08-01", to: "2026-08-31" },
      prior: { from: "2026-07-01", to: "2026-07-31" },
      metrics: [],
      trends: { months: 6, generatedAt: "", groups: [] },
      bottlenecks: { entries: [], worst: null, totalWaiting: 0, breachedStages: 0 },
      staff: {
        collectorScorecard: [],
        committeeParticipation: [],
        proofBacklog: [],
        agentScorecard: [],
        cigScorecard: [],
        lraScorecard: [],
        remedialScorecard: [],
      },
      coverageNotes: [],
    } as never,
  };

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("asks for the strict schema and returns a validated brief", async () => {
    let sentBody: Record<string, unknown> = {};
    globalThis.fetch = async (_url, init) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return respond({
        choices: [{ message: { content: JSON.stringify(goodBrief()) } }],
      });
    };

    const result = await generateExecutiveBrief(args);
    assert.equal(result.brief.recommendations.length, 1);
    assert.equal(result.brief.sections.length, BRIEF_SECTION_IDS.length);

    const format = sentBody.response_format as { type: string; json_schema: { strict: boolean } };
    assert.equal(format.type, "json_schema");
    assert.equal(format.json_schema.strict, true);
    assert.equal(sentBody.temperature, 0.2);
  });

  it("reports a clean error when the model returns unparseable content", async () => {
    globalThis.fetch = async () =>
      respond({ choices: [{ message: { content: "not json at all" } }] });

    await assert.rejects(generateExecutiveBrief(args), /not valid JSON/);
  });

  it("reports a clean error on an empty completion", async () => {
    globalThis.fetch = async () => respond({ choices: [{ message: { content: "" } }] });
    await assert.rejects(generateExecutiveBrief(args), /empty brief/);
  });

  it("surfaces a model refusal rather than pretending it parsed", async () => {
    globalThis.fetch = async () =>
      respond({ choices: [{ message: { refusal: "I cannot help with that." } }] });
    await assert.rejects(generateExecutiveBrief(args), /refused/);
  });

  it("surfaces an HTTP failure with its status", async () => {
    globalThis.fetch = async () => respond({ error: "nope" }, 429);
    await assert.rejects(generateExecutiveBrief(args), /OpenAI HTTP 429/);
  });
});
