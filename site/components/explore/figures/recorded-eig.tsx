// The EIG ranking and Bayes updates for one question of the first graded Task 9
// run, copied from its event log (runs/demo/task9_real_swarm_run1.jsonl):
// experiment.scored (seq 137, 201), belief.updated (seq 144, 208),
// hypothesis.rejected (209) and question.settled (210). Nothing is re-computed.

import { cn } from "@/lib/utils";

import { FigureCard, SourceLink, fmt, pctOf } from "./figure-parts";

const RUN_FILE = "runs/demo/task9_real_swarm_run1.jsonl";
const MAX_BITS = Math.log2(3); // three options: as given, swapped, none of these
const SETTLE = 0.9;
const REJECT = 0.02;

const RANKING = [
  {
    id: "d1",
    name: "Nearest-neighbour label check",
    goal: "Does every library's nearest neighbour, within its cell line, carry its condition label?",
    eig: 0.6514474221487865,
    costS: 5,
    score: 0.608729558401325,
  },
  {
    id: "d0",
    name: "Best single label exchange",
    goal: "Which one label exchange most raises replicate correlation within a cell line?",
    eig: 0.6272578149876493,
    costS: 5,
    score: 0.5861261549884592,
  },
];

const STAGES = [
  { label: "Prior", detail: "before any check" },
  { label: "After d1", detail: "observed “consistent”" },
  { label: "After d0", detail: "observed “as_given”" },
];

const HYPOTHESES = [
  {
    name: "Labels correct as given",
    key: "as_given",
    values: [0.425, 0.8460124707323827, 0.9422660412652893],
    note: `settled, above ${SETTLE}`,
    tone: "text-v-holds",
  },
  {
    name: "Two libraries swapped",
    key: "two_swapped",
    values: [0.425, 0.028105304676944252, 0.0020752641135857704],
    note: `rejected, below ${REJECT}`,
    tone: "text-v-refuted",
  },
  {
    name: "None of these",
    key: "none",
    values: [0.15, 0.12588222459067294, 0.05565869462112481],
    note: "catch-all",
    tone: "text-v-unresolved",
  },
];

function Bar({ value, max = 1, className, marks = [] }: { value: number; max?: number; className?: string; marks?: number[] }) {
  return (
    <div className={cn("relative h-1.5 rounded-full bg-muted", className)} aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full bg-current" style={{ width: pctOf(Math.max(value, max * 0.006), max) }} />
      {marks.map((m) => (
        <div key={m} className="absolute -inset-y-1 w-px bg-foreground/35" style={{ left: pctOf(m, max) }} />
      ))}
    </div>
  );
}

export function RecordedEig() {
  return (
    <FigureCard
      eyebrow="Recorded run"
      title="Two checks, ranked, then run."
      caption={
        <>
          Every number is copied from the event log of the first graded Task 9 run,{" "}
          <SourceLink path={RUN_FILE} />, question <span className="font-mono text-xs">library-sample_labels</span>.
          Score = impact × EIG ÷ (1 + 0.2 × cost in minutes), with impact 0.95 here. A full bar in
          the ranking is log<sub>2</sub>3 = 1.58 bits, the most any check could reveal about three options.
          Ticks on the belief bars mark the rejection line (0.02) and the settling line (0.9).
        </>
      }
    >
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The question: do the condition labels in the sample sheet match the libraries, or were a
        control and a treated library in one cell line swapped?
      </p>

      <div className="mt-8">
        <p className="eyebrow">Ranking before any check ran</p>
        <div className="mt-4 divide-y border-y">
          <div className="hidden grid-cols-[2rem_1fr_11rem_3.5rem_4rem] gap-4 py-2 text-xs text-muted-foreground sm:grid">
            <span>#</span>
            <span>Diagnostic</span>
            <span>EIG</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Score</span>
          </div>
          {RANKING.map((d, i) => (
            <div key={d.id} className="grid grid-cols-[2rem_1fr] gap-x-4 gap-y-2 py-4 sm:grid-cols-[2rem_1fr_11rem_3.5rem_4rem] sm:items-center">
              <span className="font-mono text-sm text-muted-foreground">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{d.id}</span> {d.name}
                  {i === 0 && <span className="ml-2 inline-block rounded-sm bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-brand">run first</span>}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.goal}</p>
              </div>
              <div className="col-start-2 sm:col-start-auto">
                <div className="flex items-baseline justify-between font-mono text-xs tabular-nums">
                  <span>{fmt(d.eig)} bits</span>
                  <span className="text-muted-foreground sm:hidden">
                    {d.costS} s · score {fmt(d.score)}
                  </span>
                </div>
                <Bar value={d.eig} max={MAX_BITS} className="mt-1.5 text-brand" />
              </div>
              <span className="hidden text-right font-mono text-xs tabular-nums sm:block">{d.costS} s</span>
              <span className="hidden text-right font-mono text-xs tabular-nums sm:block">{fmt(d.score)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          With equal costs the order comes from EIG alone. Once d1 had run, d0 was re-scored at{" "}
          <span className="font-mono">0.103</span> bits: the first result had already removed most of the
          uncertainty, so there was less left for d0 to resolve.
        </p>
      </div>

      <div className="mt-10">
        <p className="eyebrow">Belief after each result</p>
        <div className="mt-4 divide-y border-y">
          <div className="hidden grid-cols-[13rem_repeat(3,1fr)] gap-6 py-2 text-xs text-muted-foreground md:grid">
            <span>Option</span>
            {STAGES.map((s) => (
              <span key={s.label}>
                {s.label} <span className="font-mono text-[11px]">{s.detail}</span>
              </span>
            ))}
          </div>
          {HYPOTHESES.map((h) => (
            <div key={h.key} className="grid grid-cols-3 gap-x-4 gap-y-3 py-4 md:grid-cols-[13rem_repeat(3,1fr)] md:items-center md:gap-x-6">
              <div className="col-span-3 md:col-span-1">
                <p className="text-sm">{h.name}</p>
                <p className={cn("font-mono text-[11px]", h.tone)}>{h.note}</p>
              </div>
              {h.values.map((v, i) => (
                <div key={i} className={h.tone}>
                  <p className="text-[11px] text-muted-foreground md:hidden">{STAGES[i].label}</p>
                  <p className="font-mono text-sm tabular-nums text-foreground">{fmt(v)}</p>
                  <Bar value={v} marks={[REJECT, SETTLE]} className="mt-1.5" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </FigureCard>
  );
}
