"use client";

// The run's evidence graph in 3D, built live from its event stream:
// questions (large), their options (sized by posterior) and diagnostics
// (octahedra) joined by thin links. Rendering and force layout come from
// react-force-graph-3d (vasturiano); node objects persist across updates
// and placed nodes are pinned while newcomers settle, so the layout never
// jumps. Diagnostics pulse when they run, rejected options dim and gain a
// strike, a settled question rings its winner.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ForceGraphMethods } from "react-force-graph-3d";
import { buildGraph, type EvidenceGraph, type GraphNode, type RunEvent } from "./graph";
import {
  GraphStore,
  disposeShared,
  nodeRadius,
  stepNodes,
  type RenderLink,
  type RenderNode,
} from "./graphScene";
import { useColorMode, useElementSize, useInView, useReducedMotion, useSurfaceColor } from "./hooks";
import { MONO_FONT, MOTION, PALETTE, SANS_FONT, VERDICT_LABEL, verdictColor, type ColorMode } from "./theme";

export type { RunEvent } from "./graph";

export interface EvidenceGraph3DProps {
  events: RunEvent[];
  height?: number;
  className?: string;
}

type FG = ForceGraphMethods<RenderNode, RenderLink>;
// react-force-graph-3d touches window at import time, so it is loaded in an
// effect; its generic props are loosened here to fit the dynamic component.
type FGComponent = ComponentType<Record<string, unknown> & { ref?: MutableRefObject<FG | undefined> }>;

interface OrbitLike {
  enableDamping: boolean;
  dampingFactor: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
  minDistance: number;
  maxDistance: number;
  rotateSpeed: number;
  zoomSpeed: number;
  enablePan: boolean;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

const EMPTY = { nodes: [] as RenderNode[], links: [] as RenderLink[] };
let liveInstances = 0;

/* ------------------------------------------------------------------ */
/* Tooltip text                                                        */
/* ------------------------------------------------------------------ */

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

// Font stacks quote family names with ", which would end a style="" attribute.
const SANS_ATTR = SANS_FONT.replace(/"/g, "'");
const MONO_ATTR = MONO_FONT.replace(/"/g, "'");

function tooltip(d: GraphNode, graph: EvidenceGraph, mode: ColorMode): string {
  const p = PALETTE[mode];
  const dark = mode === "dark";
  const box = `font-family:${SANS_ATTR};font-size:12.5px;line-height:1.45;color:${p.ink};background:${dark ? "rgba(18,21,27,0.92)" : "rgba(255,255,255,0.96)"};border:1px solid ${dark ? "rgba(255,255,255,0.09)" : "rgba(20,23,28,0.10)"};border-radius:8px;padding:9px 11px;max-width:320px;box-shadow:0 8px 28px rgba(0,0,0,${dark ? 0.4 : 0.1});backdrop-filter:blur(8px);`;
  const eyebrow = (t: string, color = p.muted) =>
    `<div style="font-family:${MONO_ATTR};font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:${color};margin-bottom:4px">${esc(t)}</div>`;
  const meta = (t: string) =>
    `<div style="font-family:${MONO_ATTR};font-size:11px;color:${p.muted};margin-top:6px">${t}</div>`;
  const find = (id: string | null) => (id ? graph.nodes.find((n) => n.id === id) : undefined);

  if (d.kind === "question") {
    const head = d.claim ? (d.claim.planted ? "Claim · planted" : "Claim") : "Question";
    let status = `Open · ${d.optionIds.length} option${d.optionIds.length === 1 ? "" : "s"}`;
    let color = p.muted;
    if (d.status === "settled") {
      const w = find(d.winner);
      status = `Settled → ${esc(w ? (w.kind === "option" ? w.label : w.id) : (d.winner ?? ""))}${d.winnerPosterior !== null ? ` · p ${d.winnerPosterior.toFixed(2)}` : ""}`;
      color = p.accent;
    } else if (d.status === "unresolved") {
      status = `Unresolved · ${esc(d.reason ?? "")}`;
      color = p.unresolved;
    }
    const quote = d.claim?.quote
      ? `<div style="color:${p.muted};font-style:italic;margin-top:4px">“${esc(d.claim.quote)}”</div>`
      : "";
    const question =
      d.claim && d.text ? `<div style="color:${p.muted};margin-top:4px">${esc(d.text)}</div>` : "";
    return `<div style="${box}">${eyebrow(head)}<div>${esc(d.label)}</div>${quote}${question}<div style="margin-top:6px;color:${color}">${status}</div></div>`;
  }
  if (d.kind === "option") {
    const verdict = d.verdict ? VERDICT_LABEL[d.verdict] : null;
    const head = d.isNull ? "Option · null" : verdict ? `Option · ${verdict}` : "Option";
    const headColor = d.verdict ? verdictColor(d.verdict, mode) : p.muted;
    let status = "";
    if (d.status === "winner")
      status = `<div style="margin-top:6px;color:${p.accent}">Winner of its question</div>`;
    if (d.status === "rejected")
      status = `<div style="margin-top:6px;color:${p.muted}"><s>Rejected</s> · ${esc(d.rejectedReason ?? "")}</div>`;
    const key = d.answerKey ? ` · key ${esc(d.answerKey)}` : "";
    return `<div style="${box}">${eyebrow(head, headColor)}<div>${esc(d.label)}</div>${status}${meta(`posterior ${pct(d.posterior)} · prior ${pct(d.prior)}${key}`)}</div>`;
  }
  const state =
    d.status === "proposed"
      ? "Proposed, not run"
      : d.status === "chosen"
        ? "Chosen, waiting to run"
        : d.status === "running"
          ? "Running"
          : d.status === "invalid"
            ? "Ran · ruled invalid"
            : `Ran${d.observed ? ` · observed ${esc(d.observed)}` : ""}`;
  const eig = d.eigBits !== null ? ` · ${d.eigBits.toFixed(2)} bits expected` : "";
  return `<div style="${box}">${eyebrow(`Diagnostic · ${d.experimentKind || "check"}`)}<div>${esc(d.label)}</div>${meta(`${state}${eig}`)}</div>`;
}

/* ------------------------------------------------------------------ */
/* Forces                                                              */
/* ------------------------------------------------------------------ */

/** Weak pull to the origin for hubs (questions, diagnostics) so islands stay near. */
function gravity(k: number) {
  let nodes: RenderNode[] = [];
  const force = (alpha: number) => {
    for (const n of nodes) {
      if (n.data.kind === "option" || n.x === undefined) continue;
      n.vx = (n.vx ?? 0) - n.x * k * alpha;
      n.vy = (n.vy ?? 0) - (n.y ?? 0) * k * alpha * 1.4;
      n.vz = (n.vz ?? 0) - (n.z ?? 0) * k * alpha;
    }
  };
  force.initialize = (ns: RenderNode[]) => {
    nodes = ns;
  };
  return force;
}

/** Orbit centre and distance that keep every node in view. */
/** Caption bands at the top and bottom, in CSS pixels, that nodes should clear. */
interface Bands {
  top: number;
  bottom: number;
  height: number;
}

function framing(
  store: GraphStore,
  cam: THREE.PerspectiveCamera,
  bands: Bands,
): { center: THREE.Vector3; dist: number; radius: number } | null {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const v = new THREE.Vector3();
  let any = false;
  for (const n of store.nodes.values()) {
    if (n.x === undefined) continue;
    any = true;
    v.set(n.x, n.y ?? 0, n.z ?? 0);
    min.min(v);
    max.max(v);
  }
  if (!any) return null;
  const center = min.clone().add(max).multiplyScalar(0.5);
  let r = 0;
  for (const n of store.nodes.values()) {
    if (n.x === undefined) continue;
    r = Math.max(
      r,
      Math.hypot(n.x - center.x, (n.y ?? 0) - center.y, (n.z ?? 0) - center.z) + nodeRadius(n.data),
    );
  }
  const half = Math.tan((cam.fov * Math.PI) / 360);
  // Fit the cloud between the caption bands, not behind them.
  const usable = Math.max(0.45, (bands.height - bands.top - bands.bottom) / Math.max(1, bands.height));
  const vHalf = Math.atan(half * usable);
  const hHalf = Math.atan(half * cam.aspect);
  // tan rather than sin: frame the cloud, not its loose bounding sphere.
  const dist = (Math.max(r, 48) / Math.tan(Math.min(vHalf, hHalf))) * 1.02;
  return { center, dist, radius: r };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function EvidenceGraph3D({ events, height = 520, className }: EvidenceGraph3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(host);
  const mode = useColorMode();
  const reduced = useReducedMotion();
  const inView = useInView(host);
  const surface = useSurfaceColor(host, mode);

  const graph = useMemo(() => buildGraph(events ?? []), [events]);
  // Latest values for the frame loop and callbacks, which outlive renders.
  const graphRef = useRef(graph);
  const modeRef = useRef(mode);
  const reducedRef = useRef(reduced);
  const surfaceRef = useRef(surface);
  const bandsRef = useRef<Bands>({ top: 66, bottom: 52, height });
  useEffect(() => {
    graphRef.current = graph;
    modeRef.current = mode;
    reducedRef.current = reduced;
    surfaceRef.current = surface;
  }, [graph, mode, reduced, surface]);

  const [lib, setLib] = useState<{ Graph: FGComponent; labels: { domElement: HTMLElement } } | null>(null);
  const Graph = lib?.Graph ?? null;
  const [loadError, setLoadError] = useState<string | null>(null);
  const fgRef = useRef<FG | undefined>(undefined);
  // One store per mount; it owns the three.js objects the layout holds on to.
  const [store] = useState(() => new GraphStore());
  const [configured, setConfigured] = useState(false);
  const [data, setData] = useState(EMPTY);
  const interacted = useRef(false);
  const hoverId = useRef<string | null>(null);
  const lights = useRef<{ hemi: THREE.HemisphereLight; key: THREE.DirectionalLight } | null>(null);

  // Load the renderer lazily (it reads window at import).
  useEffect(() => {
    let alive = true;
    liveInstances += 1;
    Promise.all([import("react-force-graph-3d"), import("three/examples/jsm/renderers/CSS2DRenderer.js")])
      .then(([m, css]) => {
        if (!alive) return;
        setLib({ Graph: m.default as unknown as FGComponent, labels: new css.CSS2DRenderer() });
      })
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      liveInstances -= 1;
      store.reset();
      if (liveInstances === 0) disposeShared();
    };
  }, [store]);

  // Configure scene, forces, lights and controls once the graph mounts.
  useEffect(() => {
    if (!Graph) return;
    const fg = fgRef.current;
    if (!fg) return;
    const renderer = fg.renderer();
    const scene = fg.scene();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.fog = new THREE.Fog(surfaceRef.current, 200, 900);

    const hemi = new THREE.HemisphereLight("#ffffff", "#3a3f47", 1.4);
    const key = new THREE.DirectionalLight("#ffffff", 1.5);
    key.position.set(1, 1.4, 1.2);
    fg.lights([hemi, key]);
    lights.current = { hemi, key };

    const link = fg.d3Force("link");
    link?.distance?.((l: RenderLink) => (l.data.kind === "option" ? 13 : 34));
    link?.strength?.((l: RenderLink) => (l.data.kind === "option" ? 0.9 : 0.22));
    const charge = fg.d3Force("charge");
    charge?.strength?.((n: RenderNode) =>
      n.data.kind === "question" ? -75 : n.data.kind === "diagnostic" ? -45 : -16,
    );
    charge?.distanceMax?.(170);
    fg.d3Force("center", null);
    fg.d3Force("gravity", gravity(0.035));

    const controls = fg.controls() as unknown as OrbitLike;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.7;
    controls.enablePan = false;
    controls.minDistance = 30;
    controls.maxDistance = 1600;
    controls.autoRotate = !reducedRef.current;
    controls.autoRotateSpeed = MOTION.graphOrbit;
    const onStart = () => {
      interacted.current = true;
      controls.autoRotate = false;
    };
    controls.addEventListener("start", onStart);
    setConfigured(true);

    return () => {
      controls.removeEventListener("start", onStart);
      env.dispose();
      pmrem.dispose();
      scene.environment = null;
      try {
        renderer.forceContextLoss();
      } catch {
        // context already gone
      }
    };
  }, [Graph]);

  // Light and dark need different exposure.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !configured || !lights.current) return;
    const dark = mode === "dark";
    fg.scene().environmentIntensity = dark ? 0.55 : 0.28;
    lights.current.hemi.intensity = dark ? 1.4 : 0.85;
    lights.current.hemi.groundColor.set(dark ? "#3a3f47" : "#c9ced5");
    lights.current.key.intensity = dark ? 1.5 : 1.1;
  }, [mode, configured]);

  // Reduced motion: no orbit.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !configured) return;
    const controls = fg.controls() as unknown as OrbitLike;
    controls.autoRotate = !reduced && !interacted.current;
  }, [reduced, configured]);

  // Fold the graph into persistent render nodes.
  useEffect(() => {
    if (!configured) return;
    const now = performance.now();
    const before = new Set(store.nodes.keys());
    const { structural, ran } = store.sync(graph, mode, now);
    if (structural) {
      const fresh = new Set([...store.nodes.keys()].filter((id) => !before.has(id)));
      if (before.size > 0) store.pinPlaced(fresh);
      // The store is external (three.js objects the layout holds); a new array goes
      // to the graph only when nodes or links were added.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(store.data());
    }
    const fg = fgRef.current;
    if (fg && ran.length && !reduced) {
      for (const l of store.links.values()) {
        const src = typeof l.source === "string" ? l.source : l.source.id;
        if (ran.includes(src)) fg.emitParticle(l);
      }
    }
  }, [graph, mode, configured, store, reduced]);

  // Fog colour follows the page.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !configured) return;
    const fog = fg.scene().fog;
    if (fog instanceof THREE.Fog) fog.color.set(surface);
  }, [surface, configured]);

  // Pause rendering off-screen.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !configured) return;
    if (inView) fg.resumeAnimation();
    else fg.pauseAnimation();
  }, [inView, configured]);

  // Per-frame easing of sizes, colours, pulses and hover focus.
  useEffect(() => {
    if (!configured || !inView) return;
    let raf = 0;
    let last = performance.now();
    let tick = 0;
    let goal: { center: THREE.Vector3; dist: number; radius: number } | null = null;
    const offset = new THREE.Vector3();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      stepNodes(store, now, dt, reducedRef.current);
      const fg = fgRef.current;
      if (!fg) return;
      const p = PALETTE[modeRef.current];
      const dark = modeRef.current === "dark";
      const hover = hoverId.current;
      for (const l of store.links.values()) {
        const mat = l.__lineObj?.material as THREE.LineBasicMaterial | undefined;
        if (!mat) continue;
        const src = typeof l.source === "string" ? store.nodes.get(l.source) : l.source;
        const dst = typeof l.target === "string" ? store.nodes.get(l.target) : l.target;
        const grow = Math.min(src?.opacity ?? 0, dst?.opacity ?? 0);
        let color = dark ? "#8b95a1" : "#5d6670";
        let alpha = l.data.kind === "option" ? (dark ? 0.34 : 0.42) : dark ? 0.5 : 0.6;
        if (l.data.winner) {
          color = p.accent;
          alpha = 0.95;
        } else if (l.data.rejected) {
          alpha = 0.08;
        } else if (
          l.data.kind === "diagnostic" &&
          src?.data.kind === "diagnostic" &&
          src.data.status === "proposed"
        ) {
          alpha = 0.16;
        }
        if (hover) {
          const on = (src && src.id === hover) || (dst && dst.id === hover);
          alpha = on ? Math.max(alpha, 0.85) : alpha * 0.25;
        }
        mat.color.set(color);
        mat.opacity = alpha * Math.min(1, grow * 1.5);
        mat.transparent = true;
      }
      // Camera: ease the orbit target and distance toward the graph's
      // bounding sphere (stable under the slow orbit), until the user takes over.
      const cam = fg.camera() as THREE.PerspectiveCamera;
      const controls = fg.controls() as unknown as { target: THREE.Vector3 };
      if (!interacted.current && store.nodes.size > 0) {
        if (tick++ % 15 === 0 || !goal) goal = framing(store, cam, bandsRef.current);
        if (goal) {
          const kc = reducedRef.current ? 1 : 1 - Math.exp(-dt * 1.4);
          offset.copy(cam.position).sub(controls.target);
          let dist = offset.length();
          if (dist < 1e-3) {
            offset.set(0, 0.15, 1);
            dist = 1;
          }
          offset.normalize();
          controls.target.lerp(goal.center, kc);
          dist += (goal.dist - dist) * kc;
          cam.position.copy(controls.target).addScaledVector(offset, dist);
        }
      }
      const fog = fg.scene().fog;
      if (fog instanceof THREE.Fog) {
        const d = cam.position.distanceTo(controls.target);
        const r = Math.max(40, goal?.radius ?? store.radius);
        fog.near = Math.max(1, d - r * 0.35);
        fog.far = d + r * (modeRef.current === "dark" ? 1.7 : 2.4);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [configured, inView, store]);

  const onNodeHover = useCallback(
    (node: RenderNode | null) => {
      hoverId.current = node?.id ?? null;
      const near = new Set<string>();
      if (node) {
        near.add(node.id);
        for (const l of store.links.values()) {
          const s = typeof l.source === "string" ? l.source : l.source.id;
          const t = typeof l.target === "string" ? l.target : l.target.id;
          if (s === node.id) near.add(t);
          if (t === node.id) near.add(s);
        }
      }
      for (const n of store.nodes.values()) n.tFocus = !node || near.has(n.id) ? 1 : 0.28;
      if (host.current) host.current.style.cursor = node ? "pointer" : "grab";
    },
    [store],
  );

  const nodeLabel = useCallback((n: RenderNode) => tooltip(n.data, graphRef.current, modeRef.current), []);
  const nodeObject = useCallback((n: RenderNode) => n.obj, []);
  const linkMaterial = useCallback(() => {
    const m = new THREE.LineBasicMaterial({
      color: "#8b95a1",
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    return m;
  }, []);

  const p = PALETTE[mode];
  const hasVerdicts = graph.nodes.some((n) => n.kind === "option" && n.verdict);
  const topBand = hasVerdicts ? 84 : 66;
  const bottomBand = graph.source ? 72 : 52;
  useEffect(() => {
    bandsRef.current = { top: topBand, bottom: bottomBand, height };
  }, [topBand, bottomBand, height]);
  const c = graph.counts;

  return (
    <div
      ref={host}
      className={`cx-evidence-graph ${className ?? ""}`}
      style={{
        position: "relative",
        width: "100%",
        height,
        overflow: "hidden",
        cursor: "grab",
        fontFamily: SANS_FONT,
      }}
    >
      <style>{`.cx-evidence-graph .float-tooltip-kap{background:transparent;padding:0;border-radius:0;font:inherit;color:inherit;max-width:none}`}</style>
      {Graph && lib && width > 0 && (
        <Graph
          ref={fgRef}
          width={width}
          height={height}
          graphData={configured ? data : EMPTY}
          nodeId="id"
          controlType="orbit"
          extraRenderers={[lib.labels]}
          rendererConfig={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          backgroundColor="rgba(0,0,0,0)"
          showNavInfo={false}
          enableNodeDrag={false}
          nodeThreeObject={nodeObject}
          nodeThreeObjectExtend={false}
          nodeLabel={nodeLabel}
          onNodeHover={onNodeHover}
          linkMaterial={linkMaterial}
          linkWidth={0}
          linkDirectionalParticles={0}
          linkDirectionalParticleWidth={1.6}
          linkDirectionalParticleSpeed={0.014}
          linkDirectionalParticleColor={() => p.accent}
          warmupTicks={reduced ? 220 : 70}
          cooldownTicks={reduced ? 0 : 110}
          d3AlphaDecay={0.045}
          d3VelocityDecay={0.42}
        />
      )}
      {!Graph && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: MONO_FONT,
            fontSize: 12,
            color: p.muted,
          }}
        >
          {loadError ? `Graph unavailable: ${loadError}` : "Loading graph…"}
        </div>
      )}
      {/* Soft bands so the captions sit on the page colour, not on nodes. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: topBand,
          pointerEvents: "none",
          background: `linear-gradient(${surface} 45%, ${surface}00)`,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: bottomBand,
          pointerEvents: "none",
          background: `linear-gradient(${surface}00, ${surface} 60%)`,
        }}
      />
      <Legend mode={mode} hasVerdicts={hasVerdicts} />
      <div style={{ ...overlayText(mode), top: 14, right: 16, textAlign: "right" }}>
        {c.questions} {graph.source ? "claims" : "questions"} · {c.settled} settled · {c.unresolved}{" "}
        unresolved
        <br />
        {c.options} options · {c.rejected} rejected · {c.ran}/{c.diagnostics} diagnostics run
      </div>
      {graph.ticker && (
        <div
          key={graph.ticker.seq}
          style={{
            position: "absolute",
            left: 16,
            bottom: 14,
            right: 16,
            fontSize: 13,
            color: p.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
            animation: reduced ? undefined : "cx-evg-in 420ms ease",
          }}
        >
          <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: p.muted, marginRight: 8 }}>
            #{graph.ticker.seq}
          </span>
          {graph.ticker.text}
        </div>
      )}
      {graph.source && (
        <div style={{ ...overlayText(mode), bottom: 36, left: 16, maxWidth: "70%" }}>
          {graph.source.title || graph.source.citation}
          {graph.source.license ? ` · ${graph.source.license}` : ""}
        </div>
      )}
      <style>{`@keyframes cx-evg-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

const overlayText = (mode: ColorMode): CSSProperties => ({
  position: "absolute",
  fontFamily: MONO_FONT,
  fontSize: 11,
  lineHeight: 1.6,
  color: PALETTE[mode].muted,
  pointerEvents: "none",
  userSelect: "none",
});

function Legend({ mode, hasVerdicts }: { mode: ColorMode; hasVerdicts: boolean }) {
  const p = PALETTE[mode];
  const dot = (
    color: string,
    opts: { ring?: boolean; diamond?: boolean; size?: number; strike?: boolean; dashed?: boolean } = {},
  ) => {
    const s = opts.size ?? 8;
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: s,
          height: s,
          marginRight: 6,
          verticalAlign: "middle",
          borderRadius: opts.diamond ? 1 : "50%",
          transform: opts.diamond ? "rotate(45deg) scale(0.85)" : undefined,
          backgroundColor: opts.ring ? "transparent" : color,
          border: opts.ring ? `1.5px ${opts.dashed ? "dashed" : "solid"} ${color}` : undefined,
          backgroundImage: opts.strike
            ? `linear-gradient(135deg, transparent 45%, ${p.muted} 45%, ${p.muted} 55%, transparent 55%)`
            : undefined,
          opacity: opts.strike ? 0.7 : 1,
        }}
      />
    );
  };
  const item = (el: ReactNode, label: string) => (
    <span style={{ marginRight: 14, whiteSpace: "nowrap" }}>
      {el}
      {label}
    </span>
  );
  return (
    <div style={{ ...overlayText(mode), top: 14, left: 16, maxWidth: "60%" }}>
      <div>
        {item(dot(mode === "dark" ? "#d7dbe0" : "#3b424c", { size: 10 }), "question")}
        {item(dot(p.neutral, { size: 7 }), "option · size = posterior")}
        {item(dot(mode === "dark" ? "#c9ced6" : "#4a525d", { diamond: true }), "diagnostic")}
      </div>
      <div>
        {item(dot(p.accent, { ring: true, size: 10 }), "settled / winner")}
        {item(dot(p.unresolved, { ring: true, dashed: true, size: 10 }), "unresolved")}
        {item(dot(p.faint, { strike: true, size: 9 }), "rejected")}
      </div>
      {hasVerdicts && (
        <div>
          {item(dot(p.holds), VERDICT_LABEL.holds)}
          {item(dot(p.refuted), VERDICT_LABEL.refuted)}
          {item(dot(p.conditional), `${VERDICT_LABEL.conditional} …`)}
        </div>
      )}
    </div>
  );
}

export default EvidenceGraph3D;
