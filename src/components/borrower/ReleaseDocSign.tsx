"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Card } from "@/components/ui";

type ReleaseDoc = {
  id: string;
  document_slug: string;
  signed_at: string | null;
  downloadUrl?: string | null;
};

type ReleaseDocSignProps = {
  applicationId: string;
  onSigned: () => void;
};

const CheckIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const ClockIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3}
    strokeLinecap="round"
  >
    <path d="M12 7v6M12 17h.01" />
  </svg>
);

/**
 * Read-only progress view: release documents are signed in-branch during the
 * LRA-facilitated signing session, not from the portal.
 */
export function ReleaseDocSign({ applicationId }: ReleaseDocSignProps) {
  const [documents, setDocuments] = useState<ReleaseDoc[]>([]);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [collapseInitialized, setCollapseInitialized] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch(
        `/api/borrower/applications/${applicationId}/release-documents`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        documents: ReleaseDoc[];
        blocker: string | null;
        releaseFile: { status: string } | null;
      };
      setDocuments(data.documents);
      setBlocker(data.blocker);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = documents.filter((d) => !d.signed_at);
  const allDone = documents.length > 0 && pending.length === 0;

  useEffect(() => {
    if (collapseInitialized || loading || documents.length === 0) return;
    setCollapsed(allDone);
    setCollapseInitialized(true);
  }, [collapseInitialized, loading, documents.length, allDone]);

  if (loading || documents.length === 0) return null;

  const progressLabel = `${documents.length - pending.length}/${documents.length}`;
  const isOpen = !collapsed;

  return (
    <Card className="mb-6">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={isOpen}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-semibold leading-tight text-navy-900">
              Release documents
            </span>
            <span
              className={`mono text-[11.5px] font-semibold ${
                allDone ? "text-success" : "text-ink-400"
              }`}
            >
              {progressLabel}
            </span>
          </span>
          <span className="mt-0.5 block text-sm leading-snug text-ink-500">
            You will sign these at the branch with your loan release officer.
          </span>
        </span>
        <span
          className="mono mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-base text-teal-600 hover:bg-surface-2"
          aria-hidden
        >
          {isOpen ? "–" : "+"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3">
          {blocker ? (
            <div className="mb-3">
              <Alert variant="warning">{blocker}</Alert>
            </div>
          ) : null}

          <div className="chk-list chk-list--page !max-w-none">
            {documents.map((doc) => {
              const signed = Boolean(doc.signed_at);
              return (
                <div key={doc.id} className={`ci ${signed ? "ok" : "pend"}`}>
                  <span className="st">{signed ? CheckIcon : ClockIcon}</span>
                  <div>
                    <b className="capitalize">
                      {doc.document_slug.replace(/_/g, " ")}
                    </b>
                    <span>
                      {signed
                        ? `Signed ${new Date(doc.signed_at!).toLocaleString()}`
                        : "To be signed at your branch signing session"}
                    </span>
                  </div>
                  <span className="act flex items-center gap-2">
                    {doc.downloadUrl ? (
                      <a
                        href={doc.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-teal-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        PDF
                      </a>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>

          {allDone ? (
            <div className="mt-3">
              <Alert variant="success">All release documents signed.</Alert>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
