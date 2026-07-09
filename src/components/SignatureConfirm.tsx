"use client";

import { useState } from "react";

import { Alert, Button, Card, ConfirmDialog } from "@/components/ui";

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
      <h2 className="font-display text-lg font-semibold text-ink">{documentName}</h2>
      <p className="mt-2 text-sm text-ink-muted">
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

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm signature"
        message={
          <>
            Are you sure you want to sign{" "}
            <span className="font-medium text-ink">{documentName}</span>? This
            action cannot be undone.
          </>
        }
        confirmLabel={loading ? "Signing…" : "Yes, sign"}
        cancelLabel="Cancel"
        loading={loading}
        onConfirm={() => void handleSign()}
        onCancel={() => setConfirmOpen(false)}
      />
    </Card>
  );
}
