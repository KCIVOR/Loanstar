"use client";

import { useState } from "react";

import { fillVisibleRemarkFields } from "@/lib/dev/fill-remarks";

export type AutofillAction = {
  label: string;
  onClick: () => void;
};

const REMARKS_LABEL = "Fill remarks / notes";

/**
 * Floating button that reveals a menu of fake-data autofill actions — lets
 * staff fill CI reports, inspection forms, and remarks/notes without
 * hand-typing while exercising a flow (e.g. during a live client demo).
 *
 * Always on outside production. In production it stays OFF by default —
 * real borrowers must never see a "fill with fake data" button on their
 * own application — and only renders if NEXT_PUBLIC_ENABLE_AUTOFILL=true
 * is explicitly set for that deployment. Set it only for the duration of a
 * demo/staging deployment, then unset it — don't leave it on permanently
 * for the live production site.
 */
export function AutofillOverlay({
  actions = [],
}: {
  actions?: AutofillAction[];
}) {
  const [open, setOpen] = useState(false);

  const enabled =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_AUTOFILL === "true";
  if (!enabled) return null;

  const allActions = actions.some((action) => action.label === REMARKS_LABEL)
    ? actions
    : [
        ...actions,
        {
          label: REMARKS_LABEL,
          onClick: () => {
            fillVisibleRemarkFields();
          },
        },
      ];
  if (allActions.length === 0) return null;

  return (
    <div
      data-autofill-overlay
      style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999 }}
    >
      {open ? (
        <div
          style={{
            marginBottom: 8,
            background: "#111827",
            border: "1px solid #374151",
            borderRadius: 8,
            padding: 8,
            minWidth: 220,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#9CA3AF",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "4px 8px",
            }}
          >
            Autofill (dev only)
          </div>
          {allActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                action.onClick();
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 8px",
                borderRadius: 6,
                border: "none",
                background: "transparent",
                color: "#F3F4F6",
                fontSize: 13,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1F2937";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Dev autofill"
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "none",
          background: "#7C3AED",
          color: "#fff",
          fontSize: 18,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(124,58,237,0.5)",
        }}
      >
        ⚡
      </button>
    </div>
  );
}
