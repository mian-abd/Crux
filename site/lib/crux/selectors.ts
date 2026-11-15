// Derived views over RunState. Pure functions; panels call these instead of
// re-deriving logic inline.

import type {
  DnaReadView,
  DnaRequestView,
  FindingView,
  OptionView,
  QuestionView,
  RunState,
  SurpriseView,
} from './fold';
import { referenceBases, windowDef } from './hbb';
import type { Artifact } from './types';

export function visibleOptions(q: QuestionView): OptionView[] {
  const opts = q.optionOrder
    .map((id) => q.options[id])
    .filter((o): o is OptionView => o !== undefined && o.status !== 'merged');
  // "None of these" always sits last.
  return [...opts.filter((o) => !o.isNull), ...opts.filter((o) => o.isNull)];
}

/** The option with the highest posterior; null while the top two are tied. */
export function leaderId(q: QuestionView): string | null {
  const ranked = visibleOptions(q)
    .filter((o) => o.status !== 'rejected')
    .sort((a, b) => b.posterior - a.posterior);
  const [first, second] = ranked;
  if (!first || first.posterior <= 0) return null;
  if (second && first.posterior - second.posterior < 0.005) return null;
  return first.id;
}

export function optionStatement(s: RunState, questionId: string, hypothesisId: string): string {
  return s.questions[questionId]?.options[hypothesisId]?.statement ?? hypothesisId;
}

export function questionLabel(s: RunState, questionId: string): string {
  const idx = s.questionOrder.indexOf(questionId);
  return idx >= 0 ? `Q${idx + 1}` : questionId;
}

/* Critic ------------------------------------------------------------ */

export type CheckState = 'pass' | 'block' | 'warn' | 'checking';

export interface RuleLine {
  finding: FindingView;
  resolved: boolean;
}

export interface ArtifactCheck {
  artifact: Artifact & { writtenSeq: number; versions: number };
  status: CheckState;
  rules: RuleLine[];
}

/**
 * A finding counts as resolved when the artifact was written again after it,
 * that version passes its contract, and it no longer lists the finding.
 */
export function artifactChecks(s: RunState): ArtifactCheck[] {
  const names = [...s.artifactOrder];
  for (const f of s.findings) if (f.artifact && !names.includes(f.artifact)) names.push(f.artifact);
  return names.map((name) => {
    const a = s.artifacts[name] ?? {
      name,
      path: '',
      sha256: '',
      contract_ok: false,
      findings: [],
      writtenSeq: -1,
      versions: 0,
      firstSeq: -1,
    };
    const rules = s.findings
      .filter((f) => f.artifact === name)
      .map((finding) => ({
        finding,
        resolved:
          a.writtenSeq > finding.seq &&
          a.contract_ok &&
          !a.findings.includes(finding.id) &&
          !a.findings.includes(finding.rule),
      }));
    const open = rules.filter((r) => !r.resolved);
    let status: CheckState;
    if (open.some((r) => r.finding.severity === 'block')) status = 'block';
    else if (open.some((r) => r.finding.severity === 'warn')) status = 'warn';
    else if (a.contract_ok) status = 'pass';
    else status = 'checking';
    return { artifact: a, status, rules };
  });
}

export function criticSummary(s: RunState): Record<string, CheckState> {
  const out: Record<string, CheckState> = {};
  for (const c of artifactChecks(s)) out[c.artifact.name] = c.status;
  return out;
}

/* Time and money ---------------------------------------------------- */

export function elapsedSeconds(s: RunState): number {
  if (s.budget && s.budget.seconds > 0) return s.budget.seconds;
  if (s.firstTs !== null && s.lastTs !== null) return Math.max(0, s.lastTs - s.firstTs);
  return 0;
}

/* Numeric labs ------------------------------------------------------ */

/** Parse a design label such as "x=1.75" (or "x=128#9") into its x value. */
export function parseDesignX(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = /x\s*=\s*(-?\d+(?:\.\d+)?)/i.exec(label);
  if (m && m[1] !== undefined) return Number(m[1]);
  const n = Number(label);
  return Number.isFinite(n) && label.trim() !== '' ? n : null;
}

export function isNumericLab(s: RunState): boolean {
  return Object.keys(s.curves).length > 0;
}

/** The question the experiment panel should follow. */
export function focusQuestionId(s: RunState): string | null {
  if (s.activeQuestionId && s.questions[s.activeQuestionId]) return s.activeQuestionId;
  return s.questionOrder[s.questionOrder.length - 1] ?? null;
}

/** The next design to mark on the curve chart (chosen or running, not yet observed). */
export function nextDesign(s: RunState, questionId: string): { x: number; label: string } | null {
  const r = s.rankings[questionId];
  if (r && (r.phase === 'chosen' || r.phase === 'running')) {
    const label = r.runningId ?? r.chosen;
    const x = parseDesignX(label);
    if (x !== null) return { x, label };
  }
  return null;
}

/* Evidence ---------------------------------------------------------- */

/** Best human-readable description of an evidence id. */
export function evidenceText(s: RunState, evidenceId: string | null): string | null {
  if (!evidenceId) return null;
  const ev = s.evidence[evidenceId];
  if (ev?.claim) return ev.claim;
  // Fall back to the experiment whose id appears in the evidence id.
  const ids = Object.keys(s.experiments).sort((a, b) => b.length - a.length);
  for (const id of ids) {
    if (!evidenceId.includes(id)) continue;
    const e = s.experiments[id];
    const obs = e?.observation;
    if (!e || !obs) continue;
    if (!obs.bin_id && typeof obs.value === 'number') return `measured ${obs.value} at ${id}`;
    const bin = obs.bin_id ? e.bins.find((b) => b.id === obs.bin_id) : undefined;
    const outcome = bin?.description ?? obs.bin_id ?? '';
    return outcome ? `${e.goal || id}: ${outcome}` : e.goal || null;
  }
  return null;
}

export function binDescription(s: RunState, experimentId: string | null, binId: string): string | null {
  if (!experimentId) return null;
  return s.experiments[experimentId]?.bins.find((b) => b.id === binId)?.description ?? null;
}

/* One Letter (labs/oneletter) --------------------------------------- */

export const ONE_LETTER_LAB = 'oneletter';

/** The run uses the One Letter layout only when run.started says lab "oneletter". */
export function isOneLetterLab(s: RunState): boolean {
  return s.lab === ONE_LETTER_LAB;
}

/**
 * Reads are "recorded" when they do not come from the camera right now: a
 * bundled fixture, an API replay, or a run on the fake reader.
 */
export function isRecorded(s: RunState, sourceKind: string): boolean {
  return sourceKind === 'local' || sourceKind === 'api-replay' || s.config.fake_reader === true;
}

export function isFakeReader(s: RunState): boolean {
  return s.config.fake_reader === true;
}

function httpUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? v.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

export interface ReaderUrls {
  reader: string | null;
  /** The reader's annotated MJPEG stream. */
  annotated: string | null;
  /** The strip display page the presenter opens on the phone. */
  strip: string | null;
}

export function readerUrls(s: RunState): ReaderUrls {
  const reader = httpUrl(s.config.reader_url);
  const annotated = httpUrl(s.config.annotated_url) ?? (reader ? `${reader}/annotated_stream` : null);
  return { reader, annotated, strip: reader ? `${reader}/strip` : null };
}

/** The window the engine is waiting to see, until a read of that window arrives. */
export function pendingRequest(s: RunState): DnaRequestView | null {
  const r = s.dna.request;
  if (!r || s.status === 'finished' || s.status === 'error') return null;
  const answered = s.dna.reads.some((x) => x.seq > r.seq && x.window === r.window);
  return answered ? null : r;
}

/** The variant question (q-variant per the contract, else the focused one). */
export function variantQuestionId(s: RunState): string | null {
  if (s.questions['q-variant']) return 'q-variant';
  return focusQuestionId(s);
}

export function variantName(s: RunState, hypothesisId: string): string {
  const v = s.dna.variants[hypothesisId];
  if (v?.name) return v.name;
  if (hypothesisId === 'h0') return 'None of these';
  const qid = variantQuestionId(s);
  return qid ? optionStatement(s, qid, hypothesisId) : hypothesisId;
}

export interface ReadCell {
  index: number;
  base: string;
  /** The HBB reference (HbA) base at this position. */
  ref: string;
  /** Reported by the engine in mismatch_positions. */
  mismatch: boolean;
  differsFromRef: boolean;
  confidence: number | null;
  /** Hypotheses whose expected string has this base here. */
  supports: string[];
}

export function readCells(read: DnaReadView): ReadCell[] {
  const ref = referenceBases(read.window);
  return [...read.bases].map((base, i) => {
    const c = read.confidence[i];
    return {
      index: i,
      base,
      ref: ref[i] ?? '',
      mismatch: read.mismatchPositions.includes(i),
      differsFromRef: Boolean(ref[i]) && ref[i] !== base,
      confidence: typeof c === 'number' && Number.isFinite(c) ? c : null,
      supports: Object.entries(read.expected)
        .filter(([, e]) => e[i] === base)
        .map(([hid]) => hid),
    };
  });
}

/** Hypotheses whose expected string equals the read exactly. */
export function readMatches(read: DnaReadView): string[] {
  return Object.entries(read.expected)
    .filter(([, e]) => e === read.bases)
    .map(([hid]) => hid);
}

export interface SequenceMarks {
  /** Windows read at least once, in first-read order. */
  windowsRead: number[];
  /** Absolute 0-based positions in HBB_REF flagged by the latest read of each window. */
  mismatches: number[];
  latest: DnaReadView | null;
}

/** Reads of the strip on the bench now (every read if the question was never reopened). */
export function currentStripReads(s: RunState): DnaReadView[] {
  return s.dna.reads.filter((r) => r.seq > s.dna.stripSince);
}

/** Read and mismatch highlights for the strip on the bench now; earlier strips stay in the read list. */
export function sequenceMarks(s: RunState): SequenceMarks {
  const reads = currentStripReads(s);
  const windowsRead: number[] = [];
  const latestByWindow = new Map<number, DnaReadView>();
  for (const r of reads) {
    if (!windowsRead.includes(r.window)) windowsRead.push(r.window);
    latestByWindow.set(r.window, r);
  }
  const mismatches: number[] = [];
  for (const r of latestByWindow.values()) {
    const d = windowDef(r.window);
    if (!d) continue;
    for (const i of r.mismatchPositions) if (d.start + i < d.end) mismatches.push(d.start + i);
  }
  return {
    windowsRead,
    mismatches: mismatches.sort((a, b) => a - b),
    latest: reads.at(-1) ?? null,
  };
}

/** The open surprise on the variant question, if any. */
export function activeSurprise(s: RunState): SurpriseView | null {
  const qid = variantQuestionId(s);
  const sp = qid ? s.questions[qid]?.surprise : null;
  return sp && !sp.resolved ? sp : null;
}

export type VerdictStanding = 'current' | 'new-strip' | 'surprise';

/**
 * A verdict stops standing when the question is reopened for a new strip,
 * or a surprise reopens it, after the verdict was written.
 */
export function verdictStanding(s: RunState): VerdictStanding {
  const v = s.dna.verdict;
  if (!v) return 'current';
  if (s.dna.stripSince > v.seq) return 'new-strip';
  const sp = activeSurprise(s);
  return sp && sp.seq > v.seq ? 'surprise' : 'current';
}

export function verdictSuperseded(s: RunState): boolean {
  return verdictStanding(s) !== 'current';
}

/** The engine's latest progress line while it waits for the requested window. */
export function readerProgress(s: RunState): string | null {
  const req = pendingRequest(s);
  if (!req) return null;
  for (let i = s.console.length - 1; i >= 0; i -= 1) {
    const line = s.console[i];
    if (!line || line.seq <= req.seq) break;
    if (line.kind === 'stdout' && line.text) return line.text;
  }
  return null;
}

/** True for "none of these" (h0), whose dna.variant carries empty fields. */
export function isNullVariant(s: RunState, hypothesisId: string): boolean {
  if (hypothesisId === 'h0') return true;
  const v = s.dna.variants[hypothesisId];
  return Boolean(v && !v.hgvs && !v.legacy && !v.codon && !v.rsid);
}

/** "jetson/qwen2.5:3b" -> written on the Jetson; anything else is the template. */
export function verdictAuthor(author: string): { onJetson: boolean; label: string } {
  if (author.startsWith('jetson/')) {
    return { onJetson: true, label: `written on the Jetson · ${author.slice('jetson/'.length)}` };
  }
  return { onJetson: false, label: author || 'template' };
}
