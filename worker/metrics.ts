// Lab metrics in D1 (LAB_DB): usage counters for the chat and voice demos and
// every message visitors send the profile agents ("Meet my AI" in the chat and the CV
// chat, Sophie in the voice lab), labeled every day by worker/insights.ts. No IPs or
// IP hashes are stored, and emails and phone numbers are masked. Rows older
// than RETAIN_DAYS are deleted by the daily cron (prune). Writing never fails
// a request: errors are logged and dropped.
import type { Env } from './env';

export type EventKind =
  | 'chat_session'
  | 'chat_message'
  | 'chat_limit'
  | 'voice_call'
  | 'voice_resume'
  | 'voice_end';

export interface LabEvent {
  kind: EventKind;
  /** Chat case or page (`meet`, `cv`, `order`…), or the voice lab. */
  subject?: string;
  lang?: string;
  /** End reason, limit code… */
  detail?: string;
  /** Seconds of a voice call, etc. */
  n?: number;
}

export interface Message {
  source: 'chat' | 'cv' | 'voice';
  /** Conversation (chat) or call thread (voice), random, to keep context. */
  conv: string;
  lang?: string;
  text: string;
}

export const RETAIN_DAYS = 180;
const MAX_TEXT = 4000;

// The database is provisioned by wrangler on deploy, so the tables are made
// here (once per isolate) instead of by a migration.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT, lang TEXT, detail TEXT, n REAL)`,
  `CREATE INDEX IF NOT EXISTS events_at ON events (at)`,
  `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, at TEXT NOT NULL, source TEXT NOT NULL, conv TEXT NOT NULL, lang TEXT, text TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS messages_at ON messages (at)`,
  // Daily insights (worker/insights.ts). `day` is the Bogotá day.
  `CREATE TABLE IF NOT EXISTS message_labels (message_id INTEGER PRIMARY KEY, day TEXT NOT NULL, category TEXT, intent TEXT)`,
  `CREATE INDEX IF NOT EXISTS message_labels_day ON message_labels (day)`,
  `CREATE TABLE IF NOT EXISTS message_topics (message_id INTEGER NOT NULL, topic TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (message_id, topic))`,
  `CREATE INDEX IF NOT EXISTS message_topics_day ON message_topics (day, topic)`,
  `CREATE TABLE IF NOT EXISTS conversation_goals (day TEXT NOT NULL, source TEXT NOT NULL, conv TEXT NOT NULL, goal TEXT NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY (day, source, conv))`,
  `CREATE TABLE IF NOT EXISTS topics (name TEXT PRIMARY KEY, first_day TEXT NOT NULL, last_day TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS daily_reports (day TEXT PRIMARY KEY, status TEXT NOT NULL, batch_id TEXT, sent TEXT, model TEXT, conversations INTEGER, messages INTEGER, cost_usd REAL, stats TEXT, report TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
];
let ready: Promise<unknown> | null = null;
const schema = (db: D1Database) => {
  ready ??= db.batch(SCHEMA.map((s) => db.prepare(s))).catch((err: unknown) => {
    ready = null;
    throw err;
  });
  return ready;
};

/** The database with its tables, or null when LAB_DB isn't bound. */
export async function labDb(env: Env) {
  const db = env.LAB_DB;
  if (!db) return null;
  await schema(db);
  return db;
}

async function write(env: Env, what: string, run: (db: D1Database) => unknown) {
  const db = env.LAB_DB;
  if (!db) return;
  try {
    await schema(db);
    await run(db);
  } catch (err) {
    console.error(`metrics ${what}: ${String(err)}`);
  }
}

const now = () => new Date().toISOString();

export const track = (env: Env, e: LabEvent) =>
  write(env, e.kind, (db) =>
    db
      .prepare(
        'INSERT INTO events (at, kind, subject, lang, detail, n) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(
        now(),
        e.kind,
        e.subject ?? null,
        e.lang ?? null,
        e.detail?.slice(0, 120) ?? null,
        e.n ?? null,
      )
      .run(),
  );

/** Masks what could identify the visitor or someone else. */
export const redact = (text: string) =>
  text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    // Phone-like runs of 9+ digits (not "2019-2023").
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) =>
      m.replace(/\D/g, '').length >= 9 ? '[number]' : m,
    );

export const saveMessage = (env: Env, q: Message) => {
  const text = redact(q.text.trim()).slice(0, MAX_TEXT);
  if (!text) return Promise.resolve();
  return write(env, 'message', (db) =>
    db
      .prepare(
        'INSERT INTO messages (at, source, conv, lang, text) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(now(), q.source, q.conv.slice(0, 64), q.lang ?? null, text)
      .run(),
  );
};

/** Deletes what's older than RETAIN_DAYS (the daily cron). */
export const prune = (env: Env) => {
  const before = new Date(Date.now() - RETAIN_DAYS * 86_400_000).toISOString();
  const day = before.slice(0, 10);
  return write(env, 'prune', (db) =>
    db.batch([
      db.prepare('DELETE FROM events WHERE at < ?').bind(before),
      db.prepare('DELETE FROM messages WHERE at < ?').bind(before),
      // Insights go with the messages they were made from.
      ...[
        'message_labels',
        'message_topics',
        'conversation_goals',
        'daily_reports',
      ].map((t) => db.prepare(`DELETE FROM ${t} WHERE day < ?`).bind(day)),
      db.prepare('DELETE FROM topics WHERE last_day < ?').bind(day),
    ]),
  );
};
