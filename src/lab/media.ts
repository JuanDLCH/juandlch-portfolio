// The profile photo, uploaded from the dashboard (PhotoEditor.tsx) and served
// by the Worker from KV (worker/media.ts) as /media/<name>: the hero's photo
// at a few widths and the link preview. Plain TS: the Worker imports it.

/** Widths of the hero photo (4:5), for its srcset; it's shown at 170 px. */
export const HERO_WIDTHS = [170, 255, 340, 510] as const;
/** The hero photo's width / height. */
export const HERO_ASPECT = 4 / 5;
/** The link preview (Open Graph / Twitter card). */
export const OG_W = 1200;
export const OG_H = 630;

export const heroName = (w: number) => `photo-${w}.webp`;
/** One link preview per site mode and language (scripts/og-image.mjs draws
 * their cards; the Worker picks one per page, see versioned in
 * worker/media.ts). */
export const OG_VARIANTS = [
  'hire-en',
  'hire-es',
  'services-en',
  'services-es',
] as const;
export type OgVariant = (typeof OG_VARIANTS)[number];
export const ogName = (variant: OgVariant) => `og-${variant}.jpg`;
/** The one pages name statically; the Worker swaps it. */
export const OG_DEFAULT = ogName('hire-en');
/** What /media/ serves, with its content type. */
export const MEDIA: Record<string, string> = {
  ...Object.fromEntries(HERO_WIDTHS.map((w) => [heroName(w), 'image/webp'])),
  ...Object.fromEntries(OG_VARIANTS.map((v) => [ogName(v), 'image/jpeg'])),
};
/** Longest side of the stored original (to crop it again later). */
export const SOURCE_SIDE = 2000;
/** Largest upload per part, in bytes. */
export const MAX_PART = 1024 * 1024;
export const MAX_SOURCE = 4 * 1024 * 1024;

/** A crop of the original: its center (0–1 of the image's width and height)
 * and the zoom (1: the smallest that still fills the frame). */
export interface Crop {
  cx: number;
  cy: number;
  zoom: number;
}
export const MAX_ZOOM = 5;
export interface Crops {
  hero: Crop;
  og: Crop;
}
export const centered = (): Crop => ({ cx: 0.5, cy: 0.5, zoom: 1 });

const isCrop = (c: unknown): c is Crop => {
  if (!c || typeof c !== 'object') return false;
  const { cx, cy, zoom } = c as Record<string, unknown>;
  return (
    typeof cx === 'number' &&
    typeof cy === 'number' &&
    typeof zoom === 'number' &&
    cx >= 0 &&
    cx <= 1 &&
    cy >= 0 &&
    cy <= 1 &&
    zoom >= 1 &&
    zoom <= MAX_ZOOM
  );
};
export const parseCrops = (v: unknown): Crops | null => {
  if (!v || typeof v !== 'object') return null;
  const { hero, og } = v as Record<string, unknown>;
  return isCrop(hero) && isCrop(og) ? { hero, og } : null;
};

/** The part of a w×h image a frame of this aspect (width / height) shows,
 * with the center pulled in so the frame never runs past the image. */
export function cropRect(w: number, h: number, aspect: number, c: Crop) {
  // At zoom 1 the frame covers the image's shorter side (relative to it).
  const sw0 = Math.min(w, h * aspect);
  const sw = sw0 / c.zoom;
  const sh = sw / aspect;
  const x = Math.min(Math.max(c.cx * w - sw / 2, 0), w - sw);
  const y = Math.min(Math.max(c.cy * h - sh / 2, 0), h - sh);
  return { sx: x, sy: y, sw, sh };
}

/** A crop with its center clamped, as cropRect would place it. */
export function clampCrop(w: number, h: number, aspect: number, c: Crop) {
  const zoom = Math.min(Math.max(c.zoom, 1), MAX_ZOOM);
  const r = cropRect(w, h, aspect, { ...c, zoom });
  return { cx: (r.sx + r.sw / 2) / w, cy: (r.sy + r.sh / 2) / h, zoom };
}
