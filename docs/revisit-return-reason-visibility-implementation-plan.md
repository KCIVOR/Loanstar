# Revisit / Return Reason Visibility Implementation Plan

**Goal:** When Committee sends a file back (Notice to Revisit → CSA or CIG) or CIG returns a file to CSA, the receiving team sees *why* — on the queue row and at the top of the application page — not only in the notification bell.

**Root cause:** Committee's revisit reason is stored only in `revisit_notices.comment` (`src/lib/committee/actions.ts:318-325`), and the same final-action code clears `loan_applications.blocker` (`src/lib/committee/actions.ts:264-269`). Every CSA/CIG display reads `blocker` only; no page or API reads `revisit_notices.comment` (only `src/lib/cig/queue.ts:274` reads the table, for routing). For CIG returns the note *is* in `blocker`, but the CSA banner ignores `blocker` when status is `submitted` (`src/lib/csa/workspace.ts:131-146`) and the header line labels it "Hold reason:" (`src/app/csa/applications/[id]/page.tsx:736-741`).

**Approach:** Add a small read helper for the open revisit notice, return it from the CSA queue/detail and CIG detail APIs, and render it in the queue reason cell, the guidance banner, the header strip, and the revision cards. `blocker`, `revisit_notices` schema, RLS, and Committee write logic stay untouched.

**Tech stack:** Next.js (App Router — read `node_modules/next/dist/docs/` per `AGENTS.md` before touching routes), TypeScript, Supabase (Postgres + RLS), node:test via tsx.

**Source:** User UAT report 2026-10-01: *"I log in as committee, then revisit the application file to CSA. I can't see the blockers on the list like the reason why it is being revised."* Plus earlier same-day report on CIG Return to CSA: *"no clear notice like a message why the application is being revised."* Prior audit: `docs/UAT_LoanStar_Return_Revisit_v1.0.docx` gaps G1, G2, G6, G7, G8.

## Open questions (resolve before implementing)

| # | Question | Why it matters | Recommended answer |
| --- | --- | --- | --- |
| 1 | A file Committee routed to **CIG** also appears in the CSA queue as "For revision" and shows a "Revision complete" button that always fails (`src/lib/csa/queue.ts:67-72`, `src/lib/negotiation/service.ts:897-899`). Include the fix here? | Same screen, same confusion; cheap to fix once the route is loaded. | Partly. CSA's database access rule only lets it read notices routed to CSA, so CSA can't tell a CIG-routed file apart from an old file with no notice. Fully hiding the button needs a new access rule (a migration). This plan stays read-only: the button stays and the server keeps rejecting it (Phase 3). If you want it hidden, approve a follow-up migration that lets `intake` view read `route_to` for any notice. |
| 2 | Show the Committee reason in the **CIG queue list** too, or only on the CIG application page? | CIG list is card-style with a "Committee revisit" badge; adding text there is a UI choice. | Page only for now (the CIG queue already flags revisits). |
| 3 | Should Committee's reason be written into `blocker` instead? | Would make every existing display work at once. | **No.** A test enforces that Committee final actions clear `blocker` (`src/lib/applications/__tests__/co-borrower-advisory.test.mts:46-47`), and `blocker` is a shared multi-stage field (live: 65 "Released…", 9 "Pending…" rows). Keep `revisit_notices` as the single source. |

---

## Live database/system validation: 2026-10-01

Read-only; project `acopcwlhkovssjnrqygk` ("Loanstar"). No data changed.

1. **`revisit_notices` columns** (`supabase/migrations/20260706150000_p5_committee_negotiation.sql:26-34`): `id`, `loan_application_id` (FK, cascade), `committee_action_id` (NOT NULL), `route_to` CHECK in (`csa`,`cig`), `comment` NOT NULL, `resolved_at`, `created_at`.
2. **Counts:** 2 notices total, 2 open (`resolved_at IS NULL`), 0 applications with more than one open notice, 2 applications in `for_revision`, 0 `for_revision` applications without an open notice.
3. **User's test file:** AN300510 — status `for_revision`, `blocker` NULL, open notice `route_to=csa`, comment present. AN300496 — `for_revision`, `blocker` NULL, open notice `route_to=cig`, comment present. Confirms the reason exists but the displayed field is empty.
4. **RLS `revisit_notices_select`:** `is_super_admin() OR has_module_permission('committee','view') OR (route_to='csa' AND has_module_permission('intake','view')) OR (route_to='cig' AND has_module_permission('verification','view'))`. CSA can already read CSA-routed notices; CIG can read CIG-routed ones. **Note:** CSA *cannot* read CIG-routed notices via RLS (CSA role has no `verification` view — live `role_module_permissions`: csa → computation, intake, negotiation). Relevant to Open question 1.
5. **RLS `revisit_notices_write`:** committee `execute_trigger`, or intake `edit` (csa route), or verification `edit` (cig route). Unchanged by this plan (read-only feature).
6. **`blocker` distribution:** 0 rows currently start with `Returned by CIG:` (no live CIG return to test against — must create one in UAT). Other prefixes: `Released` 65, `Pending` 9, plus 4 singletons.

## Impact and RLS check (added 2026-10-01 after review)

**Blast radius: every symbol this plan touches has exactly one consumer** (grep of `src/`):
- `csaNextStep`: `src/app/csa/applications/[id]/page.tsx:642` + `workspace.test.mts`. The borrower portal uses a separate `nextStepGuidance` in `src/lib/borrowers/home.ts:183`, which is not touched.
- `getCsaQueue` / `CsaQueueItem`: `src/app/api/csa/applications/route.ts:82` → `src/app/csa/page.tsx` only. No dashboard, report, or export uses them. No test fixture builds a `CsaQueueItem` (`queue.test.mts` uses plain objects for `csaNeedsAttention`), so adding `revisit` breaks no test.
- `NegotiationPanel`: rendered once, at `src/app/csa/applications/[id]/page.tsx:1546`. The new prop is optional.
- CSA detail API: fetched only by `src/app/csa/applications/[id]/page.tsx` (`:309`, `:376`, `:421`). Adding a response field is additive.
- CIG detail API GET uses the user-scoped `createClient()` (`src/app/api/cig/applications/[id]/route.ts:260`), so the new read goes through RLS.
- **No business logic changes.** No writes, statuses, notifications, `blocker` writers, reports, or TAT/bottleneck logic. Every change is a new read or a display-text change.
- **One behaviour to accept:** after a CIG return, the CSA banner says "Returned by CIG" until CSA endorses again, even once the documents are complete. Endorsing clears `blocker` (`endorse/route.ts:46`), which ends it. This is intended: CSA must re-endorse.

**RLS: no new problem.**
- `revisit_notices` (live): RLS enabled, `authenticated` has table grants, 0 triggers. Policies are listed in validation item 4.
- Per role (live `role_module_permissions`, can_view):

  | Role | Reads CSA-routed notices | Reads CIG-routed notices | Effect |
  | --- | --- | --- | --- |
  | CSA | yes (intake) | **no** | Sees Committee reason for CSA revisits; falls back for CIG revisits (Phase 3 note) |
  | CIG | yes (has intake view) | yes (verification) | Sees reason on CIG page; could already open the CSA page, so no new exposure |
  | Committee | yes | yes (committee view) | Not a reader in this plan |
  | Super admin | yes | yes | Sees everything, including "With CIG" wording |
  | Agent, AR, borrower, collection_head, collector, LRA, remedial | no | no | Cannot read; none of them call these APIs anyway |

- **An RLS denial returns 0 rows, not an error.** So a role that can't read a notice gets `null` and sees the existing fallback text. Nothing throws.
- **Loading cost:** one extra query per CSA queue page, limited to that page's `for_revision` rows. There is no index on `revisit_notices.loan_application_id` (only the pkey), but the table has 2 rows live. A future index is optional and not needed for this change.
- **The CIG role has `intake` view** (a known seed grant). Its effect on this plan is covered in the CIG row of the table above.

## Audit findings

1. **Representations of "why it came back":**
   - CIG return → `loan_applications.blocker = "Returned by CIG: <note>"` (`src/lib/cig/receipt.ts:93-97`) + status-history note (`:106-109`) + notification detail (`:111-114`).
   - Committee revisit → `revisit_notices.comment` (`src/lib/committee/actions.ts:318-325`) + `committee_actions.comment` (`:241-251`) + status-history note (`:259-262`) + notification detail (`:355-362`).
   - Canonical for display: `blocker` for CIG return (already), `revisit_notices` (open row) for Committee revisit.
2. **Writers:** `blocker` cleared by Committee final action (`actions.ts:264-269`), CIG forward (`src/lib/cig/forward.ts:94`), CSA clear-hold and endorse routes (`src/app/api/csa/applications/[id]/clear-hold/route.ts:41`, `endorse/route.ts:46`). `revisit_notices` inserted only at `actions.ts:319`; resolved only at `src/lib/negotiation/service.ts:901-904`.
3. **Readers today:**
   - CSA queue: `getCsaQueue` selects `blocker` only (`src/lib/csa/queue.ts:210-232`), row type `CsaQueueItem` (`:16-32`), cell render `src/app/csa/page.tsx:794-803`.
   - CSA detail API: returns `blocker` + `statusHistory`, no revisit (`src/app/api/csa/applications/[id]/route.ts:142-199`).
   - CSA page banner: `csaNextStep` (`src/lib/csa/workspace.ts:118-146`) — only uses `blocker` for `on_hold`/`for_revision`; `for_revision` with no blocker falls back to "Borrower documents need updates before you can endorse." (`:144`).
   - CSA page header: "Hold reason:" (`src/app/csa/applications/[id]/page.tsx:736-741`).
   - CSA revision card: static text (`src/components/csa/NegotiationPanel.tsx:130-139`).
   - CIG detail API: returns `blocker`, no revisit (`src/app/api/cig/applications/[id]/route.ts:386-395`); CIG revision card static (`src/app/cig/applications/[id]/page.tsx:1229-1242`).
4. **Variants:**

   | Variant | Reason visible on list today | On page today | Change |
   | --- | --- | --- | --- |
   | CIG return → CSA (status `submitted`) | Truncated, via `blocker` | Small "Hold reason:" line only | Banner + label (Phase 2) |
   | Committee revisit → CSA (`for_revision`) | No ("—") | No | List + banner + card (Phases 1-2) |
   | Committee revisit → CIG (`for_revision`), CSA view | No | No; broken button | Status note, hide button (Phase 3) |
   | Committee revisit → CIG, CIG view | Badge only | No | CIG card shows reason (Phase 4) |

5. **Correction to prior audit:** G4 ("Needs attention filter misses returned files") is **wrong** — the attention filter ORs `blocker.not.is.null` (`src/lib/csa/queue.ts:237-240`, `:338-341`). Not in scope.
6. **Prior decisions:** blocker must stay cleared on Committee final action (`src/lib/applications/__tests__/co-borrower-advisory.test.mts:46-47`; comment at `actions.ts:221-223` "blocker … feeds bottleneck/TAT reports"). Honoured.
7. **Tooling:** `npm test` = `node --import tsx --test "src/lib/**/__tests__/*.mts"` (`package.json`); only `.mts` under `src/lib/**/__tests__/` runs. Harness to copy: `src/lib/csa/__tests__/workspace.test.mts` (pure `node:test` + `assert/strict`). Lint `npm run lint`; build `npm run build`. Work on `main` (user rule 2026-09-11).

---

## Scope and constraints

### In scope
- Read helper for the open revisit notice (single + batch).
- CSA queue: reason cell shows Committee revisit reason when present.
- CSA detail API + page: guidance banner, header label, and Negotiation panel show the revisit reason; CIG-return files get a "Returned by CIG" banner.
- CSA view of CIG-routed revisits: informational note, no Revision complete button.
- CIG detail API + page: Committee revisit card shows the reason.

### Out of scope: do not change
- `revisit_notices` schema, RLS, and writers; `committee_actions`.
- `blocker` writers (including the Committee clear) and `formatBlockerLabel` underscore behaviour (G5 — separate item).
- Notifications (already carry the reason).
- CIG queue list page, CIG "return after receipt passed" (G10), status-history timeline on CSA page (G9).

### Non-negotiable safety constraints
- Reads use the user-scoped Supabase client (`createClient`), never the service client, so RLS decides what each role sees.
- A missing/unreadable notice must render the existing fallback text, never throw.
- Server `completeRevision` route check (`service.ts:897-899`) stays the authority; hiding the button is UX only.

### Contract

New type (in `src/lib/committee/revisit-notices.ts`):
```ts
export type OpenRevisitNotice = {
  routeTo: "csa" | "cig";
  comment: string;
  createdAt: string;
};
```
- CSA detail API `application.revisit: OpenRevisitNotice | null` (only when status is `for_revision`).
- CIG detail API `application.revisit: OpenRevisitNotice | null` (same rule).
- `CsaQueueItem.revisit: OpenRevisitNotice | null`.

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| 1 | Committee → CSA | Revisit AN-x with "please complete the requirements" | CSA list reason cell: "Committee revisit: please complete the requirements"; page banner title "Committee sent this back", body = comment; Negotiation panel shows comment above Revision complete |
| 2 | Committee → CIG | Revisit with comment | CIG page Committee revisit card shows comment; CSA list shows "With CIG: <comment>" only if RLS returns it, else "With CIG for re-verification"; CSA page shows no Revision complete button |
| 3 | CIG → CSA | Return with note | CSA banner title "Returned by CIG", body = note; header label "Returned by CIG:" (not "Hold reason:") |
| 4 | CSA | Clicks Revision complete (csa route) | Notice resolved; reason disappears (status `for_approval`, helper returns null) |
| 5 | Any | `for_revision` with no open notice (historic) | Existing fallback text; no error |
| 6 | Any | Notice query errors | Treated as null; page still loads |
| 7 | CSA (direct API) | POST `/api/csa/applications/{id}/revision-complete` on a CIG-routed file | Still 4xx "No open revisit notice for this route" (unchanged) |
| 8 | Borrower / agent (direct DB) | `select * from revisit_notices` | 0 rows (unchanged RLS) |
| 9 | CSA | File on hold (`on_hold`) with blocker | Unchanged: "File on hold" banner, "Hold reason:" label |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `src/lib/committee/revisit-notices.ts` | Create | `OpenRevisitNotice` type, `mapOpenRevisitNotice` (pure), `getOpenRevisitNotice`, `getOpenRevisitNoticesByApplication` |
| `src/lib/committee/__tests__/revisit-notices.test.mts` | Create | Tests for the pure mapper |
| `src/lib/csa/queue.ts` | Modify | Add `revisit` to `CsaQueueItem`; batch-load in `getCsaQueue`; add pure `csaQueueReasonLabel` |
| `src/lib/csa/__tests__/queue.test.mts` | Modify | Tests for `csaQueueReasonLabel` |
| `src/lib/csa/workspace.ts` | Modify | `csaNextStep` accepts `revisit`; new branches for Committee revisit (csa/cig) and CIG return; pure `csaReasonLabel` for header |
| `src/lib/csa/__tests__/workspace.test.mts` | Modify | Tests for new `csaNextStep` branches and `csaReasonLabel` |
| `src/app/api/csa/applications/[id]/route.ts` | Modify | GET returns `application.revisit` |
| `src/app/csa/applications/[id]/page.tsx` | Modify | Pass `revisit` to `csaNextStep`, header label via `csaReasonLabel`, pass `revisit` to `NegotiationPanel` |
| `src/components/csa/NegotiationPanel.tsx` | Modify | Show the reason. **Also fixes an existing bug:** the panel returned null when there was no `negotiations` row (only an approval creates one), so CSA never saw Revision complete on a revisited file. It now renders for `for_revision` too. Implemented 2026-10-01; live data showed 0 CSA revisits had ever been completed. |
| `src/app/csa/page.tsx` | Modify | Reason cell uses `csaQueueReasonLabel` |
| `src/app/api/cig/applications/[id]/route.ts` | Modify | GET returns `application.revisit` |
| `src/app/cig/applications/[id]/page.tsx` | Modify | Committee revisit card shows `revisit.comment` |

## Phase 0: Failing tests first

### Task 0.1: revisit notice mapper
**File:** `src/lib/committee/__tests__/revisit-notices.test.mts`
- [ ] Write:
```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapOpenRevisitNotice } from "../revisit-notices";

describe("mapOpenRevisitNotice", () => {
  it("maps an open csa notice", () => {
    assert.deepEqual(
      mapOpenRevisitNotice({ route_to: "csa", comment: " fix docs ", created_at: "2026-10-01T00:00:00Z" }),
      { routeTo: "csa", comment: "fix docs", createdAt: "2026-10-01T00:00:00Z" },
    );
  });
  it("returns null for missing row, bad route, or blank comment", () => {
    assert.equal(mapOpenRevisitNotice(null), null);
    assert.equal(mapOpenRevisitNotice({ route_to: "lra", comment: "x", created_at: "t" }), null);
    assert.equal(mapOpenRevisitNotice({ route_to: "csa", comment: "  ", created_at: "t" }), null);
  });
});
```
- [ ] Run: `npm test` → Expected: FAIL, module `../revisit-notices` not found.

### Task 0.2: queue reason label
**File:** `src/lib/csa/__tests__/queue.test.mts` (append)
- [ ] Cases for `csaQueueReasonLabel({ blocker, revisit })`:
  - revisit csa "fix docs" → `"Committee revisit: fix docs"`
  - revisit cig "re-verify" → `"With CIG: re-verify"`
  - no revisit, blocker `"Returned by CIG: missing ID"` → `"Returned by CIG: missing ID"`
  - both null → `null`
- [ ] Run: `npm test` → Expected: FAIL, `csaQueueReasonLabel` not exported.

### Task 0.3: guidance banner + header label
**File:** `src/lib/csa/__tests__/workspace.test.mts` (append)
- [ ] `csaNextStep` with `status: "for_revision"`, `revisit: { routeTo: "csa", comment: "fix docs", createdAt: "t" }` → `{ title: "Committee sent this back", body: "fix docs. Update the file, then click Revision complete." }`.
- [ ] `status: "for_revision"`, `revisit.routeTo: "cig"` → title `"With CIG for re-verification"`, body contains the comment and `"No CSA action needed"`.
- [ ] `status: "for_revision"`, `revisit: null`, no blocker → existing fallback `"Borrower documents need updates before you can endorse."` (regression).
- [ ] `status: "submitted"`, `blocker: "Returned by CIG: missing ID"` → title `"Returned by CIG"`, body `"missing ID. Fix the file, then endorse it to CIG again."`.
- [ ] `csaReasonLabel({ status: "submitted", blocker: "Returned by CIG: x" })` → `{ label: "Returned by CIG", text: "x" }`; `status: "on_hold", blocker: "Pending docs"` → `{ label: "Hold reason", text: "Pending docs" }`.
- [ ] Run: `npm test` → Expected: FAIL on the new cases only.

## Phase 1: Read helper + CSA queue

### Task 1.1: `src/lib/committee/revisit-notices.ts`
- [ ] Implement:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type OpenRevisitNotice = { routeTo: "csa" | "cig"; comment: string; createdAt: string };

type Row = { route_to: unknown; comment: unknown; created_at: unknown } | null | undefined;

export function mapOpenRevisitNotice(row: Row): OpenRevisitNotice | null {
  if (!row) return null;
  const routeTo = row.route_to === "csa" || row.route_to === "cig" ? row.route_to : null;
  const comment = typeof row.comment === "string" ? row.comment.trim() : "";
  if (!routeTo || !comment) return null;
  return { routeTo, comment, createdAt: String(row.created_at ?? "") };
}

/** Latest unresolved notice; RLS-scoped. Errors → null (display-only). */
export async function getOpenRevisitNotice(supabase: SupabaseClient, applicationId: string) {
  const { data, error } = await supabase
    .from("revisit_notices")
    .select("route_to, comment, created_at")
    .eq("loan_application_id", applicationId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return mapOpenRevisitNotice(data);
}

export async function getOpenRevisitNoticesByApplication(
  supabase: SupabaseClient,
  applicationIds: string[],
): Promise<Map<string, OpenRevisitNotice>> {
  const out = new Map<string, OpenRevisitNotice>();
  if (!applicationIds.length) return out;
  const { data, error } = await supabase
    .from("revisit_notices")
    .select("loan_application_id, route_to, comment, created_at")
    .in("loan_application_id", applicationIds)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  if (error) return out;
  for (const row of data ?? []) {
    const id = row.loan_application_id as string;
    if (out.has(id)) continue; // keep latest
    const mapped = mapOpenRevisitNotice(row);
    if (mapped) out.set(id, mapped);
  }
  return out;
}
```
- [ ] Run `npm test` → Task 0.1 passes.

### Task 1.2: CSA queue
**Files:** `src/lib/csa/queue.ts`, `src/app/csa/page.tsx`
- [ ] Add `revisit: OpenRevisitNotice | null` to `CsaQueueItem` (`queue.ts:16-32`).
- [ ] In `getCsaQueue` after the map at `:289-317`: collect ids where `status === "for_revision"`, call `getOpenRevisitNoticesByApplication(supabase, ids)`, set `revisit` (default `null`).
- [ ] Add pure export:
```ts
export function csaQueueReasonLabel(input: { blocker: string | null; revisit: OpenRevisitNotice | null }): string | null {
  if (input.revisit) {
    return input.revisit.routeTo === "csa"
      ? `Committee revisit: ${input.revisit.comment}`
      : `With CIG: ${input.revisit.comment}`;
  }
  return formatBlockerLabel(input.blocker);
}
```
- [ ] `src/app/csa/page.tsx`: the page's local row type (`:42`) gains `revisit`; replace `formatBlockerLabel(app.blocker)` at `:761` (table) and `:674` (card/mobile view) with `csaQueueReasonLabel({ blocker: app.blocker, revisit: app.revisit ?? null })`. Keep `title={…}` hover.
- [ ] Run `npm test` → Task 0.2 passes.
- [ ] Manual: log in as CSA → CSA queue → AN300510 row reason cell reads "Committee revisit: please complete the requirements".

**Phase constraints:** no change to filters, sorting, KPI counts, or `csaNeedsAttention`.

## Phase 2: CSA application page

### Task 2.1: API
**File:** `src/app/api/csa/applications/[id]/route.ts`
- [ ] In GET, after `getNegotiation` (`:104`): `const revisit = application.status === "for_revision" ? await getOpenRevisitNotice(supabase, id) : null;`
- [ ] Add `revisit` inside the `application` object returned at `:143-199`.

### Task 2.2: banner + header logic
**File:** `src/lib/csa/workspace.ts`
- [ ] Add optional `revisit?: OpenRevisitNotice | null` to the `csaNextStep` input (`:118-127`).
- [ ] Replace the `for_revision` branch (`:139-146`):
  - `revisit?.routeTo === "csa"` → title "Committee sent this back", body `` `${revisit.comment}. Update the file, then click Revision complete.` ``
  - `revisit?.routeTo === "cig"` → title "With CIG for re-verification", body `` `Committee asked CIG: ${revisit.comment}. No CSA action needed.` ``
  - else → existing text unchanged.
- [ ] Before the doc-step logic (after the `for_revision` branch), add: `status === "submitted"` and `input.blocker?.startsWith("Returned by CIG:")` → title "Returned by CIG", body `` `${note}. Fix the file, then endorse it to CIG again.` `` where `note` = blocker minus the prefix, trimmed (do not pass through `formatBlockerLabel`, so underscores are preserved here).
- [ ] Add pure `csaReasonLabel({ status, blocker })` returning `{ label, text } | null`: prefix `Returned by CIG:` → label "Returned by CIG"; otherwise label "Hold reason" with `formatBlockerLabel(blocker)`.
- [ ] Run `npm test` → Task 0.3 passes, existing workspace tests still pass.

### Task 2.3: page wiring
**File:** `src/app/csa/applications/[id]/page.tsx`
- [ ] Add `revisit: OpenRevisitNotice | null` to the page's `application` type (`:75` area).
- [ ] Pass `revisit: data.application.revisit` into `csaNextStep` (`:642-651`).
- [ ] Replace the header line (`:736-741`) with `csaReasonLabel(...)` output: `<span …>{reason.label}:</span> {reason.text}`. When `data.application.revisit` is set, show label "Committee revisit" and the comment instead.
- [ ] Pass `revisit={data.application.revisit}` to `<NegotiationPanel>`.
- [ ] Manual: CSA → AN300510 → banner "Committee sent this back — please complete the requirements…"; header "Committee revisit: please complete the requirements".

## Phase 3: CSA view of CIG-routed revisits

**File:** `src/components/csa/NegotiationPanel.tsx`
- [ ] Add prop `revisit?: OpenRevisitNotice | null` to `NegotiationPanelProps` (`:14`).
- [ ] In the `status === "for_revision"` block (`:130-139`):
  - `revisit?.routeTo === "csa"` → show "Committee's reason:" + comment, then the Revision complete button.
  - `revisit?.routeTo === "cig"` → text "Committee sent this file to CIG for re-verification. CIG will return it to Committee." No button.
  - `revisit` null → current text + button (unchanged historic behaviour).
- [ ] Note: CSA RLS cannot read CIG-routed notices (validation item 4), so for CIG-routed files CSA's `revisit` will be `null` and the old button would reappear. To handle this, in Task 2.1 also return `revisitRouteHint`: when status is `for_revision` and `getOpenRevisitNotice` returns null, the CSA API cannot distinguish "historic" from "routed to CIG". **Decision for implementer:** leave button visible in that case; server rejects it with a clear error (Contract case 7). Record in the smoke test. (See Self-review item 2.)
- [ ] Manual: CSA → AN300496 → no crash; if button shown, clicking shows "No open revisit notice for this route".

## Phase 4: CIG application page

**Files:** `src/app/api/cig/applications/[id]/route.ts`, `src/app/cig/applications/[id]/page.tsx`
- [ ] API GET: `const revisit = application.status === "for_revision" ? await getOpenRevisitNotice(supabase, id) : null;` (use the route's user-scoped client already in scope); add `revisit` to the returned `application` (`:387-395`).
- [ ] Page: add `revisit` to the application type (`:274` area) and state mapping (`:383` area); in the Committee revisit card (`:1229-1242`) render `Committee's reason: {revisit.comment}` above the button when present.
- [ ] Manual: CIG → AN300496 → card shows "Please re-verify employment details with the manning agency."

## Phase last: Regression verification and rollout

- `npm test` — all pass.
- `npm run lint` — no new errors.
- `npm run build` — succeeds.

| Role | File | Action | Expected |
| --- | --- | --- | --- |
| CSA | AN300510 (revisit→CSA) | Open queue | Reason cell "Committee revisit: please complete the requirements" |
| CSA | AN300510 | Open page | Banner + header + panel show the comment |
| CSA | AN300510 | Revision complete | Status For approval; reason gone from queue |
| CIG | AN300496 (revisit→CIG) | Open page | Card shows the comment |
| CSA | AN300496 | Open page | No crash; server rejects Revision complete |
| CIG→CSA | New UAT file, receipt incomplete | Return with note "re-upload valid_id" | CSA banner "Returned by CIG — re-upload valid_id…" (underscore kept in banner) |
| CSA | Any `on_hold` file | Open page | "File on hold" banner + "Hold reason:" unchanged |
| Committee | — | Approve/Deny | Unchanged; `blocker` still cleared |

Post-deploy read-only check:
```sql
select la.application_no, la.status, r.route_to, r.resolved_at is null as open
from revisit_notices r join loan_applications la on la.id = r.loan_application_id
order by r.created_at desc limit 5;
```
Expected: rows unchanged by deploy (feature is read-only).

## Rollback

1. `git revert <commit>` on `main` and redeploy. No migration, no data written, so nothing else to undo.

## Commit

```bash
git add src/lib/committee/revisit-notices.ts src/lib/committee/__tests__/revisit-notices.test.mts src/lib/csa/queue.ts src/lib/csa/__tests__/queue.test.mts src/lib/csa/workspace.ts src/lib/csa/__tests__/workspace.test.mts "src/app/api/csa/applications/[id]/route.ts" "src/app/csa/applications/[id]/page.tsx" src/components/csa/NegotiationPanel.tsx src/app/csa/page.tsx "src/app/api/cig/applications/[id]/route.ts" "src/app/cig/applications/[id]/page.tsx"
git commit -m "Show committee revisit and CIG return reasons on CSA/CIG queues and pages"
```
Branch: `main` (user rule 2026-09-11).

## Self-review

1. **Contradictions:** "Don't touch blocker" vs showing CIG-return banner — fine, banner only *reads* blocker. None found.
2. **Goal reachability:** Existing rows — both live open notices display (validation 2-3). Future rows — the only notice writer (`actions.ts:319`) always sets `comment` (NOT NULL + `actions.ts:53` requires it). CIG returns always write the prefix (`receipt.ts:95`). Gap: CSA cannot read CIG-routed notices under RLS → CSA sees fallback, not "With CIG: …" (Phase 3 note; Open question 1 recommended answer adjusted accordingly; no RLS change proposed to stay read-only).
3. **Bypass:** Read-only feature; no new write path. Revision-complete authority stays server-side.
4. **Existence:** `revisit_notices` columns, `formatBlockerLabel` (`queue.ts:114`), `csaNextStep` (`workspace.ts:118`), `getOpenRevisitNotice` (new), `NegotiationPanelProps` (`NegotiationPanel.tsx:14`), `npm test` script — all checked.
5. **Consistency:** Files table = phases = `git add` list (12 files).
6. **Duplication:** No new stored field; reason stays in `revisit_notices`/`blocker`.
7. **Placeholders:** None, except `<commit>` in Rollback, which is the revert target hash known only after committing.

Not applicable: checklist C "rows that behave differently" beyond the historic-null case (covered, Contract case 5); D column grants (no writes).
