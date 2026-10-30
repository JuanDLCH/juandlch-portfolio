// Client-side tools for the chat lab. They run in the visitor's browser; the
// menu and orders are fake demo data, weather comes from Open-Meteo (no key).
import type Anthropic from '@anthropic-ai/sdk';

type Input = Record<string, unknown>;

interface ClientTool {
  def: Anthropic.Beta.BetaTool;
  /** Returns an error message when the (model-supplied) input is invalid. */
  validate: (input: Input) => string | null;
  run: (input: Input) => Promise<unknown>;
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
  run: async (i) => {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(String(i.city))}`,
    ).then((r) => r.json());
    const place = geo?.results?.[0];
    if (!place) return { error: `city not found: ${String(i.city)}` };
    const wx = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`,
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

export const CLIENT_TOOLS: Record<string, ClientTool> = {
  search_menu: searchMenu,
  place_order: placeOrder,
  get_weather: getWeather,
  get_time: getTime,
};
