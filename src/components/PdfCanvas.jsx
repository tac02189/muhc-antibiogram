import { useState, useRef, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Tell pdf.js where to find its worker. Vite bundles the worker as a
// hashed static asset served from same origin with immutable caching —
// no CDN, so it works offline / on hospital wifi.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * The heavy pdf.js renderer — loaded as its own chunk via React.lazy from
 * the PdfViewer shell. Rasterizes each page to a canvas at fit-to-width,
 * stacked in a scrollable column. We render our own canvases (rather than
 * an <iframe>) because iOS Safari's native inline PDF viewer only shows
 * page 1 of a multi-page document with locked zoom.
 *
 * If this chunk fails to load, PdfErrorBoundary (in the shell) catches it.
 */
export default function PdfCanvas({ pdfHref }) {
  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef(null);

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
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={`page_${i + 1}`}
            pageNumber={i + 1}
            width={pageWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-lg bg-white"
            loading={
              <div
                className="bg-stone-200 animate-pulse rounded"
                style={{
                  width: pageWidth ? `${pageWidth}px` : "100%",
                  height: pageWidth ? `${pageWidth * 1.3}px` : "60vh",
                }}
              />
            }
          />
        ))}
      </Document>
    </div>
  );
}
