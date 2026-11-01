/* =====================================================================
   Abyss: Maelstrom, the board shaped like a plus.

   A 10 x 10 core with four arms, each 10 wide and 10 deep, on a 30 x 30
   grid (its four 10 x 10 corners are rock). Each arm and the core together
   are that arm's well, the standard 10 wide and 20 deep: its pieces sink
   from the arm's outer edge to the core's far edge, whether the arm across
   is open or not. Each piece comes in from an open arm the board picks (a
   few in a row from one, then another), and before it does, the whole board
   turns by itself to bring that arm to the top.

   A full row clears only in the well of the arm whose piece just landed:
   one of its 20 rows across, the rows above it coming down one toward that
   well's floor. Never a column, and never a line in another arm's well: a
   row another side's pieces fill across this well clears when the board
   turns this arm to the top, before its first piece comes in.

   A piece's place is kept in its arm's own frame: lx across the arm (0 to 9),
   ly from the arm's outer edge in (0 to 9 the arm, 10 to 19 the core). Rows
   above the edge (ly < 0) are open water: a piece may pass through, but one
   locked with a block there ends the dive. Arm k counts clockwise from the
   top one as the dive begins (0 north, 1 east, 2 south, 3 west); the board's
   own grid never turns, only the view of it.

   One piece at a time, always in the arm at the top. The arm the next one
   comes from is known as the current one sinks (nextArm), and the turn to
   it happens between pieces, with none in play: game.js says how long it
   takes, and the rules wait it out.

   Juggle (opts.juggle): every arm open, and each has a piece of its own
   sinking at once; the pieces block each other. The keys move the one in
   the arm at the top, and the player turns the board a quarter either way
   (turn) to bring another arm's piece to the top. An arm whose piece is
   down gets the next one at once.

   The rules only: game.js draws it, times it, scores it and takes the keys.
   ===================================================================== */
(function (root) {
  "use strict";

  var ARM = 10, CORE = 10, S = 2 * ARM + CORE, MID = S / 2;
  var C0 = ARM, C1 = ARM + CORE;      // the core's first row and column, and one past its last
  var FLOOR = ARM + CORE;             // every arm's well: ly 0 to 19
  function idx(x, y) { return x + y * S; }
  function inPlus(x, y) { return x >= 0 && y >= 0 && x < S && y < S && ((x >= C0 && x < C1) || (y >= C0 && y < C1)); }
  // arm k's frame to the board's: the north arm's (lx + C0, ly), turned k quarters clockwise
  function toBoard(k, lx, ly) {
    var x = lx + C0, y = ly, t;
    for (var i = 0; i < k; i++) { t = x; x = S - 1 - y; y = t; }
    return [x, y];
  }

  // T: the piece tables game.js keeps (TYPES, ROT, KI, KJ, BASE). hooks (all
  // optional): lock(k), clear(n, cells) -> ms the lines take to dissolve,
  // collapsed() once they're gone, over(), spawn(k), turn(from, to, dir,
  // quarters) -> ms the board takes to turn
  function create(T, hooks) {
    hooks = hooks || {};
    var grid = new Uint8Array(S * S), open = [true, false, false, false];
    var top = 0, pcs = [null, null, null, null], juggle = false;
    var queue = [], bag = [], hold = null, canHold = true, over = false;
    var clearing = null;          // { cells: [board index], left: ms } while full lines dissolve
    var turning = null;           // { from, to, dir, quarters, ms, left } while the board turns to the next arm
    // the arms the pieces come from: runs of a few from one open arm, then
    // another (an arm just opened has the next run)
    var nextArm = 0, runArm = 0, runLeft = 0, fresh = null;
    var TYPES = "IJLOSTZ";

    function newBag() {
      var b = TYPES.split("");
      for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = b[i]; b[i] = b[j]; b[j] = t; }
      return b;
    }
    function refill() { while (queue.length < 7) { if (!bag.length) bag = newBag(); queue.push(bag.shift()); } }

    // (Juggle) the cells the other pieces in play hold: they block each other
    function taken(self) {
      var out = {};
      pcs.forEach(function (p) {
        if (!p || p === self) return;
        cellsOf(p).forEach(function (c) { if (c[1] >= 0) { var b = toBoard(p.k, c[0], c[1]); out[idx(b[0], b[1])] = true; } });
      });
      return out;
    }
    function fitsIn(k, t, r, x, y, self) {
      var cs = T.ROT[t][r], busy = juggle ? taken(self) : null;
      for (var i = 0; i < cs.length; i++) {
        var lx = x + cs[i][0], ly = y + cs[i][1];
        if (lx < 0 || lx > 9 || ly >= FLOOR) return false;
        if (ly < 0) continue;
        if (ly < ARM && !open[k]) return false;
        var b = toBoard(k, lx, ly), n = idx(b[0], b[1]);
        if (grid[n] || (busy && busy[n])) return false;
      }
      return true;
    }
    function fits(p, r, x, y) { return fitsIn(p.k, p.t, r, x, y, p); }

    function spawn(k, t) {
      var p = { t: t, r: 0, x: T.BASE[t].n >= 3 ? 3 : 4, y: -1, k: k, gravT: 0, lockT: 0, resets: 0, lowY: -1 };
      pcs[k] = p;
      if (!fits(p, p.r, p.x, p.y)) { pcs[k] = null; end(); return null; }
      if (hooks.spawn) hooks.spawn(k);
      return p;
    }
    function next() { refill(); return queue.shift(); }
    function end() { if (over) return; over = true; if (hooks.over) hooks.over(); }

    // ---- which arm, and the turn to it ---------------------------------------
    function runLength() { return 3 + Math.floor(Math.random() * 3); }   // 3 to 5 pieces from an arm
    function pickArm() {
      if (fresh != null && open[fresh]) { runArm = fresh; runLeft = runLength(); }
      else if (runLeft <= 0 || !open[runArm]) {
        var others = [];
        for (var k = 0; k < 4; k++) if (open[k] && k !== runArm) others.push(k);
        if (others.length) runArm = others[Math.floor(Math.random() * others.length)];
        runLeft = runLength();
      }
      fresh = null;
      runLeft--;
      return runArm;
    }
    // the next piece: in the arm at the top if it comes from there, or else
    // once the board has turned that arm to the top
    // (Juggle: every arm without one gets the next piece at once)
    function fill() {
      if (over || clearing || turning) return;
      if (juggle) { for (var k = 0; k < 4 && !over; k++) if (open[k] && !pcs[k]) spawn(k, next()); return; }
      if (pcs[top]) return;
      if (nextArm !== top && open[nextArm]) { beginTurn(nextArm); return; }
      if (spawn(top, next())) nextArm = pickArm();
    }
    // dir +1: the board turns clockwise (the arm on the left comes to the
    // top), -1 the other way; the arm across is half a turn, clockwise
    function beginTurn(to) {
      var s = ((top - to) % 4 + 4) % 4;
      turning = { from: top, to: to, dir: s === 3 ? -1 : 1, quarters: s === 3 ? 1 : s, ms: 0, left: 0 };
      turning.ms = turning.left = hooks.turn ? hooks.turn(turning.from, to, turning.dir, turning.quarters) || 0 : 0;
      if (turning.left <= 0) endTurn();
    }
    // the turn done: rows the other sides' pieces filled across this well
    // clear now, before its first piece comes in
    function endTurn() { top = turning.to; turning = null; if (!clearRows(top)) fill(); }
    // Juggle: the player turns the board a quarter, at once (dir +1
    // clockwise: the arm on the left comes to the top; -1 the other way).
    // The pieces keep their places in their arms; the keys take the one now
    // at the top, and rows filled across its well clear now.
    function turn(dir) {
      if (!juggle || over || clearing) return false;
      var from = top;
      top = (top + (dir > 0 ? 3 : 1)) % 4;
      if (hooks.turn) hooks.turn(from, top, dir > 0 ? 1 : -1, 1);
      if (!clearRows(top)) fill();
      return true;
    }

    function start(opts) {
      grid = new Uint8Array(S * S);
      juggle = !!opts.juggle;
      open = [true, !!(opts.all || juggle), !!(opts.all || juggle), !!(opts.all || juggle)];
      top = 0; pcs = [null, null, null, null];
      queue = []; bag = []; hold = null; canHold = true; over = false; clearing = null; turning = null;
      runArm = 0; runLeft = runLength(); fresh = null;
      nextArm = pickArm();
      fill();
    }

    // ---- the piece the keys move (the one at the top) --------------------
    function ctl() { return over || clearing || turning ? null : pcs[top]; }
    function onShift(p) {
      if (!fits(p, p.r, p.x, p.y + 1) && p.resets < 15) { p.lockT = 0; p.resets++; }
    }
    function move(dx) {
      var p = ctl();
      if (!p || !fits(p, p.r, p.x + dx, p.y)) return false;
      p.x += dx; onShift(p);
      return true;
    }
    function rotate(dir) {
      var p = ctl();
      if (!p || p.t === "O") return false;
      var from = p.r, to = (p.r + (dir > 0 ? 1 : 3)) % 4;
      var table = (p.t === "I" ? T.KI : T.KJ)[from + ">" + to];
      for (var i = 0; i < table.length; i++) {
        var kx = table[i][0], ky = -table[i][1];      // y-up table, y-down world
        if (fits(p, to, p.x + kx, p.y + ky)) {
          p.r = to; p.x += kx; p.y += ky;
          onShift(p);
          return i + 1;
        }
      }
      return false;
    }
    function ghostY(p) {
      p = p || ctl();
      if (!p) return null;
      var y = p.y;
      while (fits(p, p.r, p.x, y + 1)) y++;
      return y;
    }
    function soft() {
      var p = ctl();
      if (!p || !fits(p, p.r, p.x, p.y + 1)) return false;
      p.y++; p.gravT = 0;
      return true;
    }
    // a hard drop: how many rows it fell, and the cells it landed on (its frame, before the lock)
    function hard() {
      var p = ctl();
      if (!p) return null;
      var from = p.y, to = ghostY(p);
      p.y = to;
      var landed = cellsOf(p);
      lock(p.k);
      return { dist: to - from, cells: landed, t: p.t, k: p.k, r: p.r, x: p.x, from: from, to: to };
    }
    function doHold() {
      var p = ctl();
      if (!p || !canHold) return false;
      var t = p.t;
      pcs[top] = null;
      if (hold) { var h = hold; hold = t; spawn(top, h); }
      else { hold = t; spawn(top, next()); }
      canHold = false;
      return true;
    }

    // ---- gravity, locking, clearing ----------------------------------------
    function cellsOf(p) {
      return T.ROT[p.t][p.r].map(function (c) { return [p.x + c[0], p.y + c[1]]; });
    }
    function lock(k) {
      var p = pcs[k];
      if (!p) return;
      pcs[k] = null;
      canHold = true;                 // (a hold is good again once any piece is down)
      var out = false, code = T.TYPES.indexOf(p.t) + 1;
      cellsOf(p).forEach(function (c) {
        if (c[1] < 0) { out = true; return; }
        var b = toBoard(k, c[0], c[1]);
        grid[idx(b[0], b[1])] = code;
      });
      if (hooks.lock) hooks.lock(k);
      if (out) { end(); return; }
      if (!clearRows(k)) fill();
    }
    // arm k's well's full rows start to clear (true), or there are none
    function clearRows(k) {
      var full = fullLines(k);
      if (!full.count) return false;
      clearing = { cells: full.cells, lines: full, left: 0 };
      clearing.left = hooks.clear ? hooks.clear(full.count, full.cells) || 0 : 0;
      return true;
    }
    // the full rows of arm k's well (its own frame's rows, ly 0 to 19)
    function fullLines(k) {
      var rows = [], cells = [];
      for (var ly = 0; ly < FLOOR; ly++) {
        var list = [];
        for (var lx = 0; lx < 10; lx++) {
          var b = toBoard(k, lx, ly), n = idx(b[0], b[1]);
          if (!grid[n]) break;
          list.push(n);
        }
        if (list.length === 10) { rows.push(ly); cells = cells.concat(list); }
      }
      return { count: rows.length, k: k, rows: rows, cells: cells };
    }
    // the cleared rows go, and the rows above them (toward the well's outer
    // edge) come down to fill them, toward that well's floor
    function collapse() {
      var L = clearing.lines, k = L.k, gone = {};
      L.rows.forEach(function (ly) { gone[ly] = true; });
      for (var lx = 0; lx < 10; lx++) {
        var keep = [], ly, b, i;
        for (ly = FLOOR - 1; ly >= 0; ly--) if (!gone[ly]) { b = toBoard(k, lx, ly); keep.push(grid[idx(b[0], b[1])]); }
        for (ly = FLOOR - 1, i = 0; ly >= 0; ly--, i++) { b = toBoard(k, lx, ly); grid[idx(b[0], b[1])] = i < keep.length ? keep[i] : 0; }
      }
      clearing = null;
      if (hooks.collapsed) hooks.collapsed();
      settlePieces();
      fill();
    }
    // a piece the slide now overlaps is lifted back out toward its own edge
    // until it's clear
    function settlePieces() {
      pcs.forEach(function (p) {
        if (!p) return;
        while (!fits(p, p.r, p.x, p.y)) p.y--;
        if (p.lowY > p.y) p.lowY = p.y;
      });
    }

    // dt in ms; grav: ms a row; the piece at the top falls by the keys too (game.js)
    function update(dt, grav) {
      if (over) return;
      if (clearing) {
        clearing.left -= dt;
        if (clearing.left <= 0) collapse();
        return;
      }
      if (turning) {
        turning.left -= dt;
        if (turning.left <= 0) endTurn();
        return;
      }
      for (var k = 0; k < 4; k++) {
        var p = pcs[k];
        if (!p) continue;
        // a new lowest row is a fresh landing: the lock delay and its resets start over
        if (p.y > p.lowY) { p.lowY = p.y; p.lockT = 0; p.resets = 0; }
        if (!fits(p, p.r, p.x, p.y + 1)) {
          p.lockT += dt;
          if (p.lockT >= 500) { lock(k); if (over || clearing) return; }
        } else {
          p.gravT += dt;
          while (p.gravT >= grav) {
            p.gravT -= grav;
            if (fits(p, p.r, p.x, p.y + 1)) p.y++;
            else break;
          }
        }
      }
    }

    // arms open as the dive goes on (n of them, clockwise from the first);
    // the newest has the run after the next piece (that one's arm is known)
    function openArms(n) {
      var changed = false;
      for (var k = 0; k < Math.min(4, n); k++) if (!open[k]) { open[k] = true; changed = true; fresh = k; }
      if (changed) { settlePieces(); fill(); }
      return changed;
    }

    return {
      start: start, update: update, move: move, rotate: rotate, soft: soft, hard: hard, hold: doHold, turn: turn,
      ghostY: ghostY, openArms: openArms, fits: fits,
      get top() { return top; }, get juggle() { return juggle; }, get over() { return over; }, get turning() { return turning; }, get nextArm() { return nextArm; },
      get clearing() { return clearing; }, get hold() { return hold; }, get canHold() { return canHold; },
      get queue() { refill(); return queue; }, get grid() { return grid; }, get open() { return open; },
      piece: function (k) { return pcs[k == null ? top : k]; },
      pieces: function () { return pcs.slice(); },
      cellsOf: cellsOf,
      // test hooks
      test: {
        set: function (x, y, v) { grid[idx(x, y)] = v; },
        get: function (x, y) { return grid[idx(x, y)]; },
        place: function (k, t, r, x, y) { pcs[k] = { t: t, r: r || 0, x: x, y: y, k: k, gravT: 0, lockT: 0, resets: 0, lowY: y }; return pcs[k]; },
        clearPiece: function (k) { pcs[k] = null; },
        setNext: function (k) { nextArm = k; },
        lock: lock, collapse: function () { if (clearing) collapse(); }, full: function (k) { return fullLines(k == null ? top : k); }
      }
    };
  }

  var api = { create: create, toBoard: toBoard, inPlus: inPlus, SIZE: S, MID: MID, ARM: ARM, CORE: CORE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AbyssMaelstrom = api;
})(this);
