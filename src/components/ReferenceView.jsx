import { useState } from "react";
import { ShieldAlert, Clock3, TestTube2, FlaskConical } from "lucide-react";

const SECTIONS = [
  { id: "resistance", label: "Resistance", icon: ShieldAlert },
  { id: "durations",  label: "Durations",  icon: Clock3 },
  { id: "blood",      label: "Blood Culture", icon: TestTube2 },
  { id: "crossreact", label: "β-Lactam Allergy", icon: FlaskConical },
];

export default function ReferenceView({ supplementary, search }) {
  const [section, setSection] = useState("resistance");

  return (
    <div>
      <nav className="flex gap-1 mb-4 -mx-1 overflow-x-auto scrollbar-none">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={[
              "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full font-medium border transition-colors",
              section === id
                ? "bg-mizzou-black text-mizzou-gold border-mizzou-black"
                : "bg-white text-stone-700 border-stone-200 hover:border-stone-400",
            ].join(" ")}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {section === "resistance" && <ResistanceSection data={supplementary.resistance} search={search} />}
      {section === "durations"  && <DurationsSection data={supplementary.durations} search={search} />}
      {section === "blood"      && <BloodCultureSection data={supplementary.bloodCulture} search={search} />}
      {section === "crossreact" && <CrossReactivitySection data={supplementary.betaLactamCrossReactivity} search={search} />}
    </div>
  );
}

function matches(q, ...fields) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => f && String(f).toLowerCase().includes(needle));
}

function ResistanceSection({ data, search }) {
  return (
    <div className="space-y-6">
      <ResistanceTable {...data.esbl} highlight="ESBL" search={search} />
      <ResistanceTable {...data.cre} highlight="CRE" search={search} note={data.cre.note} definition={data.cre.definition} />

      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <h3 className="font-display text-base font-semibold text-mizzou-black px-4 py-2.5 border-b border-stone-200 bg-stone-50">
          {data.pneumoBreakpoints.title}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-50 text-stone-600">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Site</th>
                <th className="text-left px-3 py-2 font-semibold">Penicillin</th>
                <th className="text-left px-3 py-2 font-semibold">Ceftriaxone / Cefotaxime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.pneumoBreakpoints.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium text-stone-900">{r.site}</td>
                  <td className="px-3 py-2 font-mono text-stone-700">{r.penicillin}</td>
                  <td className="px-3 py-2 font-mono text-stone-700">{r.ceftriaxone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-stone-500 bg-stone-50 border-t border-stone-100">
          S = susceptible · I = intermediate · R = resistant
        </p>
      </section>
    </div>
  );
}

function ResistanceTable({ title, organisms, note, definition, highlight, search }) {
  const rows = organisms.filter((o) => matches(search, o.name, highlight));
  return (
    <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <header className="px-4 py-2.5 bg-stone-50 border-b border-stone-200">
        <h3 className="font-display text-base font-semibold text-mizzou-black">{title}</h3>
        {definition && <p className="text-[11px] text-stone-500 mt-0.5">{definition}</p>}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-50 text-stone-600">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Organism</th>
              <th className="text-left px-3 py-2 font-semibold">All</th>
              <th className="text-left px-3 py-2 font-semibold">ED</th>
              <th className="text-left px-3 py-2 font-semibold">ICU</th>
              <th className="text-left px-3 py-2 font-semibold">Peds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-3 py-2 italic font-medium text-stone-900">{r.name}</td>
                <td className="px-3 py-2 font-mono text-stone-700">{r.all ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-stone-700">{r.ed ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-stone-700">{r.icu ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-stone-700">{r.peds ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="px-4 py-2 text-[11px] text-stone-500 bg-stone-50 border-t border-stone-100">{note}</p>}
    </section>
  );
}

function DurationsSection({ data, search }) {
  const rows = data.rows.filter((r) => matches(search, r.condition, r.duration));
  return (
    <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <header className="px-4 py-2.5 bg-stone-50 border-b border-stone-200">
        <h3 className="font-display text-base font-semibold text-mizzou-black">{data.title}</h3>
        <p className="text-[11px] text-stone-500 mt-0.5">
          Source: <a href={data.source} target="_blank" rel="noreferrer" className="text-mizzou-gold-deep underline underline-offset-2">bradspellberg.com/shorter-is-better</a>
        </p>
      </header>
      <ul className="divide-y divide-stone-100">
        {rows.map((r, i) => (
          <li key={i} className="px-4 py-2.5 flex items-baseline gap-3">
            <span className="flex-1 text-sm text-stone-900">{r.condition}</span>
            <span className="font-mono text-xs text-stone-700 whitespace-nowrap">{r.duration}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BloodCultureSection({ data, search }) {
  const filter = (rows) => rows.filter((r) => matches(search, r.result, r.empiric, r.notes, r.marker, r.drug));
  return (
    <div className="space-y-5">
      <BCBlock title="Gram Positive" rows={filter(data.gramPositive)} />
      <BCBlock title="Gram Negative" rows={filter(data.gramNegative)} />
      <BCBlock title="Yeast" rows={filter(data.yeast)} />
      <BCBlock
        title="Resistance Markers (BioFire)"
        rows={filter(data.resistanceMarkers).map((r) => ({
          result: r.marker, empiric: r.drug, notes: r.notes,
        }))}
      />
    </div>
  );
}

function BCBlock({ title, rows }) {
  if (rows.length === 0) return null;
  return (
    <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <header className="px-4 py-2.5 bg-stone-50 border-b border-stone-200">
        <h3 className="font-display text-base font-semibold text-mizzou-black">{title}</h3>
      </header>
      <ul className="divide-y divide-stone-100">
        {rows.map((r, i) => (
          <li key={i} className="px-4 py-3">
            <div className="text-sm font-medium text-stone-900">{r.result}</div>
            <div className="text-xs font-semibold text-mizzou-gold-deep mt-1">→ {r.empiric}</div>
            {r.notes && <div className="text-[11px] text-stone-600 mt-1 leading-snug">{r.notes}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CrossReactivitySection({ data, search }) {
  const rows = data.rows.filter((row) => matches(search, ...row));
  return (
    <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <header className="px-4 py-2.5 bg-stone-50 border-b border-stone-200">
        <h3 className="font-display text-base font-semibold text-mizzou-black">{data.title}</h3>
        <p className="text-[11px] text-stone-500 mt-0.5">{data.note}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-50 text-stone-600">
            <tr>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Drug</th>
              <th className="text-left px-3 py-2 font-semibold text-sus-poor">Identical R1/R2<br/><span className="text-[10px] font-normal">(highest risk)</span></th>
              <th className="text-left px-3 py-2 font-semibold text-sus-mod">Similar R1/R2<br/><span className="text-[10px] font-normal">(low risk; caution if severe prior)</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="px-3 py-2 font-medium text-stone-900 whitespace-nowrap">{row[0]}</td>
                <td className="px-3 py-2 text-stone-700 font-mono uppercase text-[11px]">{row[1]}</td>
                <td className="px-3 py-2 text-stone-700 text-[11px]">{row[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
