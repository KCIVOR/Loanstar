import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "..");

function source(...parts: string[]) {
  const path = join(src, ...parts);
  assert.ok(existsSync(path), `Expected ${path} to exist`);
  return readFileSync(path, "utf8");
}

describe("dedicated record payment pages", () => {
  it("navigates Collector and Remedial to full pages instead of opening a modal", () => {
    const collector = source("app", "collector", "accounts", "page.tsx");
    const remedial = source("app", "remedial", "accounts", "[id]", "page.tsx");

    assert.match(
      collector,
      /href=\{`\/collector\/accounts\/\$\{acc\.id\}\/record-payment`\}/,
    );
    assert.doesNotMatch(collector, /RecordPaymentModal/);
    assert.match(
      remedial,
      /href=\{`\/remedial\/accounts\/\$\{account\.id\}\/record-payment`\}/,
    );
    assert.doesNotMatch(remedial, /RecordPaymentModal/);
  });

  it("renders the account ledger and inline payment form on the shared page", () => {
    const page = source("components", "payments", "RecordPaymentPage.tsx");

    assert.match(page, /<AccountLedger/);
    assert.match(page, /<RecordPaymentForm/);
    assert.match(
      page,
      /Only posted credits\s+affect the ledger balance/,
    );
  });

  it("provides Collector and Remedial route entry points", () => {
    source(
      "app",
      "collector",
      "accounts",
      "[id]",
      "record-payment",
      "page.tsx",
    );
    source(
      "app",
      "remedial",
      "accounts",
      "[id]",
      "record-payment",
      "page.tsx",
    );
    const collectorApi = source(
      "app",
      "api",
      "collector",
      "accounts",
      "[id]",
      "route.ts",
    );
    assert.match(collectorApi, /assignments\.collector_user_id/);
    assert.match(collectorApi, /amortization_schedules/);
    assert.match(collectorApi, /pdcChecks/);
  });

  it("returns postings so both desk ledgers can match credits to installments", () => {
    for (const desk of ["collector", "remedial"]) {
      const api = source("app", "api", desk, "accounts", "[id]", "route.ts");
      assert.match(api, /fetchAccountPostings\(id\)/);
      assert.match(api, /\bpostings,/);
    }

    for (const consumer of [
      source("components", "payments", "RecordPaymentPage.tsx"),
      source("app", "remedial", "accounts", "[id]", "page.tsx"),
    ]) {
      assert.match(consumer, /buildDeskLedgerRows/);
      assert.doesNotMatch(consumer, /scheduleId: null/);
    }
  });
});
