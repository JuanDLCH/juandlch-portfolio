// What the site says about Juan Diego's availability, switched from /admin
// without a deploy (stored in the SETTINGS KV by worker/settings.ts):
// - mode: `hire` (looking for a job: the landing and both agents speak to
//   recruiters) or `services` (employed: the landing sells freelance
//   projects, the agents say where he works and what he takes on).
// - jobOffers: whether he is open to job offers. Only `services` can close
//   it: looking for a job means open to offers.
// The Worker serves the landing of the mode (src/pages/index.astro or
// services.astro) and writes both on every page's <html> (data-mode,
// data-job-offers), where the browser reads them. Plain TS: the Worker
// imports it.
export type SiteMode = 'hire' | 'services';
export type JobOffers = 'open' | 'closed';
export interface SiteSettings {
  mode: SiteMode;
  jobOffers: JobOffers;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  mode: 'hire',
  jobOffers: 'open',
};

/** The settings as they apply: looking for a job means open to offers. */
export const effective = (s: SiteSettings): SiteSettings =>
  s.mode === 'hire' ? { mode: 'hire', jobOffers: 'open' } : s;

/** Valid settings from untrusted input, or null. */
export function parseSettings(raw: unknown): SiteSettings | null {
  const r = raw as Partial<Record<keyof SiteSettings, unknown>> | null;
  if (!r || typeof r !== 'object') return null;
  if (r.mode !== 'hire' && r.mode !== 'services') return null;
  if (r.jobOffers !== 'open' && r.jobOffers !== 'closed') return null;
  return effective({ mode: r.mode, jobOffers: r.jobOffers });
}

/** Dev only (on localhost): a cookie that plays the dashboard's switch
 * without touching production. Set by DevSiteSwitch.astro; read by
 * Layout.astro's dev-only script and the local Worker (worker/settings.ts,
 * siteSettingsFor). Value: `<mode>.<jobOffers>`. */
export const DEV_COOKIE = 'jd-dev-site';
export function devSettings(cookie: string | null | undefined) {
  const m = cookie?.match(
    /(?:^|;\s*)jd-dev-site=(hire|services)\.(open|closed)(?:;|$)/,
  );
  return m ? parseSettings({ mode: m[1], jobOffers: m[2] }) : null;
}
