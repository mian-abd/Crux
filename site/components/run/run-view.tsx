"use client";

import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ClaimCard,
  ConsolePanel,
  EmptyNote,
  Excerpt,
  LedgerPanel,
  Panel,
  RankingPanel,
  RefereePanel,
} from "@/components/run/panels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip, VERDICT_TEXT } from "@/components/verdict-chip";
import { EvidenceGraph3D } from "@/components/viz-lazy";
import { claimRows, isClaimsLab, verdictCounts, type ClaimVerdict } from "@/lib/crux/claims";
import { clock, usd } from "@/lib/crux/format";
import { DEMO_RUN_ID, useRun, type Provenance } from "@/lib/crux/use-run";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 2, 4] as const;
const COUNT_ORDER: ClaimVerdict[] = ["holds", "holds_if", "refuted", "unresolved", "other", "open"];
const ALWAYS_COUNTED = new Set<ClaimVerdict>(["holds", "holds_if", "refuted"]);

function ProvenanceBanner({ provenance, apiUrl }: { provenance: Provenance; apiUrl: string }) {
  if (provenance.kind === "resolving") {
    return <Skeleton className="h-11 w-full rounded-lg" />;
  }
  if (provenance.kind === "live") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-sm">
        <span className="font-medium">Live run</span>
        <span className="font-mono text-xs text-muted-foreground">{provenance.runId}</span>
        <span className="text-muted-foreground">streamed from the engine at {apiUrl}</span>
      </div>
    );
  }
  if (provenance.kind === "api-replay") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-sm">
        <span className="font-medium">Replay of a recorded run</span>
        <span className="font-mono text-xs text-muted-foreground">{provenance.file}</span>
        <span className="text-muted-foreground">streamed by the engine API</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-v-unresolved/50 bg-v-unresolved/10 px-4 py-3 text-sm leading-relaxed">
      <p>
        <span className="font-medium">Replay of a hand-written UI fixture, not a recorded run.</span>{" "}
        {provenance.reason === "api-unreachable"
          ? `The engine API at ${apiUrl} is not answering.`
          : "The engine API has no recorded claims run yet."}{" "}
        The scenario and its measured values were written by hand to exercise this page; only the
        belief updates follow the engine&apos;s arithmetic. The excerpt is a paraphrase of the paper.
      </p>
    </div>
  );
}

export function RunView({ runId }: { runId: string }) {
  const [speed, setSpeed] = useState<number>(1);
  const { run, events, conn, provenance, restart, apiUrl } = useRun(runId, speed);
  const claims = run.claims;
  const views = useMemo(() => (isClaimsLab(run) ? claimRows(run) : []), [run]);
  const counts = verdictCounts(views);
  const isReplay = provenance.kind === "api-replay" || provenance.kind === "fixture";
  const experiments = useMemo(() => Object.values(run.experiments), [run.experiments]);

  const status =
    run.status === "error" || conn.state === "error"
      ? { label: "Error", className: "border-v-refuted/40 bg-v-refuted/10 text-v-refuted" }
      : run.status === "finished"
        ? { label: "Finished", className: "border-border bg-muted text-foreground" }
        : conn.state === "reconnecting"
          ? { label: "Reconnecting", className: "border-v-unresolved/50 bg-v-unresolved/10 text-v-unresolved" }
          : { label: run.eventCount > 0 ? "Running" : "Connecting", className: "border-brand/40 bg-brand/10 text-brand" };

  const failed = conn.state === "error" && run.eventCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b pb-6">
        <div className="min-w-0 max-w-3xl">
          <p className="eyebrow mb-3">Claims audit · MVP on four curated claims</p>
          <h1 className="font-display text-4xl leading-tight text-balance">
            {claims?.title || "Claims audit"}
          </h1>
          {claims && (
            <p className="mt-2 text-sm text-muted-foreground">
              {claims.citation}{" "}
              {claims.url && (
                <a href={claims.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
                  Source
                </a>
              )}
              {claims.license && <> · {claims.license}</>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip className={status.className}>
            {status.label === "Running" && (
              <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
            )}
            {status.label}
          </Chip>
          {run.budget && (
            <Chip>
              {usd(run.budget.costUsd)} · {clock(run.budget.seconds)}
            </Chip>
          )}
          {isReplay && (
            <>
              <div role="group" aria-label="Replay speed" className="flex rounded-lg border p-0.5">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                    className={cn(
                      "h-7 rounded-md px-2.5 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                      speed === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <Button variant="outline" onClick={restart}>
                <RotateCcwIcon data-icon="inline-start" />
                Restart
              </Button>
            </>
          )}
        </div>
      </div>

      <ProvenanceBanner provenance={provenance} apiUrl={apiUrl} />

      {failed ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>The run could not be streamed</AlertTitle>
          <AlertDescription>
            <p>
              {conn.detail ?? "The engine API did not answer."} Check that it is running at {apiUrl} and
              that this site&apos;s origin is listed in <code className="font-mono text-[0.85em]">CRUX_CORS_ORIGINS</code>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={restart}>
                Try again
              </Button>
              {runId !== DEMO_RUN_ID && (
                <Link href={`/app/runs/${DEMO_RUN_ID}`} className={buttonVariants({ variant: "ghost" })}>
                  Open the recorded run
                </Link>
              )}
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {run.error && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>The run stopped with an error</AlertTitle>
              <AlertDescription>
                {run.error.message}
                {run.error.where && <span className="font-mono text-xs"> ({run.error.where})</span>}
              </AlertDescription>
            </Alert>
          )}

          {views.length > 0 && (
            <ul aria-label="Verdicts so far" className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {COUNT_ORDER.filter((v) => counts[v] > 0 || ALWAYS_COUNTED.has(v)).map((v) => (
                <li key={v} className="flex items-baseline gap-1.5">
                  <span className="font-mono tabular-nums">{counts[v]}</span>
                  <span className="text-muted-foreground">{VERDICT_TEXT[v].toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Panel
              title="Paper excerpt"
              hint={provenance.kind === "fixture" ? "Paraphrase (fixture)" : "Claims are underlined by verdict"}
              className="xl:sticky xl:top-20"
            >
              {claims ? (
                <div className="px-5 py-5">
                  <Excerpt source={claims} rows={views} />
                </div>
              ) : run.eventCount > 0 && run.lab && run.lab !== "claims" ? (
                <EmptyNote>
                  This is a {run.lab} run. It carries no paper excerpt; open it in the engineering viewer
                  for its full detail.
                </EmptyNote>
              ) : (
                <div className="space-y-3 px-5 py-5" aria-busy="true" aria-label="Waiting for the excerpt">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-11/12" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-3/4" />
                </div>
              )}
            </Panel>

            <div className="space-y-4">
              {views.length > 0
                ? views.map((v) => <ClaimCard key={v.claim.questionId} row={v} />)
                : [0, 1, 2].map((i) => <Skeleton key={i} className="h-52 w-full rounded-lg" />)}
            </div>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <RankingPanel state={run} />
            <ConsolePanel lines={run.console} />
            <RefereePanel experiments={experiments} />
            <LedgerPanel state={run} />
          </div>

          <Panel title="Evidence graph" hint="Questions, options and the diagnostics that tested them">
            <div className="h-[420px] overflow-hidden rounded-b-lg">
              <EvidenceGraph3D events={events} height={420} />
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
