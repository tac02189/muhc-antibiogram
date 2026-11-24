# MUHC Antibiogram

Interactive susceptibility lookup for the **MU Health Care University Hospital 2026 Antibiogram**, replacing the static PDF. Mobile-first — the primary device is a phone at the bedside.

**Live: https://muhc-antibiogram.web.app**

Installable to a phone home screen and **works with no network** once installed.

---

## What it does

Four views over the same dataset, filtered by one of four patient populations (**All · ED · ICU · Peds**):

| Tab | Shows |
|---|---|
| **Organism** | 32 organisms → % susceptible per antibiotic |
| **Drug** | Inverted: one antibiotic → how it performs across organisms |
| **Empiric** | 6 syndrome cards — confirmed by the MU pharmacy team, see below |
| **Reference** | ESBL/CRE rates, duration guidance, blood-culture rapid diagnostics, β-lactam cross-reactivity |

The original PDF is readable in-app and offline.

**Color is medical convention, not decoration:** green ≥80% · yellow 41–79% · red ≤40% · gray dash = not tested. Organisms with fewer than 30 isolates are flagged `low n` per the CLSI threshold.

---

## ⚠️ The Empiric tab: confirmed by the MU pharmacy team

The 6 syndrome cards were scaffolded from the local antibiogram plus standard IDSA guidance. **The MU pharmacy team confirmed all six** (recorded 2026-11-24 in `docs/empiric-pharmacy-confirmation-2026-11-24.json`), and the draft banner came off the tab in v1.10. In v1.11 one rationale was reworded at Thiago's word (`docs/empiric-amendments.json`). Everything else in the app derives mechanically from the source PDF.

Changing an agent, dose or rationale on those cards is a clinical change: do not make one without a clinician's or the pharmacy team's sign-off. See `CLAUDE.md`.

---

## Develop

```bash
npm install
npm run dev
```

⚠️ The dev server serves at **`http://localhost:5173/muhc-antibiogram/`**, not the root — `base` defaults to the old GitHub Pages subpath. Plain `/` is a blank page and looks like a broken build.

The service worker is disabled in dev. To exercise offline behavior you need a production build:

```bash
npm run preview:firebase    # builds nothing — run build:firebase first
```

## Build & deploy

```bash
npm run deploy      # build with BASE=/ then deploy Firebase Hosting
```

Firebase Hosting is the only host. **Never run `gh-pages` against this repo** — that branch serves a retirement redirect, and republishing it would silently restore a stale copy of a clinical tool.

Plain `npm run build` targets the old GitHub Pages base path and is wrong for Firebase; use `build:firebase` (or just `npm run deploy`, which does it for you).

---

## Where the data comes from

`src/data/*.json` is generated from the PDF in `public/` — it is not hand-maintained. The pipeline lives in `_extraction/`:

```bash
cd _extraction
node extract.mjs        # PDF → text + positions
node parse-v2.mjs       # positions → tables (uses per-page column anchors)
node build-app-data.mjs # tables → src/data/*.json
node verify-data.mjs    # check the result against the PDF (must print PASS)
```

`verify-data.mjs` exists because `parse-v2.mjs` maps numbers to drugs using hand-typed column x-coordinates, which fail **silently** if a column shifts — every number still lands in some column, just the wrong one. It is driven from the PDF rather than the JSON: it refuses to run unless the intermediates were extracted from the PDF now in `public/` (by SHA-256), checks each column anchor against the header the PDF prints there, matches all 75 printed data rows one-to-one against JSON organisms, and compares every cell in both directions so a dropped key fails as loudly as a wrong number. 14 planted-error controls confirm it still fails when it should. It does not, and cannot, verify the lab’s numbers themselves.

Full annual-update procedure in `CLAUDE.md`.

---

## Stack

React 18 · Vite 5 · Tailwind 3 · lucide-react · react-pdf (pdf.js) · vite-plugin-pwa · Firebase Hosting (static only — no Firestore, no Auth)
