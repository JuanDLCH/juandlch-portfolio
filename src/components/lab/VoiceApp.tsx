// Voice Lab: talk to Sophie, a GPT Realtime agent grounded in the CV. Open
// to everyone (it runs on my key), so the Worker (worker/) creates every call,
// checks Turnstile and the daily quota and cuts it after 3 minutes; this
// island only runs the WebRTC side (src/lab/voice/rtc.ts). On entry a
// recorded greeting introduces Sophie; the live agent doesn't repeat it.
import { useEffect, useRef, useState } from 'react';
import { CHAT } from '../../i18n/chat';
import { VOICE } from '../../i18n/voice';
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
import SophieFace, { type FaceMode } from './SophieFace';
import {
  ContactActions,
  I,
  Icon,
  iconBtn,
  label,
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

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

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
  const [userText, setUserText] = useState('');
  const [agentText, setAgentText] = useState('');
  const [contact, setContact] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [left, setLeft] = useState(0);

  const greetRef = useRef<HTMLAudioElement>(null);
  const remoteRef = useRef<HTMLAudioElement>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<Call | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const meters = useRef<{
    mic: AnalyserNode | null;
    agent: AnalyserNode | null;
  }>({ mic: null, agent: null });
  const buf = useRef(new Float32Array(512));
  const activityRef = useRef(activity);
  useEffect(() => {
    activityRef.current = activity;
  });

  const live = phase.at === 'live';
  const mode: FaceMode =
    phase.at === 'live'
      ? activity
      : phase.at === 'connecting'
        ? 'connecting'
        : phase.at === 'ended'
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
    callRef.current?.close();
    callRef.current = null;
    void audioCtx.current?.close();
    audioCtx.current = null;
    meters.current = { mic: null, agent: null };
    setPhase({ at: 'ended', why });
  };

  const start = async () => {
    stopGreeting();
    setPhase({ at: 'connecting' });
    setUserText('');
    setAgentText('');
    setContact(null);
    setMuted(false);
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
        on: {
          activity: setActivity,
          user: setUserText,
          agent: setAgentText,
          contact: setContact,
          dropped: () => hangUp('dropped'),
          // Sophie's voice, once its track arrives: feeds the face.
          remote: (stream) => {
            ctx.createMediaStreamSource(stream).connect(agentMeter);
            meters.current = { mic: micMeter, agent: agentMeter };
          },
        },
      });
      callRef.current = call;
      setActivity('listening');
      setLeft(call.seconds);
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

  // Countdown; Sophie is asked to wrap up near the end, and the call closes
  // at zero (the server cuts it a few seconds later anyway).
  useEffect(() => {
    if (!live) return;
    const call = callRef.current;
    if (!call) return;
    const endsAt = performance.now() + call.seconds * 1000;
    let warned = false;
    const id = setInterval(() => {
      const s = Math.ceil((endsAt - performance.now()) / 1000);
      setLeft(Math.max(0, s));
      if (!warned && s <= WRAP_UP_S) {
        warned = true;
        call.wrapUp();
      }
      if (s <= 0) hangUp('time');
    }, 250);
    return () => clearInterval(id);
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

  const toggleMute = () => {
    callRef.current?.mute(!muted);
    setMuted(!muted);
  };

  const status =
    phase.at === 'live'
      ? x.status[activity]
      : phase.at === 'connecting'
        ? x.status.connecting
        : phase.at === 'ended'
          ? x.status.ended
          : greeting === 'playing'
            ? x.status.greeting
            : x.status.idle;
  const ended = phase.at === 'ended' ? phase.why : null;
  const failed = ended && ended in x.errors;
  const endedText = !ended
    ? ''
    : ended in x.errors
      ? x.errors[ended as StartError]
      : x.ended[ended as 'time' | 'user' | 'dropped'];

  const langGroup = (
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
            className={`${mono} mob:size-11 h-9 w-9 cursor-pointer border-0 p-0 text-[11px] ${i ? 'border-line2 border-l' : ''} ${on ? 'bg-ink text-bg' : 'text-ink bg-transparent'}`}
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
  const themeLabel = dark ? CHAT[lang].toLight : CHAT[lang].toDark;

  const primary =
    'bg-accent text-on-accent inline-flex min-h-12 cursor-pointer items-center justify-center gap-2.5 border-0 px-6 text-[15px] font-semibold transition-[filter] hover:brightness-110 disabled:cursor-wait disabled:opacity-70';
  const secondary =
    'border-line2 text-ink hover:border-accent inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 border bg-transparent px-4 text-sm no-underline transition-colors';

  return (
    <div className="bg-bg text-ink flex h-dvh flex-col overflow-hidden">
      <header className="border-line mob:px-2.5 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <a
            href="/#lab"
            aria-label={x.homeLabel}
            className={`${mono} border-line2 hover:border-accent mob:size-11 mob:justify-center mob:p-0 mob:text-base inline-flex h-9 shrink-0 items-center gap-2 border px-3 text-[11px] tracking-[0.06em] uppercase no-underline transition-colors`}
          >
            <span aria-hidden="true">←</span>
            <span className="mob:hidden">{x.home}</span>
          </a>
          <span
            aria-hidden="true"
            className="bg-line2 narrow:hidden h-6 w-px"
          />
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="m-0 truncate text-base font-medium tracking-[-0.02em]">
              {x.title}
            </h1>
            <span className={`${label} narrow:hidden text-[11px]`}>
              {x.stack}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {langGroup}
          <button
            type="button"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={themeLabel}
            title={themeLabel}
            className={`${iconBtn} mob:size-11 size-9`}
          >
            <Icon d={dark ? I.sun : I.moon} />
          </button>
        </div>
      </header>

      <main className="dots flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-[clamp(12px,3svh,32px)]">
        <div className="flex w-full max-w-[640px] flex-1 flex-col items-center gap-[clamp(10px,2.4svh,22px)] text-center">
          <div>
            <div
              className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
            >
              {x.tag}
            </div>
            <h2 className="text-h2 mt-2 mb-0 leading-[1.05] font-medium tracking-[-0.04em]">
              {x.heading}
            </h2>
            {phase.at === 'idle' && (
              <p className="text-body mx-auto mt-2 mb-0 max-w-[520px] text-sm leading-[1.55]">
                {x.sub}
              </p>
            )}
          </div>

          <section
            aria-label={x.agent}
            className="bg-panel border-line2 relative flex w-full flex-col items-center gap-3 border px-4 pt-3 pb-[clamp(14px,3svh,28px)]"
          >
            <div
              className={`${mono} flex w-full items-center justify-between text-[10px] tracking-[0.08em] uppercase`}
            >
              <span
                role="status"
                className={`flex items-center gap-2 ${live || greeting === 'playing' ? 'text-accent' : 'text-muted'}`}
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 ${live ? 'bg-ok jd-blink' : phase.at === 'connecting' ? 'bg-warn jd-blink' : live || greeting === 'playing' ? 'bg-accent' : 'bg-line2'}`}
                />
                {status}
                {live && muted && ` · ${x.muted}`}
              </span>
              {live && (
                <span
                  className={left <= WRAP_UP_S ? 'text-warn' : 'text-muted'}
                  aria-label={`${x.timeLeft}: ${clock(left)}`}
                >
                  {clock(left)}
                </span>
              )}
            </div>

            <SophieFace mode={mode} level={level} />

            {/* Captions: what you said and what Sophie is saying. */}
            <div
              aria-live="polite"
              className="flex min-h-[4.5em] w-full max-w-[520px] flex-col gap-1.5 text-[15px] leading-normal"
            >
              {phase.at === 'idle' && greeting !== 'off' && (
                <p className="text-ink m-0">{x.greeting}</p>
              )}
              {phase.at === 'idle' && greeting === 'off' && (
                <div className="flex flex-col gap-1.5">
                  <span className={label}>{x.tryAsking}</span>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {x.ideas.map((q) => (
                      <span
                        key={q}
                        className="border-line2 text-body border px-2.5 py-1 text-[13px]"
                      >
                        {q}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(live || ended === 'time' || ended === 'user') && userText && (
                <p className="text-muted m-0 text-sm">
                  <span
                    className={`${mono} mr-2 text-[10px] tracking-[0.08em] uppercase`}
                  >
                    {x.you}
                  </span>
                  {userText}
                </p>
              )}
              {(live || ended === 'time' || ended === 'user') && agentText && (
                <p className="text-ink m-0">
                  <span
                    className={`${mono} text-accent mr-2 text-[10px] tracking-[0.08em] uppercase`}
                  >
                    {x.agent}
                  </span>
                  {agentText}
                </p>
              )}
              {ended && (
                <p
                  role={failed ? 'alert' : undefined}
                  className={`m-0 text-sm ${failed ? 'text-warn' : 'text-body'}`}
                >
                  {endedText}
                </p>
              )}
            </div>

            {contact && (live || ended) && (
              <div className="flex justify-center">
                <ContactActions input={contact} x={CHAT[lang]} inset={false} />
              </div>
            )}
          </section>

          <div className="flex w-full flex-wrap items-center justify-center gap-2.5">
            {live ? (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-pressed={muted}
                  aria-label={muted ? x.unmute : x.mute}
                  title={muted ? x.unmute : x.mute}
                  className={`${iconBtn} size-12 ${muted ? 'border-warn text-warn' : ''}`}
                >
                  <Icon
                    d={muted ? `${I.mic}<path d="M3 3l18 18"/>` : I.mic}
                    size={20}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => hangUp('user')}
                  className={primary}
                >
                  <Icon d={I.stop} size={16} />
                  {x.end}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={phase.at === 'connecting'}
                  className={`${primary} ${phase.at === 'idle' ? 'jd-cvbtn' : ''}`}
                >
                  <Icon d={I.mic} size={18} />
                  {phase.at === 'connecting'
                    ? x.connecting
                    : ended
                      ? x.again
                      : x.start}
                </button>
                {phase.at === 'idle' && greetingUrl(lang) && (
                  <button
                    type="button"
                    onClick={
                      greeting === 'playing' ? stopGreeting : playGreeting
                    }
                    className={secondary}
                  >
                    <Icon
                      d={greeting === 'playing' ? I.stop : I.play}
                      size={15}
                    />
                    {greeting === 'blocked' ? x.hearGreeting : x.replay}
                  </button>
                )}
                {ended && (
                  <a href="/lab/cv" className={secondary}>
                    <Icon d={I.file} size={15} />
                    {x.textChat}
                  </a>
                )}
              </>
            )}
          </div>

          {ended && !contact && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-body m-0 text-sm">{x.reachOut}</p>
              <ContactActions
                input={ENDING_CONTACT}
                x={CHAT[lang]}
                inset={false}
              />
            </div>
          )}

          {/* Turnstile shows here only if Cloudflare needs an interaction. */}
          <div ref={captchaRef} />

          <p className={`${label} mt-auto mb-0 tracking-[0.02em] normal-case`}>
            {x.fine}
          </p>
        </div>
      </main>

      {/* Both are captioned on screen: the greeting's text and the live
          transcript. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={greetRef}
        preload="auto"
        onEnded={() => setGreeting('off')}
        className="hidden"
      />
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={remoteRef} autoPlay className="hidden" />
    </div>
  );
}
