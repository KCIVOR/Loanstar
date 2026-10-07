import assert from "node:assert/strict";
import test from "node:test";

import { bugReportSchema, bugStatusSchema } from "../schema";

const valid = {
  title: "Cannot upload document",
  description: "The upload button returns an error after selecting a PDF.",
  expected_behavior: "The PDF should upload.",
  location: "Borrower documents",
  severity: "medium",
};

test("accepts a complete bug report and trims its fields", () => {
  const result = bugReportSchema.parse({ ...valid, title: `  ${valid.title}  ` });
  assert.equal(result.title, valid.title);
});

test("rejects missing details and invalid severity", () => {
  assert.equal(bugReportSchema.safeParse({ ...valid, description: "short" }).success, false);
  assert.equal(bugReportSchema.safeParse({ ...valid, severity: "critical" }).success, false);
});

test("limits admin updates to valid status and note", () => {
  assert.equal(bugStatusSchema.safeParse({ status: "resolved", resolution_note: "Fixed" }).success, true);
  assert.equal(bugStatusSchema.safeParse({ status: "deleted" }).success, false);
});
