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
        sus: {
          good: "#16a34a",      // ≥80%  — green-600
          "good-bg": "#dcfce7", // green-100
          mod: "#ca8a04",       // 41–79% — yellow-600
          "mod-bg": "#fef9c3",  // yellow-100
          poor: "#dc2626",      // ≤40%  — red-600
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
