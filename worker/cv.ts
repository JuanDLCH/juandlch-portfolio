// The CV (/cv/*.pdf and /cv/cv.json), served from the private JuanDLCH/cv repo so a
// change there reaches the site without a deploy: the repo builds the generic
// CV into fixed paths on main, this fetches them through the GitHub API with a
// read-only token (CV_GITHUB_TOKEN) and caches them at the edge for an hour.
// Without the token, or when GitHub fails, the copies built with the site
// (public/cv-fallback/) are served instead.
import { BUNDLED_CV, parseCv, type CvData } from '../src/lab/chat/cv';
import type { Env } from './env';

/** Served name → path in the CV repo. */
const FILES: Record<string, string> = {
  'Juan-Londono_AI-Engineer.pdf': 'dist/base.en/Juan-Londono_AI-Engineer.pdf',
  'Juan-Londono_AI-Engineer_ES.pdf':
    'dist/base.es/Juan-Londono_AI-Engineer_ES.pdf',
};

const MAX_AGE = 3600;
const JSON_PATH = 'dist/base.en/cv.json';

/** A file of the CV repo on main, or null (no token, missing, GitHub down). */
async function fromRepo(env: Env, path: string) {
  if (!env.CV_GITHUB_TOKEN) return null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${env.CV_REPO}/contents/${path}?ref=main`,
      {
        headers: {
          Authorization: `Bearer ${env.CV_GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.raw',
          'User-Agent': 'juandlch-portfolio',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (res.ok) return res;
    console.error(`cv ${path}: github ${res.status}`);
  } catch (err) {
    console.error(`cv ${path}: ${String(err)}`);
  }
  return null;
}

// The CV as data, per isolate for MAX_AGE (Sophie's profile and /cv/cv.json).
let data: { cv: CvData; source: string; at: number } | null = null;

/** The live CV from the repo's cv.json, checked, else the bundled copy. */
export async function liveCv(env: Env) {
  if (data && Date.now() - data.at < MAX_AGE * 1000) return data;
  const res = await fromRepo(env, JSON_PATH);
  const cv = res ? parseCv(await res.json().catch(() => null)) : null;
  if (res && !cv)
    console.error('cv.json: unexpected shape, using the bundled CV');
  data = {
    cv: cv ?? BUNDLED_CV,
    source: cv ? 'github' : 'bundled',
    at: Date.now(),
  };
  return data;
}

const pdf = (body: BodyInit | null, name: string, source: string) =>
  new Response(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': `public, max-age=${MAX_AGE}`,
      'X-CV-Source': source,
    },
  });

export async function cv(req: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(req.url);
  const name = url.pathname.slice('/cv/'.length);
  if (name === 'cv.json' && (req.method === 'GET' || req.method === 'HEAD')) {
    const { cv, source } = await liveCv(env);
    return Response.json(cv, {
      headers: {
        'Cache-Control': `public, max-age=${MAX_AGE}`,
        'X-CV-Source': source,
      },
    });
  }
  const path = FILES[name];
  if (!path || (req.method !== 'GET' && req.method !== 'HEAD'))
    return new Response('Not found', { status: 404 });

  // One cache entry per file, whatever the query string.
  const key = new Request(new URL(`/cv/${name}`, url.origin).href);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  const res = await fromRepo(env, path);
  if (res) {
    const out = pdf(await res.arrayBuffer(), name, 'github');
    ctx.waitUntil(cache.put(key, out.clone()));
    return out;
  }
  const fallback = await env.ASSETS?.fetch(
    new URL(`/cv-fallback/${name}`, url.origin),
  );
  if (!fallback?.ok) return new Response('Not found', { status: 404 });
  return pdf(fallback.body, name, 'fallback');
}
