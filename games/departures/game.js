/* =====================================================================
   Departures — name every country before final boarding.

   Countries and the typed-answer judge are shared with Passport
   (../passport/data.js and judge.js). Typing an exact name (or alias)
   boards it instantly; names that are a prefix of another country's
   (Niger/Nigeria, Guinea/Guinea-Bissau, UK/Ukraine, Congo/Congo-
   Kinshasa…) wait for Enter, and Enter also runs the forgiving judge
   (one typo on six-plus letters, never across two countries).

   Modes: the whole world on 15:00, or one continent on a shorter clock.
   Best per board = most countries; ties broken by the faster clock.
   ===================================================================== */
(function () {
  "use strict";

  var C = window.FlagData, J = window.CountryJudge;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  var REGIONS = [["EU", "EUROPE"], ["AS", "ASIA"], ["AF", "AFRICA"], ["AM", "AMERICAS"], ["OC", "OCEANIA"]];
  var TIMERS = { world: 900, EU: 240, AS: 240, AF: 270, AM: 180, OC: 90 };

  // Names that must wait for Enter: exact matches that are also a strict
  // prefix of a different country's name or alias.
  var DEFER = {};
  J.names.forEach(function (a) {
    J.names.forEach(function (b) {
      if (a.ci !== b.ci && b.n.length > a.n.length && b.n.indexOf(a.n) === 0) DEFER[a.n] = true;
    });
  });

  // ---- state -----------------------------------------------------------
  var state = "menu";              // menu | play | over
  var mode = store.get("departures_mode", "world");
  if (mode !== "world" && mode !== "continent") mode = "world";
  var region = store.get("departures_region", "EU");
  if (!TIMERS[region]) region = "EU";
  var pool = [], found = {}, foundCount = 0, perRegion = {}, perRegionFound = {};
  var timeLeft = 900, timeTotal = 900, playing = false, endedByBell = false;

  function boardKey() { return mode === "world" ? "world" : region; }
  function readBests() {
    try { var b = JSON.parse(store.get("departures_best", "null")); if (b) return b; } catch (e) {}
    return {};
  }
  function submitBest(n, tUsed) {
    var b = readBests(), k = boardKey(), cur = b[k];
    if (!cur || n > cur.n || (n === cur.n && tUsed < cur.t)) {
      b[k] = { n: n, t: tUsed };
      store.set("departures_best", JSON.stringify(b));
      return true;
    }
    return false;
  }

  // ---- sound -------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function clatter(n) {                       // the split-flap burst
    var ac = audio(); if (!ac) return;
    for (var i = 0; i < (n || 9); i++) {
      (function (k) {
        var t0 = ac.currentTime + k * 0.022;
        var len = Math.floor(ac.sampleRate * 0.012), buf = ac.createBuffer(1, len, ac.sampleRate);
        var d = buf.getChannelData(0);
        for (var s = 0; s < len; s++) d[s] = (Math.random() * 2 - 1) * (1 - s / len);
        var src = ac.createBufferSource(); src.buffer = buf;
        var bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400 + Math.random() * 900; bp.Q.value = 3;
        var g = ac.createGain(); g.gain.value = 0.1;
        src.connect(bp); bp.connect(g); g.connect(ac.destination);
        src.start(t0);
      })(i);
    }
  }
  function tone(f, dur, vol, delay, type) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(vol || 0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function paChime() { tone(830, 0.5, 0.1); tone(660, 0.6, 0.1, 0.28); }              // ding-dong
  function regionChime() { tone(660, 0.35, 0.1); tone(830, 0.45, 0.1, 0.18); }
  function dupThock() { tone(220, 0.08, 0.1, 0, "triangle"); }
  function endBuzz() { tone(180, 0.6, 0.12, 0, "square"); paChime(); }
  function winFanfare() { [660, 830, 990, 1320].forEach(function (f, i) { tone(f, 0.4, 0.1, i * 0.14); }); }

  // ---- the board -----------------------------------------------------------
  function buildGates() {
    var el = $("regions");
    el.innerHTML = "";
    el.style.gridTemplateColumns = mode === "continent" ? "1fr" : "";
    REGIONS.forEach(function (r) {
      if (mode === "continent" && r[0] !== region) return;
      var d = document.createElement("div");
      d.className = "gate";
      d.id = "gate-" + r[0];
      d.innerHTML = '<div class="rname">' + r[1] + '</div><div class="rcount"><b>0</b>/' + perRegion[r[0]] + "</div>";
      el.appendChild(d);
    });
  }
  function gateUpdate(rc) {
    var g = $("gate-" + rc);
    if (!g) return;
    g.querySelector("b").textContent = perRegionFound[rc];
    g.classList.remove("pulse"); void g.offsetWidth; g.classList.add("pulse");
    if (perRegionFound[rc] === perRegion[rc]) { g.classList.add("done"); regionChime(); }
  }

  // split-flap text: each letter settles after cycling a few glyphs
  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function settleText(el, text) {
    if (!fx()) { el.textContent = text; return; }
    el.textContent = "";
    var spans = [];
    for (var i = 0; i < text.length; i++) {
      var sp = document.createElement("span");
      sp.textContent = text[i] === " " ? " " : GLYPHS[Math.floor(Math.random() * 26)];
      sp.style.animationDelay = (i * 14) + "ms";
      el.appendChild(sp);
      spans.push(sp);
    }
    var step = 0;
    var iv = setInterval(function () {
      step++;
      var doneAll = true;
      for (var k = 0; k < spans.length; k++) {
        var target = text[k] === " " ? " " : text[k].toUpperCase();
        if (spans[k].textContent !== target) {
          spans[k].textContent = step > 2 + k * 0.4 ? target : GLYPHS[Math.floor(Math.random() * 26)];
          if (spans[k].textContent !== target) doneAll = false;
        }
      }
      if (doneAll || step > 26) clearInterval(iv);
    }, 34);
  }

  function addRow(name, rc, missed) {
    var log = $("log");
    var idle = log.querySelector(".idle");
    if (idle) idle.remove();
    var li = document.createElement("li");
    li.className = (missed ? "missed" : "new");
    li.innerHTML = '<span class="dest"></span><span class="via">' + rc + '</span><span class="status">' +
      (missed ? "CANCELLED" : "DEPARTED") + "</span>";
    log.insertBefore(li, log.firstChild);
    if (missed) li.querySelector(".dest").textContent = name.toUpperCase();
    else settleText(li.querySelector(".dest"), name.toUpperCase());
    while (log.children.length > 40) log.removeChild(log.lastChild);
  }

  function hud() {
    var m = Math.floor(Math.max(0, timeLeft) / 60), s = Math.floor(Math.max(0, timeLeft) % 60);
    var ck = $("clock");
    ck.textContent = m + ":" + ("0" + s).slice(-2);
    ck.classList.toggle("warn", timeLeft <= 60);
    $("total").textContent = foundCount + "/" + pool.length;
  }

  // ---- accepting answers -----------------------------------------------------
  var inPool = {};
  function accept(ci) {
    found[ci] = true; foundCount++;
    var rc = C[ci][2];
    perRegionFound[rc]++;
    addRow(C[ci][1], rc, false);
    clatter();
    gateUpdate(rc);
    hud();
    $("answer").value = "";
    $("hint").hidden = true;
    if (foundCount === pool.length) finish(true);
  }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 1300);
  }
  function exactIndex(v) {
    for (var k = 0; k < J.names.length; k++) {
      if (J.names[k].n === v) return J.names[k].ci;
    }
    return -1;
  }
  function tryInput(auto) {
    if (state !== "play") return;
    var raw = $("answer").value;
    var v = J.norm(raw);
    if (!v) return;
    var ci = -1;
    if (auto) {
      $("hint").hidden = !DEFER[v];
      if (DEFER[v]) return;                                  // Niger vs Nigeria: Enter decides
      ci = exactIndex(v);
      if (ci === -1) return;                                 // keep typing
    } else {
      ci = exactIndex(v);
      if (ci === -1) ci = J.resolve(raw);
      if (ci === -1) {
        var el = $("answer");
        el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
        dupThock();
        return;
      }
    }
    if (!inPool[ci]) {
      toast(C[ci][1].toUpperCase() + " — WRONG TERMINAL (" + C[ci][2] + ")");
      dupThock();
      $("answer").value = "";
      return;
    }
    if (found[ci]) {
      toast(C[ci][1].toUpperCase() + " — ALREADY DEPARTED");
      dupThock();
      $("answer").value = "";
      $("hint").hidden = true;
      return;
    }
    accept(ci);
  }

  // ---- runs ---------------------------------------------------------------------
  function startRun(m, r) {
    if (m) mode = m;
    if (r) region = r;
    store.set("departures_mode", mode);
    store.set("departures_region", region);
    audio();
    pool = []; found = {}; foundCount = 0; inPool = {};
    perRegion = {}; perRegionFound = {};
    REGIONS.forEach(function (rg) { perRegion[rg[0]] = 0; perRegionFound[rg[0]] = 0; });
    C.forEach(function (c, i) {
      if (mode === "continent" && c[2] !== region) return;
      pool.push(i); inPool[i] = true; perRegion[c[2]]++;
    });
    timeTotal = TIMERS[boardKey()];
    timeLeft = timeTotal;
    buildGates();
    $("log").innerHTML = '<li class="idle">— the board is waiting for its first departure —</li>';
    $("menu").hidden = true; $("over").hidden = true;
    $("answer").value = ""; $("answer").disabled = false; $("hint").hidden = true;
    state = "play"; playing = true; endedByBell = false;
    hud();
    setTimeout(function () { $("answer").focus(); }, 0);
    paChime();
  }

  function finish(allAboard) {
    state = "over"; playing = false;
    $("answer").disabled = true;
    var tUsed = Math.round((timeTotal - Math.max(0, timeLeft)) * 1000);
    var isBest = submitBest(foundCount, tUsed);
    if (allAboard) winFanfare(); else endBuzz();

    $("over-title").textContent = allAboard ? "ALL ABOARD" :
      endedByBell ? "Final boarding" : "Gates closed";
    $("over-msg").textContent = foundCount + " / " + pool.length;
    var mm = Math.floor(tUsed / 60000), ss = Math.floor(tUsed / 1000) % 60;
    var lines = [
      (mode === "world" ? "the world" : ({ EU: "Europe", AS: "Asia", AF: "Africa", AM: "the Americas", OC: "Oceania" })[region]) +
        " · " + mm + ":" + ("0" + ss).slice(-2) + " on the clock",
      isBest ? "a new record — see the world! 🛫" : bestLine()
    ];
    $("over-stats").textContent = lines.join("\n");

    // the full manifest: missed names in red, by region
    var wrap = $("missed");
    wrap.innerHTML = "";
    REGIONS.forEach(function (rg) {
      if (mode === "continent" && rg[0] !== region) return;
      var names = [];
      pool.forEach(function (ci) {
        if (C[ci][2] !== rg[0]) return;
        names.push(found[ci] ? "<span>" + C[ci][1] + "</span>" : "<b>" + C[ci][1] + "</b>");
      });
      var h = document.createElement("div");
      h.innerHTML = "<h3>" + rg[1] + " — " + perRegionFound[rg[0]] + "/" + perRegion[rg[0]] + "</h3>" + names.join(" · ");
      wrap.appendChild(h);
    });
    // and the board clatters out the ones that got away (a taste of them)
    var missedOnBoard = 0;
    pool.forEach(function (ci) {
      if (!found[ci] && missedOnBoard < 8) { addRow(C[ci][1], C[ci][2], true); missedOnBoard++; }
    });
    $("over").hidden = false;
  }
  function bestLine() {
    var b = readBests()[boardKey()];
    if (!b) return "first flight logged";
    var mm = Math.floor(b.t / 60000), ss = Math.floor(b.t / 1000) % 60;
    return "best: " + b.n + " (" + mm + ":" + ("0" + ss).slice(-2) + ")";
  }

  // ---- the clock -------------------------------------------------------------------
  var lastWarn = -1;
  setInterval(function () {
    if (!playing || P.isPaused()) return;
    timeLeft -= 0.2;
    if (timeLeft <= 10 && Math.ceil(timeLeft) !== lastWarn) { lastWarn = Math.ceil(timeLeft); tone(1000, 0.05, 0.05); }
    hud();
    if (timeLeft <= 0) { endedByBell = true; finish(false); }
  }, 200);
  setInterval(function () { document.body.classList.toggle("fxon", fx()); }, 400);
  document.body.classList.toggle("fxon", fx());

  // ---- menu ---------------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === mode);
    });
    $("pick-region").hidden = mode !== "continent";
    document.querySelectorAll("#pick-region button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-r") === region);
    });
    var b = readBests(), parts = [];
    if (b.world) parts.push("World " + b.world.n + "/197");
    REGIONS.forEach(function (rg) { if (b[rg[0]]) parts.push(rg[1].charAt(0) + rg[1].slice(1).toLowerCase() + " " + b[rg[0]].n); });
    $("bests").textContent = parts.length ? "best boards: " + parts.join(" · ") : "no flights on the record yet";
  }
  function toMenu() {
    state = "menu"; playing = false;
    $("over").hidden = true; $("menu").hidden = false;
    paintMenu();
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-v");
      store.set("departures_mode", mode);
      paintMenu();
    });
  });
  document.querySelectorAll("#pick-region button").forEach(function (b) {
    b.addEventListener("click", function () {
      region = b.getAttribute("data-r");
      store.set("departures_region", region);
      paintMenu();
    });
  });
  $("play").addEventListener("click", function () { startRun(mode, region); });
  $("again").addEventListener("click", function () { startRun(mode, region); });
  $("to-menu").addEventListener("click", toMenu);
  $("giveup").addEventListener("click", function () { if (state === "play") finish(false); });
  $("desk").addEventListener("submit", function (e) { e.preventDefault(); tryInput(false); });
  $("answer").addEventListener("input", function () { tryInput(true); });

  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    keys: ["Escape"]                       // the letters belong to the answer box
  }) : { isPaused: function () { return false; } };

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (P.isPaused() || e.repeat) return;
    if (state === "menu") {
      if (e.key === "1" || e.key === "2") {
        mode = e.key === "1" ? "world" : "continent";
        store.set("departures_mode", mode);
        paintMenu();
      } else if (e.key === "Enter") startRun(mode, region);
      return;
    }
    if (state === "over") {
      if (e.key === "Enter") startRun(mode, region);
      else if (e.key === "Escape") toMenu();
      return;
    }
    // during play, keep the desk focused so every letter lands on the board
    if (state === "play" && document.activeElement !== $("answer") &&
        e.key.length === 1 && /[a-z]/i.test(e.key)) {
      $("answer").focus();
    }
  });

  toMenu();

  // test hooks — the Playwright harness drives runs through these
  window.Departures = {
    state: function () { return state; },
    found: function () { return foundCount; },
    poolSize: function () { return pool.length; },
    regionFound: function (rc) { return perRegionFound[rc]; },
    regionDone: function (rc) { var g = $("gate-" + rc); return !!g && g.classList.contains("done"); },
    timeLeft: function () { return timeLeft; },
    setTime: function (s) { timeLeft = s; },
    type: function (text) { var el = $("answer"); el.value = text; el.dispatchEvent(new Event("input", { bubbles: true })); },
    enter: function (text) { if (text != null) $("answer").value = text; tryInput(false); },
    start: startRun,
    giveUp: function () { if (state === "play") finish(false); },
    toMenu: toMenu,
    bests: readBests,
    deferred: function (name) { return !!DEFER[J.norm(name)]; }
  };
})();
