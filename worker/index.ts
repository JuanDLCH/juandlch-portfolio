// Voice Lab backend. Serves /api/voice/* and, when deployed with the site,
// the static build (ASSETS). The browser never gets an OpenAI key or token:
// it posts its WebRTC offer here and the call is created server side, with
// the session fixed on the server, after a Turnstile check and the daily
// quota. Every call is cut by its VoiceCall alarm after SESSION_S seconds.
import type { Env } from './env';
import { createCall, hangup, sessionConfig } from './openai';

export { VoiceCall } from './call';
export { VoiceQuota } from './quota';

const CALL_ID = /^rtc_[\w-]{1,100}$/;
/** Shorter remainders aren't worth a resume: a new call starts instead. */
const MIN_RESUME_S = 10;

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

const origins = (env: Env) => env.SITE_ORIGIN.split(',').map((o) => o.trim());

/** Pseudonymous IP: an HMAC with a secret key, so it can't be reversed. */
async function ipHash(env: Env, req: Request) {
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

async function turnstileOk(env: Env, req: Request, token: string) {
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

// The profile text changes only with a deploy; keep it per isolate.
let profile: { text: string; at: number } | null = null;
async function loadProfile(env: Env, req: Request) {
  if (profile && Date.now() - profile.at < 600_000) return profile.text;
  const path = '/lab/voice-profile.txt';
  let res = await env.ASSETS?.fetch(new URL(path, req.url));
  if (!res?.ok) res = await fetch(new URL(path, origins(env)[0]));
  if (!res.ok) throw new Error(`profile ${res.status}`);
  profile = { text: await res.text(), at: Date.now() };
  return profile.text;
}

async function startSession(req: Request, env: Env) {
  const body = (await req.json().catch(() => null)) as {
    sdp?: unknown;
    token?: unknown;
    lang?: unknown;
    speed?: unknown;
    resume?: unknown;
  } | null;
  const sdp = body?.sdp;
  const token = body?.token;
  if (
    typeof sdp !== 'string' ||
    !sdp.startsWith('v=0') ||
    sdp.length > 20_000 ||
    typeof token !== 'string' ||
    token.length > 4096
  )
    return json({ error: 'bad_request' }, 400);
  const lang = body?.lang === 'es' ? 'es' : 'en';
  const speed =
    typeof body?.speed === 'number' && Number.isFinite(body.speed)
      ? Math.min(1.5, Math.max(0.8, body.speed))
      : 1;
  const resume =
    typeof body?.resume === 'string' && CALL_ID.test(body.resume)
      ? body.resume
      : null;
  if (!(await turnstileOk(env, req, token)))
    return json({ error: 'captcha' }, 403);

  const budget = Number(env.SESSION_S);
  const ip = await ipHash(env, req);
  const day = new Date().toISOString().slice(0, 10);
  const quota = env.QUOTA.get(env.QUOTA.idFromName(day));
  // Resuming an ended call with time left continues its budget and doesn't
  // count as a new call.
  const used = resume
    ? await env.CALL.get(env.CALL.idFromName(resume)).takeResume(
        ip,
        budget,
        MIN_RESUME_S,
      )
    : null;
  const seconds = budget - (used ?? 0);
  // The active slot outlives the call a bit, in case its cleanup is lost.
  const until = Date.now() + (seconds + 30) * 1000;
  const denied =
    used === null
      ? await quota.reserve(
          ip,
          until,
          Number(env.MAX_PER_IP),
          Number(env.MAX_PER_DAY),
        )
      : await quota.hold(ip, until);
  if (denied) return json({ error: denied }, 429);

  let call: { sdp: string; callId: string } | null = null;
  try {
    const session = sessionConfig(
      env,
      await loadProfile(env, req),
      lang,
      speed,
    );
    call = await createCall(env, sdp, session);
    // A few seconds of grace for the connection to come up.
    const endsAt = Date.now() + (seconds + 5) * 1000;
    await env.CALL.get(env.CALL.idFromName(call.callId)).start(
      { callId: call.callId, ip, day, used: used ?? 0, startedAt: Date.now() },
      endsAt,
      session,
    );
    return json({
      sdp: call.sdp,
      callId: call.callId,
      seconds,
      budget,
      resumed: used !== null,
    });
  } catch (err) {
    console.error(`start: ${String(err)}`);
    // Never leave a call running without its cutoff.
    if (call) await hangup(env, call.callId);
    if (used === null) await quota.refund(ip);
    else await quota.release(ip);
    return json({ error: 'unavailable' }, 502);
  }
}

async function endSession(req: Request, env: Env) {
  const body = (await req.json().catch(() => null)) as {
    callId?: unknown;
  } | null;
  const callId = body?.callId;
  if (typeof callId !== 'string' || !CALL_ID.test(callId))
    return json({ error: 'bad_request' }, 400);
  const ended = await env.CALL.get(env.CALL.idFromName(callId)).end(
    await ipHash(env, req),
  );
  return json({ ended });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/voice/'))
      return (
        env.ASSETS?.fetch(req) ?? new Response('Not found', { status: 404 })
      );
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    // Same-origin only: the site's own pages.
    if (!origins(env).includes(req.headers.get('Origin') ?? ''))
      return json({ error: 'origin' }, 403);
    if (url.pathname === '/api/voice/session') return startSession(req, env);
    if (url.pathname === '/api/voice/end') return endSession(req, env);
    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
