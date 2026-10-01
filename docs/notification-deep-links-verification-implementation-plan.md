# Notification Deep Links Verification Implementation Plan

**Goal:** Every notification a staff user or borrower clicks opens a real page they are allowed to see, and a future notification can't ship pointing at a page that doesn't exist.
**Root cause:** Notification links are hand-written string literals with nothing checking them against the route tree. Two had drifted: `release_closed_to_ar` → `/ar/masterlist` (`src/lib/notifications/workflow-catalog.ts:228` before fix) and `account_assigned_collector` → `/collector/accounts/:id` (`src/lib/ar/masterlist.ts:460` before fix). Neither path had a `page.tsx`, so both returned 404.
**Approach:** Add one `node:test` guard that checks every notification link in the source resolves to an existing `page.tsx` and to the right module for its audience. Then run a one-time live click-through per role. No runtime code, migration, or data change.
**Tech stack:** Next.js (App Router, `src/app`), Supabase Postgres, tests via `node --import tsx --test "src/lib/**/__tests__/*.mts"` (`package.json:10`).
**Source:** UAT by user on 2026-10-01 (AR bell, then Collector bell, both 404). Expected result, quoted: "when clicked it will redirect me to the account", and "can you check the other user too?". The code fixes are already on `main` (commits `7399db2`, `3941e2b`). This plan covers the verification still owed and the regression guard.

## Open questions (resolve before implementing)

| # | Question | Why it matters | Recommended answer |
| --- | --- | --- | --- |
| 1 | When a collector clicks an old "New account assigned to you" notice for an account since reassigned or turned over to remedial, what should they see? | The account API only returns accounts the caller currently owns (`src/app/api/collector/accounts/[id]/route.ts:78-80`), so the page loads but the account fetch fails. Today 0 stored notices are in this state (see validation §4), so nobody can hit it yet. | Leave as-is for this plan. Note the screen state during the click-through (Phase 2, row C3) and raise a separate item if it reads as broken. |

---

## Live database/system validation: 2026-10-01

Read-only; no data changed. Project `Loanstar` (`acopcwlhkovssjnrqygk`).

1. **Stored link patterns.** Query: `notifications` grouped by `link`, with UUIDs collapsed to `:id`. 373 rows total: `/borrower` 160, `/csa/applications/:id` 71, `/committee/applications/:id` 36, `/collector/dcr/history` 29, `/ar/dcr` 19, `/cig/applications/:id` 10, `/borrower/applications/:id` 9, `/lra/applications/:id` 8, `/agent` 5, `/ar/masterlist` 3, `/collector/briefings` 3, `/collector/accounts/:id` 2, `/remedial/accounts/:id` 1, `/collector` 1, `NULL` 8.
   - The 3 `/ar/masterlist` rows and 2 `/collector/accounts/:id` rows are the pre-fix links. Both paths now have redirect pages: `src/app/ar/masterlist/page.tsx` sends to `/ar`, and `src/app/collector/accounts/[id]/page.tsx` sends to `…/loan-file`.
2. **Page gate.** `src/proxy.ts:82-104` calls `has_module_permission(slug,'view',user)` for the first matching prefix in `PAGE_ACCESS_RULES` (`src/lib/permissions/navigation.ts:8-30`). If the user lacks the module, they are sent to the access-denied page.
   - The function (live `pg_get_functiondef`) returns true for super admin. Otherwise it returns `bool_or(can_view)` across the user's active roles.
3. **Role → view modules (live).** agent: leads · ar: accounting_ar, reports · borrower: borrower_portal · cig: computation, intake, verification · collection_head: briefings · collector: collection · committee: committee, negotiation, reports · csa: computation, intake, negotiation · lra: release_lra · remedial: remedial · super_admin: all.
4. **Recipient can pass the gate.** For each of the 365 rows with a link, the prefix was mapped to its module and checked with `has_module_permission(module,'view',recipient)`: **365 ok, 0 denied**.
   - Record-level check for `/collector/accounts/:id` and `/remedial/accounts/:id` rows: is the recipient still the current assignee (collector: `collector_user_id = recipient`, `remedial_user_id IS NULL`, `remedial_flag = false`; remedial: `remedial_user_id = recipient`)? **collector 2/2 and remedial 1/1 still owner.**
5. UNVERIFIED: whether each target page *renders* for its recipient. That needs a real session, which is Phase 2.

## Audit findings

1. **Every link source in code** (grep `link:` in `src/app/api` and `src/lib`):
   - Catalog: `src/lib/notifications/workflow-catalog.ts:54-241`, 27 events, each with `audience` and `link`.
   - Direct literals:
     - `src/app/api/ar/dcr/items/[itemId]/bounce/route.ts:39`, `…/items/[itemId]/reject/route.ts:40`, `src/app/api/ar/dcr/[id]/reject/route.ts:40`, `src/lib/notifications/workflow-events.ts:200` → `/collector/dcr/history`
     - `src/app/api/borrower/applications/[id]/loan/route.ts:293` → `/collector/proofs`
     - `src/app/api/collector/dcr/route.ts:203` → `/ar/dcr`
     - `src/app/api/collector/payments/[id]/route.ts:110` → `/borrower/applications/${…}`
     - `src/app/api/csa/applications/[id]/change-owner/route.ts:72`, `…/connect-borrower/route.ts:42`, `…/endorse/route.ts:71`, `src/lib/cig/forward.ts:113`, `src/lib/committee/actions.ts:371,380` → `/borrower`
     - `src/app/api/csa/applications/[id]/change-owner/route.ts:82` → `null`
     - `src/app/api/csa/leads/[id]/convert/route.ts:84` → `/agent`
     - `src/lib/ar/masterlist.ts:460` → `/collector/accounts/${…}/loan-file`
     - `src/lib/ar/masterlist.ts:586` → `/remedial/accounts/${…}`
     - `src/lib/ar/masterlist.ts:597` → `/collector`
2. **Route existence** (checked `page.tsx` on 2026-10-01): every target above exists, including `src/app/ar/masterlist/application/[applicationId]/page.tsx` (added in `7399db2`). No other drift was found.
3. **Audience vs gate** (catalog audience → link prefix → required module → role has it?):
   - `cig` → `/cig` → verification ✓
   - `csa` / `endorserOrCsa` → `/csa` → intake ✓. `endorsedBy` is only ever set by the CSA endorse route (`src/app/api/csa/applications/[id]/endorse/route.ts:45`, gated on intake).
   - `committee` → committee ✓
   - `lra` → release_lra ✓
   - `ar` → accounting_ar ✓
   - `collection_head` → `/collector/briefings` → briefings ✓. This works because the more specific rule comes first (`navigation.ts:26`).
   - `borrower` → borrower_portal ✓
4. **Click handler:** the bell renders `n.link` as a Next `<Link href>` (`src/components/admin/Header.tsx:488-490`). There's no rewriting, so the stored string is the URL.
5. **Existing test to extend:** `src/lib/notifications/__tests__/workflow-wiring.test.mts` reads source text by path from `src/` (lines 6-7). The new guard copies that harness.
6. **Prior decisions:**
   - Memory "Workflow notifications system" (2026-09-22): role-broadcast design.
   - Memory "Single-branch workflow on main": commit to `main`.
   - Memory "Cursor handoff workflow": Cursor implements this plan.

---

## Scope and constraints

### In scope
- A new `node:test` guard. For every notification link in source, it checks that a matching `page.tsx` exists. For every catalog role audience, it checks that the link prefix's required module is one the role is expected to view.
- A one-time live click-through per role (Phase 2), recorded in this file.

### Out of scope: do not change
- Notification copy, audiences, the dispatcher, or the `notifications` table.
- Rewriting the 5 stored pre-fix links. The redirect pages already handle them.
- The behaviour for a reassigned account (Open question 1).

### Non-negotiable safety constraints
- No DB writes. The click-through uses seed/test staff accounts on the deployed or local app; nobody types credentials into chat or this file.
- Don't loosen `PAGE_ACCESS_RULES` or any RLS policy to make a check pass.

### Contract

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| New link to non-existent route | developer | adds `link: "/foo/bar"` | `npm test` fails naming the file and the link |
| Dynamic link | developer | `` `/x/${id}/y` `` | Matches `src/app/x/[param]/y/page.tsx` |
| Catalog role can't view target | developer | `audience: { roles: ["lra"] }`, link `/ar/...` | `npm test` fails |
| Pre-fix stored link | AR / Collector | clicks old notice | Lands on `/ar` or the account's loan file, not a 404 |
| `null` link | any | notice without link | Not checked; the bell renders no link |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `src/lib/notifications/__tests__/notification-links.test.mts` | create | Route-existence and audience/module guard |
| `docs/notification-deep-links-verification-implementation-plan.md` | modify (Phase 2 results table) | Record the click-through outcome |

## Phase 0: Failing test first

### Task 0.1: guard catches a missing route
**File:** `src/lib/notifications/__tests__/notification-links.test.mts`
- [ ] Write the test:

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { getRequiredPageModules } from "../../permissions/navigation";

const src = fileURLToPath(new URL("../../../", import.meta.url));
const app = join(src, "app");

/** Pull `link:` string / template literals out of a source file. */
function linksIn(text: string): string[] {
  const out: string[] = [];
  const re = /link:\s*(?:\([^)]*\)\s*=>\s*)?(["`])(\/[^"`]*)\1/g;
  for (const m of text.matchAll(re)) out.push(m[2]);
  return out;
}

/** True when some page.tsx under src/app matches the path ("${…}" = any dynamic segment). */
function routeExists(path: string): boolean {
  const segs = path.split("?")[0].split("/").filter(Boolean);
  const walk = (dir: string, i: number): boolean => {
    if (i === segs.length) return existsSync(join(dir, "page.tsx"));
    const seg = segs[i];
    const dynamic = seg.includes("${");
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      if (name.startsWith("(") && walk(full, i)) return true; // route groups
      const isParam = name.startsWith("[") && name.endsWith("]");
      if ((dynamic ? isParam : name === seg || isParam) && walk(full, i + 1)) return true;
    }
    return false;
  };
  return walk(app, 0);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "__tests__" || name === "node_modules") return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = [...sourceFiles(join(src, "app", "api")), ...sourceFiles(join(src, "lib"))];
const found = files.flatMap((f) =>
  linksIn(readFileSync(f, "utf8")).map((link) => ({ file: f.slice(src.length), link })),
);

test("finds the notification links (sanity)", () => {
  assert.ok(found.length >= 40, `only ${found.length} links found — regex drifted?`);
});

for (const { file, link } of found) {
  test(`${file}: ${link} resolves to a page`, () => {
    assert.ok(routeExists(link), `no src/app page for ${link}`);
  });
}

/** Mirrors live role_module_permissions.can_view (validated 2026-10-01). */
const ROLE_VIEW: Record<string, string[]> = {
  cig: ["computation", "intake", "verification"],
  csa: ["computation", "intake", "negotiation"],
  committee: ["committee", "negotiation", "reports"],
  lra: ["release_lra"],
  ar: ["accounting_ar", "reports"],
  collection_head: ["briefings"],
};

test("catalog role audiences can open their link", async () => {
  const { WORKFLOW_EVENTS } = await import("../workflow-catalog");
  for (const [key, def] of Object.entries(WORKFLOW_EVENTS)) {
    const link = def.link("00000000-0000-0000-0000-000000000000");
    const needed = getRequiredPageModules(link) ?? [];
    const roles =
      "roles" in def.audience ? def.audience.roles
      : "endorserOrCsa" in def.audience ? ["csa"]
      : [];
    const effective = "borrower" in def.audience ? ["borrower_portal"] : null;
    for (const role of roles) {
      assert.ok(needed.some((m) => ROLE_VIEW[role]?.includes(m)), `${key}: role ${role} can't view ${link}`);
    }
    if (effective) assert.ok(needed.some((m) => effective.includes(m)), `${key}: borrower can't view ${link}`);
  }
});
```

- [ ] Prove the guard bites: temporarily change `src/lib/ar/masterlist.ts:597` to `` link: `/collector/nope`, ``.
- [ ] Run: `npm test -- --test-name-pattern="resolves to a page"` → Expected: FAIL `no src/app page for /collector/nope`.
- [ ] Revert the temporary change. Run it again → Expected: PASS.

## Phase 1: Full suite

### Task 1.1
- [ ] Run: `npm test` → Expected: all pass, including the new file.
- [ ] Run: `npx tsc --noEmit -p .` → Expected: no new errors. One already exists in `src/lib/ar/__tests__/initialize-ar-account.test.mts:58`; it's unrelated.
- [ ] Run: `npm run lint` → Expected: no new errors in the new file.

**Phase constraints:** test-only. No change under `src/app` or the rest of `src/lib`.

## Phase 2: Live click-through (one time)

Run on the deployed app after `7399db2` and `3941e2b` are live, logged in as each seed role in turn. Fill in the Result column in this file.

| # | Role | Trigger / notice | Click → expected | Result |
| --- | --- | --- | --- | --- |
| A1 | AR | Old "New account needs a collector" (stored `/ar/masterlist`) | Lands on `/ar` masterlist | |
| A2 | AR | Fresh one: release a test loan through LRA → AR receive | Lands on `/ar/masterlist/<id>` for that account | |
| A3 | AR | "DCR submitted" | `/ar/dcr` | |
| C1 | Collector | Old "New account assigned to you" (AN300516 / AN300514) | `/collector/accounts/<id>/loan-file` with the account loaded | |
| C2 | Collector | Fresh one: AR assigns a test account to the seed collector | Same as C1 | |
| C3 | Collector | Notice for an account reassigned away (Open Q1) | Note what appears | |
| C4 | Collector | "DCRR item reconciled" / "Check bounced" | `/collector/dcr/history` | |
| C5 | Collector | Borrower proof uploaded | `/collector/proofs` | |
| H1 | Collection head | "Release awaiting briefing" | `/collector/briefings` | |
| R1 | Remedial | "Account turned over to you" | `/remedial/accounts/<id>` with the account loaded | |
| S1 | CSA | Any `/csa/applications/:id` notice | Application opens | |
| G1 | CIG | Endorsed-to-CIG notice; Committee-denied notice | Application opens; `/cig/denials` | |
| M1 | Committee | Forwarded-to-committee notice | Application opens | |
| L1 | LRA | Queued-for-LRA notice | Application opens | |
| P1 | Agent | Lead converted notice | `/agent` | |
| B1 | Borrower | Any `/borrower/applications/:id` notice | Own application opens | |

Pass = no 404, no access-denied page, no "not found" error card for a record the user currently owns.

## Phase last: Regression verification and rollout

- `npm test`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run build`.
- Smoke-test table: Phase 2.
- Data check afterwards (read-only): re-run the validation §4 query → Expected: `denied = 0`.

## Rollback

1. The guard is test-only. If it misfires, delete `src/lib/notifications/__tests__/notification-links.test.mts`. No data or runtime impact.

## Commit

On `main` (project rule):

```
git add src/lib/notifications/__tests__/notification-links.test.mts docs/notification-deep-links-verification-implementation-plan.md
git commit -m "test(notifications): guard notification links against missing routes"
```

## Self-review

1. **Contradictions:** none. The test-only scope matches "no runtime change". The reassigned-account case is explicitly deferred (Open Q1).
2. **Goal reachability:** existing rows: validation §4 shows 0 denied and redirects cover all 5 pre-fix links. Future rows: the guard runs on every `npm test`.
3. **Bypass:** a link built some other way than a `link:` literal (e.g. a variable assigned earlier) would escape the regex. The sanity floor (≥40 links; currently 46 = 27 catalog + 19 direct) catches large drift, not one-offs. Accepted.
4. **Existence:** `getRequiredPageModules` (`navigation.ts:40`) and `has_module_permission` exist. The catalog export is `WORKFLOW_EVENTS` (`workflow-catalog.ts:53`), confirmed.
5. **Consistency:** Files table == Commit list. Test path matches the `src/lib/**/__tests__/*.mts` runner pattern.
6. **Duplication:** `ROLE_VIEW` mirrors DB data, a second copy that can drift. It's labelled with its validation date. The live §4 query is the authoritative check.
7. **Placeholders:** none. `<id>` in the Phase 2 table means the real record a tester sees, not a template gap.

Not applicable: checklist A (no new field), C column definitions (no schema change), D write-side RLS (read-only feature).
