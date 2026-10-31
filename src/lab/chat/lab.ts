// The chat on the site's key (BYOK off): a session token from the Worker
// (worker/chat.ts) stands in for an API key. It's issued after a Turnstile
// check, bound to the visitor's IP and valid for two hours; it lives only in
// this module (never stored), and a new one is fetched when it's about to
// expire. SDK clients take `labToken` as their apiKey.
import { getToken } from '../voice/turnstile';

export const LAB_API = '/api/chat/v1';

/** Thrown when the visitor doesn't pass the bot check. */
export class CaptchaError extends Error {}

let token: { value: string; exp: number } | null = null;
let pending: Promise<string> | null = null;

/** Forgets the token (the Worker rejected it, e.g. the IP changed). */
export const dropLabToken = () => {
  token = null;
};

async function fetchToken() {
  const lang = document.documentElement.dataset.lang === 'es' ? 'es' : 'en';
  // Turnstile shows here only if Cloudflare needs the visitor to interact.
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:60';
  document.body.append(box);
  try {
    const check = await getToken(box, lang).catch(() => {
      throw new CaptchaError();
    });
    const res = await fetch('/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: check }),
    });
    if (res.status === 403) throw new CaptchaError();
    if (!res.ok) throw new Error(`session ${res.status}`);
    const out = (await res.json()) as { token: string };
    const exp = Number(out.token.split('.')[1]);
    token = { value: out.token, exp };
    return out.token;
  } finally {
    box.remove();
  }
}

/** A valid session token, fetching one when needed (once at a time). */
export async function labToken() {
  if (token && token.exp - Date.now() > 5 * 60_000) return token.value;
  pending ??= fetchToken().finally(() => {
    pending = null;
  });
  return pending;
}
