"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Card,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";

type Lead = {
  id: string;
  borrowerName: string;
  businessName: string | null;
  status: string;
  applicationId: string | null;
  createdAt: string;
};

export default function AgentLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/leads");
      if (!res.ok) throw new Error("Failed to load leads");
      const data = (await res.json()) as { leads: Lead[] };
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
        description="Track borrower leads and checklist completion"
        actions={
          <Link
            href="/agent/leads/new"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            New lead
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Borrower</Th>
              <Th>Business</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {leads.map((lead) => (
              <tr key={lead.id}>
                <Td>
                  <Link
                    href={`/agent/leads/${lead.id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {lead.borrowerName}
                  </Link>
                </Td>
                <Td>{lead.businessName ?? "—"}</Td>
                <Td className="capitalize">{lead.status}</Td>
                <Td className="text-xs text-zinc-500">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {leads.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No leads yet.</p>
        ) : null}
      </Card>
    </div>
  );
}
