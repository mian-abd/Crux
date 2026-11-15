import { ArrowLeftIcon, KeyRoundIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { DeletePaperButton, ExtractButton } from "@/components/app/paper-actions";
import { StartAuditButton } from "@/components/app/start-audit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Chip } from "@/components/verdict-chip";
import { libraryClaim, notCheckableReason } from "@/lib/claim-library";
import { MAX_PAPER_CHARS } from "@/lib/extract";
import { dateTime, fileSize, plural } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { hasOpenAiKey } from "@/lib/server/openai";
import { getPaper, listClaims, type PaperClaim } from "@/lib/server/papers";

export const metadata: Metadata = { title: "Paper" };

function ClaimItem({ claim, children }: { claim: PaperClaim; children: React.ReactNode }) {
  return (
    <li className="py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Chip className="font-mono tracking-wide uppercase">{claim.kind}</Chip>
        {!claim.quoteFound && claim.quote && (
          <Chip className="border-v-unresolved/50 bg-v-unresolved/10 text-v-unresolved">
            <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
            Quote not found word for word
          </Chip>
        )}
      </div>
      <p className="mt-3 text-[1.05rem] leading-snug">{claim.claim}</p>
      {claim.quote && (
        <blockquote className="mt-3 border-l-2 pl-4 text-sm leading-relaxed text-muted-foreground">
          {claim.quote}
        </blockquote>
      )}
      <div className="mt-3 text-sm leading-relaxed">{children}</div>
    </li>
  );
}

export default async function PaperPage({ params }: PageProps<"/app/papers/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/app/papers/${id}`);
  const paper = /^[0-9a-f-]{36}$/.test(id) ? getPaper(user.id, id) : null;
  if (!paper) notFound();

  const claims = listClaims(user.id, paper.id);
  const checkable = claims.filter((c) => c.libraryId);
  const notYet = claims.filter((c) => !c.libraryId);
  const keyReady = hasOpenAiKey();
  const extracted = paper.status === "extracted";

  return (
    <div className="space-y-10">
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
        Your papers
      </Link>

      <PageHeader
        title={paper.title || paper.filename}
        actions={
          <>
            <ExtractButton paperId={paper.id} disabled={!keyReady} again={extracted} />
            <DeletePaperButton paperId={paper.id} name={paper.filename} />
          </>
        }
      >
        <p className="text-sm">
          {paper.title ? `${paper.filename} · ` : ""}
          {plural(paper.pages, "page")} · {fileSize(paper.size)} ·{" "}
          {paper.chars.toLocaleString("en-US")} characters of text · uploaded {dateTime(paper.createdAt)}
        </p>
      </PageHeader>

      {!keyReady && (
        <Alert>
          <KeyRoundIcon />
          <AlertTitle>Extraction needs an API key</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-[0.85em]">OPENAI_API_KEY</code> in{" "}
            <code className="font-mono text-[0.85em]">site/.env.local</code> and restart the server.
            The key stays on the server and is never sent to the browser. Your paper is stored and
            ready; you can still run the curated audit below.
          </AlertDescription>
        </Alert>
      )}

      {paper.status === "failed" && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>The last extraction failed</AlertTitle>
          <AlertDescription>{paper.error ?? "Try again in a moment."}</AlertDescription>
        </Alert>
      )}

      {paper.status === "uploaded" && keyReady && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h2 className="text-lg font-medium">Claims not extracted yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Extraction sends this paper&apos;s text to the model provider and lists its claims by
            kind. It takes up to a minute.
          </p>
        </div>
      )}

      {extracted && (
        <>
          <p className="text-sm text-muted-foreground">
            {plural(claims.length, "claim")} listed by {paper.model}
            {paper.extractedAt ? ` on ${dateTime(paper.extractedAt)}` : ""}. A model made this list:
            it can miss claims or misread them, so each one carries its quote.
            {paper.truncated &&
              ` Only the first ${MAX_PAPER_CHARS.toLocaleString("en-US")} characters of the paper were read.`}
          </p>

          <section aria-labelledby="checkable-heading">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
              <div>
                <h2 id="checkable-heading" className="font-display text-3xl">
                  Checkable now
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {checkable.length === 0
                    ? "None of this paper's claims match the curated library."
                    : `${plural(checkable.length, "claim")} matched to the curated library.`}
                </p>
              </div>
              {checkable.length > 0 && <StartAuditButton />}
            </div>
            {checkable.length > 0 && (
              <ul className="divide-y">
                {checkable.map((c) => {
                  const lib = libraryClaim(c.libraryId);
                  return (
                    <ClaimItem key={c.id} claim={c}>
                      <p>
                        <span className="font-medium text-v-holds">Matched</span>{" "}
                        <span className="font-mono text-xs text-muted-foreground">{c.libraryId}</span>
                        {lib && <span className="text-muted-foreground"> · {lib.check}</span>}
                      </p>
                    </ClaimItem>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="notyet-heading">
            <div className="border-b pb-4">
              <h2 id="notyet-heading" className="font-display text-3xl">
                Not yet checkable
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {notYet.length === 0
                  ? "Nothing in this list."
                  : `${plural(notYet.length, "claim")} the engine has no check for yet.`}
              </p>
            </div>
            {notYet.length > 0 && (
              <ul className="divide-y">
                {notYet.map((c) => (
                  <ClaimItem key={c.id} claim={c}>
                    <p className="text-muted-foreground">{notCheckableReason(c.kind)}</p>
                  </ClaimItem>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!extracted && (
        <section className="flex flex-wrap items-center justify-between gap-6 rounded-lg border bg-muted/40 p-6">
          <div className="max-w-2xl">
            <p className="eyebrow">Claims audit · MVP</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The audit runs on four curated DESeq2 claims, whatever paper you uploaded.
            </p>
          </div>
          <StartAuditButton variant="outline">Run the curated audit</StartAuditButton>
        </section>
      )}
    </div>
  );
}
