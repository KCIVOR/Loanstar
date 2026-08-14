import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPLOYMENT_CONTRACT_BLOCKER,
  EMPLOYMENT_CONTRACT_MISSING_ERROR,
  assertEmploymentContractForRelease,
  assertLraIntakeUploadAllowed,
  hasEmploymentContractUploaded,
  isEmploymentContractStatus,
  releaseBlockerForReadyRelease,
} from "../employment-contract";

type HasContractStubOpts = {
  segment: string | null;
  docTypeId?: string | null;
  documentStatus?: string | null;
};

function makeHasContractStub(opts: HasContractStubOpts) {
  const queriedTables: string[] = [];

  const appsChain = {
    select: () => appsChain,
    eq: () => appsChain,
    maybeSingle: async () => ({
      data: { segment: opts.segment },
      error: null,
    }),
  };

  const docTypesChain = {
    select: () => docTypesChain,
    eq: () => docTypesChain,
    maybeSingle: async () => ({
      data: opts.docTypeId ? { id: opts.docTypeId } : null,
      error: null,
    }),
  };

  const documentsChain = {
    select: () => documentsChain,
    eq: () => documentsChain,
    in: () => documentsChain,
    limit: () => documentsChain,
    maybeSingle: async () => ({
      data: opts.documentStatus ? { status: opts.documentStatus } : null,
      error: null,
    }),
  };

  const supabase = {
    from(table: string) {
      queriedTables.push(table);
      if (table === "loan_applications") return appsChain;
      if (table === "document_types") return docTypesChain;
      if (table === "documents") return documentsChain;
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    supabase: supabase as never,
    getQueriedTables: () => queriedTables,
  };
}

describe("employment contract before release (Phase 10)", () => {
  it("treats uploaded and confirmed as present", () => {
    assert.equal(isEmploymentContractStatus("uploaded"), true);
    assert.equal(isEmploymentContractStatus("confirmed"), true);
    assert.equal(isEmploymentContractStatus("pending"), false);
    assert.equal(isEmploymentContractStatus(null), false);
  });

  it("blocks release when contract is missing", () => {
    assert.throws(
      () => assertEmploymentContractForRelease(false),
      new RegExp(EMPLOYMENT_CONTRACT_MISSING_ERROR),
    );
  });

  it("allows release when contract is present", () => {
    assert.doesNotThrow(() => assertEmploymentContractForRelease(true));
  });

  it("sets Pending: employment contract blocker when missing at ready_release", () => {
    assert.equal(
      releaseBlockerForReadyRelease(["with_pdc"], false),
      EMPLOYMENT_CONTRACT_BLOCKER,
    );
    assert.equal(
      releaseBlockerForReadyRelease(["without_pdc"], false),
      EMPLOYMENT_CONTRACT_BLOCKER,
    );
  });

  it("keeps path-specific ready_release blocker when contract is present", () => {
    assert.equal(
      releaseBlockerForReadyRelease(["with_pdc"], true),
      "Documents signed, awaiting check release",
    );
    assert.equal(
      releaseBlockerForReadyRelease(["without_pdc"], true),
      "Documents signed, awaiting cash release",
    );
    assert.equal(
      releaseBlockerForReadyRelease(["with_pdc", "without_pdc"], true),
      "Documents signed, awaiting check and cash release",
    );
  });

  it("allows LRA intake upload only for contract slug", () => {
    assert.doesNotThrow(() =>
      assertLraIntakeUploadAllowed("intake", "contract"),
    );
    assert.throws(
      () => assertLraIntakeUploadAllowed("intake", "passport"),
      /LRA may only upload the employment contract/,
    );
    assert.doesNotThrow(() =>
      assertLraIntakeUploadAllowed("release", "signed_check_voucher"),
    );
  });
});

describe("hasEmploymentContractUploaded", () => {
  it("returns true for SME without querying document_types or documents", async () => {
    const stub = makeHasContractStub({ segment: "sme" });

    const result = await hasEmploymentContractUploaded(
      stub.supabase,
      "app-sme-1",
    );

    assert.equal(result, true);
    assert.deepEqual(stub.getQueriedTables(), ["loan_applications"]);
  });

  it("returns false for seafarer with no matching documents row", async () => {
    const stub = makeHasContractStub({
      segment: "seafarer",
      docTypeId: "dt-contract",
      documentStatus: null,
    });

    const result = await hasEmploymentContractUploaded(
      stub.supabase,
      "app-seafarer-1",
    );

    assert.equal(result, false);
    assert.deepEqual(stub.getQueriedTables(), [
      "loan_applications",
      "document_types",
      "documents",
    ]);
  });

  it("returns true for seafarer with intake uploaded contract", async () => {
    const stub = makeHasContractStub({
      segment: "seafarer",
      docTypeId: "dt-contract",
      documentStatus: "uploaded",
    });

    const result = await hasEmploymentContractUploaded(
      stub.supabase,
      "app-seafarer-2",
    );

    assert.equal(result, true);
  });

  it("returns true for seafarer with intake confirmed contract", async () => {
    const stub = makeHasContractStub({
      segment: "seafarer",
      docTypeId: "dt-contract",
      documentStatus: "confirmed",
    });

    const result = await hasEmploymentContractUploaded(
      stub.supabase,
      "app-seafarer-3",
    );

    assert.equal(result, true);
  });

  it("returns false for seafarer when document has wrong stage or status", async () => {
    for (const documentStatus of ["pending", null] as const) {
      const stub = makeHasContractStub({
        segment: "seafarer",
        docTypeId: "dt-contract",
        documentStatus,
      });

      const result = await hasEmploymentContractUploaded(
        stub.supabase,
        "app-seafarer-4",
      );

      assert.equal(result, false);
    }
  });
});
