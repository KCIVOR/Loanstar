"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  severityLabel,
  severityVariant,
  type RemedialSeverity,
} from "@/lib/remedial/desk";

type Account = {
  id: string;
  borrowerName: string;
  borrowerNo: string;
  loanAccountNo: string | null;
  outstandingBalance: number;
  agingBucket: string;
  accountStatus: string;
  monthlyAmortization: number;
  principal: number;
  totalLoan: number;
  netReleased: number;
  daysPastDue: number;
  severity: RemedialSeverity;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  turnedOverAt: string | null;
  turnoverReason: string;
  fromCollectorName: string | null;
};

type ScheduleRow = {
  id: string;
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  penaltyAmount: number;
  status: string;
  paidAt: string | null;
};

type PaymentRow = {
  id: string;
  reference_no: string | null;
  payment_date: string;
  amount: number;
  status: string;
  channel: string;
  created_at: string;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function scheduleStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" {
  const s = status.toLowerCase();
  if (s === "paid") return "success";
  if (s === "overdue") return "danger";
  if (s === "partial") return "warning";
  return "neutral";
}

function paymentStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "teal" {
  if (status === "posted") return "teal";
  if (status === "confirmed") return "success";
  if (status === "rejected") return "danger";
  if (status.includes("pending")) return "warning";
  return "neutral";
}

export default function RemedialAccountPage() {
  const params = useParams();
  const id = params.id as string;

  const [account, setAccount] = useState<Account | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/remedial/accounts/${id}`);
      if (!res.ok) throw new Error("Failed to load account");
      const data = (await res.json()) as {
        account: Account;
        schedules: ScheduleRow[];
        payments: PaymentRow[];
      };
      setAccount(data.account);
      setSchedules(data.schedules ?? []);
      setPayments(data.payments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;
  if (!account) {
    return <Alert>{error ?? "Account not found."}</Alert>;
  }

  const paidCount = schedules.filter((s) => s.status === "paid").length;

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "Recovery queue", href: "/remedial" },
          { label: account.borrowerName },
        ]}
      />
      <PageHeader
        title={account.borrowerName}
        description={
          account.loanAccountNo ?? account.borrowerNo ?? "Remedial account"
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="banner warn mb-6">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        <span>
          Escalated recovery file
          {account.fromCollectorName
            ? ` · turned over from ${account.fromCollectorName}`
            : ""}
          {account.turnedOverAt
            ? ` on ${formatDate(account.turnedOverAt)}`
            : ""}
          {" · "}
          {account.turnoverReason.replaceAll("_", " ")}
        </span>
      </div>

      {/* Recovery strip — severity-first, not AR money clone / collector DCR */}
      <div className="mb-6 overflow-hidden rounded-[var(--r-md)] border border-navy-800 bg-navy-950 text-white">
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-4">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Outstanding
            </div>
            <div className="mt-1 mono text-2xl font-semibold text-teal-300">
              ₱{formatMoney(account.outstandingBalance)}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Severity
            </div>
            <div className="mt-2">
              <Badge variant={severityVariant(account.severity)}>
                {severityLabel(account.severity)}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Days past due
            </div>
            <div className="mt-1 mono text-xl font-semibold">
              {account.daysPastDue}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Aging
            </div>
            <div className="mt-2">
              <Badge variant="danger">{account.agingBucket}</Badge>
            </div>
          </div>
        </div>
        <div className="grid gap-3 border-t border-navy-800 px-5 py-4 text-sm sm:grid-cols-3">
          <div>
            <span className="text-navy-200">Status </span>
            <span className="font-medium">{account.accountStatus}</span>
          </div>
          <div>
            <span className="text-navy-200">Monthly </span>
            <span className="mono">
              ₱{formatMoney(account.monthlyAmortization)}
            </span>
          </div>
          <div>
            <span className="text-navy-200">Next due </span>
            <span className="mono">
              {account.nextDueDate
                ? `${formatDate(account.nextDueDate)}${
                    account.nextDueAmount != null
                      ? ` · ₱${formatMoney(account.nextDueAmount)}`
                      : ""
                  }`
                : "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--r-md)] border border-line-soft bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-ink-400">
            Principal
          </div>
          <div className="mono mt-1 font-semibold text-ink-900">
            ₱{formatMoney(account.principal)}
          </div>
        </div>
        <div className="rounded-[var(--r-md)] border border-line-soft bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-ink-400">
            Total loan
          </div>
          <div className="mono mt-1 font-semibold text-ink-900">
            ₱{formatMoney(account.totalLoan)}
          </div>
        </div>
        <div className="rounded-[var(--r-md)] border border-line-soft bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-ink-400">
            Installments paid
          </div>
          <div className="mono mt-1 font-semibold text-ink-900">
            {paidCount}/{schedules.length}
          </div>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">
          Amortization
        </h2>
        {schedules.length === 0 ? (
          <EmptyState
            title="No schedule"
            description="Amortization rows will appear when generated."
            showMark={false}
          />
        ) : (
          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Due</Th>
                  <Th num>Amount</Th>
                  <Th num>Paid</Th>
                  <Th num>Penalty</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((row) => (
                  <tr key={row.id}>
                    <Td className="mono">{row.installmentNo}</Td>
                    <Td className="mono">{formatDate(row.dueDate)}</Td>
                    <Td num className="mono">
                      {formatMoney(row.amountDue)}
                    </Td>
                    <Td num className="mono">
                      {formatMoney(row.amountPaid)}
                    </Td>
                    <Td num className="mono">
                      {formatMoney(row.penaltyAmount)}
                    </Td>
                    <Td>
                      <Badge variant={scheduleStatusVariant(row.status)}>
                        {row.status}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">
          Payment history
        </h2>
        {payments.length === 0 ? (
          <EmptyState
            title="No payments recorded"
            description="Proofs and postings for this account will show here."
            showMark={false}
          />
        ) : (
          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Date</Th>
                  <Th>Channel</Th>
                  <Th num>Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pay) => (
                  <tr key={pay.id}>
                    <Td className="mono">{pay.reference_no ?? "—"}</Td>
                    <Td className="mono">{formatDate(pay.payment_date)}</Td>
                    <Td>{pay.channel.replaceAll("_", " ")}</Td>
                    <Td num className="mono text-teal-600">
                      {formatMoney(Number(pay.amount))}
                    </Td>
                    <Td>
                      <Badge variant={paymentStatusVariant(pay.status)}>
                        {pay.status.replaceAll("_", " ")}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
