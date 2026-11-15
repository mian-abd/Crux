import type { OptionView, QuestionView, RunState } from '../state/fold';
import { leaderId, questionLabel, visibleOptions } from '../state/selectors';
import { cls, pct } from '../lib/format';
import { familyColors } from '../lib/palette';
import { useTween } from '../lib/useTween';
import { BeliefHistory } from './BeliefHistory';
import { Empty, LiveDot, Panel } from './Panel';
import { DecisionTraces } from './DecisionTraces';

/** Sizes for the normal and the dense (three or more cards) layout. */
const SIZES = {
  roomy: {
    card: 'px-[1.3rem] pb-[1.15rem] pt-[0.95rem]',
    title: 'text-[1.55rem]',
    list: 'mt-[0.95rem] gap-[0.85rem]',
    statement: 'text-[1.2rem]',
    number: 'text-[1.95rem] w-[5.6rem]',
    bar: 'h-[1rem] mt-[0.4rem]',
    gap: 'gap-[0.85rem]',
  },
  normal: {
    card: 'px-[1.1rem] pb-[0.95rem] pt-[0.8rem]',
    title: 'text-[1.32rem]',
    list: 'mt-[0.7rem] gap-[0.6rem]',
    statement: 'text-[1.06rem]',
    number: 'text-[1.6rem] w-[4.8rem]',
    bar: 'h-[0.78rem] mt-[0.32rem]',
    gap: 'gap-[0.75rem]',
  },
  dense: {
    card: 'px-[1rem] pb-[0.7rem] pt-[0.6rem]',
    title: 'text-[1.16rem]',
    list: 'mt-[0.45rem] gap-[0.4rem]',
    statement: 'text-[0.98rem]',
    number: 'text-[1.38rem] w-[4.4rem]',
    bar: 'h-[0.62rem] mt-[0.22rem]',
    gap: 'gap-[0.55rem]',
  },
} as const;
type Density = keyof typeof SIZES;

function StatusBadge({ q, testing }: { q: QuestionView; testing: boolean }) {
  const base =
    'inline-flex items-center gap-[0.4rem] rounded-[0.35rem] px-[0.55rem] py-[0.15rem] text-[0.72rem] font-bold';
  switch (q.status) {
    case 'settled':
      return <span className={cls(base, 'bg-accent text-bg')}>Settled</span>;
    case 'robust':
      return <span className={cls(base, 'border border-accent/70 text-accent')}>Robust</span>;
    case 'unresolved':
      return <span className={cls(base, 'border border-line-strong text-dim')}>Unresolved</span>;
    default:
      return testing ? (
        <span className={cls(base, 'border border-accent/40 text-accent')}>
          <LiveDot /> Testing
        </span>
      ) : (
        <span className={cls(base, 'border border-line text-mute')}>Open</span>
      );
  }
}

function Tag({ children, tone }: { children: string; tone: 'warn' | 'mute' | 'bad' }) {
  const tones = {
    warn: 'border-warn/60 text-warn',
    mute: 'border-line-strong text-mute',
    bad: 'border-bad/50 text-bad/90',
  } as const;
  return (
    <span
      className={cls(
        'shrink-0 self-center rounded-[0.3rem] border px-[0.35rem] py-[0.02rem] text-[0.64rem] font-bold',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function OptionRow({
  o,
  q,
  leader,
  swatch,
  density,
}: {
  o: OptionView;
  q: QuestionView;
  leader: boolean;
  swatch: string | null;
  density: Density;
}) {
  const sz = SIZES[density];
  const rejected = o.status === 'rejected';
  const settled = q.status === 'settled' && q.settled?.hypothesisId === o.id;
  const shown = useTween(o.posterior);
  const width = `${Math.max(0, Math.min(1, o.posterior)) * 100}%`;
  const delta =
    o.prevPosterior !== null && o.updateSeq !== null ? (o.posterior - o.prevPosterior) * 100 : 0;
  const showDelta = Math.abs(delta) >= 0.5 && o.updateSeq !== null;
  const strong = leader && !rejected;

  let fill = 'bg-neutral';
  if (rejected) fill = 'bg-[#d9d4cc]';
  else if (o.isNull) fill = 'null-fill';
  else if (leader) fill = 'bg-accent';

  // Rejected options show their reason in the hover card below instead.
  const tip = rejected
    ? undefined
    : [o.rationale, o.author ? `proposed by ${o.author}` : ''].filter(Boolean).join(' · ');

  return (
    <li className={cls('group relative', rejected && 'opacity-50')} title={tip}>
      <div className="flex min-w-0 items-baseline gap-[0.6rem]">
        {swatch && (
          <span
            className="h-[0.7rem] w-[0.7rem] shrink-0 self-center rounded-[0.18rem]"
            style={{ background: swatch, opacity: rejected ? 0.4 : 1 }}
          />
        )}
        <span
          className={cls(
            'min-w-0 flex-1 truncate leading-snug',
            sz.statement,
            o.isNull ? 'italic text-dim' : strong ? 'font-medium text-fg' : 'text-dim',
            rejected && 'line-through decoration-mute decoration-2',
          )}
        >
          {o.statement}
        </span>
        {o.regenerated && <Tag tone="warn">New</Tag>}
        {o.mergedFrom.length > 0 && <Tag tone="mute">{`+${o.mergedFrom.length} merged`}</Tag>}
        {rejected && <Tag tone="bad">Rejected</Tag>}
        {showDelta && (
          <span
            key={o.updateSeq}
            className={cls(
              'tabular shrink-0 text-[0.85rem] font-semibold animate-delta',
              delta > 0 ? 'text-accent' : 'text-bad',
            )}
          >
            {delta > 0 ? '+' : '−'}
            {Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}
          </span>
        )}
        <span
          className={cls(
            'tabular shrink-0 text-right font-bold leading-none',
            sz.number,
            settled ? 'text-accent' : strong ? 'text-fg' : 'text-dim',
          )}
        >
          {pct(shown)}
        </span>
      </div>
      <div
        className={cls(
          'overflow-hidden rounded-full',
          sz.bar,
          o.isNull ? 'border border-dashed border-line-strong bg-transparent' : 'bg-track',
        )}
      >
        <div
          key={settled ? 'settled' : 'plain'}
          className={cls('bar-fill h-full rounded-full', fill, settled && 'animate-glow-in')}
          style={{ width }}
        />
      </div>
      {rejected && o.rejectedReason && (
        <div className="pointer-events-none absolute left-0 right-0 top-full z-20 mt-[0.3rem] hidden rounded-md border border-line-strong bg-raised p-[0.6rem] text-[0.85rem] text-fg shadow-xl group-hover:block">
          {o.rejectedReason}
        </div>
      )}
    </li>
  );
}

function QuestionCard({
  q,
  label,
  state,
  density,
}: {
  q: QuestionView;
  label: string;
  state: RunState;
  density: Density;
}) {
  const sz = SIZES[density];
  const options = visibleOptions(q);
  const leader = q.status === 'unresolved' ? null : leaderId(q);
  const ranking = state.rankings[q.id];
  const testing = ranking?.phase === 'running' || ranking?.phase === 'chosen';
  const surprise = q.surprise;
  const live = surprise !== null && !surprise.resolved;
  const swatches =
    q.kind === 'model' || state.curves[q.id]
      ? familyColors(q.optionOrder, (id) => q.options[id]?.isNull ?? false)
      : null;

  return (
    <article
      className={cls(
        'relative isolate shrink-0 hover:z-30 rounded-[0.8rem] border transition-colors duration-700',
        sz.card,
        live
          ? 'border-warn/70 bg-warn/[0.04]'
          : q.status === 'settled'
            ? 'border-accent/35 bg-raised'
            : 'border-line bg-raised/70',
      )}
    >
      {live && (
        <div key={surprise.seq} className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] animate-flash" />
      )}
      <div className="flex items-center gap-[0.6rem] text-[0.8rem] text-mute">
        <span className="font-mono text-[0.85rem] font-bold text-dim">{label}</span>
        {q.raisedBy && (
          <span>
            raised by <span className="text-dim">{q.raisedBy}</span>
          </span>
        )}
        {q.updates > 0 && (
          <span>
            · {q.updates} update{q.updates === 1 ? '' : 's'}
          </span>
        )}
        <span className="ml-auto">
          <StatusBadge q={q} testing={testing && q.status === 'open'} />
        </span>
      </div>
      <h3 className={cls('mt-[0.25rem] font-semibold leading-snug text-fg', sz.title)}>{q.text}</h3>
      <DecisionTraces traces={state.decisionTraces[q.id]} />

      {surprise && live && (
        <div className="mt-[0.55rem] flex gap-[0.6rem] rounded-[0.5rem] border border-warn/45 bg-warn/10 px-[0.75rem] py-[0.5rem] text-[0.92rem] leading-snug animate-fade-up">
          <span className="shrink-0 pt-[0.1rem] text-[0.7rem] font-bold text-warn">
            Surprise
          </span>
          <span className="text-fg/90">
            {surprise.reason}
            {surprise.nullMass !== null && (
              <span className="text-warn"> · none-of-these {pct(surprise.nullMass)}</span>
            )}
          </span>
        </div>
      )}
      {surprise && surprise.resolved && (
        <div className="mt-[0.3rem] line-clamp-2 text-[0.84rem] leading-snug text-mute">
          <span className="font-semibold text-warn/80">Surprise resolved</span> · {surprise.reason}
        </div>
      )}
      {q.status === 'robust' && q.robust && (
        <div className="mt-[0.2rem] truncate text-[0.86rem] text-dim">
          Every remaining option gives the same deliverable
          {q.robust.answerKey && <span className="font-mono text-mute"> · {q.robust.answerKey}</span>}
        </div>
      )}
      {q.status === 'unresolved' && q.unresolved && (
        <div className="mt-[0.2rem] line-clamp-2 text-[0.86rem] leading-snug text-dim">{q.unresolved.reason}</div>
      )}

      <ul className={cls('flex flex-col', sz.list)}>
        {options.map((o) => (
          <OptionRow
            key={o.id}
            o={o}
            q={q}
            leader={o.id === leader}
            swatch={swatches?.[o.id] ?? null}
            density={density}
          />
        ))}
        {options.length === 0 && <li className="text-[0.95rem] text-mute">Waiting for proposals…</li>}
      </ul>
    </article>
  );
}

/** `maxDensity` caps the roominess for layouts with less height (One Letter); unset, nothing changes. */
export function QuestionsPanel({ state, maxDensity }: { state: RunState; maxDensity?: 'normal' | 'dense' }) {
  const qs = state.questionOrder
    .map((id) => state.questions[id])
    .filter((q): q is QuestionView => q !== undefined);
  const optionCount = qs.reduce((n, q) => n + visibleOptions(q).length, 0);
  const auto: Density =
    qs.length >= 3 || optionCount > 8 ? 'dense' : qs.length === 1 && optionCount <= 7 ? 'roomy' : 'normal';
  const density: Density =
    maxDensity === 'dense' || (maxDensity === 'normal' && auto === 'roomy') ? maxDensity : auto;
  const single = qs.length === 1 ? qs[0] : undefined;
  // The orchestrator writes `settle_threshold`; the One Letter lab writes `settle`.
  const threshold =
    typeof state.config.settle_threshold === 'number'
      ? state.config.settle_threshold
      : typeof state.config.settle === 'number'
        ? state.config.settle
        : 0.9;
  const counts = {
    open: qs.filter((q) => q.status === 'open').length,
    settled: qs.filter((q) => q.status === 'settled').length,
    robust: qs.filter((q) => q.status === 'robust').length,
    unresolved: qs.filter((q) => q.status === 'unresolved').length,
  };
  const meta = qs.length
    ? [
        counts.open && `${counts.open} open`,
        counts.settled && `${counts.settled} settled`,
        counts.robust && `${counts.robust} robust`,
        counts.unresolved && `${counts.unresolved} unresolved`,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <Panel
      title="Questions · posterior belief"
      meta={meta}
      bodyClassName={cls('flex flex-col', SIZES[density].gap)}
    >
      {qs.length === 0 ? (
        <Empty>
          {state.status === 'idle'
            ? 'No run yet.'
            : 'Profiling the data. Questions appear when the agents disagree.'}
        </Empty>
      ) : (
        qs.map((q) => (
          <QuestionCard
            key={q.id}
            q={q}
            label={questionLabel(state, q.id)}
            state={state}
            density={density}
          />
        ))
      )}
      {single && <BeliefHistory q={single} threshold={threshold} />}
    </Panel>
  );
}
