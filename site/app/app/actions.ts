"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/server/auth";
import { startLiveRun } from "@/lib/server/live-runs";
import { ExtractionError, extractClaims, hasOpenAiKey } from "@/lib/server/openai";
import {
  deletePaper,
  getPaper,
  getPaperText,
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
