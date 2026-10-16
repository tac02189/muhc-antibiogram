/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        mizzou: {
          gold: "#F1B82D",
          "gold-deep": "#B8860B",
          black: "#000000",
          ink: "#1a1a1a",
        },
        // Text on the -bg tints. Darker since 2026-10-16 (Thiago): the 600
        // shades were 3.0 / 2.7 / 4.0:1 on their tints, under the 4.5:1 small
        // text needs (Codex); these are 6.5 / 6.4 / 5.3:1. Same hues, same
        // thresholds. The Empiric labels and Reference headers use them too.
        sus: {
          good: "#166534",      // ≥80%  — green-800
          "good-bg": "#dcfce7", // green-100
          mod: "#854d0e",       // 41–79% — yellow-800
          "mod-bg": "#fef9c3",  // yellow-100
          poor: "#b91c1c",      // ≤40%  — red-700
          "poor-bg": "#fee2e2", // red-100
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
