// Tests for the 2D evidence graph's geometry (layout, edges, fit, zoom, text).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildEvidenceGraph, nodeId, type EvidenceEdge } from "@/lib/crux/evidence-graph";
import { parseJsonl } from "@/lib/crux/sources";
import {
  COLUMNS,
  FIT_MAX,
  FIT_MIN,
  ZOOM_MAX,
  ZOOM_MIN,
  clampView,
  drawableEdges,
  edgePath,
  fitView,
  layoutEvidenceGraph,
  pct,
  truncate,
  wrapLines,
  zoomAt,
} from "../graphScene";

const FIXTURE = fileURLToPath(new URL("../../../public/fixtures/demo_claims.jsonl", import.meta.url));
const events = parseJsonl(readFileSync(FIXTURE, "utf8"));
const model = buildEvidenceGraph(events);
const layout = layoutEvidenceGraph(model);

describe("layoutEvidenceGraph", () => {
  it("places every node once, in its column, at finite coordinates", () => {
    expect(layout.nodes.size).toBe(model.nodes.length);
    for (const n of model.nodes) {
      const p = layout.nodes.get(n.id);
      expect(p, n.id).toBeDefined();
      expect(p?.column).toBe(n.kind);
      expect(p?.x).toBe(COLUMNS[n.kind].x);
      expect(Number.isFinite(p?.y)).toBe(true);
      expect(p?.y).toBeGreaterThan(0);
      expect(p!.y + p!.h / 2).toBeLessThanOrEqual(layout.height + 0.001);
    }
  });

  it("orders the columns claims, readings, experiments, outcomes, without overlap", () => {
    const order = [COLUMNS.claim, COLUMNS.reading, COLUMNS.experiment, COLUMNS.outcome];
    for (let i = 1; i < order.length; i++) expect(order[i]!.x).toBeGreaterThan(order[i - 1]!.x + order[i - 1]!.w);
  });

  it("keeps each claim's band separate and its nodes inside it", () => {
    for (let i = 1; i < layout.bands.length; i++) {
      expect(layout.bands[i]!.top).toBeGreaterThan(layout.bands[i - 1]!.bottom);
    }
    for (const g of model.groups) {
      const band = layout.bands.find((b) => b.questionId === g.questionId)!;
      for (const id of [g.claimId, ...g.readingIds, ...g.experimentIds]) {
        const p = layout.nodes.get(id)!;
        expect(p.y - p.h / 2).toBeGreaterThanOrEqual(band.top);
        expect(p.y + p.h / 2).toBeLessThanOrEqual(band.bottom);
      }
    }
  });

  it("puts each outcome level with its experiment", () => {
    for (const n of model.nodes) {
      if (n.kind !== "outcome") continue;
      expect(layout.nodes.get(n.id)?.y).toBe(layout.nodes.get(nodeId.experiment(n.experimentId))?.y);
    }
  });

  it("does not stack two nodes of one column on each other", () => {
    for (const column of ["reading", "experiment", "outcome"] as const) {
      const ys = [...layout.nodes.values()].filter((p) => p.column === column).map((p) => p.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(20);
    }
  });

  it("handles an empty run", () => {
    const empty = layoutEvidenceGraph(buildEvidenceGraph([]));
    expect(empty.nodes.size).toBe(0);
    expect(empty.height).toBeGreaterThan(0);
  });
});

describe("edges", () => {
  it("drops an edge whose endpoint is not placed", () => {
    const ghost: EvidenceEdge = { ...model.edges[0]!, id: "ghost", target: "x:nowhere" };
    const kept = drawableEdges([...model.edges, ghost], layout);
    expect(kept).toHaveLength(model.edges.length);
    expect(kept.some((e) => e.id === "ghost")).toBe(false);
  });

  it("runs from the source's right edge to the target's left edge", () => {
    for (const e of model.edges) {
      const a = layout.nodes.get(e.source)!;
      const b = layout.nodes.get(e.target)!;
      const d = edgePath(a, b);
      const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(nums[0]).toBeCloseTo(a.x + a.w, 0);
      expect(nums[1]).toBeCloseTo(a.y, 0);
      expect(nums[nums.length - 2]).toBeCloseTo(b.x, 0);
      expect(nums[nums.length - 1]).toBeCloseTo(b.y, 0);
    }
  });
});

describe("view", () => {
  const content = { width: layout.width, height: layout.height };

  it("fits the drawing inside the panel", () => {
    const v = fitView(content, { width: 1246, height: 386 });
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.y).toBeGreaterThanOrEqual(0);
    expect(v.x + content.width * v.k).toBeLessThanOrEqual(1246);
    expect(v.y + content.height * v.k).toBeLessThanOrEqual(386);
  });

  it("never blows a small graph up, and top-aligns one too tall to read", () => {
    expect(fitView({ width: 200, height: 100 }, { width: 1200, height: 800 }).k).toBe(FIT_MAX);
    const tall = fitView({ width: 1000, height: 5000 }, { width: 1200, height: 400 });
    expect(tall.k).toBe(FIT_MIN);
    expect(tall.y).toBeLessThan(20);
    // On a narrow panel the claims column starts at the left edge, not off screen.
    const narrow = fitView(content, { width: 360, height: 400 });
    expect(narrow.x).toBeGreaterThanOrEqual(0);
    expect(narrow.x).toBeLessThan(20);
  });

  it("zooms about a point within limits", () => {
    const v = { k: 1, x: 0, y: 0 };
    const z = zoomAt(v, 2, 100, 50);
    expect(z.k).toBe(2);
    // The point under the cursor stays put.
    expect((100 - z.x) / z.k).toBeCloseTo(100);
    expect((50 - z.y) / z.k).toBeCloseTo(50);
    expect(zoomAt(v, 100, 0, 0).k).toBe(ZOOM_MAX);
    expect(zoomAt(v, 0.001, 0, 0).k).toBe(ZOOM_MIN);
  });

  it("keeps some of the drawing on screen when panned far away", () => {
    const viewport = { width: 800, height: 400 };
    const far = clampView({ k: 1, x: 99999, y: -99999 }, content, viewport);
    expect(far.x).toBeLessThan(viewport.width);
    expect(far.y + content.height).toBeGreaterThan(0);
  });
});

describe("text", () => {
  it("truncates with an ellipsis", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("a much longer label", 8)).toBe("a much…");
    expect(truncate("a much longer label", 8).length).toBeLessThanOrEqual(8);
  });

  it("wraps words and keeps every letter", () => {
    expect(wrapLines("A negative binomial count with mean μ and dispersion α", 20, 5)).toEqual([
      "A negative binomial",
      "count with mean μ",
      "and dispersion α",
    ]);
  });

  it("cuts the last line with an ellipsis when out of lines", () => {
    const lines = wrapLines("one two three four five six seven eight nine ten", 9, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(9);
  });

  it("formats posteriors so a rejected one never reads as 2%", () => {
    expect(pct(0.9561)).toBe("96%");
    expect(pct(0.0197)).toBe("1.97%");
    expect(pct(0.0062)).toBe("0.62%");
    expect(pct(0)).toBe("0%");
    expect(pct(Number.NaN)).toBe("–");
  });
});
