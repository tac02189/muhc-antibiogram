import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Keep an installed copy from showing last year's susceptibility data.
//
// vite-plugin-pwa's generated registerSW.js only calls register(). The service
// worker is built with skipWaiting + clientsClaim, so a new version activates
// and claims this page immediately — but the already-rendered page keeps
// running the JavaScript it loaded. Without the handling below, the first visit
// after a deploy renders the PREVIOUS bundle, which for this app means last
// year's numbers. That is the one staleness mode offline support introduces, so
// it is handled explicitly rather than left to the plugin's default.
//
// Peer review (Codex gpt-6-astra, 2026-10-01, findings F2/F3/F11) found three
// defects in the first version of this block. All three are fixed here; none is
// hypothetical, so do not "simplify" them back out:
//
//   F2 — the guard was `const hadController = Boolean(controller)` evaluated
//        once. On a first-ever visit that is false FOREVER, so every later
//        update to that still-open tab was ignored — exactly the staleness this
//        code exists to prevent. The fix consumes only the FIRST claim and
//        reloads on every subsequent controller change.
//   F3 — nothing bounded how long a stale page could live. A phone that resumes
//        an installed app without navigating fires no `load`, so no update check
//        ran at all; days of staleness were possible. Now resume and reconnect
//        both ask the registration to check.
//   F11 — the reload reset the audience filter to "all", silently changing the
//        clinical population the reader had selected. It is now carried across
//        an update reload only.
const AUDIENCE_HANDOFF = "antibiogram:audience-across-update";

if ("serviceWorker" in navigator) {
  // `true` once the page has a controller for the first time. Unlike a captured
  // boolean this tracks the transition, so only the initial claim is swallowed.
  let sawInitialClaim = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!sawInitialClaim) {
      // First SW of a brand-new install taking charge. Reloading here would be
      // a pointless extra load on every first visit.
      sawInitialClaim = true;
      return;
    }
    if (reloading) return;
    reloading = true;

    // Preserve the selected population across the forced reload. Scoped to this
    // handoff only — a manual reload still starts at the default — so the
    // update cannot silently move the reader to a different patient group.
    try {
      const audience = window.__antibiogramAudience;
      if (audience) sessionStorage.setItem(AUDIENCE_HANDOFF, audience);
    } catch {
      // sessionStorage can throw in private modes; losing the filter is
      // acceptable, failing to apply the update is not.
    }
    window.location.reload();
  });

  // Bound how stale an open or resumed page can get. registration.update() is
  // the portable way to force a check; calling register() again is not, since
  // Chromium and WebKit can both reuse an identical registration without
  // re-fetching the script.
  const checkForUpdate = () => {
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg && reg.update())
      .catch(() => {
        // Offline, or the check failed. The incumbent keeps serving; the next
        // resume or reconnect tries again.
      });
  };

  window.addEventListener("load", checkForUpdate);
  window.addEventListener("online", checkForUpdate);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkForUpdate();
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
