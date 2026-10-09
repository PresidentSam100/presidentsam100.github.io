/* =====================================================================
   Fish-A-Fish — whack-a-mole at a pond: nine fishing spots, nine keys.

   Each spot maps to a key (Q W E / A S D / Z X C — by physical position,
   so other keyboard layouts work; tapping a spot does the same). A spot
   ripples first (a warning), then the bobber plunges while a fish is on:
   strike its key in that window to catch it. Striking during the ripples
   scares the fish off, striking an empty spot splashes (-2), and hooking
   the old boot costs 5. Catches build a streak: from 5 in a row points
   double, from 10 they triple.

   Two toggles, remembered between visits:
   - Round: Daybreak (60 seconds) or Endless (three fish get away and the
     pond goes quiet; it keeps speeding up).
   - Keys: Condensed (the 3x3 above), All letters (the 26 letter keys), or
     Whole keyboard (the number row too — a number-row fish sometimes asks
     for its SYMBOL (!, %, &, ...), and then only Shift + that key hooks it).
   Each of the six combinations keeps its own best score.
   ===================================================================== */
(function () {
  "use strict";
  var Art = window.FishArt, SPECIES = Art.SPECIES;
  var canvas = document.getElementById("stage"), ctx = canvas.getContext("2d");
  var store = window.GameShell ? GameShell.store
    : { get: function (k, f) { return f; }, getNum: function (k, f) { return f; }, set: function () {}, remove: function () {} };
  function bestKey(clock, kb) { return "fishafish_best_" + clock + "_" + kb; }
  // One-time move of the original three bests into the combo keys they were:
  // Daybreak/Endless were the nine-key pond, Full Pond was 60s on the board.
  [["fishafish_best_daybreak", bestKey("daybreak", "nine")],
   ["fishafish_best_endless", bestKey("endless", "nine")],
   ["fishafish_best_fullpond", bestKey("daybreak", "all")]].forEach(function (m) {
    var old = store.getNum(m[0], 0);
    if (old > 0 && store.getNum(m[1], 0) === 0) store.set(m[1], old);
  });

  // Two layouts, matched by physical key position (e.code), so other
  // keyboard layouts play the same spots: the 3x3 lesson pond, and the
  // whole keyboard (numbers, then 10 / 9 / 7 letters, staggered like the
  // real rows).
  var ROWS9 = ["QWE", "ASD", "ZXC"], ROWSLET = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"],
    ROWS26 = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  // What Shift prints over each digit (as on a US board; the physical key
  // plus Shift is what's checked, so other layouts still play).
  var SHIFT_SYM = { "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(", "0": ")" };
  function codesOf(rows) {
    return rows.join("").split("").map(function (ch) { return (ch >= "0" && ch <= "9" ? "Digit" : "Key") + ch; });
  }
  var LAYOUTS = {
    nine: { rows: ROWS9, codes: codesOf(ROWS9), labels: ROWS9.join("").split("") },
    letters: { rows: ROWSLET, codes: codesOf(ROWSLET), labels: ROWSLET.join("").split("") },
    all: { rows: ROWS26, codes: codesOf(ROWS26), labels: ROWS26.join("").split("") },
  };
  // The two menu toggles, remembered between visits.
  var pref = {
    clock: store.get("fishafish_clock", "daybreak"),
    kb: store.get("fishafish_kb", "nine"),
  };
  if (pref.clock !== "endless") pref.clock = "daybreak";
  if (!LAYOUTS[pref.kb]) pref.kb = "nine";
  // Show what the letter keys print on this keyboard, where the browser can
  // say. (The digit row keeps 1-0: on layouts like AZERTY the unshifted row
  // prints accents, and relabelling would only add confusion.)
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    navigator.keyboard.getLayoutMap().then(function (map) {
      Object.keys(LAYOUTS).forEach(function (k) {
        LAYOUTS[k].codes.forEach(function (code, i) {
          if (code.indexOf("Key") !== 0) return;
          var ch = map.get(code);
          if (ch && ch.length === 1) LAYOUTS[k].labels[i] = ch.toUpperCase();
        });
      });
    }).catch(function () {});
  }
  var layout = LAYOUTS.nine;

  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function now() { return performance.now(); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // ---- size and spot geometry ---------------------------------------------------
  var W = 0, H = 0, waterY = 0, spots = [];
  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    waterY = Art.waterLine(H);
    var old = spots;
    spots = [];
    if (layout === LAYOUTS.nine) {
      var base = Math.max(15, Math.min(30, 0.04 * Math.min(W, H)));
      for (var i = 0; i < 9; i++) {
        var col = i % 3, row = Math.floor(i / 3);
        spots.push({
          x: W * (0.26 + col * 0.24),
          y: waterY + (H - waterY) * (0.2 + row * 0.27),
          r: base * (0.82 + row * 0.19),
        });
      }
    } else {
      // The keyboard layouts: centred rows, staggered like the board itself
      // (three letter rows, or the number row plus those three).
      var gap = Math.min(W * 0.092, Math.max(30, W * 0.075));
      var b26 = Math.max(8.5, Math.min(17, gap * 0.32));
      var step = layout.rows.length === 4 ? 0.225 : 0.29;
      layout.rows.forEach(function (rowStr, row) {
        for (var c = 0; c < rowStr.length; c++) {
          spots.push({
            digitRow: rowStr.charAt(0) >= "0" && rowStr.charAt(0) <= "9",
            x: W * 0.5 + (c - (rowStr.length - 1) / 2) * gap,
            y: waterY + (H - waterY) * (0.14 + row * step),
            r: b26 * (0.9 + row * 0.08),
          });
        }
      });
    }
    // A resize mid-round keeps each spot's fish; a layout change starts clean.
    if (old && old.length === spots.length) old.forEach(function (o, k) {
      spots[k].phase = o.phase; spots[k].t = o.t; spots[k].dur = o.dur; spots[k].what = o.what; spots[k].sym = o.sym;
    });
    else resetSpots();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- sound ---------------------------------------------------------------------
  var actx = null, noiseB = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  ["pointerdown", "pointerup", "touchend", "keydown", "click"].forEach(function (type) {
    document.addEventListener(type, function () { audio(); }, true);
  });
  function tone(freq, dur, gain, type, slide, delay) {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(dur, gain, type, f0, f1, delay) {
    var ac = audio(); if (!ac) return;
    if (!noiseB) {
      noiseB = ac.createBuffer(1, Math.floor(ac.sampleRate * 1), ac.sampleRate);
      var d = noiseB.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = ac.currentTime + (delay || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseB; f.type = type; f.Q.value = 1;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(ac.destination);
    s.start(t); s.stop(t + dur + 0.05);
  }
  var SFX = {
    plip: function () { tone(1900, 0.05, 0.02, "sine", 900); },
    bite: function () { tone(430, 0.12, 0.06, "sine", 180); hiss(0.08, 0.05, "lowpass", 800, 300); },
    catchIt: function (pts) { hiss(0.14, 0.1, "bandpass", 1600, 500); tone(880, 0.14, 0.06, "triangle", null, 0.03); tone(pts >= 5 ? 1568 : 1175, 0.22, 0.06, "triangle", null, 0.1); },
    splash: function () { hiss(0.3, 0.16, "lowpass", 1500, 350); tone(220, 0.12, 0.05, "sine", 90); },
    boot: function () { tone(130, 0.28, 0.14, "sine", 65); hiss(0.35, 0.18, "lowpass", 1100, 250); },
    away: function () { tone(320, 0.2, 0.05, "sine", 150); tone(190, 0.24, 0.05, "sine", 110, 0.12); },
    tick: function () { tone(1350, 0.05, 0.045, "square"); },
    gong: function (delay) { tone(392, 0.9, 0.08, "sine", 386, delay); tone(784, 0.5, 0.03, "sine", null, delay); },
    streak: function () { [784, 988, 1319].forEach(function (f, i) { tone(f, 0.16, 0.05, "triangle", null, i * 0.06); }); },
    bird: function () { var f = rand(2200, 3400); tone(f, 0.09, 0.018, "sine", f * 1.25); tone(f * 0.92, 0.07, 0.014, "sine", f * 1.1, 0.12); },
  };

  // ---- state -----------------------------------------------------------------------
  var state = "menu", mode = null;
  var score = 0, streak = 0, bestStreak = 0, caught = 0, strikes = 0, timeLeft = 0, elapsed = 0;
  var spawnIn = 0, popups = [], leaps = [], drops = [], rings = [], birdIn = 5, lastTick = -1;
  function mult() { return streak >= 10 ? 3 : streak >= 5 ? 2 : 1; }
  function difficulty() { return Math.min(1, elapsed / (mode === "endless" ? 100 : 55)); }

  function resetSpots() { spots.forEach(function (s) { s.phase = "idle"; s.t = 0; s.dur = 0; s.what = null; s.sym = false; }); }
  function popup(x, y, text, kind) {
    var t = now();
    // Two popups on the same spot stack instead of printing over each other.
    popups.forEach(function (p) { if (t - p.t0 < 700 && Math.abs(p.x - x) < 60 && Math.abs(p.y - y) < 34) y = p.y - 30; });
    popups.push({ x: x, y: y, text: text, t0: t, kind: kind || "" });
  }
  function splashDrops(x, y, n, big) {
    if (!fx()) return;   // (Visual FX off: no spray; the popup and the sound still mark it)
    for (var k = 0; k < n && drops.length < 160; k++) {
      var a = -Math.PI / 2 + rand(-1, 1);
      var sp = rand(60, big ? 300 : 180) * Math.min(W, H) / 700;
      drops.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 1.6, life: 0, max: rand(0.3, 0.6), size: rand(1.5, 3.5) });
    }
  }

  // ---- spawning ----------------------------------------------------------------------
  function pickWhat() {
    var r = Math.random();
    if (r < 0.13) return "junk";
    if (r < 0.19) return "golden";
    if (r < 0.33) return "koi";
    if (r < 0.6) return "perch";
    return "bluegill";
  }
  function activeCount() { return spots.filter(function (s) { return s.phase !== "idle"; }).length; }
  function spawn() {
    var idle = spots.filter(function (s) { return s.phase === "idle"; });
    if (!idle.length) return;
    var s = idle[Math.floor(Math.random() * idle.length)];
    s.phase = "hint"; s.t = 0; s.dur = rand(0.4, 0.6); s.what = pickWhat();
    s.sym = !!s.digitRow && s.what !== "junk" && Math.random() < 0.45;
    SFX.plip();
  }

  // ---- the strike ---------------------------------------------------------------------
  // shifted: true / false from the keyboard, null from a tap (no Shift there).
  function press(i, shifted) {
    if (state !== "play" || P.isPaused()) return;
    var s = spots[i];
    s.pressed = now();
    if (s.phase === "bite") {
      // A symbol fish only takes Shift + its key; a plain digit fish only the
      // bare key. The fish stays for another try.
      if (s.what !== "junk" && s.digitRow && shifted !== null && shifted !== undefined && shifted !== s.sym) {
        score = Math.max(0, score - 2); liveBest();
        streak = 0;
        popup(s.x, s.y - s.r * 2, s.sym ? "hold [Shift]!  -2" : "no [Shift]!  -2", "bad");
        splashDrops(s.x, s.y, 6);
        SFX.splash();
        return;
      }
      if (s.what === "junk") {
        score = Math.max(0, score - 5); liveBest();
        streak = 0;
        s.phase = "idle";
        popup(s.x, s.y - s.r * 2, "an old boot  -5", "bad");
        splashDrops(s.x, s.y, 14, true);
        SFX.boot();
      } else {
        var pts = SPECIES[s.what].points * mult();
        score += pts; liveBest();
        streak++; caught++;
        bestStreak = Math.max(bestStreak, streak);
        leaps.push({ x: s.x, y: s.y, r: s.r, species: s.what, t0: now() });
        popup(s.x, s.y - s.r * 3.2, "+" + pts + "  " + SPECIES[s.what].name, SPECIES[s.what].points >= 5 ? "gold" : "");
        splashDrops(s.x, s.y, 10);
        s.phase = "idle";
        SFX.catchIt(pts);
        if (streak === 5 || streak === 10) { popup(W / 2, waterY + (H - waterY) * 0.08, "streak ×" + mult() + "!", "gold"); SFX.streak(); }
      }
    } else if (s.phase === "hint") {
      s.phase = "idle";
      streak = 0;
      popup(s.x, s.y - s.r * 2, "scared it off", "bad");
      splashDrops(s.x, s.y, 6);
      SFX.splash();
    } else {
      score = Math.max(0, score - 2); liveBest();
      streak = 0;
      popup(s.x, s.y - s.r * 2, "-2", "bad");
      splashDrops(s.x, s.y, 8);
      SFX.splash();
    }
  }
  function escaped(s) {
    s.phase = "idle";
    streak = 0;
    popup(s.x, s.y - s.r * 2, "got away…", "bad");
    SFX.away();
    if (mode === "endless") {
      strikes++;
      if (strikes >= 3) finish("quiet", 900);
    }
  }

  // ---- flow ----------------------------------------------------------------------------
  var ui = {
    menu: document.getElementById("menu"), over: document.getElementById("over"), hud: document.getElementById("hud"),
    score: document.getElementById("hud-score"), sub: document.getElementById("hud-sub"), streak: document.getElementById("hud-streak"),
    overTitle: document.getElementById("over-title"), overMsg: document.getElementById("over-msg"), overStats: document.getElementById("over-stats"),
    bests: document.getElementById("bests"),
  };
  var KB_NAME = { nine: "Condensed", letters: "All letters", all: "Whole keyboard" };
  function bestsText() {
    return "Best on " + KB_NAME[pref.kb].toLowerCase() + " · Daybreak " +
      store.getNum(bestKey("daybreak", pref.kb), 0) + " · Endless " + store.getNum(bestKey("endless", pref.kb), 0);
  }
  // Reflect the toggles in the menu, and remember them.
  function renderPicks() {
    ["pick-clock", "pick-kb"].forEach(function (id) {
      var which = id === "pick-clock" ? pref.clock : pref.kb;
      var btns = document.getElementById(id).querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("sel", btns[i].dataset.v === which);
    });
    ui.bests.textContent = bestsText();
  }
  var kbNow = "nine";
  // The best is saved the moment a run earns it: once the score passes the
  // best the run started with (runBest, what "new best!" compares against),
  // the stored best follows it live, so a tab closed mid-run keeps it. A
  // penalty can take the score back down, so it's the score that's kept, not
  // its peak; under runBest the stored value goes back to exactly what it was.
  var runBest = 0, runBestRaw = null, liveSaved = false;
  function liveBest() {
    var key = bestKey(mode, kbNow);
    if (score > runBest) { store.set(key, score); liveSaved = true; }
    else if (liveSaved) {
      if (runBestRaw == null) store.remove(key); else store.set(key, runBestRaw);
      liveSaved = false;
    }
  }
  function start(m) {
    // Legacy names (test hooks / old shortcuts) still work as presets.
    if (m === "fullpond") { pref.clock = "daybreak"; pref.kb = "all"; }
    else if (m === "daybreak" || m === "endless") pref.clock = m;
    mode = pref.clock;
    kbNow = pref.kb;
    var want = LAYOUTS[kbNow];
    if (layout !== want) { layout = want; resize(); }
    score = 0; streak = 0; bestStreak = 0; caught = 0; strikes = 0; elapsed = 0;
    runBest = store.getNum(bestKey(mode, kbNow), 0); runBestRaw = store.get(bestKey(mode, kbNow), null); liveSaved = false;
    timeLeft = mode === "endless" ? 0 : 60;
    spawnIn = 0.7; popups = []; leaps = []; drops = []; rings = []; lastTick = -1;
    resetSpots();
    state = "play";
    ui.menu.hidden = true; ui.over.hidden = true; ui.hud.hidden = false;
    SFX.gong(0);
  }
  function toMenu() {
    state = "menu"; mode = null;
    if (layout !== LAYOUTS.nine) { layout = LAYOUTS.nine; resize(); }
    resetSpots();
    popups = []; leaps = []; drops = [];
    ui.menu.hidden = false; ui.over.hidden = true; ui.hud.hidden = true;
    renderPicks();
  }
  var finishTimer = 0;
  // A strike can land just as the end card shows, and on the letter layouts
  // R (which restarts from the card) is a fishing key too. For a moment after
  // the card shows, a restart key that's also a pond key is ignored, so a late
  // strike doesn't skip straight past the results.
  var OVER_GRACE_MS = 1000, overAt = 0;
  function overSettled() { return now() - overAt >= OVER_GRACE_MS; }
  function finish(reason, delay) {
    if (state !== "play") return;
    state = "ending";
    clearTimeout(finishTimer);
    finishTimer = setTimeout(function () { showOver(reason); }, delay || 0);
  }
  function showOver(reason) {
    state = "over";
    overAt = now();
    var prev = runBest, isBest = score > prev;
    liveBest();   // the end-of-run save (the score is already in if it's a best)
    SFX.gong(0); SFX.gong(0.4);
    ui.overTitle.textContent = reason === "quiet" ? "The pond went quiet" : "The sun is up";
    ui.overMsg.textContent = score + (score === 1 ? " point" : " points") + (isBest ? " · new best!" : " · best " + prev);
    ui.overStats.textContent = caught + (caught === 1 ? " fish" : " fish") + " · best streak " + bestStreak +
      " · " + (mode === "endless" ? "Endless" : "Daybreak") + ", " + KB_NAME[kbNow].toLowerCase();
    ui.over.hidden = false; ui.hud.hidden = true;
    document.getElementById("again").focus({ preventScroll: true });
  }

  // Pause: the shared shell's overlay, key and ⏸ button. Escape only —
  // P is a fishing key on the letter layouts, so it must never pause.
  // Leaving uses the pause's default guard (game-shell.js): it asks first
  // while a run is on or paused, not in the "ending" beat (the best is in).
  var P = window.GameShell ? GameShell.pausable({ canPause: function () { return state === "play"; }, keys: ["Escape"] })
    : { isPaused: function () { return false; } };

  // ---- input ------------------------------------------------------------------------------
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (state === "play") {
      var at = layout.codes.indexOf(e.code);
      if (at !== -1) { e.preventDefault(); if (!e.repeat) press(at, e.shiftKey); }
      return;
    }
    if (e.repeat) return;
    // Enter on a focused button is that button's click (a pick, Again, Modes…);
    // casting off here as well would run both
    if (e.key === "Enter" && e.target && e.target.closest && e.target.closest("button")) return;
    if (state === "menu") {
      var mk = e.key.toLowerCase();
      if (e.key === "1") { pref.clock = "daybreak"; savePicks(); }
      else if (e.key === "2") { pref.clock = "endless"; savePicks(); }
      else if (mk === "c") { pref.kb = "nine"; savePicks(); }
      else if (mk === "l") { pref.kb = "letters"; savePicks(); }
      else if (mk === "w") { pref.kb = "all"; savePicks(); }
      else if (e.key === "Enter") start();
    } else if (state === "over") {
      // Backspace back to the modes; Esc is left to leave for the games page.
      // (Enter is never a pond key; an R on one waits out the grace, overSettled)
      if (e.key === "Enter" || e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (e.key === "Enter" || layout.codes.indexOf(e.code) === -1 || overSettled()) start(mode);
      } else if (e.key === "Backspace") { e.preventDefault(); toMenu(); }
    }
  });
  canvas.addEventListener("pointerdown", function (e) {
    if (state !== "play" || P.isPaused()) return;
    e.preventDefault();
    var best = -1, bd = Infinity;
    for (var i = 0; i < spots.length; i++) {
      var d = Math.hypot(spots[i].x - e.clientX, spots[i].y - e.clientY);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd < spots[best].r * 3.2) press(best, null);
  });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  function savePicks() {
    store.set("fishafish_clock", pref.clock);
    store.set("fishafish_kb", pref.kb);
    renderPicks();
  }
  ["pick-clock", "pick-kb"].forEach(function (id) {
    document.getElementById(id).addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (id === "pick-clock") pref.clock = b.dataset.v; else pref.kb = b.dataset.v;
      savePicks();
    });
    // a mouse click on a pick doesn't take focus (Tab still reaches it): left
    // focused, the Enter that should cast off would press the pick again
    document.getElementById(id).addEventListener("mousedown", function (e) {
      if (e.target.closest("button")) e.preventDefault();
    });
  });
  document.getElementById("play").addEventListener("click", function () { start(); });
  document.getElementById("again").addEventListener("click", function () { start(mode); });
  document.getElementById("to-menu").addEventListener("click", toMenu);

  // ---- update ------------------------------------------------------------------------------
  function update(dt) {
    if (state === "play") {
      elapsed += dt;
      var d = difficulty();
      if (mode !== "endless") {
        timeLeft -= dt;
        var sLeft = Math.ceil(timeLeft);
        if (sLeft <= 5 && sLeft > 0 && sLeft !== lastTick) { lastTick = sLeft; SFX.tick(); }
        if (timeLeft <= 0) { timeLeft = 0; finish("sunup", 400); }
      }
      spawnIn -= dt;
      var wide = spots.length;
      var maxActive = 1 + Math.floor(d * (wide > 30 ? 3.9 : wide > 9 ? 3.6 : 2.95));
      if (spawnIn <= 0) {
        if (activeCount() < maxActive) spawn();
        spawnIn = lerp(1.25, wide > 30 ? 0.4 : wide > 9 ? 0.45 : 0.5, d) * rand(0.8, 1.2);
      }
      spots.forEach(function (s) {
        if (s.phase === "idle") return;
        s.t += dt;
        if (s.phase === "hint" && s.t >= s.dur) {
          s.phase = "bite"; s.t = 0;
          // Finding one key among 36 takes longer than one among 9 — and a
          // symbol fish needs a hand on Shift too.
          // Finding one key among 26 or 36 takes longer than one among 9.
          var slow = spots.length > 9 ? (s.sym ? 1.55 : 1.28) : 1;
          s.dur = (s.what === "junk" ? lerp(1.5, 0.95, d) : lerp(1.7, 0.8, d) * slow * (s.what === "golden" ? 0.65 : 1));
          if (s.what !== "junk") SFX.bite();
        } else if (s.phase === "bite" && s.t >= s.dur) {
          if (s.what === "junk") s.phase = "idle";
          else escaped(s);
        }
      });
      birdIn -= dt;
      if (birdIn <= 0) { SFX.bird(); birdIn = rand(4, 10); }
    }
    for (var i = drops.length - 1; i >= 0; i--) {
      var p = drops[i];
      p.life += dt; p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life > p.max) drops.splice(i, 1);
    }
  }

  // ---- draw ---------------------------------------------------------------------------------
  // What the last frame drew for cues that differ with Visual FX off (test hook).
  var cues = { escapeWarn: [] };
  function draw(t) {
    var f = fx();
    cues.escapeWarn = [];
    Art.scene(ctx, W, H, t, f);
    if (state === "menu") Art.boat(ctx, W * 0.82, waterY + (H - waterY) * 0.22, Math.max(0.6, Math.min(1.3, H / 640)));
    var playing = state === "play" || state === "ending";
    // the bob, the shadow's wag and the boot's rocking run on this clock: with
    // Visual FX off it stands still, so they're drawn as they are, unmoving
    var tm = f ? t : 0;
    spots.forEach(function (s, i) {
      if (!playing) return;
      var dip = s.phase === "bite" && s.what !== "junk" ? Math.min(1, s.t * 6) : 0;
      if (s.phase === "hint" && f) Art.ring(ctx, s.x, s.y, s.r * (1.3 + (s.t / s.dur) * 1.2), 0.5 * (1 - s.t / s.dur) + 0.15);
      if (s.phase === "hint") Art.ring(ctx, s.x, s.y, s.r * 1.7, 0.3);
      if (s.phase === "bite") {
        if (s.what === "junk") Art.junk(ctx, s.x, s.y + s.r * 0.3, s.r * 1.5, tm);
        else {
          Art.shadowFish(ctx, s.x + s.r * 0.2, s.y + s.r * 0.7, s.r * (s.what === "golden" ? 1.5 : 1.8), tm);
          // The last moment flashes: it's about to get away. With Visual FX
          // off the same ring holds steady and dashed instead of blinking.
          if (s.dur - s.t < 0.35) {
            if (!f) {
              ctx.setLineDash([s.r * 0.35, s.r * 0.25]);
              Art.ring(ctx, s.x, s.y, s.r * 2.1, 0.7);
              ctx.setLineDash([]);
              cues.escapeWarn.push(i);
            } else if (Math.floor(t / 90) % 2 === 0) Art.ring(ctx, s.x, s.y, s.r * 2.1, 0.7);
          }
        }
      }
      if (s.what !== "junk" || s.phase !== "bite") Art.bobber(ctx, s.x, s.y, s.r * 0.55, dip, 0, tm);
      var label = layout.labels[i];
      if (s.sym && s.phase !== "idle") label = SHIFT_SYM[label] || label;
      Art.tag(ctx, s.x, s.y + s.r * 1.55, s.r * 0.62, label, s.phase === "bite", s.sym && s.phase === "bite");
    });
    // Catches leaping out of the water.
    for (var L = leaps.length - 1; L >= 0; L--) {
      var lp = leaps[L], age = (t - lp.t0) / 700;
      if (age > 1) { leaps.splice(L, 1); continue; }
      var ly = lp.y - Math.sin(age * Math.PI) * lp.r * 4.2;
      ctx.save();
      ctx.globalAlpha = age > 0.8 ? 1 - (age - 0.8) * 5 : 1;
      Art.leapFish(ctx, lp.x, ly, lp.r * 1.35, lp.species, -0.9 + age * 1.8);
      ctx.restore();
    }
    ctx.fillStyle = "#eaf4f8";
    drops.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    Art.foreground(ctx, W, H, t, f);
    ctx.textAlign = "center";
    for (var k = popups.length - 1; k >= 0; k--) {
      var pp = popups[k], pa = (t - pp.t0) / 950;
      if (pa > 1) { popups.splice(k, 1); continue; }
      var size = Math.round(Math.max(15, Math.min(26, H * 0.03)) * (pp.kind === "gold" ? 1.25 : 1));
      ctx.font = "600 " + size + "px Fredoka, system-ui, sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(23,38,44," + (0.75 * (1 - pa)).toFixed(3) + ")";
      ctx.fillStyle = (pp.kind === "bad" ? "rgba(255,158,138," : pp.kind === "gold" ? "rgba(255,224,130," : "rgba(240,250,252,") + (1 - pa).toFixed(3) + ")";
      var py = pp.y - pa * 34;
      // a [KEY] in the text is drawn as a keycap (GameShell.drawKeys)
      if (pp.text.indexOf("[") !== -1 && window.GameShell && GameShell.drawKeys) {
        GameShell.drawKeys(ctx, pp.text, pp.x, py, { outline: { width: ctx.lineWidth, color: ctx.strokeStyle } });
        continue;
      }
      var txt = pp.text.replace(/[[\]]/g, "");
      ctx.strokeText(txt, pp.x, py);
      ctx.fillText(txt, pp.x, py);
    }
  }

  var hudCache = "";
  function hud() {
    if (state !== "play" && state !== "ending") return;
    var sub = mode === "endless" ? "✕".repeat(strikes) + "•".repeat(3 - strikes) : Math.ceil(timeLeft) + "s";
    var st = mult() > 1 ? "×" + mult() : streak >= 2 ? streak + " streak" : "";
    var key = score + "|" + sub + "|" + st;
    if (key === hudCache) return;
    hudCache = key;
    ui.score.textContent = score;
    ui.sub.textContent = sub;
    ui.sub.className = mode === "endless" ? "strikes" : "time" + (timeLeft <= 10 ? " low" : "");
    ui.streak.textContent = st;
    ui.streak.className = "streak" + (mult() > 1 ? " on" : "");
  }

  var lastT = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    if (!P.isPaused() && !document.hidden) update(dt);
    draw(t);
    hud();
  }
  toMenu();
  requestAnimationFrame(frame);

  // ---- test hooks ----------------------------------------------------------------------------
  window.FishAFish = {
    start: start, toMenu: toMenu, press: press,
    state: function () {
      return { state: state, mode: mode, score: score, streak: streak, caught: caught, strikes: strikes,
        kb: kbNow, timeLeft: timeLeft, paused: P.isPaused(), spots: spots.map(function (s) { return s.phase + (s.what ? ":" + s.what : "") + (s.sym ? "!" : ""); }), labels: layout.labels.join("") };
    },
    // Deterministic control: stop the spawner and place things by hand.
    hold: function () { spawnIn = 1e9; resetSpots(); },
    force: function (i, what, phase, dur, sym) { var s = spots[i]; s.phase = phase || "bite"; s.what = what; s.t = 0; s.dur = dur || 9; s.sym = !!sym; },
    tickSpot: function (i, dt) { var s = spots[i]; s.t += dt; },
    setTime: function (v) { timeLeft = v; },
    geometry: function () { return spots.map(function (s) { return { x: s.x, y: s.y, r: s.r }; }); },
    // spots whose steady (Visual FX off) escape warning was drawn last frame
    cues: function () { return { escapeWarn: cues.escapeWarn.slice() }; },
  };
})();
