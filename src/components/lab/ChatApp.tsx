import type Anthropic from '@anthropic-ai/sdk';
import { useStore } from '@nanostores/react';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { CHAT } from '../../i18n/chat';
import {
  $attachments,
  IMAGE_TYPES,
  MAX_BYTES,
  readAttachment,
} from '../../lab/attachments';
import { runTurn } from '../../lab/chat/anthropic';
import { CASES, MODELS, type ChatCase } from '../../lab/chat/cases';
import { transcribe } from '../../lab/chat/openai';
import {
  $busy,
  $caseId,
  $drafts,
  $keys,
  $sessions,
  emptySession,
  getSession,
  setSession,
  setTurn,
  stopTurn,
  type ChatItem,
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
  'border-line2 text-ink hover:border-accent grid size-11 shrink-0 cursor-pointer place-items-center border bg-transparent p-0 transition-colors';

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
  diagram:
    '<rect x="3" y="3" width="7" height="6"/><rect x="14" y="3" width="7" height="6"/><rect x="14" y="15" width="7" height="6"/><path d="M10 6h4M17.5 9v6"/>',
};

const pick = (v: { en: string; es: string }, es: boolean) => (es ? v.es : v.en);
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

  const [side, setSide] = useState(false);
  const [modal, setModal] = useState(false);
  // "Watch demo" and "How I'd build it" dialogs, each with its own case pick.
  const [info, setInfo] = useState<'video' | 'build' | null>(null);
  const [infoCase, setInfoCase] = useState(CASES[0].id);
  const [keyDrafts, setKeyDrafts] = useState({ anthropic: '', openai: '' });
  const [rec, setRec] = useState<'off' | 'on' | 'busy'>('off');
  const recRef = useRef<MediaRecorder | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!modal && !info) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setModal(false);
      setInfo(null);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [modal, info]);

  useEffect(() => {
    const el = logRef.current;
    if (el && session.items.length) el.scrollTop = el.scrollHeight;
  }, [session.items]);

  const openInfo = (kind: 'video' | 'build') => {
    setInfoCase(c.id);
    setInfo(kind);
    setSide(false);
  };
  const openKeys = () => {
    setKeyDrafts(keys);
    setModal(true);
  };
  const notice = (text: string) => {
    const s = getSession(c.id);
    setSession(c.id, { ...s, items: [...s.items, { kind: 'notice', text }] });
  };
  const setDraft = (v: string) => $drafts.setKey(c.id, v);
  const pickCase = (k: ChatCase, fill = true) => {
    if (busy) return;
    $caseId.set(k.id);
    if (fill && !($drafts.get()[k.id] ?? '').trim())
      $drafts.setKey(k.id, pick(k.starter, es));
    setSide(false);
  };

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    // Read the store, not the render's `busy`: a transcription finishing
    // after a turn ended calls this from an older closure.
    if ((!text && files.length === 0) || $busy.get()) return;
    const start = getSession(c.id);
    const user: ChatItem = {
      kind: 'user',
      text,
      files: files.map((f) => f.name),
    };
    if (!keys.anthropic) {
      setSession(c.id, {
        ...start,
        items: [...start.items, user, { kind: 'notice', text: x.errors.noKey }],
      });
      setDraft('');
      return;
    }
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...files.map((f) =>
        f.mediaType === 'application/pdf'
          ? ({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: f.data,
              },
            } as const)
          : ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: f.mediaType as 'image/png',
                data: f.data,
              },
            } as const),
      ),
      ...(text ? [{ type: 'text' as const, text }] : []),
    ];
    setDraft('');
    $attachments.setKey(c.id, []);
    const withUser = { ...start, items: [...start.items, user] };
    setSession(c.id, withUser);
    $busy.set(true);
    const ctrl = new AbortController();
    setTurn(ctrl);
    const err = await runTurn(keys.anthropic, c, withUser, content, {
      update: (s) => setSession(c.id, s),
      signal: ctrl.signal,
      es,
    });
    $busy.set(false);
    setTurn(null);
    if (err) notice(x.errors[err]);
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
        notice(x.errors.file);
        continue;
      }
      next.push(await readAttachment(f));
    }
    $attachments.setKey(c.id, next);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onMic = async () => {
    if ($busy.get()) return;
    if (!keys.openai) return openKeys();
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
          notice(x.errors.transcribe);
        }
      };
      recRef.current = mr;
      mr.start();
      setRec('on');
    } catch {
      notice(x.errors.mic);
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

  const model = MODELS[c.model];
  const ready = !!keys.anthropic;
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
      <header className="border-line mob:h-14 mob:gap-2 mob:px-2.5 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
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
                    ? `${model.short} · ${c.tools.length} ${x.toolsWord}`
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
            onClick={openKeys}
            className={`${mono} border-line2 text-ink hover:border-accent narrow:hidden inline-flex h-9 cursor-pointer items-center gap-3 border bg-transparent px-3 text-[10px] tracking-[0.04em] transition-colors`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`size-[7px] ${keys.anthropic ? 'bg-ok' : 'bg-warn'}`}
              />
              Anthropic
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`size-[7px] ${keys.openai ? 'bg-ok' : 'bg-line2'}`}
              />
              OpenAI
            </span>
            <span className="text-accent">{x.keysBtn}</span>
          </button>
          <button
            type="button"
            onClick={openKeys}
            aria-label={x.keysBtn}
            className={`${iconBtn} narrow:grid hidden`}
          >
            <Icon d={I.key} />
          </button>
          <button
            type="button"
            onClick={() => setSide(!side)}
            aria-label={x.settings}
            className={`${iconBtn} narrow:grid hidden`}
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

      <div className="relative flex min-h-0 flex-1">
        <main className="dots flex min-w-0 flex-1 flex-col">
          {!ready && (
            <div className="flex shrink-0 justify-center px-4 pt-3">
              <div className="border-line2 bg-panel flex w-full max-w-[780px] flex-wrap items-center justify-between gap-2.5 border border-dashed px-3 py-2 text-[13px]">
                <span className="text-body flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="bg-warn size-[7px] shrink-0"
                  />
                  {x.noKeyBanner}
                </span>
                <button
                  type="button"
                  onClick={openKeys}
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
                          {MODELS[k.model].short} · {k.tools.length}{' '}
                          {x.toolsWord}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {session.items.map((m, i) => (
                <Message key={i} m={m} />
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
                          className={`${iconBtn} text-lg`}
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
                          className={`${iconBtn} text-muted border-transparent`}
                        >
                          <Icon d={I.clip} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onMic()}
                          disabled={busy}
                          aria-label={x.mic}
                          title={keys.openai ? x.mic : x.micNeedsKey}
                          className={`${iconBtn} mob:hidden border-transparent disabled:cursor-not-allowed disabled:opacity-40 ${keys.openai ? 'text-ink' : 'text-muted'}`}
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
                  {c.tools.length} {x.toolsWord}
                </span>
              </div>
              <ul className="border-line2 m-0 flex list-none flex-col border p-0">
                {c.tools.map((t, i) => (
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="jd-modal-title"
            className="bg-panel border-line2 mob:h-full mob:max-h-full mob:max-w-none mob:border-0 relative flex max-h-[calc(100dvh-34px)] w-full max-w-[520px] flex-col border"
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
                {(
                  [
                    [
                      'anthropic',
                      'Anthropic API key',
                      x.anthropicHint,
                      'sk-ant-…',
                    ],
                    ['openai', 'OpenAI API key', x.openaiHint, 'sk-…'],
                  ] as const
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

      {info &&
        (() => {
          const ic = CASES.find((k) => k.id === infoCase) ?? CASES[0];
          const video = info === 'video';
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
                role="dialog"
                aria-modal="true"
                aria-labelledby="jd-info-title"
                className="bg-panel border-line2 mob:h-full mob:max-h-full mob:max-w-none mob:border-0 relative flex max-h-[calc(100dvh-34px)] w-full max-w-[760px] flex-col border"
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
                        {video ? x.videoTag : x.buildTag}
                      </div>
                      <h2
                        id="jd-info-title"
                        className="mt-2 mb-0 text-2xl font-medium tracking-[-0.03em]"
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
                  <div
                    role="group"
                    aria-label={x.caseLabel}
                    className="mt-5 flex flex-wrap gap-1.5"
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
                  {video && ic.video ? (
                    <video
                      key={ic.id}
                      src={ic.video.src}
                      controls
                      preload="metadata"
                      className="border-line2 bg-bg mt-4 block aspect-video w-full border"
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
                    <div className="border-line2 bg-bg dots text-muted mt-4 flex aspect-video w-full flex-col items-center justify-center gap-3 border border-dashed p-4 text-center text-sm">
                      <span className="border-line2 grid size-12 place-items-center border">
                        <Icon d={video ? I.play : I.diagram} size={20} />
                      </span>
                      {video ? x.videoSoon : x.diagramSoon}
                    </div>
                  )}
                  {!video && (
                    <p className="text-body mt-4 mb-0 text-sm leading-[1.55]">
                      {x.buildSoon}
                    </p>
                  )}
                </div>
                <div className="border-line2 mob:px-4 mob:pb-[calc(12px+env(safe-area-inset-bottom))] flex shrink-0 items-center justify-between gap-2.5 border-t px-7 py-3.5">
                  <span className={`${mono} text-muted truncate text-[11px]`}>
                    {MODELS[ic.model].short} · {ic.tools.length} {x.toolsWord}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setInfo(null)}
                      className="border-line2 text-ink mob:h-11 h-10 cursor-pointer border bg-transparent px-4 text-sm"
                    >
                      {x.close}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        pickCase(ic);
                        setInfo(null);
                      }}
                      className="bg-accent text-on-accent mob:h-11 h-10 cursor-pointer border-0 px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {x.tryCase}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function Message({ m }: { m: ChatItem }) {
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
  if (m.kind === 'notice') {
    return (
      <div className="border-warn text-body flex items-center gap-2.5 border px-3.5 py-2.5 text-sm">
        <span aria-hidden="true" className="bg-warn size-[7px] shrink-0" />
        {m.text}
      </div>
    );
  }
  return (
    <div className="mob:max-w-full flex max-w-[88%] flex-col gap-2">
      <div className="border-accent border-l-2 py-0.5 pl-3 text-sm leading-[1.6] whitespace-pre-wrap">
        {m.text}
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
