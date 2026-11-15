"use client";

// A page-wide budget of live WebGL views. Browsers cap the number of WebGL
// contexts per page (Chrome and Firefox lose the oldest past 16; some
// browsers refuse new ones) and an integrated GPU should not draw a dozen
// scenes at once. So every 3D view on the Explore page asks for a slot here,
// and at most MAX_LIVE_VIEWS are mounted. The rest show a still.
//
// A view is a candidate while it is on or near the screen (within
// NEAR_MARGIN). Candidates are ranked: the one the visitor last hovered,
// clicked or focused first, then by distance from the middle of the screen,
// with a small bonus for views already live so nothing flickers. A view
// whose WebGL context was lost, or whose scene failed, gives its slot back
// and shows its still until it leaves the screen and comes back.

import {
  useCallback,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

export const MAX_LIVE_VIEWS = 5;
/** How far beyond the viewport a view counts as near. */
const NEAR_MARGIN = "35% 0px";
/** A view must hold its slot this long before it mounts, so a fast scroll past it costs nothing. */
const MOUNT_DELAY_MS = 220;
/** Views already live keep their slot against a newcomer this much closer to the middle. */
const LIVE_BONUS_PX = 160;

interface Entry {
  el: Element | null;
  near: boolean;
  touched: number;
  priority: boolean;
  lost: boolean;
  live: boolean;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let clock = 0;
let webgl: boolean | undefined;

/** One throwaway context, released at once: can this browser draw WebGL at all? */
function probeWebGL(): boolean {
  if (webgl !== undefined) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    webgl = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

function emit(): void {
  for (const l of listeners) l();
}

function rank(e: Entry, vh: number): number {
  if (!e.el) return Number.POSITIVE_INFINITY;
  const r = e.el.getBoundingClientRect();
  // Distance outside the viewport dominates; inside it, distance from the middle.
  const outside = Math.max(0, r.top - vh, -r.bottom);
  const centre = Math.abs((r.top + r.bottom) / 2 - vh / 2);
  return outside * 4 + centre - (e.live ? LIVE_BONUS_PX : 0) - (e.priority ? LIVE_BONUS_PX : 0);
}

function recompute(): void {
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;
  const candidates = webgl === false ? [] : [...entries.values()].filter((e) => e.near && !e.lost);
  const scored = candidates.map((e) => ({ e, s: rank(e, vh) }));
  scored.sort((a, b) => b.e.touched - a.e.touched || a.s - b.s);
  const keep = new Set(scored.slice(0, MAX_LIVE_VIEWS).map((x) => x.e));
  let changed = false;
  for (const e of entries.values()) {
    const next = keep.has(e);
    if (e.live !== next) {
      e.live = next;
      changed = true;
    }
  }
  if (changed) emit();
}

// Re-rank once scrolling settles, so the views nearest the middle win.
let scrollTimer: number | undefined;
function onScroll(): void {
  window.clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(recompute, 120);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ask for one of the live slots while `ref` is on or near screen. `live` says
 * whether the view may hold a WebGL context; `claim()` moves it to the front
 * (hover, click, focus); `lose()` gives the slot back after a lost context or
 * a failed scene. `supported` is false only when the browser has no WebGL.
 */
export function useLiveSlot(
  ref: RefObject<Element | null>,
  priority = false,
): { live: boolean; supported: boolean; claim: () => void; lose: () => void } {
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    const e: Entry = { el, near: false, touched: 0, priority, lost: false, live: false };
    entries.set(id, e);
    // Capture on the document hears the window and any scrolling container.
    if (entries.size === 1) document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    const first = webgl === undefined;
    probeWebGL();
    if (first) emit();
    let io: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (records) => {
          for (const r of records) {
            e.near = r.isIntersecting;
            if (!e.near) {
              // Off screen: forget the hover, and let a lost view try again next time.
              e.touched = 0;
              e.lost = false;
            }
          }
          recompute();
        },
        { rootMargin: NEAR_MARGIN },
      );
      io.observe(el);
    } else {
      e.near = true;
      recompute();
    }
    return () => {
      io?.disconnect();
      entries.delete(id);
      if (entries.size === 0) {
        document.removeEventListener("scroll", onScroll, { capture: true });
        window.clearTimeout(scrollTimer);
      }
      recompute();
    };
  }, [id, ref, priority]);

  const live = useSyncExternalStore(
    subscribe,
    () => entries.get(id)?.live ?? false,
    () => false,
  );
  const supported = useSyncExternalStore(
    subscribe,
    () => webgl !== false,
    () => true,
  );

  const claim = useCallback(() => {
    const e = entries.get(id);
    if (!e) return;
    clock += 1;
    e.touched = clock;
    e.lost = false;
    e.near = true;
    recompute();
  }, [id]);

  const lose = useCallback(() => {
    const e = entries.get(id);
    if (!e || e.lost) return;
    e.lost = true;
    e.touched = 0;
    recompute();
  }, [id]);

  return { live, supported, claim, lose };
}

/**
 * A slot plus the rules every live view follows: mount only after holding
 * the slot for MOUNT_DELAY_MS, unmount (freeing the context) the moment the
 * slot goes, and give the slot back if the context is lost. `mounted` says
 * whether to render the WebGL view; render the still underneath regardless.
 */
export function useLiveView(
  ref: RefObject<HTMLElement | null>,
  priority = false,
): { mounted: boolean; live: boolean; supported: boolean; claim: () => void; lose: () => void } {
  const { live, supported, claim, lose } = useLiveSlot(ref, priority);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!live) return;
    const t = window.setTimeout(() => setArmed(true), MOUNT_DELAY_MS);
    return () => {
      window.clearTimeout(t);
      setArmed(false);
    };
  }, [live]);

  const mounted = live && armed;

  // A context the browser takes back (too many on the page, a GPU reset)
  // returns the slot; the still shows until the view comes back on screen.
  // Capture phase: the event does not bubble, and it fires on the canvas.
  useEffect(() => {
    const el = ref.current;
    if (!el || !mounted) return;
    // A canvas already taken off the page was released on purpose (unmount).
    const onLost = (ev: Event) => {
      if ((ev.target as Node | null)?.isConnected !== false) lose();
    };
    el.addEventListener("webglcontextlost", onLost, true);
    return () => el.removeEventListener("webglcontextlost", onLost, true);
  }, [ref, mounted, lose]);

  return { mounted, live, supported, claim, lose };
}
