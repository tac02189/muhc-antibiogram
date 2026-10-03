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

/** %S for one organism+drug across audiences, as a compact string. */
function acrossAudiences(org, slug) {
  if (!org) return "organism not found";
  return AUDS.map((a) => {
    const d = org.data?.[a];
    if (!d) return `${a} —`;
    const v = d.susceptibilities?.[slug];
    if (v === undefined) return `${a} ·`; // not on this panel
    if (v === null) return `${a} —`; // on panel, no value
    const low = d.isolateCount != null && d.isolateCount < MIN_N ? "!" : "";
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
  return [...s.matchAll(/(\d{2,3})\s*%/g)]
    .filter((m) => {
      const before = s.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
      return !/resistance|resistant|>|≥|<|≤/.test(before);
    })
    .map((m) => Number(m[1]));
};

const H = (s) => (MD ? `\n## ${s}\n` : `\n${"=".repeat(74)}\n${s}\n${"=".repeat(74)}`);
const SUB = (s) => (MD ? `\n**${s}**\n` : `\n-- ${s} --`);
const bullet = (s) => (MD ? `- ${s}` : `  ${s}`);

console.log(
  MD
    ? "# Syndrome review brief — local susceptibility\n\n> Generated from `src/data/`. Recommends nothing; the Empiric cards are unreviewed drafts.\n>\n> Legend: `!` = fewer than " +
        MIN_N +
        " isolates (below CLSI threshold, interpret with caution) · `·` = drug not on that panel · `—` = on panel, no value."
    : `Syndrome review brief — local susceptibility\n` +
        `Legend: ! = n < ${MIN_N} (below CLSI threshold) · "·" = not on that panel · "—" = no value\n` +
        `Audiences: ${AUDS.join(", ")}`
);

const list = Array.isArray(syndromes) ? syndromes : Object.values(syndromes);

for (const syn of list) {
  console.log(H(`${syn.name}`));
  console.log(bullet(`Context:  ${syn.context || "—"}`));
  console.log(bullet(`Duration: ${syn.duration || "—"}`));
  const orgs = (syn.relevantOrganisms || []).map((id) => orgById.get(id)).filter(Boolean);
  console.log(
    bullet(
      `Organisms: ${orgs.length ? orgs.map((o) => o.name).join(", ") : "(none linked)"}`
    )
  );

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
      // Discrepancy hint: a quoted percentage with no audience within 5 points.
      const claims = claimedPcts(why);
      if (claims.length) {
        const actuals = orgs.flatMap((o) =>
          AUDS.map((a) => o.data?.[a]?.susceptibilities?.[e.drug]).filter(
            (v) => typeof v === "number"
          )
        );
        const unmatched = claims.filter(
          (c) => actuals.length && !actuals.some((v) => Math.abs(v - c) <= 5)
        );
        if (unmatched.length) {
          console.log(
            `${MD ? "  - " : "      "}CHECK: rationale quotes ${unmatched
              .map((c) => c + "%")
              .join(", ")}; nearest values in the data for this drug are ${[
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
