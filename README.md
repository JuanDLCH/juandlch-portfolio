# juandlch.dev

The portfolio of Juan Diego Londoño, AI Engineer: **[juandlch.dev](https://juandlch.dev)**.

The site is one page in English and Spanish, with dark and light themes. It also runs a lab of live AI demos that need no sign-up:

- **Sophie** (`/lab/voice`): a realtime voice agent that answers questions about my work. It runs on OpenAI Realtime over WebRTC, and the call is created server-side, so the browser never sees a key.
- **Chat lab** (`/lab/chat`): agents with tools, all running in the browser:
  - "Meet my AI", grounded in my CV;
  - an order assistant for a made-up diner;
  - an auto-insurance claims assistant that reads photos and invoices;
  - a document agent that answers only from the PDFs you give it, with citations that open the cited passage.
- **CV chat** (`/lab/cv`): "Meet my AI" on its own page.

## Stack

| Part   | Tech                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Site   | Astro 7, React 19 islands, Tailwind 4, TypeScript                                                                                     |
| API    | Cloudflare Worker that also serves the static build: Durable Objects for quotas and voice calls, D1 for anonymous metrics, Turnstile  |
| AI     | OpenAI Responses API (chat, with tools run in the browser), Realtime API (voice), Batch API (nightly insights over visitor questions) |
| Deploy | Cloudflare Workers Builds: every merge to `main` ships                                                                                |

## How the demos stay safe on a public key

- The browser only gets a short-lived session token, issued after Turnstile and bound to the visitor's network. The Worker pins each chat request to its case: instructions, model, output budget, effort, tool definitions and allowed input items.
- Every request reserves its worst-case cost in a per-day Durable Object and is settled to the real usage afterwards. There are limits per IP (an IPv6 counts as its /64) and for the whole site, at most 2 requests in flight per IP, and a rate limit on the API.
- Voice calls are created and watched server-side. A sideband WebSocket hangs up a call that is steered from the browser, goes over its cost cap or runs past its time.
- Metrics store no IPs. Emails and phone numbers are masked, and rows are deleted after 180 days.

## Development

```sh
pnpm install
pnpm dev            # site on :4321
pnpm dev:api        # Worker on :8787 (astro dev proxies /api to it); needs .dev.vars, see .dev.vars.example
pnpm lint && pnpm format:check && pnpm check && pnpm check:worker && pnpm build
```

Set `MOCK_OPENAI=1` in `.dev.vars` to fake every OpenAI call. [`CLAUDE.md`](CLAUDE.md) documents the architecture in detail.
