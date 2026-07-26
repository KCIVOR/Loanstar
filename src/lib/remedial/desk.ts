import {
  nextOpenInstallment,
  type ScheduleLite,
} from "../collector/desk";

export type RemedialSeverity = "critical" | "elevated" | "watch";

function daysPastDue(dueDate: string, asOf = new Date()): number {
  const due = new Date(dueDate);
  const diffMs = asOf.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function remedialDaysPastDue(
  schedules: ScheduleLite[],
  asOf = new Date(),
): number {
  const next = nextOpenInstallment(schedules);
  if (!next) return 0;
  return Math.max(0, daysPastDue(next.due_date, asOf));
}

/** Severity for recovery prioritization (unique to remedial desk). */
export function remedialSeverity(input: {
  outstandingBalance: number;
  daysPastDue: number;
  agingBucket: string;
}): RemedialSeverity {
  const bucket = input.agingBucket.toLowerCase();
  if (
    input.daysPastDue >= 120 ||
    bucket.includes("120") ||
    bucket.includes("180") ||
    input.outstandingBalance >= 100_000
  ) {
    return "critical";
  }
  if (input.daysPastDue >= 91 || bucket.includes("91") || input.outstandingBalance >= 50_000) {
    return "elevated";
  }
  return "watch";
}

export function severityLabel(severity: RemedialSeverity): string {
  if (severity === "critical") return "Critical";
  if (severity === "elevated") return "Elevated";
  return "Watch";
}

export function severityVariant(
  severity: RemedialSeverity,
): "danger" | "warning" | "neutral" {
  if (severity === "critical") return "danger";
  if (severity === "elevated") return "warning";
  return "neutral";
}

export function severityRank(severity: RemedialSeverity): number {
  if (severity === "critical") return 0;
  if (severity === "elevated") return 1;
  return 2;
}
