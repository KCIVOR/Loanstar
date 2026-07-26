"use client";

import { useState } from "react";

import { Alert, Badge, Button, Card } from "@/components/ui";

const NEGOTIATION_BADGE_VARIANT: Record<string, "success" | "warning" | "navy" | "neutral"> = {
  negotiating: "warning",
  pending_disclosure: "warning",
  awaiting_signature: "navy",
  signed: "success",
};

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
      <h2 className="mb-4 font-display text-lg font-semibold text-navy-900">
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
          <p className="mb-3 text-sm text-ink-500">
            Committee requested revisions. Complete your updates and return the
            file to Committee.
          </p>
          <Button loading={saving} onClick={() => void handleRevisionComplete()}>
            Revision complete
          </Button>
        </div>
      ) : negotiation ? (
        <div className="space-y-4">
          <div className="kv">
            <div className="row">
              <span className="k">Approved amount</span>
              <span className="v mono">
                {negotiation.approvedAmount != null
                  ? `₱${formatMoney(negotiation.approvedAmount)}`
                  : "—"}
              </span>
            </div>
            <div className="row">
              <span className="k">Current amount</span>
              <span className="v mono" style={{ color: "var(--teal-700)" }}>
                {negotiation.currentAmount != null
                  ? `₱${formatMoney(negotiation.currentAmount)}`
                  : "—"}
              </span>
            </div>
            <div className="row">
              <span className="k">Negotiation status</span>
              <span className="v">
                <Badge variant={NEGOTIATION_BADGE_VARIANT[negotiation.status] ?? "neutral"}>
                  {negotiation.status.replace(/_/g, " ")}
                </Badge>
              </span>
            </div>
          </div>
          {negotiation.disclosedAt ? (
            <p className="text-sm text-ink-400">
              Disclosed{" "}
              <span className="mono">
                {new Date(negotiation.disclosedAt).toLocaleString()}
              </span>
            </p>
          ) : negotiation.status === "pending_disclosure" ||
            status === "approved" ||
            status === "negotiating_terms" ? (
            <Button loading={saving} onClick={() => void handleDisclose()}>
              Disclose terms to borrower
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-ink-500">No negotiation record yet.</p>
      )}
    </Card>
  );
}
