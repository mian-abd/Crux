import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunView } from "@/components/run/run-view";

export const metadata: Metadata = { title: "Claims audit run" };

// The same shape the engine API accepts for a run id.
const RUN_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

export default async function RunPage({ params }: PageProps<"/app/runs/[id]">) {
  const { id } = await params;
  if (!RUN_ID_RE.test(id) || id === "." || id === "..") notFound();
  return <RunView runId={id} />;
}
