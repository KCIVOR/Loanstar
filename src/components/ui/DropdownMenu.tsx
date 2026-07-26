"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "./cn";

/* Meridian §10 dropdown menu — .menu panel; danger items separated by a rule. */
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
          className="menu absolute right-0 top-[calc(100%+8px)] z-50"
        >
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              {item.danger && dangerIndex === index && index > 0 ? <hr /> : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={cn("mi", item.danger && "danger")}
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
