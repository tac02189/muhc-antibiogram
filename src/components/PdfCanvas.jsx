import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Tell pdf.js where to find its worker. Vite bundles the worker as a
// hashed static asset served from same origin with immutable caching —
// no CDN, so it works offline / on hospital wifi.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

// US-Letter portrait aspect (11 / 8.5) — used to size a page's placeholder
// before its real dimensions are known, so the scroll height is roughly
// right from the start and doesn't lurch as pages render.
const LETTER_ASPECT = 11 / 8.5;

// Vertical gap between stacked pages (Tailwind gap-3 = 12px).
const PAGE_GAP = 12;

// How far beyond the viewport (top and bottom) a page is still rendered.
// Keeps a couple of pages of buffer for smooth scrolling while bounding
// how many heavy canvases exist at once — regardless of total page count.
const BUFFER_PX = 800;

/**
 * The heavy pdf.js renderer — loaded as its own chunk via React.lazy from
 * the PdfViewer shell. Rasterizes pages to canvases at fit-to-width,
 * stacked in a scrollable column. We render our own canvases (rather than
 * an <iframe>) because iOS Safari's native inline PDF viewer only shows
 * page 1 of a multi-page document with locked zoom.
 *
 * Pages are virtualized by scroll position: only pages within a buffer of
 * the viewport are mounted as real <Page> canvases; the rest hold their
 * space with lightweight, height-stable placeholders. This bounds canvas
 * memory (which scales with page count × device pixel ratio) so a long PDF
 * on a high-DPI phone doesn't exhaust memory and trigger a tab reload.
 *
 * We window on `scroll` events + cumulative page heights (rather than an
 * IntersectionObserver) so it stays correct even when the frame pipeline
 * is paused, and so the behavior is deterministically testable.
 *
 * If this chunk fails to load, PdfErrorBoundary (in the shell) catches it.
 */
export default function PdfCanvas({ pdfHref }) {
  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  // Contiguous window of pages to render as real canvases: [start, end).
  const [range, setRange] = useState({ start: 0, end: 3 });
  // Measured page heights (px) at the current width, so an unmounted page
  // reserves exactly the space its canvas occupied — no scroll jump.
  const [heights, setHeights] = useState({});

  const containerRef = useRef(null);
  const wrapperRefs = useRef([]);

  // Track container width so pages render at fit-to-width, capped at 900px
  // so desktop pages don't render absurdly large.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    return Math.min(containerWidth - 16, 900);
  }, [containerWidth]);

  const estHeight = pageWidth ? Math.round(pageWidth * LETTER_ASPECT) : 0;

  // Measured heights are width-specific; drop them when the width changes
  // (resize / rotation) so placeholders re-estimate and re-measure.
  useEffect(() => {
    setHeights({});
  }, [pageWidth]);

  // Cumulative top offset of each page, from per-page heights (measured
  // where known, estimated otherwise). Used to map scrollTop → page window.
  const tops = useMemo(() => {
    const out = new Array(numPages);
    let acc = 0;
    for (let i = 0; i < numPages; i++) {
      out[i] = acc;
      acc += (heights[i] ?? estHeight) + PAGE_GAP;
    }
    return out;
  }, [numPages, heights, estHeight]);

  // Recompute which contiguous page window is within BUFFER_PX of the
  // viewport, from the current scrollTop.
  const updateRange = useCallback(() => {
    const el = containerRef.current;
    if (!el || !numPages) return;
    const top = el.scrollTop - BUFFER_PX;
    const bottom = el.scrollTop + el.clientHeight + BUFFER_PX;
    let start = 0;
    while (start < numPages && tops[start] + (heights[start] ?? estHeight) < top) {
      start += 1;
    }
    let end = start;
    while (end < numPages && tops[end] <= bottom) {
      end += 1;
    }
    if (end <= start) end = Math.min(start + 1, numPages);
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [numPages, tops, heights, estHeight]);

  // Windowing: recompute on scroll and whenever inputs change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    updateRange();
    el.addEventListener("scroll", updateRange, { passive: true });
    return () => el.removeEventListener("scroll", updateRange);
  }, [updateRange]);

  const measure = useCallback((i) => {
    const canvas = wrapperRefs.current[i]?.querySelector("canvas");
    if (!canvas) return;
    const h = canvas.offsetHeight;
    if (h > 0) setHeights((prev) => (prev[i] === h ? prev : { ...prev, [i]: h }));
  }, []);

  // Stable file prop — a new object each render would re-fetch the PDF.
  const fileProp = useMemo(() => ({ url: pdfHref }), [pdfHref]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-auto overscroll-contain"
      style={{
        // Clear the floating top bar
        paddingTop: "calc(env(safe-area-inset-top) + 3.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <Document
        file={fileProp}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        loading={
          <div className="py-16 text-center text-sm text-stone-600">
            Loading PDF…
          </div>
        }
        error={
          <div className="py-16 px-6 text-center text-sm text-red-700">
            <p className="mb-2 font-medium">Couldn't render the PDF in-app.</p>
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 text-mizzou-gold-deep"
            >
              Open in browser instead
            </a>
          </div>
        }
        className="flex flex-col items-center gap-3"
      >
        {Array.from({ length: numPages }, (_, i) => {
          const h = heights[i] ?? estHeight;
          const inWindow = i >= range.start && i < range.end;
          return (
            <div
              key={`page_${i + 1}`}
              data-index={i}
              ref={(el) => (wrapperRefs.current[i] = el)}
              className="flex justify-center w-full"
              style={{ minHeight: h ? `${h}px` : undefined }}
            >
              {inWindow ? (
                <Page
                  pageNumber={i + 1}
                  width={pageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-lg bg-white"
                  onRenderSuccess={() => measure(i)}
                  loading={
                    <div
                      className="bg-stone-200 animate-pulse rounded"
                      style={{
                        width: pageWidth ? `${pageWidth}px` : "100%",
                        height: h ? `${h}px` : "60vh",
                      }}
                    />
                  }
                />
              ) : (
                // Height-stable spacer so scroll position doesn't shift when
                // an off-screen page's canvas is unmounted.
                <div
                  className="bg-stone-100 rounded"
                  style={{
                    width: pageWidth ? `${pageWidth}px` : "100%",
                    height: h ? `${h}px` : undefined,
                  }}
                />
              )}
            </div>
          );
        })}
      </Document>
    </div>
  );
}
