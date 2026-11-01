// Client-side tools for the chat lab. They run in the visitor's browser; the
// profile is Juan Diego's CV and portfolio, the menu and orders are fake demo
// data (order.ts, insurance.ts), weather comes from Open-Meteo (no key).
import type Anthropic from '@anthropic-ai/sdk';
import { IMAGE_TYPES } from '../attachments';
import type { ChatSession } from '../store';
import { CONTACT, CONTACT_OPTIONS, type ContactOption } from './contact';
import {
  CATEGORIES,
  DINER,
  LANGS,
  MENU,
  TAG_LABEL,
  applyOps,
  describeDish,
  describeOrder,
  emptyOrder,
  menuSelection,
  type Category,
  type Lang,
  type OrderOp,
} from './order';
import {
  chunkId,
  docLanguage,
  pageId,
  searchDocs,
  sourceOf,
  type Doc,
} from './docs';
import {
  BODY_TYPES,
  DAMAGE_AREAS,
  attachInvoice,
  type DamageArea,
  INCIDENT_IDS,
  INSURER,
  checkCoverage,
  checkPhoto,
  describeClaim,
  describePolicy,
  fileClaim,
  type BodyType,
  type Incident,
} from './insurance';

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

// Order assistant tools: they take the customer's language so names come
// back (and the cards render) in it.
const LANG_PROP = {
  type: 'string',
  enum: [...LANGS],
  description:
    "The language of the customer's latest message: es for Spanish, en for any other.",
} as const;
const langOf = (v: unknown, fallback: Lang = 'en'): Lang =>
  LANGS.includes(v as Lang) ? (v as Lang) : fallback;
const isCategory = (v: unknown) => CATEGORIES.includes(v as Category);

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
            'Words (English or Spanish) matched against names, descriptions, tags and option names, e.g. "vegan" or "burger". Empty for all.',
        },
        category: { type: 'string', enum: [...CATEGORIES] },
        lang: LANG_PROP,
      },
      required: ['lang'],
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (i.query !== undefined && typeof i.query !== 'string')
      return 'query must be a string';
    if (i.category !== undefined && !isCategory(i.category))
      return `category must be one of: ${CATEGORIES.join(', ')}`;
    return null;
  },
  run: async (i) => {
    const lang = langOf(i.lang);
    const q = words(String(i.query ?? ''));
    const hits = MENU.filter(
      (d) =>
        (!i.category || d.category === i.category) &&
        q.every((w) =>
          words(
            [
              d.id,
              ...LANGS.flatMap((l) => [d.name[l], d.description[l]]),
              ...d.tags.flatMap((t) => [
                t,
                ...LANGS.map((l) => TAG_LABEL[t]?.[l] ?? ''),
              ]),
              ...d.groups.flatMap((g) =>
                g.choices.flatMap((x) => LANGS.map((l) => x.label[l])),
              ),
            ].join(' '),
          ).some((t) => t.startsWith(w) || w.startsWith(t)),
        ),
    );
    return {
      dishes: hits.map((d) => describeDish(d, lang)),
      currency: 'USD',
    };
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
      'Change the current order with a list of operations, applied in order. add: a dish by item_id, with quantity (default 1), option choice ids from search_menu (a required group left out gets its default if it has one; otherwise the op fails and you must ask the customer) and an optional short note. update: a line by line_id; options picks choices (in one-choice groups like side it replaces the current pick), remove_options drops choices. remove: a line by line_id. If the current order was already placed, this starts a new one. Returns the whole order and errors for the operations that could not be applied (those were skipped).',
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
        lang: LANG_PROP,
      },
      required: ['ops', 'lang'],
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
    s.order = { ...order, lang: langOf(i.lang, current.lang) };
    return { order: describeOrder(s.order), errors };
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

const showMenu: ClientTool = {
  def: {
    name: 'show_menu',
    description:
      'Show the customer the menu: with no category or item_ids, the whole menu opens in a view-only window (the chat keeps a button to reopen it); a category or specific dishes (e.g. the ones matching a question) show as a card under your reply, where tapping a dish starts a message to order it. Both show prices, dietary tags and what is sold out. Use it whenever the customer wants to see the menu or options instead of listing dishes in text.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: [...CATEGORIES] },
        item_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific dishes (ids from search_menu).',
        },
        lang: LANG_PROP,
      },
      required: ['lang'],
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (i.category !== undefined && !isCategory(i.category))
      return `category must be one of: ${CATEGORIES.join(', ')}`;
    if (i.item_ids !== undefined) {
      if (!Array.isArray(i.item_ids)) return 'item_ids must be an array';
      const bad = (i.item_ids as unknown[]).find(
        (id) => !MENU.some((d) => d.id === id),
      );
      if (bad !== undefined) return `unknown item_id: ${String(bad)}`;
    }
    return null;
  },
  run: async (i) => {
    const shown = menuSelection(
      i.category as Category | undefined,
      i.item_ids as string[] | undefined,
    );
    const lang = langOf(i.lang);
    return {
      shown: shown.map((d) => ({
        id: d.id,
        name: d.name[lang],
        price: d.price,
        ...(d.available ? {} : { available: false }),
      })),
      note: 'The customer sees these dishes on screen; do not list them again.',
    };
  },
  summary: (r, es) => {
    const n = (r as { shown: unknown[] }).shown.length;
    return es ? `${n} platos en pantalla` : `${n} dishes shown`;
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

// Auto insurance tools: the policy, coverage, photo and claim rules live in
// insurance.ts; the claims and the latest photo check live in the session.
const isIncident = (v: unknown) => INCIDENT_IDS.includes(v as Incident);
const INCIDENT_PROP = {
  type: 'string',
  enum: [...INCIDENT_IDS],
  description:
    'What happened. parking: hit while parking or parked; falling_object: a branch, rock or other object fell on the car; damage_to_others: damage the customer caused to other people or cars; breakdown: the car stopped working.',
} as const;

// Every insurance tool but set_customer_name needs the customer's name
// first: the account is in it.
const NO_NAME = {
  error:
    "The customer's name is not known yet: ask for it and call set_customer_name first.",
};
const named = (t: ClientTool): ClientTool => ({
  ...t,
  run: async (i, signal, s) =>
    s.claims?.holder ? t.run(i, signal, s) : NO_NAME,
  summary: (r, es) =>
    (r as { error?: string }).error === NO_NAME.error
      ? es
        ? 'falta el nombre'
        : 'name needed'
      : t.summary(r, es),
});

const setCustomerName: ClientTool = {
  def: {
    name: 'set_customer_name',
    description: `Sign the customer in to their ${INSURER} account with the name they gave (the demo account takes any name). Call it as soon as they say their name; call it again if they correct it.`,
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Their name as they wrote it, e.g. "Laura Gómez".',
        },
        lang: LANG_PROP,
      },
      required: ['name', 'lang'],
    },
    eager_input_streaming: true,
  },
  validate: (i) =>
    str(i.name) && String(i.name).trim().length <= 60
      ? null
      : 'name must be a non-empty string of at most 60 characters',
  run: async (i, _signal, s) => {
    const holder = String(i.name).trim().replace(/\s+/g, ' ');
    s.claims = { ...(s.claims ?? { list: [] }), holder };
    return {
      holder,
      note: 'Signed in: the account and its policy are in this name. Greet them by their first name.',
    };
  },
  summary: (r) => (r as { holder: string }).holder,
};

const getPolicy: ClientTool = {
  def: {
    name: 'get_policy',
    description: `The customer's ${INSURER} account: holder, policy number and status, start date (it has no end date), premium, the insured vehicle (year, make, model, body, color, plate), listed drivers, coverages with limits and deductibles (USD), exclusions, and today's date. The customer sees it as a card under your reply.`,
    input_schema: {
      type: 'object',
      properties: { lang: LANG_PROP },
      required: ['lang'],
    },
    eager_input_streaming: true,
  },
  validate: () => null,
  run: async (i, _signal, s) =>
    describePolicy(langOf(i.lang), s.claims!.holder!),
  summary: (r) => (r as { policy_number: string }).policy_number,
};

const checkCoverageTool: ClientTool = {
  def: {
    name: 'check_coverage',
    description:
      "Whether the customer's policy covers an incident: the coverage that pays, its limit and deductible, or the exclusion that applies. Also says if a claim can be filed in the chat (claimable) and if it needs a photo, and gives today's date.",
    input_schema: {
      type: 'object',
      properties: { incident_type: INCIDENT_PROP, lang: LANG_PROP },
      required: ['incident_type', 'lang'],
    },
    eager_input_streaming: true,
  },
  validate: (i) =>
    isIncident(i.incident_type)
      ? null
      : `incident_type must be one of: ${INCIDENT_IDS.join(', ')}`,
  run: async (i) => checkCoverage(i.incident_type as Incident, langOf(i.lang)),
  summary: (r, es) => {
    const c = r as { incident: string; covered: boolean };
    return `${c.incident} · ${c.covered ? (es ? 'cubierto' : 'covered') : es ? 'no cubierto' : 'not covered'}`;
  },
};

const requestPhoto: ClientTool = {
  def: {
    name: 'request_photo',
    description:
      'Ask the customer for a photo of the damaged car: it draws an upload button under your reply. Call it once per request, then wait for the photo.',
    input_schema: {
      type: 'object',
      properties: { lang: LANG_PROP },
      required: ['lang'],
    },
    eager_input_streaming: true,
  },
  validate: () => null,
  run: async () => ({
    note: 'The customer sees an upload button. Ask for one photo that shows the whole car and the damage, then wait for it.',
  }),
  summary: (_r, es) => (es ? 'botón de foto' : 'photo button'),
};

const checkPhotoTool: ClientTool = {
  def: {
    name: 'check_photo',
    description:
      'Check the photo the customer sent in their latest message against the insured car. Describe honestly what you see in it (never what the policy says): the code decides whether it matches. Returns match, mismatch (another car) or unclear (no car, no visible damage, or hard to tell), with the reasons. Claims need a match, except for theft.',
    input_schema: {
      type: 'object',
      properties: {
        vehicle_visible: { type: 'boolean' },
        color: {
          type: 'string',
          description: 'Main body color as seen, e.g. "dark grey".',
        },
        body_type: { type: 'string', enum: [...BODY_TYPES] },
        make: {
          type: 'string',
          description:
            'Only if a badge or design makes it clear; else leave out.',
        },
        damage_visible: { type: 'boolean' },
        damage_areas: {
          type: 'array',
          items: { type: 'string', enum: [...DAMAGE_AREAS] },
          description:
            'Damaged parts. Left and right are the car’s own (as seen from the driver’s seat).',
        },
        lang: LANG_PROP,
      },
      required: [
        'vehicle_visible',
        'color',
        'body_type',
        'damage_visible',
        'damage_areas',
        'lang',
      ],
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (typeof i.vehicle_visible !== 'boolean')
      return 'vehicle_visible must be a boolean';
    if (typeof i.damage_visible !== 'boolean')
      return 'damage_visible must be a boolean';
    if (typeof i.color !== 'string') return 'color must be a string';
    if (!BODY_TYPES.includes(i.body_type as BodyType))
      return `body_type must be one of: ${BODY_TYPES.join(', ')}`;
    if (i.make !== undefined && typeof i.make !== 'string')
      return 'make must be a string';
    if (
      !Array.isArray(i.damage_areas) ||
      !i.damage_areas.every((a) => DAMAGE_AREAS.includes(a as DamageArea))
    )
      return `damage_areas must be an array of: ${DAMAGE_AREAS.join(', ')}`;
    return null;
  },
  run: async (i, _signal, s) => {
    // Only a photo sent in this turn counts: the check is about that photo.
    const photo = s.turn?.input.files.some((f) =>
      IMAGE_TYPES.includes(f.mediaType),
    );
    if (!photo)
      return {
        error:
          'The latest message has no photo. Call request_photo and wait for one.',
      };
    const check = checkPhoto({
      vehicle_visible: i.vehicle_visible as boolean,
      color: i.color as string,
      body_type: i.body_type as BodyType,
      ...(str(i.make) ? { make: i.make as string } : {}),
      damage_visible: i.damage_visible as boolean,
      damage_areas: [...new Set(i.damage_areas as DamageArea[])].slice(0, 8),
    });
    s.claims = { ...s.claims!, photo: check };
    return { status: check.status, reasons: check.reasons };
  },
  summary: (r, es) => {
    const c = r as { status?: string; error?: string };
    if (c.error) return es ? 'sin foto' : 'no photo';
    const label = {
      match: es ? 'coincide' : 'matches',
      mismatch: es ? 'otro vehículo' : 'other vehicle',
      unclear: es ? 'no es claro' : 'unclear',
    };
    return label[c.status as keyof typeof label];
  },
};

const fileClaimTool: ClientTool = {
  def: {
    name: 'file_claim',
    description:
      'File a claim for damage to the insured car (simulated). Only call it after the photo matched (check_photo, not needed for theft), you know what happened and when, and the customer confirmed the details. Returns the claim number and details, or the errors that block it (ask for what is missing).',
    input_schema: {
      type: 'object',
      properties: {
        incident_type: INCIDENT_PROP,
        date: {
          type: 'string',
          description:
            'When it happened, YYYY-MM-DD. Work it out from today (check_coverage gives it) for "yesterday" and the like; ask if unsure.',
        },
        description: {
          type: 'string',
          description:
            'What happened, in the customer’s words, 1 to 3 sentences.',
        },
        location: { type: 'string' },
        lang: LANG_PROP,
      },
      required: ['incident_type', 'date', 'description', 'lang'],
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (!isIncident(i.incident_type))
      return `incident_type must be one of: ${INCIDENT_IDS.join(', ')}`;
    if (typeof i.date !== 'string') return 'date must be a string';
    if (typeof i.description !== 'string')
      return 'description must be a string';
    if (i.location !== undefined && typeof i.location !== 'string')
      return 'location must be a string';
    return null;
  },
  run: async (i, _signal, s) => {
    const claims = s.claims ?? { list: [] };
    const r = fileClaim(claims, {
      incident: i.incident_type as Incident,
      date: i.date as string,
      description: i.description as string,
      ...(typeof i.location === 'string' ? { location: i.location } : {}),
      lang: langOf(i.lang),
    });
    if ('errors' in r) return { errors: r.errors };
    // The photo was used: a new claim needs a new one.
    s.claims = {
      holder: claims.holder,
      ...(claims.doc ? { doc: claims.doc } : {}),
      list: [...claims.list, r.claim],
    };
    return {
      claim: describeClaim(r.claim),
      note: 'The customer sees the claim as a card under your reply. Simulated: no adjuster will call.',
    };
  },
  summary: (r, es) => {
    const c = r as { claim?: { claim_id: string }; errors?: string[] };
    if (c.claim) return c.claim.claim_id;
    const n = c.errors?.length ?? 0;
    return es ? `${n} pendientes` : `${n} missing`;
  },
};

const getClaimStatus: ClientTool = {
  def: {
    name: 'get_claim_status',
    description:
      'Status of a claim filed in this conversation: the one with claim_id, or the latest. The customer sees it as a card under your reply.',
    input_schema: {
      type: 'object',
      properties: { claim_id: { type: 'string' }, lang: LANG_PROP },
      required: ['lang'],
    },
    eager_input_streaming: true,
  },
  validate: (i) =>
    i.claim_id === undefined || typeof i.claim_id === 'string'
      ? null
      : 'claim_id must be a string',
  run: async (i, _signal, s) => {
    const list = s.claims?.list ?? [];
    if (list.length === 0)
      return { error: 'No claims were filed in this conversation.' };
    const id = str(i.claim_id) ? String(i.claim_id).trim().toUpperCase() : '';
    const c = id ? list.find((k) => k.claim_id === id) : list.at(-1);
    if (!c)
      return {
        error: `No claim ${id}. Claims: ${list.map((k) => k.claim_id).join(', ')}.`,
      };
    // The card renders in the language of the question.
    const claim = { ...c, lang: langOf(i.lang, c.lang) };
    s.claims = {
      ...s.claims!,
      list: list.map((k) => (k === c ? claim : k)),
    };
    return { claim: describeClaim(claim) };
  },
  summary: (r, es) => {
    const c = r as { claim?: { claim_id: string }; error?: string };
    if (!c.claim) return c.error!;
    return `${c.claim.claim_id} · ${es ? 'en trámite' : 'in review'}`;
  },
};

const requestDocument: ClientTool = {
  def: {
    name: 'request_document',
    description:
      'Ask the customer for the document that backs the damage value (a repair invoice or quote, as a PDF): it draws an upload button under your reply. Then wait for it.',
    input_schema: {
      type: 'object',
      properties: { lang: LANG_PROP },
      required: ['lang'],
    },
    eager_input_streaming: true,
  },
  validate: () => null,
  run: async () => ({
    note: 'The customer sees an upload button. Ask for the invoice or quote (PDF) and the amount it shows, then wait.',
  }),
  summary: (_r, es) => (es ? 'botón de documento' : 'document button'),
};

const DOC_KINDS = ['invoice', 'quote', 'other'] as const;
const checkDocument: ClientTool = {
  def: {
    name: 'check_document',
    description:
      'Classify the PDF the customer sent in their latest message from its first page (the only one you see): a repair invoice, a repair quote, or something else. Something else is discarded without reading more. For an invoice or quote it returns the other pages (up to 5 in all) as images, so you can find the total.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...DOC_KINDS] },
        what: {
          type: 'string',
          description: 'What the first page is, in a few words.',
        },
        lang: LANG_PROP,
      },
      required: ['kind', 'what', 'lang'],
    },
    eager_input_streaming: true,
  },
  validate: (i) =>
    DOC_KINDS.includes(i.kind as (typeof DOC_KINDS)[number])
      ? null
      : `kind must be one of: ${DOC_KINDS.join(', ')}`,
  run: async (i, _signal, s) => {
    // Only a PDF sent in this turn: its pages are still at hand.
    const pdf = s.turn?.input.files.filter((f) => f.pages).at(-1);
    if (!pdf?.pages)
      return {
        error:
          'The latest message has no PDF. Call request_document and wait for one.',
      };
    const invoice = i.kind !== 'other';
    s.claims = { ...s.claims!, doc: { name: pdf.name, invoice } };
    if (!invoice)
      return {
        status: 'discarded',
        note: 'Not an invoice or quote: no more pages were read. Tell the customer and ask for the repair invoice or quote.',
      };
    const rest = pdf.pages.slice(1);
    return {
      status: 'accepted',
      pages: pdf.pages.length,
      note: rest.length
        ? `Pages 2 to ${pdf.pages.length} follow as images. Find the total that matches the amount the customer declared.`
        : 'It has one page, the one you already saw.',
      images: rest,
    };
  },
  summary: (r, es) => {
    const c = r as { status?: string; pages?: number };
    if (c.status === 'discarded') return es ? 'descartado' : 'discarded';
    return es ? `factura · ${c.pages} pág.` : `invoice · ${c.pages} p.`;
  },
};

const attachInvoiceTool: ClientTool = {
  def: {
    name: 'attach_invoice',
    description:
      'Add the damage value to a filed claim, with the invoice or quote that check_document accepted as its annex. Pass the total you read on the document and its plate: the code checks that the amount the customer declared is within $1 of that total and the plate is the insured car. Optional step: claims can stay without a value.',
    input_schema: {
      type: 'object',
      properties: {
        claim_id: {
          type: 'string',
          description: 'Leave out for the latest claim.',
        },
        amount: {
          type: 'number',
          description: 'The damage value the customer declared, in USD.',
        },
        document_total: {
          type: 'number',
          description: 'The total you read on the document, in USD.',
        },
        plate: {
          type: 'string',
          description: 'The plate on the document, if it shows one.',
        },
        invoice_number: { type: 'string' },
        lang: LANG_PROP,
      },
      required: ['amount', 'document_total', 'lang'],
    },
    eager_input_streaming: true,
  },
  validate: (i) => {
    if (typeof i.amount !== 'number') return 'amount must be a number';
    if (typeof i.document_total !== 'number')
      return 'document_total must be a number';
    for (const k of ['claim_id', 'plate', 'invoice_number'])
      if (i[k] !== undefined && typeof i[k] !== 'string')
        return `${k} must be a string`;
    return null;
  },
  run: async (i, _signal, s) => {
    const list = s.claims?.list ?? [];
    const id = str(i.claim_id) ? String(i.claim_id).trim().toUpperCase() : '';
    const c = id ? list.find((k) => k.claim_id === id) : list.at(-1);
    if (!c)
      return {
        error: list.length
          ? `No claim ${id}. Claims: ${list.map((k) => k.claim_id).join(', ')}.`
          : 'There is no claim yet: file it first.',
      };
    // The annex is the latest PDF check_document accepted.
    const doc = s.claims?.doc;
    if (!doc)
      return {
        error:
          'No document was checked: call request_document, and check_document when the PDF arrives.',
      };
    if (!doc.invoice)
      return {
        error: `${doc.name} is not an invoice or quote: ask for one.`,
      };
    const r = attachInvoice(c, doc.name, {
      amount: i.amount as number,
      document_total: i.document_total as number,
      ...(str(i.plate) ? { plate: i.plate as string } : {}),
      ...(str(i.invoice_number)
        ? { invoice_number: i.invoice_number as string }
        : {}),
    });
    if ('errors' in r) return { errors: r.errors };
    const claim = { ...r.claim, lang: langOf(i.lang, c.lang) };
    s.claims = {
      ...s.claims!,
      list: list.map((k) => (k === c ? claim : k)),
    };
    return { claim: describeClaim(claim) };
  },
  summary: (r, es) => {
    const c = r as { claim?: { claim_id: string }; errors?: string[] };
    if (c.claim) return `${c.claim.claim_id} · ${es ? 'anexo' : 'annex'}`;
    const n = c.errors?.length ?? 0;
    return es ? `${n} sin respaldo` : `${n} not supported`;
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
  'portfolio_build',
  'stories',
  'notes',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

// `group` labels the tool card ("CV · Experience"); `source` is what the
// model cites.
const loadProfile = async () =>
  (await import('./profile')).buildProfile(location.origin).map((e) => ({
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
      "Return one section of Juan Diego's profile. CV sections: summary, skills, experience (roles and dates), client_work, education_languages, certifications. Portfolio sections: portfolio_work (case studies), portfolio_stack (full toolbox, clouds), portfolio_principles, portfolio_approach (RAG approach, career path, leadership), portfolio_build (how this portfolio site, its AI lab, the voice agent, its metrics and daily AI report were built). stories: the challenges he faced on each project and how he solved them, to tell as anecdotes. notes: roles he is looking for, availability, other clouds, how he learns, contact. Each entry has the source to cite.",
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
        lang: LANG_PROP,
      },
      required: ['options', 'lang'],
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

// Document agent tools: they read the Knowledge Base (ChatSession.docs),
// PDFs indexed in the browser when added and images.
const NO_DOCS = {
  error:
    'The Knowledge Base is empty. Ask the user to add documents to it first (up to 5 PDFs or images).',
};
const docsOf = (s: ChatSession) => s.docs ?? [];
/** Fails without documents, and labels failed calls instead of summing up a
 * result they don't have. */
const docTool = (t: ClientTool): ClientTool => ({
  ...t,
  run: async (i, signal, s) =>
    docsOf(s).length ? t.run(i, signal, s) : NO_DOCS,
  summary: (r, es) => {
    const error = (r as { error?: unknown }).error;
    if (error === NO_DOCS.error) return es ? 'sin documentos' : 'no documents';
    if (typeof error === 'string') return es ? 'inválida' : 'invalid';
    return t.summary(r, es);
  },
});
const docById = (s: ChatSession, id: unknown) =>
  docsOf(s).find((d) => d.id === id);
const passage = (d: Doc, c: Doc['chunks'][number]) => {
  const id = chunkId(d, c);
  return { id, page: c.page, text: c.text, source: sourceOf(d, c.page, id) };
};
const docIdProp = (what: string) =>
  ({
    type: 'string',
    description: `Document id (d1, d2…) from list_documents${what}.`,
  }) as const;
/** Validates a doc id and a page range against the session's documents. */
const pageRange = (
  s: ChatSession,
  i: Input,
  max: number,
): { d: Doc; from: number; to: number } | { error: string } => {
  const d = docById(s, i.doc);
  if (!d)
    return {
      error: `Unknown document "${String(i.doc)}". Documents: ${docsOf(s)
        .map((x) => x.id)
        .join(', ')}.`,
    };
  const from = Number(i.from ?? i.page);
  const to = Number(i.to ?? from);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from)
    return { error: 'Pages must be whole numbers from 1, with to >= from.' };
  if (from > d.pages.length)
    return { error: `${d.id} has ${d.pages.length} pages.` };
  return { d, from, to: Math.min(to, from + max - 1, d.pages.length) };
};

const listDocuments: ClientTool = {
  def: {
    name: 'list_documents',
    description:
      "List the documents in the user's Knowledge Base: id, file name and kind. For PDFs: pages, detected language, pages without a text layer (scans, look at them with view_page) and each page's first heading as an outline. Images have no text to search: look at them with view_page. Call it before working with the documents.",
    input_schema: { type: 'object', properties: {} },
  },
  validate: () => null,
  run: async (_i, _signal, s) => {
    const docs = docsOf(s);
    return {
      documents: docs.map((d) =>
        d.kind === 'image'
          ? {
              id: d.id,
              name: d.name,
              kind: 'image',
              size: `${d.pages[0].w}x${d.pages[0].h}`,
              note: 'Not searchable by text: look at it with view_page (page 1).',
            }
          : {
              id: d.id,
              name: d.name,
              kind: 'pdf',
              pages: d.pages.length,
              language: docLanguage(d),
              pages_without_text: d.pages.flatMap((p, k) =>
                p.text ? [] : [k + 1],
              ),
              outline: d.pages.map(
                (p, k) => `p. ${k + 1}: ${p.head || '(no text)'}`,
              ),
            },
      ),
    };
  },
  summary: (r, es) => {
    const n = (r as { documents: unknown[] }).documents.length;
    return es ? `${n} documentos` : `${n} documents`;
  },
};

const searchDocuments: ClientTool = {
  def: {
    name: 'search_documents',
    description:
      'Keyword search (BM25) over the text passages of the PDFs in the Knowledge Base (images are not searched: look at them with view_page). Words must appear in the text, so write the query in the language of the document, with the terms it would use (e.g. "termination notice days" for an English contract), and try synonyms or other wording if nothing relevant comes back. Returns up to 8 passages, best first, each with its id, page, text and source (label and url to cite).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to look for.' },
        doc: docIdProp('; leave it out to search every document'),
      },
      required: ['query'],
    },
  },
  validate: (i) => {
    if (!str(i.query) || String(i.query).length > 300)
      return 'query must be a non-empty string of at most 300 characters';
    if (i.doc !== undefined && typeof i.doc !== 'string')
      return 'doc must be a document id like d1';
    return null;
  },
  run: async (i, _signal, s) => {
    const docs = docsOf(s);
    const scope = i.doc ? docs.filter((d) => d.id === i.doc) : docs;
    if (!scope.length) return { error: `Unknown document "${String(i.doc)}".` };
    const hits = searchDocs(scope, String(i.query));
    const images = scope.filter((d) => d.kind === 'image');
    return {
      passages: hits.map((h) => ({ doc: h.d.id, ...passage(h.d, h.c) })),
      ...(images.length && {
        images_not_searched: images.map((d) => `${d.id} "${d.name}"`),
      }),
      ...(hits.length
        ? {}
        : {
            note: 'No passage matches. Try other words, synonyms or the language of the document, or read pages with read_pages.',
          }),
    };
  },
  summary: (r, es) => {
    const n = (r as { passages: unknown[] }).passages.length;
    return es ? `${n} pasajes` : `${n} passages`;
  },
};

const READ_PAGES = 3;
const READ_CHARS = 12000;
const readPages: ClientTool = {
  def: {
    name: 'read_pages',
    description: `Read pages of a document in full, as passages with ids and sources to cite: for summaries, comparisons, extracting data, or the context around a search hit. Up to ${READ_PAGES} pages per call.`,
    input_schema: {
      type: 'object',
      properties: {
        doc: docIdProp(''),
        from: { type: 'integer', description: 'First page, from 1.' },
        to: {
          type: 'integer',
          description: `Last page (at most ${READ_PAGES} pages after from); defaults to from.`,
        },
      },
      required: ['doc', 'from'],
    },
  },
  validate: (i) =>
    typeof i.doc !== 'string'
      ? 'doc must be a document id like d1'
      : !Number.isInteger(i.from)
        ? 'from must be a page number'
        : null,
  run: async (i, _signal, s) => {
    const r = pageRange(s, i, READ_PAGES);
    if ('error' in r) return r;
    const { d, from } = r;
    if (d.kind === 'image')
      return { error: `${d.id} is an image: look at it with view_page.` };
    let to = r.to;
    let chars = 0;
    const pages = [];
    for (let p = from; p <= to; p++) {
      const passages = d.chunks
        .filter((c) => c.page === p)
        .map((c) => passage(d, c));
      const size = passages.reduce((n, x) => n + x.text.length, 0);
      // Always the first page; then stop before going over the budget.
      if (p > from && chars + size > READ_CHARS) {
        to = p - 1;
        break;
      }
      chars += size;
      pages.push(
        d.pages[p - 1].text
          ? { page: p, passages }
          : {
              page: p,
              passages: [],
              note: 'No text layer (scanned): read it with view_page.',
            },
      );
    }
    return {
      doc: d.id,
      name: d.name,
      from,
      to,
      total_pages: d.pages.length,
      pages,
      ...(to < d.pages.length && { next: `Continue from page ${to + 1}.` }),
    };
  },
  summary: (r, es) => {
    const x = r as { from: number; to: number; doc: string };
    const p = x.from === x.to ? `${x.from}` : `${x.from}–${x.to}`;
    return `${x.doc} · ${es ? 'pág.' : 'p.'} ${p}`;
  },
};

const viewPage: ClientTool = {
  def: {
    name: 'view_page',
    description:
      'Look at an image of the Knowledge Base (page 1), or at one page of a PDF as an image: for images, pages without a text layer (scans), or when a table, chart, signature or layout matters and the text is not enough. Cite it with the source it returns. The image is only available during this turn: look again in later turns if you need it.',
    input_schema: {
      type: 'object',
      properties: {
        doc: docIdProp(''),
        page: { type: 'integer', description: 'Page number, from 1.' },
      },
      required: ['doc', 'page'],
    },
  },
  validate: (i) =>
    typeof i.doc !== 'string'
      ? 'doc must be a document id like d1'
      : !Number.isInteger(i.page)
        ? 'page must be a page number'
        : null,
  run: async (i, _signal, s) => {
    const r = pageRange(s, i, 1);
    if ('error' in r) return r;
    const { d, from: page } = r;
    const id = pageId(d, page);
    const image =
      d.kind === 'image'
        ? d.data
        : await (await import('../pdf')).pageJpeg(d.data, page);
    return {
      doc: d.id,
      page,
      kind: d.kind,
      source: sourceOf(d, page, id),
      note:
        d.kind === 'image'
          ? 'The image follows. Describe only what is visible in it.'
          : 'The page follows as an image.',
      images: [image],
    };
  },
  summary: (r, es) => {
    const x = r as { doc: string; page: number; kind: string };
    return x.kind === 'image'
      ? `${x.doc} · ${es ? 'imagen' : 'image'}`
      : `${x.doc} · ${es ? 'pág.' : 'p.'} ${x.page}`;
  },
};

export const CLIENT_TOOLS: Record<string, ClientTool> = {
  show_contact_options: showContactOptions,
  get_profile_section: getProfileSection,
  search_profile: searchProfile,
  search_menu: searchMenu,
  update_order: updateOrder,
  show_menu: showMenu,
  place_order: placeOrder,
  set_customer_name: setCustomerName,
  get_policy: named(getPolicy),
  check_coverage: named(checkCoverageTool),
  request_photo: named(requestPhoto),
  check_photo: named(checkPhotoTool),
  file_claim: named(fileClaimTool),
  get_claim_status: named(getClaimStatus),
  request_document: named(requestDocument),
  check_document: named(checkDocument),
  attach_invoice: named(attachInvoiceTool),
  list_documents: docTool(listDocuments),
  search_documents: docTool(searchDocuments),
  read_pages: docTool(readPages),
  view_page: docTool(viewPage),
  get_weather: getWeather,
  get_time: getTime,
};
