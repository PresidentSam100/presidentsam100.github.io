/* =====================================================================
   Darkroom — nonogram logic, shared by the page and by check-puzzles.js
   (Node). No DOM.

   A picture is rows of "." and "#". Cells during solving are 0 unknown,
   1 filled, 2 empty. The solver plays like a careful human: it looks at
   one line at a time, tries every placement of that line's clue runs
   that fits what's known, and keeps only what every placement agrees
   on. If that alone finishes the grid, the puzzle needs no guessing —
   and the solution is unique. Every shipped puzzle must pass it.

   Nono.cluesOf(rows) -> { rows: [[..]], cols: [[..]] }   ([] is a "0" line)
   Nono.solve(clues, w, h) -> { solved, contradiction, grid, passes }
   Nono.lineSolve(clue, cells) -> updated cells or null on contradiction
   Nono.daily(dayNumber, w, h) -> { rows, tries }   same for everyone
   Nono.mulberry(seed) -> rng()
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.DarkroomNono = mod;
})(this, function () {
  "use strict";

  function runsOf(line) {
    var out = [], n = 0;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === "#" || line[i] === 1) n++;
      else if (n) { out.push(n); n = 0; }
    }
    if (n) out.push(n);
    return out;
  }
  function cluesOf(rows) {
    var w = rows[0].length, cols = [];
    for (var x = 0; x < w; x++) {
      var col = "";
      for (var y = 0; y < rows.length; y++) col += rows[y][x];
      cols.push(runsOf(col));
    }
    return { rows: rows.map(runsOf), cols: cols };
  }

  // All placements of `clue` runs into `cells` that respect what's known;
  // returns per-cell agreement (1, 2, or 0 where placements disagree), or
  // null if nothing fits.
  function lineSolve(clue, cells) {
    var n = cells.length;
    var mustFill = new Array(n).fill(true), mustEmpty = new Array(n).fill(true), any = false;
    var line = new Array(n);
    function place(ci, at) {
      if (ci === clue.length) {
        for (var i = at; i < n; i++) {
          if (cells[i] === 1) return;
          line[i] = 2;
        }
        any = true;
        for (var k = 0; k < n; k++) {
          if (line[k] === 1) mustEmpty[k] = false; else mustFill[k] = false;
        }
        return;
      }
      var len = clue[ci], rest = 0;
      for (var c = ci + 1; c < clue.length; c++) rest += clue[c] + 1;
      for (var s = at; s + len + rest <= n; s++) {
        if (cells[s - 1] === 1) break;             // can't skip past a known fill
        var ok = true;
        for (var j = s; j < s + len; j++) if (cells[j] === 2) { ok = false; break; }
        if (ok && (s + len === n || cells[s + len] !== 1)) {
          for (var g = at; g < s; g++) line[g] = 2;
          for (var f = s; f < s + len; f++) line[f] = 1;
          if (s + len < n) line[s + len] = 2;
          place(ci + 1, s + len + 1);
        }
      }
    }
    if (!clue.length) {
      for (var e = 0; e < n; e++) if (cells[e] === 1) return null;
      return new Array(n).fill(2);
    }
    place(0, 0);
    if (!any) return null;
    var out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = mustFill[i] ? 1 : mustEmpty[i] ? 2 : cells[i];
    return out;
  }

  function solve(clues, w, h) {
    var grid = new Array(w * h).fill(0), passes = 0, changed = true;
    while (changed && passes < 200) {
      changed = false;
      passes++;
      for (var y = 0; y < h; y++) {
        var row = [];
        for (var x = 0; x < w; x++) row.push(grid[y * w + x]);
        var r2 = lineSolve(clues.rows[y], row);
        if (!r2) return { solved: false, contradiction: true, grid: grid, passes: passes };
        for (var x2 = 0; x2 < w; x2++) if (r2[x2] !== grid[y * w + x2]) { grid[y * w + x2] = r2[x2]; changed = true; }
      }
      for (var cx = 0; cx < w; cx++) {
        var col = [];
        for (var cy = 0; cy < h; cy++) col.push(grid[cy * w + cx]);
        var c2 = lineSolve(clues.cols[cx], col);
        if (!c2) return { solved: false, contradiction: true, grid: grid, passes: passes };
        for (var cy2 = 0; cy2 < h; cy2++) if (c2[cy2] !== grid[cy2 * w + cx]) { grid[cy2 * w + cx] = c2[cy2], changed = true; }
      }
    }
    var solved = grid.indexOf(0) === -1;
    return { solved: solved, contradiction: false, grid: grid, passes: passes };
  }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The daily negative: a random abstract pattern, retried deterministically
  // until the line solver can finish it — so every player gets the same
  // guess-free puzzle for a given day number.
  function daily(dayNumber, w, h) {
    w = w || 10; h = h || 10;
    for (var k = 0; k < 400; k++) {
      var rng = mulberry(dayNumber * 977 + k * 7919 + 12345);
      var density = 0.42 + rng() * 0.16;
      var rows = [];
      for (var y = 0; y < h; y++) {
        var r = "";
        for (var x = 0; x < w; x++) r += rng() < density ? "#" : ".";
        rows.push(r);
      }
      var filled = rows.join("").split("#").length - 1;
      if (filled < w * h * 0.3 || filled > w * h * 0.68) continue;
      var res = solve(cluesOf(rows), w, h);
      if (res.solved) return { rows: rows, tries: k };
    }
    // Unreachable in practice; a fallback that always solves.
    var fb = [];
    for (var fy = 0; fy < h; fy++) fb.push(new Array(w + 1).join(fy % 2 ? "#." : ".#").slice(0, w));
    return { rows: fb, tries: -1 };
  }

  return { runsOf: runsOf, cluesOf: cluesOf, lineSolve: lineSolve, solve: solve, daily: daily, mulberry: mulberry };
});
