# CSA Change Application Owner Implementation Plan

**Goal:** A CSA can move a loan application that already belongs to one borrower portal account to a different borrower portal account, early in the process, with a written reason, both borrowers notified, and the move fully audited.
**Root cause:** The only ownership-move feature, `connect_application_to_borrower_account`, deliberately refuses any application whose current borrower already has a portal account (`supabase/migrations/20260922090000_connect_application_borrower_account.sql:35-37`), and the CSA panel is only rendered when `!data.borrower?.userId` (`src/app/csa/applications/[id]/page.tsx:1344`).
**Approach:** Add a new, separate RPC + route + CSA panel for "Change owner" (account → account), reusing the connect RPC's move logic; leave the existing walk-in "Connect" flow untouched; close two DB-level gaps found in the audit (direct `borrower_id` writes, and portal downloads of files stored under a previous owner's folder).
**Tech stack:** Next.js (App Router, see `AGENTS.md` — read `node_modules/next/dist/docs/` before writing route code), Supabase (Postgres RLS + Storage), Zod 4, `node:test` via `tsx` (`package.json:10`).
**Source:** User request in chat, 2026-10-01: "if a loan application is already connected to an account, is it possible to reconnect it … change the owner of that application into another borrower account?" followed by agreement to the recommended scope (CSA, up to CSA/CI stage, required reason, notify both). Expected Result: CSA changes the owner; the new owner sees and works on the application in their portal; the old owner no longer does.

## Decisions (resolved 2026-10-01)

**All four resolved by the user on 2026-10-01: "go with the recommendations."** Implement the Recommended answer column as final.

| # | Question | Why it matters | Decided answer |
| --- | --- | --- | --- |
| 1 | Which stages allow a change of owner? | After Committee/LRA, signed documents, loan record and payments are legally tied to the original borrower. | Allow: `draft`, `registered`, `documents_pending`, `submitted`, `on_hold`, `for_revision`, `for_verification`. Reject everything else. (Live: 34 applications currently sit in these statuses.) |
| 2 | Who may do it: any user with `intake:edit` (CSA), or a supervisor/superadmin only? | Moving loan ownership is sensitive; `intake:edit` is the same permission as the existing Connect action (`connect-borrower/route.ts:17`). | `intake:edit` (same as Connect), with a mandatory reason of 10+ characters and a full audit record. |
| 3 | Should an Application Form printout that was already generated be regenerated automatically? | Generated printouts carry the old borrower's name (`generateApplicationForm` keeps one live printout per application, `src/lib/documents/generators/application-form.ts:24,81`). | No auto-regeneration; the success message tells the CSA to regenerate the Application Form. At the allowed stages no LRA/release documents exist yet. |
| 4 | Fix the file-download gap (finding 6) for the existing Connect feature too? | 44 live documents are already stored under a folder that doesn't match their current borrower, so their new owners likely can't open them from the portal today. | Yes: the Phase 3 fix applies to both features at no extra cost. |

---

## Live database/system validation: 2026-10-01

Read-only queries on project `acopcwlhkovssjnrqygk`; no data changed.

1. **Connect RPC is live and matches the migration.** `connect_application_to_borrower_account(p_application_id uuid, p_target_borrower_id uuid, p_actor_id uuid)`, `SECURITY DEFINER`, EXECUTE granted only to `service_role` (and `postgres`). The live definition contains the "already connected to a borrower account" guard.
2. **Tables holding a borrower reference** (`information_schema.columns`, `column_name IN (borrower_id, borrower_no, borrower_name)`): `loan_applications`, `documents`, `masterlist` (+`borrower_no`, `borrower_name`), `payments`, `leads` (+`borrower_name`), `cig_return_to_csa_events` (+`borrower_no`). Foreign keys to `borrowers`: `loan_applications`, `documents`, `masterlist` and `payments` use ON DELETE CASCADE; `leads` uses ON DELETE SET NULL. **No** `amortization_schedules`, `assignments` or `portfolios` borrower column exists, and there is no co-borrower table (`%co_borrow%` returned nothing).
3. **Application distribution:** 152 applications. 82 belong to portal-linked borrowers and 70 to walk-in borrowers. Statuses in the recommended allowed set: draft 7, documents_pending 4, submitted 15, on_hold 1, for_revision 1, for_verification 6 = 34. No borrower account maps to more than one `borrowers` row (0 duplicates by `user_id`).
4. **Existing Connect usage:** 15 audit events with `after_data.trigger = 'csa_connect_borrower_account'`.
5. **RLS UPDATE policies on `loan_applications`** (summarised): `applications_update` lets (a) the application's own borrower and (b) `intake:edit` staff update **any column** while `is_csa_editable_status(status)` (registered, documents_pending, submitted, on_hold, for_revision). `applications_cig_borrower_edit` does the same for `intake:edit` in `for_verification`. Superadmin passes every policy. No column restriction or trigger guards `borrower_id`. Triggers on UPDATE: `guard_application_agent_column`, `guard_draft_status_transition`, `loan_applications_updated_at`.
6. **Storage `loan-documents` bucket:** `storage_borrower_select` lets a borrower read an object only when `storage.foldername(name)[1] = borrowers.id` for their own `user_id`. Staff read through module permissions (intake, committee, lra, ar, collection, remedial).
7. **Folder mismatch already exists:** 44 of 612 documents with a file have `split_part(storage_path,'/',1) <> borrower_id`. This is caused by Connect moving `documents.borrower_id` without moving files: re-checked 2026-10-01, all 44 belong to applications with a `csa_connect_borrower_account` audit event, and all 44 folders are the previous (walk-in) borrower's id.
8. **`guard_application_agent_column`** is the pattern to copy for a column guard: a `plpgsql` trigger raising `insufficient_privilege`.

## Audit findings

1. **Existing representations of "owner":** `loan_applications.borrower_id` is canonical. Copies that must move with it: `masterlist.borrower_id/borrower_no/borrower_name`, `documents.borrower_id`, `payments.borrower_id`. This is exactly what the Connect RPC moves (`20260922090000_…sql:61-85`). `leads.borrower_id` and `cig_return_to_csa_events` are history of the original lead or event and stay unchanged (same as Connect).
2. **Writers of `loan_applications.borrower_id`:** INSERT on application create (e.g. `src/app/api/borrower/applications/reloan/route.ts:215`); the Connect RPC; the one-off dedup migration `20260717100311_borrowers_email_unique.sql:22-50`. Grep found **no** application-code UPDATE of `borrower_id`.
3. **Bypass (finding 5):** because `applications_update` has no column restriction, a CSA with `intake:edit` can already change `borrower_id` straight from the browser Supabase client, skipping the audit, notices and the moves of documents, loan record and payments. A borrower can't pass `WITH CHECK` with someone else's `borrower_id`, so the risk is limited to staff, but it creates exactly the half-moved state this feature must prevent. Fix: add a trigger guard (Phase 1).
4. **Readers after a move:** the borrower portal lists applications by `borrower_id` (`src/app/api/borrower/applications/route.ts:38`). Once `borrower_id` changes, the old owner loses access and the new owner gains it through RLS, with no code change.
5. **Uploads after a move:** the borrower upload path builds new paths from the application's current borrower (`src/app/api/borrower/applications/[id]/documents/route.ts:118-120`), so new files land in the new owner's folder. Correct.
6. **Downloads after a move (bug):** `src/app/api/borrower/documents/[id]/download/route.ts` already authorises correctly — `getOwnDocument` (lines 11-45) reads the row under the `documents_select` RLS policy and explicitly requires `borrowers.user_id = auth user`, else `ForbiddenError("Document not found")` (403) — but then signs the URL with the **session** client (lines 54-60), so storage RLS (live finding 6) rejects files stored under a previous owner's folder. This already affects Connect (live finding 7), and Change owner would hit it on every moved file. Fix: authorise through the `documents` row (RLS already limits it to the owner), then sign with the service client.
7. **Old owner's residual storage access:** with the session client, the old owner can still sign URLs for moved files in their own folder if they know the path. The portal no longer lists those rows, so exposure is low, but the fix below doesn't remove it. Moving storage objects is out of scope (see Out of scope).
8. **Notifications:** `notifyUser` with a free-text `kind` (`connect-borrower/route.ts:38-46`); kind `application_account_connected` is covered by a test (`src/lib/csa/__tests__/connect-borrower-contract.test.mts:28-32`).
9. **Search helper:** `searchBorrowerAccounts` already returns only portal-linked borrowers (`src/lib/csa/connect-borrower.ts:16-47`) and is reused as is.
10. **Prior decisions:** the Connect RPC comment says it "deliberately does not merge/copy profile fields … and does not delete or edit the old walk-in row" (`src/lib/csa/connect-borrower.ts:50-53`). Honoured: Change owner copies no profile data either. Work happens directly on `main` (project memory, 2026-09-11). Migrations are applied through the Supabase MCP `apply_migration`, not `db push`, and mirrored into both migration folders (project memory).

| Variant | Supported today? | Change |
| --- | --- | --- |
| Walk-in → account | Yes (Connect) | none |
| Account → other account, allowed status | No | new RPC/route/panel |
| Account → other account, later status | No | rejected by RPC (by design) |
| Account → same account | n/a | rejected by RPC |
| Account → walk-in (no portal account) | No | rejected by RPC |

---

## Scope and constraints

### In scope
- New RPC `reassign_application_borrower_account`, new route `POST /api/csa/applications/[id]/change-owner`, new CSA panel shown when the borrower **has** a portal account and the status is allowed.
- Trigger `guard_application_borrower_column` so `borrower_id` can only change through a SECURITY DEFINER RPC or the service role.
- Borrower download route: authorise through the `documents` row, sign with the service client.
- Notify old and new owner; audit event with before and after.

### Out of scope: do not change
- The Connect flow (RPC, route, panel, texts, tests).
- Copying or merging profile data between borrowers; deleting borrower rows.
- Moving storage objects between folders.
- `leads`, `cig_return_to_csa_events`, generated-PDF regeneration.
- Changes at Committee, LRA or later stages.

### Non-negotiable safety constraints
- All writes happen in one RPC transaction (all-or-nothing), EXECUTE granted to `service_role` only.
- The status check is enforced in the RPC (DB), not only in the UI.
- The route requires `requireModulePermission("intake", "edit")`.
- The route never returns user IDs to the browser (matches the existing test at `connect-borrower-contract.test.mts:34-36`).

### Contract
`POST /api/csa/applications/[id]/change-owner`, body `{ targetBorrowerId: uuid, reason: string (10–500 chars, trimmed) }` → `200 { borrowerId }`. Errors: 400 on validation (through `formatZodError`), 401/403 from the permission check, 400/500 with the RPC message otherwise. RPC exceptions: `Application not found`, `Application is not linked to a borrower account — use Connect instead`, `Owner cannot be changed at this stage`, `Application already belongs to that borrower`, `Selected borrower record not found`, `Selected borrower does not have a portal account`, `A reason of at least 10 characters is required`.

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| Happy path | CSA (intake:edit) | linked app in `submitted`, other portal borrower, reason | app, masterlist, documents, payments move; status_history note with reason; audit; both notified |
| Stage too late | CSA | app in `approved` | 400 "Owner cannot be changed at this stage"; nothing changes |
| Same owner | CSA | target = current | rejected; nothing changes |
| Target is walk-in | CSA | target with no `user_id` | rejected |
| Walk-in app | CSA | app whose borrower has no `user_id` | rejected; Connect panel still shown instead |
| Missing/short reason | CSA | reason "" or 5 chars | 400 plain-language error |
| No permission | Collector / borrower | any | 403 |
| Direct DB write | CSA via browser Supabase client | `update loan_applications set borrower_id=…` | trigger raises `insufficient_privilege` |
| Direct DB write | Borrower via client | same | trigger raises (also blocked by RLS) |
| Connect still works | CSA | walk-in app → account | unchanged behaviour (RPC is SECURITY DEFINER, so the trigger lets it through) |
| New owner opens moved file | New owner | download of a file stored under the old folder | file opens |
| Old owner after move | Old owner | portal list / download API | app is gone from the list; download API returns 403 "Document not found" |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/20261001090000_reassign_application_owner.sql` | new | RPC + borrower_id guard trigger |
| `../supabase/migrations/20261001090000_reassign_application_owner.sql` | new (mirror, untracked by git) | two-folder convention |
| `src/lib/csa/connect-borrower.ts` | edit | add `reassignApplicationBorrowerAccount()` |
| `src/app/api/csa/applications/[id]/change-owner/route.ts` | new | endpoint, audit, two notices |
| `src/components/csa/ChangeOwnerPanel.tsx` | new | search + reason + confirm UI |
| `src/app/csa/applications/[id]/page.tsx` | edit | render the panel when linked and status allowed |
| `src/app/api/borrower/documents/[id]/download/route.ts` | edit | sign with service client after the RLS-checked row read |
| `src/lib/csa/change-owner-stages.ts` | new | shared allowed-status list for UI + test |
| `src/lib/csa/__tests__/change-owner-contract.test.mts` | new | source-contract tests |

## Phase 0: Failing tests first

### Task 0.1: change-owner contract
**File:** `src/lib/csa/__tests__/change-owner-contract.test.mts` (matches `src/lib/**/__tests__/*.mts`)
- [ ] Write tests using the same `readFileSync` pattern as `connect-borrower-contract.test.mts`:
  - lib calls `rpc("reassign_application_borrower_account"` and has no `from("documents")`, `from("payments")` or `from("masterlist")`;
  - route uses `requireModulePermission("intake", "edit")`, contains `notifyUser` twice, the kinds `application_owner_changed_in` and `application_owner_changed_out`, and no `jsonOk(result)`;
  - migration file contains `SECURITY DEFINER`, `GRANT EXECUTE … TO service_role`, `guard_application_borrower_column`, and every status from `CHANGE_OWNER_ALLOWED_STATUSES`;
  - `src/lib/csa/change-owner-stages.ts` exports exactly the 7 statuses from Open question 1.
- [ ] Run: `npm test` → Expected: FAIL (files don't exist).

## Phase 1: Migration

**Files:** both migration copies. Apply through the Supabase MCP `apply_migration` **before** deploying code (the route calls the RPC).

```sql
CREATE OR REPLACE FUNCTION public.reassign_application_borrower_account(
  p_application_id uuid, p_target_borrower_id uuid, p_actor_id uuid, p_reason text)
RETURNS TABLE(borrower_id uuid, borrower_user_id uuid, previous_borrower_id uuid, previous_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app public.loan_applications%ROWTYPE;
  v_source public.borrowers%ROWTYPE;
  v_target public.borrowers%ROWTYPE;
  v_target_name text;
BEGIN
  IF length(trim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required';
  END IF;
  SELECT * INTO v_app FROM public.loan_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.status NOT IN ('draft','registered','documents_pending','submitted','on_hold','for_revision','for_verification') THEN
    RAISE EXCEPTION 'Owner cannot be changed at this stage';
  END IF;
  SELECT * INTO v_source FROM public.borrowers WHERE id = v_app.borrower_id FOR UPDATE;
  IF NOT FOUND OR v_source.user_id IS NULL THEN
    RAISE EXCEPTION 'Application is not linked to a borrower account — use Connect instead';
  END IF;
  IF p_target_borrower_id = v_app.borrower_id THEN
    RAISE EXCEPTION 'Application already belongs to that borrower';
  END IF;
  SELECT * INTO v_target FROM public.borrowers WHERE id = p_target_borrower_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected borrower record not found'; END IF;
  IF v_target.user_id IS NULL THEN RAISE EXCEPTION 'Selected borrower does not have a portal account'; END IF;

  v_target_name := concat_ws(' ', NULLIF(v_target.first_name,''), NULLIF(v_target.middle_name,''), NULLIF(v_target.last_name,''));

  UPDATE public.loan_applications
  SET borrower_id = p_target_borrower_id,
      status_history = COALESCE(status_history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'status', v_app.status,
        'note', 'CSA changed application owner: ' || trim(p_reason),
        'at', to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'actorId', p_actor_id))
  WHERE id = p_application_id;
  UPDATE public.masterlist SET borrower_id = p_target_borrower_id,
    borrower_no = COALESCE(v_target.borrower_no, borrower_no),
    borrower_name = COALESCE(NULLIF(v_target_name,''), borrower_name)
  WHERE loan_application_id = p_application_id;
  UPDATE public.documents SET borrower_id = p_target_borrower_id WHERE loan_application_id = p_application_id;
  UPDATE public.payments  SET borrower_id = p_target_borrower_id WHERE loan_application_id = p_application_id;

  RETURN QUERY SELECT v_target.id, v_target.user_id, v_source.id, v_source.user_id;
END; $$;
REVOKE ALL ON FUNCTION public.reassign_application_borrower_account(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_application_borrower_account(uuid,uuid,uuid,text) TO service_role;

-- Only SECURITY DEFINER RPCs / the service role may re-own an application.
CREATE OR REPLACE FUNCTION public.guard_application_borrower_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.borrower_id IS DISTINCT FROM OLD.borrower_id
     AND current_user IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'Application owner can only be changed through Connect or Change owner'
      USING errcode = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_application_borrower_column
  BEFORE UPDATE OF borrower_id ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_application_borrower_column();
```

Inside a SECURITY DEFINER function `current_user` is the function owner (`postgres`), so both RPCs pass the guard. The guard only blocks direct PostgREST writes made with a user JWT.

- [ ] Verification (read-only): `select proname, prosecdef from pg_proc where proname in ('reassign_application_borrower_account','guard_application_borrower_column');` → 2 rows. `select tgname from pg_trigger where tgname='guard_application_borrower_column';` → 1 row.

**Phase constraints:** do not alter `connect_application_to_borrower_account`.

## Phase 2: Server

### Task 2.1: stage list + lib
- [ ] `src/lib/csa/change-owner-stages.ts`: `export const CHANGE_OWNER_ALLOWED_STATUSES = ["draft","registered","documents_pending","submitted","on_hold","for_revision","for_verification"] as const;` plus `canChangeOwner(status: string): boolean`.
- [ ] In `connect-borrower.ts`, add `reassignApplicationBorrowerAccount(applicationId, targetBorrowerId, actorId, reason)`, mirroring `connectApplicationToBorrowerAccount` (service client, RPC `reassign_application_borrower_account`, same row unwrapping) and returning `{ borrowerId, borrowerUserId, previousBorrowerId, previousUserId }`.

### Task 2.2: route `change-owner/route.ts`
- [ ] Copy the structure of `connect-borrower/route.ts`. Body schema `z.object({ targetBorrowerId: z.string().uuid(), reason: z.string().trim().min(10).max(500) })`. Map the ZodError through `formatZodError`.
- [ ] Audit: `action: "edit"`, `entityType: "loan_application"`, `beforeData: { borrowerId: previousBorrowerId }`, `afterData: { trigger: "csa_change_application_owner", newBorrowerId, reason }`.
- [ ] Notices:
  - new owner: kind `application_owner_changed_in`, title "Loan application linked to your account", link `/borrower`;
  - old owner: kind `application_owner_changed_out`, title "A loan application was moved from your account", body "A Loan Star application was moved to another borrower account by our staff. Please contact your branch if you have questions.", no link.
- [ ] Return `jsonOk({ borrowerId })` only.
- [ ] Run `npm test` → contract tests for lib, route and migration pass.

## Phase 3: Borrower download fix

**File:** `src/app/api/borrower/documents/[id]/download/route.ts`
- [ ] Keep `requireModulePermission("borrower_portal", "view")` and `getOwnDocument` exactly as they are (session-client read + explicit `user_id` match, lines 11-45; failures stay 403 "Document not found").
- [ ] Only change the signing call (lines 54-60) to `createSignedDownloadUrl(createServiceClient(), document.storage_path as string)`; import `createServiceClient` from `@/lib/supabase/server`. Remove the now-unused `supabase` session variable in `GET`.
- [ ] Manual check: a borrower who received an application through Connect opens a file uploaded before the connect → it opens.

**Phase constraints:** never sign a path the session client couldn't read as a `documents` row.

## Phase 4: CSA UI

- [ ] `ChangeOwnerPanel.tsx`: copy the search and list part of `ConnectBorrowerAccountPanel.tsx`, hiding the current owner from results. Add a required Reason textarea (10+ characters, counter). The confirm dialog reads: "Change owner to {name} ({email})? {current name} will no longer see this application. Uploaded documents move with it. Regenerate the Application Form afterwards if one was printed." Confirm label "Yes, change owner". POST to `/api/csa/applications/${applicationId}/change-owner`.
- [ ] `page.tsx` next to line 1344: `{data.borrower?.userId && canChangeOwner(data.application.status) ? <ChangeOwnerPanel applicationId={applicationId} currentBorrowerId={data.borrower.id} onConnected={() => void load({ silent: true })} /> : null}`. Verified: `data.borrower` is a `BorrowerProfile` with `id` and `userId` (`src/lib/borrowers/types.ts:96-97,157-158`, built at `src/app/api/csa/applications/[id]/route.ts:200`); `data.application.status` is used at `page.tsx:615`.
- [ ] Manual check: linked app in `submitted` shows the panel; in `approved` it doesn't; walk-in app still shows only Connect.

## Phase last: Regression verification and rollout

- `npm test`, `npm run lint`, `npx tsc --noEmit -p .` (known pre-existing errors live only in `__tests__`), `npm run build`.
- Smoke tests:

| Role | Variant | Action | Expected |
| --- | --- | --- | --- |
| CSA | linked, `submitted` | change owner | success; new owner sees it, old owner doesn't |
| CSA | linked, `for_verification` | change owner | success; still in CIG queue |
| CSA | linked, `approved` | open page | no panel; API returns stage error |
| CSA | walk-in | connect | unchanged |
| New owner | moved app | open old file | opens |
| CSA | browser console direct update of `borrower_id` | — | rejected by trigger |

- Data checks: `select count(*) from audit_events where after_data->>'trigger'='csa_change_application_owner';` rises by 1 per test; for the test application, the documents, payments and masterlist rows all carry the new `borrower_id`.

## Rollback

1. Revert the code commit (panel, route, download change).
2. Forward migration: `DROP TRIGGER guard_application_borrower_column ON public.loan_applications; DROP FUNCTION public.guard_application_borrower_column(); DROP FUNCTION public.reassign_application_borrower_account(uuid,uuid,uuid,text);`. Never edit the applied migration.
3. Applications already moved stay with their new owner; they are consistent across all four tables and remain valid. Reverse a move only by running the RPC again before the rollback.

## Commit

On `main`:
```bash
git add supabase/migrations/20261001090000_reassign_application_owner.sql src/lib/csa/connect-borrower.ts "src/app/api/csa/applications/[id]/change-owner/route.ts" src/components/csa/ChangeOwnerPanel.tsx "src/app/csa/applications/[id]/page.tsx" "src/app/api/borrower/documents/[id]/download/route.ts" src/lib/csa/change-owner-stages.ts src/lib/csa/__tests__/change-owner-contract.test.mts
```
Message: `CSA change application owner (account→account) + borrower_id guard + portal download fix`. The `../supabase/migrations` mirror is still created (two-folder CLI convention) but is **not** in any git repository (verified: `git -C ../supabase` → not a repository), so it is not part of the commit.

## Self-review

1. **Contradictions:** "Connect untouched" vs. the new trigger. Both RPCs are SECURITY DEFINER, so Connect passes the guard. Consistent.
2. **Goal reachability:** existing linked apps in the 7 allowed statuses (34 live) can be moved; future apps from every creation path end up with the same `borrower_id` model. Moved files open thanks to Phase 3.
3. **Bypass:** direct client UPDATE is closed by the trigger; route and RPC are service-role only; the UI is not the boundary. Residual: the old owner can still sign URLs for their own folder via raw storage (audit finding 7). Accepted and documented.
4. **Existence:** checked live or in code: the Connect RPC, `is_csa_editable_status`, the `guard_application_agent_column` pattern, `createSignedDownloadUrl`, `searchBorrowerAccounts`, `formatZodError`, the `npm test` glob, `npm run lint`/`build` scripts, `page.tsx:1344`, page data fields (`data.borrower.id`, `data.application.status`), `notifyUser` optional `link`, `writeAuditEvent` `beforeData`, no CHECK constraint on `notifications.kind`, RPC owner `postgres` (so `current_user` inside it passes the trigger).
5. **Consistency:** the Files table matches the phases; the git add list has 8 paths (the untracked `../supabase` mirror excluded, verified outside any repo).
6. **Duplication:** no second owner field; uses `borrower_id` only. The stage list lives in the RPC and in `change-owner-stages.ts`; the Phase 0 test keeps them in sync.
7. **Placeholders:** none.

Audit sections not applicable: reporting/analytics scope (no reports touched), templates stored in the DB (no template changed; regeneration is a manual CSA step per Open question 3).

### Impact on unrelated code (checked 2026-10-01)
- **New trigger:** the only DB function that updates `loan_applications.borrower_id` is `connect_application_to_borrower_account` (SECURITY DEFINER, owner `postgres`, so it passes). No app-code `.update()`/`.upsert()` on `loan_applications` includes `borrower_id` (all 10 update sites checked: agent, co-borrowers, blocker, endorse, status helper). `scripts/reseed-demo-data.ts` uses the service key, so it passes. The trigger fires only when `borrower_id` is in the SET list **and** actually changes.
- **Download change:** affects only `src/app/api/borrower/documents/[id]/download/route.ts` (borrower portal, called from `DocumentChecklist.tsx`). Staff download routes are untouched. Ownership check unchanged; it only lets owners open files stored under a previous owner's folder.
- **`connect-borrower.ts`:** additive function only. Its importers (`connect-borrower/route.ts`, `csa/borrowers/search/route.ts`) are unchanged.
- **CSA page:** additive panel; the Connect panel condition is untouched.
- **RPC:** new function; no existing table, policy or function is altered.
