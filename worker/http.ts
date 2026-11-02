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

/** The network a visitor's IP stands for in the quotas: an IPv4 as it is, an
 * IPv6 as its /64 prefix. One device (or a cheap server) gets a whole /64, so
 * counting full IPv6 addresses would give one person endless quotas. */
export function ipKey(ip: string) {
  if (!ip.includes(':')) return ip;
  // An embedded IPv4 tail (::ffff:1.2.3.4) is two groups; only the first
  // four groups matter, so it can be left out.
  const [head, tail = ''] = ip.toLowerCase().split('%')[0].split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [
        ...left,
        ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'),
        ...right,
      ]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => (parseInt(g, 16) || 0).toString(16))
    .join(':')}::/64`;
}

/** Pseudonymous IP: an HMAC with a secret key, so it can't be reversed. */
export async function ipHash(env: Env, req: Request) {
  const ip = ipKey(req.headers.get('CF-Connecting-IP') ?? 'unknown');
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
