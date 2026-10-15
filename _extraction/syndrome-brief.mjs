// Prints a local-susceptibility brief for the six Empiric syndrome cards.
//
// WHY THIS EXISTS: syndromes.json is the one part of this app that is NOT
// derived from the PDF — it was scaffolded from the local antibiogram plus
// standard IDSA guidance and has never been clinically reviewed (see CLAUDE.md,
// "The Empiric tab is unreviewed draft content"). Reviewing it cold means
// cross-referencing four audiences of susceptibility data by hand for every
// drug in every card. This lays that data next to each card so the review is a
// confirm-or-override pass instead of a research project.
//
//   node syndrome-brief.mjs            # print
//   node syndrome-brief.mjs --md       # markdown, for pasting into a doc
//
// Read-only. It recommends nothing and changes nothing. Where a draft rationale
// quotes a percentage, it reports the figure actually in the data beside it —
// as a discrepancy to look at, NOT as a correction.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data");
const MD = process.argv.includes("--md");

const [antibiogram, antibiotics, syndromes] = await Promise.all(
  ["antibiogram.json", "antibiotics.json", "syndromes.json"].map(async (f) =>
    JSON.parse(await readFile(join(DATA, f), "utf8"))
  )
);

const AUDS = Object.keys(antibiogram.audiences);
const MIN_N = antibiogram.legend?.isolateMinimum ?? 30;
const orgById = new Map(antibiogram.organisms.map((o) => [o.id, o]));
const drugName = (slug) => antibiotics[slug]?.name ?? slug;

/**
 * %S for one organism+drug across audiences, as a compact string.
 *
 * Three absences, three symbols — they are NOT interchangeable, and collapsing
 * two of them onto "—" was a real defect (peer review, Low): "on panel but no
 * value" and "this organism is not reported in that setting at all" mean
 * different things to a reviewer.
 */
function acrossAudiences(org, slug) {
  if (!org) return "organism not found";
  return AUDS.map((a) => {
    const d = org.data?.[a];
    if (!d) return `${a} n/a`; // organism has no bucket for this setting
    const v = d.susceptibilities?.[slug];
    if (v === undefined) return `${a} ·`; // drug not on this panel
    if (v === null) return `${a} —`; // on panel, no value recorded
    // Nitrofurantoin is judged on its own tested count, as in the app.
    const n = /^nitrofurantoin(-urinary)?$/.test(slug) ? d.nitrofurantoinTested : d.isolateCount;
    const low = n != null && n < MIN_N ? "!" : "";
    return `${a} ${v}%${low}`;
  }).join("  ");
}

/**
 * Pull percentages a rationale claims as SUSCEPTIBILITY, so they can be
 * eyeballed against the data. Deliberately skips figures that are thresholds
 * or resistance rates rather than claims about this drug's %S — "avoid if
 * local resistance > 20%" is a rule, not an assertion that the data says 20,
 * and comparing it produced a false alarm.
 */
const claimedPcts = (text) => {
  const s = String(text || "");
  const out = [];
  // Ranges first, and BOTH endpoints. Matching only the digits that touch the
  // "%" took just the upper end of "~63–65%", so the lower bound of every
  // range a rationale quoted went unchecked (peer review, Medium). Covers the
  // en-dash the rationales actually use as well as a hyphen.
  const RANGE = /(\d{2,3})\s*[–-]\s*(\d{2,3})\s*%/g;
  const seen = [];
  for (const m of s.matchAll(RANGE)) {
    const before = s.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    if (/resistance|resistant|>|≥|<|≤/.test(before)) continue;
    out.push(Number(m[1]), Number(m[2]));
    seen.push([m.index, m.index + m[0].length]);
  }
  for (const m of s.matchAll(/(\d{2,3})\s*%/g)) {
    // Skip the "65%" half of a range already captured above.
    if (seen.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const before = s.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    if (/resistance|resistant|>|≥|<|≤/.test(before)) continue;
    out.push(Number(m[1]));
  }
  return [...new Set(out)];
};

const H = (s) => (MD ? `\n## ${s}\n` : `\n${"=".repeat(74)}\n${s}\n${"=".repeat(74)}`);
const SUB = (s) => (MD ? `\n**${s}**\n` : `\n-- ${s} --`);
const bullet = (s) => (MD ? `- ${s}` : `  ${s}`);

console.log(
  MD
    ? "# Syndrome review brief — local susceptibility\n\n> Generated from `src/data/`. Recommends nothing; the Empiric cards are unreviewed drafts.\n>\n> Legend: `!` = fewer than " +
        MIN_N +
        " isolates (below CLSI threshold, interpret with caution) · `·` = drug not on that panel · `—` = on panel, no value recorded · `n/a` = organism not reported in that setting.\n>\n> `CHECK` lines are a **pooled** heuristic: a quoted percentage is compared against every value for that drug across all of the card's organisms and settings at once. Its silence means nothing was 5 points away somewhere — **not** that the claim was validated."
    : `Syndrome review brief — local susceptibility\n` +
        `Legend: ! = n < ${MIN_N} (below CLSI threshold) · "·" = not on that panel · "—" = no value recorded · n/a = organism not reported in that setting\n` +
        `CHECK lines pool all organisms and settings; their silence is not validation.\n` +
        `Audiences: ${AUDS.join(", ")}`
);

const list = Array.isArray(syndromes) ? syndromes : Object.values(syndromes);

for (const syn of list) {
  console.log(H(`${syn.name}`));
  console.log(bullet(`Context:  ${syn.context || "—"}`));
  console.log(bullet(`Duration: ${syn.duration || "—"}`));
  // `notes` is part of the card the app renders, and the brief used to drop it
  // (peer review, Medium). A reviewer approving a card from an aid that omits
  // its own caveats — pregnancy redirection, ESBL escalation, pneumonia risk
  // adjustments — is approving something they were not shown.
  if (syn.notes) console.log(bullet(`Notes:    ${syn.notes}`));

  const linked = syn.relevantOrganisms || [];
  const orgs = linked.map((id) => orgById.get(id)).filter(Boolean);
  const missing = linked.filter((id) => !orgById.get(id));
  console.log(
    bullet(
      `Organisms: ${orgs.length ? orgs.map((o) => o.name).join(", ") : "(none linked)"}`
    )
  );
  // Previously dropped silently by .filter(Boolean), so a card could look
  // fully covered while one of its organisms resolved to nothing.
  if (missing.length) {
    console.log(bullet(`  ⚠ linked organism id(s) not found in antibiogram.json: ${missing.join(", ")}`));
  }

  for (const [section, label] of [
    ["firstLine", "FIRST LINE (draft)"],
    ["alternatives", "ALTERNATIVES (draft)"],
    ["avoid", "AVOID (draft)"],
  ]) {
    const entries = syn[section] || [];
    if (!entries.length) continue;
    console.log(SUB(label));
    for (const e of entries) {
      console.log(bullet(`${drugName(e.drug)}  [${e.drug}]${e.dose ? "  — " + e.dose : ""}`));
      const why = e.rationale || e.reason;
      if (why) console.log(`${MD ? "  - " : "      "}why: ${why}`);
      for (const org of orgs) {
        console.log(`${MD ? "  - " : "      "}${org.name}: ${acrossAudiences(org, e.drug)}`);
      }
      // Discrepancy hint, POOLED across this card's organisms and settings.
      // Pooling is deliberate — a rationale may legitimately quote a figure
      // for the syndrome's gram-negatives as a group ("~81–92%") rather than
      // for one organism — but it means a claim that matches the WRONG
      // organism still passes. Hence the legend's warning that silence here
      // is not validation, and the per-organism rows printed above, which are
      // the thing actually worth reading.
      const claims = claimedPcts(why);
      if (claims.length) {
        const actuals = orgs.flatMap((o) =>
          AUDS.map((a) => o.data?.[a]?.susceptibilities?.[e.drug]).filter(
            (v) => typeof v === "number"
          )
        );
        if (!actuals.length) {
          // Previously silent, which was indistinguishable from agreement.
          console.log(
            `${MD ? "  - " : "      "}CHECK: rationale quotes ${claims
              .map((c) => c + "%")
              .join(", ")}, but the data holds NO value for this drug against ` +
              `any of this card's organisms — nothing to compare it against.`
          );
        }
        const unmatched = claims.filter(
          (c) => actuals.length && !actuals.some((v) => Math.abs(v - c) <= 5)
        );
        if (unmatched.length) {
          console.log(
            `${MD ? "  - " : "      "}CHECK: rationale quotes ${unmatched
              .map((c) => c + "%")
              .join(", ")}; values in the data for this drug across this card's organisms are ${[
              ...new Set(actuals),
            ]
              .sort((a, b) => b - a)
              .join(", ")}`
          );
        }
      }
    }
  }

  // What the data supports, independent of the draft: every drug on panel for
  // each relevant organism, best first. This is the column to read when
  // deciding whether the draft picked the right agent.
  console.log(SUB("WHAT THE LOCAL DATA SHOWS (all drugs on panel, best first)"));
  for (const org of orgs) {
    const nAll = org.data?.all?.isolateCount;
    console.log(
      bullet(
        `${org.name}${nAll != null ? `  (n=${nAll}${nAll < MIN_N ? " !" : ""})` : ""}`
      )
    );
    const union = new Set();
    for (const a of AUDS) {
      for (const [slug, v] of Object.entries(org.data?.[a]?.susceptibilities || {})) {
        if (typeof v === "number" && !slug.startsWith("_")) union.add(slug);
      }
    }
    // Rank by the ALL-locations figure, not the max across audiences. Ranking
    // by max let a single low-n peds 100% hoist a mediocre drug to the top
    // (cefoxitin 83% all appeared above meropenem 100% all), which is exactly
    // backwards in a list labelled "best first". Drugs with no all-locations
    // value sort last, keeping their own order.
    const ranked = [...union]
      .map((slug) => {
        const all = org.data?.all?.susceptibilities?.[slug];
        return { slug, key: typeof all === "number" ? all : -1 };
      })
      .sort((a, b) => b.key - a.key);
    for (const { slug } of ranked) {
      console.log(
        `${MD ? "  - " : "      "}${String(drugName(slug)).padEnd(34)}${acrossAudiences(org, slug)}`
      );
    }
  }
}

console.log(
  MD
    ? "\n---\n\n**To review:** for each card, confirm or override the draft agents against the data above. Edits go in `_extraction/build-app-data.mjs` (which generates `syndromes.json`), not the JSON. The draft banner in `SyndromeView.jsx` stays until you say the cards are reviewed."
    : `\n${"=".repeat(74)}\nTo review: confirm or override each draft agent against the data above.\nEdits go in _extraction/build-app-data.mjs, which GENERATES syndromes.json.\nThe draft banner stays until you say the cards are reviewed.`
);
