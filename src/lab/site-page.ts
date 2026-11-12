// The site's mode on the page being viewed (browser side of src/lab/site.ts):
// the Worker writes it on <html> (worker/media.ts, versioned). Apart from
// site.ts, which the Worker imports, because it touches the DOM.
import { DEFAULT_SETTINGS, parseSettings, type SiteSettings } from './site';

/** The settings of the page being viewed (browser only; defaults on the
 * server or when the page didn't come through the Worker, as in astro dev). */
export function pageSettings(): SiteSettings {
  if (typeof document === 'undefined') return DEFAULT_SETTINGS;
  const d = document.documentElement.dataset;
  return (
    parseSettings({ mode: d.mode, jobOffers: d.jobOffers }) ?? DEFAULT_SETTINGS
  );
}
