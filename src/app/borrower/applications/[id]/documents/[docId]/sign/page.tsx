"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Button,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";
import { SignatureConfirm } from "@/components/SignatureConfirm";
import type { ChecklistItem } from "@/lib/documents/checklist";

export default function DocumentSignPage() {
  const params = useParams();
  const applicationId = params.id as string;
  const docId = params.docId as string;

  const [documentName, setDocumentName] = useState<string>("Document");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/borrower/applications/${applicationId}/checklist?stage=intake`,
      );
      if (!res.ok) throw new Error("Failed to load document");
      const data = (await res.json()) as { items: ChecklistItem[] };
      const item = data.items.find((i) => i.documentId === docId);
      if (item) {
        setDocumentName(item.documentTypeName);
      } else {
        throw new Error("Document not found");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applicationId, docId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Sign document"
        description={documentName}
        actions={
          <Link href={`/borrower/applications/${applicationId}`}>
            <Button variant="secondary">Back to checklist</Button>
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : (
        <SignatureConfirm
          documentId={docId}
          documentName={documentName}
          onSigned={() => void load()}
        />
      )}
    </div>
  );
}
