import { useMemo, useState } from "react";
import { Check, X, AlertCircle, Clock, BookOpen, ChevronDown } from "lucide-react";

function syndromeMatches(s, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = `${s.name} ${s.context} ${(s.relevantOrganisms || []).join(" ")}`.toLowerCase();
  return hay.includes(needle);
}

export default function SyndromeView({ syndromes, antibiotics, organisms, audience, search, onJumpToOrganism }) {
  const filtered = useMemo(
    () => syndromes.filter((s) => syndromeMatches(s, search)),
    [syndromes, search]
  );
  const [expanded, setExpanded] = useState(null);

  return (
    <div>
      <div className="mb-4 px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-900">
        <AlertCircle className="w-4 h-4 shrink-0 mt-px text-amber-700" />
        <p>
          <strong>Draft recommendations — pending clinical review.</strong> Empiric choices below are
          scaffolded from the local antibiogram + IDSA guidance. Confirm with current departmental
          protocols and ID before clinical use.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((s) => (
          <SyndromeCard
            key={s.id}
            syndrome={s}
            antibiotics={antibiotics}
            organisms={organisms}
            audience={audience}
            expanded={expanded === s.id}
            onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
            onJumpToOrganism={onJumpToOrganism}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-sm text-stone-500 py-8 text-center">
          No syndromes match your search.
        </div>
      )}
    </div>
  );
}

function nameOf(slug, antibiotics) {
  return antibiotics[slug]?.name || slug;
}

function SyndromeCard({ syndrome, antibiotics, organisms, audience, expanded, onToggle, onJumpToOrganism }) {
  const s = syndrome;
  return (
    <article className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
      <header className="px-4 py-3 bg-gradient-to-br from-stone-900 to-mizzou-black text-stone-100">
        <h3 className="font-display text-lg font-semibold text-mizzou-gold">{s.name}</h3>
        <p className="text-xs text-stone-300 mt-0.5">{s.context}</p>
        {s.duration && (
          <p className="text-[11px] text-stone-400 mt-1.5 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> Duration: {s.duration}
          </p>
        )}
      </header>

      <div className="p-4 space-y-3">
        {/* First-line */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-sus-good mb-1.5 flex items-center gap-1">
            <Check className="w-3 h-3" /> First-line
          </div>
          <ul className="space-y-2">
            {s.firstLine.map((item, i) => (
              <li key={i} className="border-l-2 border-sus-good/60 pl-2.5">
                <div className="text-sm font-semibold text-stone-900">{nameOf(item.drug, antibiotics)}</div>
                {item.dose && <div className="text-[11px] text-stone-700 font-mono">{item.dose}</div>}
                {item.rationale && <div className="text-[11px] text-stone-600 mt-0.5 leading-snug">{item.rationale}</div>}
              </li>
            ))}
          </ul>
        </section>

        {/* Alternatives */}
        {s.alternatives?.length > 0 && (
          <section>
            <div className="text-[10px] font-bold uppercase tracking-wider text-sus-mod mb-1.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Alternatives
            </div>
            <ul className="space-y-2">
              {s.alternatives.map((item, i) => (
                <li key={i} className="border-l-2 border-sus-mod/60 pl-2.5">
                  <div className="text-sm font-semibold text-stone-900">{nameOf(item.drug, antibiotics)}</div>
                  {item.dose && <div className="text-[11px] text-stone-700 font-mono">{item.dose}</div>}
                  {item.rationale && <div className="text-[11px] text-stone-600 mt-0.5 leading-snug">{item.rationale}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Avoid */}
        {s.avoid?.length > 0 && (
          <section>
            <div className="text-[10px] font-bold uppercase tracking-wider text-sus-poor mb-1.5 flex items-center gap-1">
              <X className="w-3 h-3" /> Avoid
            </div>
            <ul className="space-y-1.5">
              {s.avoid.map((item, i) => (
                <li key={i} className="border-l-2 border-sus-poor/60 pl-2.5">
                  <div className="text-sm font-semibold text-stone-900">{nameOf(item.drug, antibiotics)}</div>
                  {item.reason && <div className="text-[11px] text-stone-600 mt-0.5 leading-snug">{item.reason}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Expand notes + organisms */}
        <button
          onClick={onToggle}
          className="w-full mt-1 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 hover:text-stone-800"
        >
          <span className="inline-flex items-center gap-1">
            <BookOpen className="w-3 h-3" /> Notes & relevant organisms
          </span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>

        {expanded && (
          <div className="space-y-3 pt-1">
            {s.notes && (
              <p className="text-xs text-stone-700 leading-relaxed">{s.notes}</p>
            )}
            {s.relevantOrganisms?.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
                  Relevant organisms (tap to view local susceptibilities)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.relevantOrganisms.map((orgId) => {
                    const o = organisms.find((x) => x.id === orgId);
                    if (!o) return null;
                    const hasData = !!o.data[audience];
                    return (
                      <button
                        key={orgId}
                        onClick={() => onJumpToOrganism(orgId)}
                        disabled={!hasData}
                        className={[
                          "text-[11px] px-2 py-1 rounded-full italic border transition-colors",
                          hasData
                            ? "bg-stone-50 border-stone-300 hover:bg-mizzou-gold hover:border-mizzou-gold-deep text-stone-700 hover:text-mizzou-black"
                            : "bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed",
                        ].join(" ")}
                        title={hasData ? "View susceptibility profile" : "No data for current setting"}
                      >
                        {o.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
