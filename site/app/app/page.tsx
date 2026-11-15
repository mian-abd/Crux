import { FileTextIcon, UploadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { StartAuditButton } from "@/components/app/start-audit-button";
import { UploadDropzone } from "@/components/app/upload-dropzone";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/verdict-chip";
import { LIBRARY_PAPER } from "@/lib/claim-library";
import { dateTime, fileSize, plural } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { listPapers, type PaperSummary } from "@/lib/server/papers";

export const metadata: Metadata = { title: "Your papers" };

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

export default async function PapersPage() {
  const user = await requireUser("/app");
  const papers = listPapers(user.id);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Your papers"
        actions={
          papers.length > 0 && (
            <Link href="/app/upload" className={buttonVariants({ size: "lg" })}>
              <UploadIcon data-icon="inline-start" />
              Upload a paper
            </Link>
          )
        }
      >
        Upload a PDF, list its claims, and see which ones the engine can check today.
      </PageHeader>

      {papers.length === 0 ? (
        <section aria-labelledby="empty-heading" className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <h2 id="empty-heading" className="text-lg font-medium">
              No papers yet
            </h2>
            <p className="mt-2 max-w-md leading-relaxed text-muted-foreground">
              Start with a PDF that has selectable text. Its claims are listed by kind, and the ones
              that match the curated library can be audited straight away.
            </p>
          </div>
          <UploadDropzone />
        </section>
      ) : (
        <section aria-label="Papers">
          <ul className="divide-y rounded-lg border bg-card">
            {papers.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/app/papers/${p.id}`}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
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
        </section>
      )}

      <section
        aria-labelledby="curated-heading"
        className="flex flex-wrap items-center justify-between gap-6 rounded-lg border bg-muted/40 p-6"
      >
        <div className="max-w-2xl">
          <p className="eyebrow">Claims audit · MVP</p>
          <h2 id="curated-heading" className="mt-3 text-lg font-medium">
            Audit the four curated DESeq2 claims
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {LIBRARY_PAPER.authors}, {LIBRARY_PAPER.venue}, {LIBRARY_PAPER.license}. Three claims
            from the paper and one false claim we planted.
          </p>
        </div>
        <StartAuditButton variant="outline" />
      </section>
    </div>
  );
}
