"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Badge, Button, Input, Label, Modal } from "@/components/ui";

type NameMatch = {
  id: string;
  displayName: string;
};

export function NewLeadModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (leadId: string) => void;
}) {
  const router = useRouter();
  const [borrowerName, setBorrowerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [linkedBorrowerId, setLinkedBorrowerId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [matches, setMatches] = useState<NameMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setBorrowerName("");
    setBusinessName("");
    setLinkedBorrowerId(null);
    setSearchQ("");
    setMatches([]);
    setSearchError(null);
    setError(null);
    setLoading(false);
    setSearching(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = searchQ.trim();
    if (q.length < 2) {
      setMatches([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/agent/borrowers/search?q=${encodeURIComponent(q)}`,
          );
          if (!res.ok) throw new Error("Search failed");
          const data = (await res.json()) as { matches: NameMatch[] };
          if (seq !== searchSeq.current) return;
          setMatches(data.matches ?? []);
          setSearchError(null);
        } catch (err) {
          if (seq !== searchSeq.current) return;
          setMatches([]);
          setSearchError(
            err instanceof Error ? err.message : "Search failed",
          );
        } finally {
          if (seq === searchSeq.current) setSearching(false);
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchQ, open]);

  function selectMatch(match: NameMatch) {
    setLinkedBorrowerId(match.id);
    setBorrowerName(match.displayName);
    setSearchQ(match.displayName);
    setMatches([]);
  }

  function clearLink() {
    setLinkedBorrowerId(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/agent/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrowerName: borrowerName.trim(),
          businessName: businessName.trim() || undefined,
          borrowerId: linkedBorrowerId ?? undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to create lead");
      }

      const data = (await res.json()) as { lead: { id: string } };
      onClose();
      onCreated?.(data.lead.id);
      router.push(`/agent/leads/${data.lead.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create lead");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Start a lead"
      onClose={() => {
        if (!loading) onClose();
      }}
      className="max-w-[460px]"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" form="new-lead-form" loading={loading}>
            Create lead
          </Button>
        </>
      }
    >
      <form
        id="new-lead-form"
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-4"
      >
        <p className="text-[14px] leading-relaxed text-ink-700">
          Opens a pipeline slot only — no loan application yet. Search by name
          to see if the borrower already exists; only names are shown.
        </p>

        {error ? <Alert>{error}</Alert> : null}

        <div>
          <Label htmlFor="modal-borrower-search">
            Check existing borrowers
          </Label>
          <div className="gsearch" style={{ maxWidth: "100%" }}>
            <span className="icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              id="modal-borrower-search"
              className="input"
              style={{
                height: 44,
                paddingRight: 12,
                borderRadius: "var(--r-lg)",
              }}
              value={searchQ}
              onChange={(e) => {
                setSearchQ(e.target.value);
                if (linkedBorrowerId) clearLink();
              }}
              placeholder="Type at least 2 letters…"
              autoComplete="off"
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-400">
            Name match only — no contact, address, or account details.
          </p>

          {searching ? (
            <p className="mt-2 text-xs text-ink-400">Searching…</p>
          ) : null}
          {searchError ? (
            <div className="mt-2">
              <Alert>{searchError}</Alert>
            </div>
          ) : null}

          {matches.length > 0 ? (
            <ul
              className="mt-2 max-h-40 overflow-y-auto rounded-[var(--r-md)] border border-line-soft"
              role="listbox"
              aria-label="Matching borrowers"
            >
              {matches.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-navy-50"
                    onClick={() => selectMatch(match)}
                  >
                    <span className="font-medium text-ink-900">
                      {match.displayName}
                    </span>
                    <Badge variant="warning">Exists</Badge>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {!searching &&
          searchQ.trim().length >= 2 &&
          matches.length === 0 &&
          !searchError ? (
            <p className="mt-2 text-xs text-ink-500">
              No existing borrower name matches.
            </p>
          ) : null}
        </div>

        {linkedBorrowerId ? (
          <div className="kv">
            <div className="row">
              <span className="k">Linked borrower</span>
              <span className="v flex items-center gap-2">
                <span>{borrowerName}</span>
                <button
                  type="button"
                  className="text-xs font-medium text-teal-700 hover:underline"
                  onClick={clearLink}
                >
                  Clear
                </button>
              </span>
            </div>
            <div className="row">
              <span className="k">Match</span>
              <span className="v">
                <Badge variant="teal">Already in system</Badge>
              </span>
            </div>
          </div>
        ) : null}

        <div>
          <Label htmlFor="modal-borrowerName" required>
            Borrower name
          </Label>
          <Input
            id="modal-borrowerName"
            required
            autoComplete="name"
            value={borrowerName}
            onChange={(e) => {
              setBorrowerName(e.target.value);
              if (linkedBorrowerId) clearLink();
            }}
            placeholder="Full legal name"
          />
        </div>

        <div>
          <Label htmlFor="modal-businessName">Business / agency name</Label>
          <Input
            id="modal-businessName"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </form>
    </Modal>
  );
}
