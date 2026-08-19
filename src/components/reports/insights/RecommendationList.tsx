"use client";

import { Badge, Card, EmptyState } from "@/components/ui";
import type { BriefPriority, BriefRecommendation } from "@/lib/reports/insights/schema";

const PRIORITY: Record<BriefPriority, { label: string; variant: "danger" | "warning" | "neutral" }> =
  {
    high: { label: "High", variant: "danger" },
    medium: { label: "Medium", variant: "warning" },
    low: { label: "Low", variant: "neutral" },
  };

/** Turns `trend.delinquency.par30` into "Delinquency par30" so the evidence
 *  trail reads as English rather than as internal keys. */
export function labelEvidenceKey(key: string): string {
  const parts = key.split(".");
  const tail = parts.slice(1).join(" ");
  const words = tail
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

export function RecommendationList({
  recommendations,
}: {
  recommendations: BriefRecommendation[];
}) {
  if (recommendations.length === 0) {
    return (
      <EmptyState
        title="No recommendations"
        description="Nothing in this period rose to the level of an action worth naming."
      />
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec, i) => {
        const priority = PRIORITY[rec.priority];
        return (
          <Card key={i}>
            <div className="flex items-start gap-3">
              <Badge variant={priority.variant}>{priority.label}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--ink-900)]">{rec.action}</p>
                {rec.why && (
                  <p className="mt-1 text-sm text-[var(--ink-700)]">{rec.why}</p>
                )}
                {rec.evidenceKeys.length > 0 && (
                  <p className="mt-2 text-xs text-[var(--ink-400)]">
                    Based on {rec.evidenceKeys.map(labelEvidenceKey).join(", ")}
                  </p>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
