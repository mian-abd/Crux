// The Explore gallery, shared by the public page (/explore) and the page
// inside the signed-in app shell (/app/explore). `shell` only changes the
// outer spacing: the public page runs full-bleed bands, the app page sits in
// the shell's own container.

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { BhFwerCounterexample } from "@/components/explore/figures/bh-fwer-counterexample";
import { BhThreshold } from "@/components/explore/figures/bh-threshold";
import { EigToy } from "@/components/explore/figures/eig-toy";
import { SourceLink } from "@/components/explore/figures/figure-parts";
import { GaltonBoard } from "@/components/explore/figures/galton-board";
import { NbVariancePlot } from "@/components/explore/figures/nb-variance-plot";
import { RecordedEig } from "@/components/explore/figures/recorded-eig";
import { GalleryCard } from "@/components/explore/gallery-card";
import { HeroSpecimen } from "@/components/explore/hero-specimen";
import { StoryHelix, StoryProtein } from "@/components/explore/live-figure";
import { DRUG_COMPLEX, GENOMICS, MOLECULES, PROTEINS } from "@/components/viz/gallery/catalog";
import { CODON6, HBB_ACCESSION, HBB_REF, STRUCTURES } from "@/lib/crux/hbb";
import { repoFile } from "@/lib/site";
import { cn } from "@/lib/utils";

type Shell = "site" | "app";

// HbS is c.20A>T: the middle letter of codon 6 (legacy numbering), 0-based index 19.
const CHANGE_INDEX = CODON6.start + 1;
const HBS = STRUCTURES["2HBS"];
const HBA = STRUCTURES["1A3N"];

const SECTIONS = [
  { id: "genomics", label: "Genomics", count: `${GENOMICS.length + 2} views` },
  { id: "structural-biology", label: "Structural biology", count: `${PROTEINS.length + 1} views` },
  { id: "chemistry", label: "Chemistry", count: `${MOLECULES.length} views` },
  { id: "statistics", label: "Statistics", count: "2 figures" },
  { id: "mathematics", label: "Mathematics", count: "2 figures" },
  { id: "experimental-design", label: "Experimental design", count: "2 figures" },
];

/** CPK swatches for the chemistry key. The values are CPK in components/viz/gallery/molecule.ts. */
const ELEMENT_KEY = [
  { symbol: "C", name: "carbon", swatch: "bg-[#4c525c] dark:bg-[#8f97a3]" },
  { symbol: "H", name: "hydrogen", swatch: "bg-[#e3e6ea] ring-1 ring-foreground/25 dark:bg-[#eef0f2]" },
  { symbol: "N", name: "nitrogen", swatch: "bg-[#1f53b8] dark:bg-[#83b3fa]" },
  { symbol: "O", name: "oxygen", swatch: "bg-[#c9322e] dark:bg-[#fc7a75]" },
];

function Codons() {
  const codons = HBB_REF.match(/.{3}/g) ?? [];
  return (
    <p className="flex flex-wrap gap-x-2.5 gap-y-2 font-mono text-sm" aria-label="The first 27 letters of the HBB coding sequence, in codons">
      {codons.map((codon, i) => {
        const isSix = i * 3 === CODON6.start;
        return (
          <span key={i} className={isSix ? "rounded-sm bg-v-refuted/15 px-1 font-semibold text-v-refuted" : "text-muted-foreground"}>
            {codon}
          </span>
        );
      })}
    </p>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A full-bleed band on the public page; a ruled block inside the app shell. */
function Band({
  shell,
  tinted = false,
  className,
  children,
  ...rest
}: React.ComponentProps<"section"> & { shell: Shell; tinted?: boolean }) {
  if (shell === "app") {
    return (
      <section className={cn("scroll-mt-20 border-t py-12 first:border-t-0 first:pt-0", className)} {...rest}>
        {children}
      </section>
    );
  }
  return (
    <section className={cn("scroll-mt-16 border-t", tinted && "bg-muted/40", className)} {...rest}>
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">{children}</div>
    </section>
  );
}

function SectionHead({
  index,
  eyebrow,
  title,
  headingId,
  children,
}: {
  index: string;
  eyebrow: string;
  title: string;
  headingId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">
        <span className="text-foreground">{index}</span> · {eyebrow}
      </p>
      <h2 id={headingId} className="mt-4 font-display text-4xl leading-[1.08] text-balance sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function NextNote({ children }: { children: React.ReactNode }) {
  return (
    <aside className="mt-10 grid gap-x-8 gap-y-2 rounded-lg border border-dashed p-5 sm:grid-cols-[11rem_1fr] sm:p-6">
      <p className="eyebrow pt-0.5">Where Crux goes next</p>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{children}</p>
    </aside>
  );
}

export function ExploreContent({ shell }: { shell: Shell }) {
  const app = shell === "app";
  return (
    <>
      <section
        className={cn(
          "grid items-center gap-x-10 gap-y-8 lg:grid-cols-[1.25fr_1fr]",
          app ? "border-b pb-10" : "mx-auto w-full max-w-6xl px-5 pt-16 pb-14 sm:px-8 sm:pt-24",
        )}
      >
        <div>
        <p className="eyebrow">Explore</p>
        <h1
          className={cn(
            "mt-5 max-w-3xl font-display leading-[1.04] text-balance",
            app ? "text-4xl sm:text-5xl" : "text-5xl sm:text-7xl",
          )}
        >
          One letter, and what is built from it.
        </h1>
        <p className={cn("mt-6 max-w-2xl leading-relaxed text-muted-foreground", app ? "text-lg" : "text-lg sm:text-xl")}>
          Start with the single DNA letter behind sickle-cell disease. Then real structures you can
          turn: DNA, proteins and small molecules, drawn in the browser from public data. Then the
          statistics and mathematics the engine checks, and how it chooses which experiment to run.
        </p>
        <nav aria-label="Gallery sections" className="mt-10 flex flex-wrap gap-2.5">
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="group inline-flex items-baseline gap-2.5 rounded-md border px-3.5 py-2 text-sm transition-colors hover:border-foreground/30 hover:bg-muted/60"
            >
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              <span>{s.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{s.count}</span>
            </a>
          ))}
        </nav>
        </div>
        <HeroSpecimen
          name="caffeine"
          caption="Caffeine · 24 atoms · nitrogen and oxygen lettered"
          className="mx-auto w-full max-w-md lg:max-w-none"
        />
      </section>

      {/* 01 Genomics: the sickle-cell story, then measured DNA structures. */}
      <Band shell={shell} id="genomics" aria-labelledby="genomics-heading">
        <SectionHead index="01" eyebrow="Genomics" title="One letter." headingId="genomics-heading">
          Sickle haemoglobin differs from the usual adult form by a single DNA letter in the HBB
          gene. Follow it from the sequence to the protein.
        </SectionHead>

        <div className="mt-14 grid gap-x-16 gap-y-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <p className="eyebrow">The gene</p>
            <h3 className="mt-4 font-display text-3xl leading-tight sm:text-4xl">Codon 6: GAG becomes GTG.</h3>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              The first 27 letters of the HBB coding sequence are shown, three to a codon. Codon 6
              in the legacy numbering, which leaves out the starting methionine, is letters 19 to
              21. In HbS its middle letter, an A, is a T.
            </p>
            <div className="mt-6">
              <Codons />
            </div>
            <dl className="mt-6 divide-y border-y">
              <Fact term="Sequence">
                NCBI RefSeq <span className="font-mono text-xs">{HBB_ACCESSION}</span>
              </Fact>
              <Fact term="Change">
                <span className="font-mono text-xs">c.20A&gt;T</span>, dbSNP{" "}
                <span className="font-mono text-xs">rs334</span>
              </Fact>
              <Fact term="Codon">
                <span className="font-mono text-xs">GAG</span> to <span className="font-mono text-xs">GTG</span>
              </Fact>
            </dl>
          </div>
          <figure className="rounded-lg border bg-card p-4 sm:p-6">
            <div className="aspect-[16/7] w-full">
              <StoryHelix sequence={HBB_REF} changeIndex={CHANGE_INDEX} from="A" to="T" />
            </div>
            <figcaption className="mt-4 text-sm text-muted-foreground">
              A helix drawn from the sequence, with textbook B-DNA geometry. The changed letter is
              marked. Colour is not the only cue: it is also larger and shown in bold.
            </figcaption>
          </figure>
        </div>

        <div className="mt-20 grid gap-x-16 gap-y-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <figure className="order-last rounded-lg border bg-card p-2 lg:order-first">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-md">
              <StoryProtein pdbId={HBS.pdbId} chains={HBS.betaChains} residue={6} />
            </div>
            <figcaption className="px-3 py-3 text-sm text-muted-foreground">
              {HBS.title}, PDB {HBS.pdbId}, {HBS.resolution}. Residue 6 of each beta chain is
              highlighted.
            </figcaption>
          </figure>
          <div>
            <p className="eyebrow">The protein</p>
            <h3 className="mt-4 font-display text-3xl leading-tight sm:text-4xl">Glutamate becomes valine.</h3>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              GAG codes for glutamate and GTG for valine, so residue 6 of the beta chain changes.
              The structure shown is deoxy sickle haemoglobin, where that residue is valine.
            </p>
            <dl className="mt-6 divide-y border-y">
              <Fact term="Protein change">
                Glu6Val in the legacy numbering (<span className="font-mono text-xs">p.Glu7Val</span>)
              </Fact>
              <Fact term="Sickle form">
                PDB {HBS.pdbId}: beta 6 is {HBS.beta6}, chains {HBS.betaChains.join(", ")}
              </Fact>
              <Fact term="Usual form">
                PDB {HBA.pdbId}: beta 6 is {HBA.beta6} ({HBA.title.toLowerCase()}, {HBA.resolution})
              </Fact>
            </dl>
            <p className="mt-6 text-sm text-muted-foreground">
              Every value here is reference data with its source in{" "}
              <a
                href={repoFile("web/src/lib/hbb.ts")}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs underline underline-offset-4 hover:text-foreground"
              >
                web/src/lib/hbb.ts
              </a>{" "}
              and{" "}
              <a
                href={repoFile("labs/oneletter/variants.py")}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs underline underline-offset-4 hover:text-foreground"
              >
                labs/oneletter/variants.py
              </a>
              . None of it is a measurement.
            </p>
          </div>
        </div>

        <Link
          href="/runs#jetson"
          className="group mt-14 flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card px-6 py-5 transition-colors hover:border-foreground/30"
        >
          <span>
            <span className="eyebrow">Measured, on hardware</span>
            <span className="mt-2 block font-display text-2xl leading-snug">
              Crux reading this letter through a camera on a Jetson
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              It settles HbS from two reads, catches a swapped strip and names it HbC, in 26 seconds. A recorded
              live run.
            </span>
          </span>
          <ArrowRightIcon
            className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>

        <div className="mt-20">
          <p className="eyebrow">DNA, as measured</p>
          <h3 className="mt-4 max-w-2xl font-display text-3xl leading-tight sm:text-4xl">
            The same helix, from experiment.
          </h3>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
            The helix above is geometry. These three are atomic structures solved by X-ray
            crystallography: DNA alone, DNA bent by a protein, and DNA held by Cas9.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GENOMICS.map((item) => (
              <GalleryCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </Band>

      {/* 02 Structural biology */}
      <Band shell={shell} tinted id="structural-biology" aria-labelledby="structural-heading">
        <SectionHead
          index="02"
          eyebrow="Structural biology"
          title="Proteins, atom by atom."
          headingId="structural-heading"
        >
          Five entries from the Protein Data Bank, loaded from RCSB as you scroll. Ribbons trace
          each chain; the parts that do the work are drawn as sticks or spheres.
        </SectionHead>
        <div className="mt-12 grid grid-flow-row-dense gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PROTEINS.slice(0, 3).map((item) => (
            <GalleryCard key={item.id} item={item} />
          ))}
          <GalleryCard item={DRUG_COMPLEX} wide className="sm:col-span-2" />
          {PROTEINS.slice(3).map((item) => (
            <GalleryCard key={item.id} item={item} />
          ))}
        </div>
        <NextNote>
          Crux did not analyse these proteins. Today the engine audits statistical claims in a
          paper&apos;s analysis. Claims about structures, such as whether a drug sits where a paper
          says it does, are a domain it could audit next. The views here are illustrations, drawn
          from public Protein Data Bank entries.
        </NextNote>
      </Band>

      {/* 03 Chemistry */}
      <Band shell={shell} id="chemistry" aria-labelledby="chemistry-heading">
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
          <SectionHead index="03" eyebrow="Chemistry" title="Small molecules, bond by bond." headingId="chemistry-heading">
            Nine molecules as ball-and-stick models. Each ball is an atom and each stick a bond.
            Nitrogen and oxygen carry their letter.
          </SectionHead>
          <ul aria-label="Colour key for elements" className="flex flex-wrap gap-x-5 gap-y-2 pb-1.5 text-sm">
            {ELEMENT_KEY.map((e) => (
              <li key={e.symbol} className="inline-flex items-center gap-2">
                <span aria-hidden="true" className={cn("size-3 rounded-full", e.swatch)} />
                <span className="font-mono text-xs">{e.symbol}</span>
                <span className="text-muted-foreground">{e.name}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MOLECULES.map((item) => (
            <GalleryCard key={item.id} item={item} />
          ))}
        </div>
        <NextNote>
          Crux did not analyse these molecules either. Chemistry is another domain the engine could
          audit next, for example a paper&apos;s claims about a compound&apos;s measured properties.
          The models are illustrations, built from the structure files that ship with the three.js
          molecules example.
        </NextNote>
      </Band>

      {/* 04 Statistics: two seeded simulations, run in the browser. */}
      <Band shell={shell} tinted id="statistics" aria-labelledby="statistics-heading">
        <SectionHead index="04" eyebrow="Statistics" title="Chance, counted." headingId="statistics-heading">
          Two simulations that run in your browser from a seeded random number generator, so a seed
          always draws the same picture. Neither is a Crux run. They show two ideas the claims audit
          leans on: coin flips add up to a bell curve, and when many tests run at once, the rule
          for which results to believe decides how many false finds get through.
        </SectionHead>
        <div className="mt-12 grid items-start gap-5 lg:grid-cols-2">
          <GaltonBoard />
          <BhThreshold />
        </div>
        <NextNote>
          These are teaching figures. The claims audit that checks statements like these in a
          paper&apos;s analysis is an MVP on four hand-curated claims: their options and diagnostics
          were written by hand before the run, and pulling claims out of an arbitrary paper is not
          built yet (<SourceLink path="runs/demo/claims-deseq2-20261114/artifacts/CLAIMS.md">CLAIMS.md</SourceLink>).
        </NextNote>
      </Band>

      {/* 05 Mathematics: two recorded verdicts, each re-checked in the browser. */}
      <Band shell={shell} id="mathematics" aria-labelledby="mathematics-heading">
        <SectionHead index="05" eyebrow="Mathematics" title="One formula holds. One claim is false." headingId="mathematics-heading">
          Both verdicts are recorded from the claims audit of the DESeq2 paper, run on 14 November
          2026. The first is a formula from the paper&apos;s Methods; the second is a false claim
          planted to test the audit. The plots beside them are recomputed in your browser from a
          seeded generator.
        </SectionHead>
        <div className="mt-12 grid gap-5">
          <NbVariancePlot />
          <BhFwerCounterexample />
        </div>
        <NextNote>
          Formal proofs are next, and not built. Today the symbolic check is an exact SymPy
          derivation and the rest is simulation, which is evidence at the settings tried rather than
          a proof. Writing derivations like the one above in Lean would turn a recorded verdict into
          a machine-checked one.
        </NextNote>
      </Band>

      {/* 06 Experimental design: a recorded EIG ranking, then a toy that computes EIG live. */}
      <Band shell={shell} tinted id="experimental-design" aria-labelledby="design-heading">
        <SectionHead index="06" eyebrow="Experimental design" title="Run the most informative check first." headingId="design-heading">
          Crux scores each candidate check by its expected information gain per unit of cost, runs
          the best one, then updates its beliefs with Bayes&apos; rule. The ranking below is
          recorded from a real run. The toy after it computes EIG in your browser.
        </SectionHead>
        <div className="mt-12 grid gap-5">
          <RecordedEig />
          <EigToy />
        </div>
        <NextNote>
          Ranking by EIG is a bet, not a proven edge. In a BoxingGym study, choosing measurements by
          EIG showed no advantage over choosing them at random: the paired 95% interval includes
          zero (<SourceLink path="eval/results/boxing/README.md" />). The order in the run above is
          the engine&apos;s stated reason for what it ran first. Showing that this order reaches
          answers sooner than chance is still open.
        </NextNote>
      </Band>
    </>
  );
}
