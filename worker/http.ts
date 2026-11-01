// HTTP helpers shared by the voice and chat routes.
import type { Env } from './env';

export const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });

/** A refusal the OpenAI SDK must not retry (limits, captcha, auth). */
export const refuse = (error: string, status: number) =>
  json({ error: { code: error, message: error } }, status, {
    'x-should-retry': 'false',
  });

export const origins = (env: Env) =>
  env.SITE_ORIGIN.split(',').map((o) => o.trim());

/** Pseudonymous IP: an HMAC with a secret key, so it can't be reversed. */
export async function ipHash(env: Env, req: Request) {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.IP_SALT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(ip),
  );
  return [...new Uint8Array(sig).slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function turnstileOk(env: Env, req: Request, token: string) {
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET);
  form.set('response', token);
  const ip = req.headers.get('CF-Connecting-IP');
  if (ip) form.set('remoteip', ip);
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body: form },
  );
  const out = (await res.json()) as { success?: boolean };
  return out.success === true;
}
