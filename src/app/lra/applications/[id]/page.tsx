"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
} from "@/components/admin/ui";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { formatStatusLabel } from "@/lib/applications/status";
import { releaseStageForPath, type ReleasePath } from "@/lib/lra/constants";

type LraWorkspace = {
  application: {
    id: string;
    applicationNo: string | null;
    status: string;
    statusLabel: string;
    blocker: string | null;
  };
  borrower: { id?: string; borrower_no?: string; first_name?: string; last_name?: string } | null;
  releaseFile: {
    id: string;
    status: string;
    release_path: string | null;
    blank_check_from: string | null;
    blank_check_to: string | null;
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
};

function formatMoney(v: number) {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function LraApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [data, setData] = useState<LraWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [releasePath, setReleasePath] = useState<"with_pdc" | "without_pdc">("with_pdc");
  const [pdcAmount, setPdcAmount] = useState("");
  const [pdcDate, setPdcDate] = useState("");
  const [pdcBank, setPdcBank] = useState("");
  const [pdcCheckNo, setPdcCheckNo] = useState("");
  const [blankFrom, setBlankFrom] = useState("");
  const [blankTo, setBlankTo] = useState("");
  const [atmBank, setAtmBank] = useState("");
  const [atmCardLast4, setAtmCardLast4] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lra/applications/${applicationId}`);
      if (!res.ok) throw new Error("Failed to load");
      setData((await res.json()) as LraWorkspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startProcessing() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/lra/applications/${applicationId}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start");
      setMessage("Release file opened.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function savePath() {
    setSaving(true);
    try {
      const res = await fetch(`/api/lra/applications/${applicationId}/path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releasePath,
          atmBankName: releasePath === "without_pdc" ? atmBank : undefined,
          atmCardLast4: releasePath === "without_pdc" ? atmCardLast4 : undefined,
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

  async function submitPdc(e: FormEvent) {
    e.preventDefault();
    if (!data?.computation) return;
    setSaving(true);
    const checks = [];
    const terms = data.computation.terms;
    const baseDate = pdcDate ? new Date(pdcDate) : new Date();
    for (let i = 0; i < terms; i += 1) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      checks.push({
        checkNumber: i === 0 ? pdcCheckNo || null : null,
        amount: Number(pdcAmount) || data.computation.monthlyAmortization,
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
      if (!res.ok) throw new Error("PDC save failed");
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
      const res = await fetch(`/api/lra/applications/${applicationId}/generate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Generation failed");
      setMessage("Documents generated — awaiting borrower signatures.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
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
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
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

  async function releaseFunds() {
    setSaving(true);
    try {
      const res = await fetch(`/api/lra/applications/${applicationId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
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
  const signingStage = rf?.release_path
    ? releaseStageForPath(rf.release_path as ReleasePath)
    : null;
  const canRelease = rf?.status === "ready_release" && data.briefing?.acknowledged_at;
  const briefingPending = rf?.status === "awaiting_briefing";

  return (
    <div>
      <PageHeader
        title={data.application.applicationNo ?? "Release file"}
        description={data.application.statusLabel}
        actions={
          <Link href="/lra">
            <Button variant="secondary">Back to queue</Button>
          </Link>
        }
      />

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {message ? <div className="mb-4"><Alert variant="success">{message}</Alert></div> : null}

      <Card className="mb-6">
        <p className="text-sm text-zinc-500">Borrower blocker</p>
        <p className="font-medium text-zinc-900">
          {data.application.blocker ?? formatStatusLabel(data.application.status)}
        </p>
        {data.computation ? (
          <p className="mt-2 text-sm text-zinc-600">
            Net release {formatMoney(data.computation.netReleased)} ·{" "}
            {data.computation.terms} × {formatMoney(data.computation.monthlyAmortization)}
          </p>
        ) : null}
      </Card>

      {!rf ? (
        <Card>
          <p className="mb-3 text-sm text-zinc-600">Open this file to begin LRA processing.</p>
          <Button disabled={saving} onClick={() => void startProcessing()}>
            Start processing
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {rf.status === "awaiting_path" ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">Release path</h2>
              <Select
                value={releasePath}
                onChange={(e) => setReleasePath(e.target.value as typeof releasePath)}
              >
                <option value="with_pdc">With PDC</option>
                <option value="without_pdc">Without PDC (ATM surrender)</option>
              </Select>
              {releasePath === "without_pdc" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>ATM bank name</Label>
                    <Input
                      value={atmBank}
                      onChange={(e) => setAtmBank(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>ATM card last 4 digits</Label>
                    <Input
                      value={atmCardLast4}
                      onChange={(e) => setAtmCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      maxLength={4}
                      required
                    />
                  </div>
                </div>
              ) : null}
              <Button className="mt-3" disabled={saving} onClick={() => void savePath()}>
                Save path
              </Button>
            </Card>
          ) : null}

          {rf.status === "pdc_encoding" && rf.release_path === "with_pdc" ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">PDC encoding</h2>
              <form onSubmit={(e) => void submitPdc(e)} className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Monthly amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={pdcAmount}
                    placeholder={String(data.computation?.monthlyAmortization ?? "")}
                    onChange={(e) => setPdcAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>First check date</Label>
                  <Input type="date" value={pdcDate} onChange={(e) => setPdcDate(e.target.value)} />
                </div>
                <div>
                  <Label>Bank name</Label>
                  <Input value={pdcBank} onChange={(e) => setPdcBank(e.target.value)} required />
                </div>
                <div>
                  <Label>First check number</Label>
                  <Input value={pdcCheckNo} onChange={(e) => setPdcCheckNo(e.target.value)} />
                </div>
                <div>
                  <Label>Blank check from</Label>
                  <Input value={blankFrom} onChange={(e) => setBlankFrom(e.target.value)} />
                </div>
                <div>
                  <Label>Blank check to</Label>
                  <Input value={blankTo} onChange={(e) => setBlankTo(e.target.value)} />
                </div>
                <Button type="submit" disabled={saving}>Save PDC schedule</Button>
              </form>
            </Card>
          ) : null}

          {["ready_generate", "awaiting_signatures"].includes(rf.status) ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">Generate documents</h2>
              {data.blriPreview ? (
                <div className="mb-3 text-sm text-zinc-600">
                  BLRI preview: principal {formatMoney(data.blriPreview.principal)}, interest{" "}
                  {formatMoney(data.blriPreview.totalInterest)}, total loan{" "}
                  {formatMoney(data.blriPreview.totalLoan)}
                </div>
              ) : null}
              <Button disabled={saving} onClick={() => void generateDocs()}>
                Generate release documents
              </Button>
            </Card>
          ) : null}

          {data.generatedDocuments.length > 0 ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">Generated documents</h2>
              <ul className="space-y-2 text-sm">
                {data.generatedDocuments.map((doc) => (
                  <li key={doc.id} className="flex justify-between gap-2">
                    <span className="capitalize">{doc.slug.replace(/_/g, " ")}</span>
                    <span>
                      {doc.signedAt ? "Signed" : "Awaiting signature"}
                      {doc.downloadUrl ? (
                        <a
                          href={doc.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 text-blue-600 underline"
                        >
                          PDF
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {briefingPending ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">Briefing gate</h2>
              <p className="text-sm text-zinc-600">
                All documents signed. Waiting for the borrower to sign the briefing
                acknowledgment in their portal before release can proceed.
              </p>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-3 text-lg font-semibold">
              {rf.release_path === "without_pdc" ? "Release cash" : "Release check / cash"}
            </h2>
            <Button
              disabled={!canRelease || saving}
              onClick={() => void releaseFunds()}
            >
              Record release
            </Button>
            {!canRelease && rf.status === "ready_release" ? (
              <p className="mt-2 text-sm text-amber-700">Briefing sign-off required.</p>
            ) : null}
          </Card>

          {rf.status === "released" ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">Close & transmit</h2>
              <p className="mb-3 text-sm text-zinc-600">
                Upload the signed check voucher on the release checklist below, then close
                the file to queue it for AR.
              </p>
              <Button disabled={saving} onClick={() => void closeFile()}>
                Close file
              </Button>
            </Card>
          ) : null}

          {data.borrower?.id && signingStage ? (
            <DocumentChecklist
              applicationId={applicationId}
              borrowerId={data.borrower.id as string}
              stage={signingStage}
              checklistApiPath={`/api/lra/applications/${applicationId}/checklist?stage=${signingStage}`}
              uploadApiPath={`/api/lra/applications/${applicationId}/documents`}
              onUploadComplete={() => void load()}
            />
          ) : null}

          {data.borrower?.id ? (
            <DocumentChecklist
              applicationId={applicationId}
              borrowerId={data.borrower.id as string}
              stage="release"
              checklistApiPath={`/api/lra/applications/${applicationId}/checklist?stage=release`}
              uploadApiPath={`/api/lra/applications/${applicationId}/documents`}
              onUploadComplete={() => void load()}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
