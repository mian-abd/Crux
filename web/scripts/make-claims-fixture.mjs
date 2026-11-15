// Generates the Paper & claims UI fixture (lab "claims"):
//
//   node scripts/make-claims-fixture.mjs
//
// Writes web/fixtures/demo_claims.jsonl and web/public/fixtures/demo_claims.jsonl
// (identical). This is a hand-specified fixture for UI development and tests,
// not a recorded run: run.started carries config.fixture = true and the goal
// says so. The recorded run (runs/demo/claims_deseq2.jsonl, an API replay)
// replaces it in the demo.
//
// Only the scenario is hand-written (claims, options, diagnostics, likelihood
// tables and which bin each diagnostic observes). Everything numeric follows
// the engine: EIG and score as in docs/ERD.md section 6.1 (null option left
// out of the EIG while two real options remain), Bayes updates, rejection
// below 0.02 with the rest renormalised (core/replay.py), settling at 0.9, and
// the question order by impact x entropy (core/orchestrator.py). Output is
// deterministic.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTS = [resolve(WEB, 'fixtures/demo_claims.jsonl'), resolve(WEB, 'public/fixtures/demo_claims.jsonl')];

const RUN_ID = 'demo_claims';
const SETTLE = 0.9;
const REJECT_BELOW = 0.02;
const MIN_EIG = 0.05;
const MAX_EXPERIMENTS = 4;
const NULL_PRIOR = 0.15;

const r4 = (x) => Math.round(x * 10000) / 10000;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

/* ------------------------------------------------------------------ */
/* The paper                                                           */
/* ------------------------------------------------------------------ */

const EXCERPT =
  'We model the read count of each gene in each sample with a negative binomial distribution ' +
  'with mean μ and a gene-specific dispersion α, so that the variance of a count is μ + αμ². ' +
  'Gene-wise dispersion estimates are shrunk towards a trend fitted over all genes by their mean, ' +
  'which stabilises them when there are few replicates. To test for differential expression, the ' +
  'estimated log2 fold change is divided by its standard error, and the resulting Wald statistic ' +
  'is compared against a standard normal distribution. P values from the genes that pass ' +
  'independent filtering are adjusted for multiple testing with the procedure of Benjamini and ' +
  'Hochberg, which controls the false discovery rate.';

/* ------------------------------------------------------------------ */
/* Claims: options, diagnostics and what each diagnostic observes      */
/* ------------------------------------------------------------------ */

const CLAIMS = [
  {
    id: 'claim-nb_variance',
    impact: 0.7,
    kind: 'symbolic',
    planted: false,
    quote: 'the variance of a count is μ + αμ²',
    claim: 'Under the negative binomial model, the variance of a count is μ + αμ² (mean μ, dispersion α).',
    text: 'Is the variance of a negative binomial count with mean μ and dispersion α equal to μ + αμ²?',
    options: [
      ['holds', 'Var(K) = μ + αμ² exactly: a gamma-Poisson mixture with shape 1/α has this variance.', 'mathematician'],
      ['fails', 'The variance is not μ + αμ²; the quadratic term has another form.', 'statistician'],
      ['alt_param', 'The variance is μ + μ²/α (α a size parameter), so the formula holds only after inverting α.', 'statistician'],
    ],
    experiments: [
      {
        suffix: 'd0',
        kind: 'compute',
        goal: 'Derive Var(K) symbolically for K ~ Poisson(λ), λ ~ Gamma(shape 1/α, scale αμ) and compare it with μ + αμ²',
        cost: 4,
        bins: [
          ['identity', 'difference simplifies to 0', 'residual == 0 for var - (mu + alpha*mu**2)'],
          ['size_form', 'equals μ + μ²/α instead', 'residual == 0 for var - (mu + mu**2/alpha)'],
          ['other', 'neither form', 'otherwise'],
        ],
        lik: { holds: [0.98, 0.01, 0.01], fails: [0.01, 0.04, 0.95], alt_param: [0.01, 0.98, 0.01] },
        observe: 'identity',
        value: { residual: 0, variance: 'alpha*mu**2 + mu', terms_checked: 2 },
        logs: ['sympy 1.13: E[K] = mu, E[K^2] = alpha*mu**2 + mu**2 + mu', 'var - (mu + alpha*mu**2) -> 0'],
        referee:
          'The script derives the variance with `sympy` from the law of total variance (`E[Var(K|λ)] + Var(E[K|λ])`) and checks `simplify(var - (mu + alpha*mu**2)) == 0`; the bin follows from that residual.',
      },
      {
        suffix: 'd1',
        kind: 'compute',
        goal: 'Draw 200,000 gamma-Poisson counts at μ = 50, α = 0.2 and compare the sample variance with μ + αμ² = 550',
        cost: 12,
        bins: [
          ['matches', 'within 2% of μ + αμ²', 'abs(rel_error) <= 0.02'],
          ['differs', 'off by more than 2%', 'abs(rel_error) > 0.02'],
        ],
        lik: { holds: [0.95, 0.05], fails: [0.1, 0.9], alt_param: [0.05, 0.95] },
        observe: 'matches',
        value: { sample_variance: 547.9, expected: 550, rel_error: -0.0038, draws: 200000 },
        logs: ['seed 0: 200000 draws, mean 50.02', 'sample variance 547.9 vs 550.0'],
        referee:
          'Counts are drawn as `rng.poisson(rng.gamma(1/alpha, alpha*mu, size=n))` with `n = 200_000`, and `rel_error = (np.var(k, ddof=1) - 550) / 550`; the reported bin matches that value.',
      },
    ],
  },
  {
    id: 'claim-wald_calibration',
    impact: 0.9,
    kind: 'statistical',
    planted: false,
    quote: 'compared against a standard normal distribution',
    claim:
      'With three replicates per condition, Wald test P values are calibrated: under the null, about 5% fall below 0.05.',
    text: 'With three replicates per group, are DESeq2 Wald P values calibrated under the null?',
    options: [
      ['holds', 'Calibrated at n = 3 whatever the dispersion estimate: the type I error is about 5%.', 'statistician'],
      ['fails', 'Anti-conservative at n = 3: the type I error is well above 5% even with shrunken dispersions.', 'bioinformatician'],
      [
        'holds_if',
        'Calibrated only when dispersions are shrunk towards the fitted trend, as DESeq2 does; gene-wise estimates make the test anti-conservative.',
        'statistician',
      ],
      ['fails_conservative', 'Conservative at n = 3: the type I error is well below 5%.', 'bioinformatician'],
    ],
    experiments: [
      {
        suffix: 'd0',
        kind: 'compute',
        goal: 'Simulate 2,000 null genes, 3 vs 3 replicates, gene-wise dispersions; type I error of the Wald test at 0.05',
        cost: 15,
        bins: [
          ['calibrated', 'type I error 0.04 to 0.06', '0.04 <= type1_error <= 0.06'],
          ['anti_conservative', 'type I error above 0.06', 'type1_error > 0.06'],
          ['conservative', 'type I error below 0.04', 'type1_error < 0.04'],
        ],
        lik: {
          holds: [0.98, 0.01, 0.01],
          fails: [0.01, 0.98, 0.01],
          holds_if: [0.01, 0.98, 0.01],
          fails_conservative: [0.01, 0.01, 0.98],
        },
        observe: 'anti_conservative',
        value: { type1_error: 0.087, n_genes: 2000, n_rejected: 174, replicates: 2 },
        logs: ['simulating 2000 null genes, replicates per group = 2', 'Wald test at alpha 0.05: 174 of 2000 rejected'],
        // The referee catches the replicate count: no belief update follows.
        invalid:
          'The code sets `n_rep = 2`, so it simulates two replicates per group, not the three the claim states; the result does not test this claim.',
      },
      {
        suffix: 'd1',
        kind: 'compute',
        goal: 'Same simulation with dispersions shrunk towards the fitted mean-dispersion trend (the DESeq2 default)',
        cost: 18,
        bins: [
          ['calibrated', 'type I error 0.04 to 0.06', '0.04 <= type1_error <= 0.06'],
          ['anti_conservative', 'type I error above 0.06', 'type1_error > 0.06'],
          ['conservative', 'type I error below 0.04', 'type1_error < 0.04'],
        ],
        lik: {
          holds: [0.98, 0.01, 0.01],
          fails: [0.01, 0.98, 0.01],
          holds_if: [0.98, 0.01, 0.01],
          fails_conservative: [0.01, 0.01, 0.98],
        },
        observe: 'calibrated',
        value: { type1_error: 0.0505, n_genes: 2000, n_rejected: 101, replicates: 3 },
        logs: ['fitting mean-dispersion trend over 2000 genes', 'Wald test at alpha 0.05: 101 of 2000 rejected'],
        referee:
          'The script fits the dispersion trend, shrinks gene-wise estimates towards it with `n_rep = 3`, and computes `type1_error = np.mean(p < 0.05)` over 2,000 null genes; the bin follows from the rule.',
      },
      {
        suffix: 'd2',
        kind: 'compute',
        goal: 'Compare Wald and likelihood-ratio test rejections on 500 simulated null genes',
        cost: 20,
        bins: [
          ['agree', 'rejection sets agree on 95% or more of genes', 'agreement >= 0.95'],
          ['disagree', 'agreement below 95%', 'agreement < 0.95'],
        ],
        lik: { holds: [0.7, 0.3], fails: [0.4, 0.6], holds_if: [0.6, 0.4], fails_conservative: [0.5, 0.5] },
      },
      {
        suffix: 'd3',
        kind: 'compute',
        goal: 'Re-run the gene-wise dispersion simulation with 3 vs 3 replicates; type I error at 0.05',
        cost: 15,
        // Proposed again after the referee ruled d0 invalid.
        after: 'd0',
        bins: [
          ['calibrated', 'type I error 0.04 to 0.06', '0.04 <= type1_error <= 0.06'],
          ['anti_conservative', 'type I error above 0.06', 'type1_error > 0.06'],
          ['conservative', 'type I error below 0.04', 'type1_error < 0.04'],
        ],
        lik: {
          holds: [0.98, 0.01, 0.01],
          fails: [0.01, 0.98, 0.01],
          holds_if: [0.01, 0.98, 0.01],
          fails_conservative: [0.01, 0.01, 0.98],
        },
        observe: 'anti_conservative',
        value: { type1_error: 0.0815, n_genes: 2000, n_rejected: 163, replicates: 3 },
        logs: ['simulating 2000 null genes, replicates per group = 3', 'Wald test at alpha 0.05: 163 of 2000 rejected'],
        referee:
          'With `n_rep = 3` and gene-wise dispersion MLEs, the code computes `type1_error = np.mean(p < 0.05)` over 2,000 null genes; 163 / 2000 = 0.0815 falls in the anti-conservative bin.',
      },
    ],
  },
  {
    id: 'claim-bh_fdr',
    impact: 0.8,
    kind: 'statistical',
    planted: false,
    quote: 'controls the false discovery rate',
    claim:
      'Benjamini-Hochberg adjusted P values control the false discovery rate: among genes with padj < 0.1, at most about 10% are false on average.',
    text: 'Does the Benjamini-Hochberg adjustment keep the false discovery rate at or below 10% (padj < 0.1)?',
    options: [
      ['holds', 'BH keeps the realised FDR at or below 10% for DESeq2 Wald P values.', 'statistician'],
      ['fails', 'The realised FDR exceeds 10%: DESeq2 P values break the BH guarantee.', 'bioinformatician'],
      ['holds_if', 'BH controls the FDR only after independent filtering removes low-count genes.', 'bioinformatician'],
    ],
    experiments: [
      {
        suffix: 'd0',
        kind: 'compute',
        goal: 'Simulate 200 datasets of 5,000 genes (10% DE, 3 vs 3) with independent filtering; realised FDR among padj < 0.1',
        cost: 30,
        bins: [
          ['controlled', 'FDR at or below 0.10', 'realised_fdr <= 0.10'],
          ['slightly_over', 'FDR 0.10 to 0.12', '0.10 < realised_fdr <= 0.12'],
          ['inflated', 'FDR above 0.12', 'realised_fdr > 0.12'],
        ],
        lik: { holds: [0.95, 0.04, 0.01], fails: [0.03, 0.17, 0.8], holds_if: [0.9, 0.08, 0.02] },
        observe: 'controlled',
        value: { realised_fdr: 0.083, nominal: 0.1, datasets: 200, mean_discoveries: 312.4 },
        logs: ['200 datasets x 5000 genes, 500 DE per dataset', 'mean discoveries 312.4, realised FDR 0.083'],
        referee:
          'The script runs DESeq2-style Wald tests with BH adjustment on each simulated dataset and averages `false_pos / max(discoveries, 1)`; 0.083 is at or below 0.10.',
      },
      {
        suffix: 'd1',
        kind: 'compute',
        goal: 'Repeat with independent filtering switched off and 30% of genes at low counts',
        cost: 30,
        bins: [
          ['controlled', 'FDR at or below 0.10', 'realised_fdr <= 0.10'],
          ['slightly_over', 'FDR 0.10 to 0.12', '0.10 < realised_fdr <= 0.12'],
          ['inflated', 'FDR above 0.12', 'realised_fdr > 0.12'],
        ],
        lik: { holds: [0.95, 0.04, 0.01], fails: [0.03, 0.17, 0.8], holds_if: [0.03, 0.17, 0.8] },
        observe: 'controlled',
        value: { realised_fdr: 0.091, nominal: 0.1, datasets: 200, mean_discoveries: 288.7 },
        logs: ['independent filtering off; 1500 low-count genes per dataset', 'mean discoveries 288.7, realised FDR 0.091'],
        referee:
          'Filtering is disabled (`independent_filtering=False`) and 30% of genes are drawn with mean count below 5; the realised FDR is averaged over 200 datasets as before.',
      },
    ],
  },
  {
    id: 'claim-bh_fwer',
    impact: 0.8,
    kind: 'statistical',
    planted: true,
    quote: 'adjusted for multiple testing with the procedure of Benjamini and Hochberg',
    claim:
      'Calling genes with BH-adjusted P below 0.1 also keeps the family-wise error rate, the chance of any false positive, at 10%.',
    text: 'Does calling genes at BH-adjusted P < 0.1 keep the family-wise error rate at 10%?',
    options: [
      ['holds', 'Yes: BH at 0.1 keeps the chance of any false positive at or below 10%.', 'proposer'],
      [
        'fails',
        'No: BH controls the FDR, not the FWER; once some genes are DE, at least one false positive is almost certain.',
        'statistician',
      ],
    ],
    experiments: [
      {
        suffix: 'd0',
        kind: 'compute',
        goal: 'Simulate 500 datasets of 5,000 genes (10% DE); share of datasets with any false positive at padj < 0.1',
        cost: 30,
        bins: [
          ['controlled', 'FWER at or below 0.10', 'fwer <= 0.10'],
          ['borderline', 'FWER 0.10 to 0.20', '0.10 < fwer <= 0.20'],
          ['exceeded', 'FWER above 0.20', 'fwer > 0.20'],
        ],
        lik: { holds: [0.9, 0.08, 0.02], fails: [0.02, 0.08, 0.9] },
        observe: 'exceeded',
        value: { fwer: 1.0, datasets: 500, mean_false_positives: 30.2 },
        logs: ['500 datasets x 5000 genes, 500 DE per dataset', 'datasets with >= 1 false positive: 500 of 500'],
        referee:
          'The code counts datasets where any null gene has `padj < 0.1` and divides by 500; every dataset has false positives (mean 30.2), so `fwer = 1.0`.',
      },
      {
        suffix: 'd1',
        kind: 'compute',
        goal: 'Smaller family: 1,000 datasets of 50 genes with 5 DE; share with any false positive at padj < 0.1',
        cost: 10,
        bins: [
          ['controlled', 'FWER at or below 0.10', 'fwer <= 0.10'],
          ['borderline', 'FWER 0.10 to 0.20', '0.10 < fwer <= 0.20'],
          ['exceeded', 'FWER above 0.20', 'fwer > 0.20'],
        ],
        lik: { holds: [0.9, 0.08, 0.02], fails: [0.02, 0.08, 0.9] },
        observe: 'exceeded',
        value: { fwer: 0.341, datasets: 1000, mean_false_positives: 0.47 },
        logs: ['1000 datasets x 50 genes, 5 DE per dataset', 'datasets with >= 1 false positive: 341 of 1000'],
        referee:
          'Each dataset has 45 null and 5 DE genes; the script records whether any null gene reaches `padj < 0.1`; 341 of 1,000 datasets do, so `fwer = 0.341`.',
      },
      {
        suffix: 'd2',
        kind: 'compute',
        goal: 'Complete null: 500 datasets with no DE genes; share with any padj < 0.1',
        cost: 30,
        bins: [
          ['controlled', 'FWER at or below 0.10', 'fwer <= 0.10'],
          ['borderline', 'FWER 0.10 to 0.20', '0.10 < fwer <= 0.20'],
          ['exceeded', 'FWER above 0.20', 'fwer > 0.20'],
        ],
        lik: { holds: [0.9, 0.08, 0.02], fails: [0.85, 0.12, 0.03] },
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Engine arithmetic                                                   */
/* ------------------------------------------------------------------ */

const log2 = (x) => Math.log(x) / Math.LN2;
const entropy = (ps) => -ps.reduce((a, p) => (p > 0 ? a + p * log2(p) : a), 0);

function normalise(m) {
  const z = Object.values(m).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v / z]));
}

/** EIG over the real options (null left out while two real options remain). */
function eig(belief, table, nullId) {
  let ids = Object.keys(belief).filter((h) => h !== nullId);
  if (ids.length < 2) ids = Object.keys(belief);
  const w = normalise(Object.fromEntries(ids.map((h) => [h, belief[h]])));
  const bins = Object.keys(table[ids[0]]);
  const pbar = bins.map((b) => ids.reduce((a, h) => a + w[h] * table[h][b], 0));
  return Math.max(0, entropy(pbar) - ids.reduce((a, h) => a + w[h] * entropy(bins.map((b) => table[h][b])), 0));
}

const score = (bits, impact, costS) => (impact * bits) / (1 + (0.2 * costS) / 60);

/* ------------------------------------------------------------------ */
/* Recorder                                                            */
/* ------------------------------------------------------------------ */

const T0 = 1794796200; // 2026-11-15T03:50:00Z
let t = T0;
let seq = 0;
const events = [];
const budget = { cost: 0, calls: 0, tin: 0, tout: 0 };

function emit(type, payload, dt = 0.4) {
  t += dt;
  // Snapshot the payload: beliefs are mutated after they are emitted.
  events.push({ run_id: RUN_ID, seq: seq++, ts: Math.round(t * 1000) / 1000, type, payload: JSON.parse(JSON.stringify(payload)) });
}

function llm(usd, tin, tout, dt = 0.6) {
  budget.cost += usd;
  budget.calls += 1;
  budget.tin += tin;
  budget.tout += tout;
  emit(
    'budget.tick',
    {
      cost_usd: r6(budget.cost),
      llm_calls: budget.calls,
      tokens_in: budget.tin,
      tokens_out: budget.tout,
      seconds: r6(t + dt - T0),
    },
    dt,
  );
}

/* ------------------------------------------------------------------ */
/* Script                                                              */
/* ------------------------------------------------------------------ */

emit(
  'run.started',
  {
    lab: 'claims',
    goal: 'UI fixture (hand-written, not a recorded run): audit four mathematical and statistical claims from the DESeq2 methods (Love, Huber & Anders 2014), one of them planted.',
    config: {
      fixture: true,
      selection: 'eig',
      proposers: 3,
      critic: true,
      predictor: 'sampled',
      memory: 'pastdev',
      search: false,
      lessons: false,
      null_hypothesis: true,
      settle: SETTLE,
      min_eig_bits: MIN_EIG,
      max_experiments_per_question: MAX_EXPERIMENTS,
      reject_below: REJECT_BELOW,
      null_prior: NULL_PRIOR,
      cost_lambda: 0.2,
      seed: 0,
    },
    started_at: new Date(T0 * 1000).toISOString(),
  },
  0,
);

emit('claims.source', {
  title: 'Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2',
  citation: 'Love, Huber & Anders (2014) Genome Biology 15:550',
  url: 'https://doi.org/10.1186/s13059-014-0550-8',
  license: 'CC BY 4.0',
  excerpt: EXCERPT,
  claims: CLAIMS.map((c) => ({ question_id: c.id, claim: c.claim, quote: c.quote, kind: c.kind, planted: c.planted })),
});
llm(0.0041, 3120, 640, 1.4);
emit('profile.done', {
  evidence: [
    {
      id: 'paper-methods',
      kind: 'profile',
      claim: 'DESeq2 methods excerpt (CC BY 4.0): 4 claims to audit, 1 symbolic and 3 statistical; one claim is a planted test.',
      author_role: 'reader',
      source_ref: 'https://doi.org/10.1186/s13059-014-0550-8',
      url: 'https://doi.org/10.1186/s13059-014-0550-8',
      conditions: {},
    },
  ],
});

// Questions and options.
const state = {};
for (const c of CLAIMS) {
  emit('question.opened', {
    question: { id: c.id, text: c.text, kind: 'categorical', impact: c.impact, status: 'open', raised_by: 'reader' },
  });
  const real = (1 - NULL_PRIOR) / c.options.length;
  const ids = {};
  const priors = {};
  c.options.forEach(([key, statement, author], i) => {
    const id = `${c.id}-h${i}`;
    ids[key] = id;
    priors[id] = real;
    emit(
      'hypothesis.proposed',
      {
        hypothesis: {
          id,
          question_id: c.id,
          statement,
          author,
          rationale: `Reading of the methods passage for: ${c.claim}`,
          answer_key: key,
          model_code: null,
          is_null: false,
          prior: real,
          posterior: real,
          status: 'active',
          rejected_by: [],
        },
      },
      0.15,
    );
  });
  const nullId = `${c.id}.h0`;
  priors[nullId] = NULL_PRIOR;
  emit(
    'hypothesis.proposed',
    {
      hypothesis: {
        id: nullId,
        question_id: c.id,
        statement: 'None of these options',
        author: 'orchestrator',
        rationale: 'Catches outcomes that no proposed option predicts.',
        answer_key: null,
        model_code: null,
        is_null: true,
        prior: NULL_PRIOR,
        posterior: NULL_PRIOR,
        status: 'active',
        rejected_by: [],
      },
    },
    0.15,
  );
  emit('hypothesis.merged', { question_id: c.id, kept: '', merged: [], priors }, 0.1);
  llm(0.0062, 4200, 1180, 0.8);
  state[c.id] = { c, ids, nullId, belief: { ...priors }, proposed: new Set(), spent: new Set(), runs: 0, status: 'open' };
}

const tables = {};
function table(s, e) {
  const out = {};
  for (const [key, row] of Object.entries(e.lik)) {
    out[s.ids[key]] = Object.fromEntries(e.bins.map(([b], i) => [b, row[i]]));
  }
  out[s.nullId] = Object.fromEntries(e.bins.map(([b]) => [b, 1 / e.bins.length]));
  return out;
}

function propose(s, e) {
  const id = `${s.c.id}-${e.suffix}`;
  tables[id] = table(s, e);
  s.proposed.add(e.suffix);
  emit(
    'experiment.proposed',
    {
      experiment: {
        id,
        question_ids: [s.c.id],
        kind: e.kind,
        goal: e.goal,
        language: 'python',
        code: `# ${e.goal}\n# (fixture: code omitted)\n`,
        query: null,
        design: { claim: s.c.id, diagnostic: e.suffix },
        bins: e.bins.map(([bid, description, rule]) => ({ id: bid, description, rule })),
        likelihood: tables[id],
        likelihood_source: 'sampled',
        est_cost_s: e.cost,
        est_cost_usd: 0,
        eig_bits: null,
        score: null,
        spec_hash: null,
        status: 'proposed',
      },
    },
    0.2,
  );
}

let evidenceN = 0;
const rejected = [];

function reject(s, eid) {
  for (const [hid, p] of Object.entries(s.belief)) {
    if (hid === s.nullId || p >= REJECT_BELOW) continue;
    const reason = `posterior ${p.toFixed(4)} fell below ${REJECT_BELOW} after ${eid} observed '${s.lastBin}'`;
    const evidenceId = `ev-${String(evidenceN).padStart(3, '0')}`;
    emit('hypothesis.rejected', { question_id: s.c.id, hypothesis_id: hid, evidence_id: evidenceId, reason }, 0.1);
    rejected.push({ hypothesis: hid, question: s.c.id, evidence_id: evidenceId, reason });
    delete s.belief[hid];
    s.belief = normalise(s.belief);
  }
}

function round(s) {
  const { c } = s;
  for (const e of c.experiments) if (!s.proposed.has(e.suffix) && (!e.after || s.spent.has(e.after))) propose(s, e);
  const open = c.experiments.filter((e) => s.proposed.has(e.suffix) && !s.spent.has(e.suffix));
  const ranking = open
    .map((e) => {
      const id = `${c.id}-${e.suffix}`;
      const bits = eig(s.belief, tables[id], s.nullId);
      return { e, row: { experiment_id: id, kind: e.kind, goal: e.goal, eig_bits: bits, est_cost_s: e.cost, est_cost_usd: 0, score: score(bits, c.impact, e.cost) } };
    })
    .sort((a, b) => b.row.score - a.row.score);
  const best = ranking[0];
  if (!best || best.row.eig_bits < MIN_EIG || s.runs >= MAX_EXPERIMENTS) {
    s.status = 'unresolved';
    emit('question.unresolved', { question_id: c.id, reason: 'no new informative experiment was proposed', top: Object.keys(s.belief) });
    return;
  }
  const { e } = best;
  const eid = best.row.experiment_id;
  emit('experiment.scored', { question_id: c.id, ranking: ranking.map((r) => r.row), chosen: eid });
  if (!e.observe) throw new Error(`${eid} chosen but has no observation`);
  emit('experiment.started', { experiment_id: eid, question_ids: [c.id], kind: e.kind }, 0.3);
  for (const line of e.logs) emit('experiment.log', { experiment_id: eid, stream: 'stdout', line }, 0.7);
  emit('experiment.log', { experiment_id: eid, stream: 'stdout', line: `RESULT: ${JSON.stringify(e.value)}` }, 0.4);
  const bins = e.bins.map(([b]) => b);
  const pbar = bins.map((b) => Object.keys(s.belief).reduce((a, h) => a + s.belief[h] * tables[eid][h][b], 0));
  const surprise = -Math.log(Math.max(pbar[bins.indexOf(e.observe)], 1e-12));
  emit(
    'experiment.finished',
    {
      observation: {
        experiment_id: eid,
        valid: true,
        value: e.value,
        bin_id: e.observe,
        surprise,
        referee_note: '',
        log_ref: `logs/${eid}.txt`,
        seconds: Math.round(e.cost * 0.6 * 100) / 100,
        cost_usd: 0,
      },
    },
    0.3,
  );
  s.spent.add(e.suffix);
  s.runs += 1;
  llm(0.021, 3900, 260, 1.8);
  if (e.invalid) {
    emit('referee.verdict', { experiment_id: eid, valid: false, note: e.invalid }, 0.2);
    return;
  }
  emit('referee.verdict', { experiment_id: eid, valid: true, note: e.referee }, 0.2);
  const prior = { ...s.belief };
  const post = normalise(Object.fromEntries(Object.keys(prior).map((h) => [h, prior[h] * tables[eid][h][e.observe]])));
  s.belief = post;
  s.lastBin = e.observe;
  evidenceN += 1;
  emit('belief.updated', { question_id: c.id, experiment_id: eid, observed: e.observe, prior, posterior: post }, 0.3);
  reject(s, eid);
  const [top, p] = Object.entries(s.belief).sort((a, b) => b[1] - a[1])[0];
  if (p >= SETTLE && top !== s.nullId) {
    s.status = 'settled';
    emit('question.settled', { question_id: c.id, hypothesis_id: top, posterior: p }, 0.3);
  }
}

// Categorical loop: the open question with the highest impact x entropy goes next.
for (;;) {
  const open = Object.values(state).filter((s) => s.status === 'open');
  if (!open.length) break;
  open.sort((a, b) => b.c.impact * entropy(Object.values(b.belief)) - a.c.impact * entropy(Object.values(a.belief)));
  round(open[0]);
}

// Report.
const sha = (s) => {
  let h = 2166136261 >>> 0;
  let out = '';
  for (let i = 0; out.length < 64; i += 1) {
    for (const ch of `${s}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
};
const artifact = { name: 'CLAIMS.md', path: `runs/${RUN_ID}/artifacts/CLAIMS.md`, sha256: sha('claims-v1'), contract_ok: true, findings: [] };
emit('artifact.written', { artifact }, 1.2);
llm(0.018, 5200, 900, 1.6);
emit('artifact.written', { artifact }, 0.2);

const verdicts = {};
for (const s of Object.values(state)) {
  const key = s.status === 'settled'
    ? Object.entries(s.ids).find(([, id]) => id === Object.entries(s.belief).sort((a, b) => b[1] - a[1])[0][0])?.[0]
    : s.status;
  verdicts[s.c.id] = key;
}
const expected = {
  'claim-nb_variance': 'holds',
  'claim-wald_calibration': 'holds_if',
  'claim-bh_fdr': 'holds',
  'claim-bh_fwer': 'fails',
};
for (const [qid, key] of Object.entries(expected)) {
  if (verdicts[qid] !== key) throw new Error(`${qid} ended ${verdicts[qid]}, expected ${key}`);
}

emit(
  'run.finished',
  {
    report: {
      run_id: RUN_ID,
      artifacts: [artifact],
      methods_md: 'Paper & claims audit (UI fixture).\n',
      rejected,
      unresolved: Object.values(state).filter((s) => s.status === 'unresolved').map((s) => s.c.id),
      cost_usd: r6(budget.cost),
      seconds: r4(t - T0),
    },
    status: 'ok',
  },
  0.4,
);

const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
for (const out of OUTS) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
}
console.log(`demo_claims.jsonl: ${events.length} events over ${(t - T0).toFixed(1)} s; verdicts ${JSON.stringify(verdicts)}`);
