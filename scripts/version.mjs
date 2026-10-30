#!/usr/bin/env node
/**
 * Keeps the extension version in one place.
 *
 * `package.json` is the source of truth. The build calls `syncVersion()` before
 * copying the manifest, and `npm run version:sync` updates the checked-in files
 * without running a full build.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const PACKAGE = join(ROOT, "package.json");
const LOCKFILE = join(ROOT, "package-lock.json");
const MANIFEST = join(ROOT, "src", "manifest.json");
const CONSTANTS = join(ROOT, "src", "shared", "constants.ts");
const OPTIONS_HTML = join(ROOT, "src", "ui", "options.html");

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${relative(ROOT, path)} is not valid JSON: ${error.message}`);
  }
}

function replaceExactlyOnce(source, pattern, replacement, path) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
  if (!matches || matches.length !== 1) {
    throw new Error(
      `Expected exactly one match for ${pattern} in ${relative(ROOT, path)}, found ${matches?.length ?? 0}.`,
    );
  }
  return source.replace(pattern, replacement);
}

function writeIfChanged(path, next, changed) {
  const current = readFileSync(path, "utf8");
  if (current === next) return;
  writeFileSync(path, next);
  changed.push(relative(ROOT, path));
}

export function readVersion() {
  const pkg = readJson(PACKAGE);
  const version = pkg.version;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw new Error(
      `package.json version must be a plain semver string like 1.2.3 (received ${JSON.stringify(version)}).`,
    );
  }
  return version;
}

/**
 * Writes the package.json version into every checked-in file that displays or
 * embeds it. Returns the list of files that changed.
 */
export function syncVersion({ quiet = false } = {}) {
  const version = readVersion();
  const changed = [];

  const manifestSource = readFileSync(MANIFEST, "utf8");
  const manifestNext = replaceExactlyOnce(
    manifestSource,
    /"version"\s*:\s*"[^"]*"/,
    `"version": "${version}"`,
    MANIFEST,
  );
  writeIfChanged(MANIFEST, manifestNext, changed);

  const constantsSource = readFileSync(CONSTANTS, "utf8");
  const constantsNext = replaceExactlyOnce(
    constantsSource,
    /export const VERSION = "[^"]*";/,
    `export const VERSION = "${version}";`,
    CONSTANTS,
  );
  writeIfChanged(CONSTANTS, constantsNext, changed);

  const optionsSource = readFileSync(OPTIONS_HTML, "utf8");
  const optionsNext = replaceExactlyOnce(
    optionsSource,
    /(<span id="version" class="pill">)v[^<]*(<\/span>)/,
    `$1v${version}$2`,
    OPTIONS_HTML,
  );
  writeIfChanged(OPTIONS_HTML, optionsNext, changed);

  // Keep the lockfile root version aligned so `npm ci` does not report a
  // mismatch after a manual version bump.
  try {
    const lock = readJson(LOCKFILE);
    let lockChanged = false;
    if (lock.version !== version) {
      lock.version = version;
      lockChanged = true;
    }
    if (lock.packages?.[""] && lock.packages[""].version !== version) {
      lock.packages[""].version = version;
      lockChanged = true;
    }
    if (lockChanged) {
      writeIfChanged(LOCKFILE, `${JSON.stringify(lock, null, 2)}\n`, changed);
    }
  } catch {
    // A missing or malformed lockfile is handled by `npm install`; it is not
    // required to build the extension.
  }

  if (!quiet) {
    if (changed.length === 0) {
      console.log(`[leetcomete] Version ${version} is already in sync.`);
    } else {
      console.log(`[leetcomete] Synced version ${version}:`);
      for (const file of changed) console.log(`  updated ${file}`);
    }
  }

  return { version, changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    syncVersion();
  } catch (error) {
    console.error(`[leetcomete] Version sync failed: ${error.message}`);
    process.exitCode = 1;
  }
}
