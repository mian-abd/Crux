// Shared colours and constants for the Crux 3D views. Pure data: safe to
// import from server components.
//
// The values are the site's design tokens (site/app/globals.css: --brand,
// --v-holds, --v-refuted, --v-cond, --v-unresolved, --v-open and the
// surfaces) converted from oklch to sRGB hex, because three.js and Mol* take
// hex. One accent (oxide red) and four status colours. Status is never
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
    accent: "#dd8461",
    holds: "#79bd8c",
    refuted: "#e28061",
    conditional: "#e1ad63",
    unresolved: "#c6b68c",
    neutral: "#a8a49e",
    background: "#110f0d",
    surface: "#191715",
    ink: "#f0eeeb",
    muted: "#a8a49e",
    faint: "#302d2b",
  },
  light: {
    accent: "#a5492b",
    holds: "#377249",
    refuted: "#aa4429",
    conditional: "#a06a20",
    unresolved: "#94855c",
    neutral: "#75716b",
    background: "#f7f6f3",
    surface: "#fefdfc",
    ink: "#1b1916",
    muted: "#67635d",
    faint: "#e2dfda",
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

/** Nucleotide colours: muted, kept off the accent's red, never louder than it. */
export type Base = "A" | "C" | "G" | "T";

export const BASE_COLORS: Record<ColorMode, Record<Base, string>> = {
  dark: { A: "#8cbfa0", T: "#d0b07f", G: "#c99393", C: "#b8ab9a" },
  light: { A: "#4f8a68", T: "#9a7740", G: "#a85f5f", C: "#6f655a" },
};

/** Sugar-phosphate backbone. */
export const BACKBONE_COLOR: Record<ColorMode, string> = {
  dark: "#c9c4bc",
  light: "#67635d",
};

/** Muted cartoon colours for protein chains (alpha-like, beta-like). */
export const PROTEIN_COLORS: Record<ColorMode, { chainA: string; chainB: string; ligand: string }> = {
  dark: { chainA: "#958f87", chainB: "#b3ada4", ligand: "#a08a6c" },
  light: { chainA: "#b0aaa1", chainB: "#cfc9c0", ligand: "#9a7f60" },
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
