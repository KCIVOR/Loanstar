"use client";

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

export const ASSISTANT_PANEL_WIDTH = 360;
/** Height of AppShell's own topbar (`src/components/admin/Header.tsx`, `h-14`) —
 * the fixed panel docks directly below it, never under it. */
const APP_HEADER_HEIGHT = 56;

/**
 * Placeholder assistant panel for the reports dashboard — UI only, no model
 * wired up yet. `GET /api/reports/metrics` + `GET /api/reports/dashboard`
 * already return everything an LLM would need (see the reports module plan,
 * Phase 7); this component is just the surface it would eventually live
 * behind.
 *
 * In-page, not an overlay: pair this with a same-width flex spacer in the
 * parent (see `src/app/reports/page.tsx`) so opening it reflows the report
 * content beside it. The panel itself is `position:fixed` — pinned below
 * the app header and filling to the bottom of the viewport — so it never
 * scrolls with the page and always fills the space below it, like the
 * left sidebar. Open state is controlled by the caller (the toggle button
 * lives next to "Print / Export PDF" in the page header).
 */
export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      className="no-print"
      aria-hidden={!open}
      style={{
        position: "fixed",
        top: APP_HEADER_HEIGHT,
        right: 0,
        bottom: 0,
        zIndex: 69,
        width: ASSISTANT_PANEL_WIDTH,
        background: "var(--surface)",
        borderLeft: "1px solid var(--line-soft)",
        boxShadow: "var(--sh-2)",
        display: "flex",
        flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 220ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "14px 16px",
          borderBottom: "1px solid var(--line-soft)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: "var(--r-full)",
              background: "var(--teal-50)",
              color: "var(--teal-600)",
            }}
          >
            {IconSparkle}
          </span>
          <div>
            <div className="font-display text-sm font-semibold text-navy-900">
              Report assistant
            </div>
            <div className="text-xs text-ink-400">Coming soon</div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "var(--r-md)",
            border: "none",
            background: "transparent",
            color: "var(--ink-400)",
            cursor: "pointer",
          }}
        >
          {IconClose}
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 10,
        }}
      >
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
          Ask about this report
        </p>
        <p className="max-w-[260px] text-xs text-ink-400">
          Soon you&apos;ll be able to ask questions about the numbers on
          this page — &ldquo;why did collections drop last month?&rdquo;,
          &ldquo;which cohort is riskiest?&rdquo; — and get an answer
          grounded in this dashboard&apos;s own data. Not wired up yet.
        </p>
      </div>

      <div style={{ padding: 12, borderTop: "1px solid var(--line-soft)", flexShrink: 0 }}>
        <div
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
            disabled
            placeholder="Ask a question — coming soon"
            className="mono"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 13,
              color: "var(--ink-400)",
            }}
          />
          <button
            type="button"
            disabled
            aria-label="Send"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "var(--r-full)",
              border: "none",
              background: "var(--line-soft)",
              color: "var(--ink-400)",
              cursor: "not-allowed",
            }}
          >
            {IconSend}
          </button>
        </div>
      </div>
    </div>
  );
}
