"use client";

import { cn } from "./cn";

/* Meridian §09 pagination — mono .pg buttons, navy active page. */
function pageWindow(page: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(pageCount);
  for (let p = page - 1; p <= page + 1; p++) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    const prev = sorted[i - 1];
    if (prev !== undefined && current - prev > 1) {
      result.push("ellipsis");
    }
    result.push(current);
  }
  return result;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  summary,
  className = "",
}: {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  summary?: string;
  className?: string;
}) {
  const safeCount = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), safeCount);
  const canPrev = current > 1;
  const canNext = current < safeCount;
  const numbers = pageWindow(current, safeCount);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      {summary ? (
        <span className="text-xs text-ink-400">{summary}</span>
      ) : (
        <span className="sr-only">
          Page {current} of {safeCount}
        </span>
      )}

      <div className="pager">
        <button
          type="button"
          className={cn("pg", !canPrev && "opacity-45")}
          disabled={!canPrev}
          onClick={() => onPageChange(current - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>
        {numbers.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`e-${index}`} className="pg gap" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === current ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className={cn("pg", item === current && "is-active")}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className={cn("pg", !canNext && "opacity-45")}
          disabled={!canNext}
          onClick={() => onPageChange(current + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}
