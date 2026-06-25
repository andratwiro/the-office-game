# Dunder Mifflin Trivia — working notes

Real-time Office trivia party. Vanilla JS + Firebase RTDB, **no build step**. Static
site on GitHub Pages (serves `main`; live at https://andratwiro.github.io/the-office-game/).
Every push to `main` redeploys (~1 min); hard-refresh to beat the CDN cache.

## Front-end work — ALWAYS use the skill
For ANY UI/styling/layout/screen/animation work in this repo, **invoke the `/frontend`
skill first** (`.claude/skills/frontend/SKILL.md`). It encodes the stack constraints,
the design tokens, and the mobile-first quality bar. Don't hand-roll UI without it.

## Layout
- `index.html` → game client (`game.js`); `manage.html` → HQ backend (`manage.js`).
- `app.js` = shared core (`window.OG`): Firebase wiring, identity, synced clock, helpers.
- `characters.js` = Office cast roster (`window.CAST`) for the "who said it" question type.
- `episodes.js` = season→episode counts (`window.OFFICE`).
- `style.css` = the whole design system (tokens in `:root`).

## Model
- One shared room (`rooms/main`); each device mints a uid and broadcasts name+emoji
  presence. Roster is dynamic — UI must scale to any headcount.
- The **host starts/stops the show from HQ** (`manage.html`), not the game client.
- Question types: `mc`, `episode`, `tws` (That's what she said — pick the speaker).
