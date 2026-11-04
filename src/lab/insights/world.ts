// The dashboard's world map, drawn at build time (src/pages/admin.astro):
// Natural Earth countries (world-atlas, 1:110m) projected with Equal Earth
// into SVG paths keyed by ISO alpha-2 code, the code Cloudflare reports. The
// browser gets plain paths, no map library. Countries missing at 1:110m or
// too small to see there (Hong Kong, Singapore, Malta…) also get a dot at
// their centroid, from the 1:50m map.
import countries from 'i18n-iso-countries';
import { geoEqualEarth, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import detail from 'world-atlas/countries-50m.json';

export interface WorldMap {
  width: number;
  height: number;
  shapes: { id: string; d: string }[];
  /** Small countries, drawn as a dot when they have a value. */
  dots: { id: string; x: number; y: number }[];
}

/** Below this projected area (px² at the default size) a country is a dot. */
const TINY = 20;

/** Antarctica takes room and never has visitors. */
const SKIP = new Set(['010']);

const countriesOf = (data: unknown) => {
  const topo = data as Topology<{ countries: GeometryCollection }>;
  const geo = feature(topo, topo.objects.countries) as FeatureCollection<
    Geometry,
    { name: string }
  >;
  geo.features = geo.features.filter(
    (f) => f.id != null && !SKIP.has(String(f.id)),
  );
  return geo;
};

export function worldMap(width = 960, height = 440): WorldMap {
  const geo = countriesOf(world);
  const path = geoPath(geoEqualEarth().fitSize([width, height], geo)).digits(1);
  const shapes = geo.features.flatMap((f) => {
    const id = countries.numericToAlpha2(String(f.id));
    const d = path(f);
    return id && d ? [{ id, d }] : [];
  });
  const k = (width * height) / (960 * 440);
  const area = new Map(geo.features.map((f) => [String(f.id), path.area(f)]));
  const dots = countriesOf(detail).features.flatMap((f) => {
    const id = countries.numericToAlpha2(String(f.id));
    if (!id || (area.get(String(f.id)) ?? 0) >= TINY * k) return [];
    const [x, y] = path.centroid(f);
    return Number.isFinite(x) && Number.isFinite(y)
      ? [{ id, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }]
      : [];
  });
  return { width, height, shapes, dots };
}
