# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal portfolio: Astro 7 + React 19 + Tailwind 4 (via `@tailwindcss/vite`), pnpm, static output. Implements the "Signal" design (one-page, dark/light, EN/ES).

## Commands

- `pnpm dev` — dev server on :4321 (`astro dev --background` per AGENTS.md; manage with `astro dev status|logs|stop`)
- `pnpm build` / `pnpm preview`
- `pnpm lint` / `pnpm lint:fix` — ESLint flat config (`eslint.config.js`)
- `pnpm format` / `pnpm format:check` — Prettier (astro + tailwind class sorting plugins)
- `pnpm exec astro check` — type check; requires `typescript@6` (TS 7 breaks both `astro check` and typescript-eslint, so don't bump it)

No test suite.

## Architecture

- **i18n on one URL, switched without reload.** All copy lives in `src/i18n/content.ts` (`EN`/`ES` objects plus per-language arrays built by `build(isEs)`; ES is typed `typeof EN`, so add copy to both). `getContent()` in `src/i18n/index.ts` zips both languages: every string becomes a `Txt` (`string`, or `{ en, es }` when they differ). Render text with `<T v={...} />` (emits `<span lang="en">` + `<span lang="es">`; CSS in `global.css` hides the inactive one via `html[data-lang]`). Attributes (`aria-label`, `alt`, `title`) go through `{...attrs({ 'aria-label': txt })}`; string work on a `Txt` uses `pick`, `both`, `splitTxt`. Never render a `Txt` with `{x.foo}` directly (it prints `[object Object]`).
- **Preferences:** the inline script in `Layout.astro` sets `data-theme` and `data-lang` before paint (`?lang=` → `localStorage` → browser language). `src/scripts/prefs.ts` handles the EN/ES buttons (`data-set-lang`), swaps `data-i18n-attrs`, and syncs other open tabs through the `storage` event. Any new page must use `Layout.astro` to share them. `/en` and `/es` redirect to `/?lang=…` (`astro.config.mjs`).
- **Sections are Astro components** (`Header`, `Hero`, `Work`, `Lab`, `Rag`, `Stack`, `About` (wraps `Leading`), `Principles`, `Certifications`, `Footer`) receiving slices of the content object. The only React island is `ThemeToggle.tsx`.
- **Theming:** colors are CSS variables in `src/styles/global.css` (`:root` = light, `:root[data-theme='dark']` = dark), exposed to Tailwind through `@theme inline` (`bg-panel`, `text-accent`, `border-line2`, …). Use these tokens, not raw hex. `Layout.astro` has an inline script that sets `data-theme` from `localStorage` before paint (default dark); `ThemeToggle` observes that attribute via `useSyncExternalStore`.
- **Sizing is fluid.** Spacing and type come from tokens in `global.css` (`@theme`): `py-section`, `mt-block`, `gap-stack`, `p-card`, `gap-gutter`, `text-display|hero|h2|lead|h3|sub`, `h-wave`, `size-icon|badge`. They use `clamp()` with `vw` and `svh` so layout compacts on small/short screens. Don't add fixed px paddings/font sizes for layout; page width is `max-w-[1200px]`, anchors offset by `--header-h`.
- Shared look helpers (`.dots`, `.eyebrow`, `.jd-card`, `.jd-fill`, animations) are in `global.css`; `Waveform.astro` generates bar heights in the frontmatter and animates with CSS only.

## Lab demos

- Pages under `src/pages/lab/` (chat: `lab/chat.astro` → `src/components/lab/ChatApp.tsx`). `<ClientRouter />` in `Layout.astro` makes same-tab navigation client-side, so module state survives landing ↔ demo navigation and a reload clears it. Scripts that touch the DOM must init on `astro:page-load` (see `Header.astro`) and anything imported by an island must be SSR-safe (see `prefs.ts`).
- Demo state is in-memory nanostores (`src/lab/store.ts`, `src/lab/attachments.ts`): API keys, conversations, drafts. Never persist it (no storage, cookies or URL). Islands that read it must render the initial values while hydrating (`useHydrated` in `ChatApp.tsx`) to avoid hydration mismatches.
- Chat cases live in `src/lab/chat/cases.ts`; each fixes model, effort, max tokens, system prompt and tools (visitors can't pick a model). Client tools are in `tools.ts` (validate model-supplied input before running), the Anthropic loop in `anthropic.ts` (official SDK, lazy-loaded, `dangerouslyAllowBrowser` because keys are the visitor's own), voice transcription in `openai.ts`. Chat copy is in `src/i18n/chat.ts`.

## Images

- AWS icons are official SVGs in `src/assets/aws/` (sourced from the JuanDLCH profile repo; `sns.svg` from the design). `Stack.astro` resolves them via `import.meta.glob` to hashed URLs. Run `pnpm optimize:svg` (SVGO, `svgo.config.mjs`) after adding any SVG.
- `vite.build.assetsInlineLimit` is 0 on purpose: otherwise small images are inlined as `data:` URIs and `loading="lazy"` does nothing. Below-the-fold images must use `loading="lazy" decoding="async"` with explicit width/height.
- Raster images (certification badges, hero photo) go in `src/assets/` and render with Astro's `<Image>`/`<Picture>` (sharp, webp/avif); never in `public/`.

## Pending placeholders

The CV link (`#cv`), the hero/footer actions (`#talk-cv` "Chat with my CV", `#book-call`) and the `#voice`/`#chat`/`#case-*` anchors have no destination yet.

## Development rules

- `main` is protected: no direct pushes. Work on short-lived branches named `<type>/<slug>` (e.g. `feat/hero-photo`), open a PR, and squash-merge once the `verify` CI check (`.github/workflows/ci.yml`: lint, format check, `astro check`, build) passes. The PR title becomes the commit message, so it must be a Conventional Commit. Branches are deleted on merge.
- Commits follow Conventional Commits (`commitlint.config.js`): `feat`, `fix`, `content` (copy changes), `style`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `revert`. English, imperative, header ≤ 72 chars. One logical change per commit.
- Husky hooks: `pre-commit` runs lint-staged (ESLint + Prettier on staged files); `commit-msg` runs commitlint. Don't bypass with `--no-verify`.
- Colors come from theme tokens (`text-accent`), never raw hex. New copy goes in `src/i18n/content.ts` for both languages. No `any`.
- Dependabot ignores TypeScript major bumps (see TypeScript note above).
