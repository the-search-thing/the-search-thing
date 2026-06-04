# the-search-thing website

Static marketing site: HTML, CSS, and JavaScript only. No build step.

## Edit

- [`index.html`](index.html) — content and structure
- [`styles.css`](styles.css) — layout, typography, motion tokens
- [`main.js`](main.js) — Whimsy dissolve loader ([whimsically.app](https://www.whimsically.app/)), scroll reveal

## Preview

```bash
cd website
python3 -m http.server 3000
# or: npm run dev
```

Open http://localhost:3000

## Deploy (later)

This folder can be published as-is to Cloudflare Pages (build command: none, output: `website/`).
