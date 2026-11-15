import { describe, expect, it } from "vitest";
import { binomialExpected, binomialPmf, choose, countsAfter, histogramStats, simulateGalton } from "./galton";

describe("simulateGalton", () => {
  const run = simulateGalton(1, 12, 400);

  it("is deterministic for a seed", () => {
    expect(simulateGalton(1, 12, 400).counts).toEqual(run.counts);
    expect(simulateGalton(2, 12, 400).counts).not.toEqual(run.counts);
  });

  it("puts every ball in the bin given by its number of rights", () => {
    expect(run.counts).toHaveLength(13);
    expect(run.counts.reduce((a, b) => a + b, 0)).toBe(400);
    run.steps.forEach((path, i) => {
      expect(path).toHaveLength(12);
      expect(path.reduce((a, b) => a + b, 0)).toBe(run.bin[i]);
    });
  });

  it("stacks balls in landing order within each bin", () => {
    const seen = new Array<number>(13).fill(0);
    run.bin.forEach((b, i) => {
      expect(run.stack[i]).toBe(seen[b]);
      seen[b] += 1;
    });
    expect(seen).toEqual(run.counts);
  });

  it("has a histogram close to the binomial: mean 6, sd sqrt(3)", () => {
    const { mean, sd } = histogramStats(run.counts);
    expect(Math.abs(mean - 6)).toBeLessThan(0.3);
    expect(Math.abs(sd - Math.sqrt(3))).toBeLessThan(0.2);
  });

  it("counts a prefix of landed balls", () => {
    expect(countsAfter(run, 0).every((c) => c === 0)).toBe(true);
    expect(countsAfter(run, 400)).toEqual(run.counts);
    expect(countsAfter(run, 10_000)).toEqual(run.counts);
    expect(countsAfter(run, 50).reduce((a, b) => a + b, 0)).toBe(50);
  });

  it("rejects bad sizes", () => {
    expect(() => simulateGalton(1, 0, 10)).toThrow(RangeError);
    expect(() => simulateGalton(1, 3, -1)).toThrow(RangeError);
  });
});

describe("binomial", () => {
  it("computes binomial coefficients", () => {
    expect(choose(12, 6)).toBe(924);
    expect(choose(12, 0)).toBe(1);
    expect(choose(12, 13)).toBe(0);
  });

  it("has pmf summing to one", () => {
    const total = Array.from({ length: 13 }, (_, k) => binomialPmf(12, k)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(binomialPmf(12, 6)).toBeCloseTo(924 / 4096, 12);
  });

  it("gives expected counts that sum to the number of balls", () => {
    const e = binomialExpected(12, 400);
    expect(e.reduce((a, b) => a + b, 0)).toBeCloseTo(400, 9);
    expect(e[6]).toBeCloseTo((400 * 924) / 4096, 9);
    expect(e[0]).toBeCloseTo(e[12], 12);
  });

  it("summarises an empty histogram as zero", () => {
    expect(histogramStats([0, 0, 0])).toEqual({ n: 0, mean: 0, sd: 0 });
  });
});
