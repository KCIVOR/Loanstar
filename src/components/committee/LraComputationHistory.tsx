import { useState, useSyncExternalStore } from "react";

import { Button, Modal, Table, Td, Th } from "@/components/ui";
import { formatAuditDate, humanize } from "@/lib/audit/labels";

export type LraComputationChange = {
  id: string;
  actorName: string;
  createdAt: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const metadata = new Set([
  "applicationId", "autoApprovedBy", "cleared", "computationId",
  "reason", "releaseFileStatus", "trigger",
]);

const fieldLabels: Record<string, string> = {
  loanTypeName: "Loan type",
  terms: "Term (months)",
  addonMonths: "Add-on months",
  pfRate: "Processing fee rate",
};

const currencyFields = new Set([
  "inputAmount", "principal", "netReleased", "totalInterest", "totalLoan",
  "monthlyAmortization", "totalDeductions", "otherDeductionsTotal",
]);
const currency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
const percent = new Intl.NumberFormat("en-PH", {
  style: "percent",
  maximumFractionDigits: 5,
});

function formatValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number" && currencyFields.has(key)) return currency.format(value);
  if (typeof value === "number" && key.endsWith("Rate")) return percent.format(value);
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return key === "inputMode" || key === "paymentFrequency"
    ? humanize(String(value))
    : String(value);
}

const historyHash = "#lra-computation-history";

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function LraComputationHistory({ events }: { events: LraComputationChange[] }) {
  const [open, setOpen] = useState(false);
  const linked = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash === historyHash,
    () => false,
  );

  function close() {
    setOpen(false);
    if (window.location.hash === historyHash) {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(window.history.state, "", url);
      window.dispatchEvent(new Event("hashchange"));
    }
  }

  return (
    <div className="mb-6">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View LRA computation history
      </Button>
      <Modal
        open={open || linked}
        title="LRA computation history"
        onClose={close}
        className="!max-w-6xl"
        footer={<Button variant="secondary" onClick={close}>Close</Button>}
      >
        {events.length === 0 ? (
          <p className="text-sm text-ink-500">LRA has not recalculated this loan.</p>
        ) : (
          <ol className="space-y-5">
            {events.map(({ id, actorName, createdAt, before, after }) => {
              const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
                .filter((key) => !metadata.has(key) &&
                  JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
              const cleared = after.cleared as {
                generatedDocuments?: number;
                pdcChecks?: number;
                briefingReset?: boolean;
              } | undefined;
              return (
                <li key={id} className="border-t border-[var(--line)] pt-5 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-navy-900">{actorName}</h3>
                    <time className="text-sm text-ink-500" dateTime={createdAt}>
                      {formatAuditDate(createdAt)} PHT
                    </time>
                  </div>
                  {typeof after.reason === "string" ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      <strong>Reason</strong> {after.reason}
                    </p>
                  ) : null}
                  {typeof after.releaseFileStatus === "string" ? (
                    <p className="mt-2 text-sm text-ink-500">
                      Release step {humanize(String(before.releaseFileStatus ?? "unknown"))}
                      {" → "}{humanize(after.releaseFileStatus)}
                    </p>
                  ) : null}
                  {cleared ? (
                    <p className="mt-1 text-sm text-ink-500">
                      Cleared {cleared.pdcChecks ?? 0} PDC checks and{" "}
                      {cleared.generatedDocuments ?? 0} release documents.
                      {cleared.briefingReset ? " Briefing acknowledgement was reset." : ""}
                    </p>
                  ) : null}
                  {fields.length ? (
                      <Table className="mt-3">
                        <thead>
                          <tr>
                            <Th>Field</Th>
                            <Th>Before</Th>
                            <Th>After</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((key) => (
                            <tr key={key} className="align-top">
                              <Td className="font-medium">
                                {fieldLabels[key] ?? humanize(key)}
                              </Td>
                              <Td className="whitespace-pre-wrap break-words">{formatValue(key, before[key])}</Td>
                              <Td className="whitespace-pre-wrap break-words">{formatValue(key, after[key])}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                  ) : <p className="mt-3 text-sm text-ink-500">No changes in the recorded figures.</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Modal>
    </div>
  );
}
