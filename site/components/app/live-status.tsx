"use client";

// Polls the engine API for a run's folded state (GET /runs/{id}) and shows the headline
// numbers while the embedded viewer streams the detail. Stops polling once the run ends.

import { useEffect, useState } from "react";

import { API_URL } from "@/lib/crux/sources";
import { cn } from "@/lib/utils";

interface RunState {
  status?: string;
  questions?: { status?: string }[];
  experiments?: unknown[];
  rejected?: unknown[];
  artifacts?: unknown[];
  searches?: unknown[];
  budget?: { cost_usd?: number; llm_calls?: number; seconds?: number };
}

const DONE = new Set(["finished", "error", "budget_exhausted", "failed", "cancelled"]);

function label(status: string | undefined, loaded: boolean): { text: string; tone: string } {
  if (!loaded) return { text: "Connecting", tone: "border-border text-muted-foreground" };
  switch (status) {
    case "finished":
      return { text: "Finished", tone: "border-v-holds/40 bg-v-holds/10 text-v-holds" };
    case "budget_exhausted":
      return { text: "Stopped at the $2 cap", tone: "border-v-cond/40 bg-v-cond/10 text-v-cond" };
    case "error":
    case "failed":
      return { text: "Ended with an error", tone: "border-v-refuted/40 bg-v-refuted/10 text-v-refuted" };
    default:
      return { text: "Running", tone: "border-brand/40 bg-brand/10 text-brand" };
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}

export function LiveStatus({ runId }: { runId: string }) {
  const [state, setState] = useState<RunState | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      try {
        const res = await fetch(`${API_URL}/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
        if (res.status === 404) {
          setMissing(true);
          return;
        }
        if (res.ok) {
          const next = (await res.json()) as RunState;
          if (stop) return;
          setState(next);
          if (next.status && DONE.has(next.status)) return;
        }
      } catch {
        // keep polling; a dropped request is not the end of the run
      }
      if (!stop) timer = setTimeout(tick, 4000);
    }
    void tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  if (missing) {
    return (
      <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
        The engine no longer has this run. Runs started on the hosted engine are kept until it redeploys.
      </p>
    );
  }

  const qs = state?.questions ?? [];
  const settled = qs.filter((q) => q.status === "settled" || q.status === "robust").length;
  const unresolved = qs.filter((q) => q.status === "unresolved").length;
  const open = qs.length - settled - unresolved;
  const b = state?.budget ?? {};
  const pill = label(state?.status, state !== null);
  const seconds = Math.round(b.seconds ?? 0);

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium", pill.tone)}>
          {pill.text === "Running" && (
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
          )}
          {pill.text}
        </span>
        <span className="font-mono text-sm text-muted-foreground">{runId}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Elapsed" value={`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`} />
        <Stat label="Model spend" value={`$${(b.cost_usd ?? 0).toFixed(2)}`} />
        <Stat label="Checks run" value={String(state?.experiments?.length ?? 0)} />
        <Stat label="Questions settled" value={`${settled}`} />
        <Stat label="Unresolved / open" value={`${unresolved} / ${open}`} />
        <Stat label="Options rejected" value={String(state?.rejected?.length ?? 0)} />
      </div>
      {state?.status === "finished" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Done: {state.artifacts?.length ?? 0} deliverable files written, {state.searches?.length ?? 0} documentation
          searches, {b.llm_calls ?? 0} model calls. This run is not graded on the site; graded results are in the
          batch reports.
        </p>
      )}
    </div>
  );
}
