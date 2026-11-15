"use client";

// Negative binomial variance: the derivation, then μ + αμ² and the mix-up
// μ + μ²/α against μ on log–log axes for α = 0.2, with seeded Monte Carlo
// sample variances (Poisson draws with Gamma rates) computed in the browser.

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { monteCarloVariance, nbVariance, nbVarianceMixup } from "@/lib/explore/nb-variance";

import { FigureCard, Legend, LegendItem, Maths, Pow10Label, Readout, SourceLink, Swatch, fmt, fmtInt, px } from "./figure-parts";

const ALPHA = 0.2;
const MUS = [0.5, 1, 2, 5, 10, 20, 50, 100];
const DRAWS = 4000;
const FIRST_SEED = 11;

const W = 480;
const H = 334;
const ML = 46;
const MR = 14;
const MT = 28;
const MB = 40;
const PW = W - ML - MR;
const PH = H - MT - MB;
const X0 = Math.log10(0.4);
const X1 = Math.log10(160);
const Y0 = Math.log10(0.3);
const Y1 = Math.log10(160_000);

const x = (mu: number) => px(ML + ((Math.log10(mu) - X0) / (X1 - X0)) * PW);
const y = (v: number) => px(MT + (1 - (Math.log10(v) - Y0) / (Y1 - Y0)) * PH);

function curve(f: (mu: number) => number): string {
  const n = 120;
  let d = "";
  for (let i = 0; i <= n; i++) {
    const mu = 10 ** (X0 + ((X1 - X0) * i) / n);
    d += `${i === 0 ? "M" : "L"}${x(mu).toFixed(2)} ${y(f(mu)).toFixed(2)}`;
  }
  return d;
}

const CORRECT = curve((mu) => nbVariance(mu, ALPHA));
const MIXUP = curve((mu) => nbVarianceMixup(mu, ALPHA));
const POISSON = curve((mu) => mu);
const X_TICKS = [1, 10, 100];
const Y_TICKS = [1, 10, 100, 1000, 10_000, 100_000];

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-2 py-3 text-sm leading-relaxed">
      <span className="font-mono text-xs text-muted-foreground pt-0.5">{n}</span>
      <div>{children}</div>
    </li>
  );
}

export function NbVariancePlot() {
  const [seed, setSeed] = useState(FIRST_SEED);
  const points = useMemo(() => monteCarloVariance(seed, MUS, ALPHA, DRAWS), [seed]);
  const maxErr = Math.max(...points.map((p) => p.relErr));
  const minErrMixup = Math.min(...points.map((p) => p.relErrMixup));

  return (
    <FigureCard
      eyebrow="Recorded verdict · in-browser check"
      title={
        <>
          <Maths>Var[X] = μ + αμ²</Maths>, <span className="text-muted-foreground">not <Maths>μ + μ²/α</Maths>.</span>
        </>
      }
      caption={
        <>
          The verdict is recorded: the claims audit of the DESeq2 paper accepted <Maths>μ + αμ²</Maths> at
          posterior 0.956 after an exact SymPy derivation and a 200,000-draw Monte Carlo check, and
          rejected <Maths>μ + μ²/α</Maths> at 0.0062 (
          <SourceLink path="runs/demo/claims-deseq2-20261114/artifacts/CLAIMS.md">CLAIMS.md</SourceLink>
          ). The points are new: {MUS.length} settings × {fmtInt(DRAWS)} draws, sampled here as
          Poisson counts with Gamma rates (<SourceLink path="site/lib/explore/nb-variance.ts" />).
        </>
      }
    >
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <ol className="divide-y border-y">
            <Step n={1}>
              Draw a rate <Maths>λ ~ Gamma(shape 1/α, scale αμ)</Maths>, then a count{" "}
              <Maths>X | λ ~ Poisson(λ)</Maths>. X is negative binomial with mean <Maths>μ</Maths>.
            </Step>
            <Step n={2}>
              Gamma moments: <Maths>E[λ] = (1/α)·αμ = μ</Maths> and{" "}
              <Maths>Var[λ] = (1/α)·(αμ)² = αμ²</Maths>.
            </Step>
            <Step n={3}>
              Law of total variance: <Maths>Var[X] = E[Var(X | λ)] + Var(E[X | λ])</Maths>{" "}
              <Maths>= E[λ] + Var[λ]</Maths>.
            </Step>
            <Step n={4}>
              So <Maths>Var[X] = μ + αμ² = μ(αμ + 1)</Maths>.{" "}
              <span className="text-v-holds">Holds, posterior 0.956.</span>
            </Step>
          </ol>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            <span className="text-v-refuted">Rejected:</span> <Maths>μ + μ²/α</Maths> is what you
            get by reading <Maths>α</Maths> as the size <Maths>r</Maths> instead of <Maths>1/r</Maths>. At <Maths>α = 0.2</Maths> and <Maths>μ = 10</Maths> it gives{" "}
            <Maths>{fmtInt(nbVarianceMixup(10, ALPHA))}</Maths> where the variance is{" "}
            <Maths>{fmtInt(nbVariance(10, ALPHA))}</Maths>.
          </p>
        </div>

        <div className="min-w-0">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full text-foreground"
            role="img"
            aria-label={`Variance against mean on log axes for alpha 0.2. Sample variances from ${DRAWS} draws at each of ${MUS.length} means fall on mu plus alpha mu squared, within ${fmt(maxErr * 100, 1)} percent.`}
          >
            <g className="font-mono" fontSize="11" fill="var(--chart-5)">
              {Y_TICKS.map((v) => (
                <g key={v}>
                  <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke="var(--chart-5)" strokeOpacity="0.28" strokeWidth="0.75" />
                  <Pow10Label exp={Math.round(Math.log10(v))} x={ML - 7} y={y(v) + 4} />
                </g>
              ))}
              {X_TICKS.map((mu) => (
                <g key={mu}>
                  <line x1={x(mu)} x2={x(mu)} y1={MT} y2={MT + PH} stroke="var(--chart-5)" strokeOpacity="0.28" strokeWidth="0.75" />
                  <text x={x(mu)} y={MT + PH + 16} textAnchor="middle">
                    {mu}
                  </text>
                </g>
              ))}
              <text x={W - MR} y={H - 6} textAnchor="end">
                mean <tspan className="font-serif">μ</tspan>, log scale
              </text>
              <text x={ML} y={12}>
                variance, log scale, <tspan className="font-serif">α = 0.2</tspan>
              </text>
            </g>
            <path d={POISSON} fill="none" stroke="var(--chart-5)" strokeWidth="1" strokeDasharray="1.5 3" />
            <path d={MIXUP} fill="none" stroke="var(--chart-2)" strokeWidth="1.5" strokeDasharray="5 3.5" />
            <path d={CORRECT} fill="none" stroke="var(--chart-3)" strokeWidth="1.75" />
            {points.map((p) => (
              <circle
                key={p.mu}
                cx={x(p.mu)}
                cy={y(p.variance)}
                r="3.6"
                fill="currentColor"
                stroke="var(--card)"
                strokeWidth="1.25"
              >
                <title>{`μ = ${p.mu}: sample variance ${fmt(p.variance, 2)}, μ + αμ² = ${fmt(nbVariance(p.mu, ALPHA), 2)}`}</title>
              </circle>
            ))}
          </svg>
          <Legend className="mt-3">
            <LegendItem>
              <Swatch color="var(--chart-3)" /> <Maths>μ + αμ²</Maths> holds
            </LegendItem>
            <LegendItem>
              <Swatch color="var(--chart-2)" dashed /> <Maths>μ + μ²/α</Maths> rejected
            </LegendItem>
            <LegendItem>
              <Swatch color="var(--chart-5)" dashed /> Poisson, <Maths>Var = μ</Maths>
            </LegendItem>
            <LegendItem>
              <Swatch color="currentColor" kind="dot" /> sample variance
            </LegendItem>
          </Legend>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <dl className="grid grid-cols-2 gap-x-6">
              <Readout label={<>Largest miss vs <Maths>μ + αμ²</Maths></>} value={`${fmt(maxErr * 100, 1)}%`} />
              <Readout label={<>Smallest miss vs <Maths>μ + μ²/α</Maths></>} value={`${fmt(minErrMixup * 100, 0)}%`} />
            </dl>
            <Button variant="outline" size="sm" onClick={() => setSeed((s) => s + 1)}>
              Redraw · seed {seed + 1}
            </Button>
          </div>
        </div>
      </div>
    </FigureCard>
  );
}
