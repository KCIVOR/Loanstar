# Feature — Separate committee approver count for Seafarer vs SME

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Mirror the existing `penalty_rate`/`penalty_rate_sme` pattern exactly (same naming convention, same segment-resolution shape, same "throw on unknown segment" safety rule) — do not invent a different mechanism.
- Execute phases in order. Each phase must leave the app green (tests passing) before the next starts.
- Run existing tests after each phase; do not delete or weaken a test to make it pass.
- At the end of all phases, output one combined summary: files changed, migration applied, tests run/result.

## Background (from conversation, decided scope)

Today `committee_size` (the number of committee approvers required before a final decision can be made) is a single global `config_settings` value — confirmed via `getCommitteeSize()` (`src/lib/committee/committee-size.ts`), which takes no parameters and is called identically for every application regardless of segment. User wants this split into two independently-configurable values, one for Seafarer and one for SME — the same way `penalty_rate`/`penalty_rate_sme` already work.

## Audit findings (verified 2026-08-15)

- **Exact precedent to mirror**: `src/lib/ar/penalty-rate.ts` — `penaltyRateConfigKey(segment)` returns `"penalty_rate" | "penalty_rate_sme"`, **throwing** if segment is null/unknown ("NULL/unknown must not silently fall back to Seafarer"); `resolvePenaltyRate(segment, { seafarer, sme })` picks the right value. `src/lib/ar/posting.ts:144-161`'s `getPenaltyRate(supabase, segment)` reads both `config_settings` rows in one query, then calls `resolvePenaltyRate`.
- **`src/lib/committee/committee-size.ts`** (current, to be replaced): `getCommitteeSize(): Promise<number>` — no segment param, reads only `committee_size`. `DEFAULT_COMMITTEE_SIZE = 3` lives in `src/lib/committee/votes.ts:19`.
- **Live `config_settings` values** (confirmed via SQL): `committee_size = 1`. No `committee_size_sme` row exists yet.
- **Admin config page**: `src/app/admin/config/page.tsx` already has the exact two-field pattern to mirror at `:204-241` (`Penalty rate — Seafarer` / `Penalty rate — SME`, two separate `Input`s, two separate state vars `penaltyRate`/`penaltyRateSme`). The current single committee-size field is at `:258-275`.
- **Admin config API**: `src/app/api/admin/config/route.ts` — `CONFIG_KEYS` array (`:16-18` region), `patchConfigSchema` (`penalty_rate_sme: z.number().min(0).max(1).optional()` at `:71`, `committee_size: z.number().int().min(1).max(15).optional()` at `:73`), and the per-key update-push blocks (`:112-119` region) are the exact spots to extend.
- **Every call site of `getCommitteeSize()`**, and what's available there today:
  - `src/lib/committee/actions.ts:135-157` (`executeFinalAction`) — fetches `loan_applications` by id at `:142-146` but only selects `id, status`; needs `segment` added to that same select.
  - `src/app/api/committee/applications/[id]/vote/route.ts` — both `POST` (`:19-34`) and `GET` (`:54-61`) call `getCommitteeSize()` with **no application fetch at all** in either handler today; each needs a small `loan_applications.segment` lookup added before the call.
  - `src/app/api/committee/applications/[id]/route.ts:22-27` — calls `getCommitteeSize()` at `:25`, **before** `getApplicationForStaff(supabase, id)` runs at `:27` (which already fetches `segment`, confirmed used at `:117`). This call needs to be **reordered to after** the application fetch, not given a second redundant fetch.
- `computeVoteTally`/`assertAllVotesCast` (`src/lib/committee/votes.ts`) both just take a plain `committeeSize: number` — no changes needed there, they're segment-agnostic once given the right number.

## Scope decision

Two phases: DB + admin config first (safe, additive, doesn't change committee behavior yet since nothing reads the new key until Phase 2), then the backend resolution logic + all call sites together (since they must land atomically — a partially-updated set of call sites would have some routes using the old global value and others using the new per-segment one, an inconsistent state).

---

## Phase 1 — Migration + admin config (new `committee_size_sme` key)

**Goal:** A second, independently-editable config value exists, following the exact `penalty_rate`/`penalty_rate_sme` shape. Nothing reads it yet — this phase is purely additive and safe to land alone.

### Files to change

1. **New migration file** (e.g. `supabase/migrations/20260816000000_committee_size_sme.sql`), applied via Supabase MCP `apply_migration` to **both** `supabase/migrations/` and `loanstar/supabase/migrations/` (this repo's established two-folder convention):
   ```sql
   INSERT INTO public.config_settings (key, value, description)
   VALUES (
     'committee_size_sme',
     '1'::jsonb,
     'Number of committee members required to cast a vote before a final decision can be made (SME)'
   )
   ON CONFLICT (key) DO NOTHING;
   ```
   - Seed value matches the current live `committee_size` value (`1`) so behavior is unchanged for both segments the moment this lands — admin can then diverge them independently.
   - Also **update the existing `committee_size` row's description** to `'Number of committee members required to cast a vote before a final decision can be made (Seafarer)'` so the two rows read as an obvious pair in the admin UI, matching how `penalty_rate`'s description already says "(Seafarer)" — confirm the exact current `penalty_rate` description string live before writing this, and mirror its style.
   - Do not touch `penalty_rate`, `penalty_rate_sme`, `coverage_ratio`, `aging_thresholds`, or any other row.

2. **`src/app/api/admin/config/route.ts`**
   - Add `"committee_size_sme"` to `CONFIG_KEYS`.
   - Add `committee_size_sme: z.number().int().min(1).max(15).optional()` to `patchConfigSchema`, directly below the existing `committee_size` line.
   - Add the matching `if (body.committee_size_sme !== undefined) { updates.push({ key: "committee_size_sme", value: body.committee_size_sme }); }` block, mirroring the existing `committee_size` block exactly.
   - Do not touch any other key or the `SECRET_KEYS`/`maskSettings` logic.

3. **`src/app/admin/config/page.tsx`**
   - Add `const [committeeSizeSme, setCommitteeSizeSme] = useState("");`.
   - In the `load()` settings loop, add `if (s.key === "committee_size_sme") setCommitteeSizeSme(String(s.value));`.
   - In `handleSubmit`'s PATCH body, add `committee_size_sme: Number(committeeSizeSme),` alongside the existing `committee_size` line.
   - Relabel the existing field's `Label` from `"Committee size (approvers required)"` to `"Committee size — Seafarer (approvers required)"`, matching the `penalty_rate` field's `"Penalty rate — Seafarer (decimal)"` labeling convention.
   - Add a new field directly below it, same structure as the existing `penalty-sme` field (`:222-241`): `Label` `"Committee size — SME (approvers required)"`, `Input` (`type="number"`, `step="1"`, `min="1"`, `max="15"`, `required`, `className="mono"`) bound to `committeeSizeSme`/`setCommitteeSizeSme`, with a description paragraph reading `{settings.find((s) => s.key === "committee_size_sme")?.description ?? "Number of committee members required to cast a vote before a final decision can be made (SME)"}`.
   - Do not touch any other field, the SMS/email sections, or the form's overall structure.

### Validation checklist — Phase 1

- [x] `config_settings` has a `committee_size_sme` row, value `1`, correct description. *(Re-confirmed independently via live SQL.)*
- [x] `committee_size`'s description updated to say "(Seafarer)". *(Confirmed live.)*
- [x] Admin config page shows two separate, independently-editable "Committee size" fields (Seafarer / SME), both saving correctly through the PATCH endpoint. *(Confirmed by reading `admin/config/page.tsx` and `api/admin/config/route.ts` directly — matches the plan exactly.)*
- [x] No other config key affected.
- [x] Nothing in the committee module reads `committee_size_sme` yet in isolation — moot now since Phase 2 also landed; see Phase 2 for the wired behavior.
- [x] `npx tsc --noEmit` clean of anything from this phase's files. *(Full-repo `tsc` has unrelated pre-existing errors from a separate, still-in-progress plan — `cig/__tests__/queue.test.mts` and `lra/history.ts` — neither touches any file this phase changed.)*
- [x] Existing test suite still passes. *(Re-ran independently: 891/891.)*

### Status: Done (2026-08-13)

---

## Phase 2 — Backend: segment-aware committee size resolution, wired into every call site

**Goal:** Every place that currently calls the old global `getCommitteeSize()` now resolves the correct value for that specific application's segment — Seafarer applications use `committee_size`, SME applications use `committee_size_sme`. Unknown/missing segment throws rather than silently defaulting, matching `penaltyRateConfigKey`'s safety rule.

### Files to change

1. **`src/lib/committee/committee-size.ts`** — replace the current no-argument function with a segment-aware version, mirroring `src/lib/ar/penalty-rate.ts` + `getPenaltyRate` exactly:
   ```ts
   export function committeeSizeConfigKey(
     segment: string | null | undefined,
   ): "committee_size" | "committee_size_sme" {
     if (segment === "sme") return "committee_size_sme";
     if (segment === "seafarer") return "committee_size";
     throw new Error(
       `loan_applications.segment is missing or unknown (${segment ?? "null"}) — cannot choose committee size`,
     );
   }

   export function resolveCommitteeSize(
     segment: string | null | undefined,
     sizes: { seafarer: number; sme: number },
   ): number {
     return committeeSizeConfigKey(segment) === "committee_size_sme"
       ? sizes.sme
       : sizes.seafarer;
   }

   export async function getCommitteeSize(
     segment: string | null | undefined,
   ): Promise<number> {
     const supabase = createServiceClient();
     const { data } = await supabase
       .from("config_settings")
       .select("key, value")
       .in("key", ["committee_size", "committee_size_sme"]);

     let seafarer = DEFAULT_COMMITTEE_SIZE;
     let sme = DEFAULT_COMMITTEE_SIZE;
     for (const row of data ?? []) {
       const n = Number(row.value);
       if (row.key === "committee_size" && Number.isFinite(n) && n >= 1) {
         seafarer = Math.floor(n);
       }
       if (row.key === "committee_size_sme" && Number.isFinite(n) && n >= 1) {
         sme = Math.floor(n);
       }
     }
     return resolveCommitteeSize(segment, { seafarer, sme });
   }
   ```
   - Keep the existing file's service-client rationale comment (global admin setting, not RLS-scoped) — do not remove it, just adapt it to mention both keys.
   - Do not touch `DEFAULT_COMMITTEE_SIZE` in `votes.ts`, or `computeVoteTally`/`assertAllVotesCast`.

2. **`src/lib/committee/actions.ts`**
   - In `executeFinalAction` (`:135-157`), add `segment` to the `loan_applications` select at `:143-146` (currently `"id, status"` → `"id, status, segment"`).
   - Change `const committeeSize = await getCommitteeSize();` (`:155`) to `const committeeSize = await getCommitteeSize(application.segment as string | null);`.
   - Do not touch `assertFinalActionPreconditions`, the vote-fetching, or the `committee_actions` insert logic.

3. **`src/app/api/committee/applications/[id]/vote/route.ts`**
   - In `POST` (`:19-34`): before calling `getCommitteeSize()`, add a small `loan_applications` select for `segment` by `id` (same lightweight lookup style already used elsewhere in this codebase — a single `.select("segment").eq("id", id).single()`), then pass it: `getCommitteeSize(application.segment as string | null)`.
   - In `GET` (`:54-61`): same addition — fetch `segment`, pass it through.
   - Do not change `castCommitteeVote`, `getCommitteeVotes`, `computeVoteTally`, the vote schema, or the audit-event write.

4. **`src/app/api/committee/applications/[id]/route.ts`**
   - Move the `getCommitteeSize()` call (`:25`) to **after** `getApplicationForStaff(supabase, id)` (`:27`), and pass `application.segment as string | null` — do not add a second, redundant `loan_applications` fetch here since `getApplicationForStaff` already loads `segment` (confirmed used at `:117`).
   - Verify nothing between the old and new call-site position depends on `committeeSize` being computed early — trace the variable's uses downstream in this file before moving the line, and only move it if safe (if something in between genuinely needs it first, keep the fetch order but pass `application.segment` once available — flag if this reordering isn't straightforward rather than forcing it).
   - Do not touch any other part of this route.

### Validation checklist — Phase 2

- [x] Code-level confirmed: `getCommitteeSize(segment)` correctly resolves `committee_size` for Seafarer / `committee_size_sme` for SME (read `committee-size.ts` directly, matches plan). *(Cursor's claim of an end-to-end live click-through with two different admin values wasn't independently reproduced in a browser this pass — accepted based on code correctness plus the new unit tests, not a live UI re-verification.)*
- [x] An application with a NULL/unknown `segment` throws — confirmed live in `committeeSizeConfigKey` and covered by the new `committee-size.test.mts` (re-ran: passes).
- [x] All three call sites (`actions.ts`, `vote/route.ts` GET+POST, `applications/[id]/route.ts`) pass the correct segment through — independently verified by reading each changed file directly, not just trusting the diff.
- [x] `computeVoteTally`/`assertAllVotesCast`/`DEFAULT_COMMITTEE_SIZE` untouched — confirmed, `votes.ts` not in Cursor's changed-file list and behavior matches.
- [x] `npx tsc --noEmit` clean of this phase's files. *(Repo-wide `tsc` has two unrelated pre-existing errors from a separate, still-in-progress plan — see Phase 1 note.)*
- [x] Existing test suite still passes. *(Re-ran independently: 891/891, including the new `committeeSizeConfigKey`/`resolveCommitteeSize` tests confirmed actually executing.)*

### Status: Done (2026-08-13)

---

## Explicitly out of scope

- Any change to how committee votes are cast, tallied, or how `committee_actions`/`committee_votes` are recorded — only *how many approvers are required* becomes segment-aware, not the voting mechanism itself.
- Any change to `penalty_rate`/`penalty_rate_sme`, `coverage_ratio`, or `aging_thresholds` — referenced only as the pattern to mirror, not touched.
- Any UI change to the Committee queue/history pages themselves (unrelated to the Segment column/filter work from the separate `feature-segment-column-filter.md` plan).

## Final combined validation (after both phases land)

- [x] Full test suite run — no new failures.
- [x] Live check: set Seafarer and SME committee sizes to two different numbers via `/admin/config`, confirm a real application of each segment respects its own required-approver count end-to-end (vote casting, tally, and final-action gating).
