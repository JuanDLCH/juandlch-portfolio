// Browser-side chat loop on Anthropic with the visitor's own key (BYOK).
// Loaded through turn.ts on the first message.
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatItem, ChatSession, UserInput } from '../store';
import { MODELS, caseEffort, type ChatCase } from './cases';
import { CLIENT_TOOLS } from './tools';
import {
  PAGES_DROPPED,
  clone,
  pdfNote,
  runClientTool,
  type TurnCallbacks,
  type TurnError,
} from './turn';

let clientFor: { key: string; client: Anthropic } | null = null;
async function getClient(key: string) {
  if (clientFor?.key === key) return clientFor.client;
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  // The key is the visitor's own and stays in this tab; the SDK flag only
  // acknowledges that the request is made from a browser.
  const client = new AnthropicSdk({
    apiKey: key,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });
  clientFor = { key, client };
  return client;
}

const userContent = (
  input: UserInput,
): Anthropic.Beta.BetaContentBlockParam[] => [
  ...input.files.flatMap((f): Anthropic.Beta.BetaContentBlockParam[] =>
    f.pages
      ? [
          { type: 'text' as const, text: pdfNote(f) },
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: 'image/jpeg' as const,
              data: f.pages[0],
            },
          },
        ]
      : f.mediaType === 'application/pdf'
        ? [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: f.data,
              },
            },
          ]
        : [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: f.mediaType as 'image/png',
                data: f.data,
              },
            },
          ],
  ),
  ...(input.context ? [{ type: 'text' as const, text: input.context }] : []),
  ...(input.text ? [{ type: 'text' as const, text: input.text }] : []),
];

/** See runTurn in turn.ts. */
export async function runTurn(
  key: string,
  c: ChatCase,
  start: ChatSession,
  input: UserInput,
  cb: TurnCallbacks,
): Promise<TurnError | null> {
  const AnthropicSdk = (await import('@anthropic-ai/sdk')).default;
  const client = await getClient(key);
  const modelId = c.models.anthropic;
  const model = MODELS[modelId];
  const s = clone(start);
  // The session history is in this provider's format (see ChatSession.api).
  const api = s.api as Anthropic.Beta.BetaMessageParam[];
  // Page images tools returned in earlier turns are not sent again.
  for (const [k, m] of api.entries())
    if (m.role === 'user' && Array.isArray(m.content))
      api[k] = {
        ...m,
        content: m.content.map((b) =>
          b.type === 'tool_result' &&
          Array.isArray(b.content) &&
          b.content.some((x) => x.type === 'image')
            ? {
                ...b,
                content: [
                  ...b.content.filter((x) => x.type !== 'image'),
                  { type: 'text' as const, text: PAGES_DROPPED },
                ],
              }
            : b,
        ),
      };
  api.push({ role: 'user', content: userContent(input) });
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...(c.clientTools ?? []).map((n) => CLIENT_TOOLS[n].def),
    ...(c.anthropicTools ?? []),
  ];
  const effort = caseEffort(c, start.docs?.length);
  const meta = `${model.name} · effort ${effort}`;
  let jsonRetries = 0;

  const push = (item: ChatItem) => {
    s.items.push(item);
    cb.update(clone(s));
  };
  const patch = (
    pred: (i: ChatItem) => boolean,
    fn: (i: ChatItem) => ChatItem,
  ) => {
    s.items = s.items.map((i) => (pred(i) ? fn(i) : i));
    cb.update(clone(s));
  };

  try {
    for (let guard = 0; guard < 12; guard++) {
      const started: Record<string, number> = {};
      let assistantIndex = -1;
      const stream = client.beta.messages.stream(
        {
          model: modelId,
          max_tokens: c.maxTokens,
          system: c.system,
          messages: api,
          ...(tools.length ? { tools } : {}),
          output_config: { effort },
          // Sonnet 5.5 on the Claude API: let the server re-run a declined
          // request on a suitable model instead of stopping.
          ...(modelId === 'claude-sonnet-5-5'
            ? {
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default' as const,
              }
            : {}),
        },
        { signal: cb.signal },
      );

      for await (const ev of stream) {
        if (ev.type === 'content_block_start') {
          const b = ev.content_block;
          if (b.type === 'text') {
            if (assistantIndex === -1) {
              push({ kind: 'assistant', text: '', meta, streaming: true });
              assistantIndex = s.items.length - 1;
            }
          } else if (b.type === 'tool_use' || b.type === 'server_tool_use') {
            started[b.id] = performance.now();
            assistantIndex = -1; // text after a tool call starts a new bubble
            push({
              kind: 'tool',
              id: b.id,
              name: b.name,
              input: '',
              result: '',
              ms: null,
              status: 'running',
            });
          } else if (
            b.type === 'web_search_tool_result' ||
            b.type === 'web_fetch_tool_result'
          ) {
            const content = b.content as unknown;
            const failed =
              !!content &&
              !Array.isArray(content) &&
              (content as { type?: string }).type?.endsWith('error');
            const count = Array.isArray(content) ? content.length : 1;
            const result = failed
              ? String(
                  (content as { error_code?: string }).error_code ?? 'error',
                )
              : b.type === 'web_search_tool_result'
                ? cb.es
                  ? `${count} resultados`
                  : `${count} results`
                : cb.es
                  ? 'página leída'
                  : 'page read';
            const t0 = started[b.tool_use_id];
            patch(
              (i) => i.kind === 'tool' && i.id === b.tool_use_id,
              (i) => ({
                ...(i as Extract<ChatItem, { kind: 'tool' }>),
                result,
                status: failed ? 'error' : 'done',
                ms: t0 ? Math.round(performance.now() - t0) : null,
              }),
            );
          }
        } else if (
          ev.type === 'content_block_delta' &&
          ev.delta.type === 'text_delta'
        ) {
          if (assistantIndex === -1) {
            push({ kind: 'assistant', text: '', meta, streaming: true });
            assistantIndex = s.items.length - 1;
          }
          const idx = assistantIndex;
          const delta = ev.delta.text;
          s.items = s.items.map((it, k) =>
            k === idx && it.kind === 'assistant'
              ? { ...it, text: it.text + delta }
              : it,
          );
          cb.update(clone(s));
        }
      }

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Only an unparseable tool input is retried; API errors are rethrown.
        if (
          err instanceof AnthropicSdk.APIError ||
          cb.signal.aborted ||
          jsonRetries++ >= 2
        )
          throw err;
        continue;
      }

      s.usage = {
        input:
          s.usage.input +
          message.usage.input_tokens +
          (message.usage.cache_read_input_tokens ?? 0) +
          (message.usage.cache_creation_input_tokens ?? 0),
        output: s.usage.output + message.usage.output_tokens,
        cost:
          s.usage.cost +
          ((message.usage.input_tokens +
            (message.usage.cache_read_input_tokens ?? 0) +
            (message.usage.cache_creation_input_tokens ?? 0)) *
            model.inPerM +
            message.usage.output_tokens * model.outPerM) /
            1e6,
      };
      // Fill in the inputs of the tool calls now that they are complete.
      for (const b of message.content) {
        if (b.type === 'tool_use' || b.type === 'server_tool_use') {
          const input = JSON.stringify(b.input);
          s.items = s.items.map((i) =>
            i.kind === 'tool' && i.id === b.id ? { ...i, input } : i,
          );
        }
      }
      s.items = s.items.map((i) =>
        i.kind === 'assistant' && i.streaming ? { ...i, streaming: false } : i,
      );
      api.push({ role: 'assistant', content: message.content });
      cb.update(clone(s));

      if (message.stop_reason === 'refusal') return 'refusal';
      if (message.stop_reason === 'pause_turn') continue;
      const calls = message.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
      );
      if (calls.length === 0)
        return message.stop_reason === 'max_tokens' ? 'truncated' : null;
      // A tool input cut off at max_tokens can look valid; never run it. Each
      // call still needs a result, or the next message would be rejected.
      if (message.stop_reason === 'max_tokens') {
        api.push({
          role: 'user',
          content: calls.map((call) => ({
            type: 'tool_result' as const,
            tool_use_id: call.id,
            content: JSON.stringify({
              error: 'Response hit max_tokens before this call was complete.',
            }),
            is_error: true,
          })),
        });
        s.items = s.items.map((i) =>
          i.kind === 'tool' && i.status === 'running'
            ? { ...i, status: 'error', result: 'max_tokens' }
            : i,
        );
        cb.update(clone(s));
        return 'truncated';
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] =
        await Promise.all(
          calls.map(async (call) => {
            const t0 = started[call.id] ?? performance.now();
            const { content, images, summary, failed } = await runClientTool(
              call.name,
              (call.input ?? {}) as Record<string, unknown>,
              cb,
              s,
            );
            patch(
              (i) => i.kind === 'tool' && i.id === call.id,
              (i) => ({
                ...(i as Extract<ChatItem, { kind: 'tool' }>),
                result: summary,
                status: failed ? 'error' : 'done',
                ms: Math.round(performance.now() - t0),
              }),
            );
            return {
              type: 'tool_result' as const,
              tool_use_id: call.id,
              content: images.length
                ? [
                    { type: 'text' as const, text: content },
                    ...images.map((data) => ({
                      type: 'image' as const,
                      source: {
                        type: 'base64' as const,
                        media_type: 'image/jpeg' as const,
                        data,
                      },
                    })),
                  ]
                : content,
              ...(failed ? { is_error: true } : {}),
            };
          }),
        );
      // Stopped while tools ran: end the turn here (the catch below only
      // sees API errors, so check explicitly).
      if (cb.signal.aborted) {
        s.items = s.items.map((i) =>
          i.kind === 'tool' && i.status === 'running'
            ? { ...i, status: 'error', result: cb.es ? 'detenida' : 'stopped' }
            : i,
        );
        api.push({ role: 'user', content: results });
        cb.update(clone(s));
        return null;
      }
      // All results go back in a single user message.
      api.push({ role: 'user', content: results });
      cb.update(clone(s));
    }
    return null;
  } catch (err) {
    // The UI only shows the error kind; keep the details for debugging.
    if (import.meta.env.DEV) console.error(err);
    s.items = s.items.map((i) =>
      i.kind === 'assistant' && i.streaming ? { ...i, streaming: false } : i,
    );
    cb.update(clone(s));
    if (cb.signal.aborted) return null;
    if (
      err instanceof AnthropicSdk.AuthenticationError ||
      err instanceof AnthropicSdk.PermissionDeniedError
    )
      return 'auth';
    if (err instanceof AnthropicSdk.RateLimitError) return 'rate';
    if (err instanceof AnthropicSdk.InternalServerError) return 'overloaded';
    if (err instanceof AnthropicSdk.APIConnectionError) return 'network';
    return 'api';
  }
}
