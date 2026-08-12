import type { ReactNode } from "react";

export type HistoryViewMode = "list" | "grid" | "compact";

const MODES: Array<{ mode: HistoryViewMode; title: string; icon: ReactNode }> = [
  {
    mode: "list",
    title: "List view",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    mode: "grid",
    title: "Grid view",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    mode: "compact",
    title: "Compact view",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="3" y1="14" x2="21" y2="14" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    ),
  },
];

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: HistoryViewMode;
  onChange: (mode: HistoryViewMode) => void;
}) {
  return (
    <div className="seg" role="group" aria-label="View mode">
      {MODES.map(({ mode, title, icon }) => (
        <button
          key={mode}
          type="button"
          title={title}
          aria-label={title}
          aria-pressed={value === mode}
          className={value === mode ? "is-on" : undefined}
          onClick={() => onChange(mode)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
