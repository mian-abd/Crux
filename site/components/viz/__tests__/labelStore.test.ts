// Unit tests for the DOM label placement that replaced drei's <Html> in
// DNAHelix: screen position, z-index range, hiding behind the camera, and
// attach/detach bookkeeping.

import assert from "node:assert/strict";
import { test } from "vitest";
import * as THREE from "three";
import { LabelStore, depthZIndex, type LabelElement } from "../labelStore";

const SIZE = { width: 500, height: 220 };
const FOV = 32;

function camera(z = 10): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(FOV, SIZE.width / SIZE.height, 0.1, 80);
  cam.position.set(0, 0, z);
  cam.lookAt(0, 0, 0);
  return cam;
}

const element = (): LabelElement => ({ style: { display: "", transform: "", zIndex: "" } });

function translate(el: LabelElement): [number, number] {
  const m = /^translate3d\((.+)px,(.+)px,0\)$/.exec(el.style.transform);
  assert.ok(m, `unexpected transform ${el.style.transform}`);
  return [Number(m[1]), Number(m[2])];
}

function near(actual: number, expected: number, tol = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} is not ${expected}`);
}

test("a label sits on its anchor's screen position, parent transforms included", () => {
  const store = new LabelStore();
  const parent = new THREE.Group();
  parent.position.set(0, 1, 0);
  const centre = new THREE.Object3D();
  const raised = new THREE.Object3D();
  parent.add(raised);
  const a = element();
  const b = element();
  store.attachAnchor("centre", centre);
  store.attachAnchor("raised", raised);
  store.attachElement("centre", a, [20, 0]);
  store.attachElement("raised", b, [20, 0]);
  store.project(camera(), SIZE);

  const [ax, ay] = translate(a);
  near(ax, SIZE.width / 2);
  near(ay, SIZE.height / 2);

  // One unit above the target, ten units away: tan(fov / 2) * 10 units fill half the height.
  const [bx, by] = translate(b);
  near(bx, SIZE.width / 2);
  near(by, (SIZE.height / 2) * (1 - 1 / (10 * Math.tan((FOV * Math.PI) / 360))));
});

test("z-index maps distance into the label's range as drei's Html does", () => {
  const cam = camera();
  // The values DNAHelix's labels had under drei at the default framing.
  assert.equal(depthZIndex(cam, 10, [20, 0]), 18);
  assert.equal(depthZIndex(cam, 10, [10, 0]), 9);
  assert.equal(depthZIndex(cam, 10, [30, 0]), 26);
  assert.ok(depthZIndex(cam, 5, [20, 0])! > depthZIndex(cam, 15, [20, 0])!);
  assert.equal(depthZIndex(new THREE.Camera(), 10, [20, 0]), null);

  const store = new LabelStore();
  const el = element();
  store.attachAnchor("a", new THREE.Object3D());
  store.attachElement("a", el, [20, 0]);
  store.project(cam, SIZE);
  assert.equal(el.style.zIndex, "18");
});

test("hidden until the first frame places it, and while behind the camera", () => {
  const store = new LabelStore();
  const el = element();
  store.attachAnchor("a", new THREE.Object3D());
  store.attachElement("a", el, [10, 0]);
  assert.equal(el.style.display, "none");

  store.project(camera(10), SIZE);
  assert.equal(el.style.display, "");

  const past = new THREE.PerspectiveCamera(FOV, SIZE.width / SIZE.height, 0.1, 80);
  past.position.set(0, 0, -1);
  past.lookAt(0, 0, -10);
  store.project(past, SIZE);
  assert.equal(el.style.display, "none");

  store.project(camera(10), SIZE);
  assert.equal(el.style.display, "");
});

test("detached labels are left alone and stale cleanups do not detach newer ones", () => {
  const store = new LabelStore();
  const frames: number[] = [];
  store.connect(() => frames.push(1));
  assert.equal(frames.length, 1);

  const anchor = new THREE.Object3D();
  const first = element();
  store.attachAnchor("a", anchor);
  const detachFirst = store.attachElement("a", first, [10, 0]);
  assert.equal(frames.length, 3, "each arrival requests a frame");
  detachFirst();
  store.project(camera(), SIZE);
  assert.equal(first.style.transform, "");

  const second = element();
  store.attachElement("a", second, [10, 0]);
  detachFirst();
  store.project(camera(), SIZE);
  assert.notEqual(second.style.transform, "");
});
