import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Domains } from "@/components/landing/domains";
import { GradedRunPreview } from "@/components/landing/graded-run-preview";
import { Loop } from "@/components/landing/loop";
import { Plate } from "@/components/landing/plate";
import { Sponsors } from "@/components/landing/sponsors";
import { GrowthChart } from "@/components/growth-chart";
import { Scoreboard } from "@/components/scoreboard";
import { SiteFooter } from "@/components/site-footer";
import { AnnouncementBar, SiteHeader } from "@/components/site-header";
import { REPO_URL, repoFile } from "@/lib/site";

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
    body: "One DNA letter, the protein it builds, and molecules you can turn in 3D.",
  },
  {
    href: "/explore#statistics",
    image: { src: "/plates/galton-quincunx.png", alt: "Galton's 1889 drawings of the quincunx, balls falling through pins into bins.", width: 744, height: 577 },
    title: "Statistics",
    tags: ["Galton board", "FDR", "Simulation"],
    body: "A Galton board, and how Benjamini–Hochberg decides which results to believe.",
  },
  {
    href: "/explore#mathematics",
    image: { src: "/plates/euclid-1482.jpg", alt: "Triangle diagrams from the first printed edition of Euclid's Elements, 1482.", width: 400, height: 1100 },
    title: "Mathematics",
    tags: ["Derivation", "Counterexample", "Monte Carlo"],
    body: "A formula derived and checked, and a false claim broken by a counterexample.",
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
    title: "A focused pilot.",
    body: "One task, 52 cases across four suites, one run per approach, and checks for six known fault types. All three zero-score single-agent runs count; one suite is inconclusive on its own. Published-count results are not comparable to the full raw-read benchmark.",
    path: BATCH05,
  },
  {
    title: "The selection advantage is still open.",
    body: "Earlier Task 9 comparisons were inconclusive, and random diagnostic selection matched information gain. BoxingGym also showed no EIG advantage. General-purpose auditing and detection of unknown fault types remain unproven.",
    path: BATCH03,
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
                href="#runs"
                className="inline-flex items-center gap-1.5 text-[0.95rem] font-medium underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground"
              >
                Watch a graded run
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
              <Link href="#runs" className="pill">
                Watch a graded run
                <CircleArrow />
              </Link>
              <a
                href={repoFile("eval/results")}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[0.95rem] font-medium underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground"
              >
                All results
                <ArrowUpRightIcon className="size-4" aria-hidden="true" />
              </a>
            </div>

            <div className="mt-8 max-w-4xl border-t pt-4">
              <h3 className="text-xs font-medium text-muted-foreground">What it does not show</h3>
              <ul className="mt-3 grid gap-x-8 gap-y-3 md:grid-cols-2">
                {CAVEATS.map((c) => (
                  <li key={c.title} className="text-xs leading-relaxed text-muted-foreground">
                    <p><span className="font-medium text-foreground/80">{c.title}</span> {c.body}</p>
                    <p className="mt-1">
                      <a href={repoFile(c.path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[0.7rem] underline decoration-border underline-offset-4 hover:text-foreground">
                        Full report <ArrowUpRightIcon className="size-3" aria-hidden="true" />
                      </a>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Graded runs */}
        <section id="runs" className="scroll-mt-24 border-t">
          <div className={`${WRAP} py-24 sm:py-32`}>
            <div className="max-w-3xl">
              <p className="eyebrow">Graded runs</p>
              <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">Watch it work</h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Real task 9 runs, replayed from their logs: the questions the agents raised, the checks they chose, the
                referee&apos;s verdicts and how belief moved. Nothing is redrawn after the fact.
              </p>
            </div>
            <div className="mt-12 grid gap-8 lg:grid-cols-[1.45fr_0.55fr] lg:items-start">
              <GradedRunPreview />
              <aside>
                <h3 className="font-display text-3xl leading-tight">What it ruled out, and why</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Each of these lost to a check, not a vote. Thirteen questions in run 1 stayed open, and the report says so.
                </p>
                <ul className="mt-6 divide-y border-y">
                  {REJECTED.map((r) => (
                    <li key={r.question} className="py-3.5">
                      <p className="text-sm font-medium">{r.question}</p>
                      <p className="mt-1 text-sm text-muted-foreground line-through decoration-v-refuted/60">{r.option}</p>
                      <p className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                        <span>{r.by}</span>
                        <span className="font-mono text-v-refuted tabular-nums">{r.posterior}</span>
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4">
                  <Source path={RUN1} />
                </p>
              </aside>
            </div>
          </div>
        </section>

        {/* Sponsors */}
        <section id="sponsors" className={`${WRAP} scroll-mt-24 border-t py-24 sm:py-32`}>
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

        {/* One engine, many sciences */}
        <section id="explore" className="dark scroll-mt-24 bg-ink text-foreground">
          <div className={`${WRAP} py-24 sm:py-32`}>
            <div className="max-w-3xl">
              <p className="eyebrow">Explore</p>
              <h2 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">One engine, many sciences</h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                The same loop runs wherever a claim can be checked: a genomics pipeline, a statistical method, a formula
                in a paper. Pick a field for the numbers from a recorded run, or open its live figures.
              </p>
            </div>
            <div className="mt-14">
              <Domains />
            </div>
            <ul className="mt-14 grid gap-3 md:grid-cols-3">
              {EXPLORE_CARDS.map((card) => (
                <li key={card.href}>
                  <Link
                    href={card.href}
                    className="group flex h-full items-stretch overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/30"
                  >
                    <div className="relative w-28 shrink-0 overflow-hidden bg-[#f7f6f3]">
                      <Image
                        src={card.image.src}
                        alt={card.image.alt}
                        width={card.image.width}
                        height={card.image.height}
                        sizes="112px"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="font-display text-2xl">{card.title}</p>
                      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
                      <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium">
                        Live figures
                        <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-10">
              <Link href="/explore" className="pill">
                Open the gallery
                <CircleArrow />
              </Link>
            </div>
          </div>
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
