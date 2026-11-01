// The dashboard's world map, drawn at build time (src/pages/admin.astro):
// Natural Earth countries (world-atlas, 1:110m) projected with Equal Earth
// into SVG paths keyed by ISO alpha-2 code, the code Cloudflare reports. The
// browser gets plain paths, no map library.
import countries from 'i18n-iso-countries';
import { geoEqualEarth, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';

export interface WorldMap {
  width: number;
  height: number;
  shapes: { id: string; d: string }[];
}

/** Antarctica takes room and never has visitors. */
const SKIP = new Set(['010']);

export function worldMap(width = 960, height = 440): WorldMap {
  const topo = world as unknown as Topology<{
    countries: GeometryCollection;
  }>;
  const geo = feature(topo, topo.objects.countries) as FeatureCollection<
    Geometry,
    { name: string }
  >;
  geo.features = geo.features.filter((f) => !SKIP.has(String(f.id)));
  const path = geoPath(geoEqualEarth().fitSize([width, height], geo)).digits(1);
  const shapes = geo.features.flatMap((f) => {
    const id = countries.numericToAlpha2(String(f.id));
    const d = path(f);
    return id && d ? [{ id, d }] : [];
  });
  return { width, height, shapes };
}
