"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Button, Card } from "@/components/ui";

type RenderedDoc = {
  id: string;
  generatedAt: string;
  downloadUrl: string;
};

type GeneratedDocPanelProps = {
  /** Card heading, e.g. "Acknowledgement Receipt". */
  title: string;
  /** Base API path with both POST (generate) and GET (list) handlers. */
  endpoint: string;
  /** Generate-button label. Defaults to `Generate ${title}`. */
  generateLabel?: string;
  /** Optional helper text under the heading. */
  description?: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * Self-contained generate + list + download panel for a rendered document.
 * Reused across stage workspaces (release, intake, …) — the only variation is
 * the API endpoint and labels.
 */
export function GeneratedDocPanel({
  title,
  endpoint,
  generateLabel,
  description,
}: GeneratedDocPanelProps) {
  const [docs, setDocs] = useState<RenderedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Failed to load ${title}`);
      const data = (await res.json()) as { documents: RenderedDoc[] };
      setDocs(data.documents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [endpoint, title]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Failed to generate ${title}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {description ? (
            <p className="text-sm text-ink-500">{description}</p>
          ) : null}
        </div>
        <Button
          size="sm"
          loading={generating}
          onClick={() => void generate()}
        >
          {generateLabel ?? `Generate ${title}`}
        </Button>
      </div>

      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-ink-400">Not generated yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="mono text-ink-500">
                  {formatWhen(doc.generatedAt)}
                </span>
                <a
                  className="text-teal-600 underline"
                  href={doc.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download PDF
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
