# Chrome Web Store listing copy

Paste these fields into the Chrome Web Store Developer Dashboard. Replace the
bracketed placeholders before submitting. Do not claim live-site verification
that has not been performed; see `docs/VERIFICATION.md` for the current evidence.

## Basic fields

| Field | Value |
| --- | --- |
| Name | Leetcomete |
| Summary (max 132 chars) | Local-first autocomplete for code editors on LeetCode, GeeksforGeeks, HackerRank, Codeforces, CodeChef, AtCoder, and Exercism. |
| Category | Developer Tools |
| Language | English |
| Version | 1.0.0 (use the version in `package.json` / `dist/manifest.json`) |
| Privacy policy URL | `https://YOUR_DOMAIN/privacy.html` |
| Support URL | `https://YOUR_DOMAIN/` or a GitHub Issues page |
| Homepage URL | `https://YOUR_DOMAIN/` (optional) |

The manifest description is the same 126-character summary. The store allows a
longer detailed description below.

## Detailed description

```text
Leetcomete adds VS Code-style code completion to the code editors you already use in the browser.

It is local-first: the extension indexes the code in the current editor, ranks variables, parameters, functions, methods, classes, keywords, built-ins, and type-inferred members, and shows suggestions in a popup. There is no account, API key, remote model, telemetry, or source-code upload.

FEATURES

• 15 languages: Java, C, C++, Python, JavaScript, TypeScript, C#, Go, Rust, Kotlin, Swift, Ruby, PHP, Scala, and SQL.
• Editor-aware integration: Monaco uses its native completion provider, so its popup, snippets, keyboard handling, and undo stack keep working. CodeMirror 5 and plain textareas use a caret-anchored popup.
• Context-aware ranking: exact, prefix, camel-case, and fuzzy matching, with local-scope proximity and declaration-kind weighting.
• Member suggestions after ., ->, and :: using local type inference for declarations such as String word, const items = [], let map = new HashMap<>(), and self.cache.
• Keyboard-first: Tab or Enter accepts, arrows navigate, Escape dismisses, Ctrl+Space or Alt+/ triggers explicitly.
• No duplicate characters: acceptance replaces exactly the typed prefix and restores the caret.
• Optional keywords, built-ins, snippets, and member suggestions.
• Light, dark, and auto themes.
• Settings stored locally in chrome.storage.local; Chrome Sync is an explicit opt-in mirror for preferences only.

SUPPORTED SITES

LeetCode (.com and .cn), GeeksforGeeks, HackerRank, Codeforces, CodeChef, AtCoder, and Exercism. Site layouts change; the popup reports the detected platform, editor, and language so selector failures are visible.

CodeMirror 6 is detected and reported as unsupported rather than faked. Exercism commonly uses CodeMirror 6.

PRIVACY

The extension requests only the storage permission. Site access is limited to the seven supported platforms through content-script match patterns. Editor text is processed in memory and is not stored or transmitted. No analytics, ads, telemetry, remote code, or data sharing. See the privacy policy for details.

REQUIREMENTS

Chrome/Chromium 111 or newer. Reload a tab after installing or updating the extension so the content scripts are injected.
```

## Single purpose

```text
Leetcomete provides local, context-aware code completion inside code editors on supported programming-practice websites. It reads the active editor's text in the page, builds an in-memory symbol index, and displays ranked completion suggestions. It stores only user preferences.
```

## Permission justification

### `storage`

```text
Used to save the user's extension preferences (enable/disable, per-platform and per-language toggles, completion behavior, theme, and debug-logging preference) in chrome.storage.local. If the user explicitly enables Chrome Sync, the same preferences object is mirrored to chrome.storage.sync. No source code, page text, URLs, or personal data are stored.
```

### Site access / content-script matches

The manifest does not request `host_permissions`; site access is declared through
content-script match patterns for the supported platforms. If the dashboard asks
for a justification, use:

```text
Content scripts run only on the seven supported programming-practice platforms (LeetCode, GeeksforGeeks, HackerRank, Codeforces, CodeChef, AtCoder, and Exercism). On those pages they detect the code editor and selected language, read editor text locally to produce completion suggestions, and relay settings/status between the page and the extension. They do not run on other sites, do not read passwords or unrelated form fields, and do not transmit page content.
```

## Privacy practices questionnaire

Use these answers, and verify them against the current build before submitting.

| Question | Answer |
| --- | --- |
| Does the extension collect or use user data? | No. The extension does not collect, transmit, sell, or share user data. |
| Does it use remote code? | No. All executable code is packaged with the extension. |
| Does it use analytics, telemetry, or advertising? | No. |
| Does it store source code? | No. Editor text is indexed in memory only. |
| What is stored? | A preferences object in `chrome.storage.local`; optionally mirrored to `chrome.storage.sync` when the user enables sync. |
| Is data sold to third parties? | No. |
| Is data used for creditworthiness or lending? | No. |
| Is the privacy policy URL provided? | Yes: `https://YOUR_DOMAIN/privacy.html` |
| Are permissions limited to the single purpose? | Yes: only `storage`. Site access is limited to the seven supported platforms. |

Chrome Web Store data disclosures can change over time. Read the current
questionnaire in the dashboard and answer it from the actual manifest and code,
not from this table alone.

## Test instructions for reviewers

```text
No account or credentials are required.

1. Install the extension. Open a LeetCode problem page (for example https://leetcode.com/problems/two-sum/) and reload the tab.
2. Click the toolbar icon. Confirm the popup shows LeetCode, the detected editor (Monaco), and the selected language.
3. In the code editor, declare a local variable, for example `int result = 1;`, then type `res` on a new line. A suggestion popup should appear.
4. Press Tab or Enter to accept. Confirm the text becomes `result` and the typed prefix is not duplicated. Press Ctrl+Z; the accepted completion should undo as one edit.
5. Type `word.` after `String word = "hello";` and confirm member suggestions such as `length` appear.
6. Press Escape while the popup is open; it should close and stay closed after the key is released.
7. Open the extension options page and confirm settings save locally. Enable sync only if you want to test chrome.storage.sync.

If a site has changed its DOM, the popup reports the detected platform/editor/language. Include that status and the page URL in a support report. CodeMirror 6 pages, including many Exercism exercises, are intentionally reported as unsupported.
```

## Screenshots and promotional assets

The Chrome Web Store requires at least one screenshot. These cannot be generated
without a browser session on the real sites, so capture them manually:

- [ ] Screenshot 1: LeetCode with a completion popup visible (1280×800 or 640×400).
- [ ] Screenshot 2: member completion after `word.` or `this.`.
- [ ] Screenshot 3: options page showing platform/language toggles and privacy section.
- [ ] Screenshot 4 (optional): popup showing detected platform/editor/language.
- [ ] Small promo tile 440×280 (optional but recommended).
- [ ] Marquee 1400×560 (optional).

Screenshot guidance: use a clean browser profile, hide personal bookmarks and
tabs, use a readable theme, and do not show real personal data. Keep the
completion popup and the typed code legible at the store's thumbnail size.

## Known limitations to disclose in support material

- Analysis is heuristic, not a compiler or language server.
- Member completion relies on local type inference and curated registries; complex
  generics and framework types may be incomplete.
- CodeMirror 6 is not supported.
- Monaco integration depends on the page exposing `window.monaco`.
- Platform selectors are best-effort and may break after a site redesign.
- Only Chromium 111+ is targeted; Firefox and Safari are not supported.
- Live-site behavior has not been verified in this repository's build environment.
  See `docs/VERIFICATION.md` and `docs/MANUAL_TESTING.md`.

## Submission checklist

- [ ] `npm run check` passes.
- [ ] `npm run preflight` passes.
- [ ] `npm run package` creates `release/leetcomete-<version>.zip`.
- [ ] The zip has `manifest.json` at its root.
- [ ] Version is bumped and synced across `package.json`, `src/manifest.json`,
      `src/shared/constants.ts`, `src/ui/options.html`, and the lockfile.
- [ ] Privacy policy is live at the URL entered in the dashboard.
- [ ] Support contact is monitored.
- [ ] Screenshots are captured from the submitted build.
- [ ] Listing text and permission justifications are pasted and proofread.
- [ ] Privacy practices questionnaire is answered from the current manifest.
- [ ] Test instructions are included.
- [ ] `docs/MANUAL_TESTING.md` has been run on the real sites and the result table
      is filled in honestly.
