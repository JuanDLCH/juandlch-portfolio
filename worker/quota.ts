// Daily quotas of the lab: one instance per UTC day (named by date), per IP
// (as an HMAC, never in clear) and in total. Durable Objects run one request
// at a time, so check-and-reserve can't race.
// - Voice: calls per IP and per day, one active call per IP.
// - Chat: messages per IP, and dollars per IP and per day. Each request
//   reserves its worst case before it's forwarded and settles to the real
//   cost when its usage arrives (if it never does, the reservation stays),
//   with at most CHAT_IN_FLIGHT requests at once per IP, so parallel or
//   aborted requests can't spend past the budget.
import { DurableObject } from 'cloudflare:workers';
import type { ChatError, Env, StartError } from './env';

const DAY_MS = 86_400_000;
/** Chat requests one IP may have running at once (a turn runs one). */
const CHAT_IN_FLIGHT = 2;
/** A request still in flight after this is taken as lost (its reservation
 * stays charged). */
const FLIGHT_MS = 180_000;
/** Tool-result requests allowed per counted message (pooled over the day):
 * far more rounds than a turn takes, but they can't go on without messages. */
const ROUNDS_PER_MSG = 12;

interface Flight {
  id: string;
  at: number;
}

export class Quota extends DurableObject<Env> {
  /** Reserves a session for `ip`, active until `until` (ms). */
  async reserve(
    ip: string,
    until: number,
    maxIp: number,
    maxDay: number,
  ): Promise<StartError | null> {
    const s = this.ctx.storage;
    const active = await s.get<number>(`active:${ip}`);
    if (active && active > Date.now()) return 'busy';
    const mine = (await s.get<number>(`ip:${ip}`)) ?? 0;
    if (mine >= maxIp) return 'limit_ip';
    const total = (await s.get<number>('total')) ?? 0;
    if (total >= maxDay) return 'limit_day';
    await s.put({
      [`ip:${ip}`]: mine + 1,
      total: total + 1,
      [`active:${ip}`]: until,
    });
    // The day's counters go away once it's over.
    if ((await s.getAlarm()) === null)
      await s.setAlarm(Date.now() + 2 * DAY_MS);
    return null;
  }

  /** Marks a resumed call active, without counting a new session. */
  async hold(ip: string, until: number): Promise<StartError | null> {
    const s = this.ctx.storage;
    const active = await s.get<number>(`active:${ip}`);
    if (active && active > Date.now()) return 'busy';
    await s.put(`active:${ip}`, until);
    return null;
  }

  /** Gives the session back: OpenAI never started it. */
  async refund(ip: string) {
    const s = this.ctx.storage;
    const mine = (await s.get<number>(`ip:${ip}`)) ?? 1;
    const total = (await s.get<number>('total')) ?? 1;
    await s.put({ [`ip:${ip}`]: mine - 1, total: total - 1 });
    await s.delete(`active:${ip}`);
  }

  /** The IP's session ended: it may start another (within its quota). */
  async release(ip: string) {
    await this.ctx.storage.delete(`active:${ip}`);
  }

  /** Reserves a chat request costing up to `worst` dollars. `kind`:
   * 'message' starts a new visitor message (counted); 'round' carries tool
   * results within one (allowed up to ROUNDS_PER_MSG per counted message);
   * 'check' is refused once out of messages but not counted (a voice note,
   * whose transcript is sent as the message). Returns its id, or why it
   * can't run. */
  async chatReserve(
    ip: string,
    kind: 'message' | 'round' | 'check',
    worst: number,
    limits: { msgs: number; usdIp: number; usdDay: number },
  ): Promise<{ id: string; left: number } | { error: ChatError }> {
    const s = this.ctx.storage;
    const now = Date.now();
    const flying = ((await s.get<Flight[]>(`fly:${ip}`)) ?? []).filter(
      (f) => now - f.at < FLIGHT_MS,
    );
    if (flying.length >= CHAT_IN_FLIGHT) return { error: 'chat_busy' };
    const msgs = (await s.get<number>(`msgs:${ip}`)) ?? 0;
    const rounds = (await s.get<number>(`rounds:${ip}`)) ?? 0;
    if (kind !== 'round' && msgs >= limits.msgs)
      return { error: 'chat_limit_ip' };
    if (kind === 'round' && rounds >= msgs * ROUNDS_PER_MSG)
      return { error: 'chat_limit_ip' };
    const usd = (await s.get<number>(`usd:${ip}`)) ?? 0;
    if (usd + worst > limits.usdIp) return { error: 'chat_limit_ip' };
    const total = (await s.get<number>('usd')) ?? 0;
    if (total + worst > limits.usdDay) return { error: 'chat_limit_day' };
    const id = crypto.randomUUID();
    await s.put({
      [`msgs:${ip}`]: msgs + (kind === 'message' ? 1 : 0),
      [`rounds:${ip}`]: rounds + (kind === 'round' ? 1 : 0),
      [`usd:${ip}`]: usd + worst,
      usd: total + worst,
      [`fly:${ip}`]: [...flying, { id, at: now }],
    });
    if ((await s.getAlarm()) === null) await s.setAlarm(now + 2 * DAY_MS);
    // Messages the IP has left after this one, for the UI.
    const left = limits.msgs - msgs - (kind === 'message' ? 1 : 0);
    return { id, left: Math.max(0, left) };
  }

  /** The request is over: its reservation becomes the real cost (`actual`),
   * or stays as it was when the usage never came (null). */
  async chatSettle(
    ip: string,
    id: string,
    worst: number,
    actual: number | null,
  ) {
    const s = this.ctx.storage;
    const flying = (await s.get<Flight[]>(`fly:${ip}`)) ?? [];
    if (!flying.some((f) => f.id === id)) return;
    const delta = actual === null ? 0 : actual - worst;
    const usd = (await s.get<number>(`usd:${ip}`)) ?? 0;
    const total = (await s.get<number>('usd')) ?? 0;
    await s.put({
      [`usd:${ip}`]: Math.max(0, usd + delta),
      usd: Math.max(0, total + delta),
      [`fly:${ip}`]: flying.filter((f) => f.id !== id),
    });
  }

  /** Messages the IP has left today (for the UI). */
  async chatLeft(ip: string, max: number) {
    return Math.max(
      0,
      max - ((await this.ctx.storage.get<number>(`msgs:${ip}`)) ?? 0),
    );
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
