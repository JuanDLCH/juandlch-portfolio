// Definitions of the chat lab's client tools (what the model sees: name,
// description, input schema), apart from their code (tools.ts), so the Worker
// can send the case's own tools itself (worker/chat.ts) without pulling in
// browser code. Data only.
import type Anthropic from '@anthropic-ai/sdk';
import { CONTACT_OPTIONS } from './contact';
import { CATEGORIES, DINER, LANGS } from './order';
import { BODY_TYPES, DAMAGE_AREAS, INCIDENT_IDS, INSURER } from './insurance';
import { PROFILE_SECTIONS } from './profile-sections';

// Order assistant tools: they take the customer's language so names come
// back (and the cards render) in it.
const LANG_PROP = {
  type: 'string',
  enum: [...LANGS],
  description:
    "The language of the customer's latest message: es for Spanish, en for any other.",
} as const;

const INCIDENT_PROP = {
  type: 'string',
  enum: [...INCIDENT_IDS],
  description:
    'What happened. parking: hit while parking or parked; falling_object: a branch, rock or other object fell on the car; damage_to_others: damage the customer caused to other people or cars; breakdown: the car stopped working.',
} as const;

export const DOC_KINDS = ['invoice', 'quote', 'other'] as const;

const docIdProp = (what: string) =>
  ({
    type: 'string',
    description: `Document id (d1, d2…) from list_documents${what}.`,
  }) as const;

/** Pages read_pages returns at most. */
export const READ_PAGES = 3;

export const TOOL_DEFS = {
  search_menu: {
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
  update_order: {
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
  show_menu: {
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
  place_order: {
    name: 'place_order',
    description:
      'Place the current order for pickup (simulated, nothing is charged). Only call it after the user explicitly confirmed the order as it is now.',
    input_schema: { type: 'object', properties: {} },
    eager_input_streaming: true,
  },
  set_customer_name: {
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
  get_policy: {
    name: 'get_policy',
    description: `The customer's ${INSURER} account: holder, policy number and status, start date (it has no end date), premium, the insured vehicle (year, make, model, body, color, plate), listed drivers, coverages with limits and deductibles (USD), exclusions, and today's date. The customer sees it as a card under your reply.`,
    input_schema: {
      type: 'object',
      properties: { lang: LANG_PROP },
      required: ['lang'],
    },
    eager_input_streaming: true,
  },
  check_coverage: {
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
  request_photo: {
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
  check_photo: {
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
  file_claim: {
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
  get_claim_status: {
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
  request_document: {
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
  check_document: {
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
  attach_invoice: {
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
  get_weather: {
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
  get_time: {
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
  get_profile_section: {
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
  search_profile: {
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
  show_contact_options: {
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
  list_documents: {
    name: 'list_documents',
    description:
      "List the documents in the user's Knowledge Base: id, file name and kind. For PDFs: pages, detected language, pages without a text layer (scans, look at them with view_page) and each page's first heading as an outline. Images have no text to search: look at them with view_page. Call it before working with the documents.",
    input_schema: { type: 'object', properties: {} },
  },
  search_documents: {
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
  read_pages: {
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
  view_page: {
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
} satisfies Record<string, Anthropic.Beta.BetaTool>;

/** A client tool as an OpenAI function tool (Responses API). */
export const functionTool = (name: string) => {
  const def = TOOL_DEFS[name as keyof typeof TOOL_DEFS];
  return {
    type: 'function' as const,
    name: def.name,
    description: def.description,
    parameters: def.input_schema as Record<string, unknown>,
    strict: false,
  };
};
