// Lab backend: the voice lab (/api/voice/*, below) and the chat lab on the
// site's key (/api/chat/*, chat.ts), and, when deployed with the site, the
// static build (ASSETS). Voice: The browser never gets an OpenAI key or token:
// it posts its WebRTC offer here and the call is created server side, with
// the session fixed on the server, after a Turnstile check and the daily
// quota. Every call is cut by its VoiceCall alarm after SESSION_S seconds.
import type { Env } from './env';
import { admin } from './admin';
import { cv, liveCv } from './cv';
import { profileText } from '../src/lab/chat/profile';
import { hit } from './hits';
import { media, versioned } from './media';
import { responses, startChat, transcription } from './chat';
import { ipHash, json, origins, refuse, turnstileOk } from './http';
import { runInsights } from './insights';
import { countryOf, prune, track } from './metrics';
import { createCall, hangup, sessionConfig } from './openai';

export { VoiceCall } from './call';
export { Quota } from './quota';

/** The daily cron (wrangler.jsonc): 00:10 in Bogotá. */
const DAILY = '10 5 * * *';

const CALL_ID = /^rtc_[\w-]{1,100}$/;
/** Shorter remainders aren't worth a resume: a new call starts instead. */
const MIN_RESUME_S = 10;

// Sophie's profile: the live CV (from the CV repo, worker/cv.ts) plus the
// portfolio copy, stories and notes, as text.
async function loadProfile(env: Env) {
  return profileText((await liveCv(env)).cv);
}

async function startSession(req: Request, env: Env, ctx: ExecutionContext) {
  const body = (await req.json().catch(() => null)) as {
    sdp?: unknown;
    token?: unknown;
    lang?: unknown;
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
  const resumed = resume ? env.CALL.get(env.CALL.idFromName(resume)) : null;
  const taken = resumed
    ? await resumed.takeResume(ip, budget, MIN_RESUME_S)
    : null;
  const used = taken?.used ?? null;
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
  if (denied) {
    // The time left stays there for the next try.
    if (used !== null) await resumed?.giveBack(ip);
    return json({ error: denied }, 429);
  }

  let call: { sdp: string; callId: string } | null = null;
  try {
    const session = sessionConfig(env, await loadProfile(env), lang);
    call = await createCall(env, sdp, session);
    // A few seconds of grace for the connection to come up.
    const endsAt = Date.now() + (seconds + 5) * 1000;
    await env.CALL.get(env.CALL.idFromName(call.callId)).start(
      {
        callId: call.callId,
        ip,
        day,
        used: used ?? 0,
        startedAt: Date.now(),
        // A resume continues the thread of the call it resumes.
        thread: taken?.thread ?? call.callId,
        lang,
        country: countryOf(req),
      },
      endsAt,
      session,
    );
    ctx.waitUntil(
      track(env, {
        kind: used === null ? 'voice_call' : 'voice_resume',
        subject: 'voice',
        lang,
        country: countryOf(req),
      }),
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
    else {
      await quota.release(ip);
      await resumed?.giveBack(ip);
    }
    // OpenAI's budget for the key is spent: to the visitor, the day's calls
    // are over.
    if (
      /insufficient_quota|billing_hard_limit|exceeded your current quota/.test(
        String(err),
      )
    )
      return json({ error: 'limit_day' }, 429);
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
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    // The insights dashboard's API, behind Cloudflare Access (worker/admin.ts).
    if (url.pathname.startsWith('/admin/api/')) return admin(req, env);
    // The CV PDFs, from the CV repo (worker/cv.ts).
    if (url.pathname.startsWith('/cv/')) return cv(req, env, ctx);
    // The profile photo and link preview, uploaded from the dashboard.
    if (url.pathname.startsWith('/media/')) return media(req, env);
    const api = url.pathname.startsWith('/api/');
    if (!api) {
      const page = await env.ASSETS?.fetch(req);
      // The shareable pages (run_worker_first): versioned link preview.
      return page
        ? versioned(page, env)
        : new Response('Not found', { status: 404 });
    }
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    // Same-origin only: the site's own pages.
    if (!origins(env).includes(req.headers.get('Origin') ?? ''))
      return json({ error: 'origin' }, 403);
    // Scripts hammering the API (the quotas cap spending, not requests).
    // Ending a call is exempt: a refused hangup would leave it running.
    // Counted in the day's Quota (exact, unlike Cloudflare's rate-limiting
    // binding, which let hundreds through in a burst).
    if (url.pathname !== '/api/voice/end') {
      const day = new Date().toISOString().slice(0, 10);
      const ok = await env.QUOTA.get(env.QUOTA.idFromName(day)).rate(
        await ipHash(env, req),
        Number(env.API_PER_MIN),
      );
      if (!ok) return refuse('rate', 429);
    }
    switch (url.pathname) {
      case '/api/hit':
        return hit(req, env, ctx);
      case '/api/voice/session':
        return startSession(req, env, ctx);
      case '/api/voice/end':
        return endSession(req, env);
      case '/api/chat/session':
        return startChat(req, env, ctx);
      case '/api/chat/v1/responses':
        return responses(req, env, ctx);
      case '/api/chat/v1/audio/transcriptions':
        return transcription(req, env, ctx);
    }
    return json({ error: 'not_found' }, 404);
  },
  // Crons (wrangler.jsonc): daily retention, and the insights (worker/insights.ts)
  // moved along on every run.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        if (event.cron === DAILY) await prune(env);
        await runInsights(env);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
