import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { foldAll, foldEvent, initialState, type RunState } from '../fold';
import {
  claimRows,
  claimVerdict,
  excerptLayout,
  findQuote,
  isClaimsLab,
  keyNumber,
  optionLabel,
  ruledOut,
  verdictCounts,
  verdictForKey,
} from '../claims';
import { parseJsonl } from '../../data/sources';
import { CLAIMS_EVENT_TYPES, type RunEvent } from '../../types';

const FIXTURES = fileURLToPath(new URL('../../../public/fixtures/', import.meta.url));
const load = (name: string): RunEvent[] => parseJsonl(readFileSync(`${FIXTURES}${name}.jsonl`, 'utf8'));
// Hand-written UI fixture (web/scripts/make-claims-fixture.mjs), not a recorded run.
const claims = load('demo_claims');
const upTo = (i: number) => foldAll(claims.slice(0, i + 1));
const indexOf = (pred: (e: RunEvent) => boolean) => claims.findIndex(pred);

let seq = 0;
function ev(type: string, payload: unknown): RunEvent {
  return { run_id: 'r-c', seq: seq++, ts: 1000 + seq, type, payload };
}

/** A claims run with one claim and options for every answer key. */
function oneClaim(): RunState {
  seq = 0;
  let s = foldEvent(initialState(), ev('run.started', { lab: 'claims', goal: 'g', config: {} }));
  s = foldEvent(
    s,
    ev('claims.source', {
      title: 'T',
      citation: 'C',
      url: 'https://doi.org/10.1/x',
      license: 'CC BY 4.0',
      excerpt: 'The variance is mu + alpha mu^2. P values are adjusted.',
      claims: [{ question_id: 'q', claim: 'Var is mu + alpha mu^2', quote: 'mu + alpha mu^2', kind: 'symbolic', planted: false }],
    }),
  );
  s = foldEvent(s, ev('question.opened', { question: { id: 'q', text: 'Q?', kind: 'categorical', impact: 1, status: 'open', raised_by: 'reader' } }));
  for (const [i, key] of ['holds', 'fails', 'holds_if', 'alt_param', 'fails_conservative'].entries()) {
    s = foldEvent(
      s,
      ev('hypothesis.proposed', {
        hypothesis: { id: `q-h${i}`, question_id: 'q', statement: `${key} statement`, answer_key: key, is_null: false, prior: 0.17, posterior: 0.17, status: 'active' },
      }),
    );
  }
  return foldEvent(
    s,
    ev('hypothesis.proposed', {
      hypothesis: { id: 'q.h0', question_id: 'q', statement: 'None of these options', answer_key: null, is_null: true, prior: 0.15, posterior: 0.15 },
    }),
  );
}

const settle = (s: RunState, hid: string) => foldEvent(s, ev('question.settled', { question_id: 'q', hypothesis_id: hid, posterior: 0.93 }));

describe('claims.source', () => {
  it('is folded into state.claims and listened for over SSE', () => {
    const s = oneClaim();
    expect(CLAIMS_EVENT_TYPES).toContain('claims.source');
    expect(s.claims?.title).toBe('T');
    expect(s.claims?.url).toBe('https://doi.org/10.1/x');
    expect(s.claims?.claims).toEqual([
      { questionId: 'q', claim: 'Var is mu + alpha mu^2', quote: 'mu + alpha mu^2', kind: 'symbolic', planted: false },
    ]);
    expect(initialState().claims).toBeNull();
  });

  it('drops claims without a question id, duplicate ids and non-http links', () => {
    seq = 0;
    const s = foldEvent(
      initialState(),
      ev('claims.source', {
        url: 'javascript:alert(1)',
        claims: [{ question_id: 'a' }, { claim: 'no id' }, { question_id: 'a', claim: 'again' }, 'junk', { question_id: 'b', planted: true }],
      }),
    );
    expect(s.claims?.url).toBeNull();
    expect(s.claims?.claims.map((c) => [c.questionId, c.claim, c.planted])).toEqual([
      ['a', 'a', false],
      ['b', 'b', true],
    ]);
    expect(s.malformed).toBe(0);
  });

  it('switches to the claims layout only for lab "claims" (or a run that sent claims.source)', () => {
    expect(isClaimsLab(initialState())).toBe(false);
    expect(isClaimsLab(foldAll(claims))).toBe(true);
    for (const name of ['demo_categorical', 'demo_numeric', 'demo_error', 'demo_oneletter']) {
      expect(isClaimsLab(foldAll(load(name))), name).toBe(false);
    }
  });
});

describe('claim verdicts from the standard events', () => {
  it('maps the settled option answer key to the verdict', () => {
    expect(verdictForKey('holds')).toBe('holds');
    expect(verdictForKey('holds_if')).toBe('holds_if');
    for (const k of ['fails', 'alt_param', 'fails_conservative']) expect(verdictForKey(k)).toBe('refuted');
    expect(verdictForKey(' HOLDS ')).toBe('holds');
    expect(verdictForKey(null)).toBe('other');
    expect(verdictForKey('something_else')).toBe('other');
  });

  it('is open, then the verdict of the option the question settles on', () => {
    const s = oneClaim();
    expect(claimVerdict(s.questions.q)).toBe('open');
    expect(claimVerdict(undefined)).toBe('open');
    expect(claimVerdict(settle(s, 'q-h0').questions.q)).toBe('holds');
    expect(claimVerdict(settle(s, 'q-h1').questions.q)).toBe('refuted');
    expect(claimVerdict(settle(s, 'q-h2').questions.q)).toBe('holds_if');
    expect(claimVerdict(settle(s, 'q-h3').questions.q)).toBe('refuted');
    expect(claimVerdict(settle(s, 'q-h4').questions.q)).toBe('refuted');
    expect(claimVerdict(settle(s, 'q.h0').questions.q)).toBe('other');
  });

  it('is unresolved after question.unresolved, robust follows its answer key, and a surprise reopens it', () => {
    const s = oneClaim();
    expect(claimVerdict(foldEvent(s, ev('question.unresolved', { question_id: 'q', reason: 'out of experiments', top: [] })).questions.q)).toBe(
      'unresolved',
    );
    expect(claimVerdict(foldEvent(s, ev('question.robust', { question_id: 'q', answer_key: 'holds' })).questions.q)).toBe('holds');
    const settled = settle(s, 'q-h0');
    const reopened = foldEvent(settled, ev('surprise.raised', { question_id: 'q', experiment_id: 'e', reason: 'odd', z_score: null, null_mass: 0.6 }));
    expect(claimVerdict(reopened.questions.q)).toBe('open');
  });

  it('is refuted once the claim\'s own holds option is rejected and no holds-if option stands', () => {
    const reject = (s: RunState, hid: string) =>
      foldEvent(s, ev('hypothesis.rejected', { question_id: 'q', hypothesis_id: hid, reason: 'posterior below 0.02', evidence_id: 'ev-1' }));
    const unresolved = (s: RunState) =>
      foldEvent(s, ev('question.unresolved', { question_id: 'q', reason: 'no informative experiment left', top: [] }));
    // holds rejected, but "holds only if" still standing: not refuted yet
    const holdsOnly = reject(oneClaim(), 'q-h0');
    expect(claimVerdict(unresolved(holdsOnly).questions.q)).toBe('unresolved');
    // holds and holds-if both rejected: the claim is refuted even though the question ends unresolved
    const both = reject(holdsOnly, 'q-h2');
    expect(claimVerdict(both.questions.q)).toBe('refuted');
    expect(claimVerdict(unresolved(both).questions.q)).toBe('refuted');
  });

  it('labels options by answer key', () => {
    const q = oneClaim().questions.q!;
    expect(q.optionOrder.map((id) => optionLabel(q.options[id]!))).toEqual([
      'Holds',
      'Fails',
      'Holds if…',
      'Other parameter',
      'Conservative',
      'None of these',
    ]);
  });
});

describe('the recorded claims run (runs/demo/claims_deseq2.jsonl)', () => {
  it('shows the four verdicts the engine reached', () => {
    const recorded = parseJsonl(
      readFileSync(fileURLToPath(new URL('../../../../runs/demo/claims_deseq2.jsonl', import.meta.url)), 'utf8'),
    );
    const s = foldAll(recorded);
    const verdicts = Object.fromEntries(
      ['claim-nb-variance', 'claim-wald-calibration', 'claim-bh-fdr', 'claim-bh-fwer'].map((id) => [id, claimVerdict(s.questions[id])]),
    );
    expect(verdicts).toEqual({
      'claim-nb-variance': 'holds',
      'claim-wald-calibration': 'holds_if',
      'claim-bh-fdr': 'holds',
      // its holds option was rejected by the counterexample; the question itself ended unresolved
      'claim-bh-fwer': 'refuted',
    });
  });
});

describe('the demo_claims fixture', () => {
  it('follows the event contract: seq from 0, claims.source right after run.started, one terminal event', () => {
    claims.forEach((e, i) => {
      expect(e.seq).toBe(i);
      expect(e.run_id).toBe('demo_claims');
      if (i > 0) expect(e.ts).toBeGreaterThanOrEqual(claims[i - 1]!.ts);
    });
    expect(claims[0]?.type).toBe('run.started');
    expect((claims[0]?.payload as { lab: string }).lab).toBe('claims');
    expect((claims[0]?.payload as { config: { fixture: boolean } }).config.fixture).toBe(true);
    expect(claims[1]?.type).toBe('claims.source');
    expect(claims.filter((e) => e.type === 'claims.source')).toHaveLength(1);
    expect(claims.filter((e) => e.type === 'run.finished' || e.type === 'run.error')).toHaveLength(1);
    expect(claims.at(-1)?.type).toBe('run.finished');
    const src = claims[1]!.payload as { excerpt: string; claims: { quote: string }[] };
    for (const c of src.claims) expect(c.quote === '' || src.excerpt.includes(c.quote)).toBe(true);
  });

  it('ends with the four expected verdicts', () => {
    const s = foldAll(claims);
    const rows = claimRows(s);
    expect(rows.map((r) => [r.claim.questionId, r.claim.kind, r.claim.planted, r.verdict])).toEqual([
      ['claim-nb_variance', 'symbolic', false, 'holds'],
      ['claim-wald_calibration', 'statistical', false, 'holds_if'],
      ['claim-bh_fdr', 'statistical', false, 'holds'],
      ['claim-bh_fwer', 'statistical', true, 'refuted'],
    ]);
    expect(verdictCounts(rows)).toMatchObject({ holds: 2, holds_if: 1, refuted: 1, open: 0, unresolved: 0 });
    expect(rows.every((r) => !r.extra)).toBe(true);
    expect(rows.map((r) => r.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('starts every claim open and labels claims C1.. until their questions open', () => {
    const src = upTo(indexOf((e) => e.type === 'claims.source'));
    const rows = claimRows(src);
    expect(rows.map((r) => [r.label, r.verdict, r.question])).toEqual([
      ['C1', 'open', null],
      ['C2', 'open', null],
      ['C3', 'open', null],
      ['C4', 'open', null],
    ]);
    const opened = claimRows(upTo(indexOf((e) => e.type === 'experiment.scored') - 1));
    expect(opened.every((r) => r.verdict === 'open' && r.options.length > 0 && r.evidence === null)).toBe(true);
  });

  it('marks the claim under test while its diagnostic runs', () => {
    const started = indexOf((e) => e.type === 'experiment.started');
    const rows = claimRows(upTo(started));
    expect(rows.filter((r) => r.testing).map((r) => r.claim.questionId)).toEqual(['claim-wald_calibration']);
  });

  it('gives the deciding evidence once settled: goal, observed bin, key number, referee, posterior', () => {
    const rows = claimRows(foldAll(claims));
    const fwer = rows[3]!;
    expect(fwer.accepted?.answerKey).toBe('fails');
    expect(fwer.posterior).toBeCloseTo(0.9538, 3);
    expect(fwer.evidence).toMatchObject({
      experimentId: 'claim-bh_fwer-d0',
      binId: 'exceeded',
      binText: 'FWER above 0.20',
      key: { key: 'fwer', value: 1 },
      referee: { valid: true },
    });
    expect(fwer.evidence?.goal).toMatch(/5,000 genes/);
    const wald = rows[1]!;
    expect(wald.accepted?.answerKey).toBe('holds_if');
    expect(wald.evidence).toMatchObject({ binId: 'calibrated', key: { key: 'type1_error', value: 0.0505 } });
    expect(rows[0]!.evidence?.key).toEqual({ key: 'rel_error', value: -0.0038 });
  });

  it('groups rejected options by the diagnostic that ruled them out', () => {
    const s = foldAll(claims);
    const groups = ruledOut(s, 'claim-wald_calibration');
    expect(groups.map((g) => [g.options.map((o) => o.label), g.how])).toEqual([
      [['Holds', 'Conservative'], 'Re-run the gene-wise dispersion simulation with 3 vs 3 replicates; type I error at 0.05 → type I error above 0.06'],
      [['Fails'], 'Same simulation with dispersions shrunk towards the fitted mean-dispersion trend (the DESeq2 default) → type I error 0.04 to 0.06'],
    ]);
    expect(groups[0]!.reasons[0]).toMatch(/fell below 0\.02/);
    const planted = claimRows(s)[3]!;
    expect(planted.ruledOut.map((g) => g.options.map((o) => o.label))).toEqual([['Holds']]);
    // The same rows feed the rejected ledger.
    expect(s.rejected.filter((r) => r.questionId === 'claim-bh_fwer').map((r) => r.hypothesisId)).toEqual(['claim-bh_fwer-h0']);
  });

  it('never updates beliefs on a diagnostic the referee ruled invalid', () => {
    const invalid = indexOf((e) => e.type === 'referee.verdict' && !(e.payload as { valid: boolean }).valid);
    expect(invalid).toBeGreaterThan(0);
    const s = upTo(invalid);
    expect(s.experiments['claim-wald_calibration-d0']?.status).toBe('invalid');
    expect(s.questions['claim-wald_calibration']?.updates).toBe(0);
    const id = (claims[invalid]!.payload as { experiment_id: string }).experiment_id;
    expect(claims.some((e) => e.type === 'belief.updated' && (e.payload as { experiment_id: string }).experiment_id === id)).toBe(false);
  });
});

describe('key number from an observation', () => {
  const exp = (value: unknown, rule = '') =>
    ({
      id: 'e',
      bins: [{ id: 'b', description: 'd', rule }],
      observation: { experiment_id: 'e', valid: true, value, bin_id: 'b', surprise: 0, referee_note: '', log_ref: '', seconds: 0, cost_usd: 0 },
    }) as never;
  it('prefers the field named in the observed bin rule, then a statistic-like name, then the first number', () => {
    expect(keyNumber(exp({ n: 5, fwer: 0.3, rate: 0.1 }, 'fwer > 0.2'))).toEqual({ key: 'fwer', value: 0.3 });
    expect(keyNumber(exp({ n: 5, error_rate: 0.1 }))).toEqual({ key: 'error_rate', value: 0.1 });
    expect(keyNumber(exp({ label: 'x', n: 5 }))).toEqual({ key: 'n', value: 5 });
    expect(keyNumber(exp(4.2))).toEqual({ key: 'value', value: 4.2 });
    expect(keyNumber(exp({ label: 'x' }))).toBeNull();
    expect(keyNumber(undefined)).toBeNull();
  });
});

describe('excerpt highlighting', () => {
  it('finds quotes exactly, or ignoring case and whitespace', () => {
    expect(findQuote('a Wald test here', 'Wald test')).toEqual([2, 11]);
    expect(findQuote('a Wald\n  TEST here', 'wald test')).toEqual([2, 13]);
    expect(findQuote('abc', '')).toBeNull();
    expect(findQuote('abc', 'xyz')).toBeNull();
    expect(findQuote('a (b) c', '(b)')).toEqual([2, 5]);
  });

  it('splits the excerpt into plain and highlighted runs with a chip after each quote', () => {
    const text = 'one two three four five';
    const { segments, placed } = excerptLayout(text, ['two three', '', 'four', 'missing']);
    expect(placed).toEqual([true, false, true, false]);
    expect(segments.map((s) => [s.text, s.lead, s.ends])).toEqual([
      ['one ', null, []],
      ['two three', 0, [0]],
      [' ', null, []],
      ['four', 2, [2]],
      [' five', null, []],
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });

  it('nests overlapping quotes and gives repeated quotes successive occurrences', () => {
    const nested = excerptLayout('the false discovery rate is controlled', ['false discovery rate is controlled', 'discovery rate']);
    expect(nested.segments.map((s) => [s.text, s.covers, s.lead, s.ends])).toEqual([
      ['the ', [], null, []],
      ['false ', [0], 0, []],
      ['discovery rate', [0, 1], 1, [1]],
      [' is controlled', [0], 0, [0]],
    ]);
    const twice = excerptLayout('BH here and BH there', ['BH', 'BH']);
    expect(twice.segments.filter((s) => s.lead !== null).map((s) => s.lead)).toEqual([0, 1]);
  });

  it('highlights every quoted claim in the fixture', () => {
    const s = foldAll(claims);
    const rows = claimRows(s);
    const layout = excerptLayout(s.claims!.excerpt, rows.map((r) => r.claim.quote));
    expect(layout.placed).toEqual([true, true, true, true]);
    expect(layout.segments.map((x) => x.text).join('')).toBe(s.claims!.excerpt);
  });
});

describe('without claims.source', () => {
  it('shows each question as a claim', () => {
    seq = 0;
    let s = foldEvent(initialState(), ev('run.started', { lab: 'claims', goal: 'g', config: {} }));
    s = foldEvent(s, ev('question.opened', { question: { id: 'qa', text: 'Does A hold?', kind: 'categorical', impact: 1, status: 'open', raised_by: 'x' } }));
    expect(isClaimsLab(s)).toBe(true);
    expect(claimRows(s).map((r) => [r.label, r.claim.claim, r.extra])).toEqual([['Q1', 'Does A hold?', false]]);
  });

  it('lists questions the paper did not mention after its claims', () => {
    let s = oneClaim();
    s = foldEvent(s, ev('question.opened', { question: { id: 'other', text: 'Critic question', kind: 'categorical', impact: 1, status: 'open', raised_by: 'critic' } }));
    expect(claimRows(s).map((r) => [r.claim.questionId, r.extra])).toEqual([
      ['q', false],
      ['other', true],
    ]);
  });
});
