// Lab metrics in D1 (LAB_DB): usage counters for the chat and voice demos and
// what visitors ask the profile agents ("Meet my AI" in the chat and the CV
// chat, Sophie in the voice lab), for scripts/analyze-questions.mjs. No IPs or
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

export interface Question {
  source: 'chat' | 'cv' | 'voice';
  /** Conversation (chat) or call thread (voice), random, to keep context. */
  conv: string;
  lang?: string;
  text: string;
}

const RETAIN_DAYS = 180;
const MAX_TEXT = 4000;

// The database is provisioned by wrangler on deploy, so the tables are made
// here (once per isolate) instead of by a migration.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT, lang TEXT, detail TEXT, n REAL)`,
  `CREATE INDEX IF NOT EXISTS events_at ON events (at)`,
  `CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY, at TEXT NOT NULL, source TEXT NOT NULL, conv TEXT NOT NULL, lang TEXT, text TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS questions_at ON questions (at)`,
];
let ready: Promise<unknown> | null = null;
const schema = (db: D1Database) => {
  ready ??= db.batch(SCHEMA.map((s) => db.prepare(s))).catch((err: unknown) => {
    ready = null;
    throw err;
  });
  return ready;
};

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

export const saveQuestion = (env: Env, q: Question) => {
  const text = redact(q.text.trim()).slice(0, MAX_TEXT);
  if (!text) return Promise.resolve();
  return write(env, 'question', (db) =>
    db
      .prepare(
        'INSERT INTO questions (at, source, conv, lang, text) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(now(), q.source, q.conv.slice(0, 64), q.lang ?? null, text)
      .run(),
  );
};

/** Deletes what's older than RETAIN_DAYS (the daily cron). */
export const prune = (env: Env) => {
  const before = new Date(Date.now() - RETAIN_DAYS * 86_400_000).toISOString();
  return write(env, 'prune', (db) =>
    db.batch([
      db.prepare('DELETE FROM events WHERE at < ?').bind(before),
      db.prepare('DELETE FROM questions WHERE at < ?').bind(before),
    ]),
  );
};
