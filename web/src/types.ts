// Typed models for the run event contract (docs/EVENTS.md) and the objects
// carried inside payloads (docs/ERD.md section 4.2). Field names match the
// pydantic models dumped with model_dump(mode="json").

export interface TraceRef {
  trace_id: string;
  run_id: string;
  role: string;
  step: string;
  url: string | null;
}

export interface RunEvent<P = unknown> {
  run_id: string;
  seq: number;
  ts: number;
  type: string;
  payload: P;
}

export type QuestionKind = 'categorical' | 'model';
export type QuestionStatus = 'open' | 'settled' | 'robust' | 'unresolved';

export interface Question {
  id: string;
  text: string;
  kind: QuestionKind;
  impact: number;
  status: QuestionStatus;
  raised_by: string;
}

export type HypothesisStatus = 'active' | 'rejected' | 'accepted';

export interface Hypothesis {
  id: string;
  question_id: string;
  statement: string;
  author: string;
  rationale: string;
  answer_key: string | null;
  model_code: string | null;
  is_null: boolean;
  prior: number;
  posterior: number;
  status: HypothesisStatus;
  rejected_by: string[];
}

export interface OutcomeBin {
  id: string;
  description: string;
  rule: string;
}

export type ExperimentKind = 'compute' | 'search' | 'multiverse' | 'measure';

export interface Experiment {
  id: string;
  question_ids: string[];
  kind: ExperimentKind;
  goal: string;
  language: 'python' | 'r' | 'bash' | null;
  code: string | null;
  query: string | null;
  design: Record<string, unknown> | null;
  bins: OutcomeBin[];
  likelihood: Record<string, Record<string, number>>;
  likelihood_source: 'exact' | 'sampled' | 'jev' | 'stated' | 'tinker';
  est_cost_s: number;
  est_cost_usd: number;
  eig_bits: number | null;
  score: number | null;
  spec_hash: string | null;
  status: 'proposed' | 'running' | 'done' | 'invalid' | 'spent';
}

export interface Observation {
  experiment_id: string;
  valid: boolean;
  value: number | Record<string, unknown> | null;
  bin_id: string | null;
  surprise: number;
  referee_note: string;
  log_ref: string;
  seconds: number;
  cost_usd: number;
}

export type EvidenceKind = 'profile' | 'observation' | 'search' | 'objection' | 'lesson';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  claim: string;
  author_role: string;
  source_ref: string | null;
  url: string | null;
  conditions: Record<string, unknown>;
}

export interface Artifact {
  name: string;
  path: string;
  sha256: string;
  contract_ok: boolean;
  findings: string[];
}

export interface CriticFinding {
  id: string;
  artifact: string;
  severity: 'block' | 'warn';
  rule: string;
  message: string;
  reopens_question: string | null;
}

export interface RejectedRecord {
  hypothesis: string;
  question: string;
  evidence_id: string | null;
  reason: string;
}

export interface Report {
  run_id: string;
  artifacts: Artifact[];
  methods_md: string;
  rejected: RejectedRecord[];
  unresolved: string[];
  cost_usd: number;
  seconds: number;
}

export interface RankingRow {
  experiment_id: string;
  kind: string;
  goal: string;
  eig_bits: number;
  est_cost_s: number;
  est_cost_usd: number;
  score: number;
}

export interface CurveFamily {
  mean: number[];
  sd: number[];
  weight: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

/* Payloads, one per event type. */

export interface PayloadMap {
  'run.started': { lab: string; goal: string; config: Record<string, unknown>; started_at: string };
  'profile.done': { evidence: Evidence[] };
  'question.opened': { question: Question };
  'hypothesis.proposed': { hypothesis: Hypothesis };
  'hypothesis.merged': {
    question_id: string;
    kept: string;
    merged: string[];
    priors: Record<string, number>;
  };
  'experiment.proposed': { experiment: Experiment; replay_prior?: Record<string, number> | null };
  'experiment.scored': { question_id: string; ranking: RankingRow[]; chosen: string };
  'experiment.started': { experiment_id: string; question_ids: string[]; kind: string; spec_hash?: string };
  'experiment.log': { experiment_id: string; stream: 'stdout' | 'stderr'; line: string };
  'experiment.finished': { observation: Observation };
  'referee.verdict': { experiment_id: string; valid: boolean; note: string };
  'belief.updated': {
    question_id: string;
    experiment_id: string;
    observed: string | number;
    prior: Record<string, number>;
    posterior: Record<string, number>;
    log_likelihood?: Record<string, number | null>;
  };
  'model.curves': {
    question_id: string;
    x: number[];
    families: Record<string, CurveFamily>;
    points: CurvePoint[];
  };
  'hypothesis.rejected': {
    question_id: string;
    hypothesis_id: string;
    evidence_id: string | null;
    reason: string;
  };
  'question.settled': { question_id: string; hypothesis_id: string; posterior: number };
  'question.robust': { question_id: string; answer_key: string };
  'question.unresolved': { question_id: string; reason: string; top: string[] };
  'surprise.raised': {
    question_id: string;
    experiment_id: string;
    reason: string;
    z_score: number | null;
    null_mass: number | null;
  };
  'search.done': {
    experiment_id: string;
    query: string;
    urls: string[];
    blocked: string[];
    bin_id: string | null;
  };
  'memory.written': { evidence_id: string; author_role: string; backend: string };
  'memory.recalled': {
    reader_role: string;
    query: string;
    evidence_ids: string[];
    authors: string[];
    backend: string;
    latency_ms: number;
  };
  'artifact.written': { artifact: Artifact };
  'critic.finding': { finding: CriticFinding };
  'lesson.written': { lesson: Evidence };
  'budget.tick': {
    cost_usd: number;
    llm_calls: number;
    tokens_in: number;
    tokens_out: number;
    seconds: number;
  };
  'run.finished': { report: Report; status: 'ok' | 'budget_exhausted' | 'stopped' };
  'run.error': { message: string; where: string };
}

export type EventType = keyof PayloadMap;

/* One Letter (labs/oneletter): the dna.* events, per tools/ONE_LETTER_CONTRACT.md.
   Optional fields are the engine's additions (strip numbers for watch runs). */

export interface DnaPayloadMap {
  'dna.request': {
    window: number;
    reason: string;
    eig_bits: number;
    replicate: boolean;
    experiment_id?: string;
    strip?: number;
  };
  'dna.read': {
    experiment_id: string;
    window: number;
    bases: string;
    expected: Record<string, string>;
    /** 0-8 within the window. */
    mismatch_positions: number[];
    confidence: number[];
    /** The hypothesis whose expected string mismatch_positions were measured against. */
    closest?: string;
    bin_id?: string;
    replicate?: boolean;
    strip?: number;
  };
  'dna.variant': {
    hypothesis_id: string;
    name: string;
    hgvs: string;
    legacy: string;
    rsid: string;
    codon: string;
    amino_acid: string;
    source?: string;
  };
  'dna.verdict': {
    hypothesis_id: string;
    name: string;
    posterior: number;
    reads: number;
    text: string;
    author: string;
    latency_ms: number | null;
    pdb_id: string;
    residue: number;
    legacy?: string;
    strip?: number;
  };
  'dna.lesson': { added: string[]; lessons_total: number };
}

export type DnaEventType = keyof DnaPayloadMap;

export const DNA_EVENT_TYPES: readonly DnaEventType[] = [
  'dna.request',
  'dna.read',
  'dna.variant',
  'dna.verdict',
  'dna.lesson',
] as const;

/* Paper & claims (lab "claims"): the paper and its claims, sent once after
   run.started. Each claim is one engine question; its verdict comes from the
   standard question events. */

export interface ClaimSpec {
  question_id: string;
  claim: string;
  /** Substring of the excerpt to highlight, or empty. */
  quote: string;
  kind: 'symbolic' | 'statistical';
  /** A deliberately false claim planted to test the engine. */
  planted: boolean;
}

export interface ClaimsPayloadMap {
  'claims.source': {
    title: string;
    citation: string;
    url: string;
    license: string;
    excerpt: string;
    claims: ClaimSpec[];
  };
}

export type ClaimsEventType = keyof ClaimsPayloadMap;

export const CLAIMS_EVENT_TYPES: readonly ClaimsEventType[] = ['claims.source'] as const;

export const EVENT_TYPES: readonly EventType[] = [
  'run.started',
  'profile.done',
  'question.opened',
  'hypothesis.proposed',
  'hypothesis.merged',
  'experiment.proposed',
  'experiment.scored',
  'experiment.started',
  'experiment.log',
  'experiment.finished',
  'referee.verdict',
  'belief.updated',
  'model.curves',
  'hypothesis.rejected',
  'question.settled',
  'question.robust',
  'question.unresolved',
  'surprise.raised',
  'search.done',
  'memory.written',
  'memory.recalled',
  'artifact.written',
  'critic.finding',
  'lesson.written',
  'budget.tick',
  'run.finished',
  'run.error',
] as const;
