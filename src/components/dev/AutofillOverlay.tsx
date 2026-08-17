"use client";

import { useState } from "react";

export type AutofillAction = {
  label: string;
  onClick: () => void;
};

/**
 * Dev-only floating button that reveals a menu of fake-data autofill
 * actions. Never renders in production — this exists purely so staff
 * testing this app locally don't have to hand-type CI reports and
 * application forms while exercising a flow.
 */
export function AutofillOverlay({ actions }: { actions: AutofillAction[] }) {
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV === "production") return null;
  if (actions.length === 0) return null;

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999 }}>
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
          {actions.map((action) => (
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
