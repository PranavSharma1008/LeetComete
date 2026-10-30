#!/usr/bin/env node
/**
 * Builds the Chrome Web Store upload archive.
 *
 * The archive contains the *contents* of dist/ at the root (manifest.json must
 * be the first-level entry), which is what Chrome expects for an unpacked
 * folder and for a Web Store upload.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPreflight } from "./preflight.mjs";
import { createZip } from "./zip.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const RELEASE = join(ROOT, "release");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function main() {
  if (!existsSync(DIST)) {
    throw new Error("dist/ does not exist. Run `npm run build` first.");
  }

  const results = runPreflight();
  if (results.some((result) => !result.ok)) {
    throw new Error("Preflight failed; fix the issues above before packaging.");
  }

  const pkg = readJson(join(ROOT, "package.json"));
  const manifest = readJson(join(DIST, "manifest.json"));
  if (manifest.version !== pkg.version) {
    throw new Error(
      `dist/manifest.json is ${manifest.version}, but package.json is ${pkg.version}. Re-run npm run build.`,
    );
  }

  const files = walk(DIST).sort();
  if (!files.some((path) => relative(DIST, path) === "manifest.json")) {
    throw new Error("dist/manifest.json is missing; the archive must have manifest.json at its root.");
  }

  const entries = files.map((path) => ({
    name: relative(DIST, path).split("\\").join("/"),
    data: readFileSync(path),
  }));

  mkdirSync(RELEASE, { recursive: true });
  const baseName = `leetcomete-${pkg.version}`;
  const zipPath = join(RELEASE, `${baseName}.zip`);
  const checksumPath = join(RELEASE, `${baseName}.zip.sha256`);

  rmSync(zipPath, { force: true });
  rmSync(checksumPath, { force: true });

  const archive = createZip(entries);
  writeFileSync(zipPath, archive);
  const checksum = createHash("sha256").update(archive).digest("hex");
  writeFileSync(checksumPath, `${checksum}  ${baseName}.zip\n`);

  console.log("\n[leetcomete] Chrome Web Store package");
  console.log(`  archive   ${relative(ROOT, zipPath)}`);
  console.log(`  files     ${entries.length}`);
  console.log(`  size      ${formatBytes(statSync(zipPath).size)}`);
  console.log(`  sha256    ${checksum}`);
  console.log(`  checksum  ${relative(ROOT, checksumPath)}`);
  console.log("\n  The archive root contains:");
  for (const entry of entries.filter((entry) => !entry.name.includes("/"))) {
    console.log(`    ${entry.name}`);
  }
  console.log("\n  Upload the .zip at https://chrome.google.com/webstore/devconsole");
  console.log("  or extract it and use chrome://extensions -> Load unpacked.\n");
}

try {
  main();
} catch (error) {
  console.error(`[leetcomete] Packaging failed: ${error.message}`);
  process.exitCode = 1;
}
