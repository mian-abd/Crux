// Papers a user uploaded: the PDF on disk under .data/uploads/<user>/, its extracted
// text and its claims in SQLite. Every query is scoped to the owner.

import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ExtractedKind } from "@/lib/claim-library";
import type { Extraction } from "@/lib/extract";
import { UPLOADS_DIR, getDb } from "./db";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type PaperStatus = "uploaded" | "extracted" | "failed";

export interface PaperSummary {
  id: string;
  filename: string;
  title: string | null;
  size: number;
  pages: number;
  chars: number;
  status: PaperStatus;
  error: string | null;
  model: string | null;
  truncated: boolean;
  createdAt: number;
  extractedAt: number | null;
  claimCount: number;
  checkableCount: number;
}

export interface PaperClaim {
  id: string;
  idx: number;
  claim: string;
  quote: string;
  kind: ExtractedKind;
  libraryId: string | null;
  quoteFound: boolean;
}

interface PaperRow {
  id: string;
  filename: string;
  title: string | null;
  size: number;
  pages: number;
  chars: number;
  status: PaperStatus;
  error: string | null;
  model: string | null;
  truncated: number;
  created_at: number;
  extracted_at: number | null;
  claim_count: number;
  checkable_count: number;
}

const SUMMARY_SQL = `
  SELECT p.id, p.filename, p.title, p.size, p.pages, p.chars, p.status, p.error, p.model,
         p.truncated, p.created_at, p.extracted_at,
         (SELECT COUNT(*) FROM paper_claim c WHERE c.paper_id = p.id) AS claim_count,
         (SELECT COUNT(*) FROM paper_claim c WHERE c.paper_id = p.id AND c.library_id IS NOT NULL)
           AS checkable_count
  FROM paper p`;

function toSummary(r: PaperRow): PaperSummary {
  return {
    id: r.id,
    filename: r.filename,
    title: r.title,
    size: r.size,
    pages: r.pages,
    chars: r.chars,
    status: r.status,
    error: r.error,
    model: r.model,
    truncated: r.truncated === 1,
    createdAt: r.created_at,
    extractedAt: r.extracted_at,
    claimCount: r.claim_count,
    checkableCount: r.checkable_count,
  };
}

/** A display name: no path parts, no control characters, at most 120 characters. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || "paper.pdf";
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

function userDir(userId: string): string {
  const safe = userId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!safe) throw new Error("invalid user id");
  return path.join(UPLOADS_DIR, safe);
}

export async function savePaper(input: {
  userId: string;
  filename: string;
  bytes: Uint8Array;
  pages: number;
  text: string;
}): Promise<string> {
  const id = randomUUID();
  const dir = userDir(input.userId);
  await mkdir(dir, { recursive: true });
  const storedName = `${id}.pdf`;
  await writeFile(path.join(dir, storedName), input.bytes);
  getDb()
    .prepare(
      `INSERT INTO paper (id, user_id, filename, stored_name, size, pages, chars, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.userId,
      cleanFilename(input.filename),
      storedName,
      input.bytes.byteLength,
      input.pages,
      input.text.length,
      input.text,
      Date.now(),
    );
  return id;
}

export function listPapers(userId: string): PaperSummary[] {
  const rows = getDb()
    .prepare(`${SUMMARY_SQL} WHERE p.user_id = ? ORDER BY p.created_at DESC`)
    .all(userId) as PaperRow[];
  return rows.map(toSummary);
}

export function getPaper(userId: string, id: string): PaperSummary | null {
  const row = getDb().prepare(`${SUMMARY_SQL} WHERE p.user_id = ? AND p.id = ?`).get(userId, id) as
    | PaperRow
    | undefined;
  return row ? toSummary(row) : null;
}

export function getPaperText(userId: string, id: string): string | null {
  const row = getDb()
    .prepare("SELECT text FROM paper WHERE user_id = ? AND id = ?")
    .get(userId, id) as { text: string } | undefined;
  return row?.text ?? null;
}

export function listClaims(userId: string, paperId: string): PaperClaim[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.idx, c.claim, c.quote, c.kind, c.library_id, c.quote_found
       FROM paper_claim c JOIN paper p ON p.id = c.paper_id
       WHERE p.user_id = ? AND p.id = ? ORDER BY c.idx`,
    )
    .all(userId, paperId) as {
    id: string;
    idx: number;
    claim: string;
    quote: string;
    kind: ExtractedKind;
    library_id: string | null;
    quote_found: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    idx: r.idx,
    claim: r.claim,
    quote: r.quote,
    kind: r.kind,
    libraryId: r.library_id,
    quoteFound: r.quote_found === 1,
  }));
}

export function saveExtraction(
  userId: string,
  paperId: string,
  result: Extraction & { truncated: boolean; model: string },
): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const owned = db.prepare("SELECT 1 FROM paper WHERE user_id = ? AND id = ?").get(userId, paperId);
    if (!owned) throw new Error("paper not found");
    db.prepare("DELETE FROM paper_claim WHERE paper_id = ?").run(paperId);
    const insert = db.prepare(
      `INSERT INTO paper_claim (id, paper_id, idx, claim, quote, kind, library_id, quote_found)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    result.claims.forEach((c, idx) => {
      insert.run(randomUUID(), paperId, idx, c.claim, c.quote, c.kind, c.libraryId, c.quoteFound ? 1 : 0);
    });
    db.prepare(
      `UPDATE paper SET status = 'extracted', error = NULL, title = ?, model = ?, truncated = ?,
              extracted_at = ? WHERE id = ?`,
    ).run(result.title || null, result.model, result.truncated ? 1 : 0, Date.now(), paperId);
  });
  tx();
}

export function markExtractionFailed(userId: string, paperId: string, message: string): void {
  getDb()
    .prepare("UPDATE paper SET status = 'failed', error = ? WHERE user_id = ? AND id = ?")
    .run(message.slice(0, 300), userId, paperId);
}

export async function deletePaper(userId: string, id: string): Promise<boolean> {
  const db = getDb();
  const row = db
    .prepare("SELECT stored_name FROM paper WHERE user_id = ? AND id = ?")
    .get(userId, id) as { stored_name: string } | undefined;
  if (!row) return false;
  db.prepare("DELETE FROM paper_claim WHERE paper_id = ?").run(id);
  db.prepare("DELETE FROM paper WHERE user_id = ? AND id = ?").run(userId, id);
  await rm(path.join(userDir(userId), path.basename(row.stored_name)), { force: true });
  return true;
}
