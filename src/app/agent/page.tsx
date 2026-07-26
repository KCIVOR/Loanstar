"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { NewLeadModal } from "@/components/agent/NewLeadModal";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import {
  leadPipelineStage,
  leadStatusVariant,
  pipelineStageLabel,
  pipelineStageVariant,
} from "@/lib/agent/pipeline";

type Lead = {
  id: string;
  borrowerName: string;
  businessName: string | null;
  status: string;
  applicationId: string | null;
  createdAt: string;
  checklistRequired: number;
  checklistComplete: number;
  checklistPercent: number | null;
};

const PAGE_SIZE = 10;

type StageFilter = "all" | "awaiting_link" | "gathering_docs" | "docs_ready";
type SortKey = "priority" | "borrower" | "created" | "progress";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconUsers = (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconLink = (
  <svg {...iconProps}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const IconDocs = (
  <svg {...iconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M9 15h6M9 11h6" />
  </svg>
);
const IconCheck = (
  <svg {...iconProps}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  teal: { background: "var(--teal-50)", color: "var(--teal-700)" },
  success: { background: "var(--success-bg)", color: "var(--success)" },
} as const;

function Kpi({
  tone,
  icon,
  label,
  value,
}: {
  tone: keyof typeof KPI_TONES;
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="kpi flex h-full flex-col">
      <span className="ic" style={KPI_TONES[tone]}>
        {icon}
      </span>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

function stageOf(lead: Lead) {
  return leadPipelineStage({
    applicationId: lead.applicationId,
    checklistPercent: lead.checklistPercent,
  });
}

function ProgressCell({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-ink-400">—</span>;
  }
  return (
    <div className="min-w-[120px]">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="mono text-ink-500">{percent}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-navy-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-teal-500 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function AgentPipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [newLeadOpen, setNewLeadOpen] = useState(false);

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

  const awaitingLink = leads.filter((l) => !l.applicationId).length;
  const gathering = leads.filter((l) => stageOf(l) === "gathering_docs").length;
  const ready = leads.filter((l) => stageOf(l) === "docs_ready").length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const stage = stageOf(lead);
      if (stageFilter !== "all" && stage !== stageFilter) return false;
      if (!term) return true;
      return (
        lead.borrowerName.toLowerCase().includes(term) ||
        (lead.businessName?.toLowerCase().includes(term) ?? false) ||
        lead.status.toLowerCase().includes(term)
      );
    });
  }, [leads, search, stageFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const stageRank = {
      awaiting_link: 0,
      gathering_docs: 1,
      docs_ready: 2,
    } as const;

    return [...filtered].sort((a, b) => {
      if (sortKey === "borrower") {
        return dir * a.borrowerName.localeCompare(b.borrowerName);
      }
      if (sortKey === "created") {
        return dir * a.createdAt.localeCompare(b.createdAt);
      }
      if (sortKey === "progress") {
        const ap = a.checklistPercent ?? -1;
        const bp = b.checklistPercent ?? -1;
        return dir * (ap - bp);
      }
      // priority: awaiting link first, then lowest progress, then newest
      const ar = stageRank[stageOf(a)];
      const br = stageRank[stageOf(b)];
      if (ar !== br) return ar - br;
      const ap = a.checklistPercent ?? -1;
      const bp = b.checklistPercent ?? -1;
      if (ap !== bp) return ap - bp;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "borrower" ? "asc" : "desc");
    }
    setPage(1);
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Lead pipeline"
        description="Track registration links and intake checklist readiness for your borrowers."
        actions={
          <Button onClick={() => setNewLeadOpen(true)}>New lead</Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {awaitingLink > 0 ? (
        <div className="banner warn mb-6">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <span>
            <span className="mono font-semibold">{awaitingLink}</span> lead
            {awaitingLink === 1 ? "" : "s"} waiting for borrower registration /
            application link
          </span>
        </div>
      ) : null}

      <div className="kpi-grid mb-6">
        <Kpi tone="navy" icon={IconUsers} label="Leads" value={leads.length} />
        <Kpi
          tone="warning"
          icon={IconLink}
          label="Awaiting link"
          value={awaitingLink}
        />
        <Kpi
          tone="teal"
          icon={IconDocs}
          label="Gathering docs"
          value={gathering}
        />
        <Kpi tone="success" icon={IconCheck} label="Docs ready" value={ready} />
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Create a lead to start tracking a borrower through registration and documents."
          action={
            <Button onClick={() => setNewLeadOpen(true)}>New lead</Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="tbl-toolbar">
            <div className="gsearch" style={{ maxWidth: 280 }}>
              <span className="icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <input
                className="input"
                style={{
                  height: 36,
                  paddingRight: 12,
                  borderRadius: "var(--r-md)",
                }}
                placeholder="Search borrower or business"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All stages"],
                  ["awaiting_link", "Awaiting link"],
                  ["gathering_docs", "Gathering docs"],
                  ["docs_ready", "Docs ready"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn("fchip", stageFilter === value && "on")}
                  onClick={() => {
                    setStageFilter(value);
                    setPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("borrower")}
                    >
                      Borrower {sortArrow("borrower")}
                    </button>
                  </Th>
                  <Th>Business</Th>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("priority")}
                    >
                      Pipeline {sortArrow("priority")}
                    </button>
                  </Th>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("progress")}
                    >
                      Checklist {sortArrow("progress")}
                    </button>
                  </Th>
                  <Th>Status</Th>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("created")}
                    >
                      Created {sortArrow("created")}
                    </button>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {paged.map((lead) => {
                  const stage = stageOf(lead);
                  return (
                    <tr key={lead.id}>
                      <Td>
                        <Link
                          href={`/agent/leads/${lead.id}`}
                          className="font-medium text-ink-900 hover:text-teal-700"
                        >
                          {lead.borrowerName}
                        </Link>
                      </Td>
                      <Td>{lead.businessName ?? "—"}</Td>
                      <Td>
                        <Badge variant={pipelineStageVariant(stage)}>
                          {pipelineStageLabel(stage)}
                        </Badge>
                      </Td>
                      <Td>
                        <ProgressCell percent={lead.checklistPercent} />
                      </Td>
                      <Td>
                        <Badge variant={leadStatusVariant(lead.status)}>
                          {lead.status}
                        </Badge>
                      </Td>
                      <Td className="mono text-xs text-ink-400">
                        {new Date(lead.createdAt).toLocaleDateString("en-PH", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {sorted.length > PAGE_SIZE ? (
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}

      <NewLeadModal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
      />
    </div>
  );
}
