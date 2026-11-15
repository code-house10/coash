import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdirSync } from "node:fs";

// libSQL: a local SQLite file in development, a hosted Turso database in production
// (serverless hosts such as Vercel have no writable disk). Same SQL either way.
const url = process.env.TURSO_DATABASE_URL || "file:data/app.db";

const SCHEMA = `
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
`;

// Opened on first query (not at import), and the schema is applied once per server instance.
const g = globalThis as unknown as { __db?: Promise<Client> };
const db = () => (g.__db ??= (async () => {
  if (url.startsWith("file:")) mkdirSync("data", { recursive: true });
  const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  await c.executeMultiple(SCHEMA);
  return c;
})().catch((e) => { g.__db = undefined; throw e; }));

type P = InValue[];
const exec = async (sql: string, args: P) => (await db()).execute({ sql, args });
// Rows come back as plain objects keyed by column name.
const plain = (r: Awaited<ReturnType<typeof exec>>) => r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));

export const all = async <T = any>(sql: string, ...p: P) => plain(await exec(sql, p)) as T[];
export const get = async <T = any>(sql: string, ...p: P) => (await all<T>(sql, ...p))[0] as T | undefined;
export const run = async (sql: string, ...p: P) => {
  const r = await exec(sql, p);
  return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
};
export const J = <T = any>(s: string | null | undefined, d: T): T => {
  try { return s ? JSON.parse(s) : d; } catch { return d; }
};
