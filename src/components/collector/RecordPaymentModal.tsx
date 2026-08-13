"use client";

import { FormEvent, useState } from "react";

import {
  Alert,
  Button,
  FileDropzone,
  Input,
  Label,
  Modal,
  Select,
} from "@/components/ui";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import {
  buildPaymentProofStoragePath,
  isAllowedPaymentProofMime,
} from "@/lib/payments/proof-storage";
import { createClient } from "@/lib/supabase/client";

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const PROOF_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

type Channel = "bank_deposit" | "check" | "pos_cash";

type RecordPaymentModalProps = {
  open: boolean;
  borrowerName: string;
  masterlistId: string;
  borrowerId: string;
  onClose: () => void;
  onRecorded: () => void;
};

export function RecordPaymentModal({
  open,
  borrowerName,
  masterlistId,
  borrowerId,
  onClose,
  onRecorded,
}: RecordPaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [channel, setChannel] = useState<Channel>("bank_deposit");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmount("");
    setPaymentDate("");
    setReferenceNo("");
    setChannel("bank_deposit");
    setProofFile(null);
    setError(null);
  }

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
      setError("Unsupported file type. Use PDF, JPG, PNG, WebP, or HEIC.");
      return;
    }
    setProofFile(file);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const parsedAmount = Number(amount);
      if (!paymentDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Amount and payment date are required");
      }

      const payload: {
        masterlistId: string;
        amount: number;
        paymentDate: string;
        referenceNo?: string;
        channel: Channel;
        storagePath?: string;
        fileName?: string;
        mimeType?: string;
      } = {
        masterlistId,
        amount: parsedAmount,
        paymentDate,
        referenceNo: referenceNo.trim() || undefined,
        channel,
      };

      if (proofFile) {
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

      const res = await fetch("/api/collector/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to record payment");
      }
      reset();
      onRecorded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Record payment — ${borrowerName}`}
      className="!max-w-2xl"
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Record payment
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      ) : (
        <div className="mb-4">
          <Alert variant="info">
            Use this for in-person or branch payments the borrower cannot
            submit through the portal. Amount and payment date are required.
          </Alert>
        </div>
      )}
      <form onSubmit={(e) => void submit(e)} className="space-y-6">
        <section>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Payment details
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label required>Amount</Label>
              <div className="affix">
                <span className="add">PHP</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  mono
                />
              </div>
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
                placeholder="Optional"
                className="mono"
              />
            </div>
            <div>
              <Label>Channel</Label>
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
              >
                <option value="bank_deposit">Bank deposit</option>
                <option value="check">Check</option>
                <option value="pos_cash">POS / Cash</option>
              </Select>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Receipt / proof
            <span className="ml-2 font-sans text-xs font-normal text-ink-400">
              Optional
            </span>
          </h3>
          <FileDropzone
            className="!max-w-none w-full"
            accept={PROOF_ACCEPT}
            hint="PDF, JPG, PNG, WebP, HEIC up to 10MB"
            disabled={saving}
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
        </section>
      </form>
    </Modal>
  );
}
