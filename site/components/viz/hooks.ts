"use client";

// Browser hooks shared by the views. Nothing here touches window or document
// at import time; every read happens inside an effect.

import { useEffect, useState, type RefObject } from "react";
import { PALETTE, type ColorMode } from "./theme";

function readMode(mq: MediaQueryList | null): ColorMode {
  const root = document.documentElement;
  const attr = (root.getAttribute("data-theme") || root.getAttribute("data-mode") || "").toLowerCase();
  if (root.classList.contains("dark") || attr === "dark") return "dark";
  if (root.classList.contains("light") || attr === "light") return "light";
  const scheme = getComputedStyle(root).colorScheme;
  if (scheme === "dark") return "dark";
  if (scheme === "light") return "light";
  return mq?.matches ? "dark" : "light";
}

/**
 * Light or dark: a `dark`/`light` class or `data-theme` on <html> wins
 * (next-themes style), then `color-scheme`, then the OS preference.
 */
export function useColorMode(): ColorMode {
  const [mode, setMode] = useState<ColorMode>("dark");
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
    const update = () => setMode(readMode(mq));
    update();
    mq?.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-mode", "style"],
    });
    return () => {
      mq?.removeEventListener("change", update);
      mo.disconnect();
    };
  }, []);
  return mode;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** True while the element is on screen and the tab is visible. */
export function useInView(ref: RefObject<Element | null>, rootMargin = "64px"): boolean {
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setOnScreen(e.isIntersecting);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return onScreen && pageVisible;
}

/** Content-box size of an element, kept current with a ResizeObserver. */
export function useElementSize(ref: RefObject<Element | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        Math.abs(s.width - r.width) < 0.5 && Math.abs(s.height - r.height) < 0.5
          ? s
          : { width: r.width, height: r.height },
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Any CSS colour (rgb, oklch, color-mix...) to sRGB bytes, by painting one
 * pixel: computed styles keep oklch as oklch, and three.js wants hex.
 */
function cssColorBytes(css: string): [number, number, number, number] | null {
  if (!css || css === "transparent") return null;
  if (probe === undefined) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
}

/**
 * The colour actually painted behind an element: the first ancestor with an
 * opaque background, or the palette background. Fog and fades use it so
 * distant geometry dissolves into the real page colour.
 */
export function useSurfaceColor(ref: RefObject<Element | null>, mode: ColorMode): string {
  const [color, setColor] = useState(PALETTE[mode].background);
  useEffect(() => {
    const read = () => {
      let el: Element | null = ref.current;
      while (el) {
        const rgb = cssColorBytes(getComputedStyle(el).backgroundColor);
        if (rgb && rgb[3] > 0.95) {
          const hex = `#${rgb
            .slice(0, 3)
            .map((v) => Math.round(v).toString(16).padStart(2, "0"))
            .join("")}`;
          setColor(hex);
          return;
        }
        el = el.parentElement;
      }
      setColor(PALETTE[mode].background);
    };
    read();
    // Theme switches often land a frame after the class change.
    const id = window.setTimeout(read, 120);
    return () => window.clearTimeout(id);
  }, [ref, mode]);
  return color;
}
