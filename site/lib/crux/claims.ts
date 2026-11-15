// Derived views for the Paper & claims lab (lab "claims"). Each claim in
// claims.source is one engine question; its verdict comes only from the
// standard question events (settled, robust, unresolved), so the same logic
// works for bundled fixtures, API replays and live runs.

import type { ClaimView, ExperimentView, OptionView, QuestionView, RunState } from './fold';
import { binDescription, evidenceText, questionLabel, visibleOptions } from './selectors';

export const CLAIMS_LAB = 'claims';

/** Lab "claims", or any run that sent a claims.source event. */
export function isClaimsLab(s: RunState): boolean {
  return s.lab === CLAIMS_LAB || s.claims !== null;
}

/* Verdicts ---------------------------------------------------------- */

export type ClaimVerdict = 'open' | 'holds' | 'holds_if' | 'refuted' | 'unresolved' | 'other';

const REFUTED_KEYS = new Set(['fails', 'alt_param', 'fails_conservative']);

function normKey(key: string | null | undefined): string {
  return (key ?? '').trim().toLowerCase();
}

/** Verdict implied by settling on an option with this answer_key. */
export function verdictForKey(key: string | null | undefined): ClaimVerdict {
  const k = normKey(key);
  if (k === 'holds') return 'holds';
  if (k.startsWith('holds_if')) return 'holds_if';
  if (REFUTED_KEYS.has(k)) return 'refuted';
  // "None of these", or a key outside the contract.
  return 'other';
}

/**
 * The claim's verdict now: open until its question settles (or is closed as
 * robust) on an option, or is left unresolved. A surprise that reopens the
 * question puts the claim back to open.
 */
export function claimVerdict(q: QuestionView | null | undefined): ClaimVerdict {
  if (!q) return 'open';
  if (q.status === 'settled' && q.settled) {
    return verdictForKey(q.options[q.settled.hypothesisId]?.answerKey);
  }
  if (q.status === 'robust' && q.robust) return verdictForKey(q.robust.answerKey);
  if (q.status === 'unresolved') return 'unresolved';
  return 'open';
}

export const VERDICT_LABEL: Record<ClaimVerdict, string> = {
  open: 'Open',
  holds: 'Holds',
  holds_if: 'Holds if',
  refuted: 'Refuted',
  unresolved: 'Unresolved',
  other: 'Other outcome',
};

const KEY_LABEL: Record<string, string> = {
  holds: 'Holds',
  fails: 'Fails',
  holds_if: 'Holds if…',
  alt_param: 'Other parameter',
  fails_conservative: 'Conservative',
};

/** Short label for an option: its answer key in words, else its statement. */
export function optionLabel(o: OptionView): string {
  if (o.isNull) return 'None of these';
  return KEY_LABEL[normKey(o.answerKey)] ?? o.statement;
}

/** The verdict tone an option stands for (its colour in the claim card). */
export function optionTone(o: OptionView): ClaimVerdict {
  return o.isNull ? 'other' : verdictForKey(o.answerKey);
}

/* Evidence ---------------------------------------------------------- */

export interface KeyNumber {
  key: string;
  value: number;
}

function numericEntries(v: unknown): KeyNumber[] {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
    .map(([key, value]) => ({ key, value }));
}

const KEYWORD = /rate|fdr|fwer|error|coverage|resid|diff|stat|estimate|ratio|prob|p_?val|alpha|level|bias/i;

/**
 * The number to quote from an observation: a numeric field named in the
 * observed bin's rule (the value that decided the bin), else one whose name
 * looks like a statistic, else the first numeric field.
 */
export function keyNumber(e: ExperimentView | null | undefined): KeyNumber | null {
  if (!e || !e.observation) return null;
  const obs = e.observation;
  if (typeof obs.value === 'number') return { key: 'value', value: obs.value };
  const entries = numericEntries(obs.value);
  if (!entries.length) return null;
  const rule = (obs.bin_id ? e.bins.find((b) => b.id === obs.bin_id)?.rule : '') ?? '';
  const inRule = entries.find((x) => new RegExp(`\\b${x.key.replace(/[^\w]/g, '\\$&')}\\b`).test(rule));
  return inRule ?? entries.find((x) => KEYWORD.test(x.key)) ?? entries[0] ?? null;
}

export interface ClaimEvidence {
  experimentId: string;
  goal: string;
  kind: string;
  binId: string | null;
  binText: string | null;
  key: KeyNumber | null;
  referee: { valid: boolean; note: string } | null;
}

function evidenceFor(s: RunState, experimentId: string | null): ClaimEvidence | null {
  if (!experimentId) return null;
  const e = s.experiments[experimentId];
  const binId = e?.observation?.bin_id ?? null;
  return {
    experimentId,
    goal: e?.goal || experimentId,
    kind: e?.kind ?? 'compute',
    binId,
    binText: binId ? (binDescription(s, experimentId, binId) ?? binId) : null,
    key: keyNumber(e),
    referee: e?.verdict ?? null,
  };
}

export interface RuledOut {
  /** Options ruled out together by the same evidence. */
  options: { id: string; label: string; statement: string }[];
  /** What ruled them out, in words. */
  how: string;
  /** The engine's reasons, for the tooltip. */
  reasons: string[];
  seq: number;
}

// The engine's rejection reason: "posterior 0.0085 fell below 0.02 after <experiment> observed '<bin>'".
const AFTER_OBSERVED = /after\s+(\S+)\s+observed\s+'([^']*)'/;

function rejectionHow(s: RunState, reason: string, evidenceId: string | null): string {
  const m = AFTER_OBSERVED.exec(reason);
  if (m && m[1] && m[2] !== undefined) {
    const e = s.experiments[m[1]];
    const outcome = binDescription(s, m[1], m[2]) ?? m[2];
    return `${e?.goal || m[1]} → ${outcome}`;
  }
  return evidenceText(s, evidenceId) ?? reason;
}

/** Rejected options of one question, from the rejected ledger, grouped by what ruled them out. */
export function ruledOut(s: RunState, questionId: string): RuledOut[] {
  const q = s.questions[questionId];
  const rows = s.rejected.filter((r) => r.questionId === questionId).sort((a, b) => a.seq - b.seq);
  const groups: RuledOut[] = [];
  for (const r of rows) {
    const o = q?.options[r.hypothesisId];
    const how = rejectionHow(s, r.reason, r.evidenceId);
    const option = {
      id: r.hypothesisId,
      label: o ? optionLabel(o) : r.hypothesisId,
      statement: o?.statement ?? r.hypothesisId,
    };
    const same = groups.find((g) => g.how === how);
    if (same) {
      same.options.push(option);
      if (r.reason) same.reasons.push(r.reason);
    } else {
      groups.push({ options: [option], how, reasons: r.reason ? [r.reason] : [], seq: r.seq });
    }
  }
  return groups;
}

/* Claim rows -------------------------------------------------------- */

export interface ClaimRow {
  /** 1-based position in the claims list. */
  index: number;
  /** The question's label (Q1, Q2, ... as in the ranking and the ledger); C1, C2, ... until it opens. */
  label: string;
  claim: ClaimView;
  /** The claim is a question the paper did not list (raised during the run). */
  extra: boolean;
  question: QuestionView | null;
  verdict: ClaimVerdict;
  /** A diagnostic for this claim is chosen or running now. */
  testing: boolean;
  /** Goal of that diagnostic, while testing. */
  testingGoal: string | null;
  /** The option the question settled on, if it did. */
  accepted: OptionView | null;
  /** Final posterior of the accepted option. */
  posterior: number | null;
  /** The diagnostic that settled the claim; while open, the latest one. */
  evidence: ClaimEvidence | null;
  options: OptionView[];
  ruledOut: RuledOut[];
  /** Diagnostics finished for this claim, valid or not. */
  checks: number;
  /** The latest diagnostic, when the referee ruled it invalid (no belief update followed). */
  invalid: { experimentId: string; goal: string; note: string } | null;
}

/** The claims to show: claims.source in order, then any other question the run opened. */
export function claimSpecs(s: RunState): { claim: ClaimView; extra: boolean }[] {
  const listed = (s.claims?.claims ?? []).map((claim) => ({ claim, extra: false }));
  const known = new Set(listed.map((c) => c.claim.questionId));
  const others = s.questionOrder
    .filter((qid) => !known.has(qid))
    .map((qid) => ({
      claim: {
        questionId: qid,
        claim: s.questions[qid]?.text ?? qid,
        quote: '',
        kind: '',
        planted: false,
      },
      // Without claims.source every question stands in for a claim.
      extra: s.claims !== null,
    }));
  return [...listed, ...others];
}

export function claimRows(s: RunState): ClaimRow[] {
  return claimSpecs(s).map(({ claim, extra }, i) => {
    const q = s.questions[claim.questionId] ?? null;
    const verdict = claimVerdict(q);
    const ranking = s.rankings[claim.questionId];
    const closed = q !== null && (q.status === 'settled' || q.status === 'robust');
    const accepted = q?.settled && q.status === 'settled' ? (q.options[q.settled.hypothesisId] ?? null) : null;
    const testing = verdict === 'open' && (ranking?.phase === 'running' || ranking?.phase === 'chosen');
    const checks = s.completed.filter((c) => c.questionIds.includes(claim.questionId));
    const last = checks.at(-1);
    return {
      index: i + 1,
      label: q ? questionLabel(s, claim.questionId) : `C${i + 1}`,
      claim,
      extra,
      question: q,
      verdict,
      testing,
      testingGoal: testing && ranking ? (s.experiments[ranking.runningId ?? ranking.chosen]?.goal || null) : null,
      accepted,
      posterior: q?.settled && q.status === 'settled' ? q.settled.posterior : null,
      evidence: q && (closed || q.updates > 0) ? evidenceFor(s, q.lastExperimentId) : null,
      options: q ? visibleOptions(q) : [],
      ruledOut: ruledOut(s, claim.questionId),
      checks: checks.length,
      invalid:
        last && last.valid === false
          ? {
              experimentId: last.experimentId,
              goal: last.goal || last.experimentId,
              note: s.experiments[last.experimentId]?.verdict?.note ?? '',
            }
          : null,
    };
  });
}

export type VerdictCounts = Record<ClaimVerdict, number>;

export function verdictCounts(rows: ClaimRow[]): VerdictCounts {
  const out: VerdictCounts = { open: 0, holds: 0, holds_if: 0, refuted: 0, unresolved: 0, other: 0 };
  for (const r of rows) out[r.verdict] += 1;
  return out;
}

/* Excerpt highlighting --------------------------------------------- */

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Where `quote` occurs in `text` at or after `from`: exactly, else ignoring
 * case and runs of whitespace. Null when it does not occur.
 */
export function findQuote(text: string, quote: string, from = 0): [number, number] | null {
  const q = quote.trim();
  if (!q) return null;
  const at = text.indexOf(q, from);
  if (at >= 0) return [at, at + q.length];
  const re = new RegExp(q.split(/\s+/).map(escapeRe).join('\\s+'), 'gi');
  re.lastIndex = from;
  const m = re.exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

export interface ExcerptSegment {
  text: string;
  /** Claims (indexes into the quotes list) whose quote covers this text. */
  covers: number[];
  /** The claim to colour this text by: the innermost covering quote. */
  lead: number | null;
  /** Claims whose quote ends with this segment (their chip goes after it). */
  ends: number[];
}

export interface ExcerptLayout {
  segments: ExcerptSegment[];
  /** placed[i]: claim i's quote was found and is highlighted. */
  placed: boolean[];
}

/** Split the excerpt into plain and highlighted runs; overlapping quotes nest. */
export function excerptLayout(excerpt: string, quotes: string[]): ExcerptLayout {
  const ranges: ([number, number] | null)[] = [];
  quotes.forEach((quote) => {
    let r = findQuote(excerpt, quote);
    // Two claims quoting the same words take successive occurrences when there are any.
    while (r && ranges.some((x) => x && x[0] === r![0] && x[1] === r![1])) {
      const next = findQuote(excerpt, quote, r[0] + 1);
      if (!next) break;
      r = next;
    }
    ranges.push(r);
  });
  const cuts = new Set<number>([0, excerpt.length]);
  for (const r of ranges) if (r) cuts.add(r[0]).add(r[1]);
  const points = [...cuts].sort((a, b) => a - b);
  const segments: ExcerptSegment[] = [];
  for (let k = 0; k + 1 < points.length; k += 1) {
    const a = points[k]!;
    const b = points[k + 1]!;
    if (b <= a) continue;
    const covers: number[] = [];
    const ends: number[] = [];
    ranges.forEach((r, i) => {
      if (!r) return;
      if (r[0] <= a && r[1] >= b) covers.push(i);
      if (r[1] === b) ends.push(i);
    });
    let lead: number | null = null;
    for (const i of covers) {
      const r = ranges[i]!;
      const best = lead === null ? null : ranges[lead]!;
      if (!best || r[0] > best[0] || (r[0] === best[0] && r[1] < best[1])) lead = i;
    }
    segments.push({ text: excerpt.slice(a, b), covers, lead, ends });
  }
  return { segments, placed: ranges.map((r) => r !== null) };
}
