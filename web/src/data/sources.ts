// Event sources. All three produce the same RunEvent stream for the reducer:
//   1. live runs over Server-Sent Events,
//   2. recorded replays streamed by the API,
//   3. bundled fixtures played locally with their recorded timing.

import { CLAIMS_EVENT_TYPES, DNA_EVENT_TYPES, EVENT_TYPES, type RunEvent } from '../types';

export const API_URL: string = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
).replace(/\/+$/, '');

export type ConnState =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

export interface ConnStatus {
  state: ConnState;
  detail?: string;
}

export interface SourceCallbacks {
  onEvent: (ev: RunEvent) => void;
  onStatus: (status: ConnStatus) => void;
  onReset: () => void;
}

export interface EventSourceLike {
  start(): void;
  stop(): void;
}

const TERMINAL = new Set(['run.finished', 'run.error']);

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export function parseEnvelope(raw: unknown, fallbackSeq?: number): RunEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== 'string') return null;
  const seq = typeof o.seq === 'number' ? o.seq : fallbackSeq;
  if (seq === undefined || !Number.isFinite(seq)) return null;
  return {
    run_id: typeof o.run_id === 'string' ? o.run_id : '',
    seq,
    ts: typeof o.ts === 'number' ? o.ts : Date.now() / 1000,
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

/* ------------------------------------------------------------------ */
/* Server-Sent Events with backoff and resume                          */
/* ------------------------------------------------------------------ */

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
    startSeq = -1,
  ) {
    this.lastSeq = startSeq;
  }

  get resumeSeq(): number {
    return this.lastSeq + 1;
  }

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
    this.cb.onStatus({ state: this.attempt === 0 ? 'connecting' : 'reconnecting' });
    let es: EventSource;
    try {
      es = new EventSource(this.buildUrl(this.lastSeq + 1));
    } catch (err) {
      this.cb.onStatus({ state: 'error', detail: String(err) });
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
        this.cb.onStatus({ state: 'ended' });
      }
    };

    es.onopen = () => {
      this.attempt = 0;
      this.cb.onStatus({ state: 'open' });
    };
    // Named SSE events (`event: <type>`) only reach typed listeners.
    for (const t of [...EVENT_TYPES, ...DNA_EVENT_TYPES, ...CLAIMS_EVENT_TYPES]) es.addEventListener(t, handle as EventListener);
    es.onmessage = handle;
    es.onerror = () => {
      es.close();
      if (this.es === es) this.es = null;
      if (this.stopped || this.terminal) return;
      const delay = Math.min(10_000, 500 * 2 ** this.attempt) + Math.random() * 250;
      this.attempt += 1;
      this.cb.onStatus({
        state: 'reconnecting',
        detail: `retry in ${(delay / 1000).toFixed(1)} s from seq ${this.lastSeq + 1}`,
      });
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }
}

export function liveUrl(runId: string, fromSeq: number, api = API_URL): string {
  return `${api}/runs/${encodeURIComponent(runId)}/events?from_seq=${fromSeq}`;
}

export function apiReplayUrl(name: string, speed: number, fromSeq: number, api = API_URL): string {
  return `${api}/replays/${encodeURIComponent(name)}/events?speed=${speed}&from_seq=${fromSeq}`;
}

/* ------------------------------------------------------------------ */
/* Local replay of a bundled fixture                                   */
/* ------------------------------------------------------------------ */

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

export class LocalReplay implements EventSourceLike {
  private i = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private playing = false;

  constructor(
    private readonly events: RunEvent[],
    private readonly cb: SourceCallbacks,
    private speed = 1,
    private readonly opts: { startDelayMs?: number; seekTo?: number; paused?: boolean } = {},
  ) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  get position(): { index: number; total: number } {
    return { index: this.i, total: this.events.length };
  }

  /** Start playing; optionally fast-forward through the first `seekTo` events first. */
  start(): void {
    const seek = Math.max(0, Math.min(this.events.length, Math.floor(this.opts.seekTo ?? 0)));
    while (this.i < seek) {
      const ev = this.events[this.i];
      this.i += 1;
      if (ev) this.cb.onEvent(ev);
    }
    if (this.opts.paused) {
      this.cb.onStatus({ state: 'paused' });
      return;
    }
    this.play(this.opts.startDelayMs ?? 0);
  }

  stop(): void {
    this.playing = false;
    this.clear();
  }

  play(initialDelay?: number): void {
    if (this.playing) return;
    if (this.i >= this.events.length) {
      this.cb.onStatus({ state: 'ended' });
      return;
    }
    this.playing = true;
    this.cb.onStatus({ state: 'playing' });
    this.schedule(initialDelay ?? (this.i === 0 ? 0 : 250));
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.clear();
    this.cb.onStatus({ state: 'paused' });
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.playing) {
      this.clear();
      this.schedule(replayDelayMs(this.events, this.i, this.speed));
    }
  }

  restart(): void {
    this.clear();
    this.playing = false;
    this.i = 0;
    this.cb.onReset();
    this.play(0);
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private tick(): void {
    if (!this.playing) return;
    // Emit this event plus any that were recorded at the same instant.
    do {
      const ev = this.events[this.i];
      this.i += 1;
      if (ev) this.cb.onEvent(ev);
    } while (
      this.i < this.events.length &&
      replayDelayMs(this.events, this.i, this.speed) < 4
    );
    if (this.i >= this.events.length) {
      this.playing = false;
      this.cb.onStatus({ state: 'ended' });
      return;
    }
    this.schedule(replayDelayMs(this.events, this.i, this.speed));
  }
}

export async function loadFixture(name: string): Promise<RunEvent[]> {
  const base = import.meta.env.BASE_URL ?? '/';
  const safe = name.replace(/[^A-Za-z0-9_.-]/g, '');
  const res = await fetch(`${base}fixtures/${safe}.jsonl`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`fixture ${safe} not found (${res.status})`);
  return parseJsonl(await res.text());
}

/* ------------------------------------------------------------------ */
/* Listings and run creation                                           */
/* ------------------------------------------------------------------ */

export interface NamedItem {
  name: string;
  title: string;
}

function toItems(data: unknown, keys: string[]): NamedItem[] {
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null
      ? (Object.values(data).find(Array.isArray) ?? [])
      : [];
  const out: NamedItem[] = [];
  for (const item of list as unknown[]) {
    if (typeof item === 'string') {
      out.push({ name: item, title: item });
      continue;
    }
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const name = keys.map((k) => o[k]).find((v): v is string => typeof v === 'string');
    if (!name) continue;
    const bits = [o.title, o.lab, o.status].filter((v): v is string => typeof v === 'string');
    out.push({ name, title: bits.length ? `${name} · ${bits.join(' · ')}` : name });
  }
  return out;
}

async function getJson(url: string, timeoutMs = 4000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchFixtureIndex(): Promise<NamedItem[]> {
  const base = import.meta.env.BASE_URL ?? '/';
  try {
    return toItems(await getJson(`${base}fixtures/index.json`), ['name']);
  } catch {
    return [
      { name: 'demo_categorical', title: 'demo_categorical' },
      { name: 'demo_numeric', title: 'demo_numeric' },
    ];
  }
}

export async function fetchReplays(api = API_URL): Promise<NamedItem[]> {
  return toItems(await getJson(`${api}/replays`), ['name', 'id', 'file']);
}

export async function fetchRuns(api = API_URL): Promise<NamedItem[]> {
  return toItems(await getJson(`${api}/runs`), ['run_id', 'id', 'name']);
}

export async function startRun(
  body: { lab: string; config: Record<string, unknown>; seed: number },
  api = API_URL,
): Promise<string> {
  const res = await fetch(`${api}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /runs failed: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const id = data.run_id ?? data.id;
  if (typeof id !== 'string') throw new Error('POST /runs returned no run_id');
  return id;
}
