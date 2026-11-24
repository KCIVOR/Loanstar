import assert from "node:assert/strict";
import { mock } from "node:test";

// persistComputation deactivates old snapshots through a separate admin client.
// Keep that boundary offline while exercising the real resolver and engine.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://security-rate-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-key";
mock.method(globalThis, "fetch", async (request: RequestInfo | URL, options?: RequestInit) => {
  const url = request instanceof Request ? request.url : String(request);
  assert.ok(url.startsWith("https://security-rate-test.supabase.co/rest/v1/computations?"));
  assert.equal(options?.method ?? (request instanceof Request ? request.method : undefined), "PATCH");
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
});

export function database(segment: "seafarer" | "sme" | "individual", oldRate: number | null, newRate: number, existing = true, borrowerType: "SEAFARER" | "ALLOTTEE" | null = null) {
  let inserted: Record<string, unknown> | null = null;
  const prior = existing ? {
    loan_type_id: "old-type", pf_rate: 0.08, interest_rate: oldRate,
    seafarer_borrower_type: borrowerType,
    security_fee_rate: oldRate, terms: 4, addon_months: 0, due_day: 15,
    payment_frequency: "monthly", release_date: "2026-12-12", first_payment_date: "2026-12-15",
    other_deductions: { accountOpening: 100 }, origination_discounts: null,
  } : null;
  const client = {
    from(table: string) {
      if (!["computations", "loan_types", "loan_applications", "config_settings"].includes(table)) throw Error(`Unexpected table ${table}`);
      let operation = "read";
      const result = () => ({
        error: null, count: existing ? 1 : 0,
        data: table === "loan_types" ? { id: "new-type", name: "QA type", pf_rate: 0.08, interest_rate: newRate }
          : table === "loan_applications" ? { segment, collateral_type: "none", payment_schedule: "monthly", borrower_id: null }
          : table === "config_settings" ? null
          : operation === "insert" ? inserted : prior,
      });
      type Result = ReturnType<typeof result>;
      type Query = {
        select: () => Query; eq: () => Query; update: () => Query;
        insert: (value: Record<string, unknown>) => Query;
        maybeSingle: () => Promise<Result>; single: () => Promise<Result>;
        then: Promise<Result>["then"];
      };
      const chain: Query = {
        select: () => chain, eq: () => chain,
        update: () => { operation = "update"; return chain; },
        insert: (value: Record<string, unknown>) => { operation = "insert"; inserted = { ...value, id: "new-computation" }; return chain; },
        maybeSingle: async () => result(), single: async () => result(),
        get then() { const promise = Promise.resolve(result()); return promise.then.bind(promise); },
      };
      return chain;
    },
  };
  return { client: client as never, row: () => inserted! };
}
