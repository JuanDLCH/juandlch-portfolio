// A Knowledge Base document: PDFs rendered with pdf.js, with the passages an
// answer cites highlighted over the page; images shown whole, outlined when
// cited. Shown in the chat's document dialog when a document citation (or a
// Knowledge Base slot) is clicked.
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { parseRef, type Doc } from '../../lab/chat/docs';
import type { ChatCopy } from '../../i18n/chat';

type Box = { left: number; top: number; width: number; height: number };

export default function DocViewer({
  docs,
  ids,
  focus,
  x,
}: {
  docs: Doc[];
  /** Every passage or page the answer cites (d2-p5-c3, d2-p5). */
  ids: string[];
  /** The one clicked: its document and page open first. */
  focus: string;
  x: ChatCopy['docs'];
}) {
  const start = parseRef(focus);
  const [docId, setDocId] = useState(start?.doc ?? docs[0]?.id);
  const [page, setPage] = useState(start?.page ?? 1);
  // Undefined once removed from the Knowledge Base.
  const doc = docs.find((d) => d.id === docId);
  const refs = ids.flatMap((id) => {
    const r = parseRef(id);
    return r && r.doc === doc?.id ? [{ id, ...r }] : [];
  });
  const citedPages = [...new Set(refs.map((r) => r.page))].sort(
    (a, b) => a - b,
  );
  const citedDocs = docs.filter((d) =>
    ids.some((id) => parseRef(id)?.doc === d.id),
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  // Loaded document and drawn page, each tagged with what they belong to so
  // a switch never shows the previous one.
  const [loaded, setLoaded] = useState<{
    id: string;
    pdf: PDFDocumentProxy | null;
  } | null>(null);
  const [drawn, setDrawn] = useState<{
    key: string;
    w: number;
    h: number;
    boxes: (Box & { id: string })[];
  } | null>(null);
  const mine = loaded && doc && loaded.id === doc.id ? loaded : null;
  const pdf = mine?.pdf ?? null;
  const failed = !!mine && !mine.pdf;
  const viewKey = `${doc?.id}-${page}`;
  const view = drawn?.key === viewKey ? drawn : null;

  // The page is drawn at the width of the dialog.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.floor(e.contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One pdf.js document per open document, released on switch or close.
  useEffect(() => {
    if (!doc || doc.kind === 'image') return;
    let gone = false;
    let release = () => {};
    void (async () => {
      try {
        const { loadPdf, base64Bytes } = await import('../../lab/pdf');
        const { doc: p, destroy } = await loadPdf(base64Bytes(doc.data));
        if (gone) return destroy();
        release = destroy;
        setLoaded({ id: doc.id, pdf: p });
      } catch {
        if (!gone) setLoaded({ id: doc.id, pdf: null });
      }
    })();
    return () => {
      gone = true;
      release();
    };
  }, [doc]);

  // Draw the page, then place the highlights in the same coordinates.
  const refsKey = refs
    .filter((r) => r.page === page)
    .map((r) => r.id)
    .join(' ');
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdf || !doc || !canvas || !width) return;
    let task: { cancel: () => void } | null = null;
    let gone = false;
    void (async () => {
      try {
        const p = await pdf.getPage(page);
        if (gone) return;
        const base = p.getViewport({ scale: 1 });
        const vp = p.getViewport({ scale: width / base.width });
        const dpr = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.round(vp.width * dpr);
        canvas.height = Math.round(vp.height * dpr);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const render = p.render({
          canvasContext: ctx,
          canvas,
          viewport: vp,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        task = render;
        await render.promise;
        if (gone) return;
        const boxes = refsKey
          ? refsKey.split(' ').flatMap((id) => {
              const r = parseRef(id)!;
              // A cited page (scans, view_page) is outlined whole.
              if (r.k === null)
                return [
                  { id, left: 0, top: 0, width: vp.width, height: vp.height },
                ];
              const c = doc.chunks.find(
                (k) => k.page === r.page && k.k === r.k,
              );
              return (c?.rects ?? []).map(([rx, ry, rw, rh]) => {
                const [x1, y1] = vp.convertToViewportPoint(rx, ry) as number[];
                const [x2, y2] = vp.convertToViewportPoint(
                  rx + rw,
                  ry + rh,
                ) as number[];
                return {
                  id,
                  left: Math.min(x1, x2),
                  top: Math.min(y1, y2),
                  width: Math.abs(x2 - x1),
                  height: Math.abs(y2 - y1),
                };
              });
            })
          : [];
        setDrawn({ key: viewKey, w: vp.width, h: vp.height, boxes });
      } catch {
        // A cancelled render (page or size changed) throws; nothing to do.
      }
    })();
    return () => {
      gone = true;
      task?.cancel();
    };
  }, [pdf, doc, page, width, refsKey, viewKey]);

  // Bring the clicked passage into view once it's drawn.
  useEffect(() => {
    if (!view) return;
    wrapRef.current
      ?.querySelector('[data-focus]')
      ?.scrollIntoView({ block: 'center' });
  }, [view]);

  if (!doc)
    return (
      <div>
        <h2
          id="jd-doc-title"
          className="m-0 text-[clamp(18px,3.6svh,22px)] font-medium tracking-[-0.03em]"
        >
          {x.kbTag}
        </h2>
        <p className="text-muted m-0 mt-2 text-[13px]">{x.removed}</p>
      </div>
    );
  const image = doc.kind === 'image';
  const pages = doc.pages.length;
  const go = (n: number) => setPage(Math.min(Math.max(n, 1), pages));
  const nav =
    'border-line2 text-ink hover:border-accent mob:h-11 mob:min-w-11 inline-flex h-8 min-w-8 cursor-pointer items-center justify-center border bg-transparent px-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  // The file only lives in memory: build it when it's asked for.
  const download = () => {
    const bytes = Uint8Array.from(atob(doc.data), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: doc.type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h2
          id="jd-doc-title"
          className="m-0 truncate text-[clamp(18px,3.6svh,22px)] font-medium tracking-[-0.03em]"
        >
          {doc.name}
        </h2>
        {refs.length > 0 && (
          <p className="text-muted m-0 mt-1 text-[13px]">{x.note}</p>
        )}
      </div>
      {citedDocs.length > 1 && (
        <div
          role="group"
          aria-label={x.docs}
          className="flex flex-wrap gap-1.5"
        >
          {citedDocs.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={d.id === doc.id}
              onClick={() => {
                setDocId(d.id);
                const first = ids.map(parseRef).find((r) => r?.doc === d.id);
                setPage(first?.page ?? 1);
              }}
              className={`${nav} max-w-[220px] truncate ${d.id === doc.id ? 'border-accent text-accent' : ''}`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!image && (
          <>
            <button
              type="button"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              aria-label={x.prev}
              className={nav}
            >
              ‹
            </button>
            <span className="text-muted min-w-[88px] text-center font-mono text-[11px]">
              {x.pageOf
                .replace('{n}', `${page}`)
                .replace('{total}', `${pages}`)}
            </span>
            <button
              type="button"
              onClick={() => go(page + 1)}
              disabled={page >= pages}
              aria-label={x.next}
              className={nav}
            >
              ›
            </button>
            {citedPages.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5 pl-1">
                <span className="text-muted text-[11px]">{x.cited}</span>
                {citedPages.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={n === page}
                    onClick={() => go(n)}
                    className={`${nav} ${n === page ? 'border-accent text-accent' : ''}`}
                  >
                    {n}
                  </button>
                ))}
              </span>
            )}
          </>
        )}
        <button
          type="button"
          onClick={download}
          className={`${nav} ml-auto px-3`}
        >
          {x.download}
        </button>
      </div>
      <div className="bg-bg border-line2 min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto border">
        <div ref={wrapRef} className="relative w-full">
          {image ? (
            <>
              <img
                src={`data:${doc.type};base64,${doc.data}`}
                alt={doc.name}
                className="block h-auto w-full"
              />
              {refs.length > 0 && (
                <span
                  aria-hidden="true"
                  data-focus=""
                  className="border-accent bg-accent/10 pointer-events-none absolute inset-0 border-[3px]"
                />
              )}
            </>
          ) : failed ? (
            <p className="text-muted m-0 p-6 text-[13px]">{x.failed}</p>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`${doc.name}, ${x.pageOf.replace('{n}', `${page}`).replace('{total}', `${pages}`)}`}
                className="block h-auto w-full"
                style={
                  view
                    ? { aspectRatio: `${view.w} / ${view.h}` }
                    : {
                        aspectRatio: `${doc.pages[page - 1]?.w ?? 612} / ${doc.pages[page - 1]?.h ?? 792}`,
                      }
                }
              />
              {view?.boxes.map((b, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  data-focus={b.id === focus ? '' : undefined}
                  className={`pointer-events-none absolute mix-blend-multiply ${b.id === focus ? 'bg-accent/35' : 'bg-accent/20'}`}
                  style={{
                    left: b.left - 2,
                    top: b.top,
                    width: b.width + 4,
                    height: b.height,
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
