# Item 8 — Committee approver count adjustable by management (step-by-step)

Part of the System Revision Report rollout. See `loanstar/docs/system-revision-report-tracker.md` for the workflow rules and overall status.

**Tracker item:** *The number of people required to approve a loan should be adjustable by management, instead of being fixed at a set number.*

**How to use this file:** implement the phases below **in order, one at a time**. After each phase, stop, report a summary of what changed, and wait for validation before starting the next phase. **After all phases are implemented, produce one final combined summary report covering every phase** (all files changed, migrations applied, full test suite result, everything deliberately left alone) — this is in addition to, not instead of, each phase's own summary.

**Ground rules (apply to every phase in this file):**
- Touch only the files listed for that phase's "Files to change." If you notice something related but unlisted, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables beyond what a phase's migration specifies.
- Run existing tests after each phase; don't delete or weaken a test to make it pass — update assertions only where a phase's audit explicitly says a prior assertion is now outdated by design.
- Output a summary at the end of each phase: files changed, migration(s) applied, tests run/result, anything deliberately left alone.

---

## Phase 1 — Migration: seed the config key

### Audit findings (evidence, verified 2026-08-10)

- The committee approver count is currently a hardcoded constant: `export const COMMITTEE_SIZE = 3;` (`src/lib/committee/votes.ts:19`). It is not read from anywhere admin-editable.
- This project has an established, working pattern for exactly this kind of admin-adjustable numeric setting: `config_settings` (key/value/description jsonb table), seeded via migration, read through a small `getX(supabase)` helper with a hardcoded fallback, exposed on `/admin/config`. Precedent: `coverage_ratio` — seeded at `supabase/migrations/20260706100002_p1_seed_data.sql:85`: `('coverage_ratio', '0.35'::jsonb, 'Coverage ratio threshold (35%)')`, read by `getCoverageThreshold()` (`src/lib/computation/coverage.ts:112-129`).
- No `committee_size` key currently exists in `config_settings` (confirmed — no match in any migration file for that key).

### Change to make

New migration inserting one row, following the exact seed pattern used for `coverage_ratio`/`penalty_rate`:

```sql
INSERT INTO config_settings (key, value, description)
VALUES ('committee_size', '3'::jsonb, 'Number of committee members required to cast a vote before a final decision can be made')
ON CONFLICT (key) DO NOTHING;
```

Apply as a new migration file (`YYYYMMDDHHMMSS_committee_size_config.sql`) via Supabase MCP, written to **both** `supabase/migrations/` and `loanstar/supabase/migrations/` per this project's established two-folder convention — not `supabase db push`.

### Explicitly out of scope for this phase

- No code changes in this phase — DB seed only.
- No other `config_settings` row touched.
- `ON CONFLICT DO NOTHING` is deliberate — if this key somehow already exists (it shouldn't, per the audit), don't overwrite it.

### Validation checklist

- [ ] Exactly 1 new row in `config_settings`: `key = 'committee_size'`, `value = 3` (numeric, not string), description present.
- [ ] No other row touched.
- [ ] Migration file present in both `supabase/migrations/` and `loanstar/supabase/migrations/`.

### Status: Ready for Cursor (not yet implemented)

---

## Phase 2 — Backend: config reader + admin config API plumbing

Send after Phase 1 has landed and been validated.

### Audit findings

- The reader-function pattern to mirror exactly: `getCoverageThreshold()` (`src/lib/computation/coverage.ts:112-129`) — reads `config_settings` by key, coerces number-or-numeric-string, falls back to a `DEFAULT_*` constant if missing/invalid.
- The admin config API (`src/app/api/admin/config/route.ts`) whitelists every editable key in three places that all need the same new entry:
  1. `CONFIG_KEYS` array (line 14-32).
  2. `patchConfigSchema` (Zod, line 67-91) — needs a bounded integer, e.g. `z.number().int().min(1).max(15).optional()` (sane sanity cap; no other numeric config in this file has a hard business-logic reason for a specific max, 15 is just a guard against fat-fingering, not a real business rule).
  3. The `updates.push(...)` block inside `PATCH` (line 104-167) — add `if (body.committee_size !== undefined) { updates.push({ key: "committee_size", value: body.committee_size }); }`.
- `GET` (line 49-65) already returns every row in `CONFIG_KEYS` generically — no separate change needed there once the key is added to the array.

### Files to change

1. **`src/lib/committee/votes.ts`**
   - Rename `export const COMMITTEE_SIZE = 3;` → `export const DEFAULT_COMMITTEE_SIZE = 3;` (mirrors `DEFAULT_COVERAGE_THRESHOLD` naming).
   - Add:
     ```ts
     import type { SupabaseClient } from "@supabase/supabase-js";

     /** Reads admin `config_settings.committee_size`, falls back to 3. */
     export async function getCommitteeSize(
       supabase: SupabaseClient,
     ): Promise<number> {
       const { data } = await supabase
         .from("config_settings")
         .select("value")
         .eq("key", "committee_size")
         .maybeSingle();

       const raw = data?.value;
       if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
         return Math.floor(raw);
       }
       if (typeof raw === "string") {
         const n = Number(raw);
         if (Number.isFinite(n) && n >= 1) return Math.floor(n);
       }
       return DEFAULT_COMMITTEE_SIZE;
     }
     ```
   - **Do not** yet change `assertAllVotesCast` or `computeVoteTally`'s signatures or the hardcoded `>= 2` majority math — that's Phase 3, a separate step. This phase only adds the reader and renames the constant; every existing call site of `COMMITTEE_SIZE` will break at compile time until Phase 4 rewires them — that's expected and fine to leave red between phases in this multi-phase file (same pattern used in the Items 3+4 plan), but flag it clearly in this phase's summary so it's not mistaken for an unrelated regression.

2. **`src/app/api/admin/config/route.ts`**
   - Add `"committee_size"` to `CONFIG_KEYS`.
   - Add `committee_size: z.number().int().min(1).max(15).optional(),` to `patchConfigSchema`.
   - Add the corresponding `if (body.committee_size !== undefined) { updates.push({ key: "committee_size", value: body.committee_size }); }` block in `PATCH`.

### Explicitly out of scope for this phase

- `assertAllVotesCast`, `computeVoteTally` internals — Phase 3.
- Any call site currently importing `COMMITTEE_SIZE` (`src/app/api/committee/applications/[id]/route.ts`, `src/app/committee/applications/[id]/page.tsx`, the test file) — these will show a compile error after this phase (the export was renamed) until Phase 4/6 update them. Do not patch them ahead of schedule in this phase; that blurs phase boundaries and makes validation harder.
- `src/app/admin/config/page.tsx` — Phase 5, separate step (UI).
- Any other config key.

### Validation checklist

- [ ] `DEFAULT_COMMITTEE_SIZE` exported (renamed from `COMMITTEE_SIZE`), value `3`.
- [ ] `getCommitteeSize(supabase)` added, returns the DB value when present and valid, falls back to `3` otherwise (including for `0`, negative, or non-numeric stored values).
- [ ] `CONFIG_KEYS`, `patchConfigSchema`, and the `PATCH` updates block all include `committee_size` consistently.
- [ ] `assertAllVotesCast`/`computeVoteTally` function bodies unchanged in this phase.
- [ ] Confirm (and note in the summary) which files now fail to compile because they still import the old `COMMITTEE_SIZE` name — this is expected, not a bug, and gets fixed in Phase 4/6.

### Status: Ready for Cursor (not yet implemented) — send after Phase 1 lands

---

## Phase 3 — Backend: generalize the vote-gate and majority math

Send after Phase 2 has landed and been validated.

### Audit findings

- `assertAllVotesCast` (`src/lib/committee/votes.ts:22-28`) hardcodes the threshold against the module constant and a hardcoded English sentence ("All 3 committee votes...").
- `computeVoteTally` (`src/lib/committee/votes.ts:30-47`) hardcodes the **majority threshold as `>= 2`** — this is the most important thing to generalize correctly. `2` is not derived from `COMMITTEE_SIZE`; it's a separate hardcoded number that happens to equal a majority of 3. If committee size becomes configurable (e.g. 5), a naive fix that only swaps the *denominator* in the label but leaves `>= 2` as the majority trigger would be **wrong** — 2 of 5 is not a majority. The correct generalization is `Math.floor(committeeSize / 2) + 1`.

### Change to make

**`src/lib/committee/votes.ts`** — change both functions to accept the size as a parameter (no default — callers must pass the real, DB-read value; this deliberately forces every call site to be updated in Phase 4 rather than silently working against the old default):

```ts
export function assertAllVotesCast(votes: VoteRecord[], committeeSize: number): void {
  if (votes.length < committeeSize) {
    throw new Error(
      `All ${committeeSize} committee votes must be cast before a final action`,
    );
  }
}

export function computeVoteTally(votes: VoteRecord[], committeeSize: number): VoteTally {
  const approve = votes.filter((v) => v.vote === "approve").length;
  const deny = votes.filter((v) => v.vote === "deny").length;
  const total = votes.length;
  const majority = Math.floor(committeeSize / 2) + 1;

  let label: string | null = null;
  let hasMajority = false;

  if (approve >= majority) {
    label = `${approve}/${committeeSize} — Approve`;
    hasMajority = true;
  } else if (deny >= majority) {
    label = `${deny}/${committeeSize} — Deny`;
    hasMajority = true;
  }

  return { approve, deny, total, label, hasMajority };
}
```

Do not change `VoteTally`/`VoteRecord` types, `computeTatDays`, or `tatTone` — untouched.

### Explicitly out of scope for this phase

- Call sites (`actions.ts`, `vote/route.ts`, `api/committee/applications/[id]/route.ts`, the page, tests) — still broken/uncompiled after this phase (now for a second reason: wrong argument count, not just the renamed import). Phase 4 wires the actual DB-read value through; Phase 6 fixes tests. Don't jump ahead.
- `getCommitteeSize` — already added in Phase 2, not touched here.
- `config_settings` — no DB change in this phase.

### Validation checklist

- [ ] `assertAllVotesCast(votes, committeeSize)` — new required second parameter, error message uses the passed-in size, not a hardcoded `3`.
- [ ] `computeVoteTally(votes, committeeSize)` — majority is `Math.floor(committeeSize / 2) + 1`, not a hardcoded `2`. Confirm with a manual check: `computeVoteTally([...4 approve votes], 5)` should NOT report a majority off of only 2 approves — it needs 3.
- [ ] Label format still `${count}/${committeeSize} — Approve|Deny`.
- [ ] `VoteTally`, `VoteRecord`, `computeTatDays`, `tatTone` unchanged.
- [ ] Confirm (note in summary) exactly which files are still uncompiled at the end of this phase — expected: `actions.ts`, `vote/route.ts`, `api/committee/applications/[id]/route.ts`, `committee/applications/[id]/page.tsx`, `final-action-vote-gate.test.mts`.

### Status: Ready for Cursor (not yet implemented) — send after Phase 2 lands

---

## Phase 4 — Backend: wire the dynamic size into every call site

Send after Phase 3 has landed and been validated. This phase is what actually makes the app compile and function again after Phases 2-3's intentional breakage.

### Audit findings

- **`src/lib/committee/actions.ts`** — `executeFinalAction` (line 134-155) is the real production gate: it already has a `supabase: SupabaseClient` parameter in scope, calls `assertAllVotesCast(votes)` then `computeVoteTally(votes)` (lines 154-155). This is the most important call site — it's what actually blocks/allows a final committee decision.
- **`src/app/api/committee/applications/[id]/vote/route.ts`** — `POST` (line 32) and `GET` (line 58) both call `computeVoteTally(votes)` with a `createClient()`-created `supabase` already in scope in both handlers.
- **`src/app/api/committee/applications/[id]/route.ts`** — imports `COMMITTEE_SIZE` (line 8, now `DEFAULT_COMMITTEE_SIZE` after Phase 2 — must update this import), calls `computeVoteTally(votes)` (line 66), and uses the constant directly for `canDecide`/`votesNeeded` (lines 115-119). This route's `supabase` (from `createClient()`) is already in scope. **This route's JSON response is also what the frontend page currently has no other way to learn the committee size from** (see Phase 5) — add `committeeSize` to the returned `application` object here so the page can stop importing a static constant.

### Files to change

1. **`src/lib/committee/actions.ts`**
   - Import `getCommitteeSize` alongside the existing `assertAllVotesCast`/`computeVoteTally` import from `./votes`.
   - In `executeFinalAction`, before `assertAllVotesCast(votes)`: `const committeeSize = await getCommitteeSize(supabase);` then call `assertAllVotesCast(votes, committeeSize)` and `computeVoteTally(votes, committeeSize)`.
   - Do not touch `assertFinalActionPreconditions`, `getCommitteeVotes`, `castCommitteeVote`, or anything else in the file.

2. **`src/app/api/committee/applications/[id]/vote/route.ts`**
   - Import `getCommitteeSize` from `@/lib/committee/votes`.
   - In `POST`: after `const supabase = await createClient();`, read `const committeeSize = await getCommitteeSize(supabase);` and pass it into `computeVoteTally(votes, committeeSize)`.
   - In `GET`: same pattern — read the size, pass it to `computeVoteTally(votes, committeeSize)`.

3. **`src/app/api/committee/applications/[id]/route.ts`**
   - Change the import from `COMMITTEE_SIZE` to `DEFAULT_COMMITTEE_SIZE, getCommitteeSize` (only import `DEFAULT_COMMITTEE_SIZE` if actually still needed after this change — likely not, since the route should use the real DB-read value; if unused, don't import it).
   - After `const supabase = await createClient();`, read `const committeeSize = await getCommitteeSize(supabase);`.
   - Pass `committeeSize` into `computeVoteTally(votes, committeeSize)` (line 66).
   - Replace both `COMMITTEE_SIZE` usages at lines 118-119 with `committeeSize`.
   - Add `committeeSize` to the returned `application` object (alongside `canDecide`, `votesNeeded`, etc.) so the frontend page can read it from the API response instead of importing a constant.

### Explicitly out of scope for this phase

- `src/app/committee/applications/[id]/page.tsx` — Phase 5, separate step (frontend).
- `src/app/admin/config/page.tsx` — Phase 5.
- Test files — Phase 6.
- `src/lib/committee/votes.ts` internals — already correct from Phase 3, not touched here.
- Any other committee route not listed (e.g. override/assessment routes) — they don't reference `COMMITTEE_SIZE`/`computeVoteTally`/`assertAllVotesCast` per the audit; leave alone.

### Validation checklist

- [ ] `executeFinalAction` reads `getCommitteeSize(supabase)` and passes it to both `assertAllVotesCast` and `computeVoteTally` — verify with a live check: setting `committee_size` to something other than 3 in `config_settings` and confirming a final action is blocked/allowed at the new threshold, not still 3.
- [ ] Both `vote/route.ts` handlers pass the real DB-read size to `computeVoteTally`.
- [ ] `api/committee/applications/[id]/route.ts` no longer imports the old `COMMITTEE_SIZE` name, uses `getCommitteeSize` for both the tally and the `canDecide`/`votesNeeded` calculation, and returns `committeeSize` in its JSON response.
- [ ] The app compiles (`next build` or equivalent type-check) — all 3 files above are now consistent with the new `votes.ts` signatures.
- [ ] No changes to any file outside the 3 listed above.

### Status: Ready for Cursor (not yet implemented) — send after Phase 3 lands

---

## Phase 5 — Frontend: admin config UI + committee page display

Send after Phase 4 has landed and been validated.

### Audit findings

- **Admin config page** (`src/app/admin/config/page.tsx`) follows one consistent, repeated pattern per config key: a `useState` string, a load-effect branch matching `s.key === "..."`, a UI `<Input>` block with a `<Label>`, and an entry in the `PATCH` save payload. Precedent to copy exactly: `coverageRatio` (lines 34, 67, 240-254, 111).
- **Committee applications page** (`src/app/committee/applications/[id]/page.tsx`) currently imports the (now-renamed, no-longer-matching) `COMMITTEE_SIZE` constant directly (`page.tsx:30`) and uses it at line 1510 for the "Waiting for votes (X/3 cast)" display. After Phase 4, the API response for this page already includes `application.committeeSize` — the page should read that instead of any static import.

### Files to change

1. **`src/app/admin/config/page.tsx`**
   - Add `const [committeeSize, setCommitteeSize] = useState("");`.
   - In the `load()` function's settings loop: `if (s.key === "committee_size") setCommitteeSize(String(s.value));`.
   - In the `PATCH` save payload inside `handleSubmit`: add `committee_size: Number(committeeSize),`.
   - Add a UI field in the "System settings" `Card` (near the existing `coverage`/`penalty` inputs — same visual section), e.g.:
     ```tsx
     <div>
       <Label htmlFor="committee-size" required>
         Committee size (approvers required)
       </Label>
       <Input
         id="committee-size"
         type="number"
         step="1"
         min="1"
         max="15"
         required
         value={committeeSize}
         onChange={(e) => setCommitteeSize(e.target.value)}
         className="mono"
       />
       <p className="mt-1 text-xs text-ink-400">
         {settings.find((s) => s.key === "committee_size")?.description}
       </p>
     </div>
     ```

2. **`src/app/committee/applications/[id]/page.tsx`**
   - Remove the `COMMITTEE_SIZE` import from `@/lib/committee/votes` (line 30) — keep the `tatTone` import.
   - Replace the display at line 1510 (`{votesCast}/{COMMITTEE_SIZE} cast`) with `{votesCast}/{data.application.committeeSize} cast`.
   - Check for any other reference to `COMMITTEE_SIZE` in this file beyond line 1510 (the earlier grep found only that one usage plus the import — confirm nothing else needs updating) before finishing this phase.

### Explicitly out of scope for this phase

- `src/lib/committee/votes.ts`, `actions.ts`, the API routes — already correct from Phases 2-4, not touched here.
- Test files — Phase 6.
- Any other admin config field or committee page section.

### Validation checklist

- [ ] Admin config page: new "Committee size" field loads the current DB value, saves correctly, follows the exact same visual/code pattern as the neighboring `coverage`/`penalty` fields.
- [ ] Committee applications page: no longer imports `COMMITTEE_SIZE`; the "Waiting for votes" display reads the live value from the API response and updates correctly if the admin changes it.
- [ ] `tatTone` import (still needed) preserved.
- [ ] No changes to any file outside the 2 listed above.

### Status: Ready for Cursor (not yet implemented) — send after Phase 4 lands

---

## Phase 6 — Tests: update and extend coverage

Send after Phase 5 has landed and been validated — this is what closes out any remaining red left by the earlier phases' intentional signature changes.

### Audit findings

`src/lib/committee/__tests__/final-action-vote-gate.test.mts` currently:
- Asserts `COMMITTEE_SIZE === 3` (line 21-22) — this export no longer exists under that name (renamed to `DEFAULT_COMMITTEE_SIZE` in Phase 2).
- Calls `assertAllVotesCast([...])` with only one argument (lines 27, 34, 41, 48, 54) — now requires a second `committeeSize` argument per Phase 3.

### Change to make

**`src/lib/committee/__tests__/final-action-vote-gate.test.mts`**:
- Update the import to `DEFAULT_COMMITTEE_SIZE` instead of `COMMITTEE_SIZE`; update the assertion to `assert.equal(DEFAULT_COMMITTEE_SIZE, 3);`.
- Update every `assertAllVotesCast(votes)` call to pass an explicit size, e.g. `assertAllVotesCast(votes, 3)` for the existing 3-member-committee test cases (preserves current test intent/coverage).
- **Add new test cases** for the generalization itself (this is the part of the fix that most needs a regression guard):
  - `computeVoteTally` with a 5-member committee: 2 approve votes should **not** report a majority (`hasMajority: false`); 3 approve votes **should** (`hasMajority: true`, majority = `Math.floor(5/2)+1 = 3`).
  - `assertAllVotesCast` with a non-default size (e.g. 5): should throw when fewer than 5 votes are cast, and pass with exactly 5.
  - `getCommitteeSize` (if not already covered elsewhere): returns the DB value when a valid row exists, falls back to `DEFAULT_COMMITTEE_SIZE` when the row is missing or the stored value is invalid (0, negative, non-numeric) — can be a lightweight unit test against a stub/mock Supabase client following whatever mocking pattern this test file (or a sibling `votes`-related test) already uses; if no existing pattern fits cleanly, note that in the summary rather than inventing a new test-infrastructure pattern.

### Explicitly out of scope for this phase

- No production code changes in this phase — test file(s) only.
- Any test file unrelated to committee votes/actions.

### Validation checklist

- [ ] Full test suite passes with zero failures — this closes out every phase's intentional breakage.
- [ ] `DEFAULT_COMMITTEE_SIZE` assertion updated and passing.
- [ ] All `assertAllVotesCast` calls updated with an explicit size argument.
- [ ] New majority-generalization test cases present and passing (5-member example at minimum).
- [ ] Only test file(s) changed in this phase.

### Status: Ready for Cursor (not yet implemented) — send after Phase 5 lands

---

## Overall item status: DONE (validated 2026-08-11)

All 6 phases implemented by Cursor and validated by Claude directly against live code/DB (migration row, `votes.ts` majority math, all 3 backend call sites, admin UI, and the extended test file — 551/551 passing). One regression was surfaced during Phase 5 validation (a second, unrelated consumer of `CiReferencesFormModal` from Item 7 was missing the new required `verifierName` prop) — fixed via a separate one-line hotfix (`revision-plans/hotfix-committee-ci-modal-verifiername.md`), also validated directly against the file.
