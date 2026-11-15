// Pure helpers for finding sources for a paper's claim with Exa. The network call is in
// lib/server/exa.ts; these are separate so they can be tested without a key.

export interface ClaimSource {
  title: string;
  url: string;
  published: string | null;
  highlight: string | null;
}

export interface ClaimSourcesResult {
  query: string;
  sources: ClaimSource[];
  /** Exa's own cost report for the request, when it sends one. */
  costUsd: number | null;
}

export const EXA_RESULTS = 3;
const MAX_QUERY_CHARS = 400;

/** The search query for a claim: its text, trimmed, without line breaks. */
export function claimQuery(claim: string): string {
  const q = claim.replace(/\s+/g, " ").trim();
  return q.length > MAX_QUERY_CHARS ? `${q.slice(0, MAX_QUERY_CHARS - 1).trimEnd()}…` : q;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Reads Exa's /search response into sources, dropping anything without a URL. */
export function parseExaResults(raw: unknown, query: string): ClaimSourcesResult {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const results = Array.isArray(body.results) ? body.results : [];
  const sources: ClaimSource[] = [];
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const url = str(row.url);
    if (!url || !/^https?:\/\//.test(url)) continue;
    const highlights = Array.isArray(row.highlights) ? row.highlights.map(str).filter(Boolean) : [];
    sources.push({
      title: str(row.title) ?? new URL(url).hostname,
      url,
      published: str(row.publishedDate)?.slice(0, 10) ?? null,
      highlight: (highlights[0] as string | undefined) ?? str(row.text)?.slice(0, 320) ?? null,
    });
    if (sources.length >= EXA_RESULTS) break;
  }
  const cost = body.costDollars as Record<string, unknown> | undefined;
  const total = cost && typeof cost.total === "number" ? cost.total : null;
  return { query, sources, costUsd: total };
}
