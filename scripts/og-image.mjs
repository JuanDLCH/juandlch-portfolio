// Renders the link preview images (Open Graph / Twitter card, 1200×630) with
// headless Chrome, from the HTML below, one per site mode and language
// (VARIANTS; the Worker picks one per page, see ogName in src/lab/media.ts):
// - src/assets/og/<mode>-<lang>.png: with src/assets/photo.png (the fallback
//   /media/og-<mode>-<lang>.jpg serves until a photo is uploaded from /admin);
// - src/assets/og/base-<mode>-<lang>.png: the same card with the photo slot
//   empty, and src/assets/og-slot.json: where the photo goes (the same in
//   every variant). The dashboard's photo editor draws the uploaded photo into
//   that slot (PhotoEditor.tsx).
// Regenerate after changing the copy below or the layout (a new photo needs
// no regeneration: upload it from /admin):
//   node scripts/og-image.mjs
// Needs Chrome/Chromium (set CHROME=... if it isn't found; else Firefox) and
// network access for the Geist font.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const which = (cmd) => {
  try {
    return execFileSync('which', [cmd]).toString().trim();
  } catch {
    return '';
  }
};
const chrome =
  process.env.CHROME ||
  which('google-chrome-stable') ||
  which('google-chrome') ||
  which('chromium');
const firefox = chrome ? '' : process.env.FIREFOX || which('firefox');
if (!chrome && !firefox)
  throw new Error('Chrome/Chromium or Firefox not found (set CHROME=...)');
// sharp comes with Astro (finds the photo slot in a rendered probe).
const sharp = createRequire(
  createRequire(import.meta.url).resolve('astro/package.json'),
)('sharp');

const photo = readFileSync(join(root, 'src/assets/photo.png')).toString(
  'base64',
);

// Waveform bars, like the hero's (deterministic heights).
const bars = Array.from({ length: 34 }, (_, i) => {
  const h =
    18 + Math.round(70 * Math.abs(Math.sin(i * 0.62) * Math.cos(i * 0.21)));
  return `<i style="height:${h}px"></i>`;
}).join('');

// The copy of each card. The role and the services call to action are read
// from src/i18n/content.ts (`sv` over the base copy in services mode), so they
// can't drift; the headlines are shortened from the hero by hand (keep them
// short: the photo slot must not move) and the chips are the card's own.
const { content } = await import('../src/i18n/content.ts');
const copy = (lang, mode) => {
  const x = content[lang].x;
  return mode === 'services' ? { ...x, ...x.sv } : x;
};
const VARIANTS = {
  'hire-en': {
    lang: 'en',
    h1: 'I build AI that <em>listens, reasons and acts</em> — inside real software.',
    role: copy('en', 'hire').role,
    chips: ['Agents', 'Realtime voice', 'Document AI', 'AWS'],
    live: 'Talk to my AI · live demos',
  },
  'hire-es': {
    lang: 'es',
    h1: 'Construyo IA que <em>escucha, razona y actúa</em> — dentro de software real.',
    role: copy('es', 'hire').role,
    chips: ['Agentes', 'Voz en tiempo real', 'IA documental'],
    live: 'Habla con mi IA · demos en vivo',
  },
  'services-en': {
    lang: 'en',
    h1: 'AI for your business that <em>answers, schedules and gets work done.</em>',
    role: copy('en', 'services').role,
    chips: ['Chatbots', 'Voice agents', 'Automation', 'Document AI'],
    live: `${copy('en', 'services').bookCallShort} · live demos`,
  },
  'services-es': {
    lang: 'es',
    h1: 'IA para tu negocio que <em>responde, agenda y resuelve.</em>',
    role: copy('es', 'services').role,
    chips: ['Chatbots', 'Agentes de voz', 'Automatización'],
    live: `${copy('es', 'services').bookCallShort} · demos en vivo`,
  },
};
const PLACE = 'Medellín, Antioquia · Colombia';

const html = (
  img,
  v,
) => `<!doctype html><html lang="${v.lang}"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    background: #0a0f1a;
    background-image: radial-gradient(#e6eef81a 1px, transparent 1px),
      radial-gradient(1200px 600px at 85% 40%, #6f98d42e, transparent 60%);
    background-size: 22px 22px, 100% 100%;
    color: #e6eef8; font-family: Geist, sans-serif;
    display: flex; padding: 64px 72px; gap: 56px;
  }
  .left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .mono { font-family: 'Geist Mono', monospace; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 22px;
    letter-spacing: .14em; color: #93a3bc; font-weight: 500; }
  .brand b { color: #6f98d4; font-weight: 500; letter-spacing: 0; }
  h1 { margin-top: 34px; font-size: 56px; line-height: 1.04; font-weight: 600;
    letter-spacing: -.025em; }
  h1 em { font-style: normal; color: #6f98d4; }
  .who { margin-top: 24px; font-size: 26px; line-height: 1.35; color: #b8c5d9; }
  .who b { color: #e6eef8; font-weight: 600; }
  .place { margin-top: 14px; display: flex; align-items: center; gap: 14px;
    font-size: 22px; color: #b8c5d9; }
  /* Colombia's flag: yellow half, blue and red quarters. */
  .flag { width: 36px; height: 24px; flex: none; outline: 1px solid #2c3a55;
    background: linear-gradient(#fcd116 50%, #003893 50% 75%, #ce1126 75%); }
  .chips { margin-top: auto; padding-top: 16px; display: flex; gap: 10px; white-space: nowrap; }
  .chips span { border: 1px solid #2c3a55; background: #0f1626; color: #c9d4e5;
    padding: 9px 15px; font-size: 19px; }
  .right { width: 380px; flex: none; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .photo { width: 380px; height: 380px; border: 1px solid #2c3a55; padding: 10px;
    background: #0f1626; position: relative; flex: none; }
  .photo img { width: 100%; height: 100%; object-fit: cover; display: block;
    filter: saturate(.9); }
  .photo::after { content: ''; position: absolute; left: -1px; top: -1px; width: 46px;
    height: 46px; border-left: 3px solid #6f98d4; border-top: 3px solid #6f98d4; }
  .live { display: flex; align-items: center; gap: 14px; font-size: 17px;
    white-space: nowrap; color: #93a3bc; }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: #7fc4a0;
    box-shadow: 0 0 0 5px #7fc4a02e; }
  .wave { display: flex; align-items: center; gap: 5px; height: 90px; }
  .wave i { display: block; width: 6px; background: #6f98d4; opacity: .85; border-radius: 3px; }
</style></head><body>
  <div class="left">
    <div class="brand mono"><b>&lt;/&gt;</b> JUANDLCH</div>
    <h1>${v.h1}</h1>
    <p class="who"><b>Juan Diego Londoño</b><br>${v.role}</p>
    <p class="place"><span class="flag"></span>${PLACE}</p>
    <div class="chips mono">${v.chips.map((c) => `<span>${c}</span>`).join('')}</div>
  </div>
  <div class="right">
    <div class="photo">${img}</div>
    <div class="wave">${bars}</div>
    <div class="live mono"><span class="dot"></span>${v.live}</div>
  </div>
</body></html>`;

const full = (v) => html(`<img src="data:image/png;base64,${photo}">`, v);
// The slot keeps its size with a hidden image, and reports where it is.
const base = (v) =>
  html(
    `<img style="visibility:hidden" src="data:image/png;base64,${photo}">`,
    v,
  );
// The slot painted magenta, to find where it is in the screenshot.
const probe = (v) =>
  html(
    `<i style="display:block;width:100%;height:100%;background:#f0f"></i>`,
    v,
  );

const dir = mkdtempSync(join(tmpdir(), 'og-'));
mkdirSync(join(dir, 'profile'));
const shot = (name, page) => {
  const file = join(dir, `${name}.html`);
  const out = join(dir, `${name}.png`);
  writeFileSync(file, page);
  const args = chrome
    ? [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        `--user-data-dir=${join(dir, 'profile')}`,
        '--force-device-scale-factor=1',
        '--window-size=1200,630',
        '--virtual-time-budget=5000',
        `--screenshot=${out}`,
        `file://${file}`,
      ]
    : [
        '--headless',
        '--no-remote',
        '--profile',
        join(dir, 'profile'),
        '--window-size=1200,630',
        '--screenshot',
        out,
        `file://${file}`,
      ];
  execFileSync(chrome || firefox, args, { stdio: 'ignore' });
  return out;
};
const save = (name, page) => {
  const out = join(root, `src/assets/og/${name}.png`);
  copyFileSync(shot(name, page), out);
  console.log(`✓ ${out}`);
};
// The bounding box of the magenta pixels.
const findSlot = async (png) => {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (data[i] > 240 && data[i + 1] < 15 && data[i + 2] > 240) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  if (x1 < 0) throw new Error('photo slot not found in the rendered page');
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

mkdirSync(join(root, 'src/assets/og'), { recursive: true });
try {
  const slots = [];
  for (const [key, v] of Object.entries(VARIANTS)) {
    save(key, full(v));
    save(`base-${key}`, base(v));
    slots.push(await findSlot(shot(`probe-${key}`, probe(v))));
  }
  const slot = JSON.stringify(slots[0]);
  if (slots.some((s) => JSON.stringify(s) !== slot))
    throw new Error(
      `the photo slot moves between variants: ${JSON.stringify(slots)}`,
    );
  const out = join(root, 'src/assets/og-slot.json');
  // Written as Prettier formats it.
  const { x, y, w, h } = slots[0];
  writeFileSync(out, `{ "x": ${x}, "y": ${y}, "w": ${w}, "h": ${h} }\n`);
  console.log(`✓ ${out} ${slot}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
