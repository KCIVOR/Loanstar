import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "./Button";
import { cn } from "./cn";

export function QueueListItem({
  href,
  title,
  subtitle,
  meta,
  trailing,
  className = "",
}: {
  href: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white p-6 shadow-sm",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {title}
            {subtitle != null && subtitle !== "" ? (
              typeof subtitle === "string" || typeof subtitle === "number" ? (
                <span className="ml-2 font-mono text-sm font-normal text-ink-muted">
                  {subtitle}
                </span>
              ) : (
                subtitle
              )
            ) : null}
          </p>
          {meta ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
              {meta}
            </div>
          ) : null}
        </div>
        <Link href={href}>{trailing ?? <Button variant="secondary">Open</Button>}</Link>
      </div>
    </div>
  );
}
