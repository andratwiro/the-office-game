# Dunder Mifflin Trivia

A tiny real-time trivia game for two — Rob & Aleida. Open it on your phones, wait
in the shared lobby as emoji avatars, and answer Office questions with 10 seconds
each. Your emoji cheers when you're right and wilts when you're wrong. Triggers
nightly at **20:00 CET** (configurable), and you seed all the questions yourselves.

Built the same way as `riot`: vanilla HTML/JS + Firebase **Realtime Database**, no
build step. Hosted free on **GitHub Pages**; the public live URL is

> **https://andratwiro.github.io/the-office-game/** — backend at **/manage.html**

```
index.html / game.js    the game (lobby → questions → reveal → scoreboard)
manage.html / manage.js the backend — add/see/delete questions, set trigger time
app.js                  shared core: Firebase, identity, synced clock, helpers
episodes.js             The Office season → episode-count map for the picker
style.css               the whole design system
firebase-config.js      ← paste your Firebase web config here
database.rules.json     the Realtime Database rules (for reference; paste them in the console)
```

## Hosting

The site is static, so **GitHub Pages** serves it directly from the repo — no build,
no Firebase Hosting, no CLI. In the repo: **Settings → Pages → Source: Deploy from a
branch → Branch: `main` / `/ (root)`**. Give it a minute and it's live at the URL
above. Every push to `main` redeploys automatically. All asset/link references are
relative, so everything works under the `/the-office-game/` subpath.

## Firebase setup (~5 min, one time)

Firebase here is **only** the realtime backend (shared state + login). No Hosting,
**no Storage** — uploaded GIFs are stored as base64 directly in the database, which
keeps everything on the free **Spark** plan.

1. **Create a project** at <https://console.firebase.google.com>. Add a **Web app**
   (the `</>` icon) and copy its config object.

2. **Paste the config** into `firebase-config.js`, replacing the `PASTE_…` values,
   and commit/push. (The `apiKey` is not a secret for web apps — access is
   controlled by the database rules below, not by hiding the key.)

3. **Realtime Database** — Build → Realtime Database → **Create database**. Pick the
   **`europe-west1`** region so it matches the `databaseURL` in your config. Start in
   locked mode.

4. **Anonymous auth** — Build → Authentication → Sign-in method → **Anonymous →
   Enable.** This lets both phones read/write without anyone logging in.

5. **Database rules** — Realtime Database → **Rules** tab → paste this and Publish:

   ```json
   {
     "rules": {
       ".read": "auth != null",
       ".write": "auth != null"
     }
   }
   ```

   (Same content as `database.rules.json`.) Any signed-in (anonymous) visitor can
   read and write — fine for a private two-person game. Tighten later if you want.

> Do **not** enable Storage — it requires the paid Blaze plan and we don't use it.

The app shows a setup screen until `firebase-config.js` is filled. To run locally
while editing, use any static server (`npx serve .`) — though pushing to `main` and
opening the Pages URL is usually easier.

## Seeding questions

Open `…/manage.html`. Two types:

- **Multiple choice** — question text, 2+ options, tap the circle to mark the
  correct one. GIF optional.
- **Guess the episode** — upload (or paste) a GIF, set the correct season +
  episode. The player gets season/episode dropdowns; partial credit for getting
  only the season or only the episode right, speed bonus for nailing both.

GIFs/images you upload are read in the browser and saved as a base64 data URL on the
question itself (max **2 MB** each — bigger files are rejected with a nudge to paste
a Giphy/Tenor URL instead).

The same page sets the **trigger time** — use **"In 2 minutes"** to rehearse the
countdown-then-unlock with Aleida before going live at 20:00.

## Scoring

- Multiple choice: 50 + up to 50 speed bonus for a correct answer.
- Episode: 40 for the right season, 40 for the right episode, +20 speed bonus when
  both are right.

## Tweaks

- Names live in `PLAYERS` in `app.js`; avatar choices in `EMOJI`.
- Round length (`MAX_QUESTIONS`), timer (`QUESTION_MS`) and reveal pause
  (`REVEAL_MS`) are constants at the top of `game.js`.
- Episode counts per season are in `episodes.js` — bump a number if a real episode
  isn't selectable.
