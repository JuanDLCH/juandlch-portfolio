// Page views sent by every public page (src/scripts/hit.ts), told apart into
// people and bots, for the dashboard's site traffic. Web Analytics counts
// whatever runs JavaScript; here the Worker also sees the network a view
// comes from. A view is a bot when:
// - its user agent says so (crawlers, previews, headless browsers, scripts),
// - the browser is driven by automation (navigator.webdriver), or
// - it comes from a data-center network (cloud and hosting providers),
//   where people don't browse from, but crawlers and scanners run.
// Stored: path, the reason, country and referring host; no IP or user agent.
// Messaging apps aren't in BOT_UA: their link previews don't run JavaScript
// (so they never get here) and some in-app browsers carry their names.
import type { Env } from './env';
import { json, origins } from './http';
import { countryOf, track } from './metrics';

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|python|curl|wget|httpclient|okhttp|axios|node-fetch|go-http|java\/|phantom|puppeteer|playwright|selenium|scrapy|semrush|ahrefs|mj12|dotbot|petal|bytespider|gptbot|claude|perplexity|ccbot/i;

/** Cloud and hosting networks (Cloudflare's `asOrganization`). Not Akamai,
 * Cloudflare or Fastly: iCloud Private Relay and WARP send people's traffic
 * through them. */
const DATA_CENTER =
  /amazon|aws|google cloud|googlebot|microsoft|azure|digitalocean|ovh|hetzner|linode|vultr|choopa|oracle|alibaba|tencent|huawei cloud|contabo|scaleway|online s\.a\.s|leaseweb|ionos|hostinger|m247|datacamp|quadranet|psychz|colocrossing|hostwinds|kamatera|upcloud|netcup|servers\.com|zenlayer|g-core|gcore|cdn77|tzulo|limestone|interserver|hivelocity/i;

const PATH = /^\/[\w\-./]{0,200}$/;

/** Why a view is a bot, or null for a person. */
function botReason(req: Request, webdriver: boolean) {
  const ua = req.headers.get('User-Agent') ?? '';
  if (!ua || BOT_UA.test(ua)) return 'ua';
  if (webdriver) return 'automation';
  const org = (req.cf as { asOrganization?: string } | undefined)
    ?.asOrganization;
  if (org && DATA_CENTER.test(org)) return 'datacenter';
  return null;
}

export async function hit(req: Request, env: Env, ctx: ExecutionContext) {
  const body = (await req.json().catch(() => null)) as {
    path?: unknown;
    ref?: unknown;
    wd?: unknown;
  } | null;
  const path = typeof body?.path === 'string' ? body.path : '';
  if (!PATH.test(path)) return json({ error: 'bad_request' }, 400);
  // The referring host: none (direct), this site (a view within the visit),
  // or another site (a visit that starts there).
  let host = '';
  try {
    host =
      typeof body?.ref === 'string' && body.ref
        ? new URL(body.ref).hostname
        : '';
  } catch {
    host = '';
  }
  const own = origins(env).some((o) => {
    try {
      return new URL(o).hostname === host;
    } catch {
      return false;
    }
  });
  const why = botReason(req, body?.wd === true);
  ctx.waitUntil(
    track(env, {
      kind: 'page_view',
      subject: path.replace(/\/+$/, '') || '/',
      detail: why ? `bot:${why}` : 'human',
      n: own ? 0 : 1,
      country: countryOf(req),
      ref: own ? undefined : host || undefined,
    }),
  );
  return new Response(null, { status: 204 });
}
