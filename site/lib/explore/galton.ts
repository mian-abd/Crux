// The Galton board: each ball meets `rows` pegs and goes left or right with
// probability one half, so its bin is the number of rights, a Binomial(rows, 1/2)
// count. The expected histogram is balls · C(rows, k) / 2^rows.

import { mulberry32 } from "./rng";

export interface GaltonRun {
  rows: number;
  balls: number;
  seed: number;
  /** steps[i][j] is 1 when ball i went right at row j, else 0. */
  steps: Uint8Array[];
  /** The bin (number of rights) each ball lands in, 0..rows. */
  bin: number[];
  /** How many balls had already landed in that bin before ball i (balls land in index order). */
  stack: number[];
  /** Final count per bin, length rows + 1. */
  counts: number[];
}

export function simulateGalton(seed: number, rows: number, balls: number): GaltonRun {
  if (!Number.isInteger(rows) || rows < 1) throw new RangeError("simulateGalton: rows must be a positive integer");
  if (!Number.isInteger(balls) || balls < 0) throw new RangeError("simulateGalton: balls must be a non-negative integer");
  const rng = mulberry32(seed);
  const steps: Uint8Array[] = [];
  const bin: number[] = [];
  const stack: number[] = [];
  const counts = new Array<number>(rows + 1).fill(0);
  for (let i = 0; i < balls; i++) {
    const path = new Uint8Array(rows);
    let rights = 0;
    for (let j = 0; j < rows; j++) {
      const right = rng() < 0.5 ? 1 : 0;
      path[j] = right;
      rights += right;
    }
    steps.push(path);
    bin.push(rights);
    stack.push(counts[rights]);
    counts[rights] += 1;
  }
  return { rows, balls, seed, steps, bin, stack, counts };
}

/** C(n, k), exact for the small n used here. */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
  return Math.round(r);
}

export function binomialPmf(n: number, k: number, p = 0.5): number {
  return choose(n, k) * p ** k * (1 - p) ** (n - k);
}

/** Expected count per bin for `balls` balls through `rows` rows. */
export function binomialExpected(rows: number, balls: number): number[] {
  return Array.from({ length: rows + 1 }, (_, k) => balls * binomialPmf(rows, k));
}

/** Mean and standard deviation of the bin index, from per-bin counts. */
export function histogramStats(counts: number[]): { n: number; mean: number; sd: number } {
  const n = counts.reduce((a, b) => a + b, 0);
  if (n === 0) return { n, mean: 0, sd: 0 };
  const mean = counts.reduce((s, c, k) => s + c * k, 0) / n;
  const variance = counts.reduce((s, c, k) => s + c * (k - mean) ** 2, 0) / n;
  return { n, mean, sd: Math.sqrt(variance) };
}

/** Per-bin counts of the first `landed` balls of a run. */
export function countsAfter(run: GaltonRun, landed: number): number[] {
  const counts = new Array<number>(run.rows + 1).fill(0);
  const upTo = Math.max(0, Math.min(landed, run.balls));
  for (let i = 0; i < upTo; i++) counts[run.bin[i]] += 1;
  return counts;
}
