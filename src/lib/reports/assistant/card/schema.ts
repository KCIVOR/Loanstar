export const ANSWER_BLOCK_KINDS = ["kpi", "chart", "table", "bullets", "note"] as const;
export type AnswerBlockKind = (typeof ANSWER_BLOCK_KINDS)[number];

/** Four blocks is about what fits in the 360px panel without scrolling twice. */
export const MAX_BLOCKS = 4;
export const MAX_KPIS = 3;
export const MAX_BULLETS = 5;
export const MAX_TABLE_ROWS = 8;
export const DEFAULT_TABLE_ROWS = 5;

/**
 * Exactly what the model emits. Strict mode cannot express a discriminated
 * union, so every block arrives carrying every field and the ones irrelevant to
 * its `kind` come back empty. `validateAnswerCard` narrows this into
 * `AnswerBlock` before anything renders.
 */
export type RawAnswerBlock = {
  kind: AnswerBlockKind;
  metricIds: string[];
  trendId: string;
  tableId: string;
  limit: number;
  items: string[];
  text: string;
};

/** The narrowed, grounded block the renderer consumes. */
export type AnswerBlock =
  | { kind: "kpi"; metricIds: string[] }
  | { kind: "chart"; trendId: string }
  | { kind: "table"; tableId: string; limit: number }
  | { kind: "bullets"; items: string[] }
  | { kind: "note"; text: string };

/**
 * What the model is allowed to produce for a chat answer: judgment, plus keys
 * pointing at figures it already looked up.
 *
 * `limit` is the only number in the shape and it is clamped server-side, so
 * there is nowhere here to put a peso value, a percentage or a count. Every
 * figure the user sees is rendered from the turn's evidence, which means a
 * hallucinated number has nowhere to land — the same guarantee the executive
 * brief relies on.
 */
export type AnswerCard = {
  headline: string;
  blocks: AnswerBlock[];
  bottomLine: string;
};

const stringArray = { type: "array", items: { type: "string" } } as const;

/**
 * OpenAI strict mode requires every property to be listed in `required` and
 * every object to set `additionalProperties: false`, which rules out the
 * discriminated union we actually want. So every block carries every field and
 * the irrelevant ones are ignored per `kind` — the validator narrows this into
 * a real union before anything renders. Counts and lengths are not expressible
 * in strict mode either; those caps are applied in `validateAnswerCard`.
 */
export const ANSWER_CARD_JSON_SCHEMA = {
  name: "answer_card",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["headline", "blocks", "bottomLine"],
    properties: {
      headline: {
        type: "string",
        description:
          "The answer in one sentence, in business words. No figures — the blocks carry those.",
      },
      blocks: {
        type: "array",
        description: `At most ${MAX_BLOCKS}, in reading order.`,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "metricIds", "trendId", "tableId", "limit", "items", "text"],
          properties: {
            kind: {
              type: "string",
              enum: [...ANSWER_BLOCK_KINDS],
              description:
                "kpi = headline figures. chart = movement over months. table = a list of people, accounts or queues. bullets = short prose points. note = a caveat or coverage warning.",
            },
            metricIds: {
              ...stringArray,
              description: `For kind=kpi: up to ${MAX_KPIS} metric ids you were given, such as money.collected. Empty otherwise.`,
            },
            trendId: {
              type: "string",
              description:
                "For kind=chart: the trend id you were given, such as delinquency. Empty string otherwise.",
            },
            tableId: {
              type: "string",
              description:
                "For kind=table: the table id you were given, such as pastDue. Empty string otherwise.",
            },
            limit: {
              type: "integer",
              description: `For kind=table: how many rows to show, 1 to ${MAX_TABLE_ROWS}. Use 0 otherwise.`,
            },
            items: {
              ...stringArray,
              description: `For kind=bullets: up to ${MAX_BULLETS} short points. Empty otherwise.`,
            },
            text: {
              type: "string",
              description: "For kind=note: one sentence. Empty string otherwise.",
            },
          },
        },
      },
      bottomLine: {
        type: "string",
        description: "One sentence on what it means or what to do. No figures.",
      },
    },
  },
} as const;

export function isAnswerBlockKind(value: unknown): value is AnswerBlockKind {
  return (
    typeof value === "string" && (ANSWER_BLOCK_KINDS as readonly string[]).includes(value)
  );
}
