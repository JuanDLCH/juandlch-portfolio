// Daily quota of the voice lab: one instance per UTC day (named by date).
// Counts sessions per IP (as an HMAC, never in clear) and in total, and
// allows one active session per IP. Durable Objects run one request at a
// time, so check-and-reserve can't race.
import { DurableObject } from 'cloudflare:workers';
import type { Env, StartError } from './env';

const DAY_MS = 86_400_000;

export class VoiceQuota extends DurableObject<Env> {
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

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
