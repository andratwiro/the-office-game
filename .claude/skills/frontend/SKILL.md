---
name: frontend
description: Front-end / UI craft pass for this project. Use when building or polishing any screen, component, layout, animation, or styling — "make this nicer", "improve the UI", "mobile", "design", "polish this screen". Encodes the project's stack, design system, and mobile-first quality bar.
---

# Front-end craft pass

Apply this whenever touching UI. The goal is screens that feel calm, intentional, on-brand, and great on a phone first.

## The stack (hard constraints)
- **Vanilla JS + Firebase RTDB, no build step.** No frameworks, no bundler, no npm packages for the front end. Plain `<script>` tags in `index.html` / `manage.html`.
- Rendering is **string-built innerHTML** in `game.js` / `manage.js`. Always escape interpolated data with `OG.esc(...)`.
- `game.js` uses a **render-key guard** (`lastKey`) so screens only re-render when their meaningful state changes. When you add state that should trigger a re-render, fold it into the key; when it shouldn't, keep it out and update via `tick()` (per-frame) instead.
- One shared room; multiple devices. Anything visual driven by `room.players` must scale to **any headcount** (see `densityFor`).

## Design system — use the tokens, never hardcode
All in `style.css :root`. Reach for these instead of raw hex/px:
- Color: `--paper`, `--paper-2`, `--paper-3`, `--ink`, `--ink-soft`, `--navy`, `--navy-deep`, `--blue`, `--rec`, `--beet`, `--green`, `--highlight`, `--rule`.
- Type: `--display` (Impact/Anton logotype look — headings), `--serif` (DM Serif Display — names/quotes), `--sans` (Archivo — body/buttons), `--mono` (Courier Prime — labels/timecodes/countdowns).
- `--shadow` for card lift. The look is **mockumentary corporate**: manila folders (`.tab`), memo cards (`.card`), camcorder accents, paper grain. Stay in that world.

## Mobile-first quality bar
- Design the **narrow viewport first**; the frame is `max-width: 760px`, centered. Test mental model at ~375px wide.
- **Tap targets ≥ 44px.** Primary actions use `.btn.block.big-tap`. Don't ship tiny taps.
- Respect safe areas (`env(safe-area-inset-*)` already on `.frame`).
- Use `clamp()` for anything that must scale between phone and desktop (font-size, gaps, paddings) — see `.countdown`, `h1`.
- Prefer `dvh` over `vh`; transforms/opacity for animation (cheap, 60fps).

## Polish checklist (run before declaring done)
1. **Hierarchy:** one clear focal element per screen. Remove copy that doesn't earn its place — Rob consistently wants *less* text, not more.
2. **Centered & balanced:** if a screen has few elements, center them vertically (don't leave them top-heavy) — see `.lobby-card`.
3. **States:** every interactive thing has hover / `:active` / `:focus-visible` (outline `--highlight`) / `[disabled]`.
4. **Motion:** subtle and purposeful; always gate it behind `@media (prefers-reduced-motion: reduce)`.
5. **Empty/edge states:** 1 player vs 20, no questions, someone offline — all must look intentional.
6. **Escaping:** all dynamic strings through `OG.esc`.
7. **Accessibility:** real focus outlines, `alt` on images, sufficient contrast, semantic-ish structure.

## Working rhythm
- Make the change, `node --check` the touched JS, then **commit and push** (GitHub Pages serves `main`; live at https://andratwiro.github.io/the-office-game/). Hard-refresh to beat the cache.
- Keep diffs tight and match surrounding code style (terse comments explaining *why*, not *what*).
- When a screenshot is provided, read it carefully and address the specific elements shown before broad changes.
