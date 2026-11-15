import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Domains } from "@/components/landing/domains";
import { Loop } from "@/components/landing/loop";
import { Plate } from "@/components/landing/plate";
import { Sponsors } from "@/components/landing/sponsors";
import { GrowthChart } from "@/components/growth-chart";
import { Scoreboard } from "@/components/scoreboard";
import { SiteFooter } from "@/components/site-footer";
import { AnnouncementBar, SiteHeader } from "@/components/site-header";
import { REPO_URL, repoFile } from "@/lib/site";

const BATCH04 = "eval/results/task9_batch04.md";
const BATCH05 = "eval/results/task9_batch05.md";
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
    title: "Batch-05: 52 fresh cases in four suites",
    body: "Three more pre-registered suites in parallel. Swarm 0.817, single agent 0.671; +0.146 (+0.084 to +0.215); 48 of 48 faults against 14.",
    path: BATCH05,
  },
  {
    date: "November 15, 2026",
    title: "Batch-04: the first fresh held-out suite",
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

const RUN1 = "runs/demo/task9_real_swarm_run1.jsonl";

/** Run 1's rejections (the first graded run) and one from tools-run-02, as in docs/SUBMISSION.md. */
const REJECTED = [
  { question: "Were two samples swapped?", option: "Two libraries carry each other's labels", by: "labels_swap_search: as given", posterior: "0.0021" },
  { question: "Is a library duplicated?", option: "One library appears under two names", by: "duplicates_identical: none", posterior: "0.0085" },
  { question: "Is a library degraded?", option: "At least one library is degraded", by: "quality_depth: all usable", posterior: "0.0085" },
  { question: "Is the cell-line column wrong?", option: "Some libraries carry the wrong cell line", by: "cell_line_centroid: as given", posterior: "0.0085" },
  { question: "Are gene-ID versions mixed?", option: "Versioned and unversioned IDs are mixed", by: "gene_strip_check: uniform", posterior: "0.0046" },
  { question: "Filter low-count genes before DESeq2?", option: "Use internal independent filtering only", by: "Exa search of the DESeq2 docs: both", posterior: "0.0172" },
];

/** Where it fell short, what its own logs showed, and what changed (README, "Where it fell short"). */
const FELL_SHORT = [
  { from: "0.586", to: "0.727", short: "Two artifacts scored 0", logs: "Every run's methods said the inputs had no gene annotation.", change: "Added a gene symbol map to the inputs." },
  { from: "0.727", to: "0.833", short: "Behind the single agent's 0.862", logs: "Per-pair refits recovered 427 of 1,232 reference genes.", change: "One DESeq2 fit per cell line (PR #30)." },
  { from: "0.833", to: "0.862", short: "Clean runs from 0.790 to 0.861", logs: "An untested question was applied three different ways.", change: "Untested questions keep the method's defaults (PR #47)." },
  { from: "3", to: "0", short: "Crashed swarm runs, then 0 in 52", logs: "The merge step raised on a malformed plan.", change: "A bad merge plan keeps the proposals (PR #54)." },
];

const LOOPS = [
  {
    title: "Inside a run, with no human",
    stat: "7 tables blocked, repaired",
    body: "The critic checks every deliverable. In run 1 it blocked versioned gene IDs in 7 tables, and the one repair round fixed them, except one ID in 4.",
    path: "eval/results/task9_runs.md",
  },
  {
    title: "From its own diagnostic outcomes",
    stat: "Log loss 0.600 → 0.472",
    body: "The outcome predictor, fine-tuned on 20,640 of the lab's own diagnostic results, beat its base model and the library rows in distribution. The edge went away under shift and on real data, so it stays off.",
    path: "eval/results/predictor_calibration.md",
  },
  {
    title: "From its own runs",
    stat: "+0.010, no effect",
    body: "Six lessons drafted from its dev-case runs, reviewed and frozen, made no measurable difference on 9 held-out cases.",
    path: BATCH03,
  },
];

const CAVEATS = [
  {
    title: "Three single-agent runs scored 0, and they count.",
    body: "One decided the mounted data folder was empty; two hit the $2 cap with no outputs. Leaving out all three cases, which can only favour the single agent, gives +0.104 (+0.057 to +0.154) on 49 cases.",
    path: BATCH05,
  },
  {
    title: "One of the four suites is not significant on its own.",
    body: "Per suite the difference was +0.203, +0.123, +0.147 and +0.112; the last one's interval (−0.010 to +0.276) includes zero.",
    path: BATCH05,
  },
  {
    title: "We do not compare to the 0.523 record.",
    body: "The BixBench3 record covers all 20 tasks from raw reads. Ours is task 9 from the published counts, so the numbers are not comparable.",
    path: "eval/results/task9_runs.md",
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
    body: "The library holds diagnostics for exactly the six fault types the suites plant. This shows the checks catch what they were written for, not unknown faults.",
    path: BATCH05,
  },
  {
    title: "One task, small samples.",
    body: "BixBench3 task 9 of 20, from published counts, one run per arm per case.",
    path: BATCH05,
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
        <section className={`${WRAP} grid items-center gap-12 pt-12 pb-20 sm:pt-14 lg:min-h-[calc(100svh-7rem)] lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 lg:pb-20`}>
          <div>
            <h1 className="font-display text-[3.4rem] leading-[0.98] sm:text-[5rem] lg:text-[5rem] xl:text-[5.6rem]">
              <span className="block animate-rise">Settled by experiment,</span>
              <span className="block animate-rise text-subtle [animation-delay:80ms]">not by vote.</span>
            </h1>
            <p className="mt-6 max-w-xl animate-rise text-lg leading-relaxed text-muted-foreground [animation-delay:140ms] sm:text-xl">
              Crux is a team of AI scientists. When they disagree about an analysis, a formula or a statistical
              method, they run the experiment expected to tell them the most per dollar, and change their minds only
              on what it shows.
            </p>
            <div className="mt-8 flex animate-rise flex-wrap items-center gap-x-6 gap-y-4 [animation-delay:200ms]">
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
            <dl className="mt-10 grid max-w-xl animate-rise gap-x-8 gap-y-6 border-t pt-6 [animation-delay:260ms] sm:grid-cols-[1.4fr_1fr_1fr]">
              <div className="flex flex-col-reverse">
                <dt className="mt-1.5 text-sm leading-snug text-muted-foreground">Clean case, first run to now</dt>
                <dd className="font-display text-[2.1rem] leading-none whitespace-nowrap tabular-nums">
                  0.586<span className="text-subtle"> → </span>0.864
                </dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="mt-1.5 text-sm leading-snug text-muted-foreground">Over a single gpt-5.5 agent, 52 fresh cases</dt>
                <dd className="font-display text-[2.1rem] leading-none text-brand tabular-nums">+0.146</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="mt-1.5 text-sm leading-snug text-muted-foreground">Planted faults caught (single agent: 14)</dt>
                <dd className="font-display text-[2.1rem] leading-none tabular-nums">48/48</dd>
              </div>
            </dl>
            <Link
              href="#improves"
              className="mt-5 inline-flex animate-rise items-center gap-1.5 text-sm text-muted-foreground underline decoration-border underline-offset-4 [animation-delay:300ms] hover:text-foreground"
            >
              How it got there
              <ArrowRightIcon className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
          <Plate {...PLATES.hero} priority sizes="(min-width: 1024px) 55vw, 100vw" className="w-full" />
        </section>

        {/* How far it came (self-improvement) */}
        <section id="improves" className="scroll-mt-24 border-t bg-card">
          <div className={`${WRAP} py-24 sm:py-32`}>
            <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <p className="eyebrow">How far it came</p>
                <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">
                  From 0.586 to 0.864, then ahead on cases it had never seen
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                  On its first graded run the swarm scored 0.586 on the clean case, well behind a single frontier agent.
                  Each fix below came from a failure in its own logs, and each batch after it was pre-registered. It now
                  matches the single agent on the clean case, and on 52 fresh cases with planted faults it scores 0.817
                  against 0.671 and catches all 48 faults.
                </p>
              </div>
              <div className="rounded-3xl border bg-background p-5 sm:p-8">
                <GrowthChart />
              </div>
            </div>

            <ol className="mt-12 grid gap-3 lg:grid-cols-4">
              {FELL_SHORT.map((s, i) => (
                <li key={s.from} className="flex flex-col rounded-2xl border bg-background p-6">
                  <p className="text-sm text-muted-foreground">Step {i + 1} · {s.short}</p>
                  <p className="mt-4 font-display text-4xl leading-none tabular-nums">
                    <span className="text-subtle">{s.from}</span> <span className="text-subtle">→</span>{" "}
                    <span className="text-foreground">{s.to}</span>
                  </p>
                  <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">The logs: </span>
                    {s.logs}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">The change: </span>
                    {s.change}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              We made these four fixes; the system did not change its own code. Inputs and the prompt changed along the way,
              so this is not a learning curve. Now, on 52 fresh cases: +0.146, with 48 of 48 faults caught.
            </p>

            <h3 className="mt-16 font-display text-3xl">Loops that run on their own</h3>
            <ul className="mt-6 grid gap-3 md:grid-cols-3">
              {LOOPS.map((l) => (
                <li key={l.title} className="flex flex-col rounded-2xl border bg-background p-6">
                  <p className="text-sm text-muted-foreground">{l.title}</p>
                  <p className="mt-3 font-display text-3xl leading-tight">{l.stat}</p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{l.body}</p>
                  <p className="mt-4">
                    <Source path={l.path} />
                  </p>
                </li>
              ))}
            </ul>
          </div>
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
              <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">On cases nobody had seen, the swarm scored higher</h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                BixBench3 task 9: an RNA-seq analysis from published counts, with faults planted in the data. The swarm
                ran against a single gpt-5.5 agent with the same inputs, prompt, sandbox, grader and $2 cap.
              </p>
            </div>

            <Scoreboard className="mt-14" />
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/app/live" className="pill">
                Start a live run
                <CircleArrow />
              </Link>
              <Link
                href="/runs"
                className="inline-flex items-center gap-1.5 text-[0.95rem] font-medium underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground"
              >
                Watch a graded run
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
              <p className="text-sm text-muted-foreground">
                Sign in to run the swarm on a real task 9 case (about 6 minutes), or replay graded runs: every check, referee verdict, belief update and rejection.
              </p>
            </div>

            <div className="mt-16">
              <h3 className="font-display text-3xl">What it does not show</h3>
              <ul className="mt-8 grid gap-x-12 gap-y-0 md:grid-cols-2">
                {CAVEATS.map((c) => (
                  <li key={c.title} className="border-t py-6">
                    <p className="font-medium">{c.title}</p>
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

        {/* What it rejected (Track 3 asks for it) */}
        <section id="rejected" className="scroll-mt-24 border-t">
          <div className={`${WRAP} py-24 sm:py-32`}>
            <div className="max-w-3xl">
              <p className="eyebrow">What it rejected</p>
              <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">Every rejection keeps the evidence behind it</h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                What the swarm ruled out matters as much as what it found. The first five options fell below posterior 0.02
                in the first graded run; the last one fell in a run with documentation search on. Thirteen questions in the
                first run ended unresolved and were reported that way, not guessed.
              </p>
            </div>
            <div className="mt-12 overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full min-w-[40rem] text-left text-[0.95rem]">
                <thead>
                  <tr className="border-b text-sm text-muted-foreground">
                    <th className="px-6 py-4 font-normal">Question</th>
                    <th className="px-6 py-4 font-normal">Rejected option</th>
                    <th className="px-6 py-4 font-normal">Rejected by</th>
                    <th className="px-6 py-4 text-right font-normal">Posterior</th>
                  </tr>
                </thead>
                <tbody>
                  {REJECTED.map((r) => (
                    <tr key={r.question} className="border-b last:border-0">
                      <td className="px-6 py-4 font-medium">{r.question}</td>
                      <td className="px-6 py-4 text-muted-foreground line-through decoration-v-refuted/60">{r.option}</td>
                      <td className="px-6 py-4 font-mono text-sm">{r.by}</td>
                      <td className="px-6 py-4 text-right font-mono text-sm text-v-refuted tabular-nums">{r.posterior}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/runs"
                className="inline-flex items-center gap-1.5 text-[0.95rem] font-medium underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground"
              >
                Replay the run and its rejected ledger
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
              <Source path={RUN1} />
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
                          className="rounded-full border border-ink-foreground/20 px-3 py-1 text-[0.8rem] text-ink-foreground/75"
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

        {/* Sponsors */}
        <section id="sponsors" className={`${WRAP} scroll-mt-24 pt-24 sm:pt-32`}>
          <div className="max-w-3xl">
            <p className="eyebrow">Built with</p>
            <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">What each sponsor does in Crux</h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Every tool below runs in the product, and each card links to the evidence.
            </p>
          </div>
          <div className="mt-14">
            <Sponsors />
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
