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
| **Empiric** | 6 syndrome cards — ⚠️ **unreviewed draft, see below** |
| **Reference** | ESBL/CRE rates, duration guidance, blood-culture rapid diagnostics, β-lactam cross-reactivity |

The original PDF is readable in-app and offline.

**Colour is medical convention, not decoration:** green ≥80% · yellow 41–79% · red ≤40% · grey dash = not tested. Organisms with fewer than 30 isolates are flagged `low n` per the CLSI threshold.

---

## ⚠️ The Empiric tab is unreviewed

The 6 syndrome cards were scaffolded from the local antibiogram plus standard IDSA guidance. **They are not reviewed clinical recommendations**, and the app says so in a banner on that tab. Everything else in the app derives mechanically from the source PDF.

Do not edit those cards, or remove that banner, without a clinician's sign-off. See `CLAUDE.md`.

---

## Develop

```bash
npm install
npm run dev
```

⚠️ The dev server serves at **`http://localhost:5173/muhc-antibiogram/`**, not the root — `base` defaults to the old GitHub Pages subpath. Plain `/` is a blank page and looks like a broken build.

The service worker is disabled in dev. To exercise offline behaviour you need a production build:

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
