// Negative binomial variance under DESeq2's parametrisation (size r = 1/α).
// A count X with X | λ ~ Poisson(λ) and λ ~ Gamma(shape 1/α, scale αμ) is
// negative binomial with mean μ, and by the law of total variance
//   Var[X] = E[λ] + Var[λ] = μ + αμ² = μ(αμ + 1).
// The mix-up μ + μ²/α is what you get by reading α as the size r itself.

import { gamma, meanVariance, mulberry32, poisson, type Rng } from "./rng";

/** The variance that holds: μ + αμ². */
export function nbVariance(mu: number, alpha: number): number {
  return mu * (alpha * mu + 1);
}

/** The rejected mix-up: μ + μ²/α. */
export function nbVarianceMixup(mu: number, alpha: number): number {
  return mu + (mu * mu) / alpha;
}

/** One negative binomial draw with mean μ and dispersion α, as Poisson(Gamma(1/α, αμ)). */
export function sampleNb(rng: Rng, mu: number, alpha: number): number {
  return poisson(rng, gamma(rng, 1 / alpha, alpha * mu));
}

export interface VariancePoint {
  mu: number;
  mean: number;
  variance: number;
  /** |sample variance / (μ + αμ²) − 1| */
  relErr: number;
  /** |sample variance / (μ + μ²/α) − 1| */
  relErrMixup: number;
}

/** Seeded Monte Carlo: `n` draws at each μ, summarised by sample mean and variance. */
export function monteCarloVariance(seed: number, mus: number[], alpha: number, n: number): VariancePoint[] {
  const rng = mulberry32(seed);
  const xs = new Float64Array(n);
  return mus.map((mu) => {
    for (let i = 0; i < n; i++) xs[i] = sampleNb(rng, mu, alpha);
    const { mean, variance } = meanVariance(xs);
    return {
      mu,
      mean,
      variance,
      relErr: Math.abs(variance / nbVariance(mu, alpha) - 1),
      relErrMixup: Math.abs(variance / nbVarianceMixup(mu, alpha) - 1),
    };
  });
}
