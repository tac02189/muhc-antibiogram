import { useEffect, useState, useRef, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";

// Tell pdf.js where to find its worker. Vite hashes/bundles the worker
// as a static asset so it's served from same origin with immutable
// caching — no CDN needed (works on hospital wifi).
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Full-screen in-app PDF viewer.
 *
 * Renders the PDF using pdf.js (via react-pdf) into a vertically stacked
 * canvas column at fit-to-width. iOS Safari's native iframe PDF viewer
 * is broken for multi-page docs (shows only page 1, locked zoom), so we
 * rasterize ourselves to get reliable scrolling + pinch zoom on every
 * platform.
 *
 * Closes via: Back FAB · Escape key · device/browser back gesture.
 */
export default function PdfViewer({ pdfHref, onClose }) {
  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef(null);

  // Body scroll lock, Escape close, device-back close (push a history
  // entry so back gestures collapse the viewer instead of unloading
  // the app).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const stateMarker = { __pdfViewer: true };
    window.history.pushState(stateMarker, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      if (window.history.state && window.history.state.__pdfViewer) {
        window.history.back();
      }
    };
  }, [onClose]);

  // Track container width so pages render at fit-to-width. We cap at 900px
  // so on desktop the pages don't render absurdly large.
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
    // 16px horizontal padding budget for breathing room
    return Math.min(containerWidth - 16, 900);
  }, [containerWidth]);

  // Stable file prop — passing a new object on every render would make
  // react-pdf re-fetch the PDF, which is wasteful and causes flicker.
  const fileProp = useMemo(() => ({ url: pdfHref }), [pdfHref]);

  const fabTopLeft = {
    top: "max(0.5rem, env(safe-area-inset-top))",
    left: "max(0.5rem, env(safe-area-inset-left))",
  };
  const fabTopRight = {
    top: "max(0.5rem, env(safe-area-inset-top))",
    right: "max(0.5rem, env(safe-area-inset-right))",
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-stone-300"
      role="dialog"
      aria-modal="true"
      aria-label="Antibiogram PDF viewer"
    >
      {/* Scrollable page column */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto overscroll-contain"
        style={{
          // Leave room for the floating top bar
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

      {/* Floating Back FAB */}
      <button
        type="button"
        onClick={onClose}
        className="fixed z-[200] inline-flex items-center gap-1.5 px-3.5 py-2 bg-mizzou-gold text-mizzou-black font-semibold text-sm rounded-full shadow-xl ring-2 ring-mizzou-black hover:bg-yellow-300 transition-colors"
        style={fabTopLeft}
        aria-label="Back to app"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
        <span>Back</span>
      </button>

      {/* Top-right floating actions */}
      <div className="fixed z-[200] flex gap-1.5" style={fabTopRight}>
        <a
          href={pdfHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center w-9 h-9 bg-stone-900 text-mizzou-gold rounded-full shadow-xl ring-2 ring-mizzou-black hover:bg-stone-700 transition-colors"
          aria-label="Open PDF in new tab"
          title="Open in new tab"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={pdfHref}
          download="MUHC-UH-Antibiogram-2026.pdf"
          className="inline-flex items-center justify-center w-9 h-9 bg-stone-900 text-mizzou-gold rounded-full shadow-xl ring-2 ring-mizzou-black hover:bg-stone-700 transition-colors"
          aria-label="Download PDF"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
