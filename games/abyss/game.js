/* =====================================================================
   Abyss: falling blocks in the bioluminous deep.

   A faithful modern engine under the water: 7-bag randomizer, SRS
   rotation with the full wall-kick tables, hold + five-piece preview,
   sonar ghost, DAS/ARR key repeat, 500ms lock delay with capped
   resets, the classic gravity curve, and four modes:

     descent    marathon: the score climbs, the depth gauge sinks
     sprint     clear 40 lines against the clock (best time wins)
     krill      Descent with 1-, 2- and 3-cell pieces in the bag too
     maelstrom  a plus-shaped board that turns (maelstrom.js)

   Two switches on the menu: Intense starts Descent much faster, and
   Maelstrom with all four arms open and a little faster; Juggle gives every
   open arm of Maelstrom a piece of its own at once.

   The board is 10x20 with two hidden rows above. Screen y grows
   downward, so the SRS kick tables (written y-up) are applied with
   their y negated.
   ===================================================================== */
(function () {
  "use strict";

  var A = window.AbyssArt;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  var bestTime = window.GameShell ? GameShell.best("abyss_best_sprint", { higher: false }) : null;
  // a best score for each way to play: Descent one per Intense setting,
  // Maelstrom one per Intense and Juggle setting
  var bests = {};
  function bestFor(key) {
    if (!window.GameShell || !key) return null;
    return bests[key] || (bests[key] = GameShell.best(key, { higher: true }));
  }
  function bestKey(m) {
    m = m || mode;
    if (m === "descent") return intense ? "abyss_best_descent_intense" : "abyss_best_descent";
    if (m === "krill") return "abyss_best_krill";
    if (m === "maelstrom") return "abyss_best_maelstrom" + (juggle ? "_juggle" : "") + (intense ? "_intense" : "");
    return null;
  }

  // ---- the rules ---------------------------------------------------------
  var COLS = 10, VIS = 20, HID = 2, ROWS = VIS + HID;
  var TYPES = "IJLOSTZPDVW";        // P D V W are Krill mode's small fry
  var BASE = {
    I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    P: { n: 1, c: [[0, 0]] },                              // a single speck
    D: { n: 2, c: [[0, 0], [1, 0]] },                      // the domino
    V: { n: 3, c: [[0, 1], [1, 1], [2, 1]] },              // three in a row
    W: { n: 2, c: [[0, 0], [0, 1], [1, 1]] }               // the corner
  };
  var ROT = {};
  TYPES.split("").forEach(function (t) {
    var n = BASE[t].n, cells = BASE[t].c, out = [];
    for (var r = 0; r < 4; r++) {
      out.push(cells.map(function (c) { return c.slice(); }));
      cells = cells.map(function (c) { return [n - 1 - c[1], c[0]]; });   // CW
    }
    ROT[t] = out;
  });
  // SRS kick tables, y-up as published
  var KJ = {
    "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };
  var KI = {
    "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  };
  var GRAV = [800, 717, 633, 550, 467, 383, 300, 217, 133, 100, 83, 83, 83, 67, 67, 67, 50, 50, 50, 33];
  var LINE_SCORE = [0, 100, 300, 500, 800];
  // (Maelstrom can clear more than four lines at once: 400 more for each)
  function lineScore(n) { return n <= 4 ? LINE_SCORE[n] : 800 + (n - 4) * 400; }
  // full lines dissolve for the same time with Visual FX on or off (a quicker
  // clear with it off would make every Sprint quicker)
  var CLEAR_S = 0.32;

  // ---- state ----------------------------------------------------------------
  var state = "menu";               // menu | play | clearing | over
  var MODES = ["descent", "sprint", "krill", "maelstrom"];
  var mode = store.get("abyss_mode", "descent");
  if (MODES.indexOf(mode) === -1) mode = "descent";
  // the two switches (settings, kept); Intense counts in Descent and
  // Maelstrom, Juggle in Maelstrom
  var intense = store.get("abyss_intense", "0") === "1", juggle = store.get("abyss_juggle", "0") === "1";
  var startLevel = 1;               // Intense starts deeper down the gravity curve
  var mael = null;                  // Maelstrom's board (maelstrom.js), made on its first dive
  var grid, piece, hold, canHold, queue, bag;
  var score, lines, level, b2b, playMs, goal = 40;
  var gravT, lockT, lockResets, grounded, lowY = 0;   // lowY: the lowest row this piece has reached
  var clearingRows = [], clearT = 0, sweep = 0;
  var das = { L: null, R: null }, softHeld = false, softT = 0;
  var particles = [], flashT = 0, gravOverride = 0;
  // Visual FX off has no bubbles or sweep, so two still sonar marks stand in
  // (draw-only, on their own timers; they never hold up play):
  //   dropMark  a hard drop's faint streak, start row down to where it landed
  //   clearMark pointers on both walls at the rows that just cleared
  var dropMark = null, clearMark = null;
  // Visual FX on: a hard drop leaves a trail of fading copies of the piece
  // down the rows it fell through, brightest where it lands
  var dropTrail = null, TRAIL_LIFE = 0.26;

  function newBag() {
    var b = (mode === "krill" ? TYPES : "IJLOSTZ").split("");
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }
  function refill() { while (queue.length < 7) { if (!bag.length) bag = newBag(); queue.push(bag.shift()); } }

  function cellsOf(t, r, x, y) {
    return ROT[t][r].map(function (c) { return [x + c[0], y + c[1]]; });
  }
  function fits(t, r, x, y) {
    var cs = ROT[t][r];
    for (var i = 0; i < cs.length; i++) {    // Krill pieces have 1-3 cells
      var gx = x + cs[i][0], gy = y + cs[i][1];
      if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
      if (gy >= 0 && grid[gy * COLS + gx]) return false;
    }
    return true;
  }
  function ghostY() {
    var y = piece.y;
    while (fits(piece.t, piece.r, piece.x, y + 1)) y++;
    return y;
  }

  // ---- moves --------------------------------------------------------------------
  function tryMove(dx) {
    if (state !== "play") return false;
    if (mode === "maelstrom") return mael.move(dx);
    if (fits(piece.t, piece.r, piece.x + dx, piece.y)) {
      piece.x += dx;
      onShift();
      return true;
    }
    return false;
  }
  function tryRotate(dir) {
    if (state !== "play") return false;
    if (mode === "maelstrom") {
      var kick = mael.rotate(dir);
      if (kick) sndPing(1400 + (kick - 1) * 60, 0.05, 0.05);
      return !!kick;
    }
    if (piece.t === "O" || piece.t === "P") return false;
    var from = piece.r, to = (piece.r + (dir > 0 ? 1 : 3)) % 4;
    var table = (piece.t === "I" ? KI : KJ)[from + ">" + to];
    for (var i = 0; i < table.length; i++) {
      var kx = table[i][0], ky = -table[i][1];      // y-up table, y-down world
      if (fits(piece.t, to, piece.x + kx, piece.y + ky)) {
        piece.r = to; piece.x += kx; piece.y += ky;
        onShift();
        sndPing(1400 + i * 60, 0.05, 0.05);
        return true;
      }
    }
    return false;
  }
  function onShift() {
    var g = fits(piece.t, piece.r, piece.x, piece.y + 1) ? false : true;
    if (g && lockResets < 15) { lockT = 0; lockResets++; }
  }
  function softStep() {
    if (state !== "play") return;
    if (mode === "maelstrom") { if (mael.soft()) { score++; hudDom(); } return; }
    if (fits(piece.t, piece.r, piece.x, piece.y + 1)) { piece.y++; score++; gravT = 0; hudDom(); }
  }
  function hardDrop() {
    if (state !== "play") return;
    if (mode === "maelstrom") { maelHard(); return; }
    var from = piece.y, to = ghostY();
    score += (to - from) * 2;
    if (fx()) {
      if (to > from) dropTrail = { t: piece.t, r: piece.r, x: piece.x, from: from, to: to, life: TRAIL_LIFE };
      cellsOf(piece.t, piece.r, piece.x, to).forEach(function (c) {
        for (var b = 0; b < 3; b++) {
          particles.push({ kind: "bub", x: c[0] + 0.5 + (Math.random() - 0.5) * 0.6,
            y: from + (to - from) * Math.random(), vy: -(3 + Math.random() * 5), life: 0.7 });
        }
      });
    } else if (to > from) {
      // taken before lock(), which may spawn the next piece over `piece`
      dropMark = { t: piece.t, cells: cellsOf(piece.t, piece.r, piece.x, to), dist: to - from, life: 0.35 };
    }
    piece.y = to;
    sndWhoosh();
    lock();
  }
  function doHold() {
    if (state !== "play") return;
    if (mode === "maelstrom") { if (mael.hold()) sndPing(900, 0.06, 0.06); return; }
    if (!canHold) return;
    var t = piece.t;
    if (hold) {
      var h = hold; hold = t; spawn(h);
    } else {
      hold = t; refill(); spawn(queue.shift());
    }
    canHold = false;                       // stays off until the next lock
    sndPing(900, 0.06, 0.06);
  }

  // ---- gravity, locking, clearing --------------------------------------------------
  function lock() {
    var cs = cellsOf(piece.t, piece.r, piece.x, piece.y);
    var above = true;
    cs.forEach(function (c) {
      if (c[1] >= 0) grid[c[1] * COLS + c[0]] = TYPES.indexOf(piece.t) + 1;
      if (c[1] >= HID) above = false;
    });
    sndThud();
    if (above) { gameOver(); return; }
    var full = [];
    for (var y = 0; y < ROWS; y++) {
      var ok = true;
      for (var x = 0; x < COLS; x++) if (!grid[y * COLS + x]) { ok = false; break; }
      if (ok) full.push(y);
    }
    if (full.length) {
      clearingRows = full;
      state = "clearing";
      clearT = CLEAR_S;
      sweep = 0;
      // FX off: no sweep, so the walls point at those rows, a while after
      // they collapse too
      if (!fx()) clearMark = { rows: full.slice(), life: 0.5 };
      var n = full.length;
      var base = lineScore(n) * level;
      if (n === 4) { if (b2b) base = Math.floor(base * 1.5); b2b = true; }
      else b2b = false;
      score += base;
      lines += n;
      sndClear(n);
      if (fx()) {
        full.forEach(function (ry) {
          for (var cx2 = 0; cx2 < COLS; cx2++) {
            var t2 = TYPES[grid[ry * COLS + cx2] - 1] || "I";
            particles.push({ kind: "pk", x: cx2 + 0.5, y: ry + 0.5,
              vx: (Math.random() - 0.5) * 3, vy: -(1 + Math.random() * 3),
              life: 0.9 + Math.random() * 0.5, t: t2 });
          }
        });
      }
      var newLevel = startLevel + Math.floor(lines / 10);
      if (mode !== "sprint" && newLevel > level) { level = newLevel; sndBell(); }
      // the sprint is won here: its time is taken and saved now, and the
      // results come up after the sweep (finish)
      if (mode === "sprint" && lines >= goal) sprintWon();
    } else {
      spawnNext();
    }
    hudDom();
  }
  function collapse() {
    clearingRows.sort(function (a, b) { return a - b; });
    clearingRows.forEach(function (ry) {
      for (var y = ry; y > 0; y--) {
        for (var x = 0; x < COLS; x++) grid[y * COLS + x] = grid[(y - 1) * COLS + x];
      }
      for (var x2 = 0; x2 < COLS; x2++) grid[x2] = 0;
    });
    clearingRows = [];
    dropMark = null;                       // the rows it ran through just moved
    if (mode === "sprint" && lines >= goal) { finish(); return; }
    state = "play";
    spawnNext();
  }
  function spawn(t) {
    piece = { t: t, r: 0, x: BASE[t].n >= 3 ? 3 : 4, y: 0 };
    gravT = 0; lockT = 0; lockResets = 0; lowY = piece.y;
    if (!fits(piece.t, 0, piece.x, piece.y)) { gameOver(); }
  }
  function spawnNext() {
    refill();
    canHold = true;
    spawn(queue.shift());
  }

  function gravInterval() {
    if (gravOverride) return gravOverride;
    if (mode === "sprint") return 500;
    return GRAV[Math.min(GRAV.length - 1, level - 1)];
  }

  // ---- runs -----------------------------------------------------------------------
  function startRun(m) {
    if (m) mode = m;
    store.set("abyss_mode", mode);
    audio();
    grid = new Uint8Array(ROWS * COLS);
    queue = []; bag = []; hold = null; canHold = true;
    startLevel = !intense ? 1 : mode === "descent" ? 8 : mode === "maelstrom" ? 3 : 1;
    score = 0; lines = 0; level = startLevel; b2b = false; playMs = 0;
    particles = []; clearingRows = []; flashT = 0; dropMark = null; clearMark = null; dropTrail = null;
    das.L = null; das.R = null; softHeld = false;
    $("menu").hidden = true; $("over").hidden = true;
    $("hud").hidden = false;
    $("pad").hidden = !("ontouchstart" in window) && !navigator.maxTouchPoints;
    $("pad").classList.toggle("mael", mode === "maelstrom");
    var b = scoreBest();
    startBest = b ? GameShell.store.getNum(b.key, NaN) : NaN;
    sprintDone = false; sprintBest = false; sprintMs = 0;
    state = "play";
    resize();                            // the pad may have appeared
    if (mode === "maelstrom") maelStart(); else spawnNext();
    hudDom();
  }

  // ---- bests, saved the moment they're earned ----------------------------------
  // A score best is written as soon as the run passes it, and again as it
  // climbs; a sprint time the instant the last row clears (lock). So a tab
  // closed mid-run, or a quit during the sweep, keeps it. startBest is the
  // best as this run began (NaN: none yet), which "a new record" compares to.
  var startBest = NaN, sprintDone = false, sprintBest = false, sprintMs = 0;
  function scoreBest() { return bestFor(bestKey()); }
  function newRecord() { return score > 0 && (isNaN(startBest) || score > startBest); }   // a 0 is no record, even the first time
  function liveBest() {
    var b = scoreBest();
    if (b && state !== "menu" && score > 0 && newRecord()) b.submit(score);
  }
  function sprintWon() {
    if (sprintDone) return;
    sprintDone = true;
    sprintMs = playMs;
    sprintBest = bestTime ? bestTime.submit(Math.round(sprintMs)) : false;
  }

  function gameOver() {
    state = "over";
    sndAlarm();
    var b = scoreBest();
    var isBest = b ? newRecord() : false;
    if (b) b.submit(score);
    $("over-title").textContent = mode === "sprint" ? "Lost with the current" : mode === "maelstrom" ? "Swallowed whole" : "Crush depth";
    $("over-msg").textContent = score.toLocaleString();
    $("over-stats").textContent =
      lines + " rows cleared · " + (level * 100) + "m down\n" +
      (mode !== "sprint"
        ? (isBest ? "a new record dive! 🦑" : "best: " + (b ? b.get().toLocaleString() : score))
        : lines + "/" + goal + ", the forty lines got away");
    $("hud").hidden = true;
    $("over").hidden = false;
  }
  function finish() {                       // sprint complete (saved at the lock)
    state = "over";
    sprintWon();                            // (already done at the lock)
    var t = sprintMs;
    var isBest = sprintBest;
    sndBell();
    $("over-title").textContent = "Forty rows, surfaced";
    $("over-msg").textContent = fmtTime(t);
    $("over-stats").textContent = "score " + score.toLocaleString() +
      "\n" + (isBest ? "a new best time! 🦑" : "best: " + (bestTime && bestTime.get() ? fmtTime(bestTime.get()) : fmtTime(t)));
    $("hud").hidden = true;
    $("over").hidden = false;
  }
  function fmtTime(ms) {
    var s = ms / 1000;
    return Math.floor(s / 60) + ":" + ("0" + (s % 60).toFixed(2)).slice(-5);
  }

  // ---- update ------------------------------------------------------------------------
  function update(dt) {
    if (mode === "maelstrom") { maelUpdate(dt); return; }
    if (state === "clearing") {
      sweep = Math.min(1, sweep + dt / 0.28);
      clearT -= dt;
      playMs += dt * 1000;
      if (clearT <= 0) collapse();
      return;
    }
    if (state !== "play") return;
    playMs += dt * 1000;

    // held keys: DAS then ARR
    ["L", "R"].forEach(function (k) {
      var d = das[k];
      if (!d) return;
      d.t += dt * 1000;
      while (d.t >= d.next) {
        tryMove(k === "L" ? -1 : 1);
        d.next += 40;                       // ARR
      }
    });
    if (softHeld) {
      softT += dt * 1000;
      while (softT >= 40) { softStep(); softT -= 40; }
    }

    // a new lowest row is a fresh landing: the lock delay and its move resets
    // start over, so a piece slid off a ledge doesn't lock as it touches down
    if (piece.y > lowY) { lowY = piece.y; lockT = 0; lockResets = 0; }
    grounded = !fits(piece.t, piece.r, piece.x, piece.y + 1);
    if (grounded) {
      lockT += dt * 1000;
      if (lockT >= 500) { lock(); return; }
    } else {
      gravT += dt * 1000;
      var iv = gravInterval();
      while (gravT >= iv) {
        gravT -= iv;
        if (fits(piece.t, piece.r, piece.x, piece.y + 1)) piece.y++;
        else break;
      }
    }
  }

  // ---- canvas ------------------------------------------------------------------------
  var cv = $("stage"), g = cv.getContext("2d");
  var W = 0, H = 0, cell = 24, wellX = 0, wellY = 0, sea = null;
  // A phone on its side has the pad in two halves at the screen's sides
  // (styles.css, the same query): the play area goes between them, the
  // screen's whole height. sideL, sideR: the room it has across.
  var sideQuery = window.matchMedia ? window.matchMedia("(orientation: landscape) and (max-height: 500px)") : null;
  var sideL = 0, sideR = 0;
  // sideGap: between the well and the boxes beside it (closer on a phone
  // held upright, where 14 px more often than not puts them above the well)
  var sideGap = 14;
  function sideBox(c) { return Math.max(9, Math.floor(c * 0.55)) * 4 + 22; }   // the hold and next boxes' width (drawSide)
  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var padEl = $("pad");
    // fixed-position elements have no offsetParent; measure instead
    var padOn = padEl && !padEl.hidden && padEl.getClientRects().length;
    var side = !!(padOn && sideQuery && sideQuery.matches);
    sideL = 0; sideR = W;
    if (side) padEl.querySelectorAll("button").forEach(function (b) {
      var r = b.getBoundingClientRect();
      if (!r.width) return;
      if (r.left + r.width / 2 < W / 2) sideL = Math.max(sideL, r.right + 6); else sideR = Math.min(sideR, r.left - 6);
    });
    // (kept in the middle of the screen, under the score box: as wide on
    // each side as the nearer half of the pad leaves)
    var half = Math.min(W / 2 - sideL, sideR - W / 2);
    var padB = side ? 10 : padOn ? 128 : 24;
    // (the top: under the score box, which on a narrow screen sits below the corner buttons)
    var top = W > 700 ? 64 : 104;
    if (side) top = $("hud").hidden ? 64 : Math.max(64, Math.round($("hud").getBoundingClientRect().bottom + 10));
    if (side) {
      // the well and the boxes beside it between the halves, as tall as the screen allows
      cell = Math.min(34, Math.floor((H - top - 14) / VIS));
      while (cell > 8 && COLS * cell + 2 * (sideBox(cell) + 18) > 2 * half) cell--;
    } else {
      cell = Math.floor(Math.min((H - 86 - padB) / VIS, W / (W > 700 ? 22 : 13)));
      cell = Math.max(14, Math.min(34, cell));
    }
    sideGap = 14;
    var compactAt = 0;
    if (!side && W <= 700) {
      // A phone upright: the hold and next boxes beside the well where they
      // fit (8 px from it if 14 is too much), the well a little narrower if
      // need be; or, where that would shrink it more than putting them above
      // it does, above it, under the score box, the well moved down for them
      // (never over the score box or the corner buttons)
      var beside = function (c, gap) { return Math.round(W / 2 - (COLS * c) / 2) - sideBox(c) - gap >= 4; };
      var over = function (c) { return Math.max(9, Math.floor(c * 0.55)) * 2 + 26; };   // the boxes above the well, and the gap under them (sideRects)
      var cB = cell, cA = cell;
      while (cB > 14 && !beside(cB, 8)) cB--;
      while (cA > 12 && top + over(cA) + 6 + (HID + VIS) * cA + 4 > H - padB) cA--;
      if (beside(cell, 14)) sideGap = 14;
      else if (cB >= cA && beside(cB, 8)) { cell = cB; sideGap = beside(cB, 14) ? 14 : 8; }
      else { cell = cA; compactAt = top + over(cA) + 6 + HID * cA; }
    }
    wellX = Math.round(W / 2 - (COLS * cell) / 2);
    wellY = Math.round(Math.max(top, compactAt, (H - padB - VIS * cell) / 2 + 30));
    // Maelstrom's plus: 26 cells across and down, a row's room above it for
    // the piece coming in, clear of the HUD and the pad (two rows of it under
    // the plus, or its halves beside it)
    var mTop = top, mPad = side ? 10 : padOn ? padEl.getBoundingClientRect().height + 8 : 16;
    var room = H - mTop - mPad;
    mcell = Math.max(side ? 6 : 8, Math.min(30, Math.floor(Math.min(room / 27, (2 * half - 8) / 26))));
    mcx = Math.round(W / 2);
    mcy = Math.round(mTop + mcell + Math.max(0, (room - 27 * mcell) / 2) + 13 * mcell);
    if (!sea) sea = A.makeSea(W, H); else sea.resize(W, H);
  }
  window.addEventListener("resize", resize);

  function px(gx) { return wellX + gx * cell; }
  function py(gy) { return wellY + (gy - HID) * cell; }

  function stackHeight() {
    if (mode === "maelstrom") return mael ? maelDanger() : 0;
    for (var y = HID; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) if (grid[y * COLS + x]) return ROWS - y;
    }
    return 0;
  }

  var drawn = { drop: false, clear: [], trail: 0 };   // the FX marks the last frame drew (test hook)
  function draw(t, dt) {
    drawn.drop = false; drawn.clear = []; drawn.trail = 0;
    var danger = state === "play" || state === "clearing" ? Math.max(0, (stackHeight() - 14) / 6) : 0;
    sea.draw(g, t, dt, fx(), danger);
    if (state === "menu") return;
    if (mode === "maelstrom") { drawMael(dt); return; }

    // the well: a glass column with a faint sonar grid
    g.fillStyle = "rgba(2,10,20,0.62)";
    g.fillRect(px(0) - 4, py(HID) - 4, COLS * cell + 8, VIS * cell + 8);
    g.strokeStyle = "rgba(80,200,255,0.35)";
    g.lineWidth = 2;
    g.strokeRect(px(0) - 4, py(HID) - 4, COLS * cell + 8, VIS * cell + 8);
    g.strokeStyle = "rgba(80,160,220,0.07)";
    g.lineWidth = 1;
    for (var gx = 1; gx < COLS; gx++) {
      g.beginPath(); g.moveTo(px(gx), py(HID)); g.lineTo(px(gx), py(ROWS)); g.stroke();
    }
    for (var gy = HID + 1; gy < ROWS; gy++) {
      g.beginPath(); g.moveTo(px(0), py(gy)); g.lineTo(px(COLS), py(gy)); g.stroke();
    }

    // settled cells
    for (var y = HID; y < ROWS; y++) {
      var isClr = clearingRows.indexOf(y) !== -1;
      for (var x = 0; x < COLS; x++) {
        var v = grid[y * COLS + x];
        if (!v) continue;
        if (isClr) {
          g.globalAlpha = fx() ? Math.max(0, 1 - sweep * 1.15) : 0.4;
          A.cell(g, px(x), py(y), cell, TYPES[v - 1], { dim: false });
          g.globalAlpha = 1;
        } else {
          A.cell(g, px(x), py(y), cell, TYPES[v - 1], { dim: true });
        }
      }
    }
    // the sonar sweep across clearing rows
    if (state === "clearing" && fx()) {
      var sx = px(0) + sweep * COLS * cell;
      clearingRows.forEach(function (ry) {
        var grd = g.createLinearGradient(sx - 60, 0, sx, 0);
        grd.addColorStop(0, "rgba(120,235,255,0)");
        grd.addColorStop(1, "rgba(160,245,255,0.75)");
        g.fillStyle = grd;
        g.fillRect(px(0), py(ry), Math.max(0, sx - px(0)), cell);
      });
    }

    // the hard drop's trail (Visual FX on; see dropTrail)
    if (dropTrail) {
      dropTrail.life -= dt;
      if (dropTrail.life <= 0 || !fx()) dropTrail = null;
      else {
        var tr = dropTrail, fade = tr.life / TRAIL_LIFE, span = tr.to - tr.from;
        for (var ty = tr.from; ty < tr.to; ty++) {
          var near = (ty - tr.from + 1) / (span + 1);
          g.globalAlpha = 0.35 * fade * near * near;
          cellsOf(tr.t, tr.r, tr.x, ty).forEach(function (c) {
            if (c[1] >= HID) { A.cell(g, px(c[0]), py(c[1]), cell, tr.t, { dim: true }); drawn.trail++; }
          });
        }
        g.globalAlpha = 1;
      }
    }

    // Visual FX off: the still sonar marks (see dropMark / clearMark)
    if (dropMark) {
      dropMark.life -= dt;
      if (dropMark.life <= 0) dropMark = null;
      else {
        // a faint streak down each column the piece fell through, to its top cell
        var dsp = A.SPECIES[dropMark.t], tops = {};
        dropMark.cells.forEach(function (c) { if (!(c[0] in tops) || c[1] < tops[c[0]]) tops[c[0]] = c[1]; });
        Object.keys(tops).forEach(function (k) {
          var bot = tops[k], top = Math.max(HID, bot - dropMark.dist);
          if (bot <= top) return;
          var grd = g.createLinearGradient(0, py(top), 0, py(bot));
          grd.addColorStop(0, dsp.glow + "0)");
          grd.addColorStop(1, dsp.glow + "0.3)");
          g.fillStyle = grd;
          g.fillRect(px(+k) + cell * 0.2, py(top), cell * 0.6, py(bot) - py(top));
        });
        drawn.drop = true;
      }
    }
    if (clearMark) {
      clearMark.life -= dt;
      if (clearMark.life <= 0) clearMark = null;
      else {
        // pointers just outside both walls (rows shift on collapse, so the
        // marks stay out of the well)
        g.fillStyle = "rgba(160,245,255,0.9)";
        clearMark.rows.forEach(function (ry) {
          if (ry < HID) return;
          var my = py(ry) + cell / 2, h = cell * 0.32, lx = px(0) - 6, rx = px(COLS) + 6;
          g.beginPath(); g.moveTo(lx, my); g.lineTo(lx - 5, my - h); g.lineTo(lx - 5, my + h); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(rx, my); g.lineTo(rx + 5, my - h); g.lineTo(rx + 5, my + h); g.closePath(); g.fill();
          drawn.clear.push(ry - HID);
        });
      }
    }

    if (state === "play") {
      // sonar echo of the landing spot
      var gy2 = ghostY();
      if (gy2 !== piece.y) {
        cellsOf(piece.t, piece.r, piece.x, gy2).forEach(function (c) {
          if (c[1] >= HID) A.cell(g, px(c[0]), py(c[1]), cell, piece.t, { ghost: true });
        });
      }
      cellsOf(piece.t, piece.r, piece.x, piece.y).forEach(function (c) {
        if (c[1] >= HID - 1) A.cell(g, px(c[0]), py(c[1]), cell, piece.t);
      });
    }

    // particles: bubbles up, plankton adrift
    particles.forEach(function (p) {
      p.life -= dt;
      p.y += (p.vy || 0) * dt; p.x += (p.vx || 0) * dt;
      if (p.kind === "bub") {
        g.strokeStyle = "rgba(190,235,255," + Math.max(0, p.life) + ")";
        g.lineWidth = 1;
        g.beginPath(); g.arc(px(p.x), py(p.y), cell * 0.12, 0, 7); g.stroke();
      } else {
        var sp = A.SPECIES[p.t];
        g.fillStyle = sp.glow + Math.max(0, p.life * 0.8) + ")";
        g.beginPath(); g.arc(px(p.x), py(p.y), cell * 0.16, 0, 7); g.fill();
      }
    });
    particles = particles.filter(function (p) { return p.life > 0; });

    drawSide();
  }

  // ---- Maelstrom ------------------------------------------------------------------------
  // The board and its rules are maelstrom.js; here it's timed, scored and
  // drawn. The view turns with the board (a fifth of a second, with Visual FX
  // on or off: where the arms go is play), while the piece of a single dive
  // stays put on the screen as the board turns under it.
  var mcell = 14, mcx = 0, mcy = 0, TAU = Math.PI * 2;
  var view = { from: 0, to: 0, t: 1 }, TURN_S = 0.2;
  var mClear = null, mTrail = null, mStreak = null, mOpened = null;   // what's being drawn: dissolving cells, a hard drop's trail (FX on) or streak (FX off), a newly opened arm
  function viewAngle() { var e = 1 - Math.pow(1 - view.t, 3); return view.from + (view.to - view.from) * e; }

  function maelStart() {
    if (!mael) mael = AbyssMaelstrom.create({ TYPES: TYPES, ROT: ROT, KI: KI, KJ: KJ, BASE: BASE }, {
      lock: function () { sndThud(); },
      clear: maelCleared,
      collapsed: maelCollapsed,
      over: function () { if (state === "play" || state === "clearing") gameOver(); }
    });
    view = { from: 0, to: 0, t: 1 };
    mClear = null; mTrail = null; mStreak = null; mOpened = null;
    mael.start({ juggle: juggle, all: intense });
  }
  // full lines: scored as Descent scores them, then they dissolve (the same
  // time with Visual FX on or off) and the blocks beyond them slide in
  function maelCleared(n, cells) {
    var base = lineScore(n) * level;
    if (n >= 4) { if (b2b) base = Math.floor(base * 1.5); b2b = true; } else b2b = false;
    score += base;
    lines += n;
    sndClear(n);
    state = "clearing";
    sweep = 0;
    mClear = {};
    cells.forEach(function (i) { mClear[i] = true; });
    if (fx()) {
      cells.forEach(function (i) {
        var x = i % 26, y = Math.floor(i / 26), t2 = TYPES[mael.grid[i] - 1] || "I";
        particles.push({ kind: "pk", bx: x + 0.5, by: y + 0.5, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3,
          life: 0.9 + Math.random() * 0.5, t: t2 });
      });
    }
    var newLevel = startLevel + Math.floor(lines / 10);
    if (newLevel > level) { level = newLevel; sndBell(); }
    hudDom();
    return CLEAR_S * 1000;
  }
  // the lines are gone: a new arm opens every 10 rows (all four from the
  // start in Intense), clockwise from the first
  function maelCollapsed() {
    mClear = null;
    if (state === "clearing") state = "play";
    if (!intense) {
      var was = mael.open.filter(Boolean).length;
      if (mael.openArms(1 + Math.floor(lines / 10))) {
        mOpened = { k: was, life: 1.2 };
        sndBell();
      }
    }
  }
  function maelUpdate(dt) {
    if (state !== "play" && state !== "clearing") return;
    playMs += dt * 1000;
    if (state === "clearing") sweep = Math.min(1, sweep + dt / 0.28);
    else {
      // held keys: DAS then ARR, and the held soft drop
      ["L", "R"].forEach(function (k) {
        var d = das[k];
        if (!d) return;
        d.t += dt * 1000;
        while (d.t >= d.next) { tryMove(k === "L" ? -1 : 1); d.next += 40; }
      });
      if (softHeld) {
        softT += dt * 1000;
        while (softT >= 40) { softStep(); softT -= 40; }
      }
    }
    if (state === "play" || state === "clearing") mael.update(dt * 1000, gravInterval());
  }
  function maelHard() {
    var p = mael.piece(), to = mael.ghostY();
    if (!p || to == null) return;
    score += (to - p.y) * 2;
    var cells = mael.cellsOf({ t: p.t, r: p.r, x: p.x, y: to });
    if (fx()) {
      if (to > p.y) mTrail = { t: p.t, r: p.r, x: p.x, k: p.k, from: p.y, to: to, life: TRAIL_LIFE };
    } else if (to > p.y) {
      mStreak = { t: p.t, k: p.k, cells: cells, dist: to - p.y, life: 0.35 };
    }
    sndWhoosh();
    mael.hard();
    hudDom();
  }
  // Q (-1) and E (+1): the board turns a quarter (or on past closed arms)
  function turnBoard(dir) {
    if (state !== "play" || mode !== "maelstrom" || P.isPaused()) return false;
    if (!mael.turn(dir)) { sndPing(300, 0.08, 0.05); return false; }
    var cur = viewAngle(), want = -mael.top * Math.PI / 2;
    var d = ((want - cur) % TAU + TAU) % TAU;          // 0..2pi: the way round clockwise
    if (dir < 0 && d > 0) d -= TAU;                    // the other way for a turn to the left
    view = { from: cur, to: cur + d, t: 0 };
    sndPing(520, 0.14, 0.07); sndPing(390, 0.16, 0.05, 0.05);
    return true;
  }
  // how high the danger is (the sea's red tint): the fullest open arm, rows from its edge
  function maelDanger() {
    var most = 0, g0 = mael.grid;
    for (var k = 0; k < 4; k++) {
      if (!mael.open[k]) continue;
      for (var ly = 0; ly < 8; ly++) {
        var any = false;
        for (var lx = 0; lx < 10 && !any; lx++) { var b = AbyssMaelstrom.toBoard(k, lx, ly); if (g0[b[0] + b[1] * 26]) any = true; }
        if (any) { most = Math.max(most, 8 - ly); break; }
      }
    }
    return 14 + most * 0.75;   // (an arm full to its edge reads like a well 20 deep)
  }

  // the board's cell (bx, by) on the canvas while it's turned: drawn in the
  // turned frame, its top-left corner from the middle
  function mx(b) { return (b - 13) * mcell; }
  var ARMS = [[8, 0, 10, 8], [18, 8, 8, 10], [8, 18, 10, 8], [0, 8, 8, 10]];   // each arm's rectangle, in board cells
  function drawMael(dt) {
    var c = mcell, M = mael, grid0 = M.grid, k, x, y, i;
    view.t = Math.min(1, view.t + dt / TURN_S);
    g.save();
    g.translate(mcx, mcy);
    g.rotate(viewAngle());
    // the arms: glass where they're open, rock while they're closed; the core
    for (k = 0; k < 4; k++) {
      var a = ARMS[k];
      g.fillStyle = M.open[k] ? "rgba(2,10,20,0.62)" : "rgba(26,22,18,0.82)";
      g.fillRect(mx(a[0]), mx(a[1]), a[2] * c, a[3] * c);
      if (!M.open[k]) {
        // (sealed: a hatch of rock across it)
        g.strokeStyle = "rgba(120,100,80,0.25)"; g.lineWidth = 1;
        g.beginPath();
        for (var h = -a[3]; h < a[2]; h += 2) {
          g.moveTo(mx(a[0] + Math.max(0, h)), mx(a[1] + Math.max(0, -h)));
          g.lineTo(mx(a[0] + Math.min(a[2], h + a[3])), mx(a[1] + Math.min(a[3], a[2] - h)));
        }
        g.stroke();
      }
    }
    g.fillStyle = "rgba(2,10,20,0.62)";
    g.fillRect(mx(8), mx(8), 10 * c, 10 * c);
    // the sonar grid, faint
    g.strokeStyle = "rgba(80,160,220,0.07)"; g.lineWidth = 1;
    g.beginPath();
    for (i = 1; i < 26; i++) {
      var lo = i < 8 || i > 18 ? 8 : 0, hi = i < 8 || i > 18 ? 18 : 26;
      g.moveTo(mx(i), mx(lo)); g.lineTo(mx(i), mx(hi));
      g.moveTo(mx(lo), mx(i)); g.lineTo(mx(hi), mx(i));
    }
    g.stroke();
    // the middle lines, where a piece stops once the arm across from its own is open
    g.strokeStyle = "rgba(120,220,255,0.28)"; g.lineWidth = 1.5;
    g.setLineDash([c * 0.3, c * 0.3]);
    g.beginPath();
    if (M.open[0] && M.open[2]) { g.moveTo(mx(8), mx(13)); g.lineTo(mx(18), mx(13)); }
    if (M.open[1] && M.open[3]) { g.moveTo(mx(13), mx(8)); g.lineTo(mx(13), mx(18)); }
    g.stroke();
    g.setLineDash([]);
    // the plus's outline
    g.strokeStyle = "rgba(80,200,255,0.35)"; g.lineWidth = 2;
    g.beginPath();
    [[8, 0], [18, 0], [18, 8], [26, 8], [26, 18], [18, 18], [18, 26], [8, 26], [8, 18], [0, 18], [0, 8], [8, 8]].forEach(function (pt, n) {
      if (n) g.lineTo(mx(pt[0]), mx(pt[1])); else g.moveTo(mx(pt[0]), mx(pt[1]));
    });
    g.closePath(); g.stroke();
    // a newly opened arm glows a moment
    if (mOpened) {
      mOpened.life -= dt;
      if (mOpened.life <= 0) mOpened = null;
      else {
        var oa = ARMS[mOpened.k];
        g.fillStyle = "rgba(120,235,255," + (0.22 * Math.min(1, mOpened.life)).toFixed(3) + ")";
        g.fillRect(mx(oa[0]), mx(oa[1]), oa[2] * c, oa[3] * c);
      }
    }
    // the settled blocks (the dissolving ones fading, with FX on; dimmed, off)
    for (y = 0; y < 26; y++) {
      for (x = 0; x < 26; x++) {
        var v = grid0[x + y * 26];
        if (!v) continue;
        if (mClear && mClear[x + y * 26]) {
          g.globalAlpha = fx() ? Math.max(0, 1 - sweep * 1.15) : 0.4;
          A.cell(g, mx(x), mx(y), c, TYPES[v - 1], { dim: false });
          g.globalAlpha = 1;
        } else A.cell(g, mx(x), mx(y), c, TYPES[v - 1], { dim: true });
      }
    }
    // a hard drop's trail (FX on) or still streak (FX off), in its arm
    if (mTrail) {
      mTrail.life -= dt;
      if (mTrail.life <= 0 || !fx()) mTrail = null;
      else {
        var tr = mTrail, fade = tr.life / TRAIL_LIFE, span = tr.to - tr.from;
        for (var ty = tr.from; ty < tr.to; ty++) {
          var near = (ty - tr.from + 1) / (span + 1);
          g.globalAlpha = 0.35 * fade * near * near;
          mael.cellsOf({ t: tr.t, r: tr.r, x: tr.x, y: ty }).forEach(function (cc) {
            if (cc[1] < 0) return;
            var b = AbyssMaelstrom.toBoard(tr.k, cc[0], cc[1]);
            A.cell(g, mx(b[0]), mx(b[1]), c, tr.t, { dim: true });
          });
        }
        g.globalAlpha = 1;
      }
    }
    if (mStreak) {
      mStreak.life -= dt;
      if (mStreak.life <= 0) mStreak = null;
      else {
        var sp = A.SPECIES[mStreak.t], tops = {};
        mStreak.cells.forEach(function (cc) { if (!(cc[0] in tops) || cc[1] < tops[cc[0]]) tops[cc[0]] = cc[1]; });
        Object.keys(tops).forEach(function (lx) {
          var bot = tops[lx], topY = Math.max(0, bot - mStreak.dist);
          if (bot <= topY) return;
          var b0 = AbyssMaelstrom.toBoard(mStreak.k, +lx, topY), b1 = AbyssMaelstrom.toBoard(mStreak.k, +lx, bot);
          var grd = g.createLinearGradient(mx(b0[0] + 0.5), mx(b0[1] + 0.5), mx(b1[0] + 0.5), mx(b1[1] + 0.5));
          grd.addColorStop(0, sp.glow + "0)");
          grd.addColorStop(1, sp.glow + "0.3)");
          g.fillStyle = grd;
          var x0 = Math.min(b0[0], b1[0]), y0 = Math.min(b0[1], b1[1]), x1 = Math.max(b0[0], b1[0]) + 1, y1 = Math.max(b0[1], b1[1]) + 1;
          var thinX = x1 - x0 === 1, inset = c * 0.2;
          g.fillRect(mx(x0) + (thinX ? inset : 0), mx(y0) + (thinX ? 0 : inset), (x1 - x0) * c - (thinX ? 2 * inset : 0), (y1 - y0) * c - (thinX ? 0 : 2 * inset));
        });
        drawn.drop = true;
      }
    }
    // the pieces of a juggle, each in its own arm (with the board as it turns)
    var pcs = M.pieces();
    if (M.juggle) {
      pcs.forEach(function (p) { if (p) drawMaelPiece(p, true); });
    }
    // the clearing's plankton (FX on)
    particles.forEach(function (pt) {
      pt.life -= dt;
      pt.bx += (pt.vx || 0) * dt; pt.by += (pt.vy || 0) * dt;
      var sp2 = A.SPECIES[pt.t];
      g.fillStyle = sp2.glow + Math.max(0, pt.life * 0.8) + ")";
      g.beginPath(); g.arc(mx(pt.bx), mx(pt.by), c * 0.16, 0, 7); g.fill();
    });
    particles = particles.filter(function (pt) { return pt.life > 0; });
    g.restore();
    // a single dive's piece stays put on the screen while the board turns under it
    if (!M.juggle && pcs[M.top] && state === "play") drawMaelPiece(pcs[M.top], false);
    drawMaelSide();
  }
  // a piece and (the one the keys move) its sonar echo: in the turned frame
  // (inBoard) or on the screen as the top arm stands
  function drawMaelPiece(p, inBoard) {
    var c = mcell, ctl = p === mael.piece() && state === "play";
    function at(lx, ly) {
      if (inBoard) { var b = AbyssMaelstrom.toBoard(p.k, lx, ly); return [mx(b[0]), mx(b[1])]; }
      return [mcx + (lx + 8 - 13) * c, mcy + (ly - 13) * c];
    }
    if (ctl) {
      var gy = mael.ghostY(p);
      if (gy !== p.y) mael.cellsOf({ t: p.t, r: p.r, x: p.x, y: gy }).forEach(function (cc) {
        if (cc[1] < 0) return;
        var q = at(cc[0], cc[1]); A.cell(g, q[0], q[1], c, p.t, { ghost: true });
      });
    }
    mael.cellsOf(p).forEach(function (cc) {
      if (cc[1] < -1) return;
      var q = at(cc[0], cc[1]);
      if (!ctl && inBoard) g.globalAlpha = 0.85;      // (the pieces the keys don't move, a touch fainter)
      A.cell(g, q[0], q[1], c, p.t);
      g.globalAlpha = 1;
    });
  }
  // hold and next, in the plus's two top corners on the screen
  function drawMaelSide() {
    var c = mcell, sq = 8 * c - 10, mini = Math.max(6, Math.floor(c * 0.62));
    var lx = mcx - 13 * c + 2, rx = mcx + 5 * c + 8, ty = mcy - 13 * c + 2;
    function box(bx, by, bw, bh, label) {
      g.fillStyle = "rgba(2,10,20,0.62)";
      A.rr(g, bx, by, bw, bh, 8); g.fill();
      g.strokeStyle = "rgba(80,200,255,0.3)"; g.lineWidth = 1.5;
      A.rr(g, bx, by, bw, bh, 8); g.stroke();
      g.fillStyle = "rgba(140,200,230,0.75)";
      g.font = Math.max(8, Math.min(10, Math.round(c * 0.75))) + "px 'Share Tech Mono', 'Courier New', monospace";
      g.textAlign = "left";
      g.fillText(label, bx + 6, by + 12);
    }
    function drawMini(t, bx, by, s) {
      var n = BASE[t].n, offx = bx + (4 - n) * s * 0.5, offy = by + (n === 4 ? 0 : s * 0.4);
      ROT[t][0].forEach(function (cc) { A.cell(g, offx + cc[0] * s, offy + cc[1] * s, s, t); });
    }
    box(lx, ty, sq, Math.min(sq, mini * 2.6 + 22), "HOLD");
    if (mael.hold) drawMini(mael.hold, lx + (sq - mini * 4) / 2, ty + 18, mini);
    box(rx, ty, sq, sq, "NEXT");
    var q = mael.queue, step = (sq - 22) / 3;
    for (var i = 0; i < 3; i++) if (q[i]) drawMini(q[i], rx + (sq - mini * 4) / 2, ty + 18 + i * step, Math.min(mini, step / 2.4));
  }

  // hold + next drawn as little sonar screens beside the well
  function drawSide() {
    var mini = Math.max(9, Math.floor(cell * 0.55));
    function box(bx, by, bw, bh, label) {
      g.fillStyle = "rgba(2,10,20,0.62)";
      A.rr(g, bx, by, bw, bh, 8); g.fill();
      g.strokeStyle = "rgba(80,200,255,0.3)"; g.lineWidth = 1.5;
      A.rr(g, bx, by, bw, bh, 8); g.stroke();
      g.fillStyle = "rgba(140,200,230,0.75)";
      g.font = "10px 'Share Tech Mono', 'Courier New', monospace";
      g.textAlign = "left";
      g.fillText(label, bx + 8, by + 14);
    }
    function drawMini(t, bx, by, s) {
      var n = BASE[t].n;
      var offx = bx + (4 - n) * s * 0.5, offy = by + (n === 4 ? 0 : s * 0.4);
      ROT[t][0].forEach(function (c) {
        A.cell(g, offx + c[0] * s, offy + c[1] * s, s, t);
      });
    }
    var s = sideRects(), h = s.hold, nb = s.next;
    if (s.compact) {
      // phones: hold tucked above-left, three previews above-right
      box(h.x, h.y, h.w, h.h, "HOLD");
      if (hold) drawMini(hold, h.x + 10, h.y + 16, mini * 0.8);
      box(nb.x, nb.y, nb.w, nb.h, "NEXT");
      for (var q = 0; q < 2; q++) {
        if (queue[q]) drawMini(queue[q], nb.x + 6 + q * (mini * 1.7), nb.y + 16, mini * 0.55);
      }
      return;
    }
    box(h.x, h.y, h.w, h.h, "HOLD");
    if (hold) drawMini(hold, h.x + 10, h.y + 20, mini);
    box(nb.x, nb.y, nb.w, nb.h, "NEXT");
    for (var i = 0; i < 5; i++) {
      if (queue[i]) drawMini(queue[i], nb.x + 10, nb.y + 22 + i * mini * 2.6, mini);
    }
  }
  // where the hold and next boxes go: beside the well, or above it where
  // there's no room beside it (sideL, sideR: see resize)
  function sideRects() {
    var mini = Math.max(9, Math.floor(cell * 0.55)), bw = sideBox(cell);
    var hx = wellX - bw - sideGap, nx = wellX + COLS * cell + sideGap;
    if (hx < sideL + 4 || nx + bw > sideR - 4) {
      var topY = Math.max(40, wellY - HID * cell - 6 - (mini * 2 + 26)), sw = mini * 3 + 16, sh = mini * 2 + 24;
      return { compact: true, hold: { x: px(0) - 4, y: topY, w: sw, h: sh }, next: { x: px(COLS) + 4 - sw, y: topY, w: sw, h: sh } };
    }
    return { compact: false, hold: { x: hx, y: wellY, w: bw, h: mini * 3 + 20 }, next: { x: nx, y: wellY, w: bw, h: mini * 2.6 * 5 + 20 } };
  }
  // what's drawn of the play (a test hook): the well's frame and the hold
  // and next boxes; in Maelstrom the plus with the row above it for the
  // piece coming in (its hold and next boxes are in its corners)
  function playAreas() {
    if (mode === "maelstrom") return [{ n: "plus", x: mcx - 13 * mcell, y: mcy - 14 * mcell, w: 26 * mcell, h: 27 * mcell }];
    var s = sideRects();
    return [{ n: "well", x: px(0) - 4, y: py(HID) - 4, w: COLS * cell + 8, h: VIS * cell + 8 },
      Object.assign({ n: "hold" }, s.hold), Object.assign({ n: "next" }, s.next)];
  }

  function hudDom() {
    liveBest();                              // every score change comes through here
    $("hud-score").textContent = score.toLocaleString();
    $("hud-lines").textContent = lines + (mode === "sprint" ? "/" + goal : "") + " rows";
    $("hud-depth").textContent = mode === "sprint" ? fmtTime(playMs) : (level * 100) + "m";
  }

  // ---- sound --------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function sndPing(freq, dur, vol, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), gn = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 0.72, t0 + dur);
    gn.gain.setValueAtTime(vol, t0);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.15);
    o.connect(gn); gn.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.2);
  }
  function sndThud() {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.1);
    gn.gain.setValueAtTime(0.22, t0);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + 0.16);
  }
  function sndWhoosh() {
    var ac = audio(); if (!ac) return;
    var len = Math.floor(ac.sampleRate * 0.14), buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i / len);
    var src = ac.createBufferSource(); src.buffer = buf;
    var bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 0.8;
    var gn = ac.createGain(); gn.gain.value = 0.25;
    src.connect(bp); bp.connect(gn); gn.connect(ac.destination); src.start();
  }
  function sndClear(n) {
    sndPing(1150, 0.12, 0.14);
    sndPing(1150, 0.12, 0.07, 0.16);        // the echo
    if (n >= 4) { sndPing(430, 0.5, 0.16, 0.05); sndPing(287, 0.7, 0.14, 0.2); }
  }
  function sndBell() { sndPing(660, 0.25, 0.12); sndPing(880, 0.3, 0.1, 0.13); }
  function sndAlarm() {
    var ac = audio(); if (!ac) return;
    for (var i = 0; i < 3; i++) {
      (function (k) {
        var t0 = ac.currentTime + k * 0.28;
        var o = ac.createOscillator(), gn = ac.createGain();
        o.type = "square"; o.frequency.value = 220;
        gn.gain.setValueAtTime(0.08, t0);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + 0.24);
      })(i);
    }
    sndPing(500, 1.2, 0.07, 0.9);
  }

  // ---- loop ---------------------------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play" || state === "clearing"; },
    onChange: function (paused) { if (paused) letGo(); },
    // on the card: this mode again from an empty well, or back to the modes
    restart: function () { startRun(mode); },
    menu: toMenu
  }) : { isPaused: function () { return false; } };
  // Leaving asks first while a run is on (paused too), as the pause default
  // would, except once a sprint's last row is in: its time is saved by then
  if (window.GameShell) GameShell.guardLeave({
    active: function () { return (P.isPaused() || state === "play" || state === "clearing") && !sprintDone; },
    pausable: P
  });

  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (P.isPaused()) return;
    update(dt);
    // the Sprint clock runs every frame, not only when a piece locks
    if (mode === "sprint" && (state === "play" || state === "clearing")) $("hud-depth").textContent = fmtTime(playMs);
    draw(now, dt);
  }

  // ---- input --------------------------------------------------------------------------
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (P.isPaused()) return;
    if (state === "play") {
      switch (e.code) {
        case "ArrowLeft":
          e.preventDefault();
          if (!e.repeat) { tryMove(-1); das.L = { t: 0, next: 160 }; das.R = null; }
          return;
        case "ArrowRight":
          e.preventDefault();
          if (!e.repeat) { tryMove(1); das.R = { t: 0, next: 160 }; das.L = null; }
          return;
        case "ArrowDown":
          e.preventDefault();
          if (!e.repeat) { softStep(); softHeld = true; softT = -120; }
          return;
        // (X and Z spin; the up arrow is no spin key)
        case "KeyX":
          e.preventDefault(); if (!e.repeat) tryRotate(1); return;
        case "KeyZ":
          e.preventDefault(); if (!e.repeat) tryRotate(-1); return;
        case "Space":
          e.preventDefault(); if (!e.repeat) hardDrop(); return;
        case "KeyC": case "ShiftLeft": case "ShiftRight":
          e.preventDefault(); if (!e.repeat) doHold(); return;
        // (Maelstrom: Q turns the board to the left, E to the right)
        case "KeyQ":
          if (mode === "maelstrom") { e.preventDefault(); if (!e.repeat) turnBoard(-1); }
          return;
        case "KeyE":
          if (mode === "maelstrom") { e.preventDefault(); if (!e.repeat) turnBoard(1); }
          return;
      }
      return;
    }
    if (e.repeat) return;
    if (state === "menu") {
      if (e.key >= "1" && e.key <= "4" && e.key.length === 1) {
        mode = MODES[+e.key - 1];
        store.set("abyss_mode", mode);
        paintMenu();
      } else if (e.code === "KeyI") $("opt-intense").click();
      else if (e.code === "KeyJ") $("opt-juggle").click();
      else if (e.key === "Enter") startRun(mode);
      return;
    }
    // the results: Backspace back to the modes; Esc (unclaimed) leaves for the games page
    if (state === "over") {
      if (e.key === "Enter") startRun(mode);
      else if (e.key === "Backspace") { e.preventDefault(); toMenu(); }
    }
  });
  document.addEventListener("keyup", function (e) {
    if (e.code === "ArrowLeft") das.L = null;
    if (e.code === "ArrowRight") das.R = null;
    if (e.code === "ArrowDown") softHeld = false;
  });
  // A key let go in another tab, or under the pause card, sends no keyup
  // here: drop the held moves on pause and on blur, so none runs on by itself
  function letGo() { das.L = null; das.R = null; softHeld = false; }
  window.addEventListener("blur", letGo);

  // touch pad
  function bindPad(id, down, up) {
    var el = $(id);
    el.addEventListener("pointerdown", function (e) { e.preventDefault(); if (!P.isPaused()) down(); });
    if (up) {
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("pointerleave", up);
    }
  }
  bindPad("p-left", function () { tryMove(-1); das.L = { t: 0, next: 200 }; }, function () { das.L = null; });
  bindPad("p-right", function () { tryMove(1); das.R = { t: 0, next: 200 }; }, function () { das.R = null; });
  bindPad("p-rot", function () { tryRotate(1); });
  bindPad("p-soft", function () { softStep(); softHeld = true; softT = -140; }, function () { softHeld = false; });
  bindPad("p-hard", function () { hardDrop(); });
  bindPad("p-hold", function () { doHold(); });
  bindPad("p-turnl", function () { turnBoard(-1); });
  bindPad("p-turnr", function () { turnBoard(1); });

  // ---- menu ----------------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === mode);
    });
    // the switches: on or off, and out of reach where they don't count
    [["opt-intense", intense, mode === "descent" || mode === "maelstrom"], ["opt-juggle", juggle, mode === "maelstrom"]].forEach(function (o) {
      var b = $(o[0]);
      b.classList.toggle("on", o[1]);
      b.setAttribute("aria-pressed", o[1] ? "true" : "false");
      b.disabled = !o[2];
    });
    // the records, each mode's for the switches as they are
    var parts = [], sw = [];
    MODES.forEach(function (m) {
      if (m === "sprint") { if (bestTime && bestTime.get()) parts.push("Sprint " + fmtTime(bestTime.get())); return; }
      var b = bestFor(bestKey(m));
      if (b && b.get()) parts.push(m.charAt(0).toUpperCase() + m.slice(1) + " " + b.get().toLocaleString());
    });
    if (intense) sw.push("intense");
    if (juggle) sw.push("juggle");
    $("bests").textContent = parts.length ? "records" + (sw.length ? " (" + sw.join(", ") + ")" : "") + ": " + parts.join(" · ") : "the sonar log is empty";
  }
  function toMenu() {
    state = "menu";
    $("over").hidden = true; $("hud").hidden = true; $("pad").hidden = true;
    $("menu").hidden = false;
    paintMenu();
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-v");
      store.set("abyss_mode", mode);
      paintMenu();
    });
  });
  $("opt-intense").addEventListener("click", function () {
    intense = !intense; store.set("abyss_intense", intense ? "1" : "0"); paintMenu();
  });
  $("opt-juggle").addEventListener("click", function () {
    juggle = !juggle; store.set("abyss_juggle", juggle ? "1" : "0"); paintMenu();
  });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);

  // ---- go ------------------------------------------------------------------------------
  resize();
  toMenu();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness drives runs through these
  window.Abyss = {
    state: function () { return state; },
    mode: function () { return mode; },
    score: function () { return score; },
    lines: function () { return lines; },
    level: function () { return level; },
    piece: function () { return piece ? { t: piece.t, r: piece.r, x: piece.x, y: piece.y } : null; },
    queue: function () { return queue.slice(); },
    holdType: function () { return hold; },
    row: function (y) {
      var s = "";
      for (var x = 0; x < COLS; x++) s += grid[(y + HID) * COLS + x] ? "#" : ".";
      return s;
    },
    start: startRun,
    toMenu: toMenu,
    move: tryMove,
    rotate: tryRotate,
    hard: hardDrop,
    holdNow: doHold,
    turn: turnBoard,
    board: function () { return mael; },
    view: function () { return { angle: viewAngle(), t: view.t, cell: mcell, cx: mcx, cy: mcy }; },
    areas: playAreas,
    switches: function () { return { intense: intense, juggle: juggle }; },
    test: {
      fill: function (visRow, cols) {           // paint cells on a visible row
        for (var i = 0; i < cols.length; i++) grid[(visRow + HID) * COLS + cols[i]] = 1;
      },
      setGoal: function (n) { goal = n; hudDom(); },
      setLines: function (n) { lines = n; hudDom(); },
      setGrav: function (ms) { gravOverride = ms; },
      setPiece: function (t) { piece = { t: t, r: 0, x: t === "O" ? 4 : 3, y: 0 }; },
      // the Visual FX off marks: what the last frame drew, and time left (s)
      marks: function () {
        return { dropDrawn: drawn.drop, clearDrawn: drawn.clear.slice(), trailDrawn: drawn.trail,
          dropLeft: dropMark ? dropMark.life : 0, clearLeft: clearMark ? clearMark.life : 0 };
      }
    }
  };
})();
