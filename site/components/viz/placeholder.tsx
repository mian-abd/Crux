"use client";

// Temporary stand-ins for the 3D library. They keep the exported names and props of
// the real components so pages can be built against them; the 3D versions replace
// this file and index.ts.

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface RunEvent {
  seq: number;
  type: string;
  ts: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/* HeroScene: a slow field of linked points                            */
/* ------------------------------------------------------------------ */

export function HeroScene({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let width = 0;
    let height = 0;
    const N = 46;
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const pts = Array.from({ length: N }, () => ({
      x: rand(),
      y: rand(),
      z: 0.35 + rand() * 0.65,
      phase: rand() * Math.PI * 2,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (t: number) => {
      const style = getComputedStyle(canvas);
      const ink = style.color;
      const accent = style.getPropertyValue("--brand").trim() || ink;
      ctx.clearRect(0, 0, width, height);
      const pos = pts.map((p) => ({
        x: (p.x + Math.sin(t * 0.00012 + p.phase) * 0.03) * width,
        y: (p.y + Math.cos(t * 0.0001 + p.phase) * 0.04) * height,
        z: p.z,
      }));
      const reach = Math.min(width, height) * 0.3;
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i += 1) {
        for (let j = i + 1; j < N; j += 1) {
          const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
          if (d > reach) continue;
          ctx.globalAlpha = (1 - d / reach) * 0.22;
          ctx.strokeStyle = ink;
          ctx.beginPath();
          ctx.moveTo(pos[i].x, pos[i].y);
          ctx.lineTo(pos[j].x, pos[j].y);
          ctx.stroke();
        }
      }
      pos.forEach((p, i) => {
        ctx.globalAlpha = 0.35 + p.z * 0.5;
        ctx.fillStyle = i % 9 === 0 ? accent : ink;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (i % 9 === 0 ? 3.2 : 1.8) * p.z, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(canvas);
    if (reduced) draw(0);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduced]);

  return (
    <canvas ref={ref} aria-hidden="true" className={cn("block size-full text-foreground", className)} />
  );
}

/* ------------------------------------------------------------------ */
/* DNAHelix: a flat projection of the double helix                     */
/* ------------------------------------------------------------------ */

const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };

export function DNAHelix({
  sequence = "ATGGTGCATCTGACTCCTGAGGAGAAG",
  highlights = [],
  autoRotate = true,
  className,
}: {
  sequence?: string;
  highlights?: { index: number; from: string; to: string }[];
  autoRotate?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!autoRotate || reduced) return;
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      setPhase(((t - start) / 1000) * 0.5);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, reduced]);

  const marks = useMemo(() => new Map(highlights.map((h) => [h.index, h])), [highlights]);
  const bases = sequence.toUpperCase().split("");
  const step = 26;
  const pad = 30;
  const W = pad * 2 + step * (bases.length - 1);
  const H = 200;
  const mid = H / 2;
  const amp = 52;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`DNA helix of ${bases.length} bases${
        highlights.length ? `, with ${highlights.length} highlighted change` : ""
      }`}
      className={cn("block h-auto w-full text-foreground", className)}
    >
      {bases.map((b, i) => {
        const a = i * 0.6 + phase;
        const y1 = mid + Math.sin(a) * amp;
        const y2 = mid - Math.sin(a) * amp;
        const depth = Math.cos(a);
        const x = pad + i * step;
        const mark = marks.get(i);
        const color = mark ? "var(--v-refuted)" : "currentColor";
        return (
          <g key={i} opacity={0.45 + 0.55 * Math.abs(depth)}>
            <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={mark ? 2.5 : 1} opacity={mark ? 1 : 0.35} />
            <circle cx={x} cy={y1} r={mark ? 6 : 3.5} fill={mark ? color : "var(--brand)"} />
            <circle cx={x} cy={y2} r={mark ? 6 : 3.5} fill={color} opacity={mark ? 1 : 0.55} />
            <text
              x={x}
              y={H - 6}
              textAnchor="middle"
              fontSize="11"
              fontFamily="var(--font-geist-mono), monospace"
              fill={color}
              fontWeight={mark ? 700 : 400}
            >
              {mark ? mark.to : b}
            </text>
            <text
              x={x}
              y={12}
              textAnchor="middle"
              fontSize="11"
              fontFamily="var(--font-geist-mono), monospace"
              fill={color}
              opacity={0.6}
            >
              {PAIR[mark ? mark.to : b] ?? ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* ProteinViewer: a labelled frame until the structure viewer lands    */
/* ------------------------------------------------------------------ */

export function ProteinViewer({
  pdbId,
  highlightResidues = [],
  className,
}: {
  pdbId: string;
  highlightResidues?: { chain: string; residue: number }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-full min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/40 p-6 text-center",
        className,
      )}
    >
      <p className="font-mono text-sm">PDB {pdbId.toUpperCase()}</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        The interactive structure viewer is not loaded in this build.
        {highlightResidues.length > 0 && (
          <>
            {" "}
            Highlighted: {highlightResidues.map((r) => `${r.chain}:${r.residue}`).join(", ")}.
          </>
        )}
      </p>
      <a
        className="text-sm underline underline-offset-4"
        href={`https://www.rcsb.org/structure/${encodeURIComponent(pdbId.toUpperCase())}`}
        target="_blank"
        rel="noreferrer"
      >
        Open the entry at RCSB PDB
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EvidenceGraph3D: questions, options and diagnostics as a flat graph */
/* ------------------------------------------------------------------ */

interface GraphNode {
  id: string;
  label: string;
  col: 0 | 1 | 2;
  state: "plain" | "accepted" | "rejected";
}

export function EvidenceGraph3D({
  events,
  height = 360,
  className,
}: {
  events: RunEvent[];
  height?: number;
  className?: string;
}) {
  const { nodes, links } = useMemo(() => {
    const nodes = new Map<string, GraphNode>();
    const links: { from: string; to: string }[] = [];
    for (const ev of events) {
      const p = ev.payload ?? {};
      if (ev.type === "question.opened" && p.question?.id) {
        nodes.set(p.question.id, { id: p.question.id, label: p.question.id, col: 0, state: "plain" });
      } else if (ev.type === "hypothesis.proposed" && p.hypothesis?.id) {
        const h = p.hypothesis;
        nodes.set(h.id, { id: h.id, label: h.answer_key ?? h.id, col: 1, state: "plain" });
        links.push({ from: h.question_id, to: h.id });
      } else if (ev.type === "experiment.started" && p.experiment_id) {
        nodes.set(p.experiment_id, { id: p.experiment_id, label: p.experiment_id, col: 2, state: "plain" });
        for (const q of p.question_ids ?? []) links.push({ from: q, to: p.experiment_id });
      } else if (ev.type === "hypothesis.rejected" && nodes.has(p.hypothesis_id)) {
        nodes.get(p.hypothesis_id)!.state = "rejected";
      } else if (ev.type === "question.settled" && nodes.has(p.hypothesis_id)) {
        nodes.get(p.hypothesis_id)!.state = "accepted";
      }
    }
    return { nodes: [...nodes.values()], links };
  }, [events]);

  const W = 720;
  const colX = [90, 360, 630];
  const pos = new Map<string, { x: number; y: number }>();
  ([0, 1, 2] as const).forEach((col) => {
    const inCol = nodes.filter((n) => n.col === col);
    inCol.forEach((n, i) => {
      pos.set(n.id, { x: colX[col], y: ((i + 1) / (inCol.length + 1)) * height });
    });
  });
  const fill = (n: GraphNode) =>
    n.state === "accepted" ? "var(--v-holds)" : n.state === "rejected" ? "var(--v-refuted)" : "var(--brand)";

  if (nodes.length === 0) {
    return (
      <div
        style={{ height }}
        className={cn("flex items-center justify-center text-sm text-muted-foreground", className)}
      >
        The graph fills in as questions open.
      </div>
    );
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      style={{ height }}
      role="img"
      aria-label={`Evidence graph: ${nodes.length} nodes`}
      className={cn("block w-full text-foreground", className)}
    >
      {links.map((l, i) => {
        const a = pos.get(l.from);
        const b = pos.get(l.to);
        if (!a || !b) return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" opacity={0.18} />;
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        return (
          <g key={n.id}>
            <circle cx={p.x} cy={p.y} r={n.col === 0 ? 7 : 5} fill={n.col === 0 ? "currentColor" : fill(n)} />
            <text
              x={p.x}
              y={p.y - 11}
              textAnchor="middle"
              fontSize="10"
              fontFamily="var(--font-geist-mono), monospace"
              fill="currentColor"
              opacity={0.7}
              textDecoration={n.state === "rejected" ? "line-through" : undefined}
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
