export type DateRangeValue = {
  preset: "30d" | "90d" | "all" | "custom";
  from: string; // "" or YYYY-MM-DD
  to: string;
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoISO(today: Date, days: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

/** Pure helper: resolve a DateRangeValue into inclusive from/to bounds (YYYY-MM-DD or null). */
export function resolveDateBounds(
  value: DateRangeValue,
  today: Date,
): { from: string | null; to: string | null } {
  if (value.preset === "all") return { from: null, to: null };
  if (value.preset === "custom") {
    return { from: value.from || null, to: value.to || null };
  }
  const days = value.preset === "30d" ? 30 : 90;
  return { from: daysAgoISO(today, days), to: null };
}

const PRESETS: Array<{ key: DateRangeValue["preset"]; label: string }> = [
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
}) {
  const today = new Date();

  function setPreset(preset: DateRangeValue["preset"]) {
    if (preset === "custom") {
      onChange({ ...value, preset: "custom" });
      return;
    }
    onChange({ preset, from: "", to: "" });
  }

  function setQuick(from: string, to: string) {
    onChange({ preset: "custom", from, to });
  }

  return (
    <div>
      <div className="filter-bar">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={value.preset === p.key ? "fchip is-on" : "fchip"}
            onClick={() => setPreset(p.key)}
          >
            {p.key === "custom" ? <CalendarIcon /> : null}
            {p.label}
          </button>
        ))}
      </div>

      <div className={value.preset === "custom" ? "date-row is-open" : "date-row"}>
        <div className="date-field">
          <label htmlFor="history-date-from">From</label>
          <input
            id="history-date-from"
            type="date"
            value={value.from}
            onChange={(e) =>
              onChange({ preset: "custom", from: e.target.value, to: value.to })
            }
          />
        </div>
        <span className="date-sep">→</span>
        <div className="date-field">
          <label htmlFor="history-date-to">To</label>
          <input
            id="history-date-to"
            type="date"
            value={value.to}
            onChange={(e) =>
              onChange({ preset: "custom", from: value.from, to: e.target.value })
            }
          />
        </div>
        <div className="date-quick">
          <button
            type="button"
            onClick={() => setQuick(daysAgoISO(today, 7), toISODate(today))}
          >
            Last 7d
          </button>
          <button
            type="button"
            onClick={() => setQuick(daysAgoISO(today, 30), toISODate(today))}
          >
            Last 30d
          </button>
          <button
            type="button"
            onClick={() =>
              setQuick(
                toISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
                toISODate(today),
              )
            }
          >
            This month
          </button>
          <button
            type="button"
            onClick={() =>
              setQuick(toISODate(new Date(today.getFullYear(), 0, 1)), toISODate(today))
            }
          >
            This year
          </button>
        </div>
      </div>
    </div>
  );
}
