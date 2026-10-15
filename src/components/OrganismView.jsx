import { useMemo, useState, useEffect } from "react";
import { ChevronRight, ArrowLeft, AlertCircle, Beaker } from "lucide-react";
import SusceptibilityChip, { bandFor, isolatesFor, NITROFURANTOIN } from "./SusceptibilityChip.jsx";
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

const metaFrom = (antibiotics, slug) => antibiotics[slug] || { name: slug, class: "other", routes: [] };

// The drugs the PDF prints under two column headings (CLAUDE.md, "Qualified
// drug columns"). They stay separate determinations for % figures; only the
// intrinsic-resistance fallback below treats them as the same drug.
const SIBLING_COLUMN = {
  "penicillin-iv": "penicillin",
  penicillin: "penicillin-iv",
  nitrofurantoin: "nitrofurantoin-urinary",
  "nitrofurantoin-urinary": "nitrofurantoin",
};

// Whether a drug's note belongs beside this organism (option C, Thiago,
// 2026-10-13). A note without `noteAppliesTo` is about the drug itself — its
// route, its breakpoint — and shows wherever the drug has a figure. A note
// with it names the organisms it concerns and shows only on those, including
// where the drug is blank or intrinsically resistant, because there it is the
// explanation (Pseudomonas → gentamicin). Groups: build-app-data.mjs.
function noteFor(meta, organismId, hasFigure) {
  if (!meta.notes) return null;
  if (meta.noteAppliesTo) return meta.noteAppliesTo.includes(organismId) ? meta.notes : null;
  return hasFigure ? meta.notes : null;
}

// The amber (!) that opens a drug's note as visible text. It used to carry the
// note only in `title=` and `aria-label`, neither of which a sighted phone user
// sees, so on the device this tool targets it was a caution mark with no
// explanation behind it.
//
// 44px tap target around a 28px visible circle. In the % list the negative
// vertical margins keep it from growing the row: those rows are ~45px, so
// neighbouring targets cannot overlap. The compact name lists pass
// `flush={false}` — their rows are 24px, and two flush 44px targets there
// overlapped by 16px, so a tap could open the neighbour's note (peer review,
// 2026-10-13). The focus ring is amber-700, not brand gold: gold is 1.8:1
// against white, under the 3:1 a focus indicator needs.
function NoteButton({ open, onToggle, noteId, drugName, flush = true }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={noteId}
      aria-label={`Note on ${drugName}`}
      className={`group/note ${flush ? "-my-3.5" : ""} -ml-2 -mr-3.5 p-2 rounded-full focus:outline-none`}
    >
      <span
        className={[
          "flex items-center justify-center w-7 h-7 rounded-full transition-colors group-focus-visible/note:ring-2 group-focus-visible/note:ring-amber-700",
          open ? "bg-amber-100 text-amber-700" : "text-amber-600 group-hover/note:bg-amber-50",
        ].join(" ")}
      >
        <AlertCircle className="w-4 h-4" aria-hidden="true" />
      </span>
    </button>
  );
}

function NoteText({ id, open, className, children }) {
  return (
    <p
      id={id}
      hidden={!open}
      className={`${className} mt-1.5 text-xs leading-snug text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5`}
    >
      {children}
    </p>
  );
}

// Visible text, never a tooltip: the entry comes from the all-locations panel,
// not the selected setting (CLAUDE.md, "All-locations fallback").
function AllLocationsBadge() {
  return (
    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-stone-200 text-stone-600">
      all locations
    </span>
  );
}

// A compact two-column list of drug names, for the intrinsic-resistance and
// "Not tested" sections. An entry whose note concerns this organism takes a
// full-width row with the same (!) button as the % list; the rest stay
// compact. `marker` prints the PDF's black square before each name.
function DrugNameList({ entries, organismId, openNotes, toggleNote, marker = false, tone = "text-stone-500" }) {
  const withNote = entries.filter((e) => e.note);
  const plain = entries.filter((e) => !e.note);
  // Names wrap rather than truncate: half a phone's width cuts "Cefazolin
  // (urinary isolates)" to "Cefazolin (urinary isol…", and that qualifier is
  // the part this app exists to keep visible (CLAUDE.md, cefazolin). The
  // marker stays glued to the name, and the badge drops to its own line when
  // the two do not fit side by side.
  const name = (e) => (
    <span className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="min-w-0 flex items-start gap-1.5">
        {marker && <span aria-hidden="true" className="shrink-0 w-2 h-2 mt-[0.3rem] bg-stone-900" />}
        <span className="min-w-0 break-words">{e.meta.name}</span>
      </span>
      {e.fromAll && <AllLocationsBadge />}
    </span>
  );
  return (
    <ul className={`grid grid-cols-2 gap-x-3 gap-y-1 text-xs ${tone}`}>
      {withNote.map((e) => {
        const noteId = `note-${organismId}-${e.slug}`;
        const open = openNotes.has(e.slug);
        return (
          <li key={e.slug} className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
            {name(e)}
            <NoteButton
              open={open}
              onToggle={() => toggleNote(e.slug)}
              noteId={noteId}
              drugName={e.meta.name}
              flush={false}
            />
            <NoteText id={noteId} open={open} className="col-span-2 mb-1">
              {e.note}
            </NoteText>
          </li>
        );
      })}
      {plain.map((e) => (
        <li key={e.slug} className="min-w-0">
          {name(e)}
        </li>
      ))}
    </ul>
  );
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
  // denominator in every one. Nitrofurantoin rows go one step further and
  // carry their OWN column's count, not the organism's total (isolatesFor).
  //
  // An intrinsically resistant drug has no key in `susceptibilities` either
  // (see `resistant` below), so "no key" alone cannot mean "off this panel":
  // the fallback skips drugs this setting marks intrinsically resistant.
  const drugs = useMemo(() => {
    const own = d.susceptibilities || {};
    const ownIR = new Set(d.intrinsicResistance || []);
    const allBucket = audience !== "all" ? organism.data?.all : null;
    const allPanel = allBucket?.susceptibilities || {};
    const rows = Object.entries(own).map(([slug, value]) => ({
      slug,
      value,
      fromAll: false,
      n: isolatesFor(d, slug),
    }));
    for (const [slug, value] of Object.entries(allPanel)) {
      if (own[slug] === undefined && !ownIR.has(slug) && value != null) {
        rows.push({ slug, value, fromAll: true, n: isolatesFor(allBucket, slug) });
      }
    }
    return rows
      .map((r) => ({ ...r, meta: metaFrom(antibiotics, r.slug) }))
      .sort((a, b) => {
        if (a.value == null && b.value == null) return a.meta.name.localeCompare(b.meta.name);
        if (a.value == null) return 1;
        if (b.value == null) return -1;
        return b.value - a.value;
      });
  }, [d, antibiotics, audience, organism]);

  // Intrinsic resistance: drugs whose cell the PDF fills solid black. Until
  // 2026-10-13 the pipeline read only text, so these drugs appeared nowhere —
  // not in the % list, not under "Not tested". Like the % rows, a drug this
  // setting's panel has no column for falls back to the all-locations panel and
  // says so (Pseudomonas → minocycline in ED, S. maltophilia → amikacin in
  // Peds) — unless the setting already marks the same drug under its other
  // column heading: MRSA in ED lists "Penicillin" itself, and adding
  // "Penicillin (IV) · all locations" beside it said the same thing twice.
  const resistant = useMemo(() => {
    const own = d.susceptibilities || {};
    const ownIR = d.intrinsicResistance || [];
    const rows = ownIR.map((slug) => ({ slug, fromAll: false }));
    if (audience !== "all") {
      for (const slug of organism.data?.all?.intrinsicResistance || []) {
        const sibling = SIBLING_COLUMN[slug];
        if (own[slug] === undefined && !ownIR.includes(slug) && !(sibling && ownIR.includes(sibling))) {
          rows.push({ slug, fromAll: true });
        }
      }
    }
    return rows
      .map((r) => ({ ...r, meta: metaFrom(antibiotics, r.slug) }))
      .map((r) => ({ ...r, note: noteFor(r.meta, organism.id, false) }))
      .sort((a, b) => a.meta.name.localeCompare(b.meta.name));
  }, [d, antibiotics, audience, organism]);

  const tested = drugs.filter((dr) => dr.value != null);
  const untested = drugs
    .filter((dr) => dr.value == null)
    .map((dr) => ({ ...dr, note: noteFor(dr.meta, organism.id, false) }));
  const untestedNotes = untested.filter((dr) => dr.note).length;
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
                    // Nitrofurantoin's n is its own tested count, not the
                    // header's total, so the row prints it.
                    const nitro = NITROFURANTOIN.has(dr.slug);
                    const note = noteFor(dr.meta, organism.id, true);
                    const noteOpen = openNotes.has(dr.slug);
                    const noteId = `note-${organism.id}-${dr.slug}`;
                    return (
                    <li
                      key={dr.slug}
                      className={[
                        "grid items-center gap-x-3 py-1",
                        note ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)]",
                      ].join(" ")}
                    >
                      <SusceptibilityChip value={dr.value} size="md" lowN={rowLowN} />
                      <div className="min-w-0">
                        {/* Wraps, never truncates — the same reason as the
                            name lists below: on a narrow phone, with a badge
                            and a (!) beside it, "Cefazolin (urinary isolates)"
                            lost its qualifier to an ellipsis (peer review,
                            2026-10-13). */}
                        <div className="text-sm font-medium text-stone-900 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="min-w-0 break-words">{dr.meta.name}</span>
                          {dr.fromAll && <AllLocationsBadge />}
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {dr.meta.class}
                          {dr.meta.routes?.length ? ` · ${dr.meta.routes.join("/")}` : ""}
                          {dr.fromAll && (
                            <span className="text-stone-600">
                              {" · not specific to "}
                              {audienceInfo.short}
                              {(dr.n != null || nitro) && ` · n = ${dr.n ?? "?"}${nitro ? " tested," : ""} all locations`}
                            </span>
                          )}
                          {!dr.fromAll && nitro && ` · n = ${dr.n ?? "?"} tested`}
                          {rowLowN && (
                            <span className="text-amber-700">
                              {" · low n"}
                            </span>
                          )}
                        </div>
                      </div>
                      {note && (
                        <NoteButton
                          open={noteOpen}
                          onToggle={() => toggleNote(dr.slug)}
                          noteId={noteId}
                          drugName={dr.meta.name}
                        />
                      )}
                      {note && (
                        <NoteText id={noteId} open={noteOpen} className="col-start-2 col-span-2">
                          {note}
                        </NoteText>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {/* Open by default, unlike "Not tested": the PDF prints these
                cells in the table beside the percentages, at the same weight. */}
            {resistant.length > 0 && (
              <div className="px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                  Intrinsically resistant ({resistant.length})
                </div>
                <p className="mt-0.5 mb-2 text-[11px] text-stone-500">
                  Marked as intrinsic resistance (a black cell) in the source PDF.
                </p>
                <DrugNameList
                  entries={resistant}
                  organismId={organism.id}
                  openNotes={openNotes}
                  toggleNote={toggleNote}
                  marker
                  tone="text-stone-800"
                />
              </div>
            )}
            {/* Starts open when an entry carries a note about THIS organism:
                for the HECK-Yes organisms that is "avoid ceftriaxone and
                pip-tazo", and behind a closed disclosure the screen gave no
                sign of it (peer review, 2026-10-13). Otherwise it starts
                closed, as before. */}
            {untested.length > 0 && (
              <details className="px-4 py-3 group" open={untestedNotes > 0}>
                <summary className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 cursor-pointer select-none">
                  Not tested ({untested.length})
                  {untestedNotes > 0
                    ? ` · ${untestedNotes} note${untestedNotes === 1 ? "" : "s"}`
                    : " — click to expand"}
                </summary>
                <div className="mt-2">
                  <DrugNameList
                    entries={untested}
                    organismId={organism.id}
                    openNotes={openNotes}
                    toggleNote={toggleNote}
                  />
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
