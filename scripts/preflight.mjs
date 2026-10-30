#!/usr/bin/env node
/**
 * Validates the built extension before it is loaded unpacked or uploaded.
 *
 * This is intentionally independent of Chrome: it catches the packaging errors
 * that are most common in Chrome Web Store submissions (wrong manifest
 * version, missing referenced files, remote scripts, source maps, oversized
 * description, and permissions that are broader than documented).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const PACKAGE = join(ROOT, "package.json");
const SRC_MANIFEST = join(ROOT, "src", "manifest.json");
const CONSTANTS = join(ROOT, "src", "shared", "constants.ts");
const OPTIONS_HTML = join(ROOT, "src", "ui", "options.html");

const REQUIRED_ROOT_FILES = [
  "manifest.json",
  "popup.html",
  "options.html",
  "page-bridge.js",
  "content.js",
  "service-worker.js",
];

const REQUIRED_ICON_SIZES = [16, 32, 48, 128];
const ALLOWED_PERMISSIONS = new Set(["storage"]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${relative(ROOT, path)} is not valid JSON: ${error.message}`);
  }
}

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

function relativeToDist(path) {
  return relative(DIST, path).split(sep).join("/");
}

function pngSize(path) {
  const buffer = readFileSync(path);
  const signature = buffer.subarray(0, 8);
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!signature.equals(expected)) fail(`${relativeToDist(path)} is not a PNG file.`);
  assert(buffer.length >= 24, `${relativeToDist(path)} is truncated.`);
  assert(buffer.toString("ascii", 12, 16) === "IHDR", `${relativeToDist(path)} has no IHDR chunk.`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function localReferences(htmlPath) {
  const source = readText(htmlPath);
  const references = [];
  const pattern = /\b(?:src|href)=["']([^"']+)["']/gi;
  for (const match of source.matchAll(pattern)) {
    const value = match[1];
    if (!value) continue;
    if (value.startsWith("#") || value.startsWith("data:") || value.startsWith("mailto:")) continue;
    references.push(value);
  }
  return references;
}

function checkManifest() {
  assert(existsSync(DIST), "dist/ does not exist. Run `npm run build` first.");
  const manifestPath = join(DIST, "manifest.json");
  assert(existsSync(manifestPath), "dist/manifest.json is missing.");

  const manifest = readJson(manifestPath);
  const pkg = readJson(PACKAGE);

  assert(manifest.manifest_version === 3, "manifest_version must be 3 (Manifest V3).");
  assert(typeof manifest.name === "string" && manifest.name.trim().length > 0, "manifest name is missing.");
  assert(manifest.name.length <= 75, `manifest name is ${manifest.name.length} characters; the Chrome Web Store limit is 75.`);
  assert(
    typeof manifest.description === "string" && manifest.description.trim().length > 0,
    "manifest description is missing.",
  );
  assert(
    manifest.description.length <= 132,
    `manifest description is ${manifest.description.length} characters; the Chrome Web Store limit is 132.`,
  );
  assert(manifest.version === pkg.version, `manifest version ${manifest.version} does not match package.json ${pkg.version}.`);

  const chromeVersion = Number.parseInt(String(manifest.minimum_chrome_version ?? "0"), 10);
  assert(
    Number.isFinite(chromeVersion) && chromeVersion >= 111,
    "minimum_chrome_version must be 111 or newer because the extension uses MAIN-world content scripts.",
  );

  const permissions = manifest.permissions ?? [];
  assert(Array.isArray(permissions), "manifest permissions must be an array.");
  for (const permission of permissions) {
    assert(
      ALLOWED_PERMISSIONS.has(permission),
      `unexpected permission "${permission}". This build documents only: ${[...ALLOWED_PERMISSIONS].join(", ")}.`,
    );
  }
  assert(permissions.includes("storage"), "the storage permission is required for settings.");

  assert(!manifest.host_permissions, "host_permissions must not be requested; site access is limited to content-script matches.");
  assert(!manifest.optional_permissions, "optional_permissions must not be requested in this build.");

  const csp = manifest.content_security_policy?.extension_pages;
  if (csp) {
    assert(!/unsafe-eval/i.test(csp), "extension_pages CSP must not allow unsafe-eval.");
    assert(!/https?:/i.test(csp), "extension_pages CSP must not load remote scripts.");
  }

  const background = manifest.background;
  assert(background?.service_worker, "background.service_worker is missing.");
  assert(background.type === "module", "the service worker must be declared as a module.");
  assert(existsSync(join(DIST, background.service_worker)), `missing ${background.service_worker}.`);

  assert(manifest.action?.default_popup, "action.default_popup is missing.");
  assert(existsSync(join(DIST, manifest.action.default_popup)), `missing ${manifest.action.default_popup}.`);
  assert(manifest.options_ui?.page, "options_ui.page is missing.");
  assert(existsSync(join(DIST, manifest.options_ui.page)), `missing ${manifest.options_ui.page}.`);

  const icons = manifest.icons ?? {};
  for (const size of REQUIRED_ICON_SIZES) {
    assert(icons[String(size)], `manifest.icons is missing the ${size}px icon.`);
  }
  for (const [size, iconPath] of Object.entries(icons)) {
    const path = join(DIST, iconPath);
    assert(existsSync(path), `missing icon ${iconPath}.`);
    const { width, height } = pngSize(path);
    assert(
      width === Number(size) && height === Number(size),
      `${iconPath} is ${width}x${height}; expected ${size}x${size}.`,
    );
  }

  const actionIcons = manifest.action?.default_icon ?? {};
  for (const [size, iconPath] of Object.entries(actionIcons)) {
    assert(existsSync(join(DIST, iconPath)), `missing action icon ${iconPath}.`);
    const { width, height } = pngSize(join(DIST, iconPath));
    assert(width === Number(size) && height === Number(size), `action icon ${iconPath} has the wrong dimensions.`);
  }

  const scripts = manifest.content_scripts ?? [];
  assert(Array.isArray(scripts) && scripts.length === 2, "expected exactly two content scripts (MAIN and ISOLATED).");
  const worlds = new Map(scripts.map((script) => [script.world ?? "ISOLATED", script]));
  assert(worlds.has("MAIN"), "the MAIN-world page bridge content script is missing.");
  assert(worlds.has("ISOLATED"), "the isolated content script is missing.");

  const main = worlds.get("MAIN");
  const isolated = worlds.get("ISOLATED");
  assert(main.js?.includes("page-bridge.js"), "the MAIN-world content script must load page-bridge.js.");
  assert(isolated.js?.includes("content.js"), "the isolated content script must load content.js.");
  for (const script of [main, isolated]) {
    assert(script.run_at === "document_start", "content scripts must run at document_start.");
    assert(Array.isArray(script.matches) && script.matches.length > 0, "content script matches are missing.");
    for (const match of script.matches) {
      assert(match.startsWith("https://"), `content script match "${match}" must use https.`);
      assert(!match.includes("<all_urls>"), "content script matches must not use <all_urls>.");
    }
    for (const file of script.js ?? []) {
      assert(existsSync(join(DIST, file)), `missing content script ${file}.`);
    }
  }
  assert(
    JSON.stringify([...main.matches].sort()) === JSON.stringify([...isolated.matches].sort()),
    "MAIN and ISOLATED content scripts must use the same match patterns.",
  );

  const resources = manifest.web_accessible_resources ?? [];
  for (const resource of resources) {
    for (const match of resource.matches ?? []) {
      assert(match !== "<all_urls>", "web_accessible_resources must not expose <all_urls>.");
    }
  }

  return { manifest, pkg };
}

function checkVersionSources(manifest, pkg) {
  const sourceManifest = readJson(SRC_MANIFEST);
  assert(
    sourceManifest.version === pkg.version,
    `src/manifest.json version ${sourceManifest.version} does not match package.json ${pkg.version}. Run npm run version:sync.`,
  );

  const constants = readText(CONSTANTS);
  const constantsMatch = constants.match(/export const VERSION = "([^"]+)";/);
  assert(constantsMatch, "src/shared/constants.ts does not export VERSION.");
  assert(
    constantsMatch[1] === pkg.version,
    `src/shared/constants.ts VERSION ${constantsMatch[1]} does not match package.json ${pkg.version}. Run npm run version:sync.`,
  );

  const options = readText(OPTIONS_HTML);
  assert(
    options.includes(`v${pkg.version}`),
    `src/ui/options.html does not display v${pkg.version}. Run npm run version:sync.`,
  );

  assert(
    manifest.version === pkg.version,
    "dist/manifest.json is stale relative to package.json. Re-run npm run build.",
  );
}

function checkFiles() {
  for (const file of REQUIRED_ROOT_FILES) {
    const path = join(DIST, file);
    assert(existsSync(path), `missing dist/${file}.`);
    assert(statSync(path).size > 0, `dist/${file} is empty.`);
  }

  const files = walk(DIST);
  for (const path of files) {
    const name = relativeToDist(path);
    assert(!name.endsWith(".map"), `source map found in the package: ${name}`);
    assert(!/\.(ts|tsx|mts|cts|scss|sass|vue|svelte)$/.test(name), `source file found in the package: ${name}`);
    assert(!name.split("/").includes("node_modules"), `node_modules found in the package: ${name}`);
    assert(!name.startsWith(".DS_Store"), `macOS metadata found in the package: ${name}`);
  }

  const total = files.reduce((sum, path) => sum + statSync(path).size, 0);
  assert(total < 10 * 1024 * 1024, `dist/ is ${(total / 1024 / 1024).toFixed(1)} MB; keep the package under 10 MB.`);
}

function checkHtml() {
  for (const page of ["popup.html", "options.html"]) {
    const path = join(DIST, page);
    const source = readText(path);
    assert(/<title>[^<]+<\/title>/i.test(source), `${page} is missing a title.`);
    assert(!/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(source), `${page} contains an inline script, which MV3 blocks.`);
    assert(!/(?:src|href)=["']https?:\/\//i.test(source), `${page} references a remote script or stylesheet.`);

    for (const reference of localReferences(path)) {
      if (/^(?:https?:)?\/\//i.test(reference)) continue;
      const clean = reference.split(/[?#]/)[0];
      if (!clean) continue;
      const target = clean.startsWith("/") ? join(DIST, clean) : resolve(dirname(path), clean);
      assert(target.startsWith(DIST), `${page} references a file outside dist/: ${reference}`);
      assert(existsSync(target), `${page} references a missing file: ${reference}`);
    }
  }
}

function checkJavaScript() {
  const jsFiles = walk(DIST).filter((path) => extname(path) === ".js");
  for (const path of jsFiles) {
    const name = relativeToDist(path);
    const source = readText(path);
    assert(!/sourceMappingURL/.test(source), `${name} contains a sourceMappingURL comment.`);
    assert(!/\bhttps?:\/\//.test(source), `${name} contains a remote URL; the extension must not load remote code.`);
    assert(!/(^|[^.\w$])eval\s*\(/m.test(source), `${name} uses eval(), which MV3 blocks.`);
    assert(!/\bnew\s+Function\s*\(/.test(source), `${name} uses new Function(), which MV3 blocks.`);
  }

  const bridge = readText(join(DIST, "page-bridge.js"));
  assert(!/\bchrome\./.test(bridge), "page-bridge.js must not use chrome.* APIs in the page's MAIN world.");
  assert(!/\bexport\s/.test(bridge), "page-bridge.js must be a self-contained IIFE, not an ES module.");

  const content = readText(join(DIST, "content.js"));
  assert(/\bchrome\./.test(content), "content.js should own chrome.* storage/runtime access.");
  assert(!/\bexport\s/.test(content), "content.js must be a self-contained IIFE, not an ES module.");
}

export function runPreflight({ quiet = false } = {}) {
  const checks = [
    ["manifest and referenced files", () => checkManifest()],
    ["version consistency", () => checkVersionSources(...Object.values(checkManifestCache()))],
    ["package contents", checkFiles],
    ["HTML assets and CSP", checkHtml],
    ["JavaScript safety", checkJavaScript],
  ];

  // Avoid parsing the manifest twice while keeping each check independent.
  let cached = null;
  function checkManifestCache() {
    if (!cached) cached = checkManifest();
    return cached;
  }

  const results = [];
  for (const [name, run] of checks) {
    try {
      run();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  }

  if (!quiet) {
    console.log("\n[leetcomete] Extension preflight");
    for (const result of results) {
      console.log(`  ${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
      if (!result.ok) console.log(`        ${result.error}`);
    }
    const failures = results.filter((result) => !result.ok);
    console.log(
      failures.length === 0
        ? "\n[leetcomete] All preflight checks passed.\n"
        : `\n[leetcomete] ${failures.length} preflight check(s) failed.\n`,
    );
  }

  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const results = runPreflight();
    if (results.some((result) => !result.ok)) process.exitCode = 1;
  } catch (error) {
    console.error(`[leetcomete] Preflight crashed: ${error.message}`);
    process.exitCode = 1;
  }
}
