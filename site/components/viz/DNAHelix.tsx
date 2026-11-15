"use client";

// Interactive double helix of a given sequence (default: the first 27 nt of
// HBB). Highlighted positions glow in the accent with a small label such as
// "codon 6: GAG → GTG". The helix turns about its own axis until the user
// orbits it, and resumes after a quiet spell. Hovering a base pair names it.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type * as THREE from "three";
import { HelixModel } from "./HelixModel";
import { LabelAnchor, LabelLayer, LabelProjector, ScreenLabel, useLabelStore } from "./ScreenLabels";
import { StudioLights } from "./StudioLights";
import { useColorMode, useInView, useReducedMotion, useSurfaceColor } from "./hooks";
import {
  HBB_FIRST_27,
  cleanSequence,
  describeHighlight,
  layoutHelix,
  type Highlight,
  type HighlightInfo,
  type HelixLayout,
} from "./sequence";
import { MONO_FONT, MOTION, PALETTE, SANS_FONT, type ColorMode } from "./theme";

export interface DNAHelixProps {
  sequence?: string;
  highlights?: Highlight[];
  autoRotate?: boolean;
  /** Zoom on the wheel. Off by default, so the page scrolls over the figure. */
  zoom?: boolean;
  /** Called once the first frame is on screen. */
  onReady?: () => void;
  className?: string;
}

const FOV = 32;

/** Frame the whole helix for the current aspect ratio. */
function useFitDistance(layout: HelixLayout): number {
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const t = Math.tan((FOV * Math.PI) / 360);
  const halfW = layout.length / 2 + layout.params.radius + 0.9;
  const halfH = layout.params.radius + 1.5;
  return Math.max(halfW / (t * aspect), halfH / t, 4);
}

function Rig({
  layout,
  spinning,
  children,
}: {
  layout: HelixLayout;
  spinning: boolean;
  children: ReactNode;
}) {
  const spin = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const dist = useFitDistance(layout);
  const fitted = useRef(0);
  useEffect(() => {
    // Refit on resize only while the user has not moved the camera far.
    if (fitted.current !== 0 && Math.abs(camera.position.length() - fitted.current) > 0.5) return;
    const dir = camera.position.clone().normalize();
    if (dir.lengthSq() < 0.5) dir.set(0, 0.12, 1).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    camera.lookAt(0, 0, 0);
    fitted.current = dist;
  }, [camera, dist]);
  useFrame((_, dt) => {
    if (spinning && spin.current) spin.current.rotation.x += Math.min(dt, 0.05) * MOTION.helixSpin;
  });
  return (
    <group ref={spin} rotation-x={0.6}>
      {children}
    </group>
  );
}

const labelBox = (mode: ColorMode): CSSProperties => {
  const p = PALETTE[mode];
  return {
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 1.35,
    whiteSpace: "nowrap",
    color: p.ink,
    background: mode === "dark" ? "rgba(18,21,27,0.78)" : "rgba(255,255,255,0.85)",
    border: `1px solid ${mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(20,23,28,0.10)"}`,
    borderRadius: 6,
    padding: "5px 8px",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    boxShadow: mode === "dark" ? "0 4px 18px rgba(0,0,0,0.35)" : "0 4px 18px rgba(20,23,28,0.08)",
    pointerEvents: "none",
    userSelect: "none",
  };
};

/** A codon with its changed letters in bold and the accent. */
function Codon({ codon, other, color }: { codon: string; other: string; color: string }) {
  return (
    <>
      {codon.split("").map((c, k) =>
        c === other[k] ? (
          <span key={k}>{c}</span>
        ) : (
          <b key={k} style={{ color, fontWeight: 700 }}>
            {c}
          </b>
        ),
      )}
    </>
  );
}

// The labels below are plain DOM laid over the canvas (ScreenLabels.tsx), in
// this React tree, rather than drei <Html> roots of their own.

/** Sits above its anchor: the box, then a leader line down to the pair. */
function HighlightLabel({ info, mode }: { info: HighlightInfo; mode: ColorMode }) {
  const p = PALETTE[mode];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: "translateY(-50%)",
      }}
    >
      <div style={labelBox(mode)}>
        <span style={{ color: p.accent }}>●</span> codon {info.codon}:{" "}
        <Codon codon={info.fromCodon} other={info.toCodon} color={p.ink} /> →{" "}
        <Codon codon={info.toCodon} other={info.fromCodon} color={p.accent} />
        <div style={{ fontFamily: SANS_FONT, fontSize: 11, color: p.muted, marginTop: 1 }}>{info.detail}</div>
      </div>
      <div
        style={{
          width: 1,
          height: 20,
          background: `linear-gradient(${p.accent}, transparent)`,
          opacity: 0.8,
        }}
      />
    </div>
  );
}

function EndLabel({ text, mode }: { text: string; mode: ColorMode }) {
  const p = PALETTE[mode];
  return (
    <div
      style={{
        fontFamily: MONO_FONT,
        fontSize: 11,
        color: p.muted,
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

export function DNAHelix({ sequence, highlights, autoRotate = true, zoom = false, onReady, className }: DNAHelixProps) {
  const host = useRef<HTMLDivElement>(null);
  const mode = useColorMode();
  const reduced = useReducedMotion();
  const inView = useInView(host);
  const surface = useSurfaceColor(host, mode);
  const seq = useMemo(() => cleanSequence(sequence ?? HBB_FIRST_27) || HBB_FIRST_27, [sequence]);
  const layout = useMemo(() => layoutHelix(seq), [seq]);
  const infos = useMemo(
    () =>
      (highlights ?? [])
        .filter((h) => h.index >= 0 && h.index < seq.length)
        .map((h) => ({ h, info: describeHighlight(seq, h) })),
    [highlights, seq],
  );
  const hlIndices = useMemo(
    () => [...new Set(infos.flatMap((x) => x.info.indices))].filter((i) => i < seq.length),
    [infos, seq],
  );

  const [interacting, setInteracting] = useState(false);
  const [idle, setIdle] = useState(true);
  const idleTimer = useRef<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [fine, setFine] = useState(true);
  const labels = useLabelStore();
  const readyCb = useRef(onReady);

  useEffect(() => {
    readyCb.current = onReady;
  }, [onReady]);

  // Dragging to orbit is for mouse and pen. On touch the helix only turns,
  // so a swipe over it still scrolls the page.
  useEffect(() => {
    const mq = window.matchMedia?.("(pointer: fine)");
    if (!mq) return;
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const onStart = useCallback(() => {
    setInteracting(true);
    setIdle(false);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
  }, []);
  const onEnd = useCallback(() => {
    setInteracting(false);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), MOTION.resumeAfterIdleS * 1000);
  }, []);
  useEffect(
    () => () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    },
    [],
  );

  const spinning = autoRotate && !reduced && !interacting && idle;
  const p = PALETTE[mode];
  const hovered = hover !== null ? layout.pairs[hover] : undefined;
  const half = layout.length / 2;
  const fogFar = layout.length + 14;
  const highlightLabels = infos.map(({ h, info }) => ({
    id: `hl-${h.index}-${h.to}`,
    x: layout.pairs[info.indices[0] ?? h.index]?.mid[0] ?? 0,
    info,
  }));

  return (
    <div
      ref={host}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 220,
        opacity: ready ? 1 : 0,
        transition: reduced ? "none" : "opacity 0.8s ease",
      }}
    >
      <Canvas
        frameloop={inView && !reduced ? "always" : "demand"}
        dpr={[1, 1.75]}
        camera={{ position: [0, 1.2, 10], fov: FOV, near: 0.1, far: 80 }}
        gl={{ antialias: true, alpha: true }}
        style={{
          position: "absolute",
          inset: 0,
          cursor: interacting ? "grabbing" : "grab",
          touchAction: "none",
          pointerEvents: fine ? "auto" : "none",
        }}
        onCreated={() => {
          setReady(true);
          readyCb.current?.();
        }}
        onPointerMissed={() => setHover(null)}
      >
        <fog attach="fog" args={[surface, 6, fogFar]} />
        <StudioLights mode={mode} />
        {/* Lowered a little when labels sit above, so the pair reads as one block. */}
        <group position={[0, infos.length ? -0.45 : 0, 0]}>
          <Rig layout={layout} spinning={spinning}>
            <HelixModel
              layout={layout}
              mode={mode}
              highlights={hlIndices}
              animate={!reduced}
              beadRadius={0.09}
              bondRadius={0.038}
              tubeRadius={0.04}
              baseMix={0.1}
              onHoverPair={setHover}
            />
          </Rig>
          {/* Label anchors sit outside the Rig, so labels stay put while the helix turns. */}
          {highlightLabels.map(({ id, x }) => (
            <LabelAnchor key={id} store={labels} id={id} position={[x, layout.params.radius + 0.3, 0]} />
          ))}
          <LabelAnchor store={labels} id="end-5" position={[-half - 0.95, 0, 0]} />
          <LabelAnchor store={labels} id="end-3" position={[half + 0.95, 0, 0]} />
          <LabelAnchor
            store={labels}
            id="hover"
            position={[hovered?.mid[0] ?? 0, -layout.params.radius - 0.7, 0]}
          />
        </group>
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.6}
          enableZoom={zoom}
          zoomSpeed={0.6}
          minDistance={3}
          maxDistance={40}
          onStart={onStart}
          onEnd={onEnd}
        />
        <LabelProjector store={labels} />
      </Canvas>
      <LabelLayer>
        {highlightLabels.map(({ id, info }) => (
          <ScreenLabel key={id} store={labels} id={id} zIndexRange={[20, 0]}>
            <HighlightLabel info={info} mode={mode} />
          </ScreenLabel>
        ))}
        <ScreenLabel store={labels} id="end-5" zIndexRange={[10, 0]}>
          <EndLabel text="5′" mode={mode} />
        </ScreenLabel>
        <ScreenLabel store={labels} id="end-3" zIndexRange={[10, 0]}>
          <EndLabel text="3′" mode={mode} />
        </ScreenLabel>
        {/* Kept mounted so it fades out; transparent when nothing is hovered. */}
        <ScreenLabel store={labels} id="hover" zIndexRange={[30, 0]}>
          <div style={{ ...labelBox(mode), opacity: hovered ? 1 : 0, transition: "opacity 120ms ease" }}>
            {hovered ? (
              <>
                nt {hovered.index + 1} · {hovered.base}–{hovered.partner}
                <span style={{ color: p.muted }}>
                  {" "}
                  · codon {Math.floor(hovered.index / 3)}{" "}
                  {seq.slice(Math.floor(hovered.index / 3) * 3, Math.floor(hovered.index / 3) * 3 + 3)}
                </span>
              </>
            ) : (
              " "
            )}
          </div>
        </ScreenLabel>
      </LabelLayer>
    </div>
  );
}

export default DNAHelix;
