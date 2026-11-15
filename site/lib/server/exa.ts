import { EXA_RESULTS, claimQuery, parseExaResults, type ClaimSourcesResult } from "@/lib/exa";

/** EXA_API_KEY stays on the server; the browser never sees it. */
export function hasExaKey(): boolean {
  return Boolean(process.env.EXA_API_KEY?.trim());
}

export class SourcesError extends Error {}

/** One Exa search for sources on a claim: the top results with a highlighted passage each. */
export async function findClaimSources(claim: string): Promise<ClaimSourcesResult> {
  const key = process.env.EXA_API_KEY?.trim();
  if (!key) throw new SourcesError("Finding sources needs an Exa API key.");
  const query = claimQuery(claim);
  let res: Response;
  try {
    res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: EXA_RESULTS,
        contents: { highlights: { numSentences: 2, highlightsPerUrl: 1 } },
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new SourcesError("Exa could not be reached. Try again.");
  }
  if (!res.ok) throw new SourcesError(`Exa answered ${res.status}.`);
  return parseExaResults(await res.json(), query);
}
