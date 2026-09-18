// Parse antibiogram tables from items.json using x-coordinate alignment.
// Output: tables.json with structured organism × antibiotic susceptibility data.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const allItems = JSON.parse(await readFile(join(__dirname, "items.json"), "utf8"));

// Each tabular page has its own column layout. We auto-detect by:
//   1. Find the header band (the row containing antibiotic names like "Oxacillin", "Cefepime").
//   2. Take each header item's x as a column anchor.
//   3. For multi-line headers (e.g., "Cefotaxime/" + "ceftriaxone"), merge items
//      whose x-anchors are within COLUMN_X_TOLERANCE.

const ANTIBIOTIC_TOKENS = new Set([
  "Penicillin","Oxacillin","Ampicillin","Ampicillin/sulbactam","Piperacillin/tazobactam",
  "Cefazolin","Cefoxitin","Cefotaxime/","ceftriaxone","Ceftazidime","Cefepime","Meropenem",
  "Amikacin^","Amikacin","Gentamicin","Gentamicin synergy","Tobramycin","Clindamycin",
  "Erythromycin","Vancomycin","Rifampin^","Rifampin","Linezolid","Tetracycline","Minocycline",
  "Sulfamethoxazole/","trimethoprim","Levofloxacin","Ciprofloxacin","Nitrofurantoin",
  "Fluconazole","Voriconazole","Caspofungin","Micafungin",
  "(urinary","isolates","only)","(urin","ary","isolates only","tested","with","nitrofurantoin",
  "# Isolates tested","# Isolates","# of","of","Isolates","# of Isolates",
  "(IV)"
]);

const COLUMN_X_TOL = 25; // headers within this x-range are part of the same column

// Identify pages that are tabular susceptibility reports (pages 2-7).
const TABLE_PAGES = [2, 3, 4, 5, 6, 7];

// Manual header definitions — derived by inspecting items.json header bands.
// For each page, list column anchors (canonical antibiotic name + the x range
// where its values appear). Anchors come from the headers' x positions.
//
// We auto-extract the anchors below; this is just for sanity.

function clusterColumns(headerItems) {
  // Sort by x, merge items whose x's are within COLUMN_X_TOL.
  const sorted = [...headerItems].sort((a, b) => a.x - b.x);
  const clusters = [];
  for (const it of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(it.x - last.x) < COLUMN_X_TOL) {
      last.parts.push({ x: it.x, y: it.y, str: it.str });
      last.x = Math.min(last.x, it.x); // anchor stays at leftmost
    } else {
      clusters.push({ x: it.x, parts: [{ x: it.x, y: it.y, str: it.str }] });
    }
  }
  return clusters.map((c) => ({
    x: c.x,
    label: c.parts
      .sort((a, b) => a.y - b.y) // top to bottom
      .map((p) => p.str.trim())
      .join("")
      .replace(/\s+/g, " ")
      .trim(),
  }));
}

// Heuristic: header items are those with str matching antibiotic tokens
// OR sitting in the band immediately above the first data row.
function detectHeaderItems(items) {
  // Find items whose str hits an antibiotic token.
  const hits = items.filter((it) => {
    const s = it.str.trim();
    return ANTIBIOTIC_TOKENS.has(s);
  });
  if (hits.length === 0) return [];
  // Use those as the header band.
  return hits;
}

// Detect data rows: each row should have an organism name (long alphabetic
// string starting with a capital, often italic) and a sequence of numeric or
// "-" values. We cluster by y-tolerance.
function clusterRows(items, yTol = 4) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  let cur = null;
  for (const it of sorted) {
    if (!cur || Math.abs(it.y - cur.y) > yTol) {
      cur = { y: it.y, items: [] };
      rows.push(cur);
    }
    cur.items.push(it);
    cur.y = (cur.y + it.y) / 2;
  }
  return rows;
}

function isOrganismName(s) {
  // Organism name typically starts with a capitalized genus, often followed by species.
  // Examples: "Staphylococcus aureus (MSSA)", "Escherichia coli", "Enterococcus spp."
  return /^[A-Z][a-z]+( [a-z]+| spp\.| coagulase|\s*\([A-Za-z]+\))/.test(s.trim());
}

function isNumericCell(s) {
  const t = s.trim();
  return t === "-" || /^\d+(\.\d+)?$/.test(t) || /^\d{1,4}$/.test(t);
}

function parseValueRow(row, columnXs, isolateCountX) {
  // For each item with x > leftmost column, snap to nearest column.
  const cells = {}; // columnX → value string
  for (const it of row.items) {
    const t = it.str.trim();
    if (!isNumericCell(t)) continue;
    // Find nearest column anchor whose x is within ~25 pt.
    let nearest = null;
    let bestDist = Infinity;
    for (const colX of columnXs) {
      const d = Math.abs(it.x - colX);
      if (d < bestDist) { bestDist = d; nearest = colX; }
    }
    if (nearest !== null && bestDist <= 28) {
      // Only record first value per column (avoid double-counting).
      if (cells[nearest] === undefined) cells[nearest] = t;
    }
  }
  return cells;
}

function extractOrganismName(row) {
  // Organism name parts are alphabetic items at the left edge (x < 220ish).
  const parts = row.items
    .filter((it) => it.x < 220)
    .sort((a, b) => a.x - b.x)
    .map((it) => it.str.trim())
    .filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// Some rows span 2 y-lines (organism name wraps). Merge consecutive rows
// where the upper has an organism prefix and the lower has additional name
// text plus numbers.
function mergeWrappedRows(rows) {
  const merged = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = extractOrganismName(row);
    const hasNumbers = row.items.some((it) => /^\d+$/.test(it.str.trim()));
    if (!hasNumbers && i + 1 < rows.length) {
      // This row is name-only; merge with next.
      const next = rows[i + 1];
      merged.push({ y: next.y, items: [...row.items, ...next.items] });
      i++;
      continue;
    }
    merged.push(row);
  }
  return merged;
}

function parsePage(pageData) {
  const { page, items } = pageData;
  const headerItems = detectHeaderItems(items);
  if (headerItems.length === 0) return null;
  const columns = clusterColumns(headerItems);
  const columnXs = columns.map((c) => c.x);

  // Identify rows in the data band: y > headerMaxY + a bit, y < pageHeight - footer.
  const headerMaxY = Math.max(...headerItems.map((it) => it.y));
  const dataItems = items.filter((it) => it.y > headerMaxY + 5 && it.y < pageData.viewport.h - 20);
  let rows = clusterRows(dataItems, 4);
  rows = mergeWrappedRows(rows);

  const organisms = [];
  for (const row of rows) {
    const name = extractOrganismName(row);
    if (!isOrganismName(name)) continue;
    const cells = parseValueRow(row, columnXs);
    const numeric = Object.values(cells).filter((v) => v !== "-");
    if (numeric.length < 2) continue; // skip non-data rows like footnotes
    const isolateCount = cells[columnXs[0]] !== undefined && /^\d{2,4}$/.test(cells[columnXs[0]])
      ? cells[columnXs[0]]
      : undefined;
    organisms.push({
      name,
      raw: cells,
      isolateCount,
    });
  }

  return {
    page,
    columns,
    organisms,
  };
}

const result = {};
for (const pageNum of TABLE_PAGES) {
  const pageData = allItems.find((p) => p.page === pageNum);
  if (!pageData) continue;
  const parsed = parsePage(pageData);
  if (parsed) result[`page${pageNum}`] = parsed;
}

await writeFile(join(__dirname, "tables.json"), JSON.stringify(result, null, 2), "utf8");
console.log("Wrote tables.json");

// Sanity printout
for (const [key, table] of Object.entries(result)) {
  console.log(`\n=== ${key} ===`);
  console.log("Columns:", table.columns.map((c) => `${c.label}@x${c.x.toFixed(0)}`).join(" | "));
  console.log("Organisms:", table.organisms.length);
  for (const o of table.organisms.slice(0, 3)) {
    console.log(`  ${o.name} (n=${o.isolateCount})`);
    for (const col of table.columns) {
      const v = o.raw[col.x];
      if (v !== undefined && v !== "-") console.log(`    ${col.label}: ${v}`);
    }
  }
}
