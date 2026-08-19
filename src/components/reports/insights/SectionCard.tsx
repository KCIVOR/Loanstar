"use client";

import type { ReactNode } from "react";

import { Badge, Card } from "@/components/ui";
import type { BriefSection, BriefVerdict } from "@/lib/reports/insights/schema";

const VERDICT: Record<
  BriefVerdict,
  { label: string; badge: "success" | "warning" | "danger"; card: "base" | "warning" | "danger" }
> = {
  good: { label: "On track", badge: "success", card: "base" },
  watch: { label: "Watch", badge: "warning", card: "warning" },
  action: { label: "Needs action", badge: "danger", card: "danger" },
};

export function SectionCard({
  section,
  children,
}: {
  section: BriefSection;
  children?: ReactNode;
}) {
  const verdict = VERDICT[section.verdict];

  return (
    <Card variant={verdict.card} id={`section-${section.id}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--ink-900)]">{section.title}</h3>
        <Badge variant={verdict.badge} dot>
          {verdict.label}
        </Badge>
      </div>

      {section.summary && (
        <p className="mb-3 text-sm leading-relaxed text-[var(--ink-700)]">{section.summary}</p>
      )}

      {section.highlights.length > 0 && (
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-[var(--ink-700)]">
          {section.highlights.map((highlight, i) => (
            <li key={i}>{highlight}</li>
          ))}
        </ul>
      )}

      {children}
    </Card>
  );
}
