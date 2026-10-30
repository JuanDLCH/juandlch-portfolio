import { useStore } from '@nanostores/react';
import {
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
  readAttachment,
} from '../../lab/attachments';
import {
  CASES,
  PROVIDER,
  caseModel,
  caseTools,
  type ChatCase,
  type Provider,
} from '../../lab/chat/cases';
import { runTurn } from '../../lab/chat/turn';
import { cvLinkId, cvPdf } from '../../lab/chat/cv';
import CvViewer from './CvViewer';
import { transcribe } from '../../lab/chat/openai';
import {
  $busy,
  $caseId,
  $drafts,
  $keys,
  $sessions,
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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
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
};

const PROVIDER_NAME: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};
const BILLING: Record<Provider, string> = {
  anthropic: 'https://platform.claude.com/settings/billing',
  openai: 'https://platform.openai.com/settings/organization/billing/overview',
};
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

export default function ChatApp() {
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
  const c = CASES.find((k) => k.id === caseId) ?? CASES[0];
  const session = sessions[c.id] ?? emptySession();
  const draft = drafts[c.id] ?? '';
  const files = attachments[c.id] ?? [];
  const hasInput = draft.trim().length > 0 || files.length > 0;
  const chatKey = keys[PROVIDER];

  const [side, setSide] = useState(false);
  const [modal, setModal] = useState(false);
  // "Watch demo" and "How I'd build it" dialogs, each with its own case pick.
  const [info, setInfo] = useState<'video' | 'build' | null>(null);
  const [infoCase, setInfoCase] = useState(CASES[0].id);
  // CV viewer opened from a citation: the answer's cited items and the one
  // clicked.
  const [cv, setCv] = useState<{ ids: string[]; focus: string } | null>(null);
  const [keyDrafts, setKeyDrafts] = useState({ anthropic: '', openai: '' });
  // Key input the keys dialog focuses when it opens.
  const [keyFocus, setKeyFocus] = useState<'anthropic' | 'openai'>('anthropic');
  // Case waiting for confirmation: switching clears the conversation.
  const [switchTo, setSwitchTo] = useState<ChatCase | null>(null);
  const [rec, setRec] = useState<'off' | 'on' | 'busy'>('off');
  const recRef = useRef<MediaRecorder | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialog = modal
    ? 'keys'
    : info
      ? info
      : cv
        ? 'cv'
        : switchTo
          ? 'switch'
          : null;
  const dialogOpen = dialog !== null;
  const closeDialogs = () => {
    setModal(false);
    setInfo(null);
    setCv(null);
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
        setModal(false);
        setInfo(null);
        setCv(null);
        setSwitchTo(null);
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

  const openInfo = (kind: 'video' | 'build') => {
    setInfoCase(c.id);
    setInfo(kind);
    setSide(false);
  };
  const openKeys = (focus: 'anthropic' | 'openai' = 'anthropic') => {
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
  // A case starts from scratch: switching away from a started conversation
  // asks first, then clears it (and anything left in the new case).
  const pickCase = (k: ChatCase, confirmed = false) => {
    if ($busy.get()) return;
    setSide(false);
    if (k.id !== c.id) {
      if (!confirmed && getSession(c.id).items.length > 0) {
        setSwitchTo(k);
        return;
      }
      setSession(c.id, emptySession());
      setSession(k.id, emptySession());
      $caseId.set(k.id);
    }
    if (!($drafts.get()[k.id] ?? '').trim())
      $drafts.setKey(k.id, pick(k.starter, es));
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
      update: (s) => setSession(c.id, s),
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
    if ($busy.get() || !s.turn) return;
    void run(
      {
        ...s,
        items: s.items.slice(0, s.turn.items),
        api: s.api.slice(0, s.turn.api),
      },
      s.turn.input,
    );
  };

  const fix = (f: Fix) => {
    if (f === 'key' || f === 'keyReview') openKeys(PROVIDER);
    else if (f === 'voiceKey' || f === 'voiceKeyReview') openKeys('openai');
    else if (f === 'billing') open(BILLING[PROVIDER], '_blank', 'noopener');
    else if (f === 'retry') retry();
    else if (f === 'clear') setSession(c.id, emptySession());
    else fileRef.current?.click();
  };

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    // Read the store, not the render's `busy`: a transcription finishing
    // after a turn ended calls this from an older closure.
    if ((!text && files.length === 0) || $busy.get()) return;
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
      files: files.map((f) => f.name),
    };
    const input: UserInput = { text, files };
    setDraft('');
    $attachments.setKey(c.id, []);
    await run(
      {
        ...start,
        items: [...start.items, user],
        turn: { items: start.items.length + 1, api: start.api.length, input },
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

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (
        (!IMAGE_TYPES.includes(f.type) && f.type !== 'application/pdf') ||
        f.size > MAX_BYTES
      ) {
        notice('file');
        continue;
      }
      next.push(await readAttachment(f));
    }
    $attachments.setKey(c.id, next);
    if (fileRef.current) fileRef.current.value = '';
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
            href="/#lab"
            aria-label={x.backLabel}
            className={`${mono} border-line2 hover:border-accent mob:size-11 mob:justify-center mob:p-0 mob:text-base inline-flex h-9 shrink-0 items-center gap-2 border px-3 text-[11px] tracking-[0.06em] uppercase no-underline transition-colors`}
          >
            <span aria-hidden="true">←</span>
            <span className="mob:hidden">{x.back}</span>
          </a>
          <span
            aria-hidden="true"
            className="bg-line2 narrow:hidden h-6 w-px"
          />
          <div className="mob:hidden flex min-w-0 items-baseline gap-2.5">
            <h1 className="m-0 text-base font-medium tracking-[-0.02em] whitespace-nowrap">
              {x.title}
            </h1>
            <span className={`${label} narrow:hidden text-[11px]`}>
              Lab 02 · BYOK
            </span>
          </div>
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
        </div>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => setSide(!side)}
            aria-label={x.settings}
            className={`${iconBtn} narrow:grid mob:size-11 hidden size-9`}
          >
            <Icon d={I.sliders} />
          </button>
          <div className="mob:hidden">{langGroup()}</div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={themeLabel}
            title={themeLabel}
            className={`${iconBtn} mob:hidden size-9`}
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
            className="mob:px-3 min-h-0 flex-1 overflow-y-auto px-4 py-[clamp(12px,3svh,24px)]"
          >
            <div className="mx-auto flex max-w-[780px] flex-col gap-4">
              {session.items.length === 0 && (
                <div className="pt-[clamp(4px,3svh,32px)] pb-2">
                  <div
                    className={`${mono} text-accent text-[11px] tracking-[0.08em] uppercase`}
                  >
                    Lab 02
                  </div>
                  <h2 className="text-h2 mt-2 mb-0 leading-[1.05] font-medium tracking-[-0.04em]">
                    {x.emptyTitle}
                  </h2>
                  <p className="text-body mt-2 mb-0 max-w-[560px] text-sm leading-[1.55]">
                    {x.emptyBody}
                  </p>
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
                </div>
              )}
              {session.items.map((m, i) =>
                m.kind === 'notice' ? (
                  <Notice
                    key={`notice-${m.id}`}
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
                ) : (
                  <Message
                    key={i}
                    m={m}
                    onCv={(focus, ids) => setCv({ focus, ids })}
                    cvLabel={x.cvOpen}
                  />
                ),
              )}
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
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => void onFiles(e.target.files)}
              />
              <div className="border-line2 bg-panel border">
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                    {files.map((f, i) => (
                      <span
                        key={i}
                        className={`${mono} border-line2 text-chip inline-flex items-center gap-2 border px-2 py-1 text-[11px]`}
                      >
                        <Icon d={I.file} size={13} />
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
                      {rec === 'on' ? x.recording : x.transcribing}
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
                      id="jd-prompt"
                      rows={phone ? 1 : 2}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={phone ? x.placeholderShort : x.placeholder}
                      className="text-ink placeholder:text-muted mob:min-h-11 mob:min-w-0 mob:flex-1 mob:self-center mob:px-0 mob:py-2.5 mob:text-base mob:max-h-[8.5em] block [field-sizing:content] max-h-[8em] min-h-[2.6em] w-full resize-none border-0 bg-transparent px-3 pt-2.5 pb-1 text-sm leading-normal focus:outline-none"
                    />
                    <div className="mob:contents flex items-center justify-between gap-2 px-1.5 pb-1.5">
                      <div className="mob:contents flex gap-1">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          aria-label={x.attach}
                          title={x.attachHint}
                          className={`${iconBtn} text-muted size-11 border-transparent`}
                        >
                          <Icon d={I.clip} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onMic()}
                          disabled={busy}
                          aria-label={x.mic}
                          title={keys.openai ? x.mic : x.micNeedsKey}
                          className={`${iconBtn} mob:hidden size-11 border-transparent disabled:cursor-not-allowed disabled:opacity-40 ${keys.openai ? 'text-ink' : 'text-muted'}`}
                        >
                          <Icon d={I.mic} />
                        </button>
                      </div>
                      <div className="mob:contents flex items-center gap-2.5">
                        <span
                          className={`${mono} text-muted narrow:hidden text-[10px]`}
                        >
                          {model.name} · {c.effort}
                        </span>
                        {busy ? (
                          <button
                            type="button"
                            onClick={stopTurn}
                            aria-label={x.stop}
                            className="border-line2 text-ink grid size-11 cursor-pointer place-items-center border bg-transparent"
                          >
                            <Icon d={I.stop} size={14} />
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void send()}
                              aria-label={x.send}
                              className={`bg-accent text-on-accent grid size-11 shrink-0 cursor-pointer place-items-center border-0 ${hasInput ? '' : 'mob:hidden'}`}
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
                className={`${mono} text-muted mob:hidden mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1.5 text-[10px] tracking-[0.04em]`}
              >
                <span>{x.enterHint}</span>
                <span>{x.privacyLine}</span>
              </div>
            </div>
          </div>
        </main>

        {side && (
          <button
            type="button"
            aria-label={x.close}
            onClick={() => setSide(false)}
            className="bg-scrim narrow:block absolute inset-0 z-15 hidden cursor-pointer border-0 p-0"
          />
        )}
        <aside
          aria-label={x.settings}
          className={`border-line bg-panel narrow:absolute narrow:inset-y-0 narrow:right-0 narrow:z-20 narrow:w-[min(360px,92vw)] narrow:shadow-[-24px_0_48px_rgba(0,0,0,.35)] mob:inset-x-0 mob:top-auto mob:max-h-[86%] mob:w-auto mob:border-t mob:border-l-0 flex w-[272px] shrink-0 flex-col border-l ${side ? '' : 'narrow:hidden'}`}
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
                  [x.effort, c.effort],
                  [x.maxTokens, c.maxTokens.toLocaleString()],
                ].map(([k, v]) => (
                  <div key={k} className="bg-bg px-2 py-1.5">
                    <dt
                      className={`${mono} text-muted text-[9px] whitespace-nowrap`}
                    >
                      {k}
                    </dt>
                    <dd className="m-0 mt-0.5 text-[11px]">{v}</dd>
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
                        <span className={`${mono} text-[10px]`}>{t.name}</span>
                        <span className="text-muted text-[10px] leading-[1.35]">
                          {pick(t.desc, es)}
                        </span>
                      </span>
                      <span
                        className={`${mono} text-ok inline-flex shrink-0 items-center gap-1 text-[9px]`}
                      >
                        <span aria-hidden="true" className="bg-ok size-[7px]" />
                        {x.ready}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-line flex flex-col gap-1.5 border-t pt-3">
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
                onClick={() => setSession(c.id, emptySession())}
                className={`${mono} border-line2 text-ink hover:border-accent mob:h-11 mt-1 h-7 cursor-pointer border bg-transparent text-[10px] tracking-[0.06em] uppercase transition-colors`}
              >
                {x.clear}
              </button>
            </div>
          </div>
        </aside>
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
// sources can be opened. CV citations open the CV viewer on the cited items.
const LINK =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
type OnCv = (focus: string, ids: string[]) => void;
function Linked({
  text,
  onCv,
  cvLabel,
}: {
  text: string;
  onCv: OnCv;
  cvLabel: string;
}) {
  const matches = [...text.matchAll(LINK)];
  const cvIds = matches.flatMap((m) => {
    const id = cvLinkId(m[2] ?? m[3]);
    return id ? [id] : [];
  });
  const out: (string | React.JSX.Element)[] = [];
  let last = 0;
  for (const match of matches) {
    const i = match.index;
    if (i > last) out.push(text.slice(last, i));
    const href = match[2] ?? match[3];
    const cvId = cvLinkId(href);
    out.push(
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={cvId ? cvLabel : undefined}
        onClick={
          cvId
            ? (e) => {
                // Modified clicks still open the PDF itself.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
                e.preventDefault();
                onCv(cvId, cvIds);
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

function Message({
  m,
  onCv,
  cvLabel,
}: {
  m: ChatItem;
  onCv: OnCv;
  cvLabel: string;
}) {
  if (m.kind === 'user') {
    return (
      <div className="mob:max-w-[85%] flex max-w-[80%] flex-col items-end gap-1.5 self-end">
        {m.files.map((f) => (
          <span
            key={f}
            className={`${mono} border-line2 bg-panel text-chip inline-flex items-center gap-2 border px-2.5 py-1.5 text-[11px]`}
          >
            <Icon d={I.file} size={13} />
            {f}
          </span>
        ))}
        {m.text && (
          <div className="bg-panel border-line2 border px-3 py-2 text-sm leading-[1.55] whitespace-pre-wrap">
            {m.text}
          </div>
        )}
      </div>
    );
  }
  if (m.kind === 'tool') {
    const status = m.status === 'running' ? '…' : m.result;
    const ms = m.ms !== null ? ` · ${m.ms} ms` : '';
    return (
      <details className="jd-tool border-line2 text-muted border border-dashed font-mono text-[11px]">
        <summary className="desk:min-h-0 flex min-h-11 items-center gap-2 px-3 py-2">
          <span className="text-accent">tool_use</span>
          <span className="text-chip">{m.name}</span>
          <span
            className={`ml-auto truncate ${m.status === 'error' ? 'text-warn' : ''}`}
          >
            {status}
            {ms}
          </span>
          <span
            aria-hidden="true"
            className="jd-chev inline-block transition-transform"
          >
            ▾
          </span>
        </summary>
        <div className="text-chip px-3 pb-3 leading-normal break-words">
          {m.name}({m.input || '…'})
        </div>
      </details>
    );
  }
  if (m.kind === 'notice') return null;
  return (
    <div className="mob:max-w-full flex max-w-[88%] flex-col gap-2">
      <div className="border-accent border-l-2 py-0.5 pl-3 text-sm leading-[1.6] break-words whitespace-pre-wrap">
        <Linked text={m.text} onCv={onCv} cvLabel={cvLabel} />
        {m.streaming && (
          <span
            aria-hidden="true"
            className="jd-blink bg-accent ml-[3px] inline-block h-3.5 w-[7px] align-[-2px]"
          />
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
      <div className="border-warn border-l-2 py-0.5 pl-3 text-sm leading-[1.6] whitespace-pre-wrap">
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
          className={`jd-rise ${mono} border-accent text-accent hover:bg-accent hover:text-on-accent mob:h-11 ml-3.5 inline-flex h-8 cursor-pointer items-center gap-2 border bg-transparent px-3 text-[10px] tracking-[0.06em] uppercase transition-colors`}
        >
          {fixLabel(labels[fix])}
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}
