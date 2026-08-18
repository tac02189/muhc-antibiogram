import { useState, useEffect, useMemo, useCallback } from "react";

import antibiogramData from "./data/antibiogram.json";
import antibioticsData from "./data/antibiotics.json";
import syndromesData from "./data/syndromes.json";
import supplementaryData from "./data/supplementary.json";

import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import OrganismView from "./components/OrganismView.jsx";
import AntibioticView from "./components/AntibioticView.jsx";
import SyndromeView from "./components/SyndromeView.jsx";
import ReferenceView from "./components/ReferenceView.jsx";
// The shell is eager (lightweight) so the Back button, scroll lock, and
// history handling are available instantly and stay mounted even if the
// heavy pdf.js chunk fails to load. The pdf.js renderer inside it
// (PdfCanvas) is the lazy-loaded chunk.
import PdfViewer from "./components/PdfViewer.jsx";

const PDF_HREF = `${import.meta.env.BASE_URL}MUHC-UH-Antibiogram-2026.pdf`;

export default function App() {
  const [tab, setTab] = useState("organism");
  const [audience, setAudience] = useState("all");
  const [search, setSearch] = useState("");
  const [pendingOrgId, setPendingOrgId] = useState(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  // Reset search when changing tabs (different meaning per tab).
  useEffect(() => setSearch(""), [tab]);

  // Stable close handler so effects that depend on it don't tear down and
  // rebuild on every render.
  const closePdf = useCallback(() => setPdfOpen(false), []);

  // Own the PDF overlay's browser-history entry HERE, keyed on the stable
  // `pdfOpen` boolean — not inside the viewer component. This makes it
  // lifecycle-safe: the effect runs exactly once when the overlay opens
  // and cleans up once when it closes, so there's no teardown/rebuild
  // race from changing callback identities, and StrictMode (which only
  // double-invokes effects on component *mount*, not on state changes)
  // doesn't thrash the history stack. The synthetic entry lets the device
  // Back button / iOS swipe-back dismiss the overlay instead of leaving
  // the app.
  useEffect(() => {
    if (!pdfOpen) return;
    window.history.pushState({ __pdfViewer: true }, "");
    const onPop = () => setPdfOpen(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Only unwind our own entry. If the user closed via Back/swipe the
      // browser already popped it (state is no longer ours) — so this
      // guard prevents a double-pop that would navigate the app away.
      if (window.history.state && window.history.state.__pdfViewer) {
        window.history.back();
      }
    };
  }, [pdfOpen]);

  // When a syndrome card requests an organism jump, switch tab + remember id.
  const jumpToOrganism = (id) => {
    setPendingOrgId(id);
    setSearch("");
    setTab("organism");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const audienceInfo = antibiogramData.audiences[audience];

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        tab={tab}
        setTab={setTab}
        search={search}
        setSearch={setSearch}
        audience={audience}
        setAudience={setAudience}
        audiences={antibiogramData.audiences}
        version={antibiogramData.version}
        lastUpdated={antibiogramData.lastUpdated}
        onOpenPdf={() => setPdfOpen(true)}
      />

      <main
        className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-5 py-4 sm:py-6"
        style={{
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        {tab === "organism" && (
          <OrganismView
            organisms={antibiogramData.organisms}
            antibiotics={antibioticsData}
            audience={audience}
            audienceInfo={audienceInfo}
            search={search}
            isolateMinimum={antibiogramData.legend.isolateMinimum}
            initialSelectedId={pendingOrgId}
            onConsumeInitialSelection={() => setPendingOrgId(null)}
          />
        )}
        {tab === "antibiotic" && (
          <AntibioticView
            antibiotics={antibioticsData}
            organisms={antibiogramData.organisms}
            audience={audience}
            audienceInfo={audienceInfo}
            search={search}
            isolateMinimum={antibiogramData.legend.isolateMinimum}
          />
        )}
        {tab === "syndrome" && (
          <SyndromeView
            syndromes={syndromesData}
            antibiotics={antibioticsData}
            organisms={antibiogramData.organisms}
            audience={audience}
            search={search}
            onJumpToOrganism={jumpToOrganism}
          />
        )}
        {tab === "reference" && (
          <ReferenceView
            supplementary={supplementaryData}
            search={search}
          />
        )}

        <SetupContext audienceInfo={audienceInfo} isolateMinimum={antibiogramData.legend.isolateMinimum} />
      </main>

      <Footer
        microPhone={antibiogramData.microLabPhone}
        infectionPhone={antibiogramData.infectionPreventionPhone}
        version={antibiogramData.version}
        lastUpdated={antibiogramData.lastUpdated}
        onOpenPdf={() => setPdfOpen(true)}
      />

      {pdfOpen && <PdfViewer pdfHref={PDF_HREF} onClose={closePdf} />}
    </div>
  );
}

// Small explanatory strip shown at the bottom of every tab — clarifies the
// current audience filter and CLSI low-n caveat so users don't have to dig.
function SetupContext({ audienceInfo, isolateMinimum }) {
  return (
    <aside className="mt-8 p-3 rounded-lg bg-stone-100 border border-stone-200 text-[11px] text-stone-600 leading-relaxed">
      <strong className="text-stone-800">{audienceInfo.name}.</strong>{" "}
      {audienceInfo.description}{" "}
      <span className="block mt-1 text-stone-500">
        Per CLSI: data for fewer than {isolateMinimum} isolates is not statistically significant.
        Such rows are marked <em>low n</em> — interpret with caution.
      </span>
    </aside>
  );
}
