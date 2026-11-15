"use client";

// Soft studio lighting with no network fetch: a procedural environment map
// built from drei Lightformers (the pattern from the pmndrs "lightformers"
// examples), rendered once, plus a dim key and fill. No HDR download, so the
// views also light correctly offline.

import { Environment, Lightformer } from "@react-three/drei";
import type { ColorMode } from "./theme";

export function StudioLights({ mode }: { mode: ColorMode }) {
  const dark = mode === "dark";
  return (
    <>
      <ambientLight intensity={dark ? 0.35 : 0.9} />
      <directionalLight position={[4, 6, 8]} intensity={dark ? 1.1 : 1.4} />
      <directionalLight
        position={[-6, -2, -4]}
        intensity={dark ? 0.35 : 0.5}
        color={dark ? "#9fd8ff" : "#ffffff"}
      />
      <Environment resolution={128} frames={1} environmentIntensity={dark ? 0.8 : 0.65}>
        <Lightformer form="rect" intensity={2.2} position={[0, 5, -6]} scale={[12, 3, 1]} />
        <Lightformer
          form="rect"
          intensity={1.2}
          position={[-6, 1, 2]}
          rotation-y={Math.PI / 2}
          scale={[8, 2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.8}
          position={[6, -1, 2]}
          rotation-y={-Math.PI / 2}
          scale={[8, 2, 1]}
        />
        <Lightformer
          form="ring"
          intensity={1.5}
          color={dark ? "#bfeee0" : "#ffffff"}
          position={[3, 3, 6]}
          scale={2.5}
        />
      </Environment>
    </>
  );
}
