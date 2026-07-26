import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "./Button";
import { cn } from "./cn";

/* Meridian §08 card row — title (with mono ref subtitle), meta line, trailing action. */
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
    <div className={cn("card px-5 py-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">
            {title}
            {subtitle != null && subtitle !== "" ? (
              typeof subtitle === "string" || typeof subtitle === "number" ? (
                <span className="mono ml-2 text-[12.5px] font-medium text-navy-700">
                  {subtitle}
                </span>
              ) : (
                subtitle
              )
            ) : null}
          </p>
          {meta ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-500">
              {meta}
            </div>
          ) : null}
        </div>
        <Link href={href}>{trailing ?? <Button variant="secondary" size="sm">Open</Button>}</Link>
      </div>
    </div>
  );
}
