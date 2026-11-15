// three.js side of EvidenceGraph3D: persistent render nodes, textures and
// the per-frame easing. Kept apart from the React component so the force
// layout always sees the same node objects (positions survive updates).

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { DiagnosticNode, EvidenceGraph, GraphLink, GraphNode, OptionNode, QuestionNode } from "./graph";
import { MOTION, PALETTE, SANS_FONT, verdictColor, type ColorMode } from "./theme";

/* ------------------------------------------------------------------ */
/* Canvas textures (drawn once, no downloads)                          */
/* ------------------------------------------------------------------ */

type TexKind = "halo" | "ring" | "dashed" | "strike";
const textures: Partial<Record<TexKind, THREE.Texture>> = {};

function texture(kind: TexKind): THREE.Texture {
  const cached = textures[kind];
  if (cached) return cached;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const mid = size / 2;
    g.strokeStyle = "#fff";
    g.fillStyle = "#fff";
    if (kind === "halo") {
      const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.35)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    } else if (kind === "ring" || kind === "dashed") {
      g.lineWidth = 5;
      if (kind === "dashed") g.setLineDash([9, 9]);
      g.beginPath();
      g.arc(mid, mid, mid - 6, 0, Math.PI * 2);
      g.stroke();
    } else {
      g.lineWidth = 7;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(size * 0.12, size * 0.88);
      g.lineTo(size * 0.88, size * 0.12);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textures[kind] = t;
  return t;
}

/* ------------------------------------------------------------------ */
/* Shared geometry                                                     */
/* ------------------------------------------------------------------ */

let geoms: { sphere: THREE.SphereGeometry; octa: THREE.OctahedronGeometry } | null = null;
function geometries() {
  if (!geoms)
    geoms = { sphere: new THREE.SphereGeometry(1, 28, 20), octa: new THREE.OctahedronGeometry(1, 0) };
  return geoms;
}

/* ------------------------------------------------------------------ */
/* Render nodes                                                        */
/* ------------------------------------------------------------------ */

export interface RenderNode {
  id: string;
  data: GraphNode;
  obj: THREE.Group;
  core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  halo: THREE.Sprite;
  ring: THREE.Sprite;
  strike: THREE.Sprite;
  /** Question caption (CSS2D), shown when the graph is small enough to read. */
  label: CSS2DObject | null;
  // Eased state.
  scale: number;
  opacity: number;
  color: THREE.Color;
  haloOpacity: number;
  ringOpacity: number;
  strikeOpacity: number;
  // Targets.
  tScale: number;
  tOpacity: number;
  tColor: THREE.Color;
  tHalo: number;
  tRing: number;
  tStrike: number;
  ringColor: THREE.Color;
  bornAt: number;
  pulseAt: number | null;
  runSeq: number | null;
  /** Hover focus multiplier (1 = normal). */
  focus: number;
  tFocus: number;
  // Force layout fields (written by d3-force-3d).
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number | undefined;
  fy?: number | undefined;
  fz?: number | undefined;
  /** Seed position, consumed on first layout. */
  seeded: boolean;
}

export interface RenderLink {
  id: string;
  source: string | RenderNode;
  target: string | RenderNode;
  data: GraphLink;
  __lineObj?: THREE.Object3D & { material?: THREE.Material & { opacity: number } };
}

function sprite(kind: TexKind, additive: boolean): THREE.Sprite {
  const m = new THREE.SpriteMaterial({
    map: texture(kind),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const s = new THREE.Sprite(m);
  s.visible = false;
  return s;
}

function createRenderNode(data: GraphNode, now: number, mode: ColorMode): RenderNode {
  const g = geometries();
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.42,
    metalness: 0.05,
    transparent: true,
    opacity: 0,
  });
  const core = new THREE.Mesh(data.kind === "diagnostic" ? g.octa : g.sphere, mat);
  const obj = new THREE.Group();
  const halo = sprite("halo", mode === "dark");
  const ring = sprite(data.kind === "question" ? "ring" : "ring", false);
  const strike = sprite("strike", false);
  obj.add(halo, core, ring, strike);
  let label: CSS2DObject | null = null;
  if (data.kind === "question") {
    const el = document.createElement("div");
    el.style.cssText = `font-family:${SANS_FONT};font-size:11.5px;line-height:1.3;max-width:190px;text-align:center;pointer-events:none;user-select:none;opacity:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color .3s ease`;
    label = new CSS2DObject(el);
    // Hang the caption below its anchor (which sits under the node).
    label.center.set(0.5, 0);
    label.visible = false;
    obj.add(label);
  }
  const node: RenderNode = {
    id: data.id,
    data,
    obj,
    core,
    halo,
    ring,
    strike,
    label,
    scale: 0,
    opacity: 0,
    color: new THREE.Color(PALETTE[mode].neutral),
    haloOpacity: 0,
    ringOpacity: 0,
    strikeOpacity: 0,
    tScale: 1,
    tOpacity: 1,
    tColor: new THREE.Color(PALETTE[mode].neutral),
    tHalo: 0,
    tRing: 0,
    tStrike: 0,
    ringColor: new THREE.Color(PALETTE[mode].accent),
    bornAt: now,
    pulseAt: null,
    runSeq: data.kind === "diagnostic" ? data.runSeq : null,
    focus: 1,
    tFocus: 1,
    seeded: false,
  };
  (obj as THREE.Object3D & { __node?: RenderNode }).__node = node;
  return node;
}

/** Radius of a node in scene units. */
export function nodeRadius(d: GraphNode): number {
  if (d.kind === "question") return 6 + 2 * Math.max(0, Math.min(1, d.impact));
  if (d.kind === "diagnostic") return 3.6;
  if (d.isNull) return 1.5 + 3 * Math.sqrt(Math.max(0, d.posterior));
  return 1.8 + 5.4 * Math.sqrt(Math.max(0, Math.min(1, d.posterior)));
}

/** Map graph state onto eased targets. */
function applyTargets(n: RenderNode, mode: ColorMode): void {
  const p = PALETTE[mode];
  const d = n.data;
  const dark = mode === "dark";
  n.tScale = nodeRadius(d);
  n.tHalo = 0;
  n.tRing = 0;
  n.tStrike = 0;
  n.tOpacity = 1;
  n.ringColor.set(p.accent);
  if (d.kind === "question") {
    const q = d as QuestionNode;
    n.tColor.set(dark ? "#d7dbe0" : "#3b424c");
    if (q.status === "settled") {
      n.tRing = 0.95;
      n.tHalo = dark ? 0.22 : 0.16;
      n.ringColor.set(p.accent);
    } else if (q.status === "unresolved") {
      // Mostly neutral: the dashed ring carries the status, so a run with many
      // unresolved questions does not turn the whole graph violet.
      n.tColor.lerp(new THREE.Color(p.unresolved), 0.3);
      n.tOpacity = 0.7;
      n.tRing = 0.85;
      n.ringColor.set(p.unresolved);
    }
  } else if (d.kind === "option") {
    const o = d as OptionNode;
    const base = o.verdict
      ? verdictColor(o.verdict, mode)
      : o.isNull
        ? p.faint
        : dark
          ? "#7a8490"
          : "#99a1ab";
    n.tColor.set(base);
    if (o.isNull) n.tOpacity = 0.55;
    if (o.status === "winner") {
      if (!o.verdict) n.tColor.set(p.accent);
      n.tHalo = dark ? 0.5 : 0.3;
      n.tRing = 0.9;
      n.ringColor.set(o.verdict ? verdictColor(o.verdict, mode) : p.accent);
    } else if (o.status === "rejected") {
      n.tColor.lerp(new THREE.Color(p.faint), 0.65);
      n.tOpacity = 0.32;
      n.tStrike = dark ? 0.75 : 0.85;
    }
  } else {
    const x = d as DiagnosticNode;
    if (x.status === "proposed") {
      n.tColor.set(p.neutral);
      n.tOpacity = 0.45;
    } else if (x.status === "invalid") {
      n.tColor.set(p.refuted);
      n.tOpacity = 0.7;
    } else if (x.status === "running") {
      n.tColor.set(p.accent);
    } else {
      n.tColor.set(dark ? "#c9ced6" : "#4a525d");
    }
  }
  const hl = n.halo.material as THREE.SpriteMaterial;
  hl.color.copy(n.ringColor);
  const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  if (hl.blending !== blending) {
    hl.blending = blending;
    hl.needsUpdate = true;
  }
  (n.strike.material as THREE.SpriteMaterial).color.set(p.muted);
  if (n.label) {
    const el = n.label.element;
    const q = d as QuestionNode;
    const text = q.label.length > 90 ? `${q.label.slice(0, 89).trimEnd()}…` : q.label;
    if (el.textContent !== text) el.textContent = text;
    el.style.color = q.status === "settled" ? p.ink : p.muted;
    el.style.textShadow = `0 0 6px ${p.background}, 0 0 2px ${p.background}`;
  }
  (n.ring.material as THREE.SpriteMaterial).map = texture(
    d.kind === "question" && (d as QuestionNode).status === "unresolved" ? "dashed" : "ring",
  );
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const PHI = (1 + Math.sqrt(5)) / 2;

function direction(i: number): THREE.Vector3 {
  // Low-discrepancy points on a sphere: every prefix is spread out.
  const y = 1 - 2 * (((i + 0.5) * (PHI - 1)) % 1);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * GOLDEN;
  return new THREE.Vector3(Math.cos(a) * r, y * 0.8, Math.sin(a) * r);
}

export class GraphStore {
  nodes = new Map<string, RenderNode>();
  links = new Map<string, RenderLink>();
  lastSeq = -1;
  questionCount = 0;
  radius = 60;
  /** Captions only while they stay legible. */
  showLabels = false;

  reset(): void {
    for (const n of this.nodes.values()) disposeNode(n);
    this.nodes.clear();
    this.links.clear();
    this.lastSeq = -1;
    this.questionCount = 0;
  }

  /**
   * Bring the store in line with the graph. Returns whether nodes or links
   * were added (the layout needs new data) and which diagnostics just ran.
   */
  sync(graph: EvidenceGraph, mode: ColorMode, now: number): { structural: boolean; ran: string[] } {
    if (graph.lastSeq < this.lastSeq || graph.nodes.length < this.nodes.size) this.reset();
    this.lastSeq = graph.lastSeq;
    let structural = false;
    const ran: string[] = [];
    let order = 0;
    for (const d of graph.nodes) {
      let n = this.nodes.get(d.id);
      if (!n) {
        n = createRenderNode(d, now + Math.min(900, order * 6), mode);
        this.seed(n, d);
        this.nodes.set(d.id, n);
        structural = true;
        order += 1;
      } else if (d.kind === "diagnostic" && d.runSeq !== null && d.runSeq !== n.runSeq) {
        n.runSeq = d.runSeq;
        n.pulseAt = now;
        if (d.status === "done" || d.status === "invalid") ran.push(d.id);
      }
      n.data = d;
      applyTargets(n, mode);
    }
    for (const l of graph.links) {
      const existing = this.links.get(l.id);
      if (existing) {
        existing.data = l;
        continue;
      }
      if (!this.nodes.has(l.source) || !this.nodes.has(l.target)) continue;
      this.links.set(l.id, { id: l.id, source: l.source, target: l.target, data: l });
      structural = true;
    }
    this.showLabels = graph.counts.questions > 0 && graph.counts.questions <= 10;
    let maxR = 40;
    for (const n of this.nodes.values()) {
      if (n.x !== undefined) maxR = Math.max(maxR, Math.hypot(n.x, n.y ?? 0, n.z ?? 0));
    }
    this.radius = maxR;
    return { structural, ran };
  }

  private seed(n: RenderNode, d: GraphNode): void {
    let p: THREE.Vector3;
    if (d.kind === "question") {
      const i = this.questionCount++;
      p = direction(i).multiplyScalar(48 + 7 * Math.sqrt(i));
    } else if (d.kind === "option") {
      const q = this.nodes.get(d.questionId);
      const qp = q && q.x !== undefined ? new THREE.Vector3(q.x, q.y, q.z) : new THREE.Vector3();
      const k = q ? (q.data as QuestionNode).optionIds.indexOf(d.id) : 0;
      const out = qp.lengthSq() > 1 ? qp.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const jitter = direction(k + 3).multiplyScalar(0.9);
      p = qp.add(out.add(jitter).normalize().multiplyScalar(15));
    } else {
      const qs = d.questionIds
        .map((id) => this.nodes.get(id))
        .filter((q): q is RenderNode => !!q && q.x !== undefined);
      p = new THREE.Vector3();
      for (const q of qs) p.add(new THREE.Vector3(q.x, q.y, q.z));
      if (qs.length) p.divideScalar(qs.length).multiplyScalar(0.72);
      p.add(direction(this.nodes.size).multiplyScalar(6));
    }
    n.x = p.x;
    n.y = p.y;
    n.z = p.z;
    n.seeded = true;
  }

  /** Freeze every placed node so a new arrival never shoves the old layout. */
  pinPlaced(except: Set<string>): void {
    for (const n of this.nodes.values()) {
      if (except.has(n.id) || n.x === undefined) continue;
      n.fx = n.x;
      n.fy = n.y;
      n.fz = n.z;
    }
  }

  unpinAll(): void {
    for (const n of this.nodes.values()) {
      n.fx = undefined;
      n.fy = undefined;
      n.fz = undefined;
    }
  }

  data(): { nodes: RenderNode[]; links: RenderLink[] } {
    return { nodes: [...this.nodes.values()], links: [...this.links.values()] };
  }
}

function disposeNode(n: RenderNode): void {
  n.core.material.dispose();
  for (const s of [n.halo, n.ring, n.strike]) (s.material as THREE.SpriteMaterial).dispose();
}

export function disposeShared(): void {
  for (const k of Object.keys(textures) as TexKind[]) {
    textures[k]?.dispose();
    delete textures[k];
  }
  if (geoms) {
    geoms.sphere.dispose();
    geoms.octa.dispose();
    geoms = null;
  }
}

/* ------------------------------------------------------------------ */
/* Per-frame easing                                                    */
/* ------------------------------------------------------------------ */

const tmp = new THREE.Color();

export function stepNodes(store: GraphStore, now: number, dt: number, reduced: boolean): void {
  const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
  const kc = reduced ? 1 : 1 - Math.exp(-dt * 4);
  for (const n of store.nodes.values()) {
    const born = now >= n.bornAt;
    const grow = reduced ? 1 : born ? 1 : 0;
    n.scale += (n.tScale * grow - n.scale) * k;
    n.opacity += (n.tOpacity * grow - n.opacity) * kc;
    n.color.lerp(n.tColor, kc);
    n.haloOpacity += (n.tHalo - n.haloOpacity) * kc;
    n.ringOpacity += (n.tRing - n.ringOpacity) * kc;
    n.strikeOpacity += (n.tStrike - n.strikeOpacity) * kc;
    n.focus += (n.tFocus - n.focus) * (reduced ? 1 : 1 - Math.exp(-dt * 10));

    let pulse = 0;
    if (n.pulseAt !== null && !reduced) {
      const t = (now - n.pulseAt) / (MOTION.pulseS * 1000);
      if (t >= 1) n.pulseAt = null;
      else pulse = Math.sin(Math.PI * t) * (1 - t * 0.5);
    }

    const s = Math.max(0.0001, n.scale * (1 + pulse * 0.55));
    n.core.scale.setScalar(s);
    const mat = n.core.material;
    mat.opacity = n.opacity * n.focus;
    mat.transparent = mat.opacity < 0.999;
    mat.depthWrite = mat.opacity > 0.6;
    mat.color.copy(n.color);
    if (pulse > 0) {
      mat.emissive.copy(tmp.copy(n.ringColor)).multiplyScalar(pulse * 0.9);
    } else if (mat.emissive.r + mat.emissive.g + mat.emissive.b > 0) {
      mat.emissive.setRGB(0, 0, 0);
    }

    const haloA = Math.max(n.haloOpacity, pulse * 0.6) * n.focus;
    setSprite(n.halo, haloA, s * 3.4);
    if (pulse > 0) (n.halo.material as THREE.SpriteMaterial).color.copy(n.ringColor);
    setSprite(n.ring, n.ringOpacity * n.focus * Math.min(1, n.opacity * 2), s * 2.7);
    (n.ring.material as THREE.SpriteMaterial).color.copy(n.ringColor);
    setSprite(n.strike, n.strikeOpacity * n.focus, s * 2.6);
    if (n.label) {
      const show = store.showLabels && n.opacity > 0.05;
      n.label.visible = show;
      if (show) {
        n.label.position.set(0, -(n.scale * 1.45 + 2), 0);
        n.label.element.style.opacity = String(Math.min(1, n.opacity) * (n.focus < 0.99 ? n.focus * 0.8 : 1));
      }
    }
  }
}

function setSprite(sp: THREE.Sprite, opacity: number, size: number): void {
  const m = sp.material as THREE.SpriteMaterial;
  m.opacity = opacity;
  sp.visible = opacity > 0.01;
  if (sp.visible) sp.scale.set(size, size, 1);
}
