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

- **i18n by route, not client state.** `src/pages/en/index.astro` and `src/pages/es/index.astro` both render `src/components/Home.astro` with a `lang`; `src/pages/index.astro` redirects to `/en/`. All copy lives in `src/i18n/content.ts` (`EN`/`ES` objects plus per-language `cycle`, `cases`, `domains`, `stackGroups`, `principles`, built by one `build(isEs)`); `getContent(lang)` in `src/i18n/index.ts`. Add copy to both languages; ES is typed `typeof EN`.
- **Sections are Astro components** (`Header`, `Hero`, `About`, `Leading`, `Work`, `Lab`, `Stack`, `Principles`, `Certifications`, `Footer`) receiving slices of the content object. The only React island is `ThemeToggle.tsx`.
- **Theming:** colors are CSS variables in `src/styles/global.css` (`:root` = light, `:root[data-theme='dark']` = dark), exposed to Tailwind through `@theme inline` (`bg-panel`, `text-accent`, `border-line2`, …). Use these tokens, not raw hex. `Layout.astro` has an inline script that sets `data-theme` from `localStorage` before paint (default dark); `ThemeToggle` observes that attribute via `useSyncExternalStore`.
- Shared look helpers (`.dots`, `.eyebrow`, `.jd-card`, `.jd-fill`, animations) are in `global.css`; `Waveform.astro` generates bar heights in the frontmatter and animates with CSS only.

## Pending placeholders

AWS icons in `public/aws/*.svg` are generated stand-ins (replace with official icons, same filenames). Certification badges are placeholders until PNGs are added to `public/certs/` and wired in `Certifications.astro`. Photo, CV link, `[YEAR]` and the `#voice`/`#chat`/`#case-*` anchors are unfinished in the original design too.

## Development rules

- Work happens directly on `main`; CI (`.github/workflows/ci.yml`) runs lint, format check, `astro check` and build on every push.
- Commits follow Conventional Commits (`commitlint.config.js`): `feat`, `fix`, `content` (copy changes), `style`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `revert`. English, imperative, header ≤ 72 chars. One logical change per commit.
- Husky hooks: `pre-commit` runs lint-staged (ESLint + Prettier on staged files); `commit-msg` runs commitlint. Don't bypass with `--no-verify`.
- Colors come from theme tokens (`text-accent`), never raw hex. New copy goes in `src/i18n/content.ts` for both languages. No `any`.
- Dependabot ignores TypeScript major bumps (see TypeScript note above).
