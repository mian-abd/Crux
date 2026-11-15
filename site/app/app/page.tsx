import { ArrowRightIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { StartAuditButton } from "@/components/app/start-audit-button";
import { UploadDropzone } from "@/components/app/upload-dropzone";
import { GrowthChart } from "@/components/growth-chart";
import { Scoreboard } from "@/components/scoreboard";
import { Chip } from "@/components/verdict-chip";
import { LIBRARY_PAPER } from "@/lib/claim-library";
import { dateTime, fileSize, plural } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { listPapers, type PaperSummary } from "@/lib/server/papers";

export const metadata: Metadata = { title: "Home" };

function StatusChip({ paper }: { paper: PaperSummary }) {
  if (paper.status === "extracted") {
    return (
      <Chip className={paper.checkableCount > 0 ? "border-v-holds/40 bg-v-holds/10 text-v-holds" : undefined}>
        {paper.checkableCount} of {plural(paper.claimCount, "claim")} checkable
      </Chip>
    );
  }
  if (paper.status === "failed") {
    return <Chip className="border-destructive/40 bg-destructive/10 text-destructive">Extraction failed</Chip>;
  }
  return <Chip>Claims not extracted</Chip>;
}

function CardImage({ src, alt, width, height, position = "center" }: { src: string; alt: string; width: number; height: number; position?: string }) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-[#f7f6f3]">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(min-width: 1024px) 33vw, 100vw"
        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        style={{ objectPosition: position }}
      />
    </div>
  );
}

export default async function HomePage() {
  const user = await requireUser("/app");
  const papers = listPapers(user.id);
  const firstName = user.name.trim().split(/\s+/)[0] || "there";

  return (
    <div className="space-y-12">
      {/* Welcome */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-ink text-ink-foreground">
        <Image
          src="/plates/wright-air-pump.jpg"
          alt="Joseph Wright of Derby's painting of an air-pump demonstration, lit by one candle."
          width={1920}
          height={1439}
          priority
          sizes="(min-width: 1024px) 75vw, 100vw"
          className="absolute inset-0 -z-20 size-full object-cover object-[50%_35%] opacity-75"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/75 to-ink/10" aria-hidden="true" />
        <div className="flex min-h-[20rem] max-w-2xl flex-col justify-end p-7 sm:min-h-[24rem] sm:p-10">
          <p className="text-[0.95rem] text-ink-foreground/70">Workspace</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.02] sm:text-6xl">Good to see you, {firstName}.</h1>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-foreground/75">
            Start the swarm on a real BixBench3 case and watch it work, audit a paper&apos;s claims, or explore what it can test.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/app/live" className="pill-light">
              Start a live run
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/app/upload"
              className="inline-flex h-11 items-center rounded-full border border-ink-foreground/30 px-5 text-[0.925rem] font-medium transition-colors hover:bg-ink-foreground/10"
            >
              Upload a paper
            </Link>
          </div>
          <dl className="mt-8 grid max-w-xl grid-cols-[1.4fr_1fr_1fr] gap-4 border-t border-ink-foreground/15 pt-5">
            <div className="flex flex-col-reverse">
              <dt className="mt-1 text-xs leading-snug text-ink-foreground/60">Clean case, first run to now</dt>
              <dd className="font-display text-xl leading-none whitespace-nowrap tabular-nums sm:text-3xl">0.586 → 0.864</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="mt-1 text-xs leading-snug text-ink-foreground/60">Over a single agent, 52 fresh cases</dt>
              <dd className="font-display text-xl leading-none text-brand-soft tabular-nums sm:text-3xl">+0.146</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="mt-1 text-xs leading-snug text-ink-foreground/60">Planted faults caught</dt>
              <dd className="font-display text-xl leading-none tabular-nums sm:text-3xl">48/48</dd>
            </div>
          </dl>
        </div>
        <p className="absolute right-5 bottom-4 hidden text-[0.7rem] text-ink-foreground/50 sm:block">
          Joseph Wright of Derby, An Experiment on a Bird in the Air Pump (1768). Public domain.
        </p>
      </section>

      {/* Results */}
      <section aria-labelledby="results-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="results-heading" className="font-display text-3xl sm:text-4xl">
            Where it stands: 52 fresh cases
          </h2>
          <div className="flex flex-wrap items-center gap-5 text-sm">
            <Link href="/app/graded" className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">
              Watch a graded run
            </Link>
            <Link href="/#results" className="text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
              Caveats and earlier batches
            </Link>
          </div>
        </div>
        <Scoreboard compact className="mt-6" />
      </section>

      {/* How far it came */}
      <section aria-labelledby="growth-heading" className="grid items-center gap-8 rounded-3xl border bg-card p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="growth-heading" className="font-display text-3xl sm:text-4xl">
            How far it came
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            The swarm&apos;s first graded run scored 0.586 on the clean case, behind a single frontier agent. Four fixes, each
            from a failure in its own logs, brought it to 0.864. On cases it had never seen, it now scores 0.817 against
            0.671 and catches every planted fault.
          </p>
          <Link
            href="/#improves"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            What changed at each step
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <GrowthChart />
      </section>

      {/* Start here */}
      <section aria-labelledby="start-heading">
        <h2 id="start-heading" className="font-display text-3xl sm:text-4xl">
          Start here
        </h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          <li>
            <Link href="/app/upload" className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/25">
              <CardImage src="/plates/lavoisier-apparatus.jpg" alt="Lavoisier's engraved chemistry apparatus, 1789." width={1440} height={876} />
              <div className="flex flex-1 flex-col p-6">
                <p className="font-display text-2xl">Upload a paper</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  Drop in a PDF. Its claims are listed by kind, each with a quote checked word for word against the text.
                </p>
                <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium">
                  Upload
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </p>
              </div>
            </Link>
          </li>
          <li>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card">
              <CardImage src="/plates/euclid-1482.jpg" alt="Triangle diagrams from the first printed Euclid, 1482." width={400} height={1100} position="50% 30%" />
              <div className="flex flex-1 flex-col p-6">
                <p className="font-display text-2xl">Run the claims audit</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  Four claims from the DESeq2 paper ({LIBRARY_PAPER.venue}), one of them planted false. SymPy and
                  simulations settle them in about 10 seconds, for $0.
                </p>
                <div className="mt-5">
                  <StartAuditButton variant="outline">Start the audit</StartAuditButton>
                </div>
              </div>
            </div>
          </li>
          <li>
            <Link href="/app/explore" className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/25">
              <CardImage src="/plates/hooke-cork.jpg" alt="Hooke's 1665 engraving of cork cells under a microscope." width={905} height={935} />
              <div className="flex flex-1 flex-col p-6">
                <p className="font-display text-2xl">Explore</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  DNA, proteins and molecules in 3D, and live figures from statistics, mathematics and experimental design.
                </p>
                <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium">
                  Open the gallery
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </p>
              </div>
            </Link>
          </li>
        </ul>
      </section>

      {/* Papers */}
      <section aria-labelledby="papers-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="papers-heading" className="font-display text-3xl sm:text-4xl">
            Your papers
          </h2>
          {papers.length > 0 && (
            <Link href="/app/upload" className="text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">
              Upload another
            </Link>
          )}
        </div>
        {papers.length === 0 ? (
          <div className="mt-6 grid gap-8 rounded-2xl border bg-card p-6 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="text-lg font-medium">No papers yet</p>
              <p className="mt-2 max-w-md leading-relaxed text-muted-foreground">
                Start with a PDF that has selectable text. Its claims are listed by kind, and the ones that match the
                curated library can be audited straight away.
              </p>
            </div>
            <UploadDropzone />
          </div>
        ) : (
          <ul className="mt-6 divide-y overflow-hidden rounded-2xl border bg-card">
            {papers.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/app/papers/${p.id}`}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate font-medium">{p.title || p.filename}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {p.title ? `${p.filename} · ` : ""}
                      {plural(p.pages, "page")} · {fileSize(p.size)} · {dateTime(p.createdAt)}
                    </p>
                  </div>
                  <StatusChip paper={p} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
