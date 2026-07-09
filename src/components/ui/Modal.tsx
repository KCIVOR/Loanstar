import type { ReactNode } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-ink-faint hover:bg-neutral-100 hover:text-ink-muted"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
