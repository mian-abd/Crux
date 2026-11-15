"use client";

// The planted false claim "Benjamini–Hochberg controls the FWER". Three tests,
// two true nulls and one strong signal: the recorded FWER (0.0659, 99.9% lower
// bound 0.0641) beside the exact value and a seeded re-run in the browser.

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { bhFwerSureSignals, simulateBhFwer } from "@/lib/explore/multiple-testing";
import { cn } from "@/lib/utils";

import { FigureCard, Legend, LegendItem, Maths, SourceLink, Swatch, fmt, fmtInt, px } from "./figure-parts";

const Q = 0.05;
const M = 3;
const NULLS = 2;
const EFFECT = 6;
const REPS = 20_000;
const SHOWN = 700;
const FIRST_SEED = 1; // this page's own generator, not the recorded run's NumPy seed

// Recorded in runs/demo/claims-deseq2-20261114/artifacts/CLAIMS.md (diagnostic bh_fwer_counterexample).
const RECORDED = { fwer: 0.06591, lower: 0.06409, reps: 200_000, seed: 4202, settingsTried: 3, holdsPosterior: 0.0169 };

// Unit square of the two null p-values; the bottom margin (S − ST − SP) holds the axis labels.
const S = 300;
const SL = 34;
const ST = 8;
const SR = 8;
const SP = S - SL - SR;
const sx = (p: number) => px(SL + p * SP);
const sy = (p: number) => px(ST + (1 - p) * SP);

function dots(points: number[][], r: number): string {
  let d = "";
  for (const [a, b] of points) d += `M${(sx(a) - r).toFixed(1)} ${sy(b).toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  return d;
}

// Number line.
const LO = 0.04;
const HI = 0.072;
const pct = (v: number) => `${(((v - LO) / (HI - LO)) * 100).toFixed(2)}%`;

function Track({
  value,
  lower,
  marker = "dot",
  className,
}: {
  value: number;
  lower?: number;
  marker?: "dot" | "diamond" | "ring";
  className?: string;
}) {
  return (
    <div className={cn("relative h-6", className)} aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <div className="absolute inset-y-0 w-px bg-foreground/55" style={{ left: pct(Q) }} />
      {lower !== undefined && (
        <>
          <div className="absolute top-1/2 h-px bg-current" style={{ left: pct(lower), width: `calc(${pct(value)} - ${pct(lower)})` }} />
          <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-current" style={{ left: pct(lower) }} />
        </>
      )}
      <div
        className={cn(
          "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2",
          marker === "dot" && "rounded-full bg-current",
          marker === "ring" && "rounded-full border-[1.5px] border-current bg-card",
          marker === "diamond" && "rotate-45 bg-current",
        )}
        style={{ left: pct(value) }}
      />
    </div>
  );
}

function Row({ label, detail, children }: { label: string; detail: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[10.5rem_1fr] sm:items-center">
      <div className="text-sm leading-snug">
        {label}
        <div className="font-mono text-[11px] text-muted-foreground">{detail}</div>
      </div>
      {children}
    </div>
  );
}

export function BhFwerCounterexample() {
  const [seed, setSeed] = useState(FIRST_SEED);
  const sim = useMemo(() => simulateBhFwer(seed, M, NULLS, EFFECT, REPS, Q, SHOWN), [seed]);
  const exact = useMemo(() => bhFwerSureSignals(NULLS, M - NULLS, Q), []);
  const hit = sim.nullP.filter((_, i) => sim.falseReject[i]);
  const miss = sim.nullP.filter((_, i) => !sim.falseReject[i]);
  const strip = (2 * Q) / 3;

  return (
    <FigureCard
      eyebrow="Recorded verdict · in-browser check"
      title={
        <>
          &ldquo;BH controls the FWER&rdquo; is false.
        </>
      }
      caption={
        <>
          The claim was planted: the paper does not make it, and the agents were not told. The
          search in{" "}
          <SourceLink path="labs/claims/scripts/bh_fwer_counterexample.py">bh_fwer_counterexample.py</SourceLink>{" "}
          walks m = 2 to 8 tests and stopped at the third setting it tried; the numbers and the
          verdict are in{" "}
          <SourceLink path="runs/demo/claims-deseq2-20261114/artifacts/CLAIMS.md">CLAIMS.md</SourceLink>.
          The exact value and the re-run are computed in this page. BH does control the FDR at q; it
          is the stronger FWER promise that fails.
        </>
      }
    >
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1fr_1fr]">
        <div className="text-sm leading-relaxed">
          <p className="text-muted-foreground">
            Three independent one-sided z-tests at q = 0.05: two true nulls (z ~ N(0, 1)) and one
            strong signal (z ~ N(6, 1)).
          </p>
          <ol className="mt-4 divide-y border-y">
            <li className="grid grid-cols-[1.5rem_1fr] gap-2 py-3">
              <span className="pt-0.5 font-mono text-xs text-muted-foreground">1</span>
              <span>
                The signal&apos;s p-value is about 10<sup>−9</sup>, so it takes rank 1 and is
                rejected.
              </span>
            </li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-2 py-3">
              <span className="pt-0.5 font-mono text-xs text-muted-foreground">2</span>
              <span>
                BH then rejects a null at rank 2 if its p ≤ 2q/3 ={" "}
                <span className="font-mono text-[0.82rem]">{fmt(strip, 4)}</span>, or both at rank 3
                if both are ≤ q.
              </span>
            </li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-2 py-3">
              <span className="pt-0.5 font-mono text-xs text-muted-foreground">3</span>
              <span>
                So <span className="font-mono text-[0.82rem] whitespace-nowrap">FWER = 1 − (1 − 2q/3)² + (q/3)²</span>{" "}
                <span className="font-mono text-[0.82rem] whitespace-nowrap">= {fmt(exact, 4)} &gt; 0.05</span>.
              </span>
            </li>
          </ol>
          <p className="mt-4">
            <span className="text-v-refuted">Refuted.</span>{" "}
            <span className="text-muted-foreground">
              The claim&apos;s own option fell to posterior {RECORDED.holdsPosterior} after one
              diagnostic, below the 0.02 rejection line.
            </span>
          </p>

          <div className="mt-8 space-y-4">
            <p className="eyebrow">Family-wise error rate</p>
            <Row label="Recorded" detail={`${fmtInt(RECORDED.reps)} runs, seed ${RECORDED.seed}`}>
              <Track value={RECORDED.fwer} lower={RECORDED.lower} className="text-v-refuted" />
            </Row>
            <Row label="Exact" detail="strong-signal limit">
              <Track value={exact} marker="diamond" className="text-foreground" />
            </Row>
            <Row label="This page" detail={`${fmtInt(REPS)} runs, seed ${seed}`}>
              <Track value={sim.fwer} lower={sim.lower} marker="ring" className="text-foreground" />
            </Row>
            <div className="grid sm:grid-cols-[10.5rem_1fr] sm:gap-x-4">
              <span className="hidden sm:block" />
              <div className="relative h-4 font-mono text-[11px] text-muted-foreground" aria-hidden="true">
                {[0.04, 0.05, 0.06, 0.07].map((v) => (
                  <span key={v} className="absolute -translate-x-1/2" style={{ left: pct(v) }}>
                    {v.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-x-4 pt-2 font-mono text-sm tabular-nums">
              <div>
                <dt className="font-sans text-xs text-muted-foreground">Recorded</dt>
                <dd className="text-v-refuted">{fmt(RECORDED.fwer, 4)}</dd>
                <dd className="text-[11px] text-muted-foreground">≥ {fmt(RECORDED.lower, 4)}</dd>
              </div>
              <div>
                <dt className="font-sans text-xs text-muted-foreground">Exact</dt>
                <dd>{fmt(exact, 4)}</dd>
              </div>
              <div>
                <dt className="font-sans text-xs text-muted-foreground">This page</dt>
                <dd>{fmt(sim.fwer, 4)}</dd>
                <dd className="text-[11px] text-muted-foreground">≥ {fmt(sim.lower, 4)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Bars run from the 99.9% lower bound to the estimate. The vertical rule is the claimed
              bound <Maths>α</Maths> = 0.05.
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <svg
            viewBox={`0 0 ${S} ${S}`}
            className="mx-auto w-full max-w-sm text-foreground"
            role="img"
            aria-label={`The two null p-values of ${SHOWN} simulated experiments. ${hit.length} land in the shaded region where BH rejects at least one true null.`}
          >
            <rect x={sx(0)} y={sy(1)} width={SP} height={SP} fill="none" stroke="var(--chart-5)" strokeWidth="0.75" />
            <path d={dots(miss, 1.5)} fill="var(--chart-5)" fillOpacity="0.55" />
            {/* Region where at least one null is rejected. */}
            <g fill="var(--chart-2)" fillOpacity="0.16" stroke="var(--chart-2)" strokeWidth="0.75">
              <path
                d={`M${sx(0)} ${sy(0)}V${sy(1)}H${sx(strip)}V${sy(strip)}H${sx(1)}V${sy(0)}Z`}
              />
              <rect x={sx(strip)} y={sy(Q)} width={sx(Q) - sx(strip)} height={sy(strip) - sy(Q)} />
            </g>
            <path d={dots(hit, 1.8)} fill="var(--chart-2)" />
            <g className="font-mono" fontSize="11" fill="var(--chart-5)">
              <text x={sx(0)} y={S - 12} textAnchor="middle">0</text>
              <text x={sx(0.5)} y={S - 12} textAnchor="middle">0.5</text>
              <text x={sx(1)} y={S - 12} textAnchor="middle">1</text>
              <text x={SL - 6} y={sy(0.5) + 4} textAnchor="end">0.5</text>
              <text x={SL - 6} y={sy(1) + 8} textAnchor="end">1</text>
              <text x={sx(1)} y={S - 1} textAnchor="end">
                null p<tspan dy="2.5" fontSize="0.75em">1</tspan>
              </text>
              <text x={8} y={ST + 2} transform={`rotate(-90 8 ${ST + 2})`} textAnchor="end">
                null p<tspan dy="2.5" fontSize="0.75em">2</tspan>
              </text>
            </g>
            <g className="font-mono" fontSize="11" fill="var(--chart-2)" stroke="var(--card)" strokeWidth="3" paintOrder="stroke">
              <text x={sx(strip) + 6} y={sy(0.62)}>
                p<tspan dy="2.5" fontSize="0.75em">1</tspan>
                <tspan dy="-2.5"> ≤ 2q/3</tspan>
              </text>
              <text x={sx(0.62)} y={sy(strip) - 6}>
                p<tspan dy="2.5" fontSize="0.75em">2</tspan>
                <tspan dy="-2.5"> ≤ 2q/3</tspan>
              </text>
            </g>
          </svg>
          <Legend className="mt-3 justify-center">
            <LegendItem>
              <Swatch color="var(--chart-2)" kind="area" /> BH rejects a true null
            </LegendItem>
            <LegendItem>
              <Swatch color="var(--chart-2)" kind="dot" /> {hit.length} of {SHOWN} runs land there
            </LegendItem>
          </Legend>
          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            Null p-values are uniform, so the shaded area is the FWER: two strips 2q/3 wide plus the
            small square where both are between 2q/3 and q.
          </p>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setSeed((s) => s + 1)}>
              Re-run · seed {seed + 1}
            </Button>
          </div>
        </div>
      </div>
    </FigureCard>
  );
}
