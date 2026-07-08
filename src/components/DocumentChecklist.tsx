"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Button, Card, Spinner } from "@/components/admin/ui";
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

function statusBadge(
  status: ApiChecklistItem["status"],
  required: boolean,
) {
  if (status === "confirmed") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        Confirmed
      </span>
    );
  }
  if (status === "uploaded") {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
        Uploaded
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        required
          ? "bg-amber-100 text-amber-800"
          : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {required ? "Required" : "Optional"}
    </span>
  );
}

function agentFlagBadge(status: ApiChecklistItem["status"]) {
  const complete = status === "confirmed" || status === "uploaded";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        complete
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800"
      }`}
    >
      {complete ? "Complete" : "Incomplete"}
    </span>
  );
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
      <h2 className="mb-4 font-medium text-zinc-900">
        {flagsOnly ? "Checklist status" : "Document checklist"}
      </h2>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <ul className="divide-y divide-zinc-200">
        {items.map((item) => (
          <li
            key={item.documentTypeId}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="font-medium text-zinc-900">
                {item.documentTypeName}
                {item.isOptionalFlag ? (
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    (optional)
                  </span>
                ) : null}
              </p>
              {!flagsOnly && item.fileName ? (
                <p className="text-xs text-zinc-500">{item.fileName}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {flagsOnly
                ? agentFlagBadge(item.status)
                : statusBadge(item.status, item.isRequired)}
              {(!flagsOnly || uploadApiPath) && item.status !== "confirmed" ? (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
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
                    className="pointer-events-none text-xs"
                    disabled={uploadingId === item.documentTypeId}
                  >
                    {uploadingId === item.documentTypeId
                      ? "Uploading…"
                      : item.status === "pending" || !item.status
                        ? "Upload"
                        : "Replace"}
                  </Button>
                </label>
              ) : null}
              {!flagsOnly &&
              item.documentId &&
              item.status === "uploaded" ? (
                <a
                  href={`/borrower/applications/${applicationId}/documents/${item.documentId}/sign`}
                  className="text-xs text-zinc-900 underline hover:no-underline"
                >
                  Sign
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {items.length === 0 ? (
        <p className="py-4 text-sm text-zinc-500">No checklist items.</p>
      ) : null}
    </Card>
  );
}
