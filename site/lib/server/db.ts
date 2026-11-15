// One SQLite file under site/.data/ (gitignored) holds accounts, sessions and papers.

import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), ".data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

type Db = InstanceType<typeof Database>;

const globalForDb = globalThis as unknown as { __cruxDb?: Db };

function open(): Db {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "crux.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      pages INTEGER NOT NULL,
      chars INTEGER NOT NULL,
      text TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'uploaded',
      error TEXT,
      model TEXT,
      truncated INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      extracted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS paper_user ON paper (user_id, created_at);
    CREATE TABLE IF NOT EXISTS paper_claim (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES paper (id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      claim TEXT NOT NULL,
      quote TEXT NOT NULL,
      kind TEXT NOT NULL,
      library_id TEXT,
      quote_found INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS paper_claim_paper ON paper_claim (paper_id, idx);
  `);
  db.pragma("foreign_keys = ON");
  return db;
}

export function getDb(): Db {
  globalForDb.__cruxDb ??= open();
  return globalForDb.__cruxDb;
}

/**
 * The session-signing secret. BETTER_AUTH_SECRET wins. Without it, a random secret is
 * generated once and kept in .data/, so a fresh checkout runs without any setup and no
 * default secret is ever shared between installs.
 */
export function authSecret(): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, "auth-secret");
  if (existsSync(file)) {
    const saved = readFileSync(file, "utf8").trim();
    if (saved.length >= 32) return saved;
  }
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
