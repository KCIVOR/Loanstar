"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDate } from "@/lib/cig/format";

type DenialCall = {
  noticeId: string;
  applicationId: string;
  applicationNo: string | null;
  deniedAt: string;
  borrower: {
    firstName: string;
    lastName: string;
    email: string;
    mobilePhone: string | null;
  } | null;
};

export default function CigDenialsPage() {
  const [denials, setDenials] = useState<DenialCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [informTarget, setInformTarget] = useState<DenialCall | null>(null);
  const [informing, setInforming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cig/denials");
      if (!res.ok) throw new Error("Failed to load denial calls");
      const data = (await res.json()) as { denials: DenialCall[] };
      setDenials(data.denials ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleInformConfirm() {
    if (!informTarget) return;
    setInforming(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cig/applications/${informTarget.applicationId}/denial-informed`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to mark informed");
      setDenials((prev) =>
        prev.filter((d) => d.noticeId !== informTarget.noticeId),
      );
      setInformTarget(null);
    } catch (err) {
      setInformTarget(null);
      setError(err instanceof Error ? err.message : "Failed to mark informed");
    } finally {
      setInforming(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Denial calls"
        description="Courtesy call queue — the written denial notice was already emailed when committee denied. Call the borrower to inform them; do not disclose the reason for denial."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {denials.length === 0 ? (
        <EmptyState
          title="No denial calls"
          description="Courtesy calls to make will appear here after Committee denies a file."
        />
      ) : (
        <div className="rounded-[var(--r-lg)] border border-line-soft bg-surface-2/50 p-4 sm:p-5">
          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>Borrower</Th>
                  <Th>Contact</Th>
                  <Th>Denied</Th>
                  <Th className="w-1">{""}</Th>
                </tr>
              </thead>
              <tbody>
                {denials.map((call) => (
                  <tr key={call.noticeId}>
                    <Td>
                      <div className="font-medium text-ink-900">
                        {call.borrower
                          ? `${call.borrower.firstName} ${call.borrower.lastName}`
                          : "Unknown borrower"}
                      </div>
                      <div className="mt-0.5 text-[12px] text-ink-400">
                        <span className="id">
                          {call.applicationNo ?? call.applicationId.slice(0, 8)}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <div className="mono text-[13px]">
                        {call.borrower?.mobilePhone ?? "No mobile on file"}
                      </div>
                      <div className="text-[12px] text-ink-400">
                        {call.borrower?.email ?? ""}
                      </div>
                    </Td>
                    <Td className="mono">{formatDate(call.deniedAt)}</Td>
                    <Td>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setInformTarget(call)}
                      >
                        Borrower informed
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={informTarget !== null}
        title="Confirm borrower informed"
        message={
          <>
            Confirm you called{" "}
            <span className="font-medium text-ink-900">
              {informTarget?.borrower
                ? `${informTarget.borrower.firstName} ${informTarget.borrower.lastName}`
                : "the borrower"}
            </span>{" "}
            and informed them of the denial without disclosing the reason. The
            written denial notice was already emailed when committee denied —
            this step only records the courtesy call.
          </>
        }
        confirmLabel="Yes, informed"
        cancelLabel="Cancel"
        loading={informing}
        onConfirm={() => void handleInformConfirm()}
        onCancel={() => setInformTarget(null)}
      />
    </div>
  );
}
