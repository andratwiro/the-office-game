// Shared core: Firebase wiring, player identity, synced clock, small helpers.
// Loaded on every page. Exposes a single global: window.OG
window.OG = (function () {
  // The two of you. The emoji here is just a default; each phone picks its own
  // avatar in the lobby (stored per-device and broadcast over presence).
  const PLAYERS = {
    rob:    { name: "Rob",    emoji: "🧔" },
    aleida: { name: "Aleida", emoji: "👩‍🦰" }
  };

  // Avatar choices for the lobby picker (riot-style).
  const EMOJI = ["🧔","👩‍🦰","🦊","🦉","🐢","🐝","🦋","🐙","🐶","🐱","🐼","🐧",
                 "🌻","🌙","⚡","🔥","⭐","🍀","🍕","👑","🤓","😎","🥸","🤠"];

  const ROOM = "main";              // single shared room
  const DEFAULT_TRIGGER = "20:00";  // CET, overridable from the backend page
  const TIMEZONE = "Europe/Madrid"; // CET / CEST

  let db = null, auth = null;
  let serverOffset = 0;             // ms; server time - local time
  let ready = false;

  function configured() {
    return window.FIREBASE_CONFIG &&
      String(window.FIREBASE_CONFIG.apiKey || "").indexOf("PASTE") === -1;
  }

  function init() {
    if (!configured()) return false;
    if (!ready) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      db = firebase.database();
      auth = firebase.auth();
      auth.signInAnonymously().catch(function (e) {
        console.warn("Anonymous sign-in failed — enable it in the Firebase console.", e);
      });
      db.ref(".info/serverTimeOffset").on("value", function (s) {
        serverOffset = s.val() || 0;
      });
      ready = true;
    }
    return true;
  }

  // ---- identity ----------------------------------------------------------
  function getPlayer() {
    const id = localStorage.getItem("og_player");
    return PLAYERS[id] ? id : null;
  }
  function setPlayer(id) {
    if (PLAYERS[id]) localStorage.setItem("og_player", id);
  }
  function forgetPlayer() { localStorage.removeItem("og_player"); }
  function getEmoji() {
    var e = localStorage.getItem("og_emoji");
    if (e) return e;
    var id = getPlayer();
    return (PLAYERS[id] && PLAYERS[id].emoji) || "🙂";
  }
  function setEmoji(e) { if (e) localStorage.setItem("og_emoji", e); }

  // ---- synced time -------------------------------------------------------
  function serverNow() { return Date.now() + serverOffset; }

  // Wall-clock fields in the trigger timezone, as a Date whose *local* getters
  // read the Madrid wall time. Good to the second; that's plenty here.
  function zoneNow() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
  }

  // ms until the next occurrence of "HH:MM" (or "HH:MM:SS") in the trigger timezone.
  function msUntilTrigger(hhmm) {
    const parts = String(hhmm || DEFAULT_TRIGGER).split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;   // seconds optional; defaults to :00
    const now = zoneNow();
    const target = new Date(now);
    target.setHours(h, m, s, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target - now;
  }

  function isUnlocked(hhmm) {
    // Unlocked from trigger time until midnight (then it re-arms for tomorrow).
    return msUntilTrigger(hhmm) > 22 * 3600 * 1000 ? false : passedToday(hhmm);
  }
  function passedToday(hhmm) {
    const parts = String(hhmm || DEFAULT_TRIGGER).split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    const now = zoneNow();
    const target = new Date(now);
    target.setHours(h, m, s, 0);
    return now >= target;
  }

  function fmtCountdown(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const p = function (n) { return String(n).padStart(2, "0"); };
    return p(hh) + ":" + p(mm) + ":" + p(ss);
  }

  // ---- misc helpers ------------------------------------------------------
  function shuffle(arr) {
    const a = arr.slice();
    // No Math.random restriction in the browser; Fisher–Yates.
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  return {
    PLAYERS: PLAYERS, EMOJI: EMOJI, ROOM: ROOM, DEFAULT_TRIGGER: DEFAULT_TRIGGER, TIMEZONE: TIMEZONE,
    init: init, configured: configured,
    db: function () { return db; }, auth: function () { return auth; },
    getPlayer: getPlayer, setPlayer: setPlayer, forgetPlayer: forgetPlayer,
    getEmoji: getEmoji, setEmoji: setEmoji,
    serverNow: serverNow, zoneNow: zoneNow,
    msUntilTrigger: msUntilTrigger, passedToday: passedToday, fmtCountdown: fmtCountdown,
    shuffle: shuffle, esc: esc, el: el
  };
})();
