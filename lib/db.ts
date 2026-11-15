import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

// ponytail: single SQLite file via node:sqlite. Works on any Node host with a disk
// (VPS, Railway, Fly). Serverless (Vercel) needs a swap to Postgres/Turso.
const dir = path.join(process.cwd(), "data");
mkdirSync(dir, { recursive: true });

const g = globalThis as unknown as { __db?: DatabaseSync };
// Opened on first query, not at import, so parallel build workers never touch the file.
const db = () => (g.__db ??= open());

function open() {
  const d = new DatabaseSync(path.join(dir, "app.db"));
  d.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0, name TEXT DEFAULT '', profile TEXT DEFAULT '{}',
      theme TEXT DEFAULT '{"mode":"auto","brand":"#7c4dff","accent":"#ec4899"}',
      voice TEXT DEFAULT 'Kore', ui_lang TEXT DEFAULT 'en', report_lang TEXT DEFAULT 'en',
      minutes_pref INTEGER DEFAULT 10, reminder TEXT DEFAULT '19:00', timezone TEXT DEFAULT 'UTC',
      plan TEXT DEFAULT 'trial', access_until TEXT, level TEXT, xp INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0, freezes INTEGER DEFAULT 0, last_day TEXT,
      rules_ok INTEGER DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, kind TEXT NOT NULL, email TEXT, used INTEGER DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, day TEXT NOT NULL, kind TEXT DEFAULT 'daily',
      minutes INTEGER, mode TEXT, theme TEXT, turns TEXT DEFAULT '[]', seconds REAL DEFAULT 0,
      speaking REAL DEFAULT 0, provider TEXT, status TEXT DEFAULT 'open', created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, session_id INTEGER, day TEXT, kind TEXT DEFAULT 'daily', data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, version INTEGER, data TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS mistakes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, key TEXT, wrong TEXT, fix TEXT, count INTEGER DEFAULT 1, hp INTEGER DEFAULT 0, UNIQUE(user_id, key));
    CREATE TABLE IF NOT EXISTS badges (user_id INTEGER, id TEXT, day TEXT, PRIMARY KEY(user_id, id));
    CREATE TABLE IF NOT EXISTS tests (user_id INTEGER, kind TEXT, data TEXT, PRIMARY KEY(user_id, kind));
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, room TEXT, user_id INTEGER, name TEXT, text TEXT, audio BLOB, mime TEXT, seconds REAL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS pushes (endpoint TEXT PRIMARY KEY, user_id INTEGER, sub TEXT);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, user_id INTEGER, provider TEXT, type TEXT, reason TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  return d;
}

type P = (string | number | null | Uint8Array)[];
export const get = <T = any>(sql: string, ...p: P) => db().prepare(sql).get(...p) as T | undefined;
export const all = <T = any>(sql: string, ...p: P) => db().prepare(sql).all(...p) as T[];
export const run = (sql: string, ...p: P) => db().prepare(sql).run(...p);
export const J = <T = any>(s: string | null | undefined, d: T): T => {
  try { return s ? JSON.parse(s) : d; } catch { return d; }
};
