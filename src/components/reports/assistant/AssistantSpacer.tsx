"use client";

import { useAssistantWidth } from "./width";

/** Flex spacer that sits beside report content so a `position:fixed` panel
 *  does not cover the period card, tabs, or the page underneath. */
export function AssistantSpacer() {
  const { width, resizing, open } = useAssistantWidth();
  return (
    <div
      className="no-print"
      style={{
        flexShrink: 0,
        width: open ? width : 0,
        transition: resizing ? "none" : "width 220ms cubic-bezier(0.22,1,0.36,1)",
      }}
      aria-hidden
    />
  );
}
