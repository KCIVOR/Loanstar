"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";

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
          <Link href="/agent/leads/new">
            <Button>New lead</Button>
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
          <tbody className="divide-y divide-neutral-200">
            {leads.map((lead) => (
              <tr key={lead.id}>
                <Td>
                  <Link
                    href={`/agent/leads/${lead.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {lead.borrowerName}
                  </Link>
                </Td>
                <Td>{lead.businessName ?? "—"}</Td>
                <Td>
                  <Badge variant="neutral">{lead.status}</Badge>
                </Td>
                <Td className="font-mono text-xs text-ink-faint">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {leads.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No leads yet.</p>
        ) : null}
      </Card>
    </div>
  );
}
