// Live Task 9 runs started from the site. The engine API only starts a paid lab with the
// team's run token, so the site's server holds that token (CRUX_RUN_TOKEN, server-only) and
// starts runs for signed-in users, within fair-use limits stored next to their account.
// The token never reaches the browser.

import { randomUUID } from "node:crypto";

import { getDb, inTransaction } from "@/lib/server/db";

const API = (process.env.NEXT_PUBLIC_CRUX_API ?? "http://localhost:8001").replace(/\/+$/, "");
const RUN_TOKEN_HEADER = "X-Crux-Run-Token";
const RUN_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

export const LIVE_CASES = [
  {
    id: "task9-clean",
    title: "BixBench3 task 9, clean case",
    body: "The published Tag-Seq count matrix (60,708 genes, 16 samples) and sample sheet from GSE234912, with the task's own gene annotation.",
  },
] as const;

export type LiveCaseId = (typeof LIVE_CASES)[number]["id"];

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Fair-use limits. A run is capped at $2 of model spend by the engine itself. */
export const LIMITS = {
  perUserPerDay: envInt("LIVE_RUNS_PER_USER_PER_DAY", 3),
  perDay: envInt("LIVE_RUNS_PER_DAY", 20),
  concurrent: envInt("LIVE_RUNS_CONCURRENT", 2),
  /** A run counts as active for this long after it starts (runs take about 6 minutes). */
  activeMs: 12 * 60 * 1000,
  dayMs: 24 * 60 * 60 * 1000,
};

export function liveRunsEnabled(): boolean {
  return Boolean(process.env.CRUX_RUN_TOKEN?.trim());
}

export interface LiveRunRow {
  runId: string;
  caseId: string;
  createdAt: number;
}

export function listLiveRuns(userId: string, limit = 8): LiveRunRow[] {
  const rows = getDb()
    .prepare(
      "SELECT run_id, case_id, created_at FROM live_run WHERE user_id = ? AND run_id IS NOT NULL ORDER BY created_at DESC LIMIT ?",
    )
    .all(userId, limit) as { run_id: string; case_id: string; created_at: number }[];
  return rows.map((r) => ({ runId: r.run_id, caseId: r.case_id, createdAt: r.created_at }));
}

export interface Usage {
  userToday: number;
  allToday: number;
  allActive: number;
}

export function usage(userId: string, now = Date.now()): Usage {
  const db = getDb();
  const count = (sql: string, ...args: (string | number)[]) =>
    (db.prepare(sql).get(...args) as { n: number }).n;
  return {
    userToday: count("SELECT COUNT(*) AS n FROM live_run WHERE user_id = ? AND created_at > ?", userId, now - LIMITS.dayMs),
    allToday: count("SELECT COUNT(*) AS n FROM live_run WHERE created_at > ?", now - LIMITS.dayMs),
    allActive: count("SELECT COUNT(*) AS n FROM live_run WHERE created_at > ?", now - LIMITS.activeMs),
  };
}

/** Why a new run can't start now, or null when it can. */
export function limitReason(u: Usage): string | null {
  if (u.userToday >= LIMITS.perUserPerDay)
    return `You've started ${LIMITS.perUserPerDay} live runs today, the daily limit per account. The recorded runs are always available.`;
  if (u.allToday >= LIMITS.perDay) return "Today's live runs for the whole site are used up. Try again tomorrow, or watch a recorded run.";
  if (u.allActive >= LIMITS.concurrent)
    return `${LIMITS.concurrent} live runs are already going. Each takes about 6 minutes; try again shortly.`;
  return null;
}

export type StartResult = { ok: true; runId: string } | { ok: false; error: string };

export async function startLiveRun(userId: string, caseId: string): Promise<StartResult> {
  const token = process.env.CRUX_RUN_TOKEN?.trim();
  if (!token) return { ok: false, error: "Live runs are not switched on for this site." };
  if (!LIVE_CASES.some((c) => c.id === caseId)) return { ok: false, error: "Unknown case." };

  // Reserve a slot first, inside one transaction, so two clicks can't both pass the limits.
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const reserved = inTransaction(db, () => {
    const reason = limitReason(usage(userId, now));
    if (reason) return reason;
    db.prepare("INSERT INTO live_run (id, user_id, run_id, case_id, created_at) VALUES (?, ?, NULL, ?, ?)").run(
      id,
      userId,
      caseId,
      now,
    );
    return null;
  });
  if (reserved) return { ok: false, error: reserved };

  const release = () => db.prepare("DELETE FROM live_run WHERE id = ?").run(id);
  let res: Response;
  try {
    res = await fetch(`${API}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [RUN_TOKEN_HEADER]: token },
      body: JSON.stringify({ lab: "bixbench3", overrides: { case: caseId } }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    release();
    return { ok: false, error: "The engine could not be reached. Try again in a moment." };
  }
  if (!res.ok) {
    release();
    if (res.status === 403) return { ok: false, error: "The engine refused the site's run token." };
    return { ok: false, error: `The engine answered ${res.status}.` };
  }
  const body = (await res.json().catch(() => null)) as { run_id?: unknown } | null;
  const runId = typeof body?.run_id === "string" && RUN_ID_RE.test(body.run_id) ? body.run_id : null;
  if (!runId) {
    release();
    return { ok: false, error: "The engine did not return a run id." };
  }
  db.prepare("UPDATE live_run SET run_id = ? WHERE id = ?").run(runId, id);
  return { ok: true, runId };
}

export function isRunId(value: string): boolean {
  return RUN_ID_RE.test(value) && value !== "." && value !== "..";
}
