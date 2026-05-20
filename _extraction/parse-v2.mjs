// Antibiogram parser v2 — uses manual column anchors per page for reliability.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const allItems = JSON.parse(await readFile(join(__dirname, "items.json"), "utf8"));

// Canonical antibiotic slug (used as JSON key — kebab-case, no special chars)
const SLUG = {
  "Penicillin": "penicillin",
  "Penicillin (IV)": "penicillin",
  "Oxacillin": "oxacillin",
  "Ampicillin": "ampicillin",
  "Ampicillin/sulbactam": "ampicillin-sulbactam",
  "Piperacillin/tazobactam": "piperacillin-tazobactam",
  "Cefazolin": "cefazolin",
  "Cefazolin (urinary)": "cefazolin",
  "Cefoxitin": "cefoxitin",
  "Cefotaxime/ceftriaxone": "ceftriaxone",
  "Ceftazidime": "ceftazidime",
  "Cefepime": "cefepime",
  "Meropenem": "meropenem",
  "Amikacin": "amikacin",
  "Gentamicin": "gentamicin",
  "Gentamicin synergy": "gentamicin-synergy",
  "Tobramycin": "tobramycin",
  "Clindamycin": "clindamycin",
  "Erythromycin": "erythromycin",
  "Vancomycin": "vancomycin",
  "Rifampin": "rifampin",
  "Linezolid": "linezolid",
  "Tetracycline": "tetracycline",
  "Minocycline": "minocycline",
  "Sulfamethoxazole/trimethoprim": "tmp-smx",
  "Levofloxacin": "levofloxacin",
  "Ciprofloxacin": "ciprofloxacin",
  "Nitrofurantoin": "nitrofurantoin",
  "Nitrofurantoin (urinary)": "nitrofurantoin",
  "# Isolates tested with nitrofurantoin": "_n_nitrofurantoin",
  "# of Isolates": "_isolates",
  "Fluconazole": "fluconazole",
  "Voriconazole": "voriconazole",
  "Caspofungin": "caspofungin",
  "Micafungin": "micafungin",
};

// Manual column definitions: [x, label] per page table.
// Derived from items.json inspection (see parse-tables.mjs output and follow-up).
const PAGE_TABLES = {
  // PAGE 2 — Gram Positive, All Locations
  2: {
    title: "Gram Positive — All Locations",
    audience: "all",
    columns: [
      { x: 222, label: "# of Isolates" },
      { x: 257, label: "Penicillin (IV)" },
      { x: 291, label: "Oxacillin" },
      { x: 325, label: "Ampicillin" },
      { x: 359, label: "Cefotaxime/ceftriaxone" },
      { x: 393, label: "Clindamycin" },
      { x: 426, label: "Erythromycin" },
      { x: 460, label: "Vancomycin" },
      { x: 494, label: "Rifampin" },
      { x: 528, label: "Linezolid" },
      { x: 562, label: "Tetracycline" },
      { x: 596, label: "Sulfamethoxazole/trimethoprim" },
      { x: 630, label: "Levofloxacin" },
      { x: 664, label: "Gentamicin synergy" },
      { x: 698, label: "Nitrofurantoin" },
      { x: 732, label: "# Isolates tested with nitrofurantoin" },
    ],
    dataYStart: 220,
    dataYEnd: 375,
  },
  // PAGE 3 — Gram Negative, All Locations
  3: {
    title: "Gram Negative — All Locations",
    audience: "all",
    columns: [
      { x: 187, label: "# of Isolates" },
      { x: 217, label: "Ampicillin" },
      { x: 248, label: "Ampicillin/sulbactam" },
      { x: 279, label: "Piperacillin/tazobactam" },
      { x: 310, label: "Cefazolin (urinary)" },
      { x: 340, label: "Cefoxitin" },
      { x: 371, label: "Cefotaxime/ceftriaxone" },
      { x: 402, label: "Ceftazidime" },
      { x: 433, label: "Cefepime" },
      { x: 463, label: "Meropenem" },
      { x: 494, label: "Amikacin" },
      { x: 525, label: "Gentamicin" },
      { x: 555, label: "Tobramycin" },
      { x: 586, label: "Minocycline" },
      { x: 617, label: "Sulfamethoxazole/trimethoprim" },
      { x: 647, label: "Ciprofloxacin" },
      { x: 678, label: "Levofloxacin" },
      { x: 709, label: "Nitrofurantoin (urinary)" },
      { x: 740, label: "# Isolates tested with nitrofurantoin" },
    ],
    dataYStart: 240,
    dataYEnd: 385,
  },
  // PAGE 4 — Emergency Department (combined gram +/-)
  4: {
    title: "Emergency Department",
    audience: "ed",
    columns: [
      { x: 235, label: "# of Isolates" },
      { x: 261, label: "Penicillin" },
      { x: 284, label: "Oxacillin" },
      { x: 307, label: "Ampicillin" },
      { x: 330, label: "Ampicillin/sulbactam" },
      { x: 353, label: "Piperacillin/tazobactam" },
      { x: 376, label: "Cefazolin (urinary)" },
      { x: 399, label: "Cefoxitin" },
      { x: 422, label: "Cefotaxime/ceftriaxone" },
      { x: 446, label: "Ceftazidime" },
      { x: 469, label: "Cefepime" },
      { x: 492, label: "Meropenem" },
      { x: 515, label: "Gentamicin" },
      { x: 538, label: "Tobramycin" },
      { x: 561, label: "Clindamycin" },
      { x: 586, label: "Erythromycin" },
      { x: 609, label: "Vancomycin" },
      { x: 630, label: "Tetracycline" },
      { x: 653, label: "Sulfamethoxazole/trimethoprim" },
      { x: 676, label: "Ciprofloxacin" },
      { x: 699, label: "Levofloxacin" },
      { x: 723, label: "Nitrofurantoin (urinary)" },
      { x: 746, label: "# Isolates tested with nitrofurantoin" },
    ],
    dataYStart: 250,
    dataYEnd: 495,
  },
  // PAGE 5 — ICU (combined gram +/-)
  5: {
    title: "Intensive Care Units",
    audience: "icu",
    columns: [
      { x: 203, label: "# of Isolates" },
      { x: 226, label: "Penicillin" },
      { x: 249, label: "Oxacillin" },
      { x: 272, label: "Ampicillin" },
      { x: 294, label: "Ampicillin/sulbactam" },
      { x: 317, label: "Piperacillin/tazobactam" },
      { x: 340, label: "Cefazolin (urinary)" },
      { x: 369, label: "Cefoxitin" },
      { x: 392, label: "Cefotaxime/ceftriaxone" },
      { x: 414, label: "Ceftazidime" },
      { x: 436, label: "Cefepime" },
      { x: 458, label: "Meropenem" },
      { x: 481, label: "Amikacin" },
      { x: 503, label: "Gentamicin" },
      { x: 525, label: "Tobramycin" },
      { x: 547, label: "Clindamycin" },
      { x: 569, label: "Vancomycin" },
      { x: 591, label: "Tetracycline" },
      { x: 613, label: "Minocycline" },
      { x: 638, label: "Sulfamethoxazole/trimethoprim" },
      { x: 667, label: "Ciprofloxacin" },
      { x: 690, label: "Levofloxacin" },
      { x: 712, label: "Nitrofurantoin (urinary)" },
      { x: 739, label: "# Isolates tested with nitrofurantoin" },
    ],
    dataYStart: 245,
    dataYEnd: 460,
  },
  // PAGE 6 — Fungal
  6: {
    title: "Fungal — All Locations",
    audience: "all",
    columns: [
      { x: 200, label: "# of Isolates" },
      { x: 226, label: "Fluconazole" },
      { x: 316, label: "Voriconazole" },
      { x: 406, label: "Caspofungin" },
      { x: 496, label: "Micafungin" },
    ],
    dataYStart: 225,
    dataYEnd: 300,
  },
  // PAGE 7 — Children's Hospital (combined gram +/-)
  7: {
    title: "Children's Hospital",
    audience: "peds",
    columns: [
      { x: 217, label: "# of Isolates" },
      { x: 238, label: "Penicillin" },
      { x: 256, label: "Oxacillin" },
      { x: 279, label: "Ampicillin" },
      { x: 301, label: "Ampicillin/sulbactam" },
      { x: 323, label: "Piperacillin/tazobactam" },
      { x: 346, label: "Cefazolin (urinary)" },
      { x: 368, label: "Cefoxitin" },
      { x: 390, label: "Cefotaxime/ceftriaxone" },
      { x: 412, label: "Ceftazidime" },
      { x: 435, label: "Cefepime" },
      { x: 457, label: "Meropenem" },
      { x: 479, label: "Gentamicin" },
      { x: 502, label: "Tobramycin" },
      { x: 524, label: "Clindamycin" },
      { x: 546, label: "Erythromycin" },
      { x: 569, label: "Vancomycin" },
      { x: 591, label: "Rifampin" },
      { x: 613, label: "Tetracycline" },
      { x: 636, label: "Minocycline" },
      { x: 658, label: "Sulfamethoxazole/trimethoprim" },
      { x: 680, label: "Ciprofloxacin" },
      { x: 702, label: "Levofloxacin" },
      { x: 725, label: "Nitrofurantoin (urinary)" },
      { x: 747, label: "# Isolates tested with nitrofurantoin" },
    ],
    dataYStart: 230,
    dataYEnd: 390,
  },
};

// Cluster items by y into rows (typical row height ~12pt).
function clusterRows(items, yTol = 4) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(it.y - last.y) <= yTol) {
      last.items.push(it);
      last.y = (last.y + it.y) / 2;
    } else {
      rows.push({ y: it.y, items: [it] });
    }
  }
  return rows;
}

// Merge adjacent items in a row whose x ranges are contiguous (≤ 2pt gap)
// and whose strings are digits — handles "73" rendered as "7"+"3".
function mergeContiguousDigits(row) {
  const sorted = [...row.items].sort((a, b) => a.x - b.x);
  const out = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      /^\d+$/.test(last.str.trim()) &&
      /^\d+$/.test(it.str.trim()) &&
      it.x - (last.x + last.width) < 2
    ) {
      last.str = last.str.trim() + it.str.trim();
      last.width = it.x + it.width - last.x;
    } else {
      out.push({ ...it });
    }
  }
  return { y: row.y, items: out };
}

function isDataRow(row, leftEdge) {
  const rightItems = row.items.filter((it) => it.x >= leftEdge);
  const numericRight = rightItems.filter((it) => /^(\d+|-)$/.test(it.str.trim()));
  return numericRight.length >= 3;
}

function hasNameText(row, leftEdge) {
  return row.items.some(
    (it) => it.x < leftEdge && /[A-Za-z]{3,}/.test(it.str.trim())
  );
}

// Merge:
//   (a) name-only row followed by data row → prepend name to data row
//   (b) data row followed by name-only continuation row(s) → append continuation
function mergeWrappedRows(rows, leftEdge = 220) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];

    // (a) If this row is name-only and the next row has data, merge into next.
    if (
      hasNameText(row, leftEdge) &&
      !isDataRow(row, leftEdge) &&
      i + 1 < rows.length &&
      isDataRow(rows[i + 1], leftEdge)
    ) {
      const next = rows[i + 1];
      row = { y: next.y, items: [...row.items, ...next.items] };
      i++;
    }

    // (b) If this row is a data row, pull in any following name-only continuation
    // rows whose y-gap from the data row is < 12pt.
    if (isDataRow(row, leftEdge)) {
      while (
        i + 1 < rows.length &&
        hasNameText(rows[i + 1], leftEdge) &&
        !isDataRow(rows[i + 1], leftEdge) &&
        Math.abs(rows[i + 1].y - row.y) < 12
      ) {
        row = { y: row.y, items: [...row.items, ...rows[i + 1].items] };
        i++;
      }
    }

    out.push(row);
  }
  return out;
}

// Group label artifacts (rotated sideways labels for "Gram Positive" / "Gram Negative"
// section dividers, occasionally fragmented). Case-sensitive: organism names contain
// lowercase "negative" (e.g., "coagulase negative") which must NOT be filtered.
const NAME_NOISE = /^(Gram|Positive|Negative|Gram\s*Positive|Gram\s*Negative|Positiv|Negativ|General|Notes:?)$/;

function extractName(row, leftEdge = 220) {
  // Exclude items that are pure digits (those are isolate counts that landed
  // just before the leftEdge cutoff after digit-merge).
  const left = row.items
    .filter((it) => {
      const s = it.str.trim();
      if (it.x >= leftEdge) return false;
      if (s.length === 0) return false;
      if (/^\d+(\.\d+)?$/.test(s)) return false; // strip stray numerics
      if (NAME_NOISE.test(s)) return false; // strip group/footer labels
      return true;
    })
    // Sort by y first (top to bottom), then x within the same line.
    // This preserves multi-line reading order ("Staphylococcus coagulase"
    // on line 1 → "negative (CONS)" on line 2).
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  // Join with spaces. Within a line, words are ~2pt apart and the same word
  // has 0pt gap, so use 1.5pt as the within-line word-break threshold.
  // When crossing lines (y changes), always insert a space.
  let parts = [];
  let prevEnd = -Infinity;
  let prevY = null;
  for (const it of left) {
    const s = it.str.trim();
    const sameLine = prevY !== null && Math.abs(it.y - prevY) < 5;
    if (parts.length > 0) {
      if (!sameLine) parts.push(" ");
      else if (it.x - prevEnd > 1.5) parts.push(" ");
    }
    parts.push(s);
    prevEnd = it.x + it.width;
    prevY = it.y;
  }
  return parts.join("").replace(/\s+/g, " ").trim()
    .replace(/\s*\(\s*/g, " (").replace(/\s*\)/g, ")");
}

function snapValuesToColumns(row, columns, leftEdge = 220) {
  // Use midpoint boundaries between consecutive column anchors so a value
  // falls into the column whose anchor it's nearest in a Voronoi sense.
  const sortedCols = [...columns].sort((a, b) => a.x - b.x);
  const boundaries = sortedCols.map((c, i) => {
    if (i === 0) return -Infinity;
    return (sortedCols[i - 1].x + c.x) / 2;
  });
  // Append upper bound = +Infinity implicitly.

  function findCol(x) {
    let last = sortedCols[0];
    for (let i = 1; i < sortedCols.length; i++) {
      if (x >= boundaries[i]) last = sortedCols[i];
      else break;
    }
    return last;
  }

  const cells = {};
  const rightItems = row.items
    .filter((it) => it.x >= leftEdge && /^(\d+(\.\d+)?|-)$/.test(it.str.trim()))
    .sort((a, b) => a.x - b.x);

  for (const it of rightItems) {
    const t = it.str.trim();
    const col = findCol(it.x);
    if (!col) continue;
    // Sanity: data must be within a reasonable distance of column anchor
    // (column widths in this PDF are 20-90 pt, so anything within 50 of anchor is fine).
    if (Math.abs(it.x - col.x) > 50) continue;
    if (cells[col.label] === undefined) cells[col.label] = t;
  }
  return cells;
}

function isOrganismName(name) {
  return /^[A-Z][a-z]+/.test(name) && name.length > 4;
}

const tables = {};

for (const [pageNumStr, def] of Object.entries(PAGE_TABLES)) {
  const pageNum = Number(pageNumStr);
  const pageData = allItems.find((p) => p.page === pageNum);
  if (!pageData) continue;

  const dataItems = pageData.items.filter(
    (it) => it.y >= def.dataYStart && it.y <= def.dataYEnd
  );
  const leftEdge = def.columns[0].x - 8;
  let rows = clusterRows(dataItems, 4);
  rows = rows.map(mergeContiguousDigits);
  rows = mergeWrappedRows(rows, leftEdge);
  const organisms = [];

  for (const row of rows) {
    const name = extractName(row, leftEdge);
    if (!isOrganismName(name)) continue;
    const cells = snapValuesToColumns(row, def.columns, leftEdge);
    const numericCount = Object.values(cells).filter((v) => v !== "-").length;
    if (numericCount < 2) continue;

    // Extract isolate count separately
    const isolatesLabel = def.columns[0].label;
    const isolateCount = cells[isolatesLabel];

    // Build slug-keyed susceptibilities (skip "# of Isolates" and "# tested w/nitro")
    const susceptibilities = {};
    for (const col of def.columns) {
      const v = cells[col.label];
      if (v === undefined) continue;
      const slug = SLUG[col.label] || col.label.toLowerCase();
      if (slug === "_isolates" || slug === "_n_nitrofurantoin") continue;
      if (v === "-") {
        susceptibilities[slug] = null; // not tested / not indicated
      } else {
        const n = Number(v);
        if (!Number.isNaN(n)) susceptibilities[slug] = n;
      }
    }

    organisms.push({
      name,
      isolateCount: isolateCount ? Number(isolateCount) : null,
      susceptibilities,
      nitrofurantoinTested: cells["# Isolates tested with nitrofurantoin"]
        ? Number(cells["# Isolates tested with nitrofurantoin"])
        : null,
    });
  }

  tables[`page${pageNum}`] = {
    title: def.title,
    audience: def.audience,
    organisms,
  };
}

await writeFile(join(__dirname, "tables-v2.json"), JSON.stringify(tables, null, 2), "utf8");
console.log("Wrote tables-v2.json");

for (const [key, t] of Object.entries(tables)) {
  console.log(`\n=== ${key}: ${t.title} (${t.organisms.length} organisms) ===`);
  for (const o of t.organisms) {
    const sus = Object.entries(o.susceptibilities)
      .filter(([k, v]) => v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(`  ${o.name} (n=${o.isolateCount}) ${sus}`);
  }
}
