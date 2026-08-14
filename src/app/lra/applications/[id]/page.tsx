"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Input,
  Label,
  PageHeader,
  Spinner,
  Stepper,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { GeneratedDocPanel } from "@/components/documents/GeneratedDocPanel";
import {
  formatStatusLabel,
  statusBadgeVariant,
} from "@/lib/applications/status";
import type { BusinessInfo } from "@/lib/borrowers/business-info";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import {
  PDC_COLLECT_CLOSE_ERROR,
  canConfirmPdcCollection,
  isPostSignForPdcCollect,
} from "@/lib/lra/pdc-collect";
import { releaseStageForPath, type ReleasePath } from "@/lib/lra/constants";
import { releasePipelineSteps } from "@/lib/lra/release-pipeline";
import { createClient } from "@/lib/supabase/client";

type LraWorkspace = {
  application: {
    id: string;
    applicationNo: string | null;
    status: string;
    statusLabel: string;
    blocker: string | null;
    segment: "seafarer" | "sme";
    entityType: "individual" | "corporate" | null;
  };
  borrower: {
    id?: string;
    borrower_no?: string;
    first_name?: string;
    last_name?: string;
    business_info?: BusinessInfo | null;
  } | null;
  releaseFile: {
    id: string;
    status: string;
    release_paths: string[] | null;
    blank_check_from: string | null;
    blank_check_to: string | null;
    atm_bank_name: string | null;
    atm_card_last4: string | null;
    atm_account_number: string | null;
    pdc_collected_at: string | null;
    pdc_collected_by: string | null;
  } | null;
  pdcChecks: Array<{
    check_number: string | null;
    amount: number;
    check_date: string;
    bank_name: string;
    ref_account: string | null;
  }>;
  generatedDocuments: Array<{
    id: string;
    slug: string;
    signedAt: string | null;
    isFinalized: boolean;
    downloadUrl: string | null;
  }>;
  briefing: { acknowledged_at: string | null } | null;
  computation: {
    netReleased: number;
    principal: number;
    monthlyAmortization: number;
    terms: number;
  } | null;
  blriPreview: {
    principal: number;
    totalInterest: number;
    totalLoan: number;
    monthlyAmortization: number;
    particulars: Array<{ label: string; amount: number }>;
  } | null;
  employmentContractPresent: boolean;
  pdcCollectedByName: string | null;
};

type PathChoice = "with_pdc" | "without_pdc";

function pathsFromReleaseFile(
  rf: LraWorkspace["releaseFile"],
): PathChoice[] {
  if (!rf) return [];
  if (!Array.isArray(rf.release_paths) || rf.release_paths.length === 0) {
    return [];
  }
  return rf.release_paths.filter(
    (p): p is PathChoice => p === "with_pdc" || p === "without_pdc",
  );
}

function pathLabelFromPaths(paths: PathChoice[]): string | null {
  if (paths.length === 0) return null;
  const hasPdc = paths.includes("with_pdc");
  const hasAtm = paths.includes("without_pdc");
  if (hasPdc && hasAtm) return "With PDC + ATM Surrender";
  if (hasPdc) return "With PDC";
  if (hasAtm) return "Without PDC";
  return null;
}

function formatMoney(v: number) {
  return v.toLocaleString("en-PH", {
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type CombinedUploadResult = {
  fileName: string;
  count: number;
  remarks: string | null;
  uploadedAt: string;
  uploadedByName: string;
  viewDocumentId: string | null;
};

export default function LraApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [data, setData] = useState<LraWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<PathChoice>>(
    () => new Set<PathChoice>(["with_pdc"]),
  );
  const [pdcDate, setPdcDate] = useState("");
  const [pdcBank, setPdcBank] = useState("");
  const [pdcCheckNo, setPdcCheckNo] = useState("");
  const [blankFrom, setBlankFrom] = useState("");
  const [blankTo, setBlankTo] = useState("");
  const [atmBank, setAtmBank] = useState("");
  const [atmCardLast4, setAtmCardLast4] = useState("");
  const [atmAccountNumber, setAtmAccountNumber] = useState("");
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmPdcCollect, setConfirmPdcCollect] = useState(false);
  const [generatedDocsOpen, setGeneratedDocsOpen] = useState(true);
  const [signingDocId, setSigningDocId] = useState<string | null>(null);
  const [confirmSignDoc, setConfirmSignDoc] = useState<{
    id: string;
    slug: string;
  } | null>(null);
  const [confirmUnsignDoc, setConfirmUnsignDoc] = useState<{
    id: string;
    slug: string;
  } | null>(null);
  const [combinedFile, setCombinedFile] = useState<File | null>(null);
  const [combinedRemarks, setCombinedRemarks] = useState("");
  const [confirmCombinedUpload, setConfirmCombinedUpload] = useState(false);
  const [uploadingCombined, setUploadingCombined] = useState(false);
  const [viewingCombined, setViewingCombined] = useState(false);
  const [combinedUploadResult, setCombinedUploadResult] =
    useState<CombinedUploadResult | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/lra/applications/${applicationId}`);
        if (!res.ok) throw new Error("Failed to load");
        setData((await res.json()) as LraWorkspace);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [applicationId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const rf = data?.releaseFile;
    if (!rf) return;
    const paths = pathsFromReleaseFile(rf);
    if (paths.length > 0) {
      setSelectedPaths(new Set(paths));
    }
    if (rf.atm_bank_name) setAtmBank(rf.atm_bank_name);
    if (rf.atm_card_last4) setAtmCardLast4(rf.atm_card_last4);
    if (rf.atm_account_number) setAtmAccountNumber(rf.atm_account_number);
  }, [data?.releaseFile]);

  useEffect(() => {
    let cancelled = false;
    async function loadCombinedUpload() {
      try {
        const res = await fetch(
          `/api/lra/applications/${applicationId}/signing-documents/combined-upload`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          upload: {
            fileName: string;
            remarks: string | null;
            uploadedAt: string;
            uploadedByName: string;
            viewDocumentId: string | null;
            count: number;
          } | null;
        };
        if (cancelled) return;
        if (!body.upload) {
          setCombinedUploadResult(null);
          return;
        }
        setCombinedUploadResult({
          fileName: body.upload.fileName,
          count: body.upload.count,
          remarks: body.upload.remarks,
          uploadedAt: body.upload.uploadedAt,
          uploadedByName: body.upload.uploadedByName,
          viewDocumentId: body.upload.viewDocumentId,
        });
      } catch {
        // Non-blocking: workspace still loads without the banner.
      }
    }
    void loadCombinedUpload();
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  async function startProcessing() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/lra/applications/${applicationId}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to start");
      setMessage("Release file opened.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  function togglePath(path: PathChoice, checked: boolean) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  async function savePath() {
    if (selectedPaths.size === 0) {
      setError("Select at least one release path.");
      return;
    }
    const releasePaths = Array.from(selectedPaths);
    const includesAtm = selectedPaths.has("without_pdc");
    setSaving(true);
    try {
      const res = await fetch(`/api/lra/applications/${applicationId}/path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releasePaths,
          atmBankName: includesAtm ? atmBank : undefined,
          atmCardLast4: includesAtm ? atmCardLast4 : undefined,
          atmAccountNumber: includesAtm ? atmAccountNumber : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to set path");
      setMessage("Release path saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function submitPdc(e?: FormEvent) {
    e?.preventDefault();
    if (!data?.computation) {
      setError(
        "No signed computation found for this application. A computation must be recorded before a PDC schedule can be saved.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    const terms = data.computation.terms;
    const monthlyAmortization = data.computation.monthlyAmortization;
    const checks = [];
    const baseDate = pdcDate ? new Date(pdcDate) : new Date();
    for (let i = 0; i < terms; i += 1) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      checks.push({
        checkNumber: i === 0 ? pdcCheckNo || null : null,
        amount: monthlyAmortization,
        checkDate: d.toISOString().slice(0, 10),
        bankName: pdcBank || "—",
      });
    }
    try {
      const res = await fetch(`/api/lra/applications/${applicationId}/pdc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checks,
          blankCheckFrom: blankFrom || undefined,
          blankCheckTo: blankTo || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        const msg = body?.error ?? "PDC save failed";
        throw new Error(msg);
      }
      setMessage("PDC schedule saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function generateDocs() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/lra/applications/${applicationId}/generate`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Generation failed");
      setMessage("Documents generated — awaiting borrower signatures.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function markDocSigned(docId: string) {
    setSigningDocId(docId);
    setError(null);
    try {
      const res = await fetch(
        `/api/lra/applications/${applicationId}/documents/${docId}/sign`,
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
        throw new Error(body?.error ?? "Failed to record signature");
      }
      setConfirmSignDoc(null);
      setMessage("Signature recorded.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSigningDocId(null);
    }
  }

  async function unmarkDocSigned(docId: string) {
    setSigningDocId(docId);
    setError(null);
    try {
      const res = await fetch(
        `/api/lra/applications/${applicationId}/documents/${docId}/sign`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to undo signature");
      }
      setConfirmUnsignDoc(null);
      setMessage("Signature undone.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSigningDocId(null);
    }
  }

  async function closeFile() {
    setSaving(true);
    try {
      const res = await fetch(`/api/lra/applications/${applicationId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Close failed");
      }
      setMessage("File closed and queued for AR.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmPhysicalPdcCollected() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/lra/applications/${applicationId}/pdc-collect`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to confirm PDC collection");
      }
      setMessage("Physical PDCs marked as collected.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadCombinedSigningDocuments(file: File) {
    setUploadingCombined(true);
    setError(null);
    setMessage(null);
    try {
      const borrowerId = data?.borrower?.id;
      if (!borrowerId) throw new Error("Borrower not found");

      const supabase = createClient();
      const storagePath = `${borrowerId}/${applicationId}/combined-signing/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(storagePath, file, { upsert: true });

      if (uploadError) throw new Error(uploadError.message);

      const res = await fetch(
        `/api/lra/applications/${applicationId}/signing-documents/combined-upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
            remarks: combinedRemarks.trim() || undefined,
          }),
        },
      );
      const resBody = (await res.json().catch(() => null)) as {
        error?: string;
        count?: number;
        upload?: {
          fileName: string;
          remarks: string | null;
          uploadedAt: string;
          uploadedByName: string;
          viewDocumentId: string | null;
          count: number;
        };
      } | null;

      if (!res.ok) {
        throw new Error(resBody?.error ?? "Combined upload failed");
      }

      setMessage("Signed documents uploaded.");
      if (resBody?.upload) {
        setCombinedUploadResult({
          fileName: resBody.upload.fileName,
          count: resBody.upload.count ?? resBody.count ?? 0,
          remarks: resBody.upload.remarks,
          uploadedAt: resBody.upload.uploadedAt,
          uploadedByName: resBody.upload.uploadedByName,
          viewDocumentId: resBody.upload.viewDocumentId,
        });
      }
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setUploadingCombined(false);
      setCombinedFile(null);
      setCombinedRemarks("");
      setConfirmCombinedUpload(false);
    }
  }

  async function viewCombinedUpload() {
    const documentId = combinedUploadResult?.viewDocumentId;
    if (!documentId) return;
    setViewingCombined(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/download`);
      if (!res.ok) throw new Error("Failed to load document");
      const body = (await res.json()) as { signedUrl: string };
      window.open(body.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document");
    } finally {
      setViewingCombined(false);
    }
  }

  async function releaseFunds() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/lra/applications/${applicationId}/release`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Release failed");
      }
      setMessage("Release recorded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!data) return <Alert>Application not found.</Alert>;

  const rf = data.releaseFile;
  const releasePaths = pathsFromReleaseFile(rf);
  const signingStage = releasePaths[0]
    ? releaseStageForPath(releasePaths[0] as ReleasePath)
    : null;
  const canRelease =
    rf?.status === "ready_release" &&
    Boolean(data.briefing?.acknowledged_at) &&
    Boolean(data.employmentContractPresent);
  const briefingPending = rf?.status === "awaiting_briefing";
  const showReleaseAction = rf?.status === "ready_release";
  const showCloseAction = rf?.status === "released";
  const isClosed = rf?.status === "closed";
  const pdcCollected = Boolean(rf?.pdc_collected_at);
  const showPdcCollectCard =
    rf != null &&
    releasePaths.includes("with_pdc") &&
    (isPostSignForPdcCollect(rf.status) || isClosed);
  const canConfirmPdcCollect =
    rf != null &&
    canConfirmPdcCollection({
      releasePaths,
      status: rf.status,
      pdcCheckCount: data.pdcChecks.length,
      pdcCollectedAt: rf.pdc_collected_at,
    });
  const canClose =
    showCloseAction &&
    (!releasePaths.includes("with_pdc") || pdcCollected);
  const releaseBlockers: string[] = [];
  if (showReleaseAction && !data.briefing?.acknowledged_at) {
    releaseBlockers.push("Briefing sign-off required");
  }
  if (showReleaseAction && !data.employmentContractPresent) {
    releaseBlockers.push("Employment contract must be uploaded");
  }
  const closeBlockers: string[] = [];
  if (
    showCloseAction &&
    releasePaths.includes("with_pdc") &&
    !pdcCollected
  ) {
    closeBlockers.push(PDC_COLLECT_CLOSE_ERROR);
  }

  const companyName = data.borrower?.business_info?.companyName?.trim();
  const personalName =
    data.borrower?.first_name || data.borrower?.last_name
      ? `${data.borrower.first_name ?? ""} ${data.borrower.last_name ?? ""}`.trim()
      : "Borrower";
  const borrowerLabel =
    data.application.segment === "sme" && companyName
      ? companyName
      : personalName;
  const isSme = data.application.segment === "sme";
  const appNo =
    data.application.applicationNo ??
    data.borrower?.borrower_no ??
    applicationId.slice(0, 8);
  const pathLabel = pathLabelFromPaths(releasePaths);

  const pipelineSteps = rf
    ? releasePipelineSteps(rf.status, releasePaths)
    : [];

  const nextAction =
    data.application.blocker ??
    (rf ? formatStatusLabel(rf.status) : "Open this file to begin LRA processing.");

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "LRA queue", href: "/lra" },
          { label: borrowerLabel },
        ]}
      />
      <PageHeader
        title={borrowerLabel}
        description={appNo}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant={isSme ? "navy" : "teal"} dot>
          {isSme ? "SME" : "Seafarer"}
        </Badge>
        <Badge variant={statusBadgeVariant(data.application.status)} dot>
          {data.application.statusLabel ??
            formatStatusLabel(data.application.status)}
        </Badge>
        {pathLabel ? (
          <Badge variant="navy" dot>
            {pathLabel}
          </Badge>
        ) : null}
        {data.borrower?.borrower_no ? (
          <span className="id">{data.borrower.borrower_no}</span>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-4">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      {!isClosed ? (
        <div className="banner warn mb-6">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          {nextAction}
        </div>
      ) : (
        <div className="banner mb-6">
          <span className="badge badge-success">Closed</span>
          File closed and transmitted.{" "}
          <Link href="/lra">Back to LRA queue</Link>
        </div>
      )}

      {data.computation ? (
        <Card variant="gradient" className="mb-6">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-navy-200">
            Loan summary
          </p>
          <div className="mt-2 mono text-[26px] font-semibold tracking-[-0.01em]">
            ₱{formatMoney(data.computation.netReleased)}
          </div>
          <p className="mt-1 text-sm text-navy-200">Net release</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/20 pt-3 text-sm">
            <div>
              <span className="text-navy-200">Principal </span>
              <span className="mono font-semibold">
                ₱{formatMoney(data.computation.principal)}
              </span>
            </div>
            <div>
              <span className="text-navy-200">Monthly </span>
              <span className="mono font-semibold">
                ₱{formatMoney(data.computation.monthlyAmortization)}
              </span>
            </div>
            <div>
              <span className="text-navy-200">Terms </span>
              <span className="mono font-semibold">
                {data.computation.terms} mo
              </span>
            </div>
          </div>
        </Card>
      ) : null}

      {!rf ? (
        <Card>
          <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
            Start processing
          </h2>
          <p className="mb-3 text-sm text-ink-500">
            Open this file to begin LRA documentation and release.
          </p>
          <Button loading={saving} onClick={() => void startProcessing()}>
            Start processing
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="overflow-x-auto">
            <h2 className="mb-4 font-display text-lg font-semibold text-navy-900">
              Release pipeline
            </h2>
            <Stepper steps={pipelineSteps} />
          </Card>

          {rf.status === "awaiting_path" ? (
            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                Release path
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                Choose how funds will be released for this file. You may select
                both when PDC and ATM surrender apply together.
              </p>
              <div className="flex flex-col gap-2">
                <Checkbox
                  label="With PDC"
                  checked={selectedPaths.has("with_pdc")}
                  onChange={(checked) => togglePath("with_pdc", checked)}
                />
                <Checkbox
                  label="Without PDC (ATM surrender)"
                  checked={selectedPaths.has("without_pdc")}
                  onChange={(checked) => togglePath("without_pdc", checked)}
                />
              </div>
              {selectedPaths.has("without_pdc") ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label required>ATM bank name</Label>
                    <Input
                      value={atmBank}
                      onChange={(e) => setAtmBank(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label required>ATM card last 4 digits</Label>
                    <Input
                      value={atmCardLast4}
                      onChange={(e) =>
                        setAtmCardLast4(
                          e.target.value.replace(/\D/g, "").slice(0, 4),
                        )
                      }
                      maxLength={4}
                      required
                      className="mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label required>ATM account number</Label>
                    <Input
                      value={atmAccountNumber}
                      onChange={(e) => setAtmAccountNumber(e.target.value)}
                      required
                      className="mono"
                    />
                  </div>
                </div>
              ) : null}
              {selectedPaths.size === 0 ? (
                <p className="mt-2 text-sm text-warning">
                  Select at least one release path.
                </p>
              ) : null}
              <Button
                className="mt-3"
                loading={saving}
                disabled={selectedPaths.size === 0}
                onClick={() => void savePath()}
              >
                Save path
              </Button>
            </Card>
          ) : null}

          {rf.status === "pdc_encoding" &&
          releasePaths.includes("with_pdc") ? (
            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                PDC encoding
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                Enter the first check details — remaining dates are generated
                from the approved loan term and monthly amortization.
              </p>
              <form
                onSubmit={(e) => void submitPdc(e)}
                className="grid gap-3 sm:grid-cols-2"
              >
                <div>
                  <Label>Number of checks</Label>
                  <Input
                    type="number"
                    value={data.computation?.terms ?? ""}
                    disabled
                    className="mono"
                  />
                  {data.computation?.terms != null ? (
                    <p className="mt-1 text-xs text-ink-500">
                      Loan terms: {data.computation.terms} amortizations
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label>Monthly amount</Label>
                  <Input
                    type="text"
                    value={
                      data.computation?.monthlyAmortization != null
                        ? `₱${formatMoney(data.computation.monthlyAmortization)}`
                        : ""
                    }
                    disabled
                    className="mono"
                  />
                </div>
                <div>
                  <Label>First check date</Label>
                  <Input
                    type="date"
                    value={pdcDate}
                    onChange={(e) => setPdcDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label required>Bank name</Label>
                  <Input
                    value={pdcBank}
                    onChange={(e) => setPdcBank(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>First check number</Label>
                  <Input
                    value={pdcCheckNo}
                    onChange={(e) => setPdcCheckNo(e.target.value)}
                    className="mono"
                  />
                </div>
                <div>
                  <Label>Blank check from</Label>
                  <Input
                    value={blankFrom}
                    onChange={(e) => setBlankFrom(e.target.value)}
                    className="mono"
                  />
                </div>
                <div>
                  <Label>Blank check to</Label>
                  <Input
                    value={blankTo}
                    onChange={(e) => setBlankTo(e.target.value)}
                    className="mono"
                  />
                </div>
                <Button type="submit" loading={saving}>
                  Save PDC schedule
                </Button>
              </form>
            </Card>
          ) : null}

          {data.pdcChecks.length > 0 ? (
            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                PDC schedule
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                {data.pdcChecks.length} checks
                {rf.blank_check_from && rf.blank_check_to
                  ? ` · blank range ${rf.blank_check_from}–${rf.blank_check_to}`
                  : ""}
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>Check no.</Th>
                      <Th>Date</Th>
                      <Th>Bank</Th>
                      <Th className="num">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pdcChecks.map((check, index) => (
                      <tr key={`${check.check_date}-${index}`}>
                        <Td className="mono">{index + 1}</Td>
                        <Td className="mono">
                          {check.check_number ?? "—"}
                        </Td>
                        <Td className="mono">
                          {formatDate(check.check_date)}
                        </Td>
                        <Td>{check.bank_name}</Td>
                        <Td className="num">
                          {formatMoney(Number(check.amount))}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          ) : null}

          {showPdcCollectCard ? (
            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                Physical PDC collection
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                Confirm the encoded checks were physically collected from the
                borrower. Encoding and collection are separate steps.
              </p>
              <p className="mb-3 text-sm text-ink-700">
                Encoded schedule:{" "}
                <span className="mono font-medium">
                  {data.pdcChecks.length}
                </span>{" "}
                check{data.pdcChecks.length === 1 ? "" : "s"}
                {rf.blank_check_from && rf.blank_check_to
                  ? ` · blank range ${rf.blank_check_from}–${rf.blank_check_to}`
                  : ""}
              </p>
              {pdcCollected ? (
                <Alert variant="success">
                  Collected
                  {rf.pdc_collected_at
                    ? ` on ${new Date(rf.pdc_collected_at).toLocaleString()}`
                    : ""}
                  {data.pdcCollectedByName
                    ? ` · ${data.pdcCollectedByName}`
                    : ""}
                </Alert>
              ) : (
                <>
                  <div className="banner warn mb-3">
                    <span>Pending: physical PDCs not yet collected</span>
                  </div>
                  <Button
                    loading={saving}
                    disabled={!canConfirmPdcCollect}
                    onClick={() => setConfirmPdcCollect(true)}
                  >
                    Confirm physical PDCs collected
                  </Button>
                  <ConfirmDialog
                    open={confirmPdcCollect}
                    title="Confirm physical PDCs collected?"
                    message={`Confirm that all ${data.pdcChecks.length} encoded post-dated check(s) have been physically collected from the borrower. This is required before closing the file to Accounting.`}
                    confirmLabel="Yes, confirm collected"
                    loading={saving}
                    onCancel={() => setConfirmPdcCollect(false)}
                    onConfirm={() => {
                      void confirmPhysicalPdcCollected().then(() =>
                        setConfirmPdcCollect(false),
                      );
                    }}
                  />
                </>
              )}
            </Card>
          ) : null}

          {["ready_generate", "awaiting_signatures"].includes(rf.status) ? (
            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                Generate documents
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                Create the release packet for borrower signature.
              </p>
              {data.blriPreview ? (
                <div className="mb-3 rounded-[var(--r-md)] border border-line-soft bg-surface-2 p-3 text-sm text-ink-500">
                  BLRI preview: principal{" "}
                  <span className="mono text-teal-600">
                    {formatMoney(data.blriPreview.principal)}
                  </span>
                  , interest{" "}
                  <span className="mono text-teal-600">
                    {formatMoney(data.blriPreview.totalInterest)}
                  </span>
                  , total loan{" "}
                  <span className="mono font-bold text-teal-600">
                    {formatMoney(data.blriPreview.totalLoan)}
                  </span>
                </div>
              ) : null}
              <Button loading={saving} onClick={() => void generateDocs()}>
                {data.generatedDocuments.length > 0
                  ? "Regenerate release documents"
                  : "Generate release documents"}
              </Button>
            </Card>
          ) : null}

          {data.generatedDocuments.length > 0 ? (
            <Card>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 text-left"
                aria-expanded={generatedDocsOpen}
                onClick={() => setGeneratedDocsOpen((o) => !o)}
              >
                <span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold text-navy-900">
                      Generated documents
                    </span>
                    <span
                      className={`mono text-[11.5px] font-semibold ${
                        data.generatedDocuments.every((d) => d.signedAt)
                          ? "text-success"
                          : "text-ink-400"
                      }`}
                    >
                      {
                        data.generatedDocuments.filter((d) => d.signedAt)
                          .length
                      }
                      /{data.generatedDocuments.length}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-ink-500">
                    Facilitate the in-branch signing session — mark each
                    document once the borrower has signed it.
                  </span>
                </span>
                <span
                  className="mono mt-1 shrink-0 text-base text-teal-600"
                  aria-hidden
                >
                  {generatedDocsOpen ? "–" : "+"}
                </span>
              </button>
              {generatedDocsOpen ? (
                <div className="chk-list chk-list--page mt-3 !max-w-none">
                  {data.generatedDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={`ci ${doc.signedAt ? "ok" : "pend"}`}
                    >
                      <span className="st">
                        {doc.signedAt ? (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                          >
                            <circle cx="12" cy="12" r="9" />
                          </svg>
                        )}
                      </span>
                      <div>
                        <b className="capitalize">
                          {doc.slug.replace(/_/g, " ")}
                        </b>
                        <span>
                          {doc.signedAt
                            ? `Signed ${new Date(doc.signedAt).toLocaleString()}`
                            : "Awaiting in-branch signature"}
                        </span>
                      </div>
                      <span className="act flex items-center gap-2">
                        {doc.downloadUrl ? (
                          <a
                            href={doc.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-teal-700 hover:underline"
                          >
                            PDF
                          </a>
                        ) : null}
                        {!doc.signedAt &&
                        rf.status === "awaiting_signatures" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={signingDocId === doc.id}
                            onClick={() =>
                              setConfirmSignDoc({ id: doc.id, slug: doc.slug })
                            }
                          >
                            Mark signed
                          </Button>
                        ) : null}
                        {doc.signedAt &&
                        (rf.status === "awaiting_signatures" ||
                          (rf.status === "awaiting_briefing" &&
                            !data.briefing?.acknowledged_at)) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={signingDocId === doc.id}
                            onClick={() =>
                              setConfirmUnsignDoc({
                                id: doc.id,
                                slug: doc.slug,
                              })
                            }
                          >
                            Unmark signed
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <ConfirmDialog
                open={confirmSignDoc !== null}
                title="Record borrower signature?"
                message={
                  <>
                    Confirm the borrower has physically signed{" "}
                    <span className="font-medium capitalize text-ink-900">
                      {confirmSignDoc?.slug.replace(/_/g, " ")}
                    </span>{" "}
                    during the in-branch session. You are recorded as the
                    witnessing LRA. You can undo this before the briefing is
                    acknowledged.
                  </>
                }
                confirmLabel="Yes, mark signed"
                cancelLabel="Cancel"
                loading={signingDocId === confirmSignDoc?.id}
                onCancel={() => setConfirmSignDoc(null)}
                onConfirm={() => {
                  if (confirmSignDoc) void markDocSigned(confirmSignDoc.id);
                }}
              />

              <ConfirmDialog
                open={confirmUnsignDoc !== null}
                title="Undo recorded signature?"
                message={
                  <>
                    The borrower will need to sign{" "}
                    <span className="font-medium capitalize text-ink-900">
                      {confirmUnsignDoc?.slug.replace(/_/g, " ")}
                    </span>{" "}
                    again during the in-branch session.
                    {rf.status === "awaiting_briefing" ? (
                      <>
                        {" "}
                        This file will move back to the signing stage until all
                        documents are signed again.
                      </>
                    ) : null}
                  </>
                }
                confirmLabel="Yes, unmark signed"
                cancelLabel="Cancel"
                loading={signingDocId === confirmUnsignDoc?.id}
                onCancel={() => setConfirmUnsignDoc(null)}
                onConfirm={() => {
                  if (confirmUnsignDoc) void unmarkDocSigned(confirmUnsignDoc.id);
                }}
              />
            </Card>
          ) : null}

          {briefingPending ? (
            <div className="banner warn">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Hand off to the Collection Head — the briefing must be checked
              off in the Collection portal before release.
            </div>
          ) : null}

          {showReleaseAction ? (
            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                {!releasePaths.includes("with_pdc") &&
                releasePaths.includes("without_pdc")
                  ? "Release cash"
                  : "Release check / cash"}
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                Record disbursement only after funds have been handed over.
              </p>
              <Button
                loading={saving}
                disabled={!canRelease}
                onClick={() => setConfirmRelease(true)}
              >
                Record release
              </Button>
              {!canRelease && releaseBlockers.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warning">
                  {releaseBlockers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}

              <ConfirmDialog
                open={confirmRelease}
                title="Record this release?"
                message={
                  data.computation
                    ? `This records the disbursement of ${formatMoney(
                        data.computation.netReleased,
                      )} to the borrower. Make sure the check or cash has actually been handed over — this cannot be undone from this screen.`
                    : "This records the disbursement of loan proceeds to the borrower. This cannot be undone from this screen."
                }
                confirmLabel="Yes, record release"
                loading={saving}
                onCancel={() => setConfirmRelease(false)}
                onConfirm={() => {
                  void releaseFunds().then(() => setConfirmRelease(false));
                }}
              />
            </Card>
          ) : null}

          {showCloseAction ? (
            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                Close & transmit
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                Upload the signed check voucher on the release checklist below,
                then close the file to queue it for AR.
              </p>
              <Button
                loading={saving}
                disabled={!canClose}
                onClick={() => setConfirmClose(true)}
              >
                Close file
              </Button>
              {!canClose && closeBlockers.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warning">
                  {closeBlockers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}

              <ConfirmDialog
                open={confirmClose}
                title="Close this file?"
                message="Confirm the signed check voucher has been uploaded on the release checklist below. Closing queues the file for AR and ends LRA processing."
                confirmLabel="Yes, close file"
                loading={saving}
                onCancel={() => setConfirmClose(false)}
                onConfirm={() => {
                  void closeFile().then(() => setConfirmClose(false));
                }}
              />
            </Card>
          ) : null}

          {isClosed ? (
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
                Transmitted to AR
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                LRA processing is complete for this file.
              </p>
              <Link href="/lra">
                <Button variant="secondary">Back to LRA queue</Button>
              </Link>
            </Card>
          ) : null}

          {data.borrower?.id && signingStage ? (
            <DocumentChecklist
              applicationId={applicationId}
              borrowerId={data.borrower.id as string}
              stage="intake"
              title="Employment contract"
              description="Required before release (§2.6). Upload here if it was not collected at CSA intake."
              includeSlugs={["contract"]}
              checklistApiPath={`/api/lra/applications/${applicationId}/checklist?stage=intake`}
              uploadApiPath={`/api/lra/applications/${applicationId}/documents`}
              viewApiPath={(documentId) =>
                `/api/documents/${documentId}/download`
              }
              onUploadComplete={() => void load({ silent: true })}
            />
          ) : null}

          {data.borrower?.id && signingStage ? (
            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                Signed documents
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                Scan all signed papers from this session into one file and
                upload once.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    disabled={uploadingCombined}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setCombinedFile(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    className="pointer-events-none"
                    disabled={uploadingCombined}
                  >
                    Choose file
                  </Button>
                </label>
                {combinedFile ? (
                  <span className="min-w-0 truncate text-sm text-ink-500">
                    {combinedFile.name}
                  </span>
                ) : (
                  <span className="text-sm text-ink-400">No file chosen</span>
                )}
              </div>
              <div className="mt-3">
                <Label htmlFor="combined-signing-remarks">
                  Remarks (optional)
                </Label>
                <Textarea
                  id="combined-signing-remarks"
                  className="mt-1"
                  rows={2}
                  maxLength={2000}
                  value={combinedRemarks}
                  disabled={uploadingCombined}
                  onChange={(e) => setCombinedRemarks(e.target.value)}
                  placeholder="Optional notes about this upload"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  loading={uploadingCombined}
                  disabled={!combinedFile || uploadingCombined}
                  onClick={() => setConfirmCombinedUpload(true)}
                >
                  Upload signed documents
                </Button>
              </div>
              {combinedUploadResult ? (
                <div className="mt-3">
                  <Alert variant="success">
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>
                          Uploaded <b>{combinedUploadResult.fileName}</b>
                        </span>
                        {combinedUploadResult.viewDocumentId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            loading={viewingCombined}
                            onClick={() => void viewCombinedUpload()}
                          >
                            View file
                          </Button>
                        ) : null}
                      </p>
                      <p className="text-sm">
                        by {combinedUploadResult.uploadedByName} on{" "}
                        {formatDateTime(combinedUploadResult.uploadedAt)}
                        {combinedUploadResult.count > 0
                          ? ` — marked ${combinedUploadResult.count} document${
                              combinedUploadResult.count === 1 ? "" : "s"
                            } as signed.`
                          : "."}
                      </p>
                      {combinedUploadResult.remarks ? (
                        <p className="text-sm">
                          Remarks: {combinedUploadResult.remarks}
                        </p>
                      ) : null}
                    </div>
                  </Alert>
                </div>
              ) : null}
              <ConfirmDialog
                open={confirmCombinedUpload}
                title="Upload signed documents?"
                message="This will upload one file and mark it as the signed copy for all remaining signing-stage and release-checklist requirements. Continue?"
                confirmLabel="Yes, upload"
                loading={uploadingCombined}
                onCancel={() => {
                  setConfirmCombinedUpload(false);
                  setCombinedFile(null);
                }}
                onConfirm={() => {
                  if (combinedFile) {
                    void uploadCombinedSigningDocuments(combinedFile);
                  }
                }}
              />
            </Card>
          ) : null}

          <GeneratedDocPanel
            title="Acknowledgement Receipt"
            description="Borrower's confirmation of funds received (check/cash aware)."
            endpoint={`/api/lra/applications/${applicationId}/acknowledgement-receipt`}
            generateLabel="Generate receipt"
          />

          <GeneratedDocPanel
            title="Final Computation Sheet"
            description="Original-vs-renegotiated computation summary."
            endpoint={`/api/lra/applications/${applicationId}/final-computation-sheet`}
            generateLabel="Generate sheet"
          />
        </div>
      )}
    </div>
  );
}
