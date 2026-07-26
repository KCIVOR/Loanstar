import { cn } from "./cn";

/* Meridian §08 spinner — teal arc on line track. */
export function Spinner({
  size = "md",
  label = "Loading…",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  const dim = size === "sm" ? 14 : size === "lg" ? 28 : 22;
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 py-12 text-[13.5px] text-ink-500",
        className
      )}
    >
      <span className="spinner" style={{ width: dim, height: dim }} />
      {label}
    </div>
  );
}
