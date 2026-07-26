import type { ReactNode } from "react";
import { Button } from "./Button";

/* Meridian §19 confirmation modal — ghost cancel, accent confirm
   (danger for destructive actions). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger" | "accent";
  loading?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-h">
          <h4>{title}</h4>
          <button type="button" className="x" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-b">
          {message ? <p>{message}</p> : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
        <div className="modal-f">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
