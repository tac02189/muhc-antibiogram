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
- **vite-plugin-pwa 1** (Workbox) — offline support; see *Offline support* below
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

1. **Replace the PDF in `public/`, deleting last year's** — the pipeline now globs for exactly one PDF there and refuses to run on zero or two, so leaving both stops the extraction instead of silently picking one. Then update the filename in **both** places it is hardcoded: `PDF_HREF` (`src/App.jsx:20`) and the `download` attribute (`src/components/PdfViewer.jsx:159`). Missing the second one serves the new PDF under last year's filename.
2. Update the hardcoded per-page column X-coordinates in `_extraction/parse-v2.mjs` if the table layout changed.
3. `cd _extraction && node extract.mjs && node parse-v2.mjs && node build-app-data.mjs`
4. **`node verify-data.mjs`** — must print PASS. It refuses to run unless the intermediates were extracted from the PDF now sitting in `public/` (SHA-256, recorded in `source.json`), then checks every column anchor against the header the PDF prints at that x, matches all 75 printed data rows one-to-one against JSON organisms, and compares every cell in both directions. Exits 1 on any disagreement.
5. **Still spot-check at least 5 organisms against the PDF by hand.** Step 4 proves the extraction faithfully reproduces the PDF; it says nothing about whether the PDF's own numbers are right, and it is not clinical verification. A green step 4 is not a reason to skip this.
6. `npm run deploy`, then bump the git tag.

### Why step 4 exists, and what it does not cover

`parse-v2.mjs` maps numbers to drugs using hand-typed per-page column x-coordinates. The design is deliberate and works, but its failure mode is **silent**: if a column shifts, every number still lands in *some* column — just the wrong one — and the output looks entirely plausible. Re-running the pipeline cannot catch this (same parser, same coordinates, same answer), so verification has to come from outside that code path.

**The whole thing is driven from the PDF, not from the JSON — and that was the correction that mattered.** The first version of `verify-data.mjs` only ever inspected what the JSON *claimed*. An independent Codex review (gpt-6-astra, 2026-10-01) identified the gap, and running its cases confirmed every one: deleting a susceptibility key, deleting an audience bucket, deleting a whole organism, inventing a drug with no column on that page, renaming an organism so no row matched while corrupting one of its values, mutating `isolateCount` to another number printed on the same row — and `organisms: []`, an entirely empty dataset — **all printed PASS.** A verifier that green-lights an empty dataset is worse than none, because it manufactures confidence. Nothing in it fails open now: an unmatched row, an unexpected key or a missing cell is a failure, never a note.

Four checks, in order:

- **Source binding.** Re-hashes the single PDF in `public/` and refuses to run unless it matches the `sha256` in `source.json`, written by `extract.mjs`. Without this, dropping in next year's PDF while leaving last year's intermediates in place compared the old artifacts to each other and passed.
- **Check A — right drug.** Each anchor against the header text the PDF prints at that x, partitioned with the same nearest-anchor rule `snapValuesToColumns` uses for values. Also rejects duplicate anchors, duplicate canonical slugs, and labels with no SLUG mapping. 112 anchors across 6 pages.
- **Check B — right row, one-to-one.** All 75 data rows the PDF prints are enumerated from `layout.txt` and matched to JSON organisms bijectively. A PDF row with no JSON organism fails; a JSON bucket holding values with no PDF row fails; an ambiguous match fails rather than guessing.
- **Check C — right column, both directions.** `{slug: value}` is reconstructed from the PDF's geometry and diffed against the JSON PDF→JSON *and* JSON→PDF, so a dropped key and an invented value both fail. Isolate counts and nitrofurantoin denominators are checked against their **own** columns, not "is this number anywhere on the row". ~1170 cells.

A run that compares implausibly little also fails outright, on both row and cell counts — that is what stops a near-empty dataset from printing PASS.

**14 controls currently fail it as they should** — wrong value · adjacent-row swap · within-row drug swap · plausible-but-wrong value · dropped-to-null · invented value over a dash · deleted key · invented drug with no column · deleted audience bucket · deleted organism · `organisms: []` · unmatchable name with a corrupted value · wrong isolateCount · wrong nitrofurantoinTested. **Re-run all 14 after any edit to this script.**

Six traps are already handled — do not "simplify" them away:

- Anchors are read off **glyph origins, not centres**. Matching on centres shifts every column by one and reports a correct table as entirely mislabelled.
- Check A compares by **prefix, not substring**. The PDF legitimately prints a longer qualifier than the parser's label — "Nitrofurantoin (urinary isolates only)" against "Nitrofurantoin (urinary)" — but a substring test also accepts an anchor that has drifted onto a neighbouring header.
- Rows are found by locating the **value-bearing line first**, then attaching each name-only line to its nearest value line. Walking forward from name lines instead loses rows: consuming "Streptococcus pneumoniae" as part of the preceding non-sterile row dropped the blood/CSF row entirely, 73 found where the PDF prints 75.
- Rotated section labels are glued onto names with no space (`NegativeKlebsiella oxytoca`), names wrap, and the qualifier that distinguishes two rows can print *after* the numbers — `Streptococcus pneumoniae`, then the values, then `(blood/cerebrospinal fluid)*`, whose sibling row shares its prefix.
- pdf.js emits numbers as **separate glyph runs** — `"8","3"` for 83, `"1","265"` for 1265 — so Check C merges adjacent digit runs before snapping, keeping the first fragment's x. That merge agreeing with the parser on every cell is the evidence it is faithful.
- An audience spans several pages (`all` is printed across three), so the reverse check is per **audience**, not per page. Done per page it flags every gram-negative organism as missing from the gram-positive table.

**Known limitations — real, and not fixed:**

- **The canonical drug-name map is unvalidated.** Parser and verifier both read `parse-v2.mjs`'s `SLUG`, so swapping two slugs there and regenerating would satisfy every check (Codex F7). Confirming drug identity needs a human reading the PDF's headers.
- **Literal slicing is textual.** `PAGE_TABLES` and `SLUG` are sliced out of the parser source by brace matching. A duplicate declaration now throws, but a brace inside a string or comment could still mis-slice (F12).
- It cannot tell you the PDF's own numbers are right. That is step 5, and it is not optional.

**Self-test.** `ANTIBIOGRAM_JSON=<path>` points it at a different file, so you can corrupt a copy and confirm it still fails. A check that cannot fail is worth nothing, and a passing run looks identical either way.


**`_extraction/` layout:** `extract.mjs` → `parse-v2.mjs` → `build-app-data.mjs` is the live chain, with `verify-data.mjs` as a read-only check alongside it; `build-app-data.mjs` reads `tables-v2.json`. Scripts and `package-lock.json` are tracked (the lockfile pins `pdfjs-dist`, so next year's run reproduces this year's coordinates); the generated intermediates (`items.json`, `raw.txt`, `layout.txt`, `tables.json`, `tables-v2.json`) are gitignored. **`source.json` is the exception and IS tracked** — it records the filename, SHA-256 and page count of the PDF the committed data was extracted from, so provenance survives in git history rather than only on the machine that last ran the pipeline. `parse-tables.mjs` is the **superseded v1 parser**, kept only because `parse-v2.mjs:50` cites its output as the provenance of the column anchors — it is not part of the pipeline. `verify-data.mjs` reads `PAGE_TABLES` by slicing the literal out of `parse-v2.mjs` rather than importing it, because importing that script would re-run it and rewrite a pipeline intermediate as a side effect of verifying.

## Offline support — the service worker

Added 2026-10-01 via `vite-plugin-pwa` (Workbox, `generateSW`). The manifest already made the app installable; without a service worker an installed copy was a blank page the moment the network dropped, which for a bedside phone tool was the biggest functional gap in the app.

13 precached entries, ~2.79 MB: the shell, the hashed JS/CSS (the antibiogram JSON is `import`ed, so the data is *inside* `index-<hash>.js` — there is no separate data cache to go stale on its own), the icons, pdf.js's worker and lazy chunk, and the 840 KB PDF itself. Verified end-to-end by stopping the server and reloading: the app renders, and the full PDF still serves.

Four decisions worth keeping:

| Decision | Why |
|---|---|
| **`manifest: false`** | `public/manifest.webmanifest` is hand-maintained and its icon filenames are deliberately `-v3`-suffixed (see *App icons* below). Letting the plugin emit a second manifest would fight that. |
| **`registerType: "autoUpdate"` + the update handling in `src/main.jsx`** | **These are a pair — removing either re-introduces stale clinical data.** autoUpdate gives the SW `skipWaiting` + `clientsClaim`, so a new version activates and claims open pages. But the generated `registerSW.js` only *registers*: the claimed page keeps running the bundle it already loaded, so the first visit after a deploy would still render the previous data. `main.jsx` closes that — see the block there, which carries the three peer-review fixes (F2/F3/F11) and why each is not hypothetical. |
| **`globIgnores: ["icon-source.png", "og-image-v3.png"]`** | Both are served but never requested by the running app — `icon-source.png` is the 1 MB master artwork, and the OG image is only fetched by social crawlers, which do not run service workers. Precaching them cost 1.26 MB on every phone, 31% of the install, for nothing. |
| **`maximumFileSizeToCacheInBytes: 3 MiB`** | Above the 2 MiB default. pdf.js's worker is ~1 MB today; a file that outgrows the cap is dropped from the precache **with no error**, which is the quiet failure this whole feature exists to avoid. |

Google Fonts are cross-origin and so cannot be precached — a `CacheFirst` runtime rule covers them. CacheFirst is safe for immutable font files; do not extend that handler to anything carrying clinical data.

**This does not retire `PdfErrorBoundary`.** That boundary exists because an open PWA can request a lazy chunk hash that no longer exists after a redeploy (see the PDF-viewer table above). The service worker narrows that window considerably — the new worker precaches the new hashes, and the `controllerchange` reload moves the page onto them promptly — but it does not close it: a page still running the old bundle that lazy-imports the old `PdfCanvas-<hash>.js` finds it gone from both the refreshed precache and the host. The boundary is still the backstop. Keep both.

**The SW does not exist in dev** (`devOptions.enabled: false`, because it makes HMR behave like app bugs). To exercise it: `npm run build:firebase` then `npm run preview:firebase` (port 4173, `antibiogram-preview` in `.claude/launch.json`). Testing against the dev server will show no service worker at all and look like the feature is missing.

`firebase.json`'s existing header shape already suits this: `sw.js` sits at the root and so is covered by the `**` → `no-cache` rule, which is what lets a new worker be discovered promptly.


### What the peer review changed here, and the one thing still open

This feature was reviewed by Codex (gpt-6-astra) on 2026-10-01 against exactly the question that matters — *is there any path by which a resident is served stale susceptibility data?* It found several. These are fixed:

| Finding | Was | Now |
|---|---|---|
| **F2** controller guard froze | `const hadController = Boolean(controller)` evaluated once. On a first-ever visit it is `false` **forever**, so every later update to that still-open tab was ignored — the exact staleness the reload exists to prevent. | Tracks the transition: only the first claim is swallowed, every subsequent controller change reloads. |
| **F3** no bounded freshness | Nothing checked for updates after load. A phone resuming an installed app fires no `load`, so a backgrounded copy could stay on an old release indefinitely. | `registration.update()` on load, on `online`, and on becoming visible. (`register()` again is *not* a substitute — Chromium and WebKit can both reuse an identical registration without re-fetching.) |
| **F9** PDF range requests | The SW returns the precached PDF as a complete response with no range handling, while pdf.js may issue a Range request and accept a `200` as though it were the range — corrupting offsets. | `disableRange: true` in `PdfCanvas.jsx`. The document is 840 KB and fully cached; ranged fetching bought nothing. |
| **F10** fallback masked real files | Any unmatched in-scope navigation returned the app shell — navigating to `/og-image-v3.png` served HTML instead of the image. | `navigateFallbackDenylist` excludes `/assets/` and any path with a dot before the query. Verified: that URL returns `image/png`. **The first version of this fix was itself wrong — see below.** |

⚠️ **F10's original pattern was `/\.[a-zA-Z0-9]{2,5}$/` and it was broken two ways** (caught on re-review 2026-10-03). Workbox tests the denylist against **`pathname + search`**, not the pathname:

- `.webmanifest` is 11 characters, so `{2,5}` could never match it;
- any query string defeated the `$` anchor, so `/MUHC-UH-Antibiogram-2026.pdf?download=1` fell through to the shell and returned **HTML where the reader asked for the PDF**.

Now `/^[^?]*\./` — "a literal dot anywhere before the query". The lesson generalizes: an end-anchored extension test is wrong for Workbox navigation routes, because the string being tested carries the query.

**Also fixed in the same pass:** `index.html`'s icon and manifest refs were document-relative (`href="manifest.webmanifest"`), so a document served at a deep path resolved them *against that path* and 404'd the manifest and every icon. They now use Vite's `%BASE_URL%`, which keeps them base-relative while still producing `/muhc-antibiogram/…` for the dev server. Verified in both builds' emitted HTML.
| **F11** reload changed the population | The forced reload reset the audience filter to **All**, silently moving the reader off ICU/ED/Peds mid-lookup. | The selected audience is carried across an update reload only (session handoff, read once and cleared), so a manual reload still starts at the default. |
| **F13** wrong comment | A comment claimed an oversize asset is dropped from the precache "with no error". | It actually **fails the build** — vite-plugin-pwa turns the size warning into a throw. Comment corrected. |

### F1 — fixed 2026-10-03, and the "unavoidable tradeoff" was not one

**The rewrite is now `{ "regex": "^/[^.]*$", "destination": "/index.html" }`.** A missing asset-shaped path (anything containing a dot) 404s instead of being answered with the app shell. That closes the poisoning route: Workbox precaches any sub-400 response **without checking MIME type**, so while the catch-all stood, an asset fetch during service-worker install that raced a deploy could cache HTML under a `.js` URL.

This file previously recorded F1 as an open decision, on the reasoning that Firebase's `regex` uses RE2, RE2 has no lookahead, so `^(?!...)` exclusion was impossible — therefore narrowing the rewrite had to trade cache-poisoning robustness against the deep links the retired `gh-pages` branch forwards. **The premise was true and the conclusion was wrong.** No lookahead is needed: a negated character class states the same policy positively. Codex agreed on re-review ("'No lookahead, therefore unavoidable tradeoff' was incorrect for this dot-exclusion policy").

**Verified live after deploy, not reasoned:**

| Request | Before | After |
|---|---|---|
| `/assets/index-DOESNOTEXIST.js`, `/assets/missing.mjs`, `/assets/missing.css` | 200 `text/html` | **404** |
| `/missing.pdf`, `/old-page.html`, `/v1.2/foo` | 200 `text/html` | **404** |
| `/`, `/foo`, `/foo/bar`, `/foo/`, `/foo/bar/` | 200 shell | 200 shell — **deep links preserved** |
| real files (hashed JS, `sw.js`, `manifest.webmanifest`, `favicon.svg`, the PDF, `og-image-v3.png`) | correct | correct MIME, unchanged |

Note the policy is "a dot **anywhere** in the path", not "a file extension". A dotted deep link such as `/v1.2/foo` now 404s. That is accepted: the app has never had a router, so no such path was ever real.

**Two limits of this fix, both measured — do not mistake them for regressions:**

- **It prevents new poisoning; it does not repair a cache already poisoned.** In practice a later deploy largely self-heals, because every asset is content-hashed: a new build references new URLs, so a poisoned entry sits in an outdated cache and `cleanupOutdatedCaches()` drops it. An earlier version of this file said the app "cannot self-recover" — too absolute, per Codex: `registerSW.js` registers independently of `main.jsx`, so a later release can recover a blank install.
- **`/assets/<dotless>` still gets the shell, and it gets the immutable header.** Measured: `/assets/foo` returns 200 HTML with `public, max-age=31536000, immutable`. Excluding the `/assets` namespace in RE2 without lookahead means enumerating the prefix character by character, which is unreadable and easy to get wrong; and no precached asset is extension-less, so this is not a poisoning route for any build this app produces. Left as-is deliberately, with the measurement recorded so the next session need not re-derive it.

### ⚠️ Still open — the first-claim race (Codex, Medium, pre-existing)

`src/main.jsx` deliberately swallows the **first** `controllerchange` ("reloading here would be a pointless extra load on every first visit" — that is the F2 fix). Codex found a window this leaves: an uncontrolled page loads release A → release B deploys before A's worker finishes installing → worker B claims the still-running A page → the first claim is ignored → **the reader keeps seeing A's susceptibility data** until a navigation or a later update.

This was **not** changed, and the reason is worth keeping: every cheap fix is worse than the bug. Always reloading on the first claim reintroduces exactly what F2 removed (an extra load for every new install, and the loop risk that motivated the guard); a time-based heuristic is guesswork. The clean fix is what Codex suggests — compare a release identifier carried in the page against the worker's — and that is a small feature with its own review, not a cleanup. Decide it deliberately.


## App icons

Latest set is `-v3` (`icon-{32,180,192,512}-v3.png`, `og-image-v3.png`). **iOS caches home-screen icons by URL**, so a new icon requires a *filename* bump (`-v4`) plus updating `index.html` and `public/manifest.webmanifest` — editing the image in place does nothing. Even then an existing install may need Safari → Advanced → Website Data cleared.
