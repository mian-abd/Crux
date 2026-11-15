"use client";

import { ArrowUpRightIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { findSourcesAction, type SourcesActionResult } from "@/app/app/actions";

/** "Find sources with Exa" for one extracted claim: evidence to read, not a verdict. */
export function ClaimSources({ paperId, claimId, enabled }: { paperId: string; claimId: string; enabled: boolean }) {
  const [result, setResult] = useState<SourcesActionResult | null>(null);
  const [pending, start] = useTransition();

  if (!enabled) return null;

  function run() {
    start(async () => setResult(await findSourcesAction(paperId, claimId)));
  }

  if (!result || !result.ok) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.82rem] font-medium transition-colors hover:border-foreground/40 disabled:opacity-60"
        >
          {pending ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : <SearchIcon className="size-3.5" aria-hidden="true" />}
          {pending ? "Searching with Exa…" : "Find sources with Exa"}
        </button>
        {result && !result.ok && <span className="text-sm text-destructive">{result.error}</span>}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground">
        Sources found with Exa for this claim: evidence to read, not a verdict
        {result.costUsd !== null && ` · search cost $${result.costUsd.toFixed(4)}`}
      </p>
      {result.sources.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Exa found no sources for this claim.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {result.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-start gap-1 font-medium leading-snug underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                {s.title}
                <ArrowUpRightIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              </a>
              <p className="text-xs text-muted-foreground">
                {new URL(s.url).hostname}
                {s.published ? ` · ${s.published}` : ""}
              </p>
              {s.highlight && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">“{s.highlight}”</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
