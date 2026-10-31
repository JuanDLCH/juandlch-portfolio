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
  | 'truncated';

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

/** Validates and runs a client tool the model called; never throws. */
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
      failed: true,
    };
  try {
    const out = await tool.run(input, cb.signal, s);
    return {
      content: JSON.stringify(out),
      summary: tool.summary(out, cb.es),
      // A tool that answers with an error failed too: its card isn't drawn.
      failed: typeof (out as { error?: unknown } | null)?.error === 'string',
    };
  } catch (e) {
    const summary = e instanceof Error ? e.message : 'tool failed';
    return {
      content: JSON.stringify({ error: summary }),
      summary,
      failed: true,
    };
  }
}
