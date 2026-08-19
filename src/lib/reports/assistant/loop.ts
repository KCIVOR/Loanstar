import type { SupabaseClient } from "@supabase/supabase-js";

import type { Period } from "@/lib/reports/metrics/types";

import {
  ANSWER_CARD_JSON_SCHEMA,
  captureSkillResult,
  cardToText,
  describeEvidence,
  emptyEvidence,
  isEvidenceEmpty,
  pruneEvidence,
  validateAnswerCard,
  type AnswerCard,
  type TurnEvidence,
} from "./card";
import { buildReportsAssistantPrompt } from "./prompt";
import { newSkillCache, openaiToolDefs, runSkill } from "./skills";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AssistantLoopResult = {
  reply: string;
  skillsUsed: string[];
  /** Null when the answer had no figures behind it — the caller renders prose. */
  card: AnswerCard | null;
  /** Trimmed to exactly what `card` cites. Empty when `card` is null. */
  evidence: TurnEvidence;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_OPENAI_CALLS = 6;
const MAX_REPLY_CHARS = 8000;
const EMPTY_REPLY = "I didn't get a reply back — try that question once more.";
const CAP_REPLY = "That one ran long. Narrow it a bit and I'll look again.";

type OpenAiToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type OpenAiAssistantMessage = {
  role?: string;
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
};

type LoopMessage =
  | ChatMessage
  | { role: "system"; content: string }
  | OpenAiAssistantMessage
  | { role: "tool"; tool_call_id: string; content: string };

/** Only ever applied to prose. Tool results are trimmed row-wise by
 *  `fitToBudget` so they stay valid JSON — slicing them here used to cut the
 *  payload mid-object and hand the model a corrupt document. */
function capReply(text: string): string {
  return text.length > MAX_REPLY_CHARS ? text.slice(0, MAX_REPLY_CHARS) : text;
}

function asError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("OpenAI")) return error;
  const message = error instanceof Error ? error.message : "request failed";
  return new Error(`OpenAI request failed: ${message}`);
}

async function completeOpenAi(input: {
  apiKey: string;
  model: string;
  messages: LoopMessage[];
}): Promise<OpenAiAssistantMessage> {
  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        // Low, not zero: this answers questions of fact about money and risk,
        // where an invented turn of phrase is worth less than a consistent one.
        temperature: 0.2,
        messages: input.messages,
        tools: openaiToolDefs(),
        tool_choice: "auto",
        // Applied on every hop, not just the last: tool calls still take
        // precedence while the model is looking things up, and the card arrives
        // on the turn it stops. Asking for the shape in prose is what let it
        // return nine bullets of metric-speak in the first place.
        response_format: { type: "json_schema", json_schema: ANSWER_CARD_JSON_SCHEMA },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw asError(error);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  let payload: { choices?: Array<{ message?: OpenAiAssistantMessage }> };
  try {
    payload = (await res.json()) as typeof payload;
  } catch (error) {
    throw asError(error);
  }

  const message = payload.choices?.[0]?.message;
  if (!message) {
    throw new Error("OpenAI HTTP 200: missing assistant message");
  }
  return message;
}

/**
 * Turns the model's JSON into a card plus the prose that stands in for it.
 *
 * `headline` and `bottomLine` are always prose, so even a card with nothing
 * grounded to show still yields a readable sentence — which is what a
 * definition question or an empty search lands on.
 */
function finalize(
  content: string,
  evidence: TurnEvidence,
  skillsUsed: string[],
): AssistantLoopResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Not JSON at all: hand back whatever prose arrived rather than nothing.
    return {
      reply: capReply(content || EMPTY_REPLY),
      skillsUsed,
      card: null,
      evidence: emptyEvidence(),
    };
  }

  const { card } = validateAnswerCard(parsed, evidence);
  if (card) {
    return {
      reply: capReply(cardToText(card, evidence)),
      skillsUsed,
      card,
      evidence: pruneEvidence(evidence, card),
    };
  }

  const shell = (parsed ?? {}) as { headline?: unknown; bottomLine?: unknown };
  const prose = [shell.headline, shell.bottomLine]
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .join("\n\n");

  return {
    reply: capReply(prose || EMPTY_REPLY),
    skillsUsed,
    card: null,
    evidence: emptyEvidence(),
  };
}

export async function runReportsAssistant(input: {
  apiKey: string;
  model: string;
  period: Period;
  messages: ChatMessage[];
  supabase: SupabaseClient;
  includeBorrowerNames?: boolean;
}): Promise<AssistantLoopResult> {
  const messages: LoopMessage[] = [
    { role: "system", content: buildReportsAssistantPrompt(input.period) },
    ...input.messages.slice(-8),
  ];
  const skillsUsed: string[] = [];
  const cache = newSkillCache();
  const evidence = emptyEvidence();

  for (let call = 0; call < MAX_OPENAI_CALLS; call += 1) {
    const message = await completeOpenAi({
      apiKey: input.apiKey,
      model: input.model,
      messages,
    });
    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      const content = typeof message.content === "string" ? message.content.trim() : "";
      return finalize(content, evidence, skillsUsed);
    }

    if (call === MAX_OPENAI_CALLS - 1) {
      return { reply: CAP_REPLY, skillsUsed, card: null, evidence: emptyEvidence() };
    }

    messages.push(message);
    for (const toolCall of toolCalls) {
      const name = toolCall.function?.name ?? "";
      const argsJson = toolCall.function?.arguments ?? "{}";
      skillsUsed.push(name);
      const result = await runSkill(name, argsJson, {
        supabase: input.supabase,
        period: input.period,
        includeBorrowerNames: Boolean(input.includeBorrowerNames),
        cache,
      });
      captureSkillResult(evidence, result);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id ?? "",
        content: JSON.stringify(result),
      });
    }

    // Naming the keys after each round is what makes citations checkable: the
    // model picks from this list, and the validator drops anything not on it.
    if (!isEvidenceEmpty(evidence)) {
      messages.push({ role: "system", content: describeEvidence(evidence) });
    }
  }

  return { reply: CAP_REPLY, skillsUsed, card: null, evidence: emptyEvidence() };
}
