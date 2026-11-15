import { describe, expect, it } from "vitest";
import { gamma, meanVariance, mulberry32, normal, poisson } from "./rng";

const draw = (n: number, f: () => number) => Float64Array.from({ length: n }, f);

describe("mulberry32", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xa);
    expect([c(), c(), c()]).not.toEqual(xa);
  });

  it("stays in [0, 1) with mean near one half", () => {
    const rng = mulberry32(1);
    const xs = draw(50_000, rng);
    expect(xs.reduce((a, b) => Math.min(a, b))).toBeGreaterThanOrEqual(0);
    expect(xs.reduce((a, b) => Math.max(a, b))).toBeLessThan(1);
    const { mean, variance } = meanVariance(xs);
    expect(mean).toBeCloseTo(0.5, 2);
    expect(variance).toBeCloseTo(1 / 12, 2);
  });
});

describe("samplers", () => {
  it("normal has mean 0 and variance 1", () => {
    const rng = mulberry32(7);
    const { mean, variance } = meanVariance(draw(80_000, () => normal(rng)));
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(variance).toBeGreaterThan(0.97);
    expect(variance).toBeLessThan(1.03);
  });

  it.each([
    [5, 2],
    [0.5, 3],
  ])("gamma(shape %d, scale %d) matches its mean and variance", (shape, scale) => {
    const rng = mulberry32(11);
    const { mean, variance } = meanVariance(draw(80_000, () => gamma(rng, shape, scale)));
    expect(mean / (shape * scale)).toBeGreaterThan(0.98);
    expect(mean / (shape * scale)).toBeLessThan(1.02);
    expect(variance / (shape * scale * scale)).toBeGreaterThan(0.95);
    expect(variance / (shape * scale * scale)).toBeLessThan(1.05);
  });

  it.each([0.7, 12, 140])("poisson(%d) has mean and variance lambda", (lambda) => {
    const rng = mulberry32(3);
    const xs = draw(40_000, () => poisson(rng, lambda));
    expect(xs.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
    const { mean, variance } = meanVariance(xs);
    expect(mean / lambda).toBeGreaterThan(0.98);
    expect(mean / lambda).toBeLessThan(1.02);
    expect(variance / lambda).toBeGreaterThan(0.95);
    expect(variance / lambda).toBeLessThan(1.05);
  });

  it("poisson(0) is always 0", () => {
    const rng = mulberry32(5);
    expect(draw(100, () => poisson(rng, 0)).every((x) => x === 0)).toBe(true);
  });

  it("rejects invalid parameters", () => {
    const rng = mulberry32(1);
    expect(() => gamma(rng, 0, 1)).toThrow(RangeError);
    expect(() => poisson(rng, -1)).toThrow(RangeError);
    expect(() => meanVariance([1])).toThrow(RangeError);
  });
});
