# MUHC Antibiogram — Claude Instructions

This file is read automatically by every Claude Code instance working on this project. It extends the root `CLAUDE.md`; it does not replace it.

## Project Overview

An interactive React + Vite SPA replacing the static **MUHC University Hospital 2026 Antibiogram** PDF. Built for the whole MUHC audience to look up local susceptibility data fast at the bedside — **the primary device is a phone.**

This is a **reference tool, not bedside decision support** — it reports measured local susceptibility percentages, which are facts from the source PDF rather than recommendations. That makes its clinical risk lower than Pocket Resus's. **The one exception is the Empiric tab, which is the opposite** — see immediately below.

## ⚠️ The Empiric tab is unreviewed draft content

`src/data/syndromes.json` holds 6 syndrome cards (uncomplicated UTI, complicated UTI/pyelo, CAP, HAP/VAP, SSTI, intra-abdominal). They were **scaffolded from the local antibiogram plus standard IDSA guidance — they are not Thiago's clinical recommendations, and no clinician has reviewed them.**

- **Untouched since the initial commit `60e304b`.** If that is still true, the review has not happened.
- `SyndromeView.jsx` renders a visible **"Draft recommendations — pending clinical review"** banner. **Do not remove that banner** until Thiago says the cards are reviewed.
- Editing them is a *clinical* change: schema is stable, so it is only the `firstLine` / `alternatives` / `avoid` arrays — but a wrong empiric regimen here reaches a prescriber. Never edit them on your own initiative, and never let a passing Codex/Gemini review stand in for clinical verification (root `CLAUDE.md`, *Clinical content gets flagged, not judged*).

Everything else in the app derives mechanically from the source PDF. This file is the exception that needs a human.

## Stack

- **React 18** + **Vite 5** — single-page, no router; four tabs are local state in `App.jsx`
- **Tailwind CSS 3**; **lucide-react** icons
- **react-pdf 10** (pdf.js) — in-app PDF viewer, lazy-loaded
- **Firebase — Hosting only.** No Firestore, no Auth, no Analytics. Fully static; there is no `firebase.js` and none is needed.
- Fonts: Fraunces (display) · Inter (sans) · JetBrains Mono (data)

## Architecture

### Data — all static JSON, single source of truth

| File | Holds |
|---|---|
| `src/data/antibiogram.json` | 32 organisms × 4 audiences × susceptibilities, plus `audiences` and `legend` |
| `src/data/antibiotics.json` | Drug metadata (class, routes, notes) |
| `src/data/syndromes.json` | 6 empiric syndrome cards — **draft, see above** |
| `src/data/supplementary.json` | ESBL/CRE rates, durations, blood-culture rapid diagnostics, β-lactam cross-reactivity |

Four tabs (Organism · Drug · Empiric · Reference) and four audience filters (All · ED · ICU · Peds). The audience filter picks which sub-object of each organism's `data` the views read — it is not a display filter.

**Color coding is medical convention, not decoration:** green ≥80% · yellow 41–79% · red ≤40% · gray dash = not tested. Organisms under 30 isolates carry a `low n` flag (CLSI threshold, from `legend.isolateMinimum`). Do not restyle these thresholds.

### The PDF viewer — four deliberate decisions, none of them accidental

`Header`/`Footer` open a full-screen in-app viewer. Every choice below was forced by a real failure; a future session "simplifying" any of them will reintroduce a shipped bug.

| Decision | Why — do not undo |
|---|---|
| **pdf.js canvases, never an `<iframe>`** | iOS Safari's native inline PDF viewer renders **only page 1** of a multi-page doc with locked zoom. An iframe looks fine on desktop and is broken on the target device. |
| **`PdfViewer` (shell) is eager; `PdfCanvas` is `React.lazy`** | The shell owns the Back button, scroll lock and focus trap, so they exist instantly and still work if the heavy chunk never loads. Merging them back would put the close button behind the failure it needs to survive. |
| **`PdfErrorBoundary` wraps the lazy chunk** | `Suspense` catches a *pending* import, not a *rejected* one. After a redeploy an open PWA requests a stale chunk hash; without the boundary that rejection blanks the **whole app**, not just the PDF. |
| **Page windowing uses `scroll` events + cumulative heights, not `IntersectionObserver`** | Deliberate. IO is the "modern" choice and was tried first; it cannot be verified in this harness (see *Preview pane* below), and a silently non-firing observer renders blank pages past the seed — worse than the memory problem it solves. Caps live canvases at ~6 of 13. |

Browser history for the overlay lives in **`App.jsx`, keyed on `[pdfOpen]`** — not inside the viewer. Keying it on a component lifecycle made cleanup fire `history.back()` against a changing callback identity, which double-popped under StrictMode. Leave it where it is.

### iOS constraints that look like style choices

- **The search input must stay ≥16px** (`text-base`, `Header.jsx`). Anything smaller and iOS auto-zooms the page on focus. It is not a typography decision.
- `useDetailScroll` scrolls to top on open and restores the list offset on close, **mobile only**, gated on `matchMedia("(max-width: 767.98px)")` to complement Tailwind's `md:`. It tracks list scroll continuously because reading `scrollY` at open time returns a value already clamped by the shorter detail page.
- Header and footer respect `env(safe-area-inset-*)` for the notch.

## Deploy

**Firebase is canonical. GitHub Pages is retired.**

```bash
npm run deploy          # == deploy:firebase — builds with BASE=/ and deploys Hosting
```

- ⚠️ **Never run `gh-pages` against this repo.** The `gh-pages` branch now serves a **retirement redirect** to `muhc-antibiogram.web.app`; a deploy there would overwrite it and silently un-retire a stale copy of a clinical tool. The `gh-pages` package was removed from `devDependencies` on 2026-09-18 for exactly this reason — do not reinstall it, and do not add the GitHub Pages Actions workflow from the root `CLAUDE.md`.
- There is no `predeploy`. The default `npm run build` targets the old GH Pages base path and is **wrong for Firebase** — use `build:firebase` (or just `npm run deploy`).

### Firebase cache headers — last match wins

`firebase.json` header rules are ordered catch-all **first**, specific overrides **after**, because Firebase applies the **last** matching rule (the opposite of the usual first-match intuition):

1. `**` → `no-cache` — HTML, manifest, icons: always revalidate
2. `**/*.pdf` → 1 day
3. `/assets/**` → `immutable`, 1 year — only Vite's content-hashed output

Two bugs are baked into that shape. Scoping immutable by **file extension** froze non-hashed public files (`favicon.svg`, icons) for a year; scoping by the `/assets/**` **directory** is what makes it safe. And a rule sourced `**/index.html` does **not** match a request for `/`, which once left HTML on Firebase's default 1-hour cache and stranded phones on stale bundles for an hour after every deploy.

## Local development

```bash
npm run dev
```

⚠️ **The dev server serves at `http://localhost:5173/muhc-antibiogram/`, not the root.** `vite.config.js` defaults `base` to the old GH Pages path unless `BASE` is set; `http://localhost:5173/` is a blank page and looks like a broken build. Preview config is `.claude/launch.json` (absolute `node.exe` + `npm-run.cjs` wrapper, per root Rule 3).

### Preview pane limits worth knowing before you debug

The harness's browser pane runs hidden, and three things silently do not work in it — each one has cost a session real time:

- **Screenshots fail** ("not compositing frames").
- **`IntersectionObserver` never fires** — no frame pipeline. This is why page windowing uses scroll events.
- **Programmatic `scrollTop` does not emit a `scroll` event.** To drive scroll-dependent code, set `scrollTop` then `dispatchEvent(new Event('scroll'))`.

Also: editing a hook's **hook count** while the dev server is live throws React "Rendered more hooks than during the previous render". That is an HMR artifact, not a real bug — full-reload before believing it.

## Annual update — when the 2027 PDF drops

1. Drop the new PDF into `public/`, then update the filename in **both** places it is hardcoded — `PDF_HREF` (`src/App.jsx:20`) and the `download` attribute (`src/components/PdfViewer.jsx:159`). Missing the second one serves the new PDF under last year's filename.
2. Update the hardcoded per-page column X-coordinates in `_extraction/parse-v2.mjs` if the table layout changed.
3. `cd _extraction && node extract.mjs && node parse-v2.mjs && node build-app-data.mjs`
4. **Spot-check at least 5 organisms against the PDF by hand.** The parser is coordinate-based and fails quietly when a column shifts.
5. `npm run deploy`, then bump the git tag.

**`_extraction/` layout:** `extract.mjs` → `parse-v2.mjs` → `build-app-data.mjs` is the live chain; `build-app-data.mjs` reads `tables-v2.json`. Scripts and `package-lock.json` are tracked (the lockfile pins `pdfjs-dist`, so next year's run reproduces this year's coordinates); the generated intermediates (`items.json`, `raw.txt`, `layout.txt`, `tables.json`, `tables-v2.json`) are gitignored. `parse-tables.mjs` is the **superseded v1 parser**, kept only because `parse-v2.mjs:50` cites its output as the provenance of the column anchors — it is not part of the pipeline.

## App icons

Latest set is `-v3` (`icon-{32,180,192,512}-v3.png`, `og-image-v3.png`). **iOS caches home-screen icons by URL**, so a new icon requires a *filename* bump (`-v4`) plus updating `index.html` and `public/manifest.webmanifest` — editing the image in place does nothing. Even then an existing install may need Safari → Advanced → Website Data cleared.
