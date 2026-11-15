"use client";

import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startLiveRunAction } from "@/app/app/actions";

export function StartLiveRunButton({ caseId, disabled }: { caseId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const result = await startLiveRunAction(caseId);
      if (result.ok) router.push(`/app/live/${encodeURIComponent(result.runId)}`);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={run} disabled={disabled || pending} className="pill-light disabled:opacity-50">
        {pending ? "Starting the swarm…" : "Start a live run"}
        {pending ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        )}
      </button>
      {error && (
        <p role="alert" className="max-w-md text-sm text-[oklch(0.82_0.09_45)]">
          {error}
        </p>
      )}
    </div>
  );
}
