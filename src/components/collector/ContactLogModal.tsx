"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Input, Label, Modal, Select } from "@/components/ui";
import type { ContactHistoryRow } from "@/lib/collector/contact-history";

type ContactType = "call" | "sms" | "email" | "visit";

const TYPE_LABEL: Record<string, string> = {
  call: "Call",
  sms: "SMS",
  email: "Email",
  visit: "Visit",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type ContactLogModalProps = {
  open: boolean;
  borrowerName: string;
  masterlistId: string;
  onClose: () => void;
  onLogged: () => void;
};

export function ContactLogModal({
  open,
  borrowerName,
  masterlistId,
  onClose,
  onLogged,
}: ContactLogModalProps) {
  const [contactType, setContactType] = useState<ContactType>("call");
  const [notes, setNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ContactHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetch(
      `/api/collector/contacts?masterlistId=${encodeURIComponent(masterlistId)}`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load contact history");
        const body = (await res.json()) as { contacts?: ContactHistoryRow[] };
        if (!cancelled) setHistory(body.contacts ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setHistoryError(err instanceof Error ? err.message : "Failed");
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, masterlistId]);

  function reset() {
    setContactType("call");
    setNotes("");
    setCallbackAt("");
    setError(null);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/collector/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterlistId,
          contactType,
          notes: notes.trim() || undefined,
          callbackAt: callbackAt ? new Date(callbackAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to log contact");
      }
      reset();
      onLogged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Log contact â€” ${borrowerName}`}
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="mb-4">
        <Label>Contact history</Label>
        {historyLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : historyError ? (
          <Alert>{historyError}</Alert>
        ) : history.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No contacts logged yet.
          </p>
        ) : (
          <ul
            className="grid gap-2"
            style={{ maxHeight: 220, overflowY: "auto" }}
          >
            {history.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-[var(--border)] p-2 text-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {TYPE_LABEL[c.contactType] ?? c.contactType} ·{" "}
                    {c.collectorName}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    {formatDateTime(c.createdAt)}
                  </span>
                </div>
                {c.notes ? (
                  <p className="mt-1 whitespace-pre-wrap">{c.notes}</p>
                ) : null}
                {c.callbackAt ? (
                  <p className="mt-1 text-[var(--text-muted)]">
                    Callback: {formatDateTime(c.callbackAt)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-3">
        <div>
          <Label>Contact type</Label>
          <Select
            value={contactType}
            onChange={(e) => setContactType(e.target.value as ContactType)}
          >
            <option value="call">Call</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="visit">Visit</option>
          </Select>
        </div>
        <div>
          <Label>Notes</Label>
          <textarea
            className="input"
            style={{ minHeight: 80, resize: "vertical" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was discussed, or why unreachable"
          />
        </div>
        <div>
          <Label>Callback (if unreachable)</Label>
          <Input
            type="datetime-local"
            value={callbackAt}
            onChange={(e) => setCallbackAt(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
