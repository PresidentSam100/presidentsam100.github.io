/* =====================================================================
   Potting Shed: the box-pushing puzzle (Sokoban) on a brick floor. The
   gardener pushes terracotta pots, one at a time and never pulling, onto
   the patches of sun from the window; a pot in the sun blooms. Thirty
   sheds, from one pot to five. The rules are engine.js's and the art
   art.js's, shared with the shed editor (editor.html, L on the menu), whose
   sheds come back here: "My sheds" on the menu (localStorage
   pottingshed_mine), or a "#play=<code>" link. A shed of your own is
   played as the others are, with its clock, but keeps no records.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var Engine = window.PottingShedEngine, Art = window.PottingShedArt;
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
    { name: "Two Rooms", map: ["##########", "#    #   #", "# $  $ . #", "#  # #   #", "## # ##.##", "#  $     #", "#  @ #.  #", "##########"] }, // 15
    { name: "Watering Cans", map: ["########", "#. .#  #", "# @$   #", "#  ##  #", "#   $$ #", "#   # .#", "########"] }, // 19
    { name: "Seedling Shelf", map: ["#########", "#  . .. #", "# #  # ##", "#    $$ #", "## #  $@#", "#    #  #", "#########"] }, // 20
    { name: "Herb Corner", map: ["#########", "#   #   #", "#   @$  #", "##  # $##", "#.   $  #", "#.. #   #", "#########"] }, // 21
    { name: "Rain Barrel", map: ["#########", "#  #    #", "#  $ #$ #", "##    $@#", "#  #   ##", "#       #", "#...#   #", "#########"] }, // 24
    { name: "Tool Rack", map: ["##########", "#   ## ..#", "#   $    #", "##$#  #.##", "#   $@   #", "#   ##   #", "##########"] }, // 26
    { name: "Wheelbarrow Way", map: ["##########", "#    #   #", "#        #", "###  ##  #", "#  $$#. .#", "#     $@.#", "##########"] }, // 27
    { name: "The Round House", map: [" ########", "##  #   ##", "#@$      #", "#  #### $#", "#. .   $.#", "##   #  ##", " ########"] }, // 28
    { name: "Bulb Store", map: ["##########", "#  #   # #", "#      $@#", "# ##  #$ #", "#  . #   #", "#  . .#$ #", "##  #    #", "##########"] }, // 30
    { name: "Trellis Posts", map: ["###########", "#   #  . .#", "# # $ # # #", "# $$      #", "# # # #.# #", "#       *@#", "###########"] }, // 32
    { name: "Leaf Mould", map: ["#########", "#   #   #", "# #  $# #", "#     $@#", "##    $##", "#.. #$  #", "#..*    #", "#########"] }, // 32
    { name: "Tomato House", map: ["###########", "##   #@  ##", "# $   $ $ #", "#.## # ## #", "#       $ #", "# ## # ## #", "#..     . #", "###########"] }, // 33
    { name: "Sweet Peas", map: ["##########", "## $.#   #", "# $@$  $ #", "# ## ##  #", "#        #", "#. # ##  #", "#. .     #", "##########"] }, // 36
    { name: "Cucumber Frames", map: ["###########", "#. $ #.   #", "# $. .    #", "## ## ## ##", "# $@$     #", "#    #    #", "###########"] }, // 37
    { name: "Orchard Gate", map: ["###########", "#    # .  #", "# $  $@   #", "#  #$# #  #", "##$      ##", "#  #   #  #", "#    #... #", "###########"] }, // 41
    { name: "Hedge Maze", map: ["##########", "#..  #   #", "# .#@$   #", "#  # ##$ #", "#.     $ #", "## #  #$ #", "# .    $ #", "##########"] }, // 41
    { name: "Root Cellar", map: ["###########", "#. @ #    #", "# #$ #  # #", "# $ $     #", "#$# ###$# #", "#.  . . . #", "###########"] }, // 46
    { name: "The Allotment", map: ["##########", "#.. #    #", "#.    #$ #", "# .#     #", "##$# ### #", "#  $@$ $ #", "#  .#    #", "##########"] }, // 51
    { name: "Head Gardener", map: ["##########", "#   #    #", "#   $ # *#", "## # $@#.#", "#  $ ## .#", "# #$     #", "#   #..  #", "##########"] } // 61
  ];
  // shed n of the thirty, or (n null) the shed of your own being played
  function parse(n) { return Engine.parse(n == null ? own.map : SHEDS[n].map); }

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
  // a shed opens once the one before it is potted (and stays open once potted)
  function isOpen(n) { return n === 0 || !!bests[n] || !!bests[n - 1]; }
  // the shed chosen last, if it's open; else the first open one not yet potted
  var kept = store.get("pottingshed_shed", null);
  var shed = kept == null ? -1 : Math.max(0, Math.min(SHEDS.length - 1, Number(kept) || 0));
  if (shed < 0 || !isOpen(shed)) for (shed = 0; shed < SHEDS.length - 1 && isOpen(shed + 1) && bests[shed]; shed++);
  var state = "menu";       // menu | play | blooming (the last flower opening) | done
  var own = null;           // a shed of your own ({ name, map }) when it's the one chosen or played
  var L = null, me = 0, pots = [], moves = 0, pushes = 0, history = [], facing = 1;
  // blooms: a pot in the sun's flower opening, by cell (0 to 1); wilts: a pot
  // pushed out of the sun, its flower closing as it goes (Visual FX on)
  var tween = null, blooms = {}, wilts = {}, doneAt = 0, DONE_WAIT = 700;
  // the potted card waits for the last pot to arrive and its flower to open,
  // then a beat to see it: the same wait with Visual FX on or off
  var plantedAt = 0, BLOOM_HOLD = 650, potted = null;

  // "1 move", "2 moves": a count and its word, one or many
  function count(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function solved() { return pots.every(function (k) { return L.sun[k]; }); }

  // ---- the clock ----------------------------------------------------------------------------
  // A shed's clock starts on the first step (looking the shed over is free)
  // and stops the moment the last pot lands in the sun, not when its flower
  // has opened, so Visual FX on or off makes no difference to it. Start over
  // and Undo leave it running: a stuck pot and a fresh go at it are part of
  // potting the shed. Again, another shed and the menu start a new clock.
  // While paused (a hidden tab or window pauses, and the "Leave" boxes pause
  // under them) or away, it holds from heldAt; the last hold let go moves
  // the start on by the time held. The shed is hidden while paused, so a
  // pause is no free look with the clock held.
  var clockStart = null, clockStop = null, heldAt = 0, holds = {};
  function clockMs() {
    if (clockStart === null) return 0;
    var end = clockStop !== null ? clockStop : heldAt || Date.now();
    return Math.max(0, end - clockStart);
  }
  function holdClock(why) {
    if (!Object.keys(holds).length) heldAt = Date.now();
    holds[why] = true;
  }
  function releaseClock(why) {
    if (!holds[why]) return;
    delete holds[why];
    if (Object.keys(holds).length) return;
    if (heldAt && clockStart !== null && clockStop === null) clockStart += Date.now() - Math.max(heldAt, clockStart);
    heldAt = 0;
  }
  // 1:05 in the shed, 1:05.3 on the card and for the bests
  function mss(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function mssT(ms) { var t = Math.floor(ms / 100), s = Math.floor(t / 10); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2) + "." + t % 10; }

  // n: one of the thirty (null: the one chosen, or your own being played);
  // keep: Start over, the same go at the shed (the clock runs on)
  function startShed(n, keep) {
    if (n != null) { shed = n; dropOwn(); }
    if (!own) store.set("pottingshed_shed", String(shed));
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    L = parse(own ? null : shed); me = L.me; pots = L.pots.slice(); moves = 0; pushes = 0; history = []; tween = null; blooms = {}; wilts = {};
    pots.forEach(function (k) { if (L.sun[k]) blooms[k] = 1; });
    if (!keep) { clockStart = null; clockStop = null; }
    state = "play";
    $("menu").hidden = true; $("done").hidden = true; $("hud").hidden = false;
    layout(); hud();
  }
  // a shed of your own: played as the others are
  function startOwn(m) { own = m; startShed(null); }
  function dropOwn() {
    if (!own) return;
    own = null;
    // (a link's shed goes with it; `history` here is the shed's undo list)
    if (/[#&]play=/.test(location.hash)) try { window.history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  function hud() {
    $("hud-shed").textContent = own ? own.name : (shed + 1) + " · " + SHEDS[shed].name;
    $("hud-moves").textContent = moves;
    $("hud-moves-w").textContent = moves === 1 ? "move" : "moves";
    $("hud-pushes").textContent = pushes;
    $("hud-pushes-w").textContent = pushes === 1 ? "push" : "pushes";
    showClock();
  }
  var clockShown = "";
  function showClock() {
    var t = mss(clockMs());
    if (t !== clockShown) { clockShown = t; $("hud-time").textContent = t; }
  }

  // one step: dx, dy as -1 / 0 / 1
  function step(dx, dy) {
    if (state !== "play" || P.isPaused()) return;
    if (dx) facing = dx;
    // (the rule is engine.js's: a pot goes one cell, never into a bench or another pot)
    var r = Engine.move(L, me, pots, dx, dy);
    if (!r) { sfxBump(); return; }
    var to = r.me, pushed = r.pushed;
    if (pushed >= 0) {
      var beyond = r.to;
      history.push({ me: me, pots: pots.slice(), moves: moves, pushes: pushes });
      pots = r.pots; pushes++;
      // (its flower as it was: open in the sun, or still closing from the last push out)
      var open = L.sun[to] ? blooms[to] || 0 : wilts[to] || 0;
      delete blooms[to]; delete wilts[to];
      scrape();
      if (L.sun[beyond]) { sfxBloom(); blooms[beyond] = fx() ? 0.01 : 1; }
      // out of the sun: with Visual FX on the flower closes as the pot slides (off, it's gone at once)
      else if (open > 0 && fx()) wilts[beyond] = open;
    } else history.push({ me: me, pots: pots.slice(), moves: moves, pushes: pushes });
    // (the step slides with Visual FX off too: where the gardener and a pot go is play)
    tween = { from: me, pot: pushed >= 0 ? { i: pushed, from: to } : null, t: 0 };
    me = to; moves++;
    if (clockStart === null) clockStart = Date.now();
    if (pushed < 0) sfxStep();
    hud();
    if (solved()) finish();
  }
  function undo() {
    if (state !== "play" || P.isPaused() || !history.length) return;
    var h = history.pop(), was = pots;
    me = h.me; pots = h.pots; moves = h.moves; pushes = h.pushes; tween = null;
    // each pot's flower goes the way the pot went back: still open if it stays
    // in the sun, opening again back into it, closing out of it (at once with
    // Visual FX off)
    var nb = {}, nw = {}, on = fx();
    pots.forEach(function (k, i) {
      var w = was[i], open = L.sun[w] ? blooms[w] || 0 : wilts[w] || 0;
      if (L.sun[k]) nb[k] = !on ? 1 : L.sun[w] ? open || 1 : 0.01;
      else if (on && open > 0) nw[k] = open;
    });
    blooms = nb; wilts = nw;
    tone(240, 0.06, "triangle", 0.04);
    hud();
  }
  // The last pot in the sun: the moves are counted and the fewest kept there
  // and then, and nothing more can be done in the shed; the card comes once
  // the flower has opened (the loop below)
  function finish() {
    state = "blooming";
    plantedAt = performance.now();
    clockStop = Date.now();
    // (a shed of your own keeps no records)
    if (own) { potted = { own: true, t: clockMs() }; showClock(); return; }
    // the fewest moves and the fastest time are records of their own: a slow
    // go in fewer moves keeps its moves, a quick one in more keeps its time
    var t = clockMs(), b = bests[shed];
    var isBest = !b || moves < b.m || (moves === b.m && pushes < b.p), isFast = !b || b.t == null || t < b.t;
    if (isBest || isFast) {
      bests[shed] = { m: isBest ? moves : b.m, p: isBest ? pushes : b.p, t: isFast ? t : b.t };
      store.set("pottingshed_best", JSON.stringify(bests));
    }
    potted = { b: b, isBest: isBest, isFast: isFast, t: t };
    showClock();
  }
  function bloomed() {
    if (tween) return false;
    for (var k in blooms) if (blooms[k] < 1) return false;
    return true;
  }
  function showDone() {
    var b = potted.b, isBest = potted.isBest;
    state = "done";
    doneAt = performance.now();
    setTimeout(sfxDone, 120);
    var last = !!own || shed + 1 >= SHEDS.length;
    $("done-title").textContent = last && !own ? "Every shed is potted" : "Potted!";
    $("done-msg").textContent = count(moves, "move", "moves");
    var time = document.createElement("span"), line = document.createElement("span"), bestsRow = document.createElement("span");
    time.className = "time";
    time.textContent = "in " + mssT(potted.t);
    line.textContent = count(pushes, "push", "pushes") + (own ? " · " + own.name + ", a shed of your own" : " · shed " + (shed + 1) + ", " + SHEDS[shed].name);
    bestsRow.className = "bests";
    var pill = function (text, record) { var s = document.createElement("span"); s.className = "best" + (record ? " record" : ""); s.textContent = text; bestsRow.appendChild(s); };
    if (own) pill("a shed of your own keeps no records", false);
    else if (!b) pill("first time through", false);
    else {
      pill(isBest ? "your fewest moves here yet" : "fewest: " + count(b.m, "move", "moves"), isBest);
      if (b.t == null) pill("first time on the clock", false);
      else pill(potted.isFast ? "your fastest here yet" : "fastest: " + mssT(b.t), potted.isFast);
    }
    $("done-stats").replaceChildren(time, line, bestsRow);
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
    // the pots (sliding as the gardener pushes) and the gardener, back to
    // front: a flower or a hat stands up into the cell above, so whatever is
    // lower down is drawn later, over it (by where each is drawn this frame,
    // mid-slide too; the gardener over a pot level with him)
    var tt = tween ? Math.min(1, tween.t) : 1, ease = 1 - Math.pow(1 - tt, 3), parts = [];
    pots.forEach(function (pk, i) {
      var x = cx(pk), y = cy(pk);
      if (tween && tween.pot && tween.pot.i === i) { x = cx(tween.pot.from) + (x - cx(tween.pot.from)) * ease; y = cy(tween.pot.from) + (y - cy(tween.pot.from)) * ease; }
      parts.push({ y: y, z: 0, i: i, k: pk, x: x, flower: L.sun[pk] ? blooms[pk] || 0 : wilts[pk] || 0 });
    });
    var mx = cx(me), my = cy(me);
    if (tween) { mx = cx(tween.from) + (mx - cx(tween.from)) * ease; my = cy(tween.from) + (my - cy(tween.from)) * ease; }
    parts.push({ y: my, z: 1, i: pots.length, x: mx, me: true });
    parts.sort(function (a, b) { return a.y - b.y || a.z - b.z || a.i - b.i; });
    drawn = parts.map(function (q) {
      if (q.me) drawGardener(q.x, q.y, s); else drawPot(q.x, q.y, s, q.flower);
      return q.me ? { me: true, y: q.y } : { pot: q.i, k: q.k, y: q.y, flower: q.flower };
    });
  }
  var drawn = [];   // what the last frame drew, in order (for the tests)
  // (the art is art.js's, shared with the shed editor)
  function drawBrick(x, y, s, k) { Art.brick(g, x, y, s, k, L.w); }
  function drawBench(x, y, s) { Art.bench(g, x, y, s); }
  function drawSun(x, y, s) { Art.sun(g, x, y, s); }
  // bloom: how far its flower is open (0 none, 1 full): opening in the sun, closing out of it
  function drawPot(x, y, s, bloom) { Art.pot(g, x, y, s, bloom); }
  function drawGardener(x, y, s) { Art.gardener(g, x, y, s, facing); }

  // ---- the loop, pause and the way out ------------------------------------------------------
  // (a hidden tab or window pauses, the clock held and the shed out of sight;
  // the pause card's Restart is Start over, the clock running on)
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    onChange: function (paused) { document.body.classList.toggle("paused", paused); if (paused) holdClock("pause"); else releaseClock("pause"); },
    restart: function () { startShed(null, true); },
    menu: toMenu
  }) : { isPaused: function () { return false; } };
  document.addEventListener("visibilitychange", function () { if (document.hidden) holdClock("away"); else if (document.hasFocus()) releaseClock("away"); });
  window.addEventListener("blur", function () { holdClock("away"); });
  window.addEventListener("focus", function () { releaseClock("away"); });
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
    // a flower out of the sun closes as fast as one opens (at once if Visual FX goes off)
    for (k in wilts) { wilts[k] -= fx() ? dt * 4 : 1; if (wilts[k] <= 0) delete wilts[k]; }
    if (state === "blooming" && bloomed() && performance.now() - plantedAt >= BLOOM_HOLD) showDone();
    if (state === "play") showClock();
    draw();
  }

  // ---- input ------------------------------------------------------------------------------------
  var DIRK = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1], A: [-1, 0], D: [1, 0], W: [0, -1], S: [0, 1] };
  // one press, one step: a key held down walks no further (its repeats are
  // swallowed), and Ctrl+Z held takes back one step; a press mid-slide steps
  // at once, the slide going on from where it was
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && state === "play") { e.preventDefault(); if (!e.repeat) undo(); } return; }
    if (state !== "play" || P.isPaused()) return;
    var d = DIRK[e.key];
    if (d) { e.preventDefault(); if (!e.repeat) step(d[0], d[1]); }
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
  $("btn-restart").addEventListener("click", function () { if (state === "play") startShed(null, true); });
  $("btn-sheds").addEventListener("click", function () {
    if (state === "blooming") return;   // (the card is on its way)
    if (window.GameShell && GameShell.askQuit && moves > 0) GameShell.askQuit({ title: "Leave this shed for the others?", ok: "Sheds" }, toMenu); else toMenu();
  });
  ["btn-undo", "btn-restart", "btn-sheds"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });

  // ---- the sheds: the list, the chosen one, and the done card -------------------------------------
  // Every shed is a tile in the list; one opens once the shed before it is
  // potted (the first from the start, and one potted stays open). A tile
  // goes straight in; the chosen shed (the one played last, or the next to
  // pot) is shown in small above Pot this shed, and the arrows walk the list
  // (the ring choosing as it goes), Enter going into the ringed one.
  var mini = $("pick-pic"), mg = mini.getContext("2d"), grid = $("shed-grid"), lockNote = $("lock-note"), noteT = 0;
  function paintMenu() {
    paintGrid();
    paintChosen();
    paintMine();
    var done = SHEDS.filter(function (_, i) { return bests[i]; }).length;
    $("tally").textContent = done ? done + " of " + SHEDS.length + " sheds potted" : "";
  }
  function paintGrid() {
    grid.replaceChildren();
    SHEDS.forEach(function (S, i) {
      var b = document.createElement("button"), open = isOpen(i);
      b.type = "button";
      b.className = "tile" + (open ? "" : " locked") + (bests[i] ? " potted" : "") + (i === shed ? " current" : "");
      b.textContent = i + 1;
      b.setAttribute("aria-label", "Shed " + (i + 1) + ", " + (open ? S.name + (bests[i] ? ", potted" : "") : "locked"));
      b.addEventListener("click", function () { if (isOpen(i)) startShed(i); else sayLocked(i, b); });
      grid.appendChild(b);
    });
  }
  function sayLocked(i, b) {
    lockNote.textContent = "🔒 Shed " + (i + 1) + " is locked. " + (isOpen(i - 1) ? "Pot shed " + i + " to open it." : "Pot the sheds before it first.");
    // (the tile shakes its head; with Visual FX off the line alone says it)
    if (b) { b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope"); }
    clearTimeout(noteT);
    noteT = setTimeout(function () { lockNote.textContent = ""; if (b) b.classList.remove("nope"); }, 2600);
  }
  function choose(n) {
    shed = n;
    dropOwn();
    store.set("pottingshed_shed", String(shed));
    Array.prototype.forEach.call(grid.children, function (t, i) { t.classList.toggle("current", i === shed); });
    paintChosen();
  }
  function paintChosen() {
    var Lm = parse(own ? null : shed);
    if (own) {
      $("pick-name").textContent = own.name;
      $("pick-note").textContent = "a shed of your own · " + count(Lm.pots.length, "pot", "pots");
      $("pick-best").textContent = "it keeps no records";
      $("play").firstChild.textContent = "Pot this shed ";
    } else {
      var S = SHEDS[shed], b = bests[shed];
      $("pick-name").textContent = S.name;
      $("pick-note").textContent = "shed " + (shed + 1) + " of " + SHEDS.length + " · " + count(Lm.pots.length, "pot", "pots");
      $("pick-best").textContent = b ? "fewest moves: " + b.m + " (" + count(b.p, "push", "pushes") + ")" + (b.t != null ? " · fastest " + mssT(b.t) : "") : "not potted yet";
      $("play").firstChild.textContent = b ? "Pot it again " : "Pot this shed ";
    }
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
  }
  // the ring on an open shed chooses it; on a locked one the line says why
  new MutationObserver(function () {
    var t = grid.querySelector(".tile[data-gs-pick]"), i = Array.prototype.indexOf.call(grid.children, t);
    if (i < 0) return;
    if (isOpen(i)) { if (i !== shed) choose(i); } else sayLocked(i, null);
  }).observe(grid, { subtree: true, attributes: true, attributeFilter: ["data-gs-pick"] });
  $("play").addEventListener("click", function () { startShed(own ? null : shed); });
  $("next").addEventListener("click", function () { startShed(Math.min(SHEDS.length - 1, shed + 1)); });
  $("replay").addEventListener("click", function () { startShed(null); });
  $("to-sheds").addEventListener("click", toMenu);

  // ---- sheds of your own ----------------------------------------------------------------------
  // The editor's saved sheds (localStorage pottingshed_mine) are "My sheds" on
  // the menu, a tile each going straight in. A "#play=<code>" link (the
  // editor's Play and share link) is the chosen shed on the menu, Pot this
  // shed (Space or Enter) going in, until one of the thirty is chosen.
  function mineList() {
    var a = [];
    try { a = JSON.parse(store.get("pottingshed_mine", "[]")) || []; } catch (e) { a = []; }
    var out = [];
    (Array.isArray(a) ? a : []).forEach(function (raw) { try { var m = Engine.clean(raw); if (!Engine.problems(m.map).length) out.push(m); } catch (e) {} });
    return out;
  }
  function paintMine() {
    var box = $("mine-list"), a = mineList();
    box.replaceChildren();
    $("mine").hidden = !a.length;
    a.forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tile mine-tile"; b.textContent = m.name;
      b.setAttribute("aria-label", m.name + ", a shed of your own");
      b.addEventListener("click", function () { startOwn(m); });
      box.appendChild(b);
    });
  }
  function readLink() {
    var m = /[#&]play=([^&]+)/.exec(location.hash || "");
    if (!m) return;
    try {
      var sh = Engine.decode(m[1]), errs = Engine.problems(sh.map);
      if (errs.length) throw new Error(errs[0].charAt(0).toUpperCase() + errs[0].slice(1) + ".");
      own = sh;
    } catch (err) {
      if (window.GameShell && GameShell.alert) GameShell.alert({ title: "That shed won't open", text: String(err && err.message || err) });
    }
  }
  readLink();
  // (a link pasted over this page changes only its hash: taken up on the menu)
  window.addEventListener("hashchange", function () { if (state === "menu") { readLink(); paintMenu(); } });

  if (window.GameShell && GameShell.gridKeys) {
    // the list: the arrows ring a shed (from the chosen one), Enter goes into
    // it; on down into My sheds
    GameShell.gridKeys({ active: function () { return state === "menu"; }, sel: "#shed-grid .tile, #mine-list .tile",
      first: function () { return grid.querySelector(".tile.current"); } });
    $("sheds-k").insertAdjacentHTML("beforeend", GameShell.gridKeys.hint());
  }
  if (window.GameShell && GameShell.menuKeys) {
    // the chosen shed: Space or Enter goes in; L the shed editor
    GameShell.menuKeys({ active: function () { return state === "menu"; }, groups: [{ sel: "#to-editor", keys: ["l"] }], start: "#play", space: true });
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
    name: function (n) { return SHEDS[n == null ? shed : n].name; },
    isOpen: isOpen,
    blooms: function () { return Object.keys(blooms).length; },
    bloomed: bloomed,
    tweening: function () { return !!tween; },
    step: step,
    undo: undo,
    start: startShed,
    toMenu: toMenu,
    best: function (n) { return bests[n == null ? shed : n] || null; },
    clock: clockMs,
    pause: function (on) { if (on) P.pause(); else P.resume(); },
    // what the last frame drew, back to front: { pot, k, y, flower } and { me, y }
    drawn: function () { return drawn.slice(); },
    flowers: function () { return pots.map(function (k) { return { k: k, sun: L.sun[k], bloom: blooms[k] || 0, wilt: wilts[k] || 0 }; }); },
    // set the shed up as a test needs it: the gardener and the pots (in the
    // sun, open)
    put: function (at, ps) { me = at; pots = ps.slice(); tween = null; wilts = {}; blooms = {}; pots.forEach(function (k) { if (L.sun[k]) blooms[k] = 1; }); },
    // a shed of your own: the one chosen or played (null for none), playing one, My sheds
    own: function () { return own; },
    startOwn: function (m) { startOwn(Engine.clean(m)); },
    mine: mineList
  };
})();
