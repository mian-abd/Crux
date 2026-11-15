// Paper & claims (lab "claims"): the paper with its claims highlighted on the
// left, one verdict card per claim in the centre, and the experiment ranking,
// sandbox console (with the referee's verdicts) and rejected ledger on the
// right. Hovering a quote or a card outlines its counterpart.

import { useState } from 'react';
import type { RunState } from '../../state/fold';
import { claimRows } from '../../state/claims';
import { Boundary } from '../Boundary';
import { ConsolePanel } from '../ConsolePanel';
import { RankingPanel } from '../RankingPanel';
import { RejectedPanel } from '../RejectedPanel';
import { ClaimsPanel } from './ClaimsPanel';
import { PaperPanel } from './PaperPanel';

export function ClaimsView({ state }: { state: RunState }) {
  const k = state.lastSeq;
  const [focus, setFocus] = useState<string | null>(null);
  const rows = claimRows(state);
  return (
    <main
      data-layout="claims"
      className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.84fr)_minmax(0,1.68fr)_minmax(0,0.92fr)] gap-[0.85rem]"
    >
      <Boundary name="Paper" resetKey={k}>
        <PaperPanel state={state} rows={rows} focus={focus} onFocus={setFocus} />
      </Boundary>
      <Boundary name="Claims" resetKey={k}>
        <ClaimsPanel state={state} rows={rows} focus={focus} onFocus={setFocus} />
      </Boundary>
      <div className="grid min-h-0 grid-rows-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.75fr)] gap-[0.85rem]">
        <Boundary name="Experiments" resetKey={k}>
          <RankingPanel state={state} />
        </Boundary>
        <Boundary name="Console" resetKey={k}>
          <ConsolePanel state={state} />
        </Boundary>
        <Boundary name="Rejected ledger" resetKey={k}>
          <RejectedPanel state={state} />
        </Boundary>
      </div>
    </main>
  );
}
