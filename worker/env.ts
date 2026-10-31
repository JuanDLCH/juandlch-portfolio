import type { VoiceCall } from './call';
import type { VoiceQuota } from './quota';

export interface Env {
  /** The built site (dist/), when this Worker serves it. */
  ASSETS?: Fetcher;
  QUOTA: DurableObjectNamespace<VoiceQuota>;
  CALL: DurableObjectNamespace<VoiceCall>;
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
  MAX_PER_IP: string;
  MAX_PER_DAY: string;
  SESSION_S: string;
  /** "1": fake OpenAI (no calls, no cost), to test limits and cutoffs. */
  MOCK_OPENAI?: string;
}

export type StartError = 'limit_ip' | 'limit_day' | 'busy';
