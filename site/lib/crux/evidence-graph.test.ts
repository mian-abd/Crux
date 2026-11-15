import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildEvidenceGraph,
  isolatedNodes,
  nodeId,
  type EvidenceEdge,
  type EvidenceGraphModel,
  type ExperimentNode,
  type OutcomeNode,
  type ReadingNode,
} from './evidence-graph';
import { foldAll } from './fold';
import { parseJsonl } from './sources';
import type { RunEvent } from './types';

const FIXTURE = fileURLToPath(new URL('../../public/fixtures/demo_claims.jsonl', import.meta.url));
// Hand-written UI fixture (not a recorded run): it has a referee-invalid experiment.
const fixture = parseJsonl(readFileSync(FIXTURE, 'utf8'));
// The recorded claims run the API replays on /app/runs/demo (lives outside site/).
const RECORDED = fileURLToPath(new URL('../../../runs/demo/claims_deseq2.jsonl', import.meta.url));
const recorded = existsSync(RECORDED) ? parseJsonl(readFileSync(RECORDED, 'utf8')) : null;

const edge = (g: EvidenceGraphModel, source: string, target: string) =>
  g.edges.find((e) => e.source === source && e.target === target);
const node = <T>(g: EvidenceGraphModel, id: string) => g.nodes.find((n) => n.id === id) as T | undefined;

/** The invariants every state of the graph must keep, mid-stream included. */
function expectConsistent(g: EvidenceGraphModel) {
  const ids = new Set(g.nodes.map((n) => n.id));
  expect(ids.size).toBe(g.nodes.length);
  expect(g.dropped).toBe(0);
  const edgeIds = new Set<string>();
  for (const e of g.edges) {
    expect(ids.has(e.source), `edge ${e.id} source`).toBe(true);
    expect(ids.has(e.target), `edge ${e.id} target`).toBe(true);
    expect(edgeIds.has(e.id), `edge ${e.id} twice`).toBe(false);
    edgeIds.add(e.id);
  }
  // Only a claim whose readings are not proposed yet may stand alone.
  for (const n of isolatedNodes(g)) {
    expect(n.kind === 'claim' && (n.pending || g.groups.find((x) => x.claimId === n.id)?.readingIds.length === 0)).toBe(true);
  }
  // Every reading hangs off its claim; every outcome off its experiment.
  for (const n of g.nodes) {
    if (n.kind === 'reading') expect(edge(g, nodeId.claim(n.questionId), n.id)?.kind).toBe('reading');
    if (n.kind === 'outcome') expect(edge(g, nodeId.experiment(n.experimentId), n.id)?.kind).toBe('observed');
  }
  // Edges run left to right: claim -> reading -> experiment -> outcome.
  const rank = { claim: 0, reading: 1, experiment: 2, outcome: 3 } as const;
  const kindOf = new Map(g.nodes.map((n) => [n.id, n.kind]));
  for (const e of g.edges) {
    const a = kindOf.get(e.source);
    const b = kindOf.get(e.target);
    expect(a && b && rank[b] === rank[a] + 1, `edge ${e.id} skips a column`).toBe(true);
  }
}

describe('buildEvidenceGraph', () => {
  it('keeps every edge connected at every step of the bundled run', () => {
    for (let i = 0; i <= fixture.length; i++) {
      const events = fixture.slice(0, i);
      expectConsistent(buildEvidenceGraph(events, foldAll(events)));
    }
  });

  it('folds the events itself when no run state is given', () => {
    const a = buildEvidenceGraph(fixture);
    const b = buildEvidenceGraph(fixture, foldAll(fixture));
    expect(a).toEqual(b);
  });

  it('lays out the bundled run: claims, readings, experiments that ran, outcomes', () => {
    const g = buildEvidenceGraph(fixture);
    expect(g.counts.claims).toBe(4);
    expect(g.groups.map((x) => x.questionId)).toEqual(foldAll(fixture).claims?.claims.map((c) => c.questionId));
    expect(g.counts.experimentsRun).toBe(9);
    expect(g.nodes.filter((n) => n.kind === 'outcome')).toHaveLength(9);
    // Two proposed experiments were never chosen: counted, not drawn.
    expect(g.counts.candidates).toBe(2);
    expect(g.nodes.filter((n) => n.kind === 'experiment')).toHaveLength(9);
  });

  it('shows a referee-invalid experiment without moving any belief', () => {
    const g = buildEvidenceGraph(fixture);
    const x = node<ExperimentNode>(g, nodeId.experiment('claim-wald_calibration-d0'));
    expect(x?.state).toBe('invalid');
    const o = node<OutcomeNode>(g, nodeId.outcome('claim-wald_calibration-d0'));
    expect(o?.valid).toBe(false);
    expect(o?.label).toBe('ruled invalid');
    const into = g.edges.filter((e) => e.target === x?.id);
    expect(into.length).toBeGreaterThan(0);
    for (const e of into) {
      expect(e.kind).toBe('tested_by');
      expect(e.after).toBeNull();
    }
  });

  it('marks each rejected reading rejected by the experiment that pushed it under 0.02', () => {
    const g = buildEvidenceGraph(fixture);
    const rejected = g.nodes.filter((n): n is ReadingNode => n.kind === 'reading' && n.state === 'rejected');
    expect(rejected.length).toBe(g.counts.rejected);
    for (const r of rejected) {
      const by = g.edges.filter((e) => e.source === r.id && e.kind === 'rejected_by');
      expect(by, r.id).toHaveLength(1);
      // Nothing tested it after it was rejected.
      const later = g.edges.filter((e) => e.source === r.id && e.target !== by[0]?.target && e.kind !== 'reading');
      const rejectedAt = (node<ExperimentNode>(g, by[0]?.target ?? '')?.activeSeq ?? 0);
      for (const e of later) expect(node<ExperimentNode>(g, e.target)?.activeSeq ?? 0).toBeLessThan(rejectedAt);
    }
  });

  it('draws predicts while an experiment runs, then supports or tested by once beliefs update', () => {
    const eid = (e: RunEvent | undefined) => (e?.payload as { experiment_id?: string } | undefined)?.experiment_id;
    // The first experiment that ran and moved beliefs (the very first one was ruled invalid).
    const updated = fixture.findIndex((e) => e.type === 'belief.updated');
    const started = fixture.findIndex((e) => e.type === 'experiment.started' && eid(e) === eid(fixture[updated]));
    expect(started).toBeGreaterThan(-1);
    const running = buildEvidenceGraph(fixture.slice(0, started + 1));
    const xid = nodeId.experiment(String(eid(fixture[started])));
    expect(node<ExperimentNode>(running, xid)?.state).toBe('running');
    const pending = running.edges.filter((e) => e.target === xid);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((e) => e.kind === 'predicts' && e.predictedBin !== null)).toBe(true);

    const after = buildEvidenceGraph(fixture.slice(0, updated + 1));
    const done = after.edges.filter((e) => e.target === xid);
    expect(done.map((e) => e.id).sort()).toEqual(pending.map((e) => e.id).sort());
    for (const e of done) {
      expect(['supports', 'tested_by', 'rejected_by']).toContain(e.kind);
      expect(e.before).not.toBeNull();
      expect(e.after).not.toBeNull();
      if (e.kind === 'supports') expect(e.after as number).toBeGreaterThan(e.before as number);
    }
  });

  it('keeps nodes in a stable order as the run streams', () => {
    const half = buildEvidenceGraph(fixture.slice(0, Math.floor(fixture.length / 2)));
    const full = buildEvidenceGraph(fixture);
    for (const g of half.groups) {
      const later = full.groups.find((x) => x.questionId === g.questionId);
      expect(later?.readingIds.slice(0, g.readingIds.length)).toEqual(g.readingIds);
      expect(later?.experimentIds.slice(0, g.experimentIds.length)).toEqual(g.experimentIds);
    }
  });

  it('never draws an experiment or edge for a question it cannot place', () => {
    let seq = 0;
    const ev = (type: string, payload: unknown): RunEvent => ({ run_id: 'r', seq: seq++, ts: seq, type, payload });
    const events = [
      ev('run.started', { lab: 'fake' }),
      ev('question.opened', { question: { id: 'q1', text: 'Q one', kind: 'categorical', impact: 1 } }),
      ev('hypothesis.proposed', { hypothesis: { id: 'h1', question_id: 'q1', statement: 'A', prior: 0.5 } }),
      ev('hypothesis.proposed', { hypothesis: { id: 'h2', question_id: 'q1', statement: 'B', prior: 0.5 } }),
      // Started without a proposal, for a question nobody opened.
      ev('experiment.started', { experiment_id: 'ghost', question_ids: ['nope'], kind: 'compute' }),
      // A rejection and an update naming options that do not exist.
      ev('hypothesis.rejected', { question_id: 'q1', hypothesis_id: 'h9', reason: 'x' }),
      ev('belief.updated', { question_id: 'q1', experiment_id: 'ghost', posterior: { h1: 0.9, zz: 0.1 } }),
      ev('experiment.proposed', { experiment: { id: 'e1', question_ids: ['q1'], goal: 'Check', bins: [{ id: 'a' }] } }),
    ];
    const g = buildEvidenceGraph(events);
    expectConsistent(g);
    expect(node(g, nodeId.experiment('ghost'))).toBeUndefined();
    expect(node(g, nodeId.experiment('e1'))).toBeUndefined();
    expect(g.counts.candidates).toBe(1);
    expect(g.nodes.map((n) => n.id)).toEqual(['c:q1', 'r:h1', 'r:h2']);
  });

  it('ignores malformed and duplicate events', () => {
    const noisy = [
      ...fixture.slice(0, 40),
      ...fixture.slice(10, 20),
      { seq: 9999, type: 'belief.updated', payload: null } as unknown as RunEvent,
      { seq: Number.NaN, type: 'experiment.proposed', payload: { experiment: 5 } } as unknown as RunEvent,
    ];
    const g = buildEvidenceGraph(noisy);
    expectConsistent(g);
    expect(g.nodes.map((n) => n.id)).toEqual(buildEvidenceGraph(fixture.slice(0, 40)).nodes.map((n) => n.id));
  });
});

describe.skipIf(recorded === null)('recorded claims run (claims_deseq2)', () => {
  const events = recorded ?? [];
  const g = buildEvidenceGraph(events);
  const kind = (r: string, x: string): EvidenceEdge['kind'] | undefined =>
    edge(g, nodeId.reading(r), nodeId.experiment(x))?.kind;

  it('is fully connected', () => {
    expectConsistent(g);
    expect(isolatedNodes(g)).toEqual([]);
    expect(g.nodes.length).toBe(4 + 13 + 7 + 7);
  });

  it('attributes each rejection to the experiment that caused it', () => {
    expect(kind('claim-nb-variance.alt_param', 'nb_variance_symbolic')).toBe('rejected_by');
    // Rejected before the Monte Carlo check ran: never tested by it.
    expect(kind('claim-nb-variance.alt_param', 'nb_variance_montecarlo')).toBeUndefined();
    expect(kind('claim-bh-fwer.holds', 'bh_fwer_counterexample')).toBe('rejected_by');
    expect(kind('claim-wald-calibration.holds', 'wald_pergene_vs_moderated')).toBe('tested_by');
    expect(kind('claim-wald-calibration.holds', 'wald_pergene')).toBe('rejected_by');
    expect(kind('claim-bh-fdr.fails', 'bh_fdr_sim')).toBe('rejected_by');
  });

  it('shows the evidence that supported each settled reading', () => {
    expect(kind('claim-nb-variance.holds', 'nb_variance_symbolic')).toBe('supports');
    expect(kind('claim-nb-variance.holds', 'nb_variance_montecarlo')).toBe('supports');
    expect(kind('claim-wald-calibration.holds_if', 'wald_pergene')).toBe('supports');
    const settled = g.nodes.filter((n): n is ReadingNode => n.kind === 'reading' && n.state === 'settled');
    expect(settled.map((r) => r.hypothesisId).sort()).toEqual([
      'claim-bh-fdr.holds',
      'claim-nb-variance.holds',
      'claim-wald-calibration.holds_if',
    ]);
    const unresolved = g.nodes.filter((n): n is ReadingNode => n.kind === 'reading' && n.state === 'unresolved');
    expect(unresolved.map((r) => r.hypothesisId).sort()).toEqual(['claim-bh-fwer.fails', 'claim-bh-fwer.h0']);
  });

  it('names the observed outcome and how likely each reading said it was', () => {
    const o = node<OutcomeNode>(g, nodeId.outcome('nb_variance_symbolic'));
    expect(o?.binId).toBe('alpha_form');
    expect(o?.label).toBe('alpha form');
    expect(o?.likelihoods[0]?.label).toBe('Holds');
    expect(o?.likelihoods[0]?.p).toBeCloseTo(0.957, 3);
  });
});
