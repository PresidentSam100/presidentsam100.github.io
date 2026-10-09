/* =====================================================================
   Abyss — falling blocks in the bioluminous deep.

   A faithful modern engine under the water: 7-bag randomizer, SRS
   rotation with the full wall-kick tables, hold + five-piece preview,
   sonar ghost, DAS/ARR key repeat, 500ms lock delay with capped
   resets, the classic gravity curve, and two modes:

     descent  marathon — the score climbs, the depth gauge sinks
     sprint   clear 40 lines against the clock (best time wins)

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
  var bestScore = window.GameShell ? GameShell.best("abyss_best_descent", { higher: true }) : null;
  var bestKrill = window.GameShell ? GameShell.best("abyss_best_krill", { higher: true }) : null;
  var bestTime = window.GameShell ? GameShell.best("abyss_best_sprint", { higher: false }) : null;

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

  // ---- state ----------------------------------------------------------------
  var state = "menu";               // menu | play | clearing | over
  var mode = store.get("abyss_mode", "descent");
  if (["descent", "sprint", "krill"].indexOf(mode) === -1) mode = "descent";
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
    if (fits(piece.t, piece.r, piece.x + dx, piece.y)) {
      piece.x += dx;
      onShift();
      return true;
    }
    return false;
  }
  function tryRotate(dir) {
    if (state !== "play" || piece.t === "O" || piece.t === "P") return false;
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
    if (fits(piece.t, piece.r, piece.x, piece.y + 1)) { piece.y++; score++; gravT = 0; hudDom(); }
  }
  function hardDrop() {
    if (state !== "play") return;
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
    if (state !== "play" || !canHold) return;
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
      clearT = fx() ? 0.32 : 0.08;
      sweep = 0;
      // FX off: the 80ms clear is too quick to read, so the walls keep
      // pointing at those rows a while after they collapse
      if (!fx()) clearMark = { rows: full.slice(), life: 0.5 };
      var n = full.length;
      var base = LINE_SCORE[n] * level;
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
      var newLevel = 1 + Math.floor(lines / 10);
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
    score = 0; lines = 0; level = 1; b2b = false; playMs = 0;
    particles = []; clearingRows = []; flashT = 0; dropMark = null; clearMark = null; dropTrail = null;
    das.L = null; das.R = null; softHeld = false;
    $("menu").hidden = true; $("over").hidden = true;
    $("hud").hidden = false;
    $("pad").hidden = !("ontouchstart" in window) && !navigator.maxTouchPoints;
    var b = scoreBest();
    startBest = b ? GameShell.store.getNum(b.key, NaN) : NaN;
    sprintDone = false; sprintBest = false; sprintMs = 0;
    state = "play";
    resize();                            // the pad may have appeared
    spawnNext();
    hudDom();
  }

  // ---- bests, saved the moment they're earned ----------------------------------
  // A score best is written as soon as the run passes it, and again as it
  // climbs; a sprint time the instant the last row clears (lock). So a tab
  // closed mid-run, or a quit during the sweep, keeps it. startBest is the
  // best as this run began (NaN: none yet), which "a new record" compares to.
  var startBest = NaN, sprintDone = false, sprintBest = false, sprintMs = 0;
  function scoreBest() { return mode === "descent" ? bestScore : mode === "krill" ? bestKrill : null; }
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
    $("over-title").textContent = mode === "sprint" ? "Lost with the current" : "Crush depth";
    $("over-msg").textContent = score.toLocaleString();
    $("over-stats").textContent =
      lines + " rows cleared · " + (level * 100) + "m down\n" +
      (mode !== "sprint"
        ? (isBest ? "a new record dive! 🦑" : "best: " + (b ? b.get().toLocaleString() : score))
        : lines + "/" + goal + " — the forty lines got away");
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
  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var padEl = $("pad");
    // fixed-position elements have no offsetParent; measure instead
    var padB = (padEl && !padEl.hidden && padEl.getClientRects().length) ? 128 : 24;
    cell = Math.floor(Math.min((H - 86 - padB) / VIS, W / (W > 700 ? 22 : 13)));
    cell = Math.max(14, Math.min(34, cell));
    wellX = Math.round(W / 2 - (COLS * cell) / 2);
    wellY = Math.round(Math.max(W > 700 ? 64 : 104, (H - padB - VIS * cell) / 2 + 30));
    if (!sea) sea = A.makeSea(W, H); else sea.resize(W, H);
  }
  window.addEventListener("resize", resize);

  function px(gx) { return wellX + gx * cell; }
  function py(gy) { return wellY + (gy - HID) * cell; }

  function stackHeight() {
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

  // hold + next drawn as little sonar screens beside the well
  function drawSide() {
    var mini = Math.max(9, Math.floor(cell * 0.55));
    function box(bx, by, bw, bh, label) {
      g.fillStyle = "rgba(2,10,20,0.62)";
      A.rr(g, bx, by, bw, bh, 8); g.fill();
      g.strokeStyle = "rgba(80,200,255,0.3)"; g.lineWidth = 1.5;
      A.rr(g, bx, by, bw, bh, 8); g.stroke();
      g.fillStyle = "rgba(140,200,230,0.75)";
      g.font = "600 10px 'Courier New', monospace";
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
    var bw = mini * 4 + 22;
    var hx = wellX - bw - 14, nx = wellX + COLS * cell + 14;
    var compact = hx < 4 || nx + bw > W - 4;
    if (compact) {
      // phones: hold tucked above-left, three previews above-right
      var topY = wellY - HID * cell - 6 - (mini * 2 + 26);
      if (topY < 40) topY = 40;
      box(px(0) - 4, topY, mini * 3 + 16, mini * 2 + 24, "HOLD");
      if (hold) drawMini(hold, px(0) + 6, topY + 16, mini * 0.8);
      var qx = px(COLS) + 4 - (mini * 3 + 16) * 1;
      box(qx, topY, mini * 3 + 16, mini * 2 + 24, "NEXT");
      for (var q = 0; q < 2; q++) {
        if (queue[q]) drawMini(queue[q], qx + 6 + q * (mini * 1.7), topY + 16, mini * 0.55);
      }
      return;
    }
    box(hx, wellY, bw, mini * 3 + 20, "HOLD");
    if (hold) drawMini(hold, hx + 10, wellY + 20, mini);
    box(nx, wellY, bw, mini * 2.6 * 5 + 20, "NEXT");
    for (var i = 0; i < 5; i++) {
      if (queue[i]) drawMini(queue[i], nx + 10, wellY + 22 + i * mini * 2.6, mini);
    }
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
    keys: ["Escape", "p"],
    onChange: function (paused) { if (paused) letGo(); }
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
        case "ArrowUp": case "KeyX":
          e.preventDefault(); if (!e.repeat) tryRotate(1); return;
        case "KeyZ":
          e.preventDefault(); if (!e.repeat) tryRotate(-1); return;
        case "Space":
          e.preventDefault(); if (!e.repeat) hardDrop(); return;
        case "KeyC": case "ShiftLeft": case "ShiftRight":
          e.preventDefault(); if (!e.repeat) doHold(); return;
      }
      return;
    }
    if (e.repeat) return;
    if (state === "menu") {
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        mode = ["descent", "sprint", "krill"][+e.key - 1];
        store.set("abyss_mode", mode);
        paintMenu();
      } else if (e.key === "Enter") startRun(mode);
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

  // ---- menu ----------------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === mode);
    });
    var parts = [];
    if (bestScore && bestScore.get()) parts.push("Descent " + bestScore.get().toLocaleString());
    if (bestKrill && bestKrill.get()) parts.push("Krill " + bestKrill.get().toLocaleString());
    if (bestTime && bestTime.get()) parts.push("Sprint " + fmtTime(bestTime.get()));
    $("bests").textContent = parts.length ? "records: " + parts.join(" · ") : "the sonar log is empty";
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
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);

  // ---- go ------------------------------------------------------------------------------
  resize();
  toMenu();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks — the Playwright harness drives runs through these
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
    test: {
      fill: function (visRow, cols) {           // paint cells on a visible row
        for (var i = 0; i < cols.length; i++) grid[(visRow + HID) * COLS + cols[i]] = 1;
      },
      setGoal: function (n) { goal = n; hudDom(); },
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
