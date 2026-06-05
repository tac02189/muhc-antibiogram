import { useEffect } from "react";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";

/**
 * Full-screen in-app PDF viewer.
 *
 * The PDF iframe fills the viewport. The Back button is a floating
 * action button positioned ABOVE the iframe (z-[200], position: fixed)
 * so it stays visible regardless of how the browser renders the PDF —
 * iOS in particular often draws PDF chrome over iframe content, so
 * we can't rely on a normal flex header staying on top.
 *
 * Closes via: Back FAB · Escape key · device/browser back gesture.
 * Top-right has fallback "open in browser" and "download" controls.
 */
export default function PdfViewer({ pdfHref, onClose }) {
  useEffect(() => {
    // Lock body scroll while the viewer is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Escape closes (desktop)
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // Push a history entry so device back / swipe-back closes the viewer
    // instead of unloading the app.
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

  // safe-area-inset offsets so floating buttons clear the iOS notch
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
      className="fixed inset-0 z-[100] bg-mizzou-black"
      role="dialog"
      aria-modal="true"
      aria-label="Antibiogram PDF viewer"
    >
      {/* PDF surface — fills the viewport */}
      <iframe
        src={pdfHref}
        title="MUHC Antibiogram 2026 PDF"
        className="absolute inset-0 w-full h-full bg-stone-200 border-0"
      />

      {/* Back FAB — fixed-positioned, very high z-index so it floats above
          the iframe even if the browser draws PDF chrome on top of it. */}
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

      {/* Top-right fallback actions — open in browser / download */}
      <div
        className="fixed z-[200] flex gap-1.5"
        style={fabTopRight}
      >
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
