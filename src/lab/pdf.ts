// PDFs in the browser, with pdf.js (loaded on the first PDF, in the browser
// only, parsing in its own worker). Two uses: page images for cases that
// read documents page by page (ChatCase.pdf), and text with positions for
// the document agent (ChatCase.docs), which also renders pages on demand.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { Chunk, DocIndex, DocPage, Rect } from './chat/docs';

/** Longest side of a rendered page, in pixels: enough to read an invoice. */
const MAX_SIDE = 1400;

export class PdfError extends Error {
  constructor(
    readonly code: 'pdfPages' | 'pdfUnreadable',
    readonly pages = 0,
  ) {
    super(code);
  }
}

/** Opens a PDF (pdf.js takes the buffer, so pass a copy you don't need).
 * Throws PdfError when it can't be read or has more than `maxPages` pages. */
export async function loadPdf(data: ArrayBuffer | Uint8Array, maxPages = 0) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    // Damaged, password protected or not a PDF at all.
    throw new PdfError('pdfUnreadable');
  }
  if (maxPages && doc.numPages > maxPages) {
    void task.destroy();
    throw new PdfError('pdfPages', doc.numPages);
  }
  return { doc, destroy: () => void task.destroy() };
}

/** Draws a page on a new canvas, `maxSide` pixels on its longest side. */
export async function renderPage(page: PDFPageProxy, maxSide = MAX_SIDE) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({
    scale: maxSide / Math.max(base.width, base.height),
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  // White behind transparent pages.
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  return { canvas, viewport };
}

const jpeg = (canvas: HTMLCanvasElement) => {
  const url = canvas.toDataURL('image/jpeg', 0.8);
  return url.slice(url.indexOf(',') + 1);
};

/** Renders every page as a JPEG (base64, no data: prefix). Throws PdfError
 * when the file can't be read or has more than `maxPages` pages, before
 * rendering anything. */
export async function pdfPages(file: File, maxPages: number) {
  const { doc, destroy } = await loadPdf(await file.arrayBuffer(), maxPages);
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      pages.push(jpeg((await renderPage(page)).canvas));
      page.cleanup();
    }
    return pages;
  } catch {
    throw new PdfError('pdfUnreadable');
  } finally {
    destroy();
  }
}

/** One page of a PDF (base64) as a JPEG, base64. */
export async function pageJpeg(data: string, n: number) {
  const { doc, destroy } = await loadPdf(base64Bytes(data));
  try {
    const page = await doc.getPage(n);
    return jpeg((await renderPage(page)).canvas);
  } finally {
    destroy();
  }
}

export const base64Bytes = (b64: string) =>
  Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

// Passages: lines grouped into paragraphs, paragraphs into passages of about
// this many characters; a passage never spans two pages.
const MIN_CHARS = 600;
const MAX_CHARS = 1000;

interface Line {
  text: string;
  x0: number;
  x1: number;
  /** Baseline. */
  y: number;
  h: number;
}

/** Lines of a page from its text items, in content order. */
function linesOf(
  items: {
    str: string;
    transform: number[];
    width: number;
    height: number;
    hasEOL: boolean;
  }[],
) {
  const lines: Line[] = [];
  let cur: Line | null = null;
  let eol = false;
  for (const it of items) {
    const x = it.transform[4];
    const y = it.transform[5];
    // Font size: the item's height, or the matrix scale for empty heights.
    const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 10;
    if (!it.str) {
      if (it.hasEOL) eol = true;
      continue;
    }
    const sameLine =
      cur && !eol && Math.abs(y - cur.y) < Math.max(h, cur.h) * 0.5;
    if (!cur || !sameLine) {
      if (cur && cur.text.trim()) lines.push(cur);
      cur = { text: it.str, x0: x, x1: x + it.width, y, h };
    } else {
      // A visible gap between items is a space the PDF didn't encode; so is
      // a jump back to the left (text drawn out of order on the line).
      const gap = x - cur.x1;
      const space =
        (gap > h * 0.15 || gap < -h) &&
        !cur.text.endsWith(' ') &&
        !it.str.startsWith(' ');
      cur.text += (space ? ' ' : '') + it.str;
      cur.x0 = Math.min(cur.x0, x);
      cur.x1 = Math.max(cur.x1, x + it.width);
      cur.h = Math.max(cur.h, h);
    }
    eol = it.hasEOL;
  }
  if (cur && cur.text.trim()) lines.push(cur);
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }));
}

/** Paragraphs: a new one after a wide vertical gap, or when the text jumps
 * up (next column) or far sideways. */
function paragraphsOf(lines: Line[]) {
  const paras: Line[][] = [];
  let cur: Line[] = [];
  for (const l of lines) {
    const prev = cur.at(-1);
    const gap = prev ? prev.y - l.y : 0;
    const broken =
      prev &&
      (gap > Math.max(prev.h, l.h) * 1.8 ||
        gap < -prev.h * 0.5 ||
        Math.abs(l.x0 - prev.x0) > (prev.x1 - prev.x0) * 0.6);
    if (broken) {
      paras.push(cur);
      cur = [];
    }
    cur.push(l);
  }
  if (cur.length) paras.push(cur);
  return paras;
}

const joinLines = (lines: Line[]) =>
  lines.reduce((s, l) => {
    if (!s) return l.text;
    // A word hyphenated across lines is joined back.
    if (/\p{L}-$/u.test(s) && /^\p{Ll}/u.test(l.text))
      return s.slice(0, -1) + l.text;
    return `${s} ${l.text}`;
  }, '');

const rectOf = (l: Line): Rect => [
  l.x0,
  l.y - l.h * 0.25,
  l.x1 - l.x0,
  l.h * 1.2,
];

/** Passages of a page, `page` counted from 1. */
function chunksOf(lines: Line[], page: number) {
  const chunks: Chunk[] = [];
  let buf: Line[] = [];
  const flush = () => {
    if (!buf.length) return;
    chunks.push({
      page,
      k: chunks.length + 1,
      text: joinLines(buf),
      rects: buf.map(rectOf),
    });
    buf = [];
  };
  const size = () => buf.reduce((n, l) => n + l.text.length + 1, 0);
  for (const para of paragraphsOf(lines)) {
    const paraSize = para.reduce((n, l) => n + l.text.length + 1, 0);
    // Start a new passage rather than let this paragraph push it too far.
    if (buf.length && size() + paraSize > MAX_CHARS && size() >= MIN_CHARS / 2)
      flush();
    for (const l of para) {
      buf.push(l);
      if (size() >= MAX_CHARS) flush();
    }
    if (size() >= MIN_CHARS) flush();
  }
  flush();
  return chunks;
}

/** A page's outline line: its first heading (numbered, or a short line in
 * capitals), else its first line. */
const headOf = (lines: Line[]) =>
  (
    lines.find(
      (l) =>
        /^(\d+(\.\d+)*\.?|[IVX]+\.|article|section|cl[aá]usula|art[ií]culo|cap[ií]tulo|chapter)\s/i.test(
          l.text,
        ) ||
        (l.text.length < 80 &&
          /\p{Lu}{3}/u.test(l.text) &&
          l.text === l.text.toUpperCase()),
    ) ?? lines[0]
  ).text;

/** Text of every page as passages with their boxes, for the document agent.
 * Throws PdfError like pdfPages. Renders nothing. */
export async function indexPdf(
  file: File | ArrayBuffer,
  maxPages: number,
): Promise<DocIndex> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const { doc, destroy } = await loadPdf(data, maxPages);
  try {
    const pages: DocPage[] = [];
    const chunks: Chunk[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const lines = linesOf(
        content.items.flatMap((it) => ('str' in it ? [it] : [])),
      );
      const text =
        lines.reduce((a, l) => a + l.text.replace(/\s/g, '').length, 0) > 20;
      pages.push({
        w: vp.width,
        h: vp.height,
        text,
        head: text ? headOf(lines).slice(0, 120) : '',
      });
      if (text) chunks.push(...chunksOf(lines, n));
      page.cleanup();
    }
    return { pages, chunks };
  } catch (e) {
    if (e instanceof PdfError) throw e;
    throw new PdfError('pdfUnreadable');
  } finally {
    destroy();
  }
}
