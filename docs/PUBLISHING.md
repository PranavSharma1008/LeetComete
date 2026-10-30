# Publishing Leetcomete

This document covers the two distribution paths:

1. **Load unpacked** from `dist/` for local testing.
2. **Chrome Web Store** upload from `release/leetcomete-<version>.zip` for public
   distribution.

There is no supported way for ordinary users to install a self-hosted `.crx`
outside the Chrome Web Store (enterprise policies are the exception). “Hosting”
therefore means publishing the extension through the Chrome Web Store and
hosting the privacy policy / landing page in `site/`.

## 1. Prerequisites

- Node.js 20 or newer and npm.
- Chrome/Chromium 111 or newer for the extension itself.
- A Chrome Web Store developer account. Registration may require a one-time fee;
  check the current Chrome Web Store terms.
- A public HTTPS URL for `site/privacy.html`.
- A monitored support contact (email or support URL) for the store listing.
- Screenshots captured from the submitted build; see `store/listing.md`.

## 2. Build and verify locally

```bash
npm install
npm run check        # typecheck + 87 tests + production build
npm run preflight    # manifest, files, icons, CSP, version, package checks
npm run package      # check + preflight + release/leetcomete-<version>.zip
```

`npm run check` writes a fresh `dist/`. `npm run package` refuses to package if
preflight fails.

Expected output:

- `dist/` — unpacked extension, with `manifest.json` at the root.
- `release/leetcomete-<version>.zip` — upload archive, with `manifest.json` at
  the archive root (not inside a `dist/` folder).
- `release/leetcomete-<version>.zip.sha256` — checksum of the archive.

Inspect the archive:

```bash
unzip -l release/leetcomete-1.0.0.zip
unzip -t release/leetcomete-1.0.0.zip
```

The listing should show `manifest.json`, `popup.html`, `options.html`,
`page-bridge.js`, `content.js`, `service-worker.js`, `icons/`, and `assets/` at
the top level.

## 3. Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `dist/` directory (the folder that directly contains
   `manifest.json`).
5. Open a supported problem page and **reload the tab** so the content scripts
   are injected.
6. Click the toolbar icon. The popup should show the detected platform, editor,
   language, and version.

To test the exact uploaded artifact, extract the zip into a temporary folder and
load that folder instead:

```bash
mkdir -p /tmp/leetcomete-package
unzip -o release/leetcomete-1.0.0.zip -d /tmp/leetcomete-package
# Load /tmp/leetcomete-package in chrome://extensions
```

Run the checklist in [MANUAL_TESTING.md](MANUAL_TESTING.md) and record actual
results. Do not mark live-site items as passing without observing them.

> **Command-line note:** current branded Google Chrome builds may ignore the
> `--load-extension` command-line flag. The manual **Load unpacked** flow above
> is the supported path. The repository's browser harness used Brave (Chromium)
> because of this; see [VERIFICATION.md](VERIFICATION.md).

## 4. Bump the version

`package.json` is the source of truth. The build calls `scripts/version.mjs`
automatically, but you can run it explicitly:

```bash
npm version patch --no-git-tag-version   # or minor / major
npm run version:sync                     # manifest, constants, options page, lockfile
```

The version is written to:

- `package.json`
- `package-lock.json` (root version fields)
- `src/manifest.json`
- `src/shared/constants.ts`
- `src/ui/options.html`

`npm run preflight` fails if these drift apart or if `dist/manifest.json` is
stale relative to `package.json`.

Chrome requires a new version for every upload. Use semantic versioning:
patch for fixes, minor for features, major for breaking changes.

## 5. Publish the privacy policy and landing page

The `site/` folder is a plain static site with no build step.

### GitHub Pages

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**.
4. Select the branch and the `/site` folder.
5. Save and wait for the deployment.
6. Use `https://<account>.github.io/<repository>/privacy.html` as the privacy
   policy URL.

### Cloudflare Pages or Netlify

- Connect the repository.
- Leave the build command empty.
- Set the output/publish directory to `site`.
- Use the generated HTTPS URL ending in `/privacy.html`.

Before publishing, update `site/index.html` with the real Chrome Web Store link
and add a monitored contact email to the privacy policy or store listing. See
[`site/README.md`](../site/README.md).

Verify the hosted pages:

- `privacy.html` loads over HTTPS with no mixed content.
- Both pages work in light and dark mode.
- The privacy policy matches the current manifest (permissions, domains,
  storage behavior).
- No analytics or external assets are present.

## 6. Create the Chrome Web Store listing

1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Create a new item and upload
   `release/leetcomete-<version>.zip`.
3. Fill in the store listing from [`store/listing.md`](../store/listing.md):
   name, summary, detailed description, category, language, screenshots, and
   promotional assets.
4. Add the privacy policy URL and support URL.
5. Complete the privacy practices questionnaire from the actual manifest and
   code. The current build collects no user data, uses no remote code, and stores
   only preferences.
6. Provide the permission justification for `storage` and, if asked, the
   content-script/site-access justification.
7. Add the reviewer test instructions.
8. Submit for review.

The first review can take days. Respond to reviewer questions with concrete
reproduction steps and the detected platform/editor/language from the popup.

## 7. What is automated vs manual

Automated in this repository:

- TypeScript typecheck.
- 87 Vitest tests across the lexer, extraction, ranking, completion engine,
  type inference, language detection, platform detection, editor adapters,
  controller keyboard behavior, and settings.
- Production build with source maps disabled.
- Preflight checks for MV3, version consistency, referenced files, PNG icon
  dimensions, content-script worlds, `storage`-only permissions, no remote URLs,
  no inline scripts, no source maps, no `eval`/`new Function`, and a
  `chrome.*`-free MAIN-world bridge.
- ZIP creation with `manifest.json` at the root and a SHA-256 checksum.

Manual or external:

- Loading `dist/` through `chrome://extensions` in the user's Chrome profile.
- Live-site selectors and editor behavior on LeetCode, GeeksforGeeks,
  HackerRank, Codeforces, CodeChef, AtCoder, and Exercism.
- Monaco behavior on the real LeetCode domain.
- CodeMirror 5 pages and CodeMirror 6 unsupported messaging.
- Screenshots and promotional assets.
- Chrome Web Store account, review, and publication.
- Hosting the privacy policy and landing page.
- The public support contact.

See [VERIFICATION.md](VERIFICATION.md) for the exact browser-harness results and
[MANUAL_TESTING.md](MANUAL_TESTING.md) for the live-site checklist.

## 8. Updating a published extension

1. Make and test the change.
2. Bump the version and run `npm run version:sync`.
3. Run `npm run package`.
4. Load the new `dist/` unpacked and repeat the relevant manual checks.
5. Upload the new zip in the developer dashboard.
6. Update the listing only if behavior, permissions, or privacy practices
   changed.
7. Submit the update.

If a release is broken, upload a fixed patch version. Chrome Web Store does not
provide a user-facing “downgrade”; keep the previous zip and checksum for
reference.

## 9. Common upload failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| “Manifest file is missing or unreadable” | Zip contains a nested `dist/` folder | Use `npm run package`; it puts `manifest.json` at the root. |
| “Invalid value for description” | Manifest description over 132 characters | Shorten it; preflight enforces the limit. |
| “Missing icon” or wrong icon size | Referenced PNG missing or wrong dimensions | Run `npm run icons` / rebuild; preflight validates PNG dimensions. |
| “Manifest version not supported” | Not MV3 or `minimum_chrome_version` too low | Keep `manifest_version: 3` and `minimum_chrome_version: "111"`. |
| “Remote code” rejection | Remote script, `eval`, or `new Function` | Keep all code packaged; preflight scans for these. |
| “Version already exists” | Re-uploading the same version | Bump the version and rebuild. |
| Permission warning is broader than expected | A permission was added without updating docs | Keep only `storage`; update the privacy policy and listing if this ever changes. |

## 10. Release checklist

- [ ] `npm run check` passes (typecheck, 87 tests, build).
- [ ] `npm run preflight` passes.
- [ ] `npm run package` produced the zip and checksum.
- [ ] `unzip -t` reports no errors.
- [ ] The zip root contains `manifest.json`.
- [ ] Version is synced everywhere.
- [ ] `dist/` loads unpacked without manifest errors.
- [ ] Popup, options, service worker, and content scripts work in a real browser.
- [ ] Relevant manual tests are recorded in `docs/MANUAL_TESTING.md`.
- [ ] Privacy policy is live and accurate.
- [ ] Support contact is monitored.
- [ ] Screenshots are from the submitted build.
- [ ] Listing text and permission justifications are proofread.
- [ ] Privacy practices questionnaire is answered from the current build.
- [ ] Reviewer test instructions are included.
