# Dunder Mifflin brand kit

Assets that make the game feel like an internal Dunder Mifflin document. Everything
here is self-contained so the site renders identically offline and on GitHub Pages.

## Logo

The stacked **DUNDER / MIFFLIN®  / PAPER COMPANY** logotype, sourced from
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Dunder_Mifflin,_Inc.svg)
(public domain — "consists only of simple geometric shapes or text", below the
threshold of originality). Recolored, transparent-background variants:

| File | Use |
|------|-----|
| `dunder-mifflin-wikimedia.svg` | original, white-on-black (untouched source) |
| `dunder-mifflin-navy.svg`  | navy ink `#1C3A5E` on transparent — for manila/cream surfaces (the header) |
| `dunder-mifflin-cream.svg` | cream `#F4ECD8` on transparent — for navy/dark surfaces |
| `dunder-mifflin-ink.svg`   | near-black on transparent — universal stamp / watermark |
| `favicon.svg`              | cream logo on a navy rounded tile — browser tab icon |
| `apple-touch-icon.png`     | 180×180 iOS home-screen icon (square, navy to the edges) |

Trademark note: the Dunder Mifflin name/logo is fictional IP from *The Office*. This
is a private, non-commercial two-person fan game — fine for that; don't ship it
commercially.

## Type

The real Dunder Mifflin logotype is a bold, condensed, **Impact**-style face. Impact
is a proprietary system font (can't be redistributed), so:

- The **wordmark** uses the real logo *artwork* above (authentic letterforms).
- Display headings use the stack `Impact, "Anton", …` — system Impact first, with
  self-hosted **[Anton](https://fonts.google.com/specimen/Anton)** (SIL OFL) as the
  free, embeddable fallback where Impact is absent (e.g. Android).

Self-hosted webfonts in `fonts/` (all latin subset, woff2), wired via `@font-face`
at the top of `../style.css`:

| Family | Role | License |
|--------|------|---------|
| Anton | `--display` — brand headings, Impact-alike | SIL OFL |
| DM Serif Display | `--serif` — question prompts, names | SIL OFL |
| Archivo | `--sans` — body / UI / buttons | SIL OFL |
| Courier Prime | `--mono` — memo stamps, labels, timers (typewriter) | SIL OFL |

## Palette (from `../style.css` `:root`)

Pulled from *The Office* / Dunder Mifflin — cooler and grayer than a manila folder,
closer to the fluorescent-lit Scranton office:

`--paper #D8CFBA` office-wall beige · `--paper-2 #F7F3EA` copy paper · `--navy
#15355E` Dunder Mifflin navy (the logotype) · `--blue #2F6FB2` DM brand blue (links/
active) · `--rec #C23B2E` camcorder REC red · `--beet #8E2A2A` Dwight's beet
(destructive) · `--green #357A54` APPROVED · `--highlight #EFCB3A` Scranton legal-pad
yellow.

## Regenerating

The recolored SVGs are `sed` recolors of the Wikimedia source (drop the black
`<rect>`, swap `#fff`/`#b6b4b5` for the target inks). The icons are a navy tile
wrapping the cream variant, rendered to PNG with `qlmanage`. Fonts are the latin
woff2 subsets pulled from the Google Fonts CSS API.
