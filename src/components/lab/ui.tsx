// Pieces shared by the lab islands (ChatApp, VoiceApp): <html> language and
// theme, hydration and phone hooks, icons, and the contact buttons.
import { useSyncExternalStore } from 'react';
import { CHAT, type ChatCopy } from '../../i18n/chat';
import { CONTACT, contactInput } from '../../lab/chat/contact';

// Language and theme live on <html> (shared with the landing via prefs.ts).
const subscribe = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-lang'],
  });
  return () => mo.disconnect();
};
export const useHtml = () => {
  const es = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.lang === 'es',
    () => false,
  );
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme !== 'light',
    () => true,
  );
  return { es, dark };
};

// False while hydrating, true afterwards. The page HTML is rendered without
// any lab state, so the first client render must match it; the in-memory
// state (kept across ClientRouter navigations) is applied right after.
const noop = () => () => {};
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

// Phone layout (matches the `mob` variant in global.css).
const phoneQuery = '(max-width: 720px)';
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(phoneQuery);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
export const usePhone = () =>
  useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );

export const mono = 'font-mono';
export const label = `${mono} text-muted text-[10px] tracking-[0.08em] uppercase`;
export const iconBtn =
  'border-line2 text-ink hover:border-accent grid shrink-0 cursor-pointer place-items-center border bg-transparent p-0 transition-colors';

export const Icon = ({ d, size = 17 }: { d: string; size?: number }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
export const I = {
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/>',
  sliders:
    '<path d="M4 6h10M4 12h4M12 12h8M4 18h12"/><rect x="14" y="4" width="4" height="4"/><rect x="8" y="10" width="4" height="4"/><rect x="16" y="16" width="4" height="4"/>',
  clip: '<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l8-8"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="6" y="6" width="12" height="12"/>',
  file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14"/><path d="M3 6l9 7 9-7"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  // A small tree: one node feeding two.
  diagram:
    '<rect x="9" y="3" width="6" height="5"/><rect x="3" y="16" width="6" height="5"/><rect x="15" y="16" width="6" height="5"/><path d="M12 8v4M6 16v-4h12v4"/>',
};

// Contact buttons from show_contact_options. The booking page can't be
// prefilled, so the meeting button comes with a hint to describe the meeting
// in its form. They render in the language the tool was called with (the
// conversation's), like the order and insurance cards; without one (the CV
// intro), in the page's.
export function ContactActions({
  input,
  x: page,
  inset = true,
}: {
  input: string;
  x: ChatCopy;
  /** In the log the buttons line up with the answer above them. */
  inset?: boolean;
}) {
  const { options, topic, lang } = contactInput(input);
  const x = lang ? CHAT[lang] : page;
  if (!options.length) return null;
  const btn =
    'border-line2 text-ink hover:border-accent mob:h-8 mob:gap-1.5 mob:px-2 mob:text-xs inline-flex h-8 items-center gap-2 border bg-transparent px-3 text-[13px] no-underline transition-colors';
  const subject = encodeURIComponent(topic || x.contactSubject);
  const external = { target: '_blank', rel: 'noopener noreferrer' } as const;
  return (
    <div
      className={`flex flex-col gap-1.5 ${inset ? 'mob:max-w-full max-w-[88%] pl-3' : ''}`}
    >
      <div
        role="group"
        aria-label={x.contactLabel}
        className="mob:gap-1.5 flex flex-wrap gap-2"
      >
        {options.map((o) =>
          o === 'email' ? (
            <a
              key={o}
              href={`mailto:${CONTACT.email}?subject=${subject}`}
              className={btn}
            >
              <Icon d={I.mail} size={15} />
              {x.contactEmail}
            </a>
          ) : o === 'linkedin' || o === 'github' ? (
            <a key={o} href={CONTACT[o]} {...external} className={btn}>
              <Icon d={o === 'linkedin' ? I.link : I.code} size={15} />
              {o === 'linkedin' ? x.contactLinkedin : x.contactGithub}
            </a>
          ) : CONTACT.booking ? (
            <a
              key={o}
              href={CONTACT.booking}
              {...external}
              className="bg-accent text-on-accent mob:h-8 mob:gap-1.5 mob:px-2 mob:text-xs inline-flex h-8 items-center gap-2 px-3 text-[13px] font-semibold no-underline"
            >
              <Icon d={I.calendar} size={15} />
              {x.contactMeeting}
            </a>
          ) : (
            <button
              key={o}
              type="button"
              disabled
              className={`${btn} cursor-not-allowed opacity-60`}
            >
              <Icon d={I.calendar} size={15} />
              {x.contactMeeting}
              <span className={`${mono} text-muted text-[10px] uppercase`}>
                · {x.contactSoon}
              </span>
            </button>
          ),
        )}
      </div>
      {CONTACT.booking && options.includes('meeting') && (
        <p className="text-muted m-0 text-[11px] leading-normal">
          {x.meetingHint}
        </p>
      )}
    </div>
  );
}
