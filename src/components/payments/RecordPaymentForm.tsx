"use client";

import { type FormEvent, useState } from "react";

import {
  Alert,
  Button,
  Card,
  FileDropzone,
  Input,
  Label,
  Select,
  Textarea,
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

export function RecordPaymentForm({
  masterlistId,
  borrowerId,
  onRecorded,
}: {
  masterlistId: string;
  borrowerId: string;
  onRecorded: () => void | Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [channel, setChannel] = useState<Channel>("bank_deposit");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmount("");
    setPaymentDate("");
    setReferenceNo("");
    setChannel("bank_deposit");
    setNotes("");
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const parsedAmount = Number(amount);
      if (!paymentDate || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Amount and payment date are required");
      }
      if (!referenceNo.trim()) {
        throw new Error("Reference number is required");
      }

      const payload: {
        masterlistId: string;
        amount: number;
        paymentDate: string;
        referenceNo: string;
        channel: Channel;
        notes?: string;
        storagePath?: string;
        fileName?: string;
        mimeType?: string;
      } = {
        masterlistId,
        amount: parsedAmount,
        paymentDate,
        referenceNo: referenceNo.trim(),
        channel,
        notes: notes.trim() || undefined,
      };

      if (proofFile) {
        if (!borrowerId) {
          throw new Error("Missing borrower id for payment proof upload");
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

      const response = await fetch("/api/collector/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to record payment");
      }

      reset();
      await onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-navy-900">
          Record payment
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Use this for in-person or branch payments the borrower cannot submit
          through the portal.
        </p>
      </div>

      {error ? (
        <Alert variant="danger" className="mb-5">
          {error}
        </Alert>
      ) : null}

      <form onSubmit={submit} className="space-y-6">
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
                  onChange={(event) => setAmount(event.target.value)}
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
                onChange={(event) => setPaymentDate(event.target.value)}
                required
              />
            </div>
            <div>
              <Label required>Reference no.</Label>
              <Input
                value={referenceNo}
                onChange={(event) => setReferenceNo(event.target.value)}
                placeholder="Bank reference / receipt no."
                required
                className="mono"
              />
            </div>
            <div>
              <Label>Channel</Label>
              <Select
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as Channel)
                }
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
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Anything about this branch or in-person payment"
              />
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

        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Record payment
          </Button>
        </div>
      </form>
    </Card>
  );
}
