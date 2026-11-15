"use client";

// A page-wide budget of live WebGL views. Browsers cap the number of WebGL
// contexts per page and an integrated GPU should not draw a dozen scenes at
// once, so every 3D view on the Explore page asks for a slot here. At most
// MAX_LIVE_VIEWS are mounted; the rest show a poster frame.
//
// Ranking among the views on screen: pinned views first (the story figures),
// then the one the visitor last hovered or clicked, then views that are
// already live (so nothing flickers while scrolling), then page order.

import { useCallback, useEffect, useId, useSyncExternalStore, type RefObject } from "react";

export const MAX_LIVE_VIEWS = 3;

interface Entry {
  visible: boolean;
  top: number;
  touched: number;
  pinned: boolean;
  live: boolean;
}

const entries = new Set<Entry>();
const byId = new Map<string, Entry>();
const listeners = new Set<() => void>();
let clock = 0;

function recompute(): void {
  const ranked = [...entries]
    .filter((e) => e.visible)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.touched - a.touched ||
        Number(b.live) - Number(a.live) ||
        a.top - b.top,
    );
  const keep = new Set(ranked.slice(0, MAX_LIVE_VIEWS));
  let changed = false;
  for (const e of entries) {
    const next = keep.has(e);
    if (e.live !== next) {
      e.live = next;
      changed = true;
    }
  }
  if (changed) for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ask for one of the live slots while `ref` is on screen. `live` says whether
 * to mount the WebGL view; `claim()` moves this view to the front of the
 * queue (hover, click, focus). Pinned views count from the first visible
 * pixel; the others once 40% of the element is visible.
 */
export function useLiveSlot(
  ref: RefObject<Element | null>,
  pinned = false,
): { live: boolean; claim: () => void } {
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    const e: Entry = { visible: false, top: 0, touched: 0, pinned, live: false };
    byId.set(id, e);
    entries.add(e);
    let io: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (records) => {
          for (const r of records) {
            e.visible = pinned ? r.isIntersecting : r.intersectionRatio >= 0.4;
            e.top = r.boundingClientRect.top + window.scrollY;
            if (!e.visible) e.touched = 0;
          }
          recompute();
        },
        { threshold: [0, 0.4, 0.75] },
      );
      io.observe(el);
    } else {
      e.visible = true;
      recompute();
    }
    return () => {
      io?.disconnect();
      entries.delete(e);
      byId.delete(id);
      recompute();
      for (const l of listeners) l();
    };
  }, [id, ref, pinned]);

  const live = useSyncExternalStore(
    subscribe,
    () => byId.get(id)?.live ?? false,
    () => false,
  );

  const claim = useCallback(() => {
    const e = byId.get(id);
    if (!e) return;
    clock += 1;
    e.touched = clock;
    e.visible = true;
    recompute();
  }, [id]);

  return { live, claim };
}
