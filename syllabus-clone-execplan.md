# Build a shareable React syllabus clone

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository does not contain a checked-in PLANS.md. This plan follows the user's global `C:\Users\Kikakuiin\.codex\PLANS.md` requirements: it is self-contained, describes observable behavior, and records implementation decisions as work proceeds.

## Purpose / Big Picture

The current Kanazawa Institute of Technology syllabus site can show a syllabus, but the useful view is tied to session state and index-based URLs such as `/opsyllabus/kitos0110/0/0`. Those URLs are not stable enough to share as a course reference. After this change, a user can run a React app, search or browse the captured syllabus list, and open stable URLs such as `/courses/2026/spring/G001-01/shugaku-kiso-a`. The URL itself contains the academic year, semester, course code, and a readable course-name slug, so it can be shared without relying on the original page session.

## Progress

- [x] (2026-06-08 08:52Z) Created this ExecPlan in `kit-syllabus-clone/syllabus-clone-execplan.md`.
- [x] (2026-06-08 09:00Z) Created a Vite React project under `kit-syllabus-clone` and initialized it as a Git repository.
- [x] (2026-06-08 09:05Z) Converted the previously captured inspection files from the parent workspace into normalized app data with `scripts/prepare-data.mjs`.
- [x] (2026-06-08 09:12Z) Implemented browse/search and detail routes with readable URLs.
- [x] (2026-06-08 09:35Z) Changed URLs to end with course code, such as `/courses/2026/spring/G001-01`, after verifying no duplicate `year + semester + courseCodeLabel` keys in the captured 1056 rows.
- [x] (2026-06-08 09:22Z) Validated with a production build and a Chrome DevTools Protocol local browser check.
- [x] (2026-06-08 10:05Z) Scraped and generated all 1056 detail pages as split JSON assets under `public/details`.
- [x] (2026-06-08 10:15Z) Fixed lesson parsing for numeric lesson rows such as `１`, then regenerated all details.
- [x] (2026-06-08 10:45Z) Added English syllabus scraping, split English JSON assets, and `?lang=en` language switching while keeping the path ending in course code.

## Surprises & Discoveries

- Observation: The parent workspace is not itself a Git repository.
  Evidence: Running `git status --short` in `C:\Users\Kikakuiin\Desktop\codex-workspace` returned `fatal: not a git repository`.
- Observation: The original search API returns course summaries as JSON, while the detail page is server-rendered HTML.
  Evidence: Prior inspection captured `POST /opsyllabus/kitos0100/kitos010001/results` with 1056 JSON course summary objects and `/opsyllabus/kitos0110/0/0` as `text/html`.
- Observation: The normal `npm` command was not available in this PowerShell session, and Bun initially hit a sandbox temp-directory write denial.
  Evidence: `npm install` returned `The term 'npm' is not recognized`; `bun install` returned `bun is unable to write files to tempdir: AccessDenied`; rerunning `bun install` with approval succeeded.
- Observation: The in-app Browser plugin could not be used in this environment, but Chrome DevTools Protocol on port 9222 was available.
  Evidence: Browser setup via the node-backed browser runtime exited with `windows sandbox failed: spawn setup refresh`; `scripts/verify-local-cdp.mjs` then verified the local app through Chrome DevTools Protocol.
- Observation: Course-code-ending URLs are unique in the captured dataset.
  Evidence: A Node check over `../europa-syllabus-search-detail.json` found `total: 1056`, `unique: 1056`, and `duplicates: 0` for `yearLabel + semesterSlug + courseCodeLabel`.
- Observation: Lesson rows use two numbering styles.
  Evidence: `G001-01` used labels like `第１回`, while `G003-01 技術者と持続可能社会` used numeric labels like `１`; parsing by the `nth` cell class increased lesson extraction from 152 courses to 1046 courses.
- Observation: All full detail pages were fetched without HTTP or parser errors.
  Evidence: `scripts/scrape-details-cdp.mjs` finished with `Finished detail scrape: 1056/1056; errors=0`.
- Observation: English syllabus pages are not available for every captured course.
  Evidence: Running `LANGUAGE_TYPE=1 scripts/scrape-details-cdp.mjs` finished with `Finished detail scrape: 1056/1056; errors=45`; generated English detail assets count is 1011.

## Decision Log

- Decision: Create an independent Git repository in `kit-syllabus-clone` instead of modifying the parent workspace.
  Rationale: The parent workspace is not a repository and already contains unrelated projects and captured inspection artifacts.
  Date/Author: 2026-06-08 / Codex
- Decision: Use Vite with React and TypeScript.
  Rationale: The user asked for React, and Vite gives a small, direct single-page app with production build support and straightforward local routing.
  Date/Author: 2026-06-08 / Codex
- Decision: Use URLs shaped as `/courses/:year/:semester/:code`, for example `/courses/2026/spring/G001-01`.
  Rationale: The user preferred URLs ending with the course code. The captured data has no duplicate `year + semester + courseCodeLabel` keys, so this remains stable and unambiguous.
  Date/Author: 2026-06-08 / Codex
- Decision: Use Bun for dependency installation and local scripts in this workspace.
  Rationale: `npm` was not on PATH, while `bun` was installed and supports the package scripts used by this Vite app.
  Date/Author: 2026-06-08 / Codex
- Decision: Validate local browser behavior through `scripts/verify-local-cdp.mjs`.
  Rationale: It produces repeatable evidence for the home page, search filtering, and direct detail URL even when the Browser plugin cannot connect.
  Date/Author: 2026-06-08 / Codex
- Decision: Store full syllabus details as split JSON files under `public/details` rather than embedding every detail in the JavaScript bundle.
  Rationale: The list page should load the searchable course summaries immediately, while long syllabus bodies should be fetched only when a user opens a detail page.
  Date/Author: 2026-06-08 / Codex
- Decision: Represent English detail pages as `?lang=en`, for example `/courses/2026/spring/M004-01?lang=en`, instead of adding `/en` to the path.
  Rationale: The user asked for URLs that end with the course code. A query parameter preserves that path shape while still making the language-specific view shareable.
  Date/Author: 2026-06-08 / Codex

## Outcomes & Retrospective

The React clone now exists as an independent repository in `kit-syllabus-clone`. It imports 1056 captured course summaries, renders a searchable list, and opens detail pages at code-ending URLs such as `/courses/2026/spring/G001-01` and `/courses/2026/spring/M004-01`. Full Japanese detail JSON was generated for all 1056 courses. English detail JSON was generated for 1011 courses and is available through `?lang=en`. Production build validation passes. Lesson schedules were extracted for 1046 Japanese courses and 976 English courses; the remaining detail pages still include core text but no parsed lesson schedule in the current extractor.

## Context and Orientation

This new repository is rooted at `kit-syllabus-clone`. It uses captured source data from the parent workspace:

- `../europa-syllabus-search-detail.json` contains a real search result body from the original site. The `resultsBody` property is a JSON array of course summaries returned by the original endpoint.
- `../europa-syllabus-search-detail.json` also contains `detailDom`, a DOM-derived representation of the first detailed syllabus page, including rows, headings, and visible text.
- `../europa-syllabus-detail-screenshot.png` is a visual reference of the original detail page.

The React app will not call the original site at runtime. Instead it will ship normalized static data derived from those captured files. This avoids CORS, client certificate, and session-state issues and makes local sharing behavior deterministic.

Key terms used in this plan:

- A "course summary" is one row from the search result list. It has fields such as `yearLabel`, `semesterLabel`, `courseCodeLabel`, `courseName`, `programLabel`, and `departmentLabel`.
- A "slug" is a URL-safe readable string derived from the course name. Japanese course names are transliterated only when simple known examples are available; otherwise the app falls back to a stable short hash-like ASCII slug.
- A "semester slug" is an English URL token for a Japanese semester label: `前学期` becomes `spring`, `後学期` becomes `fall`, and `通年` becomes `full-year`.
- A "detail page" is the course-specific view. The captured data currently contains a full rich detail for the first course, `G001-01 修学基礎Ａ`. Other courses can still open a stable detail route, but initially show summary metadata and a clear message that a full detail capture has not been imported.

## Plan of Work

First, create a Vite React TypeScript project with a small dependency set: `@vitejs/plugin-react`, `vite`, `typescript`, `react`, and `react-dom`. Add a data-preparation script under `scripts/prepare-data.mjs`. This script reads the parent captured JSON, parses `resultsBody`, assigns each course a route, extracts the first detailed syllabus into a structured object, and writes `src/data/generated.ts`.

Second, implement the app shell in `src/App.tsx`. The app will use browser history without adding React Router to keep dependencies small. It will parse `window.location.pathname`, show a course list on `/` and `/courses`, and show a detail view on matching `/courses/:year/:semester/:code/:slug`. The list screen will include search controls for keyword, year, semester, and program. Each row will link to the stable course URL.

Third, implement a polished syllabus detail page. The first imported detail will render as real content: hero metadata, teacher list, goals, advice, evaluation summary, and lesson schedule. Courses without imported details will render their metadata and explain that full content is not yet imported, while keeping the route useful for sharing and future enrichment.

Fourth, validate the project by running `npm run prepare-data`, `npm run build`, and `npm run dev`. Open the local app and verify that the list renders, filtering works, and a route such as `/courses/2026/spring/G001-01/shugaku-kiso-a` can be opened directly.

## Concrete Steps

Work from `C:\Users\Kikakuiin\Desktop\codex-workspace\kit-syllabus-clone`.

Create or edit these files:

- `package.json` for scripts and dependencies.
- `index.html` for the Vite entry.
- `tsconfig.json`, `tsconfig.node.json`, and `vite.config.ts` for TypeScript and Vite.
- `scripts/prepare-data.mjs` to generate static data from the captured source.
- `src/main.tsx`, `src/App.tsx`, `src/styles.css`, and `src/data/generated.ts`.
- `README.md` explaining how to run the app and how the readable URLs work.

Expected commands:

    cd C:\Users\Kikakuiin\Desktop\codex-workspace\kit-syllabus-clone
    bun install
    bun run scrape-details
    $env:LANGUAGE_TYPE='1'; bun run scrape-details
    Remove-Item Env:LANGUAGE_TYPE
    bun run prepare-data
    bun run build
    bun run dev -- --host 127.0.0.1

## Validation and Acceptance

The work is accepted when all of the following are true:

- `npm run build` exits successfully and produces `dist`.
- Starting the dev server lets a browser open the app at a local URL.
- The home page lists captured courses and displays the total count from the captured search result.
- Searching for `修学基礎` narrows the list.
- Opening `/courses/2026/spring/G001-01/shugaku-kiso-a` directly shows the rich syllabus detail for `修学基礎Ａ`.
- Opening a different generated course URL shows at least the stable summary detail page.

## Idempotence and Recovery

The data generation script is safe to rerun. It overwrites only `src/data/generated.ts`. If dependency installation fails due to network or package registry access, rerun `npm install` after network access is available. If the generated data looks wrong, inspect `../europa-syllabus-search-detail.json` first because it is the source of truth for this prototype.

## Artifacts and Notes

Important source facts already observed:

    Search result endpoint: POST /opsyllabus/kitos0100/kitos010001/results
    Captured result count: 1056
    Detail example endpoint: /opsyllabus/kitos0110/0/0
    Detail example course: 2026 前学期 G001-01 修学基礎Ａ

## Interfaces and Dependencies

The generated data module `src/data/generated.ts` must export:

    export interface CourseSummary { ... }
    export interface SyllabusDetail { ... }
    export const courses: CourseSummary[]
    export const detailsByCourseId: Record<string, SyllabusDetail>

The app should use the `routePath` stored on each course summary when rendering links. Route parsing should tolerate a slug mismatch as long as year, semester, and course code match, but rendered links should always use the canonical route.

Revision note, 2026-06-08: Initial plan created before implementation to satisfy the significant-feature ExecPlan requirement and to record data-source and URL design decisions.

Revision note, 2026-06-08: Updated after implementation to record Bun usage, CDP verification, successful build evidence, and the current limitation that only one full detail page has been imported.

Revision note, 2026-06-08: Updated after the follow-up request for detail pages and course-code-ending URLs. The plan now records the full detail scrape, split JSON asset design, lesson parser fix, and final validation results.

Revision note, 2026-06-08: Updated after the English syllabus implementation. The plan now records `?lang=en`, English scrape counts, and validation of both existing and missing English detail pages.
