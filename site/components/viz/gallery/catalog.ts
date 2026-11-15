// What the Explore gallery shows. Pure data, safe in server components.
//
// Structures are wwPDB entries, fetched at run time from RCSB PDB; each fact
// was checked against the entry's own title, method and resolution on
// rcsb.org. Molecules are the PDB files from three.js's molecules example
// (copied to /public/molecules); each formula was checked against the atoms
// in the file and against the PubChem compound it links to.

import type { StructureAccent } from "./StructureView";

export interface StructureItem {
  kind: "structure";
  /** PDB id. */
  id: string;
  title: string;
  fact: string;
  /** Method and resolution, as deposited. */
  meta: string;
  accents?: StructureAccent[];
  /** Degrees to turn the opening view about the vertical. */
  turn?: number;
  /** What the drawing styles mean, in words. */
  legend: string;
}

export interface MoleculeItem {
  kind: "molecule";
  /** File name in /public/molecules, without the extension. */
  id: string;
  title: string;
  fact: string;
  /** Element symbol and count, in Hill order. */
  formula: [string, number][];
  /** PubChem compound id. */
  cid: number;
}

export type GalleryItem = StructureItem | MoleculeItem;

export function sourceOf(item: GalleryItem): { href: string; label: string } {
  return item.kind === "structure"
    ? { href: `https://www.rcsb.org/structure/${item.id}`, label: `RCSB PDB ${item.id}` }
    : { href: `https://pubchem.ncbi.nlm.nih.gov/compound/${item.cid}`, label: `PubChem CID ${item.cid}` };
}

export const GENOMICS: StructureItem[] = [
  {
    kind: "structure",
    id: "1BNA",
    title: "B-DNA, twelve base pairs",
    fact: "The Drew–Dickerson dodecamer, sequence CGCGAATTCGCG: a little over one turn of the double helix, from a crystal.",
    meta: "X-ray, 1.9 Å",
    // The crystal frame looks straight down the helix axis.
    turn: 90,
    legend: "Two strands, one darker than the other.",
  },
  {
    kind: "structure",
    id: "1YTB",
    title: "A protein that bends DNA",
    fact: "Yeast TATA-binding protein sits on the TATA box like a saddle and kinks the helix, an early step in reading a gene.",
    meta: "X-ray, 1.8 Å",
    legend: "DNA in oxide red with base rungs; protein as grey ribbon.",
  },
  {
    kind: "structure",
    id: "4OO8",
    title: "Cas9 with its guide RNA",
    fact: "Streptococcus pyogenes Cas9 holding a guide RNA paired with the target DNA strand it was sent to find.",
    meta: "X-ray, 2.5 Å",
    legend: "RNA and DNA in oxide red with base rungs; protein as grey ribbon.",
  },
];

export const PROTEINS: StructureItem[] = [
  {
    kind: "structure",
    id: "4HHB",
    title: "Haemoglobin",
    fact: "Human deoxyhaemoglobin: two alpha and two beta chains, each holding one haem group.",
    meta: "X-ray, 1.74 Å",
    accents: [{ comps: ["HEM"], tone: "refuted" }],
    legend: "Haem groups as red sticks; chains as grey ribbon.",
  },
  {
    kind: "structure",
    id: "1EMA",
    title: "Green fluorescent protein",
    fact: "From the jellyfish Aequorea victoria: an eleven-strand barrel around the chromophore that gives off the light.",
    meta: "X-ray, 1.9 Å",
    accents: [{ comps: ["CRO"], tone: "holds" }],
    legend: "Chromophore as green sticks inside the barrel.",
  },
  {
    kind: "structure",
    id: "4INS",
    title: "Insulin",
    fact: "Pig insulin crystallised with zinc. Two molecules are shown, each made of an A chain and a B chain.",
    meta: "X-ray, 1.5 Å",
    accents: [{ comps: ["ZN"], tone: "conditional", as: "spheres" }],
    legend: "Zinc ions as ochre spheres.",
  },
  {
    kind: "structure",
    id: "6VXX",
    title: "SARS-CoV-2 spike",
    fact: "The spike glycoprotein in its closed state: three identical chains, 1,281 residues each in the deposited model.",
    meta: "Cryo-EM, 2.8 Å",
    legend: "Three chains as grey ribbon; sugars as thin sticks.",
  },
];

/** The one "assay" scene: a drug in its binding site. */
export const DRUG_COMPLEX: StructureItem = {
  kind: "structure",
  id: "1HSG",
  title: "A drug in its pocket",
  fact: "HIV protease, a pair of identical 99-residue chains, closed around the inhibitor L-735,524, which became the medicine indinavir.",
  meta: "X-ray, 2.0 Å",
  accents: [{ comps: ["MK1"], tone: "unresolved" }],
  legend: "Inhibitor as amber ball-and-stick; protease as grey ribbon.",
};

export const MOLECULES: MoleculeItem[] = [
  {
    kind: "molecule",
    id: "caffeine",
    title: "Caffeine",
    fact: "A purine carrying three methyl groups; the stimulant in coffee and tea.",
    formula: [["C", 8], ["H", 10], ["N", 4], ["O", 2]],
    cid: 2519,
  },
  {
    kind: "molecule",
    id: "aspirin",
    title: "Aspirin",
    fact: "Acetylsalicylic acid: a benzene ring with an acid group and an acetyl ester side by side.",
    formula: [["C", 9], ["H", 8], ["O", 4]],
    cid: 2244,
  },
  {
    kind: "molecule",
    id: "glucose",
    title: "Glucose",
    fact: "A six-carbon sugar, shown closed into its ring form.",
    formula: [["C", 6], ["H", 12], ["O", 6]],
    cid: 5793,
  },
  {
    kind: "molecule",
    id: "nicotine",
    title: "Nicotine",
    fact: "Two rings joined by one bond: a pyridine and a methylated pyrrolidine.",
    formula: [["C", 10], ["H", 14], ["N", 2]],
    cid: 89594,
  },
  {
    kind: "molecule",
    id: "cholesterol",
    title: "Cholesterol",
    fact: "Four fused rings and a hydrocarbon tail, with a single hydroxyl group at the far end.",
    formula: [["C", 27], ["H", 46], ["O", 1]],
    cid: 5997,
  },
  {
    kind: "molecule",
    id: "ethanol",
    title: "Ethanol",
    fact: "Two carbons and a hydroxyl group: the alcohol in drinks.",
    formula: [["C", 2], ["H", 6], ["O", 1]],
    cid: 702,
  },
  {
    kind: "molecule",
    id: "cubane",
    title: "Cubane",
    fact: "Eight carbons at the corners of a cube, each with one hydrogen. First made in 1964.",
    formula: [["C", 8], ["H", 8]],
    cid: 136090,
  },
  {
    kind: "molecule",
    id: "buckyball",
    title: "Buckminsterfullerene",
    fact: "Sixty carbons closed into a cage of 12 pentagons and 20 hexagons.",
    formula: [["C", 60]],
    cid: 123591,
  },
  {
    kind: "molecule",
    id: "graphite",
    title: "Graphite",
    fact: "Flat sheets of carbon hexagons, stacked. A 200-atom fragment of the crystal is shown.",
    formula: [["C", 200]],
    cid: 5462310,
  },
];
