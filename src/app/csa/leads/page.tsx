"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Alert, Button, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/csa/format";

type AgentLead = {
  id: string;
  borrowerName: string;
  businessName: string | null;
  agentName: string | null;
  createdAt: string;
};

export default function CsaLeadsPage() {
  const [leads, setLeads] = useState<AgentLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/csa/leads");
      if (!res.ok) throw new Error("Failed to load leads");
      const data = (await res.json()) as { leads: AgentLead[] };
      setLeads(data.leads ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Open name-only referrals waiting for CSA to start an application."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {leads.length === 0 ? (
        <EmptyState
          title="No open leads"
          description="Agent referrals will appear here until CSA starts an application from them."
        />
      ) : (
        <div className="rounded-[var(--r-lg)] border border-line-soft bg-surface-2/50 p-4 sm:p-5">
          <ul className="divide-y divide-line-soft">
            {leads.map((lead) => {
              const href = `/csa/applications/new?leadId=${encodeURIComponent(lead.id)}&name=${encodeURIComponent(lead.borrowerName)}`;
              return (
                <li
                  key={lead.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-ink-900">
                      {lead.borrowerName}
                    </div>
                    <div className="text-sm text-ink-500">
                      {lead.agentName
                        ? `Agent: ${lead.agentName}`
                        : "Agent referral"}
                      {" · "}
                      {formatDate(lead.createdAt)}
                    </div>
                  </div>
                  <Link href={href}>
                    <Button variant="secondary" size="sm">
                      Start application
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
