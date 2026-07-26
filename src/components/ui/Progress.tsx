import { cn } from "./cn";

/* Meridian §08 progress — teal fill by default, navy and warn variants.
   Legacy tones map: gold → teal (default), danger → warn. */
export function Progress({
  value,
  max = 100,
  label,
  tone,
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: "gold" | "success" | "danger" | "teal" | "navy" | "warn";
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const over = pct > 100;
  const resolved = tone ?? (over ? "warn" : "teal");
  const variant =
    resolved === "navy" ? "navy" : resolved === "danger" || resolved === "warn" ? "warn" : "";
  const fillWidth = Math.min(Math.max(pct, 0), 100);

  const valueText =
    max === 100
      ? `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`
      : `${value} / ${max}`;

  return (
    <div className="w-full">
      {(label || valueText) && (
        <div className="prog-lbl">
          <span>{label}</span>
          <b>{valueText}</b>
        </div>
      )}
      <div
        className={cn("prog", variant)}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <i style={{ width: `${fillWidth}%` }} />
      </div>
    </div>
  );
}
