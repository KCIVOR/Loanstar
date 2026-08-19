"use client";

import { useEffect, useMemo, useState } from "react";

import { AccountLedger } from "@/components/ledger/AccountLedger";
import { AutofillOverlay } from "@/components/dev/AutofillOverlay";
import { RecordPaymentForm } from "@/components/payments/RecordPaymentForm";
import {
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { type LedgerPdcCheck } from "@/lib/ledger/build-account-ledger-rows";
import {
  buildDeskLedgerRows,
  type DeskLedgerPosting,
} from "@/lib/ledger/desk-ledger";

type Account = {
  id: string;
  borrowerName: string;
  borrowerNo: string | null;
  borrowerId: string | null;
  loanAccountNo: string | null;
  segment: "seafarer" | "sme" | "individual";
  outstandingBalance: number;
  accountStatus: string;
  totalLoan: number;
};

type ScheduleRow = {
  id: string;
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  penaltyAmount: number;
  status: string;
};

type PaymentRow = {
  id: string;
  reference_no: string | null;
  payment_date: string;
  amount: number;
  status: string;
  channel: string;
};

type AccountPayload = {
  account: Account;
  schedules: ScheduleRow[];
  payments: PaymentRow[];
  postings?: DeskLedgerPosting[];
  pdcChecks?: LedgerPdcCheck[];
};

async function requestAccount(apiPath: string): Promise<AccountPayload> {
  const response = await fetch(apiPath);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to load account");
  }
  return (await response.json()) as AccountPayload;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function RecordPaymentPage({
  desk,
  masterlistId,
}: {
  desk: "collector" | "remedial";
  masterlistId: string;
}) {
  const apiPath = `/api/${desk}/accounts/${masterlistId}`;
  const [data, setData] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const payload = await requestAccount(apiPath);
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load account");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [apiPath]);

  const ledgerRows = useMemo(() => {
    if (!data) return [];
    return buildDeskLedgerRows({
      totalLoan: data.account.totalLoan,
      schedules: data.schedules,
      postings: data.postings ?? [],
      pdcChecks: data.pdcChecks ?? [],
    });
  }, [data]);

  async function handleRecorded() {
    setMessage("Payment recorded and ready for the DCR workflow.");
    try {
      setData(await requestAccount(apiPath));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh account");
    }
  }

  if (loading) return <Spinner label="Loading account ledger…" />;
  if (!data) return <Alert variant="danger">{error ?? "Account not found."}</Alert>;

  const { account, schedules, payments } = data;
  const backHref =
    desk === "collector"
      ? "/collector/accounts"
      : `/remedial/accounts/${masterlistId}`;
  const breadcrumbs =
    desk === "collector"
      ? [
          { label: "Accounts", href: backHref },
          { label: "Record payment" },
        ]
      : [
          { label: "Recovery queue", href: "/remedial" },
          { label: account.borrowerName, href: backHref },
          { label: "Record payment" },
        ];

  return (
    <div className="min-w-0">
      <Breadcrumbs className="mb-3" items={breadcrumbs} />
      <PageHeader
        title={`Record payment — ${account.borrowerName}`}
        description={`${account.loanAccountNo ?? account.borrowerNo ?? "Loan account"} · Outstanding ₱${formatMoney(account.outstandingBalance)}`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge variant={account.segment === "sme" ? "navy" : account.segment === "individual" ? "warning" : "teal"} dot>
          {account.segment === "sme" ? "SME" : account.segment === "individual" ? "Individual" : "Seafarer"}
        </Badge>
        <Badge variant="neutral">{account.accountStatus}</Badge>
      </div>

      {error ? (
        <Alert variant="danger" className="mb-5">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert variant="success" className="mb-5">
          {message}
        </Alert>
      ) : null}

      <section className="mb-8 min-w-0">
        <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
          Account ledger
        </h2>
        <p className="mb-3 text-sm text-ink-500">
          Review the account before recording a payment. Only posted credits
          affect the ledger balance; newly recorded payments enter the DCR
          workflow first.
        </p>
        {schedules.length === 0 && payments.length === 0 ? (
          <EmptyState
            title="No ledger activity"
            description="Amortization and posted payments will appear here."
            showMark={false}
          />
        ) : (
          <AccountLedger rows={ledgerRows} />
        )}
      </section>

      <RecordPaymentForm
        masterlistId={masterlistId}
        borrowerId={account.borrowerId ?? ""}
        onRecorded={handleRecorded}
      />
      <AutofillOverlay />
    </div>
  );
}
