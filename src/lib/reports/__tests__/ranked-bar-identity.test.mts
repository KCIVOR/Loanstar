import assert from "node:assert/strict";
import test from "node:test";

import { Bar } from "recharts";
import { RankedBarMini } from "../../../components/dashboard/charts";
import { rankedBarCellKey } from "../../../components/dashboard/charts/row-identity";

test("two loans with the same borrower name retain distinct chart identities", () => {
  const loans = [
    { id: "loan-a", name: "Luz Torres" },
    { id: "loan-b", name: "Luz Torres" },
  ];
  assert.deepEqual(
    loans.map((loan, index) => rankedBarCellKey(loan, "name", index, "id")),
    ["loan-a", "loan-b"],
  );
  assert.equal(rankedBarCellKey(loans[1], "name", 0, "id"), "loan-b");
});

test("category charts do not reuse keys when labels repeat", () => {
  const rows = [{ label: "Other" }, { label: "Other" }];
  const keys = rows.map((row, index) => rankedBarCellKey(row, "label", index));
  assert.equal(new Set(keys).size, rows.length);
});

test("ranked chart assigns each same-name loan a distinct React cell key", () => {
  const tree = RankedBarMini({
    data: [
      { id: "loan-a", name: "Luz Torres", outstanding: 776540 },
      { id: "loan-b", name: "Luz Torres", outstanding: 513872.46 },
    ],
    yKey: "name",
    valueKey: "outstanding",
    rowIdKey: "id",
  });
  const chart = tree.props.children;
  const bar = chart.props.children.find((child: { type: unknown }) => child?.type === Bar);
  assert.deepEqual(bar.props.children.map((cell: { key: string }) => cell.key), ["loan-a", "loan-b"]);
});
