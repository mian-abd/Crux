// Fetching PDB entries for the Mol* views. RCSB PDB (BinaryCIF) first, PDBe
// second, each with a real timeout. Entries are kept in memory for the page's
// life, so a view that scrolls away and back, or a second view of the same
// entry, draws without another download.

const LOAD_TIMEOUT_MS = 25_000;

function sources(id: string): { url: string; binary: boolean; label: string }[] {
  const lower = id.toLowerCase();
  return [
    { url: `https://models.rcsb.org/${lower}.bcif`, binary: true, label: "RCSB PDB" },
    {
      url: `https://www.ebi.ac.uk/pdbe/entry-files/download/${lower}_updated.cif`,
      binary: false,
      label: "PDBe",
    },
  ];
}

/** Why a load failed, for the message shown in place of the structure. */
export class LoadError extends Error {
  constructor(
    message: string,
    readonly reason: "not-found" | "unreachable",
  ) {
    super(message);
  }
}

type Entry = { data: ArrayBuffer | string; label: string };

const cache = new Map<string, Promise<Entry>>();

async function download(id: string): Promise<Entry> {
  let notFound = 0;
  const errors: string[] = [];
  const list = sources(id);
  for (const src of list) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), LOAD_TIMEOUT_MS);
    try {
      const res = await fetch(src.url, { signal: ctl.signal });
      if (!res.ok) {
        if (res.status === 404) notFound += 1;
        errors.push(`${src.label} ${res.status}`);
        continue;
      }
      const data = src.binary ? await res.arrayBuffer() : await res.text();
      return { data, label: src.label };
    } catch (e) {
      errors.push(`${src.label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new LoadError(errors.join("; "), notFound === list.length ? "not-found" : "unreachable");
}

function load(id: string): Promise<Entry> {
  const key = id.toLowerCase();
  let p = cache.get(key);
  if (!p) {
    p = download(key);
    cache.set(key, p);
    // A failure is not remembered: the next view tries again.
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** Start downloading an entry before its view needs it. */
export function prefetchEntry(id: string): void {
  load(id).catch(() => undefined);
}

/**
 * The entry's bytes for Mol* to parse, or null if the caller was cancelled
 * meanwhile. Binary data is copied, so the cached buffer stays intact.
 */
export async function fetchEntry(
  id: string,
  isCancelled: () => boolean,
): Promise<{ data: ArrayBuffer | string; label: string } | null> {
  const entry = await load(id);
  if (isCancelled()) return null;
  return { data: typeof entry.data === "string" ? entry.data : entry.data.slice(0), label: entry.label };
}
