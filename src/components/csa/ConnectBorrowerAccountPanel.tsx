"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Card, ConfirmDialog, Input } from "@/components/ui";

type BorrowerAccountResult = {
  id: string;
  borrowerNo: string | null;
  fullName: string;
  email: string;
  mobilePhone: string | null;
};

type ConnectBorrowerAccountPanelProps = {
  applicationId: string;
  onConnected: () => void;
};

export function ConnectBorrowerAccountPanel({
  applicationId,
  onConnected,
}: ConnectBorrowerAccountPanelProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [results, setResults] = useState<BorrowerAccountResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BorrowerAccountResult | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    void fetch(`/api/csa/borrowers/search?q=${encodeURIComponent(debouncedSearch.trim())}`)
      .then((res) => res.json())
      .then((data: { borrowers?: BorrowerAccountResult[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setResults(data.borrowers ?? []);
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
  }, [debouncedSearch]);

  async function handleConnect() {
    if (!selected) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/csa/applications/${applicationId}/connect-borrower`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetBorrowerId: selected.id }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Connect failed");
      setSelected(null);
      setSearch("");
      setResults([]);
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
        Connect to borrower&apos;s account
      </h2>
      <p className="mb-4 text-sm text-ink-500">
        This application isn&apos;t linked to a borrower portal account. If
        the borrower has since registered, search for their account below and
        connect it — this re-links the application to their account without
        touching any intake data already on file.
      </p>

      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Input
        placeholder="Search by name, email, or borrower no."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {searching ? (
        <p className="mt-3 text-sm text-ink-400">Searching…</p>
      ) : debouncedSearch.trim() && results.length === 0 ? (
        <p className="mt-3 text-sm text-ink-400">No matching accounts found.</p>
      ) : results.length > 0 ? (
        <div className="mt-3 space-y-2">
          {results.map((borrower) => (
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
                onClick={() => setSelected(borrower)}
              >
                Connect
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={selected !== null}
        title="Connect to this borrower account?"
        message={
          selected
            ? `This will re-link the application to ${selected.fullName}'s account (${selected.email}). The borrower will then see this application in their portal. This cannot be undone from here.`
            : ""
        }
        confirmLabel="Yes, connect"
        cancelLabel="Cancel"
        loading={connecting}
        onConfirm={() => void handleConnect()}
        onCancel={() => setSelected(null)}
      />
    </Card>
  );
}
