"use client";

// The procedural double helix shared by HeroScene and DNAHelix: instanced
// spheres for the backbone beads, instanced cylinders for the base-pair
// bonds (each half coloured by its base) and a smooth tube per backbone.
// Instancing follows the pmndrs/three.js InstancedMesh examples: one draw
// call per part, whatever the sequence length.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { HelixLayout, Vec3 } from "./sequence";
import { BACKBONE_COLOR, BASE_COLORS, PALETTE, type Base, type ColorMode } from "./theme";

export interface HelixModelProps {
  layout: HelixLayout;
  mode: ColorMode;
  /** Pair indices drawn in the accent with a soft halo. */
  highlights?: number[];
  /** Pulse the halos (off for reduced motion). */
  animate?: boolean;
  /** Bead radius relative to the helix radius. */
  beadRadius?: number;
  bondRadius?: number;
  tubeRadius?: number;
  sphereDetail?: number;
  /** 0 = full base colours, 1 = backbone colour. Quiets the bonds. */
  baseMix?: number;
  /** How much thicker a highlighted pair is drawn (bonds; beads grow a little less). */
  highlightWeight?: number;
  onHoverPair?: (index: number | null) => void;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function segmentMatrix(a: Vec3, b: Vec3, radiusScale: number, out: THREE.Matrix4): void {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.normalize());
  out.compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(radiusScale, len, radiusScale));
}

/** Pull the end of a segment back by `d` so bonds start at the bead surface. */
function inset(a: Vec3, b: Vec3, d: number): Vec3 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const t = Math.min(0.45, d / len);
  return [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t];
}

let haloTexture: THREE.Texture | null = null;
/** A soft radial falloff drawn once on a canvas: no image download. */
function getHaloTexture(): THREE.Texture {
  if (haloTexture) return haloTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  haloTexture = new THREE.CanvasTexture(canvas);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

export function HelixModel({
  layout,
  mode,
  highlights = [],
  animate = true,
  beadRadius = 0.13,
  bondRadius = 0.055,
  tubeRadius = 0.045,
  sphereDetail = 20,
  baseMix = 0,
  highlightWeight = 2,
  onHoverPair,
}: HelixModelProps) {
  const beads = useRef<THREE.InstancedMesh>(null);
  const bonds = useRef<THREE.InstancedMesh>(null);
  const n = layout.pairs.length;
  const hl = useMemo(() => new Set(highlights), [highlights]);

  const sphere = useMemo(
    () => new THREE.SphereGeometry(1, sphereDetail, Math.round(sphereDetail * 0.7)),
    [sphereDetail],
  );
  const cylinder = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 10, 1, false), []);
  const tubes = useMemo(() => {
    if (n < 2) return [] as THREE.TubeGeometry[];
    return [0, 1].map((strand) => {
      const pts = layout.pairs.map((p) => new THREE.Vector3(...(strand === 0 ? p.p0 : p.p1)));
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      return new THREE.TubeGeometry(curve, Math.max(16, n * 8), tubeRadius, 8, false);
    });
  }, [layout, n, tubeRadius]);

  useEffect(
    () => () => {
      sphere.dispose();
      cylinder.dispose();
    },
    [sphere, cylinder],
  );
  useEffect(() => () => tubes.forEach((t) => t.dispose()), [tubes]);

  // Instance transforms and colours.
  useLayoutEffect(() => {
    const b = beads.current;
    const r = bonds.current;
    if (!b || !r) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const backbone = new THREE.Color(BACKBONE_COLOR[mode]);
    const accent = new THREE.Color(PALETTE[mode].accent);
    const baseColors = BASE_COLORS[mode];
    layout.pairs.forEach((p, i) => {
      const hidden = hl.has(i);
      // A highlighted pair's beads are larger and in the accent, so the change
      // reads by size as well as colour.
      const br = hidden ? beadRadius * (1 + (highlightWeight - 1) * 0.45) : beadRadius;
      const scale = new THREE.Vector3(br, br, br);
      m.compose(new THREE.Vector3(...p.p0), new THREE.Quaternion(), scale);
      b.setMatrixAt(i * 2, m);
      m.compose(new THREE.Vector3(...p.p1), new THREE.Quaternion(), scale);
      b.setMatrixAt(i * 2 + 1, m);
      b.setColorAt(i * 2, hidden ? accent : backbone);
      b.setColorAt(i * 2 + 1, hidden ? accent : backbone);

      const halves: [Vec3, string][] = [
        [p.p0, p.base],
        [p.p1, p.partner],
      ];
      halves.forEach(([from, base], k) => {
        if (hidden) {
          m.makeScale(0, 0, 0);
        } else {
          segmentMatrix(inset(from, p.mid, beadRadius * 0.6), p.mid, bondRadius, m);
        }
        r.setMatrixAt(i * 2 + k, m);
        r.setColorAt(i * 2 + k, c.set(baseColors[base as Base] ?? baseColors.A).lerp(backbone, baseMix));
      });
    });
    b.instanceMatrix.needsUpdate = true;
    r.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (r.instanceColor) r.instanceColor.needsUpdate = true;
    b.computeBoundingSphere();
    r.computeBoundingSphere();
  }, [layout, mode, hl, beadRadius, bondRadius, baseMix, highlightWeight]);

  const p = PALETTE[mode];
  const dark = mode === "dark";

  const onMove = onHoverPair
    ? (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) onHoverPair(Math.floor(e.instanceId / 2));
      }
    : undefined;
  const onOut = onHoverPair ? () => onHoverPair(null) : undefined;

  return (
    <group>
      <instancedMesh
        ref={beads}
        args={[sphere, undefined, Math.max(1, n * 2)]}
        onPointerMove={onMove}
        onPointerOut={onOut}
      >
        <meshStandardMaterial roughness={0.32} metalness={0.05} envMapIntensity={dark ? 0.9 : 0.6} />
      </instancedMesh>
      <instancedMesh
        ref={bonds}
        args={[cylinder, undefined, Math.max(1, n * 2)]}
        onPointerMove={onMove}
        onPointerOut={onOut}
      >
        <meshStandardMaterial roughness={0.45} metalness={0} envMapIntensity={dark ? 0.7 : 0.5} />
      </instancedMesh>
      {tubes.map((t, i) => (
        <mesh key={i} geometry={t}>
          <meshStandardMaterial
            color={BACKBONE_COLOR[mode]}
            roughness={0.38}
            metalness={0.05}
            envMapIntensity={dark ? 0.8 : 0.55}
          />
        </mesh>
      ))}
      {[...hl].map((i) => {
        const pair = layout.pairs[i];
        return pair ? (
          <HighlightPair
            key={i}
            p0={pair.p0}
            p1={pair.p1}
            mid={pair.mid}
            color={p.accent}
            dark={dark}
            animate={animate}
            bondRadius={bondRadius * highlightWeight}
            beadRadius={beadRadius}
          />
        ) : null;
      })}
    </group>
  );
}

function HighlightPair({
  p0,
  p1,
  mid,
  color,
  dark,
  animate,
  bondRadius,
  beadRadius,
}: {
  p0: Vec3;
  p1: Vec3;
  mid: Vec3;
  color: string;
  dark: boolean;
  animate: boolean;
  bondRadius: number;
  beadRadius: number;
}) {
  const halo = useRef<THREE.Sprite>(null);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const matrices = useMemo(() => {
    const a = new THREE.Matrix4();
    const b = new THREE.Matrix4();
    segmentMatrix(inset(p0, mid, beadRadius * 0.9), mid, bondRadius, a);
    segmentMatrix(inset(p1, mid, beadRadius * 0.9), mid, bondRadius, b);
    return [a, b];
  }, [p0, p1, mid, bondRadius, beadRadius]);
  const texture = useMemo(() => getHaloTexture(), []);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    const s = 0.5 + 0.5 * Math.sin(t * 1.6);
    if (halo.current) {
      const m = halo.current.material as THREE.SpriteMaterial;
      m.opacity = (dark ? 0.36 : 0.26) + s * (dark ? 0.22 : 0.12);
      const k = 2.1 + s * 0.3;
      halo.current.scale.set(k, k, 1);
    }
    for (const m of mats.current) if (m) m.emissiveIntensity = (dark ? 0.3 : 0.12) + s * (dark ? 0.3 : 0.15);
  });

  return (
    <group>
      {matrices.map((m, i) => (
        <mesh key={i} matrix={m} matrixAutoUpdate={false}>
          <cylinderGeometry args={[1, 1, 1, 14]} />
          <meshStandardMaterial
            ref={(el) => {
              mats.current[i] = el;
            }}
            color={color}
            emissive={color}
            emissiveIntensity={dark ? 0.4 : 0.2}
            roughness={0.3}
            toneMapped={false}
          />
        </mesh>
      ))}
      <sprite ref={halo} position={mid} scale={[2.2, 2.2, 1]}>
        <spriteMaterial
          map={texture}
          color={color}
          transparent
          opacity={dark ? 0.42 : 0.26}
          depthWrite={false}
          blending={dark ? THREE.AdditiveBlending : THREE.NormalBlending}
        />
      </sprite>
    </group>
  );
}
