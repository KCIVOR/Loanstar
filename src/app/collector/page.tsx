"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  CollectorKpi,
  collectorIconProps,
} from "@/components/collector/CollectorKpi";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import {
  agingNeedsAttention,
  dcrItemTotal,
  nextOpenInstallment,
  type ScheduleLite,
} from "@/lib/collector/desk";
import {
  agingVariant,
  formatDate,
  formatMoney,
  paymentStatusVariant,
} from "@/lib/collector/format";

type Account = {
  id: string;
  borrower_name: string;
  loan_account_no: string | null;
  outstanding_balance: number;
  aging_bucket: string;
  amortization_schedules?: ScheduleLite[] | ScheduleLite | null;
};

type Payment = {
  id: string;
  reference_no: string | null;
  amount: number;
  status: string;
  payment_date: string;
  masterlist?:
    | { borrower_name: string; loan_account_no: string | null }
    | { borrower_name: string; loan_account_no: string | null }[]
    | null;
};

type DcrRow = {
  id: string;
  status: string;
  dcr_items: Array<{ payment_id: string; amount: number }> | null;
};

const IconLayers = (
  <svg {...collectorIconProps}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconAlert = (
  <svg {...collectorIconProps}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
const IconProof = (
  <svg {...collectorIconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M9 15l2 2 4-4" />
  </svg>
);
const IconCash = (
  <svg {...collectorIconProps}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

function schedulesOf(account: Account): ScheduleLite[] {
  const raw = account.amortization_schedules;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function firstMl(pay: Payment) {
  const m = pay.masterlist;
  if (!m) return null;
  return Array.isArray(m) ? (m[0] ?? null) : m;
}

export default function CollectorOverviewPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dcrs, setDcrs] = useState<DcrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, payRes, dcrRes] = await Promise.all([
        fetch("/api/collector/accounts"),
        fetch("/api/collector/payments?scope=desk"),
        fetch("/api/collector/dcr?limit=20"),
      ]);
      if (!accRes.ok) throw new Error("Failed to load overview");
      const accData = (await accRes.json()) as { accounts: Account[] };
      setAccounts(accData.accounts);
      if (payRes.ok) {
        const payData = (await payRes.json()) as { payments: Payment[] };
        setPayments(payData.payments);
      }
      if (dcrRes.ok) {
        const dcrData = (await dcrRes.json()) as { dcrs: DcrRow[] };
        setDcrs(dcrData.dcrs ?? []);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendReminders() {
    setSendingReminders(true);
    setReminderMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/collector/reminders", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to send reminders");
      }
      const data = (await res.json()) as { sent: number; skipped: number };
      setReminderMessage(
        `Sent ${data.sent} reminder${data.sent === 1 ? "" : "s"}` +
          (data.skipped
            ? ` — ${data.skipped} skipped (no contact, SMS off, or already reminded)`
            : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSendingReminders(false);
    }
  }

  if (loading) return <Spinner />;

  const attention = accounts.filter((a) =>
    agingNeedsAttention(a.aging_bucket),
  );
  const attentionIds = new Set(attention.map((a) => a.id));
  const pendingProofs = payments.filter(
    (p) => p.status === "pending_verification",
  );
  const draft = dcrs.find((d) => d.status === "draft");
  const draftItems = draft?.dcr_items ?? [];
  const draftTotal = dcrItemTotal(draftItems);

  const topAccounts = [
    ...attention,
    ...accounts.filter((a) => !attentionIds.has(a.id)),
  ].slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Collector overview"
        description="Your daily desk — accounts, proofs, and DCR at a glance."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              loading={sendingReminders}
              onClick={() => void sendReminders()}
            >
              Send reminders
            </Button>
            <Link href="/collector/dcr" className="btn btn-secondary">
              Open DCR
            </Link>
          </div>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {reminderMessage ? (
        <div className="mb-4">
          <Alert variant="success">{reminderMessage}</Alert>
        </div>
      ) : null}

      {attention.length > 0 || pendingProofs.length > 0 || draft ? (
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
            {attention.length > 0 ? (
              <>
                <span className="mono font-semibold">{attention.length}</span>{" "}
                account{attention.length === 1 ? "" : "s"} need attention
              </>
            ) : null}
            {attention.length > 0 && pendingProofs.length > 0 ? " · " : null}
            {pendingProofs.length > 0 ? (
              <>
                <span className="mono font-semibold">
                  {pendingProofs.length}
                </span>{" "}
                proof{pendingProofs.length === 1 ? "" : "s"} to review
              </>
            ) : null}
            {(attention.length > 0 || pendingProofs.length > 0) && draft
              ? " · "
              : null}
            {draft ? (
              <>
                Open DCR draft ·{" "}
                <span className="mono font-semibold">
                  {draftItems.length}
                </span>{" "}
                item{draftItems.length === 1 ? "" : "s"}
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="kpi-grid mb-8">
        <CollectorKpi
          tone="navy"
          icon={IconLayers}
          label="Assigned"
          value={accounts.length}
        />
        <CollectorKpi
          tone="danger"
          icon={IconAlert}
          label="Needs attention"
          value={attention.length}
        />
        <CollectorKpi
          tone="warning"
          icon={IconProof}
          label="Pending proofs"
          value={pendingProofs.length}
        />
        <CollectorKpi
          tone="teal"
          icon={IconCash}
          label="DCR draft"
          value={
            draft
              ? `${draftItems.length} · ₱${formatMoney(draftTotal)}`
              : "—"
          }
        />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {(
          [
            {
              href: "/collector/accounts",
              title: "Accounts",
              body: "Assigned borrowers, aging, next due.",
            },
            {
              href: "/collector/proofs",
              title: "Payment proofs",
              body: "Confirm or reject borrower uploads.",
            },
            {
              href: "/collector/dcr",
              title: "DCR builder",
              body: "Batch confirmed payments for AR.",
            },
          ] as const
        ).map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block rounded-[var(--r-md)] border border-line-soft bg-surface px-4 py-4 transition-colors hover:border-navy-200 hover:bg-navy-50/40"
          >
            <div className="font-display text-base font-semibold text-navy-900">
              {card.title}
            </div>
            <p className="mt-1 text-sm text-ink-500">{card.body}</p>
          </Link>
        ))}
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-navy-900">
            Next accounts
          </h2>
          <Link
            href="/collector/accounts"
            className="text-sm font-medium text-teal-700 hover:underline"
          >
            View all
          </Link>
        </div>
        {topAccounts.length === 0 ? (
          <EmptyState
            title="No accounts assigned"
            description="AR will assign borrowers to your portfolio."
            showMark={false}
          />
        ) : (
          <ul className="divide-y divide-line-soft rounded-[var(--r-md)] border border-line-soft bg-surface">
            {topAccounts.map((acc) => {
              const next = nextOpenInstallment(schedulesOf(acc));
              return (
                <li
                  key={acc.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <div className="font-medium text-ink-900">
                      {acc.borrower_name}
                    </div>
                    <div className="mono text-xs text-ink-500">
                      {acc.loan_account_no ?? "—"}
                      {next
                        ? ` · due ${formatDate(next.due_date)}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-sm text-teal-600">
                      ₱{formatMoney(Number(acc.outstanding_balance))}
                    </span>
                    <Badge variant={agingVariant(acc.aging_bucket)}>
                      {acc.aging_bucket}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-navy-900">
            Pending proofs
          </h2>
          <Link
            href="/collector/proofs"
            className="text-sm font-medium text-teal-700 hover:underline"
          >
            Review all
          </Link>
        </div>
        {pendingProofs.length === 0 ? (
          <EmptyState
            title="No pending proofs"
            description="New borrower uploads will show here."
            showMark={false}
          />
        ) : (
          <ul className="divide-y divide-line-soft rounded-[var(--r-md)] border border-line-soft bg-surface">
            {pendingProofs.slice(0, 5).map((pay) => {
              const ml = firstMl(pay);
              return (
                <li
                  key={pay.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <div className="font-medium text-ink-900">
                      {ml?.borrower_name ?? "—"}
                    </div>
                    <div className="mono text-xs text-ink-500">
                      {pay.reference_no ?? "No ref"} ·{" "}
                      {formatDate(pay.payment_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-sm text-teal-600">
                      ₱{formatMoney(Number(pay.amount))}
                    </span>
                    <Badge variant={paymentStatusVariant(pay.status)}>
                      {pay.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
