// The profile photo editor (dashboard): pick a photo, frame it for the hero
// (4:5) and for the link preview (1:1, drawn into the card's empty slot), and
// upload every size to the Worker (PUT /admin/api/photo, worker/media.ts),
// which serves them at /media/ right away: no deploy. The original and the
// crops are stored too, so the photo can be framed again later.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AdminCopy } from '../../i18n/admin';
import { MAX_BYTES, MAX_MB } from '../../lab/attachments';
import {
  HERO_ASPECT,
  HERO_WIDTHS,
  MAX_ZOOM,
  MEDIA,
  OG_H,
  OG_VARIANTS,
  OG_W,
  SOURCE_SIDE,
  centered,
  clampCrop,
  cropRect,
  heroName,
  ogName,
  type Crop,
  type Crops,
  type OgVariant,
} from '../../lab/media';
import { iconBtn, label, mono } from '../lab/ui';

export interface OgCard {
  /** The preview cards with the photo slot empty, one per site mode and
   * language (scripts/og-image.mjs). */
  bases: Record<OgVariant, string>;
  slot: { x: number; y: number; w: number; h: number };
}
type Tab = keyof Crops;
const ASPECT: Record<Tab, number> = { hero: HERO_ASPECT, og: 1 };
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface Source {
  img: HTMLImageElement;
  /** The original as uploaded (JPEG, at most SOURCE_SIDE). */
  blob: Blob;
  url: string;
}

const btn =
  'border-line2 text-ink hover:border-accent inline-flex h-8 cursor-pointer items-center gap-2 border bg-transparent px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-50';
const primary =
  'border-accent bg-accent text-bg inline-flex h-8 cursor-pointer items-center gap-2 border px-3 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50';

const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, q),
  );
const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  return { c, ctx };
};

/** A picked file as the stored original: a JPEG of at most SOURCE_SIDE. */
async function sourceOf(file: File) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, SOURCE_SIDE / Math.max(bmp.width, bmp.height));
  const { c, ctx } = canvasOf(
    Math.round(bmp.width * k),
    Math.round(bmp.height * k),
  );
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return toBlob(c, 'image/jpeg', 0.9);
}

/** The 1:1 crop showing what the 4:5 one shows across its width. */
function ogFrom(img: HTMLImageElement, hero: Crop): Crop {
  const { naturalWidth: w, naturalHeight: h } = img;
  const r = cropRect(w, h, HERO_ASPECT, hero);
  const zoom = Math.min(w, h) / r.sw;
  return clampCrop(w, h, 1, { cx: hero.cx, cy: hero.cy, zoom });
}

/** The part of the image a crop shows, at a given width. */
function Framed({
  img,
  aspect,
  crop,
  width,
  style,
}: {
  img: HTMLImageElement;
  aspect: number;
  crop: Crop;
  width: number;
  style?: CSSProperties;
}) {
  const r = cropRect(img.naturalWidth, img.naturalHeight, aspect, crop);
  const k = width / r.sw;
  return (
    <div
      className="overflow-hidden"
      style={{ position: 'relative', width, height: width / aspect, ...style }}
    >
      <img
        src={img.src}
        alt=""
        draggable={false}
        className="pointer-events-none absolute select-none"
        style={{
          maxWidth: 'none',
          width: img.naturalWidth * k,
          height: img.naturalHeight * k,
          left: -r.sx * k,
          top: -r.sy * k,
        }}
      />
    </div>
  );
}

/** The link preview card with the photo in its slot, at a given width. */
function OgPreview({
  img,
  crop,
  card,
  variant,
  width,
}: {
  img: HTMLImageElement;
  crop: Crop;
  card: OgCard;
  variant: OgVariant;
  width: number;
}) {
  const q = width / OG_W;
  return (
    <div
      className="border-line2 relative border"
      style={{ width, height: OG_H * q }}
    >
      <img src={card.bases[variant]} alt="" className="block size-full" />
      <Framed
        img={img}
        aspect={1}
        crop={crop}
        width={card.slot.w * q}
        style={{
          position: 'absolute',
          left: card.slot.x * q,
          top: card.slot.y * q,
          filter: 'saturate(.9)',
        }}
      />
    </div>
  );
}

/** Picks which link preview card (site mode × language) to look at. */
function OgVariants({
  x,
  variant,
  set,
}: {
  x: AdminCopy['photo'];
  variant: OgVariant;
  set: (v: OgVariant) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={x.ogPreview}>
      {OG_VARIANTS.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === variant}
          onClick={() => set(v)}
          className={`${mono} border px-2 py-1 text-[11px] ${
            v === variant
              ? 'border-accent bg-accent text-on-accent'
              : 'border-line2 text-muted hover:text-ink'
          }`}
        >
          {x.ogVariants[v]}
        </button>
      ))}
    </div>
  );
}

export default function PhotoEditor({
  x,
  card,
  onClose,
}: {
  x: AdminCopy['photo'];
  card: OgCard;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Which card the previews show (every one is saved).
  const [variant, setVariant] = useState<OgVariant>('services-en');
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    'loading' | 'off' | 'empty' | 'ready' | 'saving' | 'saved'
  >('loading');
  const [v, setV] = useState<string | null>(null);
  const [src, setSrc] = useState<Source | null>(null);
  const [crops, setCrops] = useState<Crops>({
    hero: centered(),
    og: centered(),
  });
  const [tab, setTab] = useState<Tab>('hero');
  const [err, setErr] = useState('');
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  // Object URLs are freed when the source changes or the dialog closes.
  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src.url);
    },
    [src],
  );

  // The stored photo and crops, to frame it again.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch('/admin/api/photo', {
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(String(res.status));
        const s = (await res.json()) as {
          enabled: boolean;
          v?: string | null;
          crops?: Crops | null;
        };
        if (!live) return;
        if (!s.enabled) return setState('off');
        setV(s.v ?? null);
        if (!s.crops) return setState('empty');
        const blob = await (
          await fetch('/admin/api/photo/source', { credentials: 'same-origin' })
        ).blob();
        const url = URL.createObjectURL(blob);
        const img = await loadImg(url);
        if (!live) return URL.revokeObjectURL(url);
        setSrc({ img, blob, url });
        setCrops(s.crops);
        setState('ready');
      } catch (e) {
        if (!live) return;
        setErr((e as Error).message);
        setState('empty');
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const pick = async (file: File | undefined) => {
    if (!file || state === 'saving') return;
    setErr('');
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES)
      return setErr(x.badFile.replace('{mb}', String(MAX_MB)));
    try {
      const blob = await sourceOf(file);
      const url = URL.createObjectURL(blob);
      const img = await loadImg(url);
      const hero = clampCrop(img.naturalWidth, img.naturalHeight, HERO_ASPECT, {
        cx: 0.5,
        cy: 0.45,
        zoom: 1,
      });
      setSrc({ img, blob, url });
      setCrops({ hero, og: ogFrom(img, hero) });
      setTab('hero');
      setState('ready');
    } catch {
      setErr(x.badFile.replace('{mb}', String(MAX_MB)));
    }
  };

  const aspect = ASPECT[tab];
  const frameW = Math.min(
    tab === 'hero' ? 280 : 340,
    typeof window === 'undefined' ? 340 : window.innerWidth - 80,
  );
  // Frozen while saving: the upload is of the crops it started with.
  const update = (c: Crop) => {
    if (!src || state === 'saving') return;
    const { naturalWidth: w, naturalHeight: h } = src.img;
    setCrops((cs) => ({ ...cs, [tab]: clampCrop(w, h, aspect, c) }));
    if (state === 'saved') setState('ready');
  };
  const crop = crops[tab];
  // Source pixels per screen pixel in the frame.
  const perPx = src
    ? cropRect(src.img.naturalWidth, src.img.naturalHeight, aspect, crop).sw /
      frameW
    : 1;

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: React.PointerEvent) => {
    const ps = pointers.current;
    const prev = ps.get(e.pointerId);
    if (!prev || !src) return;
    const next = { x: e.clientX, y: e.clientY };
    if (ps.size === 2) {
      // Pinch: zoom by how much the two fingers moved apart.
      const other = [...ps].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(next.x - other.x, next.y - other.y);
      if (d0 > 0) update({ ...crop, zoom: crop.zoom * (d1 / d0) });
    } else {
      const { naturalWidth: w, naturalHeight: h } = src.img;
      update({
        ...crop,
        cx: crop.cx - ((next.x - prev.x) * perPx) / w,
        cy: crop.cy - ((next.y - prev.y) * perPx) / h,
      });
    }
    ps.set(e.pointerId, next);
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };
  // Wheel zoom; a listener of its own, since React's is passive.
  const frame = useRef<HTMLDivElement>(null);
  const zoomBy = (deltaY: number) =>
    update({ ...crop, zoom: crop.zoom * Math.exp(-deltaY * 0.0015) });
  const wheel = useRef(zoomBy);
  useEffect(() => {
    wheel.current = zoomBy;
  });
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      wheel.current(e.deltaY);
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [src]);

  const save = async () => {
    if (!src) return;
    setErr('');
    setState('saving');
    try {
      const { img } = src;
      const { naturalWidth: w, naturalHeight: h } = img;
      const form = new FormData();
      const hr = cropRect(w, h, HERO_ASPECT, crops.hero);
      for (const width of HERO_WIDTHS) {
        const { c, ctx } = canvasOf(width, Math.round(width / HERO_ASPECT));
        ctx.drawImage(img, hr.sx, hr.sy, hr.sw, hr.sh, 0, 0, c.width, c.height);
        const b = await toBlob(c, MEDIA[heroName(width)], 0.82);
        if (b.type !== 'image/webp') throw new Error(x.noWebp);
        form.append(heroName(width), b, heroName(width));
      }
      // The same crop on every card (one per site mode and language).
      const or = cropRect(w, h, 1, crops.og);
      const s = card.slot;
      for (const v of OG_VARIANTS) {
        const { c, ctx } = canvasOf(OG_W, OG_H);
        ctx.drawImage(await loadImg(card.bases[v]), 0, 0, OG_W, OG_H);
        ctx.filter = 'saturate(0.9)';
        ctx.drawImage(img, or.sx, or.sy, or.sw, or.sh, s.x, s.y, s.w, s.h);
        const name = ogName(v);
        form.append(name, await toBlob(c, 'image/jpeg', 0.9), name);
      }
      form.append('source', src.blob, 'source.jpg');
      form.append('crops', JSON.stringify(crops));
      const res = await fetch('/admin/api/photo', {
        method: 'PUT',
        credentials: 'same-origin',
        body: form,
      });
      const out = (await res.json().catch(() => ({}))) as {
        v?: string;
        error?: string;
      };
      if (!res.ok || !out.v) throw new Error(out.error ?? String(res.status));
      setV(out.v);
      setState('saved');
    } catch (e) {
      setErr(x.error.replace('{e}', (e as Error).message));
      setState('ready');
    }
  };

  const bust = v ? `?v=${v}` : '';
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={x.title}
      className="bg-panel text-ink border-line2 m-auto max-h-[92svh] w-[min(980px,94vw)] border p-0 backdrop:bg-black/60"
    >
      <div className="p-card flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-ink m-0 text-[15px] font-semibold">
              {x.title}
            </h2>
            <p className="text-muted m-0 mt-1 text-[12px] leading-snug">
              {x.sub}
            </p>
          </div>
          <button
            type="button"
            aria-label={x.close}
            className={`${iconBtn} size-8`}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept={TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {state === 'loading' && <p className="text-muted m-0">{x.loading}</p>}
        {state === 'off' && <p className="text-warn m-0">{x.noStorage}</p>}

        {state === 'empty' && (
          <div className="flex flex-wrap items-end gap-5">
            <div className="flex flex-col gap-1.5">
              <span className={label}>{x.current}</span>
              <div className="flex flex-wrap items-end gap-4">
                <img
                  src={`/media/${heroName(340)}${bust}`}
                  alt=""
                  width={136}
                  height={170}
                  className="border-line2 border object-cover"
                />
                <img
                  src={`/media/${ogName(variant)}${bust}`}
                  alt=""
                  width={324}
                  height={170}
                  className="border-line2 border"
                />
              </div>
              <p className="text-muted m-0 text-[12px]">{x.none}</p>
            </div>
            <button
              type="button"
              className={primary}
              onClick={() => fileInput.current?.click()}
            >
              {x.choose}
            </button>
          </div>
        )}

        {src && state !== 'loading' && state !== 'off' && state !== 'empty' && (
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-3">
              <div role="tablist" className="flex gap-2">
                {(['hero', 'og'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`${btn} ${tab === t ? 'border-accent text-accent' : ''}`}
                  >
                    {t === 'hero' ? x.hero : x.og}
                  </button>
                ))}
              </div>
              <div
                ref={frame}
                role="img"
                aria-label={x.drag}
                className="border-accent relative cursor-grab touch-none border active:cursor-grabbing"
                style={{ width: frameW + 2 }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                <Framed
                  img={src.img}
                  aspect={aspect}
                  crop={crop}
                  width={frameW}
                />
              </div>
              <p className="text-muted m-0 max-w-[340px] text-[12px]">
                {x.drag}
              </p>
              <label className="flex items-center gap-3">
                <span className={label}>{x.zoom}</span>
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={crop.zoom}
                  disabled={state === 'saving'}
                  onChange={(e) =>
                    update({ ...crop, zoom: Number(e.target.value) })
                  }
                  className="accent-accent w-44"
                />
                <span className={`${mono} text-muted text-[11px]`}>
                  {crop.zoom.toFixed(2)}×
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btn}
                  disabled={state === 'saving'}
                  onClick={() =>
                    update(
                      tab === 'og' ? ogFrom(src.img, crops.hero) : centered(),
                    )
                  }
                >
                  {tab === 'og' ? x.fromHero : x.reset}
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={state === 'saving'}
                  onClick={() => fileInput.current?.click()}
                >
                  {x.replace}
                </button>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className={label}>{x.heroPreview}</span>
                <Framed
                  img={src.img}
                  aspect={HERO_ASPECT}
                  crop={crops.hero}
                  width={136}
                  style={{ border: '1px solid var(--line2)' }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={label}>{x.ogPreview}</span>
                <OgVariants x={x} variant={variant} set={setVariant} />
                <OgPreview
                  img={src.img}
                  crop={crops.og}
                  card={card}
                  variant={variant}
                  width={Math.min(
                    420,
                    typeof window === 'undefined'
                      ? 420
                      : window.innerWidth - 80,
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {err && <p className="text-warn m-0 text-[13px]">{err}</p>}
        {state === 'saved' && (
          <p className="text-accent m-0 text-[13px]">{x.saved}</p>
        )}

        {src &&
          (state === 'ready' || state === 'saving' || state === 'saved') && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={btn}
                onClick={() => dialog.current?.close()}
              >
                {x.close}
              </button>
              <button
                type="button"
                className={primary}
                disabled={state !== 'ready'}
                onClick={() => void save()}
              >
                {state === 'saving' ? x.saving : x.save}
              </button>
            </div>
          )}
      </div>
    </dialog>
  );
}
