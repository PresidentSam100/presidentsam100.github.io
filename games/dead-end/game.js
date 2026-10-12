/* =====================================================================
   Dead End: the page round the chase.

   The rules are engine.js (it knows nothing of the page) and the drawing
   is art.js. This file runs the clock, takes the keys and swipes, keeps
   score and the best, and walks you through the streets in levels.js,
   then round again with the dead a little quicker. A maze drawn in the
   editor (editor.html) arrives as a "#play=<code>" link and is played on
   its own.

   Modes
     shamblers  the dead at a shuffle
     sprinters  the dead a fifth quicker
   Each keeps its own best. A shared maze keeps none.

   Keys: arrows or WASD run, Space nails a plank across the alley behind
   you, P pauses; on the menu 1 2 pick the mode, Enter starts, L opens the
   editor; on the end card Enter runs again and Backspace is the modes.
   Esc leaves (asking first mid-run): the shared scripts.
   ===================================================================== */
(function () {
  "use strict";

  var E = window.DeadEndEngine, A = window.DeadEndArt, Code = window.DeadEndCode, STREETS = window.DEAD_END_LEVELS || [];
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    getNum: function (k, f) { var v = parseFloat(this.get(k, "")); return isNaN(v) ? f : v; },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  var bests = {
    shamblers: window.GameShell ? GameShell.best("deadend_best_shamblers", { higher: true }) : null,
    sprinters: window.GameShell ? GameShell.best("deadend_best_sprinters", { higher: true }) : null
  };

  // ---- sound ------------------------------------------------------------------
  // (muting is the shared speaker button's: mute-toggle.js routes every context)
  var actx = null;
  function audio() {
    try {
      if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
      if (actx && actx.state === "suspended") actx.resume();
    } catch (e) {}
    return actx;
  }
  function tone(freq, dur, type, vol, when, slide) {
    var a = audio(); if (!a) return;
    try {
      var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  var tinFlip = false;
  var SFX = {
    tin: function () { tinFlip = !tinFlip; tone(tinFlip ? 620 : 760, 0.05, "square", 0.035); },
    torch: function () { tone(180, 0.5, "sawtooth", 0.07, 0, 720); },
    plank: function () { tone(520, 0.08, "triangle", 0.08); tone(780, 0.1, "triangle", 0.07, 0.07); },
    board: function () { [0, 0.11, 0.22].forEach(function (w) { tone(150, 0.06, "square", 0.1, w, 90); }); },
    smash: function () { tone(260, 0.2, "sawtooth", 0.1, 0, 60); },
    knock: function (n) { tone(330 * Math.pow(1.19, n), 0.12, "square", 0.08); tone(660 * Math.pow(1.19, n), 0.16, "triangle", 0.07, 0.06); },
    bitten: function () { tone(210, 0.6, "sawtooth", 0.11, 0, 55); },
    clear: function () { [392, 523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.16, "triangle", 0.09, i * 0.09); }); },
    over: function () { [330, 262, 196, 131].forEach(function (f, i) { tone(f, 0.3, "sawtooth", 0.08, i * 0.2); }); },
    nope: function () { tone(140, 0.08, "square", 0.04); }
  };

  // ---- state --------------------------------------------------------------------
  var ui = "menu";               // menu | run | over
  var mode = store.get("deadend_mode", "shamblers") === "sprinters" ? "sprinters" : "shamblers";
  var shared = null;             // a maze from a "#play=" link, played on its own
  var st = null, li = 0, round = 1, started = false;
  var want = null, nail = false; // what the keys asked for since the last tick
  var popups = [], shake = 0, flash = 0, clock = 0;
  var canvas = $("board"), g = canvas.getContext("2d"), back = document.createElement("canvas"), cell = 30;

  function streets() { return shared ? [shared] : STREETS; }
  function inRun() { return ui === "run" && !!st && started && st.status !== "over"; }

  // ---- the canvas: sized to the maze and the window --------------------------------
  function fit() {
    var lv = st ? st.lv : E.parse(streets()[0]);
    var roomW = Math.min(620, document.documentElement.clientWidth - 20);
    var roomH = Math.max(260, window.innerHeight - (window.innerWidth < 600 ? 266 : 270));       // (a phone keeps room for the Plank button)
    cell = Math.max(10, Math.floor(Math.min(roomW / lv.cols, roomH / lv.rows)));
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = lv.cols * cell, H = lv.rows * cell;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    back.width = canvas.width; back.height = canvas.height;
    var b = back.getContext("2d");
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (var i = 0; i < lv.cols * lv.rows; i++) {
      var x = (i % lv.cols) * cell, y = Math.floor(i / lv.cols) * cell;
      if (lv.wall[i]) {
        var open = [0, 1, 2, 3].map(function (d) {
          var nx = i % lv.cols + E.DX[d], ny = Math.floor(i / lv.cols) + E.DY[d];
          return nx < 0 || ny < 0 || nx >= lv.cols || ny >= lv.rows ? 0 : lv.wall[ny * lv.cols + nx] ? 0 : 1;
        });
        A.wall(b, x, y, cell, open);
      } else {
        A.floor(b, x, y, cell, (i % lv.cols + Math.floor(i / lv.cols)) % 2);
        if (lv.gate[i]) A.gate(b, x, y, cell);
      }
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- drawing ------------------------------------------------------------------------
  function drawActor(pos, cols, rows, fn) {
    fn(pos.x, pos.y);
    if (pos.x < 0) fn(pos.x + cols, pos.y); else if (pos.x > cols - 1) fn(pos.x - cols, pos.y);
    if (pos.y < 0) fn(pos.x, pos.y + rows); else if (pos.y > rows - 1) fn(pos.x, pos.y - rows);
  }
  function render() {
    var lv = st.lv, W = lv.cols * cell, H = lv.rows * cell, f = fx(), s = cell, i, k;
    g.save();
    if (shake > 0 && f) g.translate(Math.sin(clock / 17) * shake * 5, Math.cos(clock / 13) * shake * 4);
    g.drawImage(back, 0, 0, W, H);
    for (k in st.items) {
      i = +k; var x = (i % lv.cols) * s, y = Math.floor(i / lv.cols) * s, it = st.items[k];
      if (it === "tin") A.tin(g, x, y, s); else if (it === "torch") A.torch(g, x, y, s, clock, f); else A.plank(g, x, y, s);
    }
    st.boards.forEach(function (b) { A.barricade(g, (b.cell % lv.cols) * s, Math.floor(b.cell / lv.cols) * s, s, b.hp / b.max, b.hit, clock, f); });
    var lit = st.torch > 0, fading = lit && st.torch < 1500 && Math.floor(clock / 180) % 2 === 0;
    st.dead.forEach(function (z) {
      // (as the torch gutters they flash back to their own colour, in warning)
      var state = z.state === "down" ? "down" : z.state === "roam" && lit && !fading ? "scared" : "roam";
      drawActor(E.where(lv, z), lv.cols, lv.rows, function (px, py) { A.dead(g, px * s + s / 2, py * s + s / 2, s, z.kind, state, z.dir, clock, { fx: f, pound: z.pound }); });
    });
    var me = E.where(lv, st.player), moving = st.player.to >= 0 && st.status === "play";
    if (st.status !== "bitten" || Math.floor(clock / 110) % 2) drawActor(me, lv.cols, lv.rows, function (px, py) { A.player(g, px * s + s / 2, py * s + s / 2, s, st.player.face, clock, moving, f); });
    // the night: a lantern's worth of light, a torch's worth while one burns
    var flick = f ? Math.sin(clock / 130) * 0.12 + Math.sin(clock / 47) * 0.06 : 0;
    A.night(g, W, H, me.x * s + s / 2, me.y * s + s / 2, s * ((lit ? 8.2 : 5.4) + flick), lit);
    st.dead.forEach(function (z) {
      if (z.state === "down" || (z.state === "roam" && lit)) return;
      var at = E.where(lv, z);
      if (Math.abs(at.x - me.x) + Math.abs(at.y - me.y) > 3.2) A.eyes(g, at.x * s + s / 2, at.y * s + s / 2, s, z.kind, z.dir);
    });
    g.font = "bold " + Math.max(12, Math.round(s * 0.62)) + "px 'Bebas Neue', 'Arial Narrow', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    popups.forEach(function (p) {
      var a = Math.max(0, 1 - p.age / 900);
      g.globalAlpha = a; g.fillStyle = "#16181d"; g.fillText(p.text, p.x * s + s / 2 + 1, (p.y - (f ? p.age / 700 : 0.5)) * s + s / 2 + 1);
      g.fillStyle = p.color; g.fillText(p.text, p.x * s + s / 2, (p.y - (f ? p.age / 700 : 0.5)) * s + s / 2);
    });
    g.globalAlpha = 1;
    if (flash > 0) { g.fillStyle = "rgba(200, 40, 30, " + (flash * 0.35).toFixed(3) + ")"; g.fillRect(0, 0, W, H); }
    g.restore();
  }

  // ---- the heads-up line, and the note over the block -------------------------------------
  function hud() {
    $("hud-score").textContent = fmt(st.score);
    var b = shared ? null : bests[mode];
    $("hud-best").textContent = b ? fmt(Math.max(b.get(), st.score)) : "";
    $("hud-best").parentNode.hidden = !b;          // (a shared maze keeps no best: the stat makes way)
    var hearts = "", planks = "", i;
    for (i = 0; i < E.TUNE.lives; i++) hearts += '<i class="heart' + (i < st.lives ? "" : " gone") + '"></i>';
    for (i = 0; i < E.TUNE.maxPlanks; i++) planks += '<i class="plk' + (i < st.planks ? "" : " gone") + '"></i>';
    if ($("hud-lives").dataset.v !== String(st.lives)) { $("hud-lives").innerHTML = hearts; $("hud-lives").dataset.v = st.lives; }
    if ($("hud-planks").dataset.v !== String(st.planks)) { $("hud-planks").innerHTML = planks; $("hud-planks").dataset.v = st.planks; }
    $("hud-where").textContent = st.lv.name + (round > 1 ? " · round " + round : "");
    $("plank-btn").disabled = !(ui === "run" && st.status === "play" && st.planks > 0);
  }
  var noteText = "";
  function note(text) {
    if (text === noteText) return;
    noteText = text;
    $("note").textContent = text; $("note").className = text ? "show" : "";
  }
  function keysOrTouch(keys, touch) { return window.GameShell && GameShell.touchOnly() ? touch : keys; }

  // ---- a run ----------------------------------------------------------------------------
  function load(run) {
    st = E.create(streets()[li % streets().length], run, null);
    if (!st.lv.name) st.lv.name = "A shared maze";
    popups = []; shake = 0; flash = 0; want = null; nail = false;
    $("hud-lives").dataset.v = ""; $("hud-planks").dataset.v = "";
    fit(); hud();
    render();          // (sizing the canvas wipes it: draw at once, not a frame later)
  }
  function startRun(m) {
    mode = m; store.set("deadend_mode", m);
    audio();
    li = 0; round = 1; started = false;
    load({ hard: mode === "sprinters" });
    ui = "run";
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false;
    note(keysOrTouch("Pick a way to run", "Swipe to run"));
  }
  function nextStreet() {
    li++;
    if (li % streets().length === 0) round++;
    load({ score: st.score, lives: st.lives, planks: st.planks, round: round, hard: st.hard });
    note(st.lv.name + (round > 1 ? " · round " + round : ""));
  }
  function finish() {
    ui = "over";
    var b = shared ? null : bests[mode], record = b ? b.submit(st.score) : false;
    $("over-title").textContent = "Dead end";
    $("over-msg").textContent = fmt(st.score);
    $("over-stats").textContent = (shared ? "On a shared maze: no best is kept. " : record && st.score > 0 ? "A new best. " : b && b.get() ? "Best: " + fmt(b.get()) + ". " : "") +
      "You got as far as " + st.lv.name + (round > 1 ? ", round " + round : "") + ".";
    $("over").hidden = false;
    note("");
  }
  function toMenu() {
    ui = "menu"; started = false;
    li = 0; round = 1;
    load({ hard: false });
    $("menu").hidden = false; $("over").hidden = true; $("hud").hidden = true;
    note("");
    paintMenu();
  }

  function handle(events) {
    events.forEach(function (e) {
      var lv = st.lv, x = e.cell != null ? e.cell % lv.cols : 0, y = e.cell != null ? Math.floor(e.cell / lv.cols) : 0;
      if (e.t === "tin") SFX.tin();
      else if (e.t === "torch") { SFX.torch(); popups.push({ x: x, y: y, text: "TORCH!", color: "#ffb347", age: 0 }); }
      else if (e.t === "plank") { SFX.plank(); popups.push({ x: x, y: y, text: "+PLANK", color: "#e8c48a", age: 0 }); }
      else if (e.t === "board") SFX.board();
      else if (e.t === "smash") SFX.smash();
      else if (e.t === "nope") SFX.nope();
      else if (e.t === "knock") { SFX.knock(Math.log(e.pts / E.TUNE.knock) / Math.LN2); popups.push({ x: e.x, y: e.y, text: "+" + e.pts, color: "#fff2b0", age: 0 }); }
      else if (e.t === "bitten") { SFX.bitten(); shake = 1; flash = 1; note(e.lives > 0 ? "Bitten!" : "That's the last of you"); }
      else if (e.t === "again") note(keysOrTouch("Pick a way to run", "Swipe to run"));
      else if (e.t === "clear") { SFX.clear(); note("Block cleared"); }
      else if (e.t === "over") { SFX.over(); finish(); }
    });
  }

  // ---- the clock ---------------------------------------------------------------------------
  var last = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min(100, now - last) : 16;
    last = now;
    var paused = P && P.isPaused();
    if (ui === "run" && !paused) {
      acc += dt;
      while (acc >= 16) {
        acc -= 16; clock += 16;
        var input = want != null || nail ? { dir: want, board: nail } : null;
        want = null; nail = false;
        var was = st.status;
        handle(E.step(st, 16, input));
        if (was === "ready" && st.status === "play") { started = true; note(""); }
        if (st.status === "next") nextStreet();
        popups.forEach(function (p) { p.age += 16; });
        popups = popups.filter(function (p) { return p.age < 900; });
        shake = Math.max(0, shake - 16 / 500); flash = Math.max(0, flash - 16 / 450);
        if (ui !== "run") break;
      }
      hud();
    } else if (ui !== "run") clock += fx() ? dt : 0;          // (the menu's backdrop: torches flicker with Visual FX on)
    if (st) render();
  }

  // ---- keys, swipes and the Plank button ---------------------------------------------------
  var KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (ui !== "run" || (P && P.isPaused())) return;
    if (e.key in KEYS) { e.preventDefault(); if (!e.repeat) { audio(); want = KEYS[e.key]; } }
    else if (e.key === " " || e.code === "Space") { e.preventDefault(); if (!e.repeat) nail = true; }
  });
  var touch = null;
  canvas.addEventListener("pointerdown", function (e) { audio(); touch = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  function swipe(e) {
    if (!touch || e.pointerId !== touch.id || ui !== "run") return;
    var dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
    want = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    touch.x = e.clientX; touch.y = e.clientY;                 // (a long drag can turn again without lifting)
  }
  canvas.addEventListener("pointermove", swipe);
  canvas.addEventListener("pointerup", function (e) { swipe(e); touch = null; });
  canvas.addEventListener("pointercancel", function () { touch = null; });
  $("plank-btn").addEventListener("click", function () { if (ui === "run") nail = true; });
  $("plank-btn").addEventListener("mousedown", function (e) { e.preventDefault(); });

  // ---- the menu -------------------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === mode); b.setAttribute("aria-pressed", b.dataset.v === mode); });
    var s = bests.shamblers && bests.shamblers.get(), q = bests.sprinters && bests.sprinters.get();
    $("bests").textContent = s || q ? "Best: Shamblers " + fmt(s || 0) + " · Sprinters " + fmt(q || 0) : "";
    $("shared").hidden = !shared; $("to-streets").hidden = !shared;
    if (shared) $("shared").textContent = "A shared maze is loaded: " + (shared.name || "untitled") + ".";
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () { mode = b.dataset.v; store.set("deadend_mode", mode); paintMenu(); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);
  $("to-streets").addEventListener("click", function () { shared = null; try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} toMenu(); });

  // a maze in the link ("#play=<code>"): checked before it's played
  function readLink() {
    var m = /[#&]play=([^&]+)/.exec(location.hash || "");
    if (!m) return;
    try {
      var lv = Code.decode(m[1]), errs = E.parse(lv).errors;
      if (errs.length) throw new Error(errs[0]);
      shared = lv;
    } catch (err) {
      shared = null;
      if (window.GameShell && GameShell.alert) GameShell.alert({ title: "That maze won't open", text: String(err && err.message || err) });
    }
  }

  // ---- pause, leaving, and the menus' keys -------------------------------------------------------
  var P = window.GameShell && GameShell.pausable ? GameShell.pausable({ canPause: function () { return ui === "run" && !!st && (st.status === "play" || st.status === "ready") && started; } }) : null;
  // Leaving asks first once a run is under way (the first step taken), until it's over
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave(P ? { active: inRun, pausable: P } : inRun);
  if (window.GameShell && GameShell.menuKeys) {
    GameShell.menuKeys({ active: function () { return ui === "menu"; },
      groups: [{ sel: "#pick-mode button", into: "b" }, { sel: "#to-editor", keys: ["l"] }, { sel: "#to-streets", keys: ["Backspace"] }], start: "#play" });
    GameShell.menuKeys({ active: function () { return ui === "over"; }, groups: [{ sel: "#to-menu", keys: ["Backspace"] }], start: "#again" });
  }

  window.addEventListener("resize", function () { if (st) { fit(); render(); } });
  window.addEventListener("reducemotionchange", function () { document.body.classList.toggle("fxon", fx()); });
  document.body.classList.toggle("fxon", fx());

  readLink();
  toMenu();
  requestAnimationFrame(frame);

  // test hooks: the Playwright harness drives runs through these
  window.DeadEnd = {
    ui: function () { return ui; },
    st: function () { return st; },
    mode: function () { return mode; },
    start: startRun,
    shared: function () { return shared; },
    cell: function () { return cell; },
    // run the rules on by hand (ms of game time), as if these keys had been pressed first
    advance: function (ms, input) { var seen = []; for (var t = 0; t < ms; t += 16) { handle(E.step(st, 16, t === 0 ? input : null)); st.events.forEach(function (e) { seen.push(e.t); }); if (st.status === "next") nextStreet(); if (ui !== "run") break; } if (st.status === "play") { started = true; note(""); } hud(); return seen; }
  };
})();
