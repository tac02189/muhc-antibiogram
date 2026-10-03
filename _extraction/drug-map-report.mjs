// Prints the drug-name map for human review.
//
// WHY THIS EXISTS: verify-data.mjs cannot validate drug IDENTITY. It checks
// that each column anchor sits under the header the PDF prints there, and that
// every cell matches — but the parser and the verifier read the SAME `SLUG`
// table out of parse-v2.mjs. Swap two slugs in that table and regenerate, and
// every automated check still passes while every number is attributed to the
// wrong drug (Codex finding F7). Closing that needs a human comparing the
// PDF's printed column headers against the name the app displays.
//
// This script lays the two ends side by side so that comparison is a short
// eyeball rather than an archaeology exercise. It asserts nothing clinical.
//
//   node drug-map-report.mjs
//
// Read-only: imports nothing from the pipeline and writes no files. It slices
// the SLUG literal out of parse-v2.mjs textually rather than importing it,
// because importing that script would re-run it and rewrite an intermediate
// as a side effect — the same reason verify-data.mjs slices instead of imports.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Slice a top-level `const NAME = { ... }` object literal out of JS source. */
function sliceLiteral(src, name) {
  const decl = new RegExp(`const\\s+${name}\\s*=\\s*\\{`);
  const m = decl.exec(src);
  if (!m) throw new Error(`could not find "const ${name} = {" in parse-v2.mjs`);
  if (decl.exec(src.slice(m.index + m[0].length))) {
    throw new Error(`"${name}" is declared more than once — slicing is ambiguous`);
  }
  const start = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces while slicing "${name}"`);
}

const parserSrc = await readFile(join(__dirname, "parse-v2.mjs"), "utf8");
const slugLiteral = sliceLiteral(parserSrc, "SLUG");

// Pull "label": "slug" pairs. Deliberately a regex over the sliced literal
// rather than eval of untrusted-shaped source.
const pairs = [...slugLiteral.matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g)]
  .map(([, label, slug]) => ({ label, slug }));

const antibiotics = JSON.parse(
  await readFile(join(__dirname, "..", "src", "data", "antibiotics.json"), "utf8")
);

const pad = (s, n) => String(s).padEnd(n);
const W1 = Math.max(...pairs.map((p) => p.label.length), 22) + 2;
const W2 = Math.max(...pairs.map((p) => p.slug.length), 10) + 2;

console.log("Drug-name map — PDF column header -> slug -> name the app displays");
console.log("=".repeat(W1 + W2 + 34));
console.log(`${pad("PDF HEADER (as matched)", W1)}${pad("SLUG", W2)}APP DISPLAYS`);
console.log("-".repeat(W1 + W2 + 34));

const problems = [];
// Group labels that share a slug so aliases are obvious rather than looking
// like duplicates.
const bySlug = new Map();
for (const p of pairs) {
  if (!bySlug.has(p.slug)) bySlug.set(p.slug, []);
  bySlug.get(p.slug).push(p.label);
}

// A leading underscore marks a bookkeeping column, not a drug: isolate counts
// and the nitrofurantoin denominator. These are expected to have no entry in
// antibiotics.json, so they must not be reported as problems — a report that
// cries wolf here invites a future session to "fix" it by inventing drug rows.
const isMetaColumn = (slug) => slug.startsWith("_");

for (const [slug, labels] of bySlug) {
  const meta = antibiotics[slug];
  const shown = meta
    ? meta.name
    : isMetaColumn(slug)
      ? "(not a drug — bookkeeping column)"
      : "** NO ENTRY in antibiotics.json **";
  if (!meta && !isMetaColumn(slug)) {
    problems.push(`slug "${slug}" has no entry in antibiotics.json`);
  }
  labels.forEach((label, i) => {
    console.log(`${pad(label, W1)}${pad(i === 0 ? slug : '  " (alias)', W2)}${i === 0 ? shown : ""}`);
  });
}

// Drugs the app can display but that no PDF header maps to. Not necessarily
// wrong — a drug may be described in antibiotics.json without appearing as a
// column — but worth seeing.
const mapped = new Set(pairs.map((p) => p.slug));
const unmapped = Object.keys(antibiotics).filter((s) => !mapped.has(s));

console.log("-".repeat(W1 + W2 + 34));
console.log(`${pairs.length} header labels -> ${bySlug.size} distinct drugs`);
if (unmapped.length) {
  console.log(`\n${unmapped.length} drug(s) in antibiotics.json with no PDF column header mapping:`);
  for (const s of unmapped) console.log(`  ${pad(s, W2)}${antibiotics[s].name}`);
}
if (problems.length) {
  console.log("\nPROBLEMS:");
  for (const p of problems) console.log(`  - ${p}`);
}

console.log(
  "\nTo review: for each row, confirm the drug the PDF prints in that column is\n" +
  "the drug named under APP DISPLAYS. This is the one thing verify-data.mjs\n" +
  "structurally cannot check, because it shares this map with the parser."
);
