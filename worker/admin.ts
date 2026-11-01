// The insights dashboard's API (/admin/api/*, read by src/components/admin/).
// Cloudflare Access guards /admin on juandlch.dev, but the workers.dev host
// serves this Worker too without it, so every request must carry a valid
// Access JWT (Cf-Access-Jwt-Assertion): RS256, signed by one of the team's
// keys, for this application's AUD, not expired. In dev (localhost only),
// ADMIN_DEV=1 skips it.
import type { Env } from './env';
import { json, origins } from './http';
import { bogotaDay, runInsights, windowOf } from './insights';
import { labDb } from './metrics';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const b64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
const text = (s: string) => new TextDecoder().decode(b64url(s));

// The team's signing keys, refetched when a token names one we don't have.
let certs: { keys: Map<string, CryptoKey>; at: number } | null = null;
async function signingKey(env: Env, kid: string) {
  if (!certs?.keys.has(kid) || Date.now() - certs.at > 3_600_000) {
    const res = await fetch(`https://${env.ACCESS_TEAM}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`certs ${res.status}`);
    const { keys } = (await res.json()) as {
      keys: (JsonWebKey & { kid: string })[];
    };
    const map = new Map<string, CryptoKey>();
    for (const k of keys)
      map.set(
        k.kid,
        await crypto.subtle.importKey(
          'jwk',
          k,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        ),
      );
    certs = { keys: map, at: Date.now() };
  }
  return certs.keys.get(kid) ?? null;
}

/** Whether the request comes through Access, signed in. */
async function allowed(req: Request, env: Env) {
  const url = new URL(req.url);
  if (env.ADMIN_DEV === '1' && url.hostname === 'localhost') return true;
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) return false;
  const token = req.headers.get('Cf-Access-Jwt-Assertion') ?? '';
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return false;
  try {
    const header = JSON.parse(text(h)) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) return false;
    const key = await signingKey(env, header.kid);
    if (!key) return false;
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64url(sig),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return false;
    const claims = JSON.parse(text(p)) as {
      aud?: string | string[];
      iss?: string;
      exp?: number;
      nbf?: number;
    };
    const now = Date.now() / 1000;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    return (
      aud.includes(env.ACCESS_AUD) &&
      claims.iss === `https://${env.ACCESS_TEAM}` &&
      typeof claims.exp === 'number' &&
      claims.exp > now &&
      (claims.nbf ?? 0) <= now + 60
    );
  } catch {
    return false;
  }
}

/** Counts per day and totals for the last `days` days (Bogotá). */
async function overview(db: D1Database, days: number) {
  const from = bogotaDay(Date.now() - (days - 1) * DAY_MS);
  const [fromAt] = windowOf(from);
  // Bogotá day of a UTC timestamp, in SQL.
  const local = "date(at, '-5 hours')";
  const [reports, activity, msgs, convs, category, intent, goal, topic] =
    await db.batch<Record<string, string | number | null>>([
      db
        .prepare(
          'SELECT day, status, conversations, messages, cost_usd, error FROM daily_reports WHERE day >= ? ORDER BY day DESC',
        )
        .bind(from),
      db
        .prepare(
          `SELECT ${local} AS day, kind, count(*) AS n FROM events WHERE at >= ? GROUP BY 1, 2`,
        )
        .bind(fromAt),
      db
        .prepare(
          `SELECT ${local} AS day, source, count(*) AS n, count(DISTINCT conv) AS convs FROM messages WHERE at >= ? GROUP BY 1, 2`,
        )
        .bind(fromAt),
      // Conversations over the whole range: one spanning midnight counts once.
      db
        .prepare(
          'SELECT count(*) AS n FROM (SELECT DISTINCT source, conv FROM messages WHERE at >= ?)',
        )
        .bind(fromAt),
      ...['category', 'intent'].map((c) =>
        db
          .prepare(
            `SELECT ${c} AS k, count(*) AS n FROM message_labels WHERE day >= ? GROUP BY 1 ORDER BY 2 DESC`,
          )
          .bind(from),
      ),
      db
        .prepare(
          'SELECT goal AS k, count(*) AS n FROM conversation_goals WHERE day >= ? GROUP BY 1 ORDER BY 2 DESC',
        )
        .bind(from),
      db
        .prepare(
          'SELECT topic AS k, count(*) AS n, count(DISTINCT day) AS days FROM message_topics WHERE day >= ? GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20',
        )
        .bind(from),
    ]);
  return {
    from,
    to: bogotaDay(Date.now()),
    reports: reports.results,
    activity: activity.results,
    messages: msgs.results,
    conversations: Number(convs.results[0]?.n ?? 0),
    category: category.results,
    intent: intent.results,
    goal: goal.results,
    topic: topic.results,
  };
}

/** Message ids a stored report cites. */
function citedIds(raw: unknown): number[] {
  try {
    const doc = JSON.parse(String(raw ?? '{}')) as {
      interests?: { message_ids?: number[] }[];
      goals?: { message_ids?: number[] }[];
    };
    return [...(doc.interests ?? []), ...(doc.goals ?? [])].flatMap(
      (i) => i.message_ids ?? [],
    );
  } catch {
    return [];
  }
}

/** Messages listed per day; the report's citations are fetched apart. */
const DAY_LIMIT = 1000;

/** A day's report, its messages with their labels (up to DAY_LIMIT, with
 * the total), and every message the report cites, wherever it falls. */
async function dayDetail(db: D1Database, day: string) {
  const [from, to] = windowOf(day);
  const [report, msgs, goals, total] = await db.batch<
    Record<string, string | number | null>
  >([
    db
      .prepare(
        'SELECT day, status, model, conversations, messages, cost_usd, stats, report, error, updated_at FROM daily_reports WHERE day = ?',
      )
      .bind(day),
    db
      .prepare(
        `SELECT m.id, m.at, m.source, m.conv, m.text, l.category, l.intent,
           (SELECT group_concat(topic, '|') FROM message_topics t WHERE t.message_id = m.id) AS topics
         FROM messages m LEFT JOIN message_labels l ON l.message_id = m.id
         WHERE m.at >= ? AND m.at < ? ORDER BY m.at, m.id LIMIT ${DAY_LIMIT}`,
      )
      .bind(from, to),
    db
      .prepare(
        'SELECT source, conv, goal, evidence FROM conversation_goals WHERE day = ?',
      )
      .bind(day),
    db
      .prepare('SELECT count(*) AS n FROM messages WHERE at >= ? AND at < ?')
      .bind(from, to),
  ]);
  const row = report.results[0] ?? null;
  const ids = citedIds(row?.report);
  const cited = ids.length
    ? (
        await db
          .prepare(
            'SELECT id, text FROM messages WHERE id IN (SELECT value FROM json_each(?))',
          )
          .bind(JSON.stringify([...new Set(ids)]))
          .all<Record<string, string | number | null>>()
      ).results
    : [];
  return {
    report: row,
    messages: msgs.results,
    total: Number(total.results[0]?.n ?? 0),
    cited,
    goals: goals.results,
  };
}

export async function admin(req: Request, env: Env) {
  if (!(await allowed(req, env))) return json({ error: 'forbidden' }, 403);
  const db = await labDb(env);
  if (!db) return json({ error: 'no_db' }, 503);
  const url = new URL(req.url);
  const day = url.searchParams.get('day') ?? '';
  switch (`${req.method} ${url.pathname}`) {
    case 'GET /admin/api/overview': {
      const days = Number(url.searchParams.get('days'));
      return json(await overview(db, [7, 30, 90].includes(days) ? days : 30));
    }
    case 'GET /admin/api/day':
      if (!DAY.test(day)) return json({ error: 'bad_request' }, 400);
      return json(await dayDetail(db, day));
    case 'POST /admin/api/rerun': {
      // A state change: only from the dashboard's own pages.
      const origin = req.headers.get('Origin') ?? '';
      if (origin !== url.origin || !origins(env).includes(origin))
        if (!(env.ADMIN_DEV === '1' && url.hostname === 'localhost'))
          return json({ error: 'origin' }, 403);
      if (!DAY.test(day) || day >= bogotaDay(Date.now()))
        return json({ error: 'bad_request' }, 400);
      await runInsights(env, day);
      return json(await dayDetail(db, day));
    }
  }
  return json({ error: 'not_found' }, 404);
}
