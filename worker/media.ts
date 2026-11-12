// The profile photo, live: the dashboard uploads it (PUT /admin/api/photo,
// src/components/admin/PhotoEditor.tsx) and /media/<name> serves it from KV
// (MEDIA), so a new photo needs no deploy. Until one is uploaded (or without
// KV) it serves the copies built with the site, listed by the static
// /media-fallback.json (src/pages/media-fallback.json.ts).
import type { SiteSettings } from '../src/lab/site';
import type { Env } from './env';
import { json } from './http';
import {
  MAX_PART,
  MAX_SOURCE,
  MEDIA,
  parseCrops,
  type Crops,
} from '../src/lab/media';

// Each upload is stored under its own version; `media:current` points to the
// live one and is written last, so a failed upload leaves the previous photo
// served. The one before stays too (isolates may still name it for a minute);
// older ones are deleted.
const KEY = (v: string, name: string) => `media:${v}:${name}`;
const SOURCE = 'source.jpg';
const CURRENT = 'media:current';
const VERSION = /^[0-9a-z]{1,16}$/;
interface Current {
  v: string;
  crops: Crops;
  /** The version before, kept until the next upload. */
  prev?: string;
}
/** Browsers and crawlers recheck after 5 minutes (with the ETag). */
const CACHE = 'public, max-age=300, stale-while-revalidate=86400';

interface Meta {
  type: string;
  v: string;
}

// The bundled copies' URLs, per isolate.
let fallback: Promise<Record<string, string> | null> | null = null;
function bundled(req: Request, env: Env) {
  fallback ??= (async () => {
    const res = await env.ASSETS?.fetch(
      new URL('/media-fallback.json', req.url),
    );
    if (!res?.ok) return null;
    return (await res.json()) as Record<string, string>;
  })().catch(() => null);
  return fallback;
}

const headers = (type: string, source: string, etag?: string) => ({
  'Content-Type': type,
  'Cache-Control': CACHE,
  'X-Media-Source': source,
  'X-Content-Type-Options': 'nosniff',
  ...(etag ? { ETag: etag } : {}),
});

/** GET /media/<name>. */
export async function media(req: Request, env: Env) {
  if (req.method !== 'GET' && req.method !== 'HEAD')
    return new Response(null, { status: 405 });
  const name = new URL(req.url).pathname.slice('/media/'.length);
  const type = MEDIA[name];
  if (!type) return new Response('Not found', { status: 404 });

  // A versioned URL (the link preview's `?v=`) gets that version, whatever
  // this isolate thinks is current; otherwise the current one.
  const read = (v: string) =>
    env.MEDIA?.getWithMetadata<Meta>(KEY(v, name), {
      type: 'arrayBuffer',
    }).catch((err: unknown) => {
      console.error(`media ${name}: ${String(err)}`);
      return null;
    }) ?? null;
  const asked = new URL(req.url).searchParams.get('v');
  let stored = asked && VERSION.test(asked) ? await read(asked) : null;
  if (!stored?.value) {
    const v = await currentVersion(env);
    stored = v ? await read(v) : null;
  }
  if (stored?.value) {
    const etag = `"${stored.metadata?.v ?? 'kv'}"`;
    if (req.headers.get('If-None-Match') === etag)
      return new Response(null, {
        status: 304,
        headers: headers(type, 'kv', etag),
      });
    return new Response(req.method === 'HEAD' ? null : stored.value, {
      headers: headers(stored.metadata?.type ?? type, 'kv', etag),
    });
  }

  const path = (await bundled(req, env))?.[name];
  const res = path ? await env.ASSETS?.fetch(new URL(path, req.url)) : null;
  if (!res?.ok) return new Response('Not found', { status: 404 });
  return new Response(req.method === 'HEAD' ? null : res.body, {
    headers: headers(res.headers.get('Content-Type') ?? type, 'bundled'),
  });
}

// The uploaded photo's version, per isolate for a minute.
let version: { v: string | null; at: number } | null = null;
async function currentVersion(env: Env) {
  if (version && Date.now() - version.at < 60_000) return version.v;
  const saved = await env.MEDIA?.get<Current>(CURRENT, 'json').catch(
    () => null,
  );
  version = { v: saved?.v ?? null, at: Date.now() };
  return version.v;
}

/** A page with its link preview's URL versioned (`?v=`): crawlers cache
 * images by URL, so a new photo gets a new one without a deploy. Also writes
 * the site's mode on <html> (`data-mode`, `data-job-offers`, read by
 * pageSettings in src/lab/site.ts). Pages run through here by
 * `run_worker_first` in wrangler.jsonc. */
export async function versioned(
  res: Response,
  env: Env,
  settings: SiteSettings,
) {
  if (!res.headers.get('Content-Type')?.startsWith('text/html')) return res;
  const v = await currentVersion(env);
  const add = {
    element(el: Element) {
      const url = el.getAttribute('content');
      if (url?.includes('/media/')) el.setAttribute('content', `${url}?v=${v}`);
    },
  };
  const rw = new HTMLRewriter().on('html', {
    element(el) {
      el.setAttribute('data-mode', settings.mode);
      el.setAttribute('data-job-offers', settings.jobOffers);
    },
  });
  if (v)
    rw.on('meta[property="og:image"]', add).on(
      'meta[name="twitter:image"]',
      add,
    );
  return rw.transform(res);
}

/** GET /admin/api/photo: the stored crops and version (null: none yet). */
export async function photoState(env: Env) {
  if (!env.MEDIA) return json({ enabled: false });
  const saved = await env.MEDIA.get<Current>(CURRENT, 'json');
  return json({
    enabled: true,
    v: saved?.v ?? null,
    crops: saved?.crops ?? null,
  });
}

/** GET /admin/api/photo/source: the original, to crop it again. */
export async function photoSource(env: Env) {
  const saved = await env.MEDIA?.get<Current>(CURRENT, 'json');
  const value = saved
    ? await env.MEDIA?.get(KEY(saved.v, SOURCE), 'arrayBuffer')
    : null;
  if (!value) return json({ error: 'not_found' }, 404);
  return new Response(value, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
  });
}

const bytes = async (f: File) => new Uint8Array(await f.arrayBuffer());
const isWebp = (b: Uint8Array) =>
  b.length > 12 &&
  String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
  String.fromCharCode(...b.subarray(8, 12)) === 'WEBP';
const isJpeg = (b: Uint8Array) =>
  b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** PUT /admin/api/photo (multipart): every file of MEDIA by name, `source`
 * (the original as a JPEG) and `crops` (JSON). All or nothing: every part is
 * checked, then stored under a new version, then published. */
export async function savePhoto(req: Request, env: Env) {
  if (!env.MEDIA) return json({ error: 'no_storage' }, 503);
  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: 'bad_request' }, 400);
  let crops: Crops | null = null;
  try {
    crops = parseCrops(JSON.parse(String(form.get('crops'))) as unknown);
  } catch {
    /* not JSON */
  }
  if (!crops) return json({ error: 'bad_crops' }, 400);

  const parts: [string, Uint8Array, string][] = [];
  const entries: [string, string, number, (b: Uint8Array) => boolean][] = [
    ...Object.entries(MEDIA).map(
      ([name, type]) =>
        [name, type, MAX_PART, type === 'image/webp' ? isWebp : isJpeg] as [
          string,
          string,
          number,
          (b: Uint8Array) => boolean,
        ],
    ),
    ['source', 'image/jpeg', MAX_SOURCE, isJpeg],
  ];
  for (const [name, type, max, ok] of entries) {
    const f = form.get(name);
    if (!(f instanceof File)) return json({ error: 'missing', name }, 400);
    if (f.size > max) return json({ error: 'too_big', name }, 413);
    const b = await bytes(f);
    if (!ok(b)) return json({ error: 'bad_type', name }, 400);
    parts.push([name, b, type]);
  }

  const v = Date.now().toString(36);
  const names = parts.map(([name]) => (name === 'source' ? SOURCE : name));
  for (const [i, [, b, type]] of parts.entries())
    await env.MEDIA.put(KEY(v, names[i]), b, {
      metadata: { type, v } satisfies Meta,
    });
  // Published last: until here the live photo is still the previous one.
  const before = await env.MEDIA.get<Current>(CURRENT, 'json');
  await env.MEDIA.put(
    CURRENT,
    JSON.stringify({ v, crops, prev: before?.v } satisfies Current),
  );
  version = { v, at: Date.now() };
  // Two versions back is no longer named anywhere (best effort).
  if (before?.prev)
    await Promise.allSettled(
      names.map((n) => env.MEDIA!.delete(KEY(before.prev!, n))),
    );
  return json({ v, crops });
}
