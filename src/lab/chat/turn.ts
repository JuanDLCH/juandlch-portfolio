// One chat turn on the active provider. Each provider module (and its SDK) is
// loaded on the first message, so the page itself stays light. Both modules
// report to the UI through the same callbacks and error kinds.
import type { ChatSession, UserInput } from '../store';
import type { ChatCase, Provider } from './cases';
import { CLIENT_TOOLS } from './tools';

export interface TurnCallbacks {
  /** Called with a fresh copy of the session whenever something changes. */
  update: (s: ChatSession) => void;
  signal: AbortSignal;
  es: boolean;
}

export type TurnError =
  | 'auth'
  | 'quota'
  | 'model'
  | 'rate'
  | 'overloaded'
  | 'network'
  | 'unreadable'
  | 'api'
  | 'refusal'
  | 'truncated'
  // Site key (worker/chat.ts): the visitor's or the site's daily limit, or
  // the bot check failed.
  | 'chatLimitIp'
  | 'chatLimitDay'
  | 'captcha';

/**
 * Runs one user turn to completion: streams text, runs client tools, follows
 * server tools (web search / fetch) and accumulates usage. `start` already
 * shows the user message; `input` is that message. Returns an error kind when
 * the turn could not finish.
 */
export async function runTurn(
  provider: Provider,
  key: string,
  c: ChatCase,
  start: ChatSession,
  input: UserInput,
  cb: TurnCallbacks,
): Promise<TurnError | null> {
  const mod =
    provider === 'openai'
      ? await import('./openai-chat')
      : await import('./anthropic');
  return mod.runTurn(key, c, start, input, cb);
}

export const clone = (s: ChatSession): ChatSession => ({
  ...s,
  items: [...s.items],
  api: [...s.api],
  usage: { ...s.usage },
});

/** What the model reads next to the first page of a PDF sent as pages
 * (ChatCase.pdf). */
export const pdfNote = (f: UserInput['files'][number]) =>
  `[PDF "${f.name}", ${f.pages!.length} ${f.pages!.length === 1 ? 'page' : 'pages'}. Only page 1 is shown, as an image below. Call check_document to say what it is; for an invoice it returns the other pages.]`;

/** Marks page images dropped from the history once their turn is over. */
export const PAGES_DROPPED =
  '[Page images from an earlier turn were removed; use what you read then.]';

/** Validates and runs a client tool the model called; never throws. Tools
 * can return `images` (base64 JPEG) for the model to see, e.g. PDF pages. */
export async function runClientTool(
  name: string,
  input: Record<string, unknown>,
  cb: TurnCallbacks,
  s: ChatSession,
) {
  const tool = CLIENT_TOOLS[name];
  const invalid = tool ? tool.validate(input) : `unknown tool: ${name}`;
  if (invalid)
    return {
      content: JSON.stringify({ error: invalid }),
      summary: invalid,
      images: [],
      failed: true,
    };
  try {
    const raw = await tool.run(input, cb.signal, s);
    const { images, ...out } = (raw ?? {}) as { images?: string[] };
    return {
      content: JSON.stringify(out),
      images: images ?? [],
      summary: tool.summary(out, cb.es),
      // A tool that answers with an error failed too: its card isn't drawn.
      failed: typeof (out as { error?: unknown } | null)?.error === 'string',
    };
  } catch (e) {
    const summary = e instanceof Error ? e.message : 'tool failed';
    return {
      content: JSON.stringify({ error: summary }),
      summary,
      images: [],
      failed: true,
    };
  }
}
