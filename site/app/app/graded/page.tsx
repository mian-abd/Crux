import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { GradedRuns } from "@/components/graded-runs";

export const metadata: Metadata = { title: "Graded runs" };

export default async function GradedRunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { run } = await searchParams;
  return (
    <div className="space-y-10">
      <PageHeader title="Graded runs">
        BixBench3 task 9 runs replayed from their event logs: questions, checks ranked by information per cost, the
        referee, belief updates and the rejected ledger.
      </PageHeader>
      <GradedRuns selected={typeof run === "string" ? run : undefined} basePath="/app/graded" />
    </div>
  );
}
