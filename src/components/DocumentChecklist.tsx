"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Modal,
  Spinner,
  Textarea,
} from "@/components/ui";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import type { ChecklistItem as ApiChecklistItem } from "@/lib/documents/checklist";
import {
  canShowConfirmAction,
  canShowRequestRevisionAction,
  canShowSignAction,
  needsRevisionSubtitle,
  uploadedAwaitingSubtitle,
} from "@/lib/documents/checklist-actions";
import { createClient } from "@/lib/supabase/client";
import { CameraCaptureModal } from "@/components/CameraCaptureModal";

/** Document types that offer a live "Take photo" capture option alongside
 * the regular file upload — currently just the borrower selfie. */
const CAMERA_CAPTURE_SLUGS = new Set(["photo_2x2"]);

type DocumentChecklistProps = {
  applicationId: string;
  borrowerId: string;
  stage?: string;
  /** When true, only show completion flags (agent view). */
  flagsOnly?: boolean;
  /** View-only: no upload/replace or sign actions (e.g. CIG attachments). */
  readOnly?: boolean;
  /**
   * Show borrower Sign link for uploaded docs. Defaults to false — requirement
   * uploads are confirmed by CSA (workflow §2.6), not signed by the borrower.
   * Only enable for flows where a borrower click-signature is genuinely required.
   */
  allowSign?: boolean;
  /**
   * Staff confirmation endpoint for uploaded docs (e.g. CSA intake review).
   * When set, rows in `uploaded` state show a Confirm action that POSTs there.
   */
  confirmApiPath?: (documentId: string) => string;
  /**
   * CSA request-revision endpoint. When set, uploaded/confirmed/needs_revision
   * rows show Request revision.
   */
  requestRevisionApiPath?: (documentId: string) => string;
  /** Override checklist fetch URL. */
  checklistApiPath?: string;
  /** Custom upload endpoint for agent uploads on behalf. */
  uploadApiPath?: string;
  /** Pre-loaded items (skips fetch). */
  initialItems?: ApiChecklistItem[];
  onUploadComplete?: () => void;
  /** Override the card heading — required when the same page mounts more than one checklist. */
  title?: string;
  /** Override the card subheading. */
  description?: string;
  /** Override the signed-URL fetch used by "View". Defaults to the borrower's own document endpoint. */
  viewApiPath?: (documentId: string) => string;
  /** Hide rows whose documentTypeSlug is in this list (e.g. LRA auto-generated PDFs). */
  excludeSlugs?: readonly string[];
  /** When set, only show rows whose documentTypeSlug is in this list. */
  includeSlugs?: readonly string[];
  /** Collapsible card header. Defaults to true. */
  collapsible?: boolean;
  /**
   * Initial open state. `"auto"` (default) opens when any item is incomplete,
   * collapses when everything is done.
   */
  defaultCollapsed?: boolean | "auto";
};

type ViewState = {
  item: ApiChecklistItem;
  loading: boolean;
  error: string | null;
  signedUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
};

const EyeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const DownloadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);
const FileIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
);

/** ok = confirmed by staff, pend = uploaded/awaiting or needs revision, miss = not yet submitted. */
function ciState(item: ApiChecklistItem, flagsOnly: boolean): "ok" | "pend" | "miss" {
  if (item.status === "confirmed") return "ok";
  if (item.status === "uploaded" || item.status === "needs_revision") {
    return flagsOnly ? "ok" : "pend";
  }
  return "miss";
}

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const ClockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
    <path d="M12 7v6M12 17h.01" />
  </svg>
);

export function DocumentChecklist({
  applicationId,
  borrowerId,
  stage = "intake",
  flagsOnly = false,
  readOnly = false,
  allowSign = false,
  confirmApiPath,
  requestRevisionApiPath,
  checklistApiPath,
  uploadApiPath,
  initialItems,
  onUploadComplete,
  title,
  description,
  viewApiPath,
  excludeSlugs,
  includeSlugs,
  collapsible = true,
  defaultCollapsed = "auto",
}: DocumentChecklistProps) {
  const canShowSign = allowSign;
  const [items, setItems] = useState<ApiChecklistItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(!initialItems);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [signingItem, setSigningItem] = useState<ApiChecklistItem | null>(
    null,
  );
  const [signing, setSigning] = useState(false);
  const [confirmingItem, setConfirmingItem] = useState<ApiChecklistItem | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [revisingItem, setRevisingItem] = useState<ApiChecklistItem | null>(
    null,
  );
  const [revisionRemarks, setRevisionRemarks] = useState("");
  const [revising, setRevising] = useState(false);
  const [viewState, setViewState] = useState<ViewState | null>(null);
  const [cameraItem, setCameraItem] = useState<ApiChecklistItem | null>(null);
  const [collapsed, setCollapsed] = useState(
    defaultCollapsed === true,
  );
  const [collapseInitialized, setCollapseInitialized] = useState(
    defaultCollapsed !== "auto",
  );

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (initialItems) {
      setItems(initialItems);
      return;
    }
    // Keep current rows visible while refreshing after an upload.
    if (!opts?.silent) setLoading(true);
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
      if (!opts?.silent) setLoading(false);
    }
  }, [applicationId, stage, checklistApiPath, initialItems]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (initialItems) setItems(initialItems);
  }, [initialItems]);

  const exclude = new Set(excludeSlugs ?? []);
  const include =
    includeSlugs && includeSlugs.length > 0
      ? new Set(includeSlugs)
      : null;
  const visibleItems = items.filter((item) => {
    if (exclude.has(item.documentTypeSlug)) return false;
    if (include && !include.has(item.documentTypeSlug)) return false;
    return true;
  });
  const doneCount = visibleItems.filter(
    (item) => ciState(item, flagsOnly) === "ok",
  ).length;
  const totalCount = visibleItems.length;
  const allDone = totalCount > 0 && doneCount === totalCount;

  useEffect(() => {
    if (collapseInitialized || defaultCollapsed !== "auto" || loading) return;
    setCollapsed(allDone);
    setCollapseInitialized(true);
  }, [collapseInitialized, defaultCollapsed, loading, allDone]);

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

      // Optimistic local update so the row doesn't flash back to pending
      // while the checklist reloads / parent refreshes.
      setItems((prev) =>
        prev.map((row) =>
          row.documentTypeId === item.documentTypeId
            ? {
                ...row,
                status: "uploaded",
                fileName: file.name,
                mimeType: file.type || row.mimeType,
                fileSize: file.size,
                revisionRemarks: null,
              }
            : row,
        ),
      );

      if (!initialItems) {
        await load({ silent: true });
      }
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingId(null);
    }
  }

  async function handleSign() {
    if (!signingItem?.documentId) return;
    setSigning(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/documents/${signingItem.documentId}/sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to sign document");
      }
      setItems((prev) =>
        prev.map((row) =>
          row.documentTypeId === signingItem.documentTypeId
            ? { ...row, status: "confirmed" }
            : row,
        ),
      );
      setSigningItem(null);
      if (!initialItems) {
        await load({ silent: true });
      }
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign");
    } finally {
      setSigning(false);
    }
  }

  async function handleConfirm() {
    if (!confirmingItem?.documentId || !confirmApiPath) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(confirmApiPath(confirmingItem.documentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to confirm document");
      }
      setItems((prev) =>
        prev.map((row) =>
          row.documentTypeId === confirmingItem.documentTypeId
            ? { ...row, status: "confirmed" }
            : row,
        ),
      );
      setConfirmingItem(null);
      if (!initialItems) {
        await load({ silent: true });
      }
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  async function handleRequestRevision() {
    if (!revisingItem?.documentId || !requestRevisionApiPath) return;
    const remarks = revisionRemarks.trim();
    if (remarks.length < 3) {
      setError("Remarks must be at least 3 characters");
      return;
    }
    setRevising(true);
    setError(null);
    try {
      const res = await fetch(requestRevisionApiPath(revisingItem.documentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to request revision");
      }
      setItems((prev) =>
        prev.map((row) =>
          row.documentTypeId === revisingItem.documentTypeId
            ? {
                ...row,
                status: "needs_revision",
                revisionRemarks: remarks,
                confirmedBy: null,
                confirmedAt: null,
              }
            : row,
        ),
      );
      setRevisingItem(null);
      setRevisionRemarks("");
      if (!initialItems) {
        await load({ silent: true });
      }
      onUploadComplete?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to request revision",
      );
    } finally {
      setRevising(false);
    }
  }

  async function fetchSignedUrl(documentId: string) {
    const url = viewApiPath
      ? viewApiPath(documentId)
      : `/api/borrower/documents/${documentId}/download`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load document");
    return (await res.json()) as {
      signedUrl: string;
      mimeType: string | null;
      fileName: string | null;
    };
  }

  async function handleView(item: ApiChecklistItem) {
    if (!item.documentId) return;
    const isImage = item.mimeType?.startsWith("image/") ?? false;

    // PDFs / docs / anything else: open in a new tab, no in-app preview.
    if (!isImage) {
      setError(null);
      try {
        const data = await fetchSignedUrl(item.documentId);
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load document");
      }
      return;
    }

    setViewState({
      item,
      loading: true,
      error: null,
      signedUrl: null,
      mimeType: item.mimeType,
      fileName: item.fileName,
    });
    try {
      const data = await fetchSignedUrl(item.documentId);
      setViewState({
        item,
        loading: false,
        error: null,
        signedUrl: data.signedUrl,
        mimeType: data.mimeType ?? item.mimeType,
        fileName: data.fileName ?? item.fileName,
      });
    } catch (err) {
      setViewState({
        item,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load document",
        signedUrl: null,
        mimeType: item.mimeType,
        fileName: item.fileName,
      });
    }
  }

  if (loading) return <Spinner />;

  if (!loading && visibleItems.length === 0 && !error) {
    return null;
  }

  const heading = title ?? (flagsOnly ? "Checklist status" : "Document checklist");
  const sub =
    description ??
    (flagsOnly
      ? "Completion flags for required documents."
      : "Upload the required files — staff confirm each one.");
  const progressLabel =
    totalCount > 0 ? `${doneCount}/${totalCount}` : undefined;
  const isOpen = !collapsible || !collapsed;

  return (
    <Card className="mb-6">
      {collapsible ? (
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 text-left"
          aria-expanded={isOpen}
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-semibold leading-tight text-ink">
                {heading}
              </span>
              {progressLabel ? (
                <span
                  className={`mono text-[11.5px] font-semibold ${
                    allDone ? "text-success" : "text-ink-400"
                  }`}
                >
                  {progressLabel}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-sm leading-snug text-ink-muted">
              {sub}
            </span>
          </span>
          <span
            className="mono mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-base text-teal-600 hover:bg-surface-2"
            aria-hidden
          >
            {isOpen ? "–" : "+"}
          </span>
        </button>
      ) : (
        <>
          <h2 className="mb-0.5 font-display text-lg font-semibold leading-tight text-ink">
            {heading}
            {progressLabel ? (
              <span
                className={`mono ml-2 text-[11.5px] font-semibold ${
                  allDone ? "text-success" : "text-ink-400"
                }`}
              >
                {progressLabel}
              </span>
            ) : null}
          </h2>
          <p className="mb-3 text-sm leading-snug text-ink-muted">{sub}</p>
        </>
      )}

      {isOpen ? (
        <div className={collapsible ? "mt-3" : undefined}>
          {error ? (
            <div className="mb-3">
              <Alert>{error}</Alert>
            </div>
          ) : null}

          {visibleItems.length === 0 ? (
            <EmptyState
              title="No checklist items"
              description="Nothing is required for this stage yet."
              showMark={false}
            />
          ) : (
            <div className="chk-list chk-list--page !max-w-none">
              {visibleItems.map((item) => {
                const state = ciState(item, flagsOnly);
                const canUpload =
                  !readOnly &&
                  (!flagsOnly || uploadApiPath) &&
                  item.status !== "confirmed";
                const showSign = canShowSignAction({
                  allowSign: canShowSign,
                  documentId: item.documentId,
                  status: item.status,
                  readOnly,
                  flagsOnly,
                });
                const showConfirm = canShowConfirmAction({
                  hasConfirmApi: Boolean(confirmApiPath),
                  documentId: item.documentId,
                  status: item.status,
                  readOnly,
                  flagsOnly,
                });
                const showRequestRevision = canShowRequestRevisionAction({
                  hasRequestRevisionApi: Boolean(requestRevisionApiPath),
                  documentId: item.documentId,
                  status: item.status,
                  readOnly,
                  flagsOnly,
                });
                const canView =
                  !!item.documentId &&
                  (item.status === "uploaded" ||
                    item.status === "confirmed" ||
                    item.status === "needs_revision");

                let subtitle: string;
                if (flagsOnly) {
                  subtitle = state === "ok" ? "Complete" : "Incomplete";
                } else if (item.status === "confirmed") {
                  subtitle = item.fileName ?? "Confirmed";
                } else if (item.status === "needs_revision") {
                  subtitle = needsRevisionSubtitle(
                    item.revisionRemarks,
                    item.fileName,
                  );
                } else if (item.status === "uploaded") {
                  subtitle = uploadedAwaitingSubtitle(item.fileName);
                } else {
                  subtitle = item.isRequired ? "Not yet submitted" : "Optional";
                }

                return (
                  <div key={item.documentTypeId} className={`ci ${state}`}>
                    <span className="st">
                      {state === "ok"
                        ? CheckIcon
                        : state === "pend"
                          ? ClockIcon
                          : "·"}
                    </span>
                    <div className="min-w-0 leading-snug">
                      <b>{item.documentTypeName}</b>
                      <span className="break-words">{subtitle}</span>
                    </div>
                    {canUpload ||
                    showSign ||
                    showConfirm ||
                    showRequestRevision ||
                    canView ? (
                      <span className="act flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {canView ? (
                          <button
                            type="button"
                            aria-label="View document"
                            onClick={() => void handleView(item)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] text-ink-400 hover:bg-surface-2 hover:text-ink-700"
                          >
                            <span className="block h-4 w-4">{EyeIcon}</span>
                          </button>
                        ) : null}
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
                              variant="outline"
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
                        {canUpload && CAMERA_CAPTURE_SLUGS.has(item.documentTypeSlug) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={uploadingId === item.documentTypeId}
                            onClick={() => setCameraItem(item)}
                          >
                            Take photo
                          </Button>
                        ) : null}
                        {showSign ? (
                          <button
                            type="button"
                            onClick={() => setSigningItem(item)}
                            className="text-xs font-semibold text-teal-700 underline-offset-2 hover:underline"
                          >
                            Sign
                          </button>
                        ) : null}
                        {showConfirm ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmingItem(item)}
                          >
                            Confirm
                          </Button>
                        ) : null}
                        {showRequestRevision ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRevisionRemarks(item.revisionRemarks ?? "");
                              setRevisingItem(item);
                            }}
                          >
                            Request revision
                          </Button>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={signingItem !== null}
        title="Confirm signature"
        message={
          <>
            Are you sure you want to sign{" "}
            <span className="font-medium text-ink-900">
              {signingItem?.documentTypeName}
            </span>
            ? This action cannot be undone.
          </>
        }
        confirmLabel="Yes, sign"
        cancelLabel="Cancel"
        loading={signing}
        onConfirm={() => void handleSign()}
        onCancel={() => setSigningItem(null)}
      />

      <ConfirmDialog
        open={confirmingItem !== null}
        title="Confirm document"
        message={
          <>
            Mark{" "}
            <span className="font-medium text-ink-900">
              {confirmingItem?.documentTypeName}
            </span>{" "}
            as reviewed and complete? This counts it toward the endorsement
            checklist.
          </>
        }
        confirmLabel="Yes, confirm"
        cancelLabel="Cancel"
        loading={confirming}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirmingItem(null)}
      />

      <Modal
        open={revisingItem !== null}
        title="Request revision"
        onClose={() => {
          if (revising) return;
          setRevisingItem(null);
          setRevisionRemarks("");
        }}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={revising}
              onClick={() => {
                setRevisingItem(null);
                setRevisionRemarks("");
              }}
            >
              Cancel
            </Button>
            <Button
              loading={revising}
              disabled={revisionRemarks.trim().length < 3}
              onClick={() => void handleRequestRevision()}
            >
              Request revision
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-600">
          Keep the current file, mark{" "}
          <span className="font-medium text-ink-900">
            {revisingItem?.documentTypeName}
          </span>{" "}
          as needs revision, and place the application on hold. Remarks are
          shown to the borrower.
        </p>
        <Textarea
          value={revisionRemarks}
          onChange={(e) => setRevisionRemarks(e.target.value)}
          rows={4}
          placeholder="What needs to be fixed?"
        />
      </Modal>

      <Modal
        open={viewState !== null}
        title="View document"
        onClose={() => setViewState(null)}
      >
        {viewState ? (
          <div className="doc-viewer !max-w-none">
            <div className="dvh">
              <span className="block h-3.5 w-3.5 shrink-0">{FileIcon}</span>
              <span className="fn">
                {viewState.fileName ?? viewState.item.documentTypeName}
              </span>
              {viewState.signedUrl ? (
                <div className="sp">
                  <a
                    href={viewState.signedUrl}
                    download={viewState.fileName ?? undefined}
                    aria-label="Download"
                  >
                    <span className="block h-3.5 w-3.5">{DownloadIcon}</span>
                  </a>
                </div>
              ) : null}
            </div>
            <div className="pg-area" style={{ minHeight: 320 }}>
              {viewState.loading ? (
                <Spinner />
              ) : viewState.error ? (
                <Alert>{viewState.error}</Alert>
              ) : viewState.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={viewState.signedUrl}
                  alt={viewState.fileName ?? "Document preview"}
                  className="max-h-[70vh] max-w-full object-contain"
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <CameraCaptureModal
        open={cameraItem !== null}
        onClose={() => setCameraItem(null)}
        onCapture={(file) => {
          if (cameraItem) void handleUpload(cameraItem, file);
        }}
      />
    </Card>
  );
}
