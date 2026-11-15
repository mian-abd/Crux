import type { RankingView, RunState } from '../state/fold';
import { binDescription, focusQuestionId, questionLabel } from '../state/selectors';
import type { RankingRow } from '../types';
import { bits, cls, compact, usd, value } from '../lib/format';
import { Empty, KindTag, LiveDot, Panel } from './Panel';
import { DecisionTraces } from './DecisionTraces';

function Meter({
  label,
  text,
  frac,
  on,
}: {
  label: string;
  text: string;
  frac: number;
  on: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[0.74rem]">
        <span className=" text-mute">{label}</span>
        <span className={cls('tabular font-semibold', on ? 'text-fg' : 'text-dim')}>{text}</span>
      </div>
      <div className="mt-[0.25rem] h-[0.42rem] overflow-hidden rounded-full bg-track">
        <div
          className={cls('bar-fill h-full rounded-full', on ? 'bg-accent' : 'bg-neutral')}
          style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function PhaseChip({ r }: { r: RankingView }) {
  const base =
    'inline-flex shrink-0 items-center gap-[0.35rem] rounded-[0.3rem] px-[0.45rem] py-[0.1rem] text-[0.68rem] font-bold';
  switch (r.phase) {
    case 'running':
      return (
        <span className={cls(base, 'border border-accent/60 text-accent')}>
          <LiveDot /> Running
        </span>
      );
    case 'done':
      return <span className={cls(base, 'bg-accent text-bg')}>Done</span>;
    case 'invalid':
      return <span className={cls(base, 'bg-bad text-bg')}>Invalid</span>;
    case 'aborted':
      return <span className={cls(base, 'border border-bad/60 text-bad')}>Aborted</span>;
    default:
      return <span className={cls(base, 'border border-accent/60 text-accent')}>Chosen</span>;
  }
}

function Verdict({ valid }: { valid: boolean }) {
  return (
    <span className={cls('ml-auto shrink-0 text-[0.8rem]', valid ? 'text-dim' : 'text-bad')}>
      referee {valid ? '✓ valid' : '✕ invalid'}
    </span>
  );
}

const bitsPerDollar = (row: RankingRow): number | null =>
  row.est_cost_usd > 0 ? row.eig_bits / row.est_cost_usd : null;

function Row({
  row,
  r,
  maxEig,
  maxBpd,
  state,
  rank,
}: {
  row: RankingRow;
  r: RankingView;
  maxEig: number;
  maxBpd: number;
  state: RunState;
  rank: number;
}) {
  const chosen = row.experiment_id === r.chosen;
  const bpd = bitsPerDollar(row);
  const observed = chosen && r.observed !== null ? r.observed : null;
  const bins = chosen ? (state.experiments[r.runningId ?? r.chosen]?.bins ?? []) : [];
  const desc =
    typeof observed === 'string' ? binDescription(state, r.runningId ?? r.chosen, observed) : null;
  return (
    <li
      className={cls(
        'rounded-[0.6rem] border px-[0.8rem] py-[0.6rem] transition-colors duration-500',
        chosen ? 'border-accent/55 bg-accent/[0.06]' : 'border-line',
      )}
    >
      <div className="flex min-w-0 items-start gap-[0.55rem]">
        <span className="tabular w-[1.1rem] shrink-0 pt-[0.05rem] text-[0.85rem] font-bold text-mute">{rank}</span>
        <KindTag kind={row.kind} />
        <p
          className={cls(
            'line-clamp-2 min-w-0 flex-1 text-[0.95rem] leading-snug',
            chosen ? 'text-fg' : 'text-dim',
          )}
          title={row.goal}
        >
          {row.goal || row.experiment_id}
        </p>
        {chosen && <PhaseChip r={r} />}
      </div>
      <DecisionTraces traces={state.decisionTraces[row.experiment_id] ?? state.decisionTraces[r.questionId]} />
      <div className="mt-[0.45rem] grid grid-cols-[1fr_1fr_auto] items-end gap-x-[1rem] pl-[1.65rem]">
        <Meter label="Info gain" text={`${bits(row.eig_bits)} bits`} frac={maxEig > 0 ? row.eig_bits / maxEig : 0} on={chosen} />
        <Meter
          label="Bits / $"
          text={bpd === null ? 'no $ cost' : compact(bpd)}
          frac={bpd === null ? 0 : maxBpd > 0 ? bpd / maxBpd : 0}
          on={chosen}
        />
        <span className="tabular whitespace-nowrap pb-[0.05rem] text-right text-[0.78rem] text-mute">
          {usd(row.est_cost_usd)} · {Math.round(row.est_cost_s)} s
        </span>
      </div>
      {chosen && bins.length > 0 && (
        // Possible outcomes, binned by code from the result line; the observed one lights up.
        <div className="mt-[0.5rem] flex min-w-0 flex-wrap items-center gap-[0.35rem] pl-[1.65rem]">
          <span
            className={cls(
              'mr-[0.15rem] text-[0.66rem] font-bold',
              observed !== null ? 'text-accent' : 'text-mute',
            )}
          >
            {observed !== null ? 'Observed' : 'Outcomes'}
          </span>
          {bins.map((b) => {
            const hit = observed === b.id;
            return (
              <span
                key={b.id}
                title={b.rule}
                className={cls(
                  'rounded-[0.35rem] border px-[0.45rem] py-[0.1rem] text-[0.8rem] leading-snug transition-all duration-500',
                  hit
                    ? 'border-accent/80 bg-accent/15 font-medium text-fg'
                    : observed !== null
                      ? 'border-line text-mute opacity-60'
                      : 'border-line-strong text-dim',
                )}
              >
                {hit && <span className="mr-[0.25rem] text-accent">✓</span>}
                {b.description}
              </span>
            );
          })}
          {r.verdict && <Verdict valid={r.verdict.valid} />}
        </div>
      )}
      {chosen && bins.length === 0 && observed !== null && (
        <div className="mt-[0.5rem] flex min-w-0 items-baseline gap-[0.5rem] pl-[1.65rem] text-[0.9rem] animate-fade-up">
          <span className="shrink-0 text-[0.66rem] font-bold text-accent">Observed</span>
          <span className="min-w-0 truncate text-fg">{desc ?? value(observed)}</span>
          {r.verdict && <Verdict valid={r.verdict.valid} />}
        </div>
      )}
    </li>
  );
}

export function RankingPanel({ state }: { state: RunState }) {
  const qid = focusQuestionId(state);
  const r = qid ? state.rankings[qid] : undefined;
  const q = qid ? state.questions[qid] : undefined;
  const done = state.completed.filter((c) => c.valid !== false).slice(-4).reverse();

  if (!r || !q) {
    return (
      <Panel title="Experiment ranking">
        <Empty>
          {Object.keys(state.experiments).length
            ? 'Scoring the proposed checks…'
            : 'Checks are ranked by expected information gain per dollar.'}
        </Empty>
      </Panel>
    );
  }

  const rows = r.rows.slice(0, 4);
  const maxEig = Math.max(...r.rows.map((x) => x.eig_bits), 0.0001);
  const maxBpd = Math.max(...r.rows.map((x) => bitsPerDollar(x) ?? 0), 0);

  return (
    <Panel
      title="Experiment ranking"
      meta={
        <span>
          <span className="font-mono font-bold text-dim">{questionLabel(state, q.id)}</span> · round {r.round}
        </span>
      }
      bodyClassName="flex flex-col"
    >
      <p className="mb-[0.6rem] truncate text-[0.92rem] text-dim" title={q.text}>
        {q.text}
      </p>
      <ol className="flex flex-col gap-[0.5rem]">
        {rows.map((row, i) => (
          <Row key={row.experiment_id} row={row} r={r} maxEig={maxEig} maxBpd={maxBpd} state={state} rank={i + 1} />
        ))}
      </ol>
      {done.length > 0 && (
        <div className="mt-auto pt-[0.7rem]">
          <div className="mb-[0.3rem] text-[0.68rem] font-semibold text-mute">
            Checks run
          </div>
          <ul className="flex flex-wrap gap-x-[1rem] gap-y-[0.2rem] font-mono text-[0.78rem] text-dim">
            {done.map((c) => (
              <li key={`${c.experimentId}-${c.seq}`} className="whitespace-nowrap">
                <span className="text-accent">✓</span> {c.experimentId}
                {c.observed !== null && <span className="text-mute"> → {value(c.observed)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
