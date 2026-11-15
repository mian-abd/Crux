// Expected information gain of a diagnostic, in bits:
//   EIG = H(prior) − Σ_o P(o) · H(posterior | o),   P(o) = Σ_h prior(h) · P(o | h).
// It is the mutual information between the hypothesis and the outcome. Crux
// ranks diagnostics by EIG per unit cost and runs the best one first.

/** Shannon entropy in bits; zero-probability terms contribute nothing. */
export function entropy(p: number[]): number {
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log2(x);
  return h;
}

/**
 * likelihood[h][o] = P(outcome o | hypothesis h). Each row must sum to 1 and
 * every row must have the same number of outcomes.
 */
export type Likelihood = number[][];

function check(prior: number[], likelihood: Likelihood): void {
  if (prior.length !== likelihood.length) throw new RangeError("one likelihood row per hypothesis");
  const outcomes = likelihood[0]?.length ?? 0;
  for (const row of likelihood) {
    if (row.length !== outcomes) throw new RangeError("every hypothesis needs the same outcomes");
    const total = row.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 1e-9) throw new RangeError("each likelihood row must sum to 1");
  }
}

/** Predictive probability of each outcome under the prior. */
export function outcomeProbs(prior: number[], likelihood: Likelihood): number[] {
  check(prior, likelihood);
  const outcomes = likelihood[0]?.length ?? 0;
  return Array.from({ length: outcomes }, (_, o) => prior.reduce((s, ph, h) => s + ph * likelihood[h][o], 0));
}

/** Bayes' rule: posterior over hypotheses after observing outcome o. */
export function bayesUpdate(prior: number[], likelihood: Likelihood, outcome: number): number[] {
  check(prior, likelihood);
  const joint = prior.map((ph, h) => ph * likelihood[h][outcome]);
  const total = joint.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new RangeError("this outcome is impossible under the prior");
  return joint.map((x) => x / total);
}

/** Expected information gain in bits: H(prior) − E[H(posterior)]. */
export function eig(prior: number[], likelihood: Likelihood): number {
  const po = outcomeProbs(prior, likelihood);
  let expected = 0;
  po.forEach((p, o) => {
    if (p > 0) expected += p * entropy(bayesUpdate(prior, likelihood, o));
  });
  // Clamp float noise: EIG is a mutual information, so it lies in [0, H(prior)].
  return Math.max(0, entropy(prior) - expected);
}

/** Sample an index from a discrete distribution with one uniform draw u in [0, 1). */
export function sampleIndex(probs: number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (u < acc) return i;
  }
  return probs.length - 1;
}
