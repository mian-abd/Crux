"use client";

// Landing-page hero background: a long B-DNA helix turning slowly about its
// own axis, receding into fog, over a faint particle field. One accent pair
// marks HBB codon 6 (the sickle-cell site). Instanced throughout and no
// post-processing, so it stays cheap on integrated GPUs. Rendering pauses
// off-screen; with reduced motion it draws one still frame.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import type * as THREE from "three";
import { HelixModel } from "./HelixModel";
import { StudioLights } from "./StudioLights";
import { useColorMode, useInView, useReducedMotion, useSurfaceColor } from "./hooks";
import { HBB_FIRST_27, SICKLE_HIGHLIGHT, layoutHelix } from "./sequence";
import { MOTION, PALETTE, type ColorMode } from "./theme";

export interface HeroSceneProps {
  className?: string;
}

// Three copies of the first 27 nt of HBB; the accent sits on the middle copy's
// nucleotide 20 (c.20A>T), a little right of centre.
const HERO_SEQ = HBB_FIRST_27.repeat(3).slice(0, 76);
const HERO_HIGHLIGHT = [27 + SICKLE_HIGHLIGHT.index];

function Helix({ mode, animate }: { mode: ColorMode; animate: boolean }) {
  const spin = useRef<THREE.Group>(null);
  const layout = useMemo(() => layoutHelix(HERO_SEQ), []);
  useFrame((_, dt) => {
    if (animate && spin.current) spin.current.rotation.x += Math.min(dt, 0.05) * MOTION.heroSpin;
  });
  return (
    // A rising diagonal whose left end (toward a headline) recedes into the fog.
    <group rotation={[0.12, -0.6, 0.4]} position={[0.2, -0.15, 0]}>
      <group ref={spin} rotation-x={0.9}>
        <HelixModel
          layout={layout}
          mode={mode}
          highlights={HERO_HIGHLIGHT}
          animate={animate}
          sphereDetail={16}
          beadRadius={0.072}
          bondRadius={0.026}
          tubeRadius={0.03}
          baseMix={0.3}
          highlightWeight={1.4}
        />
      </group>
    </group>
  );
}

/** Eases the camera toward the pointer: a few centimetres of parallax, no more. */
function Parallax({ enabled }: { enabled: boolean }) {
  const target = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: PointerEvent) => {
      target.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [enabled]);
  useFrame(({ camera }, dt) => {
    if (!enabled) return;
    const k = 1 - Math.exp(-dt * 1.5);
    camera.position.x += (target.current.x * 0.45 - camera.position.x) * k;
    camera.position.y += (-target.current.y * 0.3 - camera.position.y) * k;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Scene({ mode, surface, animate }: { mode: ColorMode; surface: string; animate: boolean }) {
  const p = PALETTE[mode];
  const dark = mode === "dark";
  return (
    <>
      <fog attach="fog" args={[surface, 9, 24]} />
      <StudioLights mode={mode} />
      <Float
        enabled={animate}
        speed={0.6}
        rotationIntensity={0.12}
        floatIntensity={0.25}
        floatingRange={[-0.08, 0.08]}
      >
        <Helix mode={mode} animate={animate} />
      </Float>
      <Sparkles
        count={110}
        scale={[30, 14, 12]}
        position={[0, 0, -2]}
        size={dark ? 2.2 : 2.4}
        speed={animate ? 0.12 : 0}
        opacity={dark ? 0.45 : 0.5}
        noise={0.6}
        color={dark ? p.muted : p.faint}
      />
      <Parallax enabled={animate} />
    </>
  );
}

export function HeroScene({ className }: HeroSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const mode = useColorMode();
  const reduced = useReducedMotion();
  const inView = useInView(host);
  const surface = useSurfaceColor(host, mode);
  const [ready, setReady] = useState(false);
  const animate = !reduced;

  return (
    <div
      ref={host}
      className={className}
      aria-hidden="true"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 240,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: ready ? 1 : 0,
        transition: reduced ? "none" : "opacity 1.2s ease",
      }}
    >
      <Canvas
        frameloop={animate && inView ? "always" : "demand"}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 14], fov: 32, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: "default" }}
        style={{ position: "absolute", inset: 0 }}
        onCreated={() => setReady(true)}
      >
        <Scene mode={mode} surface={surface} animate={animate} />
      </Canvas>
    </div>
  );
}

export default HeroScene;
