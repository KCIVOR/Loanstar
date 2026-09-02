"use client";

import { useState } from "react";

import type { CoBorrower } from "@/lib/applications/co-borrower";
import { Alert, Button, Input, Label } from "@/components/ui";

/**
 * Co-Borrower feature (Phase 4/5). Editable list of co-borrower name +
 * address, or a read-only list when `editable` is false (LRA, post-lock
 * views). Saves via the dedicated PATCH route; the requirement is advisory
 * only, so nothing here blocks a workflow.
 */
export function CoBorrowerSection({
  applicationId,
  coBorrowers,
  editable,
  onSaved,
}: {
  applicationId: string;
  coBorrowers: CoBorrower[];
  editable: boolean;
  onSaved?: () => void;
}) {
  // Seeded once; refreshed from the server response after a successful save
  // (an event handler, never an effect).
  const [rows, setRows] = useState<CoBorrower[]>(() => coBorrowers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  if (!editable) {
    if (coBorrowers.length === 0) {
      return <p className="text-sm text-ink-500">No co-borrower on file.</p>;
    }
    return (
      <ul className="space-y-2">
        {coBorrowers.map((c, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium text-ink-900">{c.fullName}</span>
            <span className="text-ink-500"> — {c.address}</span>
          </li>
        ))}
      </ul>
    );
  }

  function updateRow(index: number, field: keyof CoBorrower, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
    setSavedNote(false);
  }

  function addRow() {
    setRows((prev) => [...prev, { fullName: "", address: "" }]);
    setSavedNote(false);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setSavedNote(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedNote(false);
    try {
      const payload = rows
        .map((r) => ({
          fullName: r.fullName.trim(),
          address: r.address.trim(),
        }))
        .filter((r) => r.fullName && r.address);

      const res = await fetch(
        `/api/applications/${applicationId}/co-borrowers`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coBorrowers: payload }),
        },
      );
      const body = (await res.json()) as {
        error?: string;
        coBorrowers?: CoBorrower[];
      };
      if (!res.ok) throw new Error(body.error ?? "Could not save co-borrowers");

      setRows(body.coBorrowers ?? payload);
      setSavedNote(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save co-borrowers");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-500">
          No co-borrower added yet. Name and address are enough.
        </p>
      ) : (
        rows.map((row, i) => (
          <div
            key={i}
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <div>
              <Label htmlFor={`cb-name-${i}`}>Full name</Label>
              <Input
                id={`cb-name-${i}`}
                value={row.fullName}
                onChange={(e) => updateRow(i, "fullName", e.target.value)}
                placeholder="Co-borrower's full name"
              />
            </div>
            <div>
              <Label htmlFor={`cb-addr-${i}`}>Address</Label>
              <Input
                id={`cb-addr-${i}`}
                value={row.address}
                onChange={(e) => updateRow(i, "address", e.target.value)}
                placeholder="Co-borrower's address"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => removeRow(i)}
              aria-label={`Remove co-borrower ${i + 1}`}
            >
              Remove
            </Button>
          </div>
        ))
      )}

      {error ? <Alert variant="danger">{error}</Alert> : null}
      {savedNote ? <Alert variant="success">Co-borrowers saved.</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={addRow}>
          + Add co-borrower
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={saving}
          onClick={() => void save()}
        >
          Save co-borrowers
        </Button>
      </div>
    </div>
  );
}
