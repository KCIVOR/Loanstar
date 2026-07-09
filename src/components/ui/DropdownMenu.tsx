"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "./cn";

export type DropdownMenuItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

export function DropdownMenu({
  trigger,
  items,
  className = "",
}: {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const dangerIndex = items.findIndex((item) => item.danger);

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
        className="inline-flex cursor-pointer items-center"
      >
        {trigger}
      </div>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 flex w-[170px] flex-col rounded-[10px] border border-neutral-200 bg-white p-1.5 shadow-[0_14px_32px_rgba(15,33,72,0.14)]"
        >
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              {item.danger && dangerIndex === index && index > 0 ? (
                <div className="mx-1.5 my-1 h-px bg-neutral-100" role="separator" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={cn(
                  "w-full rounded-[7px] px-2.5 py-2 text-left text-[12.5px] transition-colors hover:bg-neutral-50",
                  item.danger ? "text-danger" : "text-ink"
                )}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
