import { describe, expect, it } from "vitest";
import {
  bhFwerSureSignals,
  bhReject,
  bonferroniReject,
  lowerBound,
  normalSf,
  seededPValues,
  simulateBhFwer,
} from "./multiple-testing";

describe("normalSf", () => {
  it("matches standard normal tail values", () => {
    expect(normalSf(0)).toBeCloseTo(0.5, 7);
    expect(normalSf(1.959964)).toBeCloseTo(0.025, 6);
    expect(normalSf(-1.644854)).toBeCloseTo(0.95, 6);
    // Relative accuracy holds far in the tail, where strong signals live.
    expect(normalSf(6) / 9.865876e-10).toBeCloseTo(1, 5);
  });
});

describe("bhReject and bonferroniReject", () => {
  it("applies the step-up rule, not step-down", () => {
    // Sorted thresholds at q = 0.05, m = 4: 0.0125, 0.025, 0.0375, 0.05.
    // p_(1) = 0.02 fails its own threshold but p_(3) = 0.03 passes, so BH rejects three.
    const p = [0.03, 0.02, 0.6, 0.021];
    const bh = bhReject(p, 0.05);
    expect(bh.count).toBe(3);
    expect(bh.rejected).toEqual([true, true, false, true]);
    const bonf = bonferroniReject(p, 0.05);
    expect(bonf.count).toBe(0);
  });

  it("rejects everything Bonferroni does, and possibly more", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { p } = seededPValues(seed, 20, 6, 3);
      for (const q of [0.01, 0.05, 0.1, 0.2]) {
        const bh = bhReject(p, q);
        const bonf = bonferroniReject(p, q);
        expect(bh.count).toBeGreaterThanOrEqual(bonf.count);
        bonf.rejected.forEach((r, i) => r && expect(bh.rejected[i]).toBe(true));
      }
    }
  });

  it("handles no rejections and an empty family", () => {
    expect(bhReject([0.5, 0.9], 0.05).count).toBe(0);
    expect(bhReject([], 0.05).count).toBe(0);
  });
});

describe("seededPValues", () => {
  it("is deterministic, sorted, and keeps the signal count", () => {
    const a = seededPValues(9, 20, 6, 3);
    expect(seededPValues(9, 20, 6, 3)).toEqual(a);
    expect(a.p).toHaveLength(20);
    expect(a.signal.filter(Boolean)).toHaveLength(6);
    for (let i = 1; i < 20; i++) expect(a.p[i]).toBeGreaterThanOrEqual(a.p[i - 1]);
  });
});

describe("FWER of BH", () => {
  it("has the closed form for 2 nulls and 1 sure signal", () => {
    const q = 0.05;
    const closed = 1 - (1 - (2 * q) / 3) ** 2 + (q / 3) ** 2;
    expect(bhFwerSureSignals(2, 1, q)).toBeCloseTo(closed, 12);
    expect(bhFwerSureSignals(2, 1, q)).toBeCloseTo(0.065833, 5);
  });

  it("equals q under the global null (all tests null)", () => {
    for (const [m, q] of [
      [1, 0.05],
      [3, 0.05],
      [5, 0.1],
      [8, 0.2],
    ]) {
      expect(bhFwerSureSignals(m, 0, q)).toBeCloseTo(q, 10);
    }
  });

  it("exceeds q once signals are present", () => {
    expect(bhFwerSureSignals(2, 1, 0.05)).toBeGreaterThan(0.05);
    expect(bhFwerSureSignals(3, 3, 0.05)).toBeGreaterThan(0.05);
  });

  it("is matched by simulation of the recorded setup", () => {
    const sim = simulateBhFwer(4202, 3, 2, 6, 40_000, 0.05, 100);
    const exact = bhFwerSureSignals(2, 1, 0.05);
    expect(Math.abs(sim.fwer - exact)).toBeLessThan(0.006);
    expect(sim.lower).toBeLessThan(sim.fwer);
    expect(sim.nullP).toHaveLength(100);
    expect(sim.nullP[0]).toHaveLength(2);
    expect(sim.falseReject).toHaveLength(100);
  });

  it("reproduces the recorded lower bound from the recorded rate", () => {
    // CLAIMS.md: fwer = 0.06591, fwer_lower = 0.06409 over 200,000 experiments.
    expect(lowerBound(0.06591, 200_000)).toBeCloseTo(0.06409, 4);
  });
});
