"use client";

import { cn } from "./cn";

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
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className
      )}
    >
      {summary ? (
        <span className="text-xs text-ink-faint">{summary}</span>
      ) : (
        <span className="sr-only">
          Page {current} of {safeCount}
        </span>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onPageChange(current - 1)}
          className={cn(
            "rounded-lg border px-3.5 py-[7px] text-[12.5px] font-semibold transition-colors",
            canPrev
              ? "border-neutral-300 text-ink hover:bg-neutral-50"
              : "cursor-not-allowed border-neutral-300 text-[#AEB4C4]"
          )}
        >
          Previous
        </button>

        <div className="flex gap-1.5" aria-label="Page numbers">
          {numbers.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`e-${index}`}
                className="flex h-8 w-8 items-center justify-center text-[12.5px] font-semibold text-[#AEB4C4]"
                aria-hidden
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-current={item === current ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-[12.5px] font-semibold transition-colors",
                  item === current
                    ? "bg-ink font-bold text-white"
                    : "border border-neutral-300 text-ink-muted hover:bg-neutral-50"
                )}
              >
                {item}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          disabled={!canNext}
          onClick={() => onPageChange(current + 1)}
          className={cn(
            "rounded-lg px-3.5 py-[7px] text-[12.5px] font-bold transition-colors",
            canNext
              ? "bg-gradient-to-br from-gold-300 to-gold-400 text-navy-900"
              : "cursor-not-allowed border border-neutral-300 text-[#AEB4C4]"
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
}
