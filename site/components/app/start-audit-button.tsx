"use client";

import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fetchEngineInfo, startClaimsRun } from "@/lib/crux/sources";

/**
 * Starts a live claims run when the engine API offers the claims lab. Otherwise it
 * opens the recorded run, and the run page says which one it is showing.
 */
export function StartAuditButton({
  children = "Run the audit",
  variant = "default",
}: {
  children?: React.ReactNode;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    const info = await fetchEngineInfo();
    if (info.canStartClaims) {
      try {
        const runId = await startClaimsRun();
        router.push(`/app/runs/${encodeURIComponent(runId)}`);
        return;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The engine could not start a run.", {
          description: "Showing the recorded run instead.",
        });
      }
    }
    router.push("/app/runs/demo");
  }

  return (
    <Button size="lg" variant={variant} onClick={start} disabled={pending}>
      {children}
      {pending ? <Loader2Icon className="animate-spin" data-icon="inline-end" /> : <ArrowRightIcon data-icon="inline-end" />}
    </Button>
  );
}
