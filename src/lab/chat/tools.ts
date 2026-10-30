// Client-side tools for the chat lab. They run in the visitor's browser; the
// profile is Juan Diego's CV and portfolio, the menu and orders are fake demo
// data, weather comes from Open-Meteo (no key).
import type Anthropic from '@anthropic-ai/sdk';
import {
  CONTACT,
  CONTACT_OPTIONS,
  MEETING_PURPOSES,
  type ContactOption,
  type MeetingPurpose,
} from './contact';

type Input = Record<string, unknown>;

interface ClientTool {
  def: Anthropic.Beta.BetaTool;
  /** Returns an error message when the (model-supplied) input is invalid. */
  validate: (input: Input) => string | null;
  /** `signal` aborts when the visitor stops the turn. */
  run: (input: Input, signal: AbortSignal) => Promise<unknown>;
  /** Short result label for the UI, e.g. "3 results". */
  summary: (result: unknown, es: boolean) => string;
}

const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

const MENU = [
  {
    id: 'bowl',
    name: 'Garden bowl',
    tags: ['vegetarian', 'vegan', 'gluten-free'],
    price: 9.5,
  },
  {
    id: 'falafel',
    name: 'Falafel wrap',
    tags: ['vegetarian', 'vegan'],
    price: 8,
  },
  { id: 'pizza-veg', name: 'Veggie pizza', tags: ['vegetarian'], price: 11 },
  { id: 'burger', name: 'Classic burger', tags: ['beef'], price: 12 },
  {
    id: 'chicken',
    name: 'Grilled chicken plate',
    tags: ['chicken', 'gluten-free'],
    price: 13,
  },
  {
    id: 'lemonade',
    name: 'Mint lemonade',
    tags: ['drink', 'vegan'],
    price: 3.5,
  },
];

const searchMenu: ClientTool = {
  def: {
    name: 'search_menu',
    description:
      'Search the restaurant menu. Matches dish names and tags (vegetarian, vegan, gluten-free, beef, chicken, drink). Use an empty query to list everything.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Words to match, e.g. "vegetarian" or "pizza"',
        },
      },
      required: ['query'],
    },
    eager_input_streaming: true,
  },
  validate: (i) =>
    typeof i.query === 'string' ? null : 'query must be a string',
  run: async (i) => {
    const words = String(i.query).toLowerCase().split(/\s+/).filter(Boolean);
    const hits = MENU.filter((d) =>
      words.every(
        (w) =>
          d.name.toLowerCase().includes(w) || d.tags.some((t) => t.includes(w)),
      ),
    );
    return { dishes: hits, currency: 'USD' };
  },
  summary: (r, es) => {
    const n = (r as { dishes: unknown[] }).dishes.length;
    return es ? `${n} resultados` : `${n} results`;
  },
};

const placeOrder: ClientTool = {
  def: {
    name: 'place_order',
    description:
      'Place a mock order with dish ids from search_menu. Only call it after the user confirmed the items.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              quantity: { type: 'integer', minimum: 1 },
            },
            required: ['id', 'quantity'],
          },
        },
      },
      required: ['items'],
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (!Array.isArray(i.items) || i.items.length === 0)
      return 'items must be a non-empty array';
    for (const it of i.items as Input[]) {
      if (!MENU.some((d) => d.id === it?.id))
        return `unknown dish id: ${String(it?.id)}`;
      if (!Number.isInteger(it.quantity) || (it.quantity as number) < 1)
        return 'quantity must be a positive integer';
    }
    return null;
  },
  run: async (i) => {
    const items = (i.items as { id: string; quantity: number }[]).map((it) => {
      const d = MENU.find((m) => m.id === it.id)!;
      return {
        name: d.name,
        quantity: it.quantity,
        subtotal: d.price * it.quantity,
      };
    });
    const total = items.reduce((s, it) => s + it.subtotal, 0);
    return {
      order_id: `DEMO-${Math.floor(1000 + Math.random() * 9000)}`,
      items,
      total,
      currency: 'USD',
      note: 'Demo order, nothing was charged.',
    };
  },
  summary: (r, es) => {
    const o = r as { order_id: string };
    return es ? `pedido ${o.order_id}` : `order ${o.order_id}`;
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
      'Show buttons under your answer so the user can reach Juan Diego: book a Google Meet with him, email him, or open his LinkedIn or GitHub. The buttons are the only way to reach him from here; you cannot send emails or book meetings yourself. For a meeting, pass what it is about when the user told you: the button copies it so they can paste it in the booking form.',
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
        meeting_purpose: {
          type: 'string',
          enum: [...MEETING_PURPOSES],
          description: 'What the meeting is about, if the user said so',
        },
        meeting_note: {
          type: 'string',
          description:
            "One or two sentences with the user's context for the meeting, in their language. Only what they told you.",
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
    if (
      i.meeting_purpose !== undefined &&
      !MEETING_PURPOSES.includes(i.meeting_purpose as MeetingPurpose)
    )
      return `meeting_purpose must be one of: ${MEETING_PURPOSES.join(', ')}`;
    if (
      i.meeting_note !== undefined &&
      (typeof i.meeting_note !== 'string' || i.meeting_note.length > 300)
    )
      return 'meeting_note must be a string of at most 300 characters';
    return null;
  },
  run: async (i) => {
    const meeting = (i.options as string[]).includes('meeting');
    const described = Boolean(i.meeting_purpose || i.meeting_note);
    return {
      shown: i.options,
      ...(meeting && {
        meeting: !CONTACT.booking
          ? 'Booking is not available yet: the button shows "coming soon". Do not offer to book; suggest email or LinkedIn to arrange a call.'
          : described
            ? 'The meeting button copies the note and opens his booking page: tell the user to pick a slot and paste the note in the form.'
            : 'The meeting button first offers an optional short form (what it is about), then opens his booking page.',
      }),
      note: 'The buttons appear under your answer. Do not repeat the email address or links in your text.',
    };
  },
  summary: (r) => (r as { shown: string[] }).shown.join(' · '),
};

export const CLIENT_TOOLS: Record<string, ClientTool> = {
  show_contact_options: showContactOptions,
  get_profile_section: getProfileSection,
  search_profile: searchProfile,
  search_menu: searchMenu,
  place_order: placeOrder,
  get_weather: getWeather,
  get_time: getTime,
};
