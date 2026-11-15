// Event stream to evidence graph: a pure reducer, no three.js or React.
//
// Nodes are questions, their options (hypotheses) and diagnostics
// (experiments). Edges join each option to its question and each diagnostic
// to the questions it tests. Field names follow docs/EVENTS.md; unknown event
// types and fields are ignored and malformed payloads never throw.

import type { Verdict } from "./theme";

// The shape every component takes (`payload` is whatever the event type carries).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RunEvent = { seq: number; type: string; ts: number; payload: any };

/* ------------------------------------------------------------------ */
/* Graph shape                                                         */
/* ------------------------------------------------------------------ */

export type QuestionStatus = "open" | "settled" | "unresolved";
export type OptionStatus = "active" | "rejected" | "winner";
export type DiagnosticStatus = "proposed" | "chosen" | "running" | "done" | "invalid";

export interface ClaimInfo {
  claim: string;
  quote: string;
  kind: string;
  planted: boolean;
}

export interface ClaimsSource {
  title: string;
  citation: string;
  url: string;
  license: string;
  excerpt: string;
}

export interface QuestionNode {
  id: string;
  kind: "question";
  /** Short label: the claim text in a claims run, otherwise the question text. */
  label: string;
  text: string;
  claim: ClaimInfo | null;
  status: QuestionStatus;
  /** Winning option id once settled. */
  winner: string | null;
  winnerPosterior: number | null;
  /** Why it ended unresolved. */
  reason: string | null;
  /** Answer key every active option agreed on (question.robust). */
  robust: string | null;
  impact: number;
  optionIds: string[];
  openedSeq: number;
  updatedSeq: number;
}

export interface OptionNode {
  id: string;
  kind: "option";
  questionId: string;
  label: string;
  rationale: string;
  author: string;
  answerKey: string | null;
  verdict: Verdict | null;
  isNull: boolean;
  prior: number;
  posterior: number;
  status: OptionStatus;
  rejectedReason: string | null;
  proposedSeq: number;
  updatedSeq: number;
}

export interface DiagnosticNode {
  id: string;
  kind: "diagnostic";
  label: string;
  experimentKind: string;
  questionIds: string[];
  status: DiagnosticStatus;
  eigBits: number | null;
  observed: string | null;
  /** Seq of the latest start or finish: the view pulses the node when it changes. */
  runSeq: number | null;
  proposedSeq: number;
  updatedSeq: number;
}

export type GraphNode = QuestionNode | OptionNode | DiagnosticNode;

export interface GraphLink {
  id: string;
  /** Option or diagnostic id. */
  source: string;
  /** Question id. */
  target: string;
  kind: "option" | "diagnostic";
  /** Option link of a settled question's winner. */
  winner: boolean;
  /** Option link of a rejected option. */
  rejected: boolean;
}

export interface Ticker {
  seq: number;
  type: string;
  text: string;
  nodeId: string | null;
}

export interface EvidenceGraph {
  lab: string | null;
  source: ClaimsSource | null;
  nodes: GraphNode[];
  links: GraphLink[];
  /** Highest seq applied. */
  lastSeq: number;
  /** One line describing the latest meaningful event. */
  ticker: Ticker | null;
  counts: {
    questions: number;
    settled: number;
    unresolved: number;
    options: number;
    rejected: number;
    diagnostics: number;
    ran: number;
  };
}

/* ------------------------------------------------------------------ */
/* Answer keys                                                         */
/* ------------------------------------------------------------------ */

const VERDICTS: Record<string, Verdict> = {
  holds: "holds",
  fails: "refuted",
  alt_param: "refuted",
  fails_conservative: "refuted",
  holds_if: "conditional",
};

/**
 * Claims-lab answer keys: holds = holds; fails, alt_param and
 * fails_conservative = refuted; holds_if = holds under a condition.
 * Other answer keys (free text in other labs) have no verdict.
 */
export function verdictOf(answerKey: unknown): Verdict | null {
  if (typeof answerKey !== "string") return null;
  const k = answerKey.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(VERDICTS, k)) return VERDICTS[k] ?? null;
  if (k.startsWith("holds_if")) return "conditional";
  return null;
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

interface State {
  lab: string | null;
  source: ClaimsSource | null;
  claims: Map<string, ClaimInfo>;
  questions: Map<string, QuestionNode>;
  options: Map<string, OptionNode>;
  diagnostics: Map<string, DiagnosticNode>;
  lastSeq: number;
  ticker: Ticker | null;
}

function emptyState(): State {
  return {
    lab: null,
    source: null,
    claims: new Map(),
    questions: new Map(),
    options: new Map(),
    diagnostics: new Map(),
    lastSeq: -1,
    ticker: null,
  };
}

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function short(text: string, max = 72): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function ensureQuestion(s: State, id: string, seq: number): QuestionNode {
  let q = s.questions.get(id);
  if (!q) {
    q = {
      id,
      kind: "question",
      label: id,
      text: "",
      claim: null,
      status: "open",
      winner: null,
      winnerPosterior: null,
      reason: null,
      robust: null,
      impact: 0.5,
      optionIds: [],
      openedSeq: seq,
      updatedSeq: seq,
    };
    s.questions.set(id, q);
  }
  return q;
}

function ensureDiagnostic(s: State, id: string, seq: number): DiagnosticNode {
  let d = s.diagnostics.get(id);
  if (!d) {
    d = {
      id,
      kind: "diagnostic",
      label: id,
      experimentKind: "",
      questionIds: [],
      status: "proposed",
      eigBits: null,
      observed: null,
      runSeq: null,
      proposedSeq: seq,
      updatedSeq: seq,
    };
    s.diagnostics.set(id, d);
  }
  return d;
}

function setTicker(s: State, ev: RunEvent, text: string, nodeId: string | null): void {
  s.ticker = { seq: ev.seq, type: ev.type, text, nodeId };
}

function questionName(s: State, id: string): string {
  const q = s.questions.get(id);
  return short(s.claims.get(id)?.claim || q?.text || id, 64);
}

/** Apply one event to the mutable state. Unknown types are ignored. */
function apply(s: State, ev: RunEvent): void {
  const p = obj(ev.payload) ?? {};
  const seq = num(ev.seq, s.lastSeq + 1);
  if (seq > s.lastSeq) s.lastSeq = seq;

  switch (ev.type) {
    case "run.started": {
      s.lab = str(p.lab) || null;
      return;
    }
    case "claims.source": {
      s.source = {
        title: str(p.title),
        citation: str(p.citation),
        url: str(p.url),
        license: str(p.license),
        excerpt: str(p.excerpt),
      };
      for (const c of Array.isArray(p.claims) ? p.claims : []) {
        const co = obj(c);
        const qid = co && str(co.question_id);
        if (!co || !qid) continue;
        s.claims.set(qid, {
          claim: str(co.claim),
          quote: str(co.quote),
          kind: str(co.kind),
          planted: co.planted === true,
        });
      }
      if (!s.lab) s.lab = "claims";
      setTicker(s, ev, `Source: ${short(s.source.title || s.source.citation, 80)}`, null);
      return;
    }
    case "question.opened": {
      const qo = obj(p.question);
      const id = qo && str(qo.id);
      if (!qo || !id) return;
      const q = ensureQuestion(s, id, seq);
      q.text = str(qo.text, q.text);
      q.impact = num(qo.impact, q.impact);
      q.updatedSeq = seq;
      if (p.reopened === true) {
        q.status = "open";
        q.winner = null;
        q.winnerPosterior = null;
        q.reason = null;
        q.robust = null;
        for (const oid of q.optionIds) {
          const o = s.options.get(oid);
          if (o && o.status === "winner") o.status = "active";
        }
      }
      setTicker(s, ev, `${p.reopened === true ? "Reopened" : "Question"}: ${questionName(s, id)}`, id);
      return;
    }
    case "hypothesis.proposed": {
      const h = obj(p.hypothesis);
      const id = h && str(h.id);
      const qid = h && str(h.question_id);
      if (!h || !id || !qid) return;
      const q = ensureQuestion(s, qid, seq);
      const existing = s.options.get(id);
      const prior = num(h.prior, existing?.prior ?? 0);
      const node: OptionNode = {
        id,
        kind: "option",
        questionId: qid,
        label: str(h.statement, existing?.label ?? id),
        rationale: str(h.rationale, existing?.rationale ?? ""),
        author: str(h.author, existing?.author ?? ""),
        answerKey: typeof h.answer_key === "string" ? h.answer_key : null,
        verdict: verdictOf(h.answer_key),
        isNull: h.is_null === true,
        prior,
        posterior: num(h.posterior, prior),
        status: h.status === "rejected" ? "rejected" : "active",
        rejectedReason: existing?.rejectedReason ?? null,
        proposedSeq: existing?.proposedSeq ?? seq,
        updatedSeq: seq,
      };
      s.options.set(id, node);
      if (!q.optionIds.includes(id)) q.optionIds.push(id);
      q.updatedSeq = seq;
      return;
    }
    case "hypothesis.merged": {
      const priors = obj(p.priors);
      if (!priors) return;
      for (const [hid, v] of Object.entries(priors)) {
        const o = s.options.get(hid);
        if (!o || typeof v !== "number") continue;
        o.prior = v;
        o.posterior = v;
        o.updatedSeq = seq;
      }
      for (const mid of strList(p.merged)) {
        const o = s.options.get(mid);
        if (o && o.status === "active") {
          o.status = "rejected";
          o.rejectedReason = `merged into ${str(p.kept) || "another option"}`;
          o.updatedSeq = seq;
        }
      }
      return;
    }
    case "belief.updated": {
      const post = obj(p.posterior);
      const qid = str(p.question_id);
      if (post) {
        for (const [hid, v] of Object.entries(post)) {
          const o = s.options.get(hid);
          if (!o || typeof v !== "number") continue;
          o.posterior = v;
          o.updatedSeq = seq;
        }
      }
      const eid = str(p.experiment_id);
      const d = eid ? s.diagnostics.get(eid) : undefined;
      if (d && p.observed !== undefined && p.observed !== null) {
        d.observed = String(p.observed);
        d.updatedSeq = seq;
      }
      if (qid) {
        const q = s.questions.get(qid);
        if (q) q.updatedSeq = seq;
        const obs =
          p.observed !== undefined && p.observed !== null ? ` observed ${short(String(p.observed), 24)}` : "";
        setTicker(s, ev, `Belief updated:${obs} · ${questionName(s, qid)}`, qid);
      }
      return;
    }
    case "hypothesis.rejected": {
      const hid = str(p.hypothesis_id);
      const o = hid ? s.options.get(hid) : undefined;
      if (!o) return;
      o.status = "rejected";
      o.rejectedReason = str(p.reason) || "rejected";
      o.updatedSeq = seq;
      setTicker(s, ev, `Rejected: ${short(o.label, 64)}`, hid);
      return;
    }
    case "question.settled": {
      const qid = str(p.question_id);
      const hid = str(p.hypothesis_id);
      if (!qid) return;
      const q = ensureQuestion(s, qid, seq);
      q.status = "settled";
      q.winner = hid || null;
      q.winnerPosterior = typeof p.posterior === "number" ? p.posterior : null;
      q.reason = null;
      q.updatedSeq = seq;
      for (const oid of q.optionIds) {
        const o = s.options.get(oid);
        if (!o) continue;
        if (oid === hid) {
          o.status = "winner";
          if (typeof p.posterior === "number") o.posterior = p.posterior;
          o.updatedSeq = seq;
        } else if (o.status === "winner") {
          o.status = "active";
        }
      }
      const w = hid ? s.options.get(hid) : undefined;
      const pct = typeof p.posterior === "number" ? ` (p = ${p.posterior.toFixed(2)})` : "";
      setTicker(s, ev, `Settled: ${questionName(s, qid)} → ${w ? short(w.label, 48) : hid}${pct}`, qid);
      return;
    }
    case "question.unresolved": {
      const qid = str(p.question_id);
      if (!qid) return;
      const q = ensureQuestion(s, qid, seq);
      q.status = "unresolved";
      q.winner = null;
      q.winnerPosterior = null;
      q.reason = str(p.reason) || "unresolved";
      q.updatedSeq = seq;
      setTicker(s, ev, `Unresolved: ${questionName(s, qid)}`, qid);
      return;
    }
    case "question.robust": {
      const qid = str(p.question_id);
      const q = qid ? s.questions.get(qid) : undefined;
      if (!q) return;
      q.robust = str(p.answer_key) || null;
      q.updatedSeq = seq;
      return;
    }
    case "experiment.proposed": {
      const e = obj(p.experiment);
      const id = e && str(e.id);
      if (!e || !id) return;
      const d = ensureDiagnostic(s, id, seq);
      d.label = str(e.goal, d.label) || str(e.query, d.label) || id;
      d.experimentKind = str(e.kind, d.experimentKind);
      const qids = strList(e.question_ids);
      if (qids.length) d.questionIds = qids;
      d.updatedSeq = seq;
      for (const qid of d.questionIds) ensureQuestion(s, qid, seq);
      return;
    }
    case "experiment.scored": {
      const chosen = str(p.chosen);
      for (const row of Array.isArray(p.ranking) ? p.ranking : []) {
        const r = obj(row);
        const d = r ? s.diagnostics.get(str(r.experiment_id)) : undefined;
        if (d && r) d.eigBits = num(r.eig_bits, d.eigBits ?? 0);
      }
      const d = chosen ? s.diagnostics.get(chosen) : undefined;
      if (d && d.status === "proposed") {
        d.status = "chosen";
        d.updatedSeq = seq;
        setTicker(s, ev, `Chose diagnostic: ${short(d.label, 72)}`, d.id);
      }
      return;
    }
    case "experiment.started": {
      const id = str(p.experiment_id);
      if (!id) return;
      const known = s.diagnostics.has(id);
      const d = ensureDiagnostic(s, id, seq);
      if (!known) {
        d.experimentKind = str(p.kind);
        d.questionIds = strList(p.question_ids);
        for (const qid of d.questionIds) ensureQuestion(s, qid, seq);
      }
      d.status = "running";
      d.runSeq = seq;
      d.updatedSeq = seq;
      setTicker(s, ev, `Running: ${short(d.label, 72)}`, id);
      return;
    }
    case "experiment.finished": {
      const o = obj(p.observation);
      const id = o && str(o.experiment_id);
      if (!o || !id) return;
      const d = ensureDiagnostic(s, id, seq);
      d.status = o.valid === false ? "invalid" : "done";
      if (o.bin_id !== undefined && o.bin_id !== null) d.observed = String(o.bin_id);
      else if (typeof o.value === "number") d.observed = String(o.value);
      d.runSeq = seq;
      d.updatedSeq = seq;
      return;
    }
    case "referee.verdict": {
      const id = str(p.experiment_id);
      const d = id ? s.diagnostics.get(id) : undefined;
      if (d && p.valid === false) {
        d.status = "invalid";
        d.updatedSeq = seq;
      }
      return;
    }
    default:
      return;
  }
}

function finish(s: State): EvidenceGraph {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  let settled = 0;
  let unresolved = 0;
  let rejected = 0;
  let ran = 0;
  for (const q of s.questions.values()) {
    const claim = s.claims.get(q.id) ?? null;
    const label = claim?.claim || q.text || q.id;
    nodes.push({ ...q, claim, label, optionIds: [...q.optionIds] });
    if (q.status === "settled") settled += 1;
    if (q.status === "unresolved") unresolved += 1;
  }
  for (const o of s.options.values()) {
    nodes.push({ ...o });
    if (o.status === "rejected") rejected += 1;
    links.push({
      id: `${o.id}->${o.questionId}`,
      source: o.id,
      target: o.questionId,
      kind: "option",
      winner: o.status === "winner",
      rejected: o.status === "rejected",
    });
  }
  for (const d of s.diagnostics.values()) {
    nodes.push({ ...d, questionIds: [...d.questionIds] });
    if (d.status === "done" || d.status === "invalid" || d.status === "running") ran += 1;
    for (const qid of d.questionIds) {
      if (!s.questions.has(qid)) continue;
      links.push({
        id: `${d.id}->${qid}`,
        source: d.id,
        target: qid,
        kind: "diagnostic",
        winner: false,
        rejected: false,
      });
    }
  }
  return {
    lab: s.lab,
    source: s.source,
    nodes,
    links,
    lastSeq: s.lastSeq,
    ticker: s.ticker,
    counts: {
      questions: s.questions.size,
      settled,
      unresolved,
      options: s.options.size,
      rejected,
      diagnostics: s.diagnostics.size,
      ran,
    },
  };
}

/**
 * Build the evidence graph from a run's events. Pure: the same events always
 * give the same graph, and the input is never mutated. Events are applied in
 * seq order.
 */
export function buildGraph(events: readonly RunEvent[]): EvidenceGraph {
  const s = emptyState();
  const sorted = [...events].filter((e) => e && typeof e.type === "string");
  sorted.sort((a, b) => num(a.seq, 0) - num(b.seq, 0));
  for (const ev of sorted) {
    try {
      apply(s, ev);
    } catch {
      // A malformed payload never breaks the graph.
    }
  }
  return finish(s);
}

/** Parse a JSONL run log into events, skipping blank or broken lines. */
export function parseEventLog(text: string): RunEvent[] {
  const out: RunEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as Partial<RunEvent>;
      if (e && typeof e.type === "string") {
        out.push({ seq: num(e.seq, out.length), type: e.type, ts: num(e.ts, 0), payload: e.payload ?? {} });
      }
    } catch {
      // skip
    }
  }
  return out;
}
