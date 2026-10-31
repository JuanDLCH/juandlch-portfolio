// Records Sophie's greeting for the Voice Lab, in English and Spanish, with
// the live agent's own model and voice (VOICE_MODEL and VOICE_NAME in
// wrangler.jsonc), so the greeting and the call sound like the same person.
// It asks the Realtime API to read `greeting` (src/i18n/voice.ts) out loud and
// checks the transcript matches it. Run it again whenever either changes.
//   OPENAI_API_KEY=… node scripts/voice-greeting.mjs
// Needs ffmpeg. Costs about a cent per run.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { VOICE } from '../src/i18n/voice.ts';

const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('Set OPENAI_API_KEY');
const config = await readFile(
  new URL('../wrangler.jsonc', import.meta.url),
  'utf8',
);
const v = (name) => config.match(new RegExp(`"${name}":\\s*"([^"]+)"`))?.[1];
const model = v('VOICE_MODEL');
const voice = v('VOICE_NAME');
if (!model || !voice) throw new Error('VOICE_MODEL/VOICE_NAME not found');
const out = new URL('../src/assets/lab/voice/', import.meta.url);
await mkdir(out, { recursive: true });

const STYLE = {
  en: 'Energetic, bright and enthusiastic, with a big smile in your voice, like someone excited to welcome a visitor. Lively pace, expressive intonation, clear American English.',
  es: 'Enérgica, brillante y entusiasta, con una gran sonrisa en la voz, como alguien feliz de recibir a una visita. Ritmo vivo, entonación expresiva, español latinoamericano neutro.',
};

const words = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
/** Share of the script's words the transcript has, in order. */
const match = (script, said) => {
  const a = words(script);
  const b = words(said);
  let j = 0;
  for (const w of b) if (w === a[j]) j++;
  return j / a.length;
};

/** One reading over the Realtime WebSocket: PCM16 at 24 kHz + transcript. */
const read = (text, lang) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      ['realtime', `openai-insecure-api-key.${key}`],
    );
    const chunks = [];
    let transcript = '';
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout'));
    }, 60_000);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            output_modalities: ['audio'],
            audio: {
              output: { voice, format: { type: 'audio/pcm', rate: 24000 } },
            },
            instructions: `You are a voice actor. Read the user's script out loud exactly as written, word for word, in ${lang === 'es' ? 'Spanish' : 'English'}. Do not add, skip or change anything, and say nothing else. Delivery: ${STYLE[lang]}`,
          },
        }),
      );
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: `Script:\n${text}` }],
          },
        }),
      );
      ws.send(JSON.stringify({ type: 'response.create' }));
    };
    ws.onmessage = (e) => {
      const ev = JSON.parse(String(e.data));
      if (ev.type === 'response.output_audio.delta')
        chunks.push(Buffer.from(ev.delta, 'base64'));
      if (ev.type === 'response.output_audio_transcript.done')
        transcript = ev.transcript;
      if (ev.type === 'error') {
        clearTimeout(timer);
        ws.close();
        reject(new Error(JSON.stringify(ev.error)));
      }
      if (ev.type === 'response.done') {
        clearTimeout(timer);
        ws.close();
        resolve({ pcm: Buffer.concat(chunks), transcript });
      }
    };
    ws.onerror = () => reject(new Error('websocket error'));
  });

for (const lang of ['en', 'es']) {
  const script = VOICE[lang].greeting;
  let take;
  // The model may paraphrase: keep the first reading that follows the script.
  for (let i = 1; i <= 3; i++) {
    take = await read(script, lang);
    const score = match(script, take.transcript);
    console.log(`${lang} take ${i}: ${Math.round(score * 100)}% of the script`);
    if (score >= 0.95) break;
    if (i === 3) throw new Error(`${lang}: said "${take.transcript}"`);
  }
  const file = new URL(`greeting-${lang}.mp3`, out).pathname;
  const ff = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      's16le',
      '-ar',
      '24000',
      '-ac',
      '1',
      '-i',
      'pipe:0',
      '-b:a',
      '96k',
      file,
    ],
    { input: take.pcm },
  );
  if (ff.status !== 0) throw new Error(String(ff.stderr));
  console.log(`wrote ${file} (${model}, ${voice})`);
}
