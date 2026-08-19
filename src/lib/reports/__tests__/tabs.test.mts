import test from "node:test";
import assert from "node:assert/strict";
import { REPORT_TABS, isReportTabActive, type ReportTab } from "../tabs";

test("REPORT_TABS lists Snapshot through Insights", () => {
  assert.deepEqual(
    REPORT_TABS.map((t) => t.href),
    [
      "/reports",
      "/reports/accounts",
      "/reports/past-due",
      "/reports/collections",
      "/reports/pipeline",
      "/reports/insights",
    ],
  );
  assert.equal(REPORT_TABS[0]?.label, "Snapshot");
  assert.equal(REPORT_TABS[0]?.exact, true);
  assert.equal(REPORT_TABS[4]?.label, "Pipeline");
  assert.equal(REPORT_TABS[5]?.label, "Insights");
});

test("exact Snapshot tab is active only on /reports, not /reports/accounts", () => {
  const snapshot = REPORT_TABS[0]!;
  assert.equal(isReportTabActive("/reports", snapshot), true);
  assert.equal(isReportTabActive("/reports/accounts", snapshot), false);
  assert.equal(isReportTabActive("/reports/past-due", snapshot), false);
});

test("non-exact tab matches its href and nested prefix", () => {
  const accounts: ReportTab = { href: "/reports/accounts", label: "Accounts" };
  assert.equal(isReportTabActive("/reports/accounts", accounts), true);
  assert.equal(isReportTabActive("/reports/accounts/extra", accounts), true);
  assert.equal(isReportTabActive("/reports", accounts), false);
  assert.equal(isReportTabActive("/reports/past-due", accounts), false);
});
