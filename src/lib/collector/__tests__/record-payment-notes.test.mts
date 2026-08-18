import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(
  join(here, "..", "..", "..", "app", "api", "collector", "payments", "route.ts"),
  "utf8",
);
const formSource = readFileSync(
  join(
    here,
    "..",
    "..",
    "..",
    "components",
    "payments",
    "RecordPaymentForm.tsx",
  ),
  "utf8",
);

describe("collector/remedial record payment remarks", () => {
  it("accepts optional notes on the shared payments POST schema and insert", () => {
    assert.match(routeSource, /notes:\s*z\.string\(\)\.trim\(\)\.max\(1000\)\.optional\(\)/);
    assert.match(routeSource, /notes:\s*body\.notes\s*\|\|\s*null/);
  });

  it("exposes an optional Remarks field on RecordPaymentForm", () => {
    assert.match(formSource, /Remarks \(optional\)/);
    assert.match(formSource, /notes:\s*notes\.trim\(\)\s*\|\|\s*undefined/);
    assert.match(formSource, /maxLength=\{1000\}/);
  });
});
