# Refresh the syllabus mirror with a shadcn/ui-inspired interface

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document follows the local requirements in `C:/Users/Kikakuiin/.codex/PLANS.md`.

## Purpose / Big Picture

The user wants the KIT syllabus mirror to look like an interface built with shadcn/ui. After this change, the search page and course detail pages should feel like a polished data product: neutral design tokens, compact cards, crisp borders, subtle badges, predictable form controls, and readable tables. A user should be able to run the app, open the course list, and see the same existing search and detail behavior presented in a shadcn/ui-inspired visual language.

## Progress

- [x] (2026-06-12 00:00Z) Read the local shadcn/ui skill guidance and the repository's ExecPlan requirements.
- [x] (2026-06-12 00:00Z) Inspected `src/App.tsx` and `src/styles.css` to understand the existing UI surfaces.
- [x] (2026-06-12 00:00Z) Added an initial shadcn-like CSS token refresh, then paused when the user explicitly approved installing shadcn/ui.
- [x] (2026-06-12 00:00Z) Initialized shadcn/ui in the existing Vite app using the non-interactive CLI after adding Tailwind v4 and the `@` import alias.
- [x] (2026-06-12 00:00Z) Added shadcn/ui components: button, card, input, select, table, badge, tabs, checkbox, separator, and progress.
- [x] (2026-06-12 00:00Z) Refactored `src/App.tsx` to use the installed local shadcn/ui components for the main search, table, detail, and calculator surfaces.
- [x] (2026-06-12 00:00Z) Ran `bun run build` and inspected list/search/detail screens in the in-app browser.

## Surprises & Discoveries

- Observation: The project is a Vite React app using plain CSS, not Tailwind CSS or installed shadcn/ui component source.
  Evidence: `package.json` has React, Vite, TypeScript, budoux, and linkedom dependencies, but no Tailwind or shadcn component folders.

- Observation: `shadcn init` required Tailwind CSS and a valid `@` import alias before it would initialize.
  Evidence: The first CLI run reported "No Tailwind CSS configuration found" and "Could not find valid path aliases"; after installing `tailwindcss` and `@tailwindcss/vite`, adding the Vite plugin, and configuring `@/*` in `tsconfig.json`, initialization succeeded.

- Observation: The sandbox blocks normal reads from some `node_modules` files, so build and dev server checks need escalated execution in this environment.
  Evidence: Non-escalated `bun run build` failed with `EPERM` opening `node_modules/typescript/bin/tsc`, while escalated `bun run build` completed successfully.

## Decision Log

- Decision: Implement a shadcn/ui-inspired visual refresh with existing React markup and CSS tokens rather than running `shadcn init`.
  Rationale: The app already works with plain CSS and contains a very large generated data bundle. Adding Tailwind and generated components would be a larger framework migration than the user requested. The intended user-visible outcome can be achieved safely by adopting shadcn design tokens, density, component shapes, and interaction states in CSS.
  Date/Author: 2026-06-12 / Codex

- Decision: Switch to a real shadcn/ui installation after the user explicitly approved introducing shadcn/ui.
  Rationale: The user's latest message clarified that adding the library and its source components is acceptable, so the implementation should use actual shadcn/ui primitives rather than only mimicking the visual language.
  Date/Author: 2026-06-12 / Codex

## Outcomes & Retrospective

The shadcn/ui installation and refactor are complete. The search and detail surfaces preserve behavior while using local shadcn/ui component source for the main controls and surfaces. The build succeeds, with the expected Vite warning about the large generated data chunk.

## Context and Orientation

The repository root is `C:/Users/Kikakuiin/Desktop/codex-workspace/kit-syllabus-mirror`. The React application lives in `src/App.tsx`, and nearly all visual styling lives in `src/styles.css`. Data is generated in `src/data/generated.ts`, and course detail JSON files are served from `public/details` and `public/details-en`.

The term "shadcn/ui" means the project owns source files for reusable React components copied in by the shadcn CLI. These components are not imported from one central package; they live in the repository under a components directory and use Tailwind-style utility classes plus shared CSS variables. The interface should use Button, Card, Input, Select, Table, Badge, Tabs, Checkbox, Separator, and Progress components where they fit the current app.

## Plan of Work

First, initialize shadcn/ui with the CLI in non-interactive mode. Because this project uses Vite, the CLI should detect the framework and add configuration files, dependencies, CSS variables, a `cn()` utility, and component source.

Second, add the components needed by the current UI and refactor `src/App.tsx` to import and use them. Preserve existing state and handlers. Replace raw controls where practical: search buttons with Button, filter inputs with Input, select controls with Select, checkboxes with Checkbox, table markup with Table components, status pills with Badge, language switches with Tabs, and credit bars with Progress.

Third, run `bun run build`. Because this app uses a very large generated data file, build output may contain a Vite chunk-size warning; that warning is acceptable if TypeScript and Vite complete successfully.

## Concrete Steps

Run commands from `C:/Users/Kikakuiin/Desktop/codex-workspace/kit-syllabus-mirror`.

Initialize shadcn/ui:

    bunx shadcn@latest init -d --base radix

Add components:

    bunx shadcn@latest add button card input select table badge tabs checkbox separator progress

Refactor app code and supporting CSS:

    apply_patch src/App.tsx
    apply_patch src/styles.css

Validate:

    bun run build

Expected successful build includes:

    tsc -b && vite build
    ✓ built

Actual successful build includes:

    ✓ 2101 modules transformed.
    ✓ built in 21.51s

Browser verification observed:

    list page: cards=2, buttons=58, tables=1, checkboxes=52, rows=50, overflow=false
    search for デザイン: 410件を表示中
    detail page: tabs=1, cards=10, badges=30, tables=1, overflow=false
    console errors: []

## Validation and Acceptance

The work is accepted when `bun run build` succeeds and the app presents the course search and detail pages with shadcn/ui-like surfaces: neutral background, white cards, compact controls, clear badges, segmented language tabs, crisp tables, and responsive layouts. Search, pagination, course navigation, language switching, and the credit calculator must continue to work because their React state and handlers are preserved.

## Idempotence and Recovery

The CSS changes are idempotent and can be re-applied safely. The data files should not be regenerated for this visual refresh. If the visual result is too stark or too dense, adjust only token values and spacing in `src/styles.css` rather than rewriting application logic.

## Artifacts and Notes

No terminal validation has been captured yet.

## Interfaces and Dependencies

No new runtime dependencies are required. The visual system depends on CSS custom properties defined in `src/styles.css`, and existing React components in `src/App.tsx` continue to render plain semantic HTML elements.
