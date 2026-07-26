"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { cn } from "./cn";

/* Meridian §24 FAQ accordion pattern — bordered cards, mono +/– indicator in teal. */
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
    <div className={cn("faq !max-w-none", className)}>
      {items.map((item) => {
        const isOpen = openId === item.id;
        const panelId = `${baseId}-panel-${item.id}`;
        const headerId = `${baseId}-header-${item.id}`;

        return (
          <div
            key={item.id}
            className="mb-2.5 overflow-hidden rounded-[var(--r-md)] border border-line bg-surface last:mb-0"
          >
            <button
              type="button"
              id={headerId}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-ink-900",
                isOpen && "border-b border-line-soft"
              )}
            >
              <span>
                {item.title}
                {item.meta ? (
                  <span className={cn("ml-1.5 text-[11px] font-semibold", isOpen ? "text-teal-700" : "text-ink-400")}>
                    {item.meta}
                  </span>
                ) : null}
              </span>
              <span className="mono text-base text-teal-600" aria-hidden>
                {isOpen ? "–" : "+"}
              </span>
            </button>
            {isOpen ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                className="px-4 pb-4 pt-3 text-[13.5px] text-ink-500"
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
