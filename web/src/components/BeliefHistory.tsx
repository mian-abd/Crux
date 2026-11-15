import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { QuestionView } from '../state/fold';
import { leaderId, visibleOptions } from '../state/selectors';
import { ACCENT, familyColors } from '../lib/palette';
import { useRootPx } from '../lib/useRootPx';

const GRID = '#1f2730';
const AXIS = '#2e3843';
const MUTE = '#707b88';
const WARN = '#f5b83d';

/** Posterior of every option across belief updates (x = update number). */
export function BeliefHistory({ q, threshold }: { q: QuestionView; threshold: number }) {
  const px = useRootPx();
  const font = Math.round(px * 0.74);
  const options = visibleOptions(q);
  const colors = familyColors(q.optionOrder, (id) => q.options[id]?.isNull ?? false);
  const leader = leaderId(q);

  const rows = useMemo(() => {
    const n = q.updates + 1;
    const out: Record<string, number | null>[] = [];
    for (let i = 0; i < n; i++) {
      const row: Record<string, number | null> = { i };
      options.forEach((o, k) => {
        const j = i - o.historyStart;
        const v = j >= 0 ? o.history[j] : undefined;
        row[`o${k}`] = v === undefined ? null : v;
      });
      out.push(row);
    }
    return out;
  }, [q, options]);

  if (q.updates < 1) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-[0.8rem] border border-line bg-raised/40 px-[1rem] pb-[0.5rem] pt-[0.7rem]">
      <div className="flex items-baseline justify-between text-[0.7rem] font-semibold text-mute">
        <span>Belief after each measurement</span>
        <span className="normal-case tracking-normal">settles at {Math.round(threshold * 100)}%</span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: Math.round(px * 0.8), right: Math.round(px * 0.8), bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="i"
              type="number"
              domain={[0, Math.max(1, q.updates)]}
              allowDecimals={false}
              stroke={AXIS}
              tick={{ fill: MUTE, fontSize: font }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.5, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              stroke={AXIS}
              tick={{ fill: MUTE, fontSize: font }}
              tickLine={false}
              width={Math.round(px * 2.6)}
            />
            <ReferenceLine y={threshold} stroke={ACCENT} strokeOpacity={0.5} strokeDasharray="4 4" />
            {q.surprise && (
              <ReferenceLine
                x={q.surprise.atUpdate}
                stroke={WARN}
                strokeWidth={2}
                label={{ value: 'surprise', position: 'insideTopRight', fill: WARN, fontSize: font, fontWeight: 600 }}
              />
            )}
            {options.map((o, k) => (
              <Line
                key={o.id}
                dataKey={`o${k}`}
                stroke={colors[o.id]}
                strokeWidth={o.id === leader ? 3.5 : 2}
                strokeOpacity={o.status === 'rejected' ? 0.35 : 1}
                strokeDasharray={o.isNull ? '5 4' : undefined}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
