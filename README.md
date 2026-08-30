# Charlotte Vision Lab Website

Static GitHub Pages site for `charlottevisionlab.github.io`.

## Files

- `index.html` - homepage content and source-backed team sections
- `news.json` - one-line news items shown on the homepage (newest first)
- `styles.css` - visual design and responsive layout
- `script.js` - publications loader, filters, and homepage news

## GitHub Pages setup

1. Create or use a GitHub organization named `charlottevisionlab`.
2. Create a repository named `charlottevisionlab.github.io`.
3. Push these files to the default branch of that repository.
4. In GitHub, open `Settings -> Pages` and confirm deployment from the default branch root.

Because this is a plain static site, no build step is required.

## Content note

This first version uses public faculty and student pages as source material.
Some student entries are intentionally minimal where public profile details were
limited.

## Adding news

Edit `news.json` and add objects with:

- `date` - `YYYY-MM` or `YYYY-MM-DD` (used for sorting)
- `venue` - short label such as `CVPR 2026`
- `text` - one-line announcement
- `href` - optional link (paper page, arXiv, etc.)

Newest items appear first automatically.

## Publications source

The publications page loads papers directly from faculty pages:

- [Hieu Le](https://hieulem.github.io/publications.yaml) (`publications.yaml`)
- [Srijan Das](https://srijandas07.github.io/index.html) (publications table HTML)

DBLP is used as a fallback for any papers not yet listed on those pages. When faculty update their sites, the lab publications page updates automatically on refresh.
