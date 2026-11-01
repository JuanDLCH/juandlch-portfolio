// Renders the link preview image (Open Graph / Twitter card, 1200×630) to
// src/assets/og.png with headless Chrome, from the HTML below. Regenerate
// after changing the headline, the role or the photo:
//   node scripts/og-image.mjs
// Needs Chrome/Chromium (set CHROME=... if it isn't found) and network access
// for the Geist font.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
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
if (!chrome) throw new Error('Chrome/Chromium not found (set CHROME=...)');

const photo = readFileSync(join(root, 'src/assets/photo.png')).toString(
  'base64',
);

// Waveform bars, like the hero's (deterministic heights).
const bars = Array.from({ length: 34 }, (_, i) => {
  const h =
    18 + Math.round(70 * Math.abs(Math.sin(i * 0.62) * Math.cos(i * 0.21)));
  return `<i style="height:${h}px"></i>`;
}).join('');

const html = `<!doctype html><html><head><meta charset="utf-8">
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
  .left { flex: 1; display: flex; flex-direction: column; }
  .mono { font-family: 'Geist Mono', monospace; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 22px;
    letter-spacing: .14em; color: #93a3bc; font-weight: 500; }
  .brand b { color: #6f98d4; font-weight: 500; letter-spacing: 0; }
  h1 { margin-top: 38px; font-size: 62px; line-height: 1.04; font-weight: 600;
    letter-spacing: -.025em; }
  h1 em { font-style: normal; color: #6f98d4; }
  .who { margin-top: 28px; font-size: 27px; line-height: 1.35; color: #b8c5d9; }
  .who b { color: #e6eef8; font-weight: 600; }
  .chips { margin-top: auto; display: flex; gap: 10px; flex-wrap: wrap; }
  .chips span { border: 1px solid #2c3a55; background: #0f1626; color: #c9d4e5;
    padding: 9px 15px; font-size: 19px; }
  .right { width: 380px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .photo { width: 380px; height: 380px; border: 1px solid #2c3a55; padding: 10px;
    background: #0f1626; position: relative; }
  .photo img { width: 100%; height: 100%; object-fit: cover; display: block;
    filter: saturate(.9); }
  .photo::after { content: ''; position: absolute; left: -1px; top: -1px; width: 46px;
    height: 46px; border-left: 3px solid #6f98d4; border-top: 3px solid #6f98d4; }
  .live { display: flex; align-items: center; gap: 14px; font-size: 19px; color: #93a3bc; }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: #7fc4a0;
    box-shadow: 0 0 0 5px #7fc4a02e; }
  .wave { display: flex; align-items: center; gap: 5px; height: 90px; }
  .wave i { display: block; width: 6px; background: #6f98d4; opacity: .85; border-radius: 3px; }
</style></head><body>
  <div class="left">
    <div class="brand mono"><b>&lt;/&gt;</b> JUANDLCH</div>
    <h1>I build AI that <em>listens, reasons and acts</em> — inside real software.</h1>
    <p class="who"><b>Juan Diego Londoño</b><br>AI Engineer · Solutions Architect</p>
    <div class="chips mono"><span>Agents</span><span>Realtime voice</span><span>Document AI</span><span>AWS</span></div>
  </div>
  <div class="right">
    <div class="photo"><img src="data:image/png;base64,${photo}"></div>
    <div class="wave">${bars}</div>
    <div class="live mono"><span class="dot"></span>Talk to my AI · live demos</div>
  </div>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'og-'));
try {
  const page = join(dir, 'og.html');
  const shot = join(dir, 'og.png');
  writeFileSync(page, html);
  execFileSync(
    chrome,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--user-data-dir=${join(dir, 'profile')}`,
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      '--virtual-time-budget=5000',
      `--screenshot=${shot}`,
      `file://${page}`,
    ],
    { stdio: 'ignore' },
  );
  const out = join(root, 'src/assets/og.png');
  copyFileSync(shot, out);
  console.log(`✓ ${out}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
