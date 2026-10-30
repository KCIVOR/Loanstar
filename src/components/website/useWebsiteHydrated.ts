"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Observation only: does not enable/disable controls or alter form behavior. */
export function useWebsiteHydrated() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
