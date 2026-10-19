/* =====================================================================
   Abyss: Maelstrom, the board shaped like a plus.

   A 10 x 10 core with four arms, each 10 wide and 8 deep, on a 26 x 26
   grid (its four 8 x 8 corners are rock). Pieces sink from the arm at the
   top toward the middle, and the whole board turns a quarter at a time,
   bringing another arm to the top. A full line of 10 clears anywhere: across
   an arm, or across the core either way, and the blocks beyond it slide in
   toward the middle.

   A piece's place is kept in its arm's own frame: lx across the arm (0 to 9),
   ly from the arm's outer edge in (0 to 7 the arm, 8 to 17 the core, on into
   the opposite arm). Rows above the edge (ly < 0) are open water: a piece
   may pass through, but one locked with a block there ends the dive. Arm k
   counts clockwise from the top one as the dive begins (0 north, 1 east, 2
   south, 3 west); the board's own grid never turns, only the view of it.

   How deep a piece sinks: to the core's far edge while the opposite arm is
   still closed, to the middle line once it's open (the far half then
   belongs to that arm's pieces).

   One piece at a time (single): it is always in the arm at the top, and when
   the board turns it stays where it is on the screen while the board turns
   under it (the turn is refused if it wouldn't fit there). Juggle: every
   open arm has a piece of its own sinking toward the middle at once; the
   one at the top is the one the keys move, and the pieces block each other.

   The rules only: game.js draws it, times it, scores it and takes the keys.
   ===================================================================== */
(function (root) {
  "use strict";

  var S = 26, MID = 13;
  function idx(x, y) { return x + y * S; }
  function inPlus(x, y) { return x >= 0 && y >= 0 && x < S && y < S && ((x >= 8 && x < 18) || (y >= 8 && y < 18)); }
  // arm k's frame to the board's: the north arm's (lx + 8, ly), turned k quarters clockwise
  function toBoard(k, lx, ly) {
    var x = lx + 8, y = ly, t;
    for (var i = 0; i < k; i++) { t = x; x = S - 1 - y; y = t; }
    return [x, y];
  }

  // T: the piece tables game.js keeps (TYPES, ROT, KI, KJ, BASE). hooks (all
  // optional): lock(k), clear(n, cells) -> ms the lines take to dissolve,
  // collapsed() once they're gone, over(), spawn(k), turn(from, to)
  function create(T, hooks) {
    hooks = hooks || {};
    var grid = new Uint8Array(S * S), open = [true, false, false, false];
    var top = 0, juggle = false, pcs = [null, null, null, null];
    var queue = [], bag = [], hold = null, canHold = true, over = false;
    var clearing = null;          // { cells: [board index], left: s } while full lines dissolve
    var TYPES = "IJLOSTZ";

    function newBag() {
      var b = TYPES.split("");
      for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = b[i]; b[i] = b[j]; b[j] = t; }
      return b;
    }
    function refill() { while (queue.length < 7) { if (!bag.length) bag = newBag(); queue.push(bag.shift()); } }
    function floorOf(k) { return open[(k + 2) % 4] ? MID : 18; }

    // the board cells the pieces other than `self` are on
    function taken(self) {
      var out = {};
      pcs.forEach(function (p) {
        if (!p || p === self) return;
        T.ROT[p.t][p.r].forEach(function (c) {
          var ly = p.y + c[1];
          if (ly < 0) return;
          var b = toBoard(p.k, p.x + c[0], ly);
          out[idx(b[0], b[1])] = true;
        });
      });
      return out;
    }
    function fitsIn(k, t, r, x, y, self) {
      var cs = T.ROT[t][r], fl = floorOf(k), busy = juggle ? taken(self) : null;
      for (var i = 0; i < cs.length; i++) {
        var lx = x + cs[i][0], ly = y + cs[i][1];
        if (lx < 0 || lx > 9 || ly >= fl) return false;
        if (ly < 0) continue;
        if (ly < 8 && !open[k]) return false;
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

    // which arms get a piece: in single play the one at the top, in juggle every open one
    function fillArms() {
      if (over || clearing) return;
      if (!juggle) { if (!pcs[top]) spawn(top, next()); return; }
      for (var k = 0; k < 4 && !over; k++) if (open[k] && !pcs[k]) spawn(k, next());
    }

    function start(opts) {
      grid = new Uint8Array(S * S);
      juggle = !!opts.juggle;
      open = [true, !!opts.all, !!opts.all, !!opts.all];
      top = 0; pcs = [null, null, null, null];
      queue = []; bag = []; hold = null; canHold = true; over = false; clearing = null;
      fillArms();
    }

    // ---- the piece the keys move (the one at the top) --------------------
    function ctl() { return over || clearing ? null : pcs[top]; }
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

    // ---- the turn ---------------------------------------------------------
    // dir +1: the board turns clockwise (the arm on the left comes to the
    // top), -1 the other way; a closed arm is passed over to the next open
    // one. Refused (false) with no other arm open, mid-clear, or (single)
    // when the piece wouldn't fit where it is in the new top arm.
    function turn(dir) {
      if (over || clearing) return false;
      var to = top;
      for (var n = 0; n < 3; n++) {
        to = (to + (dir > 0 ? 3 : 1)) % 4;
        if (open[to]) break;
      }
      if (to === top || !open[to]) return false;
      var p = pcs[top];
      if (!juggle && p) {
        if (!fitsIn(to, p.t, p.r, p.x, p.y, p)) return false;
        pcs[top] = null; p.k = to; pcs[to] = p;
      }
      var from = top;
      top = to;
      if (pcs[top]) onShift(pcs[top]);
      if (hooks.turn) hooks.turn(from, to);
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
      var full = fullLines();
      if (full.count) {
        clearing = { cells: full.cells, lines: full, left: 0 };
        clearing.left = hooks.clear ? hooks.clear(full.count, full.cells) || 0 : 0;
        return;
      }
      fillArms();
    }
    // every full line of 10: across each open arm, and the core's rows and columns
    function fullLines() {
      var rows = {}, cols = {}, cells = {}, count = 0;
      function line(list) {
        for (var i = 0; i < list.length; i++) if (!grid[list[i]]) return false;
        list.forEach(function (n) { cells[n] = true; });
        count++;
        return true;
      }
      for (var k = 0; k < 4; k++) {
        if (!open[k]) continue;
        for (var d = 0; d < 8; d++) {
          var list = [];
          for (var lx = 0; lx < 10; lx++) { var b = toBoard(k, lx, d); list.push(idx(b[0], b[1])); }
          if (line(list)) {
            var b0 = toBoard(k, 0, d);
            if (k % 2 === 0) rows[b0[1]] = true; else cols[b0[0]] = true;
          }
        }
      }
      for (var i = 8; i < 18; i++) {
        var row = [], col = [];
        for (var j = 8; j < 18; j++) { row.push(idx(j, i)); col.push(idx(i, j)); }
        if (line(row)) rows[i] = true;
        if (line(col)) cols[i] = true;
      }
      return { count: count, rows: rows, cols: cols, cells: Object.keys(cells).map(Number) };
    }
    // the cleared cells go, then what lay beyond each line slides in toward
    // the floor its pieces sink to: along the board's up-down band (the north
    // and south arms and the core's rows) first, then across (the west and
    // east arms and the core's columns). With both arms of a band open (or
    // neither) each half slides in toward the middle line; with one, the band
    // is that arm's well and slides toward the core's far edge. A line's place
    // is skipped only where it's still empty, so a block the first slide
    // brought into a cleared column stays.
    function collapse() {
      var L = clearing.lines;
      clearing.cells.forEach(function (n) { grid[n] = 0; });
      function pack(get, set, fromIn, toOut, cleared) {
        // fromIn..toOut walks outward from the middle; cleared: positions to drop where empty
        var keep = [], step = toOut > fromIn ? 1 : -1, n = Math.abs(toOut - fromIn) + 1, i, at;
        for (i = 0, at = fromIn; i < n; i++, at += step) if (!(cleared[at] && !get(at))) keep.push(get(at));
        for (i = 0, at = fromIn; i < n; i++, at += step) set(at, i < keep.length ? keep[i] : 0);
      }
      // a band: `near` the arm at its low end (north, west), `far` the other
      function band(get, set, near, far, cleared) {
        if (near && !far) pack(get, set, 17, 0, cleared);
        else if (far && !near) pack(get, set, 8, S - 1, cleared);
        else { pack(get, set, MID - 1, 0, cleared); pack(get, set, MID, S - 1, cleared); }
      }
      var x, y;
      for (x = 8; x < 18; x++) {
        (function (x) {
          band(function (y) { return grid[idx(x, y)]; }, function (y, v) { grid[idx(x, y)] = v; }, open[0], open[2], L.rows);
        })(x);
      }
      for (y = 8; y < 18; y++) {
        (function (y) {
          band(function (x) { return grid[idx(x, y)]; }, function (x, v) { grid[idx(x, y)] = v; }, open[3], open[1], L.cols);
        })(y);
      }
      clearing = null;
      if (hooks.collapsed) hooks.collapsed();
      settlePieces();
      fillArms();
    }
    // a piece the slide (or a newly opened arm's shorter floor) now overlaps
    // is lifted back out toward its own edge until it's clear
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

    // arms open as the dive goes on (n of them, clockwise from the first)
    function openArms(n) {
      var changed = false;
      for (var k = 0; k < Math.min(4, n); k++) if (!open[k]) { open[k] = true; changed = true; }
      if (changed) { settlePieces(); fillArms(); }
      return changed;
    }

    return {
      start: start, update: update, move: move, rotate: rotate, soft: soft, hard: hard, hold: doHold, turn: turn,
      ghostY: ghostY, openArms: openArms, fits: fits,
      get top() { return top; }, get juggle() { return juggle; }, get over() { return over; },
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
        lock: lock, collapse: function () { if (clearing) collapse(); }, full: fullLines
      }
    };
  }

  var api = { create: create, toBoard: toBoard, inPlus: inPlus, SIZE: S, MID: MID };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AbyssMaelstrom = api;
})(this);
