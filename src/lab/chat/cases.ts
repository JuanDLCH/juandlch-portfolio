// Example cases for the Multimodal Chat lab. Each case fixes the whole setup
// (model, effort, output budget and tools): visitors pick a case, not a model.
// Cases are provisional; add, remove or edit entries here.
import type Anthropic from '@anthropic-ai/sdk';

type L = { en: string; es: string };

export type ModelId = 'claude-haiku-5-5' | 'claude-sonnet-5-5';
export type Effort = 'low' | 'medium' | 'high';

export interface ToolInfo {
  name: string;
  desc: L;
}

export interface ChatCase {
  id: string;
  tag: L;
  label: L;
  desc: L;
  starter: L;
  model: ModelId;
  effort: Effort;
  maxTokens: number;
  system: string;
  /** Tools shown in the panel (client and server tools alike). */
  tools: ToolInfo[];
  /** Server-side tools declared verbatim in the request. */
  serverTools?: Anthropic.Beta.BetaToolUnion[];
  /** Names of client tools from tools.ts that this case enables. */
  clientTools?: string[];
}

export const MODELS: Record<
  ModelId,
  { name: string; short: string; inPerM: number; outPerM: number }
> = {
  // Prices: USD per million tokens (Claude API, standard tier).
  'claude-haiku-5-5': {
    name: 'Claude Haiku 5.5',
    short: 'Haiku 5.5',
    inPerM: 0.1,
    outPerM: 0.5,
  },
  'claude-sonnet-5-5': {
    name: 'Claude Sonnet 5.5',
    short: 'Sonnet 5.5',
    inPerM: 2,
    outPerM: 10,
  },
};

const lang =
  'Answer in the language the user writes in. Keep answers short and concrete.';

export const CASES: ChatCase[] = [
  {
    id: 'restaurant',
    tag: { en: 'Tools', es: 'Herramientas' },
    label: { en: 'Restaurant assistant', es: 'Asistente de restaurante' },
    desc: {
      en: 'Takes orders over chat using a sample menu. Shows tool calling end to end.',
      es: 'Toma pedidos por chat con un menú de ejemplo. Muestra el tool calling de punta a punta.',
    },
    starter: {
      en: 'What vegetarian options do you have, and which is the cheapest?',
      es: '¿Qué opciones vegetarianas tienen y cuál es la más barata?',
    },
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    maxTokens: 16000,
    system: `You are the chat assistant of "Huerta", a demo restaurant. Use search_menu to answer questions about dishes and prices; never invent dishes. Use place_order only after the user confirms the items. Orders are fake (this is a demo). ${lang}`,
    tools: [
      {
        name: 'search_menu',
        desc: {
          en: 'Find dishes by name or tag',
          es: 'Busca platos por nombre o etiqueta',
        },
      },
      {
        name: 'place_order',
        desc: { en: 'Create a mock order', es: 'Crea un pedido de prueba' },
      },
    ],
    clientTools: ['search_menu', 'place_order'],
  },
  {
    id: 'weather',
    tag: { en: 'Live data', es: 'Datos en vivo' },
    label: { en: 'Weather & local time', es: 'Clima y hora local' },
    desc: {
      en: 'Answers with live weather and time for any city.',
      es: 'Responde con el clima y la hora actual de cualquier ciudad.',
    },
    starter: {
      en: 'What’s the weather in Medellín right now, and what time is it there?',
      es: '¿Qué clima hace ahora en Medellín y qué hora es allá?',
    },
    model: 'claude-haiku-5-5',
    effort: 'low',
    maxTokens: 8000,
    system: `You answer questions about current weather and local time. Use get_weather for weather (it returns the city's timezone) and get_time for the local time. ${lang}`,
    tools: [
      {
        name: 'get_weather',
        desc: {
          en: 'Current weather by city (Open-Meteo)',
          es: 'Clima actual por ciudad (Open-Meteo)',
        },
      },
      {
        name: 'get_time',
        desc: {
          en: 'Local time by timezone',
          es: 'Hora local por zona horaria',
        },
      },
    ],
    clientTools: ['get_weather', 'get_time'],
  },
  {
    id: 'research',
    tag: { en: 'Research', es: 'Investigación' },
    label: { en: 'Web research', es: 'Investigación web' },
    desc: {
      en: 'Searches the web, reads pages and answers with sources.',
      es: 'Busca en la web, lee páginas y responde con fuentes.',
    },
    starter: {
      en: 'What changed in the latest AWS Bedrock release? Cite sources.',
      es: '¿Qué cambió en la última versión de AWS Bedrock? Cita fuentes.',
    },
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    maxTokens: 16000,
    system: `You research questions on the web and answer with the sources you used, as a short list of links at the end. ${lang}`,
    tools: [
      {
        name: 'web_search',
        desc: {
          en: 'Search the web (Anthropic server tool)',
          es: 'Busca en la web (herramienta de Anthropic)',
        },
      },
      {
        name: 'web_fetch',
        desc: {
          en: 'Read a web page (Anthropic server tool)',
          es: 'Lee una página web (herramienta de Anthropic)',
        },
      },
    ],
    serverTools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
    ],
  },
  {
    id: 'documents',
    tag: { en: 'Documents', es: 'Documentos' },
    label: { en: 'Document Q&A', es: 'Preguntas sobre documentos' },
    desc: {
      en: 'Reads an attached PDF or image and answers questions about it.',
      es: 'Lee un PDF o imagen adjunta y responde preguntas sobre ella.',
    },
    starter: {
      en: 'Summarize the attached PDF in five bullet points.',
      es: 'Resume el PDF adjunto en cinco viñetas.',
    },
    model: 'claude-haiku-5-5',
    effort: 'medium',
    maxTokens: 16000,
    system: `You answer questions about the documents and images the user attaches. Quote the relevant part when it helps. If nothing is attached, ask the user to attach a PDF or image. ${lang}`,
    tools: [
      {
        name: 'pdf · image input',
        desc: {
          en: 'Read natively by the model, no extra tool',
          es: 'El modelo los lee directamente, sin herramienta extra',
        },
      },
    ],
  },
];
