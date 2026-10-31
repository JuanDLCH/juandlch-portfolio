// Sophie's orb, from the Voice board of the design canvas: 60 radial rays
// around a core, pulsing rings while she speaks and a dashed ring that spins
// while she thinks, plus her eyes inside the core. Rays and eyes are moved
// by rAF writing SVG attributes, so the audio level never re-renders React.
// The eyes follow the pointer while idle, widen while you talk, narrow and
// glance aside while she thinks, and bounce with her voice. With reduced
// motion only the shapes per state remain.
import { useEffect, useRef } from 'react';

export type OrbMode =
  | 'idle'
  | 'greeting'
  | 'connecting'
  | 'listening'
  | 'user'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'ended';

const N = 60;
// Ray lengths, as in the board: a fixed irregular crown.
const LEN = Array.from({ length: N }, (_, i) => {
  const wob = 0.45 + 0.55 * Math.abs(Math.sin(i * 1.9) * Math.cos(i * 0.7));
  return 6 + 26 * wob;
});
// Eyes inside the core (r = 56 around 100,100).
const EYES = [86, 114];
const EYE = { w: 13, h: 21, r: 6.5, y: 90 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function SophieOrb({
  mode,
  level,
  clock,
  warn,
  label,
}: {
  mode: OrbMode;
  /** Current audio level, 0–1: Sophie's voice or the visitor's mic. */
  level: () => number;
  /** Shown in the core, under the eyes. */
  clock: string;
  /** The clock turns to the warning color (the call is about to end). */
  warn: boolean;
  /** Accessible name: what Sophie is doing. */
  label: string;
}) {
  const rays = useRef<(SVGRectElement | null)[]>([]);
  const eyes = useRef<(SVGRectElement | null)[]>([]);
  const modeRef = useRef(mode);
  const levelRef = useRef(level);
  useEffect(() => {
    modeRef.current = mode;
    levelRef.current = level;
  });

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const heights = LEN.map((l) => l * 0.35);
    const eye = { sy: 1, dx: 0, dy: 0 };
    let nextBlink = performance.now() + 2500;
    let blinkUntil = 0;
    let frame = 0;
    const tick = (now: number) => {
      const m = modeRef.current;
      const still = reduced.matches;
      // The recorded greeting has no live meter: a made-up talking rhythm.
      const lv =
        m === 'greeting'
          ? 0.45 +
            0.3 * Math.sin(now / 90) * Math.sin(now / 230) +
            0.2 * Math.sin(now / 37)
          : Math.min(1, levelRef.current() * 2.4);

      // Rays.
      for (let i = 0; i < N; i++) {
        const len = LEN[i];
        const wave = 0.5 + 0.5 * Math.sin(now / 900 + i * 0.6);
        let h: number;
        switch (m) {
          case 'greeting':
          case 'speaking':
          case 'user': {
            const jitter =
              0.55 + 0.45 * Math.abs(Math.sin(now / 140 + i * 1.3));
            h = len * (0.22 + 0.78 * Math.min(1, lv * (still ? 0.8 : jitter)));
            break;
          }
          case 'listening':
            h = len * (0.22 + 0.12 * (still ? 0.5 : wave));
            break;
          case 'idle':
            h = len * 0.35 * (0.45 + 0.55 * (still ? 1 : wave));
            break;
          case 'connecting':
            h =
              len *
              0.35 *
              (0.3 +
                0.7 * (still ? 1 : 0.5 + 0.5 * Math.sin(now / 300 + i * 0.6)));
            break;
          case 'ended':
            h = 2;
            break;
          default:
            h = 4;
        }
        heights[i] = still ? h : lerp(heights[i], h, 0.3);
        const el = rays.current[i];
        if (el) {
          el.setAttribute('height', heights[i].toFixed(2));
          el.setAttribute('y', (100 - 64 - heights[i]).toFixed(2));
        }
      }

      // Eyes.
      const t = { sy: 1, dx: 0, dy: 0 };
      switch (m) {
        case 'idle':
          t.dx = pointer.x * 5;
          t.dy = pointer.y * 4;
          break;
        case 'connecting':
          t.dx = still ? 0 : Math.sin(now / 260) * 6;
          t.sy = 0.8;
          break;
        case 'listening':
          t.sy = 1.05;
          t.dx = pointer.x * 3;
          break;
        case 'user':
          // Leaning in: wider, a little up, pulsing with your voice.
          t.sy = 1.15 + (still ? 0 : lv * 0.18);
          t.dy = -2;
          break;
        case 'thinking':
          t.sy = 0.42;
          t.dx = 7;
          t.dy = -4 + (still ? 0 : Math.sin(now / 400) * 1.2);
          break;
        case 'greeting':
        case 'speaking':
          t.sy = 0.85 + (still ? 0 : lv * 0.35);
          t.dy = still ? 0 : -lv * 3;
          break;
        case 'muted':
          t.sy = 0.5;
          t.dy = 2;
          break;
        case 'ended':
          t.sy = 0.12;
          break;
      }
      if (!still && m !== 'ended') {
        if (now > nextBlink) {
          blinkUntil = now + 130;
          nextBlink = now + 2200 + Math.random() * 3800;
        }
        if (now < blinkUntil) t.sy = 0.08;
      }
      const k = still ? 1 : 0.22;
      eye.sy = lerp(eye.sy, t.sy, k);
      eye.dx = lerp(eye.dx, t.dx, k);
      eye.dy = lerp(eye.dy, t.dy, k);
      eyes.current.forEach((el, i) => {
        if (!el) return;
        const h = Math.max(2, EYE.h * eye.sy);
        el.setAttribute('x', (EYES[i] - EYE.w / 2 + eye.dx).toFixed(2));
        el.setAttribute('y', (EYE.y - h / 2 + eye.dy).toFixed(2));
        el.setAttribute('height', h.toFixed(2));
        el.setAttribute('rx', Math.min(EYE.r, h / 2).toFixed(2));
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  const rayFill =
    mode === 'speaking' || mode === 'greeting'
      ? 'fill-accent'
      : mode === 'user' || mode === 'listening'
        ? 'fill-muted'
        : 'fill-line2';
  const coreStroke =
    mode === 'speaking' || mode === 'thinking' || mode === 'greeting'
      ? 'stroke-accent'
      : mode === 'muted'
        ? 'stroke-warn'
        : 'stroke-line2';

  return (
    <div
      role="img"
      aria-label={label}
      className="relative aspect-square w-[clamp(200px,min(40vw,44dvh),400px)] flex-none"
    >
      <svg
        viewBox="0 0 200 200"
        aria-hidden="true"
        className="block size-full overflow-visible"
      >
        {(mode === 'speaking' || mode === 'greeting') && (
          <>
            <circle
              className="jd-ring stroke-accent"
              cx="100"
              cy="100"
              r="58"
              fill="none"
              strokeWidth="1"
            />
            <circle
              className="jd-ring stroke-accent [animation-delay:-1.1s]"
              cx="100"
              cy="100"
              r="58"
              fill="none"
              strokeWidth="1"
            />
          </>
        )}
        <g className={rayFill}>
          {LEN.map((l, i) => (
            <g
              key={i}
              transform={`rotate(${((i * 360) / N).toFixed(1)} 100 100)`}
            >
              <rect
                ref={(el) => {
                  rays.current[i] = el;
                }}
                x="99"
                y={100 - 64 - l * 0.35}
                width="2"
                height={l * 0.35}
              />
            </g>
          ))}
        </g>
        <circle
          className={`fill-panel ${coreStroke} ${mode === 'idle' || mode === 'connecting' ? 'jd-breathe' : ''}`}
          cx="100"
          cy="100"
          r="56"
          strokeWidth="1.2"
        />
        {mode === 'thinking' && (
          <circle
            className="jd-spin stroke-accent"
            cx="100"
            cy="100"
            r="62"
            fill="none"
            strokeWidth="1.2"
            strokeDasharray="6 10"
          />
        )}
        <path
          d="M92 34h-6v6M108 34h6v6M92 166h-6v-6M108 166h6v-6"
          fill="none"
          className="stroke-line2"
          strokeWidth="1"
        />
        <g className={mode === 'muted' ? 'fill-warn' : 'fill-accent'}>
          {EYES.map((cx, i) => (
            <rect
              key={cx}
              ref={(el) => {
                eyes.current[i] = el;
              }}
              x={cx - EYE.w / 2}
              y={EYE.y - EYE.h / 2}
              width={EYE.w}
              height={EYE.h}
              rx={EYE.r}
            />
          ))}
        </g>
      </svg>
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-[62%] text-center font-mono text-[clamp(16px,2.2vw,24px)] tracking-[0.02em] ${warn ? 'text-warn' : 'text-ink'}`}
      >
        {clock}
      </span>
    </div>
  );
}
