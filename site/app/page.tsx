import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Domains } from "@/components/landing/domains";
import { Loop } from "@/components/landing/loop";
import { Plate } from "@/components/landing/plate";
import { SiteFooter } from "@/components/site-footer";
import { AnnouncementBar, SiteHeader } from "@/components/site-header";
import { REPO_URL, repoFile } from "@/lib/site";

const BATCH04 = "eval/results/task9_batch04.md";
const BATCH03 = "eval/results/task9_batch03.md";

/**
 * Public-domain plates. Sources and licences are in site/README.md ("Images"). `src` stays
 * empty until the file is in public/plates/, and the frame shows plain paper meanwhile.
 */
const PLATES = {
  hero: {
    src: "/plates/lavoisier-apparatus.jpg" as string | undefined,
    alt: "An engraved plate of 18th-century chemical apparatus: flasks, a gasometer and a pneumatic trough.",
    credit: "Apparatus from Lavoisier, Traité élémentaire de chimie (1789), engraved by Marie-Anne Paulze Lavoisier. Public domain.",
    width: 1440,
    height: 876,
  },
  statement: {
    src: "/plates/hooke-flea.jpg" as string | undefined,
    alt: "Robert Hooke's 1665 engraving of a flea seen under a microscope.",
    credit: "A flea under the microscope, Robert Hooke, Micrographia (1665), Schem. XXXIV. Public domain.",
    width: 1920,
    height: 1440,
  },
  banner: {
    src: "/plates/wright-air-pump.jpg" as string | undefined,
    alt: "Joseph Wright of Derby's painting of a demonstration with an air pump, lit by a single candle.",
    credit: "An Experiment on a Bird in the Air Pump, Joseph Wright of Derby (1768), National Gallery, London. Public domain.",
    width: 1920,
    height: 1439,
  },
};

const EXPLORE_CARDS = [
  {
    href: "/explore#genomics",
    image: { src: "/plates/hooke-cork.jpg", alt: "Hooke's 1665 engraving of cork cells under a microscope.", width: 905, height: 935 },
    title: "Genomics",
    tags: ["DNA", "Proteins", "Molecules"],
    body: "From the single DNA letter behind sickle-cell disease to the haemoglobin it builds, in 3D.",
  },
  {
    href: "/explore#statistics",
    image: { src: "/plates/galton-quincunx.png", alt: "Galton's 1889 drawings of the quincunx, balls falling through pins into bins.", width: 744, height: 577 },
    title: "Statistics",
    tags: ["Galton board", "FDR", "Simulation"],
    body: "Simulations you can rerun: coin flips piling into a bell curve, and how Benjamini–Hochberg picks what to believe.",
  },
  {
    href: "/explore#mathematics",
    image: { src: "/plates/euclid-1482.jpg", alt: "Triangle diagrams from the first printed edition of Euclid's Elements, 1482.", width: 400, height: 1100 },
    title: "Mathematics",
    tags: ["Derivation", "Counterexample", "Monte Carlo"],
    body: "A formula derived by SymPy, checked by simulation, and a false claim broken by a counterexample.",
  },
];

const REPORTS = [
  {
    date: "November 15, 2026",
    title: "Batch-04: a fresh held-out suite",
    body: "13 pre-registered cases nobody had run. Swarm 0.811, single agent 0.608; 12 of 12 planted faults against 3.",
    path: BATCH04,
  },
  {
    date: "November 14, 2026",
    title: "Batch-03: the reused suite, and random selection",
    body: "Scores tied, and random experiment choice did as well as information gain. Reported as found.",
    path: BATCH03,
  },
  {
    date: "November 14, 2026",
    title: "A claims audit of the DESeq2 paper",
    body: "Four claims, checked by SymPy and simulation in about 10 seconds for $0. One planted false claim, refuted.",
    path: "docs/CLAIMS.md",
  },
];

const CAVEATS = [
  {
    title: "Two single-agent runs scored 0, and both count.",
    body: "One agent decided the mounted data folder was empty; one hit the $2 cap. Leaving out the first gives +0.147 (+0.025 to +0.299); leaving out both, which can only favour the single agent, gives +0.089 (+0.002 to +0.189).",
    path: BATCH04,
  },
  {
    title: "On the reused seed-43 suite, scores were tied.",
    body: "Pre-registered, the paired difference was −0.064 (−0.242 to 0.080); with three crashed swarm runs repeated, +0.068 (−0.013 to 0.167).",
    path: BATCH03,
  },
  {
    title: "Random experiment choice did as well there.",
    body: "A swarm that picked its checks at random matched information-gain selection on score and cost. A BoxingGym study found no EIG advantage either.",
    path: BATCH03,
  },
  {
    title: "The checks match the planted faults.",
    body: "The library holds diagnostics for exactly the six fault types the suite plants. This shows the checks catch what they were written for, not unknown faults.",
    path: BATCH04,
  },
  {
    title: "One task, small samples.",
    body: "BixBench3 task 9 of 20, from published counts, one run per arm per case.",
    path: BATCH04,
  },
];

function Source({ path, className }: { path: string; className?: string }) {
  return (
    <a
      href={repoFile(path)}
      target="_blank"
      rel="noreferrer"
      className={
        "inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground " +
        (className ?? "")
      }
    >
      {path}
      <ArrowUpRightIcon className="size-3" aria-hidden="true" />
    </a>
  );
}

function CircleArrow() {
  return (
    <span className="grid size-5 place-items-center rounded-full border border-current/40" aria-hidden="true">
      <ArrowRightIcon className="size-3" />
    </span>
  );
}

const WRAP = "mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-12";

export default function Home() {
  return (
    <>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className={`${WRAP} grid items-center gap-12 pt-14 pb-20 sm:pt-20 lg:min-h-[calc(100svh-7rem)] lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 lg:pb-24`}>
          <div>
            <h1 className="font-display text-[3.4rem] leading-[0.98] sm:text-[5.2rem] lg:text-[5.6rem] xl:text-[6.4rem]">
              <span className="block animate-rise">Settled by experiment,</span>
              <span className="block animate-rise text-subtle [animation-delay:80ms]">not by vote.</span>
            </h1>
            <p className="mt-8 max-w-xl animate-rise text-lg leading-relaxed text-muted-foreground [animation-delay:140ms] sm:text-xl">
              Crux is a team of AI scientists. When they disagree about an analysis, a formula or a statistical
              method, they run the experiment expected to tell them the most per dollar, and change their minds only
              on what it shows.
            </p>
            <div className="mt-10 flex animate-rise flex-wrap items-center gap-x-6 gap-y-4 [animation-delay:200ms]">
              <Link href="/signup" className="pill">
                Audit a paper
                <CircleArrow />
              </Link>
              <Link
                href="#results"
                className="inline-flex items-center gap-1.5 text-[0.95rem] font-medium underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground"
              >
                Read the results
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <Plate {...PLATES.hero} priority sizes="(min-width: 1024px) 55vw, 100vw" className="w-full" />
        </section>

        {/* What it tests */}
        <section id="domains" className="scroll-mt-24 border-t">
          <div className={`${WRAP} py-24 sm:py-32`}>
            <div className="max-w-3xl">
              <p className="eyebrow">What it tests</p>
              <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">From a disagreement to an experiment</h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                The same loop runs wherever a claim can be checked: a genomics pipeline, a statistical method, a
                formula in a paper. Every number below is from a recorded run.
              </p>
            </div>
            <div className="mt-16">
              <Domains />
            </div>
          </div>
        </section>

        {/* Statement */}
        <section className={`${WRAP} pb-24 sm:pb-32`}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Plate {...PLATES.statement} imgClassName="aspect-square lg:aspect-auto lg:h-full" className="lg:[&>div]:h-full [&>figcaption]:hidden" />
            <div className="flex flex-col justify-center rounded-2xl bg-card p-8 sm:p-12 lg:p-16">
              <p className="font-display text-4xl leading-[1.08] sm:text-5xl">
                Every rejected idea keeps the evidence that rejected it.
              </p>
              <p className="mt-6 max-w-lg leading-relaxed text-muted-foreground">
                Hard rules live in code, not in prompts. Outcomes are binned by code, a blind referee checks each run
                before any belief moves, and a run can be replayed from its event log alone.
              </p>
              <Link href="#how" className="pill mt-8 self-start">
                How it works
                <CircleArrow />
              </Link>
              <p className="mt-8 text-xs text-muted-foreground">{PLATES.statement.credit}</p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 border-t">
          <div className={`${WRAP} py-24 sm:py-32`}>
            <div className="max-w-3xl">
              <p className="eyebrow">How it works</p>
              <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">One loop, repeated until the evidence runs out</h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Proposers raise competing options. A predictor states what each expects from every diagnostic. The
                engine runs the one worth the most information per cost, and only a valid result moves belief.
              </p>
            </div>
            <div className="mt-16">
              <Loop />
            </div>
          </div>
        </section>

        {/* Results */}
        <section id="results" className="scroll-mt-24 border-t bg-card">
          <div className={`${WRAP} py-24 sm:py-32`}>
            <div className="max-w-3xl">
              <p className="eyebrow">Results · pilot, one task</p>
              <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">What we measured, and what it does not show</h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                BixBench3 task 9: an RNA-seq analysis from published counts, with faults planted in the data. The swarm
                ran against a single gpt-5.5 agent with the same inputs, prompt, sandbox, grader and $2 cap.
              </p>
            </div>

            <div className="mt-16 grid gap-x-20 gap-y-14 lg:grid-cols-[1fr_1.1fr]">
              <div>
                <p className="eyebrow">Batch-04 · 13 fresh pre-registered cases</p>
                <dl className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-8">
                  <div>
                    <dt className="text-sm text-muted-foreground">Swarm, mean score</dt>
                    <dd className="mt-2 font-display text-[3.6rem] leading-none tabular-nums sm:text-8xl">0.811</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Single agent</dt>
                    <dd className="mt-2 font-display text-[3.6rem] leading-none text-subtle tabular-nums sm:text-8xl">0.608</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Faults caught, swarm</dt>
                    <dd className="mt-2 font-display text-5xl leading-none tabular-nums sm:text-7xl">
                      12<span className="text-3xl text-subtle sm:text-4xl"> / 12</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Single agent</dt>
                    <dd className="mt-2 font-display text-5xl leading-none text-subtle tabular-nums sm:text-7xl">
                      3<span className="text-3xl sm:text-4xl"> / 12</span>
                    </dd>
                  </div>
                </dl>
                <p className="mt-10 max-w-md leading-relaxed">
                  Paired difference <span className="font-mono">+0.203</span>, 95% CI{" "}
                  <span className="font-mono">+0.048</span> to <span className="font-mono">+0.382</span>. No crashes, no
                  reruns; $1.17 a run against $1.38. On the clean case: 0.861 against 0.869.
                </p>
                <p className="mt-4">
                  <Source path={BATCH04} />
                </p>
              </div>

              <ul className="divide-y border-y">
                {CAVEATS.map((c) => (
                  <li key={c.title} className="py-6">
                    <h3 className="font-medium">{c.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                    <p className="mt-3">
                      <Source path={c.path} />
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Explore, on ink */}
        <section className="bg-ink text-ink-foreground">
          <div className={`${WRAP} py-24 sm:py-32`}>
            <div className="max-w-3xl">
              <p className="eyebrow text-ink-foreground/60">Explore</p>
              <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">One engine, many sciences</h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-foreground/70">
                Live figures from the domains Crux works in: real structures you can turn, and simulations you can rerun
                in the browser.
              </p>
            </div>
            <ul className="mt-14 grid gap-4 md:grid-cols-3">
              {EXPLORE_CARDS.map((card) => (
                <li key={card.href}>
                  <Link
                    href={card.href}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-foreground/12 bg-ink-foreground/[0.04] transition-colors hover:bg-ink-foreground/[0.08]"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-[#f7f6f3]">
                      <Image
                        src={card.image.src}
                        alt={card.image.alt}
                        width={card.image.width}
                        height={card.image.height}
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-7">
                    <p className="font-display text-3xl">{card.title}</p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {card.tags.map((t) => (
                        <li
                          key={t}
                          className="rounded-full border border-ink-foreground/20 px-2.5 py-1 font-mono text-[0.66rem] tracking-wide uppercase text-ink-foreground/75"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-5 flex-1 leading-relaxed text-ink-foreground/70">{card.body}</p>
                    <p className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium">
                      Explore
                      <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-12 flex justify-center">
              <Link href="/explore" className="pill-light">
                Open the gallery
                <CircleArrow />
              </Link>
            </div>
          </div>
        </section>

        {/* Reports */}
        <section className={`${WRAP} py-24 sm:py-32`}>
          <h2 className="text-center font-display text-5xl leading-[1.02] sm:text-6xl">Reports</h2>
          <ul className="mt-14 grid gap-4 md:grid-cols-3">
            {REPORTS.map((r) => (
              <li key={r.path}>
                <a
                  href={repoFile(r.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex h-full flex-col rounded-2xl border bg-card p-7 transition-colors hover:border-foreground/25"
                >
                  <p className="font-mono text-xs text-muted-foreground">{r.date}</p>
                  <p className="mt-4 font-display text-2xl leading-snug">{r.title}</p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                  <p className="mt-6 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground group-hover:text-foreground">
                    {r.path}
                    <ArrowUpRightIcon className="size-3" aria-hidden="true" />
                  </p>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-12 flex justify-center">
            <a href={repoFile("eval/results")} target="_blank" rel="noreferrer" className="pill">
              All results
              <CircleArrow />
            </a>
          </div>
        </section>

        {/* Closing banner */}
        <section className={`${WRAP} pb-10`}>
          <div className="relative isolate overflow-hidden rounded-3xl bg-ink text-ink-foreground">
            {PLATES.banner.src && (
              <Plate
                {...PLATES.banner}
                sizes="100vw"
                className="absolute inset-0 -z-10 [&>div]:h-full [&>div]:rounded-none [&>figcaption]:hidden"
                imgClassName="h-full opacity-70"
              />
            )}
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/40 to-ink/10" aria-hidden="true" />
            <div className="flex min-h-[30rem] flex-col items-center justify-center px-6 py-20 text-center sm:min-h-[36rem]">
              <h2 className="font-display text-5xl leading-[1.02] sm:text-7xl lg:text-8xl">
                Settle it by
                <br />
                experiment.
              </h2>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link href="/signup" className="pill-light">
                  Start an audit
                  <CircleArrow />
                </Link>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center rounded-full border border-ink-foreground/30 px-5 text-[0.925rem] font-medium transition-colors hover:bg-ink-foreground/10"
                >
                  Read the code
                </a>
              </div>
            </div>
            {PLATES.banner.src && (
              <p className="absolute right-5 bottom-4 left-5 text-right text-[0.7rem] text-ink-foreground/55">
                {PLATES.banner.credit}
              </p>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
