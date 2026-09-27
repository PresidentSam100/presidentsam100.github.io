/* =====================================================================
   Darkroom — puzzle checker. Node only, NOT loaded by any page.

     node check-puzzles.js          check every shipped picture
     node check-puzzles.js cat      check one, by id
     node check-puzzles.js --daily  spot-check a year of dailies

   A puzzle ships only if the line solver (nono.js) finishes it: then a
   player never has to guess, and the solution is unique. For a stuck
   puzzle it prints the partial grid — '#' and '.' are forced, '?' is
   where placements disagree — so the picture can be nudged until it
   locks. It also checks ids are unique and every row is the right width.
   ===================================================================== */
"use strict";
var N = require("./nono.js");
var ROLLS = require("./puzzles.js");

var only = process.argv[2] && process.argv[2].indexOf("--") !== 0 ? process.argv[2] : null;
var bad = 0, ids = {};

ROLLS.forEach(function (roll) {
  roll.puzzles.forEach(function (p) {
    if (only && p.id !== only) return;
    var tag = (roll.id + "/" + p.id).padEnd(18);
    if (ids[p.id]) { console.log(tag + " FAIL duplicate id"); bad++; }
    ids[p.id] = true;
    var w = p.rows[0].length, h = p.rows.length;
    if (p.rows.some(function (r) { return r.length !== w || /[^.#]/.test(r); })) {
      console.log(tag + " FAIL ragged rows or stray characters"); bad++; return;
    }
    var clues = N.cluesOf(p.rows);
    var res = N.solve(clues, w, h);
    if (res.contradiction) { console.log(tag + " FAIL solver contradiction (checker bug?)"); bad++; return; }
    if (!res.solved) {
      bad++;
      var unknown = res.grid.filter(function (v) { return v === 0; }).length;
      console.log(tag + " FAIL needs guessing (" + unknown + " cells open after " + res.passes + " passes)");
      for (var y = 0; y < h; y++) {
        var line = "";
        for (var x = 0; x < w; x++) {
          var v = res.grid[y * w + x];
          line += v === 1 ? "#" : v === 2 ? "." : "?";
        }
        console.log("    " + line + "   art: " + p.rows[y]);
      }
      return;
    }
    // The solver's answer must be the artwork itself.
    var match = p.rows.every(function (r, y) {
      for (var x = 0; x < w; x++) if ((r[x] === "#" ? 1 : 2) !== res.grid[y * w + x]) return false;
      return true;
    });
    if (!match) { console.log(tag + " FAIL solver disagrees with the art (checker bug?)"); bad++; return; }
    var fill = Math.round(100 * (p.rows.join("").split("#").length - 1) / (w * h));
    console.log(tag + " ok  " + w + "x" + h + "  " + String(fill).padStart(2) + "% ink  " + res.passes + " passes");
  });
});

if (process.argv.indexOf("--daily") !== -1) {
  var worst = 0;
  for (var d = 1; d <= 366; d++) {
    var g = N.daily(d, 10, 10);
    if (g.tries < 0) { console.log("daily " + d + " FAIL fell back"); bad++; }
    worst = Math.max(worst, g.tries);
  }
  console.log("dailies 1-366 ok, worst tries " + worst);
}
if (bad) { console.log(bad + " problem(s)"); process.exitCode = 1; }
