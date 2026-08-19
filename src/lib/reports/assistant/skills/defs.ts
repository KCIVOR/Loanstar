import { MAX_TREND_MONTHS } from "@/lib/reports/trends";

import {
  ACCOUNT_AGING,
  ACCOUNT_STATUSES,
  ACCOUNT_VIEWS,
  COLLATERALS,
  PAST_DUE_AGING,
  SEGMENTS,
} from "./shared";

export const TREND_SERIES = [
  "portfolio",
  "collections",
  "delinquency",
  "approvals",
] as const;

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false };

/**
 * Routing lives in these descriptions rather than in the system prompt. Models
 * follow tool descriptions more reliably than a prose list, and keeping the
 * rules in one place stops the two drifting apart — the old prompt claimed
 * every `list_*` skill accepted `q`, which `list_collections` never did.
 */
export function openaiToolDefs(): ToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "get_catalog",
        description:
          "Every metric definition (id, label, description, formula, unit). Use only when asked what a number means or how it is calculated.",
        parameters: NO_ARGS,
      },
    },
    {
      type: "function",
      function: {
        name: "get_snapshot",
        description:
          "Where the business stands right now: KPIs, pipeline status counts, aging, turnaround times and stuck files for the request period. Start here for a broad question like 'how are we doing' or 'any risk'. Point-in-time only — for movement over months use get_trends.",
        parameters: NO_ARGS,
      },
    },
    {
      type: "function",
      function: {
        name: "get_metric",
        description:
          "One metric's definition plus its value, prior-period value and delta. id must be a catalog id such as money.collected.",
        parameters: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_trends",
        description:
          "How a measure moved month by month. Use for any question about direction, growth, deterioration or history — 'is PAR getting worse', 'how have collections tracked', 'are we approving more'. Returns a coverage note when the underlying data does not reach back far enough; say so rather than describing empty months.",
        parameters: {
          type: "object",
          properties: {
            series: {
              type: "string",
              enum: [...TREND_SERIES],
              description:
                "portfolio = outstanding, releases, active loans. collections = collected vs due and efficiency. delinquency = PAR30, PAR90, amount overdue. approvals = committee approval rate and volume.",
            },
            months: {
              type: "integer",
              description: `How many months back, 2 to ${MAX_TREND_MONTHS}. Defaults to 6.`,
            },
          },
          required: ["series"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_bottlenecks",
        description:
          "Where work is piling up across every team — credit investigation, release, negotiation, holds, AR setup, unverified proofs and files stuck at a stage. Ranked by how far past its own target the oldest item is. Use for 'what is slowing us down', 'where are we stuck', 'which team is behind'.",
        parameters: NO_ARGS,
      },
    },
    {
      type: "function",
      function: {
        name: "get_staff",
        description:
          "Per-person performance for collectors, committee members, agents, credit investigation, release officers and remedial. Use when asked how a team or a named staff member is doing. Never returns how an individual voted.",
        parameters: NO_ARGS,
      },
    },
    {
      type: "function",
      function: {
        name: "list_accounts",
        description:
          "Search the loan book. Pass q with a borrower name or account number whenever the user names someone — this is the first place to look for a person. Status defaults to unpaid, or all statuses when q is set. Returns the largest balances first.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Borrower name or loan account number" },
            view: { type: "string", enum: [...ACCOUNT_VIEWS] },
            status: { type: "string", enum: [...ACCOUNT_STATUSES] },
            segment: { type: "string", enum: [...SEGMENTS] },
            collateral: { type: "string", enum: [...COLLATERALS] },
            aging: { type: "string", enum: [...ACCOUNT_AGING] },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_past_due",
        description:
          "Unpaid late accounts as they stand today. Pass q to find a named borrower among them. aging=par30 means more than 30 days late, excluding the 1-30 bucket.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Borrower name or loan account number" },
            aging: { type: "string", enum: [...PAST_DUE_AGING] },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_collections",
        description:
          "Posted-collection KPIs and per-collector totals for the request period. Does not accept a borrower search; use list_accounts to find a person.",
        parameters: {
          type: "object",
          properties: {
            segment: { type: "string", enum: [...SEGMENTS] },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_pipeline",
        description:
          "Origination KPIs and the individual files sitting over their stage target. Pass q to find a named applicant or application number.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Borrower name or application number" },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}
