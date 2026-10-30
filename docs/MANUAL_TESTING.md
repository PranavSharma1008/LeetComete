# Manual test plan

Live-site verification is **pending**. The automated suite validates the engine,
DOM adapters, settings, and platform detection in jsdom, but it cannot prove that
a third-party site's current DOM, Monaco version, or editor lifecycle matches the
selectors in this repository. A Chromium browser harness also exercised a
synthetic LeetCode page; see [VERIFICATION.md](VERIFICATION.md) for exactly what
that covered and what it did not. Use this checklist in a real Chrome/Chromium
111+ profile and record actual results.

## 0. Build and load

- [ ] `npm install`
- [ ] `npm run check` succeeds (typecheck, 87 tests, build).
- [ ] `npm run preflight` passes every check.
- [ ] `npm run package` creates `release/leetcomete-<version>.zip`.
- [ ] `unzip -l` shows `manifest.json` at the archive root, not inside `dist/`.
- [ ] `unzip -t` reports no errors.
- [ ] `chrome://extensions` → Developer mode → **Load unpacked** → `dist/`.
- [ ] The extension loads with no manifest errors.
- [ ] Toolbar icon opens the popup.
- [ ] Popup version matches `package.json` / `dist/manifest.json`.
- [ ] Options page opens from the popup and from the extension details page.
- [ ] Service worker shows as active; no uncaught exceptions in its console.
- [ ] Extract the zip to a temporary folder, load that folder unpacked, and repeat
      the popup/options/service-worker checks. This verifies the exact uploaded
      artifact, not just `dist/`.

> The automated browser harness used Brave (Chromium 156) because the installed
> branded Google Chrome build ignored `--load-extension` in this environment.
> The manual **Load unpacked** flow in Chrome is still required. See
> [VERIFICATION.md](VERIFICATION.md) for what the harness covered.

## 1. Popup and settings

- [ ] Popup shows the extension version.
- [ ] On a non-supported page, status says the site is unsupported.
- [ ] Master switch pauses and resumes completion.
- [ ] Quick toggles update `chrome.storage.local` and survive popup reopen.
- [ ] Options changes save automatically; "Saved locally" appears.
- [ ] Theme Auto/Light/Dark changes popup and options appearance.
- [ ] Reset restores defaults and removes the optional sync copy.
- [ ] Enabling sync writes the settings object to `chrome.storage.sync`.
- [ ] Disabling sync removes the synced copy but keeps local settings.

## 2. LeetCode (priority)

Open a problem page and reload the tab after installing/updating the extension.

### Status

- [ ] Popup reports **LeetCode connected**.
- [ ] Editor reports **Monaco** on the normal code editor.
- [ ] Language matches the selected LeetCode language.
- [ ] Index time is a small number (typically single-digit or low tens of ms).

### Core completion

- [ ] Type a declared local variable prefix; it appears above keywords.
- [ ] Type a parameter prefix; parameter ranks highly.
- [ ] Type a method/function prefix; it appears.
- [ ] Type a class name prefix; it appears.
- [ ] Type a keyword prefix; keyword appears when enabled.
- [ ] Type a built-in type prefix; built-in appears when enabled.
- [ ] Type a snippet prefix (for example `fori` in Java); snippet appears.
- [ ] No duplicate labels appear in the list.

### Members

- [ ] `String word = "hello";` then `word.` suggests `length`, `substring`, etc.
- [ ] `this.` suggests fields and methods of the current class.
- [ ] `self.` in Python suggests `self` attributes.
- [ ] C++ `object->` and `Type::` suggest members.
- [ ] Member suggestions respect the "Member suggestions" setting.

### Keyboard and editing

- [ ] `ArrowDown` / `ArrowUp` change the selected item without moving the caret.
- [ ] `Tab` accepts the selected item.
- [ ] `Enter` accepts when the popup is visible; otherwise it inserts a newline.
- [ ] `Escape` closes the popup and leaves the text unchanged.
- [ ] The popup stays closed after the `Escape` key is released.
- [ ] The popup does not immediately reopen after accepting a suggestion.
- [ ] Arrow-key navigation is not reset by the keyup that follows the arrow press.
- [ ] `Ctrl+Space` and `Alt+/` open completion explicitly even below the prefix threshold.
- [ ] Accepting never duplicates the typed prefix (for example `res` + `result` must not become `resultult`).
- [ ] Accepting a snippet places the caret at the intended position.
- [ ] Monaco undo (`Ctrl+Z`) undoes the accepted completion as one edit.
- [ ] Auto-indent, bracket closing, comment toggling, and other Monaco shortcuts still work.
- [ ] Typing inside a comment or string does not show the popup.
- [ ] Popup stays within the viewport near the bottom/right edges.
- [ ] Popup is readable in light and dark themes.

### Language switching

- [ ] Switch the LeetCode language; the popup language updates after the next typing change or a short delay.
- [ ] Disable the selected language in options; no language-specific suggestions appear.
- [ ] Disable LeetCode in options; status says completion is off for LeetCode.

## 3. CodeMirror 5 fallback

Use a supported site/page that still exposes CodeMirror 5, or temporarily test on
GeeksforGeeks / Codeforces / CodeChef / AtCoder where available.

- [ ] Popup reports **CodeMirror 5**.
- [ ] Popup anchors near the caret.
- [ ] `Tab`, `Enter`, arrows, and `Escape` behave as above.
- [ ] Accepted text replaces only the typed prefix.
- [ ] Cursor is restored after acceptance.
- [ ] Undo works in the editor's native stack.
- [ ] Editor indentation and shortcut keys still work when the popup is hidden.

## 4. Textarea fallback

- [ ] Popup reports **Textarea**.
- [ ] Popup anchors near the caret, including after scrolling.
- [ ] Acceptance updates the textarea value and caret.
- [ ] Framework-controlled textareas either update correctly or fail visibly without corrupting text.
- [ ] Search/comment/chat textareas are not hijacked.

## 5. Unsupported editor behavior

- [ ] On an Exercism page using CodeMirror 6, popup reports unsupported.
- [ ] On a page with no recognized editor, popup says it is waiting for a supported editor.
- [ ] No popup or keyboard interception occurs on unsupported sites.

## 6. Languages

For each language, use a short snippet with a local variable, a function, and a
member access where applicable. Confirm the declared names are suggested and the
language does not obviously fall back to the wrong keyword set.

- [ ] Java
- [ ] C
- [ ] C++
- [ ] Python
- [ ] JavaScript
- [ ] TypeScript
- [ ] C#
- [ ] Go
- [ ] Rust
- [ ] Kotlin
- [ ] Swift
- [ ] Ruby
- [ ] PHP
- [ ] Scala
- [ ] SQL

## 7. Privacy and permissions

- [ ] `chrome://extensions` → Details shows only the **storage** permission.
- [ ] Open DevTools → Network while typing in an editor; no requests are made by the extension.
- [ ] `chrome.storage.local` contains only the `leetcomete.settings.v1` preferences object.
- [ ] No source code appears in storage.
- [ ] With sync disabled, `chrome.storage.sync` has no `leetcomete.settings.v1` key.
- [ ] Debug logging off produces no Leetcomete console noise.

## 8. Performance and robustness

- [ ] A typical LeetCode solution remains responsive while typing.
- [ ] Paste a 2,000+ line file; completion still appears within a reasonable time.
- [ ] Rapid typing does not leave stale popups or duplicate text.
- [ ] Switching between problems (SPA navigation) reattaches to the new editor.
- [ ] Reloading the page reattaches correctly.
- [ ] Opening two tabs with different languages keeps each tab's status independent.
- [ ] Closing a tab removes its session status.
- [ ] No memory growth from repeated editor remounts (popup hosts are removed on session disposal).

## 9. Package and hosted pages

- [ ] `release/leetcomete-<version>.zip` is the file that will be uploaded.
- [ ] The zip contains no `.map`, `.ts`, `node_modules`, or `.DS_Store` files.
- [ ] The zip contains the four icon sizes and both UI pages.
- [ ] `manifest.json` at the zip root has the expected version, MV3, and only the
      `storage` permission.
- [ ] The checksum file matches the zip (`shasum -a 256`).
- [ ] `site/index.html` and `site/privacy.html` load over HTTPS with no mixed
      content or external requests.
- [ ] The privacy policy URL used in the store listing resolves and matches the
      current manifest (permissions, domains, storage behavior).
- [ ] The support contact is monitored.
- [ ] Store screenshots were captured from the submitted build.

## Result record

Copy this table into a new file or issue when running the checklist. Do not mark
items as passing without an observed result. The rows marked **Harness** were
observed in the automated Chromium browser harness against a synthetic LeetCode
page, not on the live site; see [VERIFICATION.md](VERIFICATION.md).

| Area | Browser / version | Platform / URL | Result | Notes |
| --- | --- | --- | --- | --- |
| Build / preflight / package | Node 24.21, npm 11.19 | local | **Pass** | Automated; see VERIFICATION.md |
| Popup / options load | Brave 156.1 (Chromium 156) | extension pages | **Pass** | Harness; no page errors |
| Service worker + storage | Brave 156.1 (Chromium 156) | extension | **Pass** | Harness; `storage` only |
| Load unpacked |  |  | Pending | Manual Chrome check |
| Load extracted zip |  |  | Pending | Manual Chrome check |
| Load extracted zip (harness) | Brave 156.1 (Chromium 156) | extracted `release/leetcomete-1.0.0.zip` | **Pass** | Service worker, popup/options, synthetic completion |
| LeetCode Monaco |  |  | Pending | Live site |
| LeetCode keyboard |  |  | Pending | Live site |
| Textarea (synthetic) | Brave 156.1 (Chromium 156) | `https://leetcode.com:8443/` | **Pass** | Harness only; not live |
| CodeMirror 5 |  |  | Pending | Live site |
| Exercism unsupported |  |  | Pending | Live site |
| Privacy/network |  |  | Pending | Manual DevTools check |
| Performance |  |  | Pending | Manual |
| Hosted privacy policy |  |  | Pending | Hosting/account step |

## Reporting a failure

Include:

1. Chrome version and extension version.
2. Platform, URL, selected language, and editor reported by the popup.
3. Whether the page was reloaded after installing/updating.
4. Console errors from the page, isolated content script, and service worker.
5. A minimal reproduction snippet and whether the failure is in status detection,
   popup display, keyboard handling, or text insertion.
