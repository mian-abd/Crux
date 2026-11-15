"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ClaimSourcesResult } from "@/lib/exa";
import { requireUser } from "@/lib/server/auth";
import { SourcesError, findClaimSources, hasExaKey } from "@/lib/server/exa";
import { startLiveRun } from "@/lib/server/live-runs";
import { ExtractionError, extractClaims, hasOpenAiKey } from "@/lib/server/openai";
import {
  deletePaper,
  getPaper,
  getPaperText,
  listClaims,
  markExtractionFailed,
  saveExtraction,
} from "@/lib/server/papers";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const ID_RE = /^[0-9a-f-]{36}$/;

export async function extractClaimsAction(paperId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!ID_RE.test(paperId) || !getPaper(user.id, paperId)) {
    return { ok: false, error: "That paper was not found." };
  }
  if (!hasOpenAiKey()) return { ok: false, error: "Extraction needs an API key." };
  const text = getPaperText(user.id, paperId);
  if (!text) return { ok: false, error: "That paper has no readable text." };

  try {
    saveExtraction(user.id, paperId, await extractClaims(text));
  } catch (err) {
    const message =
      err instanceof ExtractionError ? err.message : "Extraction failed. Try again in a moment.";
    markExtractionFailed(user.id, paperId, message);
    revalidatePath(`/app/papers/${paperId}`);
    return { ok: false, error: message };
  }
  revalidatePath(`/app/papers/${paperId}`);
  revalidatePath("/app");
  return { ok: true };
}

export type SourcesActionResult = ({ ok: true } & ClaimSourcesResult) | { ok: false; error: string };

/** Searches Exa for sources on one of the signed-in user's extracted claims. */
export async function findSourcesAction(paperId: string, claimId: string): Promise<SourcesActionResult> {
  const user = await requireUser();
  if (!ID_RE.test(paperId) || !getPaper(user.id, paperId)) {
    return { ok: false, error: "That paper was not found." };
  }
  const claim = listClaims(user.id, paperId).find((c) => c.id === claimId);
  if (!claim) return { ok: false, error: "That claim was not found." };
  if (!hasExaKey()) return { ok: false, error: "Finding sources needs an Exa API key." };
  try {
    return { ok: true, ...(await findClaimSources(claim.claim)) };
  } catch (err) {
    return { ok: false, error: err instanceof SourcesError ? err.message : "Exa search failed. Try again." };
  }
}

export async function deletePaperAction(paperId: string): Promise<void> {
  const user = await requireUser();
  if (ID_RE.test(paperId)) await deletePaper(user.id, paperId);
  revalidatePath("/app");
  redirect("/app");
}

export type LiveRunActionResult = { ok: true; runId: string } | { ok: false; error: string };

/** Starts a live Task 9 run for the signed-in user, within the site's fair-use limits. */
export async function startLiveRunAction(caseId: string): Promise<LiveRunActionResult> {
  const user = await requireUser("/app/live");
  const result = await startLiveRun(user.id, caseId);
  if (result.ok) revalidatePath("/app/live");
  return result;
}
