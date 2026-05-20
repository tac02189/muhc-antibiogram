import { Download, Search, X } from "lucide-react";

const TABS = [
  { id: "organism", label: "Organism" },
  { id: "antibiotic", label: "Drug" },
  { id: "syndrome", label: "Empiric" },
  { id: "reference", label: "Reference" },
];

export default function Header({
  tab,
  setTab,
  search,
  setSearch,
  audience,
  setAudience,
  audiences,
  version,
  lastUpdated,
  pdfHref,
}) {
  return (
    <header className="sticky top-0 z-40 bg-mizzou-black text-stone-100 shadow-md">
      {/* Title bar */}
      <div className="px-3 sm:px-5 pt-3 pb-2 flex items-center gap-2 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-base sm:text-xl font-semibold text-mizzou-gold leading-tight">
            MUHC Antibiogram
          </h1>
          <p className="text-[10px] sm:text-xs text-stone-400 leading-tight mt-0.5">
            {version} · updated {lastUpdated}
          </p>
        </div>
        <a
          href={pdfHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium text-mizzou-gold hover:text-white border border-mizzou-gold/40 hover:border-mizzou-gold rounded transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Source PDF</span>
          <span className="sm:hidden">PDF</span>
        </a>
      </div>

      {/* Audience selector */}
      <div className="px-3 sm:px-5 pb-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        <span className="text-[10px] uppercase tracking-wider text-stone-500 mr-1 shrink-0">
          Setting:
        </span>
        {Object.entries(audiences).map(([id, info]) => (
          <button
            key={id}
            onClick={() => setAudience(id)}
            className={[
              "shrink-0 px-2.5 py-1 text-xs font-medium rounded-full transition-colors",
              audience === id
                ? "bg-mizzou-gold text-mizzou-black"
                : "bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-white",
            ].join(" ")}
            title={info.description}
          >
            {info.short}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 sm:px-5 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "organism" ? "Search organism (e.g., E. coli, MRSA)…"
              : tab === "antibiotic" ? "Search antibiotic (e.g., cefepime)…"
              : tab === "syndrome" ? "Search syndrome (e.g., UTI, pneumonia)…"
              : "Search reference…"}
            className="w-full pl-8 pr-8 py-2 text-sm bg-stone-800 text-white placeholder-stone-500 rounded-md border border-stone-700 focus:outline-none focus:border-mizzou-gold focus:ring-1 focus:ring-mizzou-gold"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-200"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <nav className="px-1.5 sm:px-3 flex border-t border-stone-800 bg-mizzou-ink overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "shrink-0 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-mizzou-gold text-mizzou-gold"
                : "border-transparent text-stone-400 hover:text-stone-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
