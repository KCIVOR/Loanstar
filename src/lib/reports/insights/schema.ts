export const BRIEF_SECTION_IDS = [
  "portfolio",
  "collections",
  "delinquency",
  "approvals",
  "bottlenecks",
  "staff",
] as const;

export type BriefSectionId = (typeof BRIEF_SECTION_IDS)[number];

export const BRIEF_VERDICTS = ["good", "watch", "action"] as const;
export type BriefVerdict = (typeof BRIEF_VERDICTS)[number];

export const BRIEF_PRIORITIES = ["high", "medium", "low"] as const;
export type BriefPriority = (typeof BRIEF_PRIORITIES)[number];

export type BriefSection = {
  id: BriefSectionId;
  title: string;
  verdict: BriefVerdict;
  summary: string;
  highlights: string[];
};

export type BriefRecommendation = {
  priority: BriefPriority;
  action: string;
  why: string;
  /** Keys from the evidence bundle this rests on. Validated server-side. */
  evidenceKeys: string[];
};

/**
 * What the model is allowed to produce: judgment, and nothing else.
 *
 * There is deliberately no place in this shape to put a number. Every peso,
 * percentage, count and chart on the page is rendered from the evidence bundle,
 * so a hallucinated figure has nowhere to land.
 */
export type ExecutiveBrief = {
  headline: string;
  sections: BriefSection[];
  recommendations: BriefRecommendation[];
  dataNotes: string[];
};

const stringArray = { type: "array", items: { type: "string" } } as const;

/**
 * OpenAI strict structured outputs require every object to close itself off
 * with `additionalProperties: false` and to list every property as required.
 * Length and count constraints are not supported in strict mode, so those are
 * enforced afterwards in `validateBrief`.
 */
export const EXECUTIVE_BRIEF_JSON_SCHEMA = {
  name: "executive_brief",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["headline", "sections", "recommendations", "dataNotes"],
    properties: {
      headline: {
        type: "string",
        description: "One sentence a CEO could repeat verbatim. No numbers.",
      },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "verdict", "summary", "highlights"],
          properties: {
            id: { type: "string", enum: [...BRIEF_SECTION_IDS] },
            title: { type: "string" },
            verdict: {
              type: "string",
              enum: [...BRIEF_VERDICTS],
              description:
                "good = healthy or improving. watch = drifting, no action yet. action = needs a decision now.",
            },
            summary: { type: "string", description: "One to three sentences." },
            highlights: stringArray,
          },
        },
      },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["priority", "action", "why", "evidenceKeys"],
          properties: {
            priority: { type: "string", enum: [...BRIEF_PRIORITIES] },
            action: { type: "string", description: "Something a person can do this week." },
            why: { type: "string" },
            evidenceKeys: {
              ...stringArray,
              description: "Must be keys from the supplied evidence. Cite at least one.",
            },
          },
        },
      },
      dataNotes: {
        ...stringArray,
        description:
          "Where the data does not reach far enough to support a claim. Copy the coverage notes you were given.",
      },
    },
  },
} as const;

export function isBriefSectionId(value: unknown): value is BriefSectionId {
  return (
    typeof value === "string" && (BRIEF_SECTION_IDS as readonly string[]).includes(value)
  );
}
