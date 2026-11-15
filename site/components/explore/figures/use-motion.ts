"use client";

// Two small client hooks for the animated figures. Both read browser state
// through useSyncExternalStore, so the server render and the first client
// render agree (no hydration mismatch) and the real value arrives right after.

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** True when the reader asked the system for reduced motion. False on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

const noop = () => () => {};

/** False during the server render and hydration, true once running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
