"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { AnswerCardView } from "@/components/reports/assistant/AnswerCardView";
import {
  ASSISTANT_MIN_WIDTH,
  persistAssistantWidth,
  reclampAssistantWidth,
  setAssistantResizing,
  setAssistantWidth,
  useAssistantWidth,
} from "@/components/reports/assistant/width";
import type { Period } from "@/lib/reports/metrics/types";
import type { StoredChatMessage } from "@/lib/reports/assistant/threads";

const IconSparkle = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22} aria-hidden>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5" />
  </svg>
);

const IconClose = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18} aria-hidden>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const IconSend = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

const IconPlus = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const IconHistory = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden>
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const IconTrash = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14} aria-hidden>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </svg>
);

const IconChevron = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    width={12}
    height={12}
    aria-hidden
    style={{
      transform: open ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 160ms ease",
    }}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** Height of AppShell's own topbar (`src/components/admin/Header.tsx`, `h-14`) —
 * the fixed panel docks directly below it, never under it. */
const APP_HEADER_HEIGHT = 56;
const USER_TEXT_CAP = 2000;

const STARTER_QUESTIONS = [
  {
    label: "Portfolio briefing",
    question: "Give me a plain-English briefing on the portfolio for this period.",
  },
  {
    label: "Collection efficiency",
    question: "What is collection efficiency this period?",
  },
  {
    label: "Posted collections",
    question: "Why did posted collections change versus the prior period?",
  },
  {
    label: "PAR > 30",
    question: "What is PAR greater than 30 right now?",
  },
  {
    label: "Past due accounts",
    question: "Which accounts are past due over 30 days?",
  },
  {
    label: "Active loans",
    question: "How many active loans are there, and what is portfolio outstanding?",
  },
  {
    label: "Stuck pipeline",
    question: "Which pipeline files are stuck over their stage target?",
  },
] as const;

type ChatMessage = StoredChatMessage;
type ThreadSummary = { id: string; title: string; updatedAt: string };

function headerButtonStyle(disabled = false): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: "var(--r-md)",
    border: "none",
    background: "transparent",
    color: "var(--ink-400)",
    cursor: disabled ? "not-allowed" : "pointer",
    flexShrink: 0,
  };
}

function formatInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function LoanBotMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const pending: string[] = [];
  const flushList = () => {
    if (!pending.length) return;
    const items = [...pending];
    pending.length = 0;
    blocks.push(
      <ul
        key={`list-${blocks.length}`}
        style={{ margin: "6px 0 2px 18px", padding: 0 }}
      >
        {items.map((item, index) => (
          <li key={index} style={{ marginBottom: 4 }}>
            {formatInline(item)}
          </li>
        ))}
      </ul>,
    );
  };

  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      pending.push(bullet[1]);
      continue;
    }
    flushList();
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <div
          key={`h-${blocks.length}`}
          className="font-display font-semibold text-navy-900"
          style={{ marginTop: 8 }}
        >
          {formatInline(heading[1])}
        </div>,
      );
      continue;
    }
    if (!line.trim()) {
      blocks.push(<div key={`sp-${blocks.length}`} style={{ height: 8 }} />);
      continue;
    }
    blocks.push(
      <div key={`p-${blocks.length}`} style={{ marginTop: 2 }}>
        {formatInline(line)}
      </div>,
    );
  }
  flushList();
  return <div>{blocks}</div>;
}

/**
 * In-page assistant panel for the reports dashboard. Pair this with a
 * same-width flex spacer in the parent (`src/app/reports/page.tsx`) so
 * opening it reflows the report content beside it. The panel is
 * `position:fixed` — pinned below the app header — so it never scrolls
 * with the page. Open state is controlled by the caller.
 */
export function AssistantDrawer({
  open,
  onClose,
  period,
}: {
  open: boolean;
  onClose: () => void;
  period: Period;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [title, setTitle] = useState("New chat");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const { width, resizing } = useAssistantWidth();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  threadIdRef.current = threadId;
  messagesRef.current = messages;
  const canSend = !busy && draft.trim().length > 0;
  const empty = messages.length === 0 && !error && !busy;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || historyOpen) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, error, busy, historyOpen]);

  // A panel sized on a wide monitor must not swallow the report on a narrow one.
  useEffect(() => {
    window.addEventListener("resize", reclampAssistantWidth);
    return () => window.removeEventListener("resize", reclampAssistantWidth);
  }, []);

  async function refreshThreads(): Promise<ThreadSummary[]> {
    const res = await fetch("/api/reports/assistant/threads");
    if (!res.ok) return [];
    const body = (await res.json()) as { threads?: ThreadSummary[] };
    const list = body.threads ?? [];
    setThreads(list);
    return list;
  }

  async function loadThread(id: string) {
    const res = await fetch(`/api/reports/assistant/threads/${id}`);
    const body = (await res.json()) as {
      id?: string;
      title?: string;
      messages?: ChatMessage[];
      error?: string;
    };
    if (!res.ok || !body.id) {
      setError(body.error ?? "Could not open that chat");
      return;
    }
    setThreadId(body.id);
    setTitle(body.title ?? "New chat");
    setMessages(body.messages ?? []);
    setError(null);
    setHistoryOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const list = await refreshThreads();
      if (cancelled || threadIdRef.current || messagesRef.current.length > 0 || list.length === 0) {
        return;
      }
      await loadThread(list[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  /** The panel is docked right, so the distance from the pointer to the right
   *  edge of the viewport is the width the user is asking for. */
  function onResizePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setAssistantResizing(true);
  }

  // Pointer capture, not the `resizing` flag: capture is set synchronously on
  // pointerdown, while the flag only arrives on the next render.
  function onResizePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setAssistantWidth(window.innerWidth - event.clientX);
  }

  function endResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setAssistantResizing(false);
  }

  /** Keyboard equivalent, so resizing is not mouse-only. */
  function onResizeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 64 : 16;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setAssistantWidth(width + (event.key === "ArrowLeft" ? step : -step));
    persistAssistantWidth();
  }

  function startNewChat() {
    setThreadId(null);
    setTitle("New chat");
    setMessages([]);
    setDraft("");
    setError(null);
    setHistoryOpen(false);
  }

  async function deleteThread(id: string) {
    const res = await fetch(`/api/reports/assistant/threads/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    if (threadIdRef.current === id) startNewChat();
    await refreshThreads();
  }

  async function send(raw?: string) {
    const text = (raw ?? draft).trim().slice(0, USER_TEXT_CAP);
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);
    setHistoryOpen(false);
    try {
      const res = await fetch("/api/reports/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          threadId,
          content: text,
        }),
      });
      const body = (await res.json()) as {
        reply?: string;
        error?: string;
        threadId?: string;
        title?: string;
        messages?: ChatMessage[];
      };
      if (!res.ok || typeof body.reply !== "string") {
        setError(body.error ?? "Assistant failed");
        return;
      }
      if (body.threadId) setThreadId(body.threadId);
      if (body.title) setTitle(body.title);
      if (body.messages) setMessages(body.messages);
      else setMessages((current) => [...current, { role: "assistant", content: body.reply as string }]);
      void refreshThreads();
    } catch {
      setError("Assistant failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="no-print"
      aria-hidden={!open}
      aria-busy={busy}
      style={{
        position: "fixed",
        top: APP_HEADER_HEIGHT,
        right: 0,
        bottom: 0,
        zIndex: 69,
        width,
        minWidth: ASSISTANT_MIN_WIDTH,
        background: "var(--surface)",
        borderLeft: "1px solid var(--line-soft)",
        boxShadow: "var(--sh-2)",
        display: "flex",
        flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        // The width transition has to go while dragging or the panel trails
        // the pointer by a fifth of a second.
        transition: resizing ? "none" : "transform 220ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize LoanBot panel"
        aria-valuenow={width}
        aria-valuemin={ASSISTANT_MIN_WIDTH}
        tabIndex={0}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onKeyDown={onResizeKeyDown}
        style={{
          position: "absolute",
          top: 0,
          left: -3,
          bottom: 0,
          width: 7,
          cursor: "col-resize",
          // Sits above the panel body so the grab zone is never stolen by a
          // button that happens to touch the edge.
          zIndex: 1,
          touchAction: "none",
          background: resizing ? "var(--teal-600)" : "transparent",
          transition: "background 120ms ease",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "12px 10px 12px 12px",
          borderBottom: "1px solid var(--line-soft)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          aria-label={historyOpen ? "Back to chat" : "Chat history"}
          aria-pressed={historyOpen}
          disabled={busy}
          onClick={() => setHistoryOpen((value) => !value)}
          style={headerButtonStyle(busy)}
        >
          {IconHistory}
        </button>
        <div style={{ minWidth: 0, flex: 1, padding: "0 4px" }}>
          <div className="font-display truncate text-sm font-semibold text-navy-900">
            {historyOpen ? "Chats" : title}
          </div>
          <div className="mono truncate text-xs text-ink-400">
            {period.from} → {period.to}
          </div>
        </div>
        <button
          type="button"
          aria-label="New chat"
          disabled={busy}
          onClick={startNewChat}
          style={headerButtonStyle(busy)}
        >
          {IconPlus}
        </button>
        <button type="button" aria-label="Close" onClick={onClose} style={headerButtonStyle()}>
          {IconClose}
        </button>
      </div>

      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "flex-start",
          textAlign: historyOpen || !empty ? "left" : "center",
          gap: empty && !historyOpen ? 10 : 12,
        }}
      >
        {historyOpen ? (
          threads.length === 0 ? (
            <p className="text-xs text-ink-400">No saved chats yet. Send a question to start one.</p>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: 4,
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--line-soft)",
                  background:
                    thread.id === threadId ? "var(--teal-50)" : "var(--surface-2)",
                }}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void loadThread(thread.id)}
                  className="text-left"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "8px 10px",
                    border: "none",
                    background: "transparent",
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  <div className="truncate text-xs font-medium text-navy-900">{thread.title}</div>
                  <div className="mono text-[10px] text-ink-400">
                    {new Date(thread.updatedAt).toLocaleString()}
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${thread.title}`}
                  disabled={busy}
                  onClick={() => void deleteThread(thread.id)}
                  style={{
                    ...headerButtonStyle(busy),
                    alignSelf: "center",
                    marginRight: 4,
                  }}
                >
                  {IconTrash}
                </button>
              </div>
            ))
          )
        ) : empty ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 48,
                  height: 48,
                  borderRadius: "var(--r-full)",
                  background: "var(--teal-50)",
                  color: "var(--teal-600)",
                }}
              >
                {IconSparkle}
              </span>
              <p className="font-display text-sm font-semibold text-navy-900">
                Ask LoanBot
              </p>
              <p className="max-w-[260px] text-xs text-ink-400">
                Ask anything about the book for this period — even a borrower name — or pick a question.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 8,
                textAlign: "left",
              }}
            >
              {STARTER_QUESTIONS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(item.question)}
                  className="text-xs"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--line-soft)",
                    background: "var(--surface-2)",
                    color: "var(--ink-900)",
                    cursor: busy ? "not-allowed" : "pointer",
                    textAlign: "left",
                    lineHeight: 1.4,
                  }}
                >
                  {item.question}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                style={{
                  alignSelf: message.role === "user" ? "flex-end" : "stretch",
                  // Cards carry tables and charts; a 92% bubble squeezes them.
                  maxWidth: message.role === "user" ? "92%" : message.card ? "100%" : "94%",
                  padding: "8px 10px",
                  borderRadius: "var(--r-md)",
                  background:
                    message.role === "user" ? "var(--teal-50)" : "var(--surface-2)",
                  color: "var(--ink-900)",
                  whiteSpace: message.role === "assistant" ? "normal" : "pre-wrap",
                  wordBreak: "break-word",
                }}
                className="text-xs"
              >
                {message.role !== "assistant" ? (
                  message.content
                ) : message.card && message.evidence ? (
                  <AnswerCardView card={message.card} evidence={message.evidence} />
                ) : (
                  <LoanBotMarkdown text={message.content} />
                )}
              </div>
            ))}
            {busy ? (
              <div className="text-xs text-ink-400">Looking that up…</div>
            ) : null}
            {error ? (
              <div
                role="alert"
                className="text-xs"
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--r-md)",
                  background: "var(--danger-bg)",
                  color: "var(--danger)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {error}
              </div>
            ) : null}
          </>
        )}
      </div>

      {historyOpen ? null : (
        <div style={{ padding: 12, borderTop: "1px solid var(--line-soft)", flexShrink: 0 }}>
          {!empty ? (
            <div style={{ marginBottom: 10 }}>
              <button
                type="button"
                aria-expanded={suggestionsOpen}
                aria-controls="loanbot-suggestions"
                onClick={() => setSuggestionsOpen((value) => !value)}
                className="text-[11px] font-medium text-ink-400"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <IconChevron open={suggestionsOpen} />
                Suggested questions
              </button>
              {suggestionsOpen ? (
                <div
                  id="loanbot-suggestions"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {STARTER_QUESTIONS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={busy}
                      onClick={() => void send(item.question)}
                      className="fchip"
                      style={{ cursor: busy ? "not-allowed" : "pointer" }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line-soft)",
              background: "var(--surface-2)",
            }}
          >
            <input
              type="text"
              value={draft}
              maxLength={USER_TEXT_CAP}
              disabled={busy}
              placeholder="Ask anything — how are we doing, or a borrower name"
              onChange={(event) => setDraft(event.target.value.slice(0, USER_TEXT_CAP))}
              className="mono"
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 13,
                color: "var(--ink-900)",
              }}
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: "var(--r-full)",
                border: "none",
                background: canSend ? "var(--teal-600)" : "var(--line-soft)",
                color: canSend ? "var(--surface)" : "var(--ink-400)",
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              {IconSend}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
