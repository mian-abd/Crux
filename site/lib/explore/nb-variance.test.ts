import { describe, expect, it } from "vitest";
import { monteCarloVariance, nbVariance, nbVarianceMixup } from "./nb-variance";

describe("negative binomial variance", () => {
  it("is μ(αμ + 1) = μ + αμ²", () => {
    expect(nbVariance(10, 0.2)).toBeCloseTo(30, 12);
    expect(nbVariance(10, 0.2)).toBeCloseTo(10 + 0.2 * 100, 12);
    expect(nbVariance(3, 0)).toBe(3); // α = 0 is Poisson
  });

  it("differs from the mix-up μ + μ²/α unless α = 1", () => {
    expect(nbVarianceMixup(10, 0.2)).toBeCloseTo(510, 12);
    expect(nbVarianceMixup(7, 1)).toBeCloseTo(nbVariance(7, 1), 12);
  });

  it("is matched by seeded Poisson–Gamma draws, and the mix-up is not", () => {
    const points = monteCarloVariance(11, [1, 5, 20, 60], 0.2, 20_000);
    for (const pt of points) {
      expect(Math.abs(pt.mean / pt.mu - 1)).toBeLessThan(0.03);
      expect(pt.relErr).toBeLessThan(0.06);
      expect(pt.relErrMixup).toBeGreaterThan(0.5);
    }
  });

  it("is deterministic for a seed", () => {
    expect(monteCarloVariance(4, [2, 8], 0.2, 500)).toEqual(monteCarloVariance(4, [2, 8], 0.2, 500));
  });
});
