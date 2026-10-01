"use client";

import { useEffect, useMemo, useState } from "react";

import { AuditEventDetail, outcomeVariant } from "@/components/admin/AuditEventDetail";
import { DateRangeFilter, resolveDateBounds, type DateRangeValue } from "@/components/history";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { outcomeWord } from "@/lib/audit/csv";
import { AUDIT_KIND_LABELS, AUDIT_KINDS, formatAuditDate, type AuditKind } from "@/lib/audit/labels";
import type { ReadableAuditEvent } from "@/lib/audit/resolve";
import { MODULES } from "@/lib/constants";

const LIMIT = 50;

export default function AuditPage() {
  const [events, setEvents] = useState<ReadableAuditEvent[]>([]);
  const [actors, setActors] = useState<Array<{ id: string; name: string }>>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadableAuditEvent | null>(null);

  const [actorId, setActorId] = useState("");
  const [moduleSlug, setModuleSlug] = useState("");
  const [kind, setKind] = useState<AuditKind>("all");
  const [range, setRange] = useState<DateRangeValue>({ preset: "30d", from: "", to: "" });
  const [loanInput, setLoanInput] = useState("");
  const [applicationNo, setApplicationNo] = useState("");

  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (actorId) p.set("actorId", actorId);
    if (moduleSlug) p.set("module", moduleSlug);
    if (kind !== "all") p.set("kind", kind);
    const { from, to } = resolveDateBounds(range, new Date());
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (applicationNo) p.set("applicationNo", applicationNo);
    return p.toString();
  }, [actorId, moduleSlug, kind, range, applicationNo]);

  // State is only set after the request settles; `loading` is raised by the
  // handlers that change the page or filters.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/audit?limit=${LIMIT}&offset=${offset}${filterQuery ? `&${filterQuery}` : ""}`,
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Failed to load the activity log");
        }
        const data = (await res.json()) as {
          events: ReadableAuditEvent[];
          total: number;
          actors?: Array<{ id: string; name: string }>;
        };
        if (cancelled) return;
        setEvents(data.events);
        setTotal(data.total);
        if (data.actors) setActors(data.actors);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offset, filterQuery]);

  /** Apply a filter change: back to page 1 and show the spinner. */
  function changeFilter(apply: () => void) {
    apply();
    setOffset(0);
    setLoading(true);
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pageCount = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters = !!(actorId || moduleSlug || kind !== "all" || applicationNo || range.preset !== "30d");

  function clearFilters() {
    if (!hasFilters) return;
    changeFilter(() => {
      setActorId("");
      setModuleSlug("");
      setKind("all");
      setRange({ preset: "30d", from: "", to: "" });
      setLoanInput("");
      setApplicationNo("");
    });
  }

  function applyLoanNo() {
    const next = loanInput.trim();
    if (next !== applicationNo) changeFilter(() => setApplicationNo(next));
  }

  return (
    <div>
      <PageHeader
        title="Activity Log"
        description="Every action taken in LoanStar — who did it, when, and what changed. Entries cannot be edited or deleted."
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              window.location.href = `/api/admin/audit/export${filterQuery ? `?${filterQuery}` : ""}`;
            }}
          >
            Download (Excel/CSV)
          </Button>
        }
      />

      <div className="card mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-ink-3">Person</span>
            <Select value={actorId} onChange={(e) => changeFilter(() => setActorId(e.target.value))}>
              <option value="">Everyone</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-3">Area</span>
            <Select value={moduleSlug} onChange={(e) => changeFilter(() => setModuleSlug(e.target.value))}>
              <option value="">All areas</option>
              {MODULES.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-3">Type of activity</span>
            <Select value={kind} onChange={(e) => changeFilter(() => setKind(e.target.value as AuditKind))}>
              {AUDIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {AUDIT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </label>
          <form
            className="text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              applyLoanNo();
            }}
          >
            <span className="mb-1 block text-ink-3">Loan / application no.</span>
            <Input
              placeholder="e.g. AN300496 — press Enter"
              value={loanInput}
              onChange={(e) => setLoanInput(e.target.value)}
              onBlur={applyLoanNo}
            />
          </form>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <DateRangeFilter
            value={range}
            onChange={(next) => {
              const same = (a: DateRangeValue) => {
                const x = resolveDateBounds(a, new Date());
                return `${x.from}|${x.to}`;
              };
              // Only refetch when the effective dates change (custom range
              // mid-edit or re-picking the same preset keeps the same query).
              if (same(next) === same(range)) setRange(next);
              else changeFilter(() => setRange(next));
            }}
          />
          {hasFilters ? (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : events.length === 0 ? (
        <EmptyState
          title="No activity matches these filters"
          description="Try a wider date range or clear the filters."
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>What happened</Th>
                <Th>Loan / Borrower</Th>
                <Th>Area</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr
                  key={ev.id}
                  className="cursor-pointer hover:bg-surface-2"
                  onClick={() => setSelected(ev)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelected(ev);
                  }}
                >
                  <Td className="whitespace-nowrap text-sm">{formatAuditDate(ev.createdAt)}</Td>
                  <Td>
                    <div className="font-medium">{ev.who.name}</div>
                    {ev.who.role ? (
                      <div className="text-xs text-ink-3">
                        {ev.who.role}
                        {ev.who.roleIsCurrent ? " (current role)" : ""}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <div>{ev.summary}</div>
                    {ev.outcome ? (
                      <Badge variant={outcomeVariant(ev.outcome)} className="mt-1">
                        {outcomeWord(ev.outcome)}
                      </Badge>
                    ) : null}
                  </Td>
                  <Td className="text-sm">
                    {ev.loan ? (
                      <>
                        <div className="font-medium">{ev.loan.applicationNo ?? "—"}</div>
                        {ev.loan.borrowerName ? (
                          <div className="text-xs text-ink-3">{ev.loan.borrowerName}</div>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-sm">{ev.area}</Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <Pagination
            className="mt-4"
            page={page}
            pageCount={pageCount}
            onPageChange={(p) => {
              setOffset((p - 1) * LIMIT);
              setLoading(true);
            }}
            summary={`Showing ${offset + 1}–${Math.min(offset + LIMIT, total)} of ${total}`}
          />
        </>
      )}

      <AuditEventDetail event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
