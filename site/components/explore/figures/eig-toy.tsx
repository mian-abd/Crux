"use client";

// An interactive toy of Crux's loop: two hypotheses, three diagnostics with
// stated likelihood tables, EIG in bits for each, and a Run button that samples
// an outcome from a seeded hidden truth and applies Bayes' rule.

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { bayesUpdate, eig, entropy, sampleIndex, type Likelihood } from "@/lib/explore/eig";
import { mulberry32 } from "@/lib/explore/rng";
import { cn } from "@/lib/utils";

import { FigureCard, SourceLink, fmt, pctOf } from "./figure-parts";

const HYPS = ["A", "B"] as const;
const PRIOR = [0.5, 0.5];
const SETTLE = 0.95;
const FIRST_SEED = 3;

interface Diagnostic {
  name: string;
  what: string;
  outcomes: string[];
  likelihood: Likelihood; // likelihood[h][o] = P(outcome o | hypothesis h)
}

const DIAGNOSTICS: Diagnostic[] = [
  {
    name: "Quick screen",
    what: "Positive a little more often under A than under B.",
    outcomes: ["+", "−"],
    likelihood: [
      [0.65, 0.35],
      [0.35, 0.65],
    ],
  },
  {
    name: "Targeted assay",
    what: "Usually positive under A, usually negative under B.",
    outcomes: ["+", "−"],
    likelihood: [
      [0.9, 0.1],
      [0.2, 0.8],
    ],
  },
  {
    name: "Three-way readout",
    what: "Low points to A, high to B, mid says nothing.",
    outcomes: ["low", "mid", "high"],
    likelihood: [
      [0.6, 0.3, 0.1],
      [0.1, 0.3, 0.6],
    ],
  },
];

interface Step {
  diagnostic: number;
  outcome: number;
  before: number[];
  after: number[];
  expected: number;
}

/** The k-th uniform of a seed's stream: draw 0 picks the truth, draw k + 1 drives run k. */
function uniformAt(seed: number, k: number): number {
  const rng = mulberry32(seed);
  let u = rng();
  for (let i = 0; i < k; i++) u = rng();
  return u;
}

function LikelihoodTable({ d }: { d: Diagnostic }) {
  return (
    <table className="font-mono text-[11px] tabular-nums">
      <caption className="sr-only">P(outcome | hypothesis) for {d.name}</caption>
      <thead>
        <tr className="text-muted-foreground">
          <th scope="col" className="pr-3 text-left font-normal">
            <span className="sr-only">Hypothesis</span>
          </th>
          {d.outcomes.map((o) => (
            <th key={o} scope="col" className="px-1.5 text-right font-normal">
              {o}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {d.likelihood.map((row, h) => (
          <tr key={h}>
            <th scope="row" className="pr-3 text-left font-normal text-muted-foreground">
              {HYPS[h]}
            </th>
            {row.map((p, o) => (
              <td key={o} className="px-1.5 text-right">
                {p.toFixed(2)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BeliefBar({ belief }: { belief: number[] }) {
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
        <div className="bg-chart-1 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: pctOf(belief[0]) }} />
        <div className="bg-chart-4 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: pctOf(belief[1]) }} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-sm tabular-nums">
        <span>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-chart-1" aria-hidden="true" />
          P(A) {fmt(belief[0])}
        </span>
        <span>
          P(B) {fmt(belief[1])}
          <span className="ml-1.5 inline-block size-2 rounded-full bg-chart-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

export function EigToy() {
  const [seed, setSeed] = useState(FIRST_SEED);
  const [steps, setSteps] = useState<Step[]>([]);

  const truth = uniformAt(seed, 0) < 0.5 ? 0 : 1;
  const belief = steps.length ? steps[steps.length - 1].after : PRIOR;
  const settled = Math.max(...belief) >= SETTLE;
  const leader = belief[0] >= belief[1] ? 0 : 1;

  const scored = useMemo(() => DIAGNOSTICS.map((d) => eig(belief, d.likelihood)), [belief]);
  const order = scored.map((_, i) => i).sort((a, b) => scored[b] - scored[a]);
  const maxBits = entropy(PRIOR); // 1 bit: everything there is to learn from the start

  const run = (i: number) => {
    const d = DIAGNOSTICS[i];
    const probs = d.likelihood[truth];
    const outcome = sampleIndex(probs, uniformAt(seed, steps.length + 1));
    const after = bayesUpdate(belief, d.likelihood, outcome);
    setSteps((s) => [...s, { diagnostic: i, outcome, before: belief, after, expected: scored[i] }]);
  };

  const reset = () => {
    setSeed((s) => s + 1);
    setSteps([]);
  };

  return (
    <FigureCard
      eyebrow="In-browser toy"
      title="Pick the check that is expected to teach you most."
      caption={
        <>
          EIG = H(prior) − E[H(posterior)], in bits: the entropy of the current belief minus the
          entropy expected after seeing the outcome. Each Run draws an outcome from the stated
          likelihoods under a hidden truth chosen by seed {seed}, then applies Bayes&apos; rule;
          the ranking is recomputed from the new belief. A single outcome can leave the belief less
          certain (a negative gain); EIG averages over outcomes, so it is never negative. The toy
          stops at {SETTLE}. Every
          diagnostic costs the same here, so the score is EIG alone. Code:{" "}
          <SourceLink path="site/lib/explore/eig.ts" />.
        </>
      }
    >
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <p className="eyebrow">Diagnostics, ranked by EIG</p>
          <ol className="mt-4 divide-y border-y">
            {order.map((i, rank) => {
              const d = DIAGNOSTICS[i];
              return (
                <li key={d.name} className="grid gap-x-5 gap-y-3 py-4 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{rank + 1}</span>
                      {d.name}
                      {rank === 0 && !settled && (
                        <span className="ml-2 inline-block rounded-sm bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-brand">best next</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.what}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="relative h-1.5 flex-1 rounded-full bg-muted" aria-hidden="true">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none"
                          style={{ width: pctOf(Math.max(scored[i], maxBits * 0.006), maxBits) }}
                        />
                      </div>
                      <span className="w-20 text-right font-mono text-xs tabular-nums">{fmt(scored[i])} bits</span>
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end">
                    <LikelihoodTable d={d} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => run(i)}
                      disabled={settled}
                      aria-label={`Run ${d.name}`}
                    >
                      Run
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            A full bar is 1 bit, all there is to learn about two equally likely hypotheses.
          </p>
        </div>

        <div>
          <p className="eyebrow">Belief</p>
          <div className="mt-4">
            <BeliefBar belief={belief} />
          </div>
          <p className="mt-4 min-h-[2.5rem] text-sm leading-relaxed" aria-live="polite">
            {settled ? (
              <>
                <span className={leader === truth ? "text-v-holds" : "text-v-refuted"}>
                  Settled on {HYPS[leader]}.
                </span>{" "}
                <span className="text-muted-foreground">
                  The hidden truth was {HYPS[truth]}
                  {leader === truth ? "." : ": an unlucky run of outcomes, which Bayes' rule allows."}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                The hidden truth is revealed once one hypothesis reaches {SETTLE}.
              </span>
            )}
          </p>

          <p className="eyebrow mt-8">Runs</p>
          {steps.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No runs yet. Press Run on any diagnostic.</p>
          ) : (
            <ol className="mt-3 divide-y border-y">
              {steps.map((s, k) => {
                const d = DIAGNOSTICS[s.diagnostic];
                const learned = entropy(s.before) - entropy(s.after);
                return (
                  <li key={k} className="grid grid-cols-[1.5rem_1fr] gap-x-2 py-2.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground pt-0.5">{k + 1}</span>
                    <div>
                      <p>
                        {d.name} <span className="text-muted-foreground">→</span>{" "}
                        <span className="font-mono">{d.outcomes[s.outcome]}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                        P(A) {fmt(s.before[0])} → {fmt(s.after[0])} · expected {fmt(s.expected)} bits, got{" "}
                        <span className={cn(learned < 0 && "text-v-refuted")}>{fmt(learned).replace("-", "−")}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-5">
            <Button variant="outline" size="sm" onClick={reset}>
              New trial · seed {seed + 1}
            </Button>
          </div>
        </div>
      </div>
    </FigureCard>
  );
}
