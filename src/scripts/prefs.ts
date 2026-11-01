// Language and theme preferences, shared by every page and open tab.
type Lang = 'en' | 'es';
type Theme = 'dark' | 'light';

// Imported by islands too, so nothing here may touch the DOM during SSR.
const browser = typeof document !== 'undefined';
const root = (browser ? document.documentElement : null) as HTMLElement;

const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

// Attributes can't be hidden with CSS, so they carry both values (see `attrs`).
const applyAttrs = (lang: Lang) => {
  document.querySelectorAll<HTMLElement>('[data-i18n-attrs]').forEach((el) => {
    const swaps = JSON.parse(el.dataset.i18nAttrs ?? '{}') as Record<
      string,
      Record<Lang, string>
    >;
    for (const [name, value] of Object.entries(swaps)) {
      el.setAttribute(name, value[lang]);
    }
  });
  document.querySelectorAll<HTMLElement>('[data-set-lang]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.setLang === lang));
  });
};

export const setLang = (lang: Lang, persist = true) => {
  root.dataset.lang = lang;
  root.lang = lang;
  applyAttrs(lang);
  const t = document.querySelector<HTMLElement>('title[data-title]');
  if (t) {
    document.title = (
      JSON.parse(t.dataset.title ?? '{}') as Record<Lang, string>
    )[lang];
  }
  if (!persist) return;
  save('lang', lang);
  // A ?lang= in the URL wins on load, so keep it in step with the choice.
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', lang);
    history.replaceState(history.state, '', url);
  }
};

// The tab icon follows the site's theme (not the OS one).
const iconFor = (theme: Theme) =>
  theme === 'light' ? '/favicon-light.svg' : '/favicon.svg';

export const setTheme = (theme: Theme, persist = true) => {
  root.dataset.theme = theme;
  // Replace the element: some browsers ignore a changed href on a live link.
  const old = document.querySelector('link[data-icon]');
  if (old && !old.getAttribute('href')?.endsWith(iconFor(theme))) {
    const link = old.cloneNode() as HTMLLinkElement;
    link.setAttribute('href', iconFor(theme));
    old.replaceWith(link);
  }
  if (persist) save('theme', theme);
};

const current = (): Lang => (root.dataset.lang === 'es' ? 'es' : 'en');

if (browser) {
  setLang(current(), false);

  // ClientRouter swaps in a page rendered with default attributes: carry the
  // live theme and language over before it paints, then refresh its attributes.
  document.addEventListener('astro:before-swap', (e) => {
    const next = e.newDocument.documentElement;
    next.dataset.theme = root.dataset.theme ?? 'dark';
    next
      .querySelector('link[data-icon]')
      ?.setAttribute('href', iconFor(next.dataset.theme as Theme));
    next.dataset.lang = current();
    next.lang = current();
  });
  document.addEventListener('astro:page-load', () => setLang(current(), false));

  document.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-set-lang]');
    if (btn) setLang(btn.dataset.setLang === 'es' ? 'es' : 'en');
  });

  // Without a saved choice the site follows the system and its changes.
  matchMedia('(prefers-color-scheme: light)').addEventListener(
    'change',
    (e) => {
      try {
        if (localStorage.getItem('theme')) return;
      } catch {
        /* storage unavailable */
      }
      setTheme(e.matches ? 'light' : 'dark', false);
    },
  );

  // Keep other open tabs of the site in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === 'lang' && (e.newValue === 'en' || e.newValue === 'es')) {
      setLang(e.newValue, false);
    }
    if (
      e.key === 'theme' &&
      (e.newValue === 'dark' || e.newValue === 'light')
    ) {
      setTheme(e.newValue, false);
    }
  });
}
