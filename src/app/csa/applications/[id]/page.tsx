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
  Spinner,
} from "@/components/admin/ui";
import { ComputationPanel } from "@/components/csa/ComputationPanel";
import { NegotiationPanel } from "@/components/csa/NegotiationPanel";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { formatStatusLabel } from "@/lib/applications/status";
import { isCsaEditableStatus } from "@/lib/csa/status";
import type { BorrowerProfile } from "@/lib/borrowers/types";

type EndorseReadiness = {
  ready: boolean;
  missing: string[];
};

type ApplicationWorkspace = {
  application: {
    id: string;
    status: string;
    statusLabel: string;
    blocker: string | null;
  };
  borrower: BorrowerProfile | null;
  details: { loanTypeId: string | null } | null;
  computation: {
    id: string;
    inputMode: string;
    inputAmount: number;
    principal: number;
    netReleased: number;
    totalLoan: number;
    monthlyAmortization: number;
    lineItems: Array<{ key: string; label: string; amount: number }>;
    coverageWarning: boolean;
    signedAt: string | null;
    loanTypeName: string | null;
  } | null;
  endorseReadiness: EndorseReadiness;
  negotiation: {
    status: string;
    approvedAmount: number | null;
    currentAmount: number | null;
    disclosedAt: string | null;
  } | null;
};

type NclCheck = {
  result: string;
  notes: string | null;
};

export default function CsaApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [data, setData] = useState<ApplicationWorkspace | null>(null);
  const [ncl, setNcl] = useState<NclCheck>({ result: "pending", notes: null });
  const [holdReason, setHoldReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appRes, checksRes] = await Promise.all([
        fetch(`/api/csa/applications/${applicationId}`),
        fetch(`/api/csa/applications/${applicationId}/checks`),
      ]);
      if (!appRes.ok) throw new Error("Failed to load application");
      const appData = (await appRes.json()) as ApplicationWorkspace;
      setData(appData);

      if (checksRes.ok) {
        const checksData = (await checksRes.json()) as {
          checks: Array<{ slug: string | null; result: string; notes: string | null }>;
        };
        const nclCheck = checksData.checks.find((c) => c.slug === "ncl");
        if (nclCheck) {
          setNcl({ result: nclCheck.result, notes: nclCheck.notes });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!data?.borrower) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/csa/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower: {
            firstName: data.borrower.firstName,
            middleName: data.borrower.middleName,
            lastName: data.borrower.lastName,
            mobilePhone: data.borrower.mobilePhone,
            email: data.borrower.email,
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Save failed");
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordNcl(result: "pass" | "fail") {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/csa/applications/${applicationId}/checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, notes: ncl.notes ?? undefined }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to record NCL");
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to record NCL");
    } finally {
      setSaving(false);
    }
  }

  async function handleEndorse() {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/csa/applications/${applicationId}/endorse`, {
        method: "POST",
      });
      const body = (await res.json()) as { error?: string; missing?: string[] };
      if (!res.ok) {
        throw new Error(
          body.missing?.length
            ? `${body.error}: ${body.missing.join(", ")}`
            : body.error ?? "Endorse failed",
        );
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Endorse failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleHold(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/csa/applications/${applicationId}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: holdReason }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Hold failed");
      setHoldReason("");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Hold failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!data) return <Alert>Application not found.</Alert>;

  const editable = isCsaEditableStatus(data.application.status);

  return (
    <div>
      <PageHeader
        title={
          data.borrower
            ? `${data.borrower.firstName} ${data.borrower.lastName}`
            : "Application"
        }
        description={`${data.borrower?.borrowerNo ?? ""} · ${data.application.statusLabel}`}
        actions={
          <Link href="/csa">
            <Button variant="secondary">Back to queue</Button>
          </Link>
        }
      />

      {error || actionError ? (
        <div className="mb-4">
          <Alert>{error ?? actionError}</Alert>
        </div>
      ) : null}

      {data.application.blocker ? (
        <div className="mb-4">
          <Alert variant="info">{data.application.blocker}</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Borrower profile</h2>
            {data.borrower && editable ? (
              <form onSubmit={(e) => void handleSaveProfile(e)} className="grid gap-3">
                <div>
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={data.borrower.firstName}
                    onChange={(e) =>
                      setData({
                        ...data,
                        borrower: { ...data.borrower!, firstName: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={data.borrower.lastName}
                    onChange={(e) =>
                      setData({
                        ...data,
                        borrower: { ...data.borrower!, lastName: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="mobilePhone">Mobile</Label>
                  <Input
                    id="mobilePhone"
                    value={data.borrower.mobilePhone ?? ""}
                    onChange={(e) =>
                      setData({
                        ...data,
                        borrower: { ...data.borrower!, mobilePhone: e.target.value },
                      })
                    }
                  />
                </div>
                <Button type="submit" disabled={saving}>
                  Save profile
                </Button>
              </form>
            ) : data.borrower ? (
              <div className="space-y-1 text-sm text-zinc-700">
                <p>{data.borrower.email}</p>
                <p>{data.borrower.mobilePhone ?? "No mobile on file"}</p>
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">NCL check</h2>
            <p className="mb-3 text-sm text-zinc-600">
              Current result:{" "}
              <span className="font-medium capitalize">{ncl.result}</span>
            </p>
            {editable ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void handleRecordNcl("pass")}
                >
                  Record pass
                </Button>
                <Button
                  variant="danger"
                  disabled={saving}
                  onClick={() => void handleRecordNcl("fail")}
                >
                  Record fail
                </Button>
              </div>
            ) : null}
          </Card>

          {data.borrower ? (
            <DocumentChecklist
              applicationId={applicationId}
              borrowerId={data.borrower.id}
              stage="intake"
              onUploadComplete={() => void load()}
            />
          ) : null}
        </div>

        <div className="space-y-6">
          <ComputationPanel
            applicationId={applicationId}
            loanTypeId={data.details?.loanTypeId ?? null}
            editable={editable}
            computation={data.computation}
            onUpdated={() => void load()}
          />

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Endorse to CIG</h2>
            <ul className="mb-4 list-inside list-disc text-sm text-zinc-600">
              {data.endorseReadiness.ready ? (
                <li className="text-green-700">All requirements met</li>
              ) : (
                data.endorseReadiness.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))
              )}
            </ul>
            {editable ? (
              <div className="space-y-4">
                <Button
                  disabled={!data.endorseReadiness.ready || saving}
                  onClick={() => void handleEndorse()}
                >
                  Endorse to CIG
                </Button>
                <form onSubmit={(e) => void handleHold(e)} className="space-y-2 border-t border-zinc-100 pt-4">
                  <Label htmlFor="holdReason">Hold reason (if incomplete)</Label>
                  <Input
                    id="holdReason"
                    value={holdReason}
                    onChange={(e) => setHoldReason(e.target.value)}
                    placeholder="Reason file cannot be endorsed"
                  />
                  <Button type="submit" variant="secondary" disabled={!holdReason.trim() || saving}>
                    Record hold
                  </Button>
                </form>
              </div>
            ) : (
              <p className="text-sm text-zinc-600">
                Endorsed — status is {formatStatusLabel(data.application.status)}.
              </p>
            )}
          </Card>

          <NegotiationPanel
            applicationId={applicationId}
            status={data.application.status}
            negotiation={data.negotiation}
            onUpdated={() => void load()}
          />
        </div>
      </div>
    </div>
  );
}
