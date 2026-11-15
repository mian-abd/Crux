import type { Metadata } from "next";

import { GradedRuns } from "@/components/graded-runs";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Graded runs" };

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { run } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto w-full max-w-[90rem] px-5 pt-14 pb-24 sm:px-8 sm:pt-20 lg:px-12">
          <div className="max-w-3xl">
            <p className="eyebrow">Graded runs</p>
            <h1 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">Watch the swarm work</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Two BixBench3 task 9 runs, replayed from their event logs: the questions the agents raised, the checks
              ranked by information per cost, what the referee accepted, how belief moved, and what was rejected.
            </p>
          </div>
          <div className="mt-12">
            <GradedRuns selected={typeof run === "string" ? run : undefined} basePath="/runs" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
