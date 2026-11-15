// The curated claims the engine can check today: four claims from the DESeq2 paper.
// The ids are the question ids of the `claims.source` event (as in the engineering
// viewer's fixture, web/public/fixtures/demo_claims.jsonl), so a
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
    id: "claim-nb_variance",
    kind: "symbolic",
    meaning:
      "Under the negative binomial model, the variance of a count is μ + αμ² (mean μ, dispersion α).",
    check: "Symbolic derivation, then a simulation.",
    planted: false,
  },
  {
    id: "claim-wald_calibration",
    kind: "statistical",
    meaning:
      "With three replicates per condition, Wald test P values are calibrated: under the null, about 5% fall below 0.05.",
    check: "Simulation of null genes.",
    planted: false,
  },
  {
    id: "claim-bh_fdr",
    kind: "statistical",
    meaning:
      "Benjamini-Hochberg adjusted P values control the false discovery rate: among genes with padj < 0.1, at most about 10% are false on average.",
    check: "Simulation over many datasets.",
    planted: false,
  },
  {
    id: "claim-bh_fwer",
    kind: "statistical",
    meaning:
      "Calling genes with BH-adjusted P below 0.1 also keeps the family-wise error rate, the chance of any false positive, at 10%.",
    check: "Simulation that looks for a counterexample.",
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
