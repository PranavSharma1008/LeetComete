# Leetcomete

Local-first, VS Code-style autocomplete for code editors on competitive-programming and practice sites.

Leetcomete is a Chrome Manifest V3 extension. It detects the editor on supported pages, indexes the code in the page, and ranks variables, parameters, functions, methods, classes, keywords, built-ins, and type-inferred members. All analysis happens in the browser. There is no account, API key, remote model, or source-code upload.

> **Verification status:** the engine, DOM adapters, platform detection, settings, production build, packaging, and preflight checks are covered by automated tests. A Chromium browser harness also loaded the unpacked extension, exercised the popup/options/service worker, and tested Tab/Enter/arrow/Escape behavior on a synthetic LeetCode page. Live third-party sites, Monaco on the real LeetCode domain, and CodeMirror pages still require manual verification and are documented as **manual/pending**. See [docs/VERIFICATION.md](docs/VERIFICATION.md) and [docs/MANUAL_TESTING.md](docs/MANUAL_TESTING.md).

## Features

- **Universal identifier engine** for 15 languages: Java, C, C++, Python, JavaScript, TypeScript, C#, Go, Rust, Kotlin, Swift, Ruby, PHP, Scala, and SQL.
- **Editor integrations**:
  - Monaco through its native completion provider, so Monaco owns the popup, keyboard handling, and undo stack.
  - CodeMirror 5 through a shadow-DOM popup and captured keyboard handling.
  - Plain `<textarea>` editors with caret-anchored suggestions.
  - CodeMirror 6 is detected and reported as unsupported instead of being faked.
- **Context-aware ranking**: exact/prefix/camel-case/fuzzy matching, local-scope proximity, declaration kind, and usage frequency.
- **Type inference for members**: declarations such as `String word`, `const items = []`, `let map = new HashMap<>()`, and `self.cache` feed member suggestions after `.`, `->`, and `::`.
- **No duplicate characters**: acceptance replaces exactly the typed prefix and restores the caret.
- **Keyboard-first**: `Tab` and `Enter` accept, arrows navigate, `Escape` dismisses, `Ctrl+Space` / `Alt+/` trigger explicitly.
- **Privacy by default**: settings live in `chrome.storage.local`; Chrome Sync is an explicit opt-in mirror. Only the `storage` permission is requested.
- **Popup and options UI** with live page status, quick toggles, per-platform switches, per-language switches, behavior tuning, theme control, and a local reset.

## Supported platforms

| Platform | Detection | Editor path | Status |
| --- | --- | --- | --- |
| **LeetCode** (`.com` / `.cn`) | Host + language dropdown | Monaco native provider first; CodeMirror 5 and textarea fallbacks | Priority target. Selectors and live behavior need manual verification. |
| **GeeksforGeeks** | Host + language controls | CodeMirror 5, then textarea | Best-effort selectors; manual verification pending. |
| **HackerRank** | Host + language select | CodeMirror 5, then textarea | Best-effort selectors; manual verification pending. |
| **Codeforces** | Host + `programTypeId` / `languageId` | CodeMirror 5, then textarea | Best-effort selectors; manual verification pending. |
| **CodeChef** | Host + language select | CodeMirror 5, then textarea | Best-effort selectors; manual verification pending. |
| **AtCoder** | Host + `language_id` select | CodeMirror 5, then textarea | Best-effort selectors; manual verification pending. |
| **Exercism** | Host + language controls | CodeMirror 6 detection | **Not supported.** CodeMirror 6 is reported as unsupported. |

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the detailed matrix and confidence levels.

## Languages

| Language | IDs | Examples of indexed constructs |
| --- | --- | --- |
| Java | `java` | classes, methods, fields, locals, generics, `this.member` |
| C | `c` | functions, structs, typedefs, locals, macros-aware lexing |
| C++ | `cpp` | classes, methods, fields, templates, `::`, `->` |
| Python | `python` | functions, classes, parameters, `self.attr`, imports |
| JavaScript | `javascript` | functions, classes, `const`/`let`, arrow params, members |
| TypeScript | `typescript` | interfaces, types, enums, typed members |
| C# | `csharp` | classes, methods, properties, fields, `this.member` |
| Go | `go` | functions, methods, structs, vars, short declarations |
| Rust | `rust` | functions, structs, enums, `let`, `impl` members |
| Kotlin | `kotlin` | classes, functions, `val`/`var`, data classes |
| Swift | `swift` | functions, classes, structs, `let`/`var`, `self.member` |
| Ruby | `ruby` | methods, classes, block parameters, `attr_accessor` |
| PHP | `php` | functions, classes, methods, `$variables` |
| Scala | `scala` | classes, objects, methods, `val`/`var`, case classes |
| SQL | `sql` | tables, aliases, columns in common `SELECT` shapes |

## Install and build

Requirements: Node.js 20+ and Chrome/Chromium 111+ (the extension uses `world: "MAIN"` content scripts).

```bash
npm install
npm run check        # typecheck + 87 tests + production build
npm run preflight    # validate the built extension
npm run package      # check + preflight + release/leetcomete-<version>.zip
```

Load the unpacked extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the generated `dist/` directory.
4. Open a supported problem page and **reload the tab** so the content scripts are injected.
5. Click the toolbar icon to see the detected platform, editor, language, and index time.

Development:

```bash
npm run dev          # rebuild on changes under src/
npm test             # Vitest + jsdom
npm run typecheck
npm run build
npm run preflight    # validate dist/ before loading or uploading
npm run icons        # regenerate PNG icons into dist/icons
npm run version:sync # sync the package version into manifest/constants/options
```

## Package for the Chrome Web Store

```bash
npm run package
```

This runs the typecheck, 87 tests, production build, preflight validation, and
creates:

- `release/leetcomete-<version>.zip` — upload this file; `manifest.json` is at
  the archive root, not inside a `dist/` folder.
- `release/leetcomete-<version>.zip.sha256` — checksum of the archive.

`npm run preflight` independently validates MV3, version consistency, referenced
files, PNG icon dimensions, content-script worlds, `storage`-only permissions, no
remote URLs, no inline scripts, no source maps, no `eval`/`new Function`, and a
`chrome.*`-free MAIN-world bridge.

Versioning: `package.json` is the source of truth. `npm run build` syncs it into
`src/manifest.json`, `src/shared/constants.ts`, `src/ui/options.html`, and the
lockfile. After a version bump, run `npm run version:sync` or just rebuild.

## Publish and host

- Follow [docs/PUBLISHING.md](docs/PUBLISHING.md) for the full load-unpacked,
  version-bump, Chrome Web Store upload, and hosting workflow.
- Use [store/listing.md](store/listing.md) for ready-to-paste listing copy,
  permission justifications, privacy-practices answers, reviewer test
  instructions, and screenshot guidance.
- Host the static landing page and privacy policy from [`site/`](site/). The
  privacy policy URL is `https://<your-host>/privacy.html`; see
  [site/README.md](site/README.md) for GitHub Pages, Cloudflare Pages, and
  Netlify instructions.
- Chrome Web Store requires a public HTTPS privacy-policy URL and a monitored
  support contact. Both are user-specific and cannot be completed by the build.

## How it works

```text
src/
  completion/        lexer, scopes, type inference, identifier extraction,
                     context, ranking, index cache, completion engine
  languages/         15 language definitions, detection, member registries
  editors/           adapter contract, textarea/CodeMirror adapters,
                     Monaco provider, popup controller, editor lifecycle
  platforms/         host detection, language hints, textarea fallbacks
  ui/                shadow-DOM popup, extension popup, options page
  content/           MAIN-world page bridge + isolated settings relay
  background/        MV3 service worker, status/settings messaging
  shared/            types, defaults, storage, messaging, constants
scripts/             build, icon generation, version sync, preflight, packaging
tests/               Vitest + jsdom suites
docs/                compatibility, manual testing, verification, publishing
site/                hostable landing page + privacy policy (plain HTML/CSS)
store/               Chrome Web Store listing copy and review checklist
release/             generated zip + SHA-256 (not checked in)
```

The extension deliberately avoids a compiler or language server. A small synchronous lexer produces tokens and blocked ranges (comments/strings), a scope builder produces nested regions, and an extractor records declarations and identifier frequencies. The completion engine builds an LRU-cached index per document snapshot, infers receiver types for member access, and ranks candidates with a transparent scoring function.

The page bridge runs in the page's MAIN world so it can see the real Monaco/CodeMirror objects. The isolated content script owns `chrome.storage` access and relays settings and status through `window.postMessage`. No source text crosses that boundary.

## Privacy model

- **No network requests.** There is no `fetch`, WebSocket, analytics SDK, remote model, or telemetry code.
- **No code storage.** Source text is indexed in memory for the current page and discarded when the index cache is evicted or the tab closes.
- **Preferences only.** `chrome.storage.local` stores the settings object. If the user enables sync, the same preferences object is mirrored to `chrome.storage.sync`.
- **Minimal permission.** `permissions: ["storage"]`. Site access is declared through the seven platform content-script match patterns.
- **Debug logging** is opt-in and stays in the page console / in-memory logger.

## Known limitations

- Analysis is heuristic, not semantic. It is not a compiler, LSP, or type checker.
- Member suggestions rely on local type inference and a curated member registry. Complex generic, dynamic, or framework types may be incomplete.
- CodeMirror 6 is not integrated. Exercism commonly uses it and will show as unsupported.
- Monaco integration depends on the page exposing `window.monaco` and registering its language IDs. Some sites may hide or wrap Monaco differently.
- Textarea caret geometry uses a hidden mirror. Unusual CSS transforms, zoom levels, or shadow DOM editors may offset the popup.
- Framework-controlled editors may rewrite the DOM after acceptance. The textarea adapter detects this and reports failure, but cannot force a React/Vue state update.
- Platform selectors are intentionally narrow and best-effort. A site redesign can break language detection or editor discovery.
- Only Chromium 111+ is targeted. Firefox and Safari are not supported.
- Live-site verification is pending; see the manual test plan.

## Verification

[docs/VERIFICATION.md](docs/VERIFICATION.md) records exactly what was run:
typecheck, 87 tests, production build, preflight, ZIP packaging, and a Chromium
browser harness against a synthetic LeetCode page. The harness loaded the
extension, registered the service worker, opened the popup/options pages, and
verified Tab acceptance, arrow navigation, Enter acceptance, Escape dismissal,
and no popup reopening after acceptance. It also found and fixed two real
keyboard/selection bugs.

Live-site selectors, Monaco on the real LeetCode domain, CodeMirror 5 pages, and
CodeMirror 6 unsupported messaging remain **manual**. Use
[docs/MANUAL_TESTING.md](docs/MANUAL_TESTING.md) and record actual results; do not
infer live-site compatibility from the synthetic harness.

## Testing

```bash
npm test
```

The suite covers:

- lexer behavior across comments, strings, preprocessor lines, Rust lifetimes, and Python triple quotes;
- declaration extraction for all 15 languages, including `this`/`self` members and record components;
- ranking, deduplication, fuzzy matching, scope proximity, and max results;
- completion context, member completion, blocked comments/strings, cache reuse, and a 2,000-declaration performance case;
- language detection from platform hints, Monaco IDs, and source code;
- platform host detection, language-hint extraction, and textarea discovery;
- textarea acceptance, caret placement, snippet cursors, keyboard predicates, controller acceptance/navigation/dismissal, Escape keyup, and programmatic `selectionchange` suppression;
- settings defaults, clamping, local persistence, optional sync mirroring, and sync precedence.

For the manual checklist, see [docs/MANUAL_TESTING.md](docs/MANUAL_TESTING.md).

## Troubleshooting

- **No status in the popup:** reload the tab after installing or updating; content scripts are not injected into already-open pages.
- **Popup says "Waiting for a supported editor":** the page may still be loading, the editor may be inside a cross-origin iframe, or the site may use CodeMirror 6.
- **Monaco popup does not appear:** the page may not expose `window.monaco`, or the model's language ID may not be in the registry. Check the popup's language and editor fields.
- **Suggestions are missing after changing settings:** settings apply on the next typing change or page refresh.
- **A site is broken:** disable that platform in options and reload the tab.
- **Upload says the manifest is missing:** the zip must have `manifest.json` at its root. Use `npm run package` instead of zipping the project folder.
- **Preflight says the version is stale:** run `npm run version:sync` and `npm run build`, then retry.
- **Chrome ignores `--load-extension`:** use `chrome://extensions` → Developer mode → **Load unpacked**; current branded Chrome builds may ignore the command-line flag.

## License

No license file is included in this build. Add one before distributing. The
Chrome Web Store does not require a specific license, but a repository license
and a monitored support contact are recommended before publishing.
