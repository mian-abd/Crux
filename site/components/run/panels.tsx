"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Chip, VERDICT_STYLE, VERDICT_TEXT, VerdictChip } from "@/components/verdict-chip";
import { excerptLayout, optionLabel, ruledOut, type ClaimRow } from "@/lib/crux/claims";
import type { ClaimsSourceView, ConsoleLine, ExperimentView, RankingView, RunState } from "@/lib/crux/fold";
import { bits, pct, usd } from "@/lib/crux/format";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  hint,
  children,
  className,
  id,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/\W+/g, "-")}-heading`;
  return (
    <section aria-labelledby={headingId} className={cn("min-w-0 rounded-lg border bg-card", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-5 py-3.5">
        <h2 id={headingId} className="text-sm font-medium">
          {title}
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function formatNumber(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 0.001 || abs >= 1e6)) return v.toExponential(2);
  return v.toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/* ------------------------------------------------------------------ */
/* Paper excerpt with claim highlights                                 */
/* ------------------------------------------------------------------ */

export function Excerpt({ source, rows }: { source: ClaimsSourceView; rows: ClaimRow[] }) {
  const listed = rows.filter((r) => !r.extra);
  const layout = excerptLayout(
    source.excerpt,
    listed.map((r) => r.claim.quote),
  );
  const unplaced = listed.filter((r, i) => r.claim.quote && !layout.placed[i]);
  return (
    <>
      <p className="font-display text-[1.3rem] leading-[1.7] text-pretty">
        {layout.segments.map((seg, i) => {
          const chips = seg.ends.map((c) => {
            const row = listed[c];
            return (
              <sup key={c} className={cn("ml-0.5 font-sans text-[0.65rem] font-semibold", VERDICT_STYLE[row.verdict].text)}>
                <a href={`#claim-${row.index}`} className="rounded-sm px-0.5 hover:underline">
                  {row.index}
                  <span className="sr-only">, {VERDICT_TEXT[row.verdict]}</span>
                </a>
              </sup>
            );
          });
          if (seg.lead === null) return <span key={i}>{seg.text}</span>;
          const verdict = listed[seg.lead].verdict;
          return (
            <span key={i}>
              <mark
                className={cn(
                  "rounded-sm box-decoration-clone px-0.5 text-foreground underline decoration-2 underline-offset-[5px] transition-colors duration-500",
                  VERDICT_STYLE[verdict].mark,
                )}
              >
                {seg.text}
              </mark>
              {chips}
            </span>
          );
        })}
      </p>
      {unplaced.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Not quoted in this excerpt: {unplaced.map((r) => `claim ${r.index}`).join(", ")}.
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Claim card                                                          */
/* ------------------------------------------------------------------ */

export function ClaimCard({ row }: { row: ClaimRow }) {
  const { claim, question, verdict, options, evidence } = row;
  const rejectedHow = new Map<string, string>();
  for (const group of row.ruledOut) for (const o of group.options) rejectedHow.set(o.id, group.how);

  return (
    <article
      id={`claim-${row.index}`}
      aria-labelledby={`claim-${row.index}-title`}
      className="scroll-mt-24 rounded-lg border bg-card p-5 target:ring-2 target:ring-ring/50"
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-display text-2xl leading-none text-muted-foreground">{row.index}</span>
        {claim.kind && <Chip className="capitalize">{claim.kind}</Chip>}
        {claim.planted && <Chip className="border-v-refuted/40 text-v-refuted">Planted false claim</Chip>}
        {row.extra && <Chip>Raised during the run</Chip>}
        <VerdictChip verdict={verdict} className="ml-auto" />
      </header>
      <h3 id={`claim-${row.index}-title`} className="mt-3.5 text-[1.05rem] leading-snug font-medium">
        {claim.claim}
      </h3>
      {question?.text && question.text !== claim.claim && (
        <p className="mt-1.5 text-sm text-muted-foreground">{question.text}</p>
      )}

      {options.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">Waiting for the proposers to raise options.</p>
      ) : (
        <ul className="mt-5 space-y-3.5">
          {options.map((option) => {
            const rejected = option.status === "rejected";
            const accepted = option.status === "accepted";
            const label = optionLabel(option);
            return (
              <li key={option.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={cn("min-w-0", rejected && "text-muted-foreground line-through")}>
                    <span className="font-medium">{label}</span>
                    {option.statement !== label && !option.isNull && (
                      <span className="text-muted-foreground"> · {option.statement}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
                    {accepted && <CheckIcon className="size-3.5 text-v-holds" aria-label="Settled on this option" />}
                    {rejected && <XIcon className="size-3.5 text-v-refuted" aria-label="Rejected" />}
                    {pct(option.posterior)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Posterior for: ${label}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(option.posterior * 100)}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700 ease-out",
                      rejected ? "bg-muted-foreground/40" : accepted ? "bg-foreground" : "bg-brand",
                    )}
                    style={{ width: `${Math.max(option.posterior * 100, 0.5)}%` }}
                  />
                </div>
                {rejected && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-medium text-v-refuted">Ruled out by:</span>{" "}
                    {rejectedHow.get(option.id) ?? option.rejectedReason ?? "no evidence text was recorded"}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 space-y-3 border-t pt-4 text-sm">
        {row.testing && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            Testing: {row.testingGoal ?? "a diagnostic is running"}
          </p>
        )}
        {row.invalid && (
          <p className="leading-relaxed text-v-unresolved">
            <span className="font-medium">The referee ruled the last result invalid, so beliefs did not move.</span>{" "}
            {row.invalid.note}
          </p>
        )}
        {evidence ? (
          <dl className="space-y-2.5">
            <div>
              <dt className="eyebrow">{verdict === "open" ? "Latest diagnostic" : "Deciding diagnostic"}</dt>
              <dd className="mt-1">{evidence.goal}</dd>
            </div>
            {evidence.binText && (
              <div>
                <dt className="eyebrow">Observed</dt>
                <dd className="mt-1">
                  {evidence.binText}
                  {evidence.binId && evidence.binId !== evidence.binText && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{evidence.binId}</span>
                  )}
                </dd>
              </div>
            )}
            {evidence.key && (
              <div>
                <dt className="eyebrow">Key number</dt>
                <dd className="mt-1 font-mono text-xs">
                  <span className="text-muted-foreground">{evidence.key.key} </span>
                  {formatNumber(evidence.key.value)}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          !row.testing &&
          !row.invalid &&
          verdict !== "unresolved" && (
            <p className="text-muted-foreground">No diagnostic has run for this claim yet.</p>
          )
        )}
        {verdict === "unresolved" && (
          <p className="text-v-unresolved">
            {question?.unresolved?.reason ?? "Closed without a deciding diagnostic."}
          </p>
        )}
        {verdict === "other" && (
          <p className="text-muted-foreground">
            The question closed on an option outside the claim&apos;s listed answers.
          </p>
        )}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Experiment ranking                                                  */
/* ------------------------------------------------------------------ */

function RankingTable({ ranking }: { ranking: RankingView }) {
  const top = Math.max(...ranking.rows.map((r) => r.score), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="px-5 py-2 font-normal">
              Diagnostic
            </th>
            <th scope="col" className="px-3 py-2 text-right font-normal">
              EIG (bits)
            </th>
            <th scope="col" className="px-3 py-2 text-right font-normal">
              Cost
            </th>
            <th scope="col" className="py-2 pr-5 pl-3 font-normal">
              EIG per cost
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {ranking.rows.map((row) => {
            const chosen = row.experiment_id === ranking.chosen;
            return (
              <tr key={row.experiment_id} className={chosen ? "bg-brand/5" : undefined}>
                <td className="px-5 py-3 align-top">
                  <p className="leading-snug">{row.goal || row.experiment_id}</p>
                  <p className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    {row.experiment_id}
                    {chosen && (
                      <span className="rounded-full border border-brand/40 px-1.5 font-sans text-[0.68rem] font-medium text-brand">
                        Chosen
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-3 py-3 text-right align-top font-mono text-xs tabular-nums">{bits(row.eig_bits)}</td>
                <td className="px-3 py-3 text-right align-top font-mono text-xs tabular-nums">
                  {usd(row.est_cost_usd)}
                </td>
                <td className="py-3 pr-5 pl-3 align-top">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className={cn("h-full rounded-full", chosen ? "bg-brand" : "bg-muted-foreground/50")}
                        style={{ width: `${top > 0 ? Math.max((row.score / top) * 100, 2) : 0}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs tabular-nums">{row.score.toFixed(1)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RankingPanel({ state }: { state: RunState }) {
  const rankings = Object.values(state.rankings).sort((a, b) => b.seq - a.seq);
  const latest = rankings[0];
  return (
    <Panel title="Experiment ranking" hint="Expected information gain per cost, best first">
      {!latest ? (
        <EmptyNote>No diagnostics have been ranked yet.</EmptyNote>
      ) : (
        <>
          <p className="px-5 pt-4 pb-1 text-sm text-muted-foreground">
            {state.questions[latest.questionId]?.text || latest.questionId}
          </p>
          <RankingTable ranking={latest} />
          {rankings.length > 1 && (
            <details className="border-t">
              <summary className="cursor-pointer px-5 py-3 text-sm text-muted-foreground hover:text-foreground">
                Earlier rankings ({rankings.length - 1})
              </summary>
              {rankings.slice(1).map((r) => (
                <div key={r.questionId} className="border-t">
                  <p className="px-5 pt-4 pb-1 text-sm text-muted-foreground">
                    {state.questions[r.questionId]?.text || r.questionId}
                  </p>
                  <RankingTable ranking={r} />
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Console                                                             */
/* ------------------------------------------------------------------ */

const LINE_STYLE: Record<ConsoleLine["kind"], string> = {
  start: "text-brand",
  stdout: "",
  stderr: "text-v-unresolved",
  finish: "text-muted-foreground",
  verdict: "text-muted-foreground",
  error: "text-v-refuted",
};

export function ConsolePanel({ lines }: { lines: ConsoleLine[] }) {
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <Panel title="Console" hint="experiment.log, as it streams">
      <div
        ref={box}
        role="log"
        aria-label="Experiment log"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="h-80 overflow-y-auto px-5 py-4 font-mono text-xs leading-relaxed focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
      >
        {lines.length === 0 ? (
          <p className="text-muted-foreground">Nothing has run yet.</p>
        ) : (
          lines.map((line) => (
            <p key={`${line.seq}-${line.kind}`} className={cn("break-words whitespace-pre-wrap", LINE_STYLE[line.kind])}>
              {line.experimentId && line.kind !== "start" && (
                <span className="text-muted-foreground select-none">{line.experimentId} │ </span>
              )}
              {line.text}
            </p>
          ))
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Referee verdicts                                                    */
/* ------------------------------------------------------------------ */

export function RefereePanel({ experiments }: { experiments: ExperimentView[] }) {
  const judged = experiments.filter((e) => e.verdict).sort((a, b) => b.proposedSeq - a.proposedSeq);
  return (
    <Panel title="Referee verdicts" hint="A result counts only if the referee passes it">
      {judged.length === 0 ? (
        <EmptyNote>No result has reached the referee yet.</EmptyNote>
      ) : (
        <ul className="divide-y">
          {judged.map((e) => (
            <li key={e.id} className="flex gap-3 px-5 py-3.5 text-sm">
              <Chip
                className={
                  e.verdict?.valid
                    ? "border-v-holds/40 bg-v-holds/10 text-v-holds"
                    : "border-v-refuted/40 bg-v-refuted/10 text-v-refuted"
                }
              >
                {e.verdict?.valid ? <CheckIcon className="size-3.5" aria-hidden="true" /> : <XIcon className="size-3.5" aria-hidden="true" />}
                {e.verdict?.valid ? "Valid" : "Invalid"}
              </Chip>
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{e.id}</p>
                <p className="mt-1 leading-relaxed">
                  {e.verdict?.note || (e.verdict?.valid ? "Passed without a note." : "Rejected without a note.")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Rejected ledger                                                     */
/* ------------------------------------------------------------------ */

export function LedgerPanel({ state }: { state: RunState }) {
  const groups = state.questionOrder.flatMap((qid) =>
    ruledOut(state, qid).map((group) => ({ qid, group })),
  );
  return (
    <Panel title="Rejected ledger" hint="Every rejected option keeps the evidence that rejected it">
      {groups.length === 0 ? (
        <EmptyNote>No option has been rejected yet.</EmptyNote>
      ) : (
        <ul className="divide-y">
          {groups.map(({ qid, group }) => (
            <li key={qid + ":" + group.seq} className="px-5 py-3.5 text-sm">
              <ul className="space-y-1">
                {group.options.map((o) => (
                  <li key={o.id} className="leading-snug text-muted-foreground line-through decoration-v-refuted/70">
                    {o.statement}
                  </li>
                ))}
              </ul>
              <p className="mt-2 leading-relaxed">
                <span className="font-medium">Evidence: </span>
                {group.how}
              </p>
              {group.reasons[0] && (
                <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">{group.reasons[0]}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
