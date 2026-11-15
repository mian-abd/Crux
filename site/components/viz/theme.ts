// Shared colours and constants for the Crux 3D views. Pure data: safe to
// import from server components.
//
// The values are the site's design tokens (site/app/globals.css: --brand,
// --v-holds, --v-refuted, --v-cond, --v-unresolved, --v-open and the
// surfaces) converted from oklch to sRGB hex, because three.js and Mol* take
// hex. One accent (the brand blue) and four status colours. Status is never
// carried by colour alone; every view pairs it with a label or tooltip text.

export type ColorMode = "light" | "dark";

export interface ModePalette {
  /** The single interface accent. */
  accent: string;
  /** A claim or option that survived testing. */
  holds: string;
  /** Refuted: answer keys fails, alt_param, fails_conservative. */
  refuted: string;
  /** Holds under a condition: answer key holds_if. */
  conditional: string;
  /** A question that ended without a winner. */
  unresolved: string;
  /** Untested or null options, inactive diagnostics. */
  neutral: string;
  /** Page background the views are designed against. */
  background: string;
  /** Raised surface (cards, panels). */
  surface: string;
  /** Primary text and strokes. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Hairlines, inactive links. */
  faint: string;
}

export const PALETTE: Record<ColorMode, ModePalette> = {
  dark: {
    accent: "#83b3fa",
    holds: "#65c98c",
    refuted: "#fc7a75",
    conditional: "#bd9ff2",
    unresolved: "#ebb353",
    neutral: "#a1a5ab",
    background: "#0a0c10",
    surface: "#121418",
    ink: "#efeeeb",
    muted: "#a1a5ab",
    faint: "#33373d",
  },
  light: {
    accent: "#1f53b8",
    holds: "#0b7643",
    refuted: "#c22826",
    conditional: "#724aab",
    unresolved: "#a46400",
    neutral: "#656970",
    background: "#fbfbf8",
    surface: "#ffffff",
    ink: "#15181e",
    muted: "#575b62",
    faint: "#cfd1d4",
  },
};

/** Status of an option derived from its answer key. */
export type Verdict = "holds" | "refuted" | "conditional";

export const VERDICT_LABEL: Record<Verdict, string> = {
  holds: "Holds",
  refuted: "Refuted",
  conditional: "Holds if",
};

export function verdictColor(verdict: Verdict | null, mode: ColorMode): string {
  const p = PALETTE[mode];
  if (verdict === "holds") return p.holds;
  if (verdict === "refuted") return p.refuted;
  if (verdict === "conditional") return p.conditional;
  return p.neutral;
}

/** Nucleotide colours: muted, kept off the accent's blue, never louder than it. */
export type Base = "A" | "C" | "G" | "T";

export const BASE_COLORS: Record<ColorMode, Record<Base, string>> = {
  dark: { A: "#8cbfa0", T: "#d0b07f", G: "#c99393", C: "#a99ccb" },
  light: { A: "#4f8a68", T: "#9a7740", G: "#a85f5f", C: "#6d64a6" },
};

/** Sugar-phosphate backbone. */
export const BACKBONE_COLOR: Record<ColorMode, string> = {
  dark: "#c4cad3",
  light: "#5f6772",
};

/** Muted cartoon colours for protein chains (alpha-like, beta-like). */
export const PROTEIN_COLORS: Record<ColorMode, { chainA: string; chainB: string; ligand: string }> = {
  dark: { chainA: "#838d9a", chainB: "#a3acb8", ligand: "#a08a6c" },
  light: { chainA: "#a9b1bc", chainB: "#c9ced5", ligand: "#9a7f60" },
};

/** Monospace stack used for labels inside the views. */
export const MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/** Sans stack used for labels inside the views. */
export const SANS_FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Motion constants, shared so the views move at one calm tempo. */
export const MOTION = {
  /** Hero helix spin about its own axis. */
  heroSpin: 0.07,
  /** Interactive helix spin about its own axis. */
  helixSpin: 0.22,
  /** Seconds of idle time before the interactive helix resumes spinning. */
  resumeAfterIdleS: 8,
  /** Evidence graph camera orbit, OrbitControls autoRotateSpeed units. */
  graphOrbit: 0.35,
  /** Diagnostic pulse duration, seconds. */
  pulseS: 1.4,
} as const;
