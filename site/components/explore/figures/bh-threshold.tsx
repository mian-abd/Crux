"use client";

// Benjamini–Hochberg against Bonferroni on 20 seeded p-values. The slider sets
// q; the BH step line i/m·q, the Bonferroni line q/m and the rejections all
// recompute in the browser.

import { useId, useMemo, useState } from "react";

import { bhReject, bonferroniReject, seededPValues } from "@/lib/explore/multiple-testing";

import { FigureCard, Legend, LegendItem, Pow10Label, SourceLink, Swatch, px } from "./figure-parts";

const SEED = 21;
const M = 20;
const SIGNALS = 6;
const EFFECT = 3;

const W = 520;
const H = 300;
const ML = 50;
const MR = 12;
const MT = 16;
const MB = 46;
const PW = W - ML - MR;
const PH = H - MT - MB;

export function BhThreshold() {
  const sliderId = useId();
  const [q, setQ] = useState(0.05);
  const data = useMemo(() => seededPValues(SEED, M, SIGNALS, EFFECT), []);
  const floorExp = Math.floor(Math.log10(data.p[0]));

  const x = (rank: number) => px(ML + ((rank - 0.5) / M) * PW);
  const y = (p: number) => px(MT + (-Math.log10(Math.max(p, 10 ** floorExp)) / -floorExp) * PH);

  const bh = bhReject(data.p, q);
  const bonf = bonferroniReject(data.p, q);
  const falseBh = bh.rejected.filter((r, i) => r && !data.signal[i]).length;
  const falseBonf = bonf.rejected.filter((r, i) => r && !data.signal[i]).length;

  const stair = Array.from({ length: M }, (_, i) => {
    const r = i + 1;
    const yy = y((r * q) / M).toFixed(2);
    return `${i === 0 ? "M" : "L"}${(x(r) - PW / M / 2).toFixed(2)} ${yy}H${(x(r) + PW / M / 2).toFixed(2)}`;
  }).join("");

  const ticks = Array.from({ length: -floorExp + 1 }, (_, i) => -i);

  return (
    <FigureCard
      eyebrow="In-browser simulation"
      title="Twenty tests, two rules."
      caption={
        <>
          Twenty one-sided z-tests from seed {SEED}: six with a real effect (z ~ N(3, 1)), fourteen
          true nulls. BH rejects the k smallest p-values, where k is the largest rank with
          p<sub>(k)</sub> ≤ k/m·q; it bounds the expected share of false discoveries (the FDR).
          Bonferroni rejects p ≤ q/m and bounds the chance of any false rejection (the FWER).
          Triangles mark the real effects, known here only because the data are simulated. Code:{" "}
          <SourceLink path="site/lib/explore/multiple-testing.ts" />.
        </>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full text-foreground"
        role="img"
        aria-label={`Sorted p-values on a log scale with the BH step line and the Bonferroni line at q = ${q.toFixed(2)}. BH rejects ${bh.count}, Bonferroni rejects ${bonf.count}.`}
      >
        {/* Grid and y axis (log scale). */}
        <g className="font-mono" fontSize="11" fill="var(--chart-5)">
          {ticks.map((e) => (
            <g key={e}>
              <line x1={ML} x2={W - MR} y1={y(10 ** e)} y2={y(10 ** e)} stroke="var(--chart-5)" strokeOpacity="0.28" strokeWidth="0.75" />
              <Pow10Label exp={e} x={ML - 8} y={y(10 ** e) + 4} />
            </g>
          ))}
          {[1, 5, 10, 15, 20].map((r) => (
            <text key={r} x={x(r)} y={MT + PH + 30} textAnchor="middle">
              {r}
            </text>
          ))}
          <text x={ML} y={H - 2} fontSize="11">
            rank i, p-values sorted ascending
          </text>
        </g>

        {/* Bonferroni q/m and the BH steps i/m·q. */}
        <line x1={ML} x2={W - MR} y1={y(q / M)} y2={y(q / M)} stroke="currentColor" strokeWidth="1.1" strokeDasharray="4 3" />
        <path d={stair} fill="none" stroke="var(--chart-2)" strokeWidth="1.5" strokeLinejoin="round" />

        {/* BH cut-off: the largest rank under its step. */}
        {bh.count > 0 && (
          <g>
            <line
              x1={x(bh.count) + PW / M / 2}
              x2={x(bh.count) + PW / M / 2}
              y1={MT}
              y2={MT + PH}
              stroke="var(--chart-2)"
              strokeOpacity="0.55"
              strokeWidth="0.75"
              strokeDasharray="2 3"
            />
            <text x={x(bh.count) + PW / M / 2 + 5} y={MT + 10} className="font-mono" fontSize="11" fill="var(--chart-2)">
              k = {bh.count}
            </text>
          </g>
        )}

        {/* True signals, below the axis. */}
        {data.signal.map((s, i) =>
          s ? (
            <path
              key={i}
              d={`M${x(i + 1)} ${MT + PH + 7}l3.5 6h-7z`}
              fill="var(--chart-3)"
            />
          ) : null,
        )}

        {/* Points. */}
        {data.p.map((p, i) => {
          const cx = x(i + 1);
          const cy = y(p);
          return (
            <g key={i}>
              {bonf.rejected[i] && <circle cx={cx} cy={cy} r="7.5" fill="none" stroke="currentColor" strokeWidth="1" />}
              <circle
                cx={cx}
                cy={cy}
                r="4"
                fill={bh.rejected[i] ? "var(--chart-2)" : "var(--card)"}
                stroke={bh.rejected[i] ? "var(--chart-2)" : "var(--chart-5)"}
                strokeWidth="1.25"
              />
            </g>
          );
        })}
      </svg>

      <Legend className="mt-3">
        <LegendItem>
          <Swatch color="var(--chart-2)" /> BH line i/m·q
        </LegendItem>
        <LegendItem>
          <Swatch color="currentColor" dashed /> Bonferroni q/m
        </LegendItem>
        <LegendItem>
          <Swatch color="var(--chart-2)" kind="dot" /> rejected by BH
        </LegendItem>
        <LegendItem>
          <Swatch color="currentColor" kind="ring" /> also by Bonferroni
        </LegendItem>
        <LegendItem>
          <svg aria-hidden="true" viewBox="0 0 10 10" className="size-2.5">
            <path d="M5 1l4.5 8h-9z" fill="var(--chart-3)" />
          </svg>
          real effect
        </LegendItem>
      </Legend>

      <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor={sliderId} className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Target level q</span>
            <span className="font-mono tabular-nums">q = {q.toFixed(2)}</span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={0.01}
            max={0.2}
            step={0.01}
            value={q}
            onChange={(e) => setQ(Number(e.target.value))}
            className="mt-2 w-full accent-brand"
          />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
            <span>0.01</span>
            <span>0.20</span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:min-w-[15rem]" aria-live="polite">
          <div>
            <dt className="text-xs text-muted-foreground">BH rejects</dt>
            <dd className="font-mono text-2xl tabular-nums text-brand">{bh.count}</dd>
            <dd className="font-mono text-[11px] text-muted-foreground">
              {falseBh} true null{falseBh === 1 ? "" : "s"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Bonferroni rejects</dt>
            <dd className="font-mono text-2xl tabular-nums">{bonf.count}</dd>
            <dd className="font-mono text-[11px] text-muted-foreground">
              {falseBonf} true null{falseBonf === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
      </div>
    </FigureCard>
  );
}
