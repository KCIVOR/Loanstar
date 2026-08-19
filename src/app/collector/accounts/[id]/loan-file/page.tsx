"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  OriginationPacketPanel,
  type OriginationPacketDto,
} from "@/components/collection/OriginationPacketPanel";
import {
  Alert,
  Breadcrumbs,
  PageHeader,
  Spinner,
} from "@/components/ui";

export default function CollectorLoanFilePage() {
  const params = useParams();
  const id = params.id as string;

  const [packet, setPacket] = useState<OriginationPacketDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const caseFileApiBase = `/api/collector/accounts/${id}/case-file`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(caseFileApiBase);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to load loan file");
      }
      const body = (await res.json()) as OriginationPacketDto;
      setPacket(body);
    } catch (err) {
      setPacket(null);
      setError(err instanceof Error ? err.message : "Failed to load loan file");
    } finally {
      setLoading(false);
    }
  }, [caseFileApiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  const borrowerName = packet?.borrower.name?.trim() || "Loan File";

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "Accounts", href: "/collector/accounts" },
          { label: "Loan File" },
        ]}
      />
      <PageHeader
        title={borrowerName}
        description="Read-only origination packet — attachments, CSA intake summary, and CIG report."
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : null}

      {error ? (
        <div className="mb-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      ) : null}

      {!loading && !error ? (
        <OriginationPacketPanel
          masterlistId={id}
          caseFileApiBase={caseFileApiBase}
          mode="controlled"
          packet={packet}
          loading={false}
          error={null}
        />
      ) : null}
    </div>
  );
}
