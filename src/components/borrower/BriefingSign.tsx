"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Button, Card, ConfirmDialog } from "@/components/ui";

type BriefingItem = {
  key: string;
  label: string;
  signedAt?: string;
};

type BriefingSignProps = {
  applicationId: string;
  onSigned: () => void;
};

export function BriefingSign({ applicationId, onSigned }: BriefingSignProps) {
  const [checklist, setChecklist] = useState<BriefingItem[]>([]);
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/borrower/applications/${applicationId}/briefing`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        releaseFile: { status: string } | null;
        briefing: {
          acknowledgedAt: string | null;
          checklist: BriefingItem[];
        } | null;
      };
      setReleaseStatus(data.releaseFile?.status ?? null);
      setAcknowledgedAt(data.briefing?.acknowledgedAt ?? null);
      setChecklist(Array.isArray(data.briefing?.checklist) ? data.briefing.checklist : []);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || releaseStatus !== "awaiting_briefing") return null;
  if (acknowledgedAt) return null;

  async function handleSign() {
    setSigning(true);
    setError(null);
    try {
      const res = await fetch(`/api/borrower/applications/${applicationId}/briefing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Briefing sign failed");
      setShowDialog(false);
      onSigned();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Briefing sign failed");
    } finally {
      setSigning(false);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-2 font-display text-lg font-semibold text-ink">Loan briefing</h2>
      <p className="mb-3 text-sm text-ink-muted">
        Review the briefing checklist below, then confirm your acknowledgment.
      </p>
      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
        {checklist.map((item) => (
          <li key={item.key}>{item.label}</li>
        ))}
      </ul>
      <Button onClick={() => setShowDialog(true)}>Sign briefing acknowledgment</Button>
      <ConfirmDialog
        open={showDialog}
        title="Confirm briefing"
        message="I confirm that the loan terms, payment obligations, and collection contact information were explained to me during briefing."
        confirmLabel="Confirm briefing"
        cancelLabel="Cancel"
        loading={signing}
        onConfirm={() => void handleSign()}
        onCancel={() => setShowDialog(false)}
      />
    </Card>
  );
}
