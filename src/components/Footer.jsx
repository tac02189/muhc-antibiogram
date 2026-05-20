import { AlertTriangle, Phone } from "lucide-react";

export default function Footer({ microPhone, infectionPhone, version, lastUpdated, pdfHref }) {
  return (
    <footer className="mt-12 border-t border-stone-200 bg-stone-100 text-stone-700">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4 text-xs">
        <div className="flex items-start gap-2 text-stone-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-mizzou-gold-deep shrink-0" />
          <p className="leading-relaxed">
            <strong>This tool is not a substitute for clinical judgment, current local guidelines, or ID consultation.</strong>{" "}
            Susceptibility percentages reflect aggregated isolates from {version === "2026" ? "2024–2025" : version}.
            Always confirm against the original PDF and consider patient-specific factors before prescribing.
            For complex or resistant cases, consult Infectious Diseases.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-stone-600">
          <div>
            <div className="font-semibold text-stone-800 uppercase tracking-wider text-[10px] mb-1">Microbiology Lab</div>
            <a href={`tel:${microPhone.replace(/\D/g, "")}`} className="flex items-center gap-1 hover:text-mizzou-gold-deep">
              <Phone className="w-3 h-3" /> {microPhone}
            </a>
          </div>
          <div>
            <div className="font-semibold text-stone-800 uppercase tracking-wider text-[10px] mb-1">Infection Prevention</div>
            <a href={`tel:${infectionPhone.replace(/\D/g, "")}`} className="flex items-center gap-1 hover:text-mizzou-gold-deep">
              <Phone className="w-3 h-3" /> {infectionPhone}
            </a>
          </div>
        </div>

        <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 text-stone-500 text-[11px]">
          <span>
            Antibiogram {version} · last updated {lastUpdated}
          </span>
          <a href={pdfHref} target="_blank" rel="noreferrer" className="hover:text-mizzou-gold-deep underline underline-offset-2">
            Download source PDF
          </a>
        </div>
      </div>
    </footer>
  );
}
