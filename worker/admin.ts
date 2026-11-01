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

/** The range asked for, as Bogotá days: `from` and `to` (both included, `to`
 * no later than today, at most a year), or the last 30 days. */
function rangeOf(url: URL) {
  const today = bogotaDay(Date.now());
  const to = url.searchParams.get('to') ?? today;
  const from =
    url.searchParams.get('from') ?? bogotaDay(Date.now() - 29 * DAY_MS);
  if (!DAY.test(from) || !DAY.test(to) || from > to || to > today) return null;
  if (Date.parse(to) - Date.parse(from) > 366 * DAY_MS) return null;
  return { from, to };
}

/** A day's messages, voice calls and cost per Bogotá hour ('00'…'23'). */
async function hourly(db: D1Database, fromAt: string, toAt: string) {
  const hour = "strftime('%H', at, '-5 hours')";
  const [messages, calls, costs, views] = await db.batch<
    Record<string, string | number | null>
  >([
    db
      .prepare(
        `SELECT ${hour} AS h, source, count(*) AS n FROM messages WHERE at >= ? AND at < ? GROUP BY 1, 2`,
      )
      .bind(fromAt, toAt),
    db
      .prepare(
        `SELECT ${hour} AS h, count(*) AS n FROM events WHERE kind = 'voice_call' AND at >= ? AND at < ? GROUP BY 1`,
      )
      .bind(fromAt, toAt),
    db
      .prepare(
        `SELECT ${hour} AS h, sum(n) AS usd FROM events WHERE kind IN ('chat_cost', 'voice_cost') AND at >= ? AND at < ? GROUP BY 1`,
      )
      .bind(fromAt, toAt),
    db
      .prepare(
        `SELECT ${hour} AS h, detail AS k, count(*) AS views, sum(n) AS visits FROM events WHERE kind = 'page_view' AND at >= ? AND at < ? GROUP BY 1, 2`,
      )
      .bind(fromAt, toAt),
  ]);
  return {
    messages: messages.results,
    calls: calls.results,
    costs: costs.results,
    views: views.results,
  };
}

/** Counts per day and totals between `from` and `to` (Bogotá days). */
async function overview(db: D1Database, from: string, to: string) {
  const [fromAt] = windowOf(from);
  const [, toAt] = windowOf(to);
  // Bogotá day of a UTC timestamp, in SQL.
  const local = "date(at, '-5 hours')";
  const [
    reports,
    activity,
    msgs,
    convs,
    category,
    intent,
    goal,
    topic,
    demos,
    costs,
    countries,
    vDays,
    vPaths,
    vCountries,
    vRefs,
    vSince,
  ] = await db.batch<Record<string, string | number | null>>([
    db
      .prepare(
        'SELECT day, status, conversations, messages, cost_usd, error FROM daily_reports WHERE day >= ? AND day <= ? ORDER BY day DESC',
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT ${local} AS day, kind, count(*) AS n FROM events WHERE at >= ? AND at < ? GROUP BY 1, 2`,
      )
      .bind(fromAt, toAt),
    db
      .prepare(
        `SELECT ${local} AS day, source, count(*) AS n, count(DISTINCT conv) AS convs FROM messages WHERE at >= ? AND at < ? GROUP BY 1, 2`,
      )
      .bind(fromAt, toAt),
    // Conversations over the whole range: one spanning midnight counts once.
    db
      .prepare(
        'SELECT count(*) AS n FROM (SELECT DISTINCT source, conv FROM messages WHERE at >= ? AND at < ?)',
      )
      .bind(fromAt, toAt),
    ...['category', 'intent'].map((c) =>
      db
        .prepare(
          `SELECT ${c} AS k, count(*) AS n FROM message_labels WHERE day >= ? AND day <= ? GROUP BY 1 ORDER BY 2 DESC`,
        )
        .bind(from, to),
    ),
    db
      .prepare(
        'SELECT goal AS k, count(*) AS n FROM conversation_goals WHERE day >= ? AND day <= ? GROUP BY 1 ORDER BY 2 DESC',
      )
      .bind(from, to),
    db
      .prepare(
        'SELECT topic AS k, count(*) AS n, count(DISTINCT day) AS days FROM message_topics WHERE day >= ? AND day <= ? GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20',
      )
      .bind(from, to),
    // Every demo, not only the profile: messages and conversations (the
    // conversation id is in `detail`; older rows have none).
    db
      .prepare(
        `SELECT subject AS k, count(*) AS n, count(DISTINCT detail) AS convs FROM events
           WHERE kind = 'chat_message' AND at >= ? AND at < ? GROUP BY 1 ORDER BY 2 DESC`,
      )
      .bind(fromAt, toAt),
    // What each part cost per day (chat per case, voice notes, voice).
    db
      .prepare(
        `SELECT ${local} AS day, subject AS k, sum(n) AS usd FROM events
           WHERE kind IN ('chat_cost', 'voice_cost') AND at >= ? AND at < ? GROUP BY 1, 2`,
      )
      .bind(fromAt, toAt),
    // Where demo users are: chat conversations plus voice calls. Older
    // messages have no conversation id and are left out, not guessed.
    db
      .prepare(
        `SELECT k, n FROM (
           SELECT country AS k,
             count(DISTINCT CASE WHEN kind = 'chat_message' THEN detail END)
               + sum(kind = 'voice_call') AS n
           FROM events WHERE kind IN ('chat_message', 'voice_call') AND at >= ? AND at < ?
           GROUP BY 1
         ) WHERE n > 0 ORDER BY n DESC LIMIT 15`,
      )
      .bind(fromAt, toAt),
    // Page views from the site's own counter (worker/hits.ts): people and
    // bots per day, and the people's pages, countries and referrers.
    db
      .prepare(
        `SELECT ${local} AS day, detail AS k, count(*) AS views, sum(n) AS visits FROM events
         WHERE kind = 'page_view' AND at >= ? AND at < ? GROUP BY 1, 2`,
      )
      .bind(fromAt, toAt),
    db
      .prepare(
        `SELECT subject AS k, count(*) AS views, sum(n) AS visits FROM events
         WHERE kind = 'page_view' AND detail = 'human' AND at >= ? AND at < ?
         GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
      )
      .bind(fromAt, toAt),
    db
      .prepare(
        `SELECT country AS k, count(*) AS views, sum(n) AS visits FROM events
         WHERE kind = 'page_view' AND detail = 'human' AND at >= ? AND at < ?
         GROUP BY 1 ORDER BY 3 DESC, 2 DESC LIMIT 15`,
      )
      .bind(fromAt, toAt),
    db
      .prepare(
        `SELECT coalesce(ref, '') AS k, count(*) AS visits FROM events
         WHERE kind = 'page_view' AND detail = 'human' AND n = 1 AND at >= ? AND at < ?
         GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      )
      .bind(fromAt, toAt),
    db.prepare("SELECT min(at) AS at FROM events WHERE kind = 'page_view'"),
  ]);
  return {
    from,
    to,
    reports: reports.results,
    activity: activity.results,
    messages: msgs.results,
    conversations: Number(convs.results[0]?.n ?? 0),
    category: category.results,
    intent: intent.results,
    goal: goal.results,
    topic: topic.results,
    demos: demos.results,
    costs: costs.results,
    countries: countries.results,
    views: {
      days: vDays.results,
      paths: vPaths.results,
      countries: vCountries.results,
      referrers: vRefs.results,
      since: (vSince.results[0]?.at as string | null) ?? null,
    },
    // A single day is charted by hour (Bogotá).
    hours: from === to ? await hourly(db, fromAt, toAt) : null,
  };
}

// --- Traffic (Cloudflare Web Analytics) ------------------------------------------

const TRAFFIC_QUERY = `query ($a: String!, $t: String!, $s: Time!, $e: Time!) {
  viewer { accounts(filter: { accountTag: $a }) {
    hours: rumPageloadEventsAdaptiveGroups(limit: 5000, filter: { siteTag: $t, datetime_geq: $s, datetime_lt: $e }) {
      count sum { visits } dimensions { datetimeHour }
    }
    paths: rumPageloadEventsAdaptiveGroups(limit: 15, orderBy: [count_DESC], filter: { siteTag: $t, datetime_geq: $s, datetime_lt: $e }) {
      count sum { visits } dimensions { requestPath }
    }
    countries: rumPageloadEventsAdaptiveGroups(limit: 15, orderBy: [sum_visits_DESC], filter: { siteTag: $t, datetime_geq: $s, datetime_lt: $e }) {
      count sum { visits } dimensions { countryName }
    }
    referrers: rumPageloadEventsAdaptiveGroups(limit: 10, orderBy: [sum_visits_DESC], filter: { siteTag: $t, datetime_geq: $s, datetime_lt: $e }) {
      count sum { visits } dimensions { refererHost }
    }
  } }
}`;

interface Group {
  count: number;
  sum: { visits: number };
  dimensions: Record<string, string>;
}

// Per isolate, a few minutes: the dashboard reloads it on every range change.
const trafficCache = new Map<string, { at: number; body: unknown }>();

/** Page views and visits (estimates: Cloudflare samples them), by hour (the
 * page groups them by Bogotá day), page, country and referrer. */
async function traffic(env: Env, from: string, to: string) {
  if (!env.CF_ANALYTICS_TOKEN) return { enabled: false };
  const key = `${from}:${to}`;
  const hit = trafficCache.get(key);
  if (hit && Date.now() - hit.at < 300_000) return hit.body;
  const [start] = windowOf(from);
  const end = Math.min(Date.parse(windowOf(to)[1]), Date.now());
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: TRAFFIC_QUERY,
      variables: {
        a: env.CF_ACCOUNT_ID,
        t: env.CF_SITE_TAG,
        s: start,
        e: new Date(end).toISOString(),
      },
    }),
  });
  const out = (await res.json()) as {
    data?: { viewer?: { accounts?: Record<string, Group[]>[] } };
    errors?: { message: string }[] | null;
  };
  const acc = out.data?.viewer?.accounts?.[0];
  if (!res.ok || out.errors?.length || !acc)
    throw new Error(
      `analytics ${res.status}: ${out.errors?.[0]?.message ?? 'no data'}`,
    );
  const rows = (list: Group[] | undefined, dim: string) =>
    (list ?? []).map((g) => ({
      k: g.dimensions[dim] ?? '',
      views: g.count,
      visits: g.sum.visits,
    }));
  const body = {
    enabled: true,
    hours: rows(acc.hours, 'datetimeHour'),
    paths: rows(acc.paths, 'requestPath'),
    countries: rows(acc.countries, 'countryName'),
    referrers: rows(acc.referrers, 'refererHost'),
  };
  trafficCache.set(key, { at: Date.now(), body });
  return body;
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
      const r = rangeOf(url);
      if (!r) return json({ error: 'bad_request' }, 400);
      return json(await overview(db, r.from, r.to));
    }
    case 'GET /admin/api/traffic': {
      const r = rangeOf(url);
      if (!r) return json({ error: 'bad_request' }, 400);
      try {
        return json(await traffic(env, r.from, r.to));
      } catch (err) {
        console.error(String(err));
        return json({ error: 'analytics' }, 502);
      }
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
