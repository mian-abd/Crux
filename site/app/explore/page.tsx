import type { Metadata } from "next";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DNAHelix, ProteinViewer } from "@/components/viz-lazy";
import { CODON6, HBB_ACCESSION, HBB_REF, STRUCTURES } from "@/lib/crux/hbb";
import { repoFile } from "@/lib/site";

export const metadata: Metadata = {
  title: "One letter",
  description: "The sickle-cell change in the HBB gene, from one DNA letter to the protein.",
};

// HbS is c.20A>T: the middle letter of codon 6 (legacy numbering), 0-based index 19.
const CHANGE_INDEX = CODON6.start + 1;
const HBS = STRUCTURES["2HBS"];
const HBA = STRUCTURES["1A3N"];

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

export default function ExplorePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-5 pt-20 pb-16 sm:px-8 sm:pt-28">
          <p className="eyebrow">Explore</p>
          <h1 className="mt-5 max-w-3xl font-display text-5xl leading-[1.04] text-balance sm:text-7xl">
            One letter.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Sickle haemoglobin differs from the usual adult form by a single DNA letter in the HBB
            gene. Follow it from the sequence to the protein.
          </p>
        </section>

        <section aria-labelledby="dna-heading" className="border-t">
          <div className="mx-auto grid w-full max-w-6xl gap-x-16 gap-y-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div>
              <p className="eyebrow">1 · The gene</p>
              <h2 id="dna-heading" className="mt-4 font-display text-4xl leading-tight">
                Codon 6: GAG becomes GTG.
              </h2>
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
                <DNAHelix
                  sequence={HBB_REF}
                  highlights={[{ index: CHANGE_INDEX, from: "A", to: "T" }]}
                  autoRotate
                  className="size-full"
                />
              </div>
              <figcaption className="mt-4 text-sm text-muted-foreground">
                The changed letter is marked. Colour is not the only cue: it is also larger and shown
                in bold.
              </figcaption>
            </figure>
          </div>
        </section>

        <section aria-labelledby="protein-heading" className="border-t bg-muted/40">
          <div className="mx-auto grid w-full max-w-6xl gap-x-16 gap-y-10 px-5 py-20 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <figure className="order-last rounded-lg border bg-card p-2 lg:order-first">
              <div className="aspect-[4/3] w-full overflow-hidden rounded-md">
                <ProteinViewer
                  pdbId={HBS.pdbId}
                  highlightResidues={HBS.betaChains.map((chain) => ({ chain, residue: 6 }))}
                  className="size-full"
                />
              </div>
              <figcaption className="px-3 py-3 text-sm text-muted-foreground">
                {HBS.title}, PDB {HBS.pdbId}, {HBS.resolution}. Residue 6 of each beta chain is
                highlighted.
              </figcaption>
            </figure>
            <div>
              <p className="eyebrow">2 · The protein</p>
              <h2 id="protein-heading" className="mt-4 font-display text-4xl leading-tight">
                Glutamate becomes valine.
              </h2>
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
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
