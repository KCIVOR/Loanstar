"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { cn } from "./cn";

/* Meridian §10 modal — overlay scrim, card with header / body. Footers come
   from children (or use `footer` for the surface-2 modal-f band). Locks
   background scroll while open — without this, the page behind can be
   mid-scroll when the modal mounts, and `position: fixed; inset: 0` on the
   scrim can end up short of the true viewport (observed ~24px gap at the
   bottom revealing unblurred page content), since some browsers compute the
   fixed containing block against the scrolled layout viewport rather than
   the visual one. */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  className = "",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="overlay overflow-y-auto" style={{ minHeight: "100dvh" }}>
      <div className={cn("modal max-w-lg", className)}>
        <div className="modal-h">
          <h4>{title}</h4>
          <button type="button" className="x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer ? <div className="modal-f">{footer}</div> : null}
      </div>
    </div>
  );
}
