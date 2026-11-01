// Page views for the dashboard (worker/hits.ts), counted by the Worker,
// which tells people from bots (user agent, automation, data-center
// networks). No cookies or ids: each view sends its path and, on arrival,
// where it came from. Navigations through ClientRouter count as views of the
// same visit. Private pages (robots noindex, the dashboard) and the owner's
// browser (marked from /admin, see OWNER) don't count.
export const OWNER = 'jd-owner';

let first = true;

const send = () => {
  if (document.querySelector('meta[name="robots"][content*="noindex"]')) return;
  try {
    if (localStorage.getItem(OWNER) === '1') return;
  } catch {
    /* storage unavailable: count it */
  }
  const body = JSON.stringify({
    path: location.pathname,
    // Only the first view of a visit has an outside referrer.
    ref: first ? document.referrer : location.origin,
    wd: navigator.webdriver === true,
  });
  first = false;
  void fetch('/api/hit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
};

document.addEventListener('astro:page-load', send);
