"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  Label,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import {
  masterlistEmploymentLabels,
  masterlistSecondaryIdentity,
} from "@/lib/ar/masterlist-display";
import { canMarkPaidOff } from "@/lib/ar/paid-off";
import { formatStatusLabel } from "@/lib/applications/status";

/** UI-only toggle — the accounting checklist card isn't wired to any workflow gate. */
const SHOW_ACCOUNTING_CHECKLIST = false;

type Lookup = {
  portfolios: Array<{ id: string; name: string }>;
  collectors: Array<{ id: string; email: string; full_name: string | null }>;
  remedialStaff: Array<{ id: string; email: string; full_name: string | null }>;
};

type PaymentRow = {
  id: string;
  reference_no: string | null;
  payment_date: string;
  amount: number;
  channel: string;
  status: string;
  storage_path?: string | null;
  file_name?: string | null;
  created_at?: string;
};

type ScheduleRow = {
  id: string;
  installment_no: number;
  due_date: string;
  amount_due: number;
  amount_paid?: number;
  status: string;
  rolled_into_installment_no?: number | null;
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

function accountStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "teal" {
  const s = status.toLowerCase();
  if (s === "active" || s === "current") return "success";
  if (s === "paid_off") return "teal";
  if (
    s === "overdue" ||
    s === "delinquent" ||
    s === "past_due" ||
    s === "remedial"
  )
    return "danger";
  return "neutral";
}

function agingBucketVariant(
  bucket: string,
): "success" | "warning" | "danger" | "neutral" {
  const b = bucket.toLowerCase();
  if (b === "current") return "success";
  if (b.includes("91") || b.includes("120") || b.includes("180")) return "danger";
  if (b.includes("30") || b.includes("60") || b.includes("dpd") || b.includes("day"))
    return "warning";
  return "neutral";
}

function scheduleStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" {
  const s = status.toLowerCase();
  if (s === "paid") return "success";
  if (s === "partial") return "warning";
  if (s === "overdue") return "danger";
  if (s === "rolled") return "neutral";
  return "neutral";
}

function paymentStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "teal" {
  const s = status.toLowerCase();
  if (s === "posted" || s === "confirmed") return "success";
  if (s === "pending_verification") return "warning";
  if (s === "rejected") return "danger";
  return "neutral";
}

function isHighAging(bucket: string) {
  const b = bucket.toLowerCase();
  return b.includes("91") || b.includes("120") || b.includes("180");
}

export default function ArMasterlistDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [lookups, setLookups] = useState<Lookup | null>(null);
  const [portfolioId, setPortfolioId] = useState("");
  const [collectorId, setCollectorId] = useState("");
  const [remedialId, setRemedialId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmPaidOff, setConfirmPaidOff] = useState(false);
  const [confirmRemedial, setConfirmRemedial] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [recRes, lookupRes] = await Promise.all([
        fetch(`/api/ar/masterlist/${id}`),
        fetch("/api/ar/lookups"),
      ]);
      if (!recRes.ok) throw new Error("Failed to load");
      const recData = (await recRes.json()) as {
        record: Record<string, unknown>;
        payments?: PaymentRow[];
      };
      setRecord(recData.record);
      setPayments(recData.payments ?? []);
      const assignmentsRaw = recData.record.assignments as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null
        | undefined;
      const assignment = Array.isArray(assignmentsRaw)
        ? assignmentsRaw[0]
        : assignmentsRaw;
      setPortfolioId((recData.record.portfolio_id as string) ?? "");
      setCollectorId((assignment?.collector_user_id as string) ?? "");
      setRemedialId((assignment?.remedial_user_id as string) ?? "");
      if (lookupRes.ok) {
        setLookups((await lookupRes.json()) as Lookup);
      }
      if (!opts?.silent) setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAssignment(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/ar/masterlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId: portfolioId || null,
          collectorUserId: collectorId || null,
        }),
      });
      if (!res.ok) throw new Error("Assignment failed");
      setMessage("Assignment saved.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function turnOverRemedial() {
    if (!remedialId) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/ar/masterlist/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remedialUserId: remedialId }),
      });
      if (!res.ok) throw new Error("Turnover failed");
      setConfirmRemedial(false);
      setMessage("Account turned over to remedial.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function viewProof(paymentId: string) {
    setError(null);
    setViewingId(paymentId);
    try {
      const res = await fetch(`/api/ar/payments/${paymentId}/download`);
      const body = (await res.json()) as {
        signedUrl?: string;
        error?: string;
      };
      if (!res.ok || !body.signedUrl) {
        throw new Error(body.error ?? "Download failed");
      }
      window.open(body.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setViewingId(null);
    }
  }

  async function markAsPaidOff() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/ar/masterlist/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid_off" }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to mark paid off");
      setConfirmPaidOff(false);
      setMessage("Application marked as Paid Off.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!record) return <Alert>Record not found.</Alert>;

  const schedules = (
    (record.amortization_schedules as ScheduleRow[] | undefined) ?? []
  )
    .slice()
    .sort(
      (a, b) => Number(a.installment_no) - Number(b.installment_no),
    );
  const borrowerName = (record.borrower_name as string) ?? "Account";
  const borrowerNo = String(record.borrower_no ?? "");
  const accountNo = (record.loan_account_no as string | null) ?? null;
  const accountStatus = String(record.account_status ?? "");
  const agingBucket = String(record.aging_bucket ?? "");
  const applicationStatus = String(record.application_status ?? "");
  const remedialFlag = Boolean(record.remedial_flag);
  const segment =
    record.segment === "sme" ? "sme" : ("seafarer" as const);
  const employmentLabels = masterlistEmploymentLabels(segment);
  const manningAgency = (record.manning_agency as string | null) ?? null;
  const vesselName = (record.vessel_name as string | null) ?? null;
  const secondaryIdentity = masterlistSecondaryIdentity({
    manning_agency: manningAgency,
    vessel_name: vesselName,
  });
  const outstanding = Number(record.outstanding_balance ?? 0);
  const monthly = Number(record.monthly_amortization ?? 0);
  const terms = Number(record.terms ?? 0);
  const principal = Number(record.principal ?? record.loan_amount ?? 0);
  const netReleased = Number(record.net_released ?? 0);
  const totalLoan = Number(record.total_loan ?? 0);

  const paidCount = schedules.filter(
    (row) => String(row.status).toLowerCase() === "paid",
  ).length;
  // 'rolled' installments are settled (their balance moved to the next
  // installment) — exclude them from the denominator so a rollover doesn't
  // permanently cap progress below 100%.
  const rolledCount = schedules.filter(
    (row) => String(row.status).toLowerCase() === "rolled",
  ).length;
  const trackedCount = schedules.length - rolledCount;
  const progressPct =
    trackedCount > 0 ? Math.round((paidCount / trackedCount) * 100) : 0;

  const paidOffEligibility = canMarkPaidOff({
    applicationStatus,
    outstandingBalance: outstanding,
    scheduleStatuses: schedules.map((row) => String(row.status ?? "")),
  });
  const isPaidOff = applicationStatus === "paid_off";

  const collectorLabel =
    lookups?.collectors.find((c) => c.id === collectorId)?.full_name ??
    lookups?.collectors.find((c) => c.id === collectorId)?.email ??
    null;
  const portfolioLabel =
    lookups?.portfolios.find((p) => p.id === portfolioId)?.name ?? null;

  const nextActions: string[] = [];
  if (!isPaidOff && !collectorId) {
    nextActions.push("Assign a collector so this account appears in collection.");
  }
  if (!isPaidOff && !remedialFlag && isHighAging(agingBucket)) {
    nextActions.push(
      "Aging has reached the 90-day threshold — consider remedial turnover.",
    );
  }
  if (isPaidOff) {
    nextActions.length = 0;
  }

  const scheduleTotal = schedules.reduce(
    (sum, row) => sum + Number(row.amount_due ?? 0),
    0,
  );
  let runningBalance = totalLoan > 0 ? totalLoan : scheduleTotal;

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "AR masterlist", href: "/ar" },
          { label: borrowerName },
        ]}
      />
      <PageHeader
        title={borrowerName}
        description={
          secondaryIdentity
            ? `${accountNo ?? (borrowerNo || "Account")} · ${secondaryIdentity}`
            : (accountNo ?? (borrowerNo || "Account"))
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant={segment === "sme" ? "navy" : "teal"} dot>
          {segment === "sme" ? "SME" : "Seafarer"}
        </Badge>
        <Badge variant={accountStatusVariant(accountStatus)} dot>
          {accountStatus || "—"}
        </Badge>
        <Badge variant={agingBucketVariant(agingBucket)} dot>
          {agingBucket || "—"}
        </Badge>
        {remedialFlag ? (
          <Badge variant="danger" dot>
            Remedial
          </Badge>
        ) : null}
        {applicationStatus ? (
          <Badge variant={isPaidOff ? "success" : "navy"} dot>
            {formatStatusLabel(applicationStatus)}
          </Badge>
        ) : null}
        {borrowerNo ? <span className="id">{borrowerNo}</span> : null}
        {portfolioLabel ? (
          <Badge variant="navy" dot>
            {portfolioLabel}
          </Badge>
        ) : null}
        {collectorLabel ? (
          <Badge variant="teal" dot>
            {collectorLabel}
          </Badge>
        ) : (
          <Badge variant="warning" dot>
            Unassigned
          </Badge>
        )}
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-4">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      {nextActions.length > 0 ? (
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
          {nextActions[0]}
        </div>
      ) : isPaidOff ? (
        <div className="banner mb-6">
          <span className="badge badge-success">Paid off</span>
          This loan has been marked Paid Off.
        </div>
      ) : null}

      {manningAgency || vesselName ? (
        <Card className="mb-6 !bg-surface-2/30">
          <div className="grid gap-3 sm:grid-cols-2">
            {manningAgency ? (
              <div>
                <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-400">
                  {employmentLabels.employer}
                </div>
                <div className="mt-1 text-sm font-medium text-ink-900">
                  {manningAgency}
                </div>
              </div>
            ) : null}
            {vesselName ? (
              <div>
                <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-400">
                  {employmentLabels.secondary}
                </div>
                <div className="mt-1 text-sm font-medium text-ink-900">
                  {vesselName}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card variant="gradient" className="mb-6">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-navy-200">
          Outstanding balance
        </p>
        <div className="mt-2 mono text-[26px] font-semibold tracking-[-0.01em]">
          ₱{formatMoney(outstanding)}
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-navy-200">
            <span>
              Installments paid {paidCount}/{trackedCount || terms}
            </span>
            <span className="mono">{progressPct}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <div
              className="h-full rounded-full bg-teal-400"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/20 pt-3 text-sm">
          <div>
            <span className="text-navy-200">Principal </span>
            <span className="mono font-semibold">₱{formatMoney(principal)}</span>
          </div>
          <div>
            <span className="text-navy-200">Monthly </span>
            <span className="mono font-semibold">₱{formatMoney(monthly)}</span>
          </div>
          <div>
            <span className="text-navy-200">Terms </span>
            <span className="mono font-semibold">{terms} mo</span>
          </div>
          {netReleased > 0 ? (
            <div>
              <span className="text-navy-200">Net released </span>
              <span className="mono font-semibold">
                ₱{formatMoney(netReleased)}
              </span>
            </div>
          ) : null}
        </div>
        {!isPaidOff ? (
          <div className="mt-4">
            <Button
              variant="accent"
              loading={saving}
              disabled={!paidOffEligibility.ok}
              onClick={() => setConfirmPaidOff(true)}
              title={
                paidOffEligibility.ok ? undefined : paidOffEligibility.reason
              }
            >
              Mark as paid off
            </Button>
            {!paidOffEligibility.ok ? (
              <p className="mt-2 text-xs text-navy-200">
                {paidOffEligibility.reason}
              </p>
            ) : (
              <p className="mt-2 text-xs text-navy-200">
                Confirms application status as Paid Off — does not run
                automatically at zero balance.
              </p>
            )}
          </div>
        ) : null}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
          Assignment
        </h2>
        <p className="mb-3 text-sm text-ink-500">
          Portfolio and collector for this account.
        </p>
        <form
          onSubmit={(e) => void saveAssignment(e)}
          className="grid gap-3"
        >
          <div>
            <Label>Portfolio</Label>
            <Select
              value={portfolioId}
              onChange={(e) => setPortfolioId(e.target.value)}
            >
              <option value="">— Select —</option>
              {(lookups?.portfolios ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Collector</Label>
            <Select
              value={collectorId}
              onChange={(e) => setCollectorId(e.target.value)}
            >
              <option value="">— Select —</option>
              {(lookups?.collectors ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name ?? c.email}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" loading={saving}>
            Save assignment
          </Button>
        </form>
      </Card>

      {/* Hidden in UI only (not wired to any workflow gate) — flip to re-enable. */}
      {SHOW_ACCOUNTING_CHECKLIST && record.loan_application_id && record.borrower_id ? (
        <div className="mb-6">
          <DocumentChecklist
            applicationId={record.loan_application_id as string}
            borrowerId={record.borrower_id as string}
            stage="accounting"
            title="Accounting checklist"
            description="AR working documents for this account — checklist and vouchers."
            checklistApiPath={`/api/ar/applications/${record.loan_application_id}/checklist?stage=accounting`}
            uploadApiPath={`/api/ar/applications/${record.loan_application_id}/documents`}
            viewApiPath={(documentId) => `/api/documents/${documentId}/download`}
            onUploadComplete={() => void load({ silent: true })}
          />
        </div>
      ) : null}

      {!remedialFlag ? (
        <Card className="mb-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            Remedial turnover
          </h2>
          <p className="mb-3 text-sm text-ink-500">
            For accounts at the 90-day aging threshold — moves the file out of
            normal collection.
          </p>
          {isHighAging(agingBucket) ? (
            <div className="banner warn mb-3">
              Aging bucket suggests remedial review.
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Select
              value={remedialId}
              onChange={(e) => setRemedialId(e.target.value)}
            >
              <option value="">— Remedial staff —</option>
              {(lookups?.remedialStaff ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name ?? r.email}
                </option>
              ))}
            </Select>
            <Button
              loading={saving}
              disabled={!remedialId}
              onClick={() => setConfirmRemedial(true)}
            >
              Confirm turnover
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
          Amortization ledger
        </h2>
        <p className="mb-3 text-sm text-ink-500">
          {paidCount} of {trackedCount} installments paid
          {rolledCount > 0
            ? ` (${rolledCount} rolled forward, excluded from count)`
            : ""}
        </p>
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th className="num">#</Th>
                <Th>Due date</Th>
                <Th className="num">Amount due</Th>
                <Th className="num">Running bal.</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((row) => {
                const due = Number(row.amount_due);
                const status = String(row.status ?? "");
                if (status.toLowerCase() === "paid") {
                  runningBalance = Math.max(0, runningBalance - due);
                }
                const balAfter = runningBalance;
                return (
                  <tr key={String(row.id)}>
                    <Td className="num mono">{String(row.installment_no)}</Td>
                    <Td className="mono">{formatDate(String(row.due_date))}</Td>
                    <Td className="num mono text-teal-600">
                      {formatMoney(due)}
                    </Td>
                    <Td className="num mono">{formatMoney(balAfter)}</Td>
                    <Td>
                      <Badge variant={scheduleStatusVariant(status)} dot>
                        {status === "rolled" && row.rolled_into_installment_no
                          ? `Rolled → #${row.rolled_into_installment_no}`
                          : status}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
          Payment history
        </h2>
        <p className="mb-3 text-sm text-ink-500">
          Proofs and postings against this account.
        </p>
        {payments.length === 0 ? (
          <p className="text-sm text-ink-400">No payments recorded yet.</p>
        ) : (
          <div className="tl">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className={`tl-item ${
                  payment.status === "posted" || payment.status === "confirmed"
                    ? "done"
                    : payment.status === "rejected"
                      ? "warn"
                      : "cur"
                }`}
              >
                <span className="pt" />
                <div className="tl-h">
                  <b>₱{formatMoney(Number(payment.amount))}</b>
                  <Badge variant={paymentStatusVariant(payment.status)} dot>
                    {payment.status.replace(/_/g, " ")}
                  </Badge>
                  <span className="when">
                    {formatDate(payment.payment_date)}
                  </span>
                  {payment.storage_path ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={viewingId === payment.id}
                      onClick={() => void viewProof(payment.id)}
                    >
                      View
                    </Button>
                  ) : null}
                </div>
                <p>
                  {payment.channel.replace(/_/g, " ")}
                  {payment.reference_no
                    ? ` · Ref ${payment.reference_no}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmPaidOff}
        title="Mark this loan paid off?"
        message="This sets the application status to Paid Off. Only do this when the account is fully settled."
        confirmLabel="Yes, mark paid off"
        loading={saving}
        onCancel={() => setConfirmPaidOff(false)}
        onConfirm={() => void markAsPaidOff()}
      />

      <ConfirmDialog
        open={confirmRemedial}
        title="Turn over to remedial?"
        message="This flags the account as remedial and assigns the selected remedial staff. Normal collectors will no longer see it."
        confirmLabel="Yes, confirm turnover"
        loading={saving}
        onCancel={() => setConfirmRemedial(false)}
        onConfirm={() => void turnOverRemedial()}
      />
    </div>
  );
}
