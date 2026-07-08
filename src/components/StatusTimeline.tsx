"use client";

import { APPLICATION_STATUSES } from "@/lib/constants";
import { formatStatusLabel } from "@/lib/applications/status";

export function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = APPLICATION_STATUSES.indexOf(
    currentStatus as (typeof APPLICATION_STATUSES)[number],
  );

  return (
    <ol className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-0">
      {APPLICATION_STATUSES.map((status, index) => {
        const isPast = currentIndex >= 0 && index < currentIndex;
        const isCurrent = status === currentStatus;
        const isDenied = currentStatus === "denied";
        const isFuture = !isPast && !isCurrent;

        let dotClass = "border-zinc-300 bg-white text-zinc-400";
        let labelClass = "text-zinc-500";
        if (isDenied && isCurrent) {
          dotClass = "border-red-600 bg-red-600 text-white";
          labelClass = "font-medium text-red-700";
        } else if (isCurrent) {
          dotClass = "border-zinc-900 bg-zinc-900 text-white";
          labelClass = "font-medium text-zinc-900";
        } else if (isPast) {
          dotClass = "border-zinc-900 bg-zinc-900 text-white";
          labelClass = "text-zinc-700";
        } else if (isFuture) {
          dotClass = "border-zinc-200 bg-zinc-50 text-zinc-300";
          labelClass = "text-zinc-400";
        }

        return (
          <li
            key={status}
            className="relative flex flex-1 flex-col items-start sm:items-center sm:px-1"
          >
            <div className="flex items-center gap-3 sm:flex-col sm:gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${dotClass}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isPast || (isCurrent && !isDenied) ? "✓" : index + 1}
              </span>
              <span className={`max-w-[5rem] text-center text-[10px] leading-tight sm:text-xs ${labelClass}`}>
                {formatStatusLabel(status)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
