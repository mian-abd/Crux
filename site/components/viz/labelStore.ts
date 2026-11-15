// Screen placement for the DOM labels laid over a canvas (ScreenLabels.tsx).
// No React and no browser globals: three.js and plain element styles only,
// so the projection is unit-tested in node.
//
// The maths follows drei's <Html center>, which these labels replace: the
// same screen position, the same distance-based z-index inside each label's
// range, and hidden while the anchor is behind the camera.

import * as THREE from "three";

/** [nearest, farthest] z-index, as drei's `zIndexRange`. */
export type ZRange = readonly [number, number];

/** The part of an element the store writes to. */
export interface LabelElement {
  style: Pick<CSSStyleDeclaration, "display" | "transform" | "zIndex">;
}

interface Slot {
  anchor: THREE.Object3D | null;
  el: LabelElement | null;
  zRange: ZRange;
  // Last values written, so unchanged frames touch no styles.
  x: number;
  y: number;
  z: number | null;
  shown: boolean;
}

const objectPos = new THREE.Vector3();
const cameraPos = new THREE.Vector3();
const cameraDir = new THREE.Vector3();
const toObject = new THREE.Vector3();

/** Pixel change below which a label is left where it is (drei's default eps). */
const EPS = 0.001;

/** drei's objectZIndex: nearer anchors stack higher, inside the label's range. */
export function depthZIndex(camera: THREE.Camera, dist: number, [hi, lo]: ZRange): number | null {
  const { near, far } = camera as Partial<Pick<THREE.PerspectiveCamera, "near" | "far">>;
  if (typeof near !== "number" || typeof far !== "number" || far === near) return null;
  const a = (lo - hi) / (far - near);
  return Math.round(a * dist + lo - a * far);
}

/**
 * Pairs each label's anchor in the scene with its element on the page, by id,
 * and places the elements once per frame.
 */
export class LabelStore {
  private readonly slots = new Map<string, Slot>();
  private invalidate: (() => void) | null = null;

  private slot(id: string): Slot {
    let s = this.slots.get(id);
    if (!s) {
      s = { anchor: null, el: null, zRange: [0, 0], x: NaN, y: NaN, z: null, shown: false };
      this.slots.set(id, s);
    }
    return s;
  }

  private release(id: string, s: Slot): void {
    if (!s.anchor && !s.el && this.slots.get(id) === s) this.slots.delete(id);
  }

  /** Lets the store request a frame (R3F's `invalidate`) when a label arrives. */
  connect(invalidate: () => void): () => void {
    this.invalidate = invalidate;
    invalidate();
    return () => {
      if (this.invalidate === invalidate) this.invalidate = null;
    };
  }

  /** Returns the cleanup. */
  attachAnchor(id: string, anchor: THREE.Object3D): () => void {
    const s = this.slot(id);
    s.anchor = anchor;
    this.invalidate?.();
    return () => {
      if (s.anchor !== anchor) return;
      s.anchor = null;
      this.release(id, s);
    };
  }

  /** Returns the cleanup. The element stays hidden until a frame places it. */
  attachElement(id: string, el: LabelElement, zRange: ZRange): () => void {
    const s = this.slot(id);
    s.el = el;
    s.zRange = zRange;
    s.x = s.y = NaN;
    s.z = null;
    s.shown = false;
    el.style.display = "none";
    this.invalidate?.();
    return () => {
      if (s.el !== el) return;
      s.el = null;
      this.release(id, s);
    };
  }

  /** Moves every label to its anchor's position on a canvas of `size` CSS pixels. */
  project(camera: THREE.Camera, size: { width: number; height: number }): void {
    camera.updateMatrixWorld();
    cameraPos.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(cameraDir);
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    for (const s of this.slots.values()) {
      const { anchor, el } = s;
      if (!anchor || !el) continue;
      anchor.updateWorldMatrix(true, false);
      objectPos.setFromMatrixPosition(anchor.matrixWorld);
      const dist = objectPos.distanceTo(cameraPos);
      const shown = toObject.subVectors(objectPos, cameraPos).dot(cameraDir) >= 0;
      objectPos.project(camera);
      const x = objectPos.x * halfW + halfW;
      const y = -objectPos.y * halfH + halfH;

      if (shown !== s.shown) {
        el.style.display = shown ? "" : "none";
        s.shown = shown;
      }
      if (!(Math.abs(x - s.x) <= EPS && Math.abs(y - s.y) <= EPS)) {
        el.style.transform = `translate3d(${x}px,${y}px,0)`;
        s.x = x;
        s.y = y;
      }
      const z = depthZIndex(camera, dist, s.zRange);
      if (z !== s.z) {
        el.style.zIndex = z === null ? "" : String(z);
        s.z = z;
      }
    }
  }
}
