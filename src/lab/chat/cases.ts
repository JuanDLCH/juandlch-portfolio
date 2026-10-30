// Example cases for the Multimodal Chat lab. Each case fixes the whole setup
// (model, effort, output budget and tools): visitors pick a case, not a model.
// Cases are provisional; add, remove or edit entries here.
import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';

type L = { en: string; es: string };

export type Provider = 'anthropic' | 'openai';
/** Provider the chat runs on. Both are wired; the visitor can't pick one
 * yet, so only this provider's key is asked for. */
export const PROVIDER: Provider = 'openai';

export type ModelId =
  'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'gpt-6-luna' | 'gpt-6.1-sol';
export type Effort = 'low' | 'medium' | 'high';

export interface ToolInfo {
  name: string;
  desc: L;
  /** Only shown when the chat runs on this provider. */
  provider?: Provider;
}

export interface ChatCase {
  id: string;
  tag: L;
  label: L;
  desc: L;
  starter: L;
  /** Model per provider, matched in tier (fast and cheap, or balanced). */
  models: Record<Provider, ModelId>;
  effort: Effort;
  maxTokens: number;
  system: string;
  /** Tools shown in the panel (client and server tools alike). */
  tools: ToolInfo[];
  /** Server-side tools declared verbatim in the request, per provider. */
  anthropicTools?: Anthropic.Beta.BetaToolUnion[];
  openaiTools?: OpenAI.Responses.Tool[];
  /** Names of client tools from tools.ts that this case enables. */
  clientTools?: string[];
  /** Recorded walkthrough with its WebVTT captions (URLs under public/ or a
   * CDN). Cases without one show a placeholder in the Watch demo dialog. */
  video?: { src: string; captions: string };
}

export const MODELS: Record<
  ModelId,
  { name: string; short: string; inPerM: number; outPerM: number }
> = {
  // Prices: USD per million tokens (standard tier).
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
  'gpt-6-luna': {
    name: 'GPT-6 Luna',
    short: 'GPT-6 Luna',
    inPerM: 0.1,
    outPerM: 0.5,
  },
  'gpt-6.1-sol': {
    name: 'GPT-6.1 Sol',
    short: 'GPT-6.1 Sol',
    inPerM: 2,
    outPerM: 10,
  },
};

const SOL = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-6.1-sol' } as const;
const LUNA = { anthropic: 'claude-haiku-5-5', openai: 'gpt-6-luna' } as const;

/** The case's model on the active provider. */
export const caseModel = (c: ChatCase) => MODELS[c.models[PROVIDER]];
/** Tools the case has on the active provider. */
export const caseTools = (c: ChatCase) =>
  c.tools.filter((t) => !t.provider || t.provider === PROVIDER);

const lang =
  'Answer in the language the user writes in. Keep answers short and concrete.';

// Cases not built yet: the model says what the case will do instead of
// improvising data (a profile, a menu or a policy) it doesn't have.
const draft = (what: string) =>
  `This demo case is still being built. Once ready it will be ${what} You have none of its data or tools yet: never invent facts, prices, rules or results. Explain briefly what the case will do and that it is coming soon. ${lang}`;

export const CASES: ChatCase[] = [
  {
    id: 'meet',
    tag: { en: 'Grounding', es: 'Grounding' },
    label: { en: 'Meet my AI', es: 'Conoce a mi IA' },
    desc: {
      en: 'Ask about my experience, projects, certifications and stack. Answers come from my CV, case studies and portfolio.',
      es: 'Pregunta por mi experiencia, proyectos, certificaciones y stack. Responde desde mi CV, mis casos de estudio y mi portafolio.',
    },
    starter: {
      en: 'What experience does Juan Diego have with AWS?',
      es: '¿Qué experiencia tiene Juan Diego con AWS?',
    },
    models: LUNA,
    effort: 'low',
    maxTokens: 8000,
    system: draft(
      "an assistant that answers questions about Juan Diego's career, projects, certifications and stack, grounded in his CV, case studies and portfolio.",
    ),
    tools: [],
  },
  {
    id: 'order',
    tag: { en: 'Tool calling', es: 'Tool calling' },
    label: { en: 'Order assistant', es: 'Agente de pedidos' },
    desc: {
      en: 'A sample restaurant with a full menu, variants and availability. Build an order, customize it and check out (simulated).',
      es: 'Un restaurante de ejemplo con menú completo, variantes y disponibilidad. Arma tu pedido, personalízalo y finaliza una compra simulada.',
    },
    starter: {
      en: 'I want two burgers, one without onion and one with extra cheese. Oh, and swap the fries for a salad.',
      es: 'Quiero dos hamburguesas, una sin cebolla y otra con queso extra. Ah, cambia las papas por ensalada.',
    },
    models: SOL,
    effort: 'medium',
    maxTokens: 16000,
    system: draft(
      'the ordering assistant of a sample restaurant: it looks up the menu, builds and edits an order (variants, quantities, swaps) and places a simulated order.',
    ),
    tools: [],
  },
  {
    id: 'insurance',
    tag: { en: 'Vision · workflows', es: 'Visión · flujos' },
    label: { en: 'Auto insurance assistant', es: 'Asistente de seguros' },
    desc: {
      en: 'A sample insurer with a car policy loaded. Ask about coverage and deductibles, or file a claim with photos of the damage (simulated).',
      es: 'Una aseguradora de ejemplo con una póliza de auto cargada. Pregunta por coberturas y deducibles, o registra un reclamo con fotos de los daños (simulado).',
    },
    starter: {
      en: 'I hit something while parking yesterday. Does my insurance cover it? I’ll show you the damage.',
      es: 'Ayer choqué mi carro estacionando. ¿Mi seguro cubre esto? Te voy a mostrar los daños.',
    },
    models: SOL,
    effort: 'medium',
    maxTokens: 16000,
    system: draft(
      'the assistant of a sample car insurer: it answers questions about a preloaded policy (coverage, exclusions, deductibles) and files simulated claims from photos and the details the user gives.',
    ),
    tools: [],
  },
  {
    id: 'documents',
    tag: { en: 'Documents', es: 'Documentos' },
    label: { en: 'Document intelligence', es: 'Agente documental' },
    desc: {
      en: 'Upload your own PDF and ask about it: answers, summaries, comparisons and structured data, with the pages they come from.',
      es: 'Sube tu propio PDF y conversa sobre él: respuestas, resúmenes, comparaciones y datos estructurados, con las páginas de donde salen.',
    },
    starter: {
      en: 'What are each party’s obligations, and what happens if deadlines are missed?',
      es: '¿Cuáles son las obligaciones de las partes y qué ocurre si se incumplen los plazos?',
    },
    models: SOL,
    effort: 'medium',
    maxTokens: 16000,
    system: draft(
      'an assistant that answers questions about a PDF the user uploads, summarizes and compares sections and extracts structured data, citing the pages it used.',
    ),
    tools: [],
  },
];
