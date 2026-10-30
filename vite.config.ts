import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The extension is packaged by `scripts/build.mjs`, which drives Vite once per
 * bundle (MAIN-world bridge, isolated content script, service worker, and UI).
 * This config keeps the shared alias and browser target in one place for
 * editor tooling and for anyone running Vite directly.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "chrome111",
    sourcemap: false,
  },
});
