// Records Sophie's greeting for the Voice Lab, in English and Spanish, with
// the same voice as the live agent (VOICE_NAME in wrangler.jsonc). The text
// is `greeting` in src/i18n/voice.ts: run this again whenever it changes.
//   OPENAI_API_KEY=… node scripts/voice-greeting.mjs
// Costs a fraction of a cent per run.
import { writeFile, mkdir } from 'node:fs/promises';
import { VOICE } from '../src/i18n/voice.ts';

const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('Set OPENAI_API_KEY');
const out = new URL('../src/assets/lab/voice/', import.meta.url);
await mkdir(out, { recursive: true });

const STYLE = {
  en: 'Warm, friendly and upbeat, like a person greeting a visitor on a call. Natural pace, smiling voice, clear American English.',
  es: 'Cálida, amable y animada, como alguien que saluda a una visita en una llamada. Ritmo natural, voz sonriente, español latinoamericano neutro.',
};

for (const lang of ['en', 'es']) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: VOICE[lang].greeting,
      instructions: STYLE[lang],
      response_format: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(`${lang}: ${res.status} ${await res.text()}`);
  const file = new URL(`greeting-${lang}.mp3`, out);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`wrote ${file.pathname}`);
}
