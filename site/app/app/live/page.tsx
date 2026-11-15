import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { StartLiveRunButton } from "@/components/app/start-live-run-button";
import { dateTime } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { LIMITS, LIVE_CASES, limitReason, listLiveRuns, liveRunsEnabled, usage } from "@/lib/server/live-runs";

export const metadata: Metadata = { title: "Live run" };

const STEPS = [
  { title: "Profile and propose", body: "The data is profiled in a network-blocked Modal sandbox; three proposers raise competing options for each analysis choice." },
  { title: "Pick the most informative check", body: "Each option predicts every diagnostic's outcome; the engine runs the one worth the most information per cost, sometimes an Exa documentation search." },
  { title: "Referee, then update", body: "A blind referee checks each result before Bayes moves belief. Options below 0.02 are rejected with the evidence that rejected them." },
  { title: "Deliver and critique", body: "gpt-5.5 writes and runs the DESeq2 analysis; a critic checks the deliverables against the task's contract and can send them back once." },
];

export default async function LivePage() {
  const user = await requireUser("/app/live");
  const enabled = liveRunsEnabled();
  const u = usage(user.id);
  const reason = enabled ? limitReason(u) : "Live runs are not switched on for this site.";
  const runs = listLiveRuns(user.id);
  const kase = LIVE_CASES[0];

  return (
    <div className="space-y-12">
      <PageHeader title="Live run">
        Start the swarm on a real BixBench3 task 9 case and watch it work: real models, real Modal sandboxes, real Exa
        searches and shared memory.
      </PageHeader>

      <section className="relative isolate overflow-hidden rounded-3xl bg-ink text-ink-foreground">
        <Image
          src="/plates/lavoisier-apparatus.jpg"
          alt="Lavoisier's engraved chemistry apparatus, 1789."
          width={1440}
          height={876}
          priority
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="absolute inset-y-0 right-0 -z-20 hidden h-full w-[58%] object-cover opacity-45 mix-blend-luminosity lg:block"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/95 to-ink/40" aria-hidden="true" />
        <div className="max-w-2xl p-7 sm:p-10">
          <p className="text-[0.95rem] text-ink-foreground/70">{kase.title}</p>
          <h2 className="mt-3 font-display text-4xl leading-[1.05] sm:text-5xl">Run the swarm, live</h2>
          <p className="mt-4 leading-relaxed text-ink-foreground/75">{kase.body}</p>
          <dl className="mt-6 grid max-w-lg grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-ink-foreground/55">Takes</dt>
              <dd className="mt-1 font-display text-2xl">~6 min</dd>
            </div>
            <div>
              <dt className="text-ink-foreground/55">Model spend</dt>
              <dd className="mt-1 font-display text-2xl">≤ $2</dd>
            </div>
            <div>
              <dt className="text-ink-foreground/55">Your runs today</dt>
              <dd className="mt-1 font-display text-2xl">
                {u.userToday} / {LIMITS.perUserPerDay}
              </dd>
            </div>
          </dl>
          <div className="mt-8">
            <StartLiveRunButton caseId={kase.id} disabled={Boolean(reason)} />
            {reason && <p className="mt-3 max-w-md text-sm text-ink-foreground/70">{reason}</p>}
          </div>
          <p className="mt-6 max-w-lg text-xs leading-relaxed text-ink-foreground/50">
            Fair use: {LIMITS.perUserPerDay} runs per account per day, {LIMITS.perDay} per day across the site, and at
            most {LIMITS.concurrent} at once. Live runs are not graded here; the graded results are in the batch
            reports.
          </p>
        </div>
      </section>

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="font-display text-3xl sm:text-4xl">
          What you will see
        </h2>
        <ol className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border bg-card p-6">
              <p className="font-display text-3xl text-subtle">{i + 1}</p>
              <p className="mt-3 font-medium">{s.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="runs-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="runs-heading" className="font-display text-3xl sm:text-4xl">
            Your live runs
          </h2>
          <Link href="/app/graded" className="text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
            Or watch a graded run
          </Link>
        </div>
        {runs.length === 0 ? (
          <p className="mt-6 rounded-2xl border bg-card p-6 text-muted-foreground">
            None yet. Start one above; it opens in its own page as it runs.
          </p>
        ) : (
          <ul className="mt-6 divide-y overflow-hidden rounded-2xl border bg-card">
            {runs.map((r) => (
              <li key={r.runId}>
                <Link
                  href={`/app/live/${encodeURIComponent(r.runId)}`}
                  className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-4 transition-colors hover:bg-muted/50"
                >
                  <span className="font-mono text-sm">{r.runId}</span>
                  <span className="text-sm text-muted-foreground">{dateTime(r.createdAt)}</span>
                  <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium">
                    Open
                    <ArrowRightIcon className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
