"use client";

// Scroll guides for the long landing page: a section rail on the right edge (wide screens), a
// thin progress bar under the header (every screen) and a cue at the bottom of the hero that
// fades once the visitor starts scrolling. All of them respect prefers-reduced-motion.

import { ArrowDownIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export const LANDING_SECTIONS = [
  { id: "top", label: "Overview" },
  { id: "results", label: "Results" },
  { id: "jetson", label: "On a Jetson" },
  { id: "runs", label: "Graded runs" },
  { id: "sponsors", label: "Built with" },
  { id: "explore", label: "Explore" },
  { id: "improves", label: "How far it came" },
  { id: "how", label: "How it works" },
] as const;

/** Page scroll progress, 0 to 1, updated once per animation frame. */
function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = document.documentElement;
      const max = el.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return progress;
}

/** The section whose band crosses the middle of the screen. */
function useActiveSection(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => Boolean(e));
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.01] },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (id === "top") window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", id === "top" ? window.location.pathname : `#${id}`);
}

const IDS = LANDING_SECTIONS.map((s) => s.id);

/** The right-edge rail: a progress track with one dot per section; names appear on hover or focus. */
export function SectionRail() {
  const progress = useScrollProgress();
  const active = useActiveSection(IDS);
  const activeIndex = Math.max(0, IDS.indexOf(active as (typeof IDS)[number]));

  return (
    <nav
      aria-label="Sections on this page"
      className="group/rail fixed top-1/2 right-3 z-30 hidden -translate-y-1/2 xl:block 2xl:right-6"
    >
      <div className="relative rounded-full border bg-background/85 px-2 py-3 shadow-sm backdrop-blur-md">
        {/* Track and fill. */}
        <span aria-hidden="true" className="absolute top-5 bottom-5 left-1/2 w-px -translate-x-1/2 bg-border" />
        <span
          aria-hidden="true"
          className="absolute top-5 left-1/2 w-px -translate-x-1/2 bg-foreground transition-[height] duration-150 ease-out"
          style={{ height: `calc((100% - 2.5rem) * ${progress})` }}
        />
        <ol className="relative flex flex-col gap-3.5">
          {LANDING_SECTIONS.map((s, i) => {
            const isActive = i === activeIndex;
            const passed = i < activeIndex;
            return (
              <li key={s.id} className="relative flex justify-center">
                <button
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={isActive ? "location" : undefined}
                  aria-label={s.label}
                  className="peer grid size-5 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span
                    className={cn(
                      "block rounded-full transition-all duration-300",
                      isActive
                        ? "size-3 bg-brand ring-4 ring-brand/20"
                        : passed
                          ? "size-2 bg-foreground"
                          : "size-2 border border-foreground/40 bg-background",
                    )}
                  />
                </button>
                <span
                  className={cn(
                    "pointer-events-none absolute top-1/2 right-[calc(100%+0.85rem)] -translate-y-1/2 rounded-md border bg-background/95 px-2.5 py-1 text-[0.8rem] whitespace-nowrap shadow-sm transition-opacity duration-200",
                    "opacity-0 group-hover/rail:opacity-100 peer-focus-visible:opacity-100",
                    isActive ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {String(i + 1).padStart(2, "0")} · {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p aria-hidden="true" className="mt-2 text-center font-mono text-[0.65rem] text-muted-foreground tabular-nums">
        {Math.round(progress * 100)}%
      </p>
    </nav>
  );
}

/** A thin bar under the sticky header showing how far down the page the visitor is. */
export function ScrollProgressBar() {
  const progress = useScrollProgress();
  return (
    <span aria-hidden="true" className="pointer-events-none absolute right-0 bottom-0 left-0 h-[2px]">
      <span
        className="block h-full origin-left bg-brand transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${progress})` }}
      />
    </span>
  );
}

/** "Keep scrolling" at the bottom of the hero; it fades once the visitor scrolls. */
export function ScrollCue() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY < 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      onClick={() => jump("results")}
      aria-label="Scroll to the results"
      className={cn(
        "group fixed bottom-5 left-1/2 z-20 hidden -translate-x-1/2 flex-col items-center gap-2 rounded-full text-sm text-muted-foreground transition-opacity duration-500 hover:text-foreground lg:flex",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <span>Results, runs and how it works below</span>
      <span className="grid size-9 place-items-center rounded-full border bg-background/80 motion-safe:animate-[nudge_1.8s_ease-in-out_infinite]">
        <ArrowDownIcon className="size-4" aria-hidden="true" />
      </span>
    </button>
  );
}
