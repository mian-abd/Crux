// The held-out headline numbers (batch-04 and batch-05, 52 cases) on an ink panel, shared by the landing page and the
// signed-in home. Every value is from eval/results/task9_batch05.md.

import { ArrowUpRightIcon } from "lucide-react";

import { repoFile } from "@/lib/site";
import { cn } from "@/lib/utils";

const SOURCE = "eval/results/task9_batch05.md";

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
      <span className="flex flex-wrap gap-[2px]" aria-hidden="true">
        {Array.from({ length: 48 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full",
              i < caught ? (strong ? "bg-brand-soft" : "bg-ink-foreground/45") : "border border-ink-foreground/20",
            )}
          />
        ))}
      </span>
      <span className={cn("text-right tabular-nums", strong ? "text-ink-foreground" : "text-ink-foreground/55")}>
        {caught}/48
      </span>
    </div>
  );
}

export function Scoreboard({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-3xl bg-ink p-5 text-ink-foreground sm:p-8", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-1">
        <p className="text-[0.95rem] text-ink-foreground/80">
          BixBench3 task 9 · 52 fresh, pre-registered cases in four suites · swarm against a single gpt-5.5 agent
        </p>
        <a
          href={repoFile(SOURCE)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-ink-foreground/60 underline decoration-ink-foreground/25 underline-offset-4 hover:text-ink-foreground"
        >
          Batch-04 and batch-05 results
          <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
        </a>
      </div>

      <div className={cn("mt-6 grid gap-3", compact ? "md:grid-cols-3" : "lg:grid-cols-3")}>
        <Tile label="Mean grader score">
          <p className="font-display text-[4.2rem] leading-none tabular-nums sm:text-7xl">0.817</p>
          <p className="mt-3 text-ink-foreground/55">vs 0.671 for the single agent</p>
          <div className="mt-auto space-y-2.5 pt-8">
            <ScoreBar name="Crux swarm" value={0.817} strong />
            <ScoreBar name="Single agent" value={0.671} />
          </div>
        </Tile>
        <Tile label="Planted data faults caught">
          <p className="font-display text-[4.2rem] leading-none tabular-nums sm:text-7xl">
            48<span className="text-ink-foreground/45">/48</span>
          </p>
          <p className="mt-3 text-ink-foreground/55">vs 14/48 for the single agent</p>
          <div className="mt-auto space-y-2.5 pt-8">
            <FaultRow name="Crux swarm" caught={48} strong />
            <FaultRow name="Single agent" caught={14} />
          </div>
        </Tile>
        <Tile label="Paired difference, 52 cases">
          <p className="font-display text-[4.2rem] leading-none text-brand-soft tabular-nums sm:text-7xl">+0.146</p>
          <p className="mt-3 leading-relaxed text-ink-foreground/55">
            95% CI +0.084 to +0.215: the interval excludes zero. Per suite: +0.203, +0.123, +0.147 and +0.112; the last includes zero on its own.
          </p>
          <p className="mt-auto pt-6 text-sm text-ink-foreground/55">
            $1.18 a run against $1.47 · clean cases 0.864 against 0.868 · no crashes, no reruns
          </p>
        </Tile>
      </div>
    </div>
  );
}
