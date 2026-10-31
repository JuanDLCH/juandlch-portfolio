// Cloudflare Turnstile for the voice lab: a fresh token on every Start (they
// are single-use and expire in ~300 s), checked by the Worker. The widget
// stays invisible unless Cloudflare needs the visitor to interact.
interface Turnstile {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Cloudflare's test sitekey (always passes) for local dev.
const SITEKEY =
  import.meta.env.PUBLIC_TURNSTILE_SITEKEY ??
  (import.meta.env.DEV ? '1x00000000000000000000AA' : '');

let script: Promise<Turnstile> | null = null;
const load = () =>
  (script ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('ts'));
    s.onerror = () => {
      script = null;
      reject(new Error('turnstile'));
    };
    document.head.append(s);
  }));

/** Gets a token through a widget rendered in `el`, then removes it. */
export async function getToken(el: HTMLElement, lang: 'en' | 'es') {
  const ts = await load();
  return new Promise<string>((resolve, reject) => {
    const id = ts.render(el, {
      sitekey: SITEKEY,
      execution: 'execute',
      appearance: 'interaction-only',
      language: lang,
      action: 'voice',
      callback: (token: string) => {
        resolve(token);
        ts.remove(id);
      },
      'error-callback': () => {
        reject(new Error('turnstile'));
        ts.remove(id);
      },
      'timeout-callback': () => {
        reject(new Error('turnstile'));
        ts.remove(id);
      },
    });
    ts.execute(id);
  });
}
