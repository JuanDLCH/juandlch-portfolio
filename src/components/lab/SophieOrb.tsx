// Sophie's orb, from the Voice board of the design canvas: 60 radial rays
// around a core, pulsing rings while she speaks and a dashed ring that spins
// while she thinks, plus her face inside the core. Everything moves by rAF
// writing SVG attributes, so the audio level never re-renders React.
//
// The face is two capsule eyes drawn as paths, so they can change shape:
// a smile turns them into ^ ^ crescents, a tilt makes them sad, a squint
// narrows one. Each state has a base expression (idle follows the pointer,
// looks around on its own and gets sleepy; listening leans in and nods;
// thinking looks up and aside; speaking bounces and tilts), and gestures
// play on top for a moment (a wink for the greeting, reading eyes for a
// tool, joy and sparkles for contact, surprise when interrupted, a glance
// at the clock). With reduced motion only the shape per state remains.
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
  | 'ended'
  | 'sad';

/** A moment of expression on top of the state's. `id` replays it. */
export type Gesture = {
  kind: 'wink' | 'happy' | 'contact' | 'surprise' | 'scan' | 'clock';
  id: number;
};

const GESTURE_MS: Record<Gesture['kind'], number> = {
  wink: 650,
  happy: 1600,
  contact: 3200,
  surprise: 700,
  scan: 1300,
  clock: 1400,
};

const N = 60;
// Ray lengths, as in the board: a fixed irregular crown.
const LEN = Array.from({ length: N }, (_, i) => {
  const wob = 0.45 + 0.55 * Math.abs(Math.sin(i * 1.9) * Math.cos(i * 0.7));
  return 6 + 26 * wob;
});
// Face inside the core (r = 56 around 100,100).
const EYE_X = [86, 114];
const EYE_Y = 93;
const EYE = { w: 12, h: 30 };
// Sparkles that pop around the face when she's delighted.
const SPARKS = [
  { x: 68, y: 70, s: 1 },
  { x: 133, y: 66, s: 0.75 },
];

/** One eye's shape and place, relative to its rest position. */
interface Eye {
  /** Width and height scale. */
  w: number;
  h: number;
  /** 0: capsule; 1: a ^ crescent (a smiling, closed eye). */
  smile: number;
  /** Degrees; positive turns clockwise. */
  rot: number;
  dx: number;
  dy: number;
}
const eye = (o: Partial<Eye> = {}): Eye => ({
  w: 1,
  h: 1,
  smile: 0,
  rot: 0,
  dx: 0,
  dy: 0,
  ...o,
});

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Eye, b: Eye, t: number): Eye => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  smile: lerp(a.smile, b.smile, t),
  rot: lerp(a.rot, b.rot, t),
  dx: lerp(a.dx, b.dx, t),
  dy: lerp(a.dy, b.dy, t),
});
/** 0 → 1 → 0 over a gesture, with soft edges. */
const envelope = (p: number, edge = 0.18) =>
  p <= 0 || p >= 1 ? 0 : Math.min(1, p / edge, (1 - p) / edge);

/** A capsule of w × h centered on 0,0 whose bottom edge rises with
 * `smile` until it's a thin crescent under the top edge. */
function eyePath(w: number, h: number, smile: number) {
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const r = Math.min(w / 2, h / 2);
  const k = r * 0.55;
  // Top edge: a rounded cap. Its peak, for the crescent's thickness.
  const topC = y0 - k * 0.6;
  const topPeak = 0.25 * (y0 + r) + 0.75 * topC;
  const rest = y1 + k * 0.6;
  const happy = (topPeak + Math.max(2.6, h * 0.22) - 0.25 * (y1 - r)) / 0.75;
  const botC = lerp(rest, happy, smile);
  const f = (n: number) => n.toFixed(2);
  return [
    `M${f(x0)} ${f(y0 + r)}`,
    `C${f(x0)} ${f(topC)} ${f(x1)} ${f(topC)} ${f(x1)} ${f(y0 + r)}`,
    `L${f(x1)} ${f(y1 - r)}`,
    `C${f(x1)} ${f(botC)} ${f(x0)} ${f(botC)} ${f(x0)} ${f(y1 - r)}`,
    'Z',
  ].join('');
}

/** The face each state rests in. `t` is the time, `lv` the voice level,
 * `look` where the eyes point (−1…1). */
function baseFace(
  m: OrbMode,
  t: number,
  lv: number,
  look: { x: number; y: number },
  sleepy: number,
): [Eye, Eye] {
  switch (m) {
    case 'idle': {
      const e = eye({
        dx: look.x * 6,
        dy: look.y * 5 + sleepy * 3,
        h: lerp(1, 0.28, sleepy),
      });
      return [e, e];
    }
    case 'connecting': {
      const e = eye({ h: 0.8, dx: Math.sin(t / 260) * 6 });
      return [e, e];
    }
    case 'listening': {
      const e = eye({ h: 1.04, dx: look.x * 3, dy: look.y * 2 });
      return [e, e];
    }
    case 'user': {
      // Leaning in: wider, up a little, nodding with the visitor's voice.
      const e = eye({ h: 1.12 + lv * 0.12, w: 1.08, dy: -2 + lv * 4 });
      return [e, e];
    }
    case 'thinking': {
      // Up and aside, one eye narrowed, the gaze wandering as she ponders.
      const wander = Math.sin(t / 900) * 3;
      return [
        eye({ h: 0.78, dx: 6 + wander, dy: -6, rot: -4 }),
        eye({ h: 0.6, dx: 6 + wander, dy: -6, rot: -4 }),
      ];
    }
    case 'greeting':
    case 'speaking': {
      const e = eye({ h: 0.9 + lv * 0.28, dy: -lv * 4, smile: 0.12 });
      return [e, e];
    }
    case 'muted': {
      const e = eye({ h: 0.5, dy: 4 });
      return [e, e];
    }
    case 'ended':
      // Closed, content: ^ ^.
      return [
        eye({ h: 0.5, smile: 1, w: 1.15 }),
        eye({ h: 0.5, smile: 1, w: 1.15 }),
      ];
    case 'sad':
      // Inner corners up, looking down.
      return [
        eye({ h: 0.7, rot: -16, dy: 4, dx: -1 }),
        eye({ h: 0.7, rot: 16, dy: 4, dx: 1 }),
      ];
  }
}

/** A gesture's face at progress p (0…1), and its sway (bounce, sparkles). */
function gestureFace(
  g: Gesture['kind'],
  p: number,
): { face: [Eye, Eye]; jump: number; spark: number } {
  const none = { jump: 0, spark: 0 };
  switch (g) {
    case 'wink':
      return {
        face: [eye({ smile: 0.15 }), eye({ h: 0.45, smile: 1, w: 1.15 })],
        ...none,
      };
    case 'happy': {
      const e = eye({ h: 0.55, smile: 1, w: 1.15 });
      return { face: [e, e], jump: Math.sin(p * Math.PI * 3) * 3, spark: 0 };
    }
    case 'contact': {
      // A quick look at the buttons, then joy: ^ ^, a hop and sparkles.
      if (p < 0.18) {
        const e = eye({ dy: 7, dx: -2, h: 0.85 });
        return { face: [e, e], ...none };
      }
      const e = eye({ h: 0.55, smile: 1, w: 1.18 });
      const q = (p - 0.18) / 0.82;
      return {
        face: [e, e],
        jump: Math.abs(Math.sin(q * Math.PI * 4)) * -4 * (1 - q),
        spark: Math.min(1, q * 5) * (1 - Math.max(0, q - 0.7) / 0.3),
      };
    }
    case 'surprise': {
      const e = eye({ h: 1.25, w: 1.18, dy: -3 });
      return { face: [e, e], ...none };
    }
    case 'scan': {
      // Reading: the eyes sweep side to side.
      const e = eye({ h: 0.7, dx: Math.sin(p * Math.PI * 6) * 7, dy: 2 });
      return { face: [e, e], ...none };
    }
    case 'clock': {
      // A glance down at the countdown.
      const e = eye({ h: 0.85, dy: 9 });
      return { face: [e, e], ...none };
    }
  }
}

export default function SophieOrb({
  mode,
  level,
  gesture,
  clock,
  warn,
  label,
}: {
  mode: OrbMode;
  /** Current audio level, 0–1: Sophie's voice or the visitor's mic. */
  level: () => number;
  gesture: Gesture | null;
  /** Shown in the core, under the eyes. */
  clock: string;
  /** The clock turns to the warning color (the call is about to end). */
  warn: boolean;
  /** Accessible name: what Sophie is doing. */
  label: string;
}) {
  const rays = useRef<(SVGRectElement | null)[]>([]);
  const eyes = useRef<(SVGPathElement | null)[]>([]);
  const face = useRef<SVGGElement>(null);
  const sparks = useRef<(SVGPathElement | null)[]>([]);
  const modeRef = useRef(mode);
  const levelRef = useRef(level);
  const gestureRef = useRef<{ g: Gesture; at: number } | null>(null);
  const lastGesture = useRef<number | null>(null);
  useEffect(() => {
    modeRef.current = mode;
    levelRef.current = level;
    if (gesture && gesture.id !== lastGesture.current) {
      lastGesture.current = gesture.id;
      gestureRef.current = { g: gesture, at: performance.now() };
    }
  });

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: 0, y: 0, at: performance.now() };
    let woke = false;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      // Moving after a long still spell wakes her up with a start.
      if (now - pointer.at > 25_000 && modeRef.current === 'idle') woke = true;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      pointer.at = now;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const heights = LEN.map((l) => l * 0.35);
    const cur: [Eye, Eye] = [eye(), eye()];
    // Where she looks on her own when the pointer is still.
    const gaze = { x: 0, y: 0, next: performance.now() + 3000 };
    let sleepy = 0;
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
          case 'sad':
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

      // Where to look: the pointer while it moves, her own glances after.
      const idleFor = now - pointer.at;
      if (now > gaze.next) {
        gaze.x = (Math.random() * 2 - 1) * 0.9;
        gaze.y = (Math.random() * 2 - 1) * 0.6;
        gaze.next = now + 1800 + Math.random() * 2800;
      }
      const look = idleFor < 3000 || still ? pointer : { x: gaze.x, y: gaze.y };
      sleepy =
        m === 'idle' && !still && idleFor > 25_000
          ? Math.min(1, sleepy + 0.004)
          : Math.max(0, sleepy - 0.08);
      if (woke) {
        woke = false;
        gestureRef.current = {
          g: { kind: 'surprise', id: -1 },
          at: now,
        };
      }

      // Face: the state's, then the gesture on top.
      let target = baseFace(m, now, still ? 0 : lv, look, sleepy);
      let jump = 0;
      let spark = 0;
      const g = gestureRef.current;
      if (g && !still) {
        const p = (now - g.at) / GESTURE_MS[g.g.kind];
        if (p >= 1) gestureRef.current = null;
        else {
          const gf = gestureFace(g.g.kind, p);
          const k = envelope(p, g.g.kind === 'wink' ? 0.3 : 0.15);
          target = [
            mix(target[0], gf.face[0], k),
            mix(target[1], gf.face[1], k),
          ];
          jump = gf.jump * k;
          spark = gf.spark;
        }
      }
      // Blinks, unless the eyes are closed or smiling.
      if (!still && m !== 'ended' && m !== 'sad' && target[0].smile < 0.5) {
        if (now > nextBlink) {
          blinkUntil = now + 130;
          nextBlink = now + 2200 + Math.random() * 3800;
          // Now and then, a double blink.
          if (Math.random() < 0.2) nextBlink = now + 320;
        }
        if (now < blinkUntil)
          target = [
            { ...target[0], h: 0.08 },
            { ...target[1], h: 0.08 },
          ];
      }
      const k = still ? 1 : 0.24;
      cur[0] = mix(cur[0], target[0], k);
      cur[1] = mix(cur[1], target[1], k);
      eyes.current.forEach((el, i) => {
        if (!el) return;
        const e = cur[i];
        const w = EYE.w * e.w;
        const h = Math.max(2, EYE.h * e.h);
        el.setAttribute('d', eyePath(w, h, e.smile));
        el.setAttribute(
          'transform',
          `translate(${(EYE_X[i] + e.dx).toFixed(2)} ${(EYE_Y + e.dy).toFixed(2)}) rotate(${e.rot.toFixed(2)})`,
        );
      });
      // The whole face tilts with her voice and hops with joy.
      const tilt =
        !still && (m === 'speaking' || m === 'greeting')
          ? Math.sin(now / 700) * 3 * (0.4 + lv)
          : 0;
      face.current?.setAttribute(
        'transform',
        `translate(0 ${jump.toFixed(2)}) rotate(${tilt.toFixed(2)} 100 100)`,
      );
      sparks.current.forEach((el, i) => {
        if (!el) return;
        const sp = SPARKS[i];
        const sc = spark * sp.s * (1 + 0.15 * Math.sin(now / 90 + i));
        el.setAttribute(
          'transform',
          `translate(${sp.x} ${sp.y}) rotate(${(now / 12 + i * 40) % 360}) scale(${sc.toFixed(3)})`,
        );
        el.setAttribute('opacity', spark.toFixed(2));
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
      : mode === 'muted' || mode === 'sad'
        ? 'stroke-warn'
        : 'stroke-line2';

  return (
    <div
      role="img"
      aria-label={label}
      className="relative aspect-square h-full max-h-[460px] max-w-full"
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
        <g ref={face}>
          <g
            className={
              mode === 'muted' || mode === 'sad' ? 'fill-warn' : 'fill-accent'
            }
          >
            {EYE_X.map((cx, i) => (
              <path
                key={cx}
                ref={(el) => {
                  eyes.current[i] = el;
                }}
                transform={`translate(${cx} ${EYE_Y})`}
                d={eyePath(EYE.w, EYE.h, 0)}
              />
            ))}
          </g>
          <g className="fill-accent">
            {SPARKS.map((sp, i) => (
              <path
                key={i}
                ref={(el) => {
                  sparks.current[i] = el;
                }}
                opacity="0"
                transform={`translate(${sp.x} ${sp.y}) scale(0)`}
                d="M0 -6C1 -1 1 -1 6 0C1 1 1 1 0 6C-1 1 -1 1 -6 0C-1 -1 -1 -1 0 -6Z"
              />
            ))}
          </g>
        </g>
      </svg>
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-[66%] text-center font-mono text-[clamp(10px,1vw,12px)] tracking-[0.14em] ${warn ? 'text-warn' : 'text-muted'}`}
      >
        {clock}
      </span>
    </div>
  );
}
