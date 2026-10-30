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

## Images

- AWS icons are official SVGs in `src/assets/aws/` (sourced from the JuanDLCH profile repo; `sns.svg` from the design). `Stack.astro` resolves them via `import.meta.glob` to hashed URLs. Run `pnpm optimize:svg` (SVGO, `svgo.config.mjs`) after adding any SVG.
- `vite.build.assetsInlineLimit` is 0 on purpose: otherwise small images are inlined as `data:` URIs and `loading="lazy"` does nothing. Below-the-fold images must use `loading="lazy" decoding="async"` with explicit width/height.
- Raster images (certification badges, photo) go in `src/assets/` and render with Astro's `<Image>`/`<Picture>` (sharp, webp/avif); never in `public/`.

## Pending placeholders

Certification badges are placeholders until the PNGs are added and wired in `Certifications.astro`. Photo, CV link, `[YEAR]` and the `#voice`/`#chat`/`#case-*` anchors are unfinished in the original design too.

## Development rules

- `main` is protected: no direct pushes. Work on short-lived branches named `<type>/<slug>` (e.g. `feat/hero-photo`), open a PR, and squash-merge once the `verify` CI check (`.github/workflows/ci.yml`: lint, format check, `astro check`, build) passes. The PR title becomes the commit message, so it must be a Conventional Commit. Branches are deleted on merge.
- Commits follow Conventional Commits (`commitlint.config.js`): `feat`, `fix`, `content` (copy changes), `style`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `revert`. English, imperative, header ≤ 72 chars. One logical change per commit.
- Husky hooks: `pre-commit` runs lint-staged (ESLint + Prettier on staged files); `commit-msg` runs commitlint. Don't bypass with `--no-verify`.
- Colors come from theme tokens (`text-accent`), never raw hex. New copy goes in `src/i18n/content.ts` for both languages. No `any`.
- Dependabot ignores TypeScript major bumps (see TypeScript note above).
