// Language and theme preferences, shared by every page and open tab.
type Lang = 'en' | 'es';
type Theme = 'dark' | 'light';

const root = document.documentElement;

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
  if (!persist) return;
  save('lang', lang);
  // A ?lang= in the URL wins on load, so keep it in step with the choice.
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', lang);
    history.replaceState(history.state, '', url);
  }
};

export const setTheme = (theme: Theme, persist = true) => {
  root.dataset.theme = theme;
  if (persist) save('theme', theme);
};

setLang(root.dataset.lang === 'es' ? 'es' : 'en', false);

document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest<HTMLElement>('[data-set-lang]');
  if (btn) setLang(btn.dataset.setLang === 'es' ? 'es' : 'en');
});

// Keep other open tabs of the site in sync.
window.addEventListener('storage', (e) => {
  if (e.key === 'lang' && (e.newValue === 'en' || e.newValue === 'es')) {
    setLang(e.newValue, false);
  }
  if (e.key === 'theme' && (e.newValue === 'dark' || e.newValue === 'light')) {
    setTheme(e.newValue, false);
  }
});
