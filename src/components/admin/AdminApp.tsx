// The insights dashboard (/admin, behind Cloudflare Access): activity per
// day, what messages are about, what visitors were after, top topics, and
// the daily reports with the messages they cite. Data from worker/admin.ts.
// Every chart is a single series in the accent color with its values written
// out (and a table view), so nothing depends on telling colors apart.
// Visitor text and model output render as plain text only.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ADMIN, type AdminCopy } from '../../i18n/admin';
import { CATEGORIES, GOALS, INTENTS } from '../../lab/insights/taxonomy';
import type { WorldMap } from '../../lab/insights/world';
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
  /** Messages and conversations per demo (every case, from the events). */
  demos: Row[];
  /** USD per day and part (chat case, voice_note, voice). */
  costs: Row[];
  /** Demo users (chat conversations + voice calls) per country. */
  countries: Row[];
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
interface TrafficRow {
  k: string;
  views: number;
  visits: number;
}
/** Web Analytics (worker/admin.ts): hidden without its token. */
type Traffic =
  | { enabled: false }
  | {
      enabled: true;
      hours: TrafficRow[];
      paths: TrafficRow[];
      countries: TrafficRow[];
      referrers: TrafficRow[];
    };
type Status = keyof AdminCopy['status'];

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (res.status === 403) throw new Error('forbidden');
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/** Bogotá day (UTC-5, no DST) of a moment, like the Worker's. */
const bogota = (ms: number) =>
  new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10);
const shiftDay = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
interface Range {
  from: string;
  to: string;
}
const lastDays = (n: number, today: string): Range => ({
  from: shiftDay(today, -(n - 1)),
  to: today,
});
/** A month (YYYY-MM) as a range, up to today if it's the current one. */
const monthRange = (month: string, today: string): Range => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: last > today ? today : last };
};

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
const field =
  'border-line2 bg-bg text-ink focus:border-accent h-8 border px-2 text-[12px] outline-none';
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
const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

function Bars({
  rows,
  x,
  fmt = String,
}: {
  rows: { key: string; label: string; n: number; extra?: string }[];
  x: AdminCopy;
  /** How values are written (counts by default). */
  fmt?: (n: number) => string;
}) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  // The largest value fills the bar (dollars can all be under 1); 1 when
  // everything is 0.
  const max = Math.max(...rows.map((r) => r.n)) || 1;
  if (!rows.length) return <p className={note}>{x.noData}</p>;
  return (
    <>
      {/* One grid for every row, so all the bars get the same length
          whatever the width of their values. */}
      <ul className="m-0 grid list-none grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-x-3 gap-y-2.5 p-0 text-[13px]">
        {rows.map((r) => (
          <li key={r.key} className="contents">
            <span className="text-body truncate">{r.label}</span>
            <span
              title={`${r.label}: ${fmt(r.n)} (${Math.round((r.n / total) * 100)}%)`}
              className="bg-chip h-2.5 w-full"
            >
              <span
                className="bg-accent block h-full rounded-r-[4px]"
                style={{ width: `${(r.n / max) * 100}%` }}
              />
            </span>
            <span
              className={`${mono} text-ink text-right text-[12px] tabular-nums`}
            >
              {fmt(r.n)}
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
                <td className={`${mono} text-ink py-1 text-right`}>
                  {fmt(r.n)}
                </td>
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

/** One value per day as columns over a light grid, a date under every few
 * columns (every one in a week), and a tooltip beside the hovered column,
 * kept inside the chart. */
const TIP_W = 200;
function DayColumns({
  days,
  values,
  unit,
  lang,
  tip,
  onPick,
}: {
  days: string[];
  values: number[];
  /** What a value counts, for screen readers. */
  unit: string;
  lang: Lang;
  /** The tooltip's rows for a day, under its date. */
  tip: (i: number) => ReactNode;
  /** Clicking a column filters the dashboard to that day. */
  onPick?: (day: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const plot = useRef<HTMLDivElement>(null);
  // A round top for the scale, so the grid reads in whole numbers.
  const peak = Math.max(0, ...values);
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
  // Beside the column: to its right, or its left near the right edge.
  // A column hovered before the days changed (a click filtering to one day
  // keeps focus) may no longer exist.
  const at = hover !== null && hover < n ? hover : null;
  const cx = at === null ? 0 : ((at + 0.5) / n) * width;
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
          {days.map((day, i) => (
            <button
              key={day}
              type="button"
              aria-label={`${fmtDay(day, lang, true)}: ${values[i]} ${unit}`}
              onMouseEnter={() => show(i)}
              onFocus={() => show(i)}
              onBlur={() => setHover(null)}
              onClick={() => onPick?.(day)}
              className={`flex h-full min-w-0 items-end border-0 p-0 ${onPick ? 'cursor-pointer' : 'cursor-default'} ${at === i ? 'bg-chip' : 'bg-transparent'}`}
            >
              <span
                className={`block w-full rounded-t-[4px] ${at === i ? 'bg-ink' : 'bg-accent'}`}
                style={{
                  height: values[i]
                    ? `${Math.max(2, (values[i] / top) * 100)}%`
                    : 0,
                }}
              />
            </button>
          ))}
        </div>
        {at !== null && (
          <div
            role="status"
            className="border-line2 bg-bg text-body pointer-events-none absolute top-1 z-10 border p-2.5 text-[12px] shadow-lg"
            style={{ left, width: TIP_W }}
          >
            <div className="text-ink mb-1.5 font-semibold first-letter:uppercase">
              {fmtDay(days[at], lang, true)}
            </div>
            {tip(at)}
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

/** A label and its value in a tooltip. */
const TipRow = ({
  label: l,
  value,
  sub = false,
  rule = false,
}: {
  label: string;
  value: string | number;
  sub?: boolean;
  rule?: boolean;
}) => (
  <div
    className={`flex justify-between gap-4 ${sub ? 'text-muted pl-2' : ''} ${rule ? 'border-line mt-1.5 border-t pt-1.5' : ''}`}
  >
    <span>{l}</span>
    <span className={`${mono} ${sub ? '' : 'text-ink'}`}>{value}</span>
  </div>
);

/** Messages per day, with each day's sources, calls and cost. */
function Activity({
  data,
  x,
  lang,
  onPick,
}: {
  data: Overview;
  x: AdminCopy;
  lang: Lang;
  onPick: (day: string) => void;
}) {
  const days = daysBetween(data.from, data.to);
  const per = days.map((day) => {
    const msgs = data.messages.filter((m) => m.day === day);
    return {
      total: msgs.reduce((s, m) => s + num(m.n), 0),
      by: msgs.map((m) => ({ source: String(m.source), n: num(m.n) })),
      calls: num(
        data.activity.find((a) => a.day === day && a.kind === 'voice_call')?.n,
      ),
      // What the day cost: chat, voice notes, calls and its insights.
      cost:
        data.costs
          .filter((c) => c.day === day)
          .reduce((s, c) => s + num(c.usd), 0) +
        num(data.reports.find((r) => r.day === day)?.cost_usd),
    };
  });
  return (
    <DayColumns
      days={days}
      values={per.map((p) => p.total)}
      unit={x.kpi.messages}
      lang={lang}
      onPick={onPick}
      tip={(i) => (
        <>
          <TipRow label={x.kpi.messages} value={per[i].total} />
          {per[i].by.map((b) => (
            <TipRow
              key={b.source}
              sub
              label={
                x.bySource[b.source as keyof AdminCopy['bySource']] ?? b.source
              }
              value={b.n}
            />
          ))}
          <TipRow label={x.kpi.calls} value={per[i].calls} />
          <TipRow rule label={x.cost} value={usd(per[i].cost)} />
        </>
      )}
    />
  );
}

/** The map's scale: the accent from a light tint to a deep shade, the same
 * in both themes, so darker always means more and nothing depends on
 * telling hues apart. */
const SHADES = [
  'color-mix(in oklab, var(--accent) 30%, white)',
  'color-mix(in oklab, var(--accent) 60%, white)',
  'var(--accent)',
  'color-mix(in oklab, var(--accent) 65%, black)',
  'color-mix(in oklab, var(--accent) 40%, black)',
];

/** Month and year picker (Firefox has no native one): the year with arrows
 * and its twelve months; months after `max` are disabled. */
function MonthPicker({
  value,
  max,
  lang,
  x,
  onPick,
}: {
  /** YYYY-MM, or '' when the range isn't a whole month. */
  value: string;
  max: string;
  lang: Lang;
  x: AdminCopy;
  onPick: (month: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number((value || max).slice(0, 4)));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    addEventListener('mousedown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);
  const name = (m: number, style: 'short' | 'long') =>
    new Intl.DateTimeFormat(lang, { month: style, timeZone: 'UTC' }).format(
      new Date(Date.UTC(2000, m, 15)),
    );
  const maxYear = Number(max.slice(0, 4));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setYear(Number((value || max).slice(0, 4)));
          setOpen((o) => !o);
        }}
        className={`${field} flex min-w-36 cursor-pointer items-center justify-between gap-3 text-left`}
      >
        <span className={value ? 'first-letter:uppercase' : 'text-muted'}>
          {value
            ? `${name(Number(value.slice(5)) - 1, 'long')} ${value.slice(0, 4)}`
            : x.pickMonth}
        </span>
        <Icon d={I.calendar} size={14} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={x.month}
          className="border-line2 bg-bg absolute top-full left-0 z-20 mt-1 w-64 border p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={x.prevYear}
              className={`${iconBtn} size-7`}
              onClick={() => setYear((y) => y - 1)}
            >
              ‹
            </button>
            <span className={`${mono} text-ink text-[13px]`}>{year}</span>
            <button
              type="button"
              aria-label={x.nextYear}
              disabled={year >= maxYear}
              className={`${iconBtn} size-7 disabled:cursor-not-allowed disabled:opacity-40`}
              onClick={() => setYear((y) => y + 1)}
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, m) => {
              const k = `${year}-${String(m + 1).padStart(2, '0')}`;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={k > max}
                  aria-pressed={k === value}
                  onClick={() => {
                    onPick(k);
                    setOpen(false);
                  }}
                  className={`${btn} justify-center capitalize ${k === value ? 'border-accent text-accent' : ''}`}
                >
                  {name(m, 'short')}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Countries shaded by a value, with a legend and a tooltip per country. */
function CountryMap({
  map,
  values,
  unit,
  countryName,
}: {
  map: WorldMap;
  values: { k: string; n: number }[];
  unit: string;
  countryName: (k: string | number | null) => string;
}) {
  const [hover, setHover] = useState<{
    id: string;
    x: number;
    y: number;
    w: number;
  } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const by = new Map(values.filter((v) => v.k).map((v) => [v.k, v.n]));
  const max = Math.max(0, ...by.values());
  const shade = (n: number) =>
    SHADES[Math.min(SHADES.length - 1, Math.floor((n / max) * SHADES.length))];
  const move = (id: string, e: { clientX: number; clientY: number }) => {
    const r = box.current?.getBoundingClientRect();
    if (r)
      setHover({ id, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
  };
  return (
    <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${map.width} ${map.height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={values
          .filter((v) => v.k)
          .map((v) => `${countryName(v.k)}: ${v.n}`)
          .join(', ')}
      >
        {map.shapes.map((c) => {
          const n = by.get(c.id) ?? 0;
          return (
            <path
              key={c.id}
              d={c.d}
              onMouseMove={(e) => move(c.id, e)}
              className={`${n ? '' : 'fill-chip'} ${hover?.id === c.id ? 'stroke-ink' : 'stroke-panel'}`}
              style={{
                ...(n ? { fill: shade(n) } : {}),
                strokeWidth: hover?.id === c.id ? 1.4 : 0.6,
              }}
            />
          );
        })}
      </svg>
      {hover && (
        <div
          role="status"
          className="border-line2 bg-bg text-body pointer-events-none absolute z-10 border px-2.5 py-1.5 text-[12px] whitespace-nowrap shadow-lg"
          style={{
            top: Math.max(0, hover.y - 44),
            ...(hover.x > hover.w / 2
              ? { right: hover.w - hover.x + 12 }
              : { left: hover.x + 12 }),
          }}
        >
          <span className="text-ink font-semibold">
            {countryName(hover.id)}
          </span>
          <span className={`${mono} text-ink ml-3`}>
            {by.get(hover.id) ?? 0}
          </span>
          <span className="text-muted"> {unit}</span>
        </div>
      )}
      {max > 0 && (
        <div
          className={`${mono} text-muted mt-2 flex items-center gap-1.5 text-[10px]`}
          aria-hidden="true"
        >
          <span>1</span>
          {SHADES.map((c) => (
            <span
              key={c}
              className="border-line2 block h-2.5 w-6 border"
              style={{ background: c }}
            />
          ))}
          <span>{max}</span>
          <span className="ml-1">{unit}</span>
        </div>
      )}
    </div>
  );
}

/** Site visits from Web Analytics, and how many visitors of each demo page
 * went on to use it. */
function TrafficView({
  t,
  data,
  x,
  lang,
  countryName,
  onPick,
  map,
}: {
  t: Extract<Traffic, { enabled: true }>;
  data: Overview;
  x: AdminCopy;
  lang: Lang;
  countryName: (k: string | number | null) => string;
  onPick: (day: string) => void;
  map: WorldMap;
}) {
  const days = daysBetween(data.from, data.to);
  // Hours to Bogotá days (UTC-5), like every other count here.
  const byDay = new Map<string, { views: number; visits: number }>();
  for (const h of t.hours) {
    const day = bogota(Date.parse(h.k));
    const d = byDay.get(day) ?? { views: 0, visits: 0 };
    byDay.set(day, { views: d.views + h.views, visits: d.visits + h.visits });
  }
  const per = days.map((d) => byDay.get(d) ?? { views: 0, visits: 0 });
  const visits = per.reduce((s, p) => s + p.visits, 0);
  const views = per.reduce((s, p) => s + p.views, 0);
  const viewsOf = (path: string) =>
    t.paths.find((p) => p.k === path)?.views ?? 0;
  const convs = (k: string) => num(data.demos.find((d) => d.k === k)?.convs);
  const labConvs = data.demos
    .filter((d) => d.k !== 'cv')
    .reduce((s, d) => s + num(d.convs), 0);
  const calls = data.activity
    .filter((a) => a.kind === 'voice_call')
    .reduce((s, a) => s + num(a.n), 0);
  const funnel = [
    { path: '/lab/chat', used: labConvs, unit: x.convWord },
    { path: '/lab/cv', used: convs('cv'), unit: x.convWord },
    { path: '/lab/voice', used: calls, unit: x.callWord },
  ];
  return (
    <Section
      title={x.traffic}
      sub={x.trafficNote
        .replace('{visits}', String(visits))
        .replace('{views}', String(views))}
      className="mt-gutter"
    >
      <DayColumns
        days={days}
        values={per.map((p) => p.visits)}
        unit={x.visits}
        lang={lang}
        onPick={onPick}
        tip={(i) => (
          <>
            <TipRow label={x.visits} value={per[i].visits} />
            <TipRow label={x.views} value={per[i].views} />
          </>
        )}
      />
      <div className="mt-block">
        <span className={label}>{x.visitorCountries}</span>
        <div className="mt-3">
          <CountryMap
            map={map}
            values={t.countries.map((c) => ({ k: c.k, n: c.visits }))}
            unit={x.visits.toLowerCase()}
            countryName={countryName}
          />
        </div>
      </div>
      <div className="mt-block gap-gutter grid md:grid-cols-3">
        <div>
          <span className={label}>{x.pages}</span>
          <div className="mt-3">
            <Bars
              rows={t.paths.map((p) => ({
                key: p.k,
                label: p.k,
                n: p.views,
              }))}
              x={x}
            />
          </div>
        </div>
        <div>
          <span className={label}>{x.visitorCountries}</span>
          <div className="mt-3">
            <Bars
              rows={t.countries.map((c) => ({
                key: c.k,
                label: countryName(c.k),
                n: c.visits,
              }))}
              x={x}
            />
          </div>
        </div>
        <div>
          <span className={label}>{x.referrers}</span>
          <div className="mt-3">
            <Bars
              rows={t.referrers
                .filter((r) => r.visits > 0)
                .map((r) => ({
                  key: r.k || 'direct',
                  label: r.k || x.direct,
                  n: r.visits,
                }))}
              x={x}
            />
          </div>
        </div>
      </div>
      <div className="mt-block">
        <span className={label}>{x.conversion}</span>
        <p className={note}>{x.conversionNote}</p>
        <table className="mt-2 w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-muted text-left text-[12px]">
              <th className="py-1 font-normal">{x.page}</th>
              <th className="py-1 text-right font-normal">{x.views}</th>
              <th className="py-1 text-right font-normal">{x.used}</th>
              <th className="py-1 text-right font-normal">{x.rate}</th>
            </tr>
          </thead>
          <tbody>
            {funnel.map((f) => {
              const v = viewsOf(f.path);
              return (
                <tr key={f.path} className="border-line border-t">
                  <td className={`${mono} text-ink py-1.5 text-[12px]`}>
                    {f.path}
                  </td>
                  <td className={`${mono} text-body py-1.5 text-right`}>{v}</td>
                  <td className={`${mono} text-body py-1.5 text-right`}>
                    {f.used} {f.unit}
                  </td>
                  <td className={`${mono} text-ink py-1.5 text-right`}>
                    {v ? `${Math.round((f.used / v) * 100)}%` : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
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

export default function AdminApp({ map }: { map: WorldMap }) {
  const { es, dark } = useHtml();
  const lang: Lang = es ? 'es' : 'en';
  const x = ADMIN[lang];
  // Today in Bogotá, fixed for the page's life (reload for a new day).
  const [today] = useState(() => bogota(Date.now()));
  const [range, setRange] = useState<Range>(() => lastDays(30, today));
  const q = `from=${range.from}&to=${range.to}`;
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Each answer keeps the range it's for: only the current range's shows.
  const [trafficOf, setTrafficOf] = useState<{
    q: string;
    t: Traffic | null;
  } | null>(null);

  useEffect(() => {
    // A slower answer for a range no longer selected is dropped.
    let current = true;
    get<Overview>(`/admin/api/overview?${q}`)
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
  }, [q, tick]);
  // Site traffic apart: it's a slower call to Cloudflare and may be off.
  useEffect(() => {
    let current = true;
    get<Traffic>(`/admin/api/traffic?${q}`)
      .then((t) => {
        if (!current) return;
        setTrafficOf({ q, t });
      })
      .catch(() => {
        if (current) setTrafficOf({ q, t: null });
      });
    return () => {
      current = false;
    };
  }, [q, tick]);

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

  const traffic = trafficOf?.q === q ? trafficOf.t : null;
  const trafficErr = trafficOf?.q === q && trafficOf.t === null;
  const same = (r: Range) => r.from === range.from && r.to === range.to;
  const presets = [
    { key: 'today', label: x.today, r: { from: today, to: today } },
    ...[7, 30, 90].map((n) => ({
      key: String(n),
      label: x.days.replace('{n}', String(n)),
      r: lastDays(n, today),
    })),
  ];
  const single = range.from === range.to;
  // One day back or forward; from a longer range, it starts at its last day.
  const stepDay = (n: number) => {
    const base = single ? shiftDay(range.from, n) : range.to;
    const day = base > today ? today : base;
    setRange({ from: day, to: day });
  };
  const pickDay = (day: string) => {
    setRange({ from: day, to: day });
    scrollTo({ top: 0, behavior: 'smooth' });
  };
  const span = daysBetween(range.from, range.to).length;
  const rangeText =
    range.from === range.to
      ? fmtDay(range.from, lang, true)
      : `${fmtDay(range.from, lang)} – ${fmtDay(range.to, lang)} ${range.to.slice(0, 4)} · ${x.days.replace('{n}', String(span))}`;

  const sum = (list: Row[] | undefined, pick: (r: Row) => boolean, f = 'n') =>
    (list ?? []).filter(pick).reduce((s, r) => s + num(r[f]), 0);
  const demoLabel = (k: string | number | null) =>
    k === null
      ? x.unknown
      : (x.demoNames[String(k) as keyof AdminCopy['demoNames']] ?? String(k));
  const regions = new Intl.DisplayNames([lang], { type: 'region' });
  const countryName = (k: string | number | null) => {
    if (!k || k === 'XX' || k === 'T1') return x.unknown;
    try {
      return regions.of(String(k)) ?? String(k);
    } catch {
      return String(k);
    }
  };
  // Cost per part over the range; chat demos also per conversation.
  const parts = new Map<string, number>();
  for (const c of data?.costs ?? [])
    parts.set(String(c.k), (parts.get(String(c.k)) ?? 0) + num(c.usd));
  const insightsUsd = (data?.reports ?? []).reduce(
    (s, r) => s + num(r.cost_usd),
    0,
  );
  if (insightsUsd) parts.set('insights', insightsUsd);
  const costRows = [...parts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      // Voice is per call; chat demos per conversation.
      const per =
        k === 'voice'
          ? sum(data?.activity, (e) => e.kind === 'voice_call')
          : num(data?.demos.find((d) => d.k === k)?.convs);
      return {
        key: k,
        label: demoLabel(k),
        n: v,
        extra: per
          ? (k === 'voice' ? x.perCallCost : x.perConvCost).replace(
              '{usd}',
              usd(v / per),
            )
          : undefined,
      };
    });
  const costTotal = costRows.reduce((s, r) => s + r.n, 0);
  const costDays = data
    ? Math.max(1, daysBetween(data.from, data.to).length)
    : 1;

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

      {/* Range: presets, a month, or any two days (a single day too). */}
      <div
        className={`${card} mt-block flex flex-wrap items-end gap-x-5 gap-y-3`}
        style={{ colorScheme: dark ? 'dark' : 'light' }}
      >
        <div className="flex flex-col gap-1.5">
          <span className={label}>{x.range}</span>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={same(p.r)}
                onClick={() => setRange(p.r)}
                className={`${btn} ${same(p.r) ? 'border-accent text-accent' : ''}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={label}>{x.month}</span>
          <MonthPicker
            value={
              range.from.endsWith('-01') &&
              same(monthRange(range.from.slice(0, 7), today))
                ? range.from.slice(0, 7)
                : ''
            }
            max={today.slice(0, 7)}
            lang={lang}
            x={x}
            onPick={(m) => setRange(monthRange(m, today))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={label}>{x.day}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={x.prevDay}
              className={`${iconBtn} size-8`}
              onClick={() => stepDay(-1)}
            >
              ‹
            </button>
            <input
              type="date"
              aria-label={x.day}
              className={field}
              max={today}
              value={single ? range.from : ''}
              onChange={(e) =>
                e.target.value &&
                setRange({ from: e.target.value, to: e.target.value })
              }
            />
            <button
              type="button"
              aria-label={x.nextDay}
              disabled={single && range.from >= today}
              className={`${iconBtn} size-8 disabled:cursor-not-allowed disabled:opacity-40`}
              onClick={() => stepDay(1)}
            >
              ›
            </button>
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={label}>{x.fromDay}</span>
          <input
            type="date"
            className={field}
            max={range.to}
            value={range.from}
            onChange={(e) =>
              e.target.value && setRange({ ...range, from: e.target.value })
            }
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>{x.toDay}</span>
          <input
            type="date"
            className={field}
            min={range.from}
            max={today}
            value={range.to}
            onChange={(e) =>
              e.target.value && setRange({ ...range, to: e.target.value })
            }
          />
        </label>
        <p className="text-ink m-0 ml-auto self-center text-[14px] font-semibold first-letter:uppercase">
          {rangeText}
        </p>
      </div>

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
            sub={`${x.activityNote} ${x.pickDay}`}
            className="mt-gutter"
          >
            <Activity data={data} x={x} lang={lang} onPick={pickDay} />
          </Section>

          {/* Only with the overview of the same range: the conversion table
              and the day grouping use both. */}
          {traffic?.enabled &&
            data.from === range.from &&
            data.to === range.to && (
              <TrafficView
                t={traffic}
                data={data}
                x={x}
                lang={lang}
                countryName={countryName}
                onPick={pickDay}
                map={map}
              />
            )}
          {trafficErr && (
            <p className={`${note} mt-gutter`}>{x.trafficError}</p>
          )}

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

          <div className="mt-gutter gap-gutter grid md:grid-cols-2">
            <Section title={x.demos} sub={x.demosNote}>
              <Bars
                rows={data.demos.map((d) => ({
                  key: String(d.k),
                  label: demoLabel(d.k),
                  n: num(d.n),
                  extra: num(d.convs)
                    ? x.convs.replace('{n}', String(num(d.convs)))
                    : undefined,
                }))}
                x={x}
              />
            </Section>
            <Section title={x.countries} sub={x.countriesNote}>
              <CountryMap
                map={map}
                values={data.countries.map((c) => ({
                  k: String(c.k ?? ''),
                  n: num(c.n),
                }))}
                unit={x.usersWord}
                countryName={countryName}
              />
              <div className="mt-4" />
              <Bars
                rows={data.countries.map((c) => ({
                  key: String(c.k),
                  label: countryName(c.k),
                  n: num(c.n),
                }))}
                x={x}
              />
            </Section>
            <Section
              title={x.costs}
              sub={x.costsNote
                .replace('{total}', usd(costTotal))
                .replace('{day}', usd(costTotal / costDays))}
              className="md:col-span-2"
            >
              <Bars rows={costRows} x={x} fmt={usd} />
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
