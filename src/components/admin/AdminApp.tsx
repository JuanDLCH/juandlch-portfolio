// The insights dashboard (/admin, behind Cloudflare Access): activity per
// day, what messages are about, what visitors were after, top topics, and
// the daily reports with the messages they cite. Data from worker/admin.ts.
// Every chart is a single series in the accent color with its values written
// out (and a table view), so nothing depends on telling colors apart.
// Visitor text and model output render as plain text only.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ADMIN, type AdminCopy } from '../../i18n/admin';
import { CATEGORIES, GOALS, INTENTS } from '../../lab/insights/taxonomy';
import { setLang, setTheme } from '../../scripts/prefs';
import { I, Icon, iconBtn, label, mono, useHtml } from '../lab/ui';

type Row = Record<string, string | number | null>;
interface Overview {
  from: string;
  to: string;
  reports: Row[];
  activity: Row[];
  messages: Row[];
  /** Distinct conversations over the whole range. */
  conversations: number;
  category: Row[];
  intent: Row[];
  goal: Row[];
  topic: Row[];
}
interface Detail {
  report: Row | null;
  /** The day's messages, up to the API's limit; `total` is how many exist. */
  messages: Row[];
  total: number;
  /** Every message the report cites, even past the limit. */
  cited: Row[];
  goals: Row[];
}
interface Report {
  headline: string;
  summary: string;
  interests: { topic: string; insight: string; message_ids: number[] }[];
  goals: { goal: string; insight: string; message_ids: number[] }[];
}
type Lang = 'en' | 'es';
type Status = keyof AdminCopy['status'];

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (res.status === 403) throw new Error('forbidden');
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));
const fmtDay = (day: string, lang: Lang, long = false) =>
  new Intl.DateTimeFormat(lang, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(long ? { weekday: 'long', year: 'numeric' } : {}),
  }).format(new Date(`${day}T12:00:00Z`));
const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += 86_400_000
  )
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

const card = 'border-line bg-panel border p-card';
const h2 = 'text-ink m-0 text-[15px] font-semibold';
const note = 'text-muted m-0 mt-1 text-[12px] leading-snug';
const btn =
  'border-line2 text-ink hover:border-accent inline-flex h-8 cursor-pointer items-center gap-2 border bg-transparent px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-50';

function Section({
  title,
  sub,
  children,
  className = '',
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${card} ${className}`}>
      <h2 className={h2}>{title}</h2>
      {sub && <p className={note}>{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Horizontal bars, one series, values written out; a table underneath. */
function Bars({
  rows,
  x,
}: {
  rows: { key: string; label: string; n: number; extra?: string }[];
  x: AdminCopy;
}) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className={note}>{x.noData}</p>;
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {rows.map((r) => (
          <li
            key={r.key}
            title={`${r.label}: ${r.n} (${Math.round((r.n / total) * 100)}%)`}
            className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 text-[13px]"
          >
            <span className="text-body truncate">{r.label}</span>
            <span className="bg-chip h-2.5 w-full">
              <span
                className="bg-accent block h-full rounded-r-[4px]"
                style={{ width: `${(r.n / max) * 100}%` }}
              />
            </span>
            <span className={`${mono} text-ink text-[12px] tabular-nums`}>
              {r.n}
              {r.extra && <span className="text-muted"> · {r.extra}</span>}
            </span>
          </li>
        ))}
      </ul>
      <details className="mt-3">
        <summary className={`${label} cursor-pointer`}>{x.table}</summary>
        <table className="mt-2 w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-muted text-left">
              <th className="py-1 font-normal" />
              <th className="py-1 text-right font-normal">{x.count}</th>
              <th className="py-1 text-right font-normal">{x.share}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-line border-t">
                <td className="text-body py-1">{r.label}</td>
                <td className={`${mono} text-ink py-1 text-right`}>{r.n}</td>
                <td className={`${mono} text-muted py-1 text-right`}>
                  {Math.round((r.n / total) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

/** Messages per day as columns over a light grid, a date under every few
 * columns (every one in a week), and a tooltip beside the hovered column,
 * kept inside the chart. */
const TIP_W = 200;
function Activity({
  data,
  x,
  lang,
}: {
  data: Overview;
  x: AdminCopy;
  lang: Lang;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const plot = useRef<HTMLDivElement>(null);
  const days = daysBetween(data.from, data.to);
  const per = days.map((day) => {
    const msgs = data.messages.filter((m) => m.day === day);
    const ev = (k: string) =>
      num(data.activity.find((a) => a.day === day && a.kind === k)?.n);
    return {
      day,
      total: msgs.reduce((s, m) => s + num(m.n), 0),
      by: msgs.map((m) => ({ source: String(m.source), n: num(m.n) })),
      calls: ev('voice_call'),
    };
  });
  // A round top for the scale, so the grid reads in whole numbers.
  const peak = Math.max(...per.map((p) => p.total));
  const top = peak <= 4 ? 4 : Math.ceil(peak / 4) * 4;
  const n = days.length;
  const step = n <= 7 ? 1 : Math.ceil(n / 10);
  const short = (day: string) =>
    new Intl.DateTimeFormat(lang, {
      timeZone: 'UTC',
      ...(n <= 7
        ? { weekday: 'short', day: 'numeric' }
        : { day: 'numeric', month: 'short' }),
    }).format(new Date(`${day}T12:00:00Z`));
  const show = (i: number) => {
    setWidth(plot.current?.clientWidth ?? 0);
    setHover(i);
  };
  const h = hover === null ? null : per[hover];
  // Beside the column: to its right, or its left near the right edge.
  const cx = hover === null ? 0 : ((hover + 0.5) / n) * width;
  const left =
    cx + 12 + TIP_W <= width ? cx + 12 : Math.max(0, cx - 12 - TIP_W);
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2">
      {/* Scale */}
      <div
        className={`${mono} text-muted flex h-44 flex-col justify-between text-right text-[10px] leading-none`}
        aria-hidden="true"
      >
        {[top, top / 2, 0].map((v) => (
          <span
            key={v}
            className="-translate-y-1/2 first:translate-y-0 last:translate-y-0"
          >
            {v}
          </span>
        ))}
      </div>
      <div
        ref={plot}
        className="relative h-44"
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid: top, middle and the baseline. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <span className="border-line block border-t" />
          <span className="border-line block border-t border-dashed" />
          <span className="border-line2 block border-t" />
        </div>
        <div className="absolute inset-0 grid gap-[2px]" style={cols}>
          {per.map((p, i) => (
            <button
              key={p.day}
              type="button"
              aria-label={`${fmtDay(p.day, lang, true)}: ${p.total} ${x.kpi.messages}`}
              onMouseEnter={() => show(i)}
              onFocus={() => show(i)}
              onBlur={() => setHover(null)}
              className={`flex h-full min-w-0 cursor-default items-end border-0 p-0 ${hover === i ? 'bg-chip' : 'bg-transparent'}`}
            >
              <span
                className={`block w-full rounded-t-[4px] ${hover === i ? 'bg-ink' : 'bg-accent'}`}
                style={{
                  height: p.total
                    ? `${Math.max(2, (p.total / top) * 100)}%`
                    : 0,
                }}
              />
            </button>
          ))}
        </div>
        {h && (
          <div
            role="status"
            className="border-line2 bg-bg text-body pointer-events-none absolute top-1 z-10 border p-2.5 text-[12px] shadow-lg"
            style={{ left, width: TIP_W }}
          >
            <div className="text-ink mb-1.5 font-semibold first-letter:uppercase">
              {fmtDay(h.day, lang, true)}
            </div>
            <div className="flex justify-between gap-4">
              <span>{x.kpi.messages}</span>
              <span className={`${mono} text-ink`}>{h.total}</span>
            </div>
            {h.by.map((b) => (
              <div
                key={b.source}
                className="text-muted flex justify-between gap-4 pl-2"
              >
                <span>
                  {x.bySource[b.source as keyof AdminCopy['bySource']] ??
                    b.source}
                </span>
                <span className={mono}>{b.n}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <span>{x.kpi.calls}</span>
              <span className={`${mono} text-ink`}>{h.calls}</span>
            </div>
          </div>
        )}
      </div>
      {/* Dates under their columns, counted from the last one. */}
      <span />
      <div
        className={`${mono} text-muted mt-1.5 grid gap-[2px] text-[10px]`}
        style={cols}
        aria-hidden="true"
      >
        {days.map((d, i) => (
          <span key={d} className="relative h-3.5">
            {(n - 1 - i) % step === 0 && (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                {short(d)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ s, x }: { s: string; x: AdminCopy }) {
  const st = s as Status;
  const tone =
    st === 'done' ? 'text-ok' : st === 'failed' ? 'text-warn' : 'text-muted';
  const mark =
    st === 'done' ? '✓' : st === 'failed' ? '!' : st === 'empty' ? '–' : '…';
  return (
    <span
      className={`${mono} ${tone} inline-flex items-center gap-1.5 text-[11px]`}
    >
      <span aria-hidden="true">{mark}</span>
      {x.status[st] ?? s}
    </span>
  );
}

/** A cited message, quoted from D1 by id (never from the model). */
function Quote({
  id,
  byId,
  x,
}: {
  id: number;
  byId: Map<number, Row>;
  x: AdminCopy;
}) {
  const m = byId.get(id);
  return (
    <blockquote className="border-accent text-body m-0 border-l-2 py-0.5 pl-3 text-[13px] leading-snug">
      {m ? (
        String(m.text)
      ) : (
        <span className="text-muted italic">{x.removed}</span>
      )}
      <span className={`${mono} text-muted ml-2 text-[10px]`}>#{id}</span>
    </blockquote>
  );
}

const parseReport = (raw: unknown): Report | null => {
  try {
    return raw ? (JSON.parse(String(raw)) as Report) : null;
  } catch {
    return null;
  }
};

function DayView({
  day,
  lang,
  x,
  onClose,
}: {
  day: string;
  lang: Lang;
  x: AdminCopy;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  // Mounted per day (keyed), so it starts empty.
  useEffect(() => {
    get<Detail>(`/admin/api/day?day=${day}`)
      .then(setDetail)
      .catch((e: Error) => setErr(e.message));
  }, [day]);
  const rerun = () => {
    setBusy(true);
    setAsk(false);
    get<Detail>(`/admin/api/rerun?day=${day}`, { method: 'POST' })
      .then(setDetail)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false));
  };
  const byId = useMemo(
    () =>
      new Map(
        [...(detail?.cited ?? []), ...(detail?.messages ?? [])].map((m) => [
          num(m.id),
          m,
        ]),
      ),
    [detail],
  );
  const convs = useMemo(() => {
    const by = new Map<string, Row[]>();
    for (const m of detail?.messages ?? []) {
      const k = `${m.source}:${m.conv}`;
      by.set(k, [...(by.get(k) ?? []), m]);
    }
    return [...by];
  }, [detail]);
  const goalOf = (k: string) =>
    detail?.goals.find((g) => `${g.source}:${g.conv}` === k)?.goal as
      keyof typeof GOALS | undefined;
  const r = detail?.report;
  const doc = parseReport(r?.report);
  const chip = 'border-line2 text-muted border px-1.5 py-px text-[10px]';
  return (
    <section
      className={`${card} mt-gutter`}
      aria-label={fmtDay(day, lang, true)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={`${h2} first-letter:uppercase`}>
            {fmtDay(day, lang, true)}
          </h2>
          {r && (
            <p className={`${note} flex flex-wrap items-center gap-x-3`}>
              <StatusBadge s={String(r.status)} x={x} />
              <span>
                {x.cost}: ${num(r.cost_usd).toFixed(4)}
              </span>
              {r.model && (
                <span>
                  {x.model}: {String(r.model)}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ask ? (
            <>
              <span className="text-muted text-[12px]">{x.rerunConfirm}</span>
              <button type="button" className={btn} onClick={rerun}>
                {x.confirm}
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => setAsk(false)}
              >
                {x.cancel}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={btn}
              disabled={busy}
              onClick={() => setAsk(true)}
            >
              {busy ? x.rerunning : x.rerun}
            </button>
          )}
          <button type="button" className={btn} onClick={onClose}>
            {x.close}
          </button>
        </div>
      </div>

      {err && (
        <p className="text-warn mt-3 text-[13px]">
          {err === 'forbidden' ? x.forbidden : x.error}
        </p>
      )}
      {!detail && !err && <p className={`${note} mt-3`}>{x.loading}</p>}
      {r?.error && (
        <p className="text-warn mt-3 text-[12px]">
          {x.errorLabel}: {String(r.error)}
        </p>
      )}

      {detail && (
        <div className="mt-5 flex flex-col gap-6">
          {doc ? (
            <div className="flex flex-col gap-5">
              {doc.headline && (
                <div>
                  <span className={label}>{x.headline}</span>
                  <p className="text-ink m-0 mt-1 text-[16px] leading-snug font-semibold">
                    {doc.headline}
                  </p>
                </div>
              )}
              {doc.summary && (
                <div>
                  <span className={label}>{x.summary}</span>
                  <p className="text-body m-0 mt-1 text-[14px] leading-relaxed">
                    {doc.summary}
                  </p>
                </div>
              )}
              {!!doc.interests.length && (
                <div>
                  <span className={label}>{x.interests}</span>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-4 p-0">
                    {doc.interests.map((i) => (
                      <li key={i.topic} className="flex flex-col gap-1.5">
                        <span className="text-ink text-[14px] font-semibold">
                          {i.topic}
                        </span>
                        <span className="text-body text-[13px] leading-snug">
                          {i.insight}
                        </span>
                        {i.message_ids.map((id) => (
                          <Quote key={id} id={id} byId={byId} x={x} />
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!doc.goals.length && (
                <div>
                  <span className={label}>{x.goalsDay}</span>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-4 p-0">
                    {doc.goals.map((g) => (
                      <li key={g.goal} className="flex flex-col gap-1.5">
                        <span className="text-ink text-[14px] font-semibold">
                          {GOALS[g.goal as keyof typeof GOALS]?.[lang] ??
                            g.goal}
                        </span>
                        <span className="text-body text-[13px] leading-snug">
                          {g.insight}
                        </span>
                        {g.message_ids.map((id) => (
                          <Quote key={id} id={id} byId={byId} x={x} />
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className={note}>{x.noReport}</p>
          )}

          <div>
            <span className={label}>
              {x.messagesDay} (
              {detail.total > detail.messages.length
                ? x.shown
                    .replace('{n}', String(detail.messages.length))
                    .replace('{total}', String(detail.total))
                : detail.total}
              )
            </span>
            <div className="mt-2 flex flex-col gap-3">
              {convs.map(([k, msgs], n) => {
                const goal = goalOf(k);
                return (
                  <div key={k} className="border-line border p-3">
                    <div
                      className={`${mono} text-muted mb-2 flex flex-wrap gap-x-3 text-[10px] uppercase`}
                    >
                      <span>
                        {x.conversation} {n + 1} ·{' '}
                        {x.bySource[
                          String(msgs[0].source) as keyof AdminCopy['bySource']
                        ] ?? String(msgs[0].source)}
                      </span>
                      {goal && <span>→ {GOALS[goal]?.[lang] ?? goal}</span>}
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {msgs.map((m) => {
                        const cat = m.category as
                          keyof typeof CATEGORIES | null;
                        const intent = m.intent as keyof typeof INTENTS | null;
                        return (
                          <li key={num(m.id)} className="flex flex-col gap-1">
                            <span className="text-body text-[13px] leading-snug">
                              {String(m.text)}
                            </span>
                            <span className="flex flex-wrap gap-1.5">
                              <span className={chip}>
                                {cat
                                  ? (CATEGORIES[cat]?.[lang] ?? cat)
                                  : x.unlabeled}
                              </span>
                              {intent && (
                                <span className={chip}>
                                  {INTENTS[intent]?.[lang] ?? intent}
                                </span>
                              )}
                              {String(m.topics ?? '')
                                .split('|')
                                .filter(Boolean)
                                .map((t) => (
                                  <span key={t} className={`${chip} text-body`}>
                                    {t}
                                  </span>
                                ))}
                              <span
                                className={`${mono} text-muted text-[10px]`}
                              >
                                #{num(m.id)}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function AdminApp() {
  const { es, dark } = useHtml();
  const lang: Lang = es ? 'es' : 'en';
  const x = ADMIN[lang];
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // A slower answer for a range no longer selected is dropped.
    let current = true;
    get<Overview>(`/admin/api/overview?days=${days}`)
      .then((d) => {
        if (!current) return;
        setData(d);
        setErr('');
      })
      .catch((e: Error) => {
        if (current) setErr(e.message);
      });
    return () => {
      current = false;
    };
  }, [days, tick]);

  const labelOf = (
    o: Record<string, { en: string; es: string }>,
    k: string | number | null,
  ) => (k === null ? x.unlabeled : (o[String(k)]?.[lang] ?? String(k)));
  const rows = (
    list: Row[] | undefined,
    o?: Record<string, { en: string; es: string }>,
  ) =>
    (list ?? []).map((r) => ({
      key: String(r.k),
      label: o ? labelOf(o, r.k) : String(r.k),
      n: num(r.n),
      extra: r.days ? x.days.replace('{n}', String(r.days)) : undefined,
    }));

  const sum = (list: Row[] | undefined, pick: (r: Row) => boolean, f = 'n') =>
    (list ?? []).filter(pick).reduce((s, r) => s + num(r[f]), 0);
  // All four about the CV chat and Sophie, where messages are stored. A
  // resumed call continues the same call, so only starts count.
  const msgs = sum(data?.messages, () => true);
  const convs = data?.conversations ?? 0;
  const kpis = data
    ? [
        [x.kpi.conversations, convs],
        [x.kpi.messages, msgs],
        [
          x.kpi.perConv,
          convs ? (msgs / convs).toFixed(1).replace(/\.0$/, '') : '0',
        ],
        [x.kpi.calls, sum(data.activity, (a) => a.kind === 'voice_call')],
      ]
    : [];

  return (
    <main className="py-section mx-auto w-full max-w-[1200px] px-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <a
            href="/"
            className={`${mono} text-muted hover:text-ink text-[11px] tracking-[0.06em] uppercase no-underline`}
          >
            ← {x.back}
          </a>
          <h1 className="text-ink text-h2 m-0 mt-2 font-semibold">{x.title}</h1>
          <p className={note}>{x.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={label}>{x.range}</span>
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={days === n}
              onClick={() => setDays(n)}
              className={`${btn} ${days === n ? 'border-accent text-accent' : ''}`}
            >
              {x.days.replace('{n}', String(n))}
            </button>
          ))}
          {(['en', 'es'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={`${btn} ${mono} uppercase ${lang === l ? 'border-accent text-accent' : ''}`}
            >
              {l}
            </button>
          ))}
          <button
            type="button"
            aria-label={dark ? 'Light theme' : 'Dark theme'}
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            className={`${iconBtn} size-8`}
          >
            <Icon d={dark ? I.sun : I.moon} size={15} />
          </button>
        </div>
      </header>

      {err && (
        <div className={`${card} mt-block flex flex-wrap items-center gap-3`}>
          <p className="text-warn m-0 text-[13px]">
            {err === 'forbidden' ? x.forbidden : x.error}
          </p>
          <button
            type="button"
            className={btn}
            onClick={() => setTick((t) => t + 1)}
          >
            {x.retry}
          </button>
        </div>
      )}
      {!data && !err && <p className={`${note} mt-block`}>{x.loading}</p>}

      {data && (
        <>
          <div className="mt-block gap-gutter grid grid-cols-2 md:grid-cols-4">
            {kpis.map(([k, v]) => (
              <div key={String(k)} className={card}>
                <span className={label}>{k}</span>
                <div
                  className={`${mono} text-ink mt-1 text-[28px] leading-none tabular-nums`}
                >
                  {v}
                </div>
              </div>
            ))}
          </div>

          <Section
            title={x.activity}
            sub={x.activityNote}
            className="mt-gutter"
          >
            <Activity data={data} x={x} lang={lang} />
          </Section>

          <div className="mt-gutter gap-gutter grid md:grid-cols-2">
            <Section title={x.categories}>
              <Bars rows={rows(data.category, CATEGORIES)} x={x} />
            </Section>
            <Section title={x.goals} sub={x.goalsNote}>
              <Bars rows={rows(data.goal, GOALS)} x={x} />
            </Section>
            <Section title={x.topics} sub={x.topicsNote}>
              <Bars rows={rows(data.topic)} x={x} />
            </Section>
            <Section title={x.intents}>
              <Bars rows={rows(data.intent, INTENTS)} x={x} />
            </Section>
          </div>

          <Section title={x.reports} sub={x.reportsNote} className="mt-gutter">
            {data.reports.length ? (
              <table className="w-full border-collapse text-[13px]">
                <tbody>
                  {data.reports.map((r) => {
                    const d = String(r.day);
                    return (
                      <tr key={d} className="border-line border-t">
                        <td className="text-ink py-2 pr-3">
                          {fmtDay(d, lang)}
                        </td>
                        <td className="py-2 pr-3">
                          <StatusBadge s={String(r.status)} x={x} />
                        </td>
                        <td
                          className={`${mono} text-muted py-2 pr-3 text-[12px]`}
                        >
                          {num(r.messages)} · {num(r.conversations)}
                        </td>
                        <td
                          className={`${mono} text-muted py-2 pr-3 text-[12px]`}
                        >
                          ${num(r.cost_usd).toFixed(3)}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            className={`${btn} ${day === d ? 'border-accent text-accent' : ''}`}
                            onClick={() => setDay(day === d ? null : d)}
                          >
                            {day === d ? x.close : x.open}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className={note}>{x.noReports}</p>
            )}
          </Section>

          {day && (
            <DayView
              key={day}
              day={day}
              lang={lang}
              x={x}
              onClose={() => setDay(null)}
            />
          )}
        </>
      )}
    </main>
  );
}
