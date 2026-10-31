// One voice call (named by its OpenAI call id). Owns the hard cutoff: an
// alarm that hangs up at the end of the session whatever the browser does,
// since a Durable Object has a single alarm and calls can overlap. It also
// watches the call through the sideband and hangs up if the client tries to
// change the session (instructions, tools or voice) or keeps it
// answering far beyond a normal conversation.
import { DurableObject } from 'cloudflare:workers';
import type { RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime';
import type { Env } from './env';
import { hangup, sideband } from './openai';

interface Call {
  callId: string;
  /** HMAC of the visitor's IP, as the quota knows it. */
  ip: string;
  /** Quota instance (UTC day) the session was counted in. */
  day: string;
}

/** Far more answers than 3 minutes of talk can take. */
const MAX_RESPONSES = 60;

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

  async start(
    call: Call,
    endsAt: number,
    session: RealtimeSessionCreateRequest,
  ) {
    await this.ctx.storage.put('call', call);
    await this.ctx.storage.setAlarm(endsAt);
    this.expected = fingerprint(session);
    try {
      this.ws = await sideband(this.env, call.callId);
      this.ws?.addEventListener('message', (e) => this.watch(e.data));
      this.ws?.addEventListener('close', () => (this.ws = null));
    } catch (err) {
      // The alarm still ends the call.
      console.error(`sideband ${call.callId}: ${String(err)}`);
    }
  }

  /** The visitor ended the call. Only the IP that started it can. */
  async end(ip: string) {
    const call = await this.ctx.storage.get<Call>('call');
    if (!call || call.ip !== ip) return false;
    await this.finish('user');
    return true;
  }

  async alarm() {
    await this.finish('time');
  }

  private watch(data: unknown) {
    if (typeof data !== 'string') return;
    let event: {
      type?: string;
      session?: Partial<RealtimeSessionCreateRequest>;
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
    if (event.type === 'response.done' && ++this.responses > MAX_RESPONSES)
      void this.finish('too many responses');
  }

  private async finish(reason: string) {
    const call = await this.ctx.storage.get<Call>('call');
    if (!call) return;
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    console.log(`end ${call.callId}: ${reason}`);
    await hangup(this.env, call.callId);
    try {
      this.ws?.close(1000, reason);
    } catch {
      /* already closed */
    }
    this.ws = null;
    await this.env.QUOTA.get(this.env.QUOTA.idFromName(call.day)).release(
      call.ip,
    );
  }
}
