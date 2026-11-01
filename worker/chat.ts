// Chat lab on the site's key. The browser keeps running the chat (the OpenAI
// SDK and the tool loop, see src/lab/chat/openai-chat.ts) but points the SDK
// here instead of at OpenAI, with a session token as its "key":
// - POST /api/chat/session: Turnstile → a token (HMAC of the IP hash and an
//   expiry), held in memory by the page.
// - POST /api/chat/v1/responses: the case's own setup is pinned from CASES
//   (instructions, model, output budget, effort, tools), so the key can only
//   run the lab's cases; then the request is reserved against the quotas,
//   forwarded, and settled to its real cost when its usage streams by.
// - POST /api/chat/v1/audio/transcriptions: voice notes (the transcript counts
//   as a message once sent).
import { CASES } from '../src/lab/chat/cases';
import type { ChatError, Env } from './env';
import { ipHash, json, refuse, turnstileOk } from './http';
import { saveMessage, track } from './metrics';
import { chatUsd, chatWorstUsd, noteUsd, type TextUsage } from './prices';

const OPENAI = 'https://api.openai.com/v1';
const TOKEN_MS = 2 * 3_600_000;
const MAX_BODY = 16 * 1024 * 1024;
const MAX_AUDIO = 2 * 1024 * 1024;
/** Flat price of a voice note (≤ 60 s with gpt-4o-mini-transcribe ≈ $0.003). */
/** What a voice note can cost at most: the transcription model takes up to
 * ~25 minutes of audio, about $0.003 a minute. Settled to its usage. */
const NOTE_USD = 0.1;
const NOTE_MODEL = 'gpt-4o-mini-transcribe';

const quotaOf = (env: Env) =>
  env.QUOTA.get(env.QUOTA.idFromName(new Date().toISOString().slice(0, 10)));
const limits = (env: Env) => ({
  msgs: Number(env.CHAT_MSGS_PER_IP),
  usdIp: Number(env.CHAT_USD_PER_IP),
  usdDay: Number(env.CHAT_USD_PER_DAY),
});

async function hmac(env: Env, data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`chat:${env.IP_SALT}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(
    /[+/=]/g,
    (c) => ({ '+': '-', '/': '_', '=': '' })[c] ?? '',
  );
}

/** A session token for this IP, valid for TOKEN_MS. */
export async function startChat(req: Request, env: Env, ctx: ExecutionContext) {
  const body = (await req.json().catch(() => null)) as {
    token?: unknown;
  } | null;
  const token = body?.token;
  if (typeof token !== 'string' || token.length > 4096)
    return json({ error: 'bad_request' }, 400);
  if (!(await turnstileOk(env, req, token))) return refuse('captcha', 403);
  const ip = await ipHash(env, req);
  const exp = Date.now() + TOKEN_MS;
  const max = limits(env).msgs;
  const left = await quotaOf(env).chatLeft(ip, max);
  ctx.waitUntil(track(env, { kind: 'chat_session' }));
  return json({
    token: `lab.${exp}.${await hmac(env, `${ip}.${exp}`)}`,
    left,
    max,
  });
}

/** The IP hash a request's token was issued to, if it's valid. */
async function session(req: Request, env: Env) {
  const m = /^Bearer lab\.(\d+)\.([\w-]+)$/.exec(
    req.headers.get('Authorization') ?? '',
  );
  if (!m || Number(m[1]) < Date.now()) return null;
  const ip = await ipHash(env, req);
  return (await hmac(env, `${ip}.${m[1]}`)) === m[2] ? ip : null;
}

const limited = (error: ChatError) => refuse(error, 429);
/** The header that tells the page how many messages the IP has left today
 * (read by the SDK's fetch in src/lab/chat/openai-chat.ts). */
const LEFT = 'X-Lab-Left';

/** Follows a response stream and returns its usage, if it ends with one. */
async function usageOf(stream: ReadableStream<Uint8Array>) {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let usage: TextUsage | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:') || !line.includes('"usage"')) continue;
        try {
          const ev = JSON.parse(line.slice(5)) as {
            type?: string;
            response?: { usage?: TextUsage };
          };
          if (
            ev.response?.usage &&
            (ev.type === 'response.completed' ||
              ev.type === 'response.incomplete' ||
              ev.type === 'response.failed')
          )
            usage = ev.response.usage;
        } catch {
          /* not an event */
        }
      }
    }
  } catch {
    /* the visitor went away: no usage, the reservation stays */
  }
  return usage;
}

/** A fake streamed response (MOCK_OPENAI), with usage, to test quotas. */
function mockStream(model: string) {
  const usage = {
    input_tokens: 2000,
    output_tokens: 100,
    input_tokens_details: { cached_tokens: 0 },
  };
  const events = [
    { type: 'response.output_text.delta', delta: 'Mock answer.' },
    {
      type: 'response.completed',
      response: { id: 'resp_mock', model, status: 'completed', usage },
    },
  ];
  return new Response(
    events
      .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

/** Whether anything in the input (tool outputs included) references
 * content by URL or file id instead of carrying it inline. */
function remote(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(remote);
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if ('file_id' in o || 'file_url' in o) return true;
  if (
    'image_url' in o &&
    !(typeof o.image_url === 'string' && o.image_url.startsWith('data:'))
  )
    return true;
  return Object.values(o).some(remote);
}

/** Counts a visitor message and, for the profile agent, keeps its text
 * (worker/metrics.ts). */
function noteMessage(
  env: Env,
  caseId: string,
  subject: string,
  req: Request,
  last: { content?: unknown },
) {
  const conv = req.headers.get('X-Lab-Conv') ?? '';
  // What the visitor typed is the message's last part (files come first).
  const end = Array.isArray(last.content)
    ? (last.content.at(-1) as { type?: unknown; text?: unknown } | undefined)
    : undefined;
  const text =
    typeof last.content === 'string'
      ? last.content
      : end?.type === 'input_text' && typeof end.text === 'string'
        ? end.text
        : '';
  return Promise.all([
    track(env, { kind: 'chat_message', subject }),
    caseId === 'meet' && /^[\w-]{8,64}$/.test(conv)
      ? saveMessage(env, {
          source: subject === 'cv' ? 'cv' : 'chat',
          conv,
          text,
        })
      : null,
  ]);
}

export async function responses(req: Request, env: Env, ctx: ExecutionContext) {
  const ip = await session(req, env);
  if (!ip) return refuse('session', 401);
  const c = CASES.find((k) => k.id === req.headers.get('X-Lab-Case'));
  if (!c) return json({ error: 'case' }, 400);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413);
  let body: {
    input?: unknown;
    tools?: unknown;
    reasoning?: { effort?: unknown };
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!Array.isArray(body.input) || !body.input.length)
    return json({ error: 'bad_request' }, 400);
  // Images and files only inline: what a URL or a file id points to can't be
  // priced from the body, so it could cost past the reservation.
  if (remote(body.input)) return json({ error: 'remote_content' }, 400);
  // Only the case's own function tools.
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const allowed = new Set(c.clientTools ?? []);
  for (const t of tools as { type?: unknown; name?: unknown }[])
    if (t?.type !== 'function' || !allowed.has(String(t.name)))
      return json({ error: 'tool' }, 400);
  const efforts = new Set([c.effort, c.docs?.effortMany, 'low']);
  const effort = efforts.has(body.reasoning?.effort as typeof c.effort)
    ? body.reasoning?.effort
    : c.effort;
  const model = c.models.openai;
  const pinned = JSON.stringify({
    model,
    instructions: c.system,
    input: body.input,
    ...(tools.length ? { tools } : {}),
    reasoning: { effort },
    max_output_tokens: c.maxTokens,
    store: false,
    include: ['reasoning.encrypted_content'],
    stream: true,
  });

  // A request that ends with what the visitor wrote starts a new message;
  // the ones after it in the turn end with tool results. Nothing else.
  const last = body.input[body.input.length - 1] as {
    role?: unknown;
    type?: unknown;
    content?: unknown;
  };
  const kind =
    last?.role === 'user'
      ? 'message'
      : last?.type === 'function_call_output'
        ? 'round'
        : null;
  if (!kind) return json({ error: 'bad_request' }, 400);
  const worst = chatWorstUsd(
    model,
    new TextEncoder().encode(pinned).length,
    c.maxTokens,
  );
  const quota = quotaOf(env);
  const r = await quota.chatReserve(ip, kind, worst, limits(env));
  // The CV chat (/lab/cv) runs the meet case; metrics tell them apart.
  const subject =
    c.id === 'meet' && req.headers.get('X-Lab-Page') === 'cv' ? 'cv' : c.id;
  if ('error' in r) {
    ctx.waitUntil(track(env, { kind: 'chat_limit', subject, detail: r.error }));
    return limited(r.error);
  }
  if (kind === 'message')
    ctx.waitUntil(noteMessage(env, c.id, subject, req, last));

  let upstream: Response;
  try {
    upstream =
      env.MOCK_OPENAI === '1'
        ? mockStream(model)
        : await fetch(`${OPENAI}/responses`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: pinned,
          });
  } catch {
    await quota.chatSettle(ip, r.id, worst, 0);
    return json({ error: 'upstream' }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    // Refused before running: nothing to pay. The SDK reads OpenAI's error.
    await quota.chatSettle(ip, r.id, worst, 0);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', [LEFT]: String(r.left) },
    });
  }
  const [toVisitor, toMeter] = upstream.body.tee();
  ctx.waitUntil(
    usageOf(toMeter).then((u) =>
      quota.chatSettle(ip, r.id, worst, u ? chatUsd(model, u) : null),
    ),
  );
  return new Response(toVisitor, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      [LEFT]: String(r.left),
    },
  });
}

export async function transcription(req: Request, env: Env) {
  const ip = await session(req, env);
  if (!ip) return refuse('session', 401);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size > MAX_AUDIO)
    return json({ error: 'bad_request' }, 400);
  const lang = form?.get('language') === 'es' ? 'es' : 'en';
  const quota = quotaOf(env);
  // Refused once out of messages, but not counted: the transcript is sent as
  // a message right after, and that one counts.
  const r = await quota.chatReserve(ip, 'check', NOTE_USD, limits(env));
  if ('error' in r) return limited(r.error);
  if (env.MOCK_OPENAI === '1') {
    await quota.chatSettle(ip, r.id, NOTE_USD, NOTE_USD);
    return json({ text: 'Mock transcript.' });
  }
  const out = new FormData();
  out.set('file', file, file.name || 'voice.webm');
  out.set('model', NOTE_MODEL);
  out.set('language', lang);
  const res = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: out,
  }).catch(() => null);
  if (!res) {
    await quota.chatSettle(ip, r.id, NOTE_USD, 0);
    return json({ error: 'upstream' }, 502);
  }
  // Priced from its usage; without one the whole reservation stays.
  const text = await res.text();
  let usage = null;
  try {
    usage = (JSON.parse(text) as { usage?: unknown }).usage ?? null;
  } catch {
    /* not JSON */
  }
  await quota.chatSettle(
    ip,
    r.id,
    NOTE_USD,
    !res.ok ? 0 : usage ? noteUsd(usage) : null,
  );
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
