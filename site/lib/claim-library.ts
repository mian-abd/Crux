// The curated claims the engine can check today: four claims from the DESeq2 paper.
// The ids are the question ids the claims lab sends in its `claims.source` event
// (labs/claims; see runs/demo/claims_deseq2.jsonl), so a
// claim extracted from an uploaded paper can be matched to a check that exists.
//
// Keep this list in step with the claims lab. Three claims read the paper; the fourth
// is a false claim planted to test the engine.

export type ExtractedKind = "symbolic" | "statistical" | "empirical";

export interface LibraryClaim {
  id: string;
  kind: "symbolic" | "statistical";
  /** What the claim says, in words a model can match by meaning. */
  meaning: string;
  /** How the engine checks it. */
  check: string;
  planted: boolean;
}

export const LIBRARY_PAPER = {
  title: "Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2",
  authors: "Love MI, Huber W, Anders S",
  venue: "Genome Biology 15, 550 (2014)",
  url: "https://doi.org/10.1186/s13059-014-0550-8",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
} as const;

export const CLAIM_LIBRARY: readonly LibraryClaim[] = [
  {
    id: "claim-nb-variance",
    kind: "symbolic",
    meaning:
      "A negative binomial count with mean μ and dispersion α has variance μ + αμ².",
    check: "Symbolic derivation with SymPy, then a Monte Carlo check.",
    planted: false,
  },
  {
    id: "claim-wald-calibration",
    kind: "statistical",
    meaning:
      "With 3 replicates per group, Wald-test p-values from the negative binomial GLM are calibrated under the null.",
    check: "Simulation of null genes.",
    planted: false,
  },
  {
    id: "claim-bh-fdr",
    kind: "statistical",
    meaning:
      "Benjamini–Hochberg adjusted p-values below α control the false discovery rate at α (independent tests).",
    check: "Simulation, then a search for a setting that breaks it.",
    planted: false,
  },
  {
    id: "claim-bh-fwer",
    kind: "statistical",
    meaning:
      "Benjamini–Hochberg adjustment controls the family-wise error rate at α.",
    check: "Simulation, then a search for a counterexample.",
    planted: true,
  },
] as const;

export const LIBRARY_IDS: readonly string[] = CLAIM_LIBRARY.map((c) => c.id);

export function libraryClaim(id: string | null | undefined): LibraryClaim | null {
  if (!id) return null;
  return CLAIM_LIBRARY.find((c) => c.id === id) ?? null;
}

/** Why a claim cannot be checked yet. Fixed wording, so nothing is made up per claim. */
export function notCheckableReason(kind: ExtractedKind): string {
  if (kind === "empirical") {
    return "Empirical: checking it needs the study's data. The claims audit only runs derivations and simulations so far.";
  }
  if (kind === "statistical") {
    return "Statistical, but not one of the four curated claims. No simulation has been written for it yet.";
  }
  return "Symbolic, but not one of the four curated claims. No derivation has been written for it yet.";
}
