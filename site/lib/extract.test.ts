import { describe, expect, it } from "vitest";

import { CLAIM_LIBRARY, LIBRARY_IDS, notCheckableReason } from "./claim-library";
import { EXTRACTION_SCHEMA, MAX_CLAIMS, MAX_PAPER_CHARS, NO_MATCH, clipPaperText, extractionMessages, normalizeExtraction } from "./extract";

const PAPER = "We model counts as negative binomial.\nThe variance of a count is  mu + alpha mu^2. We saw 312 genes change.";

describe("claim extraction", () => {
  it("keeps a library match only for a known id on a non-empirical claim", () => {
    const out = normalizeExtraction(
      {
        title: " A paper ",
        claims: [
          { claim: "Variance is mu + alpha mu^2", quote: "the variance of a count is mu + alpha mu^2", kind: "symbolic", library_id: "claim-nb-variance" },
          { claim: "Made-up match", quote: "x", kind: "statistical", library_id: "claim-not-in-library" },
          { claim: "312 genes changed", quote: "We saw 312 genes change.", kind: "empirical", library_id: "claim-bh-fdr" },
          { claim: "No match", quote: "", kind: "symbolic", library_id: NO_MATCH },
        ],
      },
      PAPER,
    );
    expect(out.title).toBe("A paper");
    expect(out.claims.map((c) => c.libraryId)).toEqual(["claim-nb-variance", null, null, null]);
  });

  it("checks each quote against the paper, ignoring case and whitespace", () => {
    const out = normalizeExtraction(
      {
        claims: [
          { claim: "a", quote: "The variance of a count is mu + alpha mu^2.", kind: "symbolic", library_id: NO_MATCH },
          { claim: "b", quote: "The variance is constant.", kind: "symbolic", library_id: NO_MATCH },
          { claim: "c", quote: "", kind: "symbolic", library_id: NO_MATCH },
        ],
      },
      PAPER,
    );
    expect(out.claims.map((c) => c.quoteFound)).toEqual([true, false, false]);
  });

  it("survives a malformed reply", () => {
    expect(normalizeExtraction(null, PAPER)).toEqual({ title: "", claims: [] });
    expect(normalizeExtraction({ claims: "nope" }, PAPER).claims).toEqual([]);
    const out = normalizeExtraction({ claims: [null, 3, { claim: "  " }, { claim: "kept", kind: "weird" }] }, PAPER);
    expect(out.claims).toHaveLength(1);
    expect(out.claims[0]).toMatchObject({ claim: "kept", kind: "empirical", libraryId: null, quoteFound: false });
  });

  it("caps the number of claims and the text sent", () => {
    const many = Array.from({ length: MAX_CLAIMS + 10 }, (_, i) => ({ claim: `c${i}`, quote: "", kind: "empirical", library_id: NO_MATCH }));
    expect(normalizeExtraction({ claims: many }, PAPER).claims).toHaveLength(MAX_CLAIMS);
    const long = "x".repeat(MAX_PAPER_CHARS + 5);
    expect(clipPaperText(long)).toEqual({ text: "x".repeat(MAX_PAPER_CHARS), truncated: true });
    expect(clipPaperText(PAPER).truncated).toBe(false);
  });

  it("offers the model exactly the library ids plus 'none'", () => {
    expect(EXTRACTION_SCHEMA.schema.properties.claims.items.properties.library_id.enum).toEqual([...LIBRARY_IDS, NO_MATCH]);
    const system = extractionMessages(PAPER)[0].content;
    for (const c of CLAIM_LIBRARY) expect(system).toContain(c.id);
    expect(extractionMessages(PAPER)[1].content).toContain(PAPER);
  });

  it("has four curated claims, one of them planted, and a reason for every other kind", () => {
    expect(CLAIM_LIBRARY).toHaveLength(4);
    expect(CLAIM_LIBRARY.filter((c) => c.planted)).toHaveLength(1);
    for (const kind of ["symbolic", "statistical", "empirical"] as const) {
      expect(notCheckableReason(kind).length).toBeGreaterThan(20);
    }
  });
});
