"use client";

import { useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Textarea,
} from "@/components/ui";

type BorrowerAccountResult = {
  id: string;
  borrowerNo: string | null;
  fullName: string;
  email: string;
  mobilePhone: string | null;
};

type ChangeOwnerPanelProps = {
  applicationId: string;
  currentBorrowerId: string;
  currentBorrowerName: string;
  onChanged: () => void;
};

const MIN_REASON = 10;
const MAX_REASON = 500;

export function ChangeOwnerPanel({
  applicationId,
  currentBorrowerId,
  currentBorrowerName,
  onChanged,
}: ChangeOwnerPanelProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [results, setResults] = useState<BorrowerAccountResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<BorrowerAccountResult | null>(null);
  const [saving, setSaving] = useState(false);

  const reasonOk = reason.trim().length >= MIN_REASON;
  const visibleResults = debouncedSearch.trim() ? results : [];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!debouncedSearch.trim()) return;
    let cancelled = false;
    void fetch(`/api/csa/borrowers/search?q=${encodeURIComponent(debouncedSearch.trim())}`)
      .then((res) => res.json())
      .then((data: { borrowers?: BorrowerAccountResult[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setResults(
          (data.borrowers ?? []).filter((b) => b.id !== currentBorrowerId),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Search failed");
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, currentBorrowerId]);

  async function handleChangeOwner() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/csa/applications/${applicationId}/change-owner`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetBorrowerId: selected.id,
            reason: reason.trim(),
          }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Change owner failed");
      setSuccess(
        `Owner changed to ${selected.fullName}. If an Application Form was already printed, please regenerate it.`,
      );
      setSelected(null);
      setSearch("");
      setResults([]);
      setReason("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Change owner failed");
      setSelected(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
        Change owner
      </h2>
      <p className="mb-4 text-sm text-ink-500">
        This application belongs to {currentBorrowerName}&apos;s portal
        account. If it was filed under the wrong account, move it to the
        correct borrower account below. Uploaded documents move with it;
        profile details are not copied.
      </p>

      {success ? (
        <div className="mb-3">
          <Alert variant="success">{success}</Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <label className="mb-1 block text-sm font-medium text-ink-700">
        Reason for the change
      </label>
      <Textarea
        value={reason}
        maxLength={MAX_REASON}
        placeholder="e.g. Application was created under the spouse's account by mistake"
        onChange={(e) => setReason(e.target.value)}
      />
      <p className="mb-4 mt-1 text-xs text-ink-400">
        {reasonOk
          ? `${reason.trim().length}/${MAX_REASON}`
          : `At least ${MIN_REASON} characters (${reason.trim().length}/${MIN_REASON})`}
      </p>

      <Input
        placeholder="Search the new owner by name, email, or borrower no."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setSearching(Boolean(e.target.value.trim()));
        }}
      />

      {searching ? (
        <p className="mt-3 text-sm text-ink-400">Searching…</p>
      ) : debouncedSearch.trim() && visibleResults.length === 0 ? (
        <p className="mt-3 text-sm text-ink-400">No matching accounts found.</p>
      ) : visibleResults.length > 0 ? (
        <div className="mt-3 space-y-2">
          {visibleResults.map((borrower) => (
            <div
              key={borrower.id}
              className="flex items-center justify-between rounded-[var(--r-md)] border border-line-soft p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-900">
                  {borrower.fullName}
                  {borrower.borrowerNo ? (
                    <span className="ml-2 text-xs text-ink-400">
                      {borrower.borrowerNo}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-ink-400">
                  {borrower.email}
                  {borrower.mobilePhone ? ` · ${borrower.mobilePhone}` : ""}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!reasonOk}
                title={reasonOk ? undefined : "Enter a reason first"}
                onClick={() => {
                  setSuccess(null);
                  setSelected(borrower);
                }}
              >
                Move here
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={selected !== null}
        title="Change the owner of this application?"
        message={
          selected
            ? `This moves the application to ${selected.fullName}'s account (${selected.email}). ${currentBorrowerName} will no longer see it in their portal. Both borrowers will be notified. If an Application Form was already printed, regenerate it afterwards.`
            : ""
        }
        confirmLabel="Yes, change owner"
        cancelLabel="Cancel"
        loading={saving}
        onConfirm={() => void handleChangeOwner()}
        onCancel={() => setSelected(null)}
      />
    </Card>
  );
}
