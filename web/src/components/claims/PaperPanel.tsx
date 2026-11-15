// The paper: title, citation with link and licence, and the methods excerpt
// with each claim's quote highlighted in the colour of its current verdict,
// followed by a chip that names the claim and its verdict.

import { Fragment } from 'react';
import type { RunState } from '../../state/fold';
import { excerptLayout, verdictCounts, type ClaimRow, type ClaimVerdict } from '../../state/claims';
import { cls, shortUrl } from '../../lib/format';
import { Empty, Panel } from '../Panel';
import { FixtureBadge, Label, TONE, VerdictChip } from './bits';

const TALLY_ORDER: ClaimVerdict[] = ['holds', 'holds_if', 'refuted', 'unresolved', 'other', 'open'];

export function PaperPanel({
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
  const src = state.claims;
  const fixture = state.config.fixture === true;
  if (!src) {
    return (
      <Panel title="Paper" meta={fixture ? <FixtureBadge /> : undefined}>
        <Empty>{state.status === 'idle' ? 'No run yet.' : 'Waiting for the paper and its claims.'}</Empty>
      </Panel>
    );
  }

  const layout = excerptLayout(src.excerpt, rows.map((r) => r.claim.quote));
  const unplaced = rows.filter((r, i) => !layout.placed[i] && !r.extra);
  const counts = verdictCounts(rows);
  const hover = (r: ClaimRow | undefined) => ({
    onMouseEnter: () => onFocus(r?.claim.questionId ?? null),
    onMouseLeave: () => onFocus(null),
  });

  return (
    <Panel
      title="Paper"
      meta={
        <span className="inline-flex items-center gap-[0.45rem]">
          {fixture && <FixtureBadge />}
          {src.license && (
            <span
              data-testid="licence"
              className="inline-flex items-center rounded-[0.35rem] border border-line-strong px-[0.5rem] py-[0.12rem] text-[0.74rem] font-semibold text-dim"
            >
              {src.license}
            </span>
          )}
        </span>
      }
      bodyClassName="flex flex-col gap-[0.85rem]"
    >
      <div className="min-w-0">
        {src.title && <h3 className="line-clamp-3 text-[1.32rem] font-semibold leading-snug text-fg">{src.title}</h3>}
        {src.citation && <p className="mt-[0.3rem] text-[0.98rem] leading-snug text-dim">{src.citation}</p>}
        {src.url && (
          <a
            href={src.url}
            target="_blank"
            rel="noreferrer"
            className="mt-[0.15rem] inline-block max-w-full truncate font-mono text-[0.86rem] text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            {shortUrl(src.url)} ↗
          </a>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Label>From the methods</Label>
        <p
          data-testid="excerpt"
          className="mt-[0.35rem] whitespace-pre-line text-[1.06rem] leading-[1.62] text-fg/85"
        >
          {layout.segments.map((seg, k) => {
            const lead = seg.lead === null ? undefined : rows[seg.lead];
            return (
              <Fragment key={k}>
                {lead ? (
                  <mark
                    data-claim={lead.claim.questionId}
                    data-verdict={lead.verdict}
                    title={lead.claim.claim}
                    {...hover(lead)}
                    className={cls(
                      'cursor-default rounded-[0.2rem] border-b-2 px-[0.06rem] text-fg transition-colors [box-decoration-break:clone]',
                      TONE[lead.verdict].mark,
                      seg.covers.some((i) => rows[i]?.claim.questionId === focus) && 'outline-2 outline-fg/60',
                    )}
                  >
                    {seg.text}
                  </mark>
                ) : (
                  seg.text
                )}
                {seg.ends.map((i) => {
                  const r = rows[i];
                  if (!r) return null;
                  return (
                    <span key={`tag-${i}`} className="mx-[0.25rem] inline-block align-[0.12em]" {...hover(r)}>
                      <VerdictChip verdict={r.verdict} testing={r.testing} size="sm" prefix={r.label} />
                    </span>
                  );
                })}
              </Fragment>
            );
          })}
        </p>
      </div>

      {unplaced.length > 0 && (
        <div className="min-w-0">
          <Label>Claims not quoted above</Label>
          <ul className="mt-[0.35rem] flex flex-col gap-[0.35rem]">
            {unplaced.map((r) => (
              <li key={r.claim.questionId} className="flex min-w-0 items-center gap-[0.5rem]" {...hover(r)}>
                <VerdictChip verdict={r.verdict} testing={r.testing} size="sm" prefix={r.label} />
                <span className="min-w-0 truncate text-[0.95rem] text-dim" title={r.claim.claim}>
                  {r.claim.claim}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div data-testid="claims-tally" className="flex flex-wrap items-center gap-x-[0.4rem] gap-y-[0.3rem] border-t border-line pt-[0.6rem]">
          <span className="mr-[0.1rem] text-[0.88rem] text-dim">
            {rows.length} claim{rows.length === 1 ? '' : 's'}
          </span>
          {TALLY_ORDER.filter((v) => counts[v] > 0).map((v) => (
            <span key={v} className="inline-flex items-center gap-[0.25rem]">
              <VerdictChip verdict={v} size="sm" />
              <span className="tabular text-[0.95rem] font-bold text-fg">{counts[v]}</span>
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}
