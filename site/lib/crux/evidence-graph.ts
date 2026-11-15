// The run's evidence graph as plain data: claims, their competing readings
// (options), the experiments that tested them and the outcomes they
// observed, joined by typed edges. Pure: no React, no DOM.
//
// Statuses come from the folded RunState (the same fold every other panel
// renders from), so the graph never disagrees with the claim cards. What the
// fold does not keep (each experiment's likelihood table and the prior and
// posterior of every belief update) is read from the raw events.
//
// Every edge is checked against the node set before it is returned: an edge
// never points at a node that is not drawn.

import { claimSpecs, claimVerdict, optionLabel, type ClaimVerdict } from './claims';
import { foldAll, type ExperimentView, type OptionView, type QuestionView, type RunState } from './fold';
import { visibleOptions } from './selectors';

/** An option below this posterior is rejected. */
export const REJECT_BELOW = 0.02;
/** A question settles when one option reaches this posterior. */
export const SETTLE_AT = 0.9;

/** Any event envelope; `run_id` and `ts` are optional so viewer events fit too. */
export interface GraphEvent {
  seq: number;
  type: string;
  payload: unknown;
  run_id?: string;
  ts?: number;
}

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

export type ReadingState = 'settled' | 'rejected' | 'active' | 'unresolved';
export type ExperimentState = 'chosen' | 'running' | 'done' | 'invalid';
export type EdgeKind = 'reading' | 'predicts' | 'tested_by' | 'supports' | 'rejected_by' | 'observed';

export interface ClaimNode {
  kind: 'claim';
  id: string;
  questionId: string;
  /** 1-based claim number, as on the claim cards (#claim-N). */
  index: number;
  text: string;
  /** The engine's question, when it differs from the claim text. */
  question: string | null;
  verdict: ClaimVerdict;
  /** The question has not been opened yet (claim listed, readings still to come). */
  pending: boolean;
  planted: boolean;
  /** Settled posterior of the accepted reading. */
  settledPosterior: number | null;
  settledLabel: string | null;
  /** Why the question ended unresolved. */
  reason: string | null;
  /** An experiment for this claim is chosen or running now. */
  testing: boolean;
}

export interface ReadingNode {
  kind: 'reading';
  id: string;
  questionId: string;
  hypothesisId: string;
  label: string;
  statement: string;
  state: ReadingState;
  posterior: number;
  prior: number;
  prevPosterior: number | null;
  /** Seq of the latest belief update that moved it (changes on every update). */
  updateSeq: number | null;
  isNull: boolean;
  rejectedReason: string | null;
}

export interface ExperimentNode {
  kind: 'experiment';
  id: string;
  experimentId: string;
  questionIds: string[];
  goal: string;
  experimentKind: string;
  eigBits: number | null;
  state: ExperimentState;
  refereeNote: string | null;
  /** Seq at which it was chosen or started; orders experiments within a claim. */
  activeSeq: number;
}

export interface OutcomeLikelihood {
  readingId: string;
  label: string;
  p: number;
}

export interface OutcomeNode {
  kind: 'outcome';
  id: string;
  experimentId: string;
  binId: string | null;
  label: string;
  description: string | null;
  valid: boolean;
  /** How likely each tested reading said this outcome was, highest first. */
  likelihoods: OutcomeLikelihood[];
}

export type EvidenceNode = ClaimNode | ReadingNode | ExperimentNode | OutcomeNode;

export interface EvidenceEdge {
  /** Stable for a source/target pair, so an edge keeps its identity when its kind changes. */
  id: string;
  kind: EdgeKind;
  source: string;
  target: string;
  /** Reading posterior before and after this experiment's belief update. */
  before: number | null;
  after: number | null;
  /** The outcome this reading said was most likely, and how likely. */
  predictedBin: string | null;
  predictedP: number | null;
  /** How likely this reading said the observed outcome was. */
  observedP: number | null;
  observedBin: string | null;
}

export interface EvidenceGroup {
  questionId: string;
  claimId: string;
  readingIds: string[];
  experimentIds: string[];
}

export interface EvidenceCounts {
  claims: number;
  settled: number;
  unresolved: number;
  open: number;
  readings: number;
  rejected: number;
  experimentsRun: number;
  experimentsRunning: number;
  /** Proposed experiments that were never chosen (not drawn). */
  candidates: number;
}

export interface EvidenceGraphModel {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  groups: EvidenceGroup[];
  counts: EvidenceCounts;
  /** Edges dropped because an endpoint was missing (should stay 0). */
  dropped: number;
}

/* ------------------------------------------------------------------ */
/* Ids and small helpers                                               */
/* ------------------------------------------------------------------ */

export const nodeId = {
  claim: (questionId: string) => `c:${questionId}`,
  reading: (hypothesisId: string) => `r:${hypothesisId}`,
  experiment: (experimentId: string) => `x:${experimentId}`,
  outcome: (experimentId: string) => `o:${experimentId}`,
};

const edgeId = (source: string, target: string) => `${source}>${target}`;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function probMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, p] of Object.entries(v)) if (finite(p)) out[k] = p;
  return out;
}

/** "nb_variance_symbolic" -> "nb variance symbolic". */
export function humanize(id: string): string {
  return id.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* What the fold does not keep                                         */
/* ------------------------------------------------------------------ */

interface BeliefUpdate {
  seq: number;
  questionId: string;
  prior: Record<string, number>;
  posterior: Record<string, number>;
}

interface EventFacts {
  /** experiment id -> hypothesis id -> bin id -> P(bin | hypothesis). */
  likelihood: Map<string, Record<string, Record<string, number>>>;
  /** experiment id -> first seq it was chosen or started. */
  activeSeq: Map<string, number>;
  /** experiment id -> its belief updates. */
  updates: Map<string, BeliefUpdate[]>;
  /** hypothesis id -> rejection (seq and the experiment whose update preceded it). */
  rejections: Map<string, { seq: number; experimentId: string | null }>;
  /** Hypotheses that were actually proposed (the fold also keeps ids it only saw in updates). */
  proposed: Set<string>;
}

function readFacts(events: readonly GraphEvent[]): EventFacts {
  const facts: EventFacts = {
    likelihood: new Map(),
    activeSeq: new Map(),
    updates: new Map(),
    rejections: new Map(),
    proposed: new Set(),
  };
  const seen = new Set<number>();
  const lastUpdate = new Map<string, string>();
  const ordered = events
    .filter((e): e is GraphEvent => isObj(e) && typeof e.type === 'string' && finite(e.seq))
    .slice()
    .sort((a, b) => a.seq - b.seq);
  for (const ev of ordered) {
    if (seen.has(ev.seq)) continue;
    seen.add(ev.seq);
    const p: Obj = isObj(ev.payload) ? ev.payload : {};
    switch (ev.type) {
      case 'experiment.proposed': {
        const e = isObj(p.experiment) ? p.experiment : {};
        const id = str(e.id);
        if (!id || !isObj(e.likelihood)) break;
        const table: Record<string, Record<string, number>> = {};
        for (const [hid, row] of Object.entries(e.likelihood)) {
          const r = probMap(row);
          if (Object.keys(r).length) table[hid] = r;
        }
        if (Object.keys(table).length) facts.likelihood.set(id, table);
        break;
      }
      case 'hypothesis.proposed': {
        const h = isObj(p.hypothesis) ? p.hypothesis : {};
        if (str(h.id) && str(h.question_id)) facts.proposed.add(str(h.id));
        break;
      }
      case 'experiment.scored': {
        const chosen = str(p.chosen);
        if (chosen && !facts.activeSeq.has(chosen)) facts.activeSeq.set(chosen, ev.seq);
        break;
      }
      case 'experiment.started': {
        const id = str(p.experiment_id);
        if (id && !facts.activeSeq.has(id)) facts.activeSeq.set(id, ev.seq);
        break;
      }
      case 'belief.updated': {
        const qid = str(p.question_id);
        const eid = str(p.experiment_id);
        if (!qid || !eid) break;
        const list = facts.updates.get(eid) ?? [];
        list.push({ seq: ev.seq, questionId: qid, prior: probMap(p.prior), posterior: probMap(p.posterior) });
        facts.updates.set(eid, list);
        lastUpdate.set(qid, eid);
        break;
      }
      case 'hypothesis.rejected': {
        const hid = str(p.hypothesis_id);
        const qid = str(p.question_id);
        if (!hid) break;
        facts.rejections.set(hid, { seq: ev.seq, experimentId: (qid && lastUpdate.get(qid)) || null });
        break;
      }
      case 'question.opened': {
        // A reopened question starts a new round: rejections from the old round stand,
        // but no later rejection is pinned on an experiment of the previous round.
        if (p.reopened === true && isObj(p.question)) lastUpdate.delete(str(p.question.id));
        break;
      }
      default:
        break;
    }
  }
  return facts;
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function readingState(q: QuestionView, o: OptionView): ReadingState {
  if (o.status === 'rejected') return 'rejected';
  if (o.status === 'accepted') return 'settled';
  if (q.status === 'robust' && q.robust && (o.answerKey ?? '') === q.robust.answerKey) return 'settled';
  if (q.status === 'unresolved') return 'unresolved';
  return 'active';
}

function experimentState(e: ExperimentView): ExperimentState | null {
  if (e.status === 'invalid' || e.verdict?.valid === false || e.observation?.valid === false) {
    return e.status === 'proposed' || e.status === 'chosen' ? null : 'invalid';
  }
  if (e.status === 'done') return 'done';
  if (e.status === 'running') return 'running';
  if (e.status === 'chosen') return 'chosen';
  return null;
}

function argmax(row: Record<string, number> | undefined): [string, number] | null {
  if (!row) return null;
  let best: [string, number] | null = null;
  for (const [k, v] of Object.entries(row)) if (!best || v > best[1]) best = [k, v];
  return best;
}

/**
 * Build the graph. `run` is the folded state; when it is left out the events
 * are folded here. Same input, same output; the input is never mutated.
 */
export function buildEvidenceGraph(events: readonly GraphEvent[], run?: RunState): EvidenceGraphModel {
  const s = run ?? foldAll(events);
  const facts = readFacts(events);

  const nodes: EvidenceNode[] = [];
  const edges: EvidenceEdge[] = [];
  const groups: EvidenceGroup[] = [];
  const groupOf = new Map<string, EvidenceGroup>();
  const readingsOf = new Map<string, ReadingNode[]>();
  const counts: EvidenceCounts = {
    claims: 0,
    settled: 0,
    unresolved: 0,
    open: 0,
    readings: 0,
    rejected: 0,
    experimentsRun: 0,
    experimentsRunning: 0,
    candidates: 0,
  };

  const experiments = Object.values(s.experiments);

  // Claims and their readings, in claim-card order.
  claimSpecs(s).forEach(({ claim }, i) => {
    const q = s.questions[claim.questionId] ?? null;
    const cid = nodeId.claim(claim.questionId);
    const verdict = claimVerdict(q);
    const accepted = q?.status === 'settled' && q.settled ? (q.options[q.settled.hypothesisId] ?? null) : null;
    const testing =
      verdict === 'open' &&
      experiments.some(
        (e) => e.questionIds.includes(claim.questionId) && (e.status === 'chosen' || e.status === 'running'),
      );
    const text = claim.claim || q?.text || claim.questionId;
    nodes.push({
      kind: 'claim',
      id: cid,
      questionId: claim.questionId,
      index: i + 1,
      text,
      question: q && q.text && q.text !== text ? q.text : null,
      verdict,
      pending: q === null,
      planted: claim.planted,
      settledPosterior: accepted && q?.settled ? q.settled.posterior : null,
      settledLabel: accepted ? optionLabel(accepted) : null,
      reason: q?.status === 'unresolved' ? (q.unresolved?.reason ?? null) : null,
      testing,
    });
    counts.claims += 1;
    if (q?.status === 'settled' || q?.status === 'robust') counts.settled += 1;
    else if (q?.status === 'unresolved') counts.unresolved += 1;
    else counts.open += 1;

    const group: EvidenceGroup = { questionId: claim.questionId, claimId: cid, readingIds: [], experimentIds: [] };
    groups.push(group);
    groupOf.set(claim.questionId, group);

    const readings: ReadingNode[] = [];
    for (const o of q ? visibleOptions(q) : []) {
      if (!facts.proposed.has(o.id)) continue;
      const r: ReadingNode = {
        kind: 'reading',
        id: nodeId.reading(o.id),
        questionId: claim.questionId,
        hypothesisId: o.id,
        label: optionLabel(o),
        statement: o.statement,
        state: readingState(q as QuestionView, o),
        posterior: o.posterior,
        prior: o.prior,
        prevPosterior: o.prevPosterior,
        updateSeq: o.updateSeq,
        isNull: o.isNull,
        rejectedReason: o.rejectedReason,
      };
      nodes.push(r);
      readings.push(r);
      group.readingIds.push(r.id);
      counts.readings += 1;
      if (r.state === 'rejected') counts.rejected += 1;
      edges.push(blankEdge('reading', cid, r.id));
    }
    readingsOf.set(claim.questionId, readings);
  });

  // Experiments that were chosen, ran or were ruled invalid; each sits with its first claim.
  const placed: { e: ExperimentView; state: ExperimentState; group: EvidenceGroup; activeSeq: number }[] = [];
  for (const e of experiments) {
    const state = experimentState(e);
    if (!state) {
      if (e.status === 'proposed') counts.candidates += 1;
      continue;
    }
    const group = e.questionIds.map((qid) => groupOf.get(qid)).find((g) => g !== undefined);
    if (!group) continue;
    placed.push({ e, state, group, activeSeq: facts.activeSeq.get(e.id) ?? e.proposedSeq });
  }
  placed.sort((a, b) => a.activeSeq - b.activeSeq || a.e.id.localeCompare(b.e.id));

  for (const { e, state, group, activeSeq } of placed) {
    const xid = nodeId.experiment(e.id);
    nodes.push({
      kind: 'experiment',
      id: xid,
      experimentId: e.id,
      questionIds: [...e.questionIds],
      goal: e.goal || e.query || '',
      experimentKind: e.kind,
      eigBits: e.eigBits,
      state,
      refereeNote: e.verdict?.note || e.observation?.referee_note || null,
      activeSeq,
    });
    group.experimentIds.push(xid);
    if (state === 'done' || state === 'invalid') counts.experimentsRun += 1;
    if (state === 'running') counts.experimentsRunning += 1;

    const table = facts.likelihood.get(e.id);
    const updates = facts.updates.get(e.id) ?? [];
    const observedBin = e.observation?.bin_id ?? null;
    const tested: ReadingNode[] = [];

    for (const qid of e.questionIds) {
      const readings = readingsOf.get(qid) ?? [];
      const update = updates.filter((u) => u.questionId === qid).at(-1);
      const known = new Set<string>([
        ...Object.keys(table ?? {}),
        ...Object.keys(update?.prior ?? {}),
        ...Object.keys(update?.posterior ?? {}),
      ]);
      for (const r of readings) {
        const rejection = facts.rejections.get(r.hypothesisId);
        // Rejected before this experiment was chosen: it was never tested by it.
        if (rejection && rejection.seq < activeSeq) continue;
        if (known.size > 0 && !known.has(r.hypothesisId)) continue;
        tested.push(r);

        const edge = blankEdge('predicts', r.id, xid);
        const row = table?.[r.hypothesisId];
        const best = argmax(row);
        edge.predictedBin = best?.[0] ?? null;
        edge.predictedP = best?.[1] ?? null;
        edge.observedBin = observedBin;
        edge.observedP = observedBin && row && finite(row[observedBin]) ? row[observedBin] : null;

        const rejectedHere = rejection !== undefined && rejection.experimentId === e.id;
        if (update) {
          edge.before = finite(update.prior[r.hypothesisId]) ? update.prior[r.hypothesisId] : null;
          edge.after = finite(update.posterior[r.hypothesisId]) ? update.posterior[r.hypothesisId] : null;
          if (rejectedHere || (edge.after !== null && edge.after < REJECT_BELOW && r.state === 'rejected')) {
            edge.kind = 'rejected_by';
          } else if (edge.before !== null && edge.after !== null && edge.after > edge.before + 1e-9) {
            edge.kind = 'supports';
          } else {
            edge.kind = 'tested_by';
          }
        } else if (rejectedHere) {
          edge.kind = 'rejected_by';
        } else if (state === 'invalid') {
          // Ruled invalid by the referee: no belief update follows.
          edge.kind = 'tested_by';
        }
        edges.push(edge);
      }
    }

    if (e.observation && (state === 'done' || state === 'invalid')) {
      const oid = nodeId.outcome(e.id);
      const value = e.observation.value;
      const label =
        state === 'invalid'
          ? 'ruled invalid'
          : observedBin
            ? humanize(observedBin)
            : finite(value)
              ? String(Number(value.toPrecision(4)))
              : 'no outcome';
      const likelihoods: OutcomeLikelihood[] = observedBin
        ? tested
            .map((r) => ({ readingId: r.id, label: r.label, p: table?.[r.hypothesisId]?.[observedBin] }))
            .filter((x): x is OutcomeLikelihood => finite(x.p))
            .sort((a, b) => b.p - a.p)
        : [];
      nodes.push({
        kind: 'outcome',
        id: oid,
        experimentId: e.id,
        binId: observedBin,
        label,
        description: observedBin ? (e.bins.find((b) => b.id === observedBin)?.description ?? null) : null,
        valid: state !== 'invalid',
        likelihoods,
      });
      edges.push(blankEdge('observed', xid, oid));
    }
  }

  // Never draw an edge to a node that does not exist, and never draw one twice.
  const ids = new Set(nodes.map((n) => n.id));
  const seenEdges = new Set<string>();
  const kept: EvidenceEdge[] = [];
  let dropped = 0;
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || seenEdges.has(edge.id)) {
      dropped += 1;
      continue;
    }
    seenEdges.add(edge.id);
    kept.push(edge);
  }

  return { nodes, edges: kept, groups, counts, dropped };
}

function blankEdge(kind: EdgeKind, source: string, target: string): EvidenceEdge {
  return {
    id: edgeId(source, target),
    kind,
    source,
    target,
    before: null,
    after: null,
    predictedBin: null,
    predictedP: null,
    observedP: null,
    observedBin: null,
  };
}

/** Nodes with no edge at all (a claim before its readings arrive is expected to be one). */
export function isolatedNodes(model: EvidenceGraphModel): EvidenceNode[] {
  const linked = new Set<string>();
  for (const e of model.edges) {
    linked.add(e.source);
    linked.add(e.target);
  }
  return model.nodes.filter((n) => !linked.has(n.id));
}
