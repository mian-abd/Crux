import Link from "next/link";

import { Wordmark } from "@/components/wordmark";
import { LIBRARY_PAPER } from "@/lib/claim-library";
import { REPO_URL, repoFile } from "@/lib/site";

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
    >
      {children}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.2fr_1fr_1.6fr]">
        <div className="space-y-3">
          <Wordmark />
          <p className="max-w-xs text-sm text-muted-foreground">
            A hackathon research prototype. Results are from a pilot on one task.
          </p>
        </div>
        <nav aria-label="Footer" className="space-y-2 text-sm text-muted-foreground">
          <p className="eyebrow mb-3">Project</p>
          <p>
            <Ext href={REPO_URL}>Source on GitHub</Ext>
          </p>
          <p>
            <Ext href={repoFile("eval/results/task9_batch03.md")}>Pilot results</Ext>
          </p>
          <p>
            <Link
              href="/explore"
              className="underline decoration-border underline-offset-4 hover:text-foreground"
            >
              Explore: one letter
            </Link>
          </p>
        </nav>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="eyebrow mb-3">Credits</p>
          <p>
            Claims audit source: {LIBRARY_PAPER.authors}, <Ext href={LIBRARY_PAPER.url}>{LIBRARY_PAPER.venue}</Ext>,
            licensed <Ext href={LIBRARY_PAPER.licenseUrl}>{LIBRARY_PAPER.license}</Ext>.
          </p>
          <p>
            Structure data: <Ext href="https://www.rcsb.org/structure/2HBS">PDB 2HBS</Ext>. Sequence: NCBI RefSeq
            NM_000518.5.
          </p>
          <p>
            Interface built from <Ext href="https://ui.shadcn.com">shadcn/ui</Ext>,{" "}
            <Ext href="https://magicui.design">Magic UI</Ext> and{" "}
            <Ext href="https://www.better-auth.com">Better Auth</Ext>, all MIT. Full list in{" "}
            <Ext href={repoFile("site/README.md")}>site/README.md</Ext>.
          </p>
        </div>
      </div>
    </footer>
  );
}
