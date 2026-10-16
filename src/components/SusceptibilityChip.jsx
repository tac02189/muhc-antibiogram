// Color-coded susceptibility badge using the MUHC antibiogram legend:
//   green ≥80%  · yellow 41–79% · red ≤40%
// Null = not tested / not indicated (gray dash).

export function bandFor(value) {
  if (value == null) return "none";
  if (value >= 80) return "good";
  if (value >= 41) return "mod";
  return "poor";
}

// The isolate count behind a % figure — what `n` and the low-n flag are judged
// against. Nitrofurantoin is tested on far fewer isolates than the organism's
// total, and the PDF prints that count beside it ("# Isolates tested with
// nitrofurantoin" → `nitrofurantoinTested`). Until 2026-10-14 every view used
// the total, so MRSA's 100% (All) read as n = 335 when 22 were tested, and 14
// of the 37 nitrofurantoin figures were under the CLSI 30 with no low-n flag
// (Gemini peer review). A nitrofurantoin figure with no count of its own gets
// null ("?"), never the total.
export const NITROFURANTOIN = new Set(["nitrofurantoin", "nitrofurantoin-urinary"]);
export function isolatesFor(bucket, slug) {
  if (!bucket) return null;
  if (NITROFURANTOIN.has(slug)) return bucket.nitrofurantoinTested ?? null;
  return bucket.isolateCount ?? null;
}

const SIZES = {
  sm: "px-1.5 py-0.5 text-[11px] min-w-[2.5rem]",
  md: "px-2 py-0.5 text-xs min-w-[2.75rem]",
  lg: "px-2.5 py-1 text-sm min-w-[3.25rem]",
};

const BAND_STYLES = {
  good: "bg-sus-good-bg text-sus-good ring-sus-good/30",
  mod:  "bg-sus-mod-bg  text-sus-mod  ring-sus-mod/30",
  poor: "bg-sus-poor-bg text-sus-poor ring-sus-poor/30",
  none: "bg-stone-100   text-stone-400 ring-stone-200",
};

export default function SusceptibilityChip({ value, lowN = false, size = "md", className = "" }) {
  const band = bandFor(value);
  const label = value == null ? "—" : `${value}%`;
  return (
    <span
      className={[
        "inline-flex items-center justify-center font-mono font-semibold tabular-nums rounded ring-1 ring-inset",
        SIZES[size] || SIZES.md,
        BAND_STYLES[band],
        // Italic, never faded: the 80% opacity this used to add cut the
        // chip's contrast to 2.2-3.2:1 (Codex, 2026-10-14), and the row
        // already says "low n" in words (Thiago, 2026-10-15).
        lowN ? "italic" : "",
        className,
      ].join(" ")}
      title={value == null ? "Not tested or not indicated" : `${value}% susceptible`}
    >
      {label}
    </span>
  );
}
