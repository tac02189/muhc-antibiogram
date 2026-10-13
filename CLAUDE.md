# MUHC Antibiogram — Claude Instructions

This file is read automatically by every Claude Code instance working on this project. It extends the root `CLAUDE.md`; it does not replace it.

## Project Overview

An interactive React + Vite SPA replacing the static **MUHC University Hospital 2026 Antibiogram** PDF. Built for the whole MUHC audience to look up local susceptibility data fast at the bedside — **the primary device is a phone.**

This is a **reference tool, not bedside decision support** — it reports measured local susceptibility percentages, which are facts from the source PDF rather than recommendations. That makes its clinical risk lower than Pocket Resus's. **The one exception is the Empiric tab, which is the opposite** — see immediately below.

## ⚠️ The Empiric tab is unreviewed draft content

`src/data/syndromes.json` holds 6 syndrome cards (uncomplicated UTI, complicated UTI/pyelo, CAP, HAP/VAP, SSTI, intra-abdominal). They were **scaffolded from the local antibiogram plus standard IDSA guidance — they are not Thiago's clinical recommendations, and no clinician has reviewed them.**

- **No clinician has reviewed the cards.** The only change since the initial commit `60e304b` is the 2026-10-03 slug rename (`nitrofurantoin` → `nitrofurantoin-urinary`, see *Qualified drug columns*); no agent, dose or rationale has changed. Treat the review as not having happened until Thiago records a sign-off date here.
- `SyndromeView.jsx` renders a visible **"Draft recommendations — pending clinical review"** banner. **Do not remove that banner** until Thiago says the cards are reviewed.
- Editing them is a *clinical* change: schema is stable, so it is only the `firstLine` / `alternatives` / `avoid` arrays — but a wrong empiric regimen here reaches a prescriber. Never edit them on your own initiative, and never let a passing Codex/Gemini review stand in for clinical verification (root `CLAUDE.md`, *Clinical content gets flagged, not judged*).

Everything else in the app derives mechanically from the source PDF. This file is the exception that needs a human.

⚠️ **The SSTI card's first-line reads "Cefazolin (urinary isolates)" and that is REVIEWED AND DELIBERATE — do not "fix" it.** Thiago reviewed it on 2026-10-03 and left it as is. It looks wrong at a glance, which is exactly why this note exists: the card recommends cefazolin for cellulitis, there is no cefazolin column for any of that card's organisms (the panel's only cefazolin column is urinary), and the card's own rationale says the ~100% figure is inferred from oxacillin rather than measured. The odd-looking label is the *honest* rendering of that situation. A future session that "cleans this up" by dropping the qualifier would be reinstating the exact misreading the qualifier was added to prevent.

**`node _extraction/syndrome-brief.mjs` is the review aid for that human.** For each card it prints the draft first-line / alternatives / avoid agents with the local %S for each cited drug against each of that card's `relevantOrganisms`, across all four audiences, plus a "what the local data shows" ranking of every drug on panel for those organisms. `--md` emits markdown. It recommends nothing — it only turns the review from a research task into confirm-or-override.

Two things it does that are worth keeping: it flags `!` on any organism below the CLSI isolate threshold, and where a draft rationale *quotes* a susceptibility percentage it prints the figures actually in the data beside it as a `CHECK` line. That check deliberately ignores numbers in a resistance or threshold context ("avoid if local resistance > 20%" is a rule, not a claim about this drug's %S) — it false-alarmed on exactly that before the filter was added. And its "best first" ranking sorts on the **all-locations** figure, not the max across audiences: ranking by max let a single low-n Peds 100% hoist a mediocre drug above meropenem, which is backwards in a list a clinician scans top-down.

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
| `src/data/antibiogram.json` | 32 organisms × 4 audiences × susceptibilities and `intrinsicResistance`, plus `audiences` and `legend` |
| `src/data/antibiotics.json` | Drug metadata (class, routes, notes, `noteAppliesTo`) |
| `src/data/syndromes.json` | 6 empiric syndrome cards — **draft, see above** |
| `src/data/supplementary.json` | ESBL/CRE rates, durations, blood-culture rapid diagnostics, β-lactam cross-reactivity |

Four tabs (Organism · Drug · Empiric · Reference) and four audience filters (All · ED · ICU · Peds). The audience filter picks which sub-object of each organism's `data` the views read — it is not a display filter.

**Color coding is medical convention, not decoration:** green ≥80% · yellow 41–79% · red ≤40% · gray dash = not tested · black square = intrinsically resistant (the PDF's black cell; see *Intrinsic resistance* below). Organisms under 30 isolates carry a `low n` flag (CLSI threshold, from `legend.isolateMinimum`). Do not restyle these thresholds.

⚠️ **`src/data/*.json` are GENERATED — all four of them.** `build-app-data.mjs` holds the antibiotic metadata table *and* the six syndrome definitions inline, so editing `antibiotics.json` or `syndromes.json` directly works until the next pipeline run silently reverts it. Edit `_extraction/build-app-data.mjs` and re-run.

### Qualified drug columns report separately — do not re-merge them

Decided by Thiago 2026-10-03, after `drug-map-report.mjs` surfaced that the PDF prints some drugs under two different headers and the parser was collapsing them into one row.

| PDF headers | Slugs | Why separate |
|---|---|---|
| `Penicillin` / `Penicillin (IV)` | `penicillin` / `penicillin-iv` | Different determinations. `(IV)` appears only on the all-locations gram-positive table; plain only on ED/ICU/Peds. Merged, switching the audience filter silently changed which column a number came from while the label stayed identical. |
| `Nitrofurantoin` / `Nitrofurantoin (urinary)` | `nitrofurantoin` / `nitrofurantoin-urinary` | Same shape: plain on the all-locations gram-positive table, urinary on the gram-negative and ED/ICU/Peds tables. |

Verified after the split: **no row carries both halves of either pair** — the columns are genuinely disjoint — and `verify-data.mjs` still passes with the same 112 anchors / 75 rows / 1170 cells, so nothing was lost or duplicated.

### `name` labels a column; `regimenName` labels a prescribed agent

One `antibiotics` entry feeds both the Organism/Drug tabs (where it names a **measured column**) and the Empiric cards (where `SyndromeView.nameOf` puts it above a **dose**). For most drugs the two coincide. Where they do not, `regimenName` is the prescribing label and `name` stays the column label.

Peer review rated the conflation **High** (2026-10-03). "Cefotaxime/ceftriaxone" is the honest column heading — the PDF reports one combined column — but it had become the heading over a ceftriaxone-specific `1–2 g IV q24h` on the pyelo, CAP and intra-abdominal first lines, reading as *"either agent, once daily"* when cefotaxime is not a once-daily drug. `ceftriaxone` now carries `regimenName: "Ceftriaxone"`; the column still reads "Cefotaxime/ceftriaxone".

⚠️ **This is not a general de-qualifier, and must not become one.** `cefazolin` has **no** `regimenName`, so the SSTI card still reads "Cefazolin (urinary isolates)" — Thiago's reviewed decision (see the SSTI note above). Adding one there would quietly reverse it. Add a `regimenName` only where the column label names an agent the dose does not.

**Cefazolin is deliberately NOT split, because there is nothing to split.** Every cefazolin column in the 2026 PDF is the urinary one; there is no systemic column anywhere in the document. The defect there was labelling: the qualifier lived only in `notes`, which the UI renders as a hover-tooltip icon — effectively invisible on the phone this tool targets — so a bare "Cefazolin 88%" read as systemic susceptibility against a more permissive urinary breakpoint. The qualifier is now in the **name** (`Cefazolin (urinary isolates)`). If a future PDF adds a systemic column, give it its own slug; do not widen `cefazolin`.

**Two syndrome cross-links moved with the split** (`nitrofurantoin` → `nitrofurantoin-urinary`, in the uncomplicated-UTI first-line and the pyelo `avoid` entry). Only the `drug` slug changed — no dose, rationale or recommendation was touched. Both cards are about *E. coli* UTI, so the urinary series is the one they mean, and leaving them on the plain slug would have pointed them at gram-positive-only data that does not exist for 3 of the 4 audiences.

### All-locations fallback — a drug off the selected panel still shows, labelled

The split had a visible side effect: because the PDF prints the IV-penicillin and plain-nitrofurantoin columns *only* on the all-locations tables, those drugs vanished entirely when the reader switched to ED/ICU/Peds, which reads as missing data rather than as "not on that panel". Thiago's call (2026-10-03): **show the all-locations figure, but say plainly that it is not setting-specific.**

Both detail views now fall back. `OrganismView` adds drugs that are on the all-locations panel but not the selected one; `AntibioticView` falls back per organism row and, when any row is a fallback, also prints a banner above the list. **In both views, every fallback row carries all three cues on the row itself: an `all locations` badge, a "not specific to ⟨setting⟩" subtitle, and the all-locations `n`.**

⚠️ **The marker is visible text, deliberately — never a tooltip.** This is the same mistake the cefazolin qualifier made: a `title=` tooltip is effectively invisible on the phone this tool is built for, and an unlabelled all-locations number read as setting-specific is exactly the misreading the fallback must not cause. Multiple independent cues because one can be truncated, and **all of them on the row** because the `AntibioticView` banner scrolls out of view — for a while that banner was the *only* place the "not specific to" wording appeared, which peer review rated Medium.

⚠️ **Every row carries the isolate count of the bucket its value came from — do not re-derive low-n from the selected setting.** Peer review (2026-10-03, Medium) found the mismatch: Peds + *S. pyogenes* showed a fallback penicillin-IV of **100%**, an all-locations figure over n=36, beneath a header reading **"n = 11"** and **"below CLSI threshold"**. Four rows differed that way, and the CLSI judgement was being made against the wrong denominator in all of them. Each row now computes its own low-n flag, prints `n = ⟨count⟩ all locations` when it is a fallback, and the header's count reads "in this setting" whenever any row beneath it is not.

**A selected organism can outlive its data.** The list is filtered to organisms with a bucket for the audience, but the selection is not, so All → *S. pyogenes* → ICU used to dereference `undefined` and crash the view (pre-existing; peer review, Medium). It now renders a short "Not reported for ⟨setting⟩" panel. Clearing the selection silently was the other option and is worse — it reads as the app losing the reader's place.

Fallback never applies when the selected audience *is* `all`, and never invents a value: a drug absent from both panels stays absent. Verified against the JSON — the displayed figures and isolate counts come from the all-locations panel (e.g. ED + Penicillin (IV): GBS 100% n=58, GAS 100% n=36, *S. anginosus* 98% n=48, all matching `data.all` while `data.ed` is genuinely undefined).

### Drug notes open on tap — the amber (!) icon is a button

In the Organism view, the amber (!) beside a drug opens that drug's `notes` as visible text under the row. Several can be open at once, and opening another organism collapses them all. Until 2026-10-13 the icon had no tap action and no visible text; the note lived only in its `title=` tooltip and `aria-label`. That repeated the cefazolin and all-locations mistake: a sighted phone user sees neither, so the icon was a caution mark with nothing behind it. Thiago hit it on *E. faecalis* (vancomycin, nitrofurantoin, gentamicin synergy). Keep it a button. The Drug view already prints the note in its header and needs nothing.

**Which organism a note appears under is decided by `noteAppliesTo` — option C, Thiago, 2026-10-13.** A note's text is per drug; where it shows is not:

| Note | Shown on | Where it shows |
|---|---|---|
| No `noteAppliesTo` — about the drug itself (vancomycin, nitrofurantoin ×2, cefazolin, oxacillin, minocycline, penicillin IV, caspofungin, micafungin) | every organism | rows with a % figure only |
| `noteAppliesTo` lists organisms (gentamicin, amikacin → *P. aeruginosa*; gentamicin synergy → enterococci; rifampin → *S. aureus*; pip-tazo, ceftriaxone → HECK-Yes) | the listed organisms only | % rows, "Not tested" and intrinsically resistant entries alike |

So gentamicin's "no longer recommended for Pseudomonas" now sits under *Pseudomonas* (in "Not tested", which is exactly why it is blank) and no longer under eleven Enterobacterales; the HECK-Yes warning sits on the three HECK-Yes organisms' blank pip-tazo and ceftriaxone, and no longer under *E. coli*. General drug caveats stay off the "Not tested" list, where they were clutter. **"Not tested" starts open whenever it holds a note about that organism** — behind a closed disclosure, *E. cloacae*'s screen gave no sign of "avoid ceftriaxone and pip-tazo" (peer review, 2026-10-13). The groups are derived from the organism list in `build-app-data.mjs`, which stops the build if a group comes up empty; HECK-Yes is matched by the five names in the PDF's own footnote **and** must agree with the organisms the PDF stars, so a renamed organism or a dropped star stops the build rather than silently taking the warning off one organism. **The mapping is a clinical call and is pending owner confirmation** — until Thiago records a date here, treat it as draft.

**The pip-tazo and ceftriaxone note is approved wording (Thiago, 2026-10-13):** "Avoid for HECK-Yes organisms (inducible AmpC), even if the micro report says susceptible, unless discussed with ID." It restores what the PDF's blood-culture page says and the old note ("Avoid for HECK-Yes organisms (inducible AmpC).") dropped, and gives ceftriaxone the note the page names it in.

**Provenance is mixed** (checked against `layout.txt`, 2026-10-13). From the PDF's general notes and footnotes: oxacillin, gentamicin, amikacin, rifampin (paraphrased), caspofungin and micafungin. From its blood-culture page: minocycline, pip-tazo and ceftriaxone. Written during the build, not printed anywhere in the PDF: vancomycin's "PO only for C. difficile", gentamicin synergy's "combined with cell-wall agent", nitrofurantoin's "no systemic activity", and cefazolin's note, which was derived from the column header. Some of the text is not a caution at all: `penicillin-iv`'s whole note, and the second sentence of each nitrofurantoin note, only say which PDF column the figure came from.

### Intrinsic resistance — the PDF's black cells

The PDF marks intrinsic resistance by **filling the cell solid black and printing nothing in it** (its legend: "▪ Organism exhibits intrinsic resistance to this drug"). The pipeline read only text, so until 2026-10-13 **every one of those drugs vanished from the app** — in neither the % list nor "Not tested", in the Organism and Drug views alike — and `verify-data.mjs` passed, because it read only text too. *E. faecalis* showed no ceftriaxone, clindamycin or TMP-SMX at all where the PDF says intrinsically resistant.

| Stage | What it does |
|---|---|
| `extract.mjs` | Records every filled box from the page's drawing instructions (`getOperatorList`) to `fills.json`: CTM and fill opacity tracked, **one box per subpath** (pdf.js batches consecutive path operators into one `constructPath` whose union box would merge adjacent cells), all six fill operators, hairlines dropped. Counts any image or shading painted on a page (`unmodelled`), and stops on a rotated or offset page. No rendering, no native modules. |
| `parse-v2.mjs` | Black = every channel ≤ 40 and opaque (the cells are exactly 0,0,0; the header band is 36,64,97), cell-sized = ≥ 8 × 6 pt. A box marks the drug whose **column anchor lies inside it**, for the row whose value-line baseline runs through it. **Any anomaly — no anchor or two inside a box, a box on a non-drug column, a box over printed text, a box matching no row or two — stops the run before `tables-v2.json` is written.** |
| `build-app-data.mjs` | Writes `intrinsicResistance: [slugs]` on a bucket, only when non-empty. Those slugs never also appear in `susceptibilities`. |
| `verify-data.mjs` Check D | Maps the same boxes with its **own row inventory** and compares both directions; every black box on a table page must belong to exactly one PDF row, no entry may repeat, and a table page that paints an image or shading fails. |
| UI | Organism view: an open "Intrinsically resistant (n)" list under the % list, with black squares. Drug view: the organisms intrinsically resistant to that drug. |

⚠️ **Check D is not an independent check of the column.** Its rule (nearest anchor to the box's centre) picks the same anchor as the parser's (anchor inside the box) whenever exactly one anchor is inside — Gemini's peer review showed it, 2026-10-13. Column correctness rests on **Check A**, which validates every anchor against the header the PDF prints. What Check D adds independently is the row, completeness in both directions, and emptiness of each black cell. And **it trusts `fills.json`**: clipping is not modelled (a box is recorded at full size), and a black cell drawn as an image or shading would be missing from both scripts — which is why such painting on a table page fails the verifier instead of passing it silently.

**367 cells in 62 organism/setting buckets** (2026 PDF). Pixel-checked as well, independently of all of the above: sampling the rendered PDF canvas in the browser on pages 2–3 found black exactly where the data says (*E. faecalis*, *E. faecium*, MRSA, *E. cloacae*, *E. coli* = none, *P. aeruginosa*).

Three traps, each hit while building it:

- **Use the value line's baseline, not the clustered row's y.** `clusterRows` keeps a running average; on the ED page the rotated "Negative" section label joins the *K. oxytoca* row and drags its y into the next row's cells — seven cells mapped to no row or to two rows until `valueLineY()` took the median baseline of the row's numbers.
- **Nitrofurantoin-resistant organisms (*Proteus*, *Serratia*) also have their "# tested with nitrofurantoin" count cell blacked out.** It is a count, not a drug: both parser and verifier skip it.
- **"No key in `susceptibilities`" no longer means "not on this panel".** It can mean intrinsically resistant. Both all-locations fallbacks skip drugs the selected setting marks intrinsically resistant (zero such cases in the 2026 data, but the guard is what makes that safe). The reverse fallback exists too, labelled, for drugs the all-locations page marks intrinsically resistant and the setting's page has no column for: *P. aeruginosa* → minocycline in ED, *S. maltophilia* → amikacin in Peds. MRSA → penicillin IV is the one it skips, because ED/ICU/Peds already mark plain "Penicillin" — the same drug under the other heading (`SIBLING_COLUMN`) — and showing both said it twice.

**What the PDF marks is the PDF's call, and two patterns are worth knowing before reading it as microbiology.** On the combined ED/ICU/Peds pages every gram-negative is marked resistant to the gram-positive agents (vancomycin, clindamycin, erythromycin, oxacillin, penicillin, and rifampin on Peds). And **staphylococci and streptococci are marked intrinsically resistant to ceftazidime** on those pages — not a classic intrinsic resistance, but it is what the lab printed. The app transcribes it; it does not judge it.

### The PDF viewer — four deliberate decisions, none of them accidental

`Header`/`Footer` open a full-screen in-app viewer. Every choice below was forced by a real failure; a future session "simplifying" any of them will reintroduce a shipped bug.

| Decision | Why — do not undo |
|---|---|
| **pdf.js canvases, never an `<iframe>`** | iOS Safari's native inline PDF viewer renders **only page 1** of a multi-page doc with locked zoom. An iframe looks fine on desktop and is broken on the target device. |
| **`PdfViewer` (shell) is eager; `PdfCanvas` is `React.lazy`** | The shell owns the Back button, scroll lock and focus trap, so they exist instantly and still work if the heavy chunk never loads. Merging them back would put the close button behind the failure it needs to survive. |
| **`PdfErrorBoundary` wraps the lazy chunk** | `Suspense` catches a *pending* import, not a *rejected* one. After a redeploy an open PWA requests a stale chunk hash; without the boundary that rejection blanks the **whole app**, not just the PDF. |
| **Page windowing uses `scroll` events + cumulative heights, not `IntersectionObserver`** | Deliberate. IO is the "modern" choice and was tried first; it could not be verified while the tab was hidden (see *Preview pane* below), and a silently non-firing observer renders blank pages past the seed — worse than the memory problem it solves. Caps live canvases at ~6 of 13. |

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

The pane's tab runs hidden unless you front it (`tabs_select`). While hidden: screenshots fail ("not compositing frames"), `IntersectionObserver` never fires, and programmatic `scrollTop` emits no `scroll` event (set it, then `dispatchEvent(new Event('scroll'))`). Front the tab before concluding a feature is broken. The scroll-event page windowing (above) shipped under these conditions and is kept as is.

Also: editing a hook's **hook count** while the dev server is live throws React "Rendered more hooks than during the previous render". That is an HMR artifact, not a real bug — full-reload before believing it.

## Annual update — when the 2027 PDF drops

1. **Replace the PDF in `public/`, deleting last year's** — the pipeline now globs for exactly one PDF there and refuses to run on zero or two, so leaving both stops the extraction instead of silently picking one. Then update the filename in **both** places it is hardcoded: the `PDF_HREF` constant in `src/App.jsx` and the `download` attribute on the Download link in `src/components/PdfViewer.jsx`. Missing the second one serves the new PDF under last year's filename.
2. Update the hardcoded per-page column X-coordinates in `_extraction/parse-v2.mjs` if the table layout changed.
3. `cd _extraction && node extract.mjs && node parse-v2.mjs && node build-app-data.mjs`
4. **`node verify-data.mjs`** — must print PASS. It refuses to run unless the intermediates were extracted from the PDF now sitting in `public/` (SHA-256, recorded in `source.json`), then checks every column anchor against the header the PDF prints at that x, matches all 75 printed data rows one-to-one against JSON organisms, and compares every cell — and every black intrinsic-resistance cell — in both directions. Exits 1 on any disagreement. Then **`node verify-controls.mjs`** must report every control failing: it proves the verifier can still catch what it claims to.
5. **Still spot-check at least 5 organisms against the PDF by hand.** Step 4 proves the extraction faithfully reproduces the PDF; it says nothing about whether the PDF's own numbers are right, and it is not clinical verification. A green step 4 is not a reason to skip this.
6. `npm run deploy`, then bump the git tag.

### Why step 4 exists, and what it does not cover

`parse-v2.mjs` maps numbers to drugs using hand-typed per-page column x-coordinates. The design is deliberate and works, but its failure mode is **silent**: if a column shifts, every number still lands in *some* column — just the wrong one — and the output looks entirely plausible. Re-running the pipeline cannot catch this (same parser, same coordinates, same answer), so verification has to come from outside that code path.

**The whole thing is driven from the PDF, not from the JSON — and that was the correction that mattered.** The first version of `verify-data.mjs` only ever inspected what the JSON *claimed*. An independent Codex review (gpt-6-astra, 2026-10-01) identified the gap, and running its cases confirmed every one: deleting a susceptibility key, deleting an audience bucket, deleting a whole organism, inventing a drug with no column on that page, renaming an organism so no row matched while corrupting one of its values, mutating `isolateCount` to another number printed on the same row — and `organisms: []`, an entirely empty dataset — **all printed PASS.** A verifier that green-lights an empty dataset is worse than none, because it manufactures confidence. Nothing in it fails open now: an unmatched row, an unexpected key or a missing cell is a failure, never a note.

Five checks, in order:

- **Source binding.** Re-hashes the single PDF in `public/` and refuses to run unless it matches the `sha256` in `source.json`, written by `extract.mjs`. Without this, dropping in next year's PDF while leaving last year's intermediates in place compared the old artifacts to each other and passed.
- **Check A — right drug.** Each anchor against the header text the PDF prints at that x, partitioned with the same nearest-anchor rule `snapValuesToColumns` uses for values. Also rejects duplicate anchors, duplicate canonical slugs, and labels with no SLUG mapping. 112 anchors across 6 pages.
- **Check B — right row, one-to-one.** All 75 data rows the PDF prints are enumerated from `layout.txt` and matched to JSON organisms bijectively. A PDF row with no JSON organism fails; a JSON bucket holding values with no PDF row fails; an ambiguous match fails rather than guessing.
- **Check C — right column, both directions.** `{slug: value}` is reconstructed from the PDF's geometry and diffed against the JSON PDF→JSON *and* JSON→PDF, so a dropped key and an invented value both fail. **A dash must exist as a `null` key** — a deleted one used to pass, and the "Not tested" entry and any organism-specific note on it (*Pseudomonas* → gentamicin) vanished with it (Codex, 2026-10-13). Isolate counts and nitrofurantoin denominators are checked against their **own** columns, not "is this number anywhere on the row". ~1170 cells.
- **Check D — intrinsic resistance, both directions** (2026-10-13). The black cells from `fills.json` against `intrinsicResistance`. A dropped, invented or repeated entry fails, a black cell the JSON also gives a value or null fails, a black cell carrying text fails, a black "# tested with nitrofurantoin" cell without a black nitrofurantoin cell fails, a black box that belongs to no row — or to two — fails, and a table page that paints an image or shading fails. 367 cells. Not independent of the parser on the column — see *Intrinsic resistance* above.

A run that compares implausibly little also fails outright: on row and cell counts, on fewer than 330 intrinsic-resistance cells (the 2026 PDF has 367 — if a new PDF genuinely has fewer, lower it deliberately), and on any table page with no black cell at all. That is what stops a near-empty dataset, or a `fills.json` that lost cells, from printing PASS.

**25 controls fail it as they should, and `node verify-controls.mjs` runs them all** (scripted 2026-10-13; until then they were rebuilt by hand). **Each must fail with the diagnostic named for it**, not merely exit 1: node also exits 1 on a crash, and a control can trip some unrelated check while the one it targets has rotted — two reviewers found exactly that in the first version. The controls: wrong value · adjacent-row swap · within-row drug swap · plausible-but-wrong value · dropped-to-null · invented value over a dash · deleted key · invented drug with no column · deleted audience bucket · deleted organism · `organisms: []` · unmatchable name with a corrupted value · wrong isolateCount · wrong nitrofurantoinTested — then: dropped intrinsic resistance · invented over a dash · moved to the wrong drug · black cell also given a value · black cell recorded as not tested · every list deleted (the pre-2026-10-13 data) · invented with no column · black cell kept *and* recorded as not tested · deleted dash (*Pseudomonas* gentamicin) · deleted dash (*E. cloacae* pip-tazo) · duplicated entry. It also requires the unmodified data to pass. **Run it after any edit to `verify-data.mjs`**; it writes its corrupted copies to a temp directory and touches nothing under `src/`.

Six traps are already handled — do not "simplify" them away:

- Anchors are read off **glyph origins, not centres**. Matching on centres shifts every column by one and reports a correct table as entirely mislabelled.
- Check A compares by **prefix, not substring**. The PDF legitimately prints a longer qualifier than the parser's label — "Nitrofurantoin (urinary isolates only)" against "Nitrofurantoin (urinary)" — but a substring test also accepts an anchor that has drifted onto a neighbouring header.
- Rows are found by locating the **value-bearing line first**, then attaching each name-only line to its nearest value line. Walking forward from name lines instead loses rows: consuming "Streptococcus pneumoniae" as part of the preceding non-sterile row dropped the blood/CSF row entirely, 73 found where the PDF prints 75.
- Rotated section labels are glued onto names with no space (`NegativeKlebsiella oxytoca`), names wrap, and the qualifier that distinguishes two rows can print *after* the numbers — `Streptococcus pneumoniae`, then the values, then `(blood/cerebrospinal fluid)*`, whose sibling row shares its prefix.
- pdf.js emits numbers as **separate glyph runs** — `"8","3"` for 83, `"1","265"` for 1265 — so Check C merges adjacent digit runs before snapping, keeping the first fragment's x. That merge agreeing with the parser on every cell is the evidence it is faithful.
- An audience spans several pages (`all` is printed across three), so the reverse check is per **audience**, not per page. Done per page it flags every gram-negative organism as missing from the gram-positive table.

**Known limitations — real, and not fixed:**

- **The canonical drug-name map cannot be validated by code, and was validated by a human on 2026-10-03.** Parser and verifier both read `parse-v2.mjs`'s `SLUG`, so swapping two slugs there and regenerating would satisfy every check (Codex F7). Thiago reviewed the full map that day and confirmed it: three mappings were changed as a result (the two column splits and the ceftriaxone label, below), and he confirmed the remaining mappings are correct. **That confirmation is specific to the 2026 PDF — it does not carry over.** Re-run the report and re-confirm after any annual update, because a shifted column changes which header a slug is claiming. **`node drug-map-report.mjs`** lays the two ends side by side (PDF header label → slug → the name the app displays, aliases grouped, 33 drug labels → 32 drugs, plus 2 bookkeeping columns counted separately) so that review is a short eyeball rather than archaeology. It asserts nothing; it only makes the comparison cheap. Underscore-prefixed slugs (`_isolates`, `_n_nitrofurantoin`) are bookkeeping columns, not drugs, and are labelled as such — they are *expected* to have no `antibiotics.json` entry.
- **Literal slicing is textual.** `PAGE_TABLES` and `SLUG` are sliced out of the parser source by brace matching. A duplicate declaration now throws, but a brace inside a string or comment could still mis-slice (F12).
- It cannot tell you the PDF's own numbers are right. That is step 5, and it is not optional.

**Self-test.** `ANTIBIOGRAM_JSON=<path>` points it at a different file, so you can corrupt a copy and confirm it still fails. A check that cannot fail is worth nothing, and a passing run looks identical either way.


**`_extraction/` layout:** `extract.mjs` → `parse-v2.mjs` → `build-app-data.mjs` is the live chain, with `verify-data.mjs` as a read-only check alongside it and `verify-controls.mjs` as the verifier's own self-test; `build-app-data.mjs` reads `tables-v2.json`. Scripts and `package-lock.json` are tracked (the lockfile pins `pdfjs-dist`, so next year's run reproduces this year's coordinates); the generated intermediates (`items.json`, `fills.json`, `raw.txt`, `layout.txt`, `tables.json`, `tables-v2.json`) are gitignored. **`source.json` is the exception and IS tracked** — it records the filename, SHA-256 and page count of the PDF the committed data was extracted from, so provenance survives in git history rather than only on the machine that last ran the pipeline. `parse-tables.mjs` is the **superseded v1 parser**, kept only because the comment above `PAGE_TABLES` in `parse-v2.mjs` cites its output as the provenance of the column anchors — it is not part of the pipeline. `verify-data.mjs` reads `PAGE_TABLES` by slicing the literal out of `parse-v2.mjs` rather than importing it, because importing that script would re-run it and rewrite a pipeline intermediate as a side effect of verifying.

## Offline support — the service worker

Added 2026-10-01 via `vite-plugin-pwa` (Workbox, `generateSW`). The manifest already made the app installable; without a service worker an installed copy was a blank page the moment the network dropped, which for a bedside phone tool was the biggest functional gap in the app.

13 precached entries, ~2.80 MB: the shell, the hashed JS/CSS (the antibiogram JSON is `import`ed, so the data is *inside* `index-<hash>.js` — there is no separate data cache to go stale on its own), the icons, pdf.js's worker and lazy chunk, and the 840 KB PDF itself. Verified end-to-end by stopping the server and reloading: the app renders, and the full PDF still serves.

Four decisions worth keeping:

| Decision | Why |
|---|---|
| **`manifest: false`** | `public/manifest.webmanifest` is hand-maintained and its icon filenames are deliberately `-v3`-suffixed (see *App icons* below). Letting the plugin emit a second manifest would fight that. |
| **`registerType: "autoUpdate"` + the update handling in `src/main.jsx`** | **These are a pair — removing either re-introduces stale clinical data.** autoUpdate gives the SW `skipWaiting` + `clientsClaim`, so a new version activates and claims open pages. But the generated `registerSW.js` only *registers*: the claimed page keeps running the bundle it already loaded, so the first visit after a deploy would still render the previous data. `main.jsx` closes that — see the block there, which carries the first-claim guard, the bounded-freshness updates and the session handoff (*Service-worker invariants* below; the peer-review record is `docs/sw-peer-review-2026-10.md`) and why each is not hypothetical. |
| **`globIgnores: ["icon-source.png", "og-image-v3.png"]`** | Both are served but never requested by the running app — `icon-source.png` is the 1 MB master artwork, and the OG image is only fetched by social crawlers, which do not run service workers. Precaching them cost 1.26 MB on every phone, 31% of the install, for nothing. |
| **`maximumFileSizeToCacheInBytes: 3 MiB`** | Above the 2 MiB default. pdf.js's worker is ~1 MB today; a file that outgrows the cap is dropped from the precache **with no error**, which is the quiet failure this whole feature exists to avoid. |

Google Fonts are cross-origin and so cannot be precached — a `CacheFirst` runtime rule covers them. CacheFirst is safe for immutable font files; do not extend that handler to anything carrying clinical data.

**This does not retire `PdfErrorBoundary`.** That boundary exists because an open PWA can request a lazy chunk hash that no longer exists after a redeploy (see the PDF-viewer table above). The service worker narrows that window considerably — the new worker precaches the new hashes, and the `controllerchange` reload moves the page onto them promptly — but it does not close it: a page still running the old bundle that lazy-imports the old `PdfCanvas-<hash>.js` finds it gone from both the refreshed precache and the host. The boundary is still the backstop. Keep both.

**The SW does not exist in dev** (`devOptions.enabled: false`, because it makes HMR behave like app bugs). To exercise it: `npm run build:firebase` then `npm run preview:firebase` (port 4173, `antibiogram-preview` in `.claude/launch.json`). Testing against the dev server will show no service worker at all and look like the feature is missing.

`firebase.json`'s existing header shape already suits this: `sw.js` sits at the root and so is covered by the `**` → `no-cache` rule, which is what lets a new worker be discovered promptly.


### Service-worker invariants (each closed a real stale-data path; the reasons are in `src/main.jsx`)

- **First-claim guard tracks the transition**, not a one-time boolean: only the first `controllerchange` is swallowed; every later one reloads.
- **Bounded freshness**: `registration.update()` on load, on `online`, and on becoming visible. Calling `register()` again is not a substitute — Chromium and WebKit can reuse an identical registration without re-fetching.
- **`disableRange: true` in `PdfCanvas.jsx`**: the precached PDF is returned whole; a 200 answered to a Range request corrupts pdf.js offsets.
- **`navigateFallbackDenylist` is `[/\/assets\//, /^[^?]*\./]`** — "a literal dot anywhere before the query". Workbox tests `pathname + search`, so an end-anchored extension test misses `.webmanifest` and any `?download=1` URL and serves HTML where the reader asked for the PDF.
- **The selected audience survives an update reload only** (session handoff, read once and cleared); a manual reload starts at the default.
- `index.html` icon/manifest refs use `%BASE_URL%`, not document-relative paths.
- An oversize precache asset **fails the build** (vite-plugin-pwa throws); it is not silently dropped.

### Hosting rewrite — `^/[^.]*$`, deliberately

**The rewrite is now `{ "regex": "^/[^.]*$", "destination": "/index.html" }`.** A missing asset-shaped path (anything containing a dot) 404s instead of being answered with the app shell. That closes the poisoning route: Workbox precaches any sub-400 response **without checking MIME type**, so while the catch-all stood, an asset fetch during service-worker install that raced a deploy could cache HTML under a `.js` URL.

**Verified live after deploy, not reasoned:**

| Request | Before | After |
|---|---|---|
| `/assets/index-DOESNOTEXIST.js`, `/assets/missing.mjs`, `/assets/missing.css` | 200 `text/html` | **404** |
| `/missing.pdf`, `/old-page.html`, `/v1.2/foo` | 200 `text/html` | **404** |
| `/`, `/foo`, `/foo/bar`, `/foo/`, `/foo/bar/` | 200 shell | 200 shell — **deep links preserved** |
| real files (hashed JS, `sw.js`, `manifest.webmanifest`, `favicon.svg`, the PDF, `og-image-v3.png`) | correct | correct MIME, unchanged |

Note the policy is "a dot **anywhere** in the path", not "a file extension". A dotted deep link such as `/v1.2/foo` now 404s. That is accepted: the app has never had a router, so no such path was ever real.

**Two limits of this fix, both measured — do not mistake them for regressions:**

- **It prevents new poisoning; it does not repair a cache already poisoned.** In practice a later deploy largely self-heals, because every asset is content-hashed: a new build references new URLs, so a poisoned entry sits in an outdated cache and `cleanupOutdatedCaches()` drops it. `registerSW.js` registers independently of `main.jsx`, so a later release can recover a blank install.
- **`/assets/<dotless>` still gets the shell, and it gets the immutable header.** Measured: `/assets/foo` returns 200 HTML with `public, max-age=31536000, immutable`. Excluding the `/assets` namespace in RE2 without lookahead means enumerating the prefix character by character, which is unreadable and easy to get wrong; and no precached asset is extension-less, so this is not a poisoning route for any build this app produces. Left as-is deliberately, with the measurement recorded so the next session need not re-derive it.

### ⚠️ Still open — the first-claim race (Codex, Medium, pre-existing)

`src/main.jsx` deliberately swallows the **first** `controllerchange` ("reloading here would be a pointless extra load on every first visit" — that is the F2 fix). Codex found a window this leaves: an uncontrolled page loads release A → release B deploys before A's worker finishes installing → worker B claims the still-running A page → the first claim is ignored → **the reader keeps seeing A's susceptibility data** until a navigation or a later update.

This was **not** changed, and the reason is worth keeping: every cheap fix is worse than the bug. Always reloading on the first claim reintroduces exactly what F2 removed (an extra load for every new install, and the loop risk that motivated the guard); a time-based heuristic is guesswork. The clean fix is what Codex suggests — compare a release identifier carried in the page against the worker's — and that is a small feature with its own review, not a cleanup. Decide it deliberately.


## App icons

Latest set is `-v3` (`icon-{32,180,192,512}-v3.png`, `og-image-v3.png`). **iOS caches home-screen icons by URL**, so a new icon requires a *filename* bump (`-v4`) plus updating `index.html` and `public/manifest.webmanifest` — editing the image in place does nothing. Even then an existing install may need Safari → Advanced → Website Data cleared.
