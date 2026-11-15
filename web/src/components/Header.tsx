import type { ReactNode } from 'react';
import type { RunState } from '../state/fold';
import { elapsedSeconds } from '../state/selectors';
import type { SourceInfo } from '../data/useRunStream';
import { clock, cls, usd } from '../lib/format';
import { LiveDot } from './Panel';

function StatusPill({ state }: { state: RunState }) {
  let label = 'Waiting';
  let tone = 'border-line-strong text-mute';
  let dot: string | null = null;
  if (state.status === 'running') {
    label = 'Running';
    tone = 'border-accent/50 text-accent';
    dot = 'bg-accent';
  } else if (state.status === 'finished') {
    if (state.finishStatus === 'budget_exhausted') {
      label = 'Budget exhausted';
      tone = 'border-warn/60 text-warn';
    } else if (state.finishStatus === 'stopped') {
      label = 'Stopped';
      tone = 'border-line-strong text-dim';
    } else {
      label = 'Finished';
      tone = 'border-accent/60 bg-accent/10 text-accent';
    }
  } else if (state.status === 'error') {
    label = 'Error';
    tone = 'border-bad/60 bg-bad/10 text-bad';
  }
  return (
    <span
      className={cls(
        'inline-flex items-center gap-[0.45rem] rounded-full border px-[0.8rem] py-[0.3rem] text-[0.82rem] font-semibold',
        tone,
      )}
    >
      {dot && <LiveDot className={dot} />}
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="text-[0.66rem] font-semibold text-mute">{label}</span>
      <span className="tabular mt-[0.3rem] text-[1.45rem] font-semibold text-fg">{value}</span>
    </div>
  );
}

function SourceBadge({ source }: { source: SourceInfo }) {
  if (source.kind === 'none') return null;
  if (source.kind === 'live') {
    const reconnecting = source.status.state === 'reconnecting';
    return (
      <span
        className={cls(
          'inline-flex items-center gap-[0.4rem] rounded-[0.35rem] border px-[0.55rem] py-[0.2rem] text-[0.74rem] font-semibold',
          reconnecting ? 'border-warn/50 text-warn' : 'border-line-strong text-dim',
        )}
        title={source.status.detail}
      >
        {reconnecting ? 'Reconnecting' : 'Live'}
      </span>
    );
  }
  const paused = source.status.state === 'paused';
  return (
    <span className="inline-flex items-center gap-[0.4rem] rounded-[0.35rem] border border-line-strong px-[0.55rem] py-[0.2rem] text-[0.74rem] font-semibold text-dim">
      Replay ×{source.speed}
      {paused && <span className="text-warn">· paused</span>}
    </span>
  );
}

export function Header({
  state,
  source,
  extra,
}: {
  state: RunState;
  source: SourceInfo;
  /** Optional badge under the status pill (the One Letter "recorded" badge). */
  extra?: ReactNode;
}) {
  const b = state.budget;
  const hasRun = state.status !== 'idle';
  return (
    <header className="flex min-w-0 items-center gap-[1.4rem] px-[0.3rem]">
      <div className="flex shrink-0 items-center gap-[0.6rem]">
        <svg viewBox="0 0 32 32" className="h-[1.9rem] w-[1.9rem]" aria-hidden>
          <rect width="32" height="32" rx="7" fill="#1b1916" />
          <path d="M9 22h14M9 16h9M9 10h5" stroke="#d0896a" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="font-display text-[1.7rem] leading-none text-fg">Crux</span>
      </div>
      <div className="h-[2.2rem] w-px shrink-0 bg-line-strong" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[0.6rem] text-[0.85rem] text-mute">
          <span className="font-semibold text-dim">{state.lab || 'no run'}</span>
          {state.runId && <span className="truncate font-mono normal-case tracking-normal">{state.runId}</span>}
        </div>
        <div className="truncate text-[1.25rem] font-medium leading-tight text-fg" title={state.goal}>
          {hasRun ? state.goal : 'Waiting for a run · press ` to choose a source'}
        </div>
        {state.error && (
          <div className="truncate text-[0.9rem] text-bad" title={state.error.message}>
            {state.error.message}
            {state.error.where && <span className="text-mute"> · {state.error.where}</span>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-[1.6rem]">
        <div className="flex flex-col items-end gap-[0.35rem]">
          <StatusPill state={state} />
          {extra === undefined ? (
            <SourceBadge source={source} />
          ) : (
            <div className="flex items-center gap-[0.4rem]">
              <SourceBadge source={source} />
              {extra}
            </div>
          )}
        </div>
        <Metric label="Elapsed" value={clock(elapsedSeconds(state))} />
        <Metric label="Cost" value={usd(b?.costUsd ?? 0)} />
        <Metric label="LLM calls" value={String(b?.llmCalls ?? 0)} />
      </div>
    </header>
  );
}
