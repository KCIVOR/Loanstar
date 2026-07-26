import type { ReactNode } from "react";

/* Meridian §02 — display-lg heading in Sora, body-sm description. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-[-0.01em] text-navy-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-[13.5px] text-ink-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
