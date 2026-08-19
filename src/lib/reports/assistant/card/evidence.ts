import type { MetricUnit } from "@/lib/reports/metrics/types";

import type { AnswerCard } from "./schema";

/** A figure the renderer can draw, carrying its own formatting instructions. */
export type EvidenceMetric = {
  id: string;
  label: string;
  unit: MetricUnit;
  value: number;
  prior: number | null;
  deltaPct: number | null;
  /** `up_good` etc., so the renderer colours a fall in PAR as good. */
  direction: string;
  /** Set when the raw value needs explaining rather than celebrating. */
  note?: string;
};

export type EvidencePoint = { label: string; value: number | null };

export type EvidenceTrend = {
  id: string;
  label: string;
  unit: MetricUnit;
  points: EvidencePoint[];
  coverageNote: string | null;
};

export type EvidenceColumn = {
  key: string;
  label: string;
  align: "left" | "right";
  /** How the renderer formats the cell. Omitted for plain text columns. */
  unit?: MetricUnit;
};

export type EvidenceTable = {
  id: string;
  label: string;
  columns: EvidenceColumn[];
  rows: Array<Record<string, string | number | null>>;
  /** True row count before any capping, so the card can say "of 340". */
  total: number;
};

export type TurnEvidence = {
  metrics: Record<string, EvidenceMetric>;
  trends: Record<string, EvidenceTrend>;
  tables: Record<string, EvidenceTable>;
};

export function emptyEvidence(): TurnEvidence {
  return { metrics: {}, trends: {}, tables: {} };
}

export function isEvidenceEmpty(evidence: TurnEvidence): boolean {
  return (
    Object.keys(evidence.metrics).length === 0 &&
    Object.keys(evidence.trends).length === 0 &&
    Object.keys(evidence.tables).length === 0
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function collectMetrics(target: TurnEvidence, raw: unknown): void {
  for (const item of asArray(raw)) {
    const row = asRecord(item);
    if (!row) continue;
    const id = str(row.id);
    const value = num(row.value);
    if (!id || value === null) continue;
    target.metrics[id] = {
      id,
      label: str(row.label) ?? id,
      unit: (str(row.unit) ?? "count") as MetricUnit,
      value,
      prior: num(row.prior),
      deltaPct: num(row.deltaPct),
      direction: str(row.direction) ?? "neutral",
      ...(str(row.note) ? { note: str(row.note) as string } : {}),
    };
  }
}

function collectTrend(target: TurnEvidence, data: Record<string, unknown>): void {
  const group = asRecord(data.group);
  const groupId = str(data.series) ?? str(group?.id);
  if (!group || !groupId) return;
  const coverage = asRecord(group.coverage);
  const coverageNote = str(coverage?.note);

  for (const item of asArray(group.series)) {
    const series = asRecord(item);
    const seriesId = str(series?.id);
    if (!series || !seriesId) continue;
    target.trends[seriesId] = {
      id: seriesId,
      label: str(series.label) ?? seriesId,
      unit: (str(series.unit) ?? "count") as MetricUnit,
      points: asArray(series.points).map((p) => {
        const point = asRecord(p);
        return { label: str(point?.label) ?? "", value: num(point?.value) };
      }),
      coverageNote,
    };
  }
}

/** Builds a table from row objects, keeping only columns those rows actually have. */
function tableFrom(
  id: string,
  label: string,
  rows: unknown[],
  columns: EvidenceColumn[],
  total?: number,
): EvidenceTable | null {
  const mapped: Array<Record<string, string | number | null>> = [];
  for (const item of rows) {
    const row = asRecord(item);
    if (!row) continue;
    const out: Record<string, string | number | null> = {};
    for (const column of columns) {
      const value = row[column.key];
      out[column.key] =
        typeof value === "number" || typeof value === "string" ? value : null;
    }
    mapped.push(out);
  }
  if (mapped.length === 0) return null;

  const used = columns.filter((column) =>
    mapped.some((row) => row[column.key] !== null && row[column.key] !== ""),
  );
  if (used.length === 0) return null;

  return { id, label, columns: used, rows: mapped, total: total ?? mapped.length };
}

function put(target: TurnEvidence, table: EvidenceTable | null): void {
  if (table) target.tables[table.id] = table;
}

/**
 * Names the account column after whichever identifier survived redaction, so a
 * table never renders a "Borrower" header above a column of loan numbers.
 */
function accountColumn(rows: unknown[]): EvidenceColumn {
  const named = rows.some((item) => str(asRecord(item)?.borrowerName));
  return named ? text("borrowerName", "Borrower") : text("loanAccountNo", "Account");
}

const text = (key: string, label: string): EvidenceColumn => ({ key, label, align: "left" });
const money = (key: string, label: string): EvidenceColumn => ({
  key,
  label,
  align: "right",
  unit: "php",
});
const count = (key: string, label: string): EvidenceColumn => ({
  key,
  label,
  align: "right",
  unit: "count",
});
const days = (key: string, label: string): EvidenceColumn => ({
  key,
  label,
  align: "right",
  unit: "days",
});
const percent = (key: string, label: string): EvidenceColumn => ({
  key,
  label,
  align: "right",
  unit: "percent",
});

/** `buildAgingReport` returns a flat object of per-bucket account counts. */
function agingRows(raw: unknown): Array<Record<string, unknown>> {
  const aging = asRecord(raw);
  if (!aging) return [];
  const buckets: Array<[string, string]> = [
    ["current", "Current"],
    ["bucket1_30", "1-30 days"],
    ["bucket31_60", "31-60 days"],
    ["bucket61_90", "61-90 days"],
    ["bucket91_plus", "Over 90 days"],
  ];
  return buckets
    .map(([key, label]) => ({ bucket: label, accounts: num(aging[key]) }))
    .filter((row) => row.accounts !== null);
}

/** `buildPipelineReport` returns status → count, biggest queue first. */
function countRows(
  raw: unknown,
  keyName: string,
  valueName: string,
): Array<Record<string, unknown>> {
  const source = asRecord(raw);
  if (!source) return [];
  return Object.entries(source)
    .map(([key, value]) => ({ [keyName]: key, [valueName]: num(value) }))
    .filter((row) => (row[valueName] as number | null) !== null)
    .sort((a, b) => (b[valueName] as number) - (a[valueName] as number));
}

/**
 * Indexes one skill result into the turn's evidence. Everything the model can
 * later cite as a key has to pass through here, which is what makes the
 * validator's "is this key real" check meaningful.
 */
export function captureSkillResult(target: TurnEvidence, result: unknown): void {
  const envelope = asRecord(result);
  if (!envelope || envelope.ok !== true) return;
  const name = str(envelope.name);
  const data = asRecord(envelope.data);
  if (!name || !data) return;

  switch (name) {
    case "get_snapshot": {
      collectMetrics(target, data.metrics);
      put(
        target,
        tableFrom("aging", "Accounts by aging", agingRows(data.aging), [
          text("bucket", "Bucket"),
          count("accounts", "Accounts"),
        ]),
      );
      put(
        target,
        tableFrom("pipeline", "Pipeline", countRows(data.pipeline, "status", "count"), [
          text("status", "Stage"),
          count("count", "Files"),
        ]),
      );
      put(
        target,
        tableFrom(
          "stuckFiles",
          "Stuck files",
          asArray(data.stuckFiles),
          [
            text("applicationNo", "Application"),
            text("status", "Stage"),
            days("daysInStatus", "Days"),
          ],
          num(data.stuckFileCount) ?? undefined,
        ),
      );
      break;
    }

    case "get_metric": {
      const def = asRecord(data.def);
      const value = asRecord(data.value);
      if (def && value) {
        collectMetrics(target, [{ ...value, label: def.label, unit: def.unit, direction: def.direction }]);
      }
      break;
    }

    case "get_trends":
      collectTrend(target, data);
      break;

    case "get_bottlenecks":
      put(
        target,
        tableFrom("bottlenecks", "Where work is waiting", asArray(data.entries), [
          text("stage", "Stage"),
          count("count", "Waiting"),
          days("oldestDays", "Oldest"),
        ]),
      );
      break;

    case "get_staff": {
      put(
        target,
        tableFrom("collectors", "Collectors", asArray(data.collectors), [
          text("name", "Collector"),
          money("amountCollected", "Collected"),
          count("accountsHeld", "Accounts"),
        ]),
      );
      put(
        target,
        tableFrom("agents", "Agents", asArray(data.agents), [
          text("name", "Agent"),
          count("leadsConverted", "Converted"),
          percent("conversionRatePct", "Rate"),
        ]),
      );
      put(
        target,
        tableFrom("committee", "Committee", asArray(data.committeeParticipation), [
          text("name", "Member"),
          count("votesCast", "Votes"),
        ]),
      );
      put(
        target,
        tableFrom("remedial", "Remedial", asArray(data.remedial), [
          text("name", "Officer"),
          money("amountRecovered", "Recovered"),
          count("accountsHeld", "Accounts"),
        ]),
      );
      break;
    }

    case "list_accounts": {
      const rows = asArray(data.rows);
      const byBorrower = str(data.view) === "borrowers";
      put(
        target,
        tableFrom(
          "accounts",
          "Accounts",
          rows,
          byBorrower
            ? [
                text("name", "Borrower"),
                money("outstanding", "Outstanding"),
                count("loanCount", "Loans"),
              ]
            : [
                accountColumn(rows),
                money("outstanding", "Outstanding"),
                text("agingBucket", "Aging"),
              ],
          num(asRecord(data.kpis)?.count) ?? undefined,
        ),
      );
      break;
    }

    case "list_past_due": {
      const rows = asArray(data.rows);
      put(
        target,
        tableFrom(
          "pastDue",
          "Past due",
          rows,
          [
            accountColumn(rows),
            money("outstanding", "Outstanding"),
            days("daysLate", "Days late"),
          ],
          num(asRecord(data.kpis)?.count) ?? undefined,
        ),
      );
      break;
    }

    case "list_collections": {
      collectMetrics(target, data.metrics);
      put(
        target,
        tableFrom("collectors", "Collectors", asArray(data.collectors), [
          text("name", "Collector"),
          money("amountCollected", "Collected"),
          count("dcrsSubmitted", "DCRs"),
        ]),
      );
      break;
    }

    case "list_pipeline": {
      collectMetrics(target, data.metrics);
      const rows = asArray(data.stuckFiles);
      put(
        target,
        tableFrom(
          "stuckFiles",
          "Stuck files",
          rows,
          [
            text("applicationNo", "Application"),
            text("status", "Stage"),
            days("daysInStatus", "Days"),
          ],
          num(asRecord(data.kpis)?.stuckFileCount) ?? undefined,
        ),
      );
      break;
    }

    default:
      break;
  }
}

/** The keys the model may cite, listed for it in the final prompt turn. */
export function describeEvidence(evidence: TurnEvidence): string {
  const lines: string[] = [];

  const metrics = Object.values(evidence.metrics);
  if (metrics.length > 0) {
    lines.push("Figures you may show (metricIds):");
    for (const metric of metrics) {
      lines.push(`- ${metric.id} — ${metric.label}${metric.note ? ` (${metric.note})` : ""}`);
    }
  }

  const trends = Object.values(evidence.trends);
  if (trends.length > 0) {
    lines.push("Charts you may show (trendId):");
    for (const trend of trends) lines.push(`- ${trend.id} — ${trend.label} by month`);
  }

  const tables = Object.values(evidence.tables);
  if (tables.length > 0) {
    lines.push("Lists you may show (tableId):");
    for (const table of tables) {
      lines.push(`- ${table.id} — ${table.label}, ${table.total} row(s)`);
    }
  }

  if (lines.length === 0) return "You have no figures for this turn. Answer in prose only.";
  return lines.join("\n");
}

/**
 * Strips the evidence down to what the card actually cites before it is sent to
 * the browser and written to the thread. A single `get_snapshot` carries far
 * more than any one answer shows, and threads keep a hundred messages.
 */
export function pruneEvidence(evidence: TurnEvidence, card: AnswerCard): TurnEvidence {
  const kept = emptyEvidence();
  for (const block of card.blocks) {
    if (block.kind === "kpi") {
      for (const id of block.metricIds) {
        const metric = evidence.metrics[id];
        if (metric) kept.metrics[id] = metric;
      }
    }
    if (block.kind === "chart") {
      const trend = evidence.trends[block.trendId];
      if (trend) kept.trends[block.trendId] = trend;
    }
    if (block.kind === "table") {
      const table = evidence.tables[block.tableId];
      if (table) {
        kept.tables[block.tableId] = { ...table, rows: table.rows.slice(0, block.limit) };
      }
    }
  }
  return kept;
}
