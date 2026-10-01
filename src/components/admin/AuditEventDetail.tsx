"use client";

import { Accordion, Badge, Modal } from "@/components/ui";
import { outcomeWord } from "@/lib/audit/csv";
import { formatAuditDate } from "@/lib/audit/labels";
import type { ReadableAuditEvent } from "@/lib/audit/resolve";

type BadgeVariant = "success" | "danger" | "warning" | "neutral" | "navy";

export function outcomeVariant(outcome: string | null): BadgeVariant {
  switch (outcome) {
    case "approved":
    case "completed":
    case "signed_in":
      return "success";
    case "rejected":
    case "cancelled":
    case "deleted":
      return "danger";
    case "returned":
      return "warning";
    case "created":
    case "changed":
      return "navy";
    default:
      return "neutral";
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <div className="w-32 shrink-0 text-ink-3">{label}</div>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

/** Plain-language view of one Activity Log entry (Before → After). */
export function AuditEventDetail({
  event,
  onClose,
}: {
  event: ReadableAuditEvent | null;
  onClose: () => void;
}) {
  if (!event) return null;
  const t = event.technical;

  return (
    <Modal open title="Activity details" onClose={onClose} className="max-w-2xl">
      <div className="mb-4">
        <div className="text-base font-semibold">{event.summary}</div>
        {event.outcome ? (
          <Badge variant={outcomeVariant(event.outcome)} className="mt-2">
            {outcomeWord(event.outcome)}
          </Badge>
        ) : null}
      </div>

      <div className="mb-4 border-y border-line-soft py-2">
        <Row label="When">{formatAuditDate(event.createdAt)}</Row>
        <Row label="Done by">
          <span className="font-medium">{event.who.name}</span>
          {event.who.email ? <span className="text-ink-3"> · {event.who.email}</span> : null}
        </Row>
        <Row label="Role">
          {event.who.role ?? "—"}
          {event.who.roleIsCurrent ? (
            <span className="text-ink-3"> (current role — not recorded at the time)</span>
          ) : null}
        </Row>
        <Row label="Area">{event.area}</Row>
        <Row label="Loan">
          {event.loan
            ? [event.loan.applicationNo, event.loan.borrowerName].filter(Boolean).join(" · ") || "Linked loan"
            : "—"}
        </Row>
        <Row label="Device IP">{t.ipAddress ?? "—"}</Row>
      </div>

      <div className="mb-4">
        <div className="mb-2 text-sm font-semibold">What changed</div>
        {event.details.length ? (
          <div className="rounded border border-line-soft">
            {event.details.map((d) => (
              <div key={d.label} className="border-b border-line-soft px-3 py-2 text-sm last:border-b-0">
                <div className="text-xs text-ink-3">{d.label}</div>
                <div className="break-words">
                  {d.before && d.before !== d.after ? (
                    <>
                      <span className="text-ink-3 line-through">{d.before}</span>
                      <span className="mx-1.5 text-ink-3">→</span>
                    </>
                  ) : null}
                  <span className="font-medium">{d.after ?? "(removed)"}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-3">No further details were recorded for this action.</p>
        )}
      </div>

      <Accordion
        items={[
          {
            id: "tech",
            title: "Technical details",
            meta: "For system support",
            children: (
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-ink-3">Module:</span> {t.moduleSlug} ·{" "}
                  <span className="text-ink-3">Action:</span> {t.action} ·{" "}
                  <span className="text-ink-3">Record:</span> {t.entityType ?? "—"}
                  {t.entityId ? ` / ${t.entityId}` : ""}
                </div>
                {t.beforeData ? (
                  <pre className="max-h-48 overflow-auto rounded bg-surface-2 p-2">
                    {JSON.stringify(t.beforeData, null, 2)}
                  </pre>
                ) : null}
                {t.afterData ? (
                  <pre className="max-h-48 overflow-auto rounded bg-surface-2 p-2">
                    {JSON.stringify(t.afterData, null, 2)}
                  </pre>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
}
