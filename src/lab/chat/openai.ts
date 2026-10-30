// Voice input: transcribes a recording with the visitor's own OpenAI key.
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
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok)
    throw new Error(res.status === 401 ? 'auth' : `http ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}
