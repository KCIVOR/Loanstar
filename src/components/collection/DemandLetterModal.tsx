"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Button, Label, Modal, Select } from "@/components/ui";
import { formatDate } from "@/lib/collector/format";

type DemandStage = "first_reminder" | "second_demand" | "final_demand";

type RenderedDoc = {
  id: string;
  generatedAt: string;
  downloadUrl: string;
  letterLabel?: string;
};

type LetterOption = { slug: string; label: string };

/** Empty value = let the system pick from the loan type and returned checks. */
const AUTO_LETTER = "";

type DemandLetterModalProps = {
  open: boolean;
  borrowerName: string;
  /** Role-prefixed API base, e.g. `/api/collector/accounts/${id}/demand-letter`. */
  apiBase: string;
  onClose: () => void;
};

const STAGE_OPTIONS: Array<{ value: DemandStage; label: string }> = [
  { value: "first_reminder", label: "First reminder" },
  { value: "second_demand", label: "Second demand" },
  { value: "final_demand", label: "Final demand (legal-action clause)" },
];

export function DemandLetterModal({
  open,
  borrowerName,
  apiBase,
  onClose,
}: DemandLetterModalProps) {
  const [stage, setStage] = useState<DemandStage>("first_reminder");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<RenderedDoc[]>([]);
  const [letters, setLetters] = useState<LetterOption[]>([]);
  const [letter, setLetter] = useState<string>(AUTO_LETTER);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch(apiBase);
      if (!res.ok) throw new Error("Failed to load demand letters");
      const data = (await res.json()) as {
        documents: RenderedDoc[];
        letters?: LetterOption[];
      };
      setDocs(data.documents);
      setLetters(data.letters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoadingDocs(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (open) void loadDocs();
  }, [open, loadDocs]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demandStage: stage,
          ...(letter ? { templateSlug: letter } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to generate demand letter");
      }
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Demand letter — ${borrowerName}`}
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose} disabled={generating}>
          Close
        </Button>
      }
    >
      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="grid gap-3">
        <div>
          <Label>Demand stage</Label>
          <Select
            value={stage}
            onChange={(e) => setStage(e.target.value as DemandStage)}
          >
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Letter</Label>
          <Select value={letter} onChange={(e) => setLetter(e.target.value)}>
            <option value={AUTO_LETTER}>Automatic (matches the loan type)</option>
            {letters.map((opt) => (
              <option key={opt.slug} value={opt.slug}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Button loading={generating} onClick={() => void generate()}>
            Generate demand letter
          </Button>
        </div>

        <div>
          <Label>Generated letters</Label>
          {loadingDocs ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-ink-400">No demand letters yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink-500">
                    <span className="mono">{formatDate(doc.generatedAt)}</span>
                    {doc.letterLabel ? ` · ${doc.letterLabel}` : ""}
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
      </div>
    </Modal>
  );
}
