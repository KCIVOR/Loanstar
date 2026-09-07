# Hotfix — Collector "Assigned accounts" page takes forever to load

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not touch `refreshMasterlistAging` itself (`src/lib/ar/posting.ts`) or its callers outside this route — it is still the live implementation the nightly cron's SQL twin was written to match, and `dev-simulate-aging` still needs it for its immediate-effect preview.
- Run existing tests after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result.

## Background (from conversation, decided scope)

User reported `/collector/accounts` "takes forever to load."

## Audit findings (verified 2026-09-04)

- `GET /api/collector/accounts` (`src/app/api/collector/accounts/route.ts:111-114`) runs, on **every** request:
  ```ts
  const admin = createServiceClient();
  for (const id of ids) {
    await refreshMasterlistAging(admin, id);
  }
  ```
  `ids` is every account assigned to the logged-in collector. This fires on initial page load, every filter/segment/date-range change, every page/sort change, and every debounced keystroke in the search box (the client re-fetches the whole query on any of those — `src/app/collector/accounts/page.tsx:215-257`).
- `refreshMasterlistAging` (`src/lib/ar/posting.ts:530-846`) is not a cheap read — per account it does ~8-10 **sequential** DB round trips (read masterlist, read+maybe update/delete moved schedules, maybe read/update/delete `release_files`/`pdc_checks`, read all schedules, read aging thresholds, read penalty rate, maybe insert a penalty + update a schedule, maybe roll an installment + insert another penalty row, maybe revert discounts, final masterlist update).
- The loop runs these **one account at a time, in serial** — total cost is `(assigned accounts) × (~8-10 round trips)`. For a collector with dozens-to-hundreds of assigned accounts this is easily several seconds to minutes, before the handler even queries the account list data the page actually needs to render.
- This work is redundant. `supabase/migrations/20260717102046_aging_refresh_cron.sql` installs a `pg_cron` job (`loanstar-aging-daily`, 17:00 UTC / 01:00 Asia/Manila) that calls `refresh_all_aging()` → `refresh_one_masterlist_aging()` in pure SQL, once nightly, for every `active`/`remedial` masterlist row — entirely inside Postgres, no network round trips.
- The SQL twin has been kept in parity with the TS function on every subsequent change, confirmed by reading each twin migration:
  - `20260831100000_refresh_aging_derived_balance.sql` — derived-balance parity.
  - `20260901020000_move_of_payment_revert_sql_twin.sql` — explicitly states: *"a real, active nightly pg_cron job ... calls refresh_all_aging() -> refresh_one_masterlist_aging() entirely in SQL ... completely bypassing the TS function"* and adds the Move of Payment revert block to the SQL function to match.
  - `20260901040000_move_of_payment_extension_revert_sql_twin.sql` — schedule-extension revert parity.
  - `20260902120000_move_of_payment_freeze_moved_rows.sql`, `20260902140000_pdc_checks_move_of_payment_lifecycle.sql`, `20260902141000_pdc_checks_revert_order_fix.sql` — pdc_checks lifecycle parity.
  - `20260903154000_collector_discount_balance_and_rollover.sql` — discount/rollover parity.
- Net effect: the nightly cron is already the correct, complete, low-cost mechanism keeping aging/penalties/rollovers/reverts current for every account. The synchronous per-request loop in the Collector accounts GET is a stale leftover (predates the cron, per the Phase 7 comment on the cron migration) that now only adds latency without adding correctness — worst case an account's aging is up to ~24h stale between the nightly runs, same as it already is for every other page in the app that reads `masterlist.aging_bucket` without calling this loop.
- `src/app/api/ar/masterlist/[id]/dev-simulate-aging/route.ts` is the only other caller of `refreshMasterlistAging` outside `posting.ts` itself — a dev tool that intentionally wants an immediate, synchronous, single-account refresh for testing. Out of scope; leave as-is.

## Scope decision

One phase — delete the redundant per-request refresh loop from the Collector accounts GET. No SQL change needed (the cron already covers this); no client change needed (the client just calls the same endpoint).

---

## Phase 1 — Remove the synchronous per-account aging refresh from the Collector accounts GET

**Goal:** `/collector/accounts` loads in the time it takes to run the actual account-list query, not `(assigned accounts) × (8-10 round trips)`. Aging/penalty/rollover data displayed is exactly as fresh as it is everywhere else in the app that reads `masterlist` directly (updated nightly by `loanstar-aging-daily`, or immediately by whatever action actually caused the change, e.g. a payment being recorded).

### Files to change

1. **`src/app/api/collector/accounts/route.ts`**
   - Delete the block at lines 106-114:
     ```ts
     // Privileged aging refresh: amortization_schedules/masterlist/penalties
     // writes require accounting_ar:edit, which the collection role doesn't
     // have — refreshMasterlistAging must run under the service role or every
     // write here silently no-ops under RLS. Run it before the select below so
     // the response reflects the just-refreshed numbers, not stale ones.
     const admin = createServiceClient();
     for (const id of ids) {
       await refreshMasterlistAging(admin, id);
     }
     ```
   - Remove the now-unused `refreshMasterlistAging` import (from `@/lib/ar/posting`) and the now-unused `createServiceClient` import (from `@/lib/supabase/server`) — check both are not used elsewhere in this file before removing either (the file also calls `createClient()`, which is a separate export and must stay).
   - Do not otherwise touch the query built at lines 120-153 or anything below it.

### Validation checklist — Phase 1

- [ ] `/collector/accounts` loads noticeably faster for a collector with a realistic number of assigned accounts (spot-check with whatever account currently has the most assignments).
- [ ] Aging bucket, penalty amounts, and balances shown on the page still match what's in the database for a few sampled accounts (they just won't be refreshed synchronously by this specific request anymore — confirm they still reflect the last nightly cron run / last real write, not stale pre-cron data).
- [ ] Filtering, sorting, searching, and pagination on the page still work (these were never dependent on the refresh loop, just confirm no regression).
- [ ] `npx tsc --noEmit` clean (confirms no dangling references to the removed imports).
- [ ] Existing test suite still passes, including anything under `src/lib/collector/__tests__/` and `src/lib/ar/__tests__/aging-parity.test.mts` (the latter tests TS/SQL parity of `refreshMasterlistAging` itself, which is untouched — should be unaffected, just confirm).

---

## Explicitly out of scope

- Any change to `refreshMasterlistAging` (`src/lib/ar/posting.ts`) or the SQL functions in `supabase/migrations/` — both stay exactly as they are; the fix is only to stop calling the TS version from this one hot path.
- Any change to `dev-simulate-aging` — it needs the synchronous single-account TS call for its purpose.
- Any change to the nightly cron schedule or its SQL functions.
- Any change to the client (`src/app/collector/accounts/page.tsx`) — it isn't the source of the slowness and needs no change.

## Final validation

- [ ] Full test suite run — no new failures.
- [ ] Live check: load `/collector/accounts` as a collector user with a large assigned portfolio, confirm load time is now dominated by the account-list query, not the removed loop.
