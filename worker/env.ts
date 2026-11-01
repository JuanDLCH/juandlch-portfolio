import type { VoiceCall } from './call';
import type { Quota } from './quota';

export interface Env {
  /** The built site (dist/), when this Worker serves it. */
  ASSETS?: Fetcher;
  QUOTA: DurableObjectNamespace<Quota>;
  CALL: DurableObjectNamespace<VoiceCall>;
  /** Lab metrics and questions (worker/metrics.ts). Optional: without it
   * nothing is recorded. */
  LAB_DB?: D1Database;
  // Secrets (wrangler secret put / .dev.vars).
  OPENAI_API_KEY: string;
  TURNSTILE_SECRET: string;
  /** Key of the HMAC that pseudonymizes IPs in the quota. */
  IP_SALT: string;
  // Vars (wrangler.jsonc).
  /** Origins allowed to start sessions, comma-separated. The first one also
   * serves voice-profile.txt when ASSETS doesn't have it (dev). */
  SITE_ORIGIN: string;
  VOICE_MODEL: string;
  VOICE_NAME: string;
  /** Reasoning effort, only for models that take one (empty: none). */
  VOICE_REASONING?: string;
  /** Voice calls per IP and per day (all visitors). */
  MAX_PER_IP: string;
  MAX_PER_DAY: string;
  SESSION_S: string;
  /** A voice call hangs up once it has cost this many dollars. */
  VOICE_CALL_USD: string;
  /** Chat: messages per IP per day, and dollars per IP and per day. */
  CHAT_MSGS_PER_IP: string;
  CHAT_USD_PER_IP: string;
  CHAT_USD_PER_DAY: string;
  /** "1": fake OpenAI (no calls, no cost), to test limits and cutoffs. */
  MOCK_OPENAI?: string;
}

export type StartError = 'limit_ip' | 'limit_day' | 'busy';
export type ChatError = 'chat_limit_ip' | 'chat_limit_day' | 'chat_busy';
