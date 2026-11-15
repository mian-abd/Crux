// Graded Task 9 runs, replayed from their event logs by the run viewer and shown inside the
// site. Used by the public /runs page and by /app/runs/graded in the signed-in app.

import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { repoFile, viewerReplay } from "@/lib/site";

export const GRADED_RUNS = [
  {
    id: "run-1",
    file: "task9_real_swarm_run1.jsonl",
    title: "Run 1: the first graded Task 9 run",
    body: "18 questions opened, 5 settled, 5 options rejected by sandboxed checks, 11 Bayes updates. Official score 0.586, before the inputs had gene annotation.",
    source: "eval/results/task9_runs.md",
  },
  {
    id: "tools-run-02",
    file: "task9_tools_run2.jsonl",
    title: "tools-run-02: Exa search and past.dev memory in the loop",
    body: "Three Exa searches compete with the compute checks; one rejects an option at posterior 0.0172. The critic reads 8 of the referee's memory records. Official score 0.815.",
    source: "eval/results/task9_batch02.md",
  },
] as const;

export type GradedRunId = (typeof GRADED_RUNS)[number]["id"];

export function GradedRuns({ selected, basePath }: { selected: string | undefined; basePath: string }) {
  const run = GRADED_RUNS.find((r) => r.id === selected) ?? GRADED_RUNS[0];
  const src = viewerReplay(run.file);
  return (
    <div className="space-y-6">
      <ul className="grid gap-3 md:grid-cols-2">
        {GRADED_RUNS.map((r) => {
          const active = r.id === run.id;
          return (
            <li key={r.id}>
              <Link
                href={`${basePath}?run=${r.id}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block h-full rounded-2xl border p-5 transition-colors",
                  active ? "border-foreground bg-card" : "bg-card/60 hover:border-foreground/30",
                )}
              >
                <p className="font-display text-xl leading-snug">{r.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <iframe
          key={run.id}
          src={src}
          title={run.title}
          className="block h-[min(78svh,56rem)] min-h-[34rem] w-full"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>
          Replayed at 8× from the recorded event log. Every belief update is recomputed from the log by{" "}
          <span className="font-mono">core.replay</span>.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href={repoFile(run.source)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:text-foreground"
          >
            Results
            <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
          </a>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:text-foreground"
          >
            Open full screen
            <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
