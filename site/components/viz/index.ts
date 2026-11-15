// Crux 3D views. The components are client components (each file starts
// with "use client") and never touch window at import time; heavy libraries
// (react-force-graph-3d, Mol*) load inside effects. Wrap them in
// next/dynamic with { ssr: false } where they sit above the fold.
//
// The pure modules (theme, graph, sequence) are safe in server components.

export { HeroScene, type HeroSceneProps } from "./HeroScene";
export { DNAHelix, type DNAHelixProps } from "./DNAHelix";
export { ProteinViewer, type ProteinViewerProps } from "./ProteinViewer";
export { EvidenceGraph3D, type EvidenceGraph3DProps } from "./EvidenceGraph3D";

export {
  buildGraph,
  parseEventLog,
  verdictOf,
  type RunEvent,
  type EvidenceGraph,
  type GraphNode,
  type GraphLink,
  type QuestionNode,
  type OptionNode,
  type DiagnosticNode,
  type ClaimsSource,
  type ClaimInfo,
  type Ticker,
} from "./graph";

export {
  PALETTE,
  VERDICT_LABEL,
  BASE_COLORS,
  BACKBONE_COLOR,
  PROTEIN_COLORS,
  MONO_FONT,
  SANS_FONT,
  MOTION,
  verdictColor,
  type ColorMode,
  type ModePalette,
  type Verdict,
  type Base,
} from "./theme";

export {
  HBB_ACCESSION,
  HBB_FIRST_27,
  SICKLE_HIGHLIGHT,
  describeHighlight,
  translateCodon,
  type Highlight,
  type HighlightInfo,
} from "./sequence";
