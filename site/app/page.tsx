import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import { Loop } from "@/components/landing/loop";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { HeroScene } from "@/components/viz-lazy";
import { CLAIM_LIBRARY, LIBRARY_PAPER } from "@/lib/claim-library";
import { REPO_URL, repoFile } from "@/lib/site";
import { cn } from "@/lib/utils";

const RESULTS_SOURCE = "eval/results/task9_batch02.md";
const BATCH03_PROTOCOL = "eval/results/task9_protocol_batch03.md";

function Source({ path }: { path: string }) {
  return (
    <a
      href={repoFile(path)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
    >
      {path}
      <ArrowUpRightIcon className="size-3" aria-hidden="true" />
    </a>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 font-display text-4xl leading-[1.08] text-balance sm:text-5xl">{title}</h2>
      {children && <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  );
}

const CAVEATS = [
  {
    title: "Overall scores were statistically tied.",
    body: "With the single agent's four crashed runs repeated, the paired score difference is 0.045, with a 95% interval of −0.05 to 0.15. That is no score difference we can claim.",
  },
  {
    title: "The single agent led on the clean case.",
    body: "With no fault planted it scored 0.868 against the swarm's 0.833, over 3 runs each.",
  },
  {
    title: "These are the faults the checks were written for.",
    body: "The suite plants six fault types, and the swarm's library holds diagnostics for exactly those six. The result does not show detection of fault types nobody wrote a check for.",
  },
  {
    title: "The sample is small.",
    body: "One task, and one run per arm on each fault case.",
  },
];

const SPONSORS = [
  { name: "Exa", role: "Documentation search, run as one more experiment in the ranking." },
  { name: "past.dev", role: "Shared memory, so one agent can use another's record." },
  { name: "Modal", role: "Sandboxes for diagnostics and the evaluation runs." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 -z-10 w-full opacity-40 [mask-image:linear-gradient(to_right,transparent,black_55%)] md:w-[62%] md:opacity-100 md:[mask-image:radial-gradient(ellipse_70%_75%_at_62%_50%,black_30%,transparent_78%)]"
          >
            <HeroScene className="size-full" />
          </div>
          <div className="mx-auto flex w-full max-w-6xl flex-col justify-center px-5 py-24 sm:px-8 md:min-h-[44rem]">
            <div className="max-w-2xl">
              <p className="eyebrow animate-rise">Research prototype · pilot results</p>
              <h1 className="mt-6 animate-rise font-display text-[2.9rem] leading-[1.02] text-balance [animation-delay:60ms] sm:text-7xl">
                Disagreements settled by experiment, <em className="text-brand">not by vote.</em>
              </h1>
              <p className="mt-7 max-w-xl animate-rise text-lg leading-relaxed text-muted-foreground [animation-delay:120ms] sm:text-xl">
                Crux is a team of AI scientists. When they disagree about an analysis, they run the
                diagnostic expected to tell them the most per dollar, and change their minds only on
                what it shows.
              </p>
              <div className="mt-10 flex animate-rise flex-wrap items-center gap-3 [animation-delay:180ms]">
                <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-[0.95rem]")}>
                  Audit a paper
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-[0.95rem]")}
                >
                  View on GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t">
          <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <SectionHeading eyebrow="How it works" title="One loop, repeated until the evidence runs out.">
              Given a study&apos;s data and the analysis it reports, the agents disagree on purpose.
              The engine decides what to test next.
            </SectionHeading>
            <div className="mt-16">
              <Loop />
            </div>
          </div>
        </section>

        {/* Results */}
        <section id="results" className="border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <SectionHeading eyebrow="Results · pilot, one task" title="What we measured, and what it does not show.">
              BixBench3 task 9: an RNA-seq analysis from counts, with faults planted in the data. The
              swarm ran against a strong single agent (gpt-5.5) on the same budget.
            </SectionHeading>

            <div className="mt-16 grid gap-x-16 gap-y-14 lg:grid-cols-[1fr_1.15fr]">
              <div>
                <dl className="grid grid-cols-2 gap-8">
                  <div>
                    <dt className="text-sm text-muted-foreground">Swarm</dt>
                    <dd className="mt-2 font-display text-7xl leading-none tabular-nums sm:text-8xl">
                      12
                      <span className="text-4xl text-muted-foreground sm:text-5xl"> / 12</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Single agent</dt>
                    <dd className="mt-2 font-display text-7xl leading-none tabular-nums sm:text-8xl">
                      5
                      <span className="text-4xl text-muted-foreground sm:text-5xl"> / 12</span>
                    </dd>
                  </div>
                </dl>
                <p className="mt-8 max-w-md leading-relaxed">
                  Planted data faults caught. The single agent&apos;s 5 counts reruns of its four
                  crashed runs; as pre-registered, before those reruns, it caught 3.
                </p>
                <p className="mt-4">
                  <Source path={RESULTS_SOURCE} />
                </p>

                <div className="mt-12 rounded-lg border border-dashed p-5">
                  <p className="eyebrow">Batch-03 · running</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    A newer batch is running now. Its numbers will go here once it is graded. Until
                    then this space stays empty.
                  </p>
                  <p className="mt-3">
                    <Source path={BATCH03_PROTOCOL} />
                  </p>
                </div>
              </div>

              <ul className="divide-y border-y">
                {CAVEATS.map((c) => (
                  <li key={c.title} className="py-6">
                    <h3 className="font-medium">{c.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                    <p className="mt-3">
                      <Source path={RESULTS_SOURCE} />
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Claims audit */}
        <section id="claims" className="border-t">
          <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[1fr_1.15fr]">
              <div>
                <SectionHeading eyebrow="Claims audit · MVP" title="The same engine, pointed at a paper's maths.">
                  Each claim becomes a question with competing options: it holds, it fails, or it
                  holds only under a condition. The engine checks them by symbolic derivation and by
                  simulation.
                </SectionHeading>
                <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  This is an MVP on four curated claims from one paper: {LIBRARY_PAPER.authors},{" "}
                  <a
                    href={LIBRARY_PAPER.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-border underline-offset-4 hover:text-foreground"
                  >
                    {LIBRARY_PAPER.venue}
                  </a>{" "}
                  ({LIBRARY_PAPER.license}). One of the four is a false claim we planted, which the
                  audit is expected to refute with a counterexample. Extracting claims from any paper
                  and formal proofs come next.
                </p>
                <Link href="/signup" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-8 h-10 px-4")}>
                  Watch an audit run
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </div>

              <ol className="divide-y border-y">
                {CLAIM_LIBRARY.map((c, i) => (
                  <li key={c.id} className="grid grid-cols-[2rem_1fr] gap-x-4 py-5">
                    <span className="font-display text-2xl leading-none text-muted-foreground">{i + 1}</span>
                    <div>
                      <p className="leading-snug">{c.meaning}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="font-mono text-xs tracking-wide uppercase">{c.kind}</span>
                        <span aria-hidden="true">·</span>
                        <span>{c.check}</span>
                        {c.planted && (
                          <span className="rounded-full border border-v-refuted/40 px-2 py-0.5 text-xs text-v-refuted">
                            Planted false claim
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Sponsors */}
        <section aria-labelledby="sponsors-heading" className="border-t">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <p id="sponsors-heading" className="eyebrow">
              Built with
            </p>
            <ul className="mt-8 grid gap-8 sm:grid-cols-3">
              {SPONSORS.map((s) => (
                <li key={s.name}>
                  <p className="font-display text-3xl">{s.name}</p>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{s.role}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
