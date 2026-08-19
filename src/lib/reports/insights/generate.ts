import { digestForModel, type EvidenceBundle } from "./evidence";
import {
  BRIEF_PRIORITIES,
  BRIEF_SECTION_IDS,
  BRIEF_VERDICTS,
  EXECUTIVE_BRIEF_JSON_SCHEMA,
  isBriefSectionId,
  type BriefPriority,
  type BriefRecommendation,
  type BriefSection,
  type BriefVerdict,
  type ExecutiveBrief,
} from "./schema";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 60_000;

export type GenerateResult = {
  brief: ExecutiveBrief;
  /** Recommendations discarded because they cited evidence that does not exist. */
  droppedRecommendations: number;
};

export function buildBriefPrompt(): string {
  return [
    "You are the analyst who writes the monthly executive brief for LoanStar, a Philippine lending company. You are writing for the CEO and the Credit Committee.",
    "",
    "You are given a JSON document of already-computed figures. Your job is judgment, not arithmetic.",
    "",
    "Rules:",
    "- Do not put numbers in your output. Not pesos, not percentages, not counts. The figures are rendered beside your words from the same document, and repeating them creates a second version that can disagree with the first. Write 'collections slipped for a third straight month', not 'collections fell 12%'.",
    "- Do not compute anything. If a comparison is not already in the document, do not make the claim.",
    "- Every recommendation must cite one or more keys from citableKeys. A recommendation you cannot ground in a specific figure does not belong in the brief.",
    "- Where a trend carries a coverage note, the history is too short to read as a trend. Put that in dataNotes and soften the matching section rather than describing months that hold no data.",
    "- Write one section for each of: " + BRIEF_SECTION_IDS.join(", ") + ".",
    "- Verdict is a judgment, not a summary: good, watch, or action. Use action only when a person needs to decide something this week.",
    "- Rank recommendations by what would cost the business most if ignored.",
    "",
    "Voice: a trusted operator briefing the room. Plain sentences, no hedging, no consultant filler, no mention of data, systems, models or analysis. Say what is happening and what it means.",
  ].join("\n");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Structured outputs make the *shape* reliable, not the content. This is the
 * content gate: a recommendation survives only if every key it cites exists in
 * the bundle it was supposedly derived from.
 */
export function validateBrief(
  raw: unknown,
  bundle: Pick<EvidenceBundle, "keys">,
): GenerateResult {
  const source = (raw ?? {}) as Record<string, unknown>;
  const known = new Set(bundle.keys);

  const seenSections = new Set<string>();
  const sections: BriefSection[] = (
    Array.isArray(source.sections) ? source.sections : []
  ).flatMap((entry): BriefSection[] => {
    const row = (entry ?? {}) as Record<string, unknown>;
    if (!isBriefSectionId(row.id) || seenSections.has(row.id)) return [];
    seenSections.add(row.id);
    return [
      {
        id: row.id,
        title: asString(row.title) || row.id,
        verdict: pickEnum<BriefVerdict>(row.verdict, BRIEF_VERDICTS, "watch"),
        summary: asString(row.summary),
        highlights: asStringArray(row.highlights),
      },
    ];
  });

  let droppedRecommendations = 0;
  const recommendations: BriefRecommendation[] = (
    Array.isArray(source.recommendations) ? source.recommendations : []
  ).flatMap((entry): BriefRecommendation[] => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const action = asString(row.action);
    const evidenceKeys = asStringArray(row.evidenceKeys).filter((key) => known.has(key));
    if (!action || evidenceKeys.length === 0) {
      droppedRecommendations += 1;
      return [];
    }
    return [
      {
        priority: pickEnum<BriefPriority>(row.priority, BRIEF_PRIORITIES, "medium"),
        action,
        why: asString(row.why),
        evidenceKeys,
      },
    ];
  });

  const priorityRank: Record<BriefPriority, number> = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

  return {
    brief: {
      headline: asString(source.headline),
      sections,
      recommendations,
      dataNotes: asStringArray(source.dataNotes),
    },
    droppedRecommendations,
  };
}

export async function generateExecutiveBrief(input: {
  apiKey: string;
  model: string;
  bundle: EvidenceBundle;
}): Promise<GenerateResult> {
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
        temperature: 0.2,
        messages: [
          { role: "system", content: buildBriefPrompt() },
          {
            role: "user",
            content: JSON.stringify(digestForModel(input.bundle)),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: EXECUTIVE_BRIEF_JSON_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    throw new Error(`OpenAI request failed: ${message}`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
  };
  const message = payload.choices?.[0]?.message;
  if (message?.refusal) {
    throw new Error(`OpenAI refused the brief: ${message.refusal.slice(0, 200)}`);
  }

  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned an empty brief");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned a brief that was not valid JSON");
  }

  return validateBrief(parsed, input.bundle);
}
