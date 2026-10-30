# Verification record

Date: 2026-10-30

This file records what was actually run and observed. It separates automated
checks, a browser harness against a synthetic page, and items that still require
manual verification on the live sites or in the Chrome Web Store.

## Summary

| Area | Result | Evidence |
| --- | --- | --- |
| TypeScript typecheck | **Pass** | `npm run typecheck` |
| Unit/integration tests | **Pass** | 9 test files, 87 tests |
| Production build | **Pass** | `npm run build` |
| Extension preflight | **Pass** | 5/5 checks |
| ZIP packaging | **Pass** | 15 files, `manifest.json` at root |
| ZIP integrity | **Pass** | `unzip -t` |
| Extracted ZIP loads unpacked | **Pass** | Brave 156 headless loaded the extracted archive |
| Extension loads in a Chromium browser | **Pass** | Brave 156 headless, service worker registered |
| Popup and options pages load | **Pass** | No page errors; version shown |
| Content scripts on a synthetic LeetCode page | **Pass** | Detected LeetCode / textarea / Java |
| Tab, Enter, arrows, Escape | **Pass** | Synthetic page; see details |
| Live LeetCode / GfG / HackerRank / Codeforces / CodeChef / AtCoder / Exercism | **Pending** | Not tested on live sites |
| Manual `chrome://extensions` load in Google Chrome | **Pending** | Chrome ignored the command-line flag; manual step |
| Chrome Web Store submission/review | **Pending** | Requires the user's developer account |
| Hosted privacy policy URL | **Pending** | Requires hosting/account |

## Environment

- macOS (Apple silicon), Node.js 24.21.0, npm 11.19.0.
- Brave Browser 156.1.98.62 (Chromium 156) used for the browser harness.
- Google Chrome 156.0.8078.48 installed. In this environment, launching it with
  `--load-extension=dist` did not load the unpacked extension, so the harness used
  Brave. The manual **Load unpacked** flow in Chrome is still required and has not
  been performed here.
- No Chrome Web Store developer account or public hosting was used.

## Automated checks

### `npm run check`

```text
tsc --noEmit                                  pass
vitest run                                    9 files, 87 tests, pass
node scripts/build.mjs                        pass
```

The build output was:

```text
manifest.json   2.4 KB
page-bridge.js  143.5 KB
content.js      2.9 KB
service-worker  4.3 KB
```

### `npm run preflight`

All five groups passed:

```text
PASS  manifest and referenced files
PASS  version consistency
PASS  package contents
PASS  HTML assets and CSP
PASS  JavaScript safety
```

The checks cover MV3, the 132-character description limit, version sync, only the
`storage` permission, no `host_permissions`, Chrome 111+, referenced files, PNG
icon dimensions, MAIN + ISOLATED content scripts with matching patterns,
`document_start`, no source maps, no `.ts`/`node_modules`/`.DS_Store` in the
package, no remote URLs, no inline scripts, no `eval`/`new Function`, and a
`chrome.*`-free MAIN-world bridge.

### `npm run package`

The package is written to `release/leetcomete-1.0.0.zip` with a `.sha256` file.
The archive root contains:

```text
manifest.json
popup.html
options.html
page-bridge.js
content.js
service-worker.js
icons/
assets/
```

`unzip -t` reported: `No errors detected in compressed data`.

Current artifact: 15 files, 69,313 bytes (67.7 KB), SHA-256
`dd6448f64b0e14a65afb009caa2c44e16175a050e3ee0e40a309bf3d26abdac4`.

### Extracted archive loaded in a browser

The packaged zip was extracted to a temporary directory and loaded with
`--load-extension` in Brave headless (port 9233). This verifies the exact
upload artifact, not just `dist/`:

- Root `manifest.json` present after extraction.
- Service worker registered at
  `chrome-extension://<id>/service-worker.js`.
- `chrome.runtime.getManifest()` returned `Leetcomete` 1.0.0, MV3,
  permissions `["storage"]`.
- Popup and options pages loaded without errors.
- Synthetic LeetCode page: detected `leetcode` / `textarea` / `java`, settings
  relayed, and all of Tab acceptance, ArrowDown selection, Enter acceptance, and
  Escape dismissal passed. Result: `BROWSER CHECK: PASS`.

## Browser harness

The harness launched Brave headless with:

```text
--headless=new
--disable-gpu
--ignore-certificate-errors
--host-resolver-rules="MAP leetcode.com 127.0.0.1, MAP www.leetcode.com 127.0.0.1"
--load-extension=<repo>/dist
--disable-extensions-except=<repo>/dist
--remote-debugging-port=9232
```

A local HTTPS server served a synthetic page at `https://leetcode.com:8443/` with:

- a native `<select name="language">` whose selected option is `Java`;
- a visible `<textarea class="code-editor">`;
- a page listener that records `window.postMessage` messages from the extension.

This exercises the real content-script injection, MAIN-world bridge, platform
detection, settings relay, service worker, storage, textarea adapter, popup, and
keyboard controller. It does **not** prove that the live LeetCode DOM matches the
selectors, and it does not exercise Monaco or CodeMirror.

Observed results:

- Service worker registered at
  `chrome-extension://<id>/service-worker.js`.
- `chrome.runtime.getManifest()` returned name `Leetcomete`, version `1.0.0`,
  `manifest_version` 3, permissions `["storage"]`.
- `chrome.storage.local` contained one `leetcomete.settings.v1` preferences
  object with the expected defaults.
- Popup page title: `Leetcomete`; no page errors. It displayed the waiting state
  when no supported tab was active.
- Options page title: `Leetcomete settings`; version `v1.0.0`; no page errors.
- Synthetic page status:
  `platform: leetcode`, `platformName: LeetCode`, `editor: textarea`,
  `language: java`, `supported: true`.
- The page received repeated `SETTINGS` messages from the isolated content
  script, confirming the bridge relay.
- Typing `int res` and pressing **Tab** produced `int result`, not
  `resultult`; the popup hid and did not reopen.
- Typing `int re` with candidates `result` and `response`, pressing
  **ArrowDown**, then **Tab** produced `int response`, proving the selection
  moved and was not reset by the arrow keyup.
- Typing `ret` and pressing **Enter** produced `return`, not a newline.
- Pressing **Escape** left the text unchanged, hid the popup (`display: none`),
  and it stayed hidden after the Escape keyup.

## Bugs found and fixed during verification

The browser harness exposed two behaviors that the jsdom tests did not catch:

1. **Textarea `keyup` reopened the popup after Escape.**
   The textarea adapter listened to `keyup` for change detection. Escape hid the
   popup on `keydown`, then the `keyup` scheduled a new completion pass and the
   popup reappeared. Arrow keyup could also reset the selected item. The adapter
   now uses `input` for text changes and `selectionchange`/`click` for caret
   changes; `keyup` is no longer a change source.

2. **Programmatic `selectionchange` reopened the popup after acceptance.**
   `applyCompletion` moves the caret, which queues a `selectionchange`. The old
   suppression window only lasted for the current task, so the popup reopened on
   the completed identifier. `EditorAdapter.onDidChange` now reports
   `"text"` vs `"selection"`; the controller suppresses the programmatic text
   event for the current task and the programmatic selection event for 100 ms,
   and re-enables selection updates on the next real keydown.

Regression tests were added for both cases. The suite increased from 85 to 87
tests and still passes.

## Not verified

The following are deliberately not claimed as passing:

- Live-site DOM selectors and language detection on LeetCode, GeeksforGeeks,
  HackerRank, Codeforces, CodeChef, AtCoder, or Exercism.
- Monaco native completion on the real LeetCode editor.
- CodeMirror 5 integration on a live site.
- CodeMirror 6 unsupported messaging on a live Exercism exercise.
- Loading `dist/` and the extracted zip through `chrome://extensions` in the
  user's Google Chrome profile. (The extracted zip was loaded via the Brave
  command-line harness, which is not the same as the manual Chrome flow.)
- Chrome Web Store upload, review, or publication.
- Hosting `site/privacy.html` at a public URL.
- Store screenshots and promotional assets.

Use [MANUAL_TESTING.md](MANUAL_TESTING.md) for the live-site checklist and record
actual results there.
