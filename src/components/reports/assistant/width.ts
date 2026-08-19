"use client";

import { useSyncExternalStore } from "react";

/** Below this the KPI tiles wrap to one per row and tables lose a column. */
export const ASSISTANT_MIN_WIDTH = 320;
export const ASSISTANT_DEFAULT_WIDTH = 360;
/** Hard ceiling; the live cap also leaves room for the report beside it. */
export const ASSISTANT_MAX_WIDTH = 760;
/** Report content never gets squeezed below this, whatever the drag says. */
const MIN_CONTENT_WIDTH = 420;

const STORAGE_KEY = "loanstar.reports.assistantWidth";

export function clampAssistantWidth(next: number, viewport?: number): number {
  const available =
    typeof viewport === "number" && viewport > 0
      ? Math.max(ASSISTANT_MIN_WIDTH, viewport - MIN_CONTENT_WIDTH)
      : ASSISTANT_MAX_WIDTH;
  const ceiling = Math.min(ASSISTANT_MAX_WIDTH, available);
  if (!Number.isFinite(next)) return ASSISTANT_DEFAULT_WIDTH;
  return Math.round(Math.min(ceiling, Math.max(ASSISTANT_MIN_WIDTH, next)));
}

/**
 * Module-level store rather than lifted state: the fixed panel and the flex
 * spacer that reserves room for it live in different trees, and both have to
 * move on the same frame or the report visibly lags behind the drag.
 */
type State = { width: number; resizing: boolean; open: boolean };

let state: State = { width: ASSISTANT_DEFAULT_WIDTH, resizing: false, open: false };
const listeners = new Set<() => void>();

// Read once at module load. `getServerSnapshot` keeps hydration on the default,
// then useSyncExternalStore re-renders with the stored value straight after.
if (typeof window !== "undefined") {
  const stored = Number(window.localStorage.getItem(STORAGE_KEY));
  if (stored > 0) state = { ...state, width: clampAssistantWidth(stored) };
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
/** Same object every call — React 19 loops if getServerSnapshot allocates. */
const SERVER_SNAPSHOT: State = {
  width: ASSISTANT_DEFAULT_WIDTH,
  resizing: false,
  open: false,
};
const getServerSnapshot = (): State => SERVER_SNAPSHOT;

export function setAssistantWidth(next: number): void {
  const width = clampAssistantWidth(
    next,
    typeof window === "undefined" ? undefined : window.innerWidth,
  );
  if (width === state.width) return;
  state = { ...state, width };
  emit();
}

/** Called when a drag ends or a keyboard nudge lands — never on every move. */
export function persistAssistantWidth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(state.width));
}

/** Re-applies the viewport-dependent ceiling, e.g. after the window shrinks. */
export function reclampAssistantWidth(): void {
  setAssistantWidth(state.width);
}

export function setAssistantResizing(resizing: boolean): void {
  if (resizing === state.resizing) return;
  state = { ...state, resizing };
  if (typeof document !== "undefined") {
    // Without this a drag across the report selects every heading it crosses.
    document.body.style.userSelect = resizing ? "none" : "";
    document.body.style.cursor = resizing ? "col-resize" : "";
  }
  if (!resizing) persistAssistantWidth();
  emit();
}

export function setAssistantOpen(open: boolean): void {
  if (open === state.open) return;
  state = { ...state, open };
  emit();
}

export function useAssistantWidth(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

