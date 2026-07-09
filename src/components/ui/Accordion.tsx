"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { cn } from "./cn";

export type AccordionItem = {
  id: string;
  title: string;
  meta?: string;
  children?: ReactNode;
};

export function Accordion({
  items,
  defaultOpenId,
  openId: controlledOpenId,
  onOpenChange,
  className = "",
}: {
  items: AccordionItem[];
  defaultOpenId?: string | null;
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
  className?: string;
}) {
  const [uncontrolledOpenId, setUncontrolledOpenId] = useState<string | null>(
    defaultOpenId ?? null
  );
  const baseId = useId();
  const isControlled = controlledOpenId !== undefined;
  const openId = isControlled ? controlledOpenId : uncontrolledOpenId;

  function setOpenId(next: string | null) {
    if (!isControlled) setUncontrolledOpenId(next);
    onOpenChange?.(next);
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-neutral-200 bg-white",
        className
      )}
    >
      {items.map((item, index) => {
        const isOpen = openId === item.id;
        const panelId = `${baseId}-panel-${item.id}`;
        const headerId = `${baseId}-header-${item.id}`;
        const isLast = index === items.length - 1;

        return (
          <div key={item.id}>
            <button
              type="button"
              id={headerId}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-[18px] py-3.5 text-left transition-colors",
                isOpen ? "bg-[#FBF9F2]" : "bg-white hover:bg-neutral-50",
                !isLast || isOpen ? "border-b border-neutral-100" : undefined
              )}
            >
              <span className="text-[13px] font-bold text-ink">
                {item.title}
                {item.meta ? (
                  <span
                    className={cn(
                      "ml-1.5 text-[11px] font-semibold",
                      isOpen ? "text-gold-600" : "text-ink-faint"
                    )}
                  >
                    {item.meta}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "text-xs",
                  isOpen ? "text-gold-600" : "text-ink-faint"
                )}
                aria-hidden
              >
                {isOpen ? "▴" : "▾"}
              </span>
            </button>
            {isOpen ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                className={cn(
                  "px-[18px] pb-3.5 text-xs leading-relaxed text-ink-muted",
                  !isLast ? "border-b border-neutral-100" : undefined
                )}
              >
                {item.children}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
