import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path defaults to the GitHub Pages subpath. Firebase Hosting serves
// from root — set BASE=/ when building for that target (see package.json
// "build:firebase" script).
const base = process.env.BASE ?? "/muhc-antibiogram/";

export default defineConfig({
  plugins: [react()],
  base,
});
