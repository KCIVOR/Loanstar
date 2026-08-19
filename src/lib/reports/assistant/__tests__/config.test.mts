import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseReportsAiConfig, type ConfigRow } from "../config";

function rows(partial: Record<string, unknown>): ConfigRow[] {
  return Object.entries(partial).map(([key, value]) => ({ key, value }));
}

describe("parseReportsAiConfig", () => {
  it("disabled when reports_ai_enabled is false even if a key is present", () => {
    const cfg = parseReportsAiConfig(
      rows({
        reports_ai_enabled: false,
        reports_ai_api_key: "sk-test",
        reports_ai_model: "gpt-4o-mini",
      }),
    );
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.ready, false);
    assert.equal(cfg.apiKey, "sk-test");
  });

  it("ready only when enabled and key non-empty", () => {
    const cfg = parseReportsAiConfig(
      rows({
        reports_ai_enabled: true,
        reports_ai_api_key: "sk-live",
        reports_ai_model: "gpt-4o-mini",
      }),
    );
    assert.equal(cfg.ready, true);
    assert.deepEqual(cfg.incomplete, []);
  });

  it("incomplete includes reports_ai_api_key when enabled and blank", () => {
    const cfg = parseReportsAiConfig(
      rows({ reports_ai_enabled: true, reports_ai_api_key: "", reports_ai_model: "gpt-4o-mini" }),
    );
    assert.equal(cfg.ready, false);
    assert.ok(cfg.incomplete.includes("reports_ai_api_key"));
  });

  it("defaults model to gpt-4o-mini when missing", () => {
    const cfg = parseReportsAiConfig(rows({ reports_ai_enabled: true, reports_ai_api_key: "sk-x" }));
    assert.equal(cfg.model, "gpt-4o-mini");
  });
});
