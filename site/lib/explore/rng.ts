// Seeded random numbers for the Explore figures. Every simulation on the page
// draws from these, so a seed always gives the same picture on the server and
// in the browser (no hydration mismatch) and anyone can reproduce it.

export type Rng = () => number;

/** mulberry32: a small 32-bit generator, uniform on [0, 1). Good enough for figures, not for cryptography. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal draw (Box–Muller). */
export function normal(rng: Rng): number {
  const u1 = 1 - rng(); // in (0, 1], so the log is finite
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** A Gamma(shape, scale) draw: mean shape·scale, variance shape·scale². Marsaglia–Tsang. */
export function gamma(rng: Rng, shape: number, scale: number): number {
  if (!(shape > 0) || !(scale > 0)) throw new RangeError("gamma: shape and scale must be positive");
  if (shape < 1) {
    // Boost: Gamma(a) = Gamma(a + 1) · U^(1/a).
    return gamma(rng, shape + 1, scale) * Math.pow(1 - rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rng);
    const v0 = 1 + c * x;
    if (v0 <= 0) continue;
    const v = v0 * v0 * v0;
    const u = 1 - rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

const POISSON_CHUNK = 30;

/**
 * A Poisson(lambda) draw. Knuth's product-of-uniforms method, run in chunks of
 * mean at most 30 (a sum of independent Poissons is Poisson), so exp(-lambda)
 * never underflows. Cost grows with lambda, which is fine at figure sizes.
 */
export function poisson(rng: Rng, lambda: number): number {
  if (!(lambda >= 0)) throw new RangeError("poisson: lambda must be non-negative");
  let total = 0;
  let rest = lambda;
  while (rest > 0) {
    const part = Math.min(rest, POISSON_CHUNK);
    rest -= part;
    const limit = Math.exp(-part);
    let k = 0;
    let prod = rng();
    while (prod > limit) {
      k += 1;
      prod *= rng();
    }
    total += k;
  }
  return total;
}

/** Sample mean and unbiased sample variance. */
export function meanVariance(xs: ArrayLike<number>): { mean: number; variance: number } {
  const n = xs.length;
  if (n < 2) throw new RangeError("meanVariance: need at least two values");
  let mean = 0;
  let m2 = 0;
  for (let i = 0; i < n; i++) {
    // Welford's update, stable for large counts.
    const x = xs[i];
    const delta = x - mean;
    mean += delta / (i + 1);
    m2 += delta * (x - mean);
  }
  return { mean, variance: m2 / (n - 1) };
}
