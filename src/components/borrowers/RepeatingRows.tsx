"use client";

import { Button } from "@/components/ui";
import type { ReactNode } from "react";

export function RepeatingRows<T extends object>({
  title,
  addLabel,
  rows,
  emptyRow,
  columnsClassName,
  headers,
  onChange,
  renderRow,
  disabled = false,
}: {
  title: string;
  addLabel: string;
  rows: T[] | undefined;
  emptyRow: () => T;
  columnsClassName: string;
  headers: string[];
  onChange: (next: T[]) => void;
  renderRow: (row: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
  disabled?: boolean;
}) {
  const list = rows ?? [];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-navy-900">{title}</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...list, emptyRow()])}
        >
          {addLabel}
        </Button>
      </div>
      <div
        className={`mb-2 hidden gap-3 text-xs font-semibold uppercase tracking-wide text-ink-400 sm:grid ${columnsClassName}`}
      >
        {headers.map((h) => (
          <span key={h}>{h}</span>
        ))}
        <span className="w-[72px]" aria-hidden />
      </div>
      {list.map((row, i) => (
        <div
          key={i}
          className={`mb-3 grid gap-3 border-b border-line-soft pb-3 ${columnsClassName}`}
        >
          {renderRow(row, i, (patch) => {
            const next = [...list];
            next[i] = { ...row, ...patch };
            onChange(next);
          })}
          <Button
            type="button"
            variant="danger-soft"
            size="sm"
            className="w-[72px] self-center justify-self-end"
            disabled={disabled}
            aria-label={`Remove row ${i + 1}`}
            onClick={() => onChange(list.filter((_, idx) => idx !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
