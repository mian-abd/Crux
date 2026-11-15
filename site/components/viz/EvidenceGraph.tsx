"use client";

// The run's evidence graph in 2D: claims on the left, each claim's competing
// readings, the experiments that tested them and the outcomes they observed,
// laid out in columns and drawn as plain SVG. It rebuilds from the run state
// on every streamed batch, so nodes and edges appear as events arrive and
// colours follow the posteriors. Colours are the site's verdict tokens
// (--v-holds, --v-refuted, --v-cond, --v-unresolved, --v-open), read as CSS
// variables, so the light and dark themes both work without a repaint.
//
// Hover or focus a node or an edge for its details; click (or Enter) pins
// them. Drag to pan, Ctrl or Cmd + wheel (or pinch) to zoom, the buttons zoom
// and fit. Edges are only drawn between nodes that exist.

import { MinusIcon, PlusIcon, ScanIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { VERDICT_LABEL, type ClaimVerdict } from "@/lib/crux/claims";
import {
  REJECT_BELOW,
  SETTLE_AT,
  buildEvidenceGraph,
  humanize,
  type ClaimNode,
  type EdgeKind,
  type EvidenceEdge,
  type EvidenceNode,
  type ExperimentNode,
  type GraphEvent,
  type OutcomeNode,
  type ReadingNode,
  type ReadingState,
} from "@/lib/crux/evidence-graph";
import type { RunState } from "@/lib/crux/fold";
import { cn } from "@/lib/utils";

import {
  COLUMNS,
  COLUMN_ORDER,
  GROUP_GAP,
  charsFor,
  clampView,
  drawableEdges,
  edgeMidpoint,
  edgePath,
  fitView,
  layoutEvidenceGraph,
  pct,
  truncate,
  wrapLines,
  zoomAt,
  type Placed,
  type View,
} from "./graphScene";
import { useElementSize } from "./hooks";

export interface EvidenceGraphProps {
  /** The run's events so far (append-only while it streams). */
  events: readonly GraphEvent[];
  /** The folded run state, when the page already has it; otherwise the events are folded here. */
  run?: RunState;
  height?: number;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

const VERDICT_COLOR: Record<ClaimVerdict, string> = {
  holds: "var(--v-holds)",
  holds_if: "var(--v-cond)",
  refuted: "var(--v-refuted)",
  unresolved: "var(--v-unresolved)",
  open: "var(--v-open)",
  other: "var(--v-open)",
};

const READING_COLOR: Record<ReadingState, string> = {
  settled: "var(--v-holds)",
  rejected: "var(--v-refuted)",
  active: "var(--v-open)",
  unresolved: "var(--v-unresolved)",
};

const READING_TEXT: Record<ReadingState, string> = {
  settled: "Settled",
  rejected: "Rejected",
  active: "Active",
  unresolved: "Unresolved",
};

const READING_GLYPH: Record<ReadingState, string> = {
  settled: "✓",
  rejected: "✕",
  active: "•",
  unresolved: "?",
};

const EDGE_STYLE: Record<EdgeKind, { stroke: string; width: number; dash?: string; opacity: number }> = {
  reading: { stroke: "var(--muted-foreground)", width: 1, opacity: 0.4 },
  observed: { stroke: "var(--muted-foreground)", width: 1, opacity: 0.5 },
  predicts: { stroke: "var(--muted-foreground)", width: 1.1, dash: "2 3", opacity: 0.85 },
  tested_by: { stroke: "var(--muted-foreground)", width: 1.25, opacity: 0.6 },
  supports: { stroke: "var(--v-holds)", width: 2.2, opacity: 0.95 },
  rejected_by: { stroke: "var(--v-refuted)", width: 1.8, dash: "6 3", opacity: 0.95 },
};

const EDGE_TEXT: Record<EdgeKind, string> = {
  reading: "reading of",
  observed: "observed",
  predicts: "predicts",
  tested_by: "tested by",
  supports: "supports",
  rejected_by: "rejected by",
};

const SANS = "var(--font-text), ui-sans-serif, system-ui, sans-serif";
const MONO = "var(--font-code), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type Focus = { id: string; pinned: boolean } | null;

export function EvidenceGraph({ events, run, height = 420, className }: EvidenceGraphProps) {
  const model = useMemo(() => buildEvidenceGraph(events, run), [events, run]);
  const layout = useMemo(() => layoutEvidenceGraph(model), [model]);
  const edges = useMemo(() => drawableEdges(model.edges, layout), [model.edges, layout]);
  const nodeById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model.nodes]);
  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);

  const stage = useRef<HTMLDivElement>(null);
  const size = useElementSize(stage);
  const [userView, setUserView] = useState<View | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [dragging, setDragging] = useState(false);

  const content = useMemo(() => ({ width: layout.width, height: layout.height }), [layout.width, layout.height]);
  const view = userView ? clampView(userView, content, size) : fitView(content, size);

  // Latest values for the native wheel listener (React's own is passive).
  const latest = useRef({ view, content, size });
  useEffect(() => {
    latest.current = { view, content, size };
  });

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Plain wheel scrolls the page; Ctrl/Cmd + wheel (and trackpad pinch) zooms.
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-Math.max(-60, Math.min(60, delta)) * 0.004);
      setUserView((prev) => {
        const cur = latest.current;
        const from = prev ? clampView(prev, cur.content, cur.size) : fitView(cur.content, cur.size);
        return clampView(zoomAt(from, factor, px, py), cur.content, cur.size);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* Pan ------------------------------------------------------------- */

  const drag = useRef<{ id: number; sx: number; sy: number; v: View; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    suppressClick.current = false;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, v: view, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    setUserView(clampView({ k: d.v.k, x: d.v.x + dx, y: d.v.y + dy }, content, size));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      suppressClick.current = true;
      setDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Functional update: several quick clicks each zoom from the previous result.
  const zoomBy = (factor: number) =>
    setUserView((prev) => {
      const cur = latest.current;
      const from = prev ? clampView(prev, cur.content, cur.size) : fitView(cur.content, cur.size);
      return clampView(zoomAt(from, factor, cur.size.width / 2, cur.size.height / 2), cur.content, cur.size);
    });

  /* Focus ----------------------------------------------------------- */

  const enter = (id: string) => setFocus((f) => (f?.pinned ? f : { id, pinned: false }));
  const leave = (id: string) => setFocus((f) => (f && !f.pinned && f.id === id ? null : f));
  const toggle = (id: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setFocus((f) => (f?.pinned && f.id === id ? null : { id, pinned: true }));
  };
  const onKey = (id: string) => (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFocus((f) => (f?.pinned && f.id === id ? null : { id, pinned: true }));
    }
  };

  const focusedNode = focus ? (nodeById.get(focus.id) ?? null) : null;
  const focusedEdge = focus ? (edgeById.get(focus.id) ?? null) : null;
  const active = focusedNode || focusedEdge ? focus : null;

  // What stays bright while something is focused.
  const lit = useMemo(() => {
    if (!active) return null;
    const nodes = new Set<string>();
    const lines = new Set<string>();
    const edge = edgeById.get(active.id);
    if (edge) {
      nodes.add(edge.source);
      nodes.add(edge.target);
      lines.add(edge.id);
      return { nodes, lines };
    }
    const node = nodeById.get(active.id);
    if (!node) return null;
    if (node.kind === "claim") {
      // A claim lights its whole band: readings, experiments, outcomes.
      const group = model.groups.find((g) => g.claimId === node.id);
      for (const id of [node.id, ...(group?.readingIds ?? []), ...(group?.experimentIds ?? [])]) nodes.add(id);
      for (const e of edges) {
        if (nodes.has(e.source) && (nodes.has(e.target) || e.kind === "observed")) {
          nodes.add(e.target);
          lines.add(e.id);
        }
      }
      return { nodes, lines };
    }
    nodes.add(node.id);
    for (const e of edges) {
      if (e.source === node.id || e.target === node.id) {
        nodes.add(e.source);
        nodes.add(e.target);
        lines.add(e.id);
      }
    }
    return { nodes, lines };
  }, [active, edgeById, nodeById, edges, model.groups]);

  /* Render ---------------------------------------------------------- */

  const empty = model.nodes.length === 0;
  const ready = size.width > 0 && size.height > 0;
  const animate = !userView && !dragging;

  const ordered = useMemo(() => {
    const rank: Record<EdgeKind, number> = {
      reading: 0,
      observed: 0,
      predicts: 1,
      tested_by: 1,
      rejected_by: 2,
      supports: 3,
    };
    return [...edges].sort((a, b) => rank[a.kind] - rank[b.kind]);
  }, [edges]);

  let card: ReactNode = null;
  if (active && ready) {
    let anchor: { x: number; y: number; left: number } | null = null;
    if (focusedNode) {
      const p = layout.nodes.get(focusedNode.id);
      if (p) anchor = { x: view.x + (p.x + p.w) * view.k, y: view.y + p.y * view.k, left: view.x + p.x * view.k };
    } else if (focusedEdge) {
      const a = layout.nodes.get(focusedEdge.source);
      const b = layout.nodes.get(focusedEdge.target);
      if (a && b) {
        const m = edgeMidpoint(a, b);
        anchor = { x: view.x + m.x * view.k, y: view.y + m.y * view.k, left: view.x + m.x * view.k };
      }
    }
    if (anchor) {
      const W = Math.min(300, size.width - 16);
      const right = anchor.x + 12 + W <= size.width - 8;
      const left = right ? anchor.x + 12 : Math.max(8, anchor.left - 12 - W);
      const top = Math.max(8, Math.min(anchor.y - 24, size.height - 168));
      card = (
        <div
          role={active.pinned ? "dialog" : "tooltip"}
          aria-label="Details"
          className={cn(
            "absolute z-10 max-h-[calc(100%-16px)] overflow-auto rounded-lg border bg-popover px-3 py-2.5 text-xs leading-relaxed text-popover-foreground shadow-lg",
            active.pinned ? "pointer-events-auto" : "pointer-events-none",
          )}
          style={{ left, top, width: W }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {focusedNode ? (
            <NodeDetails node={focusedNode} nodeById={nodeById} edges={edges} />
          ) : focusedEdge ? (
            <EdgeDetails edge={focusedEdge} nodeById={nodeById} />
          ) : null}
          {active.pinned && (
            <div className="mt-2 flex items-center gap-4">
              {focusedNode?.kind === "claim" && <ClaimCardLink index={focusedNode.index} />}
              <button
                type="button"
                className="font-mono text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                onClick={() => setFocus(null)}
              >
                Close
              </button>
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div className={cn("cx-eg flex flex-col", className)} style={{ height }}>
      <style>{GRAPH_CSS}</style>
      <Legend
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        onFit={() => setUserView(null)}
        fitted={!userView}
      />
      <div
        ref={stage}
        className="relative min-h-0 flex-1 overflow-hidden select-none"
        style={{ touchAction: "pan-y", cursor: dragging ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setFocus(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setFocus(null);
        }}
      >
        {ready && !empty && (
          <svg
            width={size.width}
            height={size.height}
            className="block"
            role="group"
            aria-label={`Evidence graph: ${model.counts.claims} claims, ${model.counts.readings} readings, ${model.counts.experimentsRun} experiments run`}
          >
            <g
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
                transformOrigin: "0 0",
                transition: animate ? "transform 380ms ease" : "none",
              }}
            >
              {COLUMN_ORDER.map((c) => (
                <text
                  key={c}
                  x={COLUMNS[c].x + 2}
                  y={11}
                  fontFamily={MONO}
                  fontSize={9.5}
                  letterSpacing="0.06em"
                  fill="var(--muted-foreground)"
                >
                  {COLUMNS[c].title.toUpperCase()}
                </text>
              ))}
              {layout.bands.slice(1).map((b) => (
                <line
                  key={b.questionId}
                  x1={0}
                  x2={layout.width}
                  y1={b.top - GROUP_GAP / 2}
                  y2={b.top - GROUP_GAP / 2}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              ))}

              <g aria-hidden="true">
                {ordered.map((e) => {
                  const a = layout.nodes.get(e.source);
                  const b = layout.nodes.get(e.target);
                  if (!a || !b) return null;
                  const st = EDGE_STYLE[e.kind];
                  const dim = lit ? !lit.lines.has(e.id) : false;
                  const faded = e.kind === "reading" && nodeById.get(e.target)?.kind === "reading"
                    ? (nodeById.get(e.target) as ReadingNode).state === "rejected"
                    : false;
                  return (
                    <path
                      key={e.id}
                      className="eg-edge eg-in"
                      data-kind={e.kind}
                      data-source={e.source}
                      data-target={e.target}
                      d={edgePath(a, b)}
                      fill="none"
                      stroke={st.stroke}
                      strokeWidth={st.width}
                      strokeDasharray={st.dash}
                      strokeLinecap="round"
                      opacity={dim ? 0.1 : faded ? st.opacity * 0.5 : st.opacity}
                    />
                  );
                })}
              </g>
              {/* Wide invisible strokes so thin edges are easy to hover. */}
              <g>
                {ordered.map((e) => {
                  if (e.kind === "reading" || e.kind === "observed") return null;
                  const a = layout.nodes.get(e.source);
                  const b = layout.nodes.get(e.target);
                  if (!a || !b) return null;
                  return (
                    <path
                      key={e.id}
                      d={edgePath(a, b)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={9}
                      pointerEvents="stroke"
                      style={{ cursor: "pointer" }}
                      onPointerEnter={() => enter(e.id)}
                      onPointerLeave={() => leave(e.id)}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggle(e.id);
                      }}
                    />
                  );
                })}
              </g>

              {model.nodes.map((n) => {
                const p = layout.nodes.get(n.id);
                if (!p) return null;
                const dim = lit ? !lit.nodes.has(n.id) : false;
                const selected = active?.id === n.id;
                return (
                  <g
                    key={n.id}
                    className="eg-node eg-in"
                    data-id={n.id}
                    data-state={n.kind === "claim" ? n.verdict : n.kind === "outcome" ? (n.valid ? "valid" : "invalid") : n.state}
                    transform={`translate(${p.x},${p.y - p.h / 2})`}
                    opacity={dim ? 0.28 : 1}
                    tabIndex={0}
                    role="button"
                    aria-label={ariaLabel(n)}
                    aria-pressed={selected && active?.pinned ? true : undefined}
                    style={{ cursor: "pointer", outline: "none" }}
                    onPointerEnter={() => enter(n.id)}
                    onPointerLeave={() => leave(n.id)}
                    onFocus={() => enter(n.id)}
                    onBlur={() => leave(n.id)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      toggle(n.id);
                    }}
                    onKeyDown={onKey(n.id)}
                  >
                    <NodeShape node={n} p={p} selected={selected} />
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {!empty && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-2 bottom-1.5 rounded bg-card/85 px-1.5 font-mono text-[10px] text-muted-foreground"
          >
            hover or tap for details · drag to pan · ctrl + scroll to zoom
          </div>
        )}
        {empty && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center font-mono text-xs text-muted-foreground">
            {events.length === 0 ? "Waiting for the run's events…" : "Waiting for the run's first claim…"}
          </div>
        )}
        {card}
      </div>
    </div>
  );
}

export default EvidenceGraph;

/* ------------------------------------------------------------------ */
/* Nodes                                                               */
/* ------------------------------------------------------------------ */

function NodeShape({ node, p, selected }: { node: EvidenceNode; p: Placed; selected: boolean }) {
  const ring = selected ? (
    <rect
      x={-3}
      y={-3}
      width={p.w + 6}
      height={p.h + 6}
      rx={9}
      fill="none"
      stroke="var(--brand)"
      strokeWidth={1.5}
      opacity={0.9}
    />
  ) : null;
  if (node.kind === "claim") return <ClaimShape n={node} p={p} ring={ring} />;
  if (node.kind === "reading") return <ReadingShape n={node} p={p} ring={ring} />;
  if (node.kind === "experiment") return <ExperimentShape n={node} p={p} ring={ring} />;
  return <OutcomeShape n={node} p={p} ring={ring} />;
}

function ClaimShape({ n, p, ring }: { n: ClaimNode; p: Placed; ring: ReactNode }) {
  const color = VERDICT_COLOR[n.verdict];
  const maxLines = Math.max(1, Math.min(5, Math.floor((p.h - 24) / 13)));
  const lines = wrapLines(n.text, charsFor(p.w - 22, 11), maxLines);
  const tags = [
    `CLAIM ${n.index}`,
    n.pending ? "LISTED" : VERDICT_LABEL[n.verdict].toUpperCase(),
    n.testing ? "TESTING" : null,
    n.planted ? "PLANTED" : null,
  ].filter(Boolean);
  const textTop = (p.h - (14 + lines.length * 13)) / 2;
  return (
    <>
      {ring}
      <rect className="eg-frame" width={p.w} height={p.h} rx={7} fill="var(--card)" stroke={color} strokeWidth={1.2} />
      <rect className="eg-fill" width={p.w} height={p.h} rx={7} fill={color} fillOpacity={n.verdict === "open" ? 0 : 0.08} />
      <rect className="eg-fill" x={0} y={0} width={4} height={p.h} rx={2} fill={color} />
      <text x={12} y={textTop + 10} fontFamily={MONO} fontSize={9} letterSpacing="0.05em" fill={color} className="eg-fill">
        {truncate(tags.join(" · "), charsFor(p.w - 20, 9, true))}
      </text>
      {lines.map((line, i) => (
        <text key={i} x={12} y={textTop + 25 + i * 13} fontFamily={SANS} fontSize={11} fill="var(--foreground)">
          {line}
        </text>
      ))}
    </>
  );
}

function ReadingShape({ n, p, ring }: { n: ReadingNode; p: Placed; ring: ReactNode }) {
  const color = READING_COLOR[n.state];
  const rejected = n.state === "rejected";
  const tinted = n.state === "settled" || n.state === "unresolved";
  const value = pct(n.posterior);
  const labelChars = charsFor(p.w - 30 - value.length * 6.2, 11);
  return (
    <>
      {ring}
      <rect className="eg-frame" width={p.w} height={p.h} rx={5} fill="var(--card)" stroke={color} strokeWidth={n.state === "settled" ? 1.6 : 1.1} />
      <rect className="eg-fill" width={p.w} height={p.h} rx={5} fill={color} fillOpacity={tinted ? 0.12 : 0} />
      {n.updateSeq !== null && (
        <rect key={n.updateSeq} className="eg-flash" width={p.w} height={p.h} rx={5} fill={color} fillOpacity={0} />
      )}
      <text x={8} y={p.h / 2 + 3.5} fontFamily={SANS} fontSize={10.5} fontWeight={600} fill={color} className="eg-fill">
        {READING_GLYPH[n.state]}
      </text>
      <text
        x={20}
        y={p.h / 2 + 3.5}
        fontFamily={SANS}
        fontSize={11}
        fill={rejected ? "var(--muted-foreground)" : "var(--foreground)"}
        textDecoration={rejected ? "line-through" : undefined}
        fontStyle={n.isNull ? "italic" : undefined}
      >
        {truncate(n.label, labelChars)}
      </text>
      <text
        x={p.w - 7}
        y={p.h / 2 + 3.5}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={10}
        fill={rejected ? "var(--muted-foreground)" : "var(--foreground)"}
      >
        {value}
      </text>
      <rect x={20} y={p.h - 3.5} width={p.w - 27} height={1.8} rx={0.9} fill="var(--muted)" />
      <rect
        className="eg-bar"
        x={20}
        y={p.h - 3.5}
        width={p.w - 27}
        height={1.8}
        rx={0.9}
        fill={color}
        style={{ transform: `scaleX(${Math.max(0, Math.min(1, n.posterior))})` }}
      />
    </>
  );
}

function ExperimentShape({ n, p, ring }: { n: ExperimentNode; p: Placed; ring: ReactNode }) {
  const stroke =
    n.state === "invalid" ? "var(--v-refuted)" : n.state === "running" ? "var(--brand)" : n.state === "done" ? "var(--foreground)" : "var(--muted-foreground)";
  const glyph = n.state === "invalid" ? "✕" : n.state === "running" ? "●" : n.state === "done" ? "✓" : "◌";
  const bits = n.eigBits !== null ? `${n.eigBits.toFixed(2)} b` : "";
  const label = n.goal || humanize(n.experimentId);
  return (
    <>
      {ring}
      <rect
        className={cn("eg-frame", n.state === "running" && "eg-running")}
        width={p.w}
        height={p.h}
        rx={4}
        fill="var(--card)"
        stroke={stroke}
        strokeOpacity={n.state === "done" ? 0.55 : 1}
        strokeWidth={n.state === "running" ? 1.7 : 1.1}
        strokeDasharray={n.state === "chosen" || n.state === "invalid" ? "4 3" : undefined}
      />
      <text x={7} y={p.h / 2 + 3.5} fontFamily={SANS} fontSize={10} fill={stroke} className="eg-fill">
        {glyph}
      </text>
      <text x={19} y={p.h / 2 + 3.5} fontFamily={SANS} fontSize={10.5} fill="var(--foreground)">
        {truncate(label, charsFor(p.w - 26 - bits.length * 5.7, 10.5))}
      </text>
      {bits && (
        <text x={p.w - 6} y={p.h / 2 + 3.5} textAnchor="end" fontFamily={MONO} fontSize={9.5} fill="var(--muted-foreground)">
          {bits}
        </text>
      )}
    </>
  );
}

function OutcomeShape({ n, p, ring }: { n: OutcomeNode; p: Placed; ring: ReactNode }) {
  const stroke = n.valid ? "var(--muted-foreground)" : "var(--v-refuted)";
  return (
    <>
      {ring}
      <rect
        className="eg-frame"
        width={p.w}
        height={p.h}
        rx={p.h / 2}
        fill="var(--muted)"
        stroke={stroke}
        strokeOpacity={n.valid ? 0.55 : 1}
        strokeDasharray={n.valid ? undefined : "4 3"}
      />
      <text x={10} y={p.h / 2 + 3.5} fontFamily={MONO} fontSize={10} fill={n.valid ? "var(--foreground)" : "var(--v-refuted)"}>
        {truncate(n.label, charsFor(p.w - 18, 10, true))}
      </text>
    </>
  );
}

function ariaLabel(n: EvidenceNode): string {
  if (n.kind === "claim") return `Claim ${n.index}, ${VERDICT_LABEL[n.verdict]}: ${n.text}`;
  if (n.kind === "reading") return `Reading ${n.label}, ${READING_TEXT[n.state]}, posterior ${pct(n.posterior)}`;
  if (n.kind === "experiment")
    return `Experiment ${humanize(n.experimentId)}, ${n.state}${n.eigBits !== null ? `, ${n.eigBits.toFixed(2)} bits expected` : ""}`;
  return `Observed outcome ${n.label}`;
}

/* ------------------------------------------------------------------ */
/* Details                                                             */
/* ------------------------------------------------------------------ */

function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div className="mb-1 font-mono text-[10px] tracking-wider uppercase" style={{ color: color ?? "var(--muted-foreground)" }}>
      {children}
    </div>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">{children}</div>;
}

function NodeDetails({
  node,
  nodeById,
  edges,
}: {
  node: EvidenceNode;
  nodeById: Map<string, EvidenceNode>;
  edges: EvidenceEdge[];
}) {
  if (node.kind === "claim") {
    const color = VERDICT_COLOR[node.verdict];
    const status = node.pending
      ? "Listed; its readings are not proposed yet."
      : node.settledLabel
        ? `Settled on “${node.settledLabel}” at p ${node.settledPosterior?.toFixed(2) ?? "–"}.`
        : node.reason
          ? `Unresolved: ${node.reason}.`
          : node.testing
            ? "Open: an experiment is running."
            : "Open.";
    return (
      <>
        <Eyebrow color={color}>
          Claim {node.index} · {VERDICT_LABEL[node.verdict]}
          {node.planted ? " · planted" : ""}
        </Eyebrow>
        <p className="text-[13px] leading-snug">{node.text}</p>
        {node.question && <p className="mt-1 text-muted-foreground">{node.question}</p>}
        <p className="mt-1.5" style={{ color }}>
          {status}
        </p>
      </>
    );
  }
  if (node.kind === "reading") {
    const color = READING_COLOR[node.state];
    const claim = nodeById.get(`c:${node.questionId}`);
    return (
      <>
        <Eyebrow color={color}>
          Reading · {READING_TEXT[node.state]}
          {claim?.kind === "claim" ? ` · claim ${claim.index}` : ""}
        </Eyebrow>
        <p className="text-[13px] leading-snug">{node.statement}</p>
        {node.rejectedReason && <p className="mt-1 text-muted-foreground">{node.rejectedReason}</p>}
        <Meta>
          posterior {pct(node.posterior)}
          {node.prevPosterior !== null ? ` (was ${pct(node.prevPosterior)})` : ""} · prior {pct(node.prior)}
        </Meta>
        <Meta>
          rejected below {REJECT_BELOW} · settles at {SETTLE_AT}
        </Meta>
      </>
    );
  }
  if (node.kind === "experiment") {
    const tested = edges.filter((e) => e.target === node.id && e.source.startsWith("r:")).length;
    const outcomeEdge = edges.find((e) => e.source === node.id && e.kind === "observed");
    const outcome = outcomeEdge ? nodeById.get(outcomeEdge.target) : undefined;
    const state =
      node.state === "chosen"
        ? "Chosen, waiting to run"
        : node.state === "running"
          ? "Running"
          : node.state === "invalid"
            ? "Ruled invalid by the referee (no belief update)"
            : "Ran; the referee accepted it";
    return (
      <>
        <Eyebrow>Experiment · {node.experimentKind || "check"}</Eyebrow>
        <p className="text-[13px] leading-snug">{node.goal || humanize(node.experimentId)}</p>
        <Meta>
          {node.experimentId}
          {node.eigBits !== null ? ` · ${node.eigBits.toFixed(2)} bits expected` : ""} · tests {tested} reading
          {tested === 1 ? "" : "s"}
        </Meta>
        <p className="mt-1.5" style={{ color: node.state === "invalid" ? "var(--v-refuted)" : undefined }}>
          {state}
        </p>
        {outcome?.kind === "outcome" && outcome.valid && (
          <p className="mt-1">
            Observed <span className="font-mono">{outcome.binId ?? outcome.label}</span>
            {outcome.description ? `: ${outcome.description}` : ""}
          </p>
        )}
        {node.refereeNote && <p className="mt-1 text-muted-foreground">Referee: {truncate(node.refereeNote, 220)}</p>}
      </>
    );
  }
  return (
    <>
      <Eyebrow color={node.valid ? undefined : "var(--v-refuted)"}>Observed outcome</Eyebrow>
      <p className="font-mono text-[12px]">{node.binId ?? node.label}</p>
      {node.description && <p className="mt-1 text-[13px] leading-snug">{node.description}</p>}
      {!node.valid && <p className="mt-1" style={{ color: "var(--v-refuted)" }}>The referee ruled the run invalid, so beliefs did not move.</p>}
      {node.likelihoods.length > 0 && (
        <Meta>
          expected by {node.likelihoods.map((l) => `${l.label} ${pct(l.p)}`).join(" · ")}
        </Meta>
      )}
    </>
  );
}

function EdgeDetails({ edge, nodeById }: { edge: EvidenceEdge; nodeById: Map<string, EvidenceNode> }) {
  const a = nodeById.get(edge.source);
  const b = nodeById.get(edge.target);
  if (!a || !b) return null;
  const st = EDGE_STYLE[edge.kind];
  const reading = a.kind === "reading" ? a : null;
  const exp = b.kind === "experiment" ? b : null;
  const name = reading?.label ?? "";
  const expName = exp ? truncate(exp.goal || humanize(exp.experimentId), 80) : "";
  let line = "";
  if (edge.kind === "predicts") {
    line = edge.predictedBin
      ? `${name} predicts “${humanize(edge.predictedBin)}” (${pct(edge.predictedP ?? 0)}) for this experiment; it has not been observed yet.`
      : `${name} is waiting on this experiment.`;
  } else if (edge.kind === "supports") {
    line = `Observed “${humanize(edge.observedBin ?? "")}” raised ${name} from ${pct(edge.before ?? 0)} to ${pct(edge.after ?? 0)}.`;
  } else if (edge.kind === "rejected_by") {
    line =
      edge.after !== null
        ? `Observed “${humanize(edge.observedBin ?? "")}” dropped ${name} from ${edge.before !== null ? pct(edge.before) : "–"} to ${pct(edge.after)}, below ${REJECT_BELOW}: rejected.`
        : `${name} was rejected after this experiment.`;
  } else if (edge.kind === "tested_by") {
    line =
      edge.after !== null && edge.before !== null
        ? `Observed “${humanize(edge.observedBin ?? "")}” moved ${name} from ${pct(edge.before)} to ${pct(edge.after)}.`
        : `${name} was tested, but the result was ruled invalid, so its posterior did not move.`;
  }
  return (
    <>
      <Eyebrow color={st.stroke}>Edge · {EDGE_TEXT[edge.kind]}</Eyebrow>
      <p className="text-[13px] leading-snug">{line}</p>
      {exp && <Meta>{expName}</Meta>}
      {edge.observedP !== null && edge.kind !== "predicts" && (
        <Meta>
          {name} gave the observed outcome {pct(edge.observedP)}
          {edge.predictedBin && edge.predictedBin !== edge.observedBin
            ? `; it expected “${humanize(edge.predictedBin)}”`
            : ""}
        </Meta>
      )}
    </>
  );
}

/** A link to the claim's card on the run page, only when that card is there. */
function ClaimCardLink({ index }: { index: number }) {
  // Rendered only after a hover or tap, so the document is there.
  const present = typeof document !== "undefined" && document.getElementById(`claim-${index}`) !== null;
  if (!present) return null;
  return (
    <a
      href={`#claim-${index}`}
      className="font-mono text-[11px] text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      Open claim card {index} ↑
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Legend and controls                                                 */
/* ------------------------------------------------------------------ */

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className="inline-block size-2.5 rounded-[3px] border"
        style={{ background: color, borderColor: color }}
      />
      {label}
    </span>
  );
}

function EdgeKey({ kind }: { kind: EdgeKind }) {
  const st = EDGE_STYLE[kind];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg width="22" height="8" aria-hidden="true" className="overflow-visible">
        <line
          x1="1"
          x2="21"
          y1="4"
          y2="4"
          stroke={st.stroke}
          strokeWidth={st.width}
          strokeDasharray={st.dash}
          strokeLinecap="round"
          opacity={Math.max(0.7, st.opacity)}
        />
      </svg>
      {EDGE_TEXT[kind]}
    </span>
  );
}

function Legend({
  onZoomIn,
  onZoomOut,
  onFit,
  fitted,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  fitted: boolean;
}) {
  const btn =
    "inline-flex size-6 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-1.5 font-mono text-[10.5px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Swatch color="var(--v-holds)" label="settled / holds" />
        <Swatch color="var(--v-cond)" label="holds if" />
        <Swatch color="var(--v-refuted)" label="rejected / refuted" />
        <Swatch color="var(--v-open)" label="active / open" />
        <Swatch color="var(--v-unresolved)" label="unresolved" />
        <span aria-hidden="true" className="text-border">
          |
        </span>
        <EdgeKey kind="predicts" />
        <EdgeKey kind="tested_by" />
        <EdgeKey kind="supports" />
        <EdgeKey kind="rejected_by" />
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
          <MinusIcon className="size-3.5" />
        </button>
        <button type="button" className={btn} onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
          <PlusIcon className="size-3.5" />
        </button>
        <button type="button" className={btn} onClick={onFit} disabled={fitted} aria-label="Fit to panel" title="Fit to panel">
          <ScanIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const GRAPH_CSS = `
.cx-eg .eg-frame, .cx-eg .eg-fill, .cx-eg .eg-edge { transition: stroke 500ms ease, fill 500ms ease, fill-opacity 500ms ease, opacity 300ms ease; }
.cx-eg .eg-node { transition: opacity 200ms ease; }
.cx-eg .eg-node:focus-visible .eg-frame { stroke: var(--brand); stroke-width: 2; }
.cx-eg .eg-bar { transform-box: fill-box; transform-origin: left center; transition: transform 600ms ease, fill 500ms ease; }
.cx-eg .eg-in { animation: eg-in 420ms ease-out; }
.cx-eg .eg-flash { animation: eg-flash 1100ms ease-out both; pointer-events: none; }
.cx-eg .eg-running { animation: eg-pulse 1.1s ease-in-out infinite; }
@keyframes eg-in { from { opacity: 0; } }
@keyframes eg-flash { from { fill-opacity: 0.35; } to { fill-opacity: 0; } }
@keyframes eg-pulse { 0%, 100% { stroke-opacity: 1; } 50% { stroke-opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) {
  .cx-eg .eg-in, .cx-eg .eg-flash, .cx-eg .eg-running { animation: none; }
  .cx-eg .eg-frame, .cx-eg .eg-fill, .cx-eg .eg-edge, .cx-eg .eg-bar { transition: none; }
}
`;
