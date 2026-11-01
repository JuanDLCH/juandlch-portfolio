// OpenAI Realtime over WebRTC, server side: the Worker creates the call with
// the real key and the session fixed here; the browser only gets the SDP
// answer and never sees a key or a token.
import type { RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime';
import { CONTACT_TOOL, voiceInstructions } from '../src/lab/voice/prompt';
import type { Env } from './env';

const API = 'https://api.openai.com/v1/realtime';

export const sessionConfig = (
  env: Env,
  profile: string,
  lang: 'en' | 'es',
): RealtimeSessionCreateRequest => ({
  type: 'realtime',
  model: env.VOICE_MODEL,
  instructions: voiceInstructions(profile, lang),
  output_modalities: ['audio'],
  // Spoken answers are short; this caps a runaway one.
  max_output_tokens: 600,
  audio: {
    input: {
      noise_reduction: { type: 'near_field' },
      // Captions of what the visitor says; no language, so they can switch.
      transcription: { model: 'gpt-4o-mini-transcribe' },
      turn_detection: {
        type: 'semantic_vad',
        eagerness: 'auto',
        create_response: true,
        interrupt_response: true,
      },
    },
    output: { voice: env.VOICE_NAME },
  },
  tools: [
    CONTACT_TOOL as unknown as NonNullable<
      RealtimeSessionCreateRequest['tools']
    >[number],
  ],
  tool_choice: 'auto',
  ...(env.VOICE_REASONING && {
    reasoning: {
      effort: env.VOICE_REASONING as NonNullable<
        RealtimeSessionCreateRequest['reasoning']
      >['effort'],
    },
  }),
});

/** Starts the call: SDP offer in, SDP answer and call id out. */
export async function createCall(
  env: Env,
  sdp: string,
  session: RealtimeSessionCreateRequest,
) {
  if (env.MOCK_OPENAI === '1')
    return { sdp: 'v=0\r\n', callId: `rtc_mock_${crypto.randomUUID()}` };
  const form = new FormData();
  form.set('sdp', sdp);
  form.set('session', JSON.stringify(session));
  const res = await fetch(`${API}/calls`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok)
    throw new Error(`calls ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const callId = res.headers.get('Location')?.split('/').pop();
  if (!callId) throw new Error('calls: no call id');
  return { sdp: await res.text(), callId };
}

/** Ends the call on OpenAI's side, whatever the browser does. */
/** Hangs up a call. True once it's over: hung up now, or already ended. */
export async function hangup(env: Env, callId: string) {
  if (env.MOCK_OPENAI === '1') {
    console.log(`[mock] hangup ${callId}`);
    return true;
  }
  try {
    const res = await fetch(
      `${API}/calls/${encodeURIComponent(callId)}/hangup`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      },
    );
    // 404: it had already ended.
    if (res.ok || res.status === 404) return true;
    console.error(`hangup ${callId}: ${res.status}`);
  } catch (err) {
    console.error(`hangup ${callId}: ${String(err)}`);
  }
  return false;
}

/** Opens the sideband: a server-side WebSocket on the same call. */
export async function sideband(env: Env, callId: string) {
  if (env.MOCK_OPENAI === '1') return null;
  const res = await fetch(`${API}?call_id=${encodeURIComponent(callId)}`, {
    headers: {
      Upgrade: 'websocket',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`sideband ${res.status}`);
  ws.accept();
  return ws;
}
