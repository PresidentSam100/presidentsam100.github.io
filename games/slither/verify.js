/* =====================================================================
   Slither — Labyrinth level checker. Node only, NOT loaded by any page.

     node verify.js            check every level
     node verify.js 7          check level 7 only (1-based)
     node verify.js 7 --route  also print the route it found
     node verify.js --bot      also let a bot play the enemy levels (slow)

   The search itself lives in solver.js (the level editor uses it too):
   it finds a route that eats every red apple and reaches an exit, and
   replays it through labyrinth-engine.js so only routes the real rules
   accept count. Levels marked `unproven: "<reason>"` (they need enemies or
   a boss to finish) are reported as unproven, never ok; with --bot they
   also get a bot playthrough as evidence.

   With --bot, levels with enemies are played by a bot that re-plans every
   step around them. Enemies move randomly, so its win rate is a difficulty
   hint, not a verdict — a person reacts better than the bot.
   ===================================================================== */
"use strict";
var E = require("./labyrinth-engine.js");
var S = require("./solver.js");
var LEVELS = require("./levels.js");

var args = process.argv.slice(2);
var only = args[0] && /^\d+$/.test(args[0]) ? Number(args[0]) : 0;
var showRoute = args.indexOf("--route") !== -1;
var useBot = args.indexOf("--bot") !== -1;
var bad = 0, ids = {};

LEVELS.forEach(function (level, idx) {
  if (only && idx + 1 !== only) return;
  var tag = String(idx + 1).padStart(2) + " " + (level.name || "?").padEnd(16);
  if (!level.id || ids[level.id]) { console.log(tag + " FAIL missing or duplicate id"); bad++; return; }
  ids[level.id] = true;
  var t0 = Date.now();
  var r = S.check(level);
  var lv = E.parse(level);
  if (r.status === "fail") { console.log(tag + " FAIL " + r.reason + "  [" + (Date.now() - t0) + "ms]"); bad++; return; }
  var line;
  if (r.status === "unproven") line = tag + " unproven: " + r.reason;
  else {
    line = tag + " ok  " + String(r.route.length).padStart(3) + " steps " + r.secs.toFixed(1).padStart(5) + "s";
    if (level.time) line += " / " + level.time + "s (x" + (level.time / r.secs).toFixed(2) + ")";
    else line += " (untimed)";
    if (r.warp) line += " -> warps to " + r.warp;
  }
  if (lv.enemies.length && useBot) {
    var ctx = S.makeCtx(level), wins = 0, trials = 10, causes = {};
    for (var i = 0; i < trials; i++) {
      var b = S.botRun(level, ctx);
      if (b.won) wins++; else causes[b.cause || b.status] = (causes[b.cause || b.status] || 0) + 1;
    }
    line += "  · bot beats it with enemies " + wins + "/" + trials;
    var lost = Object.keys(causes).map(function (k) { return k + " " + causes[k]; }).join(", ");
    if (lost) line += " (lost to: " + lost + ")";
  }
  console.log(line + (r.notes && r.notes.length ? "  !! " + r.notes.join("; ") : "") + "  [" + (Date.now() - t0) + "ms]");
  if (showRoute && r.route) {
    var cols = lv.cols;
    console.log(r.route.map(function (a) {
      if (a.click != null) return "click@" + (a.click % cols) + "," + Math.floor(a.click / cols);
      return a.d + (a.ghost ? "g" : "") + (a.blink >= 0 ? "@" + (a.blink % cols) + "," + Math.floor(a.blink / cols) : "");
    }).join(" "));
  }
});
if (bad) { console.log(bad + " level(s) failed"); process.exitCode = 1; }
