// Document intelligence: the visitor's Knowledge Base of PDFs and images,
// read in the browser (see kb.ts and pdf.ts, indexPdf) and searched here.
// Nothing is uploaded to the provider: the model reads the documents through
// the tools in tools.ts, passage by passage (images whole), and cites them by
// id so the viewer can highlight them.

/** A box on a page in PDF units: x, y (bottom, from the page's bottom edge),
 * width and height. One per line of a passage. */
export type Rect = [number, number, number, number];

export interface Chunk {
  page: number;
  /** Position of the passage on its page, from 1. */
  k: number;
  text: string;
  rects: Rect[];
}

export interface DocPage {
  /** Size at scale 1, in PDF units. */
  w: number;
  h: number;
  /** False for pages with no text layer (scans): they're read as images. */
  text: boolean;
  /** First line of text, as a page outline. */
  head: string;
}

/** What pdf.ts extracts from a PDF when it's attached. */
export interface DocIndex {
  pages: DocPage[];
  chunks: Chunk[];
}

/** A document of the Knowledge Base (ChatSession.docs). Images have one
 * page and no passages: the model looks at them with view_page. */
export interface Doc extends DocIndex {
  /** d1, d2… in the order they were added; never reused. */
  id: string;
  kind: 'pdf' | 'image';
  name: string;
  /** Media type of `data`. */
  type: string;
  /** The file, base64: for the viewer, the download and view_page (images
   * are stored downscaled). */
  data: string;
}

export const chunkId = (d: Doc, c: Chunk) => `${d.id}-p${c.page}-c${c.k}`;
export const pageId = (d: Doc, page: number) => `${d.id}-p${page}`;

/** A passage or a whole page from its id: d2-p5-c3 or d2-p5. */
export const parseRef = (id: string) => {
  const m = /^(d\d+)-p(\d+)(?:-c(\d+))?$/.exec(id);
  return m
    ? { doc: m[1], page: Number(m[2]), k: m[3] ? Number(m[3]) : null }
    : null;
};

/** Citation link of a passage or page. An absolute URL like the CV ones, so
 * the chat renders it as a link; a click opens the viewer instead. */
export const docLink = (origin: string, id: string) =>
  `${origin}/lab/chat#doc=${id}`;

/** Passage or page id from a citation link, or null if it isn't one. */
export const docLinkId = (href: string) => {
  if (typeof location === 'undefined') return null;
  try {
    const u = new URL(href);
    if (u.origin !== location.origin) return null;
    const id = /^#doc=([\w-]+)$/.exec(u.hash)?.[1];
    return id && parseRef(id) ? id : null;
  } catch {
    return null;
  }
};

export const sourceOf = (d: Doc, page: number, id: string) => {
  // Brackets would break the Markdown link the model writes.
  const name = d.name.replace(/[[\]()]/g, '');
  return {
    label: d.kind === 'image' ? name : `${name} · p. ${page}`,
    url: docLink(location.origin, id),
  };
};

const describe = (d: Doc) =>
  d.kind === 'image'
    ? `${d.id} "${d.name}" (image)`
    : `${d.id} "${d.name}" (PDF, ${d.pages.length} ${d.pages.length === 1 ? 'page' : 'pages'}${d.pages.some((p) => !p.text) ? ', some pages scanned' : ''})`;

/** What the model reads before every message: the Knowledge Base as it is
 * now, since the visitor can add and remove documents between turns. */
export const kbNote = (docs: Doc[]) =>
  `[Knowledge Base now: ${docs.map(describe).join('; ')}. Their content is not in this message: read them with the document tools. Documents not listed here were removed: do not use what you read from them before.]`;

// Search: BM25 over passages, with accents and case folded, a light plural
// stemmer and word pairs so phrases rank higher.
const STOP = new Set(
  'the a an and or of to in on for with by is are was were be been it its this that these those as at from not no but if then than so such which who whom what when where how all any each other into over under about de la el los las un una unos unas y o del al en con por para es son fue ser que se su sus lo le les mas pero si no como este esta estos estas ese esa cual cuando donde'.split(
    ' ',
  ),
);

const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Plural and singular reach the same token: parties/party → parti,
// notices/notice → notic, obligaciones/obligación → obligacion.
const stem = (w: string) => {
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}i`;
  else if (w.length > 4 && w.endsWith('y')) w = `${w.slice(0, -1)}i`;
  else if (w.length > 5 && /(ion|ad|or|al)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss'))
    w = w.slice(0, -1);
  return w.length > 3 && w.endsWith('e') ? w.slice(0, -1) : w;
};

export const tokens = (s: string) => {
  const words = (fold(s).match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w)))
    .map(stem);
  const pairs = words.slice(1).map((w, i) => `${words[i]}_${w}`);
  return [...words, ...pairs];
};

interface Indexed {
  tf: Map<string, number>[];
  len: number[];
}
const indexes = new WeakMap<Doc, Indexed>();
const indexOf = (d: Doc) => {
  let ix = indexes.get(d);
  if (!ix) {
    const tf = d.chunks.map((c) => {
      const m = new Map<string, number>();
      for (const t of tokens(c.text)) m.set(t, (m.get(t) ?? 0) + 1);
      return m;
    });
    ix = { tf, len: tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0)) };
    indexes.set(d, ix);
  }
  return ix;
};

/** The best passages for `query` across `docs`, best first. */
export function searchDocs(docs: Doc[], query: string, limit = 8) {
  const q = [...new Set(tokens(query))];
  const all = docs.flatMap((d) => {
    const ix = indexOf(d);
    return d.chunks.map((c, i) => ({ d, c, tf: ix.tf[i], len: ix.len[i] }));
  });
  if (!q.length || !all.length) return [];
  const avg = all.reduce((a, x) => a + x.len, 0) / all.length || 1;
  const df = new Map(
    q.map((t) => [t, all.filter((x) => x.tf.has(t)).length] as const),
  );
  const k1 = 1.2;
  const b = 0.75;
  return all
    .map((x) => {
      let score = 0;
      for (const t of q) {
        const f = x.tf.get(t);
        if (!f) continue;
        const n = df.get(t)!;
        const idf = Math.log(1 + (all.length - n + 0.5) / (n + 0.5));
        // Word pairs weigh more: they mean the phrase is there.
        const w = t.includes('_') ? 1.5 : 1;
        score +=
          (w * idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * x.len) / avg));
      }
      return { ...x, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, limit);
}

const EN = new Set(
  'the and of to in is that for with this be are by as on shall will which from or'.split(
    ' ',
  ),
);
const ES = new Set(
  'el la de que y en los del las por con para una se un es al como su lo'.split(
    ' ',
  ),
);
/** Rough language of a document, so the model searches in it. */
export const docLanguage = (d: Doc) => {
  const words = fold(d.chunks.map((c) => c.text).join(' ')).match(/\p{L}+/gu);
  if (!words?.length) return 'unknown';
  let en = 0;
  let es = 0;
  for (const w of words.slice(0, 5000)) {
    if (EN.has(w)) en++;
    if (ES.has(w)) es++;
  }
  const n = Math.min(words.length, 5000);
  if (Math.max(en, es) / n < 0.04) return 'unknown';
  return en > es ? 'English' : 'Spanish';
};
