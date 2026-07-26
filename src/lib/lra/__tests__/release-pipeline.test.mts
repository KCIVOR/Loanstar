import test from "node:test";
import assert from "node:assert/strict";

import { releasePipelineSteps } from "../release-pipeline";

test("awaiting_path marks Path as current", () => {
  const steps = releasePipelineSteps("awaiting_path", null);
  assert.equal(steps[0]?.state, "current");
  assert.equal(steps[0]?.label, "Path");
  assert.ok(steps.slice(1).every((s) => s.state === "todo"));
});

test("with_pdc at pdc_encoding marks Encode current", () => {
  const steps = releasePipelineSteps("pdc_encoding", "with_pdc");
  assert.equal(steps.find((s) => s.label === "Path")?.state, "done");
  assert.equal(steps.find((s) => s.label === "Encode")?.state, "current");
});

test("without_pdc skips Encode as done once path is set", () => {
  const steps = releasePipelineSteps("ready_generate", "without_pdc");
  assert.equal(steps.find((s) => s.label === "Encode")?.state, "done");
  assert.equal(steps.find((s) => s.label === "Generate")?.state, "current");
});

test("ready_release marks Release as current with prior steps done", () => {
  const steps = releasePipelineSteps("ready_release", "with_pdc");
  assert.equal(steps.find((s) => s.label === "Release")?.state, "current");
  assert.equal(steps.find((s) => s.label === "Close")?.state, "todo");
  assert.ok(
    steps
      .filter((s) => !["Release", "Close"].includes(s.label))
      .every((s) => s.state === "done"),
  );
});

test("closed marks every step done", () => {
  const steps = releasePipelineSteps("closed", "with_pdc");
  assert.ok(steps.every((s) => s.state === "done"));
});
