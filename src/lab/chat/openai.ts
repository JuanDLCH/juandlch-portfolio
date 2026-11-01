// Voice input: transcribes a recording, with the visitor's own OpenAI key or
// (key '') through the site's Worker, which counts it as a message.
import { LAB_API, dropLabToken, labToken } from './lab';

export async function transcribe(key: string, audio: Blob, lang: 'en' | 'es') {
  const form = new FormData();
  const ext = audio.type.includes('mp4')
    ? 'mp4'
    : audio.type.includes('ogg')
      ? 'ogg'
      : 'webm';
  form.append('file', audio, `voice.${ext}`);
  form.append('model', 'whisper-1');
  form.append('language', lang);
  const send = async () =>
    fetch(
      key
        ? 'https://api.openai.com/v1/audio/transcriptions'
        : `${LAB_API}/audio/transcriptions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key || (await labToken())}` },
        body: form,
      },
    );
  let res = await send();
  // The Worker rejected the site session (e.g. the IP changed): get a new
  // one and try once more.
  if (!key && res.status === 401) {
    dropLabToken();
    res = await send();
  }
  if (res.status === 429) {
    const code = (
      (await res.json().catch(() => ({}))) as {
        error?: { code?: string };
      }
    ).error?.code;
    throw new Error(code ?? 'rate');
  }
  if (!res.ok)
    throw new Error(res.status === 401 ? 'auth' : `http ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}
