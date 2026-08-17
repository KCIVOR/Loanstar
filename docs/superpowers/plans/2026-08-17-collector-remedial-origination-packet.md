# Collector / Remedial Origination Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give assigned Collectors and Remedial staff a read-only Committee evidence packet (attachments + CSA summary + full CIG report) with view/download, without granting Intake/Verification modules or broad RLS.

**Architecture:** Assignment-gated case-file APIs call a shared service-role `loadOriginationPacket` after `assertCollectorAssignment` / `assertRemedialAssignment`. Checklist and document download also go through those gates (user-scoped Supabase cannot read `documents` / `verifications`). Shared `OriginationPacketPanel` mounts on Remedial account detail and in a Collector Case file modal.

**Tech Stack:** Next.js App Router, React client components, Supabase (user + service clients), existing `DocumentChecklist` / `Modal`, Node `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-17-collector-remedial-origination-packet-design.md`

**Commits:** Only create git commits if the user explicitly asked to commit in the session. Otherwise skip commit steps and leave changes unstaged.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/collection/origination-packet.ts` | Assignment asserts, resolve masterlist→application, load packet DTO, authorize document download |
| `src/lib/collection/__tests__/origination-packet.test.mts` | Pure unit tests for asserts helpers that can be tested without live DB (shape mappers + download match helper) |
| `src/app/api/collector/accounts/[id]/case-file/route.ts` | GET packet for collector |
| `src/app/api/collector/accounts/[id]/case-file/checklist/route.ts` | GET intake checklist (service role after assignment) |
| `src/app/api/collector/accounts/[id]/case-file/documents/[documentId]/download/route.ts` | Signed download after assignment + application match |
| `src/app/api/remedial/accounts/[id]/case-file/route.ts` | GET packet for remedial |
| `src/app/api/remedial/accounts/[id]/case-file/checklist/route.ts` | Checklist twin |
| `src/app/api/remedial/accounts/[id]/case-file/documents/[documentId]/download/route.ts` | Download twin |
| `src/components/collection/OriginationPacketPanel.tsx` | Shared read-only UI |
| `src/app/collector/accounts/page.tsx` | Case file button + modal |
| `src/app/remedial/accounts/[id]/page.tsx` | Mount panel section |

---

### Task 1: Pure helpers + unit tests (TDD)

**Files:**
- Create: `src/lib/collection/origination-packet.ts`
- Create: `src/lib/collection/__tests__/origination-packet.test.mts`

- [ ] **Step 1: Write failing tests** for pure helpers that do not need Supabase:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  documentBelongsToApplication,
  mapVerificationRow,
  type VerificationRowDb,
} from "../origination-packet";

describe("documentBelongsToApplication", () => {
  it("returns true when loan_application_id matches", () => {
    assert.equal(
      documentBelongsToApplication(
        { loan_application_id: "app-1" },
        "app-1",
      ),
      true,
    );
  });

  it("returns false when application differs or is missing", () => {
    assert.equal(
      documentBelongsToApplication(
        { loan_application_id: "app-2" },
        "app-1",
      ),
      false,
    );
    assert.equal(
      documentBelongsToApplication({ loan_application_id: null }, "app-1"),
      false,
    );
  });
});

describe("mapVerificationRow", () => {
  it("maps DB snake_case to committee-compatible camelCase and returns null for null input", () => {
    assert.equal(mapVerificationRow(null), null);
    const mapped = mapVerificationRow({
      finding: "positive",
      finding_notes: "ok",
      forwarded_at: "2026-01-01T00:00:00Z",
      completed_at: null,
      field_completeness_ok: true,
      field_completeness_notes: null,
      bi_identity_confirmed: true,
      bi_purpose_confirmed: true,
      bi_details_confirmed: false,
      bi_notes: "n",
      cm_departure_date: null,
      cm_salary: 1000,
      cm_position: "OS",
      cm_contract_status: "active",
      cm_fit_to_work: true,
      cm_notes: null,
      cm_manager_name: "M",
      cm_manager_position: "PIC",
      cm_manager_contact: null,
      cm_manning_agency_name: "Agency",
      cm_joining_port: null,
      pic_verification: null,
      reference_verifications: null,
      verification_checklist: null,
      pic_payment_preference: null,
      pic_demeanor: null,
      pic_rating: null,
      pic_rating_reason: null,
      cif_verified_by: null,
      cif_verified_date: null,
      field_visit: null,
      sme_reloan_verification: null,
    } satisfies VerificationRowDb);
    assert.equal(mapped?.finding, "positive");
    assert.equal(mapped?.findingNotes, "ok");
    assert.equal(mapped?.cmSalary, 1000);
    assert.equal(mapped?.biDetailsConfirmed, false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** (module missing)

```bash
npx tsx --test src/lib/collection/__tests__/origination-packet.test.mts
```

Expected: fail resolving `../origination-packet`

- [ ] **Step 3: Implement minimal pure exports + async stubs used later**

In `src/lib/collection/origination-packet.ts`, implement at least:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatStatusLabel } from "@/lib/applications/status";
import { csaScreeningCheckSlug } from "@/lib/csa/sme-duplication";
import {
  getCompletionSummary,
  getStageChecklist,
  loadChecklistScope,
} from "@/lib/documents/checklist";
import { ForbiddenError, NotFoundError } from "@/lib/permissions/server";

export type VerificationRowDb = {
  finding: string | null;
  finding_notes: string | null;
  forwarded_at: string | null;
  completed_at: string | null;
  field_completeness_ok: boolean | null;
  field_completeness_notes: string | null;
  bi_identity_confirmed: boolean | null;
  bi_purpose_confirmed: boolean | null;
  bi_details_confirmed: boolean | null;
  bi_notes: string | null;
  cm_departure_date: string | null;
  cm_salary: number | null;
  cm_position: string | null;
  cm_contract_status: string | null;
  cm_fit_to_work: boolean | null;
  cm_notes: string | null;
  cm_manager_name: string | null;
  cm_manager_position: string | null;
  cm_manager_contact: string | null;
  cm_manning_agency_name: string | null;
  cm_joining_port: string | null;
  pic_verification: unknown;
  reference_verifications: unknown;
  verification_checklist: unknown;
  pic_payment_preference: string | null;
  pic_demeanor: string | null;
  pic_rating: number | null;
  pic_rating_reason: string | null;
  cif_verified_by: string | null;
  cif_verified_date: string | null;
  field_visit: unknown;
  sme_reloan_verification: unknown;
};

export function documentBelongsToApplication(
  document: { loan_application_id: string | null },
  loanApplicationId: string,
): boolean {
  return (
    Boolean(document.loan_application_id) &&
    document.loan_application_id === loanApplicationId
  );
}

export function mapVerificationRow(row: VerificationRowDb | null) {
  if (!row) return null;
  return {
    finding: row.finding,
    findingNotes: row.finding_notes,
    forwardedAt: row.forwarded_at,
    completedAt: row.completed_at,
    fieldCompletenessOk: row.field_completeness_ok,
    fieldCompletenessNotes: row.field_completeness_notes,
    biIdentityConfirmed: row.bi_identity_confirmed,
    biPurposeConfirmed: row.bi_purpose_confirmed,
    biDetailsConfirmed: row.bi_details_confirmed,
    biNotes: row.bi_notes,
    cmDepartureDate: row.cm_departure_date,
    cmSalary: row.cm_salary,
    cmPosition: row.cm_position,
    cmContractStatus: row.cm_contract_status,
    cmFitToWork: row.cm_fit_to_work,
    cmNotes: row.cm_notes,
    cmManagerName: row.cm_manager_name,
    cmManagerPosition: row.cm_manager_position,
    cmManagerContact: row.cm_manager_contact,
    cmManningAgencyName: row.cm_manning_agency_name,
    cmJoiningPort: row.cm_joining_port,
    picVerification: row.pic_verification,
    referenceVerifications: row.reference_verifications,
    verificationChecklist: row.verification_checklist,
    picPaymentPreference: row.pic_payment_preference,
    picDemeanor: row.pic_demeanor,
    picRating: row.pic_rating,
    picRatingReason: row.pic_rating_reason,
    cifVerifiedBy: row.cif_verified_by,
    cifVerifiedDate: row.cif_verified_date,
    fieldVisit: row.field_visit,
    smeReloanVerification: row.sme_reloan_verification,
  };
}

export type MasterlistCaseContext = {
  masterlistId: string;
  loanApplicationId: string;
  borrowerId: string | null;
  borrowerName: string | null;
  segment: "seafarer" | "sme";
};

export async function assertCollectorAssignment(
  supabase: SupabaseClient,
  userId: string,
  masterlistId: string,
): Promise<MasterlistCaseContext> {
  const { data, error } = await supabase
    .from("masterlist")
    .select(
      `
      id,
      loan_application_id,
      borrower_id,
      borrower_name,
      segment,
      assignments!inner ( collector_user_id )
    `,
    )
    .eq("id", masterlistId)
    .eq("assignments.collector_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.loan_application_id) {
    throw new ForbiddenError("Account not found");
  }

  return {
    masterlistId: data.id as string,
    loanApplicationId: data.loan_application_id as string,
    borrowerId: (data.borrower_id as string | null) ?? null,
    borrowerName: (data.borrower_name as string | null) ?? null,
    segment: data.segment === "sme" ? "sme" : "seafarer",
  };
}

export async function assertRemedialAssignment(
  supabase: SupabaseClient,
  userId: string,
  masterlistId: string,
): Promise<MasterlistCaseContext> {
  const { data, error } = await supabase
    .from("masterlist")
    .select(
      `
      id,
      loan_application_id,
      borrower_id,
      borrower_name,
      segment,
      remedial_flag,
      assignments!inner ( remedial_user_id )
    `,
    )
    .eq("id", masterlistId)
    .eq("remedial_flag", true)
    .eq("assignments.remedial_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.loan_application_id) {
    throw new ForbiddenError("Account not found");
  }

  return {
    masterlistId: data.id as string,
    loanApplicationId: data.loan_application_id as string,
    borrowerId: (data.borrower_id as string | null) ?? null,
    borrowerName: (data.borrower_name as string | null) ?? null,
    segment: data.segment === "sme" ? "sme" : "seafarer",
  };
}

const VERIFICATION_SELECT = `
  finding, finding_notes, forwarded_at, completed_at,
  field_completeness_ok, field_completeness_notes,
  bi_identity_confirmed, bi_purpose_confirmed, bi_details_confirmed, bi_notes,
  cm_departure_date, cm_salary, cm_position, cm_contract_status, cm_fit_to_work, cm_notes,
  cm_manager_name, cm_manager_position, cm_manager_contact, cm_manning_agency_name, cm_joining_port,
  pic_verification, reference_verifications, verification_checklist,
  pic_payment_preference, pic_demeanor, pic_rating, pic_rating_reason,
  cif_verified_by, cif_verified_date,
  field_visit, sme_reloan_verification
`;

/** Service-role loader — call only after assignment assert. */
export async function loadOriginationPacket(
  admin: SupabaseClient,
  ctx: MasterlistCaseContext,
) {
  const { data: application, error: appErr } = await admin
    .from("loan_applications")
    .select(
      `
      id, application_no, status, segment, blocker,
      privacy_orientation_at, privacy_orientation_by,
      initial_interview_at, initial_interview_notes, initial_interview_by,
      endorsed_at, endorsed_by, status_history
    `,
    )
    .eq("id", ctx.loanApplicationId)
    .maybeSingle();

  if (appErr) throw new Error(appErr.message);
  if (!application) throw new NotFoundError("Application not found");

  const { data: verification } = await admin
    .from("verifications")
    .select(VERIFICATION_SELECT)
    .eq("loan_application_id", ctx.loanApplicationId)
    .maybeSingle();

  const actorIds = Array.from(
    new Set(
      [
        application.privacy_orientation_by as string | null,
        application.initial_interview_by as string | null,
        application.endorsed_by as string | null,
      ].filter((v): v is string => Boolean(v)),
    ),
  );
  const nameById = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const p of profiles ?? []) {
      nameById.set(
        p.id as string,
        (p.full_name as string) || (p.email as string),
      );
    }
  }

  const screeningSlug = csaScreeningCheckSlug(
    application.segment as string | null,
  );
  const { data: screeningType } = await admin
    .from("check_types")
    .select("id, name")
    .eq("slug", screeningSlug)
    .maybeSingle();

  let csaScreening = {
    slug: screeningSlug,
    name: null as string | null,
    result: "pending",
    notes: null as string | null,
    checkedAt: null as string | null,
  };
  if (screeningType?.id) {
    const { data: screeningCheck } = await admin
      .from("checks_recorded")
      .select("result, notes, checked_at")
      .eq("loan_application_id", ctx.loanApplicationId)
      .eq("check_type_id", screeningType.id)
      .maybeSingle();
    csaScreening = {
      slug: screeningSlug,
      name: (screeningType.name as string | null) ?? null,
      result: (screeningCheck?.result as string | undefined) ?? "pending",
      notes: (screeningCheck?.notes as string | null | undefined) ?? null,
      checkedAt:
        (screeningCheck?.checked_at as string | null | undefined) ?? null,
    };
  }

  return {
    masterlistId: ctx.masterlistId,
    application: {
      id: application.id as string,
      applicationNo: application.application_no as string,
      status: application.status as string,
      statusLabel: formatStatusLabel(String(application.status)),
      segment: application.segment === "sme" ? "sme" : "seafarer",
      blocker: (application.blocker as string | null) ?? null,
    },
    borrower: {
      id: ctx.borrowerId,
      name: ctx.borrowerName,
    },
    csaSummary: {
      blocker: (application.blocker as string | null) ?? null,
      endorsedAt: (application.endorsed_at as string | null) ?? null,
      endorsedByName: application.endorsed_by
        ? (nameById.get(application.endorsed_by as string) ?? null)
        : null,
      privacyOrientationAt:
        (application.privacy_orientation_at as string | null) ?? null,
      privacyOrientationByName: application.privacy_orientation_by
        ? (nameById.get(application.privacy_orientation_by as string) ?? null)
        : null,
      initialInterviewAt:
        (application.initial_interview_at as string | null) ?? null,
      initialInterviewNotes:
        (application.initial_interview_notes as string | null) ?? null,
      initialInterviewByName: application.initial_interview_by
        ? (nameById.get(application.initial_interview_by as string) ?? null)
        : null,
    },
    csaScreening,
    verification: mapVerificationRow(
      (verification as VerificationRowDb | null) ?? null,
    ),
  };
}

export async function loadIntakeChecklistForApplication(
  admin: SupabaseClient,
  loanApplicationId: string,
) {
  const scope = await loadChecklistScope(admin, loanApplicationId);
  const items = await getStageChecklist(admin, "intake", loanApplicationId, scope);
  const summary = getCompletionSummary(items);
  return { stage: "intake" as const, items, summary };
}

export async function authorizeCaseFileDocumentDownload(
  admin: SupabaseClient,
  loanApplicationId: string,
  documentId: string,
) {
  const { data: document, error } = await admin
    .from("documents")
    .select("id, loan_application_id, storage_path, file_name, mime_type, status")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!document) throw new ForbiddenError("Document not found");
  if (
    !documentBelongsToApplication(
      {
        loan_application_id:
          (document.loan_application_id as string | null) ?? null,
      },
      loanApplicationId,
    )
  ) {
    throw new ForbiddenError("Document not found");
  }
  if (!document.storage_path || document.status === "pending") {
    throw new ForbiddenError("Document has not been uploaded yet");
  }

  return {
    documentId: document.id as string,
    storagePath: document.storage_path as string,
    fileName: (document.file_name as string | null) ?? null,
    mimeType: (document.mime_type as string | null) ?? null,
  };
}
```

Keep the verification field list aligned with `src/app/api/committee/applications/[id]/route.ts` (evidence only — no votes).

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
npx tsx --test src/lib/collection/__tests__/origination-packet.test.mts
```

- [ ] **Step 5: Commit** (only if user requested commits)

```bash
git add src/lib/collection/origination-packet.ts src/lib/collection/__tests__/origination-packet.test.mts
git commit -m "feat: add origination packet helpers for collector/remedial case file"
```

---

### Task 2: Collector case-file APIs

**Files:**
- Create: `src/app/api/collector/accounts/[id]/case-file/route.ts`
- Create: `src/app/api/collector/accounts/[id]/case-file/checklist/route.ts`
- Create: `src/app/api/collector/accounts/[id]/case-file/documents/[documentId]/download/route.ts`

- [ ] **Step 1: Packet GET**

```ts
// src/app/api/collector/accounts/[id]/case-file/route.ts
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  assertCollectorAssignment,
  loadOriginationPacket,
} from "@/lib/collection/origination-packet";
import { writeAuditEvent } from "@/lib/audit/writer";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("collection", "view");
    const { id } = await params;
    const supabase = await createClient();
    const ctx = await assertCollectorAssignment(supabase, user.id, id);
    const admin = createServiceClient();
    const packet = await loadOriginationPacket(admin, ctx);
    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "collection",
      action: "case_file.view",
      entityType: "masterlist",
      entityId: ctx.masterlistId,
      afterData: {
        loanApplicationId: ctx.loanApplicationId,
        desk: "collector",
      },
    });
    return jsonOk(packet);
  } catch (error) {
    return handleApiError(error);
  }
}
```

If `writeAuditEvent` needs different fields, match `src/lib/audit/writer.ts` exactly (`actorId`, `moduleSlug`, `action`, `entityType`, `entityId`, `afterData`). Use `moduleSlug: "remedial"` on remedial routes.

- [ ] **Step 2: Checklist GET** — `requireModulePermission("collection","view")` → `assertCollectorAssignment` → `loadIntakeChecklistForApplication(admin, ctx.loanApplicationId)` → `jsonOk`.

- [ ] **Step 3: Document download GET**

Pattern after `src/app/api/collector/payments/[id]/download/route.ts`:

1. `collection:view`
2. `assertCollectorAssignment(supabase, user.id, masterlistId)` where `masterlistId` is `[id]`
3. `authorizeCaseFileDocumentDownload(admin, ctx.loanApplicationId, documentId)`
4. `createSignedDownloadUrl(admin, storagePath)` — **use service client** so storage/doc RLS cannot block
5. Optional audit `case_file.download`
6. `jsonOk({ signedUrl, fileName, mimeType, documentId })`

- [ ] **Step 4: Smoke-check TypeScript** on the new routes (IDE / `npx tsc` if project allows; ignore pre-existing unrelated test TS errors).

- [ ] **Step 5: Commit** (only if requested)

---

### Task 3: Remedial case-file APIs

**Files:**
- Create: `src/app/api/remedial/accounts/[id]/case-file/route.ts`
- Create: `src/app/api/remedial/accounts/[id]/case-file/checklist/route.ts`
- Create: `src/app/api/remedial/accounts/[id]/case-file/documents/[documentId]/download/route.ts`

- [ ] **Step 1:** Mirror Task 2 with `requireModulePermission("remedial", "view")` and `assertRemedialAssignment`. Audit meta `desk: "remedial"`.

- [ ] **Step 2: Commit** (only if requested)

---

### Task 4: Shared `OriginationPacketPanel`

**Files:**
- Create: `src/components/collection/OriginationPacketPanel.tsx`

Props:

```ts
type OriginationPacketPanelProps = {
  masterlistId: string;
  /** Base path without trailing slash, e.g. `/api/collector/accounts/${id}/case-file` */
  caseFileApiBase: string;
  /** When true, parent already fetched packet; when false, panel fetches on mount */
  mode: "fetch" | "controlled";
  packet?: OriginationPacketDto | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
};
```

Define `OriginationPacketDto` as the JSON shape returned by `loadOriginationPacket` (export the return type from the lib via `Awaited<ReturnType<typeof loadOriginationPacket>>` or an explicit exported type).

- [ ] **Step 1: Implement panel UI**

1. If `mode === "fetch"`, `useEffect` → `GET ${caseFileApiBase}` and store packet/error/loading.
2. Empty: no application / missing borrower → Alert “Origination packet unavailable for this account.”
3. Attachments: two `DocumentChecklist` instances (`readOnly`), using:
   - `applicationId={packet.application.id}`
   - `borrowerId={packet.borrower.id!}` (guard if null)
   - `checklistApiPath={`${caseFileApiBase}/checklist`}`
   - `viewApiPath={(documentId) => `${caseFileApiBase}/documents/${documentId}/download`}`
   - borrower list: `excludeSlugs={CSA_ONLY_INTAKE_SLUGS}`
   - CSA list: `includeSlugs={CSA_ONLY_INTAKE_SLUGS}`
4. CSA summary card: mirror read-only layout from `src/app/committee/applications/[id]/page.tsx` (~689–850) using `packet.csaSummary` + `packet.csaScreening` only (no votes).
5. CIG card: if `!packet.verification` show “No CIG report on file.” Else render finding, notes, BI/CM/PIC/field completeness using helpers already exported from `@/lib/cig/verification` (`assessFieldVisitRequired`, `ciFormCompletionBadge`, etc.) — copy display patterns from the Committee verification section (~897+) **into this component**; do **not** edit the Committee page.

Check `DocumentChecklist` signed-URL handling: it expects download JSON with `signedUrl` (same as `/api/documents/[id]/download`). Match that response shape.

- [ ] **Step 2: Commit** (only if requested)

---

### Task 5: Wire Collector accounts desk

**Files:**
- Modify: `src/app/collector/accounts/page.tsx`

- [ ] **Step 1:** Add state `caseFileFor: CollectorQueueMappedRow | null`.
- [ ] **Step 2:** In `renderActionButtons`, add a secondary button **Case file** that sets `caseFileFor`.
- [ ] **Step 3:** Render a `Modal` (same pattern as `RecordPaymentModal` host) when `caseFileFor` is set:

```tsx
<Modal
  open={caseFileFor !== null}
  onClose={() => setCaseFileFor(null)}
  title={caseFileFor ? `Case file — ${caseFileFor.borrowerName}` : "Case file"}
  // size: use the largest modal size already supported by the UI Modal if any
>
  {caseFileFor ? (
    <OriginationPacketPanel
      masterlistId={caseFileFor.id}
      caseFileApiBase={`/api/collector/accounts/${caseFileFor.id}/case-file`}
      mode="fetch"
    />
  ) : null}
</Modal>
```

Confirm `Modal` props against `src/components/ui` (title/onClose/open). Adjust to the real API; do not invent props.

- [ ] **Step 4: Manual check** — assigned collector opens Case file; attachments list loads; download opens; unassigned account should not appear on desk (assignment already filters list).

- [ ] **Step 5: Commit** (only if requested)

---

### Task 6: Wire Remedial account detail

**Files:**
- Modify: `src/app/remedial/accounts/[id]/page.tsx`

- [ ] **Step 1:** Import `OriginationPacketPanel`.
- [ ] **Step 2:** Add a section **before** Payment history (keep ledger + Record payment intact), e.g.:

```tsx
<section className="mb-8">
  <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">
    Origination packet
  </h2>
  <p className="mb-3 text-sm text-ink-500">
    Read-only — borrower/CSA attachments, CSA intake summary, and CIG report
    for this assigned account.
  </p>
  <OriginationPacketPanel
    masterlistId={account.id}
    caseFileApiBase={`/api/remedial/accounts/${account.id}/case-file`}
    mode="fetch"
  />
</section>
```

- [ ] **Step 3: Manual check** — assigned remedial sees packet; Record payment still works.

- [ ] **Step 4: Commit** (only if requested)

---

### Task 7: Verification

- [ ] **Step 1:** Run unit tests

```bash
npx tsx --test src/lib/collection/__tests__/origination-packet.test.mts
npm test
```

Expected: collection tests pass; full suite remains green (or only pre-existing failures unrelated to this allowlist).

- [ ] **Step 2:** Confirm diff stays on allowlist from the spec §7 (plus this plan file). No RBAC seed changes, no `documents_select` migration, no Committee page edits.

- [ ] **Step 3:** Manual matrix

| Actor | Action | Expected |
|---|---|---|
| Assigned collector | Case file → view + download | 200, files open |
| Assigned remedial | Detail packet → download | 200 |
| Hit download with wrong `documentId` (other app) | GET download | 403 |
| Committee application page | Unchanged | Votes still present |

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Evidence packet only (no votes) | 1 loader + 4 UI |
| Assigned accounts only | 1 asserts + 2/3 APIs |
| Collector modal / Remedial detail | 5 / 6 |
| View + download | 2/3 download routes + DocumentChecklist |
| Service-role after gate (no broad RLS) | 1–3 |
| Checklist via assignment-gated API | 2/3 checklist routes |
| Audit view/download | 2/3 (optional fields if writer supports) |
| Unit tests | 1 + 7 |
| Deny Committee/RBAC/migrations | 7 |

## Placeholder / consistency self-check

- Types: `MasterlistCaseContext`, `mapVerificationRow` output, packet DTO used by panel and APIs — same names across tasks.
- Download JSON must include `signedUrl` for `DocumentChecklist`.
- No “implement later” steps; Committee page not modified.
