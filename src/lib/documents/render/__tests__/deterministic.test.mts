import test from "node:test";
import assert from "node:assert/strict";

import { makeDeterministic } from "../deterministic";

// Pure unit tests for the shared PDF-byte normaliser. No renderer needed — these
// always run and guard the length-preserving contract (xref offsets stay valid).

test("zeros the trailer /ID, keeping both hex strings' length", () => {
  const src = Buffer.from(
    "trailer\n<< /Size 10 /ID [<0123456789ABCDEF><FEDCBA9876543210>] >>\n",
    "latin1",
  );
  const out = makeDeterministic(src).toString("latin1");
  assert.match(out, /\/ID \[<0{16}><0{16}>\]/);
  assert.equal(out.length, src.length, "length preserved");
});

test("pins every D:YYYYMMDDHHMMSS date to a constant", () => {
  const src = Buffer.from(
    "/CreationDate (D:20260910123456+08'00') /ModDate (D:20260910123457Z)",
    "latin1",
  );
  const out = makeDeterministic(src).toString("latin1");
  assert.equal(
    out,
    "/CreationDate (D:20000101000000+08'00') /ModDate (D:20000101000000Z)",
  );
  assert.equal(out.length, src.length);
});

test("normalises a long Chromium /Producer in place (truncates to fit)", () => {
  const producer = "Skia/PDF m126 Google Docs Renderer";
  const src = Buffer.from(`<< /Producer (${producer}) >>`, "latin1");
  const out = makeDeterministic(src).toString("latin1");
  const m = out.match(/\/Producer \(([^)]*)\)/);
  assert.ok(m);
  assert.equal(m![1].length, producer.length, "value length preserved");
  assert.equal(out.length, src.length, "total length preserved");
  assert.ok(m![1].startsWith("Loanstar"));
});

test("normalises a short /Creator in place (pads with spaces to fit)", () => {
  const creator = "Chromium";
  const src = Buffer.from(`<< /Creator (${creator}) >>`, "latin1");
  const out = makeDeterministic(src).toString("latin1");
  const m = out.match(/\/Creator \(([^)]*)\)/);
  assert.ok(m);
  assert.equal(m![1].length, creator.length);
  assert.equal(m![1].trimEnd(), "Loanstar");
  assert.equal(out.length, src.length);
});

test("pdfmake-shaped output (no Producer/Creator strings) is only ID+date normalised", () => {
  const src = Buffer.from(
    "%PDF-1.3\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</ID [<AAAA><BBBB>]>>\n",
    "latin1",
  );
  const out = makeDeterministic(src).toString("latin1");
  assert.match(out, /\/ID \[<0000><0000>\]/);
  assert.ok(!out.includes("Loanstar"), "no Producer/Creator to touch");
  assert.equal(out.length, src.length);
});

test("is idempotent", () => {
  const src = Buffer.from(
    "/ID [<1234><5678>] /CreationDate (D:20260101010101) /Producer (Skia/PDF m1)",
    "latin1",
  );
  const once = makeDeterministic(src);
  const twice = makeDeterministic(once);
  assert.equal(once.toString("latin1"), twice.toString("latin1"));
});
