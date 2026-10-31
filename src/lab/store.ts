// In-memory state for the Lab demos. ClientRouter keeps this module alive
// while the visitor navigates between pages, so keys and conversations
// survive "back to the portfolio" and return; a reload starts from scratch.
// Nothing here is ever written to storage, cookies or the URL.
import { atom, map } from 'nanostores';
import type { Attachment } from './attachments';
import type { ChatCopy } from '../i18n/chat';
import { CASES } from './chat/cases';
import type { Doc } from './chat/docs';
import type { Claims } from './chat/insurance';
import type { Order } from './chat/order';

/** A file as the log keeps it, with a data URL: images preview from it,
 * other files (PDFs) download from it. */
export interface SentFile {
  name: string;
  type: string;
  src?: string;
}

export type ChatItem =
  | { kind: 'user'; text: string; files: SentFile[] }
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

/** What the visitor sent in one message, before any provider formats it. */
export interface UserInput {
  text: string;
  files: Attachment[];
  /** Sent to the model before the text, not shown in the log (the document
   * agent's Knowledge Base note). */
  context?: string;
}

export interface ChatSession {
  items: ChatItem[];
  /** Conversation exactly as sent to the API (append-only), in the format of
   * the provider that ran it: Anthropic messages or OpenAI input items. */
  api: unknown[];
  usage: { input: number; output: number; cost: number };
  /** The latest turn: where it started, so it can be retried as a whole. */
  turn?: {
    items: number;
    api: number;
    input: UserInput;
    order?: Order;
    claims?: Claims;
  };
  /** Order assistant: the order its tools build (see chat/order.ts). */
  order?: Order;
  /** Auto insurance assistant: filed claims and the latest photo check (see
   * chat/insurance.ts). */
  claims?: Claims;
  /** Document agent: its Knowledge Base, PDFs and images (see chat/docs.ts). */
  docs?: Doc[];
  /** Last document id handed out, so removed ids are never reused. */
  docSeq?: number;
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
