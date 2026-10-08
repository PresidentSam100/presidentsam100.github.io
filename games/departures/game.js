/* =====================================================================
   Departures — name every country before final boarding.

   Countries and the typed-answer judge are shared with Passport
   (../passport/data.js and judge.js). Typing an exact name (or alias)
   boards it instantly; names that are a prefix of another country's
   (Niger/Nigeria, Guinea/Guinea-Bissau, UK/Ukraine, Congo/Congo-
   Kinshasa…) wait for Enter, and Enter also runs the forgiving judge
   (one typo on six-plus letters, never across two countries).

   Modes: the whole world on 15:00, or one continent on a shorter clock.
   Either names the countries or, with Capitals, their capital cities
   (../passport/capitals.js): a city boards the country it's the capital of.
   Best per board (and per countries / capitals) = most named; ties broken
   by the faster clock.
   ===================================================================== */
(function () {
  "use strict";

  var C = window.FlagData, J = window.CountryJudge, K = window.CapitalJudge;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  var REGIONS = [["EU", "EUROPE"], ["AS", "ASIA"], ["AF", "AFRICA"], ["AM", "AMERICAS"], ["OC", "OCEANIA"]];
  var TIMERS = { world: 900, EU: 240, AS: 240, AF: 270, AM: 180, OC: 90 };

  // Names that must wait for Enter: exact matches that are also a strict
  // prefix of a different country's name or alias (or capital), as Niger is
  // of Nigeria. A longer name for the SAME country doesn't wait: "Antigua"
  // boards at once, and the rest of "Antigua and Barbuda" is let through
  // (see the tail, below).
  function deferOf(names) {
    var d = {};
    names.forEach(function (a) {
      names.forEach(function (b) {
        if (a.ci !== b.ci && b.n.length > a.n.length && b.n.indexOf(a.n) === 0) d[a.n] = true;
      });
    });
    return d;
  }
  var DEFER_N = deferOf(J.names), DEFER_C = deferOf(K.names);

  // The tail: when a name boards as soon as it's typed but the country (or
  // city) also has a longer name starting with it — Antigua / Antigua and
  // Barbuda, Russia / Russian Federation, Mexico / Mexico City — the rest of
  // the longer name may still be on its way. While what's typed next is the
  // start of that rest it's left alone, and once it's complete the box
  // clears; anything else is a new answer as usual. Matched loosely (case,
  // accents, spaces, punctuation), but keeping "the", since "and th…" is
  // typed letter by letter on the way to "and the Grenadines".
  function loose(str) {
    str = String(str).toLowerCase();
    try { str = str.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return str.replace(/&/g, " and ").replace(/\bst\.?(?=\s)/g, "saint").replace(/[^a-z0-9]/g, "");
  }
  function fullNames(ci) {
    var iso = C[ci][0];
    return caps() ? (K.CAP[iso] || []) : [C[ci][1]].concat(J.ALIAS[iso] || []);
  }
  function tailsOf(ci, raw) {
    var typed = loose(raw), out = [];
    fullNames(ci).forEach(function (n) {
      var f = loose(n);
      if (f.length > typed.length && f.indexOf(typed) === 0) out.push(f.slice(typed.length));
    });
    return out;
  }
  var tail = null;

  // ---- state -----------------------------------------------------------
  var state = "menu";              // menu | play | over
  var mode = store.get("departures_mode", "world");
  if (mode !== "world" && mode !== "continent") mode = "world";
  var region = store.get("departures_region", "EU");
  if (!TIMERS[region]) region = "EU";
  // what to name: "countries", or "capitals" (a capital boards its country)
  var target = store.get("departures_target", "countries");
  if (target !== "capitals") target = "countries";
  function caps() { return target === "capitals"; }
  function judge() { return caps() ? K : J; }
  function deferred(v) { return !!(caps() ? DEFER_C : DEFER_N)[v]; }
  function label(ci) { return caps() ? K.of(ci) : C[ci][1]; }   // what the board calls it
  var pool = [], found = {}, foundCount = 0, perRegion = {}, perRegionFound = {};
  var timeLeft = 900, timeTotal = 900, playing = false, endedByBell = false;

  function boardKey(t) { return (mode === "world" ? "world" : region) + ((t || target) === "capitals" ? "-cap" : ""); }
  function readBests() {
    try { var b = JSON.parse(store.get("departures_best", "null")); if (b) return b; } catch (e) {}
    return {};
  }
  function beats(cur, n, tUsed) { return !cur || n > cur.n || (n === cur.n && tUsed < cur.t); }
  function writeBest(n, tUsed) {
    var b = readBests();
    b[boardKey()] = { n: n, t: tUsed };
    store.set("departures_best", JSON.stringify(b));
  }
  // The best is saved the moment it's earned: each name that takes the run
  // past the board's best (runBest, as it stood when the run began) writes
  // it, with the clock as it is then, so a tab closed mid-run keeps it. A
  // tie on names is only settled at the end, by the clock (finish), which
  // also rewrites the record with the run's final time.
  var runBest = null;
  function usedMs() { return Math.round((timeTotal - Math.max(0, timeLeft)) * 1000); }
  function liveBest() {
    if (!runBest || foundCount > runBest.n) writeBest(foundCount, usedMs());
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
    // FX off holds the pulse's tint still (styles.css), so a timer clears it
    clearTimeout(g.pulseT);
    g.pulseT = setTimeout(function () { g.classList.remove("pulse"); }, 450);
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

  function addRow(name, rc, missed, country) {
    var log = $("log");
    var idle = log.querySelector(".idle");
    if (idle) idle.remove();
    var li = document.createElement("li");
    li.className = (missed ? "missed" : "new");
    li.innerHTML = '<span class="dest"></span>' + (country ? '<span class="cty"></span>' : "") +
      '<span class="via">' + rc + '</span><span class="status">' + (missed ? "CANCELLED" : "DEPARTED") + "</span>";
    if (country) li.querySelector(".cty").textContent = country.toUpperCase();
    log.insertBefore(li, log.firstChild);
    if (missed) li.querySelector(".dest").textContent = name.toUpperCase();
    else settleText(li.querySelector(".dest"), name.toUpperCase());
    if (!missed) {
      // FX off has no flap, so .fresh marks the new departure for a moment (styles.css)
      li.classList.add("fresh");
      setTimeout(function () { li.classList.remove("fresh"); }, 800);
    }
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
    liveBest();
    var rc = C[ci][2];
    perRegionFound[rc]++;
    addRow(label(ci), rc, false, caps() ? C[ci][1] : "");
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
  function exactIndex(v, names) {
    names = names || judge().names;
    for (var k = 0; k < names.length; k++) {
      if (names[k].n === v) return names[k].ci;
    }
    return -1;
  }
  function tryInput(auto) {
    if (state !== "play") return;
    var raw = $("answer").value;
    var v = J.norm(raw);
    if (!v) return;
    // the rest of a longer name for what just boarded (see the tail, above)
    if (tail) {
      var lv = loose(raw), into = tail.filter(function (r) { return r.indexOf(lv) === 0; });
      if (into.length) {
        if (into.indexOf(lv) !== -1 || !auto) { $("answer").value = ""; tail = null; }   // done (or Enter on it)
        return;
      }
      tail = null;                                           // something else: a new answer
    }
    var ci = -1;
    if (auto) {
      $("hint").hidden = !deferred(v);
      if (deferred(v)) return;                               // Niger vs Nigeria: Enter decides
      ci = exactIndex(v);
      if (ci === -1) return;                                 // keep typing
    } else {
      ci = exactIndex(v);
      if (ci === -1) ci = judge().resolve(raw);
      // naming capitals, a country's own name gets a nudge rather than a shake
      if (ci === -1 && caps()) {
        var asCountry = exactIndex(v, J.names);
        if (asCountry !== -1) {
          toast(C[asCountry][1].toUpperCase() + " — NAME ITS CAPITAL");
          dupThock();
          return;
        }
      }
      if (ci === -1) {
        var el = $("answer");
        el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
        // FX off shows .shake as a red box (styles.css), so a timer clears it
        clearTimeout(el.shakeT);
        el.shakeT = setTimeout(function () { el.classList.remove("shake"); }, 500);
        dupThock();
        return;
      }
    }
    if (!inPool[ci]) {
      toast(label(ci).toUpperCase() + " — WRONG TERMINAL (" + C[ci][2] + ")");
      dupThock();
      $("answer").value = "";
      return;
    }
    if (found[ci]) {
      toast(label(ci).toUpperCase() + " — ALREADY DEPARTED");
      dupThock();
      $("answer").value = "";
      $("hint").hidden = true;
      return;
    }
    var t = auto ? tailsOf(ci, raw) : [];
    accept(ci);
    tail = t.length ? t : null;
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
    timeTotal = TIMERS[mode === "world" ? "world" : region];   // (the same clock for countries or capitals)
    timeLeft = timeTotal;
    buildGates();
    $("log").innerHTML = '<li class="idle">— the board is waiting for its first departure —</li>';
    $("menu").hidden = true; $("over").hidden = true;
    $("answer").value = ""; $("answer").disabled = false; $("hint").hidden = true;
    tail = null;
    state = "play"; playing = true; endedByBell = false;
    runBest = readBests()[boardKey()] || null;
    hud();
    setTimeout(function () { $("answer").focus(); }, 0);
    paChime();
  }

  function finish(allAboard) {
    state = "over"; playing = false;
    $("answer").disabled = true;
    var tUsed = usedMs();
    var isBest = beats(runBest, foundCount, tUsed);
    if (isBest) writeBest(foundCount, tUsed);
    if (allAboard) winFanfare(); else endBuzz();

    $("over-title").textContent = allAboard ? "ALL ABOARD" :
      endedByBell ? "Final boarding" : "Gates closed";
    $("over-msg").textContent = foundCount + " / " + pool.length;
    var mm = Math.floor(tUsed / 60000), ss = Math.floor(tUsed / 1000) % 60;
    var lines = [
      (mode === "world" ? "the world" : ({ EU: "Europe", AS: "Asia", AF: "Africa", AM: "the Americas", OC: "Oceania" })[region]) +
        (caps() ? " · capitals" : "") + " · " + mm + ":" + ("0" + ss).slice(-2) + " on the clock",
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
        // naming capitals, each city is listed with its country
        var nm = caps() ? label(ci) + " <i>(" + C[ci][1] + ")</i>" : C[ci][1];
        names.push(found[ci] ? "<span>" + nm + "</span>" : "<b>" + nm + "</b>");
      });
      var h = document.createElement("div");
      h.innerHTML = "<h3>" + rg[1] + " — " + perRegionFound[rg[0]] + "/" + perRegion[rg[0]] + "</h3>" + names.join(" · ");
      wrap.appendChild(h);
    });
    // and the board clatters out the ones that got away (a taste of them)
    var missedOnBoard = 0;
    pool.forEach(function (ci) {
      if (!found[ci] && missedOnBoard < 8) { addRow(label(ci), C[ci][2], true, caps() ? C[ci][1] : ""); missedOnBoard++; }
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
  // follow the ✨ switch the moment it flips (this used to poll every 400ms)
  window.addEventListener("reducemotionchange", function () { document.body.classList.toggle("fxon", fx()); });
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
    document.querySelectorAll("#pick-target button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-t") === target);
    });
    var a = $("answer");
    a.placeholder = caps() ? "type a capital…" : "type a country…";
    a.setAttribute("aria-label", caps() ? "Type a capital city" : "Type a country's name");
    // the bests for what's being named (a capitals board keeps its own)
    var b = readBests(), parts = [], sfx = caps() ? "-cap" : "";
    if (b["world" + sfx]) parts.push("World " + b["world" + sfx].n + "/197");
    REGIONS.forEach(function (rg) { var r = b[rg[0] + sfx]; if (r) parts.push(rg[1].charAt(0) + rg[1].slice(1).toLowerCase() + " " + r.n); });
    $("bests").textContent = parts.length ? "best " + (caps() ? "capitals " : "") + "boards: " + parts.join(" · ") : "no flights on the record yet";
  }
  function setTarget(t) {
    target = t === "capitals" ? "capitals" : "countries";
    store.set("departures_target", target);
    paintMenu();
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
  document.querySelectorAll("#pick-target button").forEach(function (b) {
    b.addEventListener("click", function () { setTarget(b.getAttribute("data-t")); });
  });
  $("play").addEventListener("click", function () { startRun(mode, region); });
  $("again").addEventListener("click", function () { startRun(mode, region); });
  $("to-menu").addEventListener("click", toMenu);
  $("giveup").addEventListener("click", function () { if (state === "play") finish(false); });
  $("desk").addEventListener("submit", function (e) { e.preventDefault(); tryInput(false); });
  $("answer").addEventListener("input", function () { tryInput(true); });

  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    keys: ["Escape"],                      // the letters belong to the answer box
    // the desk shuts while paused: with the clock stopped, a name typed then
    // would board for free (and letters typed into it would board on resume)
    onChange: function (paused) {
      var a = $("answer");
      a.disabled = paused;
      if (!paused) a.focus();
    }
  }) : { isPaused: function () { return false; } };
  // Leaving asks first (and stops the clock) once a run has boarded a name;
  // an empty board has nothing to lose yet
  if (window.GameShell) GameShell.guardLeave({
    active: function () { return state === "play" && foundCount > 0; },
    pausable: P
  });

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (P.isPaused() || e.repeat) return;
    if (state === "menu") {
      var k = e.key.toLowerCase();
      if (e.key === "1" || e.key === "2") {
        mode = e.key === "1" ? "world" : "continent";
        store.set("departures_mode", mode);
        paintMenu();
      } else if (k === "n" || k === "c") setTarget(k === "c" ? "capitals" : "countries");
      else if (e.key === "Enter") startRun(mode, region);
      return;
    }
    // the results: Backspace back to the modes (the answer box is disabled
    // here, so it can't be a deletion); Esc is left to leave for the games page
    if (state === "over") {
      if (e.key === "Enter") startRun(mode, region);
      else if (e.key === "Backspace" && !(e.target === $("answer") && !$("answer").disabled)) { e.preventDefault(); toMenu(); }
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
    deferred: function (name) { return deferred(J.norm(name)); },
    target: function () { return target; },
    setTarget: setTarget
  };
})();
