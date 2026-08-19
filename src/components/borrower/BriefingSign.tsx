"use client";

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui";

type BriefingItem = {
  key: string;
  label: string;
  signedAt?: string;
};

type BriefingSignProps = {
  applicationId: string;
  onSigned: () => void;
};

/**
 * Read-only briefing status: the briefing is conducted at the branch and
 * checked off by the Briefer, not signed from the portal.
 */
export function BriefingSign({ applicationId }: BriefingSignProps) {
  const [checklist, setChecklist] = useState<BriefingItem[]>([]);
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/borrower/applications/${applicationId}/briefing`,
      );
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
      setChecklist(
        Array.isArray(data.briefing?.checklist) ? data.briefing.checklist : [],
      );
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || releaseStatus !== "awaiting_briefing") return null;
  if (acknowledgedAt) return null;

  return (
    <Card className="mb-6">
      <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
        Loan briefing
      </h2>
      <p className="mb-3 text-sm text-ink-500">
        Before your loan is released, our collection officer will walk you
        through the items below at the branch. No action is needed in the
        portal — release proceeds once the briefing is completed.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-500">
        {checklist.map((item) => (
          <li key={item.key}>{item.label}</li>
        ))}
      </ul>
    </Card>
  );
}
