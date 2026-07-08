"use client";

import { useState } from "react";

import { Alert, Button, Card } from "@/components/admin/ui";

type SignatureConfirmProps = {
  documentId: string;
  documentName: string;
  onSigned?: () => void;
};

export function SignatureConfirm({
  documentId,
  documentName,
  onSigned,
}: SignatureConfirmProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSign() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to sign document");
      }
      setSuccess(true);
      setConfirmOpen(false);
      onSigned?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-medium text-zinc-900">{documentName}</h2>
      <p className="mt-2 text-sm text-zinc-600">
        By confirming, you acknowledge that you have reviewed this document and
        agree to its contents. Your signature will be recorded with a timestamp
        and document hash.
      </p>

      {error ? (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {success ? (
        <div className="mt-4">
          <Alert variant="success">Document signed successfully.</Alert>
        </div>
      ) : (
        <div className="mt-6">
          <Button onClick={() => setConfirmOpen(true)} disabled={loading}>
            I confirm / sign
          </Button>
        </div>
      )}

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">
              Confirm signature
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              Are you sure you want to sign{" "}
              <span className="font-medium">{documentName}</span>? This action
              cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleSign()} disabled={loading}>
                {loading ? "Signing…" : "Yes, sign"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
