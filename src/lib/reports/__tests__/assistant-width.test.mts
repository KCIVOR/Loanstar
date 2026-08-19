import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ASSISTANT_MAX_WIDTH,
  ASSISTANT_MIN_WIDTH,
  clampAssistantWidth,
} from "@/components/reports/assistant/width";

describe("clampAssistantWidth", () => {
  it("keeps a sensible width untouched", () => {
    assert.equal(clampAssistantWidth(480, 1600), 480);
  });

  it("refuses to go below the width the cards need", () => {
    assert.equal(clampAssistantWidth(120, 1600), ASSISTANT_MIN_WIDTH);
    assert.equal(clampAssistantWidth(-50, 1600), ASSISTANT_MIN_WIDTH);
  });

  it("caps at the hard ceiling on a wide screen", () => {
    assert.equal(clampAssistantWidth(5000, 4000), ASSISTANT_MAX_WIDTH);
  });

  it("leaves room for the report on a narrow screen", () => {
    // 1000px viewport, 420px reserved for content, so the panel stops at 580.
    assert.equal(clampAssistantWidth(900, 1000), 580);
  });

  it("still honours the minimum when the viewport cannot fit both", () => {
    // The panel wins over the content reserve rather than collapsing to nothing.
    assert.equal(clampAssistantWidth(900, 500), ASSISTANT_MIN_WIDTH);
  });

  it("falls back to the hard ceiling when no viewport is known", () => {
    assert.equal(clampAssistantWidth(5000), ASSISTANT_MAX_WIDTH);
  });

  it("rounds to whole pixels", () => {
    assert.equal(clampAssistantWidth(432.6, 1600), 433);
  });

  it("survives a non-finite drag value", () => {
    assert.equal(clampAssistantWidth(Number.NaN, 1600), 360);
  });
});
