// Event sources for the run page. All of them produce the same RunEvent stream:
//   1. a live run over Server-Sent Events,
//   2. a recorded replay streamed by the API,
//   3. the bundled fixture, played locally with its recorded timing.

import { CLAIMS_EVENT_TYPES, DNA_EVENT_TYPES, EVENT_TYPES, type RunEvent } from "./types";

export const API_URL: string = (
  process.env.NEXT_PUBLIC_CRUX_API ?? "http://localhost:8001"
).replace(/\/+$/, "");


export const CLAIMS_LAB = "claims";
export const CLAIMS_REPLAY = "claims_deseq2";
export const CLAIMS_FIXTURE_URL = "/fixtures/demo_claims.jsonl";

export type ConnState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "playing"
  | "ended"
  | "error";

export interface ConnStatus {
  state: ConnState;
  detail?: string;
}

export interface SourceCallbacks {
  onEvent: (ev: RunEvent) => void;
  onStatus: (status: ConnStatus) => void;
}

export interface EventSourceLike {
  start(): void;
  stop(): void;
}

const TERMINAL = new Set(["run.finished", "run.error"]);

export function parseEnvelope(raw: unknown, fallbackSeq?: number): RunEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string") return null;
  const seq = typeof o.seq === "number" ? o.seq : fallbackSeq;
  if (seq === undefined || !Number.isFinite(seq)) return null;
  return {
    run_id: typeof o.run_id === "string" ? o.run_id : "",
    seq,
    ts: typeof o.ts === "number" ? o.ts : Date.now() / 1000,
    type: o.type,
    payload: o.payload ?? {},
  };
}

export function parseJsonl(text: string): RunEvent[] {
  const out: RunEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const ev = parseEnvelope(JSON.parse(t));
      if (ev) out.push(ev);
    } catch {
      // A torn last line in a live file is expected; skip it.
    }
  }
  return out;
}

/** Server-Sent Events with backoff and resume from the last seq seen. */
export class SseSource implements EventSourceLike {
  private es: EventSource | null = null;
  private lastSeq = -1;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private terminal = false;
  private stopped = true;

  constructor(
    private readonly buildUrl: (fromSeq: number) => string,
    private readonly cb: SourceCallbacks,
    /** A replay has no resume: the stream ending is the end of the recording. */
    private readonly endsOnClose = false,
    private readonly maxAttempts = 6,
  ) {}

  start(): void {
    this.stopped = false;
    this.terminal = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.es?.close();
    this.es = null;
  }

  private connect(): void {
    if (this.stopped) return;
    this.cb.onStatus({ state: this.attempt === 0 ? "connecting" : "reconnecting" });
    let es: EventSource;
    try {
      es = new EventSource(this.buildUrl(this.lastSeq + 1));
    } catch (err) {
      this.cb.onStatus({ state: "error", detail: String(err) });
      return;
    }
    this.es = es;

    const handle = (msg: MessageEvent<string>) => {
      let data: unknown;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      const idSeq = msg.lastEventId ? Number(msg.lastEventId) : undefined;
      const ev = parseEnvelope(data, Number.isFinite(idSeq) ? idSeq : undefined);
      if (!ev) return;
      if (ev.seq <= this.lastSeq) return;
      this.lastSeq = ev.seq;
      this.attempt = 0;
      this.cb.onEvent(ev);
      if (TERMINAL.has(ev.type)) {
        this.terminal = true;
        es.close();
        this.es = null;
        this.cb.onStatus({ state: "ended" });
      }
    };

    es.onopen = () => {
      this.cb.onStatus({ state: "open" });
    };
    for (const t of [...EVENT_TYPES, ...DNA_EVENT_TYPES, ...CLAIMS_EVENT_TYPES]) {
      es.addEventListener(t, handle as EventListener);
    }
    es.onmessage = handle;
    es.onerror = () => {
      es.close();
      if (this.es === es) this.es = null;
      if (this.stopped || this.terminal) return;
      if (this.endsOnClose && this.lastSeq >= 0) {
        this.cb.onStatus({ state: "ended" });
        return;
      }
      if (this.attempt >= this.maxAttempts) {
        this.cb.onStatus({
          state: "error",
          detail: "The engine API stopped answering.",
        });
        return;
      }
      const delay = Math.min(8000, 500 * 2 ** this.attempt) + Math.random() * 250;
      this.attempt += 1;
      this.cb.onStatus({
        state: "reconnecting",
        detail: `retrying in ${(delay / 1000).toFixed(1)} s`,
      });
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }
}

export function liveUrl(runId: string, fromSeq: number, api = API_URL): string {
  return `${api}/runs/${encodeURIComponent(runId)}/events?from_seq=${fromSeq}`;
}

export function apiReplayUrl(name: string, speed: number, api = API_URL): string {
  return `${api}/replays/${encodeURIComponent(name)}/events?speed=${speed}`;
}

export const MAX_GAP_S = 2;

/** Delay before event i, from the recorded ts gap (capped) and the speed. */
export function replayDelayMs(events: RunEvent[], i: number, speed: number): number {
  if (i <= 0 || i >= events.length) return 0;
  const prev = events[i - 1];
  const cur = events[i];
  if (!prev || !cur) return 0;
  const gap = Math.min(MAX_GAP_S, Math.max(0, cur.ts - prev.ts));
  return (gap * 1000) / Math.max(0.1, speed);
}

/** Plays a list of recorded events with their recorded timing. */
export class LocalReplay implements EventSourceLike {
  private i = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private playing = false;

  constructor(
    private readonly events: RunEvent[],
    private readonly cb: SourceCallbacks,
    private readonly speed = 1,
  ) {}

  start(): void {
    if (this.playing) return;
    if (this.events.length === 0) {
      this.cb.onStatus({ state: "ended" });
      return;
    }
    this.playing = true;
    this.cb.onStatus({ state: "playing" });
    this.timer = setTimeout(() => this.tick(), 0);
  }

  stop(): void {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (!this.playing) return;
    do {
      const ev = this.events[this.i];
      this.i += 1;
      if (ev) this.cb.onEvent(ev);
    } while (this.i < this.events.length && replayDelayMs(this.events, this.i, this.speed) < 4);
    if (this.i >= this.events.length) {
      this.playing = false;
      this.cb.onStatus({ state: "ended" });
      return;
    }
    this.timer = setTimeout(() => this.tick(), replayDelayMs(this.events, this.i, this.speed));
  }
}

async function getJson(url: string, timeoutMs = 2500): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export interface EngineInfo {
  reachable: boolean;
  /** POST /runs accepts the claims lab. */
  canStartClaims: boolean;
  /** runs/demo/claims_deseq2.jsonl is served by /replays. */
  hasClaimsReplay: boolean;
}

export function engineInfoFrom(tasks: unknown, replays: unknown): EngineInfo {
  const labs =
    typeof tasks === "object" && tasks !== null && Array.isArray((tasks as { labs?: unknown }).labs)
      ? ((tasks as { labs: unknown[] }).labs.filter((l) => typeof l === "string") as string[])
      : [];
  const names = Array.isArray(replays) ? replays.filter((r) => typeof r === "string") : [];
  return {
    reachable: true,
    canStartClaims: labs.includes(CLAIMS_LAB),
    hasClaimsReplay: names.some((n) => n === `${CLAIMS_REPLAY}.jsonl` || n === CLAIMS_REPLAY),
  };
}

export async function fetchEngineInfo(api = API_URL): Promise<EngineInfo> {
  try {
    const [tasks, replays] = await Promise.all([
      getJson(`${api}/tasks`),
      getJson(`${api}/replays`).catch(() => []),
    ]);
    return engineInfoFrom(tasks, replays);
  } catch {
    return { reachable: false, canStartClaims: false, hasClaimsReplay: false };
  }
}

export async function startClaimsRun(api = API_URL): Promise<string> {
  const res = await fetch(`${api}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lab: CLAIMS_LAB, config: "default", seed: 0, overrides: {} }),
  });
  if (!res.ok) throw new Error(`The engine refused the run (${res.status}).`);
  const data = (await res.json()) as Record<string, unknown>;
  if (typeof data.run_id !== "string") throw new Error("The engine returned no run id.");
  return data.run_id;
}

export async function loadFixture(url = CLAIMS_FIXTURE_URL): Promise<RunEvent[]> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`fixture not found (${res.status})`);
  return parseJsonl(await res.text());
}
