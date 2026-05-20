// Extract text + positions from the antibiogram PDF.
// Groups text items into rows by y-coordinate, then writes:
//   - raw.txt           : per-page text in reading order
//   - layout.txt        : per-page text grouped into rows, columns separated by tabs
//   - items.json        : per-page raw items with x,y,width,height,str
//
// Run: node extract.mjs

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH = join(__dirname, "..", "MUHC UH Antibiogram 2026.pdf");

// pdfjs-dist exposes a legacy build that works in plain Node.
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const data = await readFile(PDF_PATH);
const loadingTask = pdfjs.getDocument({
  data: new Uint8Array(data),
  // No worker in Node; run everything on the main thread.
  disableWorker: true,
  // Tell pdfjs not to look for fonts/cmaps on disk; we only need text.
  isEvalSupported: false,
  useSystemFonts: false,
});
const doc = await loadingTask.promise;

console.log(`Pages: ${doc.numPages}`);

const rawLines = [];
const layoutLines = [];
const allItems = [];

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  rawLines.push(`\n===== PAGE ${p} (w=${viewport.width.toFixed(0)} h=${viewport.height.toFixed(0)}) =====`);
  layoutLines.push(`\n===== PAGE ${p} =====`);

  // pdfjs gives each text run with a transform [a,b,c,d,e,f].
  // e = x, f = y (origin at bottom-left). width is item.width.
  // Convert to top-down y so rows sort naturally.
  const items = content.items
    .filter((it) => "str" in it && it.str.length > 0)
    .map((it) => {
      const [, , , , x, y] = it.transform;
      const top = viewport.height - y; // origin top-left
      return {
        str: it.str,
        x,
        y: top,
        width: it.width || 0,
        height: it.height || it.transform[3] || 0,
      };
    });

  allItems.push({ page: p, viewport: { w: viewport.width, h: viewport.height }, items });

  // Raw reading order
  rawLines.push(items.map((it) => it.str).join(" "));

  // Group items into rows by y (cluster within ~3 pt vertically).
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  let currentRow = [];
  let currentY = null;
  const Y_TOL = 3;
  for (const it of sorted) {
    if (currentY === null || Math.abs(it.y - currentY) <= Y_TOL) {
      currentRow.push(it);
      currentY = currentY === null ? it.y : (currentY + it.y) / 2;
    } else {
      rows.push({ y: currentY, items: currentRow });
      currentRow = [it];
      currentY = it.y;
    }
  }
  if (currentRow.length) rows.push({ y: currentY, items: currentRow });

  for (const row of rows) {
    const sortedRow = row.items.sort((a, b) => a.x - b.x);
    // Detect column gaps and insert tabs.
    const parts = [];
    let prevEnd = null;
    for (const it of sortedRow) {
      if (prevEnd !== null && it.x - prevEnd > 6) parts.push("\t");
      else if (prevEnd !== null && it.x - prevEnd > 1) parts.push(" ");
      parts.push(it.str);
      prevEnd = it.x + it.width;
    }
    layoutLines.push(`y=${row.y.toFixed(0).padStart(4)}: ${parts.join("")}`);
  }
}

await writeFile(join(__dirname, "raw.txt"), rawLines.join("\n"), "utf8");
await writeFile(join(__dirname, "layout.txt"), layoutLines.join("\n"), "utf8");
await writeFile(join(__dirname, "items.json"), JSON.stringify(allItems, null, 2), "utf8");

console.log("Wrote raw.txt, layout.txt, items.json");
