// The game engine + rendering for index.html.
// Two players, one shared Realtime-DB room, server-timestamp-synced 10s timers.
// The star of the screen is each player's emoji avatar: it waits in the lobby,
// shows what it's doing each question (thinking → locked in), then cheers or
// wilts on the reveal. Score feedback rides on the face.
(function () {
  "use strict";
  var stage = document.getElementById("stage");
  var esc = OG.esc;

  var QUESTION_MS = 10000;
  var REVEAL_MS = 4800;
  var MAX_QUESTIONS = 14;
  var TS = firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now;

  var me = null;
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
  me = OG.getPlayer();
  if (!me) renderPickName();
  else if (!localStorage.getItem("og_emoji")) renderPickEmoji();
  else join();

  function join() {
    if (joined) { lastKey = ""; renderAll(); return; }
    joined = true;
    var db = OG.db();
    roomRef = db.ref("rooms/" + OG.ROOM);

    var p = OG.PLAYERS[me];
    meRef = roomRef.child("players/" + me);
    meRef.update({ name: p.name, emoji: OG.getEmoji(), online: true, lastSeen: TS });
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

  // ── host loop ─────────────────────────────────────────────────────────
  function onlineCount() {
    var n = 0, pl = room && room.players;
    for (var k in pl) if (pl[k] && pl[k].online) n++;
    return n;
  }
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
      { answer: answer, correct: correct, points: points, ms: ms, type: q.type });
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
  function emojiOf(id) {
    var pl = room && room.players && room.players[id];
    return (pl && pl.emoji) || OG.PLAYERS[id].emoji;
  }
  function isOnline(id) { return !!(room && room.players && room.players[id] && room.players[id].online); }
  // state: idle | think | locked | correct | wrong | away
  function avatarHTML(id, state, tag) {
    var p = OG.PLAYERS[id];
    return '<div class="cast ' + state + (id === me ? " me" : "") + '">' +
      '<span class="ava">' + esc(emojiOf(id)) + '</span>' +
      '<span class="cast-name">' + esc(p.name) + '</span>' +
      (tag ? '<span class="cast-tag">' + tag + '</span>' : '') + '</div>';
  }

  // ── routing ───────────────────────────────────────────────────────────
  function renderAll() {
    if (!joined) return;
    var key;
    if (!room || room.status == null || room.status === "idle")
      key = "lobby:" + settings.triggerTime + ":" + castFingerprint();
    else if (room.status === "finished") key = "finished";
    else if (room.phase === "reveal") key = "reveal:" + room.index;
    else key = "q:" + room.index + ":" + answeredIds(room.index) + ":" + (localAnsweredAt === room.index);
    if (key === lastKey) return;
    lastKey = key;
    if (!room || room.status == null || room.status === "idle") renderLobby();
    else if (room.status === "finished") renderFinished();
    else if (room.phase === "reveal") renderReveal();
    else renderQuestion();
  }
  function castFingerprint() {
    var pl = (room && room.players) || {};
    return Object.keys(OG.PLAYERS).map(function (id) {
      return id + (pl[id] && pl[id].online ? "1" : "0") + (pl[id] && pl[id].emoji || "");
    }).join("|");
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
      'to share one room between two phones.</p></section>';
  }

  function renderPickName() {
    var cards = Object.keys(OG.PLAYERS).map(function (id) {
      var p = OG.PLAYERS[id];
      return '<button class="placard" data-id="' + id + '"><div class="emoji">' + p.emoji +
        '</div><div class="who">' + esc(p.name) + '</div></button>';
    }).join("");
    stage.innerHTML =
      '<section class="card stack"><span class="tab">Identification</span>' +
      '<h1>Who’s reporting for<br>the documentary?</h1>' +
      '<p class="hint">Pick your name — this phone stays signed in as you.</p>' +
      '<div class="placards">' + cards + '</div></section>';
    stage.querySelectorAll(".placard").forEach(function (b) {
      b.addEventListener("click", function () { OG.setPlayer(b.dataset.id); me = OG.getPlayer(); renderPickEmoji(); });
    });
  }

  function renderPickEmoji() {
    var grid = OG.EMOJI.map(function (e) {
      return '<button class="ava-pick" data-e="' + esc(e) + '">' + esc(e) + '</button>';
    }).join("");
    stage.innerHTML =
      '<section class="card stack"><span class="tab">Casting</span>' +
      '<h1>Choose your face</h1>' +
      '<p class="hint">Hi ' + esc(OG.PLAYERS[me].name) + ' — this emoji is you all night. It’ll cheer when you’re right.</p>' +
      '<div class="ava-grid">' + grid + '</div></section>';
    stage.querySelectorAll(".ava-pick").forEach(function (b) {
      b.addEventListener("click", function () { OG.setEmoji(b.dataset.e); join(); });
    });
  }

  function renderLobby() {
    var hasQ = Object.keys(questions).length > 0;
    var unlocked = OG.passedToday(settings.triggerTime);
    var avatars = Object.keys(OG.PLAYERS).map(function (id) {
      var online = isOnline(id);
      return avatarHTML(id, online ? "idle" : "away", online ? "here" : "not here yet");
    }).join("");
    var startBtn = hasQ
      ? '<button class="btn primary block" id="start">Start the show ▶</button>'
      : '<a class="btn block" href="manage.html">Add some questions first →</a>';
    stage.innerHTML =
      '<section class="card stack"><span class="tab">Conference room</span>' +
      '<div class="label">Next session · ' + esc(settings.triggerTime) + ' CET</div>' +
      '<div class="countdown" id="cd">' + OG.fmtCountdown(OG.msUntilTrigger(settings.triggerTime)) + '</div>' +
      '<p class="hint">' + (unlocked
        ? "We’re live for today — jump in whenever you’re both here."
        : "Counting down to tonight’s session. You can start early to rehearse, too.") + '</p>' +
      '<div class="cast-row big">' + avatars + '</div>' +
      startBtn +
      '<div class="spread"><a class="link" href="manage.html">Manage questions &amp; time</a>' +
      '<a class="link" href="#" id="reface">Change my face</a></div></section>';
    var s = document.getElementById("start"); if (s) s.addEventListener("click", startShow);
    document.getElementById("reface").addEventListener("click", function (ev) {
      ev.preventDefault(); localStorage.removeItem("og_emoji"); renderPickEmoji();
    });
  }

  function renderQuestion() {
    var q = currentQuestion();
    if (!q) { stage.innerHTML = '<section class="card">Loading…</section>'; return; }
    var a = (room.answers && room.answers[room.index]) || {};
    var answered = localAnsweredAt === room.index || !!a[me];
    var gif = q.gifUrl ? '<div class="gif-frame"><img src="' + esc(q.gifUrl) + '" alt=""></div>' : "";

    var cast = Object.keys(OG.PLAYERS).map(function (id) {
      var done = !!a[id];
      return avatarHTML(id, done ? "locked" : "think", done ? "locked in ✓" : "thinking…");
    }).join("");

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
      body + '<div class="cast-row">' + cast + '</div>';

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
      "</div></div><button class=\"btn primary block ep-submit\"" + (answered ? " disabled" : "") + ">Lock in answer</button>";
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
    var cast = Object.keys(OG.PLAYERS).map(function (id) {
      var ans = a[id], ok = ans && ans.correct;
      var tag = ans ? ('“' + esc(fmtAnswer(q, ans)) + '” · +' + ans.points) : "missed it · +0";
      return avatarHTML(id, ans ? (ok ? "correct" : "wrong") : "wrong", tag);
    }).join("");
    stage.innerHTML =
      '<div class="timecode"><span class="qn">Take ' + (room.index + 1) + " / " + room.order.length +
      '</span><span>REVEAL</span></div>' +
      '<section class="card stack"><div class="label">The answer was</div>' +
      '<h2>' + esc(correctText(q)) + "</h2>" + gif + '</section>' +
      '<div class="cast-row big reacting">' + cast + '</div>';
  }

  function renderFinished() {
    var totals = {};
    Object.keys(OG.PLAYERS).forEach(function (id) { totals[id] = 0; });
    var ans = room.answers || {};
    Object.keys(ans).forEach(function (i) {
      Object.keys(ans[i]).forEach(function (id) { if (totals[id] != null) totals[id] += (ans[i][id].points || 0); });
    });
    var ids = Object.keys(OG.PLAYERS);
    var best = Math.max.apply(null, ids.map(function (id) { return totals[id]; }));
    var winners = ids.filter(function (id) { return totals[id] === best; });
    var tie = winners.length > 1;
    var banner = tie ? "A dead heat — even Michael couldn’t pick a favorite."
      : OG.PLAYERS[winners[0]].name + " is World’s Best.";
    var rows = ids.sort(function (x, y) { return totals[y] - totals[x]; }).map(function (id) {
      var win = totals[id] === best && !tie;
      return '<div class="score' + (win ? " win" : "") + '">' +
        '<span class="ava">' + esc(emojiOf(id)) + (win ? " 🏆" : "") + '</span>' +
        '<span style="font-family:var(--serif);font-size:22px">' + esc(OG.PLAYERS[id].name) + '</span>' +
        '<span class="num">' + totals[id] + '</span></div>';
    }).join("");
    stage.innerHTML =
      '<section class="card stack center"><span class="tab">That’s a wrap</span>' +
      '<div class="banner">' + esc(banner) + '</div>' +
      '<div class="score-grid">' + rows + '</div>' +
      '<button class="btn primary block" id="again">Run it back ↺</button>' +
      '<a class="link" href="manage.html">Add new questions</a></section>';
    document.getElementById("again").addEventListener("click", playAgain);
  }
})();
