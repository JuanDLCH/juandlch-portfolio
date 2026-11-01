// One voice call (named by its OpenAI call id). Owns the hard cutoff: an
// alarm that hangs up at the end of the session whatever the browser does,
// since a Durable Object has a single alarm and calls can overlap. It also
// watches the call through the sideband and hangs up past VOICE_CALL_USD
// (priced from each response's usage), or if the client tries to
// change the session (instructions, tools or voice) or keeps it
// answering far beyond a normal conversation. Once over it remembers, for a
// while, how much of the session budget was used, so the same visitor can
// resume with the time left instead of starting a new call.
import { DurableObject } from 'cloudflare:workers';
import type { RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime';
import type { Env } from './env';
import { saveMessage, track } from './metrics';
import { hangup, sideband } from './openai';
import { realtimeUsd, type RealtimeUsage } from './prices';

interface Call {
  callId: string;
  /** HMAC of the visitor's IP, as the quota knows it. */
  ip: string;
  /** Quota instance (UTC day) the session was counted in. */
  day: string;
  /** Seconds of the budget used before this call (by the calls it resumes). */
  used: number;
  startedAt: number;
  /** The first call of a resumed chain, to keep its messages together. */
  thread?: string;
  lang?: string;
}

/** What's left of an ended call, for a resume. */
interface Done {
  ip: string;
  used: number;
  taken: boolean;
  thread?: string;
}

/** How long an ended call can be resumed. */
const RESUME_MS = 30 * 60_000;

/** How soon a failed hangup is tried again. */
const RETRY_MS = 10_000;

/** Far more answers than 5 minutes of talk can take. */
const MAX_RESPONSES = 50;

const fingerprint = (s: Partial<RealtimeSessionCreateRequest>) =>
  JSON.stringify([
    s.instructions,
    s.audio?.output?.voice,
    (s.tools ?? []).map((t) => ('name' in t ? t.name : t.type)),
  ]);

export class VoiceCall extends DurableObject<Env> {
  private ws: WebSocket | null = null;
  private expected = '';
  private responses = 0;
  /** What the call has cost so far (USD), from each response's usage. */
  private spent = 0;
  /** Thread and language of the call, for the messages it records. */
  private thread = '';
  private lang = '';
  /** The hangup in progress, so overlapping ends run it once. */
  private ending: Promise<void> | null = null;

  async start(
    call: Call,
    endsAt: number,
    session: RealtimeSessionCreateRequest,
  ) {
    await this.ctx.storage.put('call', call);
    await this.ctx.storage.setAlarm(endsAt);
    this.expected = fingerprint(session);
    this.thread = call.thread ?? call.callId;
    this.lang = call.lang ?? '';
    try {
      this.ws = await sideband(this.env, call.callId);
      this.ws?.addEventListener('message', (e) => this.watch(e.data));
      this.ws?.addEventListener('close', () => (this.ws = null));
    } catch (err) {
      // The alarm still ends the call.
      console.error(`sideband ${call.callId}: ${String(err)}`);
    }
  }

  /** Seconds used by this (ended) call and the ones it resumed, and their
   * thread, if `ip` may resume it and at least `min` seconds of `budget` are
   * left. Once. */
  async takeResume(ip: string, budget: number, min: number) {
    const done = await this.ctx.storage.get<Done>('done');
    if (!done || done.taken || done.ip !== ip) return null;
    if (budget - done.used < min) return null;
    await this.ctx.storage.put('done', { ...done, taken: true });
    return { used: done.used, thread: done.thread };
  }

  /** Undoes takeResume when the call that would continue it didn't start. */
  async giveBack(ip: string) {
    const done = await this.ctx.storage.get<Done>('done');
    if (done?.taken && done.ip === ip)
      await this.ctx.storage.put('done', { ...done, taken: false });
  }

  /** The visitor ended the call. Only the IP that started it can. */
  async end(ip: string) {
    const call = await this.ctx.storage.get<Call>('call');
    if (!call || call.ip !== ip) return false;
    await this.finish('user');
    return true;
  }

  async alarm() {
    // The cutoff, a hangup to try again, or the end of the resume window.
    if (await this.ctx.storage.get('call'))
      await this.finish(
        (await this.ctx.storage.get<string>('ending')) ?? 'time',
      );
    else await this.ctx.storage.deleteAll();
  }

  private watch(data: unknown) {
    if (typeof data !== 'string') return;
    let event: {
      type?: string;
      session?: Partial<RealtimeSessionCreateRequest>;
      response?: { usage?: RealtimeUsage };
      transcript?: string;
    };
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (
      event.type === 'session.updated' &&
      event.session &&
      fingerprint(event.session) !== this.expected
    )
      void this.finish('session changed');
    // What the visitor said, for the analysis (worker/metrics.ts).
    if (
      event.type === 'conversation.item.input_audio_transcription.completed' &&
      typeof event.transcript === 'string' &&
      this.thread
    )
      this.ctx.waitUntil(
        saveMessage(this.env, {
          source: 'voice',
          conv: this.thread,
          lang: this.lang || undefined,
          text: event.transcript,
        }),
      );
    if (event.type !== 'response.done') return;
    if (event.response?.usage)
      this.spent += realtimeUsd(this.env.VOICE_MODEL, event.response.usage);
    if (this.spent > Number(this.env.VOICE_CALL_USD))
      void this.finish(`cost cap ($${this.spent.toFixed(3)})`);
    else if (++this.responses > MAX_RESPONSES)
      void this.finish('too many responses');
  }

  private finish(reason: string) {
    this.ending ??= this.hangUp(reason).finally(() => (this.ending = null));
    return this.ending;
  }

  /** Ends the call. The call stays on record (and the alarm keeps trying)
   * until OpenAI confirms the hangup, so a failed one can't leave it running
   * past its cutoff. */
  private async hangUp(reason: string) {
    const call = await this.ctx.storage.get<Call>('call');
    if (!call) return;
    const budget = Number(this.env.SESSION_S);
    const first = (await this.ctx.storage.get<string>('ending')) ?? reason;
    const used =
      first === 'time'
        ? budget
        : Math.min(
            budget,
            call.used + Math.ceil((Date.now() - call.startedAt) / 1000),
          );
    if (!(await hangup(this.env, call.callId))) {
      await this.ctx.storage.put('ending', first);
      await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.put('done', {
      ip: call.ip,
      used,
      taken: false,
      thread: call.thread ?? call.callId,
    });
    await this.ctx.storage.setAlarm(Date.now() + RESUME_MS);
    console.log(`end ${call.callId}: ${first} (${used}s used)`);
    try {
      this.ws?.close(1000, first);
    } catch {
      /* already closed */
    }
    this.ws = null;
    await this.env.QUOTA.get(this.env.QUOTA.idFromName(call.day)).release(
      call.ip,
    );
    await track(this.env, {
      kind: 'voice_end',
      subject: 'voice',
      lang: call.lang,
      detail: first,
      n: Math.round((Date.now() - call.startedAt) / 1000),
    });
  }
}
