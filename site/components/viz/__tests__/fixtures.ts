// Synthetic event streams for tests and the demo page. Not real runs.
//
// claimsRun() imitates the planned `claims` lab: a claims.source event, one
// question per claim, options carrying the claims answer keys, one diagnostic
// per question and a settled or unresolved ending. The claims restate the
// HBB facts in sequence.ts; claim 3 is planted (deliberately wrong: Lys at
// beta 6 is HbC, not HbS).

import type { RunEvent } from "../graph";

let seq = 0;
const ev = (type: string, payload: unknown): RunEvent => ({
  seq: seq++,
  type,
  ts: 1794700000 + seq * 0.5,
  payload,
});

function hyp(
  qid: string,
  n: number,
  statement: string,
  answerKey: string | null,
  prior: number,
  isNull = false,
) {
  return ev("hypothesis.proposed", {
    hypothesis: {
      id: isNull ? `${qid}.h0` : `${qid}-h${n}`,
      question_id: qid,
      statement,
      author: isNull ? "orchestrator" : "proposer",
      rationale: isNull ? "Catches outcomes that no proposed option predicts." : `Reading ${n} of the claim.`,
      answer_key: answerKey,
      model_code: null,
      is_null: isNull,
      prior,
      posterior: prior,
      status: "active",
      rejected_by: [],
    },
  });
}

export function claimsRun(): RunEvent[] {
  seq = 0;
  const q = ["claim-1", "claim-2", "claim-3"] as const;
  return [
    ev("run.started", {
      lab: "claims",
      goal: "Check the claims in a short source passage.",
      config: {},
      started_at: "2026-11-14T10:00:00Z",
    }),
    ev("claims.source", {
      title: "Sickle cell haemoglobin (synthetic test passage)",
      citation: "Test fixture, not a publication",
      url: "https://example.org/fixture",
      license: "CC0-1.0",
      excerpt: "HbS arises from one substitution in codon 6 of HBB.",
      claims: [
        {
          question_id: q[0],
          claim: "HbS comes from a single substitution in codon 6 of HBB",
          quote: "one substitution in codon 6",
          kind: "mechanism",
          planted: false,
        },
        {
          question_id: q[1],
          claim: "Codon 6 GAG becomes GTG, replacing Glu with Val",
          quote: "GAG to GTG",
          kind: "sequence",
          planted: false,
        },
        {
          question_id: q[2],
          claim: "The substitution puts Lys at beta 6",
          quote: "Lys at beta 6",
          kind: "sequence",
          planted: true,
        },
      ],
    }),
    ...q.map((id, i) =>
      ev("question.opened", {
        question: {
          id,
          text: `Does claim ${i + 1} hold against the reference?`,
          kind: "categorical",
          impact: 0.9,
          status: "open",
          raised_by: "claims",
        },
      }),
    ),
    hyp(q[0], 1, "Holds as stated", "holds", 0.45),
    hyp(q[0], 2, "Holds only for the legacy codon numbering", "holds_if", 0.25),
    hyp(q[0], 3, "Fails: more than one substitution", "fails", 0.15),
    hyp(q[0], 0, "None of these options", null, 0.15, true),
    hyp(q[1], 1, "Holds as stated", "holds", 0.5),
    hyp(q[1], 2, "Fails: the codon becomes GCG", "alt_param", 0.35),
    hyp(q[1], 0, "None of these options", null, 0.15, true),
    hyp(q[2], 1, "Holds as stated", "holds", 0.4),
    hyp(q[2], 2, "Fails: beta 6 is Val in HbS", "fails", 0.3),
    hyp(q[2], 3, "Fails conservatively: cannot tell from the passage", "fails_conservative", 0.15),
    hyp(q[2], 0, "None of these options", null, 0.15, true),
    ev("experiment.proposed", {
      experiment: {
        id: "ref-codon6",
        question_ids: [q[0], q[1]],
        kind: "compute",
        goal: "Translate codon 6 of NM_000518.5 and the variant",
      },
    }),
    ev("experiment.proposed", {
      experiment: {
        id: "ref-beta6",
        question_ids: [q[2]],
        kind: "search",
        goal: "Look up the residue at beta 6 in 2HBS",
      },
    }),
    ev("experiment.scored", {
      question_id: q[0],
      ranking: [
        {
          experiment_id: "ref-codon6",
          kind: "compute",
          goal: "",
          eig_bits: 0.82,
          est_cost_s: 2,
          est_cost_usd: 0,
          score: 0.8,
        },
      ],
      chosen: "ref-codon6",
    }),
    ev("experiment.started", { experiment_id: "ref-codon6", question_ids: [q[0], q[1]], kind: "compute" }),
    ev("experiment.finished", {
      observation: { experiment_id: "ref-codon6", valid: true, bin_id: "single_gag_gtg", value: null },
    }),
    ev("belief.updated", {
      question_id: q[0],
      experiment_id: "ref-codon6",
      observed: "single_gag_gtg",
      prior: {},
      posterior: { [`${q[0]}-h1`]: 0.93, [`${q[0]}-h2`]: 0.05, [`${q[0]}-h3`]: 0.01, [`${q[0]}.h0`]: 0.01 },
    }),
    ev("hypothesis.rejected", {
      question_id: q[0],
      hypothesis_id: `${q[0]}-h3`,
      evidence_id: "ev-1",
      reason: "posterior 0.01 fell below 0.02",
    }),
    ev("question.settled", { question_id: q[0], hypothesis_id: `${q[0]}-h1`, posterior: 0.93 }),
    ev("belief.updated", {
      question_id: q[1],
      experiment_id: "ref-codon6",
      observed: "single_gag_gtg",
      prior: {},
      posterior: { [`${q[1]}-h1`]: 0.95, [`${q[1]}-h2`]: 0.01, [`${q[1]}.h0`]: 0.04 },
    }),
    ev("hypothesis.rejected", {
      question_id: q[1],
      hypothesis_id: `${q[1]}-h2`,
      evidence_id: "ev-2",
      reason: "posterior 0.01 fell below 0.02",
    }),
    ev("question.settled", { question_id: q[1], hypothesis_id: `${q[1]}-h1`, posterior: 0.95 }),
    ev("experiment.scored", {
      question_id: q[2],
      ranking: [
        {
          experiment_id: "ref-beta6",
          kind: "search",
          goal: "",
          eig_bits: 0.71,
          est_cost_s: 4,
          est_cost_usd: 0.01,
          score: 0.7,
        },
      ],
      chosen: "ref-beta6",
    }),
    ev("experiment.started", { experiment_id: "ref-beta6", question_ids: [q[2]], kind: "search" }),
    ev("experiment.finished", {
      observation: { experiment_id: "ref-beta6", valid: true, bin_id: "val", value: null },
    }),
    ev("belief.updated", {
      question_id: q[2],
      experiment_id: "ref-beta6",
      observed: "val",
      prior: {},
      posterior: { [`${q[2]}-h1`]: 0.01, [`${q[2]}-h2`]: 0.91, [`${q[2]}-h3`]: 0.06, [`${q[2]}.h0`]: 0.02 },
    }),
    ev("hypothesis.rejected", {
      question_id: q[2],
      hypothesis_id: `${q[2]}-h1`,
      evidence_id: "ev-3",
      reason: "posterior 0.01 fell below 0.02",
    }),
    ev("question.settled", { question_id: q[2], hypothesis_id: `${q[2]}-h2`, posterior: 0.91 }),
    ev("run.finished", { report: {}, status: "ok" }),
  ];
}
