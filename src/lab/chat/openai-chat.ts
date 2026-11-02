// Browser-side chat loop on OpenAI's Responses API. Loaded through turn.ts on
// the first message. With the visitor's own key (BYOK) the SDK calls OpenAI
// directly; without one it calls the site's Worker (worker/chat.ts) with a
// session token, and the Worker forwards on the site's key within the daily
// limits. Nothing is stored on
// OpenAI's side (`store: false`): the conversation is replayed from memory on
// every request, reasoning included (encrypted).
import type OpenAI from 'openai';
import type { ChatItem, ChatSession, UserInput } from '../store';
import { BYOK, MODELS, caseEffort, type ChatCase } from './cases';
import {
  CaptchaError,
  LAB_API,
  dropLabToken,
  labFetch,
  labToken,
  setChatLeft,
} from './lab';
import { functionTool } from './tool-defs';
import {
  PAGES_DROPPED,
  clone,
  pdfNote,
  runClientTool,
  type TurnCallbacks,
  type TurnError,
} from './turn';

type Item = OpenAI.Responses.ResponseInputItem;
type ToolItem = Extract<ChatItem, { kind: 'tool' }>;

let clientFor: { key: string; client: OpenAI } | null = null;
/** The SDK client: on the visitor's key, or ('') on the site's Worker. */
async function getClient(key: string) {
  if (clientFor?.key === key) return clientFor.client;
  const { default: OpenAISdk } = await import('openai');
  // A visitor's key stays in this tab; the site's never reaches the browser
  // (the Worker holds it). The SDK flag only acknowledges that the request
  // is made from a browser.
  const client = new OpenAISdk({
    ...(key
      ? { apiKey: key }
      : {
          apiKey: labToken,
          baseURL: `${location.origin}${LAB_API}`,
          fetch: labFetch,
        }),
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });
  clientFor = { key, client };
  return client;
}

/** OpenAI's codes for an account (or project) out of credit or budget. */
const NO_CREDIT = new Set(['insufficient_quota', 'billing_hard_limit_reached']);

const dataUrl = (f: UserInput['files'][number]) =>
  `data:${f.mediaType};base64,${f.data}`;

const userMessage = (input: UserInput): Item => ({
  role: 'user',
  content: [
    ...input.files.flatMap((f): OpenAI.Responses.ResponseInputContent[] =>
      f.pages
        ? [
            { type: 'input_text' as const, text: pdfNote(f) },
            {
              type: 'input_image' as const,
              image_url: `data:image/jpeg;base64,${f.pages[0]}`,
              detail: 'auto' as const,
            },
          ]
        : f.mediaType === 'application/pdf'
          ? [{ type: 'input_file', filename: f.name, file_data: dataUrl(f) }]
          : [{ type: 'input_image', image_url: dataUrl(f), detail: 'auto' }],
    ),
    ...(input.context
      ? [{ type: 'input_text' as const, text: input.context }]
      : []),
    ...(input.text ? [{ type: 'input_text' as const, text: input.text }] : []),
  ],
});

const searchSummary = (
  item: OpenAI.Responses.ResponseFunctionWebSearch,
  es: boolean,
) => {
  if (item.status === 'failed') return es ? 'falló' : 'failed';
  const a = item.action;
  if (a.type === 'open_page') return es ? 'página leída' : 'page read';
  if (a.type === 'find_in_page')
    return es ? 'buscó en la página' : 'searched page';
  return es ? 'búsqueda hecha' : 'searched';
};

// Turns `url_citation` annotations into Markdown links over the cited text.
// Spans that already contain a link are left alone.
const withCitations = (part: OpenAI.Responses.ResponseOutputText) => {
  const cites = part.annotations
    .flatMap((a) => (a.type === 'url_citation' ? [a] : []))
    .sort((a, b) => b.start_index - a.start_index);
  let text = part.text;
  let limit = text.length;
  for (const a of cites) {
    // Overlapping or out-of-range spans are skipped rather than mangled.
    if (
      a.start_index < 0 ||
      a.end_index > limit ||
      a.start_index >= a.end_index
    )
      continue;
    const span = text.slice(a.start_index, a.end_index);
    if (!/https?:\/\//.test(span))
      text =
        text.slice(0, a.start_index) +
        `[${span.replace(/[[\]]/g, '')}](${a.url})` +
        text.slice(a.end_index);
    limit = a.start_index;
  }
  return text;
};

/** See runTurn in turn.ts. */
export async function runTurn(
  key: string,
  c: ChatCase,
  start: ChatSession,
  input: UserInput,
  cb: TurnCallbacks,
): Promise<TurnError | null> {
  const [{ default: OpenAISdk }, { toResponseInputItems }] = await Promise.all([
    import('openai'),
    import('openai/lib/responses/ResponseInputItems'),
  ]);
  const client = await getClient(key);
  const modelId = c.models.openai;
  const model = MODELS[modelId];
  const s = clone(start);
  const conv = (s.conv ??= crypto.randomUUID());
  // The session history is in this provider's format (see ChatSession.api).
  const api = s.api as Item[];
  // Page images tools returned in earlier turns are not sent again.
  for (const [k, it] of api.entries())
    if (it.type === 'function_call_output' && Array.isArray(it.output))
      api[k] = {
        ...it,
        output: `${it.output.map((o) => (o.type === 'input_text' ? o.text : '')).join('')} ${PAGES_DROPPED}`,
      };
  api.push(userMessage(input));
  const tools: OpenAI.Responses.Tool[] = [
    ...(c.clientTools ?? []).map(functionTool),
    ...(c.openaiTools ?? []),
  ];
  const effort = caseEffort(c, start.docs?.length);
  const meta = `${model.name} · effort ${effort}`;

  const push = (item: ChatItem) => {
    s.items.push(item);
    cb.update(clone(s));
  };
  const patchTool = (id: string, fn: (i: ToolItem) => ToolItem) => {
    s.items = s.items.map((i) =>
      i.kind === 'tool' && i.id === id ? fn(i) : i,
    );
    cb.update(clone(s));
  };
  const endStreaming = () => {
    s.items = s.items.map((i) =>
      i.kind === 'assistant' && i.streaming ? { ...i, streaming: false } : i,
    );
  };

  try {
    for (let guard = 0; guard < 12; guard++) {
      const started: Record<string, number> = {};
      let assistantIndex = -1;
      // Bubble that shows each message item, to add its citations at the end.
      const bubbleOf: Record<string, number> = {};
      const appendText = (delta: string, itemId: string) => {
        if (assistantIndex === -1) {
          push({ kind: 'assistant', text: '', meta, streaming: true });
          assistantIndex = s.items.length - 1;
        }
        const idx = assistantIndex;
        bubbleOf[itemId] = idx;
        s.items = s.items.map((it, k) =>
          k === idx && it.kind === 'assistant'
            ? { ...it, text: it.text + delta }
            : it,
        );
        cb.update(clone(s));
      };

      const stream = client.responses.stream(
        {
          model: modelId,
          instructions: c.system,
          input: api,
          ...(tools.length ? { tools } : {}),
          reasoning: { effort },
          max_output_tokens: c.maxTokens,
          store: false,
          include: ['reasoning.encrypted_content'],
        },
        // The Worker runs the case's own setup (prompt, model, tools).
        // Conversation and page only group the metrics (worker/metrics.ts).
        {
          signal: cb.signal,
          headers: {
            'X-Lab-Case': c.id,
            'X-Lab-Conv': conv,
            'X-Lab-Page': location.pathname.startsWith('/lab/cv')
              ? 'cv'
              : 'lab',
          },
        },
      );

      for await (const ev of stream) {
        if (ev.type === 'response.output_item.added') {
          const it = ev.item;
          if (it.type === 'function_call' || it.type === 'web_search_call') {
            const id = it.type === 'function_call' ? it.call_id : it.id;
            started[id] = performance.now();
            assistantIndex = -1; // text after a tool call starts a new bubble
            push({
              kind: 'tool',
              id,
              name: it.type === 'function_call' ? it.name : 'web_search',
              input: '',
              result: '',
              ms: null,
              status: 'running',
            });
          }
        } else if (
          ev.type === 'response.output_item.done' &&
          ev.item.type === 'web_search_call'
        ) {
          const it = ev.item;
          const t0 = started[it.id];
          patchTool(it.id, (i) => ({
            ...i,
            input: JSON.stringify(it.action),
            result: searchSummary(it, cb.es),
            status: it.status === 'failed' ? 'error' : 'done',
            ms: t0 ? Math.round(performance.now() - t0) : null,
          }));
        } else if (
          ev.type === 'response.output_text.delta' ||
          ev.type === 'response.refusal.delta'
        ) {
          appendText(ev.delta, ev.item_id);
        }
      }

      const response = await stream.finalResponse();
      // A failed response ends the stream without throwing.
      if (response.status === 'failed') {
        endStreaming();
        cb.update(clone(s));
        const code = response.error?.code;
        return code === 'server_error'
          ? 'overloaded'
          : code === 'rate_limit_exceeded'
            ? 'rate'
            : 'api';
      }
      const u = response.usage;
      if (u)
        s.usage = {
          input: s.usage.input + u.input_tokens,
          output: s.usage.output + u.output_tokens,
          cost:
            s.usage.cost +
            (u.input_tokens * model.inPerM + u.output_tokens * model.outPerM) /
              1e6,
        };
      const calls = response.output.flatMap((o) =>
        o.type === 'function_call' ? [o] : [],
      );
      for (const call of calls)
        patchTool(call.call_id, (i) => ({ ...i, input: call.arguments }));
      // Web search cites its sources as annotations on the text, not in it.
      // Rewrite each bubble from the final text with the cited spans as
      // Markdown links, which the chat renders as clickable links.
      const rewritten: Record<number, string> = {};
      for (const o of response.output) {
        if (o.type !== 'message') continue;
        const idx = bubbleOf[o.id];
        if (idx === undefined) continue;
        rewritten[idx] =
          (rewritten[idx] ?? '') +
          o.content
            .map((p) =>
              p.type === 'output_text' ? withCitations(p) : p.refusal,
            )
            .join('');
      }
      s.items = s.items.map((it, k) =>
        it.kind === 'assistant' && rewritten[k] !== undefined
          ? { ...it, text: rewritten[k] }
          : it,
      );
      endStreaming();
      // Replay everything the model produced (reasoning, calls, messages).
      // The SDK adds parsed fields the API doesn't accept back; this helper
      // turns the output into clean input items.
      api.push(...toResponseInputItems(response.output));
      cb.update(clone(s));

      const refused = response.output.some(
        (o) =>
          o.type === 'message' && o.content.some((p) => p.type === 'refusal'),
      );
      const cut = response.incomplete_details?.reason;
      if (refused || cut === 'content_filter') return 'refusal';
      if (calls.length === 0) return cut ? 'truncated' : null;
      // Calls cut off at the output limit can look valid; never run them. Each
      // still needs an output, or the next request would be rejected.
      if (cut) {
        for (const call of calls) {
          api.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify({
              error:
                'Response hit the output limit before this call was complete.',
            }),
          });
          patchTool(call.call_id, (i) => ({
            ...i,
            status: 'error',
            result: 'max_output_tokens',
          }));
        }
        return 'truncated';
      }

      const outputs = await Promise.all(
        calls.map(async (call) => {
          const t0 = started[call.call_id] ?? performance.now();
          let args: Record<string, unknown> | null = null;
          try {
            args = JSON.parse(call.arguments || '{}');
          } catch {
            // Reported to the model below.
          }
          const r = args
            ? await runClientTool(call.name, args, cb, s)
            : {
                content: JSON.stringify({
                  error: 'arguments are not valid JSON',
                }),
                summary: 'invalid JSON',
                images: [],
                failed: true,
              };
          patchTool(call.call_id, (i) => ({
            ...i,
            result: r.summary,
            status: r.failed ? 'error' : 'done',
            ms: Math.round(performance.now() - t0),
          }));
          return {
            type: 'function_call_output' as const,
            call_id: call.call_id,
            output: r.images.length
              ? [
                  { type: 'input_text' as const, text: r.content },
                  ...r.images.map((d) => ({
                    type: 'input_image' as const,
                    image_url: `data:image/jpeg;base64,${d}`,
                    detail: 'auto' as const,
                  })),
                ]
              : r.content,
          };
        }),
      );
      api.push(...outputs);
      // Stopped while tools ran: end the turn here (the catch below only
      // sees API errors, so check explicitly).
      if (cb.signal.aborted) {
        s.items = s.items.map((i) =>
          i.kind === 'tool' && i.status === 'running'
            ? { ...i, status: 'error', result: cb.es ? 'detenida' : 'stopped' }
            : i,
        );
        cb.update(clone(s));
        return null;
      }
      cb.update(clone(s));
    }
    return null;
  } catch (err) {
    // The UI only shows the error kind; keep the details for debugging.
    if (import.meta.env.DEV) console.error(err);
    endStreaming();
    cb.update(clone(s));
    if (cb.signal.aborted) return null;
    if (err instanceof CaptchaError) return 'captcha';
    // Out of API credit: the visitor's own key, or the site's (its OpenAI
    // budget is spent, which looks to visitors like the day's limit).
    const outOfCredit = BYOK ? 'quota' : 'chatLimitDay';
    // The site's Worker: daily limits, and a token for another IP.
    if (err instanceof OpenAISdk.APIError) {
      if (err.code === 'chat_limit_ip') {
        setChatLeft(0);
        return 'chatLimitIp';
      }
      if (err.code === 'chat_limit_day') return 'chatLimitDay';
      if (err.code === 'chat_busy') return 'rate';
      if (err.code === 'session') {
        dropLabToken();
        return 'network';
      }
    }
    if (err instanceof OpenAISdk.AuthenticationError) return 'auth';
    if (
      err instanceof OpenAISdk.PermissionDeniedError ||
      err instanceof OpenAISdk.NotFoundError
    )
      return 'model';
    if (err instanceof OpenAISdk.RateLimitError)
      return NO_CREDIT.has(String(err.code)) ? outOfCredit : 'rate';
    if (err instanceof OpenAISdk.InternalServerError) return 'overloaded';
    // OpenAI's error responses carry no CORS header, so the browser hides
    // them: a rejected key looks like a dropped connection. Only call it a
    // network problem when the browser knows it's offline.
    if (err instanceof OpenAISdk.APIConnectionError)
      return navigator.onLine ? 'unreadable' : 'network';
    // Errors sent inside the stream (after a 200) come as a plain APIError;
    // an account with no credit fails this way.
    if (err instanceof OpenAISdk.APIError) {
      if (
        NO_CREDIT.has(String(err.code)) ||
        /credit|quota|billing/i.test(err.message)
      )
        return outOfCredit;
      if (err.code === 'rate_limit_exceeded') return 'rate';
      if (err.code === 'server_error') return 'overloaded';
    }
    return 'api';
  }
}
