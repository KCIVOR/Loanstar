"use client";

import { useState } from "react";

import { Alert, Button, Card } from "@/components/admin/ui";

type NegotiationPanelProps = {
  applicationId: string;
  status: string;
  negotiation: {
    status: string;
    approvedAmount: number | null;
    currentAmount: number | null;
    disclosedAt: string | null;
  } | null;
  onUpdated: () => void;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function NegotiationPanel({
  applicationId,
  status,
  negotiation,
  onUpdated,
}: NegotiationPanelProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!negotiation && status !== "approved") {
    return null;
  }

  async function handleDisclose() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/csa/applications/${applicationId}/disclose`,
        { method: "POST" },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Disclosure failed");
      setMessage("Terms disclosed to borrower.");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disclosure failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevisionComplete() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/csa/applications/${applicationId}/revision-complete`,
        { method: "POST" },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setMessage("Revision complete — returned to Committee.");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">
        Negotiation &amp; disclosure
      </h2>

      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-3">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      {status === "for_revision" ? (
        <div>
          <p className="mb-3 text-sm text-zinc-600">
            Committee requested revisions. Complete your updates and return the
            file to Committee.
          </p>
          <Button disabled={saving} onClick={() => void handleRevisionComplete()}>
            Revision complete
          </Button>
        </div>
      ) : negotiation ? (
        <div className="space-y-2 text-sm text-zinc-700">
          <p>
            Approved amount:{" "}
            {negotiation.approvedAmount != null
              ? formatMoney(negotiation.approvedAmount)
              : "—"}
          </p>
          <p>
            Current amount:{" "}
            {negotiation.currentAmount != null
              ? formatMoney(negotiation.currentAmount)
              : "—"}
          </p>
          <p className="capitalize">Negotiation status: {negotiation.status.replace("_", " ")}</p>
          {negotiation.disclosedAt ? (
            <p className="text-zinc-500">
              Disclosed {new Date(negotiation.disclosedAt).toLocaleString()}
            </p>
          ) : status === "approved" ? (
            <Button disabled={saving} onClick={() => void handleDisclose()}>
              Disclose terms to borrower
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-600">No negotiation record yet.</p>
      )}
    </Card>
  );
}
