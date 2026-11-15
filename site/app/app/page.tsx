import { ArrowRightIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { UploadDropzone } from "@/components/app/upload-dropzone";
import { Scoreboard } from "@/components/scoreboard";
import { Chip } from "@/components/verdict-chip";
import { dateTime, fileSize, plural } from "@/lib/format";
import { paperDisplayTitle } from "@/lib/paper-display";
import { requireUser } from "@/lib/server/auth";
import { listPapers, type PaperSummary } from "@/lib/server/papers";

export const metadata: Metadata = { title: "Home" };

const TOUR = [
  {
    href: "/app/graded",
    title: "Watch a graded run",
    body: "A real BixBench3 task 9 run, replayed from its log: every check, verdict, belief update and rejection.",
    cta: "Replay it",
    image: { src: "/plates/lavoisier-apparatus.jpg", alt: "Lavoisier's engraved chemistry apparatus, 1789.", width: 1440, height: 876, position: "center" },
  },
  {
    href: "/app/jetson",
    title: "The Jetson run",
    body: "On real hardware: the engine chooses which part of a DNA strip to read, reads it through a camera on a Jetson, and settles the letter.",
    cta: "Open the Jetson run",
    image: { src: "/plates/hooke-flea.jpg", alt: "Robert Hooke's 1665 engraving of a flea under a microscope.", width: 1920, height: 1440, position: "center" },
  },
  {
    href: "/app/explore",
    title: "Explore",
    body: "DNA and proteins in 3D, and live figures from statistics, mathematics and experimental design.",
    cta: "Open the gallery",
    image: { src: "/plates/hooke-cork.jpg", alt: "Hooke's 1665 engraving of cork cells under a microscope.", width: 905, height: 935, position: "center" },
  },
  {
    href: "/app/upload",
    title: "Audit a paper",
    body: "A paper's claims, each with its quote, then the audit: competing readings, the deciding experiment, the verdict.",
    cta: "Audit a paper",
    image: { src: "/plates/euclid-1482.jpg", alt: "Triangle diagrams from the first printed Euclid, 1482.", width: 400, height: 1100, position: "50% 30%" },
  },
];

function StatusChip({ paper }: { paper: PaperSummary }) {
  if (paper.status === "extracted") {
    return (
      <Chip>
        {plural(paper.claimCount, "claim")} extracted
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
            Watch the swarm work on a real case, see it read DNA from a camera on a Jetson, explore the sciences it
            tests, and audit a paper&apos;s claims.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/app/graded" className="pill-light">
              Watch a graded run
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/app/upload"
              className="inline-flex h-11 items-center rounded-full border border-ink-foreground/30 px-5 text-[0.925rem] font-medium transition-colors hover:bg-ink-foreground/10"
            >
              Audit a paper
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

      {/* Tour */}
      <section aria-labelledby="tour-heading">
        <h2 id="tour-heading" className="font-display text-3xl sm:text-4xl">
          The tour, in four steps
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TOUR.map((s, i) => (
            <li key={s.href}>
              <Link href={s.href} className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/25">
                <CardImage src={s.image.src} alt={s.image.alt} width={s.image.width} height={s.image.height} position={s.image.position} />
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-sm text-muted-foreground">Step {i + 1}</p>
                  <p className="mt-1 font-display text-2xl">{s.title}</p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium">
                    {s.cta}
                    <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
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
                Start with a text-based PDF. Explore its extracted claims alongside their supporting passages.
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
                    <p className="truncate font-medium">{paperDisplayTitle(p.title, p.filename)}</p>
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
