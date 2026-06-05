import { useEffect } from "react";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";

/**
 * Full-screen in-app PDF viewer.
 *
 * Renders the PDF inside an <iframe> with a top bar that holds a Back button
 * (closes the overlay), a download link, and an "open in browser" escape hatch
 * for platforms where inline PDF rendering is flaky (older iOS Safari).
 *
 * Behaviors:
 * - Escape key closes the overlay (desktop).
 * - Body scroll is locked while open so the underlying app doesn't scroll.
 * - A history entry is pushed on open so the device back button / swipe-back
 *   closes the overlay instead of leaving the app.
 */
export default function PdfViewer({ pdfHref, onClose }) {
  useEffect(() => {
    // Lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Escape to close
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // Push a history entry so the device back button closes the viewer
    // instead of unloading the app. popstate then triggers onClose.
    const stateMarker = { __pdfViewer: true };
    window.history.pushState(stateMarker, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      // If we close via the in-app button (not the back button), pop our
      // synthetic history entry so we don't leave a stale state behind.
      if (window.history.state && window.history.state.__pdfViewer) {
        window.history.back();
      }
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-mizzou-black flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Antibiogram PDF viewer"
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 px-2 sm:px-3 py-2 bg-mizzou-black text-stone-100 border-b border-stone-800 shrink-0">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-mizzou-gold hover:text-white rounded transition-colors"
          aria-label="Back to app"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <span className="flex-1 text-xs sm:text-sm font-medium truncate text-center text-stone-300">
          MUHC Antibiogram 2026
        </span>
        <a
          href={pdfHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-stone-300 hover:text-mizzou-gold rounded transition-colors"
          aria-label="Open PDF in new tab"
          title="Open in new tab"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={pdfHref}
          download="MUHC-UH-Antibiogram-2026.pdf"
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-stone-300 hover:text-mizzou-gold rounded transition-colors"
          aria-label="Download PDF"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>

      {/* PDF surface */}
      <iframe
        src={pdfHref}
        title="MUHC Antibiogram 2026 PDF"
        className="flex-1 w-full bg-stone-200 border-0"
      />
    </div>
  );
}
