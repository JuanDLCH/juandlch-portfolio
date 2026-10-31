// Browser side of a voice call with Sophie: WebRTC to OpenAI Realtime. The
// offer goes to our Worker (/api/voice/session), which creates the call with
// the session fixed on the server and answers with OpenAI's SDP; the browser
// never has a key or a token. Events arrive on the "oai-events" data channel.
// Only SSR-safe at import time: everything touching the DOM runs in connect.
import { WRAP_UP_NOTE } from './prompt';

export type StartError =
  | 'limit_ip'
  | 'limit_day'
  | 'busy'
  | 'captcha'
  | 'unavailable'
  | 'mic'
  | 'network';

export class VoiceError extends Error {
  constructor(public code: StartError) {
    super(code);
  }
}

/** What Sophie is doing, for the face and the status chip. */
export type Activity = 'listening' | 'user' | 'thinking' | 'speaking';

export interface CallHandlers {
  activity: (a: Activity) => void;
  /** What the visitor said in turn `id` so far (replaced as it's
   * transcribed; '' when they start talking). */
  user: (id: string, text: string) => void;
  /** Sophie's answer `id` so far (replaced as it streams). */
  agent: (id: string, text: string) => void;
  /** The visitor talked over Sophie and she stopped. */
  bargeIn: () => void;
  /** show_contact_options was called; its raw JSON arguments. */
  contact: (args: string) => void;
  /** The connection went away (the server hung up, or the network). */
  dropped: () => void;
  /** Sophie's audio track arrived (once). */
  remote: (stream: MediaStream) => void;
}

export interface Call {
  callId: string;
  /** Session length the server enforces. */
  seconds: number;
  mute: (on: boolean) => void;
  /** Asks Sophie to wrap up (the session is about to end). */
  wrapUp: () => void;
  /** Hangs up here and tells the server. */
  close: () => void;
}

const VOICE_API = '/api/voice';

/** Tells the server the call is over; survives page unloads. */
export const endOnServer = (callId: string) => {
  void fetch(`${VOICE_API}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callId }),
    keepalive: true,
  }).catch(() => {});
};

export async function connect(opts: {
  token: string;
  lang: 'en' | 'es';
  mic: MediaStream;
  audio: HTMLAudioElement;
  on: CallHandlers;
}): Promise<Call> {
  const { on } = opts;
  const pc = new RTCPeerConnection();
  const remote = new MediaStream();
  pc.ontrack = (e) => {
    if (remote.getAudioTracks().length) return;
    remote.addTrack(e.track);
    opts.audio.srcObject = remote;
    void opts.audio.play().catch(() => {});
    on.remote(remote);
  };
  const [track] = opts.mic.getAudioTracks();
  pc.addTrack(track, opts.mic);
  const dc = pc.createDataChannel('oai-events');

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  let res: Response;
  try {
    res = await fetch(`${VOICE_API}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sdp: offer.sdp,
        token: opts.token,
        lang: opts.lang,
      }),
    });
  } catch {
    pc.close();
    throw new VoiceError('network');
  }
  const body = (await res.json().catch(() => ({}))) as {
    sdp?: string;
    callId?: string;
    seconds?: number;
    error?: string;
  };
  if (!res.ok || !body.sdp || !body.callId) {
    pc.close();
    const known: StartError[] = ['limit_ip', 'limit_day', 'busy', 'captcha'];
    throw new VoiceError(
      known.includes(body.error as StartError)
        ? (body.error as StartError)
        : 'unavailable',
    );
  }
  const callId = body.callId;
  try {
    await pc.setRemoteDescription({ type: 'answer', sdp: body.sdp });
  } catch {
    // The server already started the call: free it right away.
    endOnServer(callId);
    pc.close();
    throw new VoiceError('unavailable');
  }

  const send = (event: object) => {
    if (dc.readyState === 'open') dc.send(JSON.stringify(event));
  };
  // A response must finish before the next one is asked for.
  let responding = false;
  let pending = false;
  const respond = () => {
    if (responding) pending = true;
    else send({ type: 'response.create' });
  };

  const userText = new Map<string, string>();
  let agentId = '';
  let agentText = '';
  let speaking = false;
  dc.addEventListener('message', (e) => {
    let ev: Record<string, unknown> & { type?: string };
    try {
      ev = JSON.parse(String(e.data));
    } catch {
      return;
    }
    switch (ev.type) {
      case 'input_audio_buffer.speech_started': {
        if (speaking) on.bargeIn();
        const id = String(ev.item_id ?? '');
        userText.set(id, '');
        on.user(id, '');
        on.activity('user');
        break;
      }
      case 'input_audio_buffer.speech_stopped':
        on.activity('thinking');
        break;
      case 'conversation.item.input_audio_transcription.delta': {
        const id = String(ev.item_id ?? '');
        const text = (userText.get(id) ?? '') + String(ev.delta ?? '');
        userText.set(id, text);
        on.user(id, text);
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const id = String(ev.item_id ?? '');
        const text = String(ev.transcript ?? userText.get(id) ?? '').trim();
        userText.set(id, text);
        on.user(id, text);
        break;
      }
      case 'response.created':
        responding = true;
        on.activity('thinking');
        break;
      case 'response.output_audio_transcript.delta':
        if (ev.response_id !== agentId) {
          agentId = String(ev.response_id);
          agentText = '';
        }
        agentText += String(ev.delta ?? '');
        on.agent(agentId, agentText);
        break;
      case 'output_audio_buffer.started':
        speaking = true;
        on.activity('speaking');
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        speaking = false;
        on.activity('listening');
        break;
      case 'response.function_call_arguments.done':
        if (ev.name === 'show_contact_options') {
          on.contact(String(ev.arguments ?? '{}'));
          send({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: ev.call_id,
              output: JSON.stringify({
                shown: true,
                note: 'The buttons are on screen now. Tell the visitor in a few words; do not read out links or the email.',
              }),
            },
          });
          pending = true;
        }
        break;
      case 'response.done':
        responding = false;
        if (pending) {
          pending = false;
          send({ type: 'response.create' });
        }
        break;
      case 'error':
        console.warn('[voice]', ev.error);
        break;
    }
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    endOnServer(callId);
    dc.close();
    pc.close();
    for (const t of opts.mic.getTracks()) t.stop();
    opts.audio.srcObject = null;
  };
  pc.addEventListener('connectionstatechange', () => {
    // "disconnected" can recover on its own; these can't.
    if (
      !closed &&
      (pc.connectionState === 'failed' || pc.connectionState === 'closed')
    ) {
      close();
      on.dropped();
    }
  });
  dc.addEventListener('close', () => {
    if (!closed) {
      close();
      on.dropped();
    }
  });

  return {
    callId,
    seconds: body.seconds ?? 180,
    mute: (m) => {
      track.enabled = !m;
    },
    wrapUp: () => {
      send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text: WRAP_UP_NOTE }],
        },
      });
      respond();
    },
    close,
  };
}
