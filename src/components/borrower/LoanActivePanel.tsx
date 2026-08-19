"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  FileDropzone,
  Input,
  Label,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { AccountLedger } from "@/components/ledger/AccountLedger";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import {
  buildAccountLedgerRows,
  checkNumbersByInstallmentNo,
  ledgerEntriesFromPostings,
  type LedgerPdcCheck,
} from "@/lib/ledger/build-account-ledger-rows";
import {
  buildPaymentProofStoragePath,
  isAllowedPaymentProofMime,
} from "@/lib/payments/proof-storage";
import { createClient } from "@/lib/supabase/client";

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const PROOF_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

const PAYMENT_BADGE: Record<string, "success" | "warning" | "danger" | "navy"> = {
  posted: "success",
  confirmed: "navy",
  pending_verification: "warning",
  rejected: "danger",
};

const TlDot = ({ tone }: { tone: "done" | "cur" | "warn" }) => (
  <span className={`pt`}>
    {tone === "done" ? (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ) : null}
  </span>
);

type LoanPanelProps = {
  applicationId: string;
  applicationStatus: string;
};

type ScheduleRow = {
  id: string;
  installment_no: number;
  due_date: string;
  amount_due: number;
  status: string;
  penalty_amount: number;
  rolled_into_installment_no?: number | null;
};

type PaymentRow = {
  id: string;
  reference_no: string | null;
  payment_date: string;
  amount: number;
  channel: string;
  status: string;
  storage_path: string | null;
  file_name: string | null;
  notes: string | null;
  flagged_reason: string | null;
  flagged_at: string | null;
  uploadedByStaff?: boolean;
};

type PostingRow = {
  id: string;
  amortization_schedule_id: string | null;
  amount: number;
  payments:
    | {
        payment_date: string;
        reference_no: string | null;
        channel?: string | null;
        status?: string | null;
      }
    | {
        payment_date: string;
        reference_no: string | null;
        channel?: string | null;
        status?: string | null;
      }[]
    | null;
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

export function LoanActivePanel({
  applicationId,
  applicationStatus,
}: LoanPanelProps) {
  const [loan, setLoan] = useState<Record<string, unknown> | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [postings, setPostings] = useState<PostingRow[]>([]);
  const [pdcChecks, setPdcChecks] = useState<LedgerPdcCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [channel, setChannel] = useState<"bank_deposit" | "check" | "pos_cash">(
    "bank_deposit",
  );
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const isPaidOff = applicationStatus === "paid_off";
  const showLoanPanel = ["loan_active", "closed", "paid_off"].includes(
    applicationStatus,
  );

  const load = useCallback(async () => {
    if (!showLoanPanel) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/borrower/applications/${applicationId}/loan`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        loan: Record<string, unknown>;
        payments: PaymentRow[];
        postings?: PostingRow[];
        pdcChecks?: LedgerPdcCheck[];
      };
      setLoan(data.loan);
      setPayments(data.payments);
      setPostings(data.postings ?? []);
      setPdcChecks(data.pdcChecks ?? []);
    } finally {
      setLoading(false);
    }
  }, [applicationId, showLoanPanel]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!showLoanPanel) return null;
  if (loading && !loan) return <Spinner />;

  function onProofFiles(files: FileList) {
    const file = files[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_PROOF_BYTES) {
      setProofFile(null);
      setError("File must be 10MB or smaller.");
      return;
    }
    if (file.type && !isAllowedPaymentProofMime(file.type)) {
      setProofFile(null);
      setError(
        "Unsupported file type. Use PDF, JPG, PNG, WebP, or HEIC.",
      );
      return;
    }
    setProofFile(file);
  }

  async function viewProof(paymentId: string) {
    setError(null);
    setViewingId(paymentId);
    try {
      const res = await fetch(`/api/borrower/payments/${paymentId}/download`);
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

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const payload: {
        amount: number;
        paymentDate: string;
        referenceNo?: string;
        channel: typeof channel;
        storagePath?: string;
        fileName?: string;
        mimeType?: string;
        notes?: string;
      } = {
        amount: Number(amount),
        paymentDate,
        referenceNo: referenceNo || undefined,
        channel,
        notes: notes.trim() || undefined,
      };

      if (proofFile) {
        const borrowerId = loan?.borrower_id as string | undefined;
        if (!borrowerId) {
          throw new Error("Missing borrower id for payment proof upload");
        }
        if (proofFile.type && !isAllowedPaymentProofMime(proofFile.type)) {
          throw new Error(
            "Unsupported file type. Use PDF, JPG, PNG, WebP, or HEIC.",
          );
        }
        if (proofFile.size > MAX_PROOF_BYTES) {
          throw new Error("File must be 10MB or smaller.");
        }

        const storagePath = buildPaymentProofStoragePath(
          borrowerId,
          String(Date.now()),
          proofFile.name,
        );
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .upload(storagePath, proofFile, { upsert: true });
        if (uploadError) throw new Error(uploadError.message);

        payload.storagePath = storagePath;
        payload.fileName = proofFile.name;
        if (proofFile.type) payload.mimeType = proofFile.type;
      }

      const res = await fetch(
        `/api/borrower/applications/${applicationId}/loan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setMessage("Payment proof submitted — pending verification.");
      setAmount("");
      setReferenceNo("");
      setNotes("");
      setProofFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loan) return null;

  const isFullyPaid = isPaidOff || Number(loan?.outstanding_balance ?? -1) <= 0;
  const schedules = [...((loan.amortization_schedules as ScheduleRow[]) ?? [])].sort(
    (a, b) => a.installment_no - b.installment_no,
  );
  const totalLoan = Number(loan.total_loan ?? 0);
  const scheduleTotal = schedules.reduce(
    (sum, row) => sum + Number(row.amount_due ?? 0),
    0,
  );
  const checkNoByInstallment = checkNumbersByInstallmentNo(pdcChecks);
  const ledgerRows = buildAccountLedgerRows({
    openingDebit: totalLoan > 0 ? totalLoan : scheduleTotal,
    schedules: schedules.map((row) => ({
      id: String(row.id),
      dueDate: String(row.due_date),
      target: Number(row.amount_due ?? 0),
      penalty: Number(row.penalty_amount ?? 0),
      installmentNo: Number(row.installment_no),
      checkNo: checkNoByInstallment.get(Number(row.installment_no)) ?? null,
      status: String(row.status ?? ""),
    })),
    payments: ledgerEntriesFromPostings(postings),
  });

  return (
    <Card className="mb-6 min-w-0">
      <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
        {isPaidOff ? "Paid off" : "Loan active"}
      </h2>
      <p className="mb-4 text-sm text-ink-500">
        Balance{" "}
        <span className="mono font-bold tabular-nums text-teal-600">
          {formatMoney(Number(loan.outstanding_balance))}
        </span>{" "}
        · Status{" "}
        <Badge variant={isPaidOff ? "success" : "gold"}>
          {isPaidOff ? "Paid Off" : String(loan.account_status)}
        </Badge>
      </p>

      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-3">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      {isFullyPaid ? (
        <Alert variant="success" className="mb-4">
          This loan is fully paid. No further payment proofs are needed.
        </Alert>
      ) : null}

      <h3 className="mb-2 font-medium text-ink-900">Account ledger</h3>
      <AccountLedger rows={ledgerRows} className="mb-4" />

      {!isFullyPaid ? (
        <>
          <h3 className="mb-2 font-medium text-ink-900">Submit payment proof</h3>
          <form
            onSubmit={(e) => void submitPayment(e)}
            className="grid gap-3 sm:grid-cols-2"
          >
            <div>
              <Label required>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="mono"
              />
            </div>
            <div>
              <Label required>Payment date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Reference no.</Label>
              <Input
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="mono"
              />
            </div>
            <div>
              <Label>Channel</Label>
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
              >
                <option value="bank_deposit">Bank deposit</option>
                <option value="check">Check</option>
                <option value="pos_cash">POS / Cash</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Remarks (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="Anything the collector should know about this payment"
              />
            </div>
            <div className="sm:col-span-2 w-full">
              <Label>Receipt / proof (optional)</Label>
              <FileDropzone
                className="!max-w-none w-full"
                accept={PROOF_ACCEPT}
                hint="Optional — PDF, JPG, PNG, WebP, HEIC up to 10MB"
                disabled={submitting}
                onFiles={onProofFiles}
              />
              {proofFile ? (
                <p className="mt-2 text-sm text-ink-600">
                  Selected: <span className="mono">{proofFile.name}</span>{" "}
                  <button
                    type="button"
                    className="text-teal-700 underline"
                    onClick={() => setProofFile(null)}
                  >
                    Remove
                  </button>
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" loading={submitting}>
                Submit proof
              </Button>
            </div>
          </form>
        </>
      ) : null}

      {payments.length > 0 ? (
        <>
          <h3 className="mb-2 mt-6 font-medium text-ink-900">Payment history</h3>
          <div className="tl">
            {payments.map((p) => {
              const flagged = Boolean(p.flagged_reason);
              const tone = flagged
                ? "warn"
                : p.status === "posted"
                  ? "done"
                  : p.status === "rejected"
                    ? "warn"
                    : "cur";
              return (
                <div key={p.id} className={`tl-item ${tone}`}>
                  <TlDot tone={tone} />
                  <div className="tl-h">
                    <b className="mono">{formatMoney(Number(p.amount))}</b>
                    {flagged ? (
                      <Badge variant="danger" dot>
                        needs re-verification
                      </Badge>
                    ) : (
                      <Badge variant={PAYMENT_BADGE[p.status] ?? "neutral"} dot>
                        {p.status.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <span className="when">{p.payment_date}</span>
                    {p.storage_path ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={viewingId === p.id}
                        onClick={() => void viewProof(p.id)}
                      >
                        View
                      </Button>
                    ) : null}
                  </div>
                  <p>
                    {p.channel.replace(/_/g, " ")}
                    {p.reference_no ? ` · Ref ${p.reference_no}` : ""}
                  </p>
                  {p.uploadedByStaff ? (
                    <p className="mt-1 text-xs text-ink-500">
                      Recorded by Loanstar staff
                    </p>
                  ) : null}
                  {flagged ? (
                    <p className="mt-1 text-danger">
                      Returned for correction: {p.flagged_reason}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </Card>
  );
}
