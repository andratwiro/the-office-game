// Trivia HQ — the question backend: create questions, see/delete existing ones,
// and set the trigger time. Plain DOM, same Firebase wiring as the game.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = OG.esc;

  if (!OG.configured()) {
    $("cfgNote").innerHTML = '<div class="note">No Firebase config yet — paste it into ' +
      '<code>firebase-config.js</code> and reload. See README.md.</div>';
    return;
  }
  OG.init();
  var db = OG.db();
  var who = OG.getPlayer() || "host";
  var type = "mc";
  var pendingGifUrl = "";   // resolved upload URL, if any

  function toast(msg, bad) {
    var t = $("toast"); t.textContent = msg;
    t.style.borderLeftColor = bad ? "#C8362B" : "#2E7D52";
    t.classList.add("show"); clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  // ── scheduling ────────────────────────────────────────────────────────
  db.ref("settings/triggerTime").on("value", function (s) {
    var v = s.val() || OG.DEFAULT_TRIGGER;
    $("trigTime").value = v;
    refreshLiveState();
  });
  function refreshLiveState() {
    var v = $("trigTime").value || OG.DEFAULT_TRIGGER;
    var live = OG.passedToday(v);
    $("liveState").textContent = live ? "LIVE NOW" : "in " + OG.fmtCountdown(OG.msUntilTrigger(v));
    $("liveState").style.color = live ? "#2E7D52" : "#5B564A";
  }
  setInterval(refreshLiveState, 1000);

  function saveTime(v) { db.ref("settings/triggerTime").set(v).then(function () { toast("Trigger set to " + v); }); }
  function plusMinutes(n) {
    var d = OG.zoneNow(); d.setMinutes(d.getMinutes() + n);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function plusSeconds(n) {              // second-precision trigger for quick tests
    var d = OG.zoneNow(); d.setSeconds(d.getSeconds() + n);
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  $("saveTime").onclick = function () { saveTime($("trigTime").value || OG.DEFAULT_TRIGGER); };
  $("in10").onclick = function () { var t = plusSeconds(10); $("trigTime").value = t; saveTime(t); };
  $("in2").onclick = function () { var t = plusMinutes(2); $("trigTime").value = t; saveTime(t); };
  $("reset20").onclick = function () { $("trigTime").value = "20:00"; saveTime("20:00"); };

  // ── type toggle ─────────────────────────────────────────────────────
  function setType(t) {
    type = t;
    $("tMc").classList.toggle("on", t === "mc");
    $("tEp").classList.toggle("on", t === "episode");
    $("mcFields").style.display = t === "mc" ? "" : "none";
    $("epFields").style.display = t === "episode" ? "" : "none";
    $("promptLabel").textContent = t === "mc" ? "Question" : "Caption (optional)";
    $("prompt").placeholder = t === "mc"
      ? "e.g. What does Dwight keep in his desk for emergencies?"
      : "e.g. Name this cold open. (leave blank for a default)";
    $("gifLabel").innerHTML = t === "episode"
      ? 'GIF / image <span class="hint">(required)</span>'
      : 'GIF / image <span class="hint">(optional)</span>';
  }
  $("tMc").onclick = function () { setType("mc"); };
  $("tEp").onclick = function () { setType("episode"); };

  // ── MC options ──────────────────────────────────────────────────────
  function addOption(val) {
    var row = OG.el('<div class="choice" style="cursor:default">' +
      '<input type="radio" name="correct" title="Mark correct" style="width:22px;height:22px;flex:0 0 auto">' +
      '<input type="text" class="opt" placeholder="Answer option" value="' + esc(val || "") + '">' +
      '<button class="btn danger" type="button" style="padding:8px 12px">✕</button></div>');
    row.querySelector(".btn.danger").onclick = function () {
      if ($("opts").children.length > 2) row.remove();
      else toast("Need at least two options", true);
    };
    $("opts").appendChild(row);
  }
  $("addOpt").onclick = function () { addOption(""); };
  addOption(""); addOption(""); addOption(""); addOption("");

  // ── episode answer selectors ────────────────────────────────────────
  (function fillSeasons() {
    var seasons = OFFICE.seasonList();
    $("cSeason").innerHTML = seasons.map(function (s) { return '<option value="' + s + '">Season ' + s + '</option>'; }).join("");
    fillEps(seasons[0]);
    $("cSeason").onchange = function () { fillEps(parseInt($("cSeason").value, 10)); };
  })();
  function fillEps(season) {
    var n = OFFICE.episodesIn(season), html = "";
    for (var e = 1; e <= n; e++) html += '<option value="' + e + '">Episode ' + e + '</option>';
    $("cEp").innerHTML = html;
  }

  // ── GIF upload / preview ────────────────────────────────────────────
  function showPrev(url) {
    $("gifPrev").innerHTML = url ? '<div class="gif-frame" style="aspect-ratio:16/9;margin-top:10px"><img src="' + esc(url) + '" alt=""></div>' : "";
  }
  $("gifUrl").addEventListener("input", function () { pendingGifUrl = ""; showPrev($("gifUrl").value.trim()); });
  // No Firebase Storage (that needs the paid Blaze plan). Instead we read the file
  // straight into a base64 data URL and store that as the question's gifUrl in the
  // Realtime Database. Cheap and free for a two-person game; cap at 2 MB so a single
  // record stays small. game.js's <img src> already renders data: URLs.
  var MAX_GIF_BYTES = 2 * 1024 * 1024;
  $("gifFile").addEventListener("change", function () {
    var f = $("gifFile").files[0]; if (!f) return;
    if (f.size > MAX_GIF_BYTES) {
      $("gifMsg").textContent = "That file is " + (f.size / 1048576).toFixed(1) +
        " MB — keep it under 2 MB, or paste a Giphy/Tenor URL instead.";
      $("gifFile").value = ""; return;
    }
    $("gifMsg").textContent = "Reading…";
    var reader = new FileReader();
    reader.onerror = function () {
      $("gifMsg").textContent = "Couldn’t read that file — paste a URL instead.";
      $("gifFile").value = "";
    };
    reader.onload = function () {
      pendingGifUrl = reader.result;   // data:image/...;base64,… — stored in the DB
      $("gifUrl").value = "";
      $("gifMsg").textContent = "Ready ✓ (stored with the question)";
      showPrev(pendingGifUrl);
    };
    reader.readAsDataURL(f);
  });

  function gifValue() { return pendingGifUrl || $("gifUrl").value.trim(); }

  // ── save question ───────────────────────────────────────────────────
  $("save").onclick = function () {
    var prompt = $("prompt").value.trim();
    var gif = gifValue();
    var rec = { type: type, createdBy: who, createdAt: OG.serverNow() };
    if (gif) rec.gifUrl = gif;

    if (type === "mc") {
      if (!prompt) return toast("Add the question text", true);
      var opts = [].slice.call(document.querySelectorAll(".opt")).map(function (i) { return i.value.trim(); });
      var radios = [].slice.call(document.querySelectorAll('input[name="correct"]'));
      var correctIndex = radios.findIndex(function (r) { return r.checked; });
      var filled = opts.filter(Boolean);
      if (filled.length < 2) return toast("Need at least two filled options", true);
      if (correctIndex < 0 || !opts[correctIndex]) return toast("Mark which option is correct", true);
      // compact to filled options, keeping the correct one aligned
      var kept = [], newCorrect = 0;
      opts.forEach(function (o, i) { if (o) { if (i === correctIndex) newCorrect = kept.length; kept.push(o); } });
      rec.prompt = prompt; rec.options = kept; rec.correctIndex = newCorrect;
    } else {
      if (!gif) return toast("Episode questions need a GIF/image", true);
      rec.prompt = prompt || "Which episode is this?";
      rec.correctSeason = parseInt($("cSeason").value, 10);
      rec.correctEpisode = parseInt($("cEp").value, 10);
    }

    db.ref("questions").push(rec).then(function () {
      toast("Saved ✓");
      $("prompt").value = ""; $("gifUrl").value = ""; pendingGifUrl = ""; showPrev(""); $("gifMsg").textContent = "";
      $("opts").innerHTML = ""; addOption(""); addOption(""); addOption(""); addOption("");
    }).catch(function (e) { toast("Save failed: " + e.message, true); });
  };

  // ── existing list ───────────────────────────────────────────────────
  db.ref("questions").on("value", function (s) {
    var data = s.val() || {};
    var ids = Object.keys(data);
    $("count").textContent = ids.length + (ids.length === 1 ? " question" : " questions");
    if (!ids.length) { $("list").innerHTML = '<p class="muted">Nothing yet — add your first one above.</p>'; return; }
    ids.sort(function (a, b) { return (data[b].createdAt || 0) - (data[a].createdAt || 0); });
    $("list").innerHTML = ids.map(function (id) {
      var q = data[id];
      var answer = q.type === "mc"
        ? "Answer: " + esc((q.options || [])[q.correctIndex] || "?")
        : "Answer: S" + q.correctSeason + " · E" + q.correctEpisode;
      var thumb = q.gifUrl ? '<img src="' + esc(q.gifUrl) + '" alt="">' : "";
      return '<div class="qitem"><div>' +
        '<span class="kind ' + (q.type === "episode" ? "episode" : "") + '">' + (q.type === "episode" ? "Episode" : "Multi") + '</span>' +
        '<div class="qtext">' + esc(q.prompt || "Which episode is this?") + '</div>' +
        '<div class="meta">' + answer + ' · by ' + esc(OG.PLAYERS[q.createdBy] ? OG.PLAYERS[q.createdBy].name : q.createdBy) + '</div>' +
        '</div><div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">' + thumb +
        '<button class="btn danger" data-del="' + id + '" style="padding:8px 12px">Delete</button></div></div>';
    }).join("");
    $("list").querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () {
        if (!confirm("Delete this question?")) return;
        db.ref("questions/" + b.dataset.del).remove().then(function () { toast("Deleted"); });
      };
    });
  });

  setType("mc");
})();
