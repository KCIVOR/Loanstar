import { cn } from "./cn";

export function Spinner({
  size = "md",
  label = "Loading…",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  const dim = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <div className={cn("flex items-center justify-center gap-2.5 py-12 text-sm text-ink-muted", className)}>
      <span
        className={cn(
          "animate-spin rounded-full border-2 border-gold-400/20 border-t-gold-400",
          dim
        )}
      />
      {label}
    </div>
  );
}
