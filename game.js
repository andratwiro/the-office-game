// The game engine + rendering for index.html.
// One shared Realtime-DB room, server-timestamp-synced 10s timers, and an
// open-door roster: whoever opens the room joins as a player. The star of the
// screen is the crowd of emoji avatars — it fills the conference room in the
// lobby (any headcount), shows what each face is doing per question
// (thinking → locked in), then cheers or wilts on the reveal.
(function () {
  "use strict";
  var stage = document.getElementById("stage");
  var esc = OG.esc;

  var QUESTION_MS = 10000;
  var REVEAL_MS = 4800;
  var MAX_QUESTIONS = 14;
  var TS = firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now;

  var me = null;          // this device's stable uid
  var room = null;        // latest room snapshot value
  var questions = {};     // id -> question
  var settings = { triggerTime: OG.DEFAULT_TRIGGER };
  var roomRef = null, meRef = null;
  var lastKey = "";
  var localAnsweredAt = -1;
  var joined = false;

  // ── boot ────────────────────────────────────────────────────────────
  if (!OG.configured()) { renderConfig(); return; }
  OG.init();
  me = OG.uid();
  if (!OG.hasIdentity()) renderSetup();
  else join();

  // Save name + emoji, then either join the room or — if already in — push the
  // change to my presence record so the room sees my new face immediately.
  function applyIdentity() {
    if (joined && meRef) { meRef.update({ name: OG.getName(), emoji: OG.getEmoji() }); lastKey = ""; renderAll(); }
    else join();
  }

  function join() {
    if (joined) { lastKey = ""; renderAll(); return; }
    joined = true;
    var db = OG.db();
    roomRef = db.ref("rooms/" + OG.ROOM);

    meRef = roomRef.child("players/" + me);
    meRef.update({ name: OG.getName(), emoji: OG.getEmoji(), online: true, lastSeen: TS });
    meRef.child("joinedAt").once("value", function (s) { if (!s.exists()) meRef.child("joinedAt").set(TS); });
    meRef.child("online").onDisconnect().set(false);
    setInterval(function () { meRef.child("lastSeen").set(TS); }, 4000);
    window.addEventListener("beforeunload", function () { meRef.child("online").set(false); });

    db.ref("settings").on("value", function (s) {
      var v = s.val() || {};
      settings.triggerTime = v.triggerTime || OG.DEFAULT_TRIGGER;
      if (room && (room.status == null || room.status === "idle")) { lastKey = ""; renderAll(); }
    });
    db.ref("questions").on("value", function (s) { questions = s.val() || {}; });
    roomRef.on("value", function (s) { room = s.val() || {}; renderAll(); });

    setInterval(hostTick, 220);
    setInterval(tick, 100);
  }

  // ── roster ──────────────────────────────────────────────────────────────
  // The room's people, oldest seat first. me is folded in even before the first
  // snapshot lands so you always see yourself the instant you join.
  function players() { return (room && room.players) || {}; }
  function rosterAll() {
    var pl = players(), ids = Object.keys(pl);
    if (ids.indexOf(me) === -1 && OG.getName()) ids.push(me);
    return ids.map(function (id) {
      var p = pl[id] || (id === me ? { name: OG.getName(), emoji: OG.getEmoji(), online: true } : {});
      return { id: id, online: !!p.online, joinedAt: p.joinedAt || 0 };
    }).sort(function (a, b) {
      return (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : 1);
    });
  }
  function rosterOnline() { return rosterAll().filter(function (r) { return r.online; }); }

  function nameOf(id) {
    var p = players()[id];
    return (p && p.name) || (id === me ? OG.getName() : "Someone");
  }
  function emojiOf(id) {
    var p = players()[id];
    return (p && p.emoji) || (id === me ? OG.getEmoji() : "🙂");
  }
  function isOnline(id) { var p = players()[id]; return !!(p && p.online); }

  // ── host loop ─────────────────────────────────────────────────────────
  function onlineCount() { return rosterOnline().length; }
  function answeredCount(i) {
    var a = room && room.answers && room.answers[i];
    return a ? Object.keys(a).length : 0;
  }
  function hostTick() {
    if (!room) return;
    if (room.hostId !== me) {
      if (room.status === "playing") {
        var h = room.players && room.players[room.hostId];
        var meOn = room.players && room.players[me] && room.players[me].online;
        if ((!h || !h.online) && meOn) roomRef.child("hostId").set(me);
      }
      return;
    }
    if (room.status !== "playing") return;
    var elapsed = OG.serverNow() - (room.startedAt || 0);
    if (room.phase === "question") {
      var present = onlineCount();
      var everyoneIn = present > 0 && answeredCount(room.index) >= present;
      if (elapsed >= QUESTION_MS || everyoneIn) roomRef.update({ phase: "reveal", startedAt: TS });
    } else if (room.phase === "reveal") {
      if (elapsed >= REVEAL_MS) {
        var last = (room.order ? room.order.length : 0) - 1;
        if (room.index < last) roomRef.update({ index: room.index + 1, phase: "question", startedAt: TS });
        else roomRef.update({ status: "finished" });
      }
    }
  }

  // ── actions ───────────────────────────────────────────────────────────
  function startShow() {
    var ids = Object.keys(questions);
    if (!ids.length) return;
    localAnsweredAt = -1;
    roomRef.update({
      status: "playing", phase: "question", index: 0,
      order: OG.shuffle(ids).slice(0, MAX_QUESTIONS), hostId: me,
      round: OG.serverNow(), startedAt: TS, answers: null
    });
  }
  function playAgain() {
    localAnsweredAt = -1;
    roomRef.update({ status: "idle", phase: null, answers: null, order: null, index: 0 });
  }
  function currentQuestion() {
    if (!room || !room.order) return null;
    var id = room.order[room.index];
    return questions[id] ? Object.assign({ id: id }, questions[id]) : null;
  }
  function submit(payload) {
    if (room.phase !== "question" || localAnsweredAt === room.index) return;
    var q = currentQuestion(); if (!q) return;
    var ms = OG.serverNow() - (room.startedAt || 0);
    var frac = Math.max(0, Math.min(1, (QUESTION_MS - ms) / QUESTION_MS));
    var correct = false, points = 0, answer;
    if (q.type === "mc") {
      answer = payload.index;
      correct = answer === q.correctIndex;
      points = correct ? Math.round(50 + 50 * frac) : 0;
    } else {
      answer = { season: payload.season, episode: payload.episode };
      var sOK = answer.season === q.correctSeason, eOK = answer.episode === q.correctEpisode;
      correct = sOK && eOK;
      points = (sOK ? 40 : 0) + (eOK ? 40 : 0) + (correct ? Math.round(20 * frac) : 0);
    }
    localAnsweredAt = room.index;
    roomRef.child("answers/" + room.index + "/" + me).set(
      { answer: answer, correct: correct, points: points, ms: ms, type: q.type, name: OG.getName(), emoji: OG.getEmoji() });
  }

  // ── per-frame timer / countdown ───────────────────────────────────────
  function tick() {
    if (!room) return;
    if (room.status === "playing" && room.phase === "question") {
      var left = Math.max(0, QUESTION_MS - (OG.serverNow() - (room.startedAt || 0)));
      var bar = document.getElementById("tbar"), tc = document.getElementById("tcount");
      if (bar) bar.style.transform = "scaleX(" + (left / QUESTION_MS) + ")";
      if (tc) tc.textContent = "00:" + String(Math.ceil(left / 1000)).padStart(2, "0");
      if (left <= 0) lockChoices();
    }
    var cd = document.getElementById("cd");
    if (cd) cd.textContent = OG.fmtCountdown(OG.msUntilTrigger(settings.triggerTime));
  }
  function lockChoices() {
    stage.querySelectorAll(".choice:not([disabled]), .ep-submit:not([disabled])")
      .forEach(function (n) { n.setAttribute("disabled", ""); });
  }

  // ── avatar helpers ────────────────────────────────────────────────────
  // density label drives avatar sizing so the same crowd reads well at any count
  function densityFor(n) { return n <= 4 ? "roomy" : n <= 9 ? "cozy" : n <= 16 ? "tight" : "packed"; }

  // state: idle | think | locked | correct | wrong | away
  function castHTML(id, state, tag) {
    // names are withheld until the finale; the face (yours ringed) carries it
    return '<div class="cast ' + state + (id === me ? " me" : "") + '">' +
      '<span class="ava">' + esc(emojiOf(id)) + '</span>' +
      (tag ? '<span class="cast-tag">' + tag + '</span>' : '') + '</div>';
  }
  function castRow(list, big, reacting, render) {
    var density = densityFor(list.length);
    return '<div class="cast-row' + (big ? " big" : "") + (reacting ? " reacting" : "") +
      '" data-density="' + density + '">' + list.map(render).join("") + '</div>';
  }

  // ── routing ───────────────────────────────────────────────────────────
  function renderAll() {
    if (!joined) return;
    var key;
    if (!room || room.status == null || room.status === "idle")
      key = "lobby:" + settings.triggerTime + ":" + rosterFingerprint();
    else if (room.status === "finished") key = "finished:" + rosterFingerprint();
    else if (room.phase === "reveal") key = "reveal:" + room.index + ":" + rosterFingerprint();
    else key = "q:" + room.index + ":" + rosterFingerprint() + ":" + answeredIds(room.index) + ":" + (localAnsweredAt === room.index);
    if (key === lastKey) return;
    lastKey = key;
    if (!room || room.status == null || room.status === "idle") renderLobby();
    else if (room.status === "finished") renderFinished();
    else if (room.phase === "reveal") renderReveal();
    else renderQuestion();
  }
  function rosterFingerprint() {
    return rosterOnline().map(function (r) { return r.id + (emojiOf(r.id)); }).join("|");
  }
  function answeredIds(i) {
    var a = room && room.answers && room.answers[i];
    return a ? Object.keys(a).sort().join("") : "";
  }

  // ── screens ───────────────────────────────────────────────────────────
  function renderConfig() {
    stage.innerHTML =
      '<section class="card stack"><span class="tab">Setup</span><h1>Almost ready</h1>' +
      '<p>Paste your Firebase web config into <code>firebase-config.js</code>, then reload. ' +
      'Full steps are in <strong>README.md</strong>.</p>' +
      '<p class="hint">The game needs a Firebase project (Realtime Database + Anonymous auth) ' +
      'to share one room between phones.</p></section>';
  }

  // One screen: pick a face from the grid, type a name below, join. Re-used by
  // the "My face" quick action to edit both at once.
  function renderSetup() {
    var picked = OG.getEmoji();
    var grid = OG.EMOJI.map(function (e) {
      return '<button class="ava-pick' + (e === picked ? " on" : "") + '" data-e="' + esc(e) + '">' + esc(e) + '</button>';
    }).join("");
    stage.innerHTML =
      '<section class="card stack"><span class="tab">Casting</span>' +
      '<h1>Pick your face</h1>' +
      '<p class="hint">Tap an emoji — it’s you all night, and it cheers when you’re right.</p>' +
      '<div class="ava-grid" id="grid">' + grid + '</div>' +
      '<input id="nm" class="bigfield" type="text" placeholder="Your name" maxlength="22" ' +
      'autocomplete="off" autocapitalize="words" enterkeyhint="go" value="' + esc(OG.getName()) + '">' +
      '<button class="btn primary block big-tap" id="go">' + (joined ? "Save" : "Join the room") + ' →</button></section>';

    var grid_ = document.getElementById("grid"), input = document.getElementById("nm"), go = document.getElementById("go");
    grid_.querySelectorAll(".ava-pick").forEach(function (b) {
      b.addEventListener("click", function () {
        picked = b.dataset.e;
        grid_.querySelectorAll(".ava-pick").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        grid_.classList.remove("nopick");
      });
    });
    function commit() {
      if (!picked) { grid_.classList.add("nopick"); grid_.scrollIntoView({ block: "center" }); return; }
      var n = OG.setName(input.value);
      if (!n) { input.focus(); input.classList.add("nopick"); return; }
      OG.setEmoji(picked);
      applyIdentity();
    }
    go.addEventListener("click", commit);
    input.addEventListener("input", function () { input.classList.remove("nopick"); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") commit(); });
    if (!picked) { /* nudge toward picking a face first */ } else input.focus();
  }

  function renderLobby() {
    var hasQ = Object.keys(questions).length > 0;
    var unlocked = OG.passedToday(settings.triggerTime);
    var here = rosterOnline();
    var n = here.length;

    // names stay hidden until the final scoreboard — the crowd is just faces,
    // yours wearing the ring. each face gets a stagger index (--i) for the bob.
    var crowd = '<div class="crowd" data-density="' + densityFor(n) + '">' +
      here.map(function (r, i) {
        return '<div class="peep' + (r.id === me ? " me" : "") + '" style="--i:' + i + '">' +
          '<span class="face">' + esc(emojiOf(r.id)) + '</span></div>';
      }).join("") + '</div>';

    var headline = n <= 1 ? "You’re the first one in" : n + " in the conference room";
    var startBtn = hasQ
      ? '<button class="btn primary block big-tap" id="start">Start the show ▶</button>'
      : '<a class="btn primary block big-tap" href="manage.html">Add some questions first →</a>';

    stage.innerHTML =
      '<section class="card stack"><span class="tab">Conference room</span>' +
      '<div class="label">Next session · ' + esc(settings.triggerTime) + ' CET</div>' +
      '<div class="countdown" id="cd">' + OG.fmtCountdown(OG.msUntilTrigger(settings.triggerTime)) + '</div>' +
      '<p class="hint">' + (unlocked
        ? "We’re live for today — jump in whenever everyone’s here."
        : "Counting down to tonight’s session. You can start early to rehearse, too.") + '</p>' +
      crowd +
      '<div class="crowd-meta label">' + esc(headline) + '</div>' +
      startBtn +
      '<div class="quick-row">' +
        '<button class="qbtn" id="invite"><span class="qi">🔗</span><span>Invite</span></button>' +
        '<a class="qbtn" href="manage.html"><span class="qi">📝</span><span>Questions</span></a>' +
        '<button class="qbtn" id="reface"><span class="qi">🙂</span><span>My face</span></button>' +
      '</div></section>';

    var s = document.getElementById("start"); if (s) s.addEventListener("click", startShow);
    document.getElementById("reface").addEventListener("click", function () { renderSetup(); });
    document.getElementById("invite").addEventListener("click", invite);
  }

  function invite() {
    var url = location.href.split("#")[0];
    var btn = document.getElementById("invite");
    if (navigator.share) {
      navigator.share({ title: "Dunder Mifflin Trivia", text: "Join the trivia night →", url: url }).catch(function () {});
      return;
    }
    var done = function () { flashBtn(btn, "✓", "Copied!"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
    else done();
  }
  function flashBtn(btn, icon, label) {
    if (!btn) return;
    var i = btn.querySelector(".qi"), t = btn.querySelector("span:last-child");
    var oi = i.textContent, ot = t.textContent;
    i.textContent = icon; t.textContent = label; btn.classList.add("ok");
    setTimeout(function () { i.textContent = oi; t.textContent = ot; btn.classList.remove("ok"); }, 1600);
  }

  function renderQuestion() {
    var q = currentQuestion();
    if (!q) { stage.innerHTML = '<section class="card">Loading…</section>'; return; }
    var a = (room.answers && room.answers[room.index]) || {};
    var answered = localAnsweredAt === room.index || !!a[me];
    var gif = q.gifUrl ? '<div class="gif-frame"><img src="' + esc(q.gifUrl) + '" alt=""></div>' : "";

    var cast = castRow(rosterOnline(), false, false, function (r) {
      var done = !!a[r.id];
      return castHTML(r.id, done ? "locked" : "think", done ? "locked in ✓" : "thinking…");
    });

    var body = q.type === "mc"
      ? '<div class="choices">' + (q.options || []).map(function (opt, i) {
          return '<button class="choice" data-i="' + i + '"' + (answered ? " disabled" : "") +
            '><span class="box">' + String.fromCharCode(65 + i) + '</span><span>' + esc(opt) + "</span></button>";
        }).join("") + "</div>"
      : episodePickerHTML(answered);

    stage.innerHTML =
      '<div class="timecode"><span class="qn">Take ' + (room.index + 1) + " / " + room.order.length +
      '</span><span id="tcount">00:10</span></div>' +
      '<div class="timerbar"><i id="tbar"></i></div>' + gif +
      '<div class="prompt">' + esc(q.prompt || (q.type === "episode" ? "Name the season & episode." : "")) + '</div>' +
      body + cast;

    var mine = a[me];
    if (q.type === "mc") {
      stage.querySelectorAll(".choice").forEach(function (c) {
        if (mine && mine.answer === parseInt(c.dataset.i, 10)) c.classList.add("picked");
        c.addEventListener("click", function () {
          if (c.hasAttribute("disabled")) return;
          lockChoices(); c.classList.add("picked");
          submit({ index: parseInt(c.dataset.i, 10) });
        });
      });
    } else {
      wireEpisodePicker();
      if (mine && mine.answer) {
        var ss = document.getElementById("selSeason"), se = document.getElementById("selEp");
        if (ss) { ss.value = mine.answer.season; ss.dispatchEvent(new Event("change")); }
        if (se) se.value = mine.answer.episode;
      }
    }
  }

  function episodePickerHTML(answered) {
    var seasons = OFFICE.seasonList();
    var sOpts = seasons.map(function (s) { return '<option value="' + s + '">Season ' + s + "</option>"; }).join("");
    var eOpts = "";
    for (var e = 1; e <= OFFICE.episodesIn(seasons[0]); e++) eOpts += '<option value="' + e + '">Episode ' + e + "</option>";
    return '<div class="tape"><div class="label">VHS · The Office — dub your guess</div><div class="sel-row">' +
      '<div><label>Season</label><select id="selSeason"' + (answered ? " disabled" : "") + ">" + sOpts + "</select></div>" +
      '<div><label>Episode</label><select id="selEp"' + (answered ? " disabled" : "") + ">" + eOpts + "</select></div>" +
      "</div></div><button class=\"btn primary block big-tap ep-submit\"" + (answered ? " disabled" : "") + ">Lock in answer</button>";
  }
  function wireEpisodePicker() {
    var selS = document.getElementById("selSeason"), selE = document.getElementById("selEp");
    if (!selS) return;
    selS.addEventListener("change", function () {
      var n = OFFICE.episodesIn(parseInt(selS.value, 10)); selE.innerHTML = "";
      for (var e = 1; e <= n; e++) { var o = document.createElement("option"); o.value = e; o.textContent = "Episode " + e; selE.appendChild(o); }
    });
    var btn = stage.querySelector(".ep-submit");
    btn.addEventListener("click", function () {
      if (btn.hasAttribute("disabled")) return;
      lockChoices(); submit({ season: parseInt(selS.value, 10), episode: parseInt(selE.value, 10) });
    });
  }

  function fmtAnswer(q, ans) {
    if (!ans) return "no answer";
    if (q.type === "mc") return q.options ? q.options[ans.answer] : "?";
    return "S" + ans.answer.season + " · E" + ans.answer.episode;
  }
  function correctText(q) {
    if (q.type === "mc") return (q.options || [])[q.correctIndex];
    return "Season " + q.correctSeason + ", Episode " + q.correctEpisode;
  }

  function renderReveal() {
    var q = currentQuestion();
    if (!q) { stage.innerHTML = '<section class="card">…</section>'; return; }
    var a = (room.answers && room.answers[room.index]) || {};
    var gif = q.gifUrl ? '<div class="gif-frame"><img src="' + esc(q.gifUrl) + '" alt=""></div>' : "";
    var cast = castRow(rosterOnline(), true, true, function (r) {
      var ans = a[r.id], ok = ans && ans.correct;
      var tag = ans ? ('“' + esc(fmtAnswer(q, ans)) + '” · +' + ans.points) : "missed it · +0";
      return castHTML(r.id, ans ? (ok ? "correct" : "wrong") : "wrong", tag);
    });
    stage.innerHTML =
      '<div class="timecode"><span class="qn">Take ' + (room.index + 1) + " / " + room.order.length +
      '</span><span>REVEAL</span></div>' +
      '<section class="card stack"><div class="label">The answer was</div>' +
      '<h2>' + esc(correctText(q)) + "</h2>" + gif + '</section>' + cast;
  }

  function renderFinished() {
    // Anyone who scored a point this game, plus everyone still in the room.
    var totals = {}, names = {};
    rosterAll().forEach(function (r) { totals[r.id] = 0; });
    var ans = room.answers || {};
    Object.keys(ans).forEach(function (i) {
      Object.keys(ans[i]).forEach(function (id) {
        var rec = ans[i][id];
        if (totals[id] == null) totals[id] = 0;
        totals[id] += (rec.points || 0);
        if (rec.name) names[id] = rec.name;     // remember leavers by their last answer
      });
    });
    var ids = Object.keys(totals);
    var best = ids.length ? Math.max.apply(null, ids.map(function (id) { return totals[id]; })) : 0;
    var winners = ids.filter(function (id) { return totals[id] === best; });
    var tie = winners.length > 1;
    var winName = function (id) { return nameOf(id) !== "Someone" ? nameOf(id) : (names[id] || "Someone"); };
    var banner = !ids.length ? "Nobody answered — Michael would be heartbroken."
      : tie ? "A dead heat — even Michael couldn’t pick a favorite."
      : winName(winners[0]) + " is World’s Best.";
    var rows = ids.sort(function (x, y) { return totals[y] - totals[x]; }).map(function (id) {
      var win = totals[id] === best && !tie;
      return '<div class="score' + (win ? " win" : "") + '">' +
        '<span class="emoji">' + esc(emojiOf(id)) + (win ? " 🏆" : "") + '</span>' +
        '<span class="who">' + esc(winName(id)) + '</span>' +
        '<span class="num">' + totals[id] + '</span></div>';
    }).join("");
    stage.innerHTML =
      '<section class="card stack center"><span class="tab">That’s a wrap</span>' +
      '<div class="banner">' + esc(banner) + '</div>' +
      '<div class="score-grid">' + rows + '</div>' +
      '<button class="btn primary block big-tap" id="again">Run it back ↺</button>' +
      '<a class="link" href="manage.html">Add new questions</a></section>';
    document.getElementById("again").addEventListener("click", playAgain);
  }
})();
