// Color-coded susceptibility badge using the MUHC antibiogram legend:
//   green ≥80%  · yellow 41–79% · red ≤40%
// Null = not tested / not indicated (gray dash).

export function bandFor(value) {
  if (value == null) return "none";
  if (value >= 80) return "good";
  if (value >= 41) return "mod";
  return "poor";
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
        lowN ? "italic opacity-80" : "",
        className,
      ].join(" ")}
      title={value == null ? "Not tested or not indicated" : `${value}% susceptible`}
    >
      {label}
    </span>
  );
}
