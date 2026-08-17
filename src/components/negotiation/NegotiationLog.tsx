"use client";

import { useState } from "react";

import { Alert, Badge, Button, Card, Textarea } from "@/components/ui";

export type NegotiationLogMessage = {
  id: string;
  authorRole: "borrower" | "committee";
  authorName: string | null;
  kind: "message" | "offer" | "accept";
  body: string | null;
  amount: number | null;
  createdAt: string;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const ROLE_LABEL: Record<NegotiationLogMessage["authorRole"], string> = {
  borrower: "Borrower",
  committee: "Committee",
};

/**
 * Shared negotiation log — same list-of-entries pattern used for the
 * borrower/CSA/CIG status timelines elsewhere, plus a post box. Rendered on
 * both the borrower's and Committee's application pages so they see the
 * identical thread. Amount changes (counter-offers, overrides) show up here
 * automatically alongside free-text messages — one continuous conversation.
 */
export function NegotiationLog({
  messages,
  viewerRole,
  canPost,
  onPost,
}: {
  messages: NegotiationLogMessage[];
  viewerRole: "borrower" | "committee";
  /** False when the application isn't in an active negotiation stage. */
  canPost: boolean;
  onPost: (body: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      await onPost(body);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
        Negotiation log
      </h2>
      <p className="mb-4 text-sm text-ink-500">
        Messages and amount changes between you and{" "}
        {viewerRole === "borrower" ? "Committee" : "the borrower"}.
      </p>

      {messages.length === 0 ? (
        <p className="text-sm text-ink-400">No activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 border-b border-line-soft pb-4">
          {messages.map((m) => {
            const isViewer = m.authorRole === viewerRole;
            return (
              <li
                key={m.id}
                className="rounded-[var(--r-md)] border border-line-soft p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Badge variant={isViewer ? "navy" : "neutral"}>
                      {ROLE_LABEL[m.authorRole]}
                    </Badge>
                    <span className="text-sm font-medium text-ink-900">
                      {m.authorName ?? "—"}
                    </span>
                  </span>
                  <span className="mono text-xs text-ink-400">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </div>
                {m.kind === "offer" && m.amount != null ? (
                  <p className="mt-2 text-sm text-ink-700">
                    Offered{" "}
                    <span className="mono font-bold text-teal-600">
                      ₱{formatMoney(m.amount)}
                    </span>
                  </p>
                ) : null}
                {m.kind === "accept" && m.amount != null ? (
                  <p className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                    <Badge variant="success">Accepted</Badge>
                    <span className="mono font-bold text-teal-600">
                      ₱{formatMoney(m.amount)}
                    </span>
                  </p>
                ) : null}
                {m.body ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">
                    {m.body}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {canPost ? (
        <div className="mt-4 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Write a message…"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={posting}
            disabled={!draft.trim()}
            onClick={() => void handleSubmit()}
          >
            Send
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
