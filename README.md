# Static site

This folder is the hostable landing page and privacy policy for Leetcomete. It is
plain HTML/CSS with no build step, no JavaScript, no external fonts, and no
analytics. Publish the folder as-is.

Files:

- `index.html` — landing page
- `privacy.html` — privacy policy (the URL Chrome Web Store asks for)
- `styles.css` — shared styles, including light/dark mode
- `.nojekyll` — tells GitHub Pages to serve the folder without Jekyll processing

## Before publishing

1. **Add a monitored support email.** The privacy policy currently points to the
   support contact on the Chrome Web Store listing. Add an email to both the
   listing and, optionally, section 11 of `privacy.html`.
2. **Add the store link.** Once the listing is approved, replace the commented
   placeholder in `index.html` with the real Chrome Web Store URL.
3. **Set the canonical URL (optional).** Add a `<link rel="canonical" ...>` and
   Open Graph tags if you use a custom domain.

## Host on GitHub Pages

1. Create a public GitHub repository and push this project.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the branch (for example `main`) and the folder `/site`.
5. Save. GitHub publishes at:

   ```text
   https://<account>.github.io/<repository>/privacy.html
   ```

Use that URL as the Chrome Web Store privacy-policy URL.

If you publish the repository root instead, keep the site in `/site` and use a
GitHub Actions Pages workflow that uploads `site/`. The simplest option is the
branch + `/site` setting above.

## Host on Cloudflare Pages or Netlify

- **Cloudflare Pages:** connect the repository, set the build command to empty,
  and set the output directory to `site`.
- **Netlify:** connect the repository, leave the build command empty, and set
  the publish directory to `site`.

Both providers give you an HTTPS URL ending in `/privacy.html`. Use that URL in
the Chrome Web Store listing.

## Verify locally

```bash
cd site
python3 -m http.server 8080
# open http://localhost:8080/
```

Check both pages in light and dark mode and at a narrow viewport. There are no
network requests other than the page and stylesheet.
