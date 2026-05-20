import { useState, useEffect, useMemo } from "react";

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

const PDF_HREF = `${import.meta.env.BASE_URL}MUHC-UH-Antibiogram-2026.pdf`;

export default function App() {
  const [tab, setTab] = useState("organism");
  const [audience, setAudience] = useState("all");
  const [search, setSearch] = useState("");
  const [pendingOrgId, setPendingOrgId] = useState(null);

  // Reset search when changing tabs (different meaning per tab).
  useEffect(() => setSearch(""), [tab]);

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
        pdfHref={PDF_HREF}
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
        pdfHref={PDF_HREF}
      />
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
