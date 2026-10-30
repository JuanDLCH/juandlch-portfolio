import {
  content,
  type Lang,
  type RawContent,
  type RawFlowNode,
} from './content';

export type { Lang } from './content';
export const langs: Lang[] = ['en', 'es'];

/** A text that differs per language. Identical texts stay plain strings. */
export type L = { en: string; es: string };
export type Txt = string | L;

/** Same shape as the raw content, with every string turned into a Txt. */
type Bi<T> = T extends string
  ? Txt
  : T extends readonly (infer U)[]
    ? Bi<U>[]
    : T extends object
      ? { [K in keyof T]: Bi<T[K]> }
      : T;

export type Content = Bi<RawContent>;
export type FlowNode = Bi<RawFlowNode>;

function zip(en: unknown, es: unknown): unknown {
  if (typeof en === 'string') {
    return typeof es === 'string' && es !== en ? { en, es } : en;
  }
  if (Array.isArray(en)) {
    const other = Array.isArray(es) ? es : [];
    return en.map((v, i) => zip(v, other[i]));
  }
  if (en && typeof en === 'object') {
    const other = (es ?? {}) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(en).map(([k, v]) => [k, zip(v, other[k])]),
    );
  }
  return en;
}

/** Both languages, rendered once at build time; the client only toggles visibility. */
export const getContent = () => zip(content.en, content.es) as Content;

export const pick = (t: Txt, lang: Lang): string =>
  typeof t === 'string' ? t : t[lang];

/** Builds a Txt by running the same formatter for each language. */
export const both = (fn: (lang: Lang) => string): Txt => {
  const en = fn('en');
  const es = fn('es');
  return en === es ? en : { en, es };
};

/** Splits a Txt on a separator into per-item Txts (both languages share the item count). */
export const splitTxt = (t: Txt, sep: string): Txt[] => {
  const en = pick(t, 'en').split(sep);
  const es = pick(t, 'es').split(sep);
  return en.map((v, i) => (es[i] && es[i] !== v ? { en: v, es: es[i] } : v));
};

/**
 * Attributes that must change with the language (aria-label, alt, title):
 * renders the English value and stores both for `prefs.ts` to swap.
 */
export function attrs<K extends string>(
  o: Record<K, Txt>,
): Record<K, string> & { 'data-i18n-attrs'?: string } {
  const out = {} as Record<K, string> & { 'data-i18n-attrs'?: string };
  const swaps: Record<string, L> = {};
  for (const k of Object.keys(o) as K[]) {
    const v = o[k];
    out[k] = pick(v, 'en') as never;
    if (typeof v !== 'string') swaps[k] = v;
  }
  if (Object.keys(swaps).length) out['data-i18n-attrs'] = JSON.stringify(swaps);
  return out;
}
