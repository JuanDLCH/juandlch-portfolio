// Client-side tools for the chat lab. They run in the visitor's browser; the
// profile is Juan Diego's CV and portfolio, the menu and orders are fake demo
// data (order.ts), weather comes from Open-Meteo (no key).
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatSession } from '../store';
import { CONTACT, CONTACT_OPTIONS, type ContactOption } from './contact';
import {
  CATEGORIES,
  DINER,
  MENU,
  applyOps,
  describeDish,
  describeOrder,
  emptyOrder,
  type OrderOp,
} from './order';

type Input = Record<string, unknown>;

interface ClientTool {
  def: Anthropic.Beta.BetaTool;
  /** Returns an error message when the (model-supplied) input is invalid. */
  validate: (input: Input) => string | null;
  /** `signal` aborts when the visitor stops the turn. `session` is the turn's
   * working copy: tools that keep state (the order) read and write it there. */
  run: (
    input: Input,
    signal: AbortSignal,
    session: ChatSession,
  ) => Promise<unknown>;
  /** Short result label for the UI, e.g. "3 results". */
  summary: (result: unknown, es: boolean) => string;
}

const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

const searchMenu: ClientTool = {
  def: {
    name: 'search_menu',
    description: `Search the ${DINER} menu. Returns dishes with price, tags (vegetarian, vegan, gluten-free, beef, chicken), allergens (as served with default options, plus those each choice adds), availability and option groups (choice ids to pass to update_order). Empty query and no category list everything.`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'English words matched against names, descriptions, tags and option names, e.g. "vegan" or "burger". Empty for all.',
        },
        category: { type: 'string', enum: [...CATEGORIES] },
      },
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (i.query !== undefined && typeof i.query !== 'string')
      return 'query must be a string';
    if (
      i.category !== undefined &&
      !CATEGORIES.includes(i.category as (typeof CATEGORIES)[number])
    )
      return `category must be one of: ${CATEGORIES.join(', ')}`;
    return null;
  },
  run: async (i) => {
    const q = words(String(i.query ?? ''));
    const hits = MENU.filter(
      (d) =>
        (!i.category || d.category === i.category) &&
        q.every((w) =>
          words(
            [
              d.id,
              d.name.en,
              d.description,
              ...d.tags,
              ...d.groups.flatMap((g) => g.choices.map((x) => x.label.en)),
            ].join(' '),
          ).some((t) => t.startsWith(w) || w.startsWith(t)),
        ),
    );
    return { dishes: hits.map(describeDish), currency: 'USD' };
  },
  summary: (r, es) => {
    const n = (r as { dishes: unknown[] }).dishes.length;
    return es ? `${n} platos` : `${n} dishes`;
  },
};

const updateOrder: ClientTool = {
  def: {
    name: 'update_order',
    description:
      'Change the current order with a list of operations, applied in order. add: a dish by item_id, with quantity (default 1), option choice ids from search_menu (required groups left out get their default) and an optional short note. update: a line by line_id; options picks choices (in one-choice groups like side it replaces the current pick), remove_options drops choices. remove: a line by line_id. If the current order was already placed, this starts a new one. Returns the whole order and errors for the operations that could not be applied (those were skipped).',
    input_schema: {
      type: 'object',
      properties: {
        ops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['add', 'update', 'remove'] },
              item_id: { type: 'string', description: 'add only' },
              line_id: { type: 'string', description: 'update and remove' },
              quantity: { type: 'integer', minimum: 1, maximum: 20 },
              options: { type: 'array', items: { type: 'string' } },
              remove_options: {
                type: 'array',
                items: { type: 'string' },
                description: 'update only',
              },
              note: { type: 'string' },
            },
            required: ['op'],
          },
        },
      },
      required: ['ops'],
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (!Array.isArray(i.ops) || i.ops.length === 0)
      return 'ops must be a non-empty array';
    for (const op of i.ops as Input[]) {
      if (op?.op === 'add' && !str(op.item_id)) return 'add needs an item_id';
      if ((op?.op === 'update' || op?.op === 'remove') && !str(op.line_id))
        return `${String(op.op)} needs a line_id`;
      if (!['add', 'update', 'remove'].includes(op?.op as string))
        return 'op must be add, update or remove';
      for (const k of ['options', 'remove_options'])
        if (
          op[k] !== undefined &&
          !(Array.isArray(op[k]) && (op[k] as unknown[]).every(str))
        )
          return `${k} must be an array of choice ids`;
      if (op.note !== undefined && typeof op.note !== 'string')
        return 'note must be a string';
    }
    return null;
  },
  run: async (i, _signal, s) => {
    // After checkout, the next change starts a new order (line ids go on).
    const current =
      !s.order || s.order.status === 'placed'
        ? { ...emptyOrder(), seq: s.order?.seq ?? 0 }
        : s.order;
    const { order, errors } = applyOps(current, i.ops as OrderOp[]);
    s.order = order;
    return { order: describeOrder(order), errors };
  },
  summary: (r, es) => {
    const { order, errors } = r as {
      order: { lines: unknown[]; total: number };
      errors: string[];
    };
    const n = order.lines.length;
    const lines = es
      ? `${n} ${n === 1 ? 'línea' : 'líneas'}`
      : `${n} ${n === 1 ? 'line' : 'lines'}`;
    const err = errors.length
      ? es
        ? ` · ${errors.length} sin aplicar`
        : ` · ${errors.length} not applied`
      : '';
    return `${lines} · $${order.total.toFixed(2)}${err}`;
  },
};

const placeOrder: ClientTool = {
  def: {
    name: 'place_order',
    description:
      'Place the current order for pickup (simulated, nothing is charged). Only call it after the user explicitly confirmed the order as it is now.',
    input_schema: { type: 'object', properties: {} },
    eager_input_streaming: true,
  },
  validate: () => null,
  run: async (_i, _signal, s) => {
    const o = s.order;
    if (!o || o.lines.length === 0) return { error: 'The order is empty.' };
    if (o.status === 'placed')
      return { error: `Order ${o.order_id} was already placed.` };
    s.order = {
      ...o,
      status: 'placed',
      order_id: `DEMO-${Math.floor(1000 + Math.random() * 9000)}`,
      eta_min: 15 + 5 * Math.min(3, Math.floor(o.lines.length / 2)),
    };
    return {
      order: describeOrder(s.order),
      note: 'Demo order for pickup, nothing was charged.',
    };
  },
  summary: (r, es) => {
    const o = r as { error?: string; order?: { order_id: string } };
    if (o.error) return o.error;
    return es ? `pedido ${o.order!.order_id}` : `order ${o.order!.order_id}`;
  },
};

const getWeather: ClientTool = {
  def: {
    name: 'get_weather',
    description:
      'Current weather for a city. Returns temperature (°C), wind, a short condition and the city timezone.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name, e.g. "Medellín"' },
      },
      required: ['city'],
    },
    eager_input_streaming: true,
  },
  validate: (i) => (str(i.city) ? null : 'city must be a non-empty string'),
  run: async (i, signal) => {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(String(i.city))}`,
      { signal },
    ).then((r) => r.json());
    const place = geo?.results?.[0];
    if (!place) return { error: `city not found: ${String(i.city)}` };
    const wx = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`,
      { signal },
    ).then((r) => r.json());
    return {
      city: `${place.name}, ${place.country}`,
      timezone: place.timezone,
      current: wx?.current,
      units: wx?.current_units,
      weather_code_note:
        'WMO weather code (0 clear, 1-3 cloudy, 45-48 fog, 51-67 rain, 71-77 snow, 80-82 showers, 95-99 storm)',
    };
  },
  summary: (r) => {
    const w = r as {
      city?: string;
      current?: { temperature_2m?: number };
      error?: string;
    };
    return w.error
      ? w.error
      : `${w.city} · ${w.current?.temperature_2m ?? '?'}°C`;
  },
};

const getTime: ClientTool = {
  def: {
    name: 'get_time',
    description:
      'Current local date and time for an IANA timezone, e.g. "America/Bogota".',
    input_schema: {
      type: 'object',
      properties: { timezone: { type: 'string' } },
      required: ['timezone'],
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (!str(i.timezone)) return 'timezone must be a non-empty string';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: String(i.timezone) });
      return null;
    } catch {
      return `unknown timezone: ${String(i.timezone)}`;
    }
  },
  run: async (i) => ({
    timezone: i.timezone,
    local_time: new Intl.DateTimeFormat('en-US', {
      timeZone: String(i.timezone),
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date()),
  }),
  summary: (r) => (r as { local_time: string }).local_time,
};

// Profile tools of the "Meet my AI" case. The data (profile.ts) loads on the
// first call; each entry carries the source the model must cite.
export const PROFILE_SECTIONS = [
  'summary',
  'skills',
  'experience',
  'client_work',
  'education_languages',
  'certifications',
  'portfolio_work',
  'portfolio_stack',
  'portfolio_principles',
  'portfolio_approach',
  'notes',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

// `group` labels the tool card ("CV · Experience"); `source` is what the
// model cites.
const loadProfile = async () =>
  (await import('./profile')).PROFILE.map((e) => ({
    ...e,
    group: e.group ?? e.source.label,
  }));

// Lowercase, accents removed, split into words.
const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w.length > 1);

const getProfileSection: ClientTool = {
  def: {
    name: 'get_profile_section',
    description:
      "Return one section of Juan Diego's profile. CV sections: summary, skills, experience (roles and dates), client_work, education_languages, certifications. Portfolio sections: portfolio_work (case studies), portfolio_stack (full toolbox, clouds), portfolio_principles, portfolio_approach (RAG approach, career path, leadership). notes: roles he is looking for, availability, other clouds, how he learns, contact. Each entry has the source to cite.",
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: [...PROFILE_SECTIONS] },
      },
      required: ['section'],
    },
    eager_input_streaming: true,
  },
  validate: (i) =>
    PROFILE_SECTIONS.includes(i.section as ProfileSection)
      ? null
      : `section must be one of: ${PROFILE_SECTIONS.join(', ')}`,
  run: async (i) => ({
    entries: (await loadProfile()).filter((e) => e.section === i.section),
  }),
  summary: (r) => {
    const groups = new Set(
      (r as { entries: { group: string }[] }).entries.map((e) => e.group),
    );
    return [...groups].join(', ');
  },
};

const searchProfile: ClientTool = {
  def: {
    name: 'search_profile',
    description:
      'Keyword search over Juan Diego\'s CV, portfolio and notes. Use English keywords (technologies, clouds, companies, skills), e.g. "AWS Bedrock" or "voice agents". Returns the best-matching entries, each with the source to cite.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'English keywords' },
      },
      required: ['query'],
    },
    eager_input_streaming: true,
  },
  validate: (i) =>
    !str(i.query)
      ? 'query must be a non-empty string'
      : String(i.query).length > 200
        ? 'query must be at most 200 characters'
        : null,
  run: async (i) => {
    const q = words(String(i.query));
    const scored = (await loadProfile()).map((e) => {
      const title = words(`${e.group} ${e.title}`);
      const body = words(e.text);
      // Title hits weigh more; prefixes match ("agent" finds "agents").
      const score = q.reduce(
        (s, w) =>
          s +
          (title.some((t) => t.startsWith(w)) ? 2 : 0) +
          (body.some((t) => t.startsWith(w)) ? 1 : 0),
        0,
      );
      return { e, score };
    });
    const entries = scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.e);
    return entries.length
      ? { entries }
      : {
          entries,
          note: 'No matches. Try other keywords or get_profile_section; if it is still missing, it is not in his profile.',
        };
  },
  summary: (r, es) => {
    const n = (r as { entries: unknown[] }).entries.length;
    return es ? `${n} resultados` : `${n} results`;
  },
};

// Draws contact buttons under the answer (ChatApp reads the input back).
const showContactOptions: ClientTool = {
  def: {
    name: 'show_contact_options',
    description:
      'Show buttons under your answer so the user can reach Juan Diego: book a Google Meet with him, email him, or open his LinkedIn or GitHub. The buttons are the only way to reach him from here; you cannot send emails or book meetings yourself.',
    input_schema: {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          items: { type: 'string', enum: [...CONTACT_OPTIONS] },
          description: 'Buttons to show, in order',
        },
        topic: {
          type: 'string',
          description:
            'Short email subject in the language of the user, e.g. "Senior AI Engineer role at Acme"',
        },
      },
      required: ['options'],
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (
      !Array.isArray(i.options) ||
      i.options.length === 0 ||
      !i.options.every((o) => CONTACT_OPTIONS.includes(o as ContactOption))
    )
      return `options must be a non-empty array of: ${CONTACT_OPTIONS.join(', ')}`;
    if (
      i.topic !== undefined &&
      (typeof i.topic !== 'string' || i.topic.length > 80)
    )
      return 'topic must be a string of at most 80 characters';
    return null;
  },
  run: async (i) => ({
    shown: i.options,
    ...((i.options as string[]).includes('meeting') && {
      meeting: CONTACT.booking
        ? 'The meeting button opens his booking page. Its form has a field to say what the meeting is about (a freelance project, a job offer, technical consulting…): optional, but it makes it more likely he accepts.'
        : 'Booking is not available yet: the button shows "coming soon". Do not offer to book; suggest email or LinkedIn to arrange a call.',
    }),
    note: 'The buttons appear under your answer. Do not repeat the email address or links in your text.',
  }),
  summary: (r) => (r as { shown: string[] }).shown.join(' · '),
};

export const CLIENT_TOOLS: Record<string, ClientTool> = {
  show_contact_options: showContactOptions,
  get_profile_section: getProfileSection,
  search_profile: searchProfile,
  search_menu: searchMenu,
  update_order: updateOrder,
  place_order: placeOrder,
  get_weather: getWeather,
  get_time: getTime,
};
