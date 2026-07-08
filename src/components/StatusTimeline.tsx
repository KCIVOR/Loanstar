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

        let dotClass = "border-neutral-300 bg-white text-neutral-400";
        let labelClass = "text-neutral-500";
        if (isDenied && isCurrent) {
          dotClass = "border-danger-600 bg-danger-600 text-white";
          labelClass = "font-medium text-danger-700";
        } else if (isCurrent) {
          dotClass = "border-neutral-900 bg-neutral-900 text-white";
          labelClass = "font-medium text-neutral-900";
        } else if (isPast) {
          dotClass = "border-neutral-900 bg-neutral-900 text-white";
          labelClass = "text-neutral-700";
        } else if (isFuture) {
          dotClass = "border-neutral-200 bg-neutral-50 text-neutral-300";
          labelClass = "text-neutral-400";
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
