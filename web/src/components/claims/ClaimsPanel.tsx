// One card per claim: the claim, its kind and verdict, the options with live
// posterior bars, the diagnostic that decided it and the options it ruled out.
// Rendered from RunState through the claims selectors only.

import type { OptionView, RunState } from '../../state/fold';
import { optionLabel, optionTone, type ClaimEvidence, type ClaimRow } from '../../state/claims';
import { cls, pct } from '../../lib/format';
import { useTween } from '../../lib/useTween';
import { Empty, LiveDot, Panel } from '../Panel';
import { KindBadge, Label, PlantedBadge, TONE, VerdictChip } from './bits';

const SIZES = {
  normal: {
    claim: 'text-[1.1rem]',
    rules: 2,
    option: 'text-[0.92rem]',
    body: 'text-[0.88rem]',
    pad: 'px-[0.95rem] py-[0.65rem]',
    clamp: 'line-clamp-2',
  },
  dense: {
    claim: 'text-[1rem]',
    rules: 1,
    option: 'text-[0.84rem]',
    body: 'text-[0.8rem]',
    pad: 'px-[0.85rem] py-[0.5rem]',
    clamp: 'line-clamp-1',
  },
} as const;
type Density = keyof typeof SIZES;

/** 0.083456 -> "0.0835", 0.00001 -> "1.0e-5", 547.93 -> "547.9", 2000 -> "2000". */
export function fmtNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && a < 0.001) return v.toExponential(1);
  if (a >= 100) return v.toFixed(1);
  return String(Number(v.toPrecision(3)));
}

function OptionPill({ o, accepted, size }: { o: OptionView; accepted: boolean; size: Density }) {
  const tone = TONE[optionTone(o)];
  const rejected = o.status === 'rejected';
  const shown = useTween(o.posterior);
  const width = `${Math.max(0, Math.min(1, o.posterior)) * 100}%`;
  return (
    <li
      title={[o.statement, o.author ? `proposed by ${o.author}` : ''].filter(Boolean).join(' · ')}
      data-option={o.answerKey ?? (o.isNull ? 'null' : o.id)}
      className={cls(
        'relative min-w-0 overflow-hidden rounded-[0.45rem] border bg-bg/40',
        accepted ? tone.border : 'border-line',
        rejected && 'opacity-50',
      )}
    >
      <div className={cls('flex min-w-0 items-baseline gap-[0.4rem] px-[0.55rem] pb-[0.36rem] pt-[0.14rem] leading-tight', SIZES[size].option)}>
        {rejected && <span className="shrink-0 font-bold text-bad">✕</span>}
        {accepted && <span className={cls('shrink-0 font-bold', tone.text)}>✓</span>}
        <span
          className={cls(
            'min-w-0 flex-1 truncate',
            o.isNull ? 'italic text-dim' : accepted ? 'font-semibold text-fg' : 'text-dim',
            rejected && 'line-through decoration-mute decoration-2',
          )}
        >
          {optionLabel(o)}
        </span>
        <span className={cls('tabular shrink-0 font-bold', accepted ? tone.text : 'text-fg')}>{pct(shown)}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[0.28rem] bg-track">
        <div className={cls('bar-fill h-full', o.isNull ? 'null-fill' : rejected ? 'bg-[#323b46]' : tone.fill)} style={{ width }} />
      </div>
    </li>
  );
}

function EvidenceBlock({ row, ev, size }: { row: ClaimRow; ev: ClaimEvidence; size: Density }) {
  const decided = row.verdict !== 'open' && row.verdict !== 'unresolved';
  const body = SIZES[size].body;
  return (
    <div data-testid="claim-evidence" className="rounded-[0.55rem] border border-line bg-bg/40 px-[0.7rem] py-[0.4rem]">
      <div className="flex min-w-0 items-center gap-[0.6rem]">
        <Label className={decided ? TONE[row.verdict].text : undefined}>{decided ? 'Decided by' : 'Latest evidence'}</Label>
        {ev.referee && (
          <span
            className={cls('shrink-0 text-[0.8rem]', ev.referee.valid ? 'text-dim' : 'text-bad')}
            title={ev.referee.note || undefined}
          >
            referee {ev.referee.valid ? '✓ valid' : '✕ invalid'}
          </span>
        )}
        {row.posterior !== null && (
          <span className="ml-auto inline-flex shrink-0 items-baseline gap-[0.35rem]">
            <span className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-mute">Posterior</span>
            <span className={cls('tabular text-[1.08rem] font-bold leading-none', TONE[row.verdict].text)}>{pct(row.posterior)}</span>
          </span>
        )}
      </div>
      <p className={cls('mt-[0.15rem] truncate leading-snug text-fg', body)} title={ev.goal}>
        {ev.goal}
      </p>
      <div className={cls('mt-[0.2rem] flex min-w-0 items-baseline gap-x-[0.7rem]', body)}>
        {ev.binText && (
          <span
            className="min-w-0 truncate rounded-[0.35rem] border border-accent/60 bg-accent/10 px-[0.4rem] py-[0.02rem] text-fg"
            title={`observed: ${ev.binText}`}
          >
            <span className="mr-[0.3rem] text-accent">✓</span>
            {ev.binText}
          </span>
        )}
        {ev.key && (
          <span data-testid="key-number" className="tabular ml-auto shrink-0 whitespace-nowrap font-mono text-fg">
            {ev.key.key} = {fmtNumber(ev.key.value)}
          </span>
        )}
      </div>
    </div>
  );
}

function ClaimCard({
  row,
  size,
  focused,
  onFocus,
}: {
  row: ClaimRow;
  size: Density;
  focused: boolean;
  onFocus: (questionId: string | null) => void;
}) {
  const sz = SIZES[size];
  const q = row.question;
  const tone = TONE[row.verdict];
  const finding = row.accepted && !row.accepted.isNull ? row.accepted : null;
  return (
    <article
      data-testid="claim-card"
      data-claim={row.claim.questionId}
      data-verdict={row.verdict}
      onMouseEnter={() => onFocus(row.claim.questionId)}
      onMouseLeave={() => onFocus(null)}
      className={cls(
        'grid min-h-0 min-w-0 grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] gap-x-[1rem] overflow-hidden rounded-[0.8rem] border transition-colors duration-700',
        sz.pad,
        row.testing ? 'border-accent/55 bg-accent/[0.04]' : row.verdict === 'open' ? 'border-line bg-raised/70' : cls(tone.border, 'bg-raised'),
        focused && 'ring-2 ring-fg/40',
      )}
    >
      {/* Left: the claim and its options. */}
      <div className="flex min-h-0 min-w-0 flex-col gap-[0.32rem] *:shrink-0">
        <div className="flex min-w-0 items-center gap-[0.45rem]">
          <span className="font-mono text-[0.95rem] font-bold text-dim">{row.label}</span>
          {row.claim.kind && <KindBadge kind={row.claim.kind} />}
          {row.claim.planted && <PlantedBadge />}
          {row.extra && <span className="truncate text-[0.8rem] text-mute">raised during the run</span>}
          <span className="ml-auto">
            <VerdictChip verdict={row.verdict} testing={row.testing} />
          </span>
        </div>
        <p className={cls('line-clamp-2 font-semibold leading-snug text-fg', sz.claim)} title={row.claim.claim}>
          {row.claim.claim}
        </p>
        {row.options.length > 0 ? (
          <ul className="grid grid-cols-2 gap-[0.32rem]">
            {row.options.map((o) => (
              <OptionPill key={o.id} o={o} accepted={o.id === row.accepted?.id} size={size} />
            ))}
          </ul>
        ) : (
          <p className={cls('text-mute', sz.body)}>{q ? 'Waiting for options…' : 'Waiting for the engine to open this claim…'}</p>
        )}
      </div>

      {/* Right: what decided it. */}
      <div className="flex min-h-0 min-w-0 flex-col gap-[0.35rem] *:shrink-0">
        {row.evidence ? (
          <EvidenceBlock row={row} ev={row.evidence} size={size} />
        ) : row.testing ? (
          <div className={cls('flex min-w-0 items-center gap-[0.5rem] rounded-[0.55rem] border border-accent/40 px-[0.7rem] py-[0.45rem] text-accent', sz.body)}>
            <LiveDot />
            <span className="truncate" title={row.testingGoal ?? undefined}>
              {row.testingGoal ?? 'Choosing a diagnostic…'}
            </span>
          </div>
        ) : row.invalid ? null : (
          <p className={cls('rounded-[0.55rem] border border-dashed border-line px-[0.7rem] py-[0.45rem] text-mute', sz.body)}>
            {q ? 'No diagnostic run yet.' : 'Not opened yet.'}
          </p>
        )}
        {row.invalid && (
          <div
            data-testid="claim-invalid"
            className={cls('line-clamp-2 min-w-0 rounded-[0.55rem] border border-bad/50 bg-bad/10 px-[0.7rem] py-[0.35rem] leading-snug', sz.body)}
            title={row.invalid.note || undefined}
          >
            <span className="mr-[0.45rem] text-[0.66rem] font-bold uppercase tracking-[0.14em] text-bad">Referee ✕ invalid</span>
            <span className="text-fg/90">{row.invalid.note || row.invalid.goal}</span>
          </div>
        )}
        {row.testing && row.evidence && row.testingGoal && (
          <p className={cls('flex min-w-0 items-center gap-[0.45rem] text-accent', sz.body)}>
            <LiveDot />
            <span className="truncate" title={row.testingGoal}>
              {row.testingGoal}
            </span>
          </p>
        )}
        {finding && (
          <p className={cls('leading-snug text-fg/90', sz.body, sz.clamp)} title={finding.statement}>
            <span className={cls('mr-[0.4rem] text-[0.66rem] font-bold uppercase tracking-[0.14em]', tone.text)}>
              {row.verdict === 'holds_if' ? 'Condition' : 'Finding'}
            </span>
            {finding.statement}
          </p>
        )}
        {row.verdict === 'unresolved' && q?.unresolved && (
          <p className={cls('leading-snug text-warn', sz.body, sz.clamp)}>{q.unresolved.reason}</p>
        )}
        {row.ruledOut.length > 0 && (
          <ul data-testid="ruled-out" className="flex min-w-0 flex-col gap-[0.12rem]">
            {row.ruledOut.slice(0, sz.rules).map((g, i, shown) => (
              <li
                key={`${g.seq}-${g.how}`}
                className={cls('flex min-w-0 items-baseline gap-[0.45rem] leading-snug', sz.body)}
                title={g.reasons.join('\n')}
              >
                <span className="shrink-0 font-bold text-bad">✕</span>
                <span className="min-w-0 truncate">
                  <span className="font-medium text-dim line-through decoration-mute decoration-2">
                    {g.options.map((o) => o.label).join(', ')}
                  </span>
                  <span className="text-mute"> · {g.how}</span>
                </span>
                {i === shown.length - 1 && row.ruledOut.length > shown.length && (
                  <span className="shrink-0 whitespace-nowrap text-dim">+{row.ruledOut.length - shown.length} more</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function ClaimsPanel({
  state,
  rows,
  focus,
  onFocus,
}: {
  state: RunState;
  rows: ClaimRow[];
  focus: string | null;
  onFocus: (questionId: string | null) => void;
}) {
  const decided = rows.filter((r) => r.verdict !== 'open').length;
  const testing = rows.find((r) => r.testing);
  const size: Density = rows.length > 4 ? 'dense' : 'normal';
  return (
    <Panel
      title="Claims · verdicts"
      meta={
        rows.length ? (
          <span>
            {testing && (
              <span className="text-accent">
                testing <span className="font-mono font-bold">{testing.label}</span> ·{' '}
              </span>
            )}
            {decided} of {rows.length} decided
          </span>
        ) : undefined
      }
      bodyClassName={cls('grid gap-[0.55rem]', rows.length > 6 && 'auto-rows-max overflow-y-auto')}
    >
      {rows.length === 0 ? (
        <Empty>{state.status === 'idle' ? 'No run yet.' : 'Claims appear once the paper is read.'}</Empty>
      ) : (
        rows.map((r) => (
          <ClaimCard key={r.claim.questionId} row={r} size={size} focused={focus === r.claim.questionId} onFocus={onFocus} />
        ))
      )}
    </Panel>
  );
}
