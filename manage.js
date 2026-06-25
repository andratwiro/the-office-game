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
  var who = OG.getName() || "host";
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
    $("tTws").classList.toggle("on", t === "tws");
    $("mcFields").style.display = t === "mc" ? "" : "none";
    $("epFields").style.display = t === "episode" ? "" : "none";
    $("twsFields").style.display = t === "tws" ? "" : "none";
    $("promptLabel").textContent = t === "mc" ? "Question" : t === "tws" ? "The line" : "Caption (optional)";
    $("prompt").placeholder = t === "mc"
      ? "e.g. What does Dwight keep in his desk for emergencies?"
      : t === "tws"
      ? "e.g. That’s what she said."
      : "e.g. Name this cold open. (leave blank for a default)";
    $("gifLabel").innerHTML = t === "episode"
      ? 'GIF / image <span class="hint">(required)</span>'
      : 'GIF / image <span class="hint">(optional)</span>';
  }
  $("tMc").onclick = function () { setType("mc"); };
  $("tEp").onclick = function () { setType("episode"); };
  $("tTws").onclick = function () { setType("tws"); };

  // ── "That's what she said" character slots ──────────────────────────
  function castOptions(selected) {
    return CAST.list().map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === selected ? " selected" : "") + '>' + esc(c.name) + '</option>';
    }).join("");
  }
  (function buildTwsSlots() {
    var picks = CAST.list().slice(0, 4);
    var rows = "";
    for (var i = 0; i < 4; i++) {
      rows += '<div class="choice" style="cursor:default">' +
        '<input type="radio" name="twscorrect" title="Mark who said it" style="width:22px;height:22px;flex:0 0 auto"' + (i === 0 ? " checked" : "") + '>' +
        '<select class="twsslot">' + castOptions(picks[i] && picks[i].id) + '</select></div>';
    }
    $("twsSlots").innerHTML = rows;
  })();

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
    } else if (type === "tws") {
      if (!prompt) return toast("Add the line", true);
      var slots = [].slice.call(document.querySelectorAll("#twsSlots .twsslot")).map(function (s) { return s.value; });
      var twsCorrect = [].slice.call(document.querySelectorAll('input[name="twscorrect"]')).findIndex(function (r) { return r.checked; });
      if (new Set(slots).size < 4) return toast("Pick four different characters", true);
      if (twsCorrect < 0) return toast("Mark who said it", true);
      rec.prompt = prompt; rec.choices = slots; rec.correctId = slots[twsCorrect];
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

  // ── existing list (with inline editing) ──────────────────────────────
  var editingId = null;   // survives re-renders so an open editor stays open

  db.ref("questions").on("value", function (s) {
    var data = s.val() || {};
    var ids = Object.keys(data);
    $("count").textContent = ids.length + (ids.length === 1 ? " question" : " questions");
    if (!ids.length) { $("list").innerHTML = '<p class="muted">Nothing yet — add your first one above.</p>'; editingId = null; return; }
    ids.sort(function (a, b) { return (data[b].createdAt || 0) - (data[a].createdAt || 0); });
    $("list").innerHTML = ids.map(function (id) {
      var q = data[id];
      var answer = q.type === "mc"
        ? "Answer: " + esc((q.options || [])[q.correctIndex] || "?")
        : q.type === "tws"
        ? "Said by: " + esc(CAST.name(q.correctId))
        : "Answer: S" + q.correctSeason + " · E" + q.correctEpisode;
      var kindClass = q.type === "episode" ? "episode" : q.type === "tws" ? "tws" : "";
      var kindLabel = q.type === "episode" ? "Episode" : q.type === "tws" ? "Who said it" : "Multi";
      var thumb = q.gifUrl ? '<img src="' + esc(q.gifUrl) + '" alt="">' : "";
      return '<div class="qitem"><div>' +
        '<span class="kind ' + kindClass + '">' + kindLabel + '</span>' +
        '<div class="qtext">' + esc(q.prompt || "Which episode is this?") + '</div>' +
        '<div class="meta">' + answer + ' · by ' + esc(q.createdBy || "host") + '</div>' +
        '</div><div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">' + thumb +
        '<button class="btn ghost" data-edit="' + id + '" style="padding:8px 12px">Edit</button>' +
        '<button class="btn danger" data-del="' + id + '" style="padding:8px 12px">Delete</button></div></div>' +
        '<div class="editor-mount" data-mount="' + id + '"></div>';
    }).join("");

    $("list").querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () {
        if (!confirm("Delete this question?")) return;
        db.ref("questions/" + b.dataset.del).remove().then(function () { toast("Deleted"); });
      };
    });
    $("list").querySelectorAll("[data-edit]").forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.edit;
        if (editingId === id) { editingId = null; closeEditors(); }
        else { editingId = id; closeEditors(); openEditor(id, data[id], true); }
      };
    });

    // Re-open the editor after a re-render (e.g. another save came in).
    if (editingId && data[editingId]) openEditor(editingId, data[editingId], false);
    else editingId = null;
  });

  function closeEditors() {
    $("list").querySelectorAll(".editor-mount").forEach(function (m) { m.innerHTML = ""; });
  }
  function openEditor(id, q, scroll) {
    var mount = $("list").querySelector('[data-mount="' + id + '"]');
    if (!mount) return;
    mount.innerHTML = "";
    mount.appendChild(buildEditor(id, q));
    if (scroll) mount.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function buildEditor(id, q) {
    var wrap = OG.el('<div class="editor"></div>');

    var pf = OG.el('<div class="field"><label>' +
      (q.type === "episode" ? "Caption (optional)" : q.type === "tws" ? "The line" : "Question") +
      '</label><textarea rows="2" class="e-prompt"></textarea></div>');
    pf.querySelector(".e-prompt").value = q.prompt || "";
    wrap.appendChild(pf);

    if (q.type === "mc") {
      var of = OG.el('<div class="field"><label>Options <span class="hint">(tap the circle to mark the correct one)</span></label>' +
        '<div class="e-opts stack" style="margin-top:8px"></div>' +
        '<button class="btn ghost e-add" type="button" style="margin-top:10px">+ Add option</button></div>');
      var box = of.querySelector(".e-opts");
      var addRow = function (val, checked) {
        var row = OG.el('<div class="choice" style="cursor:default">' +
          '<input type="radio" name="ecorrect-' + id + '" title="Mark correct" style="width:22px;height:22px;flex:0 0 auto">' +
          '<input type="text" class="e-opt" placeholder="Answer option" value="' + esc(val || "") + '">' +
          '<button class="btn danger" type="button" style="padding:8px 12px">✕</button></div>');
        if (checked) row.querySelector('input[type="radio"]').checked = true;
        row.querySelector(".btn.danger").onclick = function () {
          if (box.children.length > 2) row.remove(); else toast("Need at least two options", true);
        };
        box.appendChild(row);
      };
      (q.options || []).forEach(function (o, i) { addRow(o, i === q.correctIndex); });
      while (box.children.length < 2) addRow("", false);
      of.querySelector(".e-add").onclick = function () { addRow("", false); };
      wrap.appendChild(of);
    } else if (q.type === "tws") {
      var tf = OG.el('<div class="field"><label>The four faces <span class="hint">(tap the circle to mark who said it)</span></label>' +
        '<div class="e-tws stack" style="margin-top:8px"></div></div>');
      var tbox = tf.querySelector(".e-tws");
      var choices = (q.choices || []).slice();
      while (choices.length < 4) choices.push((CAST.list()[choices.length] || {}).id);
      choices.forEach(function (cid, i) {
        var row = OG.el('<div class="choice" style="cursor:default">' +
          '<input type="radio" name="etws-' + id + '" title="Mark who said it" style="width:22px;height:22px;flex:0 0 auto"' + (cid === q.correctId ? " checked" : "") + '>' +
          '<select class="e-twsslot">' + castOptions(cid) + '</select></div>');
        tbox.appendChild(row);
      });
      wrap.appendChild(tf);
    } else {
      var ef = OG.el('<div class="field"><div class="sel-row">' +
        '<div><label>Season</label><select class="e-season"></select></div>' +
        '<div><label>Episode</label><select class="e-ep"></select></div></div></div>');
      var selS = ef.querySelector(".e-season"), selE = ef.querySelector(".e-ep");
      var seasons = OFFICE.seasonList();
      selS.innerHTML = seasons.map(function (n) { return '<option value="' + n + '">Season ' + n + '</option>'; }).join("");
      var fillE = function (season, pick) {
        var n = OFFICE.episodesIn(season), h = "";
        for (var e = 1; e <= n; e++) h += '<option value="' + e + '">Episode ' + e + '</option>';
        selE.innerHTML = h; if (pick) selE.value = pick;
      };
      selS.value = q.correctSeason || seasons[0];
      fillE(parseInt(selS.value, 10), q.correctEpisode);
      selS.onchange = function () { fillE(parseInt(selS.value, 10)); };
      wrap.appendChild(ef);
    }

    var isData = q.gifUrl && q.gifUrl.indexOf("data:") === 0;
    var gf = OG.el('<div class="field"><label>GIF / image URL <span class="hint">' +
      (isData ? "(uploaded image kept — paste a URL to replace it)" : "(optional)") +
      '</span></label><input type="text" class="e-gif" placeholder="https://… (leave blank to keep)"></div>');
    if (q.gifUrl && !isData) gf.querySelector(".e-gif").value = q.gifUrl;
    wrap.appendChild(gf);

    var act = OG.el('<div class="btn-row"><button class="btn primary e-save">Save changes</button>' +
      '<button class="btn ghost e-cancel">Cancel</button></div>');
    act.querySelector(".e-cancel").onclick = function () { editingId = null; closeEditors(); };
    act.querySelector(".e-save").onclick = function () { saveEdit(id, q, wrap); };
    wrap.appendChild(act);
    return wrap;
  }

  function saveEdit(id, q, wrap) {
    var prompt = wrap.querySelector(".e-prompt").value.trim();
    var patch = {};
    if (q.type === "mc") {
      var opts = [].slice.call(wrap.querySelectorAll(".e-opt")).map(function (i) { return i.value.trim(); });
      var radios = [].slice.call(wrap.querySelectorAll('input[name="ecorrect-' + id + '"]'));
      var ci = radios.findIndex(function (r) { return r.checked; });
      var kept = [], newCorrect = -1;
      opts.forEach(function (o, i) { if (o) { if (i === ci) newCorrect = kept.length; kept.push(o); } });
      if (!prompt) return toast("Add the question text", true);
      if (kept.length < 2) return toast("Need at least two filled options", true);
      if (newCorrect < 0) return toast("Mark which option is correct", true);
      patch.prompt = prompt; patch.options = kept; patch.correctIndex = newCorrect;
    } else if (q.type === "tws") {
      var slots = [].slice.call(wrap.querySelectorAll(".e-twsslot")).map(function (s) { return s.value; });
      var tci = [].slice.call(wrap.querySelectorAll('input[name="etws-' + id + '"]')).findIndex(function (r) { return r.checked; });
      if (!prompt) return toast("Add the line", true);
      if (new Set(slots).size < 4) return toast("Pick four different characters", true);
      if (tci < 0) return toast("Mark who said it", true);
      patch.prompt = prompt; patch.choices = slots; patch.correctId = slots[tci];
    } else {
      patch.prompt = prompt || "Which episode is this?";
      patch.correctSeason = parseInt(wrap.querySelector(".e-season").value, 10);
      patch.correctEpisode = parseInt(wrap.querySelector(".e-ep").value, 10);
    }
    var gif = wrap.querySelector(".e-gif").value.trim();
    if (gif) patch.gifUrl = gif;   // only replace when a new URL is typed
    editingId = null;
    db.ref("questions/" + id).update(patch)
      .then(function () { toast("Updated ✓"); })
      .catch(function (e) { editingId = id; toast("Update failed: " + e.message, true); });
  }

  setType("mc");
})();
