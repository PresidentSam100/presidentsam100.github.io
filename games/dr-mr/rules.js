/* =====================================================================
   Dr. Mr.: the rules, with no drawing in them (game.js draws and plays).

   The vial is 8 cells across and 16 down (y = 0 is the top row, under the
   neck). A cell holds nothing, a germ, or half a capsule. Germs never
   move. A capsule's two halves are linked: a half knows which way its
   partner lies ("l", "r", "u", "d"), and a half whose partner has been
   cleared is loose (""), falling on its own.

   Four or more of one colour in a row or a column clear, germs and halves
   alike, all at once. Then whatever has nothing under it falls: a loose
   half by itself, a lying capsule only when both its halves are free to,
   a standing one with its lower half. What lands may line up again: a
   chain, scored as part of the same capsule's drop.

   Points: each germ cleared by one capsule (its chain included) is worth
   twice the one before, from 100 at Low speed, 200 at Med, 300 at Hi, up
   to the sixth germ's worth, which every germ after it scores too.
   ===================================================================== */
(function () {
  "use strict";

  var W = 8, H = 16, COLORS = 3, SPAWN_X = 3;
  var SPEEDS = ["low", "med", "hi"];
  var BASE = { low: 100, med: 200, hi: 300 };

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function idx(x, y) { return y * W + x; }
  function inside(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }
  function emptyBoard() { var b = []; for (var i = 0; i < W * H; i++) b.push(null); return b; }
  function copyBoard(b) { return b.map(function (c) { return c && { c: c.c, g: c.g, link: c.link }; }); }
  function at(b, x, y) { return inside(x, y) ? b[idx(x, y)] : null; }
  function germsLeft(b) { var n = 0; for (var i = 0; i < b.length; i++) if (b[i] && b[i].g) n++; return n; }

  // How many germs a level starts with, and how high up the vial they may
  // sit (rows counted from the floor): more, and higher, as levels climb.
  function germCount(level) { return Math.min(84, 4 * (Math.min(20, level) + 1)); }
  function germRows(level) { return level <= 14 ? 10 : level <= 16 ? 11 : level <= 18 ? 12 : 13; }

  // would a germ of colour c at (x, y) make three of a kind in a line?
  // (germs are laid so that no line is ever half made before play starts)
  function makesThree(b, x, y, c) {
    var dirs = [[1, 0], [0, 1]];
    for (var d = 0; d < 2; d++) {
      var dx = dirs[d][0], dy = dirs[d][1], n = 1, k;
      for (k = 1; k < 3; k++) { var p = at(b, x + dx * k, y + dy * k); if (p && p.c === c) n++; else break; }
      for (k = 1; k < 3; k++) { var q = at(b, x - dx * k, y - dy * k); if (q && q.c === c) n++; else break; }
      if (n >= 3) return true;
    }
    return false;
  }

  // a level's germs, laid from a seed (the same seed gives the same vial)
  function makeGerms(level, seed) {
    var b = emptyBoard(), rnd = mulberry(seed), want = germCount(level), top = H - germRows(level);
    var cells = (H - top) * W, placed = 0, tries = 0;
    while (placed < want && tries < want * 40) {
      tries++;
      var x = Math.floor(rnd() * W), y = top + Math.floor(rnd() * (H - top));
      // a taken cell: on to the next free one, row by row (wrapping)
      var start = (y - top) * W + x, found = -1;
      for (var s = 0; s < cells; s++) {
        var k = (start + s) % cells, cx = k % W, cy = top + Math.floor(k / W);
        if (!b[idx(cx, cy)]) { found = idx(cx, cy); x = cx; y = cy; break; }
      }
      if (found < 0) break;
      // the colours in turn, so the three come out about even; the next one
      // where that colour would make three in a line
      var first = placed % COLORS, c = -1;
      for (var t = 0; t < COLORS; t++) { var cc = (first + t) % COLORS; if (!makesThree(b, x, y, cc)) { c = cc; break; } }
      if (c < 0) continue;
      b[found] = { c: c, g: true, link: "" };
      placed++;
    }
    return b;
  }

  // the capsules, in order, from a seed: [colour of half a, colour of half b]
  function capsuleStream(seed) {
    var rnd = mulberry(seed ^ 0x5bd1e995), list = [];
    return function (n) {
      while (list.length <= n) list.push([Math.floor(rnd() * COLORS), Math.floor(rnd() * COLORS)]);
      return list[n].slice();
    };
  }

  /* A falling capsule: its pivot (x, y), the cell that stays put as it
     turns, and its turn (0 to 3). Turned clockwise from lying with a on the
     left: a stands on top of b; then b lies left of a; then b on top of a. */
  function cellsOf(p) {
    switch (p.rot) {
      case 0: return [{ x: p.x, y: p.y, c: p.a, link: "r" }, { x: p.x + 1, y: p.y, c: p.b, link: "l" }];
      case 1: return [{ x: p.x, y: p.y - 1, c: p.a, link: "d" }, { x: p.x, y: p.y, c: p.b, link: "u" }];
      case 2: return [{ x: p.x, y: p.y, c: p.b, link: "r" }, { x: p.x + 1, y: p.y, c: p.a, link: "l" }];
      default: return [{ x: p.x, y: p.y - 1, c: p.b, link: "d" }, { x: p.x, y: p.y, c: p.a, link: "u" }];
    }
  }
  // free for a capsule: inside the walls and empty (above the top row, in
  // the neck, is free: a capsule may stand up there as it comes in)
  function fits(b, p) {
    var cs = cellsOf(p);
    for (var i = 0; i < 2; i++) {
      var c = cs[i];
      if (c.x < 0 || c.x >= W || c.y >= H) return false;
      if (c.y >= 0 && b[idx(c.x, c.y)]) return false;
    }
    return true;
  }
  function spawn(b, pair) {
    var p = { x: SPAWN_X, y: 0, rot: 0, a: pair[0], b: pair[1] };
    return fits(b, p) ? p : null;            // null: the neck is blocked (the vial is full)
  }
  function moved(p, dx, dy) { return { x: p.x + dx, y: p.y + dy, rot: p.rot, a: p.a, b: p.b }; }
  // a turn (dir 1 clockwise, -1 the other way); lying down against the right
  // wall or a piece, it steps one cell left if that cell is free
  function turned(b, p, dir) {
    var q = { x: p.x, y: p.y, rot: (p.rot + (dir > 0 ? 1 : 3)) % 4, a: p.a, b: p.b };
    if (fits(b, q)) return q;
    if (q.rot % 2 === 0) { var k = moved(q, -1, 0); if (fits(b, k)) return k; }
    return null;
  }
  function dropTo(b, p) { var q = p; while (fits(b, moved(q, 0, 1))) q = moved(q, 0, 1); return q; }
  // lay a capsule into the vial; false if any of it is still above the top
  // row (it came to rest in the neck: the vial is full)
  function lock(b, p) {
    var cs = cellsOf(p), over = false;
    cs.forEach(function (c) { if (c.y < 0) over = true; else b[idx(c.x, c.y)] = { c: c.c, g: false, link: c.link }; });
    return !over;
  }

  // every line of four or more of one colour: [{ cells: [i...], c }]
  function runs(b) {
    var out = [];
    function scan(x0, y0, dx, dy, len) {
      var x = x0, y = y0, start = 0, n = 0, c = -1, list = [];
      for (var k = 0; k <= len; k++) {
        var cell = k < len ? b[idx(x, y)] : null, cc = cell ? cell.c : -1;
        if (cc >= 0 && cc === c) { n++; list.push(idx(x, y)); }
        else {
          if (n >= 4) out.push({ cells: list.slice(), c: c });
          c = cc; n = cc >= 0 ? 1 : 0; list = cc >= 0 ? [idx(x, y)] : [];
        }
        x += dx; y += dy;
      }
    }
    for (var y = 0; y < H; y++) scan(0, y, 1, 0, W);
    for (var x = 0; x < W; x++) scan(x, 0, 0, 1, H);
    return out;
  }
  // take the lines out; their capsules' other halves come loose
  // returns { germs, cleared: [i...], runs }
  function clear(b, rs) {
    var gone = {}, germs = 0, list = [];
    rs.forEach(function (r) { r.cells.forEach(function (i) { gone[i] = true; }); });
    Object.keys(gone).forEach(function (k) {
      var i = +k, cell = b[i]; if (!cell) return;
      if (cell.g) germs++;
      list.push({ i: i, c: cell.c, g: cell.g });
      var x = i % W, y = Math.floor(i / W), d = cell.link;
      var px = x + (d === "r" ? 1 : d === "l" ? -1 : 0), py = y + (d === "d" ? 1 : d === "u" ? -1 : 0);
      var partner = d ? at(b, px, py) : null;
      if (partner && !gone[idx(px, py)]) partner.link = "";
      b[i] = null;
    });
    return { germs: germs, cleared: list, runs: rs.length };
  }
  // one step of falling: everything with nothing under it drops a row
  // (a lying capsule only when both its halves can, a standing one with its
  // lower half). Bottom up, so a stack comes down together. Returns the
  // cells that moved, as [from, to] indexes; none: all has landed.
  function fallStep(b) {
    var moves = [];
    for (var y = H - 2; y >= 0; y--) {
      for (var x = 0; x < W; x++) {
        var i = idx(x, y), cell = b[i];
        if (!cell || cell.g) continue;
        var below = idx(x, y + 1);
        if (cell.link === "l" || cell.link === "d") continue;      // (its partner moves it)
        if (cell.link === "r") {
          var j = idx(x + 1, y), below2 = idx(x + 1, y + 1);
          if (!b[below] && !b[below2]) { b[below] = cell; b[below2] = b[j]; b[i] = null; b[j] = null; moves.push([i, below], [j, below2]); }
        } else if (cell.link === "u") {
          var top = idx(x, y - 1);
          if (!b[below]) { b[below] = cell; b[i] = b[top]; b[top] = null; moves.push([i, below], [top, i]); }
        } else if (!b[below]) { b[below] = cell; b[i] = null; moves.push([i, below]); }
      }
    }
    return moves;
  }
  function settle(b) { var n = 0; while (fallStep(b).length) n++; return n; }

  // the points for one capsule's germs, k germs in all (its chain included)
  function points(k, speed) {
    var base = BASE[speed] || 100, sum = 0;
    for (var n = 1; n <= k; n++) sum += base * Math.pow(2, Math.min(n, 6) - 1);
    return sum;
  }
  // a capsule's whole drop, played out at once (the CPU's look ahead, and
  // the tests): lock, then clear and fall until nothing lines up
  function resolve(b, p) {
    if (!lock(b, p)) return { over: true, germs: 0, runs: 0, colors: [] };
    var germs = 0, nruns = 0, colors = [], rs;
    while ((rs = runs(b)).length) {
      rs.forEach(function (r) { colors.push(r.c); });
      var c = clear(b, rs); germs += c.germs; nruns += c.runs;
      settle(b);
    }
    return { over: false, germs: germs, runs: nruns, colors: colors };
  }
  // what a chain sends the other vial: two lines or more cleared by one
  // capsule send that many loose halves (four at most), in their colours
  function junkFor(nruns, colors) { return nruns >= 2 ? colors.slice(0, 4) : []; }
  // loose halves dropped in from the top, spread across the vial: as many
  // as there are free columns at the top row (the rest are lost)
  function dropJunk(b, colors, rnd) {
    var cols = [0, 1, 2, 3, 4, 5, 6, 7].filter(function (x) { return !b[idx(x, 0)]; });
    for (var i = cols.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
    var put = [];
    colors.forEach(function (c, k) { if (k < cols.length) { b[idx(cols[k], 0)] = { c: c, g: false, link: "" }; put.push(cols[k]); } });
    return put;
  }
  // Endless: the culture grows a row from the floor, pushing all of it up.
  // false (nothing changed) if the top row is taken: the vial overflows.
  function growRow(b, rnd, n) {
    for (var x = 0; x < W; x++) if (b[idx(x, 0)]) return false;
    for (var y = 0; y < H - 1; y++) for (var x2 = 0; x2 < W; x2++) b[idx(x2, y)] = b[idx(x2, y + 1)];
    for (var x3 = 0; x3 < W; x3++) b[idx(x3, H - 1)] = null;
    var cols = [0, 1, 2, 3, 4, 5, 6, 7];
    for (var i = cols.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
    var put = 0;
    for (var k = 0; k < cols.length && put < n; k++) {
      var cx = cols[k], first = Math.floor(rnd() * COLORS);
      for (var tc = 0; tc < COLORS; tc++) {
        var c = (first + tc) % COLORS;
        if (!makesThree(b, cx, H - 1, c)) { b[idx(cx, H - 1)] = { c: c, g: true, link: "" }; put++; break; }
      }
    }
    return true;
  }

  /* ---- the CPU's eye -------------------------------------------------------
     Every place the capsule can reach from where it is (left, right, a turn
     either way, down), and where each one comes to rest. Each is judged by
     what it leaves: germs and lines cleared first, then colours laid on
     their own colour, then nothing laid over a germ of another colour, and
     the stack kept low and the neck clear. */
  function key(p) { return p.x + "," + p.y + "," + p.rot; }
  function reach(b, p) {
    var seen = {}, queue = [p], from = {}, rests = [];
    seen[key(p)] = true;
    while (queue.length) {
      var q = queue.shift();
      var steps = [["left", moved(q, -1, 0)], ["right", moved(q, 1, 0)], ["cw", turned(b, q, 1)], ["ccw", turned(b, q, -1)], ["down", moved(q, 0, 1)]];
      if (!fits(b, moved(q, 0, 1))) rests.push(q);
      for (var s = 0; s < steps.length; s++) {
        var n = steps[s][1];
        if (!n || !fits(b, n) || seen[key(n)]) continue;
        seen[key(n)] = true; from[key(n)] = [key(q), steps[s][0]]; queue.push(n);
      }
    }
    return { rests: rests, from: from, start: key(p) };
  }
  function pathTo(r, target) {
    var path = [], k = key(target);
    while (k !== r.start && r.from[k]) { path.unshift(r.from[k][1]); k = r.from[k][0]; }
    return k === r.start ? path : null;
  }
  function judge(before, p) {
    var b = copyBoard(before), res = resolve(b, p);
    if (res.over) return -1e9;
    var score = res.germs * 1200 + res.runs * 250;
    // colours laid on or beside their own colour; laid over another colour's germ
    cellsOf(p).forEach(function (c) {
      if (c.y < 0) return;
      [[0, 1], [1, 0], [-1, 0], [0, -1]].forEach(function (d) {
        var n = at(before, c.x + d[0], c.y + d[1]);
        if (n && n.c === c.c) score += d[1] === 1 ? 90 : 45;
      });
      for (var y = c.y + 1; y < H; y++) {
        var u = before[idx(c.x, y)];
        if (!u) continue;
        if (u.c !== c.c) score -= u.g ? 140 : 40;
        break;
      }
    });
    // height of the pile and anything near the neck
    for (var i = 0; i < b.length; i++) {
      if (!b[i]) continue;
      var y2 = Math.floor(i / W), x2 = i % W;
      if (y2 < 4) score -= (4 - y2) * ((x2 === 3 || x2 === 4) ? 400 : 60);
    }
    return score;
  }
  // the CPU's choice: the best place (or, choosing loosely, one of the few
  // best), and the moves that take the capsule there
  function plan(b, p, rnd, loose) {
    var r = reach(b, p);
    var scored = r.rests.map(function (q) { return { q: q, s: judge(b, q) }; }).sort(function (u, v) { return v.s - u.s; });
    if (!scored.length) return null;
    var pick = scored[0];
    if (loose && rnd && scored.length > 1 && rnd() < loose) pick = scored[1 + Math.floor(rnd() * Math.min(3, scored.length - 1))];
    return { target: pick.q, path: pathTo(r, pick.q) || [] };
  }

  window.DrMrRules = {
    W: W, H: H, COLORS: COLORS, SPEEDS: SPEEDS, BASE: BASE,
    mulberry: mulberry, idx: idx, emptyBoard: emptyBoard, copyBoard: copyBoard, at: at,
    germCount: germCount, germRows: germRows, germsLeft: germsLeft, makeGerms: makeGerms, capsuleStream: capsuleStream,
    cellsOf: cellsOf, fits: fits, spawn: spawn, moved: moved, turned: turned, dropTo: dropTo, lock: lock,
    runs: runs, clear: clear, fallStep: fallStep, settle: settle, points: points, resolve: resolve,
    junkFor: junkFor, dropJunk: dropJunk, growRow: growRow, reach: reach, pathTo: pathTo, plan: plan, judge: judge
  };
})();
