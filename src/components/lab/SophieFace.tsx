// Sophie's face: two eyes and a level meter, animated outside React (rAF
// writing SVG attributes), so the audio level never re-renders the page.
// The eyes follow the pointer while idle, widen while you talk, narrow and
// glance aside while she thinks, and bounce with her voice. With reduced
// motion they only change shape between states.
import { useEffect, useRef } from 'react';

export type FaceMode =
  | 'idle'
  | 'greeting'
  | 'connecting'
  | 'listening'
  | 'user'
  | 'thinking'
  | 'speaking'
  | 'ended';

const BARS = 28;
// Eye centers and size in the 200×120 viewBox.
const EYES = [70, 130];
const EYE = { w: 30, h: 44, r: 11, y: 58 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function SophieFace({
  mode,
  level,
}: {
  mode: FaceMode;
  /** Current audio level, 0–1: Sophie's voice or the visitor's mic. */
  level: () => number;
}) {
  const eyeRefs = useRef<(SVGRectElement | null)[]>([]);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
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

    const cur = { sy: 1, dx: 0, dy: 0 };
    const meter = new Array<number>(BARS).fill(0);
    let nextBlink = performance.now() + 2500;
    let blinkUntil = 0;
    let frame = 0;
    const tick = (now: number) => {
      const m = modeRef.current;
      const still = reduced.matches;
      // Voice level; the recorded greeting has no live meter, so it gets a
      // made-up talking rhythm.
      const lv =
        m === 'greeting'
          ? still
            ? 0
            : 0.35 +
              0.3 * Math.sin(now / 90) * Math.sin(now / 230) +
              0.15 * Math.sin(now / 37)
          : Math.min(1, levelRef.current() * 2.2);
      const t = { sy: 1, dx: 0, dy: 0 };
      switch (m) {
        case 'idle':
          t.dx = pointer.x * 7;
          t.dy = pointer.y * 5;
          break;
        case 'connecting':
          t.dx = still ? 0 : Math.sin(now / 260) * 8;
          t.sy = 0.8;
          break;
        case 'listening':
          t.sy = 1.05;
          t.dx = pointer.x * 4;
          break;
        case 'user':
          // Leaning in: wider, a little up, pulsing with your voice.
          t.sy = 1.15 + (still ? 0 : lv * 0.2);
          t.dy = -3;
          break;
        case 'thinking':
          t.sy = 0.45;
          t.dx = 9;
          t.dy = -5 + (still ? 0 : Math.sin(now / 400) * 1.5);
          break;
        case 'greeting':
        case 'speaking':
          t.sy = 0.85 + (still ? 0 : lv * 0.4);
          t.dy = still ? 0 : -lv * 4;
          break;
        case 'ended':
          t.sy = 0.12;
          break;
      }
      // Blinks, except with closed eyes or reduced motion.
      if (!still && m !== 'ended') {
        if (now > nextBlink) {
          blinkUntil = now + 130;
          nextBlink = now + 2200 + Math.random() * 3800;
        }
        if (now < blinkUntil) t.sy = 0.08;
      }
      const k = still ? 1 : 0.22;
      cur.sy = lerp(cur.sy, t.sy, k);
      cur.dx = lerp(cur.dx, t.dx, k);
      cur.dy = lerp(cur.dy, t.dy, k);
      eyeRefs.current.forEach((el, i) => {
        if (!el) return;
        const h = Math.max(3, EYE.h * cur.sy);
        el.setAttribute('x', String(EYES[i] - EYE.w / 2 + cur.dx));
        el.setAttribute('y', String(EYE.y - h / 2 + cur.dy));
        el.setAttribute('height', String(h));
        el.setAttribute('rx', String(Math.min(EYE.r, h / 2)));
      });
      // Meter: the newest level enters at the center and moves outwards.
      const talking = m === 'speaking' || m === 'greeting' || m === 'user';
      for (let i = 0; i < BARS / 2 - 1; i++) {
        meter[i] = meter[i + 1];
        meter[BARS - 1 - i] = meter[BARS - 2 - i];
      }
      const v = talking && !still ? lv : 0;
      meter[BARS / 2 - 1] = meter[BARS / 2] = v;
      barRefs.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleY(${0.08 + meter[i] * 0.92})`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <div aria-hidden="true" className="flex w-full flex-col items-center">
      <svg
        viewBox="0 0 200 120"
        className="h-auto w-[clamp(180px,34svh,300px)] max-w-full"
      >
        {EYES.map((cx, i) => (
          <rect
            key={cx}
            ref={(el) => {
              eyeRefs.current[i] = el;
            }}
            x={cx - EYE.w / 2}
            y={EYE.y - EYE.h / 2}
            width={EYE.w}
            height={EYE.h}
            rx={EYE.r}
            className="fill-accent"
          />
        ))}
      </svg>
      <div className="mt-[clamp(6px,2svh,18px)] flex h-[clamp(22px,5svh,40px)] items-center gap-[3px]">
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className="bg-accent h-full w-[3px] origin-center opacity-80"
            style={{ transform: 'scaleY(0.08)' }}
          />
        ))}
      </div>
    </div>
  );
}
