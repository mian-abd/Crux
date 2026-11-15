// The batch-04 headline numbers on an ink panel, shared by the landing page and the
// signed-in home. Every value is from eval/results/task9_batch04.md.

import { ArrowUpRightIcon } from "lucide-react";

import { repoFile } from "@/lib/site";
import { cn } from "@/lib/utils";

const SOURCE = "eval/results/task9_batch04.md";

function Tile({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col rounded-2xl bg-ink-foreground/[0.05] p-6 sm:p-7", className)}>
      <p className="text-sm text-ink-foreground/60">{label}</p>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function ScoreBar({ name, value, strong }: { name: string; value: number; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 text-sm">
      <span className={strong ? "text-ink-foreground" : "text-ink-foreground/55"}>{name}</span>
      <span className="h-2 rounded-full bg-ink-foreground/10">
        <span
          className={cn("block h-full rounded-full", strong ? "bg-brand-soft" : "bg-ink-foreground/35")}
          style={{ width: `${value * 100}%` }}
        />
      </span>
      <span className={cn("text-right tabular-nums", strong ? "text-ink-foreground" : "text-ink-foreground/55")}>
        {value.toFixed(3)}
      </span>
    </div>
  );
}

function FaultRow({ name, caught, strong }: { name: string; caught: number; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 text-sm">
      <span className={strong ? "text-ink-foreground" : "text-ink-foreground/55"}>{name}</span>
      <span className="flex flex-wrap gap-[3px]" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-2 rounded-full",
              i < caught ? (strong ? "bg-brand-soft" : "bg-ink-foreground/45") : "border border-ink-foreground/20",
            )}
          />
        ))}
      </span>
      <span className={cn("text-right tabular-nums", strong ? "text-ink-foreground" : "text-ink-foreground/55")}>
        {caught}/12
      </span>
    </div>
  );
}

export function Scoreboard({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-3xl bg-ink p-5 text-ink-foreground sm:p-8", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-1">
        <p className="text-[0.95rem] text-ink-foreground/80">
          BixBench3 task 9 · 13 fresh, pre-registered cases · swarm against a single gpt-5.5 agent
        </p>
        <a
          href={repoFile(SOURCE)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-ink-foreground/60 underline decoration-ink-foreground/25 underline-offset-4 hover:text-ink-foreground"
        >
          Batch-04 results
          <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
        </a>
      </div>

      <div className={cn("mt-6 grid gap-3", compact ? "md:grid-cols-3" : "lg:grid-cols-3")}>
        <Tile label="Mean grader score">
          <p className="font-display text-[4.2rem] leading-none tabular-nums sm:text-7xl">0.811</p>
          <p className="mt-3 text-ink-foreground/55">vs 0.608 for the single agent</p>
          <div className="mt-auto space-y-2.5 pt-8">
            <ScoreBar name="Crux swarm" value={0.811} strong />
            <ScoreBar name="Single agent" value={0.608} />
          </div>
        </Tile>
        <Tile label="Planted data faults caught">
          <p className="font-display text-[4.2rem] leading-none tabular-nums sm:text-7xl">
            12<span className="text-ink-foreground/45">/12</span>
          </p>
          <p className="mt-3 text-ink-foreground/55">vs 3/12 for the single agent</p>
          <div className="mt-auto space-y-2.5 pt-8">
            <FaultRow name="Crux swarm" caught={12} strong />
            <FaultRow name="Single agent" caught={3} />
          </div>
        </Tile>
        <Tile label="Paired difference, 13 cases">
          <p className="font-display text-[4.2rem] leading-none text-brand-soft tabular-nums sm:text-7xl">+0.203</p>
          <p className="mt-3 leading-relaxed text-ink-foreground/55">
            95% CI +0.048 to +0.382: the interval excludes zero. No crashes and no reruns.
          </p>
          <p className="mt-auto pt-6 text-sm text-ink-foreground/55">
            $1.17 a run against $1.38 · clean case 0.861 against 0.869
          </p>
        </Tile>
      </div>
    </div>
  );
}
