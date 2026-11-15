import { describe, expect, it } from "vitest";
import { bayesUpdate, eig, entropy, outcomeProbs, sampleIndex } from "./eig";

/** Mutual information computed the other way round, Σ p(h, o) log2 p(o | h) / p(o). */
function mutualInformation(prior: number[], lik: number[][]): number {
  const po = outcomeProbs(prior, lik);
  let mi = 0;
  prior.forEach((ph, h) =>
    lik[h].forEach((poh, o) => {
      if (ph > 0 && poh > 0) mi += ph * poh * Math.log2(poh / po[o]);
    }),
  );
  return mi;
}

describe("entropy", () => {
  it("is 1 bit for a fair coin, 0 for a certainty, log2 n for uniform", () => {
    expect(entropy([0.5, 0.5])).toBeCloseTo(1, 12);
    expect(entropy([1, 0])).toBe(0);
    expect(entropy([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(2, 12);
  });
});

describe("eig", () => {
  const uniform = [0.5, 0.5];

  it("is 1 bit for a perfect test of two equally likely hypotheses", () => {
    expect(eig(uniform, [
      [1, 0],
      [0, 1],
    ])).toBeCloseTo(1, 12);
  });

  it("is 0 for a test whose outcome does not depend on the hypothesis", () => {
    expect(eig(uniform, [
      [0.3, 0.7],
      [0.3, 0.7],
    ])).toBeCloseTo(0, 12);
  });

  it("is 1 − H(0.1) for a test that errs 10% of the time", () => {
    const h01 = entropy([0.1, 0.9]);
    expect(eig(uniform, [
      [0.9, 0.1],
      [0.1, 0.9],
    ])).toBeCloseTo(1 - h01, 12);
    expect(1 - h01).toBeCloseTo(0.531, 3);
  });

  it("equals the mutual information and lies in [0, H(prior)]", () => {
    const cases: [number[], number[][]][] = [
      [[0.7, 0.3], [[0.6, 0.4], [0.4, 0.6]]],
      [[0.2, 0.8], [[0.7, 0.2, 0.1], [0.1, 0.3, 0.6]]],
      [[0.425, 0.425, 0.15], [[0.9, 0.1], [0.05, 0.95], [0.5, 0.5]]],
    ];
    for (const [prior, lik] of cases) {
      const g = eig(prior, lik);
      expect(g).toBeCloseTo(mutualInformation(prior, lik), 12);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(entropy(prior) + 1e-12);
    }
  });

  it("is zero once the prior is certain", () => {
    expect(eig([1, 0], [[0.9, 0.1], [0.1, 0.9]])).toBe(0);
  });

  it("rejects malformed likelihood tables", () => {
    expect(() => eig(uniform, [[0.5, 0.4], [0.5, 0.5]])).toThrow(RangeError);
    expect(() => eig(uniform, [[1, 0]])).toThrow(RangeError);
    expect(() => eig(uniform, [[1, 0], [0.2, 0.3, 0.5]])).toThrow(RangeError);
  });
});

describe("bayesUpdate", () => {
  it("applies Bayes' rule", () => {
    // P(A | pos) = 0.5·0.9 / (0.5·0.9 + 0.5·0.2) = 0.818...
    const post = bayesUpdate([0.5, 0.5], [[0.9, 0.1], [0.2, 0.8]], 0);
    expect(post[0]).toBeCloseTo(0.45 / 0.55, 12);
    expect(post[0] + post[1]).toBeCloseTo(1, 12);
  });

  it("refuses an outcome with zero predictive probability", () => {
    expect(() => bayesUpdate([1, 0], [[1, 0], [0, 1]], 1)).toThrow(RangeError);
  });
});

describe("sampleIndex", () => {
  it("maps a uniform draw onto cumulative probabilities", () => {
    expect(sampleIndex([0.2, 0.5, 0.3], 0)).toBe(0);
    expect(sampleIndex([0.2, 0.5, 0.3], 0.19)).toBe(0);
    expect(sampleIndex([0.2, 0.5, 0.3], 0.2)).toBe(1);
    expect(sampleIndex([0.2, 0.5, 0.3], 0.71)).toBe(2);
    expect(sampleIndex([0.2, 0.5, 0.3], 0.999999)).toBe(2);
  });
});
