import type { VoiceCall } from './call';
import type { Quota } from './quota';

export interface Env {
  /** The built site (dist/), when this Worker serves it. */
  ASSETS?: Fetcher;
  QUOTA: DurableObjectNamespace<Quota>;
  CALL: DurableObjectNamespace<VoiceCall>;
  /** Lab metrics and visitor messages (worker/metrics.ts). Optional: without it
   * nothing is recorded. */
  LAB_DB?: D1Database;
  /** The profile photo uploaded from the dashboard (worker/media.ts).
   * Optional: without it /media/ serves the copies built with the site. */
  MEDIA?: KVNamespace;
  // Secrets (wrangler secret put / .dev.vars).
  OPENAI_API_KEY: string;
  TURNSTILE_SECRET: string;
  /** Key of the HMAC that pseudonymizes IPs in the quota. */
  IP_SALT: string;
  // Vars (wrangler.jsonc).
  /** Origins allowed to start sessions, comma-separated (production first). */
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
  /** Requests per IP per minute to /api/* (counted in Quota). */
  API_PER_MIN: string;
  /** Daily insights (worker/insights.ts): the model that labels messages and
   * the one that writes the report (either empty: off), conversations labeled
   * per day, and the most a day's labeling may cost (USD, estimated). */
  INSIGHTS_LABEL_MODEL: string;
  INSIGHTS_REPORT_MODEL: string;
  INSIGHTS_MAX_CONVS: string;
  INSIGHTS_USD_PER_DAY: string;
  /** Cloudflare Access in front of /admin: team domain and the application's
   * AUD tag (worker/admin.ts checks its JWT). */
  ACCESS_TEAM: string;
  ACCESS_AUD: string;
  /** Web Analytics for the dashboard's traffic (worker/admin.ts): the
   * account and the site's tag (vars), and a token with Account Analytics
   * Read (secret; without it the traffic block is hidden). */
  CF_ACCOUNT_ID: string;
  CF_SITE_TAG: string;
  CF_ANALYTICS_TOKEN?: string;
  /** The CV downloads (worker/cv.ts): the repo (var) and a read-only GitHub
   * token for it (secret; without it, the copies built with the site). */
  CV_REPO: string;
  CV_GITHUB_TOKEN?: string;
  /** "1" (dev only, on localhost): the dashboard API without Access. */
  ADMIN_DEV?: string;
  /** "1": fake OpenAI (no calls, no cost), to test limits and cutoffs. */
  MOCK_OPENAI?: string;
}

export type StartError = 'limit_ip' | 'limit_day' | 'busy';
export type ChatError = 'chat_limit_ip' | 'chat_limit_day' | 'chat_busy';
