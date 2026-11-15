"use client";

// The evidence graph used to be a 3D force layout (react-force-graph-3d). It
// is now the 2D layered graph in ./EvidenceGraph.tsx; this module keeps the
// old export name so existing imports (components/viz/index.ts and
// components/viz-lazy.tsx) still resolve to the new view.

export { EvidenceGraph as EvidenceGraph3D, EvidenceGraph as default } from "./EvidenceGraph";
export type { EvidenceGraphProps as EvidenceGraph3DProps } from "./EvidenceGraph";
