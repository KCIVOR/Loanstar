# Collector / Remedial — Committee evidence packet (read-only) — Design Spec

**Date:** 2026-08-17  
**Status:** Draft for review  
**App:** LoanStar (`loanstar/`)  
**Scope:** Assignment-gated, read-only access to Committee’s **evidence packet** (attachments + CSA summary + full CIG/CI report) for Collector and Remedial — **hard-gated to §7 allowlist**

---

## 1. Goal

Let Collector and Remedial staff view and download the same **origination evidence** Committee uses when reviewing a file — borrower/CSA attachments, CSA intake summary, and the full CIG verification report — so recovery and collection work can reference the case file without opening Committee queues or granting Intake/Verification modules.

---

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Content | **Evidence packet only** — attachments + CSA summary + full CIG/CI report |
| Votes / deliberation | **Out** — no committee votes, tallies, comments, or assessment actions |
| Who can open | **Assigned accounts only** (collector assignment / remedial assignment + remedial flag) |
| Surface | **On existing desk surfaces** — Remedial account detail page; Collector **Case file** modal/drawer from accounts list (Collector has no account detail route today) |
| File access | **View + download** |
| Architecture | **Approach B** — assignment-gated APIs + service-role packet loader; **no** broad Collection/Remedial RLS on `documents` / `verifications`; **no** new sidebar modules |

**Out of scope (this change):**

- Granting `intake`, `verification`, or `committee` module permissions to Collector/Remedial
- Broadening `documents_select` / `verifications_select` RLS for Collection/Remedial
- Negotiation threads, affordability scorecard, LRA generated/release documents
- Changing Committee APIs or Committee UI behavior
- Reports / executive analytics module
- Classic account ledger changes
- New Collector account detail page (defer unless requested later)

---

## 3. Current behavior (audit summary)

| Capability | Committee | Collector | Remedial |
|---|---|---|---|
| Borrower / CSA attachments | Yes (`DocumentChecklist` + download API) | No | No |
| CSA intake summary | Yes (committee application GET) | No | No |
| Full CIG/CI report | Yes (`verifications` via committee GET) | No | No |
| Account desk | Application detail | Accounts **list** + modals only | Account **detail** `/remedial/accounts/[id]` |
| Payment proofs | N/A | Yes (separate flow) | Yes (limited) |

Staff document download today accepts only `intake`, `release_lra`, or `committee` (`src/app/api/documents/[id]/download/route.ts`). Default RBAC gives Collector only `collection` and Remedial only `remedial`.

---

## 4. Architecture

### 4.1 Shared server loader

Add a focused module (suggested path: `src/lib/collection/origination-packet.ts`):

1. **`assertCollectorAssignment(supabase, userId, masterlistId)`**  
   Fail closed unless `assignments.collector_user_id = userId` for that masterlist (and account is visible to collection desk rules already used elsewhere).

2. **`assertRemedialAssignment(supabase, userId, masterlistId)`**  
   Fail closed unless `assignments.remedial_user_id = userId` and `remedial_flag = true`.

3. **`loadOriginationPacket(admin, loanApplicationId)`** (service role)  
   Build a DTO aligned with Committee’s **evidence** slices only:
   - Application meta needed for labels (segment, status, borrower id/name)
   - CSA summary / screening fields Committee already returns for the CSA card
   - Full verification row fields Committee selects for the CI report
   - Checklist-compatible document listing for intake stage (borrower vs CSA slug split)

   **Must not** load votes, vote tallies, committee assessment actions, or negotiation send capabilities.

### 4.2 APIs

| Route | Auth | Behavior |
|---|---|---|
| `GET /api/collector/accounts/[id]/case-file` | `collection:view` | Assert collector assignment → resolve `loan_application_id` → `loadOriginationPacket` |
| `GET /api/remedial/accounts/[id]/case-file` | `remedial:view` | Assert remedial assignment → same loader |
| Checklist endpoints for `DocumentChecklist` | Same modules | Assignment-gated; mirror Committee checklist read shape for intake stage |
| Document download for packet files | `collection:view` or `remedial:view` | Assignment gate **and** document’s `loan_application_id` must match the assigned masterlist’s application; then stream/signed URL like existing staff download |

Implementation note: prefer **module-specific download routes** under collector/remedial (or a shared helper used by both) rather than opening `/api/documents/[id]/download` to all Collection users without an assignment check.

### 4.3 UI

- Shared **`OriginationPacketPanel`** (client):
  1. Borrower attachments (`DocumentChecklist` read-only)
  2. CSA attachments (`DocumentChecklist` read-only, CSA-only slugs)
  3. CSA intake summary card (read-only)
  4. CIG / CI report card (read-only)
- **Collector:** “Case file” control on `/collector/accounts` → modal/drawer with borrower title → fetch collector case-file API
- **Remedial:** same panel section on `/remedial/accounts/[id]` (placement near ledger / payment history; do not replace Record payment or ledger)

Reuse Committee field mapping / display helpers where practical; do **not** mount Committee vote UI.

### 4.4 Security model

- Assignment checks on every packet and download request (fail closed → 403)
- Service-role reads only inside those gated loaders — not exposed as generic table access
- No sidebar module grants for Intake / Verification / Committee
- Optional but recommended: audit events `case_file.view` and `case_file.download` with masterlist id, application id, actor

### 4.5 Empty / error states

| Condition | UX |
|---|---|
| Masterlist has no `loan_application_id` | “Origination packet unavailable for this account.” |
| No verification row | CIG section: “No CIG report on file.” |
| No documents | Existing checklist empty state |
| Not assigned | 403 + alert; no download links |
| Download mismatch / missing file | Error message; no URL leak |

---

## 5. Testing

**Unit (`*.test.mts` under `src/lib/collection/` or similar):**

- Assignment asserts accept assigned user, reject others
- Packet loader omits votes / returns verification + CSA shapes
- Download authorization rejects document for a different application

**Manual:**

- Assigned collector opens Case file → sees attachments + CSA + CIG; download works
- Unassigned collector → 403
- Assigned remedial on detail page → same packet; download works
- Committee application page unchanged

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Over-broad RLS leaks all applications’ files | Prefer assignment-gated service-role APIs (Approach B); do not grant Collection `documents_select` globally |
| Collector has no detail page | Case file modal/drawer on accounts list (locked) |
| Storage bucket policies already allow Collection/Remedial SELECT on `loan-documents` | Keep discovery + download behind assignment-checked APIs; never return foreign `storage_path` values |
| Packet drifts from Committee UI | Shared panel + loader fields tracked against Committee evidence sections; exclude votes by design |

---

## 7. File allowlist / denylist

### ALLOW (create or edit)

| Path | Change |
|---|---|
| `src/lib/collection/origination-packet.ts` | Assignment asserts + packet loader |
| `src/lib/collection/__tests__/origination-packet.test.mts` | Unit tests |
| `src/components/collection/OriginationPacketPanel.tsx` | Shared read-only UI |
| `src/app/api/collector/accounts/[id]/case-file/**` | GET packet (+ checklist/download as needed) |
| `src/app/api/remedial/accounts/[id]/case-file/**` | GET packet (+ checklist/download as needed) |
| `src/app/collector/accounts/page.tsx` | Case file button + modal/drawer |
| `src/app/remedial/accounts/[id]/page.tsx` | Mount packet section |
| Small shared display helpers extracted from Committee **only if** required to avoid duplication | Optional |

### DENY

- `src/app/committee/**` behavior changes (except optional pure helper extract with identical Committee behavior)
- Granting Collectors/Remedial `intake` / `verification` / `committee` in seed RBAC
- Broad migrations widening `documents_select` / `verifications_select` to Collection/Remedial without assignment predicates
- Payment POST / DCRR / posting / LRA release / AR masterlist ledger work
- Reports executive upgrade
- New marketplace, payments QR, unrelated refactors

### If blocked

Stop and ask — especially if checklist/download cannot be secured without an RLS migration; prefer service-role download after assignment check over opening SELECT policies.

---

## 8. Success criteria

1. Assigned Collector can open Case file and download borrower/CSA attachments for that account’s application.
2. Assigned Remedial can view the same packet on account detail and download the same files.
3. Unassigned users receive 403 for packet and download.
4. Committee votes/deliberation remain invisible on these surfaces.
5. Default sidebar modules for Collector/Remedial unchanged.
6. Unit tests for assignment + download scoping pass.

---

## 9. Implementation follow-up

After this spec is approved, create an implementation plan under `docs/superpowers/plans/` and implement only the §7 allowlist.
