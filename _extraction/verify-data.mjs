// Verify src/data/antibiogram.json against the source PDF.
//
// Run: node verify-data.mjs          (after extract.mjs — needs items.json + layout.txt)
// Exits 1 on any failure so it can gate the annual update.
//
// WHY THIS EXISTS
// ---------------
// parse-v2.mjs maps numbers to drugs using hand-typed per-page column
// x-coordinates (PAGE_TABLES). That design is deliberate and works, but it
// fails SILENTLY when a column shifts: every number still lands in some
// column, just the wrong one, and the output looks entirely plausible. A
// transposed susceptibility in a resident-facing tool is the worst defect this
// repo can ship, and nothing downstream would catch it. Re-running the
// pipeline does not help — same parser, same coordinates, same result — so
// verification has to come from outside that code path.
//
// DRIVEN FROM THE PDF, NOT FROM THE JSON
// --------------------------------------
// The first version of this file only ever inspected what the JSON *claimed*,
// never what the PDF *required*. An independent peer review (Codex
// gpt-6-astra, 2026-10-01) identified that; every case below was then
// confirmed BY RUNNING IT, and every one printed PASS:
//
//   * deleting a susceptibility key (MSSA all.oxacillin)
//   * inventing a drug with no column on that page (penicillin on E. coli p3)
//   * deleting a whole audience bucket
//   * deleting a whole organism
//   * `organisms: []` — an EMPTY dataset passed
//   * renaming an organism so no row matched, while corrupting one of its
//     values: reported "unverified" and still exited 0
//   * changing isolateCount to another number printed on the same row
//
// A verifier that green-lights an empty dataset is worse than none, because it
// manufactures confidence. So the inventory is now built from the PDF, every
// comparison runs in BOTH directions, and nothing fails open: an unmatched
// row, an unexpected key or a missing cell is a failure, not a note.
//
// WHAT THIS STILL DOES NOT DO
// ---------------------------
// It cannot tell you the PDF itself is right, and it is not the hand
// spot-check in CLAUDE.md's annual-update step 4. Passing means the extraction
// faithfully reproduces the PDF — nothing about whether the lab's numbers are
// correct. Nor does it validate the canonical drug-name map: parser and
// verifier share parse-v2's SLUG, so a mislabelled slug satisfies both
// (peer-review finding F7 — see CLAUDE.md).

import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const items = JSON.parse(await readFile(join(__dirname, "items.json"), "utf8"));
const layout = await readFile(join(__dirname, "layout.txt"), "utf8");

// Bind verification to the PDF the app actually serves.
//
// This verifier reads intermediates, not the PDF. Nothing used to prove those
// intermediates came from the current file, so replacing public/'s PDF while
// leaving last year's items.json and layout.txt in place let the old artifacts
// be compared to each other and report PASS — shipping last year's numbers
// beside this year's PDF (peer-review finding F6, 2026-10-01). extract.mjs now
// records the source filename and SHA-256 in source.json; re-hash and compare.
{
  let source;
  try {
    source = JSON.parse(await readFile(join(__dirname, "source.json"), "utf8"));
  } catch {
    console.error("source.json is missing — run `node extract.mjs` first so the");
    console.error("intermediates can be tied to the PDF being served.");
    process.exit(1);
  }
  const publicDir = join(ROOT, "public");
  const pdfs = (await readdir(publicDir)).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (pdfs.length !== 1) {
    console.error(`Expected exactly 1 PDF in public/, found ${pdfs.length}. Resolve before verifying.`);
    process.exit(1);
  }
  const actual = createHash("sha256").update(await readFile(join(publicDir, pdfs[0]))).digest("hex");
  if (pdfs[0] !== source.pdf || actual !== source.sha256) {
    console.error("STALE INTERMEDIATES — refusing to verify.");
    console.error(`  extracted from : ${source.pdf} (${source.sha256.slice(0, 16)}…)`);
    console.error(`  public/ holds  : ${pdfs[0]} (${actual.slice(0, 16)}…)`);
    console.error("Re-run the pipeline: node extract.mjs && node parse-v2.mjs && node build-app-data.mjs");
    process.exit(1);
  }
  console.log(`Source PDF : ${source.pdf} (sha256 ${source.sha256.slice(0, 12)}…, ${source.pages} pages)`);
}

// ANTIBIOGRAM_JSON overrides the file under test. It exists so this verifier
// can be pointed at a deliberately corrupted copy to prove it still fails — a
// check that cannot fail is worth nothing, and that is not observable from a
// passing run. See "Self-test" in CLAUDE.md's annual-update notes.
const DEFAULT_DATA = join(ROOT, "src", "data", "antibiogram.json");
const dataPath = process.env.ANTIBIOGRAM_JSON || DEFAULT_DATA;
const antibiogram = JSON.parse(await readFile(dataPath, "utf8"));

// Pull PAGE_TABLES and SLUG out of parse-v2.mjs rather than importing it: that
// file is a script with top-level side effects, and re-running it here would
// rewrite a pipeline intermediate as a side effect of verifying.
const parseSrc = await readFile(join(__dirname, "parse-v2.mjs"), "utf8");

function sliceLiteral(src, declaration) {
  const at = src.indexOf(declaration);
  if (at === -1) throw new Error(`Could not locate ${declaration} in parse-v2.mjs — did the parser change?`);
  if (src.indexOf(declaration, at + 1) !== -1) {
    throw new Error(`Found ${declaration} more than once in parse-v2.mjs — refusing to guess which is live.`);
  }
  const start = src.indexOf("{", at);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`${declaration} literal is unbalanced — refusing to guess.`);
}

const PAGE_TABLES = new Function(`return ${sliceLiteral(parseSrc, "const PAGE_TABLES = {")}`)();
const SLUG = new Function(`return ${sliceLiteral(parseSrc, "const SLUG = {")}`)();

const failures = [];

// Compare on letters+digits only: the PDF carries footnote markers (Rifampin^),
// line-wrap artifacts and "/" splits that are formatting, not identity.
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------------------------------------------------------------------------
// Check A — each column anchor matches the header the PDF prints at that x
// ---------------------------------------------------------------------------
//
// Header items are assigned to their NEAREST anchor using the same midpoint
// (Voronoi) partition parse-v2's snapValuesToColumns uses for values: if the
// anchors partition the header row into the labels the parser claims, they
// partition the data row the same way.
//
// Matching is on the item's LEFT ORIGIN (it.x) — the anchors were read off
// glyph origins, not centres ("Ampicillin" is x=325 w=39, anchor 325). Using
// centres shifts every column by one and reports a correct table as entirely
// mislabelled.

function observedHeadersByColumn(pageItems, columns, dataYStart) {
  const sorted = [...columns].sort((a, b) => a.x - b.x);
  const mids = sorted.map((c, i) => (i === 0 ? -Infinity : (sorted[i - 1].x + c.x) / 2));
  const nearest = (x) => {
    let best = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (x >= mids[i]) best = sorted[i];
      else break;
    }
    return best;
  };

  const zone = pageItems.filter(
    (it) => it.y < dataYStart && it.y >= dataYStart - 80 && it.str.trim().length > 0
  );

  const byColumn = new Map(sorted.map((c) => [c.x, []]));
  for (const it of zone) {
    const col = nearest(it.x);
    if (col) byColumn.get(col.x).push(it);
  }

  const out = new Map();
  for (const [x, list] of byColumn) {
    // Bottom-most line first: the PDF prints the final line of a wrapped
    // header lowest, nearest the data it labels.
    list.sort((a, b) => b.y - a.y || a.x - b.x);
    out.set(x, list.map((it) => it.str.trim()).join(" ").replace(/\s+/g, " ").trim() || null);
  }
  return out;
}

let anchorsChecked = 0;
for (const [pageNumStr, def] of Object.entries(PAGE_TABLES)) {
  const pageNum = Number(pageNumStr);
  const page = items.find((p) => p.page === pageNum);
  if (!page) {
    failures.push(`Check A — page ${pageNum} declared in PAGE_TABLES but absent from items.json`);
    continue;
  }

  // Duplicate anchors make the partition ambiguous and silently drop a column;
  // duplicate canonical slugs merge two drugs into one.
  const seenX = new Set();
  const seenSlug = new Map();
  for (const col of def.columns) {
    if (seenX.has(col.x)) failures.push(`Check A — p${pageNum}: duplicate anchor x=${col.x}`);
    seenX.add(col.x);
    const slug = SLUG[col.label];
    if (!slug) {
      failures.push(`Check A — p${pageNum} x=${col.x}: label "${col.label}" has no SLUG mapping`);
    } else if (seenSlug.has(slug)) {
      failures.push(
        `Check A — p${pageNum}: slug "${slug}" claimed by two columns (x=${seenSlug.get(slug)} and x=${col.x})`
      );
    } else {
      seenSlug.set(slug, col.x);
    }
  }

  const observedByColumn = observedHeadersByColumn(page.items, def.columns, def.dataYStart);
  for (const col of def.columns) {
    anchorsChecked++;
    const observed = observedByColumn.get(col.x);
    if (!observed) {
      failures.push(`Check A — p${pageNum} x=${col.x}: anchor lands on NO header text. Claimed "${col.label}".`);
      continue;
    }
    const o = norm(observed);
    const c = norm(col.label);
    // PREFIX agreement, not substring. The PDF legitimately prints a longer
    // qualifier than the parser's label ("Nitrofurantoin (urinary isolates
    // only)" vs "Nitrofurantoin (urinary)"), but a substring test also accepts
    // an anchor that has drifted onto a neighbouring header — claimed
    // "Penicillin (IV)" against observed "Penicillin Isolates (IV)" — which a
    // prefix test correctly rejects.
    if (!(o.startsWith(c) || c.startsWith(o))) {
      failures.push(`Check A — p${pageNum} x=${col.x}: claims "${col.label}" but PDF prints "${observed}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// PDF row inventory — built from the PDF, independent of the JSON
// ---------------------------------------------------------------------------
//
// layout.txt is "===== PAGE n =====" blocks of "y= NNN: text" lines, grouped
// into rows by extract.mjs independently of parse-v2's own clustering.

const pageLines = new Map();
{
  let current = null;
  for (const line of layout.split(/\r?\n/)) {
    const header = line.match(/^=+\s*PAGE\s+(\d+)\s*=+$/);
    if (header) {
      current = Number(header[1]);
      pageLines.set(current, []);
      continue;
    }
    const row = line.match(/^y=\s*(-?[\d.]+):\s?(.*)$/);
    if (row && current !== null) pageLines.get(current).push({ y: Number(row[1]), text: row[2] });
  }
}

// Rotated section-divider labels are glued onto names with no space
// ("NegativeKlebsiella oxytoca", "Gram PositiveEnterococcus spp. (all)").
const GROUP_LABEL = /^(gram)?(positive|negative)/;
const NAME_NOISE = /^(Gram|Positive|Negative|General|Notes:?)$/;

function cleanName(text) {
  return text
    .replace(/\d+(?:\.\d+)?/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "-" && !NAME_NOISE.test(w))
    .join(" ")
    .replace(/^(Gram\s*)?(Positive|Negative)/i, "")
    .trim();
}

// Enumerate the organism data rows the PDF actually prints on a page.
//
// The structure is: exactly ONE line of values per organism, with its name
// printed on that line, or above it, or split above AND below it. The third
// case is real — p2 prints "Streptococcus pneumoniae" / "13 77 - - 75 …" /
// "(blood/cerebrospinal fluid)*" across three lines, and the qualifier that
// distinguishes it from its sibling row arrives last.
//
// So: find the value-bearing lines first, then attach each name-only line to
// its NEAREST value line. Walking forward from name lines instead loses rows —
// consuming "Streptococcus pneumoniae" as part of the preceding non-sterile row
// dropped the blood/CSF row entirely (73 rows found where the PDF prints 75).
// parse-v2 requires >= 2 numeric cells to treat a row as data; same floor here.
function pdfRowsFor(pageNum, def) {
  const lines = (pageLines.get(pageNum) || []).filter(
    (l) => l.y >= def.dataYStart && l.y <= def.dataYEnd
  );

  const cellCount = (t) => (t.match(/(?:^|\s)(?:\d+(?:\.\d+)?|-)(?=\s|$)/g) || []).length;
  const valueLines = lines.filter((l) => cellCount(l.text) >= 2);
  if (valueLines.length === 0) return [];

  const attached = new Map(valueLines.map((l) => [l.y, [l]]));
  for (const line of lines) {
    if (attached.has(line.y)) continue; // it is itself a value line
    if (!/[A-Za-z]/.test(line.text)) continue;
    let nearest = null;
    for (const v of valueLines) {
      const d = Math.abs(v.y - line.y);
      if (d <= 16 && (nearest === null || d < Math.abs(nearest.y - line.y))) nearest = v;
    }
    if (nearest) attached.get(nearest.y).push(line);
  }

  const rows = [];
  for (const v of valueLines) {
    const group = attached.get(v.y).slice().sort((a, b) => a.y - b.y);
    const joined = group.map((r) => r.text).join(" ");
    const name = cleanName(joined);
    if (name.length < 5) continue;
    rows.push({
      pageNum,
      name,
      yFrom: group[0].y,
      yTo: group[group.length - 1].y,
      valueY: v.y,
      text: group.map((r) => r.text).join(" | "),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Checks B & C — bidirectional
// ---------------------------------------------------------------------------

// Merge adjacent digit glyph-runs into whole numbers, keeping the x of the
// first fragment — where the column anchor was read from. pdf.js emits "8","3"
// for 83 and "1","265" for 1265.
function mergeDigits(rowItems) {
  const sorted = [...rowItems].sort((a, b) => a.x - b.x);
  const out = [];
  let run = null;
  for (const it of sorted) {
    const s = it.str.trim();
    if (s === "") continue;
    if (/^\d+$/.test(s)) {
      const gap = run ? it.x - run.end : Infinity;
      if (run && gap < 2.5) {
        run.text += s;
        run.end = it.x + (it.width || 0);
      } else {
        if (run) out.push(run);
        run = { x: it.x, text: s, end: it.x + (it.width || 0) };
      }
      continue;
    }
    if (run) {
      out.push(run);
      run = null;
    }
    if (s === "-") out.push({ x: it.x, text: "-", end: it.x + (it.width || 0) });
  }
  if (run) out.push(run);
  return out;
}

function snapToColumn(x, columns) {
  const sorted = [...columns].sort((a, b) => a.x - b.x);
  const mids = sorted.map((c, i) => (i === 0 ? -Infinity : (sorted[i - 1].x + c.x) / 2));
  let best = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (x >= mids[i]) best = sorted[i];
    else break;
  }
  return Math.abs(x - best.x) > 50 ? null : best;
}

function tokensOf(name) {
  return name
    .replace(/[*^§]/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3 && t !== "spp");
}

let rowsMatched = 0;
let cellsChecked = 0;
let pdfRowCount = 0;

// An audience spans several pages — "all" is printed across three (gram
// positive, gram negative, fungal). So the forward match runs per page, but the
// claimed set and the reverse check are per AUDIENCE: asking "does this
// organism appear on page 2" flags every gram-negative organism as missing when
// it is simply on page 3.
const pagesByAudience = new Map();
for (const [pageNumStr, def] of Object.entries(PAGE_TABLES)) {
  if (!pagesByAudience.has(def.audience)) pagesByAudience.set(def.audience, []);
  pagesByAudience.get(def.audience).push({ pageNum: Number(pageNumStr), def });
}

for (const [audience, pages] of pagesByAudience) {
  const candidates = antibiogram.organisms
    .filter((o) => o.data && o.data[audience])
    .map((o) => ({ org: o, tokens: tokensOf(o.name) }));
  const claimedInAudience = new Map();

  for (const { pageNum, def } of pages) {
    const page = items.find((p) => p.page === pageNum);
    if (!page) continue;

    const pdfRows = pdfRowsFor(pageNum, def);
    pdfRowCount += pdfRows.length;

  // One-to-one assignment. A PDF row claims the JSON organism whose every
  // token appears in the row text, preferring the most specific (most tokens).
  // Each JSON organism can be claimed at most once per page. The previous
  // version instead picked "the shortest label", an unrelated heuristic that
  // could confidently select the wrong record.
    const claimed = new Map();
    for (const row of pdfRows) {
      const rowNorm = norm(row.text).replace(GROUP_LABEL, "");
      const fits = candidates
        .filter((c) => c.tokens.length > 0 && c.tokens.every((t) => rowNorm.includes(t)))
        .sort((a, b) => b.tokens.length - a.tokens.length);
      const available = fits.filter((c) => !claimedInAudience.has(c.org));
      if (available.length === 0) {
        failures.push(
          `Check B — p${pageNum} [${audience}]: PDF prints a data row with NO matching JSON organism: "${row.text.slice(0, 110)}"`
        );
        continue;
      }
      if (available.length > 1 && available[0].tokens.length === available[1].tokens.length) {
        failures.push(
          `Check B — p${pageNum} [${audience}]: row "${row.name}" matches ${available.length} organisms equally well (${available
            .slice(0, 3)
            .map((f) => f.org.name)
            .join(" / ")}) — ambiguous, refusing to guess`
        );
        continue;
      }
      claimed.set(available[0].org, row);
      claimedInAudience.set(available[0].org, row);
    }

  for (const [org, row] of claimed) {
    rowsMatched++;
    const bucket = org.data[audience];
    const committed = bucket.susceptibilities || {};

    const rowItems = page.items.filter(
      (it) => it.y >= row.yFrom - 2 && it.y <= row.yTo + 2 && it.x >= def.columns[0].x - 8
    );

    const fromPdf = {};
    for (const tok of mergeDigits(rowItems)) {
      const col = snapToColumn(tok.x, def.columns);
      if (!col) continue;
      const slug = SLUG[col.label];
      if (!slug) continue;
      if (fromPdf[slug] === undefined) fromPdf[slug] = tok.text;
    }

    // PDF -> JSON: every susceptibility column the PDF fills must be recorded.
    for (const [slug, pdfValue] of Object.entries(fromPdf)) {
      if (slug.startsWith("_")) continue; // counts handled below
      cellsChecked++;
      const has = slug in committed;
      const jsonValue = has ? committed[slug] : undefined;
      if (pdfValue === "-") {
        if (has && jsonValue !== null) {
          failures.push(
            `Check C — ${org.name} [${audience}] ${slug}: PDF p${pageNum} shows "-" (not tested) but JSON records ${jsonValue}`
          );
        }
      } else if (!has) {
        failures.push(
          `Check C — ${org.name} [${audience}] ${slug}: PDF p${pageNum} shows ${pdfValue} but the JSON has NO SUCH KEY — value dropped`
        );
      } else if (jsonValue === null) {
        failures.push(
          `Check C — ${org.name} [${audience}] ${slug}: PDF p${pageNum} shows ${pdfValue} but JSON records null — value DROPPED`
        );
      } else if (String(jsonValue) !== pdfValue) {
        failures.push(
          `Check C — ${org.name} [${audience}] ${slug}: PDF p${pageNum} column holds ${pdfValue}, JSON records ${jsonValue}`
        );
      }
    }

    // JSON -> PDF: a recorded value with no corresponding PDF cell was
    // invented. This is the direction the first version lacked entirely.
    for (const [slug, jsonValue] of Object.entries(committed)) {
      if (jsonValue === null) continue;
      if (slug in fromPdf) continue;
      const pageHasColumn = def.columns.some((c) => SLUG[c.label] === slug);
      cellsChecked++;
      failures.push(
        pageHasColumn
          ? `Check C — ${org.name} [${audience}] ${slug}=${jsonValue}: JSON records a value but the PDF p${pageNum} cell is empty`
          : `Check C — ${org.name} [${audience}] ${slug}=${jsonValue}: JSON records a value but PDF p${pageNum} has NO COLUMN for that drug — invented`
      );
    }

    // Counts, verified against their OWN columns rather than "is this number
    // anywhere on the row" — which accepted any other count printed on the
    // same row, and only warned.
    for (const [field, marker] of [
      ["isolateCount", "_isolates"],
      ["nitrofurantoinTested", "_n_nitrofurantoin"],
    ]) {
      if (!def.columns.some((c) => SLUG[c.label] === marker)) continue;
      cellsChecked++;
      const pdfValue = fromPdf[marker];
      const jsonValue = bucket[field];
      if (pdfValue === undefined || pdfValue === "-") {
        if (jsonValue != null) {
          failures.push(
            `Check C — ${org.name} [${audience}] ${field}: JSON records ${jsonValue} but PDF p${pageNum} column is empty`
          );
        }
      } else if (jsonValue == null) {
        failures.push(
          `Check C — ${org.name} [${audience}] ${field}: PDF p${pageNum} shows ${pdfValue} but JSON records ${jsonValue}`
        );
      } else if (String(jsonValue) !== pdfValue) {
        failures.push(
          `Check C — ${org.name} [${audience}] ${field}: PDF p${pageNum} column holds ${pdfValue}, JSON records ${jsonValue}`
        );
      }
    }
  }
  } // end page loop

  // Reverse direction, once every page of this audience has been matched: a
  // JSON bucket carrying data must correspond to a row the PDF actually prints
  // somewhere in this audience's tables. Without this, deleting an organism, a
  // bucket, a key — or supplying `organisms: []` — passed silently.
  for (const cand of candidates) {
    if (claimedInAudience.has(cand.org)) continue;
    const bucket = cand.org.data[audience];
    const recorded = Object.values(bucket.susceptibilities || {}).filter((v) => v !== null);
    if (recorded.length > 0 || bucket.isolateCount != null) {
      failures.push(
        `Check B — ${cand.org.name} [${audience}]: JSON records ${recorded.length} value(s) (n=${bucket.isolateCount}) but no PDF row in pages ${pages
          .map((p) => p.pageNum)
          .join("/")} matches it`
      );
    }
  }
}

// A run that checks almost nothing must not be able to print PASS. The first
// version returned 0 on `organisms: []`.
if (pdfRowCount < 60) {
  failures.push(
    `Sanity — only ${pdfRowCount} data rows found in the PDF; expected ~75. Extraction or layout.txt is wrong.`
  );
}
if (cellsChecked < 900) {
  failures.push(
    `Sanity — only ${cellsChecked} cells compared; expected ~1000+. Verification coverage collapsed.`
  );
}

// ---------------------------------------------------------------------------

console.log("Antibiogram data verification");
console.log("=============================");
console.log(`Source     : ${dataPath === DEFAULT_DATA ? "src/data/antibiogram.json" : dataPath}`);
console.log(`Check A — column anchors vs PDF headers : ${anchorsChecked} anchors across ${Object.keys(PAGE_TABLES).length} pages`);
console.log(`Check B — PDF rows <-> JSON organisms   : ${rowsMatched}/${pdfRowCount} PDF data rows matched one-to-one`);
console.log(`Check C — cells agree in both directions: ${cellsChecked} cells`);
console.log("");

if (failures.length) {
  console.log(`FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.log(`  x ${f}`);
  console.log("");
  console.log("Do not ship. Each failure means the extracted data and the PDF disagree.");
  process.exit(1);
}

console.log("PASS — every PDF data row and cell agrees with the JSON, in both directions.");
console.log("");
console.log("This does NOT verify the PDF's own numbers, does not validate the canonical");
console.log("drug-name map (parser and verifier share it), and does not replace the hand");
console.log("spot-check in CLAUDE.md's annual-update step 4.");
