// Multiple testing: Benjamini–Hochberg (controls the false discovery rate) and
// Bonferroni (controls the family-wise error rate), plus the exact and simulated
// FWER of BH that refutes the planted claim "BH controls the FWER".

import { mulberry32, normal } from "./rng";

/** erfc, Numerical Recipes' Chebyshev fit: fractional error below 1.2e-7 everywhere. */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Upper tail of the standard normal, P(Z > z): the one-sided p-value of a z-test. */
export function normalSf(z: number): number {
  return 0.5 * erfc(z / Math.SQRT2);
}

export interface Rejections {
  rejected: boolean[];
  /** Number of rejections. */
  count: number;
}

/**
 * Benjamini–Hochberg step-up at level q: with p-values sorted, find the largest
 * rank k whose p_(k) ≤ k·q/m and reject the k smallest. Order of `p` is kept.
 */
export function bhReject(p: number[], q: number): Rejections {
  const m = p.length;
  const order = p.map((_, i) => i).sort((a, b) => p[a] - p[b]);
  let k = 0;
  order.forEach((idx, r) => {
    if (p[idx] <= ((r + 1) * q) / m) k = r + 1;
  });
  const rejected = new Array<boolean>(m).fill(false);
  for (let r = 0; r < k; r++) rejected[order[r]] = true;
  return { rejected, count: k };
}

/** Bonferroni at level q: reject every p ≤ q/m. */
export function bonferroniReject(p: number[], q: number): Rejections {
  const m = p.length;
  const rejected = p.map((x) => x <= q / m);
  return { rejected, count: rejected.filter(Boolean).length };
}

export interface PValueSet {
  /** p-values sorted ascending. */
  p: number[];
  /** signal[i] is true when p[i] came from a real effect, false for a true null. */
  signal: boolean[];
}

/**
 * `m` one-sided z-tests: `signals` of them have a real effect (z ~ N(effect, 1)),
 * the rest are true nulls (z ~ N(0, 1), so p is uniform). Returned sorted by p.
 */
export function seededPValues(seed: number, m: number, signals: number, effect: number): PValueSet {
  const rng = mulberry32(seed);
  const rows = Array.from({ length: m }, (_, i) => {
    const isSignal = i < signals;
    const z = normal(rng) + (isSignal ? effect : 0);
    return { p: normalSf(z), signal: isSignal };
  });
  rows.sort((a, b) => a.p - b.p);
  return { p: rows.map((r) => r.p), signal: rows.map((r) => r.signal) };
}

/**
 * Exact FWER of BH at level q with `nulls` independent true nulls (uniform
 * p-values) and `sure` signals whose p-values are 0 (the limit of a very strong
 * effect). With m = nulls + sure, a null is rejected exactly when, for some j,
 * the j-th smallest null p-value is at most (sure + j)·q/m. The chance that this
 * never happens is a multinomial sum over the intervals between those bounds.
 */
export function bhFwerSureSignals(nulls: number, sure: number, q: number): number {
  if (!Number.isInteger(nulls) || nulls < 1) throw new RangeError("bhFwerSureSignals: need at least one null");
  const m = nulls + sure;
  const bounds = Array.from({ length: nulls }, (_, j) => Math.min(1, ((sure + j + 1) * q) / m));
  const factorial = (n: number) => {
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  };
  // f[s]: weight (∏ len^count / count!) of having s null p-values below the current bound.
  let f = new Array<number>(nulls + 1).fill(0);
  f[0] = 1;
  let prev = 0;
  bounds.forEach((b, j) => {
    const len = b - prev;
    prev = b;
    const g = new Array<number>(nulls + 1).fill(0);
    for (let s = 0; s <= nulls; s++) {
      for (let s0 = 0; s0 <= s; s0++) g[s] += (f[s0] * len ** (s - s0)) / factorial(s - s0);
    }
    // No rejection needs at most j of the nulls at or below bound j + 1 (1-based).
    for (let s = j + 1; s <= nulls; s++) g[s] = 0;
    f = g;
  });
  const tail = 1 - prev;
  let none = 0;
  for (let s = 0; s <= nulls; s++) none += (f[s] * tail ** (nulls - s)) / factorial(nulls - s);
  none *= factorial(nulls);
  return 1 - none;
}

/** One-sided lower confidence bound for a proportion (normal approximation), as the recorded diagnostic uses. */
export function lowerBound(rate: number, reps: number, z = 3.29): number {
  return rate - z * Math.sqrt((rate * (1 - rate)) / reps);
}

export interface FwerSimulation {
  fwer: number;
  lower: number;
  reps: number;
  /** Null p-values of the first `keep` simulated experiments. */
  nullP: number[][];
  /** Whether each kept experiment rejected at least one true null. */
  falseReject: boolean[];
}

/**
 * Simulate BH at level q on `m` independent one-sided z-tests, the first `nulls`
 * true nulls and the rest strong signals z ~ N(effect, 1), the setup of
 * labs/claims/scripts/bh_fwer_counterexample.py.
 */
export function simulateBhFwer(
  seed: number,
  m: number,
  nulls: number,
  effect: number,
  reps: number,
  q: number,
  keep = 0,
): FwerSimulation {
  const rng = mulberry32(seed);
  let hits = 0;
  const nullP: number[][] = [];
  const falseReject: boolean[] = [];
  const p = new Array<number>(m);
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < m; i++) p[i] = normalSf(normal(rng) + (i < nulls ? 0 : effect));
    const { rejected } = bhReject(p, q);
    const hit = rejected.slice(0, nulls).some(Boolean);
    if (hit) hits += 1;
    if (r < keep) {
      nullP.push(p.slice(0, nulls));
      falseReject.push(hit);
    }
  }
  const fwer = hits / reps;
  return { fwer, lower: lowerBound(fwer, reps), reps, nullP, falseReject };
}
