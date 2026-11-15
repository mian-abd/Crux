import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LiveStatus } from "@/components/app/live-status";
import { PageHeader } from "@/components/app/page-header";
import { requireUser } from "@/lib/server/auth";
import { isRunId } from "@/lib/server/live-runs";
import { VIEWER_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Live run" };

export default async function LiveRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId: raw } = await params;
  const runId = decodeURIComponent(raw);
  await requireUser(`/app/live/${encodeURIComponent(runId)}`);
  if (!isRunId(runId)) notFound();
  const viewer = `${VIEWER_URL}/?run=${encodeURIComponent(runId)}`;

  return (
    <div className="space-y-8">
      <Link href="/app/live" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Live runs
      </Link>
      <PageHeader title="The swarm, live">
        BixBench3 task 9, clean case. Questions, checks ranked by information per cost, sandbox output, referee verdicts,
        belief updates and rejections stream in as they happen.
      </PageHeader>
      <LiveStatus runId={runId} />
      <div className="overflow-hidden rounded-2xl border bg-card">
        <iframe src={viewer} title={`Live run ${runId}`} className="block h-[min(80svh,58rem)] min-h-[36rem] w-full" />
      </div>
      <p className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <a
          href={viewer}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:text-foreground"
        >
          Open full screen
          <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
        </a>
        <span>Share this page with anyone signed in; the run keeps going if you close it.</span>
      </p>
    </div>
  );
}
