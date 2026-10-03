import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Base path defaults to the GitHub Pages subpath. Firebase Hosting serves
// from root — set BASE=/ when building for that target (see package.json
// "build:firebase" script).
const base = process.env.BASE ?? "/muhc-antibiogram/";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The manifest is hand-maintained at public/manifest.webmanifest and is
      // already linked from index.html. Icon filenames there are deliberately
      // version-suffixed (-v3) because iOS caches home-screen icons by URL —
      // see CLAUDE.md "App icons". Letting the plugin generate a second
      // manifest would fight that discipline, so it generates none.
      manifest: false,

      // autoUpdate, not "prompt": a susceptibility reference must never pin a
      // resident to last year's numbers waiting for them to click "reload".
      // This builds the SW with skipWaiting + clientsClaim, so a new version
      // activates and claims open pages as soon as it is found.
      //
      // That alone is NOT enough — the generated registerSW.js only registers,
      // so the claimed page keeps running the bundle it already loaded and the
      // first visit after a deploy would still render the previous data. The
      // controllerchange reload in src/main.jsx closes that gap; the two are a
      // pair, so do not remove one without the other.
      registerType: "autoUpdate",
      injectRegister: "auto",

      workbox: {
        // The default glob misses three things this app needs offline: the
        // antibiogram PDF, the hand-maintained .webmanifest, and pdf.js's
        // .mjs worker. Omitting any of them fails silently — the app installs
        // and then 404s the moment it is opened without a network.
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,ico,webmanifest,pdf}"],

        // Two files in public/ are served but never requested by the running
        // app, and precaching them cost 1.26 MB of every phone's storage —
        // 31% of the install — for nothing:
        //   icon-source.png  the 1 MB master artwork the -v3 icons were cut
        //                    from; an archive, not an asset the app loads.
        //   og-image-v3.png  link-preview image. Only social-media crawlers
        //                    fetch it, and crawlers do not run service workers.
        // Both stay deployed and reachable; they are just not forced onto
        // every device.
        globIgnores: ["icon-source.png", "og-image-v3.png"],

        // Explicit, and above the 2 MiB default. pdf.js's worker is ~1 MB and
        // the PDF ~840 KB today, so everything fits.
        //
        // An earlier comment here claimed an oversize file is "dropped from the
        // precache with no error". That was wrong — peer review (F13) checked
        // the plugin source: vite-plugin-pwa turns a matching maximum-size
        // warning into a thrown error, so an oversize asset FAILS THE BUILD
        // rather than vanishing quietly. Keeping the cap generous still matters
        // (a failed build at deploy time is disruptive), but do not repeat the
        // silent-omission claim.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,

        // Delete previous-deploy precaches instead of accumulating them.
        cleanupOutdatedCaches: true,
        clientsClaim: true,

        // Single-page app, no router — every navigation resolves to the shell.
        navigateFallback: "index.html",

        // ...but NOT for requests that are plainly files. Peer review (F10)
        // showed the bare fallback answers any unmatched in-scope navigation
        // with the app shell: navigating straight to /og-image-v3.png, which is
        // deliberately excluded from the precache, returned HTML instead of the
        // image the server actually has. The same happens to a PDF URL carrying
        // a query the precache does not match exactly.
        //
        // Anything with a file extension, plus the hashed asset directory, is
        // therefore excluded from the shell fallback and left to the network.
        //
        // The pattern is "a literal dot anywhere before the query", NOT an
        // end-anchored extension. Peer review 2026-10-03 found the previous
        // `/\.[a-zA-Z0-9]{2,5}$/` wrong in two ways, because Workbox tests this
        // against `pathname + search`, not the pathname alone:
        //   - `.webmanifest` is 11 characters, so {2,5} could never match it;
        //   - any query defeated the `$` anchor, so
        //     /MUHC-UH-Antibiogram-2026.pdf?download=1 fell through to the
        //     shell and returned HTML where the reader asked for the PDF.
        navigateFallbackDenylist: [/\/assets\//, /^[^?]*\./],

        runtimeCaching: [
          {
            // Google Fonts stylesheet + font files are cross-origin, so they
            // are not precachable. Without this the app still works offline
            // but falls back to system fonts mid-shift. Fonts are immutable
            // in practice, so CacheFirst is safe here in a way it would not
            // be for anything carrying clinical data.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      // A service worker in dev makes HMR behave in ways that look like app
      // bugs. Build and preview to exercise it.
      devOptions: { enabled: false },
    }),
  ],
  base,
});
