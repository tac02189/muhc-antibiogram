// Extract text + positions from the antibiogram PDF.
// Groups text items into rows by y-coordinate, then writes:
//   - raw.txt           : per-page text in reading order
//   - layout.txt        : per-page text grouped into rows, columns separated by tabs
//   - items.json        : per-page raw items with x,y,width,height,str
//   - fills.json        : per-page filled shapes with x,y,w,h and fill colour
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
  // Tell pdfjs not to look for fonts/cmaps on disk: we need text positions
  // and the drawing instructions for filled shapes, never rendered glyphs.
  isEvalSupported: false,
  useSystemFonts: false,
});
const doc = await loadingTask.promise;

console.log(`Pages: ${doc.numPages}`);

// Filled shapes, read from the page's drawing instructions.
//
// The PDF marks intrinsic resistance by filling a table cell solid black and
// printing nothing in it (its legend: "▪ Organism exhibits intrinsic
// resistance to this drug"). A cell with no text is invisible to the text
// layer this script was built around, so until 2026-10-13 every one of those
// drugs vanished from the app — in neither the % list nor "Not tested". Record
// every filled box with its colour; parse-v2.mjs and verify-data.mjs decide,
// each with its own mapping rule, which ones are black table cells.
//
// Coordinates use the same convention as the text items: PDF user space,
// flipped to a top-left origin with `viewport.height - y`.
const { OPS } = pdfjs;
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
// pdf.js normalises every fill colour space to setFillRGBColor; depending on
// the version its argument is [r, g, b] (0-255) or a "#rrggbb" string.
const toRgb = (args) =>
  typeof args[0] === "string"
    ? [1, 3, 5].map((i) => parseInt(args[0].slice(i, i + 2), 16))
    : [args[0], args[1], args[2]].map(Number);

// Every painting operator that fills a path. The 2026 PDF uses only eoFill;
// the close-and-fill forms are here because a future PDF may draw its black
// cells with them, and an unhandled operator would drop those cells with no
// error anywhere (peer review, 2026-10-13).
const FILL_OPS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
// Painting this walker does NOT turn into boxes. Counted per page in
// fills.json; verify-data.mjs fails if a table page has any, because a black
// cell drawn as an image or a shading would be invisible to it.
const UNMODELLED_OPS = new Map(
  [
    "shadingFill",
    "paintImageXObject",
    "paintInlineImageXObject",
    "paintImageMaskXObject",
    "paintImageMaskXObjectGroup",
    "paintInlineImageXObjectGroup",
    "paintImageXObjectRepeat",
    "paintImageMaskXObjectRepeat",
    "paintSolidColorImageMask",
  ].map((name) => [OPS[name], name])
);
// Coordinates each path segment consumes in a constructPath argument list.
const SEGMENT_COORDS = new Map([
  [OPS.moveTo, 2],
  [OPS.lineTo, 2],
  [OPS.curveTo, 6],
  [OPS.curveTo2, 4],
  [OPS.curveTo3, 4],
  [OPS.closePath, 0],
  [OPS.rectangle, 4],
]);

// One user-space bounding box per subpath. pdf.js batches consecutive path
// operators into ONE constructPath, whose third argument is the union box of
// all of them — so "re re f" for two adjacent black cells would read as one
// wide box spanning both columns. Each rectangle, and each run of segments
// started by a moveTo, is its own box here.
function subpathBoxes([segments, coords]) {
  const boxes = [];
  let box = null;
  const open = () => (box = [Infinity, Infinity, -Infinity, -Infinity]);
  const add = (x, y) => {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  };
  const close = () => {
    if (box && box[0] <= box[2]) boxes.push(box);
    box = null;
  };
  let k = 0;
  for (const seg of segments) {
    const n = SEGMENT_COORDS.get(seg);
    if (n === undefined) throw new Error(`constructPath segment op ${seg} is not one filledBoxes() knows how to read`);
    const c = coords.slice(k, k + n);
    k += n;
    if (seg === OPS.rectangle) {
      close();
      open();
      add(c[0], c[1]);
      add(c[0] + c[2], c[1] + c[3]);
      close();
      continue;
    }
    if (seg === OPS.moveTo) close();
    if (!box) open();
    for (let j = 0; j < c.length; j += 2) add(c[j], c[j + 1]);
  }
  close();
  return boxes;
}

async function filledBoxes(page, viewport) {
  const { fnArray, argsArray } = await page.getOperatorList();
  const boxes = [];
  const unmodelled = {};
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  let rgb = [0, 0, 0];
  let alpha = 1; // fill opacity, from setGState "ca"
  let path = null;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (UNMODELLED_OPS.has(fn)) {
      const name = UNMODELLED_OPS.get(fn);
      unmodelled[name] = (unmodelled[name] || 0) + 1;
      continue;
    }
    if (FILL_OPS.has(fn)) {
      for (const [minX, minY, maxX, maxY] of path ? subpathBoxes(path) : []) {
        const corners = [
          [minX, minY],
          [maxX, minY],
          [minX, maxY],
          [maxX, maxY],
        ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        const box = {
          x: Math.min(...xs),
          y: viewport.height - Math.max(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        };
        // Hairlines (the 0.5pt table rules) are not cells; leave them out.
        if (box.w >= 4 && box.h >= 4) {
          boxes.push({
            x: +box.x.toFixed(2),
            y: +box.y.toFixed(2),
            w: +box.w.toFixed(2),
            h: +box.h.toFixed(2),
            rgb,
            alpha,
          });
        }
      }
      path = null;
      continue;
    }
    switch (fn) {
      case OPS.save:
        stack.push({ ctm, rgb, alpha });
        break;
      case OPS.restore:
        if (stack.length) ({ ctm, rgb, alpha } = stack.pop());
        break;
      case OPS.transform:
        ctm = multiply(ctm, args);
        break;
      case OPS.setFillRGBColor:
        rgb = toRgb(args);
        break;
      // args[0] is a list of [key, value] pairs; "ca" is the fill opacity. A
      // black box at zero opacity draws nothing and must not read as a cell.
      case OPS.setGState:
        for (const [key, value] of args?.[0] || []) if (key === "ca") alpha = Number(value);
        break;
      // A form XObject draws in its own space: its matrix applies until the
      // matching End, and the graphics state is restored after it. None of
      // the 2026 table pages use one.
      case OPS.paintFormXObjectBegin:
        stack.push({ ctm, rgb, alpha });
        if (Array.isArray(args[0]) && args[0].length === 6) ctm = multiply(ctm, args[0]);
        break;
      case OPS.paintFormXObjectEnd:
        if (stack.length) ({ ctm, rgb, alpha } = stack.pop());
        break;
      case OPS.constructPath:
        path = args;
        break;
      // Clipping paths are not modelled: a box is recorded at its full size
      // even if a clip hides part of it. The black cells were checked against
      // the rendered page instead (CLAUDE.md, "Intrinsic resistance").
      case OPS.endPath:
      case OPS.stroke:
      case OPS.closeStroke:
        path = null;
        break;
    }
  }
  return { boxes, unmodelled };
}

const rawLines = [];
const layoutLines = [];
const allItems = [];
const allFills = [];

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const viewport = page.getViewport({ scale: 1 });
  // Everything below — text and boxes alike — flips y with
  // `viewport.height - y`, which is only right for an unrotated page whose
  // box starts at the origin. Stop rather than misplace every coordinate.
  if (page.rotate !== 0 || page.view[0] !== 0 || page.view[1] !== 0) {
    throw new Error(
      `Page ${p} is rotated (${page.rotate}) or offset (view ${page.view.join(",")}); extract.mjs assumes neither.`
    );
  }
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
  const { boxes, unmodelled } = await filledBoxes(page, viewport);
  allFills.push({ page: p, viewport: { w: viewport.width, h: viewport.height }, fills: boxes, unmodelled });

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
await writeFile(join(__dirname, "fills.json"), JSON.stringify(allFills), "utf8");

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

console.log(`Wrote raw.txt, layout.txt, items.json, fills.json, source.json (sha256 ${sourceDigest.slice(0, 12)}…)`);
