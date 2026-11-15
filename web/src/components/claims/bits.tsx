// Small shared pieces of the Paper & claims view: verdict tones, chips and badges.
// Every chip carries a text label and a glyph; colour is never the only signal.

import type { ClaimVerdict } from '../../state/claims';
import { VERDICT_LABEL } from '../../state/claims';
import { cls } from '../../lib/format';
import { LiveDot } from '../Panel';

interface Tone {
  glyph: string;
  /** Filled or outlined chip. */
  chip: string;
  /** Highlight in the excerpt. */
  mark: string;
  /** Posterior bar fill. */
  fill: string;
  text: string;
  /** Card border once the claim has this verdict. */
  border: string;
}

// "Holds if" gets its own hue (sky blue) so it never reads as a plain "holds".
export const TONE: Record<ClaimVerdict, Tone> = {
  open: {
    glyph: '○',
    chip: 'border border-line-strong text-dim',
    mark: 'bg-fg/[0.07] border-mute border-dashed',
    fill: 'bg-neutral',
    text: 'text-dim',
    border: 'border-line',
  },
  holds: {
    glyph: '✓',
    chip: 'bg-accent text-bg',
    mark: 'bg-accent/[0.17] border-accent',
    fill: 'bg-accent',
    text: 'text-accent',
    border: 'border-accent/50',
  },
  holds_if: {
    glyph: '◐',
    chip: 'bg-[#6f655a] text-bg',
    mark: 'bg-[#6f655a]/[0.17] border-[#6f655a]',
    fill: 'bg-[#6f655a]',
    text: 'text-[#6f655a]',
    border: 'border-[#6f655a]/55',
  },
  refuted: {
    glyph: '✕',
    chip: 'bg-bad text-bg',
    mark: 'bg-bad/[0.17] border-bad',
    fill: 'bg-bad',
    text: 'text-bad',
    border: 'border-bad/50',
  },
  unresolved: {
    glyph: '?',
    chip: 'border border-warn/70 bg-warn/10 text-warn',
    mark: 'bg-warn/[0.15] border-warn',
    fill: 'bg-warn',
    text: 'text-warn',
    border: 'border-warn/55',
  },
  other: {
    glyph: '•',
    chip: 'border border-warn/70 text-warn',
    mark: 'bg-warn/[0.1] border-warn border-dashed',
    fill: 'bg-neutral',
    text: 'text-warn',
    border: 'border-warn/45',
  },
};

export function VerdictChip({
  verdict,
  testing = false,
  size = 'md',
  prefix,
}: {
  verdict: ClaimVerdict;
  testing?: boolean;
  size?: 'sm' | 'md';
  /** Text before the verdict, e.g. the claim label in the excerpt. */
  prefix?: string;
}) {
  const t = TONE[verdict];
  const live = testing && verdict === 'open';
  return (
    <span
      data-testid="verdict-chip"
      data-verdict={verdict}
      className={cls(
        'inline-flex shrink-0 items-center gap-[0.35rem] whitespace-nowrap rounded-[0.35rem] font-bold uppercase leading-none',
        size === 'sm'
          ? 'px-[0.38rem] py-[0.2rem] text-[0.66rem] tracking-[0.1em]'
          : 'px-[0.6rem] py-[0.3rem] text-[0.8rem] tracking-[0.12em]',
        live ? 'border border-accent/60 text-accent' : t.chip,
      )}
    >
      {prefix && <span className="font-mono tracking-normal">{prefix}</span>}
      {live ? <LiveDot /> : <span aria-hidden>{t.glyph}</span>}
      {live ? 'Testing' : VERDICT_LABEL[verdict]}
    </span>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  const symbolic = kind.toLowerCase() === 'symbolic';
  return (
    <span
      title={symbolic ? 'Checked symbolically' : 'Checked by simulation'}
      className="inline-flex shrink-0 items-center gap-[0.3rem] rounded-[0.3rem] border border-line-strong px-[0.42rem] py-[0.1rem] font-mono text-[0.72rem] uppercase tracking-[0.08em] text-dim"
    >
      <span aria-hidden className="text-mute">
        {symbolic ? 'ƒ' : '≈'}
      </span>
      {kind}
    </span>
  );
}

export function PlantedBadge() {
  return (
    <span
      data-testid="planted-badge"
      title="A deliberately false claim planted to check that the audit catches it."
      className="inline-flex shrink-0 items-center rounded-[0.3rem] border border-dashed border-warn/70 px-[0.42rem] py-[0.1rem] text-[0.66rem] font-bold uppercase tracking-[0.12em] text-warn"
    >
      Planted test claim
    </span>
  );
}

/** Shown when run.started marks the run as a hand-written UI fixture. */
export function FixtureBadge() {
  return (
    <span
      data-testid="fixture-badge"
      title="Hand-written fixture for UI development; not a recorded run."
      className="inline-flex items-center rounded-[0.35rem] border border-warn/60 bg-warn/10 px-[0.5rem] py-[0.12rem] text-[0.7rem] font-bold uppercase tracking-[0.14em] text-warn"
    >
      UI fixture
    </span>
  );
}

/** A small uppercase label above a block. */
export function Label({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cls('text-[0.68rem] font-bold uppercase tracking-[0.15em] text-mute', className)}>{children}</div>
  );
}
