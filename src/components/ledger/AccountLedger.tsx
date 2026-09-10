"use client";

import { Fragment, useState } from "react";

import { Badge, Table, Td, Th, cn } from "@/components/ui";
import type { AccountLedgerRow } from "@/lib/ledger/build-account-ledger-rows";
import {
  formatLedgerDateCell,
  formatLedgerMoneyCell,
  formatLedgerTextCell,
} from "@/lib/ledger/format";

/** Lets a caller (e.g. Collector's Move of Payment) turn eligible
 * "installment" rows into a radio-selectable list, with a Surcharge column
 * appended — instead of duplicating the ledger as a separate picker table.
 * Ignored entirely when omitted, so every other AccountLedger consumer
 * renders exactly as before. */
type LedgerSelection = {
  /** Due dates (installment rows) that can be picked. */
  eligibleDueDates: Set<string>;
  selectedDueDate: string | null;
  surchargeByDueDate: Map<string, number>;
  onSelect: (dueDate: string) => void;
};

type AccountLedgerProps = {
  rows: AccountLedgerRow[];
  className?: string;
  caption?: string;
  selection?: LedgerSelection;
};

function moneyCell(value: number | null) {
  if (value == null) return "—";
  return formatLedgerMoneyCell(value);
}

/** Target cell with the Penalty-breakdown Phase 5b "carried from #N" note — how
 * much of THIS installment's Target was folded in by a 30-day rollover of an
 * earlier missed installment (the carried-in fee sits in the Penalty column and
 * is not repeated here). Lets the reader see what makes up an otherwise
 * unexplained lump (Rule 10). */
function targetCell(row: AccountLedgerRow) {
  const carriedIntoTarget = row.carriedInterest ?? 0;
  return (
    <>
      {moneyCell(row.target)}
      {carriedIntoTarget > 0 && row.carriedFrom != null ? (
        <span className="block text-[11px] font-normal text-ink-400">
          incl. {formatLedgerMoneyCell(carriedIntoTarget)} carried from #
          {row.carriedFrom}
        </span>
      ) : null}
    </>
  );
}

/** Same as moneyCell, but labels a Collector-sourced discount distinctly
 * from an Origination/Offset one (feature-collector-discount-implementation-plan.md,
 * Phase 6) — the ledger's one gap where all three used to render
 * identically. Existing rendering for null/'origination'/'offset' is
 * unchanged. */
function discountCell(value: number | null, source: string | null) {
  if (value == null) return "—";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{formatLedgerMoneyCell(value)}</span>
      {source === "collector" ? (
        <Badge variant="navy" className="shrink-0">
          Collector
        </Badge>
      ) : null}
    </span>
  );
}

function statusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "navy" {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  if (status === "overdue") return "danger";
  if (status === "pending") return "navy";
  // Move of Payment (see
  // docs/revision-plans/feature-move-of-payment-implementation-plan.md).
  if (status === "moved") return "warning";
  // Fixes Plan Phase 4 — a collected Move of Payment surcharge line.
  if (status === "surcharge") return "navy";
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
  selection,
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
    <div className={cn("min-w-0 max-w-full", className)}>
      {caption ? (
        <p className="mb-3 text-sm text-ink-500">{caption}</p>
      ) : null}
      <Table className="is-compact is-ledger">
        <thead>
          <tr>
            {selection ? <Th></Th> : null}
            <Th>Check No.</Th>
            <Th>Due Date</Th>
            <Th num>Target</Th>
            <Th num>Penalty</Th>
            <Th num>Discount</Th>
            <Th>Date</Th>
            <Th>Reference No.</Th>
            <Th num>Debit</Th>
            <Th num>Credit</Th>
            <Th num>Balance</Th>
            <Th num>This month</Th>
            <Th num>Penalty left</Th>
            <Th>Status</Th>
            {selection ? <Th num>Surcharge</Th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            if (item.type === "row") {
              const row = item.row;
              const isTotals = row.kind === "totals";
              const eligible =
                selection != null &&
                row.kind === "installment" &&
                row.dueDate != null &&
                selection.eligibleDueDates.has(row.dueDate);
              const checked = eligible && row.dueDate === selection?.selectedDueDate;
              return (
                <tr
                  key={row.key}
                  className={cn(
                    isTotals && "tfoot-row",
                    eligible && "cursor-pointer",
                    checked && "is-selected",
                  )}
                  onClick={
                    eligible ? () => selection!.onSelect(row.dueDate!) : undefined
                  }
                >
                  {selection ? (
                    <Td>
                      {eligible ? (
                        <input
                          type="radio"
                          name="ledger-move-of-payment"
                          checked={checked}
                          onChange={() => selection.onSelect(row.dueDate!)}
                        />
                      ) : null}
                    </Td>
                  ) : null}
                  <Td className="mono">
                    {isTotals
                      ? "Report Total"
                      : formatLedgerTextCell(row.checkNo)}
                  </Td>
                  <Td className="mono">{formatLedgerDateCell(row.dueDate)}</Td>
                  <Td num className="mono">
                    {targetCell(row)}
                  </Td>
                  <Td num className="mono">
                    {moneyCell(row.penalty)}
                  </Td>
                  <Td num className="mono">
                    {discountCell(row.discount, row.discountSource)}
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
                  <Td num className="mono">
                    {moneyCell(row.monthRemaining)}
                  </Td>
                  <Td num className="mono">
                    {moneyCell(row.penaltyRemaining)}
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
                  {selection ? (
                    <Td num className="mono">
                      {eligible
                        ? moneyCell(
                            selection.surchargeByDueDate.get(row.dueDate!) ?? null,
                          )
                        : "—"}
                    </Td>
                  ) : null}
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
                  {selection ? <Td></Td> : null}
                  <Td className="mono">{formatLedgerTextCell(first.checkNo)}</Td>
                  <Td className="mono">{formatLedgerDateCell(first.dueDate)}</Td>
                  <Td num className="mono">
                    {targetCell(first)}
                  </Td>
                  <Td num className="mono">
                    {moneyCell(first.penalty)}
                  </Td>
                  <Td num className="mono">
                    {discountCell(first.discount, first.discountSource)}
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
                  <Td num className="mono">
                    {moneyCell(last.monthRemaining)}
                  </Td>
                  <Td num className="mono">
                    {moneyCell(last.penaltyRemaining)}
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
                  {selection ? <Td num className="mono">—</Td> : null}
                </tr>
                {isOpen
                  ? item.rows.map((r) => (
                      <tr key={r.key} className="bg-surface-2/50">
                        {selection ? <Td></Td> : null}
                        <Td className="mono text-ink-400">{""}</Td>
                        <Td className="mono text-ink-400">{""}</Td>
                        <Td num className="mono text-ink-400">
                          —
                        </Td>
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
                        <Td num className="mono text-ink-600">
                          {moneyCell(r.monthRemaining)}
                        </Td>
                        <Td num className="mono text-ink-600">
                          {moneyCell(r.penaltyRemaining)}
                        </Td>
                        <Td>—</Td>
                        {selection ? <Td num className="mono">—</Td> : null}
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
