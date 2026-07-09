import { cn } from "./cn";

const sizes = {
  sm: "h-[26px] w-[26px] text-[10.5px]",
  md: "h-10 w-10 text-[13px]",
  lg: "h-12 w-12 text-[15px]",
} as const;

export function Avatar({
  initials,
  name,
  size = "md",
  className = "",
}: {
  initials: string;
  name?: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const mark = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 font-bold text-navy-900",
        sizes[size],
        className
      )}
      aria-hidden={name ? true : undefined}
      title={name}
    >
      {initials.slice(0, 2).toUpperCase()}
    </span>
  );

  if (!name) return mark;

  return (
    <span className="inline-flex items-center gap-2.5 text-[12.5px] text-ink-muted">
      {mark}
      <span className="text-ink-muted">{name}</span>
    </span>
  );
}
