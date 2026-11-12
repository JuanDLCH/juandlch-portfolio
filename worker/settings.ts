// The site's mode and job-offer status (src/lab/site.ts), set from /admin
// and stored in Workers KV (SETTINGS), so switching needs no deploy. Read on
// every page and agent session, so each isolate keeps it for a minute: a
// change reaches every visitor within about a minute.
import {
  DEFAULT_SETTINGS,
  parseSettings,
  type SiteSettings,
} from '../src/lab/site';
import type { Env } from './env';
import { json } from './http';

const KEY = 'site';
const TTL_MS = 60_000;

let cached: { s: SiteSettings; at: number } | null = null;

export async function siteSettings(env: Env): Promise<SiteSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.s;
  const raw = await env.SETTINGS?.get(KEY, 'json').catch(() => null);
  const s = parseSettings(raw) ?? DEFAULT_SETTINGS;
  cached = { s, at: Date.now() };
  return s;
}

/** GET /admin/api/settings. */
export async function settingsState(env: Env) {
  return json({ enabled: !!env.SETTINGS, settings: await siteSettings(env) });
}

/** PUT /admin/api/settings: `{ mode, jobOffers }`. */
export async function saveSettings(req: Request, env: Env) {
  if (!env.SETTINGS) return json({ error: 'no_storage' }, 503);
  const s = parseSettings(await req.json().catch(() => null));
  if (!s) return json({ error: 'bad_request' }, 400);
  await env.SETTINGS.put(KEY, JSON.stringify(s));
  // This isolate sees it at once; the others within TTL_MS.
  cached = { s, at: Date.now() };
  return json({ enabled: true, settings: s });
}
