#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, watch } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { generateIcons } from "./generate-icons.mjs";
import { syncVersion } from "./version.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const UI_ROOT = join(ROOT, "src", "ui");
const MANIFEST = join(ROOT, "src", "manifest.json");
const watchMode = process.argv.includes("--watch");

function log(message) {
  console.log(`\n[leetcomete] ${message}`);
}

function validateManifest() {
  const raw = readFileSync(MANIFEST, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`src/manifest.json is not valid JSON: ${error.message}`);
  }
}

function copyManifest() {
  const manifest = validateManifest();
  cpSync(MANIFEST, join(DIST, "manifest.json"));
  return manifest;
}

async function buildUi() {
  log("Building popup and options UI");
  await build({
    configFile: false,
    root: UI_ROOT,
    base: "./",
    publicDir: false,
    logLevel: "warn",
    build: {
      outDir: DIST,
      emptyOutDir: false,
      target: "chrome111",
      sourcemap: false,
      minify: !watchMode,
      rolldownOptions: {
        input: {
          popup: join(UI_ROOT, "popup.html"),
          options: join(UI_ROOT, "options.html"),
        },
      },
    },
  });
}

async function buildLibrary({ name, entry, formats, fileName, label }) {
  log(`Building ${label}`);
  await build({
    configFile: false,
    publicDir: false,
    logLevel: "warn",
    build: {
      outDir: DIST,
      emptyOutDir: false,
      target: "chrome111",
      sourcemap: false,
      minify: !watchMode,
      lib: {
        name,
        entry,
        formats,
        fileName: () => fileName,
      },
    },
  });
}

async function buildAll() {
  const started = Date.now();
  syncVersion({ quiet: true });
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const manifest = copyManifest();
  generateIcons(join(DIST, "icons"));

  await buildUi();
  await buildLibrary({
    label: "MAIN-world page bridge",
    name: "LeetcometePageBridge",
    entry: join(ROOT, "src", "content", "page-bridge.ts"),
    formats: ["iife"],
    fileName: "page-bridge.js",
  });
  await buildLibrary({
    label: "isolated content script",
    name: "LeetcometeContent",
    entry: join(ROOT, "src", "content", "content-script.ts"),
    formats: ["iife"],
    fileName: "content.js",
  });
  await buildLibrary({
    label: "service worker",
    name: "LeetcometeBackground",
    entry: join(ROOT, "src", "background", "service-worker.ts"),
    formats: ["es"],
    fileName: "service-worker.js",
  });

  verifyOutput(manifest);
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  log(`Built extension in ${elapsed}s -> ${relative(ROOT, DIST)}`);
  if (watchMode) {
    log("Watching src/ for changes. Press Ctrl+C to stop.");
  }
}

function verifyOutput(manifest) {
  const required = new Set([
    "manifest.json",
    "popup.html",
    "options.html",
    "page-bridge.js",
    "content.js",
    "service-worker.js",
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
  ]);

  for (const file of required) {
    const path = join(DIST, file);
    if (!existsSync(path)) {
      throw new Error(`Build is incomplete: missing ${file}`);
    }
  }

  const manifestSize = statSync(join(DIST, "manifest.json")).size;
  const contentSize = statSync(join(DIST, "content.js")).size;
  const bridgeSize = statSync(join(DIST, "page-bridge.js")).size;
  const workerSize = statSync(join(DIST, "service-worker.js")).size;
  console.log(
    [
      `  manifest.json   ${formatBytes(manifestSize)}`,
      `  page-bridge.js  ${formatBytes(bridgeSize)}`,
      `  content.js      ${formatBytes(contentSize)}`,
      `  service-worker  ${formatBytes(workerSize)}`,
    ].join("\n"),
  );
}

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function startWatch() {
  let timer;
  let building = false;
  let queued = false;

  const rebuild = async () => {
    if (building) {
      queued = true;
      return;
    }
    building = true;
    try {
      await buildAll();
    } catch (error) {
      console.error("[leetcomete] Build failed:", error);
    } finally {
      building = false;
      if (queued) {
        queued = false;
        void rebuild();
      }
    }
  };

  try {
    const watcher = watch(join(ROOT, "src"), { recursive: true }, (_event, filename) => {
      if (!filename) return;
      if (filename.endsWith(".swp") || filename.endsWith("~")) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void rebuild(), 120);
    });
    process.on("SIGINT", () => {
      watcher.close();
      process.exit(0);
    });
  } catch (error) {
    console.warn("[leetcomete] File watching is unavailable on this platform:", error);
  }
}

try {
  await buildAll();
  if (watchMode) startWatch();
} catch (error) {
  console.error("[leetcomete] Build failed:", error);
  process.exitCode = 1;
}
