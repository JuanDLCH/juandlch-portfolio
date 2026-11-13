// The copies of the profile photo and link preview built with the site, by
// /media/ name: worker/media.ts serves them until a photo is uploaded from
// /admin (or without KV). Refresh src/assets/photo.png and the cards in src/assets/og/ now and
// then, like public/cv-fallback/.
import { getImage } from 'astro:assets';
import type { APIRoute } from 'astro';
import photo from '../assets/photo.png';
import {
  HERO_ASPECT,
  HERO_WIDTHS,
  OG_VARIANTS,
  heroName,
  ogName,
} from '../lab/media';

// The cards with the bundled photo (scripts/og-image.mjs).
const cards = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/og/*.png',
  { eager: true },
);

export const GET: APIRoute = async () => {
  const hero = await Promise.all(
    HERO_WIDTHS.map(async (w) => {
      const img = await getImage({
        src: photo,
        width: w,
        height: Math.round(w / HERO_ASPECT),
        fit: 'cover',
        format: 'webp',
        quality: 82,
      });
      return [heroName(w), img.src] as const;
    }),
  );
  const og = await Promise.all(
    OG_VARIANTS.map(async (v) => {
      const src = cards[`../assets/og/${v}.png`]?.default;
      if (!src) throw new Error(`missing src/assets/og/${v}.png`);
      const img = await getImage({ src, format: 'jpg', quality: 90 });
      return [ogName(v), img.src] as const;
    }),
  );
  return Response.json(Object.fromEntries([...hero, ...og]));
};
