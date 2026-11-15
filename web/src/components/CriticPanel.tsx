import type { RunState } from '../state/fold';
import { artifactChecks, type CheckState } from '../state/selectors';
import { cls } from '../lib/format';
import { Empty, Panel } from './Panel';

function StateChip({ state }: { state: CheckState }) {
  const base =
    'shrink-0 rounded-[0.3rem] px-[0.5rem] py-[0.1rem] text-[0.68rem] font-bold';
  switch (state) {
    case 'pass':
      return <span className={cls(base, 'bg-accent text-bg')}>Pass</span>;
    case 'block':
      return <span className={cls(base, 'bg-bad text-bg')}>Block</span>;
    case 'warn':
      return <span className={cls(base, 'border border-warn/70 text-warn')}>Warn</span>;
    default:
      return <span className={cls(base, 'border border-line-strong text-mute')}>Checking</span>;
  }
}

export function CriticPanel({ state }: { state: RunState }) {
  const checks = artifactChecks(state);
  const repaired = checks.reduce((n, c) => n + c.rules.filter((r) => r.resolved).length, 0);
  const meta = checks.length
    ? `${checks.length} artifact${checks.length === 1 ? '' : 's'}${repaired ? ` · ${repaired} repaired` : ''}`
    : undefined;

  return (
    <Panel title="Critic · contract checks" meta={meta}>
      {checks.length === 0 ? (
        <Empty>Deliverables are checked against their contract.</Empty>
      ) : (
        <ul className="flex flex-col gap-[0.7rem]">
          {checks.map((c) => (
            <li key={c.artifact.name} className="animate-fade-up">
              <div className="flex min-w-0 items-center gap-[0.6rem]">
                <span className="min-w-0 flex-1 truncate font-mono text-[0.92rem] text-fg" title={c.artifact.path}>
                  {c.artifact.name}
                </span>
                {c.artifact.versions > 1 && (
                  <span className="text-[0.75rem] text-mute">v{c.artifact.versions}</span>
                )}
                <StateChip state={c.status} />
              </div>
              <ul className="mt-[0.3rem] flex flex-col gap-[0.2rem] text-[0.84rem] leading-snug">
                {c.rules.length === 0 && c.status === 'pass' && (
                  <li className="flex gap-[0.5rem] text-dim">
                    <span className="w-[1rem] shrink-0 text-accent">✓</span> contract satisfied
                  </li>
                )}
                {c.rules.length === 0 && c.status === 'checking' && (
                  <li className="flex gap-[0.5rem] text-mute">
                    <span className="w-[1rem] shrink-0">…</span> awaiting the critic
                  </li>
                )}
                {c.rules.map(({ finding, resolved }) => (
                  <li key={finding.id} className="flex min-w-0 gap-[0.5rem]">
                    <span
                      className={cls(
                        'w-[1rem] shrink-0 font-bold',
                        resolved ? 'text-accent' : finding.severity === 'block' ? 'text-bad' : 'text-warn',
                      )}
                    >
                      {resolved ? '✓' : finding.severity === 'block' ? '✕' : '!'}
                    </span>
                    <span className="min-w-0">
                      <span className={cls('font-mono text-[0.8rem]', resolved ? 'text-dim' : 'text-fg')}>
                        {finding.rule}
                      </span>
                      {resolved && <span className="text-accent"> repaired</span>}
                      <span className={cls(resolved ? 'text-mute line-through decoration-mute/60' : 'text-dim')}>
                        {' '}
                        {finding.message}
                      </span>
                      {finding.reopens_question && !resolved && (
                        <span className="text-warn"> · reopens {finding.reopens_question}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
