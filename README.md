# Dunder Mifflin Trivia

A tiny real-time trivia game for two — Rob & Aleida. Open it on your phones, wait
in the shared lobby as emoji avatars, and answer Office questions with 10 seconds
each. Your emoji cheers when you're right and wilts when you're wrong. Triggers
nightly at **20:00 CET** (configurable), and you seed all the questions yourselves.

Built the same way as `riot`: vanilla HTML/JS, Firebase (Realtime Database +
Storage), no build step.

```
index.html / game.js   the game (lobby → questions → reveal → scoreboard)
manage.html / manage.js the backend — add/see/delete questions, set trigger time
app.js                  shared core: Firebase, identity, synced clock, helpers
episodes.js             The Office season → episode-count map for the picker
style.css               the whole design system
firebase-config.js      ← paste your Firebase web config here
```

## One-time setup (~10 min)

1. **Create a Firebase project** at <https://console.firebase.google.com> (or reuse
   one). Add a **Web app** and copy its config.

2. **Paste the config** into `firebase-config.js`, replacing the `PASTE_…` values.
   (The `apiKey` is not a secret for web apps — access is controlled by the rules
   below, not by hiding the key.)

3. In the console, turn on the three services the game uses:
   - **Build → Realtime Database → Create database** (pick the `europe-west1`
     region to match the config URL). Start in locked mode; we deploy rules below.
   - **Build → Authentication → Sign-in method → Anonymous → Enable.** This lets
     both phones read/write without anyone logging in.
   - **Build → Storage → Get started.** (Needed only for *uploading* GIFs. New
     projects may prompt you to enable the Blaze plan; for two people the usage is
     effectively free. If you'd rather not, skip Storage and just **paste GIF URLs**
     from Giphy/Tenor in the backend instead.)

4. **Install the CLI and deploy** (hosting works on a private repo, unlike GitHub
   Pages):

   ```sh
   npm install -g firebase-tools
   firebase login
   firebase use --add          # pick your project, alias it "default"
   firebase deploy             # pushes hosting + database + storage rules
   ```

   Firebase prints a URL like `https://your-project.web.app` — that's the game.
   Open it on both phones, pick your name, pick your emoji.

To run locally while editing: `firebase emulators:start` or any static server
(`npx serve .`). The app shows a setup screen until `firebase-config.js` is filled.

## Security rules

Deployed automatically by `firebase deploy`:

- `database.rules.json` — read/write for any signed-in (anonymous) user.
- `storage.rules` — same, scoped to the `gifs/` folder.

Fine for a private two-person game. Tighten later if you ever make it public.

## Seeding questions

Open `…/manage.html`. Two types:

- **Multiple choice** — question text, 2+ options, tap the circle to mark the
  correct one. GIF optional.
- **Guess the episode** — upload (or paste) a GIF, set the correct season +
  episode. The player gets season/episode dropdowns; partial credit for getting
  only the season or only the episode right, speed bonus for nailing both.

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
