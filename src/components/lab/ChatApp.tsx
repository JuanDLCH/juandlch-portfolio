import { useStore } from '@nanostores/react';
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { CHAT, type ChatCopy } from '../../i18n/chat';
import {
  $attachments,
  IMAGE_TYPES,
  MAX_BYTES,
  MAX_PDF_PAGES,
  shrinkImage,
  readAttachment,
  type Attachment,
} from '../../lab/attachments';
import {
  CASES,
  PROVIDER,
  caseEffort,
  caseModel,
  caseTools,
  type ChatCase,
  type Provider,
} from '../../lab/chat/cases';
import { runTurn } from '../../lab/chat/turn';
import { cvLinkId, cvPdf } from '../../lab/chat/cv';
import { CONTACT, contactInput } from '../../lab/chat/contact';
import {
  CATEGORY_LABEL,
  TAG_LABEL,
  DINER,
  MENU,
  dish,
  menuSelection,
  optionLabel,
  type Category,
  type Dish,
  type Lang,
  type Order,
} from '../../lab/chat/order';
import {
  COVERAGE,
  DAMAGE_AREA_LABEL,
  INCIDENT_LABEL,
  INSURER,
  POLICY,
  describePolicy,
  type Claim,
} from '../../lab/chat/insurance';
import CvViewer from './CvViewer';
import DocViewer from './DocViewer';
import { docLinkId, kbNote, pageId, type Doc } from '../../lab/chat/docs';
import { readKbFile } from '../../lab/kb';
import contractUrl from '../../assets/lab/documents/sample-contract.pdf?url';
import insuredCarUrl from '../../assets/lab/insurance/sample-insured-car.jpg?url';
import otherCarUrl from '../../assets/lab/insurance/sample-other-car.jpg?url';
import invoiceUrl from '../../assets/lab/insurance/sample-invoice.pdf?url';
import { transcribe } from '../../lab/chat/openai';
import {
  $busy,
  $caseId,
  $drafts,
  $keys,
  $sessions,
  MAX_CHARS,
  MAX_MESSAGES,
  MAX_VOICE_S,
  emptySession,
  getSession,
  nextNoticeId,
  setSession,
  setTurn,
  stopTurn,
  type ChatItem,
  type ChatSession,
  type NoticeCode,
  type UserInput,
} from '../../lab/store';
import { setLang, setTheme } from '../../scripts/prefs';

// Language and theme live on <html> (shared with the landing via prefs.ts).
const subscribe = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-lang'],
  });
  return () => mo.disconnect();
};
const useHtml = () => {
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
const useHydrated = () =>
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
const usePhone = () =>
  useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );

const mono = 'font-mono';
const label = `${mono} text-muted text-[10px] tracking-[0.08em] uppercase`;
const iconBtn =
  'border-line2 text-ink hover:border-accent grid shrink-0 cursor-pointer place-items-center border bg-transparent p-0 transition-colors';

const Icon = ({ d, size = 17 }: { d: string; size?: number }) => (
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
const I = {
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

const pick = (v: { en: string; es: string }, es: boolean) => (es ? v.es : v.en);

// What an error message offers to fix it, shown under it as a button.
type Fix = keyof ChatCopy['fixes'];
const FIXES: Partial<Record<NoticeCode, Fix>> = {
  noKey: 'key',
  auth: 'keyReview',
  quota: 'billing',
  micNoKey: 'voiceKey',
  transcribe: 'voiceKeyReview',
  rate: 'retry',
  overloaded: 'retry',
  network: 'retry',
  unreadable: 'keyReview',
  api: 'clear',
  file: 'file',
  pdfPages: 'file',
  imageSize: 'file',
  convLimit: 'clear',
  imageUnreadable: 'file',
  pdfSize: 'file',
  pdfUnreadable: 'file',
  docFile: 'file',
  docNone: 'addDoc',
  docUnreadable: 'file',
  docPages: 'file',
  docSize: 'file',
};

const PROVIDER_NAME: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};
const BILLING: Record<Provider, string> = {
  anthropic: 'https://platform.claude.com/settings/billing',
  openai: 'https://platform.openai.com/settings/organization/billing/overview',
};
// Where the CV chat's intro sends visitors to create a key, and the contact
// buttons it shows (same shape as a show_contact_options call).
const KEYS_URL = 'https://platform.openai.com/api-keys';
const INTRO_CONTACT = JSON.stringify({
  options: ['meeting', 'email', 'linkedin'],
});
// Keys the dialog asks for: the chat provider's, plus OpenAI for voice input.
const KEY_FIELDS: Provider[] =
  PROVIDER === 'openai' ? ['openai'] : ['anthropic', 'openai'];
const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export default function ChatApp({
  devKey,
  only,
}: {
  devKey?: string;
  // Locks the chat to one case (the hero's "Chat with my CV"): no case
  // picker, settings panel or demo dialogs, just the chat and the keys.
  only?: string;
}) {
  // Dev only (see lab/chat.astro): start with the .env key unless one is set.
  useEffect(() => {
    if (devKey && !$keys.get().openai)
      $keys.set({ ...$keys.get(), openai: devKey });
  }, [devKey]);

  const { es, dark } = useHtml();
  const phone = usePhone();
  const x = es ? CHAT.es : CHAT.en;
  const hydrated = useHydrated();
  const live = <T,>(value: T, initial: T) => (hydrated ? value : initial);
  const keys = live(useStore($keys), { anthropic: '', openai: '' });
  const caseId = live(useStore($caseId), CASES[0].id);
  const sessions = live(useStore($sessions), {});
  const drafts = live(useStore($drafts), {});
  const attachments = live(useStore($attachments), {});
  const busy = live(useStore($busy), false);
  const c = CASES.find((k) => k.id === (only ?? caseId)) ?? CASES[0];
  const session = sessions[c.id] ?? emptySession();
  const draft = drafts[c.id] ?? '';
  const files = attachments[c.id] ?? [];
  const hasInput = draft.trim().length > 0 || files.length > 0;
  // Contact buttons go at the end of the turn they were shown in, below the
  // answer, wherever in the turn the tool was called.
  // Same for the Order assistant's menu cards and the insurance cards.
  // `pick` reads what the card needs from the call (its input by default).
  const endOfTurn = (
    names: string[],
    pick: (m: { input: string; result: string }) => string = (m) => m.input,
  ) => {
    const at = new Map<number, string[]>();
    for (let i = 0, turn: string[] = []; i < session.items.length; i++) {
      const m = session.items[i];
      if (m.kind === 'tool' && names.includes(m.name) && m.status === 'done')
        turn.push(pick(m));
      const next = session.items[i + 1];
      if (turn.length && (!next || next.kind === 'user')) {
        at.set(i, turn);
        turn = [];
      }
    }
    return at;
  };
  const contactAt = endOfTurn(['show_contact_options']);
  const menuAt = endOfTurn(['show_menu']);
  const policyAt = endOfTurn(['get_policy']);
  const photoAt = endOfTurn(['request_photo']);
  const docAt = endOfTurn(['request_document']);
  // A claim card per claim the turn filed or looked up, found by the number
  // in the call's result label.
  const claimAt = endOfTurn(
    ['file_claim', 'get_claim_status', 'attach_invoice'],
    (m) => m.result.match(/CLM-\d{4}-\d{5}/)?.[0] ?? '',
  );
  const claim = (id: string) =>
    session.claims?.list.find((k) => k.claim_id === id);
  // The order card goes once, at the end of the last turn that changed the
  // order, and always shows its current state.
  let orderAt = -1;
  if (session.order)
    for (let i = 0, touched = false; i < session.items.length; i++) {
      const m = session.items[i];
      if (m.kind === 'tool' && ORDER_TOOLS.includes(m.name)) touched = true;
      const next = session.items[i + 1];
      if (touched && (!next || next.kind === 'user')) {
        orderAt = i;
        touched = false;
      }
    }
  const chatKey = keys[PROVIDER];

  const [side, setSide] = useState(false);
  const [modal, setModal] = useState(false);
  // "Watch demo" and "How I'd build it" dialogs, each with its own case pick.
  const [info, setInfo] = useState<'video' | 'build' | null>(null);
  // CV chat only: what the demo is, how to run it and how to reach me. Until
  // the visitor opens or closes it (null), it shows while there's no key.
  const [introPick, setIntro] = useState<boolean | null>(null);
  const intro = introPick ?? (!!only && !chatKey);
  const [infoCase, setInfoCase] = useState(CASES[0].id);
  // CV viewer opened from a citation: the answer's cited items and the one
  // clicked.
  const [cv, setCv] = useState<{ ids: string[]; focus: string } | null>(null);
  // Document viewer, likewise: the answer's cited passages and the one
  // clicked (or a document's first page, from its chip).
  const [docView, setDocView] = useState<{
    ids: string[];
    focus: string;
  } | null>(null);
  // Document agent: PDFs being read when attached; sending waits for them.
  const [reading, setReading] = useState(0);
  // The Knowledge Base box starts open and folds into one line once the
  // conversation starts, so it doesn't take room all session; the visitor
  // can open or fold it again (null: follow that default).
  const [kbPick, setKbOpen] = useState<boolean | null>(null);
  const readingRef = useRef(0);
  // Order assistant: the full menu dialog, in the conversation's language.
  const [menuLang, setMenuLang] = useState<Lang | null>(null);
  // Auto insurance assistant: the policy dialog, likewise.
  const [policyLang, setPolicyLang] = useState<Lang | null>(null);
  const [keyDrafts, setKeyDrafts] = useState({ anthropic: '', openai: '' });
  // Key input the keys dialog focuses when it opens.
  const [keyFocus, setKeyFocus] = useState<'anthropic' | 'openai'>('anthropic');
  // Case waiting for confirmation: switching clears the conversation.
  const [switchTo, setSwitchTo] = useState<ChatCase | null>(null);
  const [rec, setRec] = useState<'off' | 'on' | 'busy'>('off');
  // Seconds recorded so far; the note stops itself at MAX_VOICE_S.
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialog = modal
    ? 'keys'
    : intro
      ? 'intro'
      : info
        ? info
        : cv
          ? 'cv'
          : docView
            ? 'doc'
            : menuLang
              ? 'menu'
              : policyLang
                ? 'policy'
                : switchTo
                  ? 'switch'
                  : null;
  const dialogOpen = dialog !== null;
  const closeDialogs = () => {
    setModal(false);
    setIntro(false);
    setInfo(null);
    setCv(null);
    setDocView(null);
    setMenuLang(null);
    setPolicyLang(null);
    setSwitchTo(null);
  };

  // Dialogs: the rest of the page goes inert while one is open (so Tab and
  // clicks stay inside), focus moves in on open and back to the trigger on
  // close.
  useEffect(() => {
    if (!dialog) return;
    const trigger = document.activeElement as HTMLElement | null;
    const d = dialogRef.current;
    (
      d?.querySelector<HTMLElement>(`#jd-key-${keyFocus}`) ??
      d?.querySelector<HTMLElement>('[data-autofocus]') ??
      d?.querySelector<HTMLElement>('button')
    )?.focus();
    return () => trigger?.focus();
    // keyFocus is set together with the dialog; it never changes while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDialogs();
        return;
      }
      // Keep Tab cycling through the open dialog.
      const d = dialogRef.current;
      if (e.key !== 'Tab' || !d) return;
      const items = [
        ...d.querySelectorAll<HTMLElement>('button, input, video, [href]'),
      ].filter((el) => !el.hasAttribute('disabled'));
      const first = items[0];
      const last = items[items.length - 1];
      const inside = d.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [dialog]);

  useEffect(() => {
    const el = logRef.current;
    if (el && session.items.length) el.scrollTop = el.scrollHeight;
  }, [session.items]);

  // Voice notes: tick the clock and stop at MAX_VOICE_S (stopping sends the
  // note, as the stop button does).
  useEffect(() => {
    if (rec !== 'on') return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const secs = Math.floor((performance.now() - t0) / 1000);
      setRecSecs(Math.min(secs, MAX_VOICE_S));
      if (secs >= MAX_VOICE_S) recRef.current?.stop();
    }, 250);
    return () => clearInterval(id);
  }, [rec]);

  const openInfo = (kind: 'video' | 'build') => {
    setInfoCase(c.id);
    setInfo(kind);
    setSide(false);
  };
  const openKeys = (focus: 'anthropic' | 'openai' = 'anthropic') => {
    // Clearing the keys later must not bring the intro back by itself.
    setIntro(false);
    setKeyDrafts(keys);
    setKeyFocus(focus);
    setModal(true);
  };
  const notice = (code: NoticeCode) => {
    const s = getSession(c.id);
    setSession(c.id, {
      ...s,
      items: [...s.items, { kind: 'notice', id: nextNoticeId(), code }],
    });
  };
  const setDraft = (v: string) => $drafts.setKey(c.id, v);
  // Clears the conversation; the Knowledge Base stays (switching cases
  // clears it too).
  const clearChat = () => {
    const { docs, docSeq } = getSession(c.id);
    setSession(c.id, { ...emptySession(), docs, docSeq });
    setKbOpen(null);
  };
  // A case starts from scratch: switching away from a started conversation
  // asks first, then clears it (and anything left in the new case).
  const pickCase = (k: ChatCase, confirmed = false) => {
    if ($busy.get()) return;
    setSide(false);
    if (k.id !== c.id) {
      const s = getSession(c.id);
      // A filled Knowledge Base counts as started: switching clears it.
      if (!confirmed && (s.items.length > 0 || s.docs?.length)) {
        setSwitchTo(k);
        return;
      }
      kbGeneration++;
      pickSeq++;
      setSession(c.id, emptySession());
      setSession(k.id, emptySession());
      $caseId.set(k.id);
    }
  };

  // Streams one turn from `start` (which already shows the user message).
  const run = async (start: ChatSession, input: UserInput) => {
    setSession(c.id, start);
    $busy.set(true);
    const ctrl = new AbortController();
    setTurn(ctrl);
    // A provider module that fails to load (offline, or a stale deploy)
    // must not leave the chat stuck on "Thinking…".
    const err = await runTurn(PROVIDER, chatKey, c, start, input, {
      update: (s) => {
        setSession(c.id, s);
        // The full menu opens by itself once, when a show_menu call for it
        // finishes; the button it leaves in the log reopens it.
        for (const m of s.items) {
          if (m.kind !== 'tool' || m.name !== 'show_menu') continue;
          if (m.status !== 'done' || menusOpened.has(m.id)) continue;
          menusOpened.add(m.id);
          const a = menuArgs(m.input);
          if (a?.full) setMenuLang(a.lang);
        }
        // Same for the policy, from each get_policy call.
        for (const m of s.items) {
          if (m.kind !== 'tool' || m.name !== 'get_policy') continue;
          if (m.status !== 'done' || policiesOpened.has(m.id)) continue;
          policiesOpened.add(m.id);
          setPolicyLang(langArg(m.input));
        }
      },
      signal: ctrl.signal,
      es,
    }).catch(() => 'network' as const);
    $busy.set(false);
    setTurn(null);
    if (err) notice(err);
  };

  // Runs the failed turn again from where it started: whatever it left in the
  // log (partial answer, tool calls, the error) is dropped first.
  const retry = () => {
    const s = getSession(c.id);
    if ($busy.get() || readingRef.current || !s.turn) return;
    // The Knowledge Base may have changed since the turn failed.
    const input = c.docs
      ? { ...s.turn.input, context: kbNote(s.docs ?? []) }
      : s.turn.input;
    void run(
      {
        ...s,
        items: s.items.slice(0, s.turn.items),
        api: s.api.slice(0, s.turn.api),
        order: s.turn.order,
        claims: s.turn.claims,
      },
      input,
    );
  };

  const fix = (f: Fix) => {
    if (f === 'key' || f === 'keyReview') openKeys(PROVIDER);
    else if (f === 'voiceKey' || f === 'voiceKeyReview') openKeys('openai');
    else if (f === 'billing') open(BILLING[PROVIDER], '_blank', 'noopener');
    else if (f === 'retry') retry();
    else if (f === 'clear') clearChat();
    else fileRef.current?.click();
  };

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    // Read the store, not the render's `busy`: a transcription finishing
    // after a turn ended calls this from an older closure.
    // Nor while a Knowledge Base file is being read: the turn would start
    // without it.
    if ((!text && files.length === 0) || $busy.get() || readingRef.current)
      return;
    // Document agent: nothing to answer from until the Knowledge Base has
    // something. Said here, without spending a request; the message stays.
    if (c.docs && !getSession(c.id).docs?.length) {
      if (override) setDraft(override);
      notice('docNone');
      return;
    }
    // Limits (MAX_*): the message stays so it can be shortened, or the
    // conversation cleared.
    if (text.length > MAX_CHARS) {
      setDraft(text);
      notice('tooLong');
      return;
    }
    if (
      getSession(c.id).items.filter((m) => m.kind === 'user').length >=
      MAX_MESSAGES
    ) {
      if (override) setDraft(override);
      notice('convLimit');
      return;
    }
    // No key: the message stays in the composer and the assistant asks for
    // the key, so sending again after adding it just works.
    if (!chatKey) {
      if (override) setDraft(override);
      notice('noKey');
      return;
    }
    const start = getSession(c.id);
    const user: ChatItem = {
      kind: 'user',
      text,
      files: files.map((f) => ({
        name: f.name,
        type: f.mediaType,
        // Images preview in the log, other files download from it.
        src: `data:${f.mediaType};base64,${f.data}`,
      })),
    };
    const input: UserInput = {
      text,
      files,
      ...(c.docs && { context: kbNote(start.docs ?? []) }),
    };
    setDraft('');
    $attachments.setKey(c.id, []);
    await run(
      {
        ...start,
        items: [...start.items, user],
        turn: {
          items: start.items.length + 1,
          api: start.api.length,
          input,
          order: start.order,
          claims: start.claims,
        },
      },
      input,
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !coarse) {
      e.preventDefault();
      void send();
    }
  };

  // A picked file as the composer keeps it, or the notice that rejects it.
  // Every case: images and PDFs up to MAX_MB, images shrunk to a JPEG, PDFs
  // up to MAX_PDF_PAGES, all refused before any token is spent. Cases that
  // read PDFs page by page (c.pdf) get them as page images.
  const attach = async (f: File): Promise<Attachment | NoticeCode> => {
    const pdf = f.type === 'application/pdf';
    if (!IMAGE_TYPES.includes(f.type) && !pdf) return 'file';
    if (f.size > MAX_BYTES) return pdf ? 'pdfSize' : 'imageSize';
    if (!pdf) {
      try {
        const img = await shrinkImage(f);
        return { name: f.name, mediaType: 'image/jpeg', data: img.data };
      } catch {
        return 'imageUnreadable';
      }
    }
    try {
      const { loadPdf, pdfPages } = await import('../../lab/pdf');
      if (c.pdf) {
        const pages = await pdfPages(f, c.pdf.maxPages);
        return { ...(await readAttachment(f)), pages };
      }
      // Sent whole: only its page count is checked.
      (await loadPdf(await f.arrayBuffer(), MAX_PDF_PAGES)).destroy();
      return await readAttachment(f);
    } catch (e) {
      return (e as { code?: NoticeCode }).code ?? 'pdfUnreadable';
    }
  };
  // One file per message: a new pick replaces the one in the composer.
  const addFiles = async (list: File[]) => {
    const f = list[0];
    if (!f) return;
    const seq = ++pickSeq;
    const a = await attach(f);
    if (seq !== pickSeq) return;
    if (typeof a === 'string') notice(a);
    else $attachments.setKey(c.id, [a]);
  };

  // Document agent: files go straight to the Knowledge Base (not to the
  // composer), read in the browser. Not while a turn runs: it works on a
  // copy of the session and would drop them when it ends.
  // `gen`: the case-switch generation when the files were picked (see
  // kbGeneration); files from an older one are dropped.
  const addToKb = async (list: File[], gen = kbGeneration) => {
    if (!c.docs) return;
    for (const f of list) {
      if ($busy.get() || gen !== kbGeneration) return;
      const held = (getSession(c.id).docs?.length ?? 0) + readingRef.current;
      if (held >= c.docs.maxFiles) {
        notice('docLimit');
        return;
      }
      setReading((readingRef.current += 1));
      const r = await readKbFile(f, c.docs).finally(() =>
        setReading((readingRef.current -= 1)),
      );
      // The visitor switched cases meanwhile: that Knowledge Base is gone.
      if (gen !== kbGeneration) return;
      if (typeof r === 'string') {
        notice(r);
        continue;
      }
      // A turn started meanwhile would overwrite the session: drop the file.
      if ($busy.get()) return;
      const s = getSession(c.id);
      const docs = s.docs ?? [];
      // Same file name twice: the second gets a number, so their sources
      // can be told apart.
      let name = r.name;
      for (let k = 2; docs.some((d) => d.name === name); k++)
        name = r.name.replace(/(\.[^.]+)?$/, ` ${k}$1`);
      const seq = (s.docSeq ?? 0) + 1;
      setSession(c.id, {
        ...s,
        docs: [...docs, { ...r, name, id: `d${seq}` }],
        docSeq: seq,
      });
    }
    composerRef.current?.focus();
  };
  const removeDoc = (id: string) => {
    if ($busy.get()) return;
    const s = getSession(c.id);
    setSession(c.id, { ...s, docs: s.docs?.filter((d) => d.id !== id) });
  };
  const addSample = async () => {
    // Taken before the download: a case switch during it drops the sample.
    const gen = kbGeneration;
    // The download shows as a slot being read (and hides the link).
    setReading((readingRef.current += 1));
    const blob = await fetch(contractUrl)
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null)
      .finally(() => setReading((readingRef.current -= 1)));
    if (gen !== kbGeneration) return;
    if (!blob) return notice('docUnreadable');
    await addToKb(
      [new File([blob], x.docs.sampleFile, { type: 'application/pdf' })],
      gen,
    );
  };

  // Insurance examples: the sample file goes to the composer like an upload.
  const addExample = async (ex: Example, lang: Lang) => {
    const blob = await fetch(ex.src).then((r) => r.blob());
    await addFiles([new File([blob], ex.file[lang], { type: ex.type })]);
    composerRef.current?.focus();
  };

  const onFiles = async (list: FileList | null) => {
    if (!list || c.attachments === false) return;
    const picked = Array.from(list);
    if (fileRef.current) fileRef.current.value = '';
    await (c.docs ? addToKb(picked) : addFiles(picked));
  };

  const onMic = async () => {
    if ($busy.get()) return;
    if (!keys.openai) return notice('micNoKey');
    if (rec === 'on') return recRef.current?.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (mr.state === 'inactive' && chunks.length === 0)
          return setRec('off');
        setRec('busy');
        try {
          const text = await transcribe(
            keys.openai,
            new Blob(chunks, { type: mr.mimeType }),
            es ? 'es' : 'en',
          );
          setRec('off');
          if (text) void send(text);
        } catch {
          setRec('off');
          notice('transcribe');
        }
      };
      recRef.current = mr;
      mr.start();
      setRecSecs(0);
      setRec('on');
    } catch {
      notice('mic');
    }
  };
  const cancelRec = () => {
    const mr = recRef.current;
    if (!mr) return;
    mr.ondataavailable = null;
    mr.onstop = () => mr.stream.getTracks().forEach((t) => t.stop());
    mr.stop();
    setRec('off');
  };
  // ClientRouter unmounts the island without reloading the page: stop a
  // recording in progress so the microphone isn't left on.
  useEffect(
    () => () => {
      const mr = recRef.current;
      if (!mr || mr.state === 'inactive') return;
      mr.ondataavailable = null;
      mr.onstop = null;
      mr.stop();
      mr.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const model = caseModel(c);
  const started = session.items.some((m) => m.kind === 'user');
  const effort = caseEffort(c, session.docs?.length);
  const tools = caseTools(c);
  const ready = !!chatKey;
  // Copy placeholders: the provider and the case's model.
  const fill = (t: string) =>
    t.replaceAll('{p}', PROVIDER_NAME[PROVIDER]).replaceAll('{m}', model.name);
  const toggleTheme = () => setTheme(dark ? 'light' : 'dark');
  const themeLabel = dark ? x.toLight : x.toDark;

  const langGroup = (big = false) => (
    <div
      role="group"
      aria-label={x.langGroup}
      className="border-line2 flex border"
    >
      {(['en', 'es'] as const).map((l, i) => {
        const on = (l === 'es') === es;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={on}
            onClick={() => setLang(l)}
            className={`${mono} ${big ? 'h-11 w-13' : 'h-9 w-9'} cursor-pointer border-0 p-0 text-[11px] ${i ? 'border-line2 border-l' : ''} ${on ? 'bg-ink text-bg' : 'text-ink bg-transparent'}`}
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      lang={es ? 'es' : 'en'}
      className="bg-bg text-ink relative flex h-dvh flex-col overflow-hidden"
    >
      <header
        inert={dialogOpen}
        className="border-line mob:h-14 mob:gap-2 mob:px-2.5 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <a
            href={only ? '/' : '/#lab'}
            aria-label={only ? x.homeLabel : x.backLabel}
            className={`${mono} border-line2 hover:border-accent mob:size-11 mob:justify-center mob:p-0 mob:text-base inline-flex h-9 shrink-0 items-center gap-2 border px-3 text-[11px] tracking-[0.06em] uppercase no-underline transition-colors`}
          >
            <span aria-hidden="true">←</span>
            <span className="mob:hidden">{only ? x.home : x.back}</span>
          </a>
          <span
            aria-hidden="true"
            className="bg-line2 narrow:hidden h-6 w-px"
          />
          {only ? (
            <h1 className="m-0 min-w-0 truncate text-base font-medium tracking-[-0.02em]">
              {x.cvChat}
            </h1>
          ) : (
            <div className="mob:hidden flex min-w-0 items-baseline gap-2.5">
              <h1 className="m-0 text-base font-medium tracking-[-0.02em] whitespace-nowrap">
                {x.title}
              </h1>
              <span className={`${label} narrow:hidden text-[11px]`}>
                Lab 02 · BYOK
              </span>
            </div>
          )}
          {!only && (
            <button
              type="button"
              onClick={() => setSide(!side)}
              aria-label={`${x.changeCase}: ${pick(c.label, es)}`}
              className="text-ink mob:flex hidden min-h-11 min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left"
            >
              <span
                aria-hidden="true"
                className={`${mono} bg-panel border-accent text-accent grid size-9 shrink-0 place-items-center border text-xs font-medium`}
              >
                {initials(pick(c.label, es))}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-medium tracking-[-0.01em]">
                  {pick(c.label, es)}
                </span>
                <span
                  className={`${mono} text-muted flex items-center gap-1.5 text-[10px]`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-1.5 shrink-0 ${ready ? 'bg-ok' : 'bg-warn'}`}
                  />
                  <span className="truncate">
                    {ready
                      ? `${model.short} · ${tools.length} ${x.toolsWord}`
                      : x.caseNeedsKey}
                  </span>
                </span>
              </span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {only && (
            <button
              type="button"
              onClick={() => setIntro(true)}
              aria-label={x.introBtn}
              title={x.introBtn}
              className={`${iconBtn} mob:size-11 size-9`}
            >
              <Icon d={I.info} />
            </button>
          )}
          {!only && (
            <>
              <button
                type="button"
                onClick={() => openInfo('video')}
                aria-label={x.watchDemo}
                className="border-accent text-accent hover:bg-accent hover:text-on-accent mob:hidden narrow:px-0 narrow:w-9 narrow:justify-center inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 border bg-transparent px-3.5 text-[13px] font-medium transition-colors"
              >
                <Icon d={I.play} size={14} />
                <span className="narrow:hidden">{x.watchDemo}</span>
              </button>
              <button
                type="button"
                onClick={() => openInfo('build')}
                aria-label={x.buildBtn}
                title={x.buildBtn}
                className={`${iconBtn} mob:hidden size-9`}
              >
                <Icon d={I.diagram} />
              </button>
              <span
                aria-hidden="true"
                className="bg-line2 mob:hidden mx-1 h-6 w-px"
              />
            </>
          )}
          <button
            type="button"
            onClick={() => openKeys()}
            className={`${mono} border-line2 text-ink hover:border-accent narrow:hidden inline-flex h-9 cursor-pointer items-center gap-3 border bg-transparent px-3 text-[10px] tracking-[0.04em] transition-colors`}
          >
            {KEY_FIELDS.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`size-[7px] ${keys[p] ? 'bg-ok' : p === PROVIDER ? 'bg-warn' : 'bg-line2'}`}
                />
                {PROVIDER_NAME[p]}
              </span>
            ))}
            <span className="text-accent">{x.keysBtn}</span>
          </button>
          <button
            type="button"
            onClick={() => openKeys()}
            aria-label={x.keysBtn}
            className={`${iconBtn} narrow:grid mob:size-11 hidden size-9`}
          >
            <Icon d={I.key} />
          </button>
          {!only && (
            <button
              type="button"
              onClick={() => setSide(!side)}
              aria-label={x.settings}
              className={`${iconBtn} narrow:grid mob:size-11 hidden size-9`}
            >
              <Icon d={I.sliders} />
            </button>
          )}
          {/* Phone: without the settings sheet, language and theme stay here. */}
          <div className={only ? '' : 'mob:hidden'}>{langGroup()}</div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={themeLabel}
            title={themeLabel}
            className={`${iconBtn} ${only ? 'mob:size-11' : 'mob:hidden'} size-9`}
          >
            <Icon d={dark ? I.sun : I.moon} />
          </button>
        </div>
      </header>

      <div inert={dialogOpen} className="relative flex min-h-0 flex-1">
        <main className="dots flex min-w-0 flex-1 flex-col">
          {!ready && (
            <div className="flex shrink-0 justify-center px-4 pt-3">
              <div className="border-line2 bg-panel flex w-full max-w-[780px] flex-wrap items-center justify-between gap-2.5 border border-dashed px-3 py-2 text-[13px]">
                <span className="text-body flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="bg-warn size-[7px] shrink-0"
                  />
                  {fill(x.noKeyBanner)}
                </span>
                <button
                  type="button"
                  onClick={() => openKeys()}
                  className={`${mono} border-accent text-accent h-8 cursor-pointer border bg-transparent px-3 text-[10px] tracking-[0.06em] uppercase`}
                >
                  {x.addKeys}
                </button>
              </div>
            </div>
          )}

          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label={x.conversation}
            className="mob:px-3 min-h-0 flex-1 overflow-y-auto px-4 py-[clamp(10px,2svh,18px)]"
          >
            <div className="mx-auto flex max-w-[780px] flex-col gap-3">
              {session.items.length === 0 && (
                <div className="pt-[clamp(4px,3svh,32px)] pb-2">
                  <div
                    className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
                  >
                    {only ? pick(c.tag, es) : 'Lab 02'}
                  </div>
                  <h2 className="text-h2 mt-2 mb-0 leading-[1.05] font-medium tracking-[-0.04em]">
                    {only ? pick(c.label, es) : x.emptyTitle}
                  </h2>
                  <p className="text-body mt-2 mb-0 max-w-[560px] text-sm leading-[1.55]">
                    {only ? pick(c.desc, es) : x.emptyBody}
                  </p>
                  {!only && (
                    <div className="mt-[clamp(12px,3svh,24px)] grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-2">
                      {CASES.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => pickCase(k)}
                          className={`bg-panel text-ink hover:border-accent flex cursor-pointer flex-col items-start gap-1 border p-3 text-left transition-colors ${k.id === c.id ? 'border-accent' : 'border-line2'}`}
                        >
                          <span
                            className={`${mono} text-accent text-[10px] tracking-[0.08em] uppercase`}
                          >
                            {pick(k.tag, es)}
                          </span>
                          <span className="text-[13px] font-medium">
                            {pick(k.label, es)}
                          </span>
                          <span className={`${mono} text-muted text-[10px]`}>
                            {caseModel(k).short} · {caseTools(k).length}{' '}
                            {x.toolsWord}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {session.items.map((m, i) => (
                <Fragment key={m.kind === 'notice' ? `notice-${m.id}` : i}>
                  {m.kind === 'notice' ? (
                    <Notice
                      id={m.id}
                      text={fill(x.errors[m.code])}
                      // Only the latest message offers its fix; older ones are
                      // past the point where it would help.
                      fix={
                        i === session.items.length - 1 && !busy
                          ? FIXES[m.code]
                          : undefined
                      }
                      fixLabel={fill}
                      labels={x.fixes}
                      onFix={fix}
                    />
                  ) : m.kind === 'tool' ? (
                    // A run of tool calls folds into one row; the first
                    // item of the run draws it.
                    session.items[i - 1]?.kind !== 'tool' && (
                      <ToolGroup items={toolRun(session.items, i)} x={x} />
                    )
                  ) : (
                    <Message
                      m={m}
                      onCv={(focus, ids) => setCv({ focus, ids })}
                      cvLabel={x.cvOpen}
                      onDoc={(focus, ids) => setDocView({ focus, ids })}
                      docLabel={x.docs.open}
                    />
                  )}
                  {contactAt.get(i)?.map((input, k) => (
                    <ContactActions key={k} input={input} x={x} />
                  ))}
                  {menuAt.get(i)?.map((input, k) => (
                    <MenuCard
                      key={k}
                      input={input}
                      onPick={(d) => {
                        setDraft(d);
                        composerRef.current?.focus();
                      }}
                      onOpen={setMenuLang}
                    />
                  ))}
                  {policyAt
                    .get(i)
                    ?.slice(-1)
                    .map((input, k) => (
                      <div key={k} className="pl-3">
                        <button
                          type="button"
                          onClick={() => setPolicyLang(langArg(input))}
                          className="border-line2 text-ink hover:border-accent mob:h-8 mob:gap-1.5 mob:px-2 mob:text-xs inline-flex h-8 cursor-pointer items-center gap-2 border bg-transparent px-3 text-[13px] transition-colors"
                        >
                          <Icon d={I.file} size={14} />
                          {CHAT[langArg(input)].insurance.viewPolicy}
                        </button>
                      </div>
                    ))}
                  {(
                    [
                      ['photo', photoAt.get(i)?.at(-1)],
                      ['document', docAt.get(i)?.at(-1)],
                    ] as const
                  ).map(
                    ([kind, input]) =>
                      input && (
                        <AttachRequest
                          key={kind}
                          kind={kind}
                          input={input}
                          // Done once a later message carries a file.
                          sent={session.items
                            .slice(i + 1)
                            .some(
                              (n) => n.kind === 'user' && n.files.length > 0,
                            )}
                          busy={busy}
                          onUpload={() => fileRef.current?.click()}
                          onExample={(ex, lang) => void addExample(ex, lang)}
                        />
                      ),
                  )}
                  {[...new Set(claimAt.get(i))].map((id) => {
                    const cl = claim(id);
                    return cl && <ClaimCard key={id} claim={cl} />;
                  })}
                  {i === orderAt && session.order && (
                    <OrderCard
                      order={session.order}
                      busy={busy}
                      onPlace={() =>
                        void send(CHAT[session.order!.lang].order.confirm)
                      }
                    />
                  )}
                </Fragment>
              ))}
              {busy &&
                !session.items.some(
                  (m) => m.kind === 'assistant' && m.streaming && m.text,
                ) && (
                  <div
                    className={`${mono} text-muted flex items-center gap-2 pl-4 text-[11px]`}
                  >
                    <span
                      aria-hidden="true"
                      className="jd-blink bg-accent size-1.5"
                    />
                    {x.thinking}
                  </div>
                )}
            </div>
          </div>

          <div className="mob:px-2.5 mob:pb-[calc(10px+env(safe-area-inset-bottom))] shrink-0 px-4 pb-3">
            <div className="mx-auto max-w-[780px]">
              <input
                ref={fileRef}
                type="file"
                multiple={!!c.docs}
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => void onFiles(e.target.files)}
              />
              {session.items.length === 0 && c.suggestions.length > 0 && (
                <div
                  role="group"
                  aria-label={x.suggestions}
                  className="mob:flex-nowrap mob:overflow-x-auto mob:-mx-2.5 mob:px-2.5 mb-2 flex flex-wrap gap-1.5"
                >
                  {c.suggestions.map((sg) => {
                    const text = pick(sg.text, es);
                    return (
                      <button
                        key={text}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!sg.attach) return void send(text);
                          setDraft(text);
                          fileRef.current?.click();
                        }}
                        className="border-line2 bg-panel text-body hover:border-accent hover:text-ink mob:h-9 inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 border px-2.5 text-[12px] whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sg.attach && <Icon d={I.clip} size={13} />}
                        {sg.attach ? x.attachSuggestion : text}
                      </button>
                    );
                  })}
                </div>
              )}
              {c.docs && (
                <KnowledgeBase
                  open={kbPick ?? !started}
                  canFold={started}
                  onToggle={() => setKbOpen(!(kbPick ?? !started))}
                  docs={session.docs ?? []}
                  max={c.docs.maxFiles}
                  reading={reading}
                  busy={busy}
                  x={x.docs}
                  onAdd={() => fileRef.current?.click()}
                  onSample={() => void addSample()}
                  onOpen={(d) => setDocView({ ids: [], focus: pageId(d, 1) })}
                  onRemove={removeDoc}
                />
              )}
              <div className="border-line2 bg-panel border">
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                    {files.map((f, i) => (
                      <span
                        key={i}
                        className={`${mono} border-line2 text-chip inline-flex items-center gap-2 border px-2 py-1 text-[11px]`}
                      >
                        {IMAGE_TYPES.includes(f.mediaType) ? (
                          <img
                            src={`data:${f.mediaType};base64,${f.data}`}
                            alt=""
                            className="size-6 object-cover"
                          />
                        ) : (
                          <Icon d={I.file} size={13} />
                        )}
                        {f.name}
                        <button
                          type="button"
                          aria-label={`${x.removeFile} ${f.name}`}
                          onClick={() =>
                            $attachments.setKey(
                              c.id,
                              files.filter((_, k) => k !== i),
                            )
                          }
                          className="text-muted cursor-pointer border-0 bg-transparent p-0"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {rec !== 'off' ? (
                  <div className="flex min-h-16 items-center gap-2.5 py-2 pr-2 pl-3.5">
                    <span
                      aria-hidden="true"
                      className="jd-blink bg-warn size-2"
                    />
                    <span className={`${label} flex-1 text-[11px]`}>
                      {rec === 'on'
                        ? `${x.recording} ${clock(recSecs)} / ${clock(MAX_VOICE_S)}`
                        : x.transcribing}
                    </span>
                    {rec === 'on' && (
                      <>
                        <button
                          type="button"
                          onClick={cancelRec}
                          aria-label={x.cancel}
                          className={`${iconBtn} size-11 text-lg`}
                        >
                          ×
                        </button>
                        <button
                          type="button"
                          onClick={() => recRef.current?.stop()}
                          aria-label={x.send}
                          className="bg-accent text-on-accent grid size-11 cursor-pointer place-items-center border-0"
                        >
                          <Icon d={I.send} size={15} />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mob:flex-row mob:items-end mob:gap-0.5 mob:pl-3 flex flex-col">
                    <label htmlFor="jd-prompt" className="sr-only">
                      {x.inputLabel}
                    </label>
                    <textarea
                      ref={composerRef}
                      id="jd-prompt"
                      rows={1}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onKeyDown}
                      maxLength={MAX_CHARS}
                      placeholder={phone ? x.placeholderShort : x.placeholder}
                      className="text-ink placeholder:text-muted mob:min-h-11 mob:min-w-0 mob:flex-1 mob:self-center mob:px-0 mob:py-2.5 mob:text-base mob:max-h-[8.5em] block [field-sizing:content] max-h-[8em] min-h-[1.5em] w-full resize-none border-0 bg-transparent px-3 pt-2 pb-0.5 text-[13px] leading-normal focus:outline-none"
                    />
                    <div className="mob:contents flex items-center justify-between gap-2 px-1 pb-1">
                      <div className="mob:contents flex gap-1">
                        {c.attachments !== false && !c.docs && (
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            aria-label={x.attach}
                            title={x.attachHint}
                            className={`${iconBtn} text-muted desk:size-8 size-11 border-transparent`}
                          >
                            <Icon d={I.clip} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void onMic()}
                          disabled={busy}
                          aria-label={x.mic}
                          title={keys.openai ? x.mic : x.micNeedsKey}
                          className={`${iconBtn} mob:hidden desk:size-8 size-11 border-transparent disabled:cursor-not-allowed disabled:opacity-40 ${keys.openai ? 'text-ink' : 'text-muted'}`}
                        >
                          <Icon d={I.mic} />
                        </button>
                      </div>
                      <div className="mob:contents flex items-center gap-2.5">
                        {/* Shown near the limit, so a long paste isn't cut off unnoticed. */}
                        {draft.length > MAX_CHARS * 0.9 && (
                          <span
                            aria-live="polite"
                            className={`${mono} text-[10px] ${draft.length >= MAX_CHARS ? 'text-warn' : 'text-muted'}`}
                          >
                            {draft.length}/{MAX_CHARS}
                          </span>
                        )}
                        <span
                          className={`${mono} text-muted narrow:hidden text-[10px]`}
                        >
                          {model.name} · {effort}
                        </span>
                        {busy ? (
                          <button
                            type="button"
                            onClick={stopTurn}
                            aria-label={x.stop}
                            className="border-line2 text-ink desk:size-8 grid size-11 cursor-pointer place-items-center border bg-transparent"
                          >
                            <Icon d={I.stop} size={14} />
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void send()}
                              aria-label={x.send}
                              className={`bg-accent text-on-accent desk:size-8 grid size-11 shrink-0 cursor-pointer place-items-center border-0 ${hasInput ? '' : 'mob:hidden'}`}
                            >
                              <Icon d={I.send} size={15} />
                            </button>
                            {/* Phone: one action button, the mic until there is something to send. */}
                            {!hasInput && (
                              <button
                                type="button"
                                onClick={() => void onMic()}
                                disabled={busy}
                                aria-label={x.mic}
                                title={keys.openai ? x.mic : x.micNeedsKey}
                                className="bg-accent text-on-accent mob:grid hidden size-11 shrink-0 cursor-pointer place-items-center border-0 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Icon d={I.mic} size={18} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div
                className={`${mono} text-muted mob:hidden mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-1.5 text-[10px] tracking-[0.04em]`}
              >
                <span>{x.enterHint}</span>
                <span>{x.privacyLine}</span>
              </div>
            </div>
          </div>
        </main>

        {side && !only && (
          <button
            type="button"
            aria-label={x.close}
            onClick={() => setSide(false)}
            className="bg-scrim narrow:block absolute inset-0 z-15 hidden cursor-pointer border-0 p-0"
          />
        )}
        {!only && (
          <aside
            aria-label={x.settings}
            className={`border-line bg-panel narrow:absolute narrow:inset-y-0 narrow:right-0 narrow:z-20 narrow:w-[min(360px,92vw)] narrow:shadow-[-24px_0_48px_rgba(0,0,0,.35)] mob:inset-x-0 mob:top-auto mob:max-h-[86%] mob:w-auto mob:border-t mob:border-l-0 flex w-[300px] shrink-0 flex-col border-l ${side ? '' : 'narrow:hidden'}`}
          >
            <div className="border-line mob:h-11 flex h-10 shrink-0 items-center justify-between border-b px-3.5">
              <span className={label}>{x.settings}</span>
              <button
                type="button"
                onClick={() => setSide(false)}
                aria-label={x.close}
                className="border-line2 text-ink narrow:grid hidden size-8 cursor-pointer place-items-center border bg-transparent"
              >
                ×
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3">
              <div className="mob:flex hidden items-center justify-between gap-3">
                {langGroup(true)}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`${mono} border-line2 text-ink h-11 cursor-pointer border bg-transparent px-3.5 text-[11px] tracking-[0.06em] uppercase`}
                >
                  {themeLabel}
                </button>
              </div>
              {/* Phone: the header has no room for these, so they live here. */}
              <div className="mob:grid hidden grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openInfo('video')}
                  className="border-accent text-accent inline-flex h-11 cursor-pointer items-center justify-center gap-2 border bg-transparent px-2 text-sm font-medium"
                >
                  <Icon d={I.play} size={14} />
                  {x.watchDemo}
                </button>
                <button
                  type="button"
                  onClick={() => openInfo('build')}
                  className="border-line2 text-ink inline-flex h-11 cursor-pointer items-center justify-center gap-2 border bg-transparent px-2 text-sm"
                >
                  <Icon d={I.diagram} size={16} />
                  <span className="truncate">{x.buildBtn}</span>
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="jd-case" className={label}>
                  {x.cases}
                </label>
                <select
                  id="jd-case"
                  value={c.id}
                  disabled={busy}
                  onChange={(e) => {
                    const k = CASES.find((v) => v.id === e.target.value);
                    if (k) pickCase(k);
                  }}
                  className="border-line2 bg-bg text-ink mob:h-11 mob:text-sm h-8 w-full cursor-pointer border px-2 text-xs"
                >
                  {CASES.map((k) => (
                    <option key={k.id} value={k.id}>
                      {pick(k.label, es)}
                    </option>
                  ))}
                </select>
                <p className="text-body m-0 text-[11px] leading-[1.45]">
                  {pick(c.desc, es)}
                </p>
              </div>

              <div className="border-line flex flex-col gap-1.5 border-t pt-3">
                <div className={label}>{x.setup}</div>
                <dl className="border-line bg-line m-0 grid grid-cols-3 gap-px border">
                  {[
                    [x.model, model.short],
                    [x.effort, effort],
                    [x.maxTokens, c.maxTokens.toLocaleString()],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-bg px-2 py-1.5">
                      <dt
                        className={`${mono} text-muted text-[9px] whitespace-nowrap`}
                      >
                        {k}
                      </dt>
                      <dd className="m-0 mt-0.5 text-[11px] whitespace-nowrap">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-muted m-0 text-[11px]">{x.setupNote}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className={`${label} flex justify-between`}>
                  <span>{x.toolsTitle}</span>
                  <span>
                    {tools.length} {x.toolsWord}
                  </span>
                </div>
                {tools.length === 0 ? (
                  <p className="text-muted m-0 text-[11px]">{x.toolsSoon}</p>
                ) : (
                  <ul className="border-line2 m-0 flex list-none flex-col border p-0">
                    {tools.map((t, i) => (
                      <li
                        key={t.name}
                        className={`mob:min-h-11 flex items-center justify-between gap-2 px-2 py-1.5 ${i ? 'border-line2 border-t' : ''}`}
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className={`${mono} text-[10px]`}>
                            {t.name}
                          </span>
                          <span className="text-muted text-[10px] leading-[1.35]">
                            {pick(t.desc, es)}
                          </span>
                        </span>
                        <span
                          className={`${mono} text-ok inline-flex shrink-0 items-center gap-1 text-[9px]`}
                        >
                          <span
                            aria-hidden="true"
                            className="bg-ok size-[7px]"
                          />
                          {x.ready}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Usage and clear stay pinned below the scrolling settings. */}
            <div className="border-line bg-panel mob:pb-[calc(12px+env(safe-area-inset-bottom))] flex shrink-0 flex-col gap-1.5 border-t px-3.5 py-3">
              <div
                className={`${label} flex justify-between tracking-[0.06em]`}
              >
                <span>{x.usage}</span>
                <span>{x.estimated}</span>
              </div>
              <div className="border-line bg-line grid grid-cols-3 gap-px border">
                {[
                  ['IN', `${session.usage.input.toLocaleString()} tok`],
                  ['OUT', `${session.usage.output.toLocaleString()} tok`],
                  [x.cost, `$${session.usage.cost.toFixed(4)}`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-bg px-2 py-1.5">
                    <div className={`${mono} text-muted text-[9px]`}>{k}</div>
                    <div className="mt-0.5 text-[11px]">{v}</div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={clearChat}
                className={`${mono} border-line2 text-ink hover:border-accent mob:h-11 mt-1 h-7 cursor-pointer border bg-transparent text-[10px] tracking-[0.06em] uppercase transition-colors`}
              >
                {x.clear}
              </button>
            </div>
          </aside>
        )}
      </div>

      {modal && (
        <div className="bg-scrim mob:place-items-stretch mob:p-0 absolute inset-0 z-30 grid place-items-center p-4">
          {/* Backdrop: a click that starts and ends outside the dialog closes it. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={x.close}
            onClick={() => setModal(false)}
            className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jd-modal-title"
            className="bg-panel border-line2 mob:h-dvh mob:max-h-dvh mob:max-w-none mob:border-0 relative flex max-h-[calc(100dvh-34px)] w-full max-w-[520px] flex-col border"
          >
            <span
              aria-hidden="true"
              className="border-accent absolute -top-px -left-px size-4 border-t-2 border-l-2"
            />
            <span
              aria-hidden="true"
              className="border-accent absolute -right-px -bottom-px size-4 border-r-2 border-b-2"
            />
            <div className="mob:px-4 mob:py-5 min-h-0 flex-1 overflow-y-auto px-7 pt-7 pb-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div
                    className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
                  >
                    {x.providersTag}
                  </div>
                  <h2
                    id="jd-modal-title"
                    className="mt-2 mb-0 text-2xl font-medium tracking-[-0.03em]"
                  >
                    {x.providersTitle}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  aria-label={x.close}
                  className={`${iconBtn} size-9 text-lg`}
                >
                  ×
                </button>
              </div>
              <p className="text-body mt-3 mb-0 text-sm leading-[1.55]">
                {x.providersIntro}
              </p>
              <div className="mt-5 flex flex-col gap-4">
                {KEY_FIELDS.map(
                  (id) =>
                    [
                      id,
                      `${PROVIDER_NAME[id]} API key`,
                      id !== 'openai'
                        ? x.chatKeyHint
                        : PROVIDER === 'openai'
                          ? x.chatVoiceKeyHint
                          : x.openaiHint,
                      id === 'anthropic' ? 'sk-ant-…' : 'sk-…',
                    ] as const,
                ).map(([id, name, hint, ph]) => (
                  <div key={id} className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`jd-key-${id}`}
                      className="flex justify-between gap-3 text-[13px] font-medium"
                    >
                      <span>{name}</span>
                      <span
                        className={`${mono} text-muted text-[10px] font-normal`}
                      >
                        {hint}
                      </span>
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        id={`jd-key-${id}`}
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={ph}
                        value={keyDrafts[id]}
                        onChange={(e) =>
                          setKeyDrafts({ ...keyDrafts, [id]: e.target.value })
                        }
                        className={`${mono} border-line2 bg-bg text-ink focus:border-accent mob:h-11 mob:text-base h-10 min-w-0 flex-1 border px-3 text-[13px] focus:outline-none`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard
                            ?.readText()
                            .then((v) =>
                              setKeyDrafts((d) => ({ ...d, [id]: v.trim() })),
                            )
                            .catch(() => {})
                        }
                        className={`${mono} border-line2 text-ink mob:flex hidden h-11 min-w-[72px] cursor-pointer items-center justify-center border bg-transparent px-3 text-[11px] tracking-[0.06em] uppercase`}
                      >
                        {x.paste}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <ul className="border-line2 bg-bg text-body mt-5 mb-0 flex list-none flex-col gap-2 border px-4 py-3.5 text-[13px] leading-[1.45]">
                {x.guarantees.map((g) => (
                  <li key={g} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`${mono} text-accent shrink-0`}
                    >
                      ✓
                    </span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted mt-3 mb-0 text-xs leading-normal">
                {x.billing}
              </p>
            </div>
            {/* Actions stay pinned below the scrolling body. */}
            <div className="border-line2 mob:px-4 mob:pb-[calc(12px+env(safe-area-inset-bottom))] mob:flex-col mob:items-stretch mob:gap-2 flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-t px-7 py-3.5">
              <button
                type="button"
                onClick={() => {
                  $keys.set({ anthropic: '', openai: '' });
                  setKeyDrafts({ anthropic: '', openai: '' });
                }}
                className={`${mono} border-line2 text-muted mob:h-11 h-10 cursor-pointer border bg-transparent px-3.5 text-[11px] tracking-[0.06em] uppercase`}
              >
                {x.forget}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="border-line2 text-ink mob:h-11 mob:flex-1 h-10 cursor-pointer border bg-transparent px-4 text-sm"
                >
                  {x.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    $keys.set({
                      anthropic: keyDrafts.anthropic.trim(),
                      openai: keyDrafts.openai.trim(),
                    });
                    setModal(false);
                  }}
                  className="bg-accent text-on-accent mob:h-11 mob:flex-[2] h-10 cursor-pointer border-0 px-4 text-sm font-semibold"
                >
                  {x.useKeys}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {switchTo && (
        <div className="bg-scrim absolute inset-0 z-30 grid place-items-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-label={x.cancel}
            onClick={closeDialogs}
            className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
          />
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="jd-switch-title"
            aria-describedby="jd-switch-body"
            className="bg-panel border-line2 relative w-full max-w-[440px] border"
          >
            <span
              aria-hidden="true"
              className="border-accent absolute -top-px -left-px size-4 border-t-2 border-l-2"
            />
            <span
              aria-hidden="true"
              className="border-accent absolute -right-px -bottom-px size-4 border-r-2 border-b-2"
            />
            <div className="mob:px-4 px-7 pt-6 pb-5">
              <div
                className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
              >
                {x.switchTag}
              </div>
              <h2
                id="jd-switch-title"
                className="mt-1.5 mb-0 text-[clamp(20px,4svh,24px)] font-medium tracking-[-0.03em]"
              >
                {x.switchTitle}
              </h2>
              <p
                id="jd-switch-body"
                className="text-body mt-3 mb-0 text-sm leading-[1.55]"
              >
                {x.switchBody}
              </p>
              <div className="border-line2 bg-bg mt-4 flex items-center gap-2.5 border px-3 py-2.5 text-[13px]">
                <span
                  className={`${mono} text-muted shrink-0 text-[10px] line-through`}
                >
                  {pick(c.label, es)}
                </span>
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
                <span className="min-w-0 truncate font-medium">
                  {pick(switchTo.label, es)}
                </span>
              </div>
            </div>
            <div className="border-line2 mob:px-4 flex justify-end gap-2 border-t px-7 py-3">
              <button
                type="button"
                data-autofocus
                onClick={closeDialogs}
                className="border-line2 text-ink mob:h-11 mob:flex-1 h-10 cursor-pointer border bg-transparent px-4 text-sm"
              >
                {x.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSwitchTo(null);
                  pickCase(switchTo, true);
                }}
                className="bg-accent text-on-accent mob:h-11 mob:flex-[2] h-10 cursor-pointer border-0 px-4 text-sm font-semibold"
              >
                {x.switchOk}
              </button>
            </div>
          </div>
        </div>
      )}

      {menuLang && (
        <div className="bg-scrim mob:place-items-stretch mob:p-0 absolute inset-0 z-30 grid place-items-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-label={CHAT[menuLang].close}
            onClick={() => setMenuLang(null)}
            className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jd-menu-title"
            className="bg-panel border-line2 mob:h-dvh mob:max-h-dvh mob:max-w-none mob:border-0 relative flex max-h-[calc(100dvh-34px)] w-full max-w-[560px] flex-col border"
          >
            <span
              aria-hidden="true"
              className="border-accent absolute -top-px -left-px size-4 border-t-2 border-l-2"
            />
            <span
              aria-hidden="true"
              className="border-accent absolute -right-px -bottom-px size-4 border-r-2 border-b-2"
            />
            <div className="mob:px-4 mob:pt-5 flex min-h-0 flex-1 flex-col px-7 pt-6 pb-4">
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div>
                  <div
                    className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
                  >
                    {CHAT[menuLang].order.menu}
                  </div>
                  <h2
                    id="jd-menu-title"
                    className="mt-1.5 mb-0 text-[clamp(20px,4svh,24px)] font-medium tracking-[-0.03em]"
                  >
                    {DINER}
                  </h2>
                  <p className="text-muted m-0 mt-1 text-[13px]">
                    {CHAT[menuLang].order.menuNote}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuLang(null)}
                  aria-label={CHAT[menuLang].close}
                  className={`${iconBtn} size-9 text-lg`}
                >
                  ×
                </button>
              </div>
              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-3 text-[13px]">
                <MenuList dishes={MENU} lang={menuLang} />
              </div>
            </div>
            <div className="border-line2 mob:px-4 mob:pb-[calc(12px+env(safe-area-inset-bottom))] flex shrink-0 items-center justify-end border-t px-7 py-3">
              <button
                type="button"
                data-autofocus
                onClick={() => setMenuLang(null)}
                className="border-line2 text-ink mob:h-11 h-10 cursor-pointer border bg-transparent px-4 text-sm"
              >
                {CHAT[menuLang].close}
              </button>
            </div>
          </div>
        </div>
      )}

      {policyLang && (
        <div className="bg-scrim mob:place-items-stretch mob:p-0 absolute inset-0 z-30 grid place-items-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-label={CHAT[policyLang].close}
            onClick={() => setPolicyLang(null)}
            className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jd-policy-title"
            className="bg-panel border-line2 mob:h-dvh mob:max-h-dvh mob:max-w-none mob:border-0 relative flex max-h-[calc(100dvh-34px)] w-full max-w-[560px] flex-col border"
          >
            <span
              aria-hidden="true"
              className="border-accent absolute -top-px -left-px size-4 border-t-2 border-l-2"
            />
            <span
              aria-hidden="true"
              className="border-accent absolute -right-px -bottom-px size-4 border-r-2 border-b-2"
            />
            <div className="mob:px-4 mob:pt-5 flex min-h-0 flex-1 flex-col px-7 pt-6 pb-4">
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div>
                  <div
                    className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
                  >
                    {CHAT[policyLang].insurance.policy}
                  </div>
                  <h2
                    id="jd-policy-title"
                    className="mt-1.5 mb-0 text-[clamp(20px,4svh,24px)] font-medium tracking-[-0.03em]"
                  >
                    {INSURER}
                  </h2>
                  <p className="text-muted m-0 mt-1 text-[13px]">
                    {CHAT[policyLang].insurance.policyNote}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPolicyLang(null)}
                  aria-label={CHAT[policyLang].close}
                  className={`${iconBtn} size-9 text-lg`}
                >
                  ×
                </button>
              </div>
              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-3 text-[13px]">
                <PolicyDetails
                  lang={policyLang}
                  holder={session.claims?.holder ?? ''}
                />
              </div>
            </div>
            <div className="border-line2 mob:px-4 mob:pb-[calc(12px+env(safe-area-inset-bottom))] flex shrink-0 items-center justify-end border-t px-7 py-3">
              <button
                type="button"
                data-autofocus
                onClick={() => setPolicyLang(null)}
                className="border-line2 text-ink mob:h-11 h-10 cursor-pointer border bg-transparent px-4 text-sm"
              >
                {CHAT[policyLang].close}
              </button>
            </div>
          </div>
        </div>
      )}

      {docView ? (
        <div className="bg-scrim mob:place-items-stretch mob:p-0 absolute inset-0 z-30 grid place-items-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-label={x.close}
            onClick={() => setDocView(null)}
            className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jd-doc-title"
            className="bg-panel border-line2 mob:h-dvh mob:max-h-dvh mob:max-w-none mob:border-0 relative flex h-[calc(100dvh-34px)] w-full max-w-[820px] flex-col border"
          >
            <span
              aria-hidden="true"
              className="border-accent absolute -top-px -left-px size-4 border-t-2 border-l-2"
            />
            <span
              aria-hidden="true"
              className="border-accent absolute -right-px -bottom-px size-4 border-r-2 border-b-2"
            />
            <div className="mob:px-4 mob:pt-5 flex min-h-0 flex-1 flex-col px-7 pt-6 pb-4">
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div
                  className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
                >
                  {docView.ids.length ? x.docs.tag : x.docs.kb}
                </div>
                <button
                  type="button"
                  onClick={() => setDocView(null)}
                  aria-label={x.close}
                  className={`${iconBtn} -mt-1.5 size-9 text-lg`}
                >
                  ×
                </button>
              </div>
              <div className="mt-1.5 flex min-h-0 flex-1 flex-col">
                <DocViewer
                  key={docView.focus}
                  docs={session.docs ?? []}
                  ids={docView.ids}
                  focus={docView.focus}
                  x={x.docs}
                />
              </div>
            </div>
            <div className="border-line2 mob:px-4 mob:pb-[calc(12px+env(safe-area-inset-bottom))] flex shrink-0 items-center justify-end gap-2 border-t px-7 py-3">
              <button
                type="button"
                onClick={() => setDocView(null)}
                className="border-line2 text-ink mob:h-11 h-10 cursor-pointer border bg-transparent px-4 text-sm"
              >
                {x.close}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cv && (
        <div className="bg-scrim mob:place-items-stretch mob:p-0 absolute inset-0 z-30 grid place-items-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-label={x.close}
            onClick={() => setCv(null)}
            className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jd-cv-title"
            className="bg-panel border-line2 mob:h-dvh mob:max-h-dvh mob:max-w-none mob:border-0 relative flex max-h-[calc(100dvh-34px)] w-full max-w-[760px] flex-col border"
          >
            <span
              aria-hidden="true"
              className="border-accent absolute -top-px -left-px size-4 border-t-2 border-l-2"
            />
            <span
              aria-hidden="true"
              className="border-accent absolute -right-px -bottom-px size-4 border-r-2 border-b-2"
            />
            <div className="mob:px-4 mob:pt-5 flex min-h-0 flex-1 flex-col px-7 pt-6 pb-4">
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div>
                  <div
                    className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
                  >
                    {x.cvTag}
                  </div>
                  <h2
                    id="jd-cv-title"
                    className="mt-1.5 mb-0 text-[clamp(20px,4svh,24px)] font-medium tracking-[-0.03em]"
                  >
                    {x.cvTitle}
                  </h2>
                  <p className="text-muted m-0 mt-1 text-[13px]">{x.cvNote}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCv(null)}
                  aria-label={x.close}
                  className={`${iconBtn} size-9 text-lg`}
                >
                  ×
                </button>
              </div>
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                <CvViewer ids={cv.ids} focus={cv.focus} />
              </div>
            </div>
            <div className="border-line2 mob:px-4 mob:pb-[calc(12px+env(safe-area-inset-bottom))] flex shrink-0 items-center justify-end gap-2 border-t px-7 py-3">
              <button
                type="button"
                onClick={() => setCv(null)}
                className="border-line2 text-ink mob:h-11 h-10 cursor-pointer border bg-transparent px-4 text-sm"
              >
                {x.close}
              </button>
              <a
                href={cvPdf}
                download
                className="bg-accent text-on-accent mob:h-11 inline-flex h-10 items-center px-4 text-sm font-semibold no-underline"
              >
                {x.cvDownload}
              </a>
            </div>
          </div>
        </div>
      )}

      {intro &&
        (() => {
          // Same sizing as the demo dialogs: the 16:9 frame shrinks with the
          // viewport height so the steps and contact stay in view.
          const frameWidth = `min(100%, calc((100dvh - ${phone ? 260 : 540}px) * 16 / 9))`;
          return (
            <div className="bg-scrim mob:place-items-stretch mob:p-0 absolute inset-0 z-30 grid place-items-center p-4">
              <button
                type="button"
                tabIndex={-1}
                aria-label={x.close}
                onClick={() => setIntro(false)}
                className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
              />
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="jd-intro-title"
                aria-describedby="jd-intro-body"
                className="bg-panel border-line2 mob:h-dvh mob:max-h-dvh mob:max-w-none mob:border-0 relative flex max-h-[calc(100dvh-34px)] w-full max-w-[760px] flex-col border"
              >
                <span
                  aria-hidden="true"
                  className="border-accent absolute -top-px -left-px size-4 border-t-2 border-l-2"
                />
                <span
                  aria-hidden="true"
                  className="border-accent absolute -right-px -bottom-px size-4 border-r-2 border-b-2"
                />
                <div className="mob:px-4 mob:pt-5 min-h-0 flex-1 overflow-y-auto px-7 pt-6 pb-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div
                        className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
                      >
                        {x.introTag}
                      </div>
                      <h2
                        id="jd-intro-title"
                        className="mt-1.5 mb-0 text-[clamp(20px,4svh,24px)] font-medium tracking-[-0.03em]"
                      >
                        {x.introTitle}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIntro(false)}
                      aria-label={x.close}
                      className={`${iconBtn} size-9 shrink-0 text-lg`}
                    >
                      ×
                    </button>
                  </div>
                  <p
                    id="jd-intro-body"
                    className="text-body mt-2 mb-0 text-sm leading-[1.55]"
                  >
                    {x.introBody}
                  </p>
                  {c.video ? (
                    <video
                      src={c.video.src}
                      controls
                      preload="metadata"
                      style={{ width: frameWidth }}
                      className="border-line2 bg-bg mx-auto mt-4 block aspect-video max-w-full border"
                    >
                      <track
                        kind="captions"
                        src={c.video.captions}
                        srcLang={es ? 'es' : 'en'}
                        label={es ? 'Español' : 'English'}
                        default
                      />
                    </video>
                  ) : (
                    <div
                      style={{ width: frameWidth }}
                      className="border-line2 bg-bg dots text-muted mx-auto mt-4 flex aspect-video max-w-full flex-col items-center justify-center gap-3 border border-dashed p-4 text-center text-sm"
                    >
                      <span className="border-line2 grid size-12 place-items-center border">
                        <Icon d={I.play} size={20} />
                      </span>
                      {x.videoSoon}
                    </div>
                  )}
                  <div className="mob:grid-cols-1 mt-5 grid grid-cols-2 gap-x-7 gap-y-5">
                    <section aria-labelledby="jd-intro-run">
                      <h3 id="jd-intro-run" className={`${label} m-0`}>
                        {x.introRun}
                      </h3>
                      <ol className="text-body m-0 mt-2 flex list-none flex-col gap-2 p-0 text-[13px] leading-[1.5]">
                        {x.introSteps.map((step, i) => (
                          <li key={i} className="flex gap-2.5">
                            <span
                              aria-hidden="true"
                              className={`${mono} text-accent shrink-0 text-[11px] leading-[1.75]`}
                            >
                              0{i + 1}
                            </span>
                            <span>
                              {i === 0 ? (
                                <a
                                  href={KEYS_URL}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent underline underline-offset-2"
                                >
                                  {step}
                                </a>
                              ) : (
                                step
                              )}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </section>
                    <section aria-labelledby="jd-intro-talk">
                      <h3 id="jd-intro-talk" className={`${label} m-0 mb-2`}>
                        {x.introTalk}
                      </h3>
                      <ContactActions
                        input={INTRO_CONTACT}
                        x={x}
                        inset={false}
                      />
                    </section>
                  </div>
                </div>
                <div className="border-line2 mob:px-4 mob:pb-[calc(12px+env(safe-area-inset-bottom))] flex shrink-0 justify-end gap-2 border-t px-7 py-3">
                  <button
                    type="button"
                    onClick={() => setIntro(false)}
                    className="border-line2 text-ink mob:h-11 mob:flex-1 h-10 cursor-pointer border bg-transparent px-4 text-sm"
                  >
                    {x.introBrowse}
                  </button>
                  <button
                    type="button"
                    data-autofocus
                    onClick={() => {
                      setIntro(false);
                      openKeys(PROVIDER);
                    }}
                    className="bg-accent text-on-accent mob:h-11 mob:flex-1 h-10 cursor-pointer border-0 px-4 text-sm font-semibold"
                  >
                    {x.introAddKey}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {info &&
        (() => {
          const ic = CASES.find((k) => k.id === infoCase) ?? CASES[0];
          const video = info === 'video';
          // Height taken by everything around the 16:9 frame (dialog margin,
          // header, case picker or text, footer).
          const chrome = video ? (phone ? 300 : 280) : phone ? 320 : 300;
          const frameWidth = `min(100%, calc((100dvh - ${chrome}px) * 16 / 9))`;
          return (
            <div className="bg-scrim mob:place-items-stretch mob:p-0 absolute inset-0 z-30 grid place-items-center p-4">
              <button
                type="button"
                tabIndex={-1}
                aria-label={x.close}
                onClick={() => setInfo(null)}
                className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
              />
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="jd-info-title"
                className="bg-panel border-line2 mob:h-dvh mob:max-h-dvh mob:max-w-none mob:border-0 relative flex max-h-[calc(100dvh-34px)] w-full max-w-[760px] flex-col border"
              >
                <span
                  aria-hidden="true"
                  className="border-accent absolute -top-px -left-px size-4 border-t-2 border-l-2"
                />
                <span
                  aria-hidden="true"
                  className="border-accent absolute -right-px -bottom-px size-4 border-r-2 border-b-2"
                />
                {/* Build dialog: title and diagram stay put; only the text below
                    scrolls once it outgrows the space left. */}
                <div
                  className={`mob:px-4 mob:pt-5 min-h-0 flex-1 px-7 pt-6 pb-4 ${video ? 'overflow-y-auto' : 'flex flex-col'}`}
                >
                  <div className="flex shrink-0 items-start justify-between gap-3">
                    <div>
                      <div
                        className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
                      >
                        {video ? x.videoTag : x.buildTag}
                      </div>
                      <h2
                        id="jd-info-title"
                        className="mt-1.5 mb-0 text-[clamp(20px,4svh,24px)] font-medium tracking-[-0.03em]"
                      >
                        {video ? x.videoTitle : x.buildTitle}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInfo(null)}
                      aria-label={x.close}
                      className={`${iconBtn} size-9 text-lg`}
                    >
                      ×
                    </button>
                  </div>
                  {video && (
                    <div
                      role="group"
                      aria-label={x.caseLabel}
                      className="mt-4 flex flex-wrap gap-1.5"
                    >
                      {CASES.map((k) => {
                        const on = k.id === ic.id;
                        return (
                          <button
                            key={k.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setInfoCase(k.id)}
                            className={`mob:min-h-11 min-h-9 cursor-pointer border px-3 text-[13px] transition-colors ${on ? 'border-accent bg-accent text-on-accent' : 'border-line2 text-ink hover:border-accent bg-transparent'}`}
                          >
                            {pick(k.label, es)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* 16:9 frame sized from the viewport height too, so the
                      whole dialog fits without scrolling on short screens. */}
                  {video && ic.video ? (
                    <video
                      key={ic.id}
                      src={ic.video.src}
                      controls
                      preload="metadata"
                      style={{ width: frameWidth }}
                      className="border-line2 bg-bg mx-auto mt-4 block aspect-video max-w-full border"
                    >
                      <track
                        kind="captions"
                        src={ic.video.captions}
                        srcLang={es ? 'es' : 'en'}
                        label={es ? 'Español' : 'English'}
                        default
                      />
                    </video>
                  ) : (
                    <div
                      style={{ width: frameWidth }}
                      className="border-line2 bg-bg dots text-muted mx-auto mt-4 flex aspect-video max-w-full shrink-0 flex-col items-center justify-center gap-3 border border-dashed p-4 text-center text-sm"
                    >
                      <span className="border-line2 grid size-12 place-items-center border">
                        <Icon d={video ? I.play : I.diagram} size={20} />
                      </span>
                      {video ? x.videoSoon : x.diagramSoon}
                    </div>
                  )}
                  {!video && (
                    <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                      <p className="text-body m-0 text-sm leading-[1.55]">
                        {x.buildSoon}
                      </p>
                    </div>
                  )}
                </div>
                <div
                  className={`border-line2 mob:px-4 mob:pb-[calc(12px+env(safe-area-inset-bottom))] flex shrink-0 items-center gap-2.5 border-t px-7 py-3 ${video ? 'justify-between' : 'justify-end'}`}
                >
                  {video && (
                    <span className={`${mono} text-muted truncate text-[11px]`}>
                      {caseModel(ic).short} · {caseTools(ic).length}{' '}
                      {x.toolsWord}
                    </span>
                  )}
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setInfo(null)}
                      className="border-line2 text-ink mob:h-11 h-10 cursor-pointer border bg-transparent px-4 text-sm"
                    >
                      {x.close}
                    </button>
                    {video && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setInfo(null);
                          pickCase(ic);
                        }}
                        className="bg-accent text-on-accent mob:h-11 h-10 cursor-pointer border-0 px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {x.tryCase}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

// Markdown links and bare URLs in an answer become real links, so cited
// sources can be opened. CV citations open the CV viewer on the cited items,
// document citations the document viewer on the cited passages.
const LINK =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
type OnCv = (focus: string, ids: string[]) => void;
/** The sources line with repeated links folded: passages of the same page
 * share a label ("contract.pdf · p. 3"), so only the first of each shows.
 * The viewer still highlights all of them (ids come from the full text).
 * Lines with anything but links and separators are left as they are. */
const foldSources = (line: string) => {
  const links = [...line.matchAll(LINK)].filter((m) => m[1]);
  if (links.length < 2) return line;
  const head = line.slice(0, links[0].index);
  let rest = line.slice(links[0].index);
  for (const m of links) rest = rest.replace(m[0], '');
  if (!/^[\s·,;|]*$/.test(rest)) return line;
  const seen = new Set<string>();
  const kept = links.filter((m) => !seen.has(m[1]) && !!seen.add(m[1]));
  return head + kept.map((m) => m[0]).join(' · ');
};
/** Ids cited anywhere in the text, so the viewer highlights them all. */
const cited = (text: string, linkId: (href: string) => string | null) => [
  ...new Set(
    [...text.matchAll(LINK)].flatMap((m) => {
      const id = linkId(m[2] ?? m[3]);
      return id ? [id] : [];
    }),
  ),
];
interface LinkCtx {
  onCv: OnCv;
  cvLabel: string;
  cvIds: string[];
  onDoc: OnCv;
  docLabel: string;
  docIds: string[];
}
function Linked({
  text,
  onCv,
  cvLabel,
  cvIds,
  onDoc,
  docLabel,
  docIds,
}: { text: string } & LinkCtx) {
  const matches = [...text.matchAll(LINK)];
  const out: (string | React.JSX.Element)[] = [];
  let last = 0;
  for (const match of matches) {
    const i = match.index;
    if (i > last) out.push(text.slice(last, i));
    const href = match[2] ?? match[3];
    const cvId = cvLinkId(href);
    const docId = cvId ? null : docLinkId(href);
    out.push(
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={cvId ? cvLabel : docId ? docLabel : undefined}
        onClick={
          cvId
            ? (e) => {
                // Modified clicks still open the PDF itself.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
                e.preventDefault();
                onCv(cvId, cvIds);
              }
            : docId
              ? (e) => {
                  // The document only lives in this tab: always the viewer.
                  e.preventDefault();
                  onDoc(docId, docIds);
                }
              : undefined
        }
        className="text-accent underline underline-offset-2"
      >
        {match[1] ?? href}
      </a>,
    );
    last = i + match[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/** Seconds as m:ss. */
const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const ORDER_TOOLS = ['update_order', 'place_order'];
// Bumped when a case switch clears the sessions: Knowledge Base reads that
// started before it are dropped instead of landing in the cleared one.
// Module state, so it also holds across a remount of the island.
let kbGeneration = 0;
// Bumped on every file pick (and case switch): a slow file still being read
// when another is picked is dropped, so the latest pick always wins.
let pickSeq = 0;
// show_menu calls already seen, by tool call id, so each full menu opens
// once.
const menusOpened = new Set<string>();
// get_policy calls already seen, so each opens the policy dialog once.
const policiesOpened = new Set<string>();
const usd = (n: number) => `$${n.toFixed(2)}`;

// The Order assistant's order, as its tools left it. "Place order" sends the
// confirmation as a user message, so the model still calls place_order.
// Both cards render in the conversation's language (from the tools), which
// may differ from the page's.
function OrderCard({
  order,
  busy,
  onPlace,
}: {
  order: Order;
  busy: boolean;
  onPlace: () => void;
}) {
  const placed = order.status === 'placed';
  const x = CHAT[order.lang];
  const pick = (l: { en: string; es: string }) => l[order.lang];
  const row = 'flex items-baseline justify-between gap-4';
  return (
    <section
      aria-label={placed ? x.order.placedTitle : x.order.title}
      className="bg-panel border-line2 mob:max-w-full ml-3 flex max-w-[min(88%,420px)] flex-col gap-3 border p-4 text-[13px]"
    >
      <div className={row}>
        <span
          className={`${mono} text-accent text-[11px] tracking-wider uppercase`}
        >
          {placed ? x.order.placedTitle : x.order.title}
        </span>
        {order.order_id && (
          <span className={`${mono} text-muted text-[11px]`}>
            {order.order_id}
          </span>
        )}
      </div>
      {order.lines.length === 0 ? (
        <p className="text-muted m-0">{x.order.empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {order.lines.map((l) => {
            const d = dish(l.item_id);
            return (
              <li key={l.line_id} className="flex flex-col gap-0.5">
                <div className={row}>
                  <span className="text-ink">
                    <span className={`${mono} text-muted`}>{l.quantity}×</span>{' '}
                    {d ? pick(d.name) : l.item_id}
                  </span>
                  <span className={`${mono} text-ink`}>{usd(l.subtotal)}</span>
                </div>
                {(l.options.length > 0 || l.note) && (
                  <span className="text-muted text-[12px] leading-snug">
                    {[
                      ...l.options.map((o) => pick(optionLabel(l.item_id, o))),
                      ...(l.note ? [`“${l.note}”`] : []),
                    ].join(' · ')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {order.lines.length > 0 && (
        <div className="border-line2 flex flex-col gap-1 border-t pt-2">
          <div className={`${row} text-muted`}>
            <span>{x.order.subtotal}</span>
            <span className={mono}>{usd(order.subtotal)}</span>
          </div>
          <div className={`${row} text-muted`}>
            <span>{x.order.tax}</span>
            <span className={mono}>{usd(order.tax)}</span>
          </div>
          <div className={`${row} text-ink font-semibold`}>
            <span>{x.order.total}</span>
            <span className={mono}>{usd(order.total)}</span>
          </div>
        </div>
      )}
      {placed ? (
        <p className="text-muted m-0 text-[12px] leading-normal">
          {x.order.pickup.replace('{m}', String(order.eta_min ?? 20))}.{' '}
          {x.order.simulated}
        </p>
      ) : (
        order.lines.length > 0 && (
          <button
            type="button"
            onClick={onPlace}
            disabled={busy}
            className="bg-accent text-on-accent mob:h-8 mob:gap-1.5 mob:px-2 mob:text-xs inline-flex h-9 items-center justify-center px-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {x.order.place} · {usd(order.total)}
          </button>
        )
      )}
    </section>
  );
}

// show_menu's input: which dishes and in what language. A call with neither
// category nor ids is the whole menu, shown in a dialog instead of the log.
const menuArgs = (input: string) => {
  try {
    const a = JSON.parse(input) as {
      category?: Category;
      item_ids?: string[];
      lang?: unknown;
    };
    const lang: Lang = a.lang === 'es' ? 'es' : 'en';
    return {
      lang,
      full: !a.category && !a.item_ids?.length,
      dishes: menuSelection(a.category, a.item_ids),
    };
  } catch {
    return null;
  }
};

// Dishes by category. With `onPick`, tapping an available dish puts an order
// for it in the composer; without it the list is view only.
function MenuList({
  dishes,
  lang,
  onPick,
}: {
  dishes: Dish[];
  lang: Lang;
  onPick?: (draft: string) => void;
}) {
  const x = CHAT[lang];
  const groups = [...new Set(dishes.map((d) => d.category))];
  const row =
    'flex w-full items-baseline justify-between gap-4 px-1 py-1.5 text-left';
  return groups.map((g) => (
    <div key={g} className="flex flex-col gap-1">
      <span className={`${mono} text-muted text-[11px] uppercase`}>
        {CATEGORY_LABEL[g][lang]}
      </span>
      <ul className="m-0 flex list-none flex-col p-0">
        {dishes
          .filter((d) => d.category === g)
          .map((d) => {
            const body = (
              <>
                <span className="flex flex-col gap-0.5">
                  <span className="text-ink">
                    {d.name[lang]}
                    {d.tags
                      // Vegan already says vegetarian.
                      .filter(
                        (t) =>
                          TAG_LABEL[t] &&
                          !(t === 'vegetarian' && d.tags.includes('vegan')),
                      )
                      .map((t) => (
                        <span
                          key={t}
                          className={`${mono} text-accent ml-2 text-[10px] uppercase`}
                        >
                          {TAG_LABEL[t][lang]}
                        </span>
                      ))}
                  </span>
                  <span className="text-muted text-[12px] leading-snug">
                    {d.description[lang]}
                  </span>
                </span>
                <span className={`${mono} text-ink shrink-0`}>
                  {d.available ? usd(d.price) : x.order.soldOut}
                </span>
              </>
            );
            return (
              <li key={d.id}>
                {onPick ? (
                  <button
                    type="button"
                    disabled={!d.available}
                    onClick={() =>
                      onPick(x.order.want.replace('{d}', d.name[lang]))
                    }
                    title={d.available ? x.order.tapHint : undefined}
                    className={`${row} hover:bg-bg/40 cursor-pointer border-0 bg-transparent disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={`${row} ${d.available ? '' : 'opacity-50'}`}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
      </ul>
    </div>
  ));
}

// A filtered show_menu (a category or some dishes) goes in the log as a card
// to order from; the whole menu leaves a button that reopens its dialog.
function MenuCard({
  input,
  onPick,
  onOpen,
}: {
  input: string;
  onPick: (draft: string) => void;
  onOpen: (lang: Lang) => void;
}) {
  const m = menuArgs(input);
  if (!m || !m.dishes.length) return null;
  const x = CHAT[m.lang];
  if (m.full)
    return (
      <div className="pl-3">
        <button
          type="button"
          onClick={() => onOpen(m.lang)}
          className="border-line2 text-ink hover:border-accent mob:h-8 mob:gap-1.5 mob:px-2 mob:text-xs inline-flex h-8 cursor-pointer items-center gap-2 border bg-transparent px-3 text-[13px] transition-colors"
        >
          {x.order.openMenu}
        </button>
      </div>
    );
  return (
    <section
      aria-label={x.order.menu}
      className="bg-panel border-line2 mob:max-w-full ml-3 flex max-w-[min(88%,520px)] flex-col gap-3 border p-4 text-[13px]"
    >
      <span
        className={`${mono} text-accent text-[11px] tracking-wider uppercase`}
      >
        {x.order.menu}
      </span>
      <MenuList dishes={m.dishes} lang={m.lang} onPick={onPick} />
      <p className="text-muted m-0 text-[11px]">{x.order.tapHint}</p>
    </section>
  );
}

// Auto insurance cards. Each renders in the language its tool was called
// with (the conversation's), like the order cards.
const langArg = (input: string): Lang => {
  try {
    return (JSON.parse(input) as { lang?: unknown }).lang === 'es'
      ? 'es'
      : 'en';
  } catch {
    return 'en';
  }
};
const cardTitle = `${mono} text-accent text-[11px] tracking-wider uppercase`;
const cardBox =
  'bg-panel border-line2 mob:max-w-full ml-3 flex max-w-[min(88%,440px)] flex-col gap-3 border p-4 text-[13px]';
const cardRow = 'flex items-baseline justify-between gap-4';

// get_policy: the account's policy, car and coverages, shown in a dialog.
function PolicyDetails({ lang, holder }: { lang: Lang; holder: string }) {
  const x = CHAT[lang].insurance;
  const p = describePolicy(lang, holder);
  const v = POLICY.vehicle;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className={`${mono} text-accent text-[11px]`}>
          {p.policy_number}
        </span>
        <span className="text-ink font-semibold">
          {v.year} {v.make} {v.model} · {p.vehicle.color_label}
        </span>
        <span className="text-muted text-[12px]">
          {p.holder} · {x.plate} {v.plate}
        </span>
        <span className="text-muted text-[12px]">
          {x.start} {p.start} · {x.noEnd} ·{' '}
          {x.premium.replace('{n}', `$${POLICY.premium_month}`)}
        </span>
      </div>
      <div className="border-line2 flex flex-col gap-1.5 border-t pt-2">
        <span className={`${mono} text-muted text-[11px] uppercase`}>
          {x.coverages}
        </span>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {p.coverages.map((c) => (
            <li key={c.id} className="flex flex-col gap-0.5">
              <div className={cardRow}>
                <span className="text-ink">{c.name}</span>
                <span className={`${mono} text-ink shrink-0 text-[12px]`}>
                  {c.deductible === null
                    ? ''
                    : c.deductible === 0
                      ? x.noDeductible
                      : `${x.deductible} $${c.deductible}`}
                </span>
              </div>
              <span className="text-muted text-[12px] leading-snug">
                {c.limit}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Document agent: the Knowledge Base the model answers from, as a row of
// slots above the composer. A filled slot opens the document; an empty one
// opens the file picker (PDFs and images).
function KnowledgeBase({
  open,
  canFold,
  onToggle,
  docs,
  max,
  reading,
  busy,
  x,
  onAdd,
  onSample,
  onOpen,
  onRemove,
}: {
  open: boolean;
  /** Only once the conversation started: before, it stays open. */
  canFold: boolean;
  onToggle: () => void;
  docs: Doc[];
  max: number;
  reading: number;
  busy: boolean;
  x: ChatCopy['docs'];
  onAdd: () => void;
  onSample: () => void;
  onOpen: (d: Doc) => void;
  onRemove: (id: string) => void;
}) {
  const empty = Math.max(0, max - docs.length - reading);
  const slot =
    'mob:h-[68px] relative flex h-[76px] min-w-0 flex-col items-center justify-center gap-1 border';
  const title = (
    <h3
      className={`${mono} text-accent m-0 shrink-0 text-[11px] font-normal tracking-[0.08em] uppercase`}
    >
      {x.kb}{' '}
      <span className="text-muted">
        {docs.length}/{max}
      </span>
    </h3>
  );
  const toggle = canFold && (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={open ? 'jd-kb-slots' : undefined}
      className="text-muted hover:text-ink mob:min-h-9 inline-flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px]"
    >
      {open ? x.hide : x.show}
      <span aria-hidden="true" className={open ? 'rotate-180' : undefined}>
        ▾
      </span>
    </button>
  );
  // Folded: one line with the documents, each still opens in the viewer.
  if (!open)
    return (
      <section
        aria-label={x.kb}
        className="border-line2 bg-panel mb-2 flex items-center gap-3 border px-3 py-1.5"
      >
        {title}
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {docs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onOpen(d)}
              title={`${x.openDoc} ${d.name}`}
              className={`${mono} border-line2 text-chip hover:border-accent hover:text-ink mob:h-9 inline-flex h-7 max-w-[180px] shrink-0 cursor-pointer items-center gap-1.5 border bg-transparent px-2 text-[10px] transition-colors`}
            >
              <Icon d={I.file} size={12} />
              <span className="truncate">{d.name}</span>
            </button>
          ))}
          {reading > 0 && (
            <span
              role="status"
              className="text-muted inline-flex shrink-0 items-center gap-1.5 text-[10px]"
            >
              <span
                aria-hidden="true"
                className="jd-blink bg-accent size-1.5"
              />
              {x.reading}
            </span>
          )}
        </div>
        {toggle}
      </section>
    );
  return (
    <section
      aria-label={x.kb}
      className="border-line2 bg-panel mb-2 border px-3 pt-2.5 pb-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {title}
        <div className="flex items-baseline gap-4">
          {docs.length === 0 && reading === 0 && (
            <button
              type="button"
              onClick={onSample}
              disabled={busy}
              className="text-accent hover:text-ink mob:min-h-9 cursor-pointer border-0 bg-transparent p-0 text-[12px] underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {x.sample}
            </button>
          )}
          {toggle}
        </div>
      </div>
      <p className="text-muted m-0 mt-0.5 text-[11px] leading-snug">
        {x.kbHint}
      </p>
      <ul
        id="jd-kb-slots"
        className="m-0 mt-2 grid list-none grid-cols-5 gap-2 p-0"
      >
        {docs.map((d) => (
          <li key={d.id} className={`${slot} border-line2 bg-bg`}>
            <button
              type="button"
              onClick={() => onOpen(d)}
              title={`${x.openDoc} ${d.name}`}
              className="hover:text-ink text-chip flex size-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 border-0 bg-transparent px-1.5 pt-1 pb-1.5"
            >
              {d.kind === 'image' ? (
                <img
                  src={`data:${d.type};base64,${d.data}`}
                  alt=""
                  className="h-8 min-h-0 w-full object-contain"
                />
              ) : (
                <Icon d={I.file} size={20} />
              )}
              <span
                className={`${mono} block w-full truncate text-center text-[10px]`}
              >
                {d.name}
              </span>
              <span className="text-muted text-[10px] leading-none">
                {d.kind === 'image'
                  ? x.image
                  : `PDF · ${d.pages.length} ${x.pages}`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(d.id)}
              disabled={busy}
              aria-label={`${x.remove} ${d.name}`}
              className="text-muted hover:text-ink bg-bg absolute -top-px -right-px grid size-6 cursor-pointer place-items-center border-0 p-0 text-sm leading-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              ×
            </button>
          </li>
        ))}
        {Array.from({ length: reading }, (_, i) => (
          <li
            key={`r${i}`}
            role="status"
            className={`${slot} border-line2 text-muted bg-bg text-[10px]`}
          >
            <span aria-hidden="true" className="jd-blink bg-accent size-1.5" />
            {x.reading}
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`e${i}`} className="contents">
            <button
              type="button"
              onClick={onAdd}
              disabled={busy}
              aria-label={x.add}
              title={x.add}
              className={`${slot} border-line2 text-muted hover:border-accent hover:text-accent cursor-pointer border-dashed bg-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Icon d={I.plus} size={16} />
              <span className="mob:hidden text-[10px]">{x.addShort}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Sample files offered next to "upload your own" when the assistant asks for
// a photo or a document: the insured car damaged, another car, and a body
// shop invoice for the first one.
interface Example {
  key: 'insured' | 'other' | 'invoice';
  src: string;
  type: string;
  file: { en: string; es: string };
}
const EXAMPLES: Record<'photo' | 'document', Example[]> = {
  photo: [
    {
      key: 'insured',
      src: insuredCarUrl,
      type: 'image/jpeg',
      file: { en: 'insured-car-damaged.jpg', es: 'auto-asegurado-chocado.jpg' },
    },
    {
      key: 'other',
      src: otherCarUrl,
      type: 'image/jpeg',
      file: { en: 'other-car.jpg', es: 'otro-auto.jpg' },
    },
  ],
  document: [
    {
      key: 'invoice',
      src: invoiceUrl,
      type: 'application/pdf',
      file: { en: 'body-shop-invoice.pdf', es: 'factura-taller.pdf' },
    },
  ],
};

// request_photo and request_document: a button that opens a choice between
// the examples and the file picker (the camera on phones), shown as sent once
// a later message carries a file.
function AttachRequest({
  kind,
  input,
  sent,
  busy,
  onUpload,
  onExample,
}: {
  kind: 'photo' | 'document';
  input: string;
  sent: boolean;
  busy: boolean;
  onUpload: () => void;
  onExample: (ex: Example, lang: Lang) => void;
}) {
  const [open, setOpen] = useState(false);
  const lang = langArg(input);
  const x = CHAT[lang].insurance;
  const ask = kind === 'photo' ? x.upload : x.uploadDoc;
  const btn =
    'mob:h-8 mob:gap-1.5 mob:px-2 mob:text-xs inline-flex h-9 cursor-pointer items-center gap-2 px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-60';
  if (sent || !open)
    return (
      <div className="mob:pr-3 flex flex-col items-start gap-1.5 pl-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={busy || sent}
          className={`${btn} bg-accent text-on-accent border-0 font-semibold`}
        >
          <Icon d={I.clip} size={14} />
          {sent ? x.sent : ask}
        </button>
        {!sent && (
          <span className="text-muted text-[12px] leading-snug">
            {kind === 'photo' ? x.photoHint : x.docHint}
          </span>
        )}
      </div>
    );
  return (
    <section aria-label={ask} className={cardBox}>
      <span className={cardTitle}>{x.examples}</span>
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
        {EXAMPLES[kind].map((ex) => (
          <li key={ex.key} className="mob:w-[calc(50%-6px)] w-[150px]">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onExample(ex, lang);
              }}
              className="border-line2 hover:border-accent flex w-full cursor-pointer flex-col gap-1.5 border bg-transparent p-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ex.type.startsWith('image/') ? (
                <img
                  src={ex.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={150}
                  height={90}
                  className="aspect-[5/3] h-auto w-full object-cover"
                />
              ) : (
                <span className="bg-bg text-muted grid aspect-[5/3] w-full place-items-center">
                  <Icon d={I.file} size={28} />
                </span>
              )}
              <span className="text-ink text-[12px] leading-snug font-semibold">
                {x.example[ex.key].title}
              </span>
              <span className="text-muted text-[11px] leading-snug">
                {x.example[ex.key].note}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            onUpload();
          }}
          className={`${btn} bg-accent text-on-accent border-0 font-semibold`}
        >
          <Icon d={I.clip} size={14} />
          {x.own}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`${btn} border-line2 text-ink hover:border-accent border bg-transparent`}
        >
          {x.close}
        </button>
      </div>
    </section>
  );
}

// file_claim and get_claim_status: the claim with its number. The status is
// always "in review": the demo stops there.
function ClaimCard({ claim }: { claim: Claim }) {
  const x = CHAT[claim.lang].insurance;
  const rows: [string, string][] = [
    [x.incident, INCIDENT_LABEL[claim.incident][claim.lang]],
    [x.date, claim.date],
    [x.deductible, claim.deductible ? `$${claim.deductible}` : x.noDeductible],
    [x.filed, claim.filed],
    [x.amount, claim.amount ? `$${claim.amount.toFixed(2)}` : x.amountPending],
    ...(claim.annex ? [[x.annex, claim.annex.name] as [string, string]] : []),
  ];
  return (
    <section aria-label={`${x.claim} ${claim.claim_id}`} className={cardBox}>
      <div className={cardRow}>
        <span className={cardTitle}>{x.claim}</span>
        <span
          className={`${mono} border-warn text-warn border px-1.5 py-0.5 text-[10px] uppercase`}
        >
          {x.inReview}
        </span>
      </div>
      <span className={`${mono} text-ink text-[15px] font-semibold`}>
        {claim.claim_id}
      </span>
      <dl className="m-0 flex flex-col gap-1">
        {rows.map(([k, v]) => (
          <div key={k} className={cardRow}>
            <dt className="text-muted">{k}</dt>
            <dd className="text-ink m-0 text-right">{v}</dd>
          </div>
        ))}
        {claim.damage_areas.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted">{x.damage}</dt>
            <dd className="text-ink m-0">
              {claim.damage_areas
                .map((a) => DAMAGE_AREA_LABEL[a][claim.lang])
                .join(' · ')}
            </dd>
          </div>
        )}
      </dl>
      <p className="text-muted m-0 text-[11px] leading-normal">
        {COVERAGE[claim.coverage].label[claim.lang]} · {x.claimNote}
      </p>
    </section>
  );
}

// Contact buttons from show_contact_options. The booking page can't be
// prefilled, so the meeting button comes with a hint to describe the meeting
// in its form. They render in the language the tool was called with (the
// conversation's), like the order and insurance cards; without one (the CV
// intro), in the page's.
function ContactActions({
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

// Inline Markdown: **bold**, *italic*, `code`, then links in plain runs.
// Built as React nodes, never as HTML, so model output can't inject markup.
const INLINE =
  /\*\*(.+?)\*\*|`([^`\n]+)`|(?<![\w*])\*(?![\s*])([^*\n]+?)\*(?![\w*])/g;
function Inline({ text, ctx }: { text: string; ctx: LinkCtx }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index;
    if (i > last)
      out.push(<Linked key={`t${i}`} text={text.slice(last, i)} {...ctx} />);
    out.push(
      m[1] !== undefined ? (
        <strong key={i} className="text-ink font-semibold">
          <Inline text={m[1]} ctx={ctx} />
        </strong>
      ) : m[2] !== undefined ? (
        <code
          key={i}
          className="bg-panel border-line2 border px-1 font-mono text-[12px]"
        >
          {m[2]}
        </code>
      ) : (
        <em key={i}>
          <Inline text={m[3]} ctx={ctx} />
        </em>
      ),
    );
    last = i + m[0].length;
  }
  out.push(<Linked key="end" text={text.slice(last)} {...ctx} />);
  return out;
}

// Block Markdown: paragraphs, bullet and numbered lists, headings. `tail`
// (the streaming cursor) is drawn at the end of the last block.
type Block =
  { kind: 'p' | 'h'; lines: string[] } | { kind: 'ul' | 'ol'; lines: string[] };
function Markdown({
  text,
  ctx,
  tail,
}: {
  text: string;
  ctx: LinkCtx;
  tail?: React.ReactNode;
}) {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const head = /^#{1,4}\s+(.*)$/.exec(line);
    const kind = bullet ? 'ul' : num ? 'ol' : head ? 'h' : line ? 'p' : null;
    const content = (bullet ?? num ?? head)?.[1] ?? line;
    const prev = blocks.at(-1);
    if (!kind) blocks.push({ kind: 'p', lines: [] });
    else if (prev && prev.kind === kind && kind !== 'h')
      prev.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }
  const shown = blocks.filter((b) => b.lines.length);
  return shown.map((b, k) => {
    const end = k === shown.length - 1 ? tail : null;
    if (b.kind === 'ul' || b.kind === 'ol') {
      const List = b.kind;
      return (
        <List
          key={k}
          className={`m-0 flex flex-col gap-0.5 pl-5 ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}
        >
          {b.lines.map((l, j) => (
            <li key={j}>
              <Inline text={l} ctx={ctx} />
              {j === b.lines.length - 1 && end}
            </li>
          ))}
        </List>
      );
    }
    return (
      <p
        key={k}
        className={`m-0 ${b.kind === 'h' ? 'text-ink font-semibold' : ''}`}
      >
        {b.lines.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            <Inline text={l} ctx={ctx} />
          </Fragment>
        ))}
        {end}
      </p>
    );
  });
}

// The answer's closing sources line ("Sources:", "Fuentes:"… one word and a
// colon, then links or names joined by " · ") is set apart in smaller type.
function splitSources(text: string) {
  const cut = text.trimEnd().lastIndexOf('\n');
  const last = text
    .slice(cut + 1)
    .trim()
    .replace(/^\*\*([^*]+)\*\*/, '$1');
  return cut > 0 &&
    /^[\p{L}]{2,20}:\s/u.test(last) &&
    (last.includes('](') || last.includes(' · '))
    ? { body: text.slice(0, cut).trimEnd(), sources: last }
    : { body: text, sources: '' };
}

type ToolCall = Extract<ChatItem, { kind: 'tool' }>;

/** The consecutive tool calls starting at `i`. */
const toolRun = (items: ChatItem[], i: number) => {
  const run: ToolCall[] = [];
  for (let k = i; items[k]?.kind === 'tool'; k++)
    run.push(items[k] as ToolCall);
  return run;
};

// Tool calls of a turn, folded into one line ("3 tools used"); opening it
// lists each call, and each call opens to show its input.
function ToolGroup({ items, x }: { items: ToolCall[]; x: ChatCopy }) {
  const running = items.find((t) => t.status === 'running');
  const failed = items.some((t) => t.status === 'error');
  const ms = items.reduce((sum, t) => sum + (t.ms ?? 0), 0);
  return (
    <details className="jd-tool text-muted font-mono text-[10px]">
      <summary className="desk:min-h-0 flex min-h-9 items-center gap-2 py-0.5 pl-3.5">
        <span className="text-accent">tool_use</span>
        <span className="text-chip truncate">
          {running
            ? `${running.name}…`
            : `${items.length} ${items.length === 1 ? x.toolUsed : x.toolsUsed}`}
        </span>
        {!running && (
          <span className={`shrink-0 ${failed ? 'text-warn' : ''}`}>
            · {ms} ms
          </span>
        )}
        <span
          aria-hidden="true"
          className="jd-chev inline-block shrink-0 transition-transform"
        >
          ▾
        </span>
      </summary>
      <div className="border-line2 mt-1 ml-3.5 flex flex-col border-l border-dashed">
        {items.map((t) => (
          <ToolRow key={t.id} m={t} />
        ))}
      </div>
    </details>
  );
}

function ToolRow({ m }: { m: ToolCall }) {
  const status = m.status === 'running' ? '…' : m.result;
  const ms = m.ms !== null ? ` · ${m.ms} ms` : '';
  return (
    <details className="jd-tool">
      <summary className="desk:min-h-0 flex min-h-9 items-center gap-2 px-2.5 py-0.5">
        <span className="text-chip shrink-0">{m.name}</span>
        <span
          className={`ml-auto min-w-0 truncate ${m.status === 'error' ? 'text-warn' : ''}`}
        >
          {status}
          {ms}
        </span>
        <span
          aria-hidden="true"
          className="jd-chev inline-block shrink-0 transition-transform"
        >
          ▾
        </span>
      </summary>
      <div className="text-chip px-2.5 pb-1.5 leading-normal break-words">
        {m.name}({m.input || '…'})
      </div>
    </details>
  );
}

function Message({
  m,
  onCv,
  cvLabel,
  onDoc,
  docLabel,
}: {
  m: ChatItem;
  onCv: OnCv;
  cvLabel: string;
  onDoc: OnCv;
  docLabel: string;
}) {
  if (m.kind === 'user') {
    return (
      <div className="mob:max-w-[85%] flex max-w-[80%] flex-col items-end gap-1.5 self-end">
        {m.files.map((f, i) =>
          f.src && IMAGE_TYPES.includes(f.type) ? (
            <img
              key={i}
              src={f.src}
              alt={f.name}
              title={f.name}
              className="border-line2 mob:max-w-[min(100%,200px)] block max-h-48 w-auto max-w-[240px] border object-contain"
            />
          ) : (
            <a
              key={i}
              href={f.src}
              download={f.name}
              title={f.name}
              className={`${mono} border-line2 bg-panel text-chip hover:border-accent hover:text-ink mob:min-h-9 inline-flex items-center gap-2 border px-2 py-1 text-[10px] no-underline transition-colors`}
            >
              <Icon d={I.file} size={13} />
              {f.name}
            </a>
          ),
        )}
        {m.text && (
          <div className="bg-panel border-line2 border px-2.5 py-1.5 text-[13px] leading-normal whitespace-pre-wrap">
            {m.text}
          </div>
        )}
      </div>
    );
  }
  if (m.kind === 'tool') return <ToolRow m={m} />;

  if (m.kind === 'notice') return null;
  const { body, sources: raw } = splitSources(m.text);
  const sources = foldSources(raw);
  const ctx = {
    onCv,
    cvLabel,
    cvIds: cited(m.text, cvLinkId),
    onDoc,
    docLabel,
    docIds: cited(m.text, docLinkId),
  };
  return (
    <div className="mob:max-w-full flex max-w-[88%] flex-col gap-1">
      <div className="border-accent flex flex-col gap-1.5 border-l-2 py-0.5 pl-3 text-[13px] leading-[1.55] break-words">
        <Markdown
          text={body}
          ctx={ctx}
          tail={
            m.streaming && (
              <span
                aria-hidden="true"
                className="jd-blink bg-accent ml-[3px] inline-block h-3.5 w-[7px] align-[-2px]"
              />
            )
          }
        />
        {sources && (
          <span className="text-muted text-[11px] leading-normal">
            <Inline text={sources} ctx={ctx} />
          </span>
        )}
      </div>
      <div className={`${mono} text-muted pl-4 text-[10px] tracking-[0.04em]`}>
        {m.meta}
      </div>
    </div>
  );
}

// Notices already typed out. Module state, so returning to the chat (or a
// language switch) shows them whole instead of typing them again.
const typed = new Set<number>();
const TYPE_MS = 14;

// An error, told by the assistant: typed out like a streamed answer, then
// the button that fixes it.
function Notice({
  id,
  text,
  fix,
  fixLabel,
  labels,
  onFix,
}: {
  id: number;
  text: string;
  fix?: Fix;
  fixLabel: (t: string) => string;
  labels: ChatCopy['fixes'];
  onFix: (f: Fix) => void;
}) {
  const [n, setN] = useState(() =>
    typed.has(id) || matchMedia('(prefers-reduced-motion: reduce)').matches
      ? Infinity
      : 0,
  );
  const done = n >= text.length;
  useEffect(() => {
    if (done) {
      typed.add(id);
      return;
    }
    const t = setInterval(() => setN((v) => v + 1), TYPE_MS);
    return () => clearInterval(t);
  }, [done, id]);
  return (
    <div className="mob:max-w-full flex max-w-[88%] flex-col items-start gap-2.5">
      <div className="border-warn border-l-2 py-0.5 pl-3 text-[13px] leading-[1.55] whitespace-pre-wrap">
        {/* Screen readers get the whole message once, not every letter. */}
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">{text.slice(0, n)}</span>
        {!done && (
          <span
            aria-hidden="true"
            className="jd-blink bg-accent ml-[3px] inline-block h-3.5 w-[7px] align-[-2px]"
          />
        )}
      </div>
      {done && fix && (
        <button
          type="button"
          onClick={() => onFix(fix)}
          className={`jd-rise ${mono} border-accent text-accent hover:bg-accent hover:text-on-accent mob:h-9 ml-3.5 inline-flex h-8 cursor-pointer items-center gap-2 border bg-transparent px-3 text-[10px] tracking-[0.06em] uppercase transition-colors`}
        >
          {fixLabel(labels[fix])}
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}
