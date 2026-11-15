// Geometry for the 2D evidence graph: a layered layout (claims, readings,
// experiments, outcomes from left to right), edge paths, the fit-to-panel
// transform and pan/zoom limits, and text fitting for SVG labels. Pure: no
// React and no DOM, so every piece is unit-tested.

import { nodeId, type EvidenceEdge, type EvidenceGraphModel, type EvidenceNode } from "@/lib/crux/evidence-graph";

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export type Column = "claim" | "reading" | "experiment" | "outcome";

export const COLUMNS: Record<Column, { x: number; w: number; title: string }> = {
  claim: { x: 0, w: 230, title: "Claims" },
  reading: { x: 282, w: 196, title: "Readings" },
  experiment: { x: 536, w: 236, title: "Experiments" },
  outcome: { x: 818, w: 172, title: "Observed outcomes" },
};

export const COLUMN_ORDER: Column[] = ["claim", "reading", "experiment", "outcome"];

/** Height of one row (one reading or one experiment). */
export const ROW = 26;
/** Gap between two claims' bands. */
export const GROUP_GAP = 12;
/** Space above the first band for the column titles. */
export const HEADER = 22;
export const NODE_H: Record<Column, number> = { claim: 0, reading: 21, experiment: 22, outcome: 20 };
/** Total width of the drawing. */
export const LAYOUT_WIDTH = COLUMNS.outcome.x + COLUMNS.outcome.w;

export interface Placed {
  id: string;
  column: Column;
  /** Left edge. */
  x: number;
  /** Vertical centre. */
  y: number;
  w: number;
  h: number;
}

export interface Band {
  questionId: string;
  top: number;
  bottom: number;
}

export interface GraphLayout {
  nodes: Map<string, Placed>;
  bands: Band[];
  width: number;
  height: number;
}

const columnOf = (n: EvidenceNode): Column => n.kind;

/**
 * Place every node. Each claim gets a horizontal band tall enough for its
 * readings and its experiments; readings and experiments are centred in the
 * band, each outcome sits level with its experiment. The order inside a band
 * follows the model, so a node that is already drawn only ever moves down
 * when a band above it grows.
 */
export function layoutEvidenceGraph(model: EvidenceGraphModel): GraphLayout {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const outcomeOf = new Map<string, string>();
  for (const n of model.nodes) if (n.kind === "outcome") outcomeOf.set(nodeId.experiment(n.experimentId), n.id);
  const nodes = new Map<string, Placed>();
  const bands: Band[] = [];
  let top = HEADER;

  const place = (id: string, column: Column, y: number, h: number) => {
    const c = COLUMNS[column];
    nodes.set(id, { id, column, x: c.x, y, w: c.w, h });
  };

  for (const g of model.groups) {
    const rows = Math.max(2, g.readingIds.length, g.experimentIds.length);
    const height = rows * ROW;
    const stack = (ids: string[], column: Column) => {
      const offset = top + ((rows - ids.length) * ROW) / 2 + ROW / 2;
      ids.forEach((id, i) => {
        if (byId.has(id)) place(id, column, offset + i * ROW, NODE_H[column]);
      });
    };
    stack(g.readingIds, "reading");
    stack(g.experimentIds, "experiment");
    for (const xid of g.experimentIds) {
      const x = nodes.get(xid);
      const oid = outcomeOf.get(xid);
      if (x && oid) place(oid, "outcome", x.y, NODE_H.outcome);
    }
    // The claim box fills its band, up to five lines of text.
    const claimH = Math.min(height - 4, 88);
    if (byId.has(g.claimId)) place(g.claimId, "claim", top + height / 2, claimH);
    bands.push({ questionId: g.questionId, top, bottom: top + height });
    top += height + GROUP_GAP;
  }

  // Anything the groups did not place (should not happen) goes below, never at 0,0 on top of a claim.
  for (const n of model.nodes) {
    if (nodes.has(n.id)) continue;
    const column = columnOf(n);
    place(n.id, column, top + ROW / 2, NODE_H[column] || ROW - 4);
    top += ROW;
  }

  const height = bands.length || nodes.size ? top - (bands.length ? GROUP_GAP : 0) : HEADER;
  return { nodes, bands, width: LAYOUT_WIDTH, height };
}

/** A smooth left-to-right curve from the source's right edge to the target's left edge. */
export function edgePath(a: Placed, b: Placed): string {
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  const x1 = l.x + l.w;
  const y1 = l.y;
  const x2 = r.x;
  const y2 = r.y;
  const mx = (x1 + x2) / 2;
  return `M${round(x1)},${round(y1)} C${round(mx)},${round(y1)} ${round(mx)},${round(y2)} ${round(x2)},${round(y2)}`;
}

/** Midpoint of an edge (where its details card points). */
export function edgeMidpoint(a: Placed, b: Placed): { x: number; y: number } {
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  return { x: (l.x + l.w + r.x) / 2, y: (l.y + r.y) / 2 };
}

/** Edges whose endpoints are both placed; the rest are dropped, never drawn. */
export function drawableEdges(edges: readonly EvidenceEdge[], layout: GraphLayout): EvidenceEdge[] {
  return edges.filter((e) => layout.nodes.has(e.source) && layout.nodes.has(e.target));
}

const round = (v: number) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ */
/* View: fit, zoom and pan                                             */
/* ------------------------------------------------------------------ */

/** Screen = content * k + (x, y). */
export interface View {
  k: number;
  x: number;
  y: number;
}

export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 2.5;
/** Fit never enlarges past this, so a small graph keeps its designed size. */
export const FIT_MAX = 1.15;
/** Fit never shrinks text past this; a taller graph is top-aligned and panned. */
export const FIT_MIN = 0.6;
const PAD = 10;

export function fitView(content: { width: number; height: number }, viewport: { width: number; height: number }): View {
  const w = Math.max(1, viewport.width);
  const h = Math.max(1, viewport.height);
  const cw = Math.max(1, content.width);
  const ch = Math.max(1, content.height);
  const k = clamp(Math.min((w - 2 * PAD) / cw, (h - 2 * PAD) / ch), FIT_MIN, FIT_MAX);
  // Too wide to fit at a readable size: start from the claims column on the left.
  const x = cw * k <= w - 2 * PAD ? (w - cw * k) / 2 : PAD;
  const y = ch * k <= h - 2 * PAD ? (h - ch * k) / 2 : PAD;
  return { k, x, y };
}

/** Keep at least a margin of the drawing on screen and the zoom within limits. */
export function clampView(
  v: View,
  content: { width: number; height: number },
  viewport: { width: number; height: number },
): View {
  const k = clamp(v.k, ZOOM_MIN, ZOOM_MAX);
  const keep = 80;
  const cw = content.width * k;
  const ch = content.height * k;
  const x = clamp(v.x, Math.min(keep - cw, viewport.width - cw), Math.max(viewport.width - keep, 0));
  const y = clamp(v.y, Math.min(keep - ch, viewport.height - ch), Math.max(viewport.height - keep, 0));
  return { k, x, y };
}

/** Zoom by `factor` keeping the screen point (px, py) still. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = clamp(v.k * factor, ZOOM_MIN, ZOOM_MAX);
  const f = k / v.k;
  return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

/** Rough advance width of one character, as a fraction of the font size. */
const SANS_ADVANCE = 0.54;
const MONO_ADVANCE = 0.6;

/** How many characters fit in `width` pixels at `fontPx`. */
export function charsFor(width: number, fontPx: number, mono = false): number {
  return Math.max(1, Math.floor(width / (fontPx * (mono ? MONO_ADVANCE : SANS_ADVANCE))));
}

/** Cut to `max` characters with an ellipsis. */
export function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  if (max <= 1) return "…";
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Word-wrap into at most `maxLines` lines of `maxChars`; the last line ends in … if cut. */
export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = truncate(w, maxChars);
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(1, maxLines));
  const last = kept[kept.length - 1] ?? "";
  kept[kept.length - 1] = last.endsWith("…") ? last : `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  return kept;
}

/**
 * 0.9561 -> "96%", 0.0197 -> "1.97%". Values near the 2% rejection line keep
 * two decimals so a rejected reading never reads as "2%".
 */
export function pct(p: number): string {
  if (!Number.isFinite(p)) return "–";
  const v = p * 100;
  if (v > 0 && v < 3) return `${v.toFixed(2)}%`;
  if (v > 99 && v < 100) return `${v.toFixed(1)}%`;
  return `${Math.round(v)}%`;
}
