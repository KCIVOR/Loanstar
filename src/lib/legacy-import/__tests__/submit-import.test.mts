import assert from "node:assert/strict";
import test from "node:test";
import { submitImport } from "../submit-import";

const input = { file_name: "test.xlsx", segment: "seafarer" as const, mapping: [],
  rows: Array.from({ length: 26 }, (_, i) => ({ rowNumber: i + 2, cells: [] })), installments: [] };
test("submits batches of 25 and returns all account outcomes", async () => {
  const sizes: number[] = [];
  const result = await submitImport(input, async (_url, options) => {
    const payload = JSON.parse(String(options?.body)); sizes.push(payload.rows.length);
    return Response.json({ outcomes: payload.rows.map((r: { rowNumber: number }) => ({ rowNumber: r.rowNumber, loanNo: String(r.rowNumber), status: "imported", message: "Saved", masterlistId: "test-id" })) });
  });
  assert.deepEqual(sizes, [25, 1]); assert.equal(result.outcomes.length, 26); assert.equal(result.error, null);
});
test("stops on an uncertain request, preserving earlier successful outcomes", async () => {
  let calls = 0;
  const result = await submitImport(input, async () => {
    if (++calls === 2) throw new Error("Network lost");
    return Response.json({ outcomes: input.rows.slice(0, 25).map((r) => ({ rowNumber: r.rowNumber, loanNo: String(r.rowNumber), status: "imported", message: "Saved", masterlistId: "test-id" })) });
  });
  assert.equal(calls, 2); assert.equal(result.outcomes.length, 25); assert.match(result.error!, /Masterfile/i);
});
test("treats missing account acknowledgements as uncertain instead of successful", async () => {
  const result = await submitImport(input, async () => Response.json({ outcomes: [] }));
  assert.match(result.error!, /Masterfile/i);
});
test("surfaces server validation failures and does not submit later batches", async () => {
  let calls = 0;
  const result = await submitImport(input, async () => { calls++; return Response.json({ error: "Balance mismatch" }, { status: 400 }); });
  assert.equal(calls, 1); assert.match(result.error!, /Balance mismatch/);
});
