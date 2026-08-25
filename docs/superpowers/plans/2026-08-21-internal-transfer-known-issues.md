# Internal Transfer (Other Loan / Offset) — Known Issues Task List

> Audit findings from a focused correctness pass over the Other Loan/Offset money-movement code (`src/lib/ar/internal-transfers.ts`, `src/lib/lra/release-service.ts`'s `createPendingInternalTransfers`, and the AR review queue). Not yet triaged into an implementation plan — this is the tracking list to work from. Check items off as they're fixed; each should get its own small plan doc (same phase/Allow-List format as the other docs in this folder) before code changes land, per this project's established workflow.

---

## 🔴 High priority — real money-correctness gaps

- [x] **#1 — A failed confirm, then retried, can double-allocate money.** Fixed 2026-08-21 — see `2026-08-21-internal-transfer-atomicity-fix.md`. Verified live 2026-08-23: a retried confirm on an already-posted transfer is blocked, balance/schedule/allocation rows show exactly one posting, not two.
  `postInternalTransfer` is a sequence of separate reads/writes, not a single database transaction. If it fails partway through the installment-allocation loop (e.g. network drop after installment #1 updates but before #2), the transfer correctly stays `pending` for AR to retry — but the retry has no memory of what already succeeded. It re-fetches "open installments" (excluding the now-`paid` #1), then re-spends the **entire original transfer amount** starting from #2 onward. Net effect: the account can end up credited for more than the transfer was actually worth.
  *Fix direction: wrap the whole confirm sequence in a single atomic operation (e.g. a Postgres function/RPC), or make the allocation step idempotent by tracking already-applied amount against the transfer itself before computing what's left to allocate on a retry.*

- [x] **#2 — Confirming a stale transfer silently does nothing, but still reports success.** Fixed 2026-08-23 — see `2026-08-24-stale-transfer-noop-guard.md`.
  If the target account gets fully settled through another channel (a real payment, or a different internal transfer) before AR confirms a pending one, confirming it now finds zero open installments. It still flips to `posted` and "reduces" a balance that's already ₱0 — but creates zero allocation rows and zero ledger entries. AR sees "posted ✓" with no sign that it accomplished nothing.
  *Fix direction: before posting, check whether the target account is already `paid`/has no open installments and the transfer amount would be a no-op — surface that to AR explicitly (e.g. a confirmation warning, or block and require reject-with-reason instead).*

---

## 🟡 Medium priority — workflow / audit-trail gaps

- [x] **#3 — Confirmed and rejected transfers disappear from the AR queue with no history view.** Fixed 2026-08-23 — see `2026-08-24-internal-transfer-history-view.md`. Added a third "Internal transfers" tab to `/ar/history`.
  `listPendingInternalTransfers` only ever returns `status = 'pending'` rows. Posted transfers are at least visible afterward in the account's ledger (as an "Internal transfer" credit line). **Rejected transfers leave no visible trace anywhere in the UI** — the reason, reviewer, and timestamp are saved in the database, but there's no screen to look at them again.
  *Fix direction: add a status filter / history tab to the `/ar/internal-transfers` page (or a separate "resolved" view) covering both `posted` and `rejected` rows.*

- [x] **#4 — Concurrent confirms can lose an update (race condition).** Fixed 2026-08-21 — see `2026-08-21-internal-transfer-atomicity-fix.md`. Verified live 2026-08-23: two transfers confirmed at the same target account simultaneously both landed correctly (no lost update) — row locking serialized them instead of racing.
  `postInternalTransfer` reads the current balance, computes a new number, then writes it — a classic read-then-write, not an atomic decrement. Two transfers targeting the same account confirmed in close succession (two AR staff, or one staff double-clicking) could have one reduction silently overwritten by the other. **Not a new weakness** — this matches the exact pattern the existing real-payment posting code (`postSingleDcrItem`) already uses, copied deliberately for consistency — but it's worth tracking since it now applies to this feature too.
  *Fix direction: this is a broader, pre-existing pattern across the AR posting code, not unique to internal transfers — any fix should probably address both together (e.g. row-level locking or a single atomic RPC for balance updates), rather than a one-off patch here.*

---

## ⚪ Low priority — narrow edge case

- [x] **#5 — Duplicate account targeting isn't blocked server-side.** Fixed 2026-08-23 — see `2026-08-24-duplicate-account-validation.md`.
  The CSA/Committee UI already prevents picking the same account twice within "Other Loan" rows or within "Offset" blocks. That's a UI-only rule — the API itself doesn't reject a request with the same account number listed twice in `otherLoans[]`/`offsets[]`. Low risk since it requires bypassing the UI entirely (a raw API call), and the actual effect (two separate pending transfers to the same account) isn't inherently wrong, just possibly unintended if it happened by mistake.
  *Fix direction: add a server-side check in the CSA computation route / committee override route rejecting duplicate `accountNo` entries within the same bucket.*

---

## Not on this list (separately tracked / already scoped)

- The historical-trend-chart blind spot (Portfolio Performance, Collection Performance, Delinquency charts, and the AR dashboard's Outstanding Trend widget not reflecting internal transfers or rounding write-offs) — this is a broader reporting-architecture gap, not specific to Offset/Other Loan money-correctness. Flagged separately in the prior audit turn; needs its own plan if/when prioritized.
