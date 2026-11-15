"use client";

// A graded Task 9 run on the landing page. The viewer only loads when the visitor presses
// play, so the page stays fast; it then replays the run from its event log in place.

import { ArrowUpRightIcon, PlayIcon } from "lucide-react";
import { useState } from "react";

import { viewerReplay } from "@/lib/site";
import { cn } from "@/lib/utils";

const RUNS = [
  { id: "run-1", file: "task9_real_swarm_run1.jsonl", label: "Run 1", note: "The first graded run" },
  { id: "tools-run-02", file: "task9_tools_run2.jsonl", label: "With Exa and past.dev", note: "Search and shared memory in the loop" },
] as const;

export function GradedRunPreview() {
  const [run, setRun] = useState<(typeof RUNS)[number]>(RUNS[0]);
  const [playing, setPlaying] = useState(false);
  const src = viewerReplay(run.file);

  return (
    <div className="overflow-hidden rounded-3xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Graded runs">
          {RUNS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === run.id}
              onClick={() => setRun(r)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                r.id === run.id ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
        >
          Open full screen
          <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
        </a>
      </div>
      {playing ? (
        <iframe key={run.id} src={src} title={`${run.label}: ${run.note}`} className="block h-[min(72svh,48rem)] min-h-[30rem] w-full" />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group relative flex h-[min(72svh,48rem)] min-h-[30rem] w-full flex-col items-center justify-center gap-5 bg-ink text-ink-foreground"
        >
          <span className="grid size-20 place-items-center rounded-full bg-ink-foreground text-ink transition-transform group-hover:scale-105">
            <PlayIcon className="ml-1 size-8" aria-hidden="true" />
          </span>
          <span className="font-display text-3xl sm:text-4xl">Replay {run.label.toLowerCase() === "run 1" ? "run 1" : "the run"}</span>
          <span className="max-w-md px-6 text-center text-ink-foreground/65">
            {run.note}: the questions the agents raised, each check they chose, the referee&apos;s verdicts, how belief
            moved, and what they ruled out.
          </span>
        </button>
      )}
    </div>
  );
}
