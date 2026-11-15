import type { ConsoleLine, RunState } from '../state/fold';
import { cls } from '../lib/format';
import { Empty, LiveDot, Panel } from './Panel';

const VISIBLE = 70;

function Line({ line }: { line: ConsoleLine }) {
  const id = (
    <span className="mr-[0.6rem] inline-block w-[7.2rem] shrink-0 truncate align-top text-mute">
      {line.experimentId ?? 'run'}
    </span>
  );

  switch (line.kind) {
    case 'verdict':
      return (
        <div
          className={cls(
            'my-[0.25rem] rounded-[0.35rem] border-l-2 px-[0.6rem] py-[0.3rem] font-sans text-[0.88rem] leading-snug animate-fade-up',
            line.valid ? 'border-accent bg-accent/[0.07]' : 'border-bad bg-bad/10',
          )}
        >
          <span
            className={cls(
              'mr-[0.5rem] text-[0.7rem] font-bold',
              line.valid ? 'text-accent' : 'text-bad',
            )}
          >
            Referee · {line.valid ? 'valid' : 'invalid'}
          </span>
          <span className="text-fg/90">{line.text}</span>
          {line.experimentId && <span className="font-mono text-[0.78rem] text-mute"> ({line.experimentId})</span>}
        </div>
      );
    case 'start':
      return (
        <div className="mt-[0.35rem] flex text-dim">
          {id}
          <span className="font-semibold text-fg">▸ {line.text}</span>
        </div>
      );
    case 'finish':
      return (
        <div className="flex text-dim">
          {id}
          <span className="text-fg">■ {line.text}</span>
        </div>
      );
    case 'error':
      return (
        <div className="my-[0.25rem] rounded-[0.35rem] border-l-2 border-bad bg-bad/10 px-[0.6rem] py-[0.3rem] font-sans text-[0.88rem] text-bad">
          <span className="mr-[0.5rem] text-[0.7rem] font-bold">Run error</span>
          {line.text}
        </div>
      );
    default:
      return (
        <div className={cls('flex', line.kind === 'stderr' ? 'text-bad' : 'text-dim')}>
          {id}
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line.text}</span>
        </div>
      );
  }
}

export function ConsolePanel({ state }: { state: RunState }) {
  const lines = state.console.slice(-VISIBLE);
  const running = Object.values(state.experiments).find((e) => e.status === 'running');
  const lastVerdict = [...state.console].reverse().find((l) => l.kind === 'verdict');
  const meta = running ? (
    <span className="inline-flex items-center gap-[0.4rem] text-accent">
      <LiveDot /> <span className="font-mono">{running.id}</span>
    </span>
  ) : lastVerdict ? (
    <span className={lastVerdict.valid ? 'text-dim' : 'text-bad'}>
      last verdict: {lastVerdict.valid ? 'valid' : 'invalid'}
    </span>
  ) : undefined;

  return (
    <Panel title="Sandbox console" meta={meta} bodyClassName="flex flex-col justify-end">
      {lines.length === 0 ? (
        <Empty>Sandbox output streams here.</Empty>
      ) : (
        <div className="font-mono text-[0.8rem] leading-[1.5]">
          {lines.map((l) => (
            <Line key={l.seq} line={l} />
          ))}
        </div>
      )}
    </Panel>
  );
}
