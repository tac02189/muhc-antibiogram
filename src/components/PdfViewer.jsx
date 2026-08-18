import { useEffect, useRef, lazy, Suspense } from "react";
import { ArrowLeft, Download, ExternalLink, RotateCw } from "lucide-react";
import PdfErrorBoundary from "./PdfErrorBoundary.jsx";

// The heavy pdf.js renderer is the lazy chunk. Keeping it out of this
// shell means the Back button, scroll lock, focus trap, and error
// fallback are available instantly and remain usable even if this chunk
// never loads.
const PdfCanvas = lazy(() => import("./PdfCanvas.jsx"));

/**
 * Full-screen in-app PDF viewer — the always-eager shell.
 *
 * Owns everything that must work regardless of the pdf.js chunk: the
 * floating Back button, body-scroll lock, Escape-to-close, focus
 * management, and the error boundary around the lazy renderer. Browser
 * history (device Back / swipe-back) is owned one level up in App, keyed
 * on the open/closed state, so it stays lifecycle-safe under StrictMode.
 */
export default function PdfViewer({ pdfHref, onClose }) {
  const containerRef = useRef(null);
  const backRef = useRef(null);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus management: move focus into the dialog on open, trap Tab within
  // it, and restore focus to the opener on close.
  useEffect(() => {
    const opener = document.activeElement;
    backRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focusables = containerRef.current?.querySelectorAll(
        'a[href], button:not([disabled])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const el = containerRef.current;
    el?.addEventListener("keydown", onKeyDown);
    return () => {
      el?.removeEventListener("keydown", onKeyDown);
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, []);

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
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-stone-300"
      role="dialog"
      aria-modal="true"
      aria-label="Antibiogram PDF viewer"
    >
      <PdfErrorBoundary
        fallback={
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-stone-700">
              Couldn't load the PDF viewer.
            </p>
            <p className="text-xs text-stone-500 max-w-xs">
              This can happen right after an app update or on a weak
              connection. Reloading usually fixes it.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 bg-mizzou-gold text-mizzou-black font-semibold text-sm rounded-full"
              >
                <RotateCw className="w-4 h-4" /> Reload app
              </button>
              <a
                href={pdfHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 bg-stone-900 text-mizzou-gold font-semibold text-sm rounded-full"
              >
                <ExternalLink className="w-4 h-4" /> Open in browser
              </a>
            </div>
          </div>
        }
      >
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-600">
              Loading PDF…
            </div>
          }
        >
          <PdfCanvas pdfHref={pdfHref} />
        </Suspense>
      </PdfErrorBoundary>

      {/* Floating Back FAB — fixed + high z-index so it always floats above
          the page canvases. 44px minimum touch target. */}
      <button
        ref={backRef}
        type="button"
        onClick={onClose}
        className="fixed z-[200] inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 bg-mizzou-gold text-mizzou-black font-semibold text-sm rounded-full shadow-xl ring-2 ring-mizzou-black hover:bg-yellow-300 transition-colors"
        style={fabTopLeft}
        aria-label="Back to app"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
        <span>Back</span>
      </button>

      {/* Top-right floating actions — 44px touch targets. */}
      <div className="fixed z-[200] flex gap-1.5" style={fabTopRight}>
        <a
          href={pdfHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center w-11 h-11 bg-stone-900 text-mizzou-gold rounded-full shadow-xl ring-2 ring-mizzou-black hover:bg-stone-700 transition-colors"
          aria-label="Open PDF in new tab"
          title="Open in new tab"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={pdfHref}
          download="MUHC-UH-Antibiogram-2026.pdf"
          className="inline-flex items-center justify-center w-11 h-11 bg-stone-900 text-mizzou-gold rounded-full shadow-xl ring-2 ring-mizzou-black hover:bg-stone-700 transition-colors"
          aria-label="Download PDF"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
