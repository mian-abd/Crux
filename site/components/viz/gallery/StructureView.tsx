"use client";

// A PDB entry for the gallery, drawn by Mol* (MIT) with no Mol* interface:
// the headless setup of ../ProteinViewer, generalised. Protein chains are a
// muted cartoon, nucleic acids are drawn in the site accent, and named
// components (a bound drug, a chromophore, haem, zinc) are picked out as
// ball-and-stick or spheres in one of the site's status colours. The entry
// is fetched at run time from RCSB PDB, with PDBe as the fallback.

import { useEffect, useRef, useState } from "react";
import type { PluginContext } from "molstar/lib/mol-plugin/context";
import { LoadError, fetchEntry, hexToInt, styleCanvas } from "../ProteinViewer";
import { useColorMode, useInView, useReducedMotion, useSurfaceColor } from "../hooks";
import { MONO_FONT, PALETTE, PROTEIN_COLORS, SANS_FONT, type ColorMode, type ModePalette } from "../theme";

export type StructureTone = "accent" | "holds" | "refuted" | "conditional" | "unresolved";

export interface StructureAccent {
  /** Chemical component ids (label_comp_id), e.g. ["MK1"] or ["HEM"]. */
  comps: string[];
  tone: StructureTone;
  /** "sticks" is ball-and-stick; "spheres" is space-filling (ions). */
  as?: "sticks" | "spheres";
}

export interface StructureViewProps {
  pdbId: string;
  accents?: StructureAccent[];
  /** Turn the opening view about the vertical, in degrees (a helix that would open end-on). */
  turn?: number;
  /** Called once the entry is drawn. */
  onReady?: () => void;
  className?: string;
}

type Status = "loading" | "ready" | "offline" | "error";

/** Cartoon colours for protein chains: warm greys, so the accents carry the story. */
const CHAIN_COLORS: Record<ColorMode, string[]> = {
  dark: ["#9d978f", "#bdb7ae", "#8a847c", "#aaa49c"],
  light: ["#a7a198", "#c9c3ba", "#958f86", "#b8b2a9"],
};

/** Nucleic acid strands: the accent and a quieter second strand. */
const STRAND_COLORS: Record<ColorMode, string[]> = {
  dark: ["#dd8461", "#efc3ad"],
  light: ["#a5492b", "#cf8f74"],
};

function tone(p: ModePalette, t: StructureTone): string {
  return t === "accent" ? p.accent : p[t];
}

async function drawEntry(
  plugin: PluginContext,
  pdbId: string,
  accents: StructureAccent[],
  mode: ColorMode,
  turn: number,
  isCancelled: () => boolean,
): Promise<void> {
  const [{ Color }, { MolScriptBuilder: MS }] = await Promise.all([
    import("molstar/lib/mol-util/color"),
    import("molstar/lib/mol-script/language/builder"),
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
  // The deposited model, as in ProteinViewer.
  const structure = await plugin.builders.structure.createStructure(model, { name: "model", params: {} });
  const p = PALETTE[mode];
  const repr = plugin.builders.structure.representation;
  const list = (hexes: string[]) => ({
    palette: {
      name: "colors" as const,
      params: { list: { kind: "set" as const, colors: hexes.map((h) => Color(hexToInt(h))) } },
    },
  });

  const protein = await plugin.builders.structure.tryCreateComponentStatic(structure, "protein");
  if (protein) {
    await repr.addRepresentation(protein, {
      type: "cartoon",
      color: "chain-id",
      colorParams: list(CHAIN_COLORS[mode]),
    });
  }
  const nucleic = await plugin.builders.structure.tryCreateComponentStatic(structure, "nucleic");
  if (nucleic) {
    await repr.addRepresentation(nucleic, {
      type: "cartoon",
      color: "chain-id",
      colorParams: list(STRAND_COLORS[mode]),
    });
  }
  // Everything else that is not water: quiet sticks, unless an accent names it below.
  for (const kind of ["ligand", "branched"] as const) {
    const rest = await plugin.builders.structure.tryCreateComponentStatic(structure, kind);
    if (rest) {
      await repr.addRepresentation(rest, {
        type: "ball-and-stick",
        color: "uniform",
        colorParams: { value: Color(hexToInt(PROTEIN_COLORS[mode].ligand)) },
        typeParams: { sizeFactor: 0.16 },
      });
    }
  }

  for (const [n, accent] of accents.entries()) {
    const groups = accent.comps.map((comp) =>
      MS.struct.generator.atomGroups({
        "residue-test": MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_comp_id(), comp]),
      }),
    );
    const expression = groups.length === 1 ? groups[0]! : MS.struct.combinator.merge(groups);
    const part = await plugin.builders.structure.tryCreateComponentFromExpression(
      structure,
      expression,
      `cx-accent-${n}`,
      { label: accent.comps.join(", ") },
    );
    if (!part) continue;
    const value = Color(hexToInt(tone(p, accent.tone)));
    if (accent.as === "spheres") {
      await repr.addRepresentation(part, { type: "spacefill", color: "uniform", colorParams: { value } });
    } else {
      await repr.addRepresentation(part, {
        type: "ball-and-stick",
        color: "uniform",
        colorParams: { value },
        typeParams: { sizeFactor: 0.34 },
      });
    }
  }
  const camera = plugin.canvas3d?.camera;
  const whole = structure.cell?.obj?.data;
  if (!turn || !camera || !whole) {
    plugin.managers.camera.reset(undefined, 0);
    return;
  }
  // Frame the whole model, then move the eye about the up axis through the
  // target (Rodrigues' formula). A queued reset would overwrite this, so the
  // focus is computed here instead.
  const { center, radius } = whole.boundary.sphere;
  const snap = camera.getFocus(center, radius);
  const eye = snap.position ?? camera.state.position;
  const up = snap.up ?? camera.state.up;
  const ul = Math.hypot(up[0], up[1], up[2]) || 1;
  const k = [up[0] / ul, up[1] / ul, up[2] / ul] as const;
  const v = [eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]] as const;
  const a = (turn * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cross = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]] as const;
  const position = eye.slice() as typeof eye;
  for (let n = 0; n < 3; n++) {
    position[n] = center[n]! + v[n]! * c + cross[n]! * sn + k[n]! * dot * (1 - c);
  }
  plugin.managers.camera.setSnapshot({ ...snap, position }, 0);
}

export function StructureView({ pdbId, accents, turn = 0, onReady, className }: StructureViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const plugin = useRef<PluginContext | null>(null);
  const readyCb = useRef(onReady);
  const mode = useColorMode();
  const reduced = useReducedMotion();
  const inView = useInView(host);
  const surface = useSurfaceColor(host, mode);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState("");
  const accentKey = JSON.stringify(accents ?? []);

  useEffect(() => {
    readyCb.current = onReady;
  }, [onReady]);

  // One plugin per mount, on a fresh canvas (a canvas whose context was lost
  // on dispose cannot host a new one).
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    const el = stage.current;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;outline:none";
    el?.appendChild(canvas);
    // Mol* zooms on the wheel and swallows the event. Stop it before it gets
    // there, so the page keeps scrolling under the pointer.
    const passWheel = (e: Event) => e.stopPropagation();
    el?.addEventListener("wheel", passWheel, { capture: true });
    // Dragging is for mouse and pen; on touch a swipe scrolls the page.
    const fine = window.matchMedia?.("(pointer: fine)").matches ?? true;
    if (el) el.style.pointerEvents = fine ? "auto" : "none";
    (async () => {
      const [{ PluginContext: Ctx }, { DefaultPluginSpec }, { PluginConfig }] = await Promise.all([
        import("molstar/lib/mol-plugin/context"),
        import("molstar/lib/mol-plugin/spec"),
        import("molstar/lib/mol-plugin/config"),
      ]);
      if (disposed || !el) return;
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
      const ok = await ctx.initViewerAsync(canvas, el);
      if (!ok) throw new Error("WebGL is not available in this browser");
      if (disposed) {
        ctx.dispose();
        return;
      }
      plugin.current = ctx;
      ro = new ResizeObserver(() => ctx.handleResize());
      ro.observe(el);
      setReady(true);
    })().catch((e: unknown) => {
      if (disposed) return;
      setStatus("error");
      setDetail(e instanceof Error ? e.message : String(e));
    });
    return () => {
      disposed = true;
      ro?.disconnect();
      el?.removeEventListener("wheel", passWheel, { capture: true });
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

  // The shared canvas look, then a slow turn in place of ProteinViewer's rock.
  useEffect(() => {
    const ctx = plugin.current;
    if (!ready || !ctx) return;
    let cancelled = false;
    (async () => {
      await styleCanvas(ctx, mode, reduced, surface);
      if (cancelled || reduced) return;
      const { Vec3 } = await import("molstar/lib/mol-math/linear-algebra");
      if (cancelled) return;
      ctx.canvas3d?.setProps({
        trackball: { animate: { name: "spin", params: { speed: 0.22, axis: Vec3.create(0, -1, 0) } } },
      });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, mode, reduced, surface]);

  // Load (or reload) the entry. Theme changes rebuild the representations.
  useEffect(() => {
    const ctx = plugin.current;
    if (!ready || !ctx) return;
    let cancelled = false;
    setStatus("loading");
    setDetail("");
    drawEntry(ctx, pdbId, JSON.parse(accentKey) as StructureAccent[], mode, turn, () => cancelled)
      .then(() => {
        if (cancelled) return;
        setStatus("ready");
        readyCb.current?.();
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
  }, [ready, pdbId, accentKey, mode, turn]);

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
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      <div
        ref={stage}
        style={{
          position: "absolute",
          inset: 0,
          opacity: shown ? 1 : 0,
          transition: reduced ? "none" : "opacity 500ms ease",
          cursor: "grab",
        }}
      />
      {(status === "offline" || status === "error") && (
        <div
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 20,
            textAlign: "center",
            fontFamily: SANS_FONT,
            fontSize: 13,
            lineHeight: 1.5,
            color: p.muted,
            background: surface,
          }}
        >
          <span style={{ color: p.ink }}>
            {status === "offline" ? `Structure ${id} is unavailable` : "3D view unavailable"}
          </span>
          <span style={{ maxWidth: 320 }}>{detail}</span>
        </div>
      )}
      {status === "loading" && (
        <span
          role="status"
          style={{
            position: "absolute",
            left: 12,
            bottom: 10,
            fontFamily: MONO_FONT,
            fontSize: 11,
            color: p.muted,
            pointerEvents: "none",
          }}
        >
          Loading {id} from RCSB PDB…
        </span>
      )}
    </div>
  );
}

export default StructureView;
