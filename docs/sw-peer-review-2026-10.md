# Service-worker peer review (Codex gpt-6-astra, 2026-10-01) — the F-numbered record

Moved verbatim from `CLAUDE.md` → *Offline support* on 2026-10-07; the live rules it motivated are now the *Service-worker invariants* list there. Kept as it stood, including the F10 paragraph that sits between the table's rows.

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
