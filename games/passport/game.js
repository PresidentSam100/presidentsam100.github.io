/* =====================================================================
   Passport — the flag quiz.

   One flag, four destination tags. The right pick thunks a green ENTRY
   stamp into the booklet; the wrong one gets a red DENIED (and shows
   the right answer). Distractors come from the flag's lookalike family
   first, then its region, so Chad tempts Romania and Indonesia tempts
   Monaco.

   Modes
     tour   endless; the difficulty ramps famous → obscure; three
            denials close the border. Best = stamps collected.
     dash   sixty seconds; a wrong answer costs three of them.
     daily  Visa Run: ten seeded flags, same for everyone; the first
            run of the day is the recorded, shareable result.
   ===================================================================== */
(function () {
  "use strict";

  var C = window.FlagData;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  function mkBest(k) { return window.GameShell ? GameShell.best(k, { higher: true }) : null; }
  var bests = {
    tour: mkBest("passport_best_tour"),
    dash: mkBest("passport_best_dash"),
    tour_typed: mkBest("passport_best_tour_typed"),
    dash_typed: mkBest("passport_best_dash_typed")
  };
  function bestFor(m, st) { return m === "daily" ? null : bests[m + (st === "typed" ? "_typed" : "")]; }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- daily ------------------------------------------------------------
  var DAY0 = Date.UTC(2026, 8, 27);
  function today() {
    var d = new Date();
    var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    var n = Math.round((utc - DAY0) / 86400000) + 1;
    var mm = ("0" + (d.getMonth() + 1)).slice(-2), dd = ("0" + d.getDate()).slice(-2);
    return { n: n, ymd: d.getFullYear() + "-" + mm + "-" + dd };
  }
  function readDaily() {
    var t = today();
    try {
      var d = JSON.parse(store.get("passport_daily", "null"));
      if (d && d.ymd === t.ymd) return d;
    } catch (e) {}
    return { ymd: t.ymd, n: t.n, score: 0, done: false };
  }
  function writeDaily(d) { store.set("passport_daily", JSON.stringify(d)); }

  // ---- picking flags and their lookalikes --------------------------------
  var byFam = {}, byRegion = {};
  C.forEach(function (c, i) {
    (byFam[c[3]] = byFam[c[3]] || []).push(i);
    (byRegion[c[2]] = byRegion[c[2]] || []).push(i);
  });

  function optionsFor(ci, rng) {
    var c = C[ci], used = {}, out = [ci];
    used[ci] = true;
    function take(pool, n) {
      var p = shuffled(pool, rng);
      for (var k = 0; k < p.length && n > 0; k++) {
        if (!used[p[k]]) { used[p[k]] = true; out.push(p[k]); n--; }
      }
    }
    take(byFam[c[3]], 2);                 // two neighbours from the drawer
    take(byRegion[c[2]], 3 - (out.length - 1));
    while (out.length < 4) {              // top up from the whole atlas
      var r = Math.floor(rng() * C.length);
      if (!used[r]) { used[r] = true; out.push(r); }
    }
    return shuffled(out, rng);
  }

  function url(code) { return "https://flagcdn.com/" + code + ".svg"; }

  // ---- the typed-answer judge lives in judge.js (shared with Departures)
  function resolveTyped(raw) { return window.CountryJudge.resolve(raw); }

  // ---- sound ----------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function thunk() {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime;
    var len = Math.floor(ac.sampleRate * 0.07), buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource(); src.buffer = buf;
    var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
    var g = ac.createGain(); g.gain.value = 0.5;
    src.connect(lp); lp.connect(g); g.connect(ac.destination); src.start(t0);
    var o = ac.createOscillator(), g2 = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(150, t0);
    o.frequency.exponentialRampToValueAtTime(70, t0 + 0.09);
    g2.gain.setValueAtTime(0.3, t0);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(g2); g2.connect(ac.destination); o.start(t0); o.stop(t0 + 0.14);
  }
  function buzz() {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = "square"; o.frequency.setValueAtTime(140, t0);
    o.frequency.exponentialRampToValueAtTime(90, t0 + 0.3);
    g.gain.setValueAtTime(0.11, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + 0.35);
  }
  function ding() {
    var ac = audio(); if (!ac) return;
    [880, 1175].forEach(function (f, i) {
      var t0 = ac.currentTime + i * 0.09, o = ac.createOscillator(), g = ac.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.09, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + 0.3);
    });
  }
  function tickSnd() {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.value = 1200;
    g.gain.setValueAtTime(0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + 0.06);
  }

  // ---- state -------------------------------------------------------------------
  var state = "menu";               // menu | ask | reveal | over
  var mode = store.get("passport_mode", "tour");
  if (["tour", "dash", "daily"].indexOf(mode) === -1) mode = "tour";
  var style = store.get("passport_style", "tags");
  if (style !== "tags" && style !== "typed") style = "tags";
  var score = 0, denials = 0, qNum = 0, remaining = 60;
  var rng = Math.random, dailySet = null, recent = [];
  var cur = null;                    // { ci, opts:[ci x4], correct: idx in opts }
  var turbo = false, lastTick = -1;
  var preload = new Image();
  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function dateStamp() {
    var d = new Date();
    return ("0" + d.getDate()).slice(-2) + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  function tierCap() { return qNum <= 8 ? 1 : qNum <= 18 ? 2 : 3; }

  function pickTour() {
    var cap = tierCap(), pool = [];
    for (var i = 0; i < C.length; i++) {
      if (C[i][4] <= cap && recent.indexOf(i) === -1) pool.push(i);
    }
    var ci = pool[Math.floor(Math.random() * pool.length)];
    recent.push(ci);
    if (recent.length > 30) recent.shift();
    return ci;
  }

  function buildDaily(n) {
    var r = mulberry(((n * 2654435761) >>> 0) ^ 0xF1A6);
    var t1 = [], t2 = [], t3 = [];
    C.forEach(function (c, i) { (c[4] === 1 ? t1 : c[4] === 2 ? t2 : t3).push(i); });
    var picks = shuffled(t1, r).slice(0, 4)
      .concat(shuffled(t2, r).slice(0, 4))
      .concat(shuffled(t3, r).slice(0, 2));
    picks = shuffled(picks, r);
    return picks.map(function (ci) {
      var opts = optionsFor(ci, r);
      return { ci: ci, opts: opts };
    });
  }

  // ---- flow ------------------------------------------------------------------------
  function startRun(m) {
    if (m) mode = m;
    store.set("passport_mode", mode);
    audio();
    score = 0; denials = 0; qNum = 0; remaining = 60; recent = []; lastTick = -1;
    $("stamps").innerHTML = "";
    $("big-stamp").hidden = true;
    if (mode === "daily") dailySet = buildDaily(today().n);
    $("menu").hidden = true; $("over").hidden = true;
    nextQ();
  }

  function nextQ() {
    qNum++;
    if (mode === "daily") {
      if (qNum > dailySet.length) { finish(); return; }
      var q = dailySet[qNum - 1];
      cur = { ci: q.ci, opts: q.opts };
    } else {
      var ci = pickTour();
      cur = { ci: ci, opts: optionsFor(ci, Math.random) };
    }
    cur.correct = cur.opts.indexOf(cur.ci);
    var c = C[cur.ci];
    $("flag").src = url(c[0]);
    $("post-cap").textContent = mode === "daily" ? "flag " + qNum + " of " + dailySet.length : "whose flag is this?";
    var typed = style === "typed";
    $("tags").hidden = typed;
    $("typed").hidden = !typed;
    if (typed) {
      var inp = $("answer");
      inp.value = ""; inp.disabled = false;
      inp.classList.remove("hit", "bad");
      $("stamp-btn").disabled = false;
      setTimeout(function () { inp.focus(); }, 0);
    } else {
      var tags = document.querySelectorAll("#tags .tag");
      tags.forEach(function (t, i) {
        t.querySelector("span").textContent = C[cur.opts[i]][1];
        t.classList.remove("hit", "bad");
        t.disabled = false;
      });
    }
    state = "ask";
    hud();
    // keep the next flag warm (tour and dash re-roll, so this is best effort)
    if (mode === "daily" && qNum < dailySet.length) preload.src = url(C[dailySet[qNum].ci][0]);
  }

  function answer(i) {
    if (state !== "ask" || style === "typed") return;
    var tags = document.querySelectorAll("#tags .tag");
    tags.forEach(function (t) { t.disabled = true; });
    var right = i === cur.correct;
    tags[cur.correct].classList.add("hit");
    if (!right) tags[i].classList.add("bad");
    conclude(right);
  }

  function typedSubmit() {
    if (state !== "ask" || style !== "typed") return;
    var raw = $("answer").value.trim();
    if (raw.length < 2) return;
    var right = resolveTyped(raw) === cur.ci;
    var inp = $("answer");
    inp.disabled = true; $("stamp-btn").disabled = true;
    inp.classList.add(right ? "hit" : "bad");
    conclude(right);
  }

  function conclude(right) {
    state = "reveal";
    var c = C[cur.ci];

    var big = $("big-stamp");
    big.className = "big-stamp" + (right ? "" : " deny");
    big.innerHTML = right
      ? "ENTRY<small>" + c[1].toUpperCase() + "</small><small>" + dateStamp() + "</small>"
      : "DENIED<small>IT WAS " + c[1].toUpperCase() + "</small>";
    big.hidden = false;
    if (fx()) { big.classList.remove("thunk"); void big.offsetWidth; big.classList.add("thunk"); }

    var mini = document.createElement("span");
    mini.className = "mini" + (right ? "" : " deny");
    mini.style.setProperty("--rot", ((Math.random() * 16) - 8).toFixed(1) + "deg");
    mini.style.setProperty("--shape", ["50%", "6px", "50% / 34%", "14px"][Math.floor(Math.random() * 4)]);
    mini.innerHTML = right
      ? c[0].toUpperCase() + "<small>ENTRY · " + dateStamp().slice(0, 6) + "</small>"
      : c[0].toUpperCase() + "<small>DENIED</small>";
    $("stamps").appendChild(mini);

    if (right) { score++; thunk(); if (score % 10 === 0) ding(); }
    else {
      denials++; thunk(); buzz();
      if (mode === "dash") remaining = Math.max(0, remaining - 3);
    }
    hud();

    var overNow =
      (mode === "tour" && denials >= 3) ||
      (mode === "dash" && remaining <= 0);
    setTimeout(function () {
      $("big-stamp").hidden = true;
      if (overNow) finish();
      else nextQ();
    }, turbo ? 60 : right ? 950 : 1500);
  }

  function finish() {
    state = "over";
    $("answer").blur();                // or M / F / S would read as typing
    var lines = [], isBest = false;
    if (mode === "daily") {
      var d = readDaily(), was = d.done;
      if (!was) { d.done = true; d.score = score; d.typed = style === "typed"; writeDaily(d); }
      var rec = readDaily();
      $("over-title").textContent = "Visa run complete";
      $("over-msg").innerHTML = score + "<small> / " + dailySet.length + " stamps</small>";
      lines.push("Visa Run #" + rec.n + (was ? " — recorded earlier: " + rec.score + "/10" :
        score === 10 ? " — a spotless passport!" : ""));
      $("again").innerHTML = "Once more (just for fun) <kbd>Enter</kbd>";
      $("share").hidden = false;
    } else {
      var b = bestFor(mode, style);
      isBest = b ? b.submit(score) : false;
      $("over-title").textContent = mode === "tour" ? "The border is closed" : "Final boarding call";
      $("over-msg").innerHTML = score + "<small> stamp" + (score === 1 ? "" : "s") + "</small>";
      lines.push(mode === "tour" ? "three denials on your record" : "the sixty seconds are up");
      lines.push(isBest ? "a new record — frequent flyer! ✈" : "best: " + (b ? b.get() : score));
      $("again").innerHTML = "Travel again <kbd>Enter</kbd>";
      $("share").hidden = true;
    }
    $("over-stats").textContent = lines.join("\n");
    $("over").hidden = false;
  }

  function shareDaily() {
    var d = readDaily();
    var text = "Passport · Visa Run #" + d.n + " (" + d.ymd + ")\n" +
      d.score + "/10 stamps" + (d.typed ? " · typed" : "") + " 🛂\n" +
      location.origin + location.pathname;
    function copied() { $("share").textContent = "copied!"; setTimeout(function () { $("share").innerHTML = "Share result <kbd>S</kbd>"; }, 1400); }
    function fallback() { try { window.prompt("Copy your result:", text); } catch (e) {} }
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function (e2) { if (!e2 || e2.name !== "AbortError") fallback(); });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, fallback);
    else fallback();
  }

  function hud() {
    $("hud-mode").textContent = mode === "tour" ? "world tour" : mode === "dash" ? "layover dash" : "visa run";
    $("hud-score").textContent = score + (score === 1 ? " stamp" : " stamps");
    var ex = $("hud-extra");
    if (mode === "tour") {
      ex.textContent = "denied " + denials + "/3";
      ex.className = denials >= 2 ? "warn" : "";
    } else if (mode === "dash") {
      ex.textContent = "0:" + ("0" + Math.max(0, Math.ceil(remaining))).slice(-2);
      ex.className = remaining <= 10 ? "warn" : "";
    } else {
      ex.textContent = "flag " + Math.min(qNum, 10) + "/10";
      ex.className = "";
    }
  }

  // the dash clock: ticks only while playing and not paused
  setInterval(function () {
    if (mode !== "dash" || (state !== "ask" && state !== "reveal")) return;
    if (P.isPaused()) return;
    remaining = Math.max(0, remaining - 0.1);
    if (remaining <= 10 && Math.ceil(remaining) !== lastTick) { lastTick = Math.ceil(remaining); if (state === "ask") tickSnd(); }
    hud();
    if (remaining <= 0 && state === "ask") { state = "over"; finish(); }
  }, 100);

  // follow the ✨ switch the moment it flips (this used to poll every 400ms)
  window.addEventListener("reducemotionchange", function () { document.body.classList.toggle("fxon", fx()); });
  document.body.classList.toggle("fxon", fx());

  // a flag that can't load (offline, blocked CDN) skips without penalty
  $("flag").addEventListener("error", function () {
    if (state !== "ask") return;
    state = "reveal";
    setTimeout(function () { qNum--; nextQ(); }, 200);
  });

  // ---- menu ----------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === mode);
    });
    var d = readDaily();
    $("daily-small").innerHTML = d.done
      ? "done: " + d.score + "/10 ✓ <kbd>3</kbd>"
      : "today's 10 flags, shareable <kbd>3</kbd>";
    document.querySelectorAll("#pick-style button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-s") === style);
    });
    var parts = [];
    if (bests.tour && bests.tour.get()) parts.push("Tour " + bests.tour.get());
    if (bests.dash && bests.dash.get()) parts.push("Dash " + bests.dash.get());
    if (bests.tour_typed && bests.tour_typed.get()) parts.push("Tour·typed " + bests.tour_typed.get());
    if (bests.dash_typed && bests.dash_typed.get()) parts.push("Dash·typed " + bests.dash_typed.get());
    $("bests").textContent = parts.length ? "most stamps: " + parts.join(" · ") : "a brand-new passport — no stamps yet";
  }
  function toMenu() {
    state = "menu";
    $("answer").blur();
    $("over").hidden = true; $("menu").hidden = false;
    paintMenu();
  }

  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-v");
      store.set("passport_mode", mode);
      paintMenu();
    });
  });
  document.querySelectorAll("#tags .tag").forEach(function (b) {
    b.addEventListener("click", function () { answer(+b.getAttribute("data-i")); });
  });
  document.querySelectorAll("#pick-style button").forEach(function (b) {
    b.addEventListener("click", function () {
      style = b.getAttribute("data-s");
      store.set("passport_style", style);
      paintMenu();
    });
  });
  $("typed").addEventListener("submit", function (e) { e.preventDefault(); typedSubmit(); });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);
  $("share").addEventListener("click", shareDaily);

  // Escape only: in typed mode the letters belong to the answer field
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return mode === "dash" && (state === "ask" || state === "reveal"); },
    keys: ["Escape"]
  }) : { isPaused: function () { return false; } };

  // sound (M / "[") and Visual FX (V / "]") are handled by the shared
  // mute-toggle.js and motion-toggle.js; #answer is marked data-game-input
  // so the bracket keys still work while typing a country
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.repeat) return;
    var k = (e.key || "").toLowerCase();
    if (P.isPaused()) return;
    if (state === "ask" && style !== "typed" && e.key >= "1" && e.key <= "4") { e.preventDefault(); answer(+e.key - 1); return; }
    // Enter is preventDefault-ed so a mouse-focused button (say the sound
    // toggle) doesn't also fire on the same press
    if (state === "menu") {
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        mode = ["tour", "dash", "daily"][+e.key - 1];
        store.set("passport_mode", mode);
        paintMenu();
      } else if (k === "t" || k === "y") {
        style = k === "t" ? "tags" : "typed";
        store.set("passport_style", style);
        paintMenu();
      } else if (e.key === "Enter") { e.preventDefault(); startRun(mode); }
      else if (e.key === "Escape") {
        var back = document.querySelector(".nav-back-games");
        location.href = back ? back.href : "../";
      }
      return;
    }
    if (state === "over") {
      if (e.key === "Enter") { e.preventDefault(); startRun(mode); }
      else if (e.key === "Escape") toMenu();
      else if (k === "s" && !$("share").hidden) shareDaily();
      return;
    }
    if ((state === "ask" || state === "reveal") && e.key === "Escape" && mode !== "dash") toMenu();
  });

  // demo flag behind the menu
  $("flag").src = url("jp");
  toMenu();

  // test hooks — the Playwright harness drives runs through these
  window.Passport = {
    state: function () { return state; },
    mode: function () { return mode; },
    score: function () { return score; },
    denials: function () { return denials; },
    timeLeft: function () { return remaining; },
    current: function () {
      return cur ? { code: C[cur.ci][0], name: C[cur.ci][1], correct: cur.correct,
        options: cur.opts.map(function (o) { return C[o][1]; }) } : null;
    },
    answer: answer,
    start: startRun,
    toMenu: toMenu,
    fast: function () { turbo = true; },
    daily: readDaily,
    style: function () { return style; },
    setStyle: function (st) { style = st; store.set("passport_style", st); },
    type: function (text) { $("answer").value = text; typedSubmit(); },
    resolve: function (raw) { var r = resolveTyped(raw); return r === -1 ? null : C[r][0]; }
  };
})();
