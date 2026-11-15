import { useMemo } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CurvesView, QuestionView, RunState } from '../state/fold';
import { nextDesign, parseDesignX, questionLabel } from '../state/selectors';
import { cls, pct, value } from '../lib/format';
import { ACCENT, familyColors } from '../lib/palette';
import { useRootPx } from '../lib/useRootPx';
import { Empty, Panel } from './Panel';

const GRID = '#e9e6e0';
const AXIS = '#d0cbc3';
const MUTE = '#77736c';
const INK = '#1b1916';
const SURFACE = '#fefdfc';

function shortName(statement: string): string {
  const i = statement.indexOf(':');
  return i > 0 ? statement.slice(0, i) : statement;
}

interface Fam {
  id: string;
  key: number;
  color: string;
  weight: number;
  isNull: boolean;
  rejected: boolean;
  name: string;
}

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  const step = span > 200 ? 64 : span > 100 ? 50 : span > 40 ? 20 : span > 10 ? 5 : 1;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

function PointShape(props: { cx?: number; cy?: number; payload?: { latest?: boolean } }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return <g />;
  const latest = payload?.latest;
  return (
    <g>
      <circle cx={cx} cy={cy} r={latest ? 7 : 5} fill={INK} stroke={SURFACE} strokeWidth={2} />
      {latest && <circle cx={cx} cy={cy} r={11} fill="none" stroke={ACCENT} strokeWidth={2} />}
    </g>
  );
}

function Chart({
  curves,
  q,
  state,
}: {
  curves: CurvesView;
  q: QuestionView;
  state: RunState;
}) {
  const px = useRootPx();
  const font = Math.round(px * 0.78);
  const colors = familyColors(q.optionOrder, (id) => q.options[id]?.isNull ?? false);

  const fams: Fam[] = useMemo(() => {
    const ids = [
      ...q.optionOrder.filter((id) => curves.families[id]),
      ...Object.keys(curves.families).filter((id) => !q.optionOrder.includes(id)),
    ];
    return ids.map((id, key) => {
      const o = q.options[id];
      return {
        id,
        key,
        color: colors[id] ?? '#8e897f',
        weight: curves.families[id]?.weight ?? 0,
        isNull: o?.isNull ?? id === 'h0',
        rejected: o?.status === 'rejected',
        name: o ? shortName(o.statement) : id,
      };
    });
  }, [curves, q, colors]);

  const rows = useMemo(
    () =>
      curves.x.map((x, i) => {
        const row: Record<string, number | [number, number]> = { x };
        for (const f of fams) {
          const fam = curves.families[f.id];
          const m = fam?.mean[i];
          const s = fam?.sd[i] ?? 0;
          if (m === undefined || !Number.isFinite(m)) continue;
          row[`m${f.key}`] = m;
          row[`b${f.key}`] = [m - s, m + s];
        }
        return row;
      }),
    [curves, fams],
  );

  const points = curves.points.map((p, i) => ({ ...p, latest: i === curves.points.length - 1 }));

  // Axis ranges from the data that matters (the broad null family is ignored).
  const xs = curves.x.filter(Number.isFinite);
  const xMin = Math.min(...xs, ...points.map((p) => p.x));
  const xMax = Math.max(...xs, ...points.map((p) => p.x));
  const ys: number[] = points.map((p) => p.y);
  for (const f of fams) {
    if (f.isNull) continue;
    const fam = curves.families[f.id];
    fam?.mean.forEach((m, i) => {
      if (Number.isFinite(m)) ys.push(m + (f.weight > 0.05 ? (fam.sd[i] ?? 0) : 0));
    });
  }
  const yHi = Math.max(...ys, 1);
  const yLo = Math.min(0, ...ys);
  const yStep = niceStep((yHi - yLo) / 4);
  const yDomain: [number, number] = [
    Math.floor(yLo / yStep) * yStep,
    Math.ceil((yHi + (yHi - yLo) * 0.04) / yStep) * yStep,
  ];
  const yTicks: number[] = [];
  for (let v = yDomain[0]; v <= yDomain[1] + 1e-9; v += yStep) yTicks.push(Math.round(v * 1000) / 1000);
  const xTicks = niceTicks(xMin, xMax);
  if (xTicks[xTicks.length - 1] !== xMax && xMax - (xTicks[xTicks.length - 1] ?? 0) > (xMax - xMin) * 0.04) {
    xTicks.push(xMax);
  }

  const next = nextDesign(state, q.id);
  const ranking = state.rankings[q.id];
  const acquisition = (ranking?.rows ?? [])
    .map((r) => ({ x: parseDesignX(r.experiment_id), eig: r.eig_bits, id: r.experiment_id }))
    .filter((r): r is { x: number; eig: number; id: string } => r.x !== null)
    .sort((a, b) => a.x - b.x);
  const chosenId = ranking?.chosen ?? null;
  const margin = { top: Math.round(px * 1.4), right: Math.round(px * 1.2), bottom: 0, left: 0 };
  const yWidth = Math.round(px * 2.6);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className="mb-[0.4rem] flex flex-wrap gap-x-[1.1rem] gap-y-[0.25rem] text-[0.84rem]">
        {fams.map((f) => (
          <li key={f.id} className={cls('flex items-center gap-[0.4rem]', f.rejected && 'opacity-45')}>
            <svg width={px * 1.3} height={px * 0.6} aria-hidden>
              <line
                x1={0}
                x2={px * 1.3}
                y1={px * 0.3}
                y2={px * 0.3}
                stroke={f.color}
                strokeWidth={3}
                strokeDasharray={f.isNull ? '4 3' : undefined}
                strokeLinecap="round"
              />
            </svg>
            <span className={cls('text-dim', f.rejected && 'line-through')}>{f.name}</span>
            <span className="tabular font-semibold text-fg">{pct(f.weight)}</span>
          </li>
        ))}
      </ul>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={margin}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[xMin, xMax]}
              ticks={xTicks}
              stroke={AXIS}
              tick={{ fill: MUTE, fontSize: font }}
              tickLine={false}
              allowDataOverflow
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
              stroke={AXIS}
              tick={{ fill: MUTE, fontSize: font }}
              tickLine={false}
              width={yWidth}
              allowDataOverflow
            />
            {fams
              .filter((f) => !f.isNull)
              .map((f) => (
                <Area
                  key={`b${f.id}`}
                  dataKey={`b${f.key}`}
                  stroke="none"
                  fill={f.color}
                  fillOpacity={0.04 + 0.2 * f.weight}
                  isAnimationActive={false}
                  activeDot={false}
                />
              ))}
            {fams.map((f) => (
              <Line
                key={`m${f.id}`}
                dataKey={`m${f.key}`}
                stroke={f.color}
                strokeWidth={f.isNull ? 1.5 : 1.25 + 5 * f.weight}
                strokeOpacity={f.rejected ? 0.35 : f.isNull ? 0.7 : 0.55 + 0.45 * Math.sqrt(f.weight)}
                strokeDasharray={f.isNull ? '6 5' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            <Scatter data={points} dataKey="y" shape={<PointShape />} isAnimationActive={false} />
            {next && (
              <ReferenceLine
                x={next.x}
                stroke={ACCENT}
                strokeWidth={2}
                strokeDasharray="5 5"
                label={{ value: `next: ${next.label}`, position: 'top', fill: ACCENT, fontSize: font, fontWeight: 600 }}
              />
            )}
            <Tooltip
              cursor={{ stroke: AXIS }}
              contentStyle={{ background: '#fefdfc', border: `1px solid ${AXIS}`, borderRadius: 8, fontSize: font }}
              labelStyle={{ color: INK }}
              itemStyle={{ color: INK }}
              labelFormatter={(x) => `x = ${String(x)}`}
              formatter={(v, name) => {
                const key = String(name);
                if (!key.startsWith('m')) return [null, null];
                const f = fams.find((ff) => `m${ff.key}` === key);
                return [typeof v === 'number' ? value(v) : String(v), f?.name ?? key];
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {acquisition.length > 1 && (
        <div className="mt-[0.2rem]">
          <div className="flex items-baseline justify-between text-[0.7rem] text-mute">
            <span>Expected information gain per candidate design</span>
            {ranking && <span className="normal-case tracking-normal">round {ranking.round}</span>}
          </div>
          <div style={{ height: px * 3.2 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acquisition} margin={{ top: 4, right: margin.right, bottom: 0, left: yWidth }}>
                <XAxis dataKey="x" type="number" domain={[xMin, xMax]} hide allowDataOverflow />
                <YAxis hide domain={[0, 'dataMax']} />
                <Bar dataKey="eig" barSize={Math.max(4, Math.round(px * 0.55))} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {acquisition.map((a) => (
                    <Cell key={a.id} fill={a.id === chosenId ? ACCENT : '#d0cbc3'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export function CurvesPanel({ state, questionId }: { state: RunState; questionId: string }) {
  const curves = state.curves[questionId];
  const q = state.questions[questionId];
  if (!curves || !q) {
    return (
      <Panel title="Model curves">
        <Empty>Waiting for the first measurement.</Empty>
      </Panel>
    );
  }
  const next = nextDesign(state, questionId);
  const r = state.rankings[questionId];
  const observedNow = r?.phase === 'done' && r.observed !== null ? r.observed : null;
  return (
    <Panel
      title="Model curves · measured points"
      meta={
        <span>
          <span className="font-mono font-bold text-dim">{questionLabel(state, questionId)}</span> ·{' '}
          {curves.points.length} measurement{curves.points.length === 1 ? '' : 's'}
          {next ? (
            <span className="text-accent"> · next {next.label}</span>
          ) : observedNow !== null ? (
            <span> · last {value(observedNow)}</span>
          ) : null}
        </span>
      }
    >
      <Chart curves={curves} q={q} state={state} />
    </Panel>
  );
}
