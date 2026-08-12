# Hotfix — `getCommitteeSize` silently falls back to 3 for non-admin roles (RLS gap)

Not a numbered revision-tracker item — a regression fix surfaced 2026-08-11 while manually verifying Item 8 in the browser as a Committee account (`revision-plans/phase-08-committee-size-config.md`).

## What happened (confirmed with evidence, not guessed)

- `config_settings` RLS SELECT policy (`config_select`): `is_super_admin() OR has_module_permission('system_config', 'view')`. Confirmed live via `pg_policies`.
- The Committee role does not hold `system_config:view` (that's an admin-only module) — so when a Committee user's own session-scoped Supabase client queries `config_settings`, RLS silently returns zero rows. No error is thrown; `getCommitteeSize()` (`src/lib/committee/votes.ts:24-42`) just sees `data == null` and returns its fallback, `DEFAULT_COMMITTEE_SIZE = 3`.
- Reproduced live: admin set `config_settings.committee_size = 1` (confirmed in DB). A Committee account cast 1 approve vote on an application. Expected: majority reached (`floor(1/2)+1 = 1`, label `"1/1 — Approve"`). Actual: tally showed the null-label fallback `"1 approve · 0 deny"` — i.e. the app was still computing against a majority of 2, meaning it silently used `3`, not the real configured `1`.
- This is the same class of bug already documented for this app's Committee module (`[[project_committee_flow_alignment]]`): new logic shipped without the matching RLS/permission grant, only surfacing when tested as the actual role rather than by reading the code. All of Item 8's earlier phase validations checked JS logic correctness but not the DB permission boundary — that's the gap.
- **Every call site is affected**, not just the page you were looking at: `executeFinalAction` (`src/lib/committee/actions.ts`, the real approve/deny gate), both handlers in `vote/route.ts`, and the committee detail `route.ts` all call `getCommitteeSize(supabase)` with the requesting user's own session client. This means the *actual final-action vote gate* has also been silently using 3 instead of the admin-configured value for any non-super-admin Committee user this whole time Item 8 has been "done" — this is not just a display bug, it affects the real blocking logic.

## Precedent for the fix (established pattern in this codebase)

`src/app/api/collector/accounts/route.ts:27-29` hit the identical shape of bug for Collector role + aging/penalty writes, and the fix was: use `createServiceClient()` (bypasses RLS) for that one privileged read/write instead of trying to widen RLS grants for every consuming role. `config_settings` is a global, staff-agnostic admin setting — every staff role legitimately needs to read it regardless of their own module permissions, so a service-role read here is the correct, not just convenient, fix — mirrors how `penalty_rate`/`aging_thresholds` reads already work in that same file.

## Change to make

**`src/lib/committee/votes.ts`** — change `getCommitteeSize` to read via a service client instead of the passed-in `supabase` parameter:

```ts
import { createServiceClient } from "@/lib/supabase/server";

/** Reads admin `config_settings.committee_size` via service role (global
 * staff-agnostic setting — every role must read the real value regardless
 * of their own system_config permission), falls back to 3. */
export async function getCommitteeSize(): Promise<number> {
  const supabase = createServiceClient();
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

Note the signature changes from `getCommitteeSize(supabase)` to `getCommitteeSize()` (no argument) — it no longer needs the caller's client at all. Update every call site accordingly:

1. **`src/lib/committee/actions.ts`** (`executeFinalAction`) — change `await getCommitteeSize(supabase)` to `await getCommitteeSize()`.
2. **`src/app/api/committee/applications/[id]/vote/route.ts`** — both `POST` and `GET` handlers: change `await getCommitteeSize(supabase)` to `await getCommitteeSize()`.
3. **`src/app/api/committee/applications/[id]/route.ts`** — change `await getCommitteeSize(supabase)` to `await getCommitteeSize()`.

Do not remove the `supabase` parameter from any of these surrounding functions themselves (e.g. `executeFinalAction(supabase, ...)`) — only the internal `getCommitteeSize()` call changes; `supabase` is still needed and used for everything else in those functions (fetching votes, application rows, etc.).

## Explicitly out of scope for this phase

- `assertAllVotesCast`, `computeVoteTally` — unchanged, they're pure functions that already correctly take `committeeSize` as a plain number argument; this fix only changes how that number is *obtained*.
- Any other `config_settings` reader (`getCoverageThreshold`, `getPenaltyRate`, `getAgingThresholds`) — these may have the identical RLS gap for their own consuming roles, but that's pre-existing behavior from before this revision-report rollout and out of scope for this hotfix. **Flag it in the phase summary, do not fix it** — it needs its own separate confirmation with the user before touching, same as any other out-of-scope finding.
- `config_settings` RLS policies themselves — not touched; the fix is service-role bypass, not a policy change.
- Admin config page, committee page UI — no changes needed, they already display whatever the API returns.

## Validation checklist

- [ ] `getCommitteeSize()` takes no arguments and reads via `createServiceClient()`.
- [ ] All 3 call sites updated to call it with no argument.
- [ ] Manual re-test as a Committee-role account (not super-admin): with `config_settings.committee_size = 1`, casting 1 approve vote produces tally label `"1/1 — Approve"`, `hasMajority: true` — not the old fallback-to-3 behavior.
- [ ] Manual re-test that the final-action gate (`executeFinalAction`) also now respects the real configured size for a Committee-role account, not just the display — e.g. with size set back to 3, a Committee account with only 1 vote cast still cannot execute the final action (unaffected import path also correct).
- [ ] `assertAllVotesCast`/`computeVoteTally` function bodies in `votes.ts` unchanged.
- [ ] No RLS policy changes.
- [ ] Note explicitly in the summary whether `getCoverageThreshold`/`getPenaltyRate`/`getAgingThresholds` appear to have the same class of gap for their own non-admin consuming roles (CSA, Collector) — informational flag only, not fixed here.

## Status: DONE (implemented directly by Claude 2026-08-11, at user's explicit request, not via Cursor)

**Deviation from the normal plan→Cursor→validate flow, logged for the record:** this and two follow-on issues were fixed directly in-session rather than handed to Cursor, because they were live, blocking runtime errors the user hit while manually testing Item 8 in the browser, and the user explicitly asked for direct fixes each time.

1. **This RLS gap** — fixed as planned above, but discovered a follow-on build break while doing so:
2. **Client/server bundle break**: moving `getCommitteeSize` to use `createServiceClient()` inside `votes.ts` broke the client bundle, because `votes.ts` is also imported by a Client Component (`src/app/committee/page.tsx`, for `tatTone`) — server-only code (`next/headers` via `createServiceClient`) can't live in a file a Client Component imports. Fixed by extracting `getCommitteeSize` into a new server-only file, `src/lib/committee/committee-size.ts`, and updating all 3 call sites (`actions.ts`, `vote/route.ts`, `api/committee/applications/[id]/route.ts`) to import it from there instead. `votes.ts` is back to being pure/client-safe. Verified with `tsc --noEmit` (zero errors) and a live dev-server check (`/committee` now serves a clean login redirect instead of the Next.js build-error overlay).
3. **`committee_votes` missing UPDATE RLS policy**: separately found while the user tested re-voting (approve → deny) — `committee_votes` only had INSERT/SELECT policies; `castCommitteeVote()`'s `.upsert()` hits `ON CONFLICT DO UPDATE` when changing an existing vote, which RLS blocked entirely with no UPDATE policy present. Fixed with a new `committee_votes_update` policy mirroring the INSERT policy's WITH CHECK logic exactly. Migration `20260811110000_committee_votes_update_policy.sql`, applied live via Supabase MCP and written to both migration folders. **This bug is unrelated to Item 8's actual change** — it's a pre-existing gap in the original Committee vote-casting feature, only surfaced because this was the first time anyone in this engagement tested changing an already-cast vote.
4. **UX tweak** (user-requested, not a bug): the Tally card on the committee application page only showed a `X/N` fraction once a majority was reached, falling back to bare `X approve · Y deny` otherwise. Changed to always show the denominator: `X/N approve · Y/N deny`, using the same live `committeeSize` already wired into the page.

All 4 changes verified directly (DB policy queries, `tsc --noEmit`, live dev-server response) rather than taken on faith.
