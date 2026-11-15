// How far the swarm came on the clean case, batch by batch, against a single gpt-5.5 agent.
// Every value is from the README's progression table (eval/results/task9_runs.md,
// task9_batch01.md to task9_batch05.md). Pure SVG, so it renders on the server.

import { cn } from "@/lib/utils";

type Stage = {
  label: string;
  sub: string;
  swarm: number;
  single?: number;
  /** The pre-registered value when a crash pulled the mean down (batch-03). */
  preRegistered?: number;
  /** What changed before this stage, from the previous stage's own logs. */
  change?: string;
};

export const STAGES: Stage[] = [
  { label: "Run 1", sub: "Nov 14", swarm: 0.586 },
  { label: "Batch-01", sub: "3 runs", swarm: 0.628 },
  { label: "DU-22", sub: "paired", swarm: 0.727, single: 0.862, change: "Gene symbol map" },
  { label: "Batch-02", sub: "3 runs each", swarm: 0.833, single: 0.868, change: "One fit per cell line" },
  { label: "Batch-03", sub: "3 runs each", swarm: 0.862, single: 0.86, preRegistered: 0.576, change: "Untested questions keep defaults" },
  { label: "Batches 04–05", sub: "4 clean runs", swarm: 0.864, single: 0.868, change: "Merge-plan fix" },
];

const W = 760;
const H = 330;
const PAD = { left: 52, right: 56, top: 26, bottom: 64 };
const Y_MIN = 0.5;
const Y_MAX = 0.9;

function x(i: number) {
  return PAD.left + (i * (W - PAD.left - PAD.right)) / (STAGES.length - 1);
}
function labelBelow(s: Stage) {
  return s.single !== undefined && s.single - s.swarm > 0.02 && s.single - s.swarm < 0.08;
}
function y(v: number) {
  return PAD.top + ((Y_MAX - v) * (H - PAD.top - PAD.bottom)) / (Y_MAX - Y_MIN);
}

export function GrowthChart({ tone = "light", className }: { tone?: "light" | "ink"; className?: string }) {
  const ink = tone === "ink";
  const text = ink ? "var(--ink-foreground)" : "var(--foreground)";
  const muted = ink ? "color-mix(in oklch, var(--ink-foreground) 55%, transparent)" : "var(--muted-foreground)";
  const grid = ink ? "color-mix(in oklch, var(--ink-foreground) 12%, transparent)" : "var(--border)";
  const swarmColor = ink ? "var(--brand-soft)" : "var(--brand)";
  const singleColor = ink ? "color-mix(in oklch, var(--ink-foreground) 45%, transparent)" : "var(--subtle)";
  const swarmPath = STAGES.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.swarm).toFixed(1)}`).join(" ");
  const single = STAGES.map((s, i) => ({ i, v: s.single })).filter((p): p is { i: number; v: number } => p.v !== undefined);
  const singlePath = single.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Clean-case score by batch. The swarm rose from 0.586 on run 1 to 0.864 on batches 04 and 05; the single agent stayed near 0.86 to 0.87."
      >
        {[0.5, 0.6, 0.7, 0.8, 0.9].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={grid} strokeWidth={1} />
            <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end" fontSize={12} fill={muted} className="tabular-nums">
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Single agent, where it was run on the clean case */}
        <path d={singlePath} fill="none" stroke={singleColor} strokeWidth={2} strokeDasharray="5 5" />
        {single.map((p) => (
          <circle key={`s${p.i}`} cx={x(p.i)} cy={y(p.v)} r={4.5} fill={singleColor} />
        ))}

        {/* The swarm */}
        <path d={swarmPath} fill="none" stroke={swarmColor} strokeWidth={3} strokeLinejoin="round" />
        {STAGES.map((s, i) => (
          <g key={s.label}>
            {s.preRegistered !== undefined && (
              <>
                <line x1={x(i)} x2={x(i)} y1={y(s.swarm) + 7} y2={y(s.preRegistered) - 6} stroke={swarmColor} strokeWidth={1} strokeDasharray="2 3" />
                <circle cx={x(i)} cy={y(s.preRegistered)} r={5} fill="none" stroke={swarmColor} strokeWidth={1.5} />
                <text x={x(i) + 9} y={y(s.preRegistered) + 4} fontSize={11} fill={muted}>
                  {s.preRegistered.toFixed(3)} pre-registered (one crash)
                </text>
              </>
            )}
            <circle cx={x(i)} cy={y(s.swarm)} r={6} fill={swarmColor} />
            <text
              // Below and to the right when the single agent's dashed line runs just above the point.
              x={labelBelow(s) ? x(i) + 10 : x(i)}
              y={labelBelow(s) ? y(s.swarm) + 22 : y(s.swarm) - 13}
              textAnchor={labelBelow(s) ? "start" : "middle"}
              fontSize={14}
              fontWeight={600}
              fill={text}
              className="tabular-nums"
            >
              {s.swarm.toFixed(3)}
            </text>
            <text x={x(i)} y={H - PAD.bottom + 24} textAnchor="middle" fontSize={13} fill={text}>
              {s.label}
            </text>
            <text x={x(i)} y={H - PAD.bottom + 42} textAnchor="middle" fontSize={11} fill={muted}>
              {s.sub}
            </text>
          </g>
        ))}

        {/* Legend */}
        <g transform={`translate(${PAD.left + 8}, ${PAD.top + 4})`}>
          <line x1={0} x2={22} y1={0} y2={0} stroke={swarmColor} strokeWidth={3} />
          <text x={30} y={4} fontSize={12} fill={text}>
            Crux swarm
          </text>
          <line x1={120} x2={142} y1={0} y2={0} stroke={singleColor} strokeWidth={2} strokeDasharray="5 5" />
          <text x={150} y={4} fontSize={12} fill={muted}>
            Single gpt-5.5 agent
          </text>
        </g>
      </svg>
      <figcaption className={cn("mt-2 text-xs leading-relaxed", ink ? "text-ink-foreground/55" : "text-muted-foreground")}>
        Clean-case score (Edison&apos;s grader, BixBench3 task 9 from counts). Each step followed a fix made from the
        swarm&apos;s own logs, and inputs and the prompt changed along the way, so this is not a learning curve.
      </figcaption>
    </figure>
  );
}
