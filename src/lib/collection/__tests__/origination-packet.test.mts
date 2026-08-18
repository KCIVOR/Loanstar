import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertCollectorAssignment,
  assertRemedialAssignment,
  authorizeCaseFileDocumentDownload,
  documentBelongsToApplication,
  loadIntakeChecklistForApplication,
  loadOriginationPacket,
  mapPacketVerificationRow,
  type MasterlistCaseContext,
  type PacketVerificationRow,
} from "../origination-packet";

const here = dirname(fileURLToPath(import.meta.url));
const moduleSource = readFileSync(
  join(here, "..", "origination-packet.ts"),
  "utf8",
);
const committeeRouteSource = readFileSync(
  join(
    here,
    "..",
    "..",
    "..",
    "app",
    "api",
    "committee",
    "applications",
    "[id]",
    "route.ts",
  ),
  "utf8",
);
const packetPanelSource = readFileSync(
  join(
    here,
    "..",
    "..",
    "..",
    "components",
    "collection",
    "OriginationPacketPanel.tsx",
  ),
  "utf8",
);

type QueryState = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: unknown }>;
  inFilters: Array<{ column: string; values: readonly unknown[] }>;
};

type QueryResult = { data: unknown; error: { message: string } | null };

/** Minimal chainable stub covering the `select/eq/in/maybeSingle` calls this module makes. */
function fakeClient(
  respond: (state: QueryState) => QueryResult,
  log: QueryState[] = [],
): SupabaseClient {
  return {
    from(table: string) {
      const state: QueryState = {
        table,
        columns: "",
        filters: [],
        inFilters: [],
      };
      log.push(state);
      const builder = {
        select(columns: string) {
          state.columns = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          state.filters.push({ column, value });
          return builder;
        },
        in(column: string, values: readonly unknown[]) {
          state.inFilters.push({ column, values });
          return builder;
        },
        is(column: string, value: unknown) {
          state.filters.push({ column, value });
          return builder;
        },
        or() {
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle: async () => respond(state),
        single: async () => respond(state),
        then(
          onFulfilled?: (value: QueryResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(respond(state)).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function filterValue(state: QueryState, column: string): unknown {
  return state.filters.find((f) => f.column === column)?.value;
}

/**
 * tsx resolves `@/…` imports to a different module instance than the relative
 * import used here, so `instanceof` cannot be used across that boundary —
 * match on the error name instead (class wiring is asserted from source above).
 */
function hasErrorName(name: string, message?: RegExp) {
  return (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, name);
    if (message) assert.match(error.message, message);
    return true;
  };
}

const masterlistRow = {
  id: "ml-1",
  loan_application_id: "app-1",
  borrower_id: "borrower-1",
  borrower_name: "Juan Dela Cruz",
  segment: "seafarer",
};

const verificationRow: PacketVerificationRow = {
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
};

const collectorCtx: MasterlistCaseContext = {
  masterlistId: "ml-1",
  loanApplicationId: "app-1",
  borrowerId: "borrower-1",
  borrowerName: "Juan Dela Cruz",
  segment: "seafarer",
};

describe("permission error wiring", () => {
  it("throws the shared errors handleApiError maps to 403 / 404", () => {
    assert.match(
      moduleSource,
      /import \{\s*ForbiddenError,\s*NotFoundError,?\s*\} from "@\/lib\/permissions\/server";/,
    );
  });
});

describe("documentBelongsToApplication", () => {
  it("returns true when loan_application_id matches", () => {
    assert.equal(
      documentBelongsToApplication({ loan_application_id: "app-1" }, "app-1"),
      true,
    );
  });

  it("returns false when application differs or is missing", () => {
    assert.equal(
      documentBelongsToApplication({ loan_application_id: "app-2" }, "app-1"),
      false,
    );
    assert.equal(
      documentBelongsToApplication({ loan_application_id: null }, "app-1"),
      false,
    );
  });
});

describe("mapPacketVerificationRow", () => {
  it("returns null for a missing verification row", () => {
    assert.equal(mapPacketVerificationRow(null), null);
  });

  it("maps DB snake_case to committee-compatible camelCase", () => {
    const mapped = mapPacketVerificationRow(verificationRow);
    assert.equal(mapped?.finding, "positive");
    assert.equal(mapped?.findingNotes, "ok");
    assert.equal(mapped?.cmSalary, 1000);
    assert.equal(mapped?.biDetailsConfirmed, false);
    assert.equal(mapped?.cmManningAgencyName, "Agency");
    assert.equal(mapped?.forwardedAt, "2026-01-01T00:00:00Z");
  });

  it("emits exactly the evidence fields Committee returns — no votes or completeness", () => {
    const mapped = mapPacketVerificationRow(verificationRow);
    assert.ok(mapped);
    for (const key of Object.keys(mapped)) {
      assert.ok(
        committeeRouteSource.includes(`${key}: verification.`),
        `Committee route does not expose verification field '${key}'`,
      );
    }
    assert.equal("isComplete" in mapped, false);
    assert.equal("id" in mapped, false);
  });
});

describe("assertCollectorAssignment", () => {
  it("returns the case context for the assigned collector", async () => {
    const log: QueryState[] = [];
    const supabase = fakeClient(() => ({ data: masterlistRow, error: null }), log);

    const ctx = await assertCollectorAssignment(supabase, "user-1", "ml-1");

    assert.deepEqual(ctx, collectorCtx);
    assert.equal(log[0]?.table, "masterlist");
    assert.match(log[0]?.columns ?? "", /assignments!inner/);
    assert.equal(filterValue(log[0]!, "id"), "ml-1");
    assert.equal(
      filterValue(log[0]!, "assignments.collector_user_id"),
      "user-1",
    );
    assert.equal(filterValue(log[0]!, "assignments.remedial_user_id"), null);
    assert.equal(filterValue(log[0]!, "remedial_flag"), false);
    assert.equal(filterValue(log[0]!, "account_status"), "active");
    assert.match(
      moduleSource,
      /import \{ COLLECTOR_QUEUE_ACCOUNT_STATUS \} from "@\/lib\/collector\/queue";/,
    );
  });

  it("fails closed with 403 when the collector is not assigned", async () => {
    const supabase = fakeClient(() => ({ data: null, error: null }));
    await assert.rejects(
      () => assertCollectorAssignment(supabase, "user-2", "ml-1"),
      hasErrorName("ForbiddenError", /Account not found/),
    );
  });

  it("fails closed with 403 when the account is remitted or not active", async () => {
    // Desk filters exclude remedial / paid / turnover rows at SQL time, so the
    // query returns null — same opaque 403 as an unassigned account.
    const supabase = fakeClient(() => ({ data: null, error: null }));
    await assert.rejects(
      () => assertCollectorAssignment(supabase, "user-1", "ml-remedial"),
      hasErrorName("ForbiddenError", /Account not found/),
    );
  });

  it("returns 404 when assigned but loan_application_id is null", async () => {
    const supabase = fakeClient(() => ({
      data: { ...masterlistRow, loan_application_id: null },
      error: null,
    }));
    await assert.rejects(
      () => assertCollectorAssignment(supabase, "user-1", "ml-1"),
      hasErrorName(
        "NotFoundError",
        /Origination packet unavailable for this account/,
      ),
    );
  });

  it("surfaces database errors", async () => {
    const supabase = fakeClient(() => ({
      data: null,
      error: { message: "boom" },
    }));
    await assert.rejects(
      () => assertCollectorAssignment(supabase, "user-1", "ml-1"),
      /boom/,
    );
  });
});

describe("assertRemedialAssignment", () => {
  it("requires the remedial assignee and the remedial flag", async () => {
    const log: QueryState[] = [];
    const supabase = fakeClient(
      () => ({ data: { ...masterlistRow, remedial_flag: true }, error: null }),
      log,
    );

    const ctx = await assertRemedialAssignment(supabase, "user-9", "ml-1");

    assert.deepEqual(ctx, collectorCtx);
    assert.equal(filterValue(log[0]!, "remedial_flag"), true);
    assert.equal(filterValue(log[0]!, "assignments.remedial_user_id"), "user-9");
  });

  it("fails closed with 403 when the remedial user is not assigned", async () => {
    const supabase = fakeClient(() => ({ data: null, error: null }));
    await assert.rejects(
      () => assertRemedialAssignment(supabase, "user-2", "ml-1"),
      hasErrorName("ForbiddenError", /Account not found/),
    );
  });

  it("returns 404 when assigned but loan_application_id is null", async () => {
    const supabase = fakeClient(() => ({
      data: {
        ...masterlistRow,
        remedial_flag: true,
        loan_application_id: null,
      },
      error: null,
    }));
    await assert.rejects(
      () => assertRemedialAssignment(supabase, "user-9", "ml-1"),
      hasErrorName(
        "NotFoundError",
        /Origination packet unavailable for this account/,
      ),
    );
  });
});

function packetClient(
  overrides: {
    application?: Record<string, unknown> | null;
    verification?: PacketVerificationRow | null;
  } = {},
  log: QueryState[] = [],
) {
  const application =
    overrides.application === undefined
      ? {
          id: "app-1",
          application_no: "APP-0001",
          status: "for_approval",
          segment: "seafarer",
          entity_type: "individual",
          is_reloan: false,
          blocker: null,
          privacy_orientation_at: "2026-01-02T00:00:00Z",
          privacy_orientation_by: "csa-1",
          initial_interview_at: "2026-01-03T00:00:00Z",
          initial_interview_notes: "Interviewed",
          initial_interview_by: "csa-1",
          endorsed_at: "2026-01-04T00:00:00Z",
          endorsed_by: "csa-2",
          status_history: [{ status: "for_approval", at: "2026-01-04T00:00:00Z" }],
        }
      : overrides.application;

  return fakeClient((state) => {
    switch (state.table) {
      case "loan_applications":
        return { data: application, error: null };
      case "borrowers":
        return {
          data: {
            id: "borrower-1",
            user_id: null,
            borrower_no: "BOR-0001",
            email: "juan@example.com",
            first_name: "Juan",
            middle_name: null,
            last_name: "Dela Cruz",
            suffix: null,
            date_of_birth: null,
            place_of_birth: null,
            citizenship: null,
            civil_status: null,
            gender: null,
            mobile_phone: null,
            landline: null,
            present_address: {},
            permanent_address: {},
            manning_agency: {},
            financial: {},
            allottee: {},
            pic_work: {},
            business_info: {},
            dependents: [],
            references_data: [],
            profile_data: {},
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
          error: null,
        };
      case "verifications":
        return {
          data:
            overrides.verification === undefined
              ? verificationRow
              : overrides.verification,
          error: null,
        };
      case "profiles":
        return {
          data: [
            { id: "csa-1", full_name: "CSA One", email: "one@example.com" },
            { id: "csa-2", full_name: null, email: "two@example.com" },
          ],
          error: null,
        };
      case "check_types":
        return { data: { id: "check-1", name: "NCL" }, error: null };
      case "checks_recorded":
        return {
          data: {
            result: "pass",
            notes: "clean",
            checked_at: "2026-01-03T00:00:00Z",
          },
          error: null,
        };
      default:
        return { data: null, error: null };
    }
  }, log);
}

describe("loadOriginationPacket", () => {
  it("returns evidence slices only — no votes, tally, or negotiation", async () => {
    const packet = await loadOriginationPacket(packetClient(), collectorCtx);

    assert.deepEqual(Object.keys(packet).sort(), [
      "application",
      "borrower",
      "csaScreening",
      "csaSummary",
      "masterlistId",
      "verification",
    ]);
  });

  it("maps application, CSA summary actor names, and screening", async () => {
    const packet = await loadOriginationPacket(packetClient(), collectorCtx);

    assert.equal(packet.masterlistId, "ml-1");
    assert.equal(packet.application.applicationNo, "APP-0001");
    assert.equal(packet.application.statusLabel, "For Approval");
    assert.equal(packet.application.segment, "seafarer");
    assert.equal(packet.application.entityType, "individual");
    assert.equal(packet.application.isReloan, false);
    assert.equal(packet.borrower.name, "Juan Dela Cruz");
    assert.equal(packet.borrower.profile?.email, "juan@example.com");
    assert.equal(packet.csaSummary.privacyOrientationByName, "CSA One");
    assert.equal(packet.csaSummary.endorsedByName, "two@example.com");
    assert.deepEqual(packet.csaSummary.timeline, [
      {
        status: "for_approval",
        at: "2026-01-04T00:00:00Z",
        label: "For Approval",
      },
    ]);
    assert.equal(packet.csaScreening.slug, "ncl");
    assert.equal(packet.csaScreening.result, "pass");
    assert.equal(packet.verification?.finding, "positive");
  });

  it("loads the full borrower profile only for the assigned account borrower", async () => {
    const log: QueryState[] = [];
    const packet = await loadOriginationPacket(packetClient({}, log), collectorCtx);

    assert.equal(packet.borrower.profile?.id, "borrower-1");
    const borrowerRead = log.find((state) => state.table === "borrowers");
    assert.ok(borrowerRead);
    assert.equal(filterValue(borrowerRead, "id"), "borrower-1");
  });

  it("returns a null verification when no CIG report exists", async () => {
    const packet = await loadOriginationPacket(
      packetClient({ verification: null }),
      collectorCtx,
    );
    assert.equal(packet.verification, null);
  });

  it("scopes every read to the assigned application", async () => {
    const log: QueryState[] = [];
    await loadOriginationPacket(packetClient({}, log), collectorCtx);

    for (const state of log) {
      if (state.table === "loan_applications") {
        assert.equal(filterValue(state, "id"), "app-1");
      }
      if (state.table === "verifications" || state.table === "checks_recorded") {
        assert.equal(filterValue(state, "loan_application_id"), "app-1");
      }
    }
  });

  it("throws 404 when the application row is missing", async () => {
    await assert.rejects(
      () =>
        loadOriginationPacket(
          packetClient({ application: null }),
          collectorCtx,
        ),
      hasErrorName("NotFoundError", /Application not found/),
    );
  });
});

describe("OriginationPacketPanel full read-only forms", () => {
  it("renders application and full CI form launchers", () => {
    assert.match(packetPanelSource, /View application form/);
    assert.match(packetPanelSource, /View full CI &amp; References Form/);
    assert.match(packetPanelSource, /<ApplicantProfileFields/);
    assert.match(packetPanelSource, /<CiReferencesFormModal/);
    assert.match(packetPanelSource, /readOnly/);
  });
});

describe("loadIntakeChecklistForApplication", () => {
  it("loads the intake stage checklist with its completion summary", async () => {
    const log: QueryState[] = [];
    const admin = fakeClient((state) => {
      switch (state.table) {
        case "loan_applications":
          return {
            data: { segment: "seafarer", entity_type: null },
            error: null,
          };
        case "stage_checklists":
          return {
            data: [
              {
                id: "sc-1",
                stage: "intake",
                is_required: true,
                is_optional_flag: false,
                sort_order: 1,
                entity_type: null,
                document_types: { id: "dt-1", slug: "passport", name: "Passport" },
              },
            ],
            error: null,
          };
        case "documents":
          return {
            data: [
              {
                id: "doc-1",
                document_type_id: "dt-1",
                stage: "intake",
                status: "confirmed",
                file_name: "passport.pdf",
                mime_type: "application/pdf",
                file_size: 10,
                uploaded_by: null,
                confirmed_by: null,
                confirmed_at: null,
                revision_remarks: null,
              },
            ],
            error: null,
          };
        default:
          return { data: null, error: null };
      }
    }, log);

    const checklist = await loadIntakeChecklistForApplication(admin, "app-1");

    assert.equal(checklist.stage, "intake");
    assert.equal(checklist.items.length, 1);
    assert.equal(checklist.items[0]?.documentTypeSlug, "passport");
    assert.equal(checklist.summary.percentComplete, 100);
    assert.equal(
      filterValue(
        log.find((state) => state.table === "documents")!,
        "loan_application_id",
      ),
      "app-1",
    );
    assert.equal(
      filterValue(
        log.find((state) => state.table === "stage_checklists")!,
        "stage",
      ),
      "intake",
    );
  });
});

function documentClient(document: Record<string, unknown> | null) {
  return fakeClient(() => ({ data: document, error: null }));
}

describe("authorizeCaseFileDocumentDownload", () => {
  it("returns the storage descriptor for a document on the assigned application", async () => {
    const admin = documentClient({
      id: "doc-1",
      loan_application_id: "app-1",
      storage_path: "loan-documents/app-1/passport.pdf",
      file_name: "passport.pdf",
      mime_type: "application/pdf",
      status: "confirmed",
    });

    const result = await authorizeCaseFileDocumentDownload(
      admin,
      "app-1",
      "doc-1",
    );

    assert.deepEqual(result, {
      documentId: "doc-1",
      storagePath: "loan-documents/app-1/passport.pdf",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
    });
  });

  it("rejects a document belonging to another application", async () => {
    const admin = documentClient({
      id: "doc-2",
      loan_application_id: "app-999",
      storage_path: "loan-documents/app-999/passport.pdf",
      file_name: "passport.pdf",
      mime_type: "application/pdf",
      status: "confirmed",
    });

    await assert.rejects(
      () => authorizeCaseFileDocumentDownload(admin, "app-1", "doc-2"),
      hasErrorName("ForbiddenError", /Document not found/),
    );
  });

  it("rejects a missing document", async () => {
    await assert.rejects(
      () => authorizeCaseFileDocumentDownload(documentClient(null), "app-1", "x"),
      hasErrorName("ForbiddenError", /Document not found/),
    );
  });

  it("rejects a slot that has no uploaded file", async () => {
    const admin = documentClient({
      id: "doc-3",
      loan_application_id: "app-1",
      storage_path: null,
      file_name: null,
      mime_type: null,
      status: "pending",
    });

    await assert.rejects(
      () => authorizeCaseFileDocumentDownload(admin, "app-1", "doc-3"),
      hasErrorName("ForbiddenError", /has not been uploaded/),
    );
  });
});
