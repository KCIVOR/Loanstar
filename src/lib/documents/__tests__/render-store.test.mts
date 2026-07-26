import test from "node:test";
import assert from "node:assert/strict";

import {
  renderAndStore,
  type RenderAndStoreParams,
} from "../render-store";

// ---------------------------------------------------------------------------
// Minimal chainable Supabase stub. Each `.from(table)` returns a builder whose
// filter methods are no-ops that return `this`; terminal methods resolve to a
// canned result keyed by table name. Storage uploads + rendered_documents
// inserts are captured for assertions. This lets the test exercise the REAL
// template render + hash while mocking only I/O.
// ---------------------------------------------------------------------------
type Captured = {
  uploads: Array<{ path: string; body: Uint8Array; contentType: string }>;
  inserted: Record<string, unknown> | null;
  deletes: number;
};

function makeStub(opts: {
  borrowerId: string | null;
  publishedBody: string | null;
  publishedVersionId?: string;
}) {
  const captured: Captured = { uploads: [], inserted: null, deletes: 0 };

  function builder(table: string, op: "select" | "insert" | "delete", payload?: unknown) {
    const chain: Record<string, unknown> = {};
    const methods = ["select", "eq", "is", "order", "maybeSingle", "single"];
    for (const m of methods) {
      chain[m] = (..._args: unknown[]) => {
        if (m === "maybeSingle" || m === "single") {
          return Promise.resolve(resolveTerminal(table, op));
        }
        return chain;
      };
    }
    if (op === "delete") {
      // delete().eq().eq().is().eq() — resolve when awaited
      (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => {
        captured.deletes += 1;
        resolve({ error: null });
      };
    }
    if (op === "insert") {
      captured.inserted = payload as Record<string, unknown>;
    }
    return chain;
  }

  function resolveTerminal(table: string, op: string) {
    if (table === "loan_applications") {
      return opts.borrowerId
        ? { data: { borrower_id: opts.borrowerId }, error: null }
        : { data: null, error: null };
    }
    if (table === "document_templates") {
      return opts.publishedBody !== null
        ? { data: { id: "tmpl-1", is_active: true }, error: null }
        : { data: null, error: null };
    }
    if (table === "document_template_versions") {
      return opts.publishedBody !== null
        ? {
            data: {
              id: opts.publishedVersionId ?? "ver-1",
              body: opts.publishedBody,
            },
            error: null,
          }
        : { data: null, error: null };
    }
    if (table === "rendered_documents" && op === "insert") {
      return { data: { id: "rendered-1" }, error: null };
    }
    return { data: null, error: null };
  }

  const supabase = {
    from(table: string) {
      return {
        select: (..._a: unknown[]) => builder(table, "select"),
        insert: (payload: unknown) => builder(table, "insert", payload),
        delete: () => builder(table, "delete"),
      };
    },
    storage: {
      from(_bucket: string) {
        return {
          upload: (path: string, body: Uint8Array, o: { contentType: string }) => {
            captured.uploads.push({ path, body, contentType: o.contentType });
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };

  return { supabase, captured };
}

const BASE_PARAMS: RenderAndStoreParams = {
  slug: "demand_letter",
  module: "collection",
  applicationId: "app-123",
  context: { borrowerName: "Juan Dela Cruz", amount: "10,000.00" },
};

test("renders a published template and records a rendered_documents row", async () => {
  const { supabase, captured } = makeStub({
    borrowerId: "borrower-9",
    publishedBody: "<h1>DEMAND</h1><p>{{borrowerName}} owes {{amount}}</p>",
    publishedVersionId: "ver-42",
  });

  const result = await renderAndStore(
    // deno-lint-ignore no-explicit-any
    supabase as never,
    { ...BASE_PARAMS, actorId: "staff-1" },
  );

  // A real PDF was produced and uploaded.
  assert.equal(captured.uploads.length, 1);
  const upload = captured.uploads[0]!;
  assert.equal(Buffer.from(upload.body.subarray(0, 5)).toString("latin1"), "%PDF-");
  assert.equal(upload.contentType, "application/pdf");
  assert.match(upload.path, /^borrower-9\/rendered\/app-123\/demand_letter-/);

  // The audit row pins the template version + owning module.
  assert.ok(captured.inserted);
  assert.equal(captured.inserted!.template_version_id, "ver-42");
  assert.equal(captured.inserted!.module, "collection");
  assert.equal(captured.inserted!.loan_application_id, "app-123");
  assert.equal(captured.inserted!.document_slug, "demand_letter");
  assert.equal(captured.inserted!.generated_by, "staff-1");
  assert.equal(captured.inserted!.storage_path, upload.path);
  assert.equal(captured.inserted!.content_hash, result.contentHash);

  assert.equal(result.documentId, "rendered-1");
  assert.equal(result.templateVersionId, "ver-42");
});

test("throws a clear error when no published template exists (no legacy fallback)", async () => {
  const { supabase } = makeStub({ borrowerId: "borrower-9", publishedBody: null });
  await assert.rejects(
    renderAndStore(supabase as never, BASE_PARAMS),
    /No published template for document slug "demand_letter"/,
  );
});

test("throws when the application borrower is missing", async () => {
  const { supabase } = makeStub({ borrowerId: null, publishedBody: "<p>x</p>" });
  await assert.rejects(
    renderAndStore(supabase as never, BASE_PARAMS),
    /Application borrower not found/,
  );
});

test("replaceUnsigned deletes prior unsigned rows before inserting", async () => {
  const { supabase, captured } = makeStub({
    borrowerId: "borrower-9",
    publishedBody: "<p>{{amount}}</p>",
  });

  await renderAndStore(supabase as never, {
    ...BASE_PARAMS,
    replaceUnsigned: true,
  });

  assert.equal(captured.deletes, 1);
  assert.ok(captured.inserted);
});

test("append mode (default) does not delete prior rows", async () => {
  const { supabase, captured } = makeStub({
    borrowerId: "borrower-9",
    publishedBody: "<p>{{amount}}</p>",
  });

  await renderAndStore(supabase as never, BASE_PARAMS);

  assert.equal(captured.deletes, 0);
});
