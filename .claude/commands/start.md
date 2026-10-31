---
description: Install dependencies if needed and start the dev server
allowed-tools: Bash(pnpm install:*), Bash(pnpm dev:*), Bash(pnpm exec astro dev:*), Bash(ls:*), Bash(curl:*)
---

Start the project's dev server without asking anything:

1. If `node_modules` is missing or `pnpm-lock.yaml` is newer than it, run `pnpm install`.
2. Check `pnpm exec astro dev status`. If a server is already running, don't start another.
3. Otherwise run `pnpm dev` (background Astro dev server on :4321).
4. Confirm it responds with `curl -sI http://localhost:4321` and reply with the URL, or the error from `pnpm exec astro dev logs` if it failed.

Don't open the browser or run builds/lint. Keep the reply to two lines.
