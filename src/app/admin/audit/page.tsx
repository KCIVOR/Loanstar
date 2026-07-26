"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";

type AuditEvent = {
  id: string;
  actor_id: string | null;
  module_slug: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  created_at: string;
};

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/audit?limit=${limit}&offset=${offset}`,
      );
      if (!res.ok) throw new Error("Failed to load audit log");
      const data = (await res.json()) as {
        events: AuditEvent[];
        total: number;
      };
      setEvents(data.events);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Read-only append-only audit trail"
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="audit">
            <Table>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Module</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>Actor</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <Td className="id whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString()}
                    </Td>
                    <Td>{ev.module_slug}</Td>
                    <Td>{ev.action}</Td>
                    <Td className="id">
                      {ev.entity_type ?? "—"}
                      {ev.entity_id ? ` / ${ev.entity_id.slice(0, 8)}…` : ""}
                    </Td>
                    <Td className="id">
                      {ev.actor_id ? `${ev.actor_id.slice(0, 8)}…` : "—"}
                    </Td>
                    <Td className="id">{ev.ip_address ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          <Pagination
            className="mt-4"
            page={page}
            pageCount={pageCount}
            onPageChange={(p) => setOffset((p - 1) * limit)}
            summary={
              total === 0
                ? "No events"
                : `Showing ${offset + 1}–${Math.min(offset + limit, total)} of ${total}`
            }
          />
        </>
      )}
    </div>
  );
}
