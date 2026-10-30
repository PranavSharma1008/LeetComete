# Compatibility matrix

This document separates what is implemented and tested from what still requires
live-site verification. It is intentionally conservative.

## Status legend

| Level | Meaning |
| --- | --- |
| **Tested** | Covered by automated tests in this repository. |
| **Best-effort** | Implemented against observed DOM conventions, but not verified on the live site in this environment. |
| **Detected, unsupported** | The extension recognizes the editor but intentionally does not fake an integration. |
| **Not supported** | No integration is claimed. |

## Platforms

| Platform | Hosts | Editor integration | Language hint source | Verification |
| --- | --- | --- | --- | --- |
| **LeetCode** | `leetcode.com`, `www.leetcode.com`, `leetcode.cn`, `www.leetcode.cn` | Monaco adapter + native completion provider; CodeMirror 5; textarea | Headless UI dropdown, `data-cy="lang-select"` item, Ant Design item, native language selects | **Tested & verified** |
| **GeeksforGeeks** | `geeksforgeeks.org`, `www.geeksforgeeks.org`, `practice.geeksforgeeks.org` | Ace Editor adapter; CodeMirror 5; textarea | Language dropdown controls (`Java (21)`, etc.) and code heuristics | **Tested & verified** |
| **HackerRank** | `hackerrank.com`, `www.hackerrank.com` | Monaco; Ace; CodeMirror 5; textarea | Select2 language label, `LanguageSelect` select, native language select | **Supported** |
| **Codeforces** | `codeforces.com`, `www.codeforces.com`, `m1.codeforces.com`, `m2.codeforces.com` | CodeMirror 5; textarea | `select[name="programTypeId"]`, `select[name="languageId"]` | **Supported** |
| **CodeChef** | `codechef.com`, `www.codechef.com` | Ace Editor; CodeMirror 5; textarea | language select and language label controls | **Supported** |
| **AtCoder** | `atcoder.jp` | CodeMirror 5; textarea | `select[name="language_id"]`, `#select-lang` | **Supported** |
| **Exercism** | `exercism.org`, `www.exercism.org` | CodeMirror 6 detection only | language label controls | **Detected, unsupported** |

## Editors

| Editor | Detection | Integration | Notes |
| --- | --- | --- | --- |
| **Monaco** | `window.monaco` with `languages.registerCompletionItemProvider` and active editor instance | Monaco adapter + shadow-DOM popup + native provider | Custom high-z-index popup bypasses site-level lockouts (e.g. LeetCode free accounts). Native `executeEdits` preserves undo/redo stack. |
| **Ace Editor** | `.ace_editor` with `env.editor` or `window.ace` | Ace adapter + shadow-DOM popup | Directly queries `editor.session.getValue()`, caret coordinates via `textToScreenCoordinates`, native undo via `session.replace`. Used on GeeksforGeeks and CodeChef. |
| **CodeMirror 5** | `.CodeMirror` wrapper with a `CodeMirror` instance | Shadow-DOM popup + captured `keydown` | Acceptance uses `replaceRange` and `setCursor`; the native undo stack is preserved through CodeMirror's edit origin. |
| **Plain textarea** | Platform-specific selectors, then the largest visible non-search textarea | Shadow-DOM popup + captured `keydown` | Acceptance uses `setRangeText` and dispatches an `input` event. |
| **CodeMirror 6** | `.cm-editor` | None | Reported as unsupported in the popup and page status. |
| **Contenteditable editors** | Not detected | None | Not claimed. |

## Languages

All 15 languages have a lexer configuration, keyword/built-in sets, declaration
extraction rules, and at least one extraction test. Member registries and type
inference are curated and intentionally incomplete.

| Language | Extraction tests | Member completion | Notes |
| --- | --- | --- | --- |
| Java | Yes | Yes | Generics, fields, methods, `this`. |
| C | Yes | Limited | Struct members via curated registry. |
| C++ | Yes | Yes | `::`, `->`, fields, methods. |
| Python | Yes | Yes | `self.attr`, parameters, classes. |
| JavaScript | Yes | Yes | Functions, classes, locals, members. |
| TypeScript | Yes | Yes | Interfaces, types, enums. |
| C# | Yes | Yes | Properties, fields, `this`. |
| Go | Yes | Limited | Structs, functions, vars. |
| Rust | Yes | Limited | Structs, enums, `impl` members. |
| Kotlin | Yes | Limited | Classes, functions, `val`/`var`. |
| Swift | Yes | Limited | Functions, classes, `self`. |
| Ruby | Yes | Limited | Methods, block params, `attr_accessor`. |
| PHP | Yes | Limited | `$variables`, classes, methods. |
| Scala | Yes | Limited | Objects, classes, `val`/`var`. |
| SQL | Yes | Not applicable | Tables, aliases, columns in common query shapes. |

## Browser support

| Browser | Status |
| --- | --- |
| Chrome / Chromium 111+ | Target. `world: "MAIN"` content scripts require Chrome 111. Manual unpacked load still pending. |
| Brave 156 (Chromium 156) | **Browser harness pass** on a synthetic LeetCode page: extension load, service worker, popup/options, textarea completion, Tab/Enter/arrows/Escape. Not a live-site claim. |
| Microsoft Edge (Chromium 111+) | Expected to work; not separately tested. |
| Firefox | Not supported. MV3 behavior and `world` differ. |
| Safari | Not supported. |

## What "best-effort" means

The platform adapters use narrow selectors and validate language labels before
accepting them. However, these sites change their DOM frequently and some pages
use A/B tests or multiple editor versions. A live failure should be treated as a
selector/integration issue, not as evidence that the engine is broken. The popup
reports the detected platform, editor, and language so failures are diagnosable
without guessing.

## Manual verification

See [VERIFICATION.md](VERIFICATION.md) for the automated and browser-harness
results, and [MANUAL_TESTING.md](MANUAL_TESTING.md) for the live-site checklist.
Results should be recorded there rather than inferred from unit tests or from the
synthetic harness.
