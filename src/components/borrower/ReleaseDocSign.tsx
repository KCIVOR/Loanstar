"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Button, Card } from "@/components/admin/ui";

type ReleaseDoc = {
  id: string;
  document_slug: string;
  signed_at: string | null;
};

type ReleaseDocSignProps = {
  applicationId: string;
  onSigned: () => void;
};

export function ReleaseDocSign({ applicationId, onSigned }: ReleaseDocSignProps) {
  const [documents, setDocuments] = useState<ReleaseDoc[]>([]);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/borrower/applications/${applicationId}/release-documents`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        documents: ReleaseDoc[];
        blocker: string | null;
        releaseFile: { status: string } | null;
      };
      setDocuments(data.documents);
      setBlocker(data.blocker);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || documents.length === 0) return null;

  async function sign(docId: string) {
    setSigningId(docId);
    setError(null);
    try {
      const res = await fetch(
        `/api/borrower/applications/${applicationId}/release-documents/${docId}/sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Sign failed");
      onSigned();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign failed");
    } finally {
      setSigningId(null);
    }
  }

  const pending = documents.filter((d) => !d.signed_at);

  return (
    <Card className="mb-6">
      <h2 className="mb-2 text-lg font-semibold text-neutral-900">Release documents</h2>
      {blocker ? (
        <p className="mb-3 text-sm text-warning-700">{blocker}</p>
      ) : null}
      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <ul className="space-y-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between border-b border-neutral-100 py-2 text-sm"
          >
            <span className="capitalize">{doc.document_slug.replace(/_/g, " ")}</span>
            {doc.signed_at ? (
              <span className="text-success-700">Signed</span>
            ) : (
              <Button
                variant="secondary"
                disabled={signingId === doc.id}
                onClick={() => void sign(doc.id)}
              >
                {signingId === doc.id ? "Signing…" : "Confirm / sign"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {pending.length === 0 ? (
        <div className="mt-3">
          <Alert variant="success">All release documents signed.</Alert>
        </div>
      ) : null}
    </Card>
  );
}
