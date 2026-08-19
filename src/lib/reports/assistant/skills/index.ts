import {
  runGetBottlenecks,
  runGetCatalog,
  runGetMetric,
  runGetSnapshot,
  runGetStaff,
  runGetTrends,
  runListAccounts,
  runListCollections,
  runListPastDue,
  runListPipeline,
} from "./handlers";
import { isSkillName, type SkillContext, type SkillResult } from "./shared";

export async function runSkill(
  name: string,
  argsJson: string,
  ctx: SkillContext,
): Promise<SkillResult> {
  if (!isSkillName(name)) {
    return { ok: false, name, error: "unknown_skill" };
  }

  try {
    switch (name) {
      case "get_catalog":
        return runGetCatalog();
      case "get_snapshot":
        return runGetSnapshot(ctx);
      case "get_metric":
        return runGetMetric(argsJson, ctx);
      case "get_trends":
        return runGetTrends(argsJson, ctx);
      case "get_bottlenecks":
        return runGetBottlenecks(ctx);
      case "get_staff":
        return runGetStaff(ctx);
      case "list_accounts":
        return runListAccounts(argsJson, ctx);
      case "list_past_due":
        return runListPastDue(argsJson, ctx);
      case "list_collections":
        return runListCollections(argsJson, ctx);
      case "list_pipeline":
        return runListPipeline(argsJson, ctx);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "skill_failed";
    return { ok: false, name, error: message };
  }
}

export { budgetFor, fitToBudget, measure, SKILL_BUDGETS } from "./budget";
export { openaiToolDefs, TREND_SERIES } from "./defs";
export type { ToolDef } from "./defs";
export {
  buildListAccountsPayload,
  buildListPastDuePayload,
  buildListPipelinePayload,
  redactBorrowerRow,
  redactLoanRow,
  redactPastDueRow,
  redactStuckFile,
} from "./redact";
export {
  ACTIVE_SKILL_NAMES,
  enrichMetrics,
  findMetricValue,
  isSkillName,
  LIST_SKILL_LIMIT,
  matchesRegisterQuery,
  newSkillCache,
  parseObjectArgs,
  pickEnum,
} from "./shared";
export type { SkillContext, SkillName, SkillResult } from "./shared";
