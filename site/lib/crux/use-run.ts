"use client";

// One hook for the run page: it picks the event source, folds events into the
// run state (which carries the `claims.source` paper), and keeps the raw events.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { foldEvent, initialState, type RunState } from "./fold";
import {
  API_URL,
  CLAIMS_REPLAY,
  LocalReplay,
  SseSource,
  apiReplayUrl,
  fetchEngineInfo,
  liveUrl,
  loadFixture,
  type ConnStatus,
  type EventSourceLike,
} from "./sources";
import type { RunEvent } from "./types";

export const DEMO_RUN_ID = "demo";

/** Where the events on screen come from. Shown to the reader, never hidden. */
export type Provenance =
  | { kind: "resolving" }
  | { kind: "live"; runId: string }
  | { kind: "api-replay"; file: string }
  | { kind: "fixture"; reason: "api-unreachable" | "no-recording" };

interface Acc {
  run: RunState;
  events: RunEvent[];
}

type Action = { type: "events"; events: RunEvent[] } | { type: "reset" };

const EMPTY: Acc = { run: initialState(), events: [] };

function reduce(acc: Acc, action: Action): Acc {
  if (action.type === "reset") return EMPTY;
  let run = acc.run;
  for (const ev of action.events) run = foldEvent(run, ev);
  return { run, events: acc.events.concat(action.events) };
}

export function useRun(runId: string, speed: number) {
  const [acc, dispatch] = useReducer(reduce, EMPTY);
  const [conn, setConn] = useState<ConnStatus>({ state: "idle" });
  const [provenance, setProvenance] = useState<Provenance>({ kind: "resolving" });
  const [attempt, setAttempt] = useState(0);
  const buffer = useRef<RunEvent[]>([]);

  const restart = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    let source: EventSourceLike | null = null;
    let frame = 0;

    const flush = () => {
      frame = 0;
      if (buffer.current.length === 0) return;
      const events = buffer.current;
      buffer.current = [];
      dispatch({ type: "events", events });
    };
    const callbacks = {
      onEvent: (ev: RunEvent) => {
        buffer.current.push(ev);
        if (!frame) frame = requestAnimationFrame(flush);
      },
      onStatus: (status: ConnStatus) => {
        if (!cancelled) setConn(status);
      },
    };

    async function begin() {
      buffer.current = [];
      dispatch({ type: "reset" });
      setConn({ state: "connecting" });

      if (runId !== DEMO_RUN_ID) {
        setProvenance({ kind: "live", runId });
        source = new SseSource((from) => liveUrl(runId, from), callbacks);
        source.start();
        return;
      }

      setProvenance({ kind: "resolving" });
      const info = await fetchEngineInfo();
      if (cancelled) return;
      if (info.hasClaimsReplay) {
        setProvenance({ kind: "api-replay", file: `runs/demo/${CLAIMS_REPLAY}.jsonl` });
        source = new SseSource(() => apiReplayUrl(CLAIMS_REPLAY, speed), callbacks, true);
        source.start();
        return;
      }
      setProvenance({ kind: "fixture", reason: info.reachable ? "no-recording" : "api-unreachable" });
      try {
        const events = await loadFixture();
        if (cancelled) return;
        source = new LocalReplay(events, callbacks, speed);
        source.start();
      } catch {
        if (!cancelled) setConn({ state: "error", detail: "The bundled recording could not be loaded." });
      }
    }

    void begin();
    return () => {
      cancelled = true;
      source?.stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [runId, speed, attempt]);

  return { ...acc, conn, provenance, restart, apiUrl: API_URL };
}
