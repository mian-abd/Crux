"use client";

// The still frame for a small molecule: the same atoms and bonds as the live
// view, in the same pose, drawn as SVG. It costs no WebGL context, so cards
// that are not live (and the landing-page strip) use it.

import { useEffect, useId, useState } from "react";
import { useColorMode } from "../hooks";
import { BOND_RADIUS, atomRadius, cpk, loadMolecule, posed, type Molecule } from "./molecule";

const W = 400;
const H = 300;

export interface MoleculePosterProps {
  /** File name in /public/molecules, without the extension. */
  name: string;
  className?: string;
}

export function MoleculePoster({ name, className }: MoleculePosterProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const mode = useColorMode();
  const [mol, setMol] = useState<Molecule | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMolecule(name)
      .then((m) => {
        if (!cancelled) setMol(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (!mol) return <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" />;

  const scale = (Math.min(W, H) * 0.46) / mol.radius;
  const pts = mol.atoms.map((a) => {
    const [x, y, z] = posed(a);
    return { x: W / 2 + x * scale, y: H / 2 - y * scale, z, element: a.element };
  });
  const dark = mode === "dark";

  type Item = { z: number; node: React.ReactNode };
  const items: Item[] = [];
  mol.bonds.forEach(([i, j], n) => {
    const a = pts[i]!;
    const b = pts[j]!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const w = BOND_RADIUS * 2 * scale;
    items.push({
      z: (a.z + b.z) / 2 - 0.01,
      node: (
        <g key={`b${n}`} strokeWidth={w} strokeLinecap="round">
          <line x1={a.x} y1={a.y} x2={mx} y2={my} stroke={cpk(a.element, mode)} />
          <line x1={mx} y1={my} x2={b.x} y2={b.y} stroke={cpk(b.element, mode)} />
        </g>
      ),
    });
  });
  pts.forEach((p, n) => {
    items.push({
      z: p.z,
      node: (
        <g key={`a${n}`}>
          <circle cx={p.x} cy={p.y} r={atomRadius(p.element) * scale} fill={cpk(p.element, mode)} />
          <circle cx={p.x} cy={p.y} r={atomRadius(p.element) * scale} fill={`url(#${uid}-shade)`} />
        </g>
      ),
    });
  });
  items.sort((a, b) => a.z - b.z);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-shade`} cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={dark ? 0.5 : 0.65} />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity={dark ? 0.42 : 0.3} />
        </radialGradient>
      </defs>
      {items.map((i) => i.node)}
    </svg>
  );
}

export default MoleculePoster;
