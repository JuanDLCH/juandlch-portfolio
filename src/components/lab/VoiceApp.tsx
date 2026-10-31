// Voice Lab: talk to Sophie, a GPT Realtime agent grounded in the CV. Layout
// from the Voice board of the design canvas: the orb (with Sophie's eyes),
// a live caption and the controls on the stage, and the transcript with live
// metrics in a side panel (a sheet on narrow screens). Open to everyone (it
// runs on my key), so the Worker (worker/) creates every call, checks
// Turnstile and the daily quota and cuts it after 3 minutes; this island only
// runs the WebRTC side (src/lab/voice/rtc.ts). On entry a recorded greeting
// introduces Sophie; the live agent doesn't repeat it.
import { useEffect, useRef, useState } from 'react';
import { CHAT } from '../../i18n/chat';
import { VOICE, type VoiceCopy } from '../../i18n/voice';
import { contactInput } from '../../lab/chat/contact';
import { WRAP_UP_S } from '../../lab/voice/prompt';
import {
  VoiceError,
  connect,
  type Activity,
  type Call,
  type StartError,
} from '../../lab/voice/rtc';
import { getToken } from '../../lab/voice/turnstile';
import { setLang, setTheme } from '../../scripts/prefs';
import SophieOrb, { type OrbMode } from './SophieOrb';
import {
  ContactActions,
  I,
  Icon,
  iconBtn,
  mono,
  useHtml,
  useHydrated,
} from './ui';

// Recorded greetings (scripts/voice-greeting.mjs). Optional: without them
// the greeting shows as text only.
const GREETINGS = import.meta.glob<string>(
  '../../assets/lab/voice/greeting-*.mp3',
  { eager: true, query: '?url', import: 'default' },
);
const greetingUrl = (lang: 'en' | 'es') =>
  GREETINGS[`../../assets/lab/voice/greeting-${lang}.mp3`];

type Phase =
  | { at: 'idle' }
  | { at: 'connecting' }
  | { at: 'live' }
  | { at: 'ended'; why: 'time' | 'user' | 'dropped' | StartError };

/** A transcript line: a turn of speech or an event (tool call, barge-in). */
type Speech = {
  kind: 'user' | 'agent';
  id: string;
  text: string;
  cut?: boolean;
};
type Line =
  | Speech
  | {
      kind: 'tool' | 'barge-in' | 'resume';
      id: string;
      text: string;
      meta?: string;
    };

const isSpeech = (l: Line): l is Speech =>
  l.kind === 'user' || l.kind === 'agent';

const ENDING_CONTACT = JSON.stringify({
  options: ['meeting', 'email', 'linkedin'],
});

/** RMS level (0–1) of an analyser's current frame. */
const rms = (a: AnalyserNode | null, buf: Float32Array<ArrayBuffer>) => {
  if (!a) return 0;
  a.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
};

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** Types `text` out letter by letter, like the chat's messages: a steady
 * pace that speeds up when it falls behind (speech streams in bursts). A
 * text that doesn't continue the one shown starts over. Reduced motion
 * shows it whole. */
function useTypewriter(text: string) {
  const [shown, setShown] = useState(text);
  const target = useRef(text);
  useEffect(() => {
    target.current = text;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = setInterval(() => {
      setShown((prev) => {
        const t = target.current;
        const cur = t.startsWith(prev) ? prev : '';
        if (still || cur.length >= t.length) {
          clearInterval(id);
          return t;
        }
        const behind = t.length - cur.length;
        return t.slice(0, cur.length + Math.max(1, Math.ceil(behind / 14)));
      });
    }, 18);
    return () => clearInterval(id);
  }, [text]);
  return shown;
}

/** Shorter remainders start a new call instead (as the Worker does). */
const MIN_RESUME_S = 10;
const SPEED = { min: 0.8, max: 1.5, step: 0.05 };

const monoLabel = `${mono} text-[10px] tracking-[0.08em] uppercase`;

function Transcript({
  lines,
  x,
  big = false,
}: {
  lines: Line[];
  x: VoiceCopy;
  big?: boolean;
}) {
  const shown = lines.filter((l) => l.text);
  if (!shown.length)
    return (
      <p className="text-muted m-0 text-sm leading-[1.55]">
        {x.emptyTranscript}
      </p>
    );
  return shown.map((l) =>
    !isSpeech(l) ? (
      <div
        key={l.id}
        className={`${mono} border-line2 text-muted flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border border-dashed px-2.5 py-[7px] text-[11px]`}
      >
        <span className={l.kind === 'barge-in' ? 'text-warn' : 'text-accent'}>
          {l.kind}
        </span>
        <span className="text-chip break-words">{l.text}</span>
        {l.meta && (
          <span className="ml-auto">
            {l.kind === 'tool' ? `✓ ${l.meta}` : l.meta}
          </span>
        )}
      </div>
    ) : (
      <div
        key={l.id}
        className={`flex flex-col gap-1 border-l-2 pl-3 ${l.kind === 'agent' ? 'border-accent' : 'border-line2'}`}
      >
        <span
          className={`${monoLabel} ${l.kind === 'agent' ? 'text-accent' : 'text-muted'}`}
        >
          {l.kind === 'agent' ? x.agent : x.you}
        </span>
        <span
          className={`${big ? 'text-[15px]' : 'text-sm'} leading-normal ${l.kind === 'agent' ? 'text-ink' : 'text-body'}`}
        >
          {l.text}
          {l.cut && ' —'}
        </span>
      </div>
    ),
  );
}

export default function VoiceApp() {
  const { es, dark } = useHtml();
  // The page language is only known after hydration (the server render is
  // English), so the greeting waits for it.
  const hydrated = useHydrated();
  const lang = es ? 'es' : 'en';
  const x = VOICE[lang];

  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  const [activity, setActivity] = useState<Activity>('listening');
  const [greeting, setGreeting] = useState<'off' | 'playing' | 'blocked'>(
    'off',
  );
  // Share of the greeting heard, to reveal its caption word by word.
  const [heard, setHeard] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [contact, setContact] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  // Session budget (3 min) and how much of it is used, across resumes.
  const [budget, setBudget] = useState(180);
  const [used, setUsed] = useState(0);
  const usedRef = useRef(0);
  // Ended call with time left: Start resumes it instead of a new call.
  const [resumable, setResumable] = useState<string | null>(null);
  // Sophie's speaking speed (and the greeting's).
  const [speed, setSpeed] = useState(1);
  const [metrics, setMetrics] = useState({ connect: 0, turn: 0, bargeIns: 0 });
  const [sheet, setSheet] = useState(false);

  const greetRef = useRef<HTMLAudioElement>(null);
  const remoteRef = useRef<HTMLAudioElement>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<Call | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const meters = useRef<{
    mic: AnalyserNode | null;
    agent: AnalyserNode | null;
  }>({ mic: null, agent: null });
  const buf = useRef(new Float32Array(512));
  const activityRef = useRef(activity);
  // When the visitor stopped talking, to time Sophie's answer.
  const stoppedAt = useRef(0);

  const live = phase.at === 'live';
  const ended = phase.at === 'ended' ? phase.why : null;
  const failed = !!ended && ended in x.errors;
  const mode: OrbMode = live
    ? muted
      ? 'muted'
      : activity
    : phase.at === 'connecting'
      ? 'connecting'
      : ended
        ? 'ended'
        : greeting === 'playing'
          ? 'greeting'
          : 'idle';
  const level = () =>
    rms(
      activityRef.current === 'user'
        ? meters.current.mic
        : meters.current.agent,
      buf.current,
    );
  const left = budget - used;
  const wrapping = live && left <= WRAP_UP_S;

  // Greeting: plays on arrival when the browser allows it (coming from the
  // landing, the click counts); otherwise a button offers it.
  const playGreeting = () => {
    const el = greetRef.current;
    const src = greetingUrl(lang);
    if (!el || !src) {
      setGreeting('off');
      return;
    }
    if (el.getAttribute('src') !== src) el.src = src;
    el.currentTime = 0;
    setHeard(0);
    el.play().then(
      () => setGreeting('playing'),
      () => setGreeting('blocked'),
    );
  };
  const stopGreeting = () => {
    greetRef.current?.pause();
    setGreeting((g) => (g === 'playing' ? 'off' : g));
  };
  useEffect(() => {
    if (!hydrated) return;
    const el = greetRef.current;
    playGreeting();
    return () => el?.pause();
    // Once, on arrival (after hydration, in the page language).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
  // The greeting is in the page language: switching it stops the greeting.
  const shownLang = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (shownLang.current && shownLang.current !== lang) stopGreeting();
    shownLang.current = lang;
  }, [hydrated, lang]);

  const hangUp = (why: 'time' | 'user' | 'dropped') => {
    const call = callRef.current;
    setResumable(
      call && why !== 'time' && budget - usedRef.current >= MIN_RESUME_S
        ? call.callId
        : null,
    );
    call?.close();
    callRef.current = null;
    void audioCtx.current?.close();
    audioCtx.current = null;
    meters.current = { mic: null, agent: null };
    setPhase({ at: 'ended', why });
  };

  // Transcript: upsert a turn by id, keeping the order turns started in.
  const upsert = (kind: 'user' | 'agent', id: string, text: string) =>
    setLines((ls) => {
      const key = `${kind}:${id}`;
      const i = ls.findIndex((l) => l.id === key);
      if (i < 0) return [...ls, { kind, id: key, text }];
      const next = [...ls];
      next[i] = { ...next[i], text };
      return next;
    });

  const onActivity = (a: Activity) => {
    const prev = activityRef.current;
    if (a === 'thinking' && prev === 'user')
      stoppedAt.current = performance.now();
    if (a === 'speaking' && stoppedAt.current) {
      const turn = Math.round(performance.now() - stoppedAt.current);
      stoppedAt.current = 0;
      setMetrics((m) => ({ ...m, turn }));
    }
    activityRef.current = a;
    setActivity(a);
  };

  const onBargeIn = () => {
    setLines((ls) => {
      const next = [...ls];
      for (let i = next.length - 1; i >= 0; i--) {
        const l = next[i];
        if (l.kind === 'agent') {
          next[i] = { ...l, cut: true };
          break;
        }
      }
      return [
        ...next,
        { kind: 'barge-in', id: `b${next.length}`, text: x.bargeIn },
      ];
    });
    setMetrics((m) => ({ ...m, bargeIns: m.bargeIns + 1 }));
  };

  const onContact = (args: string) => {
    setContact(args);
    const { options } = contactInput(args);
    setLines((ls) => [
      ...ls,
      {
        kind: 'tool',
        id: `t${ls.length}`,
        text: `show_contact_options({ ${options.join(', ')} })`,
        meta: x.toolShown,
      },
    ]);
  };

  /** Back to a clean slate: no transcript, the whole budget. */
  const reset = () => {
    setPhase({ at: 'idle' });
    setLines([]);
    setContact(null);
    setResumable(null);
    setUsed(0);
    usedRef.current = 0;
    setMetrics({ connect: 0, turn: 0, bargeIns: 0 });
  };

  const start = async (resume: string | null = null) => {
    stopGreeting();
    if (!resume) reset();
    setPhase({ at: 'connecting' });
    setContact(null);
    setMuted(false);
    const history = lines
      .filter(
        (l): l is Speech =>
          (l.kind === 'user' || l.kind === 'agent') && !!l.text,
      )
      .slice(-24)
      .map((l) => ({
        role: l.kind === 'user' ? ('user' as const) : ('assistant' as const),
        text: l.text.slice(0, 600),
      }));
    activityRef.current = 'listening';
    setActivity('listening');
    const t0 = performance.now();
    // Created inside the click, so the browser lets it run.
    const ctx = new AudioContext();
    audioCtx.current = ctx;
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      void ctx.close();
      audioCtx.current = null;
      setPhase({ at: 'ended', why: 'mic' });
      return;
    }
    try {
      const token = await getToken(captchaRef.current!, lang).catch(() => {
        throw new VoiceError('captcha');
      });
      const micMeter = ctx.createAnalyser();
      ctx.createMediaStreamSource(mic).connect(micMeter);
      const agentMeter = ctx.createAnalyser();
      meters.current = { mic: micMeter, agent: null };
      const call = await connect({
        token,
        lang,
        mic,
        audio: remoteRef.current!,
        speed,
        resume: resume ? { callId: resume, history } : undefined,
        on: {
          activity: onActivity,
          user: (id, text) => upsert('user', id, text),
          agent: (id, text) => upsert('agent', id, text),
          bargeIn: onBargeIn,
          contact: onContact,
          dropped: () => hangUp('dropped'),
          // Sophie's voice, once its track arrives: feeds the orb.
          remote: (stream) => {
            ctx.createMediaStreamSource(stream).connect(agentMeter);
            meters.current = { mic: micMeter, agent: agentMeter };
          },
        },
      });
      callRef.current = call;
      // A resume the server refused (expired) is a new call.
      if (resume && !call.resumed) {
        setLines([]);
        setMetrics((m) => ({ ...m, bargeIns: 0 }));
      }
      setResumable(null);
      setBudget(call.budget);
      usedRef.current = call.budget - call.seconds;
      setUsed(usedRef.current);
      if (call.resumed)
        setLines((ls) => [
          ...ls,
          {
            kind: 'resume',
            id: `r${ls.length}`,
            text: x.resumedNote,
            meta: `${mmss(call.seconds)}`,
          },
        ]);
      setMetrics((m) => ({
        ...m,
        connect: Math.round(performance.now() - t0),
      }));
      setPhase({ at: 'live' });
    } catch (err) {
      for (const t of mic.getTracks()) t.stop();
      void audioCtx.current?.close();
      audioCtx.current = null;
      setPhase({
        at: 'ended',
        why: err instanceof VoiceError ? err.code : 'unavailable',
      });
    }
  };

  // Session clock; Sophie is asked to wrap up near the end, and the call
  // closes at the limit (the server cuts it a few seconds later anyway).
  useEffect(() => {
    if (!live) return;
    const call = callRef.current;
    if (!call) return;
    const t0 = performance.now();
    const base = call.budget - call.seconds;
    let warned = false;
    const id = setInterval(() => {
      const s = Math.floor((performance.now() - t0) / 1000);
      usedRef.current = base + Math.min(s, call.seconds);
      setUsed(usedRef.current);
      if (!warned && call.seconds - s <= WRAP_UP_S) {
        warned = true;
        call.wrapUp();
      }
      if (s >= call.seconds) hangUp('time');
    }, 250);
    return () => clearInterval(id);
    // One interval per call; hangUp reads refs and the call's own budget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Leaving the page (or this island) ends the call.
  useEffect(() => {
    // close() tells the server too, with a request that survives unloads.
    const leave = () => callRef.current?.close();
    window.addEventListener('pagehide', leave);
    document.addEventListener('astro:before-swap', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('astro:before-swap', leave);
      leave();
    };
  }, []);

  // Keep the newest line in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Speed: the greeting follows it right away; Sophie from her next answer
  // (sent once the slider settles).
  useEffect(() => {
    if (greetRef.current) greetRef.current.playbackRate = speed;
    const id = setTimeout(() => callRef.current?.setSpeed(speed), 300);
    return () => clearTimeout(id);
  }, [speed]);

  // Browsers block sound until the visitor interacts with the page (unless
  // they came from the landing): then the greeting plays on the first click
  // or key, anywhere but Start.
  useEffect(() => {
    if (greeting !== 'blocked' || phase.at !== 'idle') return;
    const play = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-voice-start]')) return;
      playGreeting();
    };
    window.addEventListener('pointerdown', play, { once: true });
    window.addEventListener('keydown', play, { once: true });
    return () => {
      window.removeEventListener('pointerdown', play);
      window.removeEventListener('keydown', play);
    };
    // playGreeting reads the current language when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting, phase.at]);

  // The transcript sheet closes with Escape.
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  const toggleMute = () => {
    callRef.current?.mute(!muted);
    setMuted(!muted);
  };

  const fillLeft = (t: string) => t.replace('{t}', mmss(left));

  // Caption: the greeting before the call, the turn in progress during it
  // (or the last one, dimmed), and how it ended after.
  const speech = lines.filter(
    (l): l is Speech => (l.kind === 'user' || l.kind === 'agent') && !!l.text,
  );
  const last = speech[speech.length - 1];
  const streaming =
    live &&
    !!last &&
    ((activity === 'user' && last.kind === 'user') ||
      (activity === 'speaking' && last.kind === 'agent'));
  let caption: { who: string; text: string; tone: string; cursor: boolean };
  if (phase.at === 'idle' && greeting !== 'off') {
    // Follows the audio, a little ahead of it.
    const n =
      greeting === 'playing'
        ? Math.ceil(Math.min(1, heard * 1.08 + 0.02) * x.greeting.length)
        : 0;
    caption = {
      who: x.agent,
      text: n ? x.greeting.slice(0, n) : x.greeting,
      tone: n || greeting === 'blocked' ? 'text-ink' : 'text-muted',
      cursor: greeting === 'playing',
    };
  } else if (ended) {
    caption = {
      who: '',
      text: failed
        ? x.errors[ended as StartError]
        : resumable
          ? fillLeft(ended === 'dropped' ? x.droppedPaused : x.paused)
          : x.ended[ended as 'time' | 'user' | 'dropped'],
      tone: failed ? 'text-warn' : 'text-body',
      cursor: false,
    };
  } else if (live && last) {
    caption = {
      who: last.kind === 'agent' ? x.agent : x.you,
      text: last.text + (last.cut ? ' —' : ''),
      tone: streaming
        ? last.kind === 'agent'
          ? 'text-ink'
          : 'text-body'
        : 'text-muted',
      cursor: streaming,
    };
  } else if (live || phase.at === 'connecting') {
    caption = {
      who: '',
      text: live ? x.phase.listening : x.phase.connecting,
      tone: 'text-muted',
      cursor: false,
    };
  } else {
    caption = {
      who: '',
      text: x.idleCaption,
      tone: 'text-muted',
      cursor: false,
    };
  }
  const typedCaption = useTypewriter(caption.text);
  const captionWhoTone =
    caption.who === x.agent && caption.tone !== 'text-muted'
      ? 'text-accent'
      : 'text-muted';

  const phaseTone =
    mode === 'muted'
      ? 'text-warn'
      : mode === 'speaking' || mode === 'thinking' || mode === 'greeting'
        ? 'text-accent'
        : mode === 'listening' || mode === 'user'
          ? 'text-ok'
          : 'text-muted';
  const phaseDot =
    mode === 'muted'
      ? 'bg-warn'
      : phaseTone === 'text-accent'
        ? 'bg-accent'
        : phaseTone === 'text-ok'
          ? 'bg-ok'
          : 'bg-muted';
  const hint = !live
    ? x.hintIdle
    : muted
      ? x.hintMuted
      : wrapping
        ? x.hintWrap
        : x.hintLive;
  const turnCount = `${speech.length} ${x.turns}`;
  const metricCells = [
    { k: x.metrics[0], v: metrics.connect ? `${metrics.connect} ms` : '— ms' },
    { k: x.metrics[1], v: metrics.turn ? `${metrics.turn} ms` : '— ms' },
    { k: x.metrics[2], v: live || ended ? String(metrics.bargeIns) : '—' },
    { k: x.metrics[3], v: mmss(used) },
  ];
  const themeLabel = dark ? CHAT[lang].toLight : CHAT[lang].toDark;

  return (
    <div className="bg-bg text-ink relative flex h-dvh flex-col overflow-hidden">
      <header className="border-line mob:h-14 mob:gap-2 mob:px-2.5 flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <a
            href="/#lab"
            aria-label={x.backLabel}
            className={`${mono} border-line2 hover:border-accent inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 border px-3.5 text-xs tracking-[0.06em] uppercase no-underline transition-colors`}
          >
            <span aria-hidden="true">←</span>
            <span className="mob:hidden">{x.back}</span>
          </a>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="mob:text-base m-0 text-lg font-medium tracking-[-0.02em] whitespace-nowrap">
              {x.title}
            </h1>
            <span className={`${monoLabel} text-muted truncate`}>
              {x.subtitle}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label={CHAT[lang].langGroup}
            className="border-line2 flex border"
          >
            {(['en', 'es'] as const).map((l, i) => {
              const on = l === lang;
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLang(l)}
                  className={`${mono} h-[42px] w-11 cursor-pointer border-0 p-0 text-[11px] ${i ? 'border-line2 border-l' : ''} ${on ? 'bg-ink text-bg' : 'text-ink bg-transparent'}`}
                >
                  {l.toUpperCase()}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={themeLabel}
            title={themeLabel}
            className={`${iconBtn} size-11`}
          >
            <Icon d={dark ? I.sun : I.moon} />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <main className="dots flex min-w-0 flex-1 flex-col">
          {/* Never scrolls: the orb takes the height left by the rest. */}
          <div className="mob:px-4 flex min-h-0 flex-1 flex-col items-center gap-[clamp(8px,2dvh,20px)] overflow-hidden px-6 pt-[clamp(12px,3dvh,28px)]">
            <div
              className={`${mono} text-muted flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] tracking-[0.08em] uppercase`}
            >
              <span
                role="status"
                className="border-line2 inline-flex items-center gap-2 border px-2.5 py-1.5"
              >
                <span
                  aria-hidden="true"
                  className={`size-[7px] ${phaseDot} ${live && !muted ? 'jd-blink' : ''}`}
                />
                <span className={phaseTone}>{x.phase[mode]}</span>
              </span>
              <span>{x.scenario}</span>
            </div>

            <div className="flex min-h-[72px] w-full flex-1 items-center justify-center">
              <SophieOrb
                mode={mode}
                level={level}
                clock={mmss(left)}
                warn={wrapping}
                label={`${x.orb} — ${x.phase[mode]}`}
              />
            </div>

            <div
              aria-live="polite"
              className="w-full max-w-[760px] shrink-0 text-center"
            >
              <div className={`${monoLabel} min-h-[1.2em] ${captionWhoTone}`}>
                {caption.who}
              </div>
              {/* Three lines, the newest at the bottom; older ones slide up
                  and fade out (the transcript keeps everything). */}
              <p
                role={failed ? 'alert' : undefined}
                className={`mob:text-[clamp(15px,4.2vw,18px)] mt-1.5 mb-0 flex h-[4.2em] flex-col justify-end overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_1.1em)] text-[clamp(15px,1.35vw,19px)] leading-[1.4] font-normal tracking-[-0.02em] ${caption.tone}`}
              >
                {/* Screen readers get the whole text, not every letter. */}
                <span className="sr-only">{caption.text}</span>
                <span aria-hidden="true">
                  {typedCaption}
                  {(caption.cursor ||
                    typedCaption.length < caption.text.length) && (
                    <span className="jd-blink bg-accent ml-[3px] inline-block h-[0.9em] w-[0.4em] align-[-0.1em]" />
                  )}
                </span>
              </p>
            </div>

            {/* Fixed slot, so the orb doesn't jump when buttons appear. */}
            <div className="flex min-h-9 shrink-0 flex-col items-center justify-center gap-2">
              {(contact || ended) && (
                <div className="flex flex-col items-center gap-2">
                  {!contact && (
                    <p className="text-body m-0 text-sm">{x.reachOut}</p>
                  )}
                  <ContactActions
                    input={contact ?? ENDING_CONTACT}
                    x={CHAT[lang]}
                    inset={false}
                  />
                </div>
              )}

              {phase.at === 'idle' && greetingUrl(lang) && (
                <button
                  type="button"
                  onClick={greeting === 'playing' ? stopGreeting : playGreeting}
                  className={`${mono} border-line2 text-muted hover:border-accent hover:text-ink inline-flex h-8 cursor-pointer items-center gap-2 border bg-transparent px-3 text-[10px] tracking-[0.08em] uppercase transition-colors`}
                >
                  <Icon
                    d={greeting === 'playing' ? I.stop : I.play}
                    size={12}
                  />
                  {greeting === 'playing'
                    ? x.stopGreeting
                    : greeting === 'blocked'
                      ? x.hearGreeting
                      : x.replay}
                </button>
              )}
            </div>
          </div>

          <div className="mob:px-4 mob:pb-[calc(12px+env(safe-area-inset-bottom))] flex shrink-0 flex-col items-center gap-2.5 px-6 pt-[clamp(8px,2dvh,18px)] pb-[clamp(10px,2.2dvh,20px)]">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleMute}
                disabled={!live}
                aria-pressed={muted}
                aria-label={muted ? x.unmute : x.mute}
                title={muted ? x.unmute : x.mute}
                className={`grid size-[60px] place-items-center border p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${muted ? 'border-warn bg-warn text-bg' : 'border-line2 text-ink hover:border-accent cursor-pointer bg-transparent'}`}
              >
                <Icon
                  d={muted ? `${I.mic}<path d="M3 3l18 18"/>` : I.mic}
                  size={22}
                />
              </button>
              <button
                type="button"
                data-voice-start
                onClick={
                  live
                    ? () => hangUp('user')
                    : () => void start(ended ? resumable : null)
                }
                disabled={phase.at === 'connecting'}
                className={`inline-flex h-[60px] min-w-[200px] cursor-pointer items-center justify-center gap-2.5 border px-6 text-base font-semibold transition-[filter,border-color] disabled:cursor-wait disabled:opacity-70 ${live ? 'border-line2 text-ink hover:border-accent bg-transparent' : 'border-accent bg-accent text-on-accent hover:brightness-110'}`}
              >
                <Icon d={live ? I.stop : I.mic} size={live ? 16 : 18} />
                {live
                  ? x.end
                  : phase.at === 'connecting'
                    ? x.connecting
                    : resumable
                      ? `${x.resume} · ${mmss(left)}`
                      : ended
                        ? x.again
                        : x.start}
              </button>
              <button
                type="button"
                onClick={() => setSheet(true)}
                aria-label={x.transcriptBtn}
                title={x.transcriptBtn}
                className={`${iconBtn} narrow:grid hidden size-[60px]`}
              >
                <Icon d='<path d="M4 6h16M4 11h16M4 16h10"/>' size={20} />
              </button>
            </div>
            {resumable && !live && phase.at !== 'connecting' && (
              <button
                type="button"
                onClick={reset}
                className={`${mono} text-muted hover:text-ink cursor-pointer border-0 bg-transparent p-0 text-[11px] tracking-[0.06em] uppercase underline-offset-4 hover:underline`}
              >
                {x.startOver}
              </button>
            )}
            <label
              className={`${mono} text-muted flex items-center gap-2.5 text-[10px] tracking-[0.08em] uppercase`}
            >
              {x.speed}
              <input
                type="range"
                min={SPEED.min}
                max={SPEED.max}
                step={SPEED.step}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                aria-valuetext={`${speed.toFixed(2)}×`}
                className="accent-accent h-1 w-[clamp(110px,14vw,160px)] cursor-pointer"
              />
              <span className="text-ink w-[3.6em] text-left tabular-nums">
                {speed.toFixed(2)}×
              </span>
            </label>
            <p
              className={`${mono} m-0 max-w-[560px] text-center text-[10px] leading-[1.6] tracking-[0.04em] ${wrapping ? 'text-warn' : 'text-muted'}`}
            >
              {hint}
            </p>
            {failed && (
              <a
                href="/lab/cv"
                className={`${mono} text-accent text-[11px] tracking-[0.06em] uppercase`}
              >
                {x.textChat} →
              </a>
            )}
            {/* Turnstile shows here only if Cloudflare needs an interaction. */}
            <div ref={captchaRef} />
          </div>
        </main>

        <aside
          aria-label={x.transcript}
          className="border-line bg-panel narrow:hidden flex min-h-0 w-[380px] flex-none flex-col border-l"
        >
          <div
            className={`${mono} border-line text-muted flex h-12 flex-none items-center justify-between border-b px-[18px] text-[11px] tracking-[0.08em] uppercase`}
          >
            <span>{x.transcript}</span>
            <span>{turnCount}</span>
          </div>
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[18px] py-4"
          >
            <Transcript lines={lines} x={x} />
          </div>
          <div className="border-line flex-none border-t px-[18px] pt-3.5 pb-4">
            <div className={`${monoLabel} text-muted flex justify-between`}>
              <span>{x.latency}</span>
              <span>{x.lastTurn}</span>
            </div>
            <div className="bg-line border-line mt-2.5 grid grid-cols-4 gap-px border">
              {metricCells.map((m) => (
                <div key={m.k} className="bg-bg min-w-0 px-1.5 py-2">
                  <div
                    className={`${mono} text-muted truncate text-[9px] tracking-[0.02em]`}
                  >
                    {m.k}
                  </div>
                  <div className={`${mono} mt-1 text-[13px] whitespace-nowrap`}>
                    {m.v}
                  </div>
                </div>
              ))}
            </div>
            <div className={`${mono} text-chip mt-3 flex gap-1 text-[9px]`}>
              {x.pipeline.map((p) => (
                <span
                  key={p}
                  className="border-line2 min-w-0 truncate border px-1.5 py-1"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </aside>

        {sheet && (
          <div className="narrow:flex absolute inset-0 z-20 hidden flex-col justify-end">
            <button
              type="button"
              onClick={() => setSheet(false)}
              aria-label={x.close}
              className="bg-scrim flex-auto cursor-pointer border-0 p-0"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={x.transcript}
              className="bg-panel border-line2 flex max-h-[78%] flex-none flex-col border-t"
            >
              <div aria-hidden="true" className="flex justify-center pt-2">
                <span className="bg-line2 h-1 w-10" />
              </div>
              <div
                className={`${mono} border-line text-muted flex h-12 items-center justify-between border-b px-4 text-[11px] tracking-[0.08em] uppercase`}
              >
                <span>
                  {x.transcript} · {turnCount}
                </span>
                <button
                  type="button"
                  onClick={() => setSheet(false)}
                  aria-label={x.close}
                  className={`${iconBtn} size-11 text-lg`}
                >
                  ×
                </button>
              </div>
              <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto p-4">
                <Transcript lines={lines} x={x} big />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Both are captioned on screen: the greeting's text and the live
          transcript. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={greetRef}
        preload="auto"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration) setHeard(el.currentTime / el.duration);
        }}
        onEnded={() => setGreeting('off')}
        className="hidden"
      />
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={remoteRef} autoPlay className="hidden" />
    </div>
  );
}
