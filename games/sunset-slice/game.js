/* =====================================================================
   Sunset Slice — swipe to cut what the wind throws up against the sun.

   Objects fly on parabolas in screen-relative units (u = x / width,
   v = y / height), so a resize never teleports anything. A swipe is a
   stroke from pointer-down to pointer-up; every segment faster than a
   minimum speed cuts any target it crosses. Three or more cuts in one
   stroke is a combo.

   Modes: Duel (3 seals: let a target fall and you lose one; cut a bomb and
   the duel is over), Last Light (60 s while the sun sets; a bomb costs 10)
   and Calm (90 s, no bombs).
   ===================================================================== */
(function () {
  "use strict";
  var Art = window.SunsetArt, TYPES = Art.TYPES;
  var canvas = document.getElementById("stage"), ctx = canvas.getContext("2d");
  var store = window.GameShell ? GameShell.store : { getNum: function (k, f) { return f; }, set: function () {} };
  var KEYS = { duel: "sunsetslice_best_duel", lastlight: "sunsetslice_best_lastlight", calm: "sunsetslice_best_calm" };
  var MODES = {
    duel: { name: "Duel", lives: 3, bombs: true, time: 0 },
    lastlight: { name: "Last Light", lives: 0, bombs: true, time: 60 },
    calm: { name: "Calm", lives: 0, bombs: false, time: 90 },
  };
  var FRUIT = ["persimmon", "peach", "bamboo", "lantern"];
  var G = 1.9;               // gravity, in screen heights per second²
  var MAX_PARTS = 220;

  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function now() { return performance.now(); }

  // ---- size --------------------------------------------------------------------------
  var W = 0, H = 0, R = 40, mountainLayer = null;
  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.max(24, Math.min(62, 0.075 * Math.min(W, H)));
    mountainLayer = Art.mountains(W, H);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- sound ---------------------------------------------------------------------------
  var actx = null, noise = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  ["pointerdown", "pointerup", "touchend", "keydown", "click"].forEach(function (type) {
    document.addEventListener(type, function () { audio(); }, true);
  });
  function noiseBuf(ac) {
    if (!noise) {
      noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.2), ac.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noise;
  }
  function hiss(dur, gain, type, f0, f1, delay) {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime + (delay || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf(ac); f.type = type; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(ac.destination);
    s.start(t); s.stop(t + dur + 0.05);
  }
  function tone(freq, dur, gain, type, slide, delay) {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  var lastSwoosh = 0;
  var SFX = {
    swoosh: function () { var t = now(); if (t - lastSwoosh < 140) return; lastSwoosh = t; hiss(0.16, 0.07, "bandpass", 900, 2600); },
    slice: function (type) {
      hiss(0.07, 0.12, "highpass", 5000); tone(2400, 0.12, 0.035, "sine", 1500);
      if (type === "lantern") { tone(1760, 0.5, 0.04); tone(2637, 0.45, 0.025, "sine", null, 0.02); }
      else if (type === "koban") { tone(2637, 0.25, 0.05); tone(3136, 0.3, 0.045, "sine", null, 0.07); }
      else hiss(0.12, 0.1, "lowpass", 900, 300, 0.01);
    },
    combo: function (n) {   // a koto-like run up a pentatonic scale
      var notes = [587, 659, 784, 880, 988, 1175, 1319];
      for (var i = 0; i < Math.min(n, 6); i++) tone(notes[i], 0.35, 0.06, "triangle", null, i * 0.06);
    },
    thud: function () { tone(120, 0.3, 0.2, "sine", 55); hiss(0.08, 0.08, "bandpass", 1800); },
    boom: function () { hiss(1.2, 0.4, "lowpass", 1400, 90); tone(90, 0.8, 0.35, "sine", 35); },
    taiko: function (delay) { tone(110, 0.45, 0.28, "sine", 60, delay); hiss(0.05, 0.06, "lowpass", 600, 200, delay); },
    tick: function () { tone(1250, 0.05, 0.05, "square"); },
    start: function () { SFX.taiko(0); SFX.taiko(0.18); },
    end: function () { SFX.taiko(0); SFX.taiko(0.22); SFX.taiko(0.5); },
  };

  // ---- state -------------------------------------------------------------------------------
  var state = "menu", paused = false, mode = null, M = null;
  var objs = [], halves = [], parts = [], gleams = [], inks = [], popups = [], trail = [], queue = [];
  var score = 0, lives = 0, timeLeft = 0, elapsed = 0, maxCombo = 0, nextWave = 0, flash = 0, shake = 0, overReason = "", nextId = 0;
  var menuPick = null, minVSeen = 9, badSeen = 0;   // (for tests: the highest peak, and broken objects dropped)
  var runBest = 0, liveBest = 0;   // the mode's best as the run began, and as stored now (it's saved as the run passes it)

  // ---- spawning ------------------------------------------------------------------------------
  // Launch from just below the bottom edge so the object peaks at height `apex`
  // (v, from the top). vu is sideways speed in widths per second.
  function launch(type, u, apex, vu, extra) {
    var v0 = 1 + R / H + 0.02, rise = v0 - apex;
    var o = { id: ++nextId, type: type, u: u, v: v0, vu: vu || 0, vv: -Math.sqrt(2 * G * rise), rot: rand(0, 6.28), vr: rand(-2.5, 2.5), seen: false };
    if (extra) for (var k in extra) o[k] = extra[k];
    objs.push(o);
    return o;
  }
  function flightTime(o) { return 2 * -o.vv / G + 0.3; }
  function difficulty() {
    if (mode === "duel") return Math.min(1, elapsed / 90);
    if (mode === "lastlight") return 0.35 + 0.5 * (elapsed / 60);
    return 0.25;
  }
  // The highest a target may peak: clear of the top bar's buttons on short screens.
  function minApex() { return Math.max(0.18, (60 + R) / H); }
  function wave() {
    var d = difficulty(), n = Math.min(5, 1 + Math.floor(Math.random() * (1.5 + d * 3))), top = minApex();
    var pattern = Math.random() < 0.1 + d * 0.25 ? "fan" : Math.random() < 0.2 ? "volley" : "scatter";
    var planned = [], i;
    if (pattern === "fan") {
      var u0 = rand(0.3, 0.7), apex = rand(0.2, 0.35);
      for (i = 0; i < n; i++) planned.push({ u: u0, apex: apex + rand(-0.03, 0.03), vu: (i - (n - 1) / 2) * 0.16, delay: 0 });
    } else if (pattern === "volley") {
      for (i = 0; i < n; i++) planned.push({ u: 0.15 + 0.7 * (n === 1 ? 0.5 : i / (n - 1)), apex: rand(0.25, 0.4), vu: 0, delay: 0 });
    } else {
      for (i = 0; i < n; i++) { var u = rand(0.12, 0.88); planned.push({ u: u, apex: rand(0.18, 0.55), vu: (0.5 - u) * rand(0.15, 0.45), delay: i * rand(0.12, 0.35) }); }
    }
    planned.forEach(function (p) { p.apex = Math.max(top, p.apex); p.type = pick(FRUIT); });
    // A rare gold koban, planned before the bombs so none is placed on its path.
    if (Math.random() < 0.04) planned.push({ type: "koban", u: rand(0.2, 0.8), apex: Math.max(top, rand(0.2, 0.35)), vu: rand(-0.1, 0.1), delay: rand(0.1, 0.5) });
    planned.forEach(function (p) { queue.push({ at: elapsed + p.delay, fn: function () { launch(p.type, p.u, p.apex, p.vu); } }); });
    // Bombs go straight up, clear of every fruit's path, or not at all.
    if (M.bombs) {
      var chance = 0.1 + d * 0.25, bombs = Math.random() < chance ? (d > 0.6 && Math.random() < 0.3 ? 2 : 1) : 0;
      for (var b = 0; b < bombs; b++) {
        var spot = clearSpot(planned);
        if (spot == null) break;
        planned.push({ u: spot, apex: 0.4, vu: 0 });
        queue.push({ at: elapsed + rand(0, 0.3), fn: (function (s) { return function () { launch("bomb", s, Math.max(top, rand(0.28, 0.5)), 0); }; })(spot) });
      }
    }
  }
  // A launch spot at least ~2.5 radii (plus its path) away from every planned object.
  function clearSpot(planned) {
    var margin = (R * 2.6) / W;
    for (var tries = 0; tries < 20; tries++) {
      var s = rand(0.1, 0.9), ok = true;
      for (var k = 0; k < planned.length; k++) {
        var p = planned[k], t = 2 * Math.sqrt(2 * (1.05 - p.apex) / G);
        var lo = Math.min(p.u, p.u + p.vu * t) - margin, hi = Math.max(p.u, p.u + p.vu * t) + margin;
        if (s > lo && s < hi) { ok = false; break; }
      }
      if (ok) return s;
    }
    return null;
  }

  // ---- slicing --------------------------------------------------------------------------------
  var stroke = null;
  function segHits(x1, y1, x2, y2, cx, cy, r) {
    var dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    var k = L ? Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / L)) : 0;
    var px = x1 + dx * k - cx, py = y1 + dy * k - cy;
    return px * px + py * py <= r * r;
  }
  function addPoint(x, y, t) {
    if (!stroke) return;
    var prev = stroke.pts[stroke.pts.length - 1];
    stroke.pts.push({ x: x, y: y, t: t });
    trail.push({ x: x, y: y, t: t });
    if (!prev) return;
    // A pause breaks the stroke into a new combo group.
    if (t - prev.t > 200) endCombo();
    var dt = Math.max(1, t - prev.t) / 1000, dist = Math.hypot(x - prev.x, y - prev.y), speed = dist / dt;
    var vmin = Math.max(220, 0.45 * Math.min(W, H));
    if (speed < vmin) return;
    if (speed > vmin * 2.2) SFX.swoosh();
    var ang = Math.atan2(y - prev.y, x - prev.x);
    var list = state === "menu" ? menuTargets() : objs;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.cut) continue;
      if (segHits(prev.x, prev.y, x, y, o.u * W, o.v * H, R * (o.type === "bamboo" ? 1.05 : 0.95))) slice(o, ang);
    }
  }
  function endCombo() {
    if (!stroke) return;
    var n = stroke.cuts;
    if (n >= 3 && state === "play") {
      score += n;
      keepBest();
      maxCombo = Math.max(maxCombo, n);
      popups.push({ x: stroke.lastX, y: stroke.lastY - R, text: n + " cuts  +" + n, t0: now(), big: true });
      SFX.combo(n);
    }
    stroke.cuts = 0;
  }

  function slice(o, ang) {
    // only a run in play cuts: the end beat after a bomb or the last second
    // lets the same swipe pass through without scoring
    if (state !== "play" && state !== "menu") return;
    o.cut = true;
    var x = o.u * W, y = o.v * H;
    if (state === "menu") { menuSliced(o, ang); return; }
    if (o.type === "bomb") { bombHit(o); return; }
    var pts = TYPES[o.type].points;
    score += pts;
    keepBest();
    stroke.cuts++; stroke.lastX = x; stroke.lastY = y;
    if (pts > 1) popups.push({ x: x, y: y - R, text: "+" + pts, t0: now() });
    splitInto(o, ang);
    SFX.slice(o.type);
    objs.splice(objs.indexOf(o), 1);
  }
  function splitInto(o, ang) {
    var x = o.u * W, y = o.v * H, nx = -Math.sin(ang), ny = Math.cos(ang), sep = 0.35 * Math.min(W, H);   // px/s apart
    [-1, 1].forEach(function (side) {
      halves.push({ type: o.type, u: o.u, v: o.v, vu: o.vu + nx * side * sep / W, vv: o.vv * 0.4 + ny * side * sep / H,
        rot: o.rot, vr: o.vr + side * rand(1.5, 3.5), cutAng: ang - o.rot, side: side, born: now() });
    });
    var juice = TYPES[o.type].juice, n = o.type === "lantern" ? 18 : 12;
    for (var k = 0; k < n && parts.length < MAX_PARTS; k++) {
      var a = ang + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2 + rand(-0.9, 0.9), sp = rand(120, 420) * Math.min(W, H) / 700;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0, max: rand(0.35, 0.8), color: o.type === "lantern" ? "#ffe08a" : juice, size: rand(2, 5) * R / 45, spark: o.type === "lantern" || o.type === "koban" });
    }
    gleams.push({ x: x, y: y, ang: ang, t0: now() });
    inks.push({ x: x, y: y, ang: ang, t0: now() });
  }
  function bombHit(o) {
    var x = o.u * W, y = o.v * H;
    objs.splice(objs.indexOf(o), 1);
    SFX.boom();
    for (var k = 0; k < 40 && parts.length < MAX_PARTS; k++) {
      var a = rand(0, 6.28), sp = rand(150, 700) * Math.min(W, H) / 700;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(0.4, 1.1), color: pick(["#fff2c0", "#ffb347", "#ff6a3a", "#3a2020"]), size: rand(3, 7) * R / 45, spark: true });
    }
    if (mode === "duel") {
      flash = fx() ? 0.9 : 0.35;
      shake = fx() ? 1 : 0;
      finish("bomb", 1100);
    } else {
      score = Math.max(0, score - 10);
      popups.push({ x: x, y: y - R, text: "-10", t0: now(), bad: true });
      flash = fx() ? 0.45 : 0.18;
      shake = fx() ? 0.5 : 0;
    }
  }
  function loseLife(o) {
    lives--;
    SFX.thud();
    popups.push({ x: Math.max(R, Math.min(W - R, o.u * W)), y: H - H * 0.12, text: "✕", t0: now(), bad: true });
    if (lives <= 0) finish("seals", 700);
  }

  // ---- menu targets: slice (or click) one to choose a mode ---------------------------------------
  var MENU = [
    { mode: "duel", type: "persimmon", u: 0.28 },
    { mode: "lastlight", type: "lantern", u: 0.5 },
    { mode: "calm", type: "peach", u: 0.72 },
  ];
  var menuObjs = [];
  function menuTargets() {
    if (!menuObjs.length) menuObjs = MENU.map(function (m, i) { return { mode: m.mode, type: m.type, u: m.u, v: 0.5, base: 0.5, vu: 0, vv: 0, rot: 0, vr: 0, phase: i * 2.1 }; });
    return menuObjs;
  }
  function menuSliced(o, ang) {
    splitInto(o, ang);
    SFX.slice(o.type);
    menuPick = { mode: o.mode, at: now() + 450 };
  }

  // ---- flow -------------------------------------------------------------------------------------------
  var ui = {
    menu: document.getElementById("menu"), over: document.getElementById("over"), hud: document.getElementById("hud"),
    score: document.getElementById("hud-score"), sub: document.getElementById("hud-sub"), pause: document.getElementById("pause"),
    overTitle: document.getElementById("over-title"), overMsg: document.getElementById("over-msg"), overStats: document.getElementById("over-stats"),
    bests: document.getElementById("bests"), pauseBtn: document.getElementById("pause-btn"),
  };
  // A run that passes the mode's best saves it the moment it does, so closing
  // the tab (or leaving during the end beat) can't lose a new best
  function keepBest() {
    if (mode && score > liveBest) { liveBest = score; store.set(KEYS[mode], score); }
  }
  function bestsText() {
    return "Best · Duel " + store.getNum(KEYS.duel, 0) + " · Last Light " + store.getNum(KEYS.lastlight, 0) + " · Calm " + store.getNum(KEYS.calm, 0);
  }
  function start(m) {
    mode = m; M = MODES[m];
    objs = []; halves = []; parts = []; gleams = []; inks = []; popups = []; queue = []; trail = [];
    score = 0; lives = M.lives; timeLeft = M.time; elapsed = 0; maxCombo = 0; nextWave = 0.6; flash = 0; shake = 0; overReason = "";
    menuObjs = []; menuPick = null; minVSeen = 9; badSeen = 0;
    runBest = liveBest = store.getNum(KEYS[m], 0);
    state = "play"; paused = false;
    ui.menu.hidden = true; ui.over.hidden = true; ui.pause.hidden = true; ui.hud.hidden = false;
    SFX.start();
  }
  function toMenu() {
    state = "menu"; paused = false; mode = null;
    objs = []; queue = []; halves = []; parts = []; menuObjs = []; menuPick = null;
    ui.menu.hidden = false; ui.over.hidden = true; ui.pause.hidden = true; ui.hud.hidden = true;
    ui.bests.textContent = bestsText();
  }
  var finishTimer = 0;
  function finish(reason, delay) {
    if (state !== "play") return;
    state = "ending"; overReason = reason;
    clearTimeout(finishTimer);
    finishTimer = setTimeout(showOver, delay || 0);
  }
  function showOver() {
    state = "over";
    // (saved as the run passed it; "new best" is against the best as the run began)
    var key = KEYS[mode], prev = runBest, isBest = score > prev;
    if (score > store.getNum(key, 0)) store.set(key, score);
    SFX.end();
    ui.overTitle.textContent = { bomb: "The bomb went off", seals: "Out of seals", time: "The sun has set", calm: "Stillness" }[overReason] || "Done";
    ui.overMsg.textContent = score + (score === 1 ? " point" : " points") + (isBest ? " · new best!" : " · best " + prev);
    ui.overStats.textContent = MODES[mode].name + (maxCombo >= 3 ? " · best combo " + maxCombo : "");
    ui.over.hidden = false; ui.hud.hidden = true;
    document.getElementById("again").focus({ preventScroll: true });
  }
  function setPaused(p) {
    if (state !== "play") p = false;
    paused = p;
    ui.pause.hidden = !p;
    stroke = null; trail = [];
    if (p) document.getElementById("resume").focus({ preventScroll: true });
  }

  // ---- input ---------------------------------------------------------------------------------------------
  function localPt(e) { return { x: e.clientX, y: e.clientY }; }
  canvas.addEventListener("pointerdown", function (e) {
    if (paused || (state !== "play" && state !== "menu")) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var p = localPt(e);
    stroke = { id: e.pointerId, pts: [{ x: p.x, y: p.y, t: e.timeStamp || now() }], cuts: 0, lastX: p.x, lastY: p.y, down: { x: p.x, y: p.y } };
    trail = [{ x: p.x, y: p.y, t: e.timeStamp || now() }];
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    e.preventDefault();
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (!evs || !evs.length) evs = [e];
    evs.forEach(function (ev) { var p = localPt(ev); addPoint(p.x, p.y, ev.timeStamp || now()); });
  });
  function endStroke(e) {
    if (!stroke || (e && e.pointerId !== stroke.id)) return;
    // A plain click on a menu target chooses it too (no swipe needed).
    if (state === "menu" && stroke.pts.length <= 3) {
      var d = stroke.down;
      menuTargets().forEach(function (o) { if (!o.cut && Math.hypot(o.u * W - d.x, o.v * H - d.y) < R * 1.1) slice(o, -Math.PI / 4); });
    }
    endCombo();
    stroke = null;
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () { start(b.getAttribute("data-mode")); });
  });
  document.getElementById("again").addEventListener("click", function () { start(mode); });
  document.getElementById("to-menu").addEventListener("click", toMenu);
  document.getElementById("resume").addEventListener("click", function () { setPaused(false); });
  // Modes on the pause card throws the run away, so it asks first. The run is
  // already paused there, and stays so under the box: Esc keeps it on the card.
  // (With no run going, guardLeave says so and it goes at once.)
  document.getElementById("quit").addEventListener("click", function () {
    if (window.GameShell && GameShell.askQuit) GameShell.askQuit({ title: "Quit this game?", ok: "Quit" }, toMenu);
    else toMenu();
  });
  ui.pauseBtn.addEventListener("click", function () { setPaused(true); });
  // Esc is claimed only to pause / resume; elsewhere the shared
  // motion-toggle.js takes it to the games page. On the end screen
  // Backspace goes back to the modes.
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      if (state === "play") { setPaused(!paused); e.preventDefault(); }
    } else if (e.key === "Backspace" && state === "over") { e.preventDefault(); toMenu(); }
  });
  if (window.GameShell) GameShell.onAutoPause(function () { if (state === "play" && !paused) setPaused(true); });
  // Leaving asks first during a run, paused or not, pausing it while it asks.
  // The end beat ("ending") doesn't: the run is over and its best saved.
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play"; },
    pause: function () { setPaused(true); },
    resume: function () { setPaused(false); },
    isPaused: function () { return paused; }
  });

  // ---- the loop ----------------------------------------------------------------------------------------
  var lastT = 0, lastTick = -1;
  function update(dt, t) {
    if (state === "play") {
      elapsed += dt;
      if (M.time) {
        timeLeft -= dt;
        var s = Math.ceil(timeLeft);
        if (s <= 5 && s !== lastTick && s > 0) { lastTick = s; SFX.tick(); }
        if (timeLeft <= 0) { timeLeft = 0; finish(mode === "calm" ? "calm" : "time", 300); }
      }
      nextWave -= dt;
      if (nextWave <= 0 && !queue.length) { wave(); nextWave = 1.6 - difficulty() * 0.85; }
      for (var q = queue.length - 1; q >= 0; q--) if (elapsed >= queue[q].at) { var job = queue[q]; queue.splice(q, 1); job.fn(); }
    }
    if (state === "play" || state === "ending") {
      for (var i = objs.length - 1; i >= 0; i--) {
        var o = objs[i];
        if (o.frozen) continue;
        o.vv += G * dt; o.u += o.vu * dt; o.v += o.vv * dt; o.rot += o.vr * dt;
        if (o.v * H < H - R * 0.6) o.seen = true;
        if (o.v < minVSeen) minVSeen = o.v;
        if (!isFinite(o.u) || !isFinite(o.v)) { badSeen++; objs.splice(i, 1); continue; }
        if (o.vv > 0 && o.v * H > H + R * 1.5) {
          objs.splice(i, 1);
          if (state === "play" && o.seen && M.lives && o.type !== "bomb" && o.type !== "koban") loseLife(o);
        }
      }
    }
    if (state === "menu") {
      // the choices bob; with Visual FX off each holds still at its resting tilt
      var tb = fx() ? t : 0;
      menuTargets().forEach(function (o) { if (!o.cut) { o.v = o.base + Math.sin(tb / 700 + o.phase) * 0.015; o.rot = Math.sin(tb / 900 + o.phase) * 0.15; } });
      if (menuPick && t >= menuPick.at) { var m = menuPick.mode; menuPick = null; start(m); }
    }
    for (var h = halves.length - 1; h >= 0; h--) {
      var hv = halves[h];
      hv.vv += G * dt; hv.u += hv.vu * dt; hv.v += hv.vv * dt; hv.rot += hv.vr * dt;
      if (hv.v * H > H + R * 2) halves.splice(h, 1);
    }
    var gpx = G * H;
    for (var p = parts.length - 1; p >= 0; p--) {
      var pt = parts[p];
      pt.life += dt; pt.vy += gpx * 0.6 * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      if (pt.life > pt.max) parts.splice(p, 1);
    }
    flash = Math.max(0, flash - dt * 1.6);
    shake = Math.max(0, shake - dt * 2.5);
  }

  function dusk() {
    if (state === "menu") return 0.08;
    if (mode === "lastlight") return Math.min(1, 0.05 + 0.95 * (elapsed / 60));
    if (mode === "calm") return 0.1 + 0.3 * Math.min(1, elapsed / 90);
    return 0.1;
  }
  function draw(t) {
    var f = fx(), dk = dusk(), rim = Math.max(0, (dk - 0.35) / 0.65);
    ctx.save();
    if (shake && f) ctx.translate(rand(-6, 6) * shake, rand(-6, 6) * shake);
    var sun = Art.sky(ctx, W, H, dk, t, f);
    ctx.drawImage(mountainLayer, 0, 0, W, H);
    if (state === "menu") {
      var s = Math.max(0.55, Math.min(1.4, H / 520)), gy = Art.horizonY(H) + H * 0.155;
      Art.samurai(ctx, W * 0.12, gy, s, 1);
      Art.samurai(ctx, W * 0.88, gy, s, -1);
    }
    // Ink brush strokes left by each cut, fading.
    for (var i = inks.length - 1; i >= 0; i--) {
      var ink = inks[i], age = (t - ink.t0) / 900;
      if (age > 1) { inks.splice(i, 1); continue; }
      ctx.save(); ctx.translate(ink.x, ink.y); ctx.rotate(ink.ang);
      ctx.fillStyle = "rgba(20,10,14," + (0.35 * (1 - age)).toFixed(3) + ")";
      ctx.beginPath(); ctx.moveTo(-R * 2, 0); ctx.quadraticCurveTo(0, -R * 0.16, R * 2, 0); ctx.quadraticCurveTo(0, R * 0.08, -R * 2, 0); ctx.fill();
      ctx.restore();
    }
    // Halves: the cut face, clipped to its side of the cut.
    halves.forEach(function (hv) {
      var age = (t - hv.born) / 1400;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 0.5) * 2);
      ctx.translate(hv.u * W, hv.v * H); ctx.rotate(hv.rot);
      ctx.rotate(hv.cutAng);
      ctx.beginPath(); ctx.rect(-R * 3, hv.side > 0 ? 0 : -R * 3, R * 6, R * 3); ctx.clip();
      ctx.rotate(-hv.cutAng);
      Art.half(ctx, hv.type, R, t);
      ctx.restore();
    });
    // Whole targets, lit from the sun. Their own clock (the koban's shine, the
    // bomb's pulse and fuse sparks) is held with Visual FX off: a still glint.
    var list = state === "menu" ? menuTargets() : objs, tt = f ? t : 0;
    list.forEach(function (o) {
      if (o.cut) return;
      var x = o.u * W, y = o.v * H;
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot);
      Art.target(ctx, o.type, R, tt, Math.atan2(sun.y - y, sun.x - x) - o.rot, rim);
      ctx.restore();
    });
    if (state === "menu") {
      ctx.font = "700 " + Math.round(Math.max(15, R * 0.42)) + "px 'Zen Old Mincho', Georgia, serif";
      ctx.textAlign = "center"; ctx.fillStyle = "#fff3dc"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(20,10,14,0.85)"; ctx.lineWidth = Math.max(3, R * 0.1);
      menuTargets().forEach(function (o) {
        if (o.cut) return;
        ctx.strokeText(MODES[o.mode].name, o.u * W, o.v * H + R * 1.75);
        ctx.fillText(MODES[o.mode].name, o.u * W, o.v * H + R * 1.75);
      });
    }
    // Juice and sparks.
    parts.forEach(function (p) {
      var k = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      if (p.spark) ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + k * 0.4), 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    // The gleam of each cut: a bright line along the blade's path (never full-screen).
    for (var g = gleams.length - 1; g >= 0; g--) {
      var gl = gleams[g], ga = (t - gl.t0) / 220;
      if (ga > 1) { gleams.splice(g, 1); continue; }
      ctx.save(); ctx.translate(gl.x, gl.y); ctx.rotate(gl.ang);
      ctx.strokeStyle = "rgba(255,255,255," + (1 - ga).toFixed(3) + ")";
      ctx.lineWidth = 3 * (1 - ga) + 1;
      ctx.beginPath(); ctx.moveTo(-R * 1.7, 0); ctx.lineTo(R * 1.7, 0); ctx.stroke();
      ctx.restore();
    }
    drawTrail(t);
    Art.grass(ctx, W, H, t, f);
    // Floating score text.
    for (var k = popups.length - 1; k >= 0; k--) {
      var pp = popups[k], pa = (t - pp.t0) / 900;
      if (pa > 1) { popups.splice(k, 1); continue; }
      ctx.font = "900 " + Math.round(R * (pp.big ? 0.62 : 0.5)) + "px 'Zen Old Mincho', Georgia, serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(20,10,14," + (0.8 * (1 - pa)).toFixed(3) + ")";
      ctx.fillStyle = pp.bad ? "rgba(255,120,110," + (1 - pa).toFixed(3) + ")" : "rgba(255,240,200," + (1 - pa).toFixed(3) + ")";
      var py = pp.y - pa * R * 0.8;
      ctx.strokeText(pp.text, pp.x, py); ctx.fillText(pp.text, pp.x, py);
    }
    ctx.restore();
    if (flash > 0) {
      if (fx()) { ctx.fillStyle = "rgba(255,248,235," + Math.min(1, flash).toFixed(3) + ")"; ctx.fillRect(0, 0, W, H); }
      else {
        // Visual FX off: the bomb shows as a warm glow round the edges, not a full-screen flash
        var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
        vg.addColorStop(0, "rgba(255,90,60,0)");
        vg.addColorStop(1, "rgba(255,90,60," + Math.min(1, flash * 2).toFixed(3) + ")");
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }
    }
  }
  // The blade: a white streak that tapers toward its tail over ~130 ms.
  function drawTrail(t) {
    while (trail.length && t - trail[0].t > 130) trail.shift();
    if (trail.length < 2) return;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 1; i < trail.length; i++) {
        var a = trail[i - 1], b = trail[i], k = i / trail.length;
        ctx.strokeStyle = pass === 0 ? "rgba(255,210,160," + (0.25 * k).toFixed(3) + ")" : "rgba(255,255,255," + (0.95 * k).toFixed(3) + ")";
        ctx.lineWidth = pass === 0 ? 12 * k + 2 : 5 * k + 1;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }

  var hudCache = "";
  function hud() {
    if (state !== "play" && state !== "ending") return;
    var sub = M.lives ? "" : Math.ceil(timeLeft) + "s";
    var seals = "";
    if (M.lives) for (var i = 0; i < M.lives; i++) seals += i < lives ? "●" : "✕";
    var key = score + "|" + sub + "|" + seals;
    if (key === hudCache) return;
    hudCache = key;
    ui.score.textContent = score;
    ui.sub.textContent = M.lives ? seals : sub;
    ui.sub.className = M.lives ? "seals" : "time" + (timeLeft <= 10 ? " low" : "");
  }

  function frame(t) {
    requestAnimationFrame(frame);        // re-arm first: one bad frame must not stop the game
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    if (!paused && !document.hidden) update(dt, t);
    draw(t);
    hud();
  }
  toMenu();
  requestAnimationFrame(frame);

  // ---- test hooks -------------------------------------------------------------------------------------------
  window.SunsetSlice = {
    start: start, toMenu: toMenu,
    state: function () { return { state: state, mode: mode, score: score, lives: lives, timeLeft: timeLeft, objs: objs.length, halves: halves.length, paused: paused, maxCombo: maxCombo, R: R, minV: minVSeen, bad: badSeen }; },
    // Place a target at (u, v) that stays put until cut; waves stop so tests are deterministic.
    spawn: function (type, u, v) { queue = []; nextWave = 1e9; var o = launch(type, u, 0.2); o.u = u; o.v = v; o.vv = 0; o.vu = 0; o.frozen = true; o.seen = true; return o.id; },
    drop: function (type, u) { queue = []; nextWave = 1e9; var o = launch(type, u, 0.5, 0); o.seen = true; o.v = 0.95; o.vv = 1; return o.id; },
    hold: function () { queue = []; nextWave = 1e9; objs = []; },
    setTime: function (s) { timeLeft = s; elapsed = (M.time || 60) - s; },
  };
})();
