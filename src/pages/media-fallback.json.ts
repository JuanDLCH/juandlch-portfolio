// The copies of the profile photo and link preview built with the site, by
// /media/ name: worker/media.ts serves them until a photo is uploaded from
// /admin (or without KV). Refresh src/assets/photo.png and og.png now and
// then, like public/cv-fallback/.
import { getImage } from 'astro:assets';
import type { APIRoute } from 'astro';
import og from '../assets/og.png';
import photo from '../assets/photo.png';
import { HERO_ASPECT, HERO_WIDTHS, OG_NAME, heroName } from '../lab/media';

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
  const card = await getImage({ src: og, format: 'jpg', quality: 90 });
  return Response.json(Object.fromEntries([...hero, [OG_NAME, card.src]]));
};
