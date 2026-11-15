"use client";

// A Mol* (molstar, MIT) viewer with no Mol* interface at all: a headless
// PluginContext drawing into our own canvas (the "plugin instance without
// UI" pattern from the Mol* docs), so it reads as an embedded figure. The
// entry loads from RCSB (BinaryCIF) with PDBe as the fallback, drawn as a
// muted cartoon with soft ambient occlusion (after the Mol* lighting
// example); highlighted residues are ball-and-stick in the accent and the
// camera settles on them. Mol* is imported lazily, inside an effect.

import { useEffect, useRef, useState } from "react";
import type { PluginContext } from "molstar/lib/mol-plugin/context";
import { useColorMode, useInView, useReducedMotion, useSurfaceColor } from "./hooks";
import { MONO_FONT, PALETTE, PROTEIN_COLORS, SANS_FONT, type ColorMode } from "./theme";

export interface ProteinViewerProps {
  pdbId: string;
  /** Author chain id and author residue number, e.g. { chain: 'B', residue: 6 }. */
  highlightResidues?: { chain: string; residue: number }[];
  className?: string;
}

type Status = "loading" | "ready" | "offline" | "error";

const LOAD_TIMEOUT_MS = 25_000;

function sources(id: string): { url: string; binary: boolean; label: string }[] {
  const lower = id.toLowerCase();
  return [
    { url: `https://models.rcsb.org/${lower}.bcif`, binary: true, label: "RCSB PDB" },
    {
      url: `https://www.ebi.ac.uk/pdbe/entry-files/download/${lower}_updated.cif`,
      binary: false,
      label: "PDBe",
    },
  ];
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

/** Why a load failed, for the message shown in place of the structure. */
export class LoadError extends Error {
  constructor(
    message: string,
    readonly reason: "not-found" | "unreachable",
  ) {
    super(message);
  }
}

/**
 * Fetch the entry ourselves (clear status codes, a real timeout), RCSB first
 * and PDBe second, and return the bytes for Mol* to parse.
 */
async function fetchEntry(
  id: string,
  isCancelled: () => boolean,
): Promise<{ data: ArrayBuffer | string; label: string } | null> {
  let notFound = 0;
  const errors: string[] = [];
  const list = sources(id);
  for (const src of list) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), LOAD_TIMEOUT_MS);
    try {
      const res = await fetch(src.url, { signal: ctl.signal });
      if (!res.ok) {
        if (res.status === 404) notFound += 1;
        errors.push(`${src.label} ${res.status}`);
        continue;
      }
      const data = src.binary ? await res.arrayBuffer() : await res.text();
      return isCancelled() ? null : { data, label: src.label };
    } catch (e) {
      errors.push(`${src.label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new LoadError(errors.join("; "), notFound === list.length ? "not-found" : "unreachable");
}

/** Canvas look: transparent background, soft occlusion, a hairline outline. */
async function styleCanvas(
  plugin: PluginContext,
  mode: ColorMode,
  reduced: boolean,
  surface: string,
): Promise<void> {
  const [{ Color }, { Vec3 }] = await Promise.all([
    import("molstar/lib/mol-util/color"),
    import("molstar/lib/mol-math/linear-algebra"),
  ]);
  const dark = mode === "dark";
  const p = PALETTE[mode];
  plugin.canvas3d?.setProps({
    transparentBackground: true,
    camera: { helper: { axes: { name: "off", params: {} } } },
    cameraFog: { name: "on", params: { intensity: dark ? 25 : 15 } },
    renderer: {
      // Camera fog fades toward this colour: use the colour painted behind the canvas.
      backgroundColor: Color(hexToInt(surface)),
      ambientIntensity: dark ? 0.55 : 0.7,
      light: [{ inclination: 150, azimuth: 320, color: Color(0xffffff), intensity: dark ? 0.75 : 0.6 }],
      highlightColor: Color(hexToInt(p.accent)),
      selectColor: Color(hexToInt(p.accent)),
      highlightStrength: 0.45,
    },
    postprocessing: {
      occlusion: {
        name: "on",
        params: {
          samples: 24,
          multiScale: { name: "off", params: {} },
          radius: 5,
          bias: 0.8,
          blurKernelSize: 15,
          blurDepthBias: 0.5,
          resolutionScale: 0.6,
          color: Color(dark ? 0x000000 : 0x1a1f26),
          transparentThreshold: 0.4,
        },
      },
      outline: {
        name: "on",
        params: {
          scale: 1,
          threshold: 0.33,
          color: Color(dark ? 0x05070a : 0x2b3138),
          includeTransparent: true,
        },
      },
    },
    trackball: {
      animate: reduced
        ? { name: "off", params: {} }
        : { name: "rock", params: { speed: 0.12, angle: 9, axis: Vec3.create(0, -1, 0) } },
    },
  });
}

async function loadEntry(
  plugin: PluginContext,
  pdbId: string,
  highlights: { chain: string; residue: number }[],
  mode: ColorMode,
  reduced: boolean,
  isCancelled: () => boolean,
): Promise<void> {
  const [{ Color }, { MolScriptBuilder: MS }, { Vec3 }] = await Promise.all([
    import("molstar/lib/mol-util/color"),
    import("molstar/lib/mol-script/language/builder"),
    import("molstar/lib/mol-math/linear-algebra"),
  ]);
  await plugin.clear();
  if (isCancelled()) return;

  const entry = await fetchEntry(pdbId, isCancelled);
  if (!entry || isCancelled()) return;
  const data = await plugin.builders.data.rawData(
    { data: entry.data, label: pdbId.toUpperCase() },
    { state: { isGhost: true } },
  );
  if (isCancelled()) return;

  const trajectory = await plugin.builders.structure.parseTrajectory(data, "mmcif");
  const model = await plugin.builders.structure.createModel(trajectory);
  // The deposited model: for 2HBS that is two tetramers, the β6 contact between them included.
  const structure = await plugin.builders.structure.createStructure(model, { name: "model", params: {} });
  const colors = PROTEIN_COLORS[mode];
  const p = PALETTE[mode];
  const repr = plugin.builders.structure.representation;

  const polymer = await plugin.builders.structure.tryCreateComponentStatic(structure, "polymer");
  if (polymer) {
    await repr.addRepresentation(polymer, {
      type: "cartoon",
      color: "entity-id",
      colorParams: {
        palette: {
          name: "colors",
          params: {
            list: { kind: "set", colors: [Color(hexToInt(colors.chainA)), Color(hexToInt(colors.chainB))] },
          },
        },
      },
    });
  }
  const ligand = await plugin.builders.structure.tryCreateComponentStatic(structure, "ligand");
  if (ligand) {
    await repr.addRepresentation(ligand, {
      type: "ball-and-stick",
      color: "uniform",
      colorParams: { value: Color(hexToInt(colors.ligand)) },
      typeParams: { sizeFactor: 0.18 },
    });
  }

  let focus = false;
  if (highlights.length) {
    const groups = highlights.map((h) =>
      MS.struct.generator.atomGroups({
        "chain-test": MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), h.chain]),
        "residue-test": MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), h.residue]),
      }),
    );
    const expression = groups.length === 1 ? groups[0]! : MS.struct.combinator.merge(groups);
    const hl = await plugin.builders.structure.tryCreateComponentFromExpression(
      structure,
      expression,
      "cx-highlight",
      { label: "Highlight" },
    );
    if (hl) {
      await repr.addRepresentation(hl, {
        type: "ball-and-stick",
        color: "uniform",
        colorParams: { value: Color(hexToInt(p.accent)) },
        typeParams: { sizeFactor: 0.5 },
      });
      // A translucent van der Waals shell so the residue reads at whole-molecule zoom.
      await repr.addRepresentation(hl, {
        type: "spacefill",
        color: "uniform",
        colorParams: { value: Color(hexToInt(p.accent)) },
        typeParams: { alpha: 0.45 },
      });
      const s = hl.cell?.obj?.data;
      const whole = structure.cell?.obj?.data;
      const camera = plugin.canvas3d?.camera;
      if (s && s.elementCount > 0 && whole && camera) {
        // Keep the whole fold centred and turn it so the highlighted
        // residues face the viewer (they sit on the near side).
        // When they surround the centre (2HBS: one β6 on each of four
        // chains) there is no such side, so keep Mol*'s principal-axes view.
        const centre = whole.boundary.sphere.center;
        const toward = Vec3.sub(Vec3(), s.boundary.sphere.center, centre);
        if (Vec3.magnitude(toward) > whole.boundary.sphere.radius * 0.2) {
          const snapshot = camera.getFocus(centre, whole.boundary.sphere.radius * 0.92);
          if (snapshot.position) {
            const dist = Vec3.distance(snapshot.position, centre);
            snapshot.position = Vec3.scaleAndAdd(Vec3(), centre, Vec3.normalize(toward, toward), dist);
          }
          plugin.managers.camera.setSnapshot(snapshot, reduced ? 0 : 900);
          focus = true;
        }
      }
    }
  }
  if (!focus) plugin.managers.camera.reset();
}

export function ProteinViewer({ pdbId, highlightResidues, className }: ProteinViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const plugin = useRef<PluginContext | null>(null);
  const mode = useColorMode();
  const reduced = useReducedMotion();
  const inView = useInView(host);
  const surface = useSurfaceColor(host, mode);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState("");
  const [hover, setHover] = useState("");
  const hlKey = JSON.stringify(highlightResidues ?? []);

  // Create the plugin once per mount, on a fresh canvas (a canvas whose
  // context was lost on dispose cannot host a new one).
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    let sub: { unsubscribe(): void } | null = null;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;outline:none;touch-action:none";
    stage.current?.appendChild(canvas);
    (async () => {
      const [{ PluginContext: Ctx }, { DefaultPluginSpec }, { PluginConfig }] = await Promise.all([
        import("molstar/lib/mol-plugin/context"),
        import("molstar/lib/mol-plugin/spec"),
        import("molstar/lib/mol-plugin/config"),
      ]);
      if (disposed || !stage.current) return;
      // Cap the drawing buffer at 1.5x device pixels: ambient occlusion is fill-rate bound.
      const spec = DefaultPluginSpec();
      const pixelScale = Math.min(1, 1.5 / (window.devicePixelRatio || 1));
      const ctx = new Ctx({
        ...spec,
        config: [...(spec.config ?? []), [PluginConfig.General.PixelScale, pixelScale]],
      });
      await ctx.init();
      if (disposed) {
        ctx.dispose();
        return;
      }
      const ok = await ctx.initViewerAsync(canvas, stage.current);
      if (!ok) throw new Error("WebGL is not available in this browser");
      if (disposed) {
        ctx.dispose();
        return;
      }
      plugin.current = ctx;
      sub = ctx.behaviors.labels.highlight.subscribe((e: { labels: ReadonlyArray<unknown> }) => {
        const text = e.labels
          .map((l) => (typeof l === "string" ? l : ""))
          .join(" · ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        setHover(text);
      });
      ro = new ResizeObserver(() => ctx.handleResize());
      ro.observe(stage.current);
      setReady(true);
    })().catch((e: unknown) => {
      if (disposed) return;
      setStatus("error");
      setDetail(e instanceof Error ? e.message : String(e));
    });
    return () => {
      disposed = true;
      ro?.disconnect();
      sub?.unsubscribe();
      const ctx = plugin.current;
      plugin.current = null;
      try {
        ctx?.dispose();
      } catch {
        // already disposed
      }
      canvas.remove();
    };
  }, []);

  // Style the canvas whenever the theme or motion preference changes.
  useEffect(() => {
    if (!ready || !plugin.current) return;
    void styleCanvas(plugin.current, mode, reduced, surface).catch(() => undefined);
  }, [ready, mode, reduced, surface]);

  // Load (or reload) the entry. Theme changes rebuild the representations.
  useEffect(() => {
    const ctx = plugin.current;
    if (!ready || !ctx) return;
    let cancelled = false;
    setStatus("loading");
    setDetail("");
    const highlights = JSON.parse(hlKey) as { chain: string; residue: number }[];
    loadEntry(ctx, pdbId, highlights, mode, reduced, () => cancelled)
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        setStatus("offline");
        setDetail(
          offline
            ? "This device looks offline; the structure loads from RCSB PDB or PDBe."
            : e instanceof LoadError && e.reason === "not-found"
              ? "Neither RCSB PDB nor PDBe has an entry with this ID."
              : e instanceof LoadError
                ? "RCSB PDB and PDBe could not be reached. Check the connection."
                : `The structure could not be drawn: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
    return () => {
      cancelled = true;
    };
    // `reduced` only changes the camera transition; not worth a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pdbId, hlKey, mode]);

  // Stop drawing off-screen.
  useEffect(() => {
    const c3d = plugin.current?.canvas3d;
    if (!c3d) return;
    if (inView) c3d.resume();
    else c3d.pause(true);
  }, [inView, ready]);

  const p = PALETTE[mode];
  const id = pdbId.toUpperCase();
  const shown = status === "ready";

  return (
    <div
      ref={host}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 240,
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <div
        ref={stage}
        style={{
          position: "absolute",
          inset: 0,
          opacity: shown ? 1 : 0,
          transition: reduced ? "none" : "opacity 700ms ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 14,
          fontFamily: MONO_FONT,
          fontSize: 11,
          letterSpacing: "0.04em",
          color: p.muted,
          pointerEvents: "none",
        }}
      >
        PDB {id}
      </div>
      {shown && hover && (
        <div
          style={{
            position: "absolute",
            left: 14,
            bottom: 12,
            right: 14,
            fontFamily: MONO_FONT,
            fontSize: 11,
            color: p.muted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
          }}
        >
          {hover}
        </div>
      )}
      {!shown && (
        <div
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
            textAlign: "center",
            fontFamily: SANS_FONT,
            fontSize: 13,
            lineHeight: 1.5,
            color: p.muted,
          }}
        >
          {status === "loading" && (
            <>
              <span
                aria-hidden="true"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `1.5px solid ${p.faint}`,
                  borderTopColor: p.accent,
                  animation: reduced ? undefined : "cx-pv-spin 1.1s linear infinite",
                }}
              />
              <span style={{ fontFamily: MONO_FONT, fontSize: 11.5 }}>Loading {id} from RCSB PDB…</span>
            </>
          )}
          {status === "offline" && (
            <>
              <span style={{ color: p.ink }}>Structure {id} is unavailable</span>
              <span style={{ maxWidth: 360 }}>{detail}</span>
            </>
          )}
          {status === "error" && (
            <>
              <span style={{ color: p.ink }}>3D view unavailable</span>
              <span style={{ maxWidth: 360 }}>{detail}</span>
            </>
          )}
        </div>
      )}
      <style>{`@keyframes cx-pv-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default ProteinViewer;
