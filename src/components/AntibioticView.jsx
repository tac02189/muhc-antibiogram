import { useMemo, useState } from "react";
import { ChevronRight, ArrowLeft, AlertCircle, Pill } from "lucide-react";
import SusceptibilityChip, { bandFor } from "./SusceptibilityChip.jsx";

const GRAM_LABEL = {
  positive: { label: "Gram +", className: "bg-purple-100 text-purple-800" },
  negative: { label: "Gram −", className: "bg-pink-100 text-pink-800" },
  fungus:   { label: "Fungus", className: "bg-amber-100 text-amber-800" },
  unknown:  { label: "—",      className: "bg-stone-100 text-stone-600" },
};

function drugMatches(slug, meta, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = `${meta.name} ${slug} ${meta.class}`.toLowerCase();
  return hay.includes(needle);
}

export default function AntibioticView({ antibiotics, organisms, audience, audienceInfo, search, isolateMinimum }) {
  const [selectedSlug, setSelectedSlug] = useState(null);

  // Group drugs by class for the list
  const grouped = useMemo(() => {
    const entries = Object.entries(antibiotics)
      .filter(([slug, meta]) => drugMatches(slug, meta, search));
    const map = new Map();
    for (const [slug, meta] of entries) {
      const k = meta.class || "other";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ slug, meta });
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [antibiotics, search]);

  const selected = selectedSlug ? { slug: selectedSlug, meta: antibiotics[selectedSlug] } : null;

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-6">
      <div className={selected ? "hidden md:block" : "block"}>
        {grouped.map(([cls, drugs]) => (
          <div key={cls} className="mb-5">
            <h2 className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-2 px-1">
              {cls}
            </h2>
            <ul className="space-y-1">
              {drugs.map(({ slug, meta }) => (
                <li key={slug}>
                  <button
                    onClick={() => setSelectedSlug(slug)}
                    className={[
                      "w-full text-left px-3 py-2 rounded-lg bg-white border transition-all flex items-center gap-3 group",
                      selectedSlug === slug
                        ? "border-mizzou-gold ring-1 ring-mizzou-gold"
                        : "border-stone-200 hover:border-stone-300 hover:shadow-sm",
                    ].join(" ")}
                  >
                    <Pill className="w-4 h-4 text-stone-400 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-stone-900 truncate">{meta.name}</div>
                      <div className="text-[11px] text-stone-500">
                        {meta.routes?.join("/") || "—"}
                      </div>
                    </span>
                    <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {grouped.length === 0 && (
          <div className="text-sm text-stone-500 py-8 text-center">
            No antibiotics match your search.
          </div>
        )}
      </div>

      {selected && (
        <AntibioticDetail
          slug={selected.slug}
          meta={selected.meta}
          organisms={organisms}
          audience={audience}
          audienceInfo={audienceInfo}
          isolateMinimum={isolateMinimum}
          onBack={() => setSelectedSlug(null)}
        />
      )}
    </div>
  );
}

function AntibioticDetail({ slug, meta, organisms, audience, audienceInfo, isolateMinimum, onBack }) {
  // Build list: organisms tested against this drug in this audience.
  const rows = useMemo(() => {
    const out = [];
    for (const o of organisms) {
      const d = o.data[audience];
      if (!d) continue;
      const v = d.susceptibilities?.[slug];
      if (v === undefined) continue; // drug not on this audience's panel
      out.push({
        id: o.id,
        name: o.name,
        gramStain: o.gramStain,
        n: d.isolateCount,
        value: v,
      });
    }
    // Sort: tested high→low, then untested alphabetic
    return out.sort((a, b) => {
      if (a.value == null && b.value == null) return a.name.localeCompare(b.name);
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      return b.value - a.value;
    });
  }, [organisms, audience, slug]);

  const tested = rows.filter((r) => r.value != null);

  return (
    <div className="mt-4 md:mt-0">
      <div className="md:sticky md:top-[8.5rem]">
        <button onClick={onBack} className="md:hidden inline-flex items-center gap-1 text-sm text-stone-600 mb-3">
          <ArrowLeft className="w-4 h-4" /> All drugs
        </button>

        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-gradient-to-br from-mizzou-black to-stone-800 text-stone-100">
            <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-1">
              {meta.class} · {meta.routes?.join("/") || "—"}
            </div>
            <h2 className="font-display text-xl font-semibold text-mizzou-gold">{meta.name}</h2>
            {meta.notes && (
              <p className="text-xs text-amber-300 mt-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {meta.notes}
              </p>
            )}
          </div>

          <div className="px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Organisms covered · {audienceInfo.short} · sorted high → low
            </div>
            {tested.length === 0 ? (
              <p className="text-sm text-stone-500 py-4 text-center">
                Not on the panel for this setting.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {tested.map((r) => {
                  const gram = GRAM_LABEL[r.gramStain] || GRAM_LABEL.unknown;
                  const lowN = r.n != null && r.n < isolateMinimum;
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-1">
                      <SusceptibilityChip value={r.value} size="md" lowN={lowN} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-900 truncate italic">{r.name}</div>
                        <div className="text-[11px] text-stone-500 flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1 py-px rounded ${gram.className}`}>
                            {gram.label}
                          </span>
                          <span>n = {r.n ?? "?"}</span>
                          {lowN && <span className="text-amber-600">low n</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
