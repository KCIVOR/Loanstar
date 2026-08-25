"use client";

/* Dev tool — opened from the CSA/Committee calculator's "Full breakdown"
   button (see ComputationPanel.openComputationBreakdown). Reads the
   computation the caller stashed in localStorage rather than re-fetching or
   re-deriving anything, so every number on this page is guaranteed to match
   what the client actually sees/signs on the calculator itself. Not linked
   from app nav — reachable only via that button. */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  buildDetailedComputationBreakdown,
  type BreakdownSection,
  type Computation,
} from "@/components/csa/ComputationPanel";
import { Alert, Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";

type StoredComputation = Computation & { segment: "seafarer" | "sme" | "individual" };

function segmentLabel(segment: string) {
  if (segment === "sme") return "SME";
  if (segment === "seafarer") return "Seafarer";
  return "Individual";
}

function ComputationBreakdownContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [stored, setStored] = useState<StoredComputation | null | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      setStored(null);
      return;
    }
    const raw = window.localStorage.getItem(`loanstar:computation-breakdown:${id}`);
    setStored(raw ? (JSON.parse(raw) as StoredComputation) : null);
  }, [id]);

  return (
    <main className="mx-auto max-w-[900px] px-8 py-12">
      <PageHeader
        title="Computation breakdown"
        description="Step-by-step formula trace for this loan computation."
        actions={<Badge variant="teal">Dev tool</Badge>}
      />

      {stored === undefined ? null : stored === null ? (
        <EmptyState
          title="No computation loaded"
          description="Open this page using the 'Dev tool — Full breakdown' button on the calculator — it can't be loaded directly by URL."
        />
      ) : (
        <BreakdownView computation={stored} segment={stored.segment} />
      )}
    </main>
  );
}

export default function ComputationBreakdownPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-ink-500">
          Loading…
        </div>
      }
    >
      <ComputationBreakdownContent />
    </Suspense>
  );
}

function BreakdownView({
  computation,
  segment,
}: {
  computation: Computation;
  segment: "seafarer" | "sme" | "individual";
}) {
  const sections: BreakdownSection[] = buildDetailedComputationBreakdown(computation, segment);

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="warning">
        This is an internal dev tool showing exactly how the figures on the calculator were
        derived. Every value below is read from the saved computation itself, not
        recalculated — it will always match what's shown to the client.
      </Alert>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <div className="text-sm text-ink-500">Segment</div>
            <div className="font-display text-lg font-semibold text-navy-900">
              {segmentLabel(segment)} · {computation.loanTypeName ?? "Loan"}
            </div>
          </div>
          <Badge variant={computation.signedAt ? "teal" : "warning"}>
            {computation.signedAt ? "Signed" : "Awaiting signature"}
          </Badge>
        </div>
      </Card>

      {sections.map((section) => (
        <Card key={section.title}>
          <div className="p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
              {section.title}
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Label</Th>
                  <Th>Formula</Th>
                  <Th num>Value</Th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr key={row.label}>
                    <Td>{row.label}</Td>
                    <Td className="mono text-xs text-ink-500">{row.formula}</Td>
                    <Td num className="mono">
                      {row.value}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      ))}
    </div>
  );
}
