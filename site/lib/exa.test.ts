import { describe, expect, it } from "vitest";

import { EXA_RESULTS, claimQuery, parseExaResults } from "./exa";

describe("claimQuery", () => {
  it("collapses whitespace and trims long claims", () => {
    expect(claimQuery("  The variance\n is  μ + αμ².  ")).toBe("The variance is μ + αμ².");
    const long = "x".repeat(600);
    const q = claimQuery(long);
    expect(q.length).toBe(400);
    expect(q.endsWith("…")).toBe(true);
  });
});

describe("parseExaResults", () => {
  it("keeps titled https results with their first highlight and date", () => {
    const out = parseExaResults(
      {
        results: [
          {
            title: "DESeq2 vignette",
            url: "https://bioconductor.org/packages/DESeq2",
            publishedDate: "2024-05-01T00:00:00.000Z",
            highlights: ["Independent filtering is applied by results()."],
          },
          { title: "No URL" },
          { url: "ftp://example.org/file" },
        ],
        costDollars: { total: 0.006 },
      },
      "q",
    );
    expect(out.sources).toEqual([
      {
        title: "DESeq2 vignette",
        url: "https://bioconductor.org/packages/DESeq2",
        published: "2024-05-01",
        highlight: "Independent filtering is applied by results().",
      },
    ]);
    expect(out.costUsd).toBe(0.006);
    expect(out.query).toBe("q");
  });

  it("falls back to the hostname and text, caps the count, and tolerates junk", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ url: `https://site${i}.org/a`, text: "body text" }));
    const out = parseExaResults({ results: many }, "q");
    expect(out.sources).toHaveLength(EXA_RESULTS);
    expect(out.sources[0]).toMatchObject({ title: "site0.org", highlight: "body text", published: null });
    expect(out.costUsd).toBeNull();
    expect(parseExaResults(null, "q").sources).toEqual([]);
    expect(parseExaResults({ results: "nope" }, "q").sources).toEqual([]);
  });
});
