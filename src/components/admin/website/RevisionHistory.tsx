"use client";

import { useEffect, useState } from "react";
import { websiteRequest, type Revision } from "./types";

export function RevisionHistory({
  currentId,
  canRestore,
  busy,
  onRestore,
}: {
  currentId: string;
  canRestore: boolean;
  busy: boolean;
  onRestore: (revision: Revision) => void;
}) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    websiteRequest<{ revisions: Revision[] }>(
      `/revisions?limit=20&offset=${page * 20}`,
    )
      .then((data) => {
        setRevisions(data.revisions);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [page, currentId]);
  return (
    <div>
      <h3 className="mb-3 font-semibold">Whole-website release history</h3>
      <p className="mb-4 text-sm text-slate-600">
        Restoring creates a new release for landing, login, registration and
        branding. It preserves your draft; reconcile that draft explicitly
        before publishing again.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {revisions.map((revision) => (
        <article key={revision.id} className="mb-3 rounded border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>
              Release {revision.revision_no}
              {revision.id === currentId && " · current"}
            </strong>
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              disabled={!canRestore || busy || revision.id === currentId}
              onClick={() => onRestore(revision)}
            >
              Restore release {revision.revision_no}
            </button>
          </div>
          <p className="mt-1 text-sm">
            {revision.change_summary || revision.operation}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(revision.created_at).toLocaleString()} · Actor{" "}
            {revision.created_by ?? "Initial baseline"}
            {revision.restored_from_revision_id &&
              ` · restored from ${revision.restored_from_revision_id}`}
          </p>
        </article>
      ))}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          type="button"
          disabled={revisions.length < 20}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
