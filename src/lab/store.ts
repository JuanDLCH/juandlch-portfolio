// In-memory state for the Lab demos. ClientRouter keeps this module alive
// while the visitor navigates between pages, so keys and conversations
// survive "back to the portfolio" and return; a reload starts from scratch.
// Nothing here is ever written to storage, cookies or the URL.
import type Anthropic from '@anthropic-ai/sdk';
import { atom, map } from 'nanostores';
import type { ChatCopy } from '../i18n/chat';
import { CASES } from './chat/cases';

export type ChatItem =
  | { kind: 'user'; text: string; files: string[] }
  | { kind: 'assistant'; text: string; meta: string; streaming: boolean }
  | {
      kind: 'tool';
      id: string;
      name: string;
      input: string;
      result: string;
      ms: number | null;
      status: 'running' | 'done' | 'error';
    }
  /** An error told by the assistant; `code` keys the copy in CHAT.errors. */
  | { kind: 'notice'; id: number; code: NoticeCode };

export type NoticeCode = keyof ChatCopy['errors'];
let noticeSeq = 0;
export const nextNoticeId = () => ++noticeSeq;

export interface ChatSession {
  items: ChatItem[];
  /** Conversation exactly as sent to the API (append-only). */
  api: Anthropic.Beta.BetaMessageParam[];
  usage: { input: number; output: number; cost: number };
  /** The latest turn: where it started, so it can be retried as a whole. */
  turn?: {
    items: number;
    api: number;
    content: Anthropic.Beta.BetaContentBlockParam[];
  };
}

export const emptySession = (): ChatSession => ({
  items: [],
  api: [],
  usage: { input: 0, output: 0, cost: 0 },
});

export interface Keys {
  anthropic: string;
  openai: string;
}

export const $keys = atom<Keys>({ anthropic: '', openai: '' });
export const $caseId = atom<string>(CASES[0].id);
export const $sessions = map<Record<string, ChatSession>>({});
export const $drafts = map<Record<string, string>>({});
export const $busy = atom(false);
/** Cancels the turn in flight. Lives here, not in the island, so Stop still
 * works after leaving the chat and coming back mid-response. */
let activeTurn: AbortController | null = null;
export const setTurn = (c: AbortController | null) => {
  activeTurn = c;
};
export const stopTurn = () => activeTurn?.abort();

export const getSession = (id: string) => $sessions.get()[id] ?? emptySession();
export const setSession = (id: string, s: ChatSession) =>
  $sessions.setKey(id, s);
