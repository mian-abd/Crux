"use client";

// "What it tests": an accordion of the domains Crux has run in, each with a panel of
// recorded numbers. Every figure here is copied from a results file in the repository,
// cited under the panel; nothing is simulated or invented.

import { ArrowUpRightIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { repoFile } from "@/lib/site";
import { cn } from "@/lib/utils";

type Domain = {
  id: string;
  title: string;
  body: string;
  source: string;
  panel: () => React.ReactNode;
};

function Bar({ label, value, max, strong }: { label: string; value: number; max: number; strong?: boolean }) {
  return (
    <div className="grid min-w-0 grid-cols-[6.25rem_minmax(0,1fr)_2.75rem] items-center gap-2.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_4rem] sm:gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-2.5 rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", strong ? "bg-brand" : "bg-subtle")}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </span>
      <span className="text-right font-mono tabular-nums">{value}</span>
    </div>
  );
}

function Dots({ label, caught, of = 12, strong }: { label: string; caught: number; of?: number; strong?: boolean }) {
  return (
    <div className="grid min-w-0 grid-cols-[6.25rem_minmax(0,1fr)_2.75rem] items-center gap-2.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_4rem] sm:gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex flex-wrap gap-[3px] sm:gap-1" aria-hidden="true">
        {Array.from({ length: of }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-2 rounded-full sm:size-2.5",
              i < caught ? (strong ? "bg-brand" : "bg-subtle") : "border border-border bg-transparent",
            )}
          />
        ))}
      </span>
      <span className="text-right font-mono tabular-nums">
        {caught}/{of}
      </span>
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

function GenomicsPanel() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <PanelTitle>Mean grader score, 13 fresh cases</PanelTitle>
        <Bar label="Crux swarm" value={0.811} max={1} strong />
        <Bar label="Single agent" value={0.608} max={1} />
      </div>
      <div className="space-y-3">
        <PanelTitle>Planted data faults caught</PanelTitle>
        <Dots label="Crux swarm" caught={12} strong />
        <Dots label="Single agent" caught={3} />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Paired difference <span className="font-mono text-foreground">+0.203</span> (95% CI{" "}
        <span className="font-mono">+0.048</span> to <span className="font-mono">+0.382</span>). One task of 20, one run
        per arm per case. On the reused seed-43 suite the scores were tied.
      </p>
    </div>
  );
}

function StatisticsPanel() {
  const rows = [
    { label: "Per-gene dispersion", value: 0.1139 },
    { label: "Moderated dispersion", value: 0.05755 },
  ];
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <PanelTitle>False-positive rate at p &lt; 0.05, 3 replicates</PanelTitle>
        <div className="relative space-y-3 [--gap:0.625rem] [--lab:6.25rem] [--val:2.75rem] sm:[--gap:0.75rem] sm:[--lab:10rem] sm:[--val:4rem]">
          {rows.map((r) => (
            <Bar key={r.label} label={r.label} value={r.value} max={0.15} strong={r.value < 0.06} />
          ))}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 border-l border-dashed border-brand"
            style={{ left: `calc(var(--lab) + var(--gap) + (100% - var(--lab) - var(--val) - 2 * var(--gap)) * ${0.05 / 0.15})` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">Dashed line: the nominal 0.05.</p>
      </div>
      <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
        <div className="bg-card p-4">
          <p className="text-sm text-muted-foreground">Benjamini–Hochberg FDR at π₀ = 0.9</p>
          <p className="mt-1 font-mono text-2xl">0.0450</p>
          <p className="mt-1 text-xs text-muted-foreground">theory 0.045 · holds, posterior 0.951</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-sm text-muted-foreground">Wald p-values with 3 replicates</p>
          <p className="mt-1 font-display text-2xl">Holds only if moderated</p>
          <p className="mt-1 text-xs text-muted-foreground">posterior 0.941</p>
        </div>
      </div>
    </div>
  );
}

function MathematicsPanel() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-5 font-mono text-[0.85rem] leading-7">
        <p className="text-muted-foreground">X ~ NegBin(mean μ, dispersion α)</p>
        <p>
          Var[X] = μ(αμ + 1) <span className="text-muted-foreground">· derived by SymPy</span>
        </p>
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span>= μ + αμ²</span>
          <span className="text-v-holds">holds, posterior 0.956</span>
        </p>
        <p className="flex flex-wrap items-baseline gap-x-3 text-muted-foreground">
          <span className="line-through">μ + μ²/α</span>
          <span className="text-v-refuted no-underline">the common mix-up, rejected</span>
        </p>
      </div>
      <div className="rounded-lg border border-dashed p-5">
        <p className="eyebrow text-v-refuted">Planted false claim</p>
        <p className="mt-2 font-display text-xl leading-snug">&ldquo;Benjamini–Hochberg controls the family-wise error rate.&rdquo;</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          A counterexample with 3 tests and 2 true nulls gives an FWER of{" "}
          <span className="font-mono text-foreground">0.0659</span> (99.9% lower bound{" "}
          <span className="font-mono">0.0641</span>), above 0.05. Its &ldquo;holds&rdquo; reading fell to{" "}
          <span className="font-mono">0.017</span> and was rejected.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">Formal proofs, for example in Lean, are next. They are not built.</p>
    </div>
  );
}

function DesignPanel() {
  const ranking = [
    { goal: "Nearest-neighbour label check (Spearman, within cell line)", eig: 0.651, cost: 5, score: 0.609, chosen: true },
    { goal: "Best single label exchange by replicate correlation", eig: 0.627, cost: 5, score: 0.586, chosen: false },
  ];
  const beliefs = [
    { label: "Labels correct as given", before: 0.425, after: 0.846, final: 0.942 },
    { label: "Two libraries swapped", before: 0.425, after: 0.028, final: 0.002 },
    { label: "None of these", before: 0.15, after: 0.126, final: 0.056 },
  ];
  return (
    <div className="space-y-7">
      <div>
        <PanelTitle>Question: are the sample labels right? Candidates, ranked</PanelTitle>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-normal">Diagnostic</th>
              <th className="pb-2 text-right font-normal">EIG, bits</th>
              <th className="pb-2 text-right font-normal">Score</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => (
              <tr key={r.goal} className="border-t">
                <td className="py-2.5 pr-3">
                  {r.goal}
                  {r.chosen && <span className="ml-2 text-xs text-brand">run first</span>}
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums">{r.eig.toFixed(3)}</td>
                <td className="py-2.5 text-right font-mono tabular-nums">{r.score.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <PanelTitle>Posterior after each run</PanelTitle>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-normal">Option</th>
              <th className="pb-2 text-right font-normal">Prior</th>
              <th className="pb-2 text-right font-normal">Run 1</th>
              <th className="pb-2 text-right font-normal">Run 2</th>
            </tr>
          </thead>
          <tbody>
            {beliefs.map((b) => (
              <tr key={b.label} className="border-t">
                <td className="py-2.5 pr-3">{b.label}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{b.before.toFixed(3)}</td>
                <td className="py-2.5 text-right font-mono tabular-nums">{b.after.toFixed(3)}</td>
                <td
                  className={cn(
                    "py-2.5 text-right font-mono tabular-nums",
                    b.final >= 0.9 && "text-v-holds",
                    b.final < 0.02 && "text-v-refuted",
                  )}
                >
                  {b.final.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          Settled at 0.9; the swap was rejected below 0.02. In a separate BoxingGym study, EIG selection did not beat
          random selection.
        </p>
      </div>
    </div>
  );
}

function PaperPanel() {
  const steps = [
    { n: "01", title: "Upload a PDF", body: "The file stays on the server, and its text is extracted there. Nothing goes to a model until you ask." },
    { n: "02", title: "Extract its claims", body: "Each claim keeps a quote, and any quote not found word for word in the paper is flagged." },
    { n: "03", title: "Match to checks", body: "Claims are matched to the ones the engine can test today: four from the DESeq2 paper." },
    { n: "04", title: "Watch the audit", body: "The run streams live: options, experiments, Bayes updates and the rejected ledger." },
  ];
  return (
    <ol className="divide-y border-y">
      {steps.map((s) => (
        <li key={s.n} className="grid grid-cols-[2.5rem_1fr] gap-3 py-4">
          <span className="font-mono text-sm text-muted-foreground">{s.n}</span>
          <div>
            <p className="font-medium">{s.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

const DOMAINS: Domain[] = [
  {
    id: "genomics",
    title: "Genomics",
    body: "RNA-seq from a published count matrix (BixBench3 task 9). Pre-registered checks look for swapped labels, duplicated or degraded libraries and three more fault types, in network-blocked sandboxes, before any analysis is written.",
    source: "eval/results/task9_batch04.md",
    panel: GenomicsPanel,
  },
  {
    id: "statistics",
    title: "Statistics",
    body: "Is a method calibrated? Each claim becomes competing readings, and simulations decide between them. The whole audit runs in about 10 seconds with no model calls.",
    source: "runs/demo/claims-deseq2-20261114/artifacts/CLAIMS.md",
    panel: StatisticsPanel,
  },
  {
    id: "mathematics",
    title: "Mathematics",
    body: "Does the formula hold? SymPy derives it symbolically, a Monte Carlo run checks it, and a search for counterexamples tries to break it. One claim is planted false, to show the engine refutes what it should.",
    source: "docs/CLAIMS.md",
    panel: MathematicsPanel,
  },
  {
    id: "design",
    title: "Experimental design",
    body: "Which experiment next? Every option predicts each diagnostic's outcome, and the engine runs the one with the most expected information per unit of cost. These are the numbers from the first graded run.",
    source: "runs/demo/task9_real_swarm_run1.jsonl",
    panel: DesignPanel,
  },
  {
    id: "papers",
    title: "Any paper",
    body: "Upload a PDF, extract its claims with verified quotes, and audit the ones the engine has checks for. Extraction needs an OpenAI key; the audit itself does not.",
    source: "site/README.md",
    panel: PaperPanel,
  },
];

export function Domains() {
  const [open, setOpen] = useState(DOMAINS[0].id);
  const active = DOMAINS.find((d) => d.id === open) ?? DOMAINS[0];
  const Panel = active.panel;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <ul className="min-w-0 divide-y border-b">
        {DOMAINS.map((d) => {
          const isOpen = d.id === open;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpen(d.id)}
                aria-expanded={isOpen}
                aria-controls={`domain-${d.id}`}
                className="group flex w-full items-center gap-4 py-5 text-left"
              >
                <span
                  className={cn(
                    "font-display text-[1.9rem] leading-none transition-colors sm:text-[2.1rem]",
                    isOpen ? "text-foreground" : "text-subtle group-hover:text-muted-foreground",
                  )}
                >
                  {d.title}
                </span>
                {isOpen ? (
                  <MinusIcon className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <PlusIcon className="ml-auto size-4 text-subtle" aria-hidden="true" />
                )}
              </button>
              {isOpen && (
                <div className="pb-6">
                  <p className="max-w-lg leading-relaxed text-muted-foreground">{d.body}</p>
                  {/* On small screens the panel sits under its own item. */}
                  <div className="mt-6 min-w-0 rounded-2xl border bg-card p-4 sm:p-5 lg:hidden">
                    <Panel />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div id={`domain-${active.id}`} className="hidden lg:block">
        <div className="sticky top-28 rounded-2xl border bg-card p-8 shadow-[0_1px_0_0_var(--border)]">
          <Panel />
          <a
            href={repoFile(active.source)}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
          >
            {active.source}
            <ArrowUpRightIcon className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
