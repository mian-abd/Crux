"use client";

// A small molecule as ball-and-stick, after three.js's molecules example
// (examples/webgl_loader_pdb.html, MIT): the file is parsed by PDBLoader and
// the atoms and half-bonds are two instanced meshes, so a molecule is two
// draw calls. Element letters for the heteroatoms are DOM labels placed by
// the shared label system (../ScreenLabels): no extra React root, no state
// updates while drawing.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { LabelAnchor, LabelLayer, LabelProjector, ScreenLabel, useLabelStore } from "../ScreenLabels";
import { StudioLights } from "../StudioLights";
import { useColorMode, useInView, useReducedMotion } from "../hooks";
import { MONO_FONT, PALETTE, type ColorMode } from "../theme";
import { BOND_RADIUS, POSE, atomRadius, cpk, loadMolecule, type Molecule } from "./molecule";

export interface MoleculeViewProps {
  /** File name in /public/molecules, without the extension. */
  name: string;
  /** Letter the nitrogen, oxygen and other heteroatoms. Default true. */
  labels?: boolean;
  /** Called once the first frame is on screen. */
  onReady?: () => void;
  className?: string;
}

const FOV = 30;
const MAX_LABELS = 16;
const UP = new THREE.Vector3(0, 1, 0);

function Model({ mol, mode }: { mol: Molecule; mode: ColorMode }) {
  const atoms = useRef<THREE.InstancedMesh>(null);
  const bonds = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const color = new THREE.Color();
    const mesh = atoms.current;
    if (mesh) {
      mol.atoms.forEach((a, i) => {
        const r = atomRadius(a.element);
        m.compose(p.set(a.x, a.y, a.z), q.identity(), s.set(r, r, r));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color.set(cpk(a.element, mode)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const sticks = bonds.current;
    if (sticks) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const mid = new THREE.Vector3();
      const dir = new THREE.Vector3();
      // Each bond is two half-cylinders, one in each atom's colour.
      const half = (i: number, from: THREE.Vector3, to: THREE.Vector3, element: string) => {
        dir.subVectors(to, from);
        const len = dir.length();
        q.setFromUnitVectors(UP, dir.normalize());
        m.compose(p.addVectors(from, to).multiplyScalar(0.5), q, s.set(BOND_RADIUS, len, BOND_RADIUS));
        sticks.setMatrixAt(i, m);
        sticks.setColorAt(i, color.set(cpk(element, mode)));
      };
      mol.bonds.forEach(([i, j], n) => {
        const ai = mol.atoms[i]!;
        const aj = mol.atoms[j]!;
        a.set(ai.x, ai.y, ai.z);
        b.set(aj.x, aj.y, aj.z);
        mid.addVectors(a, b).multiplyScalar(0.5);
        half(n * 2, a, mid, ai.element);
        half(n * 2 + 1, mid, b, aj.element);
      });
      sticks.instanceMatrix.needsUpdate = true;
      if (sticks.instanceColor) sticks.instanceColor.needsUpdate = true;
    }
  }, [mol, mode]);

  return (
    <>
      <instancedMesh ref={atoms} args={[undefined, undefined, mol.atoms.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 28, 20]} />
        <meshStandardMaterial roughness={0.32} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={bonds} args={[undefined, undefined, mol.bonds.length * 2]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 12, 1, true]} />
        <meshStandardMaterial roughness={0.45} metalness={0.05} />
      </instancedMesh>
    </>
  );
}

/**
 * Fades the letters of atoms on the far side, so a letter never floats over a
 * nearer atom. Placement is the label store's job; this writes opacity only.
 */
function LabelFade({
  mol,
  indices,
  group,
  layer,
}: {
  mol: Molecule;
  indices: number[];
  group: React.RefObject<THREE.Group | null>;
  layer: React.RefObject<HTMLDivElement | null>;
}) {
  const v = useMemo(() => new THREE.Vector3(), []);
  const centre = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const g = group.current;
    const letters = layer.current?.querySelectorAll<HTMLElement>("[data-atom]");
    if (!g || !letters) return;
    const toCentre = camera.position.distanceTo(g.getWorldPosition(centre));
    for (let n = 0; n < indices.length; n++) {
      const node = letters[n];
      const a = mol.atoms[indices[n]!];
      if (!node || !a) continue;
      v.set(a.x, a.y, a.z).applyMatrix4(g.matrixWorld);
      const near = (toCentre - camera.position.distanceTo(v)) / mol.radius;
      node.style.setProperty("opacity", near > -0.05 ? "1" : near > -0.3 ? "0.35" : "0");
    }
  });
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onReady();
  });
  return null;
}

export function MoleculeView({ name, labels = true, onReady, className }: MoleculeViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const group = useRef<THREE.Group>(null);
  const labelStore = useLabelStore();
  const mode = useColorMode();
  const reduced = useReducedMotion();
  const inView = useInView(host);
  const [mol, setMol] = useState<Molecule | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false);
  const [fine, setFine] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMolecule(name)
      .then((m) => {
        if (!cancelled) setMol(m);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Dragging to orbit is for mouse and pen. On touch the view only turns, so
  // a swipe over a card still scrolls the page.
  useEffect(() => {
    const mq = window.matchMedia?.("(pointer: fine)");
    if (!mq) return;
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const labelled = useMemo(() => {
    if (!mol || !labels) return [];
    const out: number[] = [];
    mol.atoms.forEach((a, i) => {
      if (a.element !== "C" && a.element !== "H" && out.length < MAX_LABELS) out.push(i);
    });
    return out;
  }, [mol, labels]);

  const p = PALETTE[mode];
  // Far enough that the whole molecule fits at any orbit angle, in a view at least as wide as tall.
  const distance = mol ? (mol.radius / Math.sin((FOV * Math.PI) / 360)) * 1.04 : 10;

  return (
    <div
      ref={host}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      {mol && (
        <Canvas
          key={name}
          frameloop={inView && !reduced ? "always" : "demand"}
          dpr={[1, 1.5]}
          camera={{
            position: [0, distance * Math.sin(POSE.elevation), distance * Math.cos(POSE.elevation)],
            fov: FOV,
            near: 0.1,
            far: distance * 4,
          }}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          style={{
            position: "absolute",
            inset: 0,
            opacity: shown ? 1 : 0,
            transition: reduced ? "none" : "opacity 500ms ease",
            pointerEvents: fine ? "auto" : "none",
            cursor: "grab",
          }}
        >
          <StudioLights mode={mode} />
          <group ref={group} rotation={[-Math.PI / 2, POSE.yaw, 0, "YXZ"]}>
            <Model mol={mol} mode={mode} />
            {labelled.map((i) => {
              const a = mol.atoms[i]!;
              return <LabelAnchor key={i} store={labelStore} id={`atom-${i}`} position={[a.x, a.y, a.z]} />;
            })}
          </group>
          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.7}
            autoRotate={!reduced}
            autoRotateSpeed={1.1}
          />
          <LabelProjector store={labelStore} />
          <LabelFade mol={mol} indices={labelled} group={group} layer={layer} />
          <Ready
            onReady={() => {
              setShown(true);
              onReady?.();
            }}
          />
        </Canvas>
      )}
      <div
        ref={layer}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: shown ? 1 : 0 }}
      >
        <LabelLayer>
          {mol &&
            labelled.map((i) => (
              <ScreenLabel key={i} store={labelStore} id={`atom-${i}`} zIndexRange={[20, 0]}>
                <span
                  data-atom=""
                  style={{
                    display: "block",
                    fontFamily: MONO_FONT,
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: 1,
                    color: mode === "dark" ? "#0a0c10" : "#ffffff",
                  }}
                >
                  {mol.atoms[i]!.element}
                </span>
              </ScreenLabel>
            ))}
        </LabelLayer>
      </div>
      {failed && (
        <p
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: MONO_FONT,
            fontSize: 11.5,
            color: p.muted,
          }}
        >
          The molecule file could not be loaded.
        </p>
      )}
    </div>
  );
}

export default MoleculeView;
