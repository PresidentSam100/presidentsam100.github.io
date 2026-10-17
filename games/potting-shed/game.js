/* =====================================================================
   Potting Shed: the box-pushing puzzle (Sokoban) on a brick floor. The
   gardener pushes terracotta pots, one at a time and never pulling, onto
   the patches of sun from the window; a pot in the sun blooms. Twelve
   sheds, from one pot to five.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  // ---- the sheds ------------------------------------------------------------------------
  // # a bench, space the floor, . a patch of sun, $ a pot, * a pot in the sun,
  // @ the gardener, + the gardener standing in the sun. Each is solvable
  // (checked by a solver: the fewest pushes are noted).
  var SHEDS = [
    { name: "First Pot", map: ["#######", "#     #", "# @$. #", "#     #", "#######"] },                                   // 1 push
    { name: "Cold Frame", map: ["########", "#  .   #", "# $##$ #", "#  .*. #", "#  $   #", "#   @  #", "########"] },        // 4
    { name: "Two by the Door", map: ["########", "#      #", "# @$  .#", "#  $  .#", "#      #", "########"] },             // 6
    { name: "Seed Trays", map: ["########", "#  ..  #", "# $$$$ #", "#  ..  #", "#  @   #", "########"] },                   // 6
    { name: "The Bench", map: ["#######", "#. . .#", "#     #", "# $$$ #", "#  @  #", "#######"] },                           // 8
    { name: "Along the Wall", map: ["#########", "#.  #   #", "#   $   #", "##$###  #", "#  @  $ #", "# .   . #", "#########"] }, // 9
    { name: "Narrow Path", map: ["#########", "#   #   #", "# $ $ $ #", "##  .  ##", " # . . # ", " #  @  # ", " ####### "] },  // 9
    { name: "Compost Corner", map: ["########", "#      #", "# $ #  #", "#.  $  #", "#.#@#  #", "#.  $  #", "#      #", "########"] }, // 9
    { name: "Rows of Beans", map: ["#########", "#.  #  .#", "# $   $ #", "##  #  ##", "#  $@$  #", "#.  #  .#", "#########"] }, // 10
    { name: "Greenhouse", map: ["##########", "#   ##   #", "# $    $ #", "#   ..   #", "#   ..   #", "# $  @ $ #", "#   ##   #", "##########"] }, // 12
    { name: "The Potting Bench", map: ["#######", "#.....#", "#     #", "# $$$ #", "# $@$ #", "#     #", "#######"] },              // 14
    { name: "Two Rooms", map: ["##########", "#    #   #", "# $  $ . #", "#  # #   #", "## # ##.##", "#  $     #", "#  @ #.  #", "##########"] } // 15
  ];
  function parse(n) {
    var rows = SHEDS[n].map, h = rows.length, w = 0, i;
    for (i = 0; i < h; i++) w = Math.max(w, rows[i].length);
    var L = { w: w, h: h, wall: [], sun: [], pots: [], me: 0 };
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var c = rows[y][x] || " ", k = y * w + x;
      L.wall[k] = c === "#";
      L.sun[k] = c === "." || c === "*" || c === "+";
      if (c === "$" || c === "*") L.pots.push(k);
      if (c === "@" || c === "+") L.me = k;
    }
    // the floor outside the walls is no floor at all: flood from the gardener
    L.inside = []; var q = [L.me]; L.inside[L.me] = true;
    while (q.length) { var at = q.pop(); [1, -1, w, -w].forEach(function (d) { var n2 = at + d; if (n2 >= 0 && n2 < w * h && !L.wall[n2] && !L.inside[n2]) { L.inside[n2] = true; q.push(n2); } }); }
    return L;
  }

  // ---- the canvas ------------------------------------------------------------------------
  var cv = $("stage"), g = cv.getContext("2d");
  var dpr = 1, CELL = 48, OX = 0, OY = 0, VW = 0, VH = 0;
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var host = $("yard").getBoundingClientRect();
    VW = Math.max(200, host.width); VH = Math.max(160, host.height);
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
    cv.style.width = VW + "px"; cv.style.height = VH + "px";
    if (L) {
      CELL = Math.floor(Math.min(VW / L.w, VH / L.h, 64));
      OX = Math.round((VW - CELL * L.w) / 2); OY = Math.round((VH - CELL * L.h) / 2);
    }
  }

  // ---- sound -----------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function scrape() {
    var ac = audio(); if (!ac) return;
    var len = Math.floor(ac.sampleRate * 0.12), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    var src = ac.createBufferSource(), bp = ac.createBiquadFilter(), gn = ac.createGain();
    src.buffer = buf; bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 0.8; gn.gain.value = 0.25;
    src.connect(bp); bp.connect(gn); gn.connect(ac.destination); src.start();
  }
  function sfxStep() { tone(180 + Math.random() * 30, 0.05, "triangle", 0.04); }
  function sfxBump() { tone(110, 0.08, "triangle", 0.06); }
  function sfxBloom() { tone(784, 0.25, "sine", 0.06); tone(1175, 0.3, "sine", 0.04, 0.05); }
  function sfxDone() { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.4, "sine", 0.06, i * 0.1); }); }

  // ---- the game ---------------------------------------------------------------------------
  var bests = {};
  try { bests = JSON.parse(store.get("pottingshed_best", "{}")) || {}; } catch (e) { bests = {}; }
  var shed = Math.max(0, Math.min(SHEDS.length - 1, Number(store.get("pottingshed_shed", "0")) || 0));
  var state = "menu";       // menu | play | done
  var L = null, me = 0, pots = [], moves = 0, pushes = 0, history = [], facing = 1;
  var tween = null, blooms = {}, doneAt = 0, DONE_WAIT = 700;

  function potAt(k) { return pots.indexOf(k); }
  function solved() { return pots.every(function (k) { return L.sun[k]; }); }

  function startShed(n) {
    if (n != null) shed = n;
    store.set("pottingshed_shed", String(shed));
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    L = parse(shed); me = L.me; pots = L.pots.slice(); moves = 0; pushes = 0; history = []; tween = null; blooms = {};
    pots.forEach(function (k) { if (L.sun[k]) blooms[k] = 1; });
    state = "play";
    $("menu").hidden = true; $("done").hidden = true; $("hud").hidden = false;
    layout(); hud();
  }
  function hud() {
    $("hud-shed").textContent = (shed + 1) + " · " + SHEDS[shed].name;
    $("hud-moves").textContent = moves;
    $("hud-pushes").textContent = pushes;
  }

  // one step: dx, dy as -1 / 0 / 1
  function step(dx, dy) {
    if (state !== "play" || P.isPaused()) return;
    if (dx) facing = dx;
    var d = dx + dy * L.w, to = me + d;
    if (L.wall[to]) { sfxBump(); return; }
    var p = potAt(to), pushed = -1;
    if (p >= 0) {
      var beyond = to + d;
      if (L.wall[beyond] || potAt(beyond) >= 0) { sfxBump(); return; }
      history.push({ me: me, pots: pots.slice(), moves: moves, pushes: pushes });
      pots[p] = beyond; pushes++; pushed = p;
      delete blooms[to];
      scrape();
      if (L.sun[beyond]) { sfxBloom(); blooms[beyond] = fx() ? 0.01 : 1; }
    } else history.push({ me: me, pots: pots.slice(), moves: moves, pushes: pushes });
    tween = fx() ? { from: me, pot: pushed >= 0 ? { i: pushed, from: to } : null, t: 0 } : null;
    me = to; moves++;
    if (pushed < 0) sfxStep();
    hud();
    if (solved()) finish();
  }
  function undo() {
    if (state !== "play" || P.isPaused() || !history.length) return;
    var h = history.pop();
    me = h.me; pots = h.pots; moves = h.moves; pushes = h.pushes; tween = null;
    blooms = {}; pots.forEach(function (k) { if (L.sun[k]) blooms[k] = 1; });
    tone(240, 0.06, "triangle", 0.04);
    hud();
  }
  function finish() {
    state = "done";
    doneAt = performance.now();
    var b = bests[shed], isBest = !b || moves < b.m || (moves === b.m && pushes < b.p);
    if (isBest) { bests[shed] = { m: moves, p: pushes }; store.set("pottingshed_best", JSON.stringify(bests)); }
    setTimeout(sfxDone, 120);
    var last = shed + 1 >= SHEDS.length;
    $("done-title").textContent = last ? "Every shed is potted" : "Potted!";
    $("done-msg").textContent = moves + " moves";
    var line = document.createElement("span"), best = document.createElement("span");
    line.textContent = pushes + " pushes · shed " + (shed + 1) + ", " + SHEDS[shed].name;
    best.className = "best" + (isBest && b ? " record" : "");
    best.textContent = isBest && b ? "your fewest moves here yet" : !b ? "first time through" : "fewest: " + b.m + " moves";
    $("done-stats").replaceChildren(line, best);
    $("next").hidden = last;
    $("done").hidden = false;
  }
  function toMenu() {
    state = "menu";
    $("done").hidden = true; $("hud").hidden = true; $("menu").hidden = false;
    paintMenu();
  }

  // ---- drawing ------------------------------------------------------------------------------
  function cx(k) { return OX + (k % L.w) * CELL; }
  function cy(k) { return OY + Math.floor(k / L.w) * CELL; }
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, VW, VH);
    if (!L) return;
    var s = CELL, k;
    for (k = 0; k < L.w * L.h; k++) {
      var x = cx(k), y = cy(k);
      if (L.wall[k]) drawBench(x, y, s, k);
      else if (L.inside[k]) {
        drawBrick(x, y, s, k);
        if (L.sun[k]) drawSun(x, y, s);
      }
    }
    // the pots (sliding, with Visual FX on, as the gardener pushes)
    var tt = tween ? Math.min(1, tween.t) : 1, ease = 1 - Math.pow(1 - tt, 3);
    pots.forEach(function (pk, i) {
      var x = cx(pk), y = cy(pk);
      if (tween && tween.pot && tween.pot.i === i) { x = cx(tween.pot.from) + (x - cx(tween.pot.from)) * ease; y = cy(tween.pot.from) + (y - cy(tween.pot.from)) * ease; }
      drawPot(x, y, s, L.sun[pk], blooms[pk] || 0);
    });
    var mx = cx(me), my = cy(me);
    if (tween) { mx = cx(tween.from) + (mx - cx(tween.from)) * ease; my = cy(tween.from) + (my - cy(tween.from)) * ease; }
    drawGardener(mx, my, s);
  }
  function drawBrick(x, y, s, k) {
    g.fillStyle = (Math.floor(k / L.w) + k) % 2 ? "#b8673f" : "#b05f39";
    g.fillRect(x, y, s, s);
    g.strokeStyle = "rgba(70, 30, 15, 0.35)"; g.lineWidth = 1;
    // herringbone: two bricks a cell, turned by the cell's place
    g.beginPath();
    if ((k + Math.floor(k / L.w)) % 2) { g.moveTo(x, y + s / 2 + 0.5); g.lineTo(x + s, y + s / 2 + 0.5); g.moveTo(x + s / 2 + 0.5, y); g.lineTo(x + s / 2 + 0.5, y + s / 2); }
    else { g.moveTo(x + s / 2 + 0.5, y); g.lineTo(x + s / 2 + 0.5, y + s); g.moveTo(x + s / 2, y + s / 2 + 0.5); g.lineTo(x + s, y + s / 2 + 0.5); }
    g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    g.stroke();
  }
  function drawBench(x, y, s, k) {
    g.fillStyle = "#6e4a2c"; g.fillRect(x, y, s, s);
    g.fillStyle = "#83593a";
    for (var i = 0; i < 3; i++) g.fillRect(x + 2, y + 2 + i * (s / 3), s - 4, s / 3 - 4);
    g.fillStyle = "rgba(40, 24, 10, 0.35)"; g.fillRect(x, y + s - 4, s, 4);
  }
  function drawSun(x, y, s) {
    var gr = g.createRadialGradient(x + s / 2, y + s / 2, 2, x + s / 2, y + s / 2, s * 0.7);
    gr.addColorStop(0, "rgba(255, 238, 160, 0.95)"); gr.addColorStop(1, "rgba(255, 214, 110, 0.15)");
    g.fillStyle = gr; g.fillRect(x + 2, y + 2, s - 4, s - 4);
    g.strokeStyle = "rgba(255, 246, 200, 0.9)"; g.lineWidth = 2;
    g.strokeRect(x + 4, y + 4, s - 8, s - 8);
  }
  function drawPot(x, y, s, inSun, bloom) {
    var c = x + s / 2, top = y + s * 0.3, bot = y + s * 0.88;
    // its shadow, the pot, its rim
    g.fillStyle = "rgba(60, 25, 10, 0.3)"; g.beginPath(); g.ellipse(c, bot, s * 0.3, s * 0.08, 0, 0, 7); g.fill();
    g.fillStyle = "#c9663d";
    g.beginPath(); g.moveTo(c - s * 0.3, top); g.lineTo(c + s * 0.3, top); g.lineTo(c + s * 0.22, bot); g.lineTo(c - s * 0.22, bot); g.closePath(); g.fill();
    g.fillStyle = "#df7c4f"; g.fillRect(c - s * 0.34, top - s * 0.08, s * 0.68, s * 0.12);
    g.strokeStyle = "#7a3416"; g.lineWidth = 1.5; g.strokeRect(c - s * 0.34, top - s * 0.08, s * 0.68, s * 0.12);
    // the seedling, and in the sun its flower
    g.strokeStyle = "#3f7a2c"; g.lineWidth = Math.max(2, s * 0.05);
    g.beginPath(); g.moveTo(c, top - s * 0.08); g.lineTo(c, top - s * 0.28); g.stroke();
    g.fillStyle = "#5c9a3a";
    g.beginPath(); g.ellipse(c - s * 0.09, top - s * 0.2, s * 0.09, s * 0.045, -0.5, 0, 7); g.fill();
    g.beginPath(); g.ellipse(c + s * 0.09, top - s * 0.24, s * 0.09, s * 0.045, 0.5, 0, 7); g.fill();
    if (inSun && bloom > 0) {
      var r = s * 0.12 * Math.min(1, bloom);
      g.fillStyle = "#f2c230";
      for (var i = 0; i < 5; i++) { var a = i * Math.PI * 2 / 5; g.beginPath(); g.arc(c + Math.cos(a) * r, top - s * 0.32 + Math.sin(a) * r, r * 0.75, 0, 7); g.fill(); }
      g.fillStyle = "#8a4a12"; g.beginPath(); g.arc(c, top - s * 0.32, r * 0.6, 0, 7); g.fill();
    }
  }
  function drawGardener(x, y, s) {
    var c = x + s / 2, m = y + s / 2;
    g.fillStyle = "rgba(60, 25, 10, 0.28)"; g.beginPath(); g.ellipse(c, y + s * 0.86, s * 0.26, s * 0.08, 0, 0, 7); g.fill();
    // apron and shirt
    g.fillStyle = "#3f6b8a"; g.beginPath(); g.ellipse(c, m + s * 0.12, s * 0.26, s * 0.3, 0, 0, 7); g.fill();
    g.fillStyle = "#a9c1a0"; g.fillRect(c - s * 0.13, m, s * 0.26, s * 0.36);
    // head and a wide straw hat
    g.fillStyle = "#f0c9a4"; g.beginPath(); g.arc(c, m - s * 0.16, s * 0.14, 0, 7); g.fill();
    g.fillStyle = "#e3c06a"; g.beginPath(); g.ellipse(c, m - s * 0.24, s * 0.3, s * 0.09, 0, 0, 7); g.fill();
    g.fillStyle = "#d4ac4f"; g.beginPath(); g.ellipse(c, m - s * 0.3, s * 0.14, s * 0.1, 0, 0, 7); g.fill();
    g.fillStyle = "#b5402f"; g.fillRect(c - s * 0.14, m - s * 0.27, s * 0.28, s * 0.04);
    // eyes, looking the way it last went
    g.fillStyle = "#2a1a10"; g.beginPath(); g.arc(c - s * 0.04 + facing * s * 0.025, m - s * 0.15, s * 0.018, 0, 7); g.arc(c + s * 0.04 + facing * s * 0.025, m - s * 0.15, s * 0.018, 0, 7); g.fill();
  }

  // ---- the loop, pause and the way out ------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    restart: function () { startShed(shed); },
    menu: toMenu,
    auto: false
  }) : { isPaused: function () { return false; } };
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && moves > 0; },
    pausable: P
  });
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (tween) { tween.t += dt / 0.09; if (tween.t >= 1) tween = null; }
    for (var k in blooms) if (blooms[k] < 1) blooms[k] = Math.min(1, blooms[k] + dt * 4);
    draw();
  }

  // ---- input ------------------------------------------------------------------------------------
  var DIRK = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1], A: [-1, 0], D: [1, 0], W: [0, -1], S: [0, 1] };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && state === "play") { e.preventDefault(); undo(); } return; }
    if (state !== "play" || P.isPaused()) return;
    var d = DIRK[e.key];
    if (d) { e.preventDefault(); step(d[0], d[1]); }
  });
  // swipes on the shed, and the touch pad's buttons
  var sw = null;
  cv.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") sw = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener("pointerup", function (e) {
    if (!sw) return;
    var dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) step(dx > 0 ? 1 : -1, 0); else step(0, dy > 0 ? 1 : -1);
  });
  [["t-up", 0, -1], ["t-left", -1, 0], ["t-right", 1, 0], ["t-down", 0, 1]].forEach(function (b) {
    $(b[0]).addEventListener("click", function () { step(b[1], b[2]); });
  });
  $("t-undo").addEventListener("click", undo);
  $("btn-undo").addEventListener("click", undo);
  $("btn-restart").addEventListener("click", function () { if (state === "play") startShed(shed); });
  $("btn-sheds").addEventListener("click", function () {
    if (window.GameShell && GameShell.askQuit && moves > 0) GameShell.askQuit({ title: "Leave this shed for the others?", ok: "Sheds" }, toMenu); else toMenu();
  });
  ["btn-undo", "btn-restart", "btn-sheds"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });

  // ---- the shed picker and the done card ------------------------------------------------------
  var mini = $("pick-pic"), mg = mini.getContext("2d");
  function paintMenu() {
    var S = SHEDS[shed], Lm = parse(shed), b = bests[shed];
    $("pick-name").textContent = S.name;
    $("pick-note").textContent = "shed " + (shed + 1) + " of " + SHEDS.length + " · " + Lm.pots.length + (Lm.pots.length === 1 ? " pot" : " pots");
    $("pick-best").textContent = b ? "fewest moves: " + b.m + " (" + b.p + " pushes)" : "not potted yet";
    $("play").firstChild.textContent = b ? "Pot it again " : "Pot this shed ";
    var done = SHEDS.filter(function (_, i) { return bests[i]; }).length;
    $("tally").textContent = done ? done + " of " + SHEDS.length + " sheds potted" : "";
    // the shed in small: benches, sun, pots
    var small = window.matchMedia && window.matchMedia("(max-width: 520px)").matches;
    var c = Math.floor(Math.min((small ? 72 : 120) / Lm.w, (small ? 60 : 84) / Lm.h));
    mini.width = Lm.w * c * 2; mini.height = Lm.h * c * 2; mini.style.width = Lm.w * c + "px"; mini.style.height = Lm.h * c + "px";
    mg.setTransform(2, 0, 0, 2, 0, 0);
    for (var k = 0; k < Lm.w * Lm.h; k++) {
      var x = (k % Lm.w) * c, y = Math.floor(k / Lm.w) * c;
      mg.fillStyle = Lm.wall[k] ? "#6e4a2c" : Lm.inside[k] ? (Lm.sun[k] ? "#f3d880" : "#b8673f") : "rgba(0,0,0,0)";
      mg.fillRect(x, y, c, c);
      if (Lm.pots.indexOf(k) >= 0) { mg.fillStyle = "#e07f52"; mg.fillRect(x + c * 0.2, y + c * 0.2, c * 0.6, c * 0.6); }
      if (k === Lm.me) { mg.fillStyle = "#3f6b8a"; mg.beginPath(); mg.arc(x + c / 2, y + c / 2, c * 0.32, 0, 7); mg.fill(); }
    }
    $("pick-prev").disabled = false; $("pick-next").disabled = false;
  }
  function pick(d) { shed = (shed + d + SHEDS.length) % SHEDS.length; store.set("pottingshed_shed", String(shed)); paintMenu(); }
  $("pick-prev").addEventListener("click", function () { pick(-1); });
  $("pick-next").addEventListener("click", function () { pick(1); });
  $("play").addEventListener("click", function () { startShed(shed); });
  $("next").addEventListener("click", function () { startShed(Math.min(SHEDS.length - 1, shed + 1)); });
  $("replay").addEventListener("click", function () { startShed(shed); });
  $("to-sheds").addEventListener("click", toMenu);
  if (window.GameShell && GameShell.menuKeys) {
    // the picker: ← → choose the shed, Space or Enter goes in
    GameShell.menuKeys({ active: function () { return state === "menu"; },
      groups: [{ sel: "#pick-prev", keys: ["arrowleft"] }, { sel: "#pick-next", keys: ["arrowright"] }], start: "#play", space: true });
    // in a shed: U undo, R start the shed over, Backspace the sheds
    GameShell.menuKeys({ active: function () { return state === "play" && !P.isPaused(); },
      groups: [{ sel: "#tools button", keys: ["u", "r", "backspace"] }] });
    // potted: Space or Enter the next shed (not in its first moment), R again, Backspace the sheds
    GameShell.menuKeys({ active: function () { return state === "done" && performance.now() - doneAt > DONE_WAIT; },
      groups: [{ sel: "#replay", keys: ["r"] }, { sel: "#to-sheds", keys: ["backspace"] }], start: "#next", space: true });
  }
  window.addEventListener("resize", function () { layout(); });
  toMenu();
  layout();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness drives sheds through these
  window.PottingShed = {
    state: function () { return state; },
    shed: function () { return shed; },
    count: SHEDS.length,
    moves: function () { return moves; },
    pushes: function () { return pushes; },
    me: function () { return me; },
    pots: function () { return pots.slice(); },
    level: function (n) { var Lx = parse(n == null ? shed : n); return { w: Lx.w, h: Lx.h, wall: Lx.wall, sun: Lx.sun, pots: Lx.pots, me: Lx.me }; },
    blooms: function () { return Object.keys(blooms).length; },
    tweening: function () { return !!tween; },
    step: step,
    undo: undo,
    start: startShed,
    toMenu: toMenu,
    best: function (n) { return bests[n == null ? shed : n] || null; }
  };
})();
