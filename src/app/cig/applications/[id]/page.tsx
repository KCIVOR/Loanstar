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
  Textarea,
} from "@/components/admin/ui";

type VerificationData = {
  fieldCompletenessOk: boolean | null;
  fieldCompletenessNotes: string | null;
  picAllotmentAwareness: string | null;
  picPaymentReliability: string | null;
  picInterviewNotes: string | null;
  cmDepartureDate: string | null;
  cmSalary: number | null;
  cmPosition: string | null;
  cmContractStatus: string | null;
  cmNotes: string | null;
  characterReferencesNotes: string | null;
  finding: "positive" | "negative" | null;
  findingNotes: string | null;
  forwardedAt: string | null;
};

type CheckItem = {
  slug: string | null;
  name: string | null;
  result: string;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CigApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editable, setEditable] = useState(true);
  const [borrowerName, setBorrowerName] = useState({ first: "", last: "" });
  const [verification, setVerification] = useState<VerificationData | null>(null);
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [completeness, setCompleteness] = useState<{ complete: boolean; missing: string[] }>({
    complete: false,
    missing: [],
  });
  const [computation, setComputation] = useState<{
    principal: number;
    netReleased: number;
    monthlyAmortization: number;
    lineItems: Array<{ label: string; amount: number }>;
  } | null>(null);
  const [applicationStatus, setApplicationStatus] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [callbackNotes, setCallbackNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appRes, checksRes] = await Promise.all([
        fetch(`/api/cig/applications/${applicationId}`),
        fetch(`/api/cig/applications/${applicationId}/checks`),
      ]);
      if (!appRes.ok) throw new Error("Failed to load application");
      const appData = (await appRes.json()) as {
        application: { editable: boolean; status: string; statusLabel: string };
        borrower: { firstName: string; lastName: string } | null;
        verification: VerificationData;
        completeness: { complete: boolean; missing: string[] };
        computation: typeof computation;
      };
      setEditable(appData.application.editable);
      setApplicationStatus(appData.application.status);
      setBorrowerName({
        first: appData.borrower?.firstName ?? "",
        last: appData.borrower?.lastName ?? "",
      });
      setVerification(appData.verification);
      setCompleteness(appData.completeness);
      setComputation(appData.computation);

      if (checksRes.ok) {
        const checksData = (await checksRes.json()) as { checks: CheckItem[] };
        setChecks(checksData.checks);
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

  async function handleRevisionComplete() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/cig/applications/${applicationId}/revision-complete`,
        { method: "POST" },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setMessage("Revision complete — returned to Committee.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveVerification(patch: Record<string, unknown>) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification: patch }),
      });
      const data = (await res.json()) as {
        error?: string;
        forwarded?: boolean;
        missing?: string[];
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.forwarded) {
        setMessage("Verification complete — forwarded to Committee automatically.");
        setEditable(false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveForm(e: FormEvent) {
    e.preventDefault();
    if (!verification) return;
    await saveVerification({
      fieldCompletenessOk: verification.fieldCompletenessOk ?? undefined,
      fieldCompletenessNotes: verification.fieldCompletenessNotes,
      picAllotmentAwareness: verification.picAllotmentAwareness ?? undefined,
      picPaymentReliability: verification.picPaymentReliability ?? undefined,
      picInterviewNotes: verification.picInterviewNotes,
      cmDepartureDate: verification.cmDepartureDate ?? undefined,
      cmSalary: verification.cmSalary,
      cmPosition: verification.cmPosition ?? undefined,
      cmContractStatus: verification.cmContractStatus ?? undefined,
      cmNotes: verification.cmNotes,
      characterReferencesNotes: verification.characterReferencesNotes ?? undefined,
      finding: verification.finding ?? undefined,
      findingNotes: verification.findingNotes,
    });
  }

  async function handleSaveBorrower(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower: { firstName: borrowerName.first, lastName: borrowerName.last },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMessage("Borrower name updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function recordCheck(slug: string, result: "pass" | "fail") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}/checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkTypeSlug: slug, result }),
      });
      const data = (await res.json()) as {
        error?: string;
        forwarded?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Check failed");
      if (data.forwarded) {
        setMessage("Verification complete — forwarded to Committee.");
        setEditable(false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setSaving(false);
    }
  }

  async function scheduleCallback(e: FormEvent) {
    e.preventDefault();
    if (!callbackAt) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: new Date(callbackAt).toISOString(),
          notes: callbackNotes || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Callback failed");
      setMessage("Callback scheduled — file removed from active queue until due.");
      setCallbackAt("");
      setCallbackNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Callback failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!verification) return <Alert>Application not found.</Alert>;

  return (
    <div>
      <PageHeader
        title="Verification"
        description="Complete all sections to auto-forward to Committee."
        actions={
          <Link href="/cig">
            <Button variant="secondary">Back to queue</Button>
          </Link>
        }
      />

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

      {applicationStatus === "for_revision" ? (
        <Card className="mb-4">
          <h2 className="mb-2 text-lg font-semibold text-neutral-900">
            Committee revisit
          </h2>
          <p className="mb-3 text-sm text-neutral-600">
            Committee requested verification revisions. Complete updates and return
            the file to Committee.
          </p>
          <Button disabled={saving} onClick={() => void handleRevisionComplete()}>
            Revision complete
          </Button>
        </Card>
      ) : null}

      {verification.forwardedAt ? (
        <div className="mb-4">
          <Alert variant="success">
            Forwarded to Committee on {new Date(verification.forwardedAt).toLocaleString()}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Borrower (editable)</h2>
            {editable ? (
              <form onSubmit={(e) => void handleSaveBorrower(e)} className="grid gap-3">
                <div>
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={borrowerName.first}
                    onChange={(e) =>
                      setBorrowerName({ ...borrowerName, first: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={borrowerName.last}
                    onChange={(e) =>
                      setBorrowerName({ ...borrowerName, last: e.target.value })
                    }
                  />
                </div>
                <Button type="submit" disabled={saving}>
                  Save name
                </Button>
              </form>
            ) : (
              <p className="text-sm">
                {borrowerName.first} {borrowerName.last}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">External checks</h2>
            <div className="space-y-3">
              {checks.map((check) => (
                <div
                  key={check.slug ?? check.name}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2"
                >
                  <div>
                    <p className="text-sm font-medium">{check.name}</p>
                    <p className="text-xs capitalize text-neutral-500">{check.result}</p>
                  </div>
                  {editable && check.slug ? (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        disabled={saving}
                        onClick={() => void recordCheck(check.slug!, "pass")}
                      >
                        Pass
                      </Button>
                      <Button
                        variant="danger"
                        disabled={saving}
                        onClick={() => void recordCheck(check.slug!, "fail")}
                      >
                        Fail
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          {editable ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">Schedule callback</h2>
              <form onSubmit={(e) => void scheduleCallback(e)} className="grid gap-3">
                <div>
                  <Label htmlFor="callbackAt">Callback datetime</Label>
                  <Input
                    id="callbackAt"
                    type="datetime-local"
                    required
                    value={callbackAt}
                    onChange={(e) => setCallbackAt(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="callbackNotes">Notes</Label>
                  <Input
                    id="callbackNotes"
                    value={callbackNotes}
                    onChange={(e) => setCallbackNotes(e.target.value)}
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={saving}>
                  Schedule callback
                </Button>
              </form>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {computation ? (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">Computation (read-only)</h2>
              <div className="space-y-1 text-sm">
                {computation.lineItems.map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-neutral-600">{item.label}</span>
                    <span className="tabular-nums">{formatMoney(item.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Verification form</h2>
            {!completeness.complete && editable ? (
              <ul className="mb-4 list-inside list-disc text-sm text-warning-700">
                {completeness.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}

            {editable ? (
              <form onSubmit={(e) => void handleSaveForm(e)} className="grid gap-3">
                <div>
                  <Label htmlFor="fieldOk">Field completeness OK?</Label>
                  <Select
                    id="fieldOk"
                    value={
                      verification.fieldCompletenessOk === null
                        ? ""
                        : verification.fieldCompletenessOk
                          ? "yes"
                          : "no"
                    }
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        fieldCompletenessOk:
                          e.target.value === "" ? null : e.target.value === "yes",
                      })
                    }
                  >
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="picAllotment">PIC allotment awareness</Label>
                  <Textarea
                    id="picAllotment"
                    value={verification.picAllotmentAwareness ?? ""}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        picAllotmentAwareness: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="picReliability">PIC payment reliability</Label>
                  <Textarea
                    id="picReliability"
                    value={verification.picPaymentReliability ?? ""}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        picPaymentReliability: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="cmDeparture">CM departure date</Label>
                  <Input
                    id="cmDeparture"
                    type="date"
                    value={verification.cmDepartureDate ?? ""}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        cmDepartureDate: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="cmSalary">CM salary</Label>
                  <Input
                    id="cmSalary"
                    type="number"
                    step="0.01"
                    value={verification.cmSalary ?? ""}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        cmSalary: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="cmPosition">CM position</Label>
                  <Input
                    id="cmPosition"
                    value={verification.cmPosition ?? ""}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        cmPosition: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="cmContract">CM contract status</Label>
                  <Input
                    id="cmContract"
                    value={verification.cmContractStatus ?? ""}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        cmContractStatus: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="charRefs">Character references</Label>
                  <Textarea
                    id="charRefs"
                    value={verification.characterReferencesNotes ?? ""}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        characterReferencesNotes: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="finding">Finding</Label>
                  <Select
                    id="finding"
                    value={verification.finding ?? ""}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        finding: (e.target.value || null) as "positive" | "negative" | null,
                      })
                    }
                  >
                    <option value="">Select</option>
                    <option value="positive">Positive</option>
                    <option value="negative">Negative</option>
                  </Select>
                </div>
                <Button type="submit" disabled={saving}>
                  Save verification
                </Button>
              </form>
            ) : (
              <p className="text-sm text-neutral-600">Verification locked after forward.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
