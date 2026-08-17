"use client";

import { Fragment, useState } from "react";

import { Badge, Table, Td, Th } from "@/components/ui";
import type { AccountLedgerRow } from "@/lib/ledger/build-account-ledger-rows";
import {
  formatLedgerDateCell,
  formatLedgerMoneyCell,
  formatLedgerTextCell,
} from "@/lib/ledger/format";

type AccountLedgerProps = {
  rows: AccountLedgerRow[];
  className?: string;
  caption?: string;
};

function moneyCell(value: number | null) {
  if (value == null) return "—";
  return formatLedgerMoneyCell(value);
}

function statusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "navy" {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  if (status === "overdue") return "danger";
  if (status === "pending") return "navy";
  return "neutral";
}

/** Consecutive "payment" rows sharing the same installment collapse into one
 * group when there's more than one — e.g. an installment paid in two
 * partials. Everything else (single payments, installment placeholders,
 * opening/totals) renders exactly as before. */
type DisplayItem =
  | { type: "row"; row: AccountLedgerRow }
  | { type: "group"; scheduleId: string; rows: AccountLedgerRow[] };

function groupRows(rows: AccountLedgerRow[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    if (row.kind === "payment" && row.scheduleId) {
      const group: AccountLedgerRow[] = [row];
      let j = i + 1;
      while (
        j < rows.length &&
        rows[j]!.kind === "payment" &&
        rows[j]!.scheduleId === row.scheduleId
      ) {
        group.push(rows[j]!);
        j += 1;
      }
      items.push(
        group.length > 1
          ? { type: "group", scheduleId: row.scheduleId, rows: group }
          : { type: "row", row },
      );
      i = j;
    } else {
      items.push({ type: "row", row });
      i += 1;
    }
  }
  return items;
}

export function AccountLedger({
  rows,
  className = "",
  caption,
}: AccountLedgerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(scheduleId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
  }

  const items = groupRows(rows);

  return (
    <div className={className}>
      {caption ? (
        <p className="mb-3 text-sm text-ink-500">{caption}</p>
      ) : null}
      <Table className="is-compact min-w-[1060px]">
        <thead>
          <tr>
            <Th>Check No.</Th>
            <Th>Due Date</Th>
            <Th num>Target</Th>
            <Th num>Penalty</Th>
            <Th>Date</Th>
            <Th>Reference No.</Th>
            <Th num>Debit</Th>
            <Th num>Credit</Th>
            <Th num>Balance</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            if (item.type === "row") {
              const row = item.row;
              const isTotals = row.kind === "totals";
              return (
                <tr key={row.key} className={isTotals ? "tfoot-row" : undefined}>
                  <Td className="mono">
                    {isTotals
                      ? "Report Total"
                      : formatLedgerTextCell(row.checkNo)}
                  </Td>
                  <Td className="mono">{formatLedgerDateCell(row.dueDate)}</Td>
                  <Td num className="mono">
                    {moneyCell(row.target)}
                  </Td>
                  <Td num className="mono">
                    {moneyCell(row.penalty)}
                  </Td>
                  <Td className="mono">{formatLedgerDateCell(row.date)}</Td>
                  <Td className="mono">
                    {isTotals ? "—" : formatLedgerTextCell(row.referenceNo)}
                  </Td>
                  <Td num className="mono">
                    {moneyCell(row.debit)}
                  </Td>
                  <Td num className="mono text-teal-600">
                    {moneyCell(row.credit)}
                  </Td>
                  <Td num className="mono">
                    {moneyCell(row.balance)}
                  </Td>
                  <Td>
                    {row.status ? (
                      <Badge variant={statusVariant(row.status)} dot>
                        {row.status}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              );
            }

            const isOpen = expanded.has(item.scheduleId);
            const first = item.rows[0]!;
            const last = item.rows[item.rows.length - 1]!;
            const totalCredit = item.rows.reduce(
              (sum, r) => sum + (r.credit ?? 0),
              0,
            );

            return (
              <Fragment key={`group:${item.scheduleId}`}>
                <tr
                  className="cursor-pointer hover:bg-surface-2/60"
                  onClick={() => toggle(item.scheduleId)}
                  aria-expanded={isOpen}
                >
                  <Td className="mono">{formatLedgerTextCell(first.checkNo)}</Td>
                  <Td className="mono">{formatLedgerDateCell(first.dueDate)}</Td>
                  <Td num className="mono">
                    {moneyCell(first.target)}
                  </Td>
                  <Td num className="mono">
                    {moneyCell(first.penalty)}
                  </Td>
                  <Td className="mono">
                    <span className="inline-flex items-center gap-1.5 text-teal-600">
                      <span aria-hidden>{isOpen ? "▾" : "▸"}</span>
                      {item.rows.length} payments
                    </span>
                  </Td>
                  <Td className="mono">—</Td>
                  <Td num className="mono">
                    —
                  </Td>
                  <Td num className="mono text-teal-600">
                    {moneyCell(totalCredit)}
                  </Td>
                  <Td num className="mono">
                    {moneyCell(last.balance)}
                  </Td>
                  <Td>
                    {last.status ? (
                      <Badge variant={statusVariant(last.status)} dot>
                        {last.status}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
                {isOpen
                  ? item.rows.map((r) => (
                      <tr key={r.key} className="bg-surface-2/50">
                        <Td className="mono text-ink-400">{""}</Td>
                        <Td className="mono text-ink-400">{""}</Td>
                        <Td num className="mono text-ink-400">
                          —
                        </Td>
                        <Td num className="mono text-ink-400">
                          —
                        </Td>
                        <Td className="mono pl-6 text-ink-600">
                          {formatLedgerDateCell(r.date)}
                        </Td>
                        <Td className="mono text-ink-600">
                          {formatLedgerTextCell(r.referenceNo)}
                        </Td>
                        <Td num className="mono text-ink-400">
                          —
                        </Td>
                        <Td num className="mono text-teal-600">
                          {moneyCell(r.credit)}
                        </Td>
                        <Td num className="mono">
                          {moneyCell(r.balance)}
                        </Td>
                        <Td>—</Td>
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
