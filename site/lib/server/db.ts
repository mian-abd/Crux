// One SQLite file under site/.data/ (gitignored) holds accounts, sessions and papers.
// Node's built-in SQLite (node:sqlite), so installing the site needs no C++ compiler.

import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), ".data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

type Db = DatabaseSync;

const globalForDb = globalThis as unknown as { __cruxDb?: Db };

// `next build` imports these modules in several workers at once. They must not race to
// create the real file (a fresh checkout's build failed with "database is locked"), and the
// build never needs real data, so build workers get a throwaway in-memory database.
const BUILDING = process.env.NEXT_PHASE === "phase-production-build";

function open(): Db {
  if (BUILDING) return init(new DatabaseSync(":memory:"));
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "crux.sqlite"), { timeout: 5000 });
  db.exec("PRAGMA journal_mode = WAL;");
  return init(db);
}

function init(db: Db): Db {
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
    CREATE TABLE IF NOT EXISTS live_run (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      run_id TEXT,
      case_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS live_run_user ON live_run (user_id, created_at);
    CREATE INDEX IF NOT EXISTS live_run_time ON live_run (created_at);
  `);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

/** Run fn in one transaction: committed if it returns, rolled back if it throws. */
export function inTransaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
