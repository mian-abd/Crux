import { ArrowRightIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { UploadDropzone } from "@/components/app/upload-dropzone";
import { plural } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { listPapers } from "@/lib/server/papers";

export const metadata: Metadata = { title: "Upload a paper" };

const FACTS = [
  {
    term: "Your paper, your workspace",
    body: "Your PDF is saved privately under your account, ready to return to.",
  },
  {
    term: "From text to claims",
    body: "Choose Extract claims to send the paper's text to the model and identify its scientific statements.",
  },
  {
    term: "Evidence at every step",
    body: "Inspect each extracted claim alongside its supporting passage from the paper.",
  },
];

export default async function UploadPage() {
  const user = await requireUser("/app/upload");
  const papers = listPapers(user.id);
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Paper workspace" title="Start with a paper.">
        Bring the research. Crux brings the questions. Upload a text-based PDF to begin extracting its claims.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {papers.length > 0 && (
            <section aria-labelledby="recent-heading" className="rounded-2xl border bg-card">
              <h2 id="recent-heading" className="border-b px-5 py-3 text-sm font-medium text-muted-foreground">
                Your papers
              </h2>
              <ul className="divide-y">
                {papers.slice(0, 4).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/app/papers/${p.id}`}
                      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
                    >
                      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.title || p.filename}</span>
                        <span className="block text-sm text-muted-foreground">
                          {p.status === "extracted" ? `${plural(p.claimCount, "claim")} extracted` : "Claims not extracted yet"}
                        </span>
                      </span>
                      <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <UploadDropzone />
          <dl className="grid gap-3 sm:grid-cols-3">
            {FACTS.map((f) => (
              <div key={f.term} className="rounded-2xl border bg-card p-5">
                <dt className="font-medium">{f.term}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</dd>
              </div>
            ))}
          </dl>
        </div>
        <figure className="flex flex-col">
          <div className="overflow-hidden rounded-2xl border bg-[#f7f6f3]">
            <Image
              src="/plates/hooke-flea.jpg"
              alt="Robert Hooke's 1665 engraving of a flea seen under a microscope."
              width={1920}
              height={1440}
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="h-full w-full object-cover"
            />
          </div>
          <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Look closely before you believe it. Robert Hooke, Micrographia (1665), Schem. XXXIV. Public domain.
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
