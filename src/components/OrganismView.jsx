import { useMemo, useState, useEffect } from "react";
import { ChevronRight, ArrowLeft, AlertCircle, Beaker } from "lucide-react";
import SusceptibilityChip, { bandFor } from "./SusceptibilityChip.jsx";
import useDetailScroll from "../hooks/useDetailScroll.js";

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

  // Mobile: top of detail on open, back to old list position on close.
  useDetailScroll(!!selected);

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
      {/* An organism stays selected across an audience switch, but the list is
          filtered to organisms that HAVE a bucket for the audience — so the
          selection can outlive its data (All → S. pyogenes → ICU). Rendering
          OrganismDetail then crashed on `organism.data[audience].isolateCount`.
          Say so instead; silently clearing the selection would read as the app
          losing the reader's place. */}
      {selected && !selected.data?.[audience] && (
        <div className="mt-4 md:mt-0">
          <button
            onClick={() => setSelectedId(null)}
            className="md:hidden inline-flex items-center gap-1 text-sm text-stone-600 mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> All organisms
          </button>
          <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
            <h2 className="font-display text-lg font-semibold italic text-stone-900">
              {selected.name}
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Not reported for <strong>{audienceInfo.short}</strong> — this organism has no
              susceptibility panel in that setting. Switch the setting back, or pick another
              organism.
            </p>
          </div>
        </div>
      )}
      {selected && selected.data?.[audience] && (
        <OrganismDetail
          // Keyed so a newly opened organism starts with every note collapsed.
          key={selected.id}
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
  // Slugs whose drug note is expanded (the note button on each row).
  const [openNotes, setOpenNotes] = useState(() => new Set());
  const toggleNote = (slug) =>
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  // Sort drugs: tested first (descending %S), then null at bottom.
  //
  // Drugs on the all-locations panel but NOT on the selected setting's panel
  // are included, carrying their all-locations value and flagged `fromAll`.
  // Some columns the PDF only prints on the all-locations tables (the IV
  // penicillin and plain nitrofurantoin columns — see CLAUDE.md "Qualified
  // drug columns"), so without this they vanish entirely when the reader
  // switches to ED/ICU/Peds and look like missing data. The flag is rendered
  // as a visible badge, never a tooltip: the number is NOT specific to the
  // selected setting and must not be read as though it were.
  // Each row carries the isolate count of the bucket its VALUE came from, so a
  // fallback percentage is never read against the selected setting's n. Peer
  // review found the mismatch (2026-10-03): Peds + S. pyogenes showed a
  // fallback penicillin-IV of 100% — an all-locations figure over n=36 — under
  // a header reading "n = 11" and "below CLSI threshold". Four rows differed
  // that way, and the low-n judgement was being made against the wrong
  // denominator in every one.
  const drugs = useMemo(() => {
    const own = d.susceptibilities || {};
    const allBucket = audience !== "all" ? organism.data?.all : null;
    const allPanel = allBucket?.susceptibilities || {};
    const rows = Object.entries(own).map(([slug, value]) => ({
      slug,
      value,
      fromAll: false,
      n: d.isolateCount,
    }));
    for (const [slug, value] of Object.entries(allPanel)) {
      if (own[slug] === undefined && value != null) {
        rows.push({ slug, value, fromAll: true, n: allBucket?.isolateCount });
      }
    }
    return rows
      .map((r) => ({
        ...r,
        meta: antibiotics[r.slug] || { name: r.slug, class: "other", routes: [] },
      }))
      .sort((a, b) => {
        if (a.value == null && b.value == null) return a.meta.name.localeCompare(b.meta.name);
        if (a.value == null) return 1;
        if (b.value == null) return -1;
        return b.value - a.value;
      });
  }, [d, antibiotics, audience, organism]);

  const tested = drugs.filter((dr) => dr.value != null);
  const untested = drugs.filter((dr) => dr.value == null);
  // Whether any displayed value came from a bucket other than the selected
  // setting — if so the header's n is qualified, because it does not cover
  // every row beneath it.
  const hasFallback = tested.some((dr) => dr.fromAll);

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
                {hasFallback && " in this setting"}
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
                  {tested.map((dr) => {
                    // Judge low-n against the denominator this row's value
                    // actually came from, not the selected setting's.
                    const rowLowN = dr.n != null && dr.n < isolateMinimum;
                    const noteOpen = openNotes.has(dr.slug);
                    const noteId = `note-${organism.id}-${dr.slug}`;
                    return (
                    <li
                      key={dr.slug}
                      className={[
                        "grid items-center gap-x-3 py-1",
                        dr.meta.notes
                          ? "grid-cols-[auto_minmax(0,1fr)_auto]"
                          : "grid-cols-[auto_minmax(0,1fr)]",
                      ].join(" ")}
                    >
                      <SusceptibilityChip value={dr.value} size="md" lowN={rowLowN} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-stone-900 flex items-center gap-1.5">
                          <span className="truncate">{dr.meta.name}</span>
                          {dr.fromAll && (
                            // Visible text, not a tooltip: this number is from
                            // the all-locations panel, not the selected setting.
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-stone-200 text-stone-600">
                              all locations
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {dr.meta.class}
                          {dr.meta.routes?.length ? ` · ${dr.meta.routes.join("/")}` : ""}
                          {dr.fromAll && (
                            <span className="text-stone-600">
                              {" · not specific to "}
                              {audienceInfo.short}
                              {dr.n != null && ` · n = ${dr.n} all locations`}
                            </span>
                          )}
                          {rowLowN && (
                            <span className="text-amber-700">
                              {" · low n"}
                            </span>
                          )}
                        </div>
                      </div>
                      {dr.meta.notes && (
                        // A button that opens the note as visible text below
                        // the row. This icon used to carry the note only in
                        // `title=` and `aria-label`, neither of which a sighted
                        // phone user sees, so on the device this tool targets
                        // it was a caution mark with no explanation behind it.
                        <button
                          type="button"
                          onClick={() => toggleNote(dr.slug)}
                          aria-expanded={noteOpen}
                          aria-controls={noteId}
                          aria-label={`Note on ${dr.meta.name}`}
                          // 44px tap target around a 28px visible circle; the
                          // negative margins keep it from growing the row or
                          // taking width from the drug name. The focus ring is
                          // amber-700, not brand gold: gold is 1.8:1 against
                          // white, under the 3:1 a focus indicator needs.
                          className="group/note -my-3.5 -ml-2 -mr-3.5 p-2 rounded-full focus:outline-none"
                        >
                          <span
                            className={[
                              "flex items-center justify-center w-7 h-7 rounded-full transition-colors group-focus-visible/note:ring-2 group-focus-visible/note:ring-amber-700",
                              noteOpen ? "bg-amber-100 text-amber-700" : "text-amber-600 group-hover/note:bg-amber-50",
                            ].join(" ")}
                          >
                            <AlertCircle className="w-4 h-4" aria-hidden="true" />
                          </span>
                        </button>
                      )}
                      {dr.meta.notes && (
                        <p
                          id={noteId}
                          hidden={!noteOpen}
                          className="col-start-2 col-span-2 mt-1.5 text-xs leading-snug text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5"
                        >
                          {dr.meta.notes}
                        </p>
                      )}
                    </li>
                    );
                  })}
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
