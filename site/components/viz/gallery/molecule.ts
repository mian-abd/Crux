// Small molecules for the gallery: loading (three.js PDBLoader, MIT), the
// CPK-style colours and the shared pose. The poster (SVG) and the live view
// (WebGL) both read from here, so the poster is the live view's first frame.
//
// Nothing here touches window at import time; three is imported inside
// loadMolecule.

import type { ColorMode } from "../theme";

export interface Atom {
  x: number;
  y: number;
  z: number;
  element: string;
}

export interface Molecule {
  atoms: Atom[];
  /** Pairs of indices into `atoms`, from the file's CONECT records. */
  bonds: [number, number][];
  /** Radius of the sphere around the origin that holds every atom, in Å. */
  radius: number;
}

/**
 * CPK convention (carbon grey, hydrogen white, nitrogen blue, oxygen red),
 * tuned to the site's tokens: nitrogen is the accent, oxygen the refuted red.
 */
export const CPK: Record<ColorMode, Record<string, string>> = {
  dark: { C: "#8f97a3", H: "#eef0f2", N: "#83b3fa", O: "#fc7a75", other: "#bd9ff2" },
  light: { C: "#4c525c", H: "#e3e6ea", N: "#1f53b8", O: "#c9322e", other: "#724aab" },
};

export const ELEMENT_NAME: Record<string, string> = {
  C: "carbon",
  H: "hydrogen",
  N: "nitrogen",
  O: "oxygen",
};

/** Ball radius in Å: a ball-and-stick size, not the van der Waals radius. */
export function atomRadius(element: string): number {
  return element === "H" ? 0.23 : 0.36;
}

export const BOND_RADIUS = 0.095;

/**
 * The pose both the poster and the first live frame use. The file's xy plane
 * is laid flat (most of these molecules are drawn in it), turned by `yaw`,
 * and seen from `elevation` above the horizon, so a flat ring is never
 * edge-on while the view turns about the vertical axis. Radians.
 */
export const POSE = { yaw: -0.45, elevation: 0.72 } as const;

export function cpk(element: string, mode: ColorMode): string {
  return CPK[mode][element] ?? CPK[mode].other!;
}

const cache = new Map<string, Promise<Molecule>>();

/** Fetch and parse `/molecules/<name>.pdb` once per page. */
export function loadMolecule(name: string): Promise<Molecule> {
  let hit = cache.get(name);
  if (!hit) {
    hit = (async () => {
      const [{ PDBLoader }, res] = await Promise.all([
        import("three/examples/jsm/loaders/PDBLoader.js"),
        fetch(`/molecules/${name}.pdb`),
      ]);
      if (!res.ok) throw new Error(`${name}.pdb: ${res.status}`);
      const pdb = new PDBLoader().parse(await res.text());
      const raw = pdb.json.atoms as unknown as [number, number, number, number[], string][];
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const a of raw) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k]!, a[k] as number);
          max[k] = Math.max(max[k]!, a[k] as number);
        }
      }
      const c = [0, 1, 2].map((k) => (min[k]! + max[k]!) / 2);
      // The bond buffer is Float32, so compare at that precision.
      const key = (x: number, y: number, z: number) =>
        `${Math.fround(x)},${Math.fround(y)},${Math.fround(z)}`;
      const index = new Map<string, number>();
      const atoms: Atom[] = raw.map((a, i) => {
        index.set(key(a[0], a[1], a[2]), i);
        return { x: a[0] - c[0]!, y: a[1] - c[1]!, z: a[2] - c[2]!, element: a[4] };
      });
      // PDBLoader hands bonds back as position pairs; map them to atom indices.
      const pos = pdb.geometryBonds.getAttribute("position");
      const bonds: [number, number][] = [];
      const seen = new Set<string>();
      for (let i = 0; i + 1 < pos.count; i += 2) {
        const a = index.get(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
        const b = index.get(key(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)));
        if (a === undefined || b === undefined || a === b) continue;
        const id = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (seen.has(id)) continue;
        seen.add(id);
        bonds.push([a, b]);
      }
      let radius = 0;
      for (const a of atoms) {
        radius = Math.max(radius, Math.hypot(a.x, a.y, a.z) + atomRadius(a.element));
      }
      return { atoms, bonds, radius };
    })();
    cache.set(name, hit);
    hit.catch(() => cache.delete(name));
  }
  return hit;
}

/** A point as the camera first sees it: [right, up, toward the viewer]. */
export function posed(a: { x: number; y: number; z: number }): [number, number, number] {
  // Lay the xy plane flat, turn about the vertical, then look down from the elevation.
  const fx = a.x;
  const fy = a.z;
  const fz = -a.y;
  const cy = Math.cos(POSE.yaw);
  const sy = Math.sin(POSE.yaw);
  const wx = fx * cy + fz * sy;
  const wz = -fx * sy + fz * cy;
  const ce = Math.cos(POSE.elevation);
  const se = Math.sin(POSE.elevation);
  return [wx, fy * ce - wz * se, fy * se + wz * ce];
}
