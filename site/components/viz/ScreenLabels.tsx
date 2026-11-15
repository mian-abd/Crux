"use client";

// Labels for a <Canvas>, drawn as ordinary DOM in the page's own React tree.
//
// drei's <Html> renders its children into a second React root and unmounts
// that root synchronously in a layout-effect cleanup. R3F mounts its scene
// inside the page's commit and replays effects under StrictMode, so the
// unmount lands while React is still committing and React 19 logs "Attempted
// to synchronously unmount a root while React was already rendering".
//
// Here a label is a plain element inside <LabelLayer>, a box laid over the
// canvas. An empty group in the scene (<LabelAnchor>) marks where it points.
// Once per frame <LabelProjector> projects every anchor to screen pixels and
// writes the element's transform, z-index and display directly (labelStore.ts):
// no React state per frame.

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { LabelStore, type ZRange } from "./labelStore";

/** One store per canvas, kept for the component's lifetime. */
export function useLabelStore(): LabelStore {
  const [store] = useState(() => new LabelStore());
  return store;
}

/** Inside <Canvas>: the point a label follows, in the parent's coordinates. */
export function LabelAnchor({
  store,
  id,
  position,
}: {
  store: LabelStore;
  id: string;
  position: [number, number, number];
}) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const anchor = ref.current;
    if (!anchor) return;
    return store.attachAnchor(id, anchor);
  }, [store, id]);
  return <group ref={ref} position={position} />;
}

/**
 * Inside <Canvas>, once, after the anchors: places the labels every frame. It
 * runs after OrbitControls (priority -1) and, mounted last, after any
 * priority-0 frame callback that moves an anchor.
 */
export function LabelProjector({ store }: { store: LabelStore }) {
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => store.connect(invalidate), [store, invalidate]);
  useFrame(({ camera, size }) => store.project(camera, size));
  return null;
}

const LAYER: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

/** Outside <Canvas>, as its next sibling: the box the labels sit in. */
export function LabelLayer({ children }: { children: ReactNode }) {
  return <div style={LAYER}>{children}</div>;
}

const WRAPPER: CSSProperties = { position: "absolute", top: 0, left: 0, transformOrigin: "0 0" };
const CENTERED: CSSProperties = {
  position: "absolute",
  transform: "translate3d(-50%,-50%,0)",
  pointerEvents: "none",
};

/** Inside <LabelLayer>: a label centred on the anchor with the same id. */
export function ScreenLabel({
  store,
  id,
  zIndexRange,
  children,
}: {
  store: LabelStore;
  id: string;
  /** [nearest, farthest], as drei's <Html>. */
  zIndexRange: ZRange;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hi, lo] = zIndexRange;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    return store.attachElement(id, el, [hi, lo]);
  }, [store, id, hi, lo]);
  // transform, z-index and display are written by the store, never by React.
  return (
    <div ref={ref} style={WRAPPER}>
      <div style={CENTERED}>{children}</div>
    </div>
  );
}
