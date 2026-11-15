// Reference data for the One Letter demo. Every value is cited; nothing here
// is a measurement.
//
// HBB coding sequence: NCBI RefSeq NM_000518.5, CDS 51..494 (checked against
// the NCBI fasta_cds_na record). The first 27 nucleotides are
// ATG GTG CAT CTG ACT CCT GAG GAG AAG. Legacy codon numbering excludes the
// initiator Met, so codon 6 is nucleotides 19-21 (GAG, Glu).
//
// Structures (PDBe entry metadata): 2HBS is deoxy sickle haemoglobin
// (2.05 A, beta Val6), 1A3N is deoxy human haemoglobin (1.8 A, beta Glu6).
// In both, entity 2 is the beta chain and label_seq_id 6 is author residue 6.

export const HBB_ACCESSION = 'NM_000518.5';
export const HBB_REF = 'ATGGTGCATCTGACTCCTGAGGAGAAG';
export const WINDOW_LEN = 9;

export interface WindowDef {
  window: number;
  /** 0-based start in HBB_REF. */
  start: number;
  /** 0-based exclusive end. */
  end: number;
  label: string;
}

export const WINDOWS: WindowDef[] = [1, 2, 3].map((w) => ({
  window: w,
  start: (w - 1) * WINDOW_LEN,
  end: w * WINDOW_LEN,
  label: `W${w} · nt ${(w - 1) * WINDOW_LEN + 1}-${w * WINDOW_LEN}`,
}));

/** Codon 6 (legacy numbering), 0-based exclusive range: nucleotides 19-21. */
export const CODON6 = { start: 18, end: 21 } as const;

export function windowDef(w: number): WindowDef | undefined {
  return WINDOWS.find((d) => d.window === w);
}

/** The reference bases for a window (HbA). */
export function referenceBases(w: number): string {
  const d = windowDef(w);
  return d ? HBB_REF.slice(d.start, d.end) : '';
}

export interface StructureInfo {
  pdbId: string;
  title: string;
  resolution: string;
  /** label_asym_id (struct_asym_id) of every beta chain. */
  betaChains: string[];
  /** Residue at beta 6 in this entry. */
  beta6: string;
}

export const STRUCTURES: Record<string, StructureInfo> = {
  '2HBS': {
    pdbId: '2HBS',
    title: 'Deoxy sickle haemoglobin',
    resolution: '2.05 Å',
    betaChains: ['B', 'D', 'F', 'H'],
    beta6: 'Val',
  },
  '1A3N': {
    pdbId: '1A3N',
    title: 'Deoxy human haemoglobin',
    resolution: '1.8 Å',
    betaChains: ['B', 'D'],
    beta6: 'Glu',
  },
};

export function structureInfo(pdbId: string | null | undefined): StructureInfo | null {
  if (!pdbId) return null;
  return STRUCTURES[pdbId.toUpperCase()] ?? null;
}
