// What OpenAI charges for the lab's models, in USD per million tokens, to
// turn each response's `usage` into dollars for the quotas. Chat models come
// from MODELS in cases.ts (cached input at a tenth of the input price);
// Realtime models are here. Unknown Realtime models are priced like the full
// model, so a config change can only make the guard stricter.
import { MODELS, type ModelId } from '../src/lab/chat/cases';

/** Responses API usage (chat). */
export interface TextUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

export function chatUsd(model: string, u: TextUsage) {
  const p = MODELS[model as ModelId];
  if (!p) return 0;
  const input = u.input_tokens ?? 0;
  const cached = Math.min(input, u.input_tokens_details?.cached_tokens ?? 0);
  return (
    ((input - cached) * p.inPerM +
      cached * p.inPerM * 0.1 +
      (u.output_tokens ?? 0) * p.outPerM) /
    1e6
  );
}

/** The most a chat request can cost: its whole output budget, plus a token
 * for every UTF-8 byte of the body (byte-level tokenizers never make more
 * tokens than bytes, and inline images and PDFs tokenize to far fewer than
 * their base64), up to the context window. Remote content is refused before. */
export function chatWorstUsd(model: string, bodyBytes: number, maxOut: number) {
  const p = MODELS[model as ModelId];
  if (!p) return 1;
  return (Math.min(bodyBytes, 400_000) * p.inPerM + maxOut * p.outPerM) / 1e6;
}

const REALTIME: Record<
  string,
  {
    text: [number, number, number];
    audio: [number, number, number];
  }
> = {
  // [input, cached input, output]
  'gpt-realtime-2.1-mini': { text: [0.6, 0.06, 2.4], audio: [10, 0.3, 20] },
  'gpt-realtime-2.1': { text: [4, 0.4, 16], audio: [32, 0.4, 64] },
};

/** Realtime API usage, from a `response.done` event. */
export interface RealtimeUsage {
  input_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
    image_tokens?: number;
    cached_tokens_details?: {
      text_tokens?: number;
      audio_tokens?: number;
      image_tokens?: number;
    };
  };
  output_token_details?: { text_tokens?: number; audio_tokens?: number };
}

export function realtimeUsd(model: string, u: RealtimeUsage) {
  const p = REALTIME[model] ?? REALTIME['gpt-realtime-2.1'];
  const i = u.input_token_details ?? {};
  const c = i.cached_tokens_details ?? {};
  const o = u.output_token_details ?? {};
  const part = (
    [inP, cachedP, outP]: [number, number, number],
    input = 0,
    cached = 0,
    output = 0,
  ) => Math.max(0, input - cached) * inP + cached * cachedP + output * outP;
  return (
    (part(
      p.text,
      (i.text_tokens ?? 0) + (i.image_tokens ?? 0),
      (c.text_tokens ?? 0) + (c.image_tokens ?? 0),
      o.text_tokens,
    ) +
      part(p.audio, i.audio_tokens, c.audio_tokens, o.audio_tokens)) /
    1e6
  );
}

/** Transcription usage (`usage` of a gpt-4o-mini-transcribe response). */
interface NoteUsage {
  input_tokens?: number;
  output_tokens?: number;
}

/** What a voice note cost: every input token at the audio price ($3/M, above
 * the text one), output at $5/M. */
export function noteUsd(u: unknown) {
  const { input_tokens = 0, output_tokens = 0 } = (u ?? {}) as NoteUsage;
  return (input_tokens * 3 + output_tokens * 5) / 1e6;
}
