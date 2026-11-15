"use client";

// The still frame for DNAHelix: the same B-DNA layout, in the same pose,
// drawn as SVG. It costs no WebGL context, so it stands in while the live
// helix loads, while it is off screen, and if its context is lost.

import { useMemo } from "react";
import { useColorMode } from "./hooks";
import { HBB_FIRST_27, cleanSequence, describeHighlight, layoutHelix, type Highlight } from "./sequence";
import { BACKBONE_COLOR, BASE_COLORS, MONO_FONT, PALETTE, type Base } from "./theme";

export interface HelixPosterProps {
  sequence?: string;
  highlights?: Highlight[];
  className?: string;
}

/** The live view's tilt about the helix axis (Rig rotation plus the camera's lift). */
const TILT = 0.72;
/** The live view's frame: 16:7. */
const ASPECT = 16 / 7;
const SUBDIV = 6;

/** Three decimals: enough for the drawing, and the server and browser print the same digits. */
const q = (v: number) => Math.round(v * 1000) / 1000;

export function HelixPoster({ sequence, highlights, className }: HelixPosterProps) {
  const mode = useColorMode();
  const seq = useMemo(() => cleanSequence(sequence ?? HBB_FIRST_27) || HBB_FIRST_27, [sequence]);

  const drawing = useMemo(() => {
    const layout = layoutHelix(seq);
    const { radius: r, rise, bpPerTurn, strandOffset } = layout.params;
    const twist = (2 * Math.PI) / bpPerTurn;
    const n = layout.pairs.length;
    const infos = (highlights ?? [])
      .filter((h) => h.index >= 0 && h.index < seq.length)
      .map((h) => describeHighlight(seq, h));
    const hl = new Set(infos.flatMap((i) => i.indices));
    const lower = infos.length ? 0.45 : 0;
    const c = Math.cos(TILT);
    const s = Math.sin(TILT);
    // Screen x, screen y (down), depth (towards the viewer).
    const project = (x: number, y: number, z: number): [number, number, number] => [
      q(x),
      q(-(y * c - z * s) + lower),
      q(y * s + z * c),
    ];
    const at = (t: number, strand: 0 | 1) => {
      const a = t * twist + (strand ? strandOffset : 0);
      return project((t - (n - 1) / 2) * rise, r * Math.cos(a), r * Math.sin(a));
    };

    type Item = { z: number; key: string; kind: "tube" | "bond" | "bead"; d: number[]; color: string; w: number };
    const items: Item[] = [];
    const backbone = BACKBONE_COLOR[mode];
    const accent = PALETTE[mode].accent;
    for (const strand of [0, 1] as const) {
      for (let i = 0; i < n - 1; i++) {
        for (let k = 0; k < SUBDIV; k++) {
          const a = at(i + k / SUBDIV, strand);
          const b = at(i + (k + 1) / SUBDIV, strand);
          items.push({ z: (a[2] + b[2]) / 2, key: `t${strand}-${i}-${k}`, kind: "tube", d: [a[0], a[1], b[0], b[1]], color: backbone, w: 0.08 });
        }
      }
    }
    layout.pairs.forEach((p, i) => {
      const lit = hl.has(i);
      const a = project(...p.p0);
      const b = project(...p.p1);
      const m = project(...p.mid);
      const halves: [typeof a, string][] = [
        [a, p.base],
        [b, p.partner],
      ];
      halves.forEach(([from, base], k) => {
        items.push({
          z: (from[2] + m[2]) / 2 - 0.01,
          key: `b${i}-${k}`,
          kind: "bond",
          d: [from[0], from[1], m[0], m[1]],
          color: lit ? accent : (BASE_COLORS[mode][base as Base] ?? BASE_COLORS[mode].A),
          w: lit ? 0.15 : 0.076,
        });
      });
      for (const [k, q] of [a, b].entries()) {
        items.push({ z: q[2], key: `p${i}-${k}`, kind: "bead", d: [q[0], q[1]], color: lit ? accent : backbone, w: lit ? 0.13 : 0.09 });
      }
    });
    items.sort((x, y) => x.z - y.z);

    const half = layout.length / 2;
    const width = layout.length + 2 * (r + 0.9);
    const labels = infos.map((info) => {
      const pair = layout.pairs[info.indices[0] ?? 0];
      return {
        key: info.codon,
        x: q(pair?.mid[0] ?? 0),
        y: q(-(r + 0.3) + lower - 0.25),
        text: `codon ${info.codon}: ${info.fromCodon} → ${info.toCodon}`,
      };
    });
    return { items, width: q(width), height: q(width / ASPECT), half: q(half), lower, labels };
  }, [seq, highlights, mode]);

  const p = PALETTE[mode];
  const { items, width, height, half, lower, labels } = drawing;

  return (
    <svg
      viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      {items.map((it) =>
        it.kind === "bead" ? (
          <circle key={it.key} cx={it.d[0]} cy={it.d[1]} r={it.w} fill={it.color} />
        ) : (
          <line
            key={it.key}
            x1={it.d[0]}
            y1={it.d[1]}
            x2={it.d[2]}
            y2={it.d[3]}
            stroke={it.color}
            strokeWidth={it.w}
            strokeLinecap="round"
          />
        ),
      )}
      <g fontFamily={MONO_FONT} fontSize={0.26} fill={p.muted} textAnchor="middle" dominantBaseline="middle">
        <text x={-half - 0.95} y={lower}>
          5′
        </text>
        <text x={half + 0.95} y={lower}>
          3′
        </text>
      </g>
      {labels.map((l) => (
        <text
          key={l.key}
          x={l.x}
          y={l.y}
          fontFamily={MONO_FONT}
          fontSize={0.3}
          fill={p.ink}
          textAnchor="middle"
        >
          {l.text}
        </text>
      ))}
    </svg>
  );
}

export default HelixPoster;
