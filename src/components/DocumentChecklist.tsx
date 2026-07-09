"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  DocumentRow,
  EmptyState,
  Spinner,
} from "@/components/ui";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import type { ChecklistItem as ApiChecklistItem } from "@/lib/documents/checklist";
import { createClient } from "@/lib/supabase/client";

type DocumentChecklistProps = {
  applicationId: string;
  borrowerId: string;
  stage?: string;
  /** When true, only show completion flags (agent view). */
  flagsOnly?: boolean;
  /** Override checklist fetch URL. */
  checklistApiPath?: string;
  /** Custom upload endpoint for agent uploads on behalf. */
  uploadApiPath?: string;
  /** Pre-loaded items (skips fetch). */
  initialItems?: ApiChecklistItem[];
  onUploadComplete?: () => void;
};

function rowStatus(
  item: ApiChecklistItem,
  flagsOnly: boolean,
): "confirmed" | "uploaded" | "required" | "optional" | "complete" | "incomplete" {
  if (flagsOnly) {
    return item.status === "confirmed" || item.status === "uploaded"
      ? "complete"
      : "incomplete";
  }
  if (item.status === "confirmed") return "confirmed";
  if (item.status === "uploaded") return "uploaded";
  return item.isRequired ? "required" : "optional";
}

export function DocumentChecklist({
  applicationId,
  borrowerId,
  stage = "intake",
  flagsOnly = false,
  checklistApiPath,
  uploadApiPath,
  initialItems,
  onUploadComplete,
}: DocumentChecklistProps) {
  const [items, setItems] = useState<ApiChecklistItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(!initialItems);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (initialItems) {
      setItems(initialItems);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url =
        checklistApiPath ??
        `/api/borrower/applications/${applicationId}/checklist?stage=${stage}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load checklist");
      const data = (await res.json()) as { items: ApiChecklistItem[] };
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applicationId, stage, checklistApiPath, initialItems]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (initialItems) setItems(initialItems);
  }, [initialItems]);

  async function handleUpload(item: ApiChecklistItem, file: File) {
    setUploadingId(item.documentTypeId);
    setError(null);
    try {
      const supabase = createClient();
      const tempPath = `${borrowerId}/${applicationId}/${item.documentTypeSlug}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(tempPath, file, { upsert: true });

      if (uploadError) throw new Error(uploadError.message);

      const endpoint =
        uploadApiPath ??
        `/api/borrower/applications/${applicationId}/documents`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentTypeId: item.documentTypeId,
          stage: item.stage,
          storagePath: tempPath,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to save document metadata");
      }

      if (!initialItems) {
        await load();
      }
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingId(null);
    }
  }

  if (loading) return <Spinner />;

  return (
    <Card>
      <h2 className="mb-1 font-display text-lg font-semibold text-ink">
        {flagsOnly ? "Checklist status" : "Document checklist"}
      </h2>
      <p className="mb-4 text-sm text-ink-muted">
        {flagsOnly
          ? "Completion flags for required documents."
          : "Upload required files, then sign where indicated."}
      </p>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="No checklist items"
          description="Nothing is required for this stage yet."
          showMark={false}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const canUpload =
              (!flagsOnly || uploadApiPath) && item.status !== "confirmed";
            const showSign =
              !flagsOnly &&
              item.documentId &&
              item.status === "uploaded";

            return (
              <li key={item.documentTypeId}>
                <DocumentRow
                  title={
                    item.isOptionalFlag
                      ? `${item.documentTypeName} (optional)`
                      : item.documentTypeName
                  }
                  status={rowStatus(item, flagsOnly)}
                  subtitle={!flagsOnly && item.fileName ? item.fileName : undefined}
                  action={
                    canUpload || showSign ? (
                      <>
                        {canUpload ? (
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              className="sr-only"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                              disabled={uploadingId === item.documentTypeId}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleUpload(item, file);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              className="pointer-events-none"
                              loading={uploadingId === item.documentTypeId}
                              disabled={uploadingId === item.documentTypeId}
                            >
                              {item.status === "pending" || !item.status
                                ? "Upload"
                                : "Replace"}
                            </Button>
                          </label>
                        ) : null}
                        {showSign ? (
                          <a
                            href={`/borrower/applications/${applicationId}/documents/${item.documentId}/sign`}
                            className="text-xs font-semibold text-gold-600 underline-offset-2 hover:underline"
                          >
                            Sign
                          </a>
                        ) : null}
                      </>
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
