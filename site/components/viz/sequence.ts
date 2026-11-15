// Sequence facts and the procedural B-DNA layout shared by HeroScene and
// DNAHelix. Pure functions, no three.js.
//
// HBB coding sequence: NCBI RefSeq NM_000518.5, CDS 51..494 (the same values
// as web/src/lib/hbb.ts). The first 27 nucleotides are
// ATG GTG CAT CTG ACT CCT GAG GAG AAG. Legacy codon numbering excludes the
// initiator Met, so codon 6 is nucleotides 19-21 (GAG, Glu). Sickle cell
// haemoglobin (HbS) is c.20A>T: codon 6 GAG becomes GTG (Glu to Val).

export const HBB_ACCESSION = "NM_000518.5";
export const HBB_FIRST_27 = "ATGGTGCATCTGACTCCTGAGGAGAAG";

export interface Highlight {
  /** 0-based nucleotide index into the sequence. */
  index: number;
  /** Reference base (one letter) or codon (three letters starting at index). */
  from: string;
  /** Variant base or codon. */
  to: string;
}

/** HbS: nucleotide 20 (0-based 19), A to T, so codon 6 GAG becomes GTG. */
export const SICKLE_HIGHLIGHT: Highlight = { index: 19, from: "A", to: "T" };

const COMPLEMENT: Record<string, string> = { A: "T", T: "A", G: "C", C: "G", U: "A", N: "N" };

export function complement(base: string): string {
  return COMPLEMENT[base.toUpperCase()] ?? "N";
}

/** Upper-case, U to T, drop anything that is not a base. */
export function cleanSequence(seq: string): string {
  return seq
    .toUpperCase()
    .replace(/U/g, "T")
    .replace(/[^ACGTN]/g, "");
}

// Standard genetic code, three-letter amino acid names.
const AA: Record<string, string> = {};
(() => {
  const bases = "TCAG";
  const aa =
    "Phe Phe Leu Leu Ser Ser Ser Ser Tyr Tyr Stop Stop Cys Cys Stop Trp " +
    "Leu Leu Leu Leu Pro Pro Pro Pro His His Gln Gln Arg Arg Arg Arg " +
    "Ile Ile Ile Met Thr Thr Thr Thr Asn Asn Lys Lys Ser Ser Arg Arg " +
    "Val Val Val Val Ala Ala Ala Ala Asp Asp Glu Glu Gly Gly Gly Gly";
  const names = aa.split(" ");
  let i = 0;
  for (const a of bases) for (const b of bases) for (const c of bases) AA[a + b + c] = names[i++] ?? "?";
})();

export function translateCodon(codon: string): string {
  return AA[codon.toUpperCase()] ?? "?";
}

export interface HighlightInfo {
  /** Every nucleotide index that changes. */
  indices: number[];
  /** Legacy codon number (initiator Met is codon 0). */
  codon: number;
  fromCodon: string;
  toCodon: string;
  fromAA: string;
  toAA: string;
  /** "codon 6: GAG → GTG" */
  label: string;
  /** "Glu → Val · c.20A>T" */
  detail: string;
}

/**
 * Describe a highlight against the sequence. Codon numbers follow the legacy
 * HBB convention (the initiator ATG is codon 0), which is how codon 6 is named.
 */
export function describeHighlight(seq: string, h: Highlight): HighlightInfo {
  const s = cleanSequence(seq);
  const from = h.from.toUpperCase();
  const to = h.to.toUpperCase();
  const codon = Math.floor(h.index / 3);
  const codonStart = codon * 3;
  let fromCodon: string;
  let toCodon: string;
  const indices: number[] = [];
  if (from.length >= 3) {
    fromCodon = from.slice(0, 3);
    toCodon = to.slice(0, 3);
    for (let k = 0; k < 3; k++) if (fromCodon[k] !== toCodon[k]) indices.push(h.index + k);
    if (indices.length === 0) indices.push(h.index);
  } else {
    fromCodon = s.slice(codonStart, codonStart + 3);
    const offset = h.index - codonStart;
    toCodon = fromCodon.slice(0, offset) + (to[0] ?? "N") + fromCodon.slice(offset + 1);
    indices.push(h.index);
  }
  const fromAA = translateCodon(fromCodon);
  const toAA = translateCodon(toCodon);
  const hgvs = from.length === 1 && to.length === 1 ? ` · c.${h.index + 1}${from}>${to}` : "";
  return {
    indices,
    codon,
    fromCodon,
    toCodon,
    fromAA,
    toAA,
    label: `codon ${codon}: ${fromCodon} → ${toCodon}`,
    detail: `${fromAA} → ${toAA}${hgvs}`,
  };
}

/* ------------------------------------------------------------------ */
/* B-DNA layout                                                        */
/* ------------------------------------------------------------------ */

export interface HelixParams {
  /** Backbone radius (scene units). */
  radius: number;
  /** Rise per base pair along the axis. B-DNA: 3.4 Å against a 10 Å radius. */
  rise: number;
  /** Base pairs per turn. B-DNA: about 10.5. */
  bpPerTurn: number;
  /**
   * Angle between the two backbones at one base pair. Below 180° the helix
   * shows a major and a minor groove, as real B-DNA does.
   */
  strandOffset: number;
}

export const B_DNA: HelixParams = {
  radius: 1,
  rise: 0.34,
  bpPerTurn: 10.5,
  strandOffset: (150 * Math.PI) / 180,
};

export type Vec3 = [number, number, number];

export interface HelixPair {
  index: number;
  /** Base on the given (5'→3') strand. */
  base: string;
  /** Watson-Crick partner on the antiparallel strand. */
  partner: string;
  /** Backbone positions of the two strands. */
  p0: Vec3;
  p1: Vec3;
  /** Where the two bases meet. */
  mid: Vec3;
  /** Angle of strand 0 around the axis. */
  angle: number;
}

export interface HelixLayout {
  pairs: HelixPair[];
  /** Length along the axis (x). */
  length: number;
  params: HelixParams;
}

/** Lay a sequence out as a B-DNA double helix along the x axis, centred on 0. */
export function layoutHelix(seq: string, params: HelixParams = B_DNA): HelixLayout {
  const s = cleanSequence(seq);
  const n = s.length;
  const { radius: r, rise, bpPerTurn, strandOffset } = params;
  const twist = (2 * Math.PI) / bpPerTurn;
  const pairs: HelixPair[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * rise;
    const a0 = i * twist;
    const a1 = a0 + strandOffset;
    const p0: Vec3 = [x, r * Math.cos(a0), r * Math.sin(a0)];
    const p1: Vec3 = [x, r * Math.cos(a1), r * Math.sin(a1)];
    const base = s[i] ?? "N";
    pairs.push({
      index: i,
      base,
      partner: complement(base),
      p0,
      p1,
      mid: [x, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2],
      angle: a0,
    });
  }
  return { pairs, length: Math.max(0, n - 1) * rise, params };
}
