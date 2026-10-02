// Extract text + positions from the antibiogram PDF.
// Groups text items into rows by y-coordinate, then writes:
//   - raw.txt           : per-page text in reading order
//   - layout.txt        : per-page text grouped into rows, columns separated by tabs
//   - items.json        : per-page raw items with x,y,width,height,str
//
// Run: node extract.mjs

import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the SAME file the app serves, and DISCOVER it rather than hardcoding
// the year. This used to be a literal "../MUHC UH Antibiogram 2026.pdf" — a
// byte-identical duplicate of public/'s copy — which quietly broke the annual
// update: CLAUDE.md step 1 says to drop the new PDF into public/, so a 2027
// run would have re-extracted the 2026 file and emitted last year's numbers
// under this year's label, with no error anywhere.
//
// Globbing public/ removes this file from the annual checklist and, more
// importantly, converts the ambiguous cases into loud failures: zero PDFs or
// two PDFs both stop the run instead of silently picking one.
const PUBLIC_DIR = join(__dirname, "..", "public");
const pdfs = (await readdir(PUBLIC_DIR)).filter((f) => f.toLowerCase().endsWith(".pdf"));
if (pdfs.length !== 1) {
  throw new Error(
    `Expected exactly 1 PDF in public/, found ${pdfs.length}${pdfs.length ? `: ${pdfs.join(", ")}` : ""}. ` +
      `The extraction pipeline must read the same PDF the app serves — resolve this before extracting.`
  );
}
const PDF_PATH = join(PUBLIC_DIR, pdfs[0]);
console.log(`Source PDF: ${pdfs[0]}`);

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

// Record WHICH PDF produced these intermediates, by content hash.
//
// Without this nothing connects the intermediates to the file the app serves,
// so dropping in next year's PDF while leaving last year's items.json/layout.txt
// in place would let verify-data.mjs compare the old artifacts to each other and
// report PASS — shipping last year's numbers alongside this year's PDF
// (peer-review finding F6, 2026-10-01). verify-data.mjs re-hashes public/'s PDF
// and refuses to run if it does not match this.
const sourceDigest = createHash("sha256").update(data).digest("hex");
await writeFile(
  join(__dirname, "source.json"),
  JSON.stringify(
    { pdf: pdfs[0], sha256: sourceDigest, pages: doc.numPages, extractedAt: new Date().toISOString() },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(`Wrote raw.txt, layout.txt, items.json, source.json (sha256 ${sourceDigest.slice(0, 12)}…)`);
