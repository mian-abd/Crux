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

const LINKS = [
  { href: "/#results", label: "Results" },
  { href: "/#runs", label: "Graded runs" },
  { href: "/#sponsors", label: "Built with" },
  { href: "/#explore", label: "Explore" },
  { href: "/explore", label: "The full gallery" },
  { href: "/runs", label: "All graded runs" },
  { href: "/login", label: "Sign in" },
];

export function SiteFooter() {
  return (
    <footer>
      <div className="mx-auto grid w-full max-w-[90rem] gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.1fr_0.7fr_1.6fr] lg:px-12">
        <div className="space-y-4">
          <Wordmark />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            A research prototype from the SF AI Research Hackathon, Track 3. Results are from a pilot on one task.
          </p>
        </div>
        <nav aria-label="Footer" className="space-y-2.5 text-sm text-muted-foreground">
          {LINKS.map((l) => (
            <p key={l.href}>
              <Link href={l.href} className="transition-colors hover:text-foreground">
                {l.label}
              </Link>
            </p>
          ))}
          <p>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
              GitHub
            </a>
          </p>
        </nav>
        <div className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">
          <p className="eyebrow mb-4">Credits</p>
          <p>
            Claims audit source: {LIBRARY_PAPER.authors}, <Ext href={LIBRARY_PAPER.url}>{LIBRARY_PAPER.venue}</Ext>,
            licensed <Ext href={LIBRARY_PAPER.licenseUrl}>{LIBRARY_PAPER.license}</Ext>.
          </p>
          <p>
            Structure data: <Ext href="https://www.rcsb.org/structure/2HBS">PDB 2HBS</Ext>. Sequence: NCBI RefSeq
            NM_000518.5. Historical plates are public domain, via Wikimedia Commons.
          </p>
          <p>
            Built with Next.js, <Ext href="https://ui.shadcn.com">shadcn/ui</Ext> and{" "}
            <Ext href="https://www.better-auth.com">Better Auth</Ext>. Full list in{" "}
            <Ext href={repoFile("site/README.md")}>site/README.md</Ext>.
          </p>
        </div>
      </div>
      <div className="border-t">
        <p className="mx-auto w-full max-w-[90rem] px-5 py-5 text-[0.8rem] text-muted-foreground sm:px-8 lg:px-12">
          © 2026 Crux · Pilot results, one task of 20
        </p>
      </div>
    </footer>
  );
}
