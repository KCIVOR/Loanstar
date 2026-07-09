import { cn } from "./cn";

export function Progress({
  value,
  max = 100,
  label,
  tone,
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: "gold" | "success" | "danger";
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const over = pct > 100;
  const resolved: "gold" | "success" | "danger" =
    tone ?? (over ? "danger" : "gold");
  const fillWidth = Math.min(Math.max(pct, 0), 100);

  const fillClass =
    resolved === "danger"
      ? "bg-danger"
      : resolved === "success"
        ? "bg-success"
        : "bg-gradient-to-r from-gold-300 to-gold-400";

  const valueText =
    max === 100
      ? `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`
      : `${value} / ${max}`;

  return (
    <div className="w-full">
      {(label || valueText) && (
        <div
          className={cn(
            "mb-1.5 flex justify-between text-xs",
            resolved === "danger" ? "text-[#E9948A]" : "text-neutral-700"
          )}
        >
          <span>{label}</span>
          <b className={resolved === "gold" ? "font-bold text-ink" : "font-bold"}>
            {valueText}
          </b>
        </div>
      )}
      <div
        className="h-[9px] overflow-hidden rounded-[5px] bg-neutral-100"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <span
          className={cn("block h-full rounded-[5px] transition-[width]", fillClass)}
          style={{ width: `${fillWidth}%` }}
        />
      </div>
    </div>
  );
}
