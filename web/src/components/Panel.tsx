import type { ReactNode } from 'react';
import { cls } from '../lib/format';

export function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cls(
        'flex min-h-0 min-w-0 flex-col rounded-[0.9rem] border border-line bg-panel',
        className,
      )}
    >
      <header className="flex min-w-0 items-baseline justify-between gap-3 px-[1.1rem] pb-[0.55rem] pt-[0.8rem]">
        <h2 className="shrink-0 text-[0.95rem] font-medium text-dim">
          {title}
        </h2>
        {meta !== undefined && (
          <div className="min-w-0 truncate text-right text-[0.8rem] text-mute">{meta}</div>
        )}
      </header>
      <div className={cls('relative min-h-0 flex-1 overflow-hidden px-[1.1rem] pb-[0.95rem]', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function Role({ name, strong }: { name: string; strong?: boolean }) {
  return (
    <span
      className={cls(
        'inline-block rounded-[0.3rem] border border-line-strong bg-raised px-[0.4rem] py-[0.05rem] font-medium leading-snug',
        strong ? 'text-fg' : 'text-dim',
      )}
    >
      {name}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-[0.95rem] text-mute">
      {children}
    </div>
  );
}

export function KindTag({ kind }: { kind: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-[0.3rem] border border-line-strong px-[0.4rem] py-[0.08rem] font-mono text-[0.7rem] text-dim">
      {kind}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={cls('inline-block h-[0.55rem] w-[0.55rem] shrink-0 rounded-full animate-pulse-dot', className ?? 'bg-accent')}
    />
  );
}
