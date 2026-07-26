"use client";

import { useState } from "react";

import { Alert, Button, Input, Label, Modal, Select } from "@/components/ui";

type ContactType = "call" | "sms" | "email" | "visit";

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
      title={`Log contact — ${borrowerName}`}
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
