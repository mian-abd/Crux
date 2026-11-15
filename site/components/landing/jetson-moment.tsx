"use client";

// The Jetson run on the landing page: the 27-second screen recording of one live run on a Jetson
// Orin Nano, next to its timeline. Every line is from that run's event log
// (web/public/fixtures/demo_oneletter_live.jsonl, run r-20261115-094906-76e7) via
// components/jetson-run.tsx. The video plays muted, and only while it is on screen.

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const LOG = [
  { at: "0.1 s", text: "The camera reads window 3 of the strip: GTGGAGAAG.", tone: "" },
  { at: "6.0 s", text: "Settles on HbS, the sickle-cell letter, at posterior 0.97.", tone: "holds" },
  { at: "20.7 s", text: "We swap the strip. Window 3 now reads AAGGAGAAG, which no hypothesis predicted: a surprise.", tone: "swap" },
  { at: "21.9 s", text: "It re-reads to rule out the camera. Same letters.", tone: "" },
  { at: "25.8 s", text: "Settles on HbC at posterior 0.97, and saves the case as a lesson.", tone: "holds" },
] as const;

const SPECS = ["Jetson Orin Nano 8 GB", "USB camera", "qwen2.5:3b on the device", "27 seconds"];

export function JetsonMoment() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-start">
      <figure className="overflow-hidden rounded-3xl border bg-ink">
        <video
          ref={ref}
          className="block h-auto w-full"
          src="/media/one-letter-jetson.mp4"
          width={1920}
          height={1058}
          muted
          loop
          playsInline
          controls
          preload="metadata"
          aria-label="Screen recording of the live run on the Jetson, 27 seconds, no sound"
        />
        <figcaption className="flex flex-wrap gap-2 border-t border-ink-foreground/10 px-5 py-3.5">
          {SPECS.map((s) => (
            <span key={s} className="rounded-full border border-ink-foreground/20 px-3 py-1 text-[0.8rem] text-ink-foreground/75">
              {s}
            </span>
          ))}
        </figcaption>
      </figure>

      <div>
        <ol className="relative space-y-5 border-l pl-6">
          {LOG.map((step) => (
            <li key={step.at} className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1.5 -left-[1.95rem] size-3 rounded-full border-2 border-background",
                  step.tone === "swap" ? "bg-brand ring-4 ring-brand/20" : step.tone === "holds" ? "bg-v-holds" : "bg-subtle",
                )}
              />
              <p className="font-mono text-xs text-muted-foreground tabular-nums">{step.at}</p>
              <p className={cn("mt-1 leading-relaxed", step.tone === "swap" && "font-medium text-brand")}>{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          One recorded live run, before the rig was calibrated. The strip is the start of the HBB gene on a phone
          screen, not a patient sample. Both verdicts were written on the Jetson and passed the engine&apos;s fact check.
        </p>
        <Link href="/runs" className="pill mt-6">
          Watch the whole run
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
