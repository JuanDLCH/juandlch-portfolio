// Menu and order logic of the "Order assistant" case: a made-up diner. The
// model only maps requests to operations; validation and prices happen here.
// Names are bilingual: the model asks for the customer's language (`lang`),
// and the order and menu cards render in it.
type L = { en: string; es: string };
export type Lang = keyof L;
export const LANGS: Lang[] = ['en', 'es'];

export const DINER = 'Ember & Bowl';
const TAX = 0.08;

interface Choice {
  /** Unique within its dish, so the model can pass bare ids. */
  id: string;
  label: L;
  price: number;
  available: boolean;
  /** Allergens this choice adds to the dish. */
  allergens?: string[];
}

interface Group {
  id: string;
  label: L;
  min: number;
  max: number;
  /** Picked when the user doesn't say (only for required groups). */
  default?: string;
  choices: Choice[];
}

export interface Dish {
  id: string;
  name: L;
  category: Category;
  description: L;
  price: number;
  tags: string[];
  /** Allergens of the dish itself; options add their own. */
  allergens: string[];
  available: boolean;
  groups: Group[];
}

const c = (
  id: string,
  en: string,
  es: string,
  price = 0,
  available = true,
  allergens: string[] = [],
): Choice => ({
  id,
  label: { en, es },
  price,
  available,
  ...(allergens.length ? { allergens } : {}),
});

const burgerGroups: Group[] = [
  {
    id: 'side',
    label: { en: 'Side', es: 'Acompañante' },
    min: 1,
    max: 1,
    default: 'fries',
    choices: [
      c('fries', 'Fries', 'Papas fritas'),
      c('side-salad', 'Side salad', 'Ensalada'),
      c('sweet-potato', 'Sweet potato fries', 'Papas de camote', 1, false),
    ],
  },
  {
    id: 'remove',
    label: { en: 'Remove', es: 'Quitar' },
    min: 0,
    max: 4,
    choices: [
      c('no-onion', 'No onion', 'Sin cebolla'),
      c('no-pickles', 'No pickles', 'Sin pepinillos'),
      c('no-tomato', 'No tomato', 'Sin tomate'),
      c('no-lettuce', 'No lettuce', 'Sin lechuga'),
    ],
  },
  {
    id: 'extras',
    label: { en: 'Extras', es: 'Extras' },
    min: 0,
    max: 3,
    choices: [
      c('extra-cheese', 'Extra cheese', 'Queso extra', 1.5, true, ['dairy']),
      c('bacon', 'Bacon', 'Tocineta', 2),
      c('avocado', 'Avocado', 'Aguacate', 2),
    ],
  },
];

// Bowls have no defaults: the customer picks base, protein and dressing.
const bowlGroups = (proteins: Choice[]): Group[] => [
  {
    id: 'base',
    label: { en: 'Base', es: 'Base' },
    min: 1,
    max: 1,
    choices: [
      c('rice', 'Brown rice', 'Arroz integral'),
      c('greens', 'Mixed greens', 'Mix de hojas'),
      c('quinoa', 'Quinoa', 'Quinoa'),
    ],
  },
  {
    id: 'protein',
    label: { en: 'Protein', es: 'Proteína' },
    min: 1,
    max: 1,
    choices: proteins,
  },
  {
    id: 'dressing',
    label: { en: 'Dressing', es: 'Aderezo' },
    min: 1,
    max: 1,
    choices: [
      c('tahini', 'Lemon tahini', 'Tahini de limón', 0, true, ['sesame']),
      c('chipotle', 'Chipotle mayo', 'Mayonesa chipotle', 0, true, ['egg']),
      c('no-dressing', 'No dressing', 'Sin aderezo'),
    ],
  },
];

const drinkSize: Group[] = [
  {
    id: 'size',
    label: { en: 'Size', es: 'Tamaño' },
    min: 1,
    max: 1,
    default: 'regular',
    choices: [
      c('regular', 'Regular', 'Regular'),
      c('large', 'Large', 'Grande', 1),
    ],
  },
];

export const MENU: Dish[] = [
  {
    id: 'classic-burger',
    name: { en: 'Classic burger', es: 'Hamburguesa clásica' },
    category: 'burgers',
    description: {
      en: 'Beef patty, lettuce, tomato, onion, pickles and house sauce on a brioche bun.',
      es: 'Carne de res, lechuga, tomate, cebolla, pepinillos y salsa de la casa en pan brioche.',
    },
    price: 12,
    tags: ['beef'],
    allergens: ['gluten', 'egg', 'sesame'],
    available: true,
    groups: burgerGroups,
  },
  {
    id: 'cheeseburger',
    name: { en: 'Cheeseburger', es: 'Hamburguesa con queso' },
    category: 'burgers',
    description: {
      en: 'The classic burger with melted cheddar.',
      es: 'La clásica con queso cheddar derretido.',
    },
    price: 13,
    tags: ['beef'],
    allergens: ['gluten', 'egg', 'sesame', 'dairy'],
    available: true,
    groups: burgerGroups,
  },
  {
    id: 'veggie-burger',
    name: { en: 'Veggie burger', es: 'Hamburguesa vegetariana' },
    category: 'burgers',
    description: {
      en: 'Black bean and quinoa patty, lettuce, tomato, onion and pickles.',
      es: 'Medallón de fríjol negro y quinoa, lechuga, tomate, cebolla y pepinillos.',
    },
    price: 12,
    tags: ['vegetarian'],
    allergens: ['gluten', 'sesame'],
    available: true,
    groups: burgerGroups,
  },
  {
    id: 'garden-bowl',
    name: { en: 'Garden bowl', es: 'Bowl de la huerta' },
    category: 'bowls',
    description: {
      en: 'Roasted vegetables, chickpeas, cucumber and herbs.',
      es: 'Vegetales asados, garbanzos, pepino y hierbas.',
    },
    price: 11,
    tags: ['vegetarian', 'vegan', 'gluten-free'],
    allergens: [],
    available: true,
    groups: bowlGroups([
      c('tofu', 'Crispy tofu', 'Tofu crocante'),
      c('falafel', 'Falafel', 'Falafel'),
    ]),
  },
  {
    id: 'chicken-bowl',
    name: { en: 'Chicken bowl', es: 'Bowl de pollo' },
    category: 'bowls',
    description: {
      en: 'Grilled chicken, corn, black beans, pico de gallo.',
      es: 'Pollo a la plancha, maíz, fríjol negro y pico de gallo.',
    },
    price: 13,
    tags: ['chicken', 'gluten-free'],
    allergens: [],
    available: true,
    groups: bowlGroups([
      c('chicken', 'Grilled chicken', 'Pollo a la plancha'),
      c('double-chicken', 'Double chicken', 'Doble pollo', 3),
    ]),
  },
  {
    id: 'fries',
    name: { en: 'Fries', es: 'Papas fritas' },
    category: 'sides',
    description: {
      en: 'Hand-cut fries with sea salt.',
      es: 'Papas cortadas a mano con sal marina.',
    },
    price: 4,
    tags: ['vegan', 'gluten-free'],
    allergens: [],
    available: true,
    groups: [],
  },
  {
    id: 'sweet-potato-fries',
    name: { en: 'Sweet potato fries', es: 'Papas de camote' },
    category: 'sides',
    description: {
      en: 'With chipotle mayo.',
      es: 'Con mayonesa chipotle.',
    },
    price: 5,
    tags: ['vegetarian', 'gluten-free'],
    allergens: ['egg'],
    available: false,
    groups: [],
  },
  {
    id: 'side-salad',
    name: { en: 'Side salad', es: 'Ensalada' },
    category: 'sides',
    description: {
      en: 'Greens, cucumber and tomato with vinaigrette.',
      es: 'Hojas verdes, pepino y tomate con vinagreta.',
    },
    price: 4,
    tags: ['vegan', 'gluten-free'],
    allergens: [],
    available: true,
    groups: [],
  },
  {
    id: 'lemonade',
    name: { en: 'Mint lemonade', es: 'Limonada de hierbabuena' },
    category: 'drinks',
    description: {
      en: 'Fresh lemon and mint.',
      es: 'Limón fresco y hierbabuena.',
    },
    price: 3.5,
    tags: ['vegan', 'gluten-free'],
    allergens: [],
    available: true,
    groups: drinkSize,
  },
  {
    id: 'iced-tea',
    name: { en: 'Iced tea', es: 'Té helado' },
    category: 'drinks',
    description: {
      en: 'Black tea with peach, lightly sweetened.',
      es: 'Té negro con durazno, poco dulce.',
    },
    price: 3,
    tags: ['vegan', 'gluten-free'],
    allergens: [],
    available: true,
    groups: drinkSize,
  },
  {
    id: 'soda',
    name: { en: 'Soda', es: 'Gaseosa' },
    category: 'drinks',
    description: {
      en: 'Cola, diet cola or lemon-lime.',
      es: 'Cola, cola light o lima-limón.',
    },
    price: 2.5,
    tags: ['vegan', 'gluten-free'],
    allergens: [],
    available: true,
    groups: [
      {
        id: 'flavor',
        label: { en: 'Flavor', es: 'Sabor' },
        min: 1,
        max: 1,
        choices: [
          c('cola', 'Cola', 'Cola'),
          c('diet-cola', 'Diet cola', 'Cola light'),
          c('lemon-lime', 'Lemon-lime', 'Lima-limón'),
        ],
      },
    ],
  },
  {
    id: 'brownie',
    name: { en: 'Chocolate brownie', es: 'Brownie de chocolate' },
    category: 'desserts',
    description: {
      en: 'Warm, with a pinch of sea salt.',
      es: 'Tibio, con un toque de sal marina.',
    },
    price: 5,
    tags: ['vegetarian'],
    allergens: ['gluten', 'egg', 'dairy', 'nuts'],
    available: true,
    groups: [],
  },
];

export const CATEGORIES = [
  'burgers',
  'bowls',
  'sides',
  'drinks',
  'desserts',
] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, L> = {
  burgers: { en: 'Burgers', es: 'Hamburguesas' },
  bowls: { en: 'Bowls', es: 'Bowls' },
  sides: { en: 'Sides', es: 'Acompañantes' },
  drinks: { en: 'Drinks', es: 'Bebidas' },
  desserts: { en: 'Desserts', es: 'Postres' },
};
export const TAG_LABEL: Record<string, L> = {
  vegetarian: { en: 'Vegetarian', es: 'Vegetariano' },
  vegan: { en: 'Vegan', es: 'Vegano' },
  'gluten-free': { en: 'Gluten-free', es: 'Sin gluten' },
};

/** Dishes a show_menu call lists: given ids, a category, or everything. */
export const menuSelection = (category?: Category, ids?: string[]) =>
  ids?.length
    ? MENU.filter((d) => ids.includes(d.id))
    : MENU.filter((d) => !category || d.category === category);

export interface OrderLine {
  line_id: string;
  item_id: string;
  quantity: number;
  /** Choice ids, in menu order. */
  options: string[];
  note?: string;
  unit_price: number;
  subtotal: number;
}

export interface Order {
  lines: OrderLine[];
  subtotal: number;
  tax: number;
  total: number;
  status: 'open' | 'placed';
  /** Language of the conversation, for the order card. */
  lang: Lang;
  /** Last line id handed out, so removed ids are never reused. */
  seq: number;
  order_id?: string;
  eta_min?: number;
}

export type OrderOp =
  | {
      op: 'add';
      item_id: string;
      quantity?: number;
      options?: string[];
      note?: string;
    }
  | {
      op: 'update';
      line_id: string;
      quantity?: number;
      options?: string[];
      remove_options?: string[];
      note?: string;
    }
  | { op: 'remove'; line_id: string };

export const emptyOrder = (): Order => ({
  lines: [],
  subtotal: 0,
  tax: 0,
  total: 0,
  status: 'open',
  lang: 'en',
  seq: 0,
});

const money = (n: number) => Math.round(n * 100) / 100;
export const dish = (id: string) => MENU.find((d) => d.id === id);
const choiceOf = (d: Dish, id: string) => {
  for (const g of d.groups) {
    const ch = g.choices.find((x) => x.id === id);
    if (ch) return { g, ch };
  }
  return null;
};

/** Label of a chosen option, for the order card. */
export const optionLabel = (itemId: string, optionId: string) =>
  (dish(itemId) && choiceOf(dish(itemId)!, optionId)?.ch.label) ?? {
    en: optionId,
    es: optionId,
  };

/** Applies `wanted` over `current` (a pick in a single-choice group replaces
 * the old one), drops `drop` and fills required groups with their default.
 * Returns the options in menu order, or an error for the model. */
function resolveOptions(
  d: Dish,
  current: string[],
  wanted: string[],
  drop: string[],
): string[] | string {
  let picked = current.filter((id) => !drop.includes(id));
  for (const id of wanted) {
    const hit = choiceOf(d, id);
    if (!hit) {
      const valid = d.groups.flatMap((g) =>
        g.choices.map((x) => `${x.id} (${g.id})`),
      );
      return `"${id}" is not an option of ${d.name.en}. ${valid.length ? `Options: ${valid.join(', ')}` : 'It has no options.'}`;
    }
    if (!hit.ch.available)
      return `${hit.ch.label.en} is sold out today. Other ${hit.g.id} choices: ${hit.g.choices
        .filter((x) => x.available)
        .map((x) => x.id)
        .join(', ')}`;
    if (hit.g.max === 1)
      picked = picked.filter((p) => !hit.g.choices.some((x) => x.id === p));
    if (!picked.includes(id)) picked.push(id);
  }
  for (const g of d.groups) {
    const inGroup = picked.filter((p) => g.choices.some((x) => x.id === p));
    if (inGroup.length === 0 && g.min > 0 && g.default) picked.push(g.default);
    else if (inGroup.length < g.min)
      return `${d.name.en} needs a ${g.id} choice; ask the customer which one (${g.choices
        .filter((x) => x.available)
        .map((x) => x.id)
        .join(', ')}).`;
    if (inGroup.length > g.max)
      return `${d.name.en} allows at most ${g.max} ${g.id} choice(s); got ${inGroup.join(', ')}.`;
  }
  const order = d.groups.flatMap((g) => g.choices.map((x) => x.id));
  return picked.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

const price = (d: Dish, options: string[], quantity: number) => {
  const unit = money(
    d.price +
      options.reduce((s, id) => s + (choiceOf(d, id)?.ch.price ?? 0), 0),
  );
  return { unit_price: unit, subtotal: money(unit * quantity) };
};

const quantityError = (q: unknown) =>
  q === undefined ||
  (Number.isInteger(q) && (q as number) >= 1 && (q as number) <= 20)
    ? null
    : 'quantity must be an integer from 1 to 20';

const totals = (o: Order): Order => {
  const subtotal = money(o.lines.reduce((s, l) => s + l.subtotal, 0));
  const tax = money(subtotal * TAX);
  return { ...o, subtotal, tax, total: money(subtotal + tax) };
};

/** Applies the operations in order. Invalid ones are skipped and reported, so
 * the model can tell the user and offer what's possible. */
export function applyOps(start: Order, ops: OrderOp[]) {
  let o: Order = { ...start, lines: [...start.lines] };
  const errors: string[] = [];
  ops.forEach((op, n) => {
    const fail = (msg: string) => errors.push(`op ${n + 1} (${op.op}): ${msg}`);
    if (op.op === 'add') {
      const d = dish(op.item_id);
      if (!d) return fail(`unknown item_id "${op.item_id}"; use search_menu`);
      if (!d.available) return fail(`${d.name.en} is sold out today.`);
      const qErr = quantityError(op.quantity);
      if (qErr) return fail(qErr);
      const options = resolveOptions(d, [], op.options ?? [], []);
      if (typeof options === 'string') return fail(options);
      const quantity = op.quantity ?? 1;
      o.seq += 1;
      o.lines.push({
        line_id: `L${o.seq}`,
        item_id: d.id,
        quantity,
        options,
        ...(op.note ? { note: op.note } : {}),
        ...price(d, options, quantity),
      });
      return;
    }
    const at = o.lines.findIndex((l) => l.line_id === op.line_id);
    if (at < 0)
      return fail(
        `no line "${op.line_id}" in the order (lines: ${o.lines.map((l) => l.line_id).join(', ') || 'none'})`,
      );
    if (op.op === 'remove') {
      o.lines.splice(at, 1);
      return;
    }
    const line = o.lines[at];
    const d = dish(line.item_id)!;
    const qErr = quantityError(op.quantity);
    if (qErr) return fail(qErr);
    const options = resolveOptions(
      d,
      line.options,
      op.options ?? [],
      op.remove_options ?? [],
    );
    if (typeof options === 'string') return fail(options);
    const quantity = op.quantity ?? line.quantity;
    const note = op.note === undefined ? line.note : op.note || undefined;
    o.lines[at] = {
      line_id: line.line_id,
      item_id: line.item_id,
      quantity,
      options,
      ...(note ? { note } : {}),
      ...price(d, options, quantity),
    };
  });
  o = totals(o);
  return { order: o, errors };
}

/** The dish's allergens plus those of the chosen options. */
const allergensWith = (d: Dish, options: string[]) => [
  ...new Set([
    ...d.allergens,
    ...options.flatMap((id) => choiceOf(d, id)?.ch.allergens ?? []),
  ]),
];

/** The order as the model sees it: names instead of bare ids. */
export const describeOrder = (o: Order) => ({
  status: o.status,
  lines: o.lines.map((l) => ({
    line_id: l.line_id,
    item_id: l.item_id,
    name: dish(l.item_id)?.name[o.lang],
    quantity: l.quantity,
    options: l.options.map(
      (id) => `${optionLabel(l.item_id, id)[o.lang]} (${id})`,
    ),
    allergens: allergensWith(dish(l.item_id)!, l.options),
    ...(l.note ? { note: l.note } : {}),
    unit_price: l.unit_price,
    subtotal: l.subtotal,
  })),
  subtotal: o.subtotal,
  tax: o.tax,
  total: o.total,
  currency: 'USD',
  ...(o.order_id ? { order_id: o.order_id, eta_min: o.eta_min } : {}),
});

/** A dish as the model sees it. */
export const describeDish = (d: Dish, lang: Lang) => ({
  id: d.id,
  name: d.name[lang],
  category: d.category,
  description: d.description[lang],
  price: d.price,
  tags: d.tags,
  // As served with the default options; each choice lists what it adds.
  allergens: allergensWith(
    d,
    d.groups.flatMap((g) => (g.default ? [g.default] : [])),
  ),
  available: d.available,
  option_groups: d.groups.map((g) => ({
    id: g.id,
    pick: g.max === 1 ? 'one' : `up to ${g.max}`,
    required: g.min > 0,
    ...(g.default ? { default: g.default } : {}),
    choices: g.choices.map((x) => ({
      id: x.id,
      name: x.label[lang],
      ...(x.price ? { price: x.price } : {}),
      ...(x.allergens ? { allergens: x.allergens } : {}),
      ...(x.available ? {} : { available: false }),
    })),
  })),
});
