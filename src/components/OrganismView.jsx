import { useMemo, useState, useEffect } from "react";
import { ChevronRight, ArrowLeft, AlertCircle, Beaker } from "lucide-react";
import SusceptibilityChip, { bandFor } from "./SusceptibilityChip.jsx";

const GRAM_LABEL = {
  positive: { label: "Gram +", className: "bg-purple-100 text-purple-800" },
  negative: { label: "Gram −", className: "bg-pink-100 text-pink-800" },
  fungus:   { label: "Fungus", className: "bg-amber-100 text-amber-800" },
  unknown:  { label: "—",      className: "bg-stone-100 text-stone-600" },
};

function organismMatches(o, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = (o.name + " " + o.id + " " + o.gramStain).toLowerCase();
  return hay.includes(needle);
}

export default function OrganismView({
  organisms,
  antibiotics,
  audience,
  audienceInfo,
  search,
  isolateMinimum,
  initialSelectedId,
  onConsumeInitialSelection,
}) {
  const [selectedId, setSelectedId] = useState(null);

  // Honor an external request to open a specific organism (from SyndromeView).
  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
      onConsumeInitialSelection?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId]);

  const filtered = useMemo(() => {
    return organisms
      .filter((o) => organismMatches(o, search))
      .filter((o) => o.data[audience]); // only show orgs with data for this audience
  }, [organisms, search, audience]);

  const selected = useMemo(
    () => organisms.find((o) => o.id === selectedId) || null,
    [organisms, selectedId]
  );

  // On wide screens, default to the first filtered organism if nothing selected.
  const showList = !selected || window.innerWidth >= 768;
  const showDetail = !!selected;

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-6">
      {/* LIST */}
      <div className={selected ? "hidden md:block" : "block"}>
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2 px-1">
          {filtered.length} organism{filtered.length === 1 ? "" : "s"} · {audienceInfo.short}
        </h2>
        <ul className="space-y-1.5">
          {filtered.map((o) => {
            const d = o.data[audience];
            const gram = GRAM_LABEL[o.gramStain] || GRAM_LABEL.unknown;
            const lowN = d.isolateCount != null && d.isolateCount < isolateMinimum;
            return (
              <li key={o.id}>
                <button
                  onClick={() => setSelectedId(o.id)}
                  className={[
                    "w-full text-left px-3 py-2.5 rounded-lg bg-white border transition-all flex items-center gap-3 group",
                    selectedId === o.id
                      ? "border-mizzou-gold ring-1 ring-mizzou-gold"
                      : "border-stone-200 hover:border-stone-300 hover:shadow-sm",
                  ].join(" ")}
                >
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${gram.className}`}>
                    {gram.label}
                  </span>
                  <span className="flex-1 min-w-0">
                    <div className="font-medium text-stone-900 truncate italic">{o.name}</div>
                    <div className="text-xs text-stone-500 flex items-center gap-2 mt-0.5">
                      <span>n = {d.isolateCount ?? "?"}</span>
                      {lowN && (
                        <span className="text-amber-600 inline-flex items-center gap-0.5">
                          <AlertCircle className="w-3 h-3" /> low n
                        </span>
                      )}
                    </div>
                  </span>
                  <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 shrink-0" />
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="text-sm text-stone-500 py-8 text-center">
              No organisms match your search in this setting.
            </li>
          )}
        </ul>
      </div>

      {/* DETAIL */}
      {selected && (
        <OrganismDetail
          organism={selected}
          audience={audience}
          audienceInfo={audienceInfo}
          antibiotics={antibiotics}
          isolateMinimum={isolateMinimum}
          onBack={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function OrganismDetail({ organism, audience, audienceInfo, antibiotics, isolateMinimum, onBack }) {
  const d = organism.data[audience];
  const gram = GRAM_LABEL[organism.gramStain] || GRAM_LABEL.unknown;
  const lowN = d.isolateCount != null && d.isolateCount < isolateMinimum;

  // Sort drugs: tested first (descending %S), then null at bottom
  const drugs = useMemo(() => {
    return Object.entries(d.susceptibilities)
      .map(([slug, value]) => ({
        slug,
        value,
        meta: antibiotics[slug] || { name: slug, class: "other", routes: [] },
      }))
      .sort((a, b) => {
        if (a.value == null && b.value == null) return a.meta.name.localeCompare(b.meta.name);
        if (a.value == null) return 1;
        if (b.value == null) return -1;
        return b.value - a.value;
      });
  }, [d, antibiotics]);

  const tested = drugs.filter((dr) => dr.value != null);
  const untested = drugs.filter((dr) => dr.value == null);

  return (
    <div className="mt-4 md:mt-0">
      <div className="md:sticky md:top-[8.5rem]">
        {/* Back button on mobile only */}
        <button
          onClick={onBack}
          className="md:hidden inline-flex items-center gap-1 text-sm text-stone-600 mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> All organisms
        </button>

        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
          {/* Header strip */}
          <div className="px-4 py-3 bg-gradient-to-br from-mizzou-black to-stone-800 text-stone-100">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gram.className}`}>
                {gram.label}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-stone-400">
                {audienceInfo.short}
              </span>
            </div>
            <h2 className="font-display text-xl font-semibold italic text-mizzou-gold">{organism.name}</h2>
            <div className="text-xs text-stone-300 mt-1 flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Beaker className="w-3.5 h-3.5" /> n = {d.isolateCount ?? "?"} isolates
              </span>
              {lowN && (
                <span className="text-amber-300 inline-flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> below CLSI threshold ({isolateMinimum})
                </span>
              )}
            </div>
          </div>

          {/* Drug grid */}
          <div className="divide-y divide-stone-100">
            {tested.length > 0 && (
              <div className="px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
                  % Susceptible — sorted high → low
                </div>
                <ul className="space-y-1.5">
                  {tested.map((dr) => (
                    <li key={dr.slug} className="flex items-center gap-3 py-1">
                      <SusceptibilityChip value={dr.value} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-900 truncate">{dr.meta.name}</div>
                        <div className="text-[11px] text-stone-500">
                          {dr.meta.class}
                          {dr.meta.routes?.length ? ` · ${dr.meta.routes.join("/")}` : ""}
                        </div>
                      </div>
                      {dr.meta.notes && (
                        <span
                          title={dr.meta.notes}
                          className="shrink-0 text-amber-600 cursor-help"
                          aria-label={dr.meta.notes}
                        >
                          <AlertCircle className="w-4 h-4" />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {untested.length > 0 && (
              <details className="px-4 py-3 group">
                <summary className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 cursor-pointer select-none">
                  Not tested ({untested.length}) — click to expand
                </summary>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-500">
                  {untested.map((dr) => (
                    <li key={dr.slug} className="truncate" title={dr.meta.notes || ""}>
                      {dr.meta.name}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
