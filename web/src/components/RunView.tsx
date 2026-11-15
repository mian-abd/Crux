// Picks the layout for the run: the One Letter view when run.started says
// lab "oneletter", the Paper & claims view for lab "claims", the standard
// Crux layout for every other lab.

import type { RunState } from '../state/fold';
import type { SourceInfo } from '../data/useRunStream';
import { focusQuestionId, isOneLetterLab } from '../state/selectors';
import { QuestionsPanel } from './QuestionsPanel';
import { RankingPanel } from './RankingPanel';
import { CurvesPanel } from './CurvesPanel';
import { ConsolePanel } from './ConsolePanel';
import { MemoryPanel } from './MemoryPanel';
import { CriticPanel } from './CriticPanel';
import { RejectedPanel } from './RejectedPanel';
import { Boundary } from './Boundary';
import { OneLetterView } from './oneletter/OneLetterView';
import { ClaimsView } from './claims/ClaimsView';
import { isClaimsLab } from '../state/claims';

export type LayoutKind = 'oneletter' | 'claims' | 'default';

export function layoutFor(state: RunState): LayoutKind {
  if (isOneLetterLab(state)) return 'oneletter';
  return isClaimsLab(state) ? 'claims' : 'default';
}

export function DefaultView({ state }: { state: RunState }) {
  const k = state.lastSeq;
  const focus = focusQuestionId(state);
  const curveQuestion =
    focus && state.curves[focus] ? focus : (Object.keys(state.curves)[0] ?? null);

  return (
    <main
      data-layout="default"
      className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.32fr)_minmax(0,1fr)_minmax(0,0.84fr)] gap-[0.85rem]"
    >
      <Boundary name="Questions" resetKey={k}>
        <QuestionsPanel state={state} />
      </Boundary>
      <div className="grid min-h-0 grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)] gap-[0.85rem]">
        <Boundary name="Experiments" resetKey={k}>
          {curveQuestion ? (
            <CurvesPanel state={state} questionId={curveQuestion} />
          ) : (
            <RankingPanel state={state} />
          )}
        </Boundary>
        <Boundary name="Console" resetKey={k}>
          <ConsolePanel state={state} />
        </Boundary>
      </div>
      <div className="grid min-h-0 grid-rows-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.95fr)] gap-[0.85rem]">
        <Boundary name="Memory" resetKey={k}>
          <MemoryPanel state={state} />
        </Boundary>
        <Boundary name="Critic" resetKey={k}>
          <CriticPanel state={state} />
        </Boundary>
        <Boundary name="Rejected ledger" resetKey={k}>
          <RejectedPanel state={state} />
        </Boundary>
      </div>
    </main>
  );
}

export function RunView({ state, source }: { state: RunState; source: SourceInfo }) {
  const layout = layoutFor(state);
  if (layout === 'claims') return <ClaimsView state={state} />;
  return layout === 'oneletter' ? (
    <OneLetterView state={state} source={source} />
  ) : (
    <DefaultView state={state} />
  );
}
