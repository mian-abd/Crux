import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { Wordmark } from "@/components/wordmark";
import { REPO_URL } from "@/lib/site";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/#domains", label: "What it tests" },
  { href: "/#results", label: "Results" },
  { href: "/#how", label: "How it works" },
];

/** A slim charcoal bar above the header, for the one result worth knowing first. */
export function AnnouncementBar() {
  return (
    <div className="bg-ink text-ink-foreground">
      <div className="mx-auto flex min-h-10 w-full max-w-[90rem] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-1.5 text-center text-[0.82rem] sm:px-8">
        <p>
          On 13 fresh pre-registered cases, the swarm scored <span className="font-mono">0.811</span> against{" "}
          <span className="font-mono">0.608</span> for a single agent.
        </p>
        <Link
          href="/#results"
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-ink-foreground px-3 text-[0.78rem] font-medium text-ink transition-opacity hover:opacity-85"
        >
          See the results
        </Link>
      </div>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 [&:has(+main)]:border-border/60">
      <div className="mx-auto flex h-[4.5rem] w-full max-w-[90rem] items-center gap-6 px-5 sm:px-8">
        <Wordmark />
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-md px-3 py-2 text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground lg:block"
          >
            GitHub
          </a>
          <Link
            href="/login"
            className="hidden rounded-md px-3 py-2 text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Sign in
          </Link>
          <Link href="/signup" className="pill h-10 pr-3.5 text-[0.9rem]">
            Start an audit
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
