/* Slither — classic grid snake with twists (teleport portals, scattered
   obstacles, local 2-player), plus the Labyrinth campaign, which lives in
   labyrinth.js / labyrinth-engine.js / levels.js and runs on this page's
   shell: menu, overlays, input routing and sound. No assets; canvas +
   synthesized SFX. Muting is handled globally by the shared top-right
   toggle (mute-toggle.js). */
(function () {
  "use strict";

  var COLS = 22, ROWS = 22, CELL = 20;
  var W = COLS * CELL, H = ROWS * CELL;
  var BASE_INTERVAL = 150, MIN_INTERVAL = 72, SPEED_STEP = 3;
  var OBSTACLE_COUNTS = { none: 0, light: 10, heavy: 22 };
  var BEST_KEY = "snake_best";
  var PORTAL_COLORS = ["#ff8c2b", "#a25cff"]; // orange, purple — each pair shares one color in/out
  var PORTAL_PAIR_COUNT = 2;

  var UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 }, LEFT = { x: -1, y: 0 }, RIGHT = { x: 1, y: 0 };
  var DIR_BY_NAME = { up: UP, down: DOWN, left: LEFT, right: RIGHT };

  function key(p) { return p.x + "," + p.y; }
  function samePos(a, b) { return !!a && !!b && a.x === b.x && a.y === b.y; }
  function isOpposite(a, b) { return a.x === -b.x && a.y === -b.y; }

  // ---- DOM refs ----------------------------------------------------------
  var gameArea = document.getElementById("game-area");
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var scoreLabel = document.getElementById("score-label");
  var bestLabel = document.getElementById("best-label");
  var matchLabel = document.getElementById("match-label");
  var dpadP2 = document.getElementById("dpad-p2");

  var menuOverlay = document.getElementById("menu");
  var pauseOverlay = document.getElementById("pause");
  var resultOverlay = document.getElementById("result");
  var resultTitle = document.getElementById("result-title");
  var resultMsg = document.getElementById("result-msg");
  var resultPrimary = document.getElementById("result-primary");
  var keysHelp = document.getElementById("keys-help");
  var pauseBtn = document.getElementById("pause-btn");
  // P or Esc pauses in every mode, as in the site's other games. Classic and
  // 2-Player also keep Space; the Labyrinth's blast arenas use Space for
  // Fire Eggs, so the label names the keys that always work.
  function k(t) { return '<kbd class="gs-kbd">' + t + "</kbd>"; }   // keycap (style: ../motion-toggle.js)
  function pauseLabel(paused, inLab) {
    pauseBtn.innerHTML = (paused ? "▶ Resume " : "⏸ Pause ") + '<span class="gs-keys">' + k("P") + "/" + k("Esc") + "</span>";
    pauseBtn.title = (paused ? "Resume" : "Pause") + " (P / Esc" + (inLab ? "" : " / Space") + ")";
    pauseBtn.setAttribute("aria-keyshortcuts", inLab ? "P Escape" : "P Escape Space");
  }
  var playBtn = document.getElementById("play-btn");
  var twistsGroup = document.getElementById("twists-group");
  var labOpts = document.getElementById("lab-opts");
  var labLevels = document.getElementById("lab-levels");
  var labHud = document.getElementById("lab-hud");
  var labBtns = document.getElementById("lab-btns");
  var legendClassic = document.getElementById("legend-classic");
  var legendLab = document.getElementById("legend-lab");

  // Labyrinth levels come in different sizes, so the board is resized per
  // level. Setting canvas.width resets the context, so the DPR transform
  // has to be reapplied every time.
  function resizeBoard(pxW, pxH, cssWidth) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(pxW * dpr);
    canvas.height = Math.round(pxH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.width = cssWidth;
  }
  resizeBoard(W, H, "min(94vw, 440px)");

  // ---- sound (synthesized, routed through the shared mute shim) ---------
  var actx = null;
  function audio() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  // Browsers only let audio start from a user gesture, and tick() runs from
  // requestAnimationFrame — so create/resume the context on any gesture, or
  // Safari/iOS leaves it suspended for good.
  ["pointerdown", "pointerup", "touchend", "keydown", "click"].forEach(function (type) {
    document.addEventListener(type, function () { audio(); }, true);
  });
  // `delay` schedules on the audio clock, so multi-part sounds stay in step.
  function tone(freq, dur, type, gain, slideTo, delay) {
    var ac = audio();
    if (!ac) return;
    var t = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  var noiseBuf = null;
  function noise(dur, gain, filterType, freq, freqTo) {
    var ac = audio();
    if (!ac) return;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    var t = ac.currentTime;
    var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  // Crash sounds keep their energy above ~200 Hz, where small laptop/phone
  // speakers can actually reproduce it; a sub-200 Hz crash loses most of its
  // punch on them.
  var SFX = {
    eat: function () { tone(660, 0.09, "triangle", 0.14); },
    // Fires on every turn, up to ~14/s at top speed — short, and a notch quieter than eat.
    turn: function (player) { var f = player ? 440 : 560; tone(f, 0.05, "square", 0.05, f * 0.75); },
    // Enter and exit land on the same tick: swoop down into one end, back up out of the other.
    portal: function () {
      tone(1100, 0.12, "triangle", 0.14, 220);
      tone(220, 0.16, "triangle", 0.14, 1100, 0.1);
    },
    // Walls and obstacles: a hard thud.
    wall: function () {
      tone(220, 0.25, "square", 0.12, 80);
      noise(0.12, 0.3, "lowpass", 1800);
    },
    // Own body, the other snake, or a head-on: a crunch.
    body: function () {
      noise(0.3, 0.32, "bandpass", 2600, 400);
      tone(330, 0.28, "sawtooth", 0.1, 90);
    },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.2, "triangle", 0.12); }, i * 100); }); },
  };

  // ---- persisted best -----------------------------------------------------
  function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {} }

  // ---- game state ---------------------------------------------------------
  var G = {
    mode: "solo",
    twistPortals: false,
    obstacleLevel: "none",
    matchFormat: "2",
    running: false,
    paused: false,
    pendingEnd: false,
    pendingEndAt: 0,
    interval: BASE_INTERVAL,
    acc: 0,
    lastTime: 0,
    snakes: [],
    obstacles: [],
    obstacleKeys: null,
    portals: [],
    portalEvents: 0,
    food: null,
    best: loadBest(),
    runBest: 0,          // the best as this run began, for "New Best!"
    matchWins: [0, 0],
  };

  var loopToken = 0;

  // ---- board helpers --------------------------------------------------------
  function makeSnakeBody(hx, hy, dir, len) {
    var body = [];
    for (var i = 0; i < len; i++) body.push({ x: hx - dir.x * i, y: hy - dir.y * i });
    return body;
  }

  function spawnConfig(mode) {
    var midY = Math.floor(ROWS / 2);
    if (mode === "two") {
      return [
        { x: 5, y: midY - 4, dir: RIGHT, color: "p1", name: "P1" },
        { x: COLS - 6, y: midY + 4, dir: LEFT, color: "p2", name: "P2" },
      ];
    }
    return [{ x: 6, y: midY, dir: RIGHT, color: "p1", name: "You" }];
  }

  function emptyCells() {
    var occ = {};
    G.obstacles.forEach(function (o) { occ[key(o)] = true; });
    G.snakes.forEach(function (s) { if (s.alive) s.body.forEach(function (seg) { occ[key(seg)] = true; }); });
    G.portals.forEach(function (pr) { occ[key(pr.a)] = true; occ[key(pr.b)] = true; });
    if (G.food) occ[key(G.food)] = true;
    var cells = [];
    for (var x = 0; x < COLS; x++) for (var y = 0; y < ROWS; y++) { var k = x + "," + y; if (!occ[k]) cells.push({ x: x, y: y }); }
    return cells;
  }

  function generateObstacles(initialSnakes, count) {
    if (!count) return [];
    var forbidden = {};
    initialSnakes.forEach(function (s) {
      s.body.forEach(function (seg) {
        for (var dx = -4; dx <= 4; dx++) {
          for (var dy = -4; dy <= 4; dy++) {
            if (Math.abs(dx) + Math.abs(dy) > 4) continue;
            var x = seg.x + dx, y = seg.y + dy;
            if (x >= 0 && x < COLS && y >= 0 && y < ROWS) forbidden[x + "," + y] = true;
          }
        }
      });
    });
    var candidates = [];
    for (var x = 0; x < COLS; x++) for (var y = 0; y < ROWS; y++) { var k = x + "," + y; if (!forbidden[k]) candidates.push({ x: x, y: y }); }
    for (var i = candidates.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp; }
    return candidates.slice(0, Math.min(count, candidates.length));
  }

  function spawnFood() {
    var cells = emptyCells();
    if (!cells.length) { G.food = null; return; }
    G.food = cells[Math.floor(Math.random() * cells.length)];
  }

  function spawnPortals() {
    if (!G.twistPortals) { G.portals = []; return; }
    var savedPortals = G.portals;
    G.portals = []; // don't self-occlude while sampling
    var cells = emptyCells();
    G.portals = savedPortals;
    if (cells.length < 2) { G.portals = []; return; }
    var used = {};
    var pairs = [];
    for (var pIdx = 0; pIdx < PORTAL_PAIR_COUNT; pIdx++) {
      var avail = cells.filter(function (c) { return !used[key(c)]; });
      if (avail.length < 2) break;
      var best = null, bestDist = -1;
      for (var attempt = 0; attempt < 40; attempt++) {
        var a = avail[Math.floor(Math.random() * avail.length)];
        var b = avail[Math.floor(Math.random() * avail.length)];
        if (samePos(a, b)) continue;
        var dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (dist > bestDist) { best = { a: a, b: b }; bestDist = dist; }
        if (dist >= 6) break;
      }
      if (!best) break;
      used[key(best.a)] = true;
      used[key(best.b)] = true;
      pairs.push({ a: best.a, b: best.b, color: PORTAL_COLORS[pIdx % PORTAL_COLORS.length] });
    }
    G.portals = pairs;
  }

  // ---- round lifecycle ------------------------------------------------------
  function startRound() {
    menuOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    resultOverlay.classList.add("hidden");
    gameArea.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:0.6rem;width:100%;";
    setModeChrome();
    resizeBoard(W, H, "min(94vw, 440px)");

    var cfg = spawnConfig(G.mode);
    G.snakes = cfg.map(function (c) {
      return { body: makeSnakeBody(c.x, c.y, c.dir, 3), dir: c.dir, queuedDir: null, alive: true, score: 0, color: c.color, name: c.name };
    });
    G.obstacles = generateObstacles(G.snakes, OBSTACLE_COUNTS[G.obstacleLevel] || 0);
    G.obstacleKeys = {};
    G.obstacles.forEach(function (o) { G.obstacleKeys[key(o)] = true; });
    floorLayer = null; // repainted with this round's blocks
    G.food = null;
    G.portals = [];
    G.portalEvents = 0;
    spawnPortals();
    spawnFood();

    G.interval = BASE_INTERVAL;
    G.acc = 0;
    G.lastTime = 0;
    G.runBest = G.best;
    G.pendingEnd = false;
    G.running = true;
    G.paused = false;
    pauseLabel(false, false);

    updateHud();
    beginLoop();
  }

  function startMatch() { G.matchWins = [0, 0]; startRound(); }

  function resetToMenu() {
    G.running = false;
    G.paused = false;
    G.pendingEnd = false;
    loopToken++;
    if (lab) lab.stop();
    gameArea.style.display = "none";
    pauseOverlay.classList.add("hidden");
    resultOverlay.classList.add("hidden");
    menuOverlay.classList.remove("hidden");
    refreshLabMenu();
  }

  // Which HUD pieces and touch controls the current mode shows.
  function setModeChrome() {
    var isLab = G.mode === "lab";
    dpadP2.style.display = G.mode === "two" ? "" : "none";
    labHud.style.display = isLab ? "" : "none";
    labBtns.style.display = isLab ? "" : "none";
    [scoreLabel, bestLabel, matchLabel].forEach(function (el) { el.style.display = isLab ? "none" : ""; });
  }

  // ---- Labyrinth host ------------------------------------------------------
  // Everything the Labyrinth module needs from this page, in one place.
  var lab = window.SlitherLabyrinth ? window.SlitherLabyrinth({
    canvas: canvas,
    ctx: ctx,
    tone: tone,
    noise: noise,
    audio: audio,
    SFX: SFX,
    showBoard: function (pxW, pxH, maxCssW) {
      menuOverlay.classList.add("hidden");
      pauseOverlay.classList.add("hidden");
      resultOverlay.classList.add("hidden");
      gameArea.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:0.6rem;width:100%;";
      setModeChrome();
      // Fit the width, and keep tall levels from pushing the d-pad off-screen.
      var cssWidth = "min(94vw, " + maxCssW + "px, calc(66vh * " + (pxW / pxH).toFixed(4) + "))";
      resizeBoard(pxW, pxH, cssWidth);
      labHud.style.width = cssWidth;
      pauseLabel(false, true);
    },
    setPaused: function (paused) {
      pauseOverlay.classList.toggle("hidden", !paused);
      pauseLabel(paused, true);
    },
    showResult: function (opts) { showResult(opts); },
    clickResult: function () { if (!resultOverlay.classList.contains("hidden")) resultPrimary.click(); },
    toMenu: function () { resetToMenu(); },
    // A two-player arena needs player 2's d-pad on touch screens; the hold
    // buttons (ghost / dash, P1 only, and arenas have no ghost apples) make way.
    showP2Pad: function (show) {
      dpadP2.style.display = show ? "" : "none";
      labBtns.style.display = show || G.mode !== "lab" ? "none" : "";
    },
  }) : null;

  function refreshLabMenu() {
    var isLab = G.mode === "lab" && !!lab;
    twistsGroup.style.display = isLab ? "none" : "";
    labOpts.style.display = isLab ? "" : "none";
    legendClassic.style.display = isLab ? "none" : "";
    legendLab.style.display = isLab ? "" : "none";
    if (isLab) lab.buildLevelGrid(labLevels);
    playBtn.textContent = isLab ? "Play Level " + (lab.continueIndex() + 1) : "Play";
  }

  // ---- input ----------------------------------------------------------------
  function setQueuedDir(playerIdx, dir) {
    // Every Classic steer (keys, d-pad, swipe, gamepad) comes through here: a
    // paused game takes none, or the turn would fire on resume
    if (G.paused || !G.running) return;
    var s = G.snakes[playerIdx];
    if (!s || !s.alive) return;
    if (s.body.length > 1 && isOpposite(dir, s.dir)) return;
    s.queuedDir = dir;
  }

  // The d-pads and swipe steer through here, so the Labyrinth gets them too.
  function steer(playerIdx, dir) {
    if (G.mode === "lab") { if (lab) lab.steer(dir, playerIdx); return; }
    setQueuedDir(playerIdx, dir);
  }
  // Letting go of a direction (the Labyrinth sprints while one is held).
  function unsteer(playerIdx, dir) {
    if (G.mode === "lab" && lab) lab.unsteer(dir, playerIdx);
  }

  document.addEventListener("keydown", function (e) {
    if (gameArea.style.display === "none") return; // menu open, ignore
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    // Enter takes the result card's main action (Play Again / Next Round / Retry).
    if (e.key === "Enter" && !resultOverlay.classList.contains("hidden")) { resultPrimary.click(); e.preventDefault(); return; }
    // Backspace takes it back to the main menu, in every mode; Esc there is
    // left to ../motion-toggle.js, which takes it to the games page.
    if (e.key === "Backspace" && !resultOverlay.classList.contains("hidden")) { resetToMenu(); e.preventDefault(); return; }
    if (G.mode === "lab") { if (lab) lab.keydown(e); return; }
    var k = e.key;
    // Esc is claimed only when it pauses or resumes (not on the result card,
    // or while a crash plays out), so otherwise it leaves for the games page
    // (a held key pauses once: its repeats don't toggle it back)
    if (k === " " || k === "Spacebar" || k === "Escape" || k === "p" || k === "P") { if ((!e.repeat && togglePause()) || k !== "Escape") e.preventDefault(); return; }
    var arrowMap = { ArrowUp: UP, ArrowDown: DOWN, ArrowLeft: LEFT, ArrowRight: RIGHT };
    var wasdMap = { w: UP, a: LEFT, s: DOWN, d: RIGHT, W: UP, A: LEFT, S: DOWN, D: RIGHT };
    if (arrowMap[k]) { setQueuedDir(G.mode === "two" ? 1 : 0, arrowMap[k]); e.preventDefault(); }
    else if (wasdMap[k]) { setQueuedDir(0, wasdMap[k]); e.preventDefault(); }
  });
  document.addEventListener("keyup", function (e) {
    if (G.mode === "lab" && lab) lab.keyup(e);
  });

  // Fire on pointerdown rather than click: a tap registers on touch-down, which
  // matters at speed. preventDefault suppresses the synthetic click that would
  // otherwise turn the snake a second time.
  Array.prototype.forEach.call(document.querySelectorAll(".dbtn"), function (btn) {
    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      // preventDefault suppresses :active on several mobile browsers, so drive
      // the pressed look from a class instead (cleared on the window handlers).
      btn.classList.add("held");
      steer(Number(btn.dataset.player), DIR_BY_NAME[btn.dataset.dir]);
    });
  });

  function clearHeldBtns() {
    Array.prototype.forEach.call(document.querySelectorAll(".dbtn.held"), function (b) {
      b.classList.remove("held");
      unsteer(Number(b.dataset.player), DIR_BY_NAME[b.dataset.dir]);
    });
  }
  window.addEventListener("pointerup", clearHeldBtns);
  window.addEventListener("pointercancel", clearHeldBtns);

  // Swipe anywhere on the board to turn — the natural touch idiom, and it beats
  // reaching for the d-pad. Solo only: with two snakes on one board there is no
  // way to tell whose swipe it is, so 2-player stays on the d-pads.
  (function wireSwipe() {
    var SWIPE_MIN = 24;                 // px before a drag counts as a swipe
    var sx = 0, sy = 0, tracking = false, swiped = null;
    canvas.addEventListener("pointerdown", function (e) {
      if (G.mode === "two") return;
      if (e.pointerType === "mouse") return;   // don't turn on a desktop click-drag
      tracking = true; sx = e.clientX; sy = e.clientY;
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!tracking) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
      swiped = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP);
      steer(0, swiped);   // keep the finger down after a swipe to sprint
      // Re-anchor instead of stopping, so one continuous drag can chain turns.
      sx = e.clientX; sy = e.clientY;
    });
    function stop() { tracking = false; if (swiped) { unsteer(0, swiped); swiped = null; } }
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  })();

  // ---- gamepads ----------------------------------------------------------
  // Pad 1 steers P1 and pad 2 steers P2 (d-pad or left stick). A stick is
  // held all the time, so holding it never sprints; a quick double flick
  // does, until the stick returns to centre. In the Labyrinth: A dashes, B
  // ghosts (in Fire Eggs, A lays an egg). Start pauses, or takes the result
  // card's main action, or starts from the menu.
  (function wirePads() {
    if (!navigator.getGamepads) return;
    var prev = [{ dir: null, btn: {} }, { dir: null, btn: {} }], polling = false;
    function pressed(gp, i) { var b = gp.buttons[i]; return !!b && (b.pressed || b.value > 0.5); }
    // The stick engages past 0.6 and lets go under 0.35, so a wobble near
    // the edge can't read as a double flick.
    function padDir(gp, was) {
      var x = gp.axes[0] || 0, y = gp.axes[1] || 0;
      if (pressed(gp, 12)) return UP;
      if (pressed(gp, 13)) return DOWN;
      if (pressed(gp, 14)) return LEFT;
      if (pressed(gp, 15)) return RIGHT;
      var m = Math.max(Math.abs(x), Math.abs(y));
      if (m < (was ? 0.35 : 0.6)) return null;
      return Math.abs(x) > Math.abs(y) ? (x > 0 ? RIGHT : LEFT) : (y > 0 ? DOWN : UP);
    }
    function edge(p, gp, i) { var on = pressed(gp, i), was = !!prev[p].btn[i]; prev[p].btn[i] = on; return on && !was ? 1 : !on && was ? -1 : 0; }
    function poll() {
      var pads = navigator.getGamepads(), any = false;
      for (var p = 0; p < 2; p++) {
        var gp = pads[p];
        if (!gp) continue;
        any = true;
        var playing = gameArea.style.display !== "none";
        var d = padDir(gp, prev[p].dir);
        if (d !== prev[p].dir) {
          if (prev[p].dir) unsteer(p, prev[p].dir);
          if (d && playing && (p === 0 || G.mode === "two" || G.mode === "lab")) {
            if (G.mode === "lab" && lab) lab.padSteer(d, p); else steer(p, d);
          }
          prev[p].dir = d;
        }
        var start = edge(p, gp, 9), a = edge(p, gp, 0), b = edge(p, gp, 1);
        if (start === 1 || (a === 1 && !resultOverlay.classList.contains("hidden"))) {
          if (!resultOverlay.classList.contains("hidden")) resultPrimary.click();
          else if (!menuOverlay.classList.contains("hidden")) playBtn.click();
          else if (start === 1) togglePause();
          continue;
        }
        // Fire Eggs: A lays an egg, for either pad's player
        if (G.mode === "lab" && lab && a === 1 && lab.padLay(p)) continue;
        if (G.mode === "lab" && lab && p === 0) {
          if (a) lab.padHold("dashPad", a === 1);
          if (b) lab.padHold("ghostPad", b === 1);
        }
      }
      if (any) requestAnimationFrame(poll); else polling = false;
    }
    window.addEventListener("gamepadconnected", function () { if (!polling) { polling = true; requestAnimationFrame(poll); } });
  })();

  // ---- pause / menu buttons ---------------------------------------------
  // (true when it paused or resumed: the keys claim Esc only then)
  function togglePause() {
    if (G.mode === "lab") return lab ? lab.togglePause() : false;
    if (!G.running || G.pendingEnd) return false;
    G.paused = !G.paused;
    pauseOverlay.classList.toggle("hidden", !G.paused);
    pauseLabel(G.paused, false);
    return true;
  }

  // Switching tabs used to leave the snake crawling into a wall off-screen.
  // Pause only — coming back must not un-pause a deliberate pause.
  if (window.GameShell) {
    GameShell.onAutoPause(function () {
      if (G.mode === "lab") { if (lab) lab.autoPause(); return; }
      if (G.running && !G.pendingEnd && !G.paused) togglePause();
    });
  }

  // Leaving the page asks first while a game is in progress: a Classic run
  // once it has scored (until the crash), a two-player match once anyone has
  // scored, until someone has won it (between rounds too), and in the
  // Labyrinth whatever labyrinth.js says (a pack run is saved, so never).
  // The game is paused underneath with its own pause.
  function matchWon() {
    var need = G.matchFormat === "inf" ? Infinity : Number(G.matchFormat);
    return G.matchWins[0] >= need || G.matchWins[1] >= need;
  }
  if (window.GameShell) GameShell.guardLeave({
    active: function () {
      if (G.mode === "lab") return !!lab && lab.inProgress();
      var scored = G.snakes.some(function (s) { return s.score > 0; });
      if (G.mode === "solo") return G.running && !G.pendingEnd && scored;
      if (matchWon()) return false;
      if (G.running) return scored || G.matchWins[0] + G.matchWins[1] > 0;
      return !resultOverlay.classList.contains("hidden") && G.matchWins[0] + G.matchWins[1] > 0;
    },
    isPaused: function () { return G.mode === "lab" ? !!lab && lab.isPaused() : G.paused; },
    pause: function () {
      if (G.mode === "lab") { if (lab && !lab.isPaused()) lab.togglePause(); }
      else if (!G.paused) togglePause();
    },
    resume: function () {
      if (G.mode === "lab") { if (lab && lab.isPaused()) lab.togglePause(); }
      else if (G.paused) togglePause();
    }
  });

  document.getElementById("menu-btn").addEventListener("click", resetToMenu);
  document.getElementById("pause-btn").addEventListener("click", togglePause);
  document.getElementById("pause-resume").addEventListener("click", function () {
    if (G.mode === "lab") { if (lab && lab.isPaused()) lab.togglePause(); return; }
    if (G.paused) togglePause();
  });
  document.getElementById("pause-restart").addEventListener("click", function () {
    if (G.mode === "lab") { if (lab) lab.restart(); return; }
    startRound();
  });
  document.getElementById("pause-menu").addEventListener("click", resetToMenu);
  document.getElementById("result-menu").addEventListener("click", resetToMenu);

  // ---- menu wiring --------------------------------------------------------
  function exclusiveSelect(container, selector, onPick) {
    Array.prototype.forEach.call(container.querySelectorAll(selector), function (btn) {
      btn.addEventListener("click", function () {
        Array.prototype.forEach.call(container.querySelectorAll(selector), function (b) { b.classList.remove("sel"); });
        btn.classList.add("sel");
        onPick(btn);
      });
    });
  }

  // The keys, or on a touch-only device (no keyboard) the touch controls
  // that do the same (.gs-keys / .gs-touch: ../motion-toggle.js)
  function keysOr(keys, touch) { return '<span class="gs-keys">' + keys + '</span><span class="gs-touch">' + touch + "</span>"; }
  function updateKeysHelp() {
    var wasd = k("W") + k("A") + k("S") + k("D");
    var arrows = k("↑") + k("←") + k("↓") + k("→");   // same order as W A S D
    keysHelp.innerHTML = G.mode === "two"
      ? keysOr("P1: " + wasd + " (green) · P2: " + arrows + " (blue) · " + k("P") + "/" + k("Esc") + "/" + k("Space") + ": Pause · touch: use the d-pads",
        "P1 (green) and P2 (blue) steer with their d-pads · ⏸ Pause to pause")
      : G.mode === "lab"
        ? keysOr("Move: " + arrows + " / " + wasd + " (hold or double-tap to sprint) · " + k("Shift") + ": dash · " + k("G") + " or right-click: ghost · click a cell: teleport · click a 🖱 switch (or " + k("1") + "/" + k("2") + "/" + k("3") + ") · " + k("R") + ": retry · " + k("M") + ": music · " + k("P") + "/" + k("Esc") + ": pause · Arena for two: P1 " + wasd + ", P2 " + arrows + " · gamepad: stick or d-pad, A dash, B ghost, Start pause · touch: swipe (keep holding to sprint), tap to teleport or flip, hold 👻 / ⚡",
          "Swipe or use the d-pad (keep holding to sprint) · hold 👻 to ghost, ⚡ to dash · tap a cell to teleport, or a 🖱 switch to flip it · ⏸ Pause to pause · Arena for two: a d-pad each · gamepad: stick or d-pad, A dash, B ghost, Start pause")
        : keysOr("Move: " + arrows + " or " + wasd + " · " + k("P") + "/" + k("Esc") + "/" + k("Space") + ": Pause · touch: swipe the board or use the d-pad",
          "Swipe the board or use the d-pad to steer · ⏸ Pause to pause");
  }

  var vsOpts = document.getElementById("vs-opts");
  exclusiveSelect(document.getElementById("mode-pick"), "[data-mode]", function (btn) {
    G.mode = btn.dataset.mode;
    vsOpts.style.display = G.mode === "two" ? "" : "none";
    refreshLabMenu();
    updateKeysHelp();
  });

  var portalsBtn = document.getElementById("portals-toggle");
  portalsBtn.addEventListener("click", function () {
    G.twistPortals = !G.twistPortals;
    portalsBtn.textContent = "🌀 Portals: " + (G.twistPortals ? "On" : "Off");
    portalsBtn.classList.toggle("sel", G.twistPortals);
  });

  exclusiveSelect(document.getElementById("obstacles-pick"), "[data-obstacles]", function (btn) {
    G.obstacleLevel = btn.dataset.obstacles;
  });

  exclusiveSelect(document.getElementById("fmt-pick"), "[data-fmt]", function (btn) {
    G.matchFormat = btn.dataset.fmt;
  });

  playBtn.addEventListener("click", function () {
    if (G.mode === "lab") { if (lab) lab.start(lab.continueIndex()); return; }
    startMatch();
  });

  updateKeysHelp();

  // ---- simulation tick --------------------------------------------------
  function tick() {
    var n = G.snakes.length;
    var moves = new Array(n), portalTriggered = false;
    var turned = new Array(n).fill(false);

    for (var i = 0; i < n; i++) {
      var s = G.snakes[i];
      if (!s.alive) { moves[i] = null; continue; }
      if (s.queuedDir) {
        // Pressing the direction you're already heading is not a turn.
        if (s.queuedDir !== s.dir) turned[i] = true;
        s.dir = s.queuedDir;
        s.queuedDir = null;
      }
      moves[i] = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
    }

    if (G.portals.length) {
      for (var pi = 0; pi < n; pi++) {
        if (!moves[pi]) continue;
        for (var qi = 0; qi < G.portals.length; qi++) {
          var pr = G.portals[qi];
          if (samePos(moves[pi], pr.a)) { moves[pi] = { x: pr.b.x, y: pr.b.y }; portalTriggered = true; break; }
          else if (samePos(moves[pi], pr.b)) { moves[pi] = { x: pr.a.x, y: pr.a.y }; portalTriggered = true; break; }
        }
      }
    }

    var ate = moves.map(function (nh) { return !!(nh && G.food && samePos(nh, G.food)); });

    function blockingCells(s, grew) {
      return grew ? s.body : s.body.slice(0, s.body.length - 1);
    }

    var dead = new Array(n).fill(false), hitWall = new Array(n).fill(false);
    for (var a = 0; a < n; a++) {
      var nh = moves[a];
      if (!nh) continue;
      if (nh.x < 0 || nh.x >= COLS || nh.y < 0 || nh.y >= ROWS) { dead[a] = true; hitWall[a] = true; continue; }
      if (G.obstacleKeys && G.obstacleKeys[key(nh)]) { dead[a] = true; hitWall[a] = true; continue; }
      for (var b = 0; b < n; b++) {
        var other = G.snakes[b];
        if (!other.alive) continue;
        var blocking = blockingCells(other, ate[b]);
        for (var c = 0; c < blocking.length; c++) { if (samePos(blocking[c], nh)) { dead[a] = true; break; } }
        if (dead[a]) break;
      }
    }
    for (var x = 0; x < n; x++) {
      for (var y = x + 1; y < n; y++) {
        if (!moves[x] || !moves[y]) continue;
        if (!G.snakes[x].alive || !G.snakes[y].alive) continue;
        if (samePos(moves[x], moves[y])) { dead[x] = true; dead[y] = true; }
        if (samePos(moves[x], G.snakes[y].body[0]) && samePos(moves[y], G.snakes[x].body[0])) { dead[x] = true; dead[y] = true; }
      }
    }

    var anyCrash = false, wallCrash = false, bodyCrash = false, foodClaimed = false;
    for (var k = 0; k < n; k++) {
      var sn = G.snakes[k];
      if (!sn.alive) continue;
      if (dead[k]) {
        sn.alive = false; anyCrash = true;
        if (hitWall[k]) wallCrash = true; else bodyCrash = true;
        continue; // no turn click on the tick you die — let the crash play clean
      }
      if (turned[k]) SFX.turn(k);
      sn.body.unshift(moves[k]);
      if (ate[k]) {
        sn.score++; foodClaimed = true;
        // the best is saved (and shown) the moment it's passed, not only at
        // the crash, so a run left by Restart or the menu still counts
        if (G.mode === "solo" && sn.score > G.best) { G.best = sn.score; saveBest(G.best); }
      }
      else sn.body.pop();
    }
    if (foodClaimed) { G.food = null; spawnFood(); SFX.eat(); G.interval = Math.max(MIN_INTERVAL, G.interval - SPEED_STEP); }
    if (wallCrash) SFX.wall();
    if (bodyCrash) SFX.body();

    if (portalTriggered) {
      G.portalEvents++;
      SFX.portal();
      if (G.portalEvents % 3 === 0) spawnPortals();
    }

    updateHud();

    var aliveCount = G.snakes.filter(function (s) { return s.alive; }).length;
    var shouldEnd = G.mode === "solo" ? aliveCount === 0 : aliveCount <= 1;
    if (shouldEnd && !G.pendingEnd) { G.pendingEnd = true; G.pendingEndAt = performance.now() + (anyCrash ? 500 : 0); }
  }

  // ---- round end / results ------------------------------------------------
  // opts.html: msg is markup (keycaps); the caller escapes whatever is dynamic in it.
  function showResult(opts) {
    resultTitle.textContent = opts.title;
    if (opts.html) resultMsg.innerHTML = opts.msg; else resultMsg.textContent = opts.msg;
    resultPrimary.textContent = opts.primaryLabel;
    resultPrimary.onclick = opts.primaryFn;
    resultOverlay.classList.remove("hidden");
  }

  function endRound() {
    G.running = false;
    if (G.mode === "solo") {
      var s = G.snakes[0];
      var isNewBest = s.score > G.runBest;
      updateHud();
      showResult({
        title: "Game Over 🐍",
        // (no best line while there's no best at all: a scoreless first run)
        msg: "Score: " + s.score + (isNewBest ? " — New Best! 🎉" : G.best ? "  ·  Best: " + G.best : ""),
        primaryLabel: "Play Again",
        primaryFn: function () { startRound(); },
      });
      return;
    }

    var alive = G.snakes.filter(function (s) { return s.alive; });
    var winnerIdx = -1;
    if (alive.length === 1) winnerIdx = G.snakes.indexOf(alive[0]);
    else if (G.snakes[0].score !== G.snakes[1].score) winnerIdx = G.snakes[0].score > G.snakes[1].score ? 0 : 1;

    if (winnerIdx >= 0) G.matchWins[winnerIdx]++;
    updateHud();
    var need = G.matchFormat === "inf" ? Infinity : Number(G.matchFormat);
    var matchOver = isFinite(need) && (G.matchWins[0] >= need || G.matchWins[1] >= need);

    if (matchOver) {
      var champ = G.matchWins[0] > G.matchWins[1] ? 0 : 1;
      SFX.win();
      showResult({
        title: G.snakes[champ].name + " wins the match! 🏆",
        msg: "Final score: " + G.matchWins[0] + " – " + G.matchWins[1],
        primaryLabel: "New Match",
        primaryFn: function () { startMatch(); },
      });
    } else {
      var roundMsg = winnerIdx >= 0 ? G.snakes[winnerIdx].name + " wins the round!" : "Draw — both crashed!";
      showResult({
        title: roundMsg,
        msg: "Match: " + G.matchWins[0] + " – " + G.matchWins[1] + (G.matchFormat === "inf" ? " (∞)" : " (first to " + G.matchFormat + ")"),
        primaryLabel: "Next Round",
        primaryFn: function () { startRound(); },
      });
    }
  }

  function updateHud() {
    if (G.mode === "solo") {
      scoreLabel.innerHTML = "Score: <b>" + G.snakes[0].score + "</b>";
      bestLabel.innerHTML = "Best: <b>" + G.best + "</b>";
      matchLabel.textContent = "";
    } else {
      scoreLabel.innerHTML = "<span class=\"p1-color\">P1 " + G.snakes[0].score + "</span> · <span class=\"p2-color\">P2 " + G.snakes[1].score + "</span>";
      bestLabel.textContent = "";
      matchLabel.textContent = "Match " + G.matchWins[0] + "–" + G.matchWins[1] + (G.matchFormat === "inf" ? " (∞)" : " (first to " + G.matchFormat + ")");
    }
  }

  // ---- render ---------------------------------------------------------------
  // Temple floor and fallen blocks are painted once per round into an
  // offscreen layer (temple-art.js); portals, the apple and the serpents are
  // drawn live on top. P1 is jade, P2 lapis.
  var Art = window.SlitherArt;
  var floorLayer = null;

  function buildFloor() {
    floorLayer = Art.makeLayer(W, H);
    var g = floorLayer.ctx, th = Art.THEMES.classic;
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var k = x + "," + y, seed = y * COLS + x;
        if (!G.obstacleKeys || !G.obstacleKeys[k]) { Art.floor(g, x * CELL, y * CELL, CELL, th, seed); continue; }
        var block = function (dx, dy) { return !!G.obstacleKeys[(x + dx) + "," + (y + dy)]; };
        Art.wall(g, x * CELL, y * CELL, CELL, th, seed, { n: !block(0, -1), s: !block(0, 1), w: !block(-1, 0), e: !block(1, 0) });
      }
    }
  }

  function drawSnake(s, idx, now, fx) {
    Art.serpent(ctx, s.body.map(function (seg) { return { x: seg.x * CELL + CELL / 2, y: seg.y * CELL + CELL / 2 }; }), {
      cell: CELL,
      pal: Art.SERPENTS[s.color === "p2" ? "lapis" : "jade"],
      alpha: s.alive ? 1 : 0.5,
      dir: s.dir,
      dead: !s.alive,   // turned to stone
      t: now, fx: fx, seed: idx,
    });
  }

  function render() {
    if (!floorLayer) buildFloor();
    var now = performance.now(), fx = !(window.RM_ON && window.RM_ON());
    ctx.drawImage(floorLayer.canvas, 0, 0, W, H);

    G.portals.forEach(function (pr) {
      [pr.a, pr.b].forEach(function (p) {
        var cx = p.x * CELL + CELL / 2, cy = p.y * CELL + CELL / 2;
        Art.portalFrame(ctx, cx, cy, CELL / 2 - 0.5);
        Art.portalGlow(ctx, cx, cy, CELL / 2 - 0.5, pr.color, now, fx);
      });
    });

    if (G.food) {
      var bob = fx ? Math.sin(now / 180) * 1.5 : 0;
      Art.fruit(ctx, G.food.x * CELL + CELL / 2, G.food.y * CELL + CELL / 2 + bob, CELL - 4, "🍎");
    }

    G.snakes.forEach(function (s, i) { drawSnake(s, i, now, fx); });
  }

  function beginLoop() {
    loopToken++;
    var token = loopToken;
    requestAnimationFrame(function (ts) { frame(ts, token); });
  }

  function frame(ts, token) {
    if (token !== loopToken) return;

    if (G.pendingEnd) {
      if (ts >= G.pendingEndAt) { G.pendingEnd = false; endRound(); }
    } else if (G.running && !G.paused) {
      if (!G.lastTime) G.lastTime = ts;
      G.acc += ts - G.lastTime;
      G.lastTime = ts;
      var guard = 0;
      while (G.running && !G.pendingEnd && G.acc >= G.interval && guard < 5) {
        G.acc -= G.interval;
        guard++;
        tick();
      }
    } else if (G.running && G.paused) {
      G.lastTime = ts;
    }

    render();

    if (G.running || G.pendingEnd) requestAnimationFrame(function (ts2) { frame(ts2, token); });
  }

  // A shared or play-tested level: "#play=<code>" (see levelcode.js).
  function playFromHash() {
    var m = /#play=(v1\.[A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m || !lab || !window.SlitherLevelCode) return;
    var level;
    try {
      level = window.SlitherLevelCode.decode(m[1]);
      var errs = window.SlitherEngine.parse(level).errors;
      if (errs.length) throw new Error(errs[0]);
    } catch (e) {
      var why = String(e.message || e);
      if (window.GameShell) GameShell.alert({ title: "That level link doesn't work", text: why });
      else alert("That level link doesn't work: " + why);
      return;
    }
    Array.prototype.forEach.call(document.querySelectorAll("#mode-pick [data-mode]"), function (b) { b.classList.toggle("sel", b.dataset.mode === "lab"); });
    // A link can arrive mid-game (the editor's ▶ reuses its tab): stop a
    // Classic or 2-Player round, or it plays on under the level
    G.running = false; G.paused = false; G.pendingEnd = false;
    loopToken++;
    G.mode = "lab";
    vsOpts.style.display = "none";
    refreshLabMenu();
    updateKeysHelp();
    lab.startCustom(level);
  }
  window.addEventListener("hashchange", playFromHash);
  playFromHash();

  render(); // static preview frame behind the menu
})();
