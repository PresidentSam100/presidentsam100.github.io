/* =====================================================================
   Slither — Labyrinth level checker. Node only, NOT loaded by any page:
   it require()s the engine and levels as modules.

     node verify.js            check every level
     node verify.js 7          check level 7 only (1-based)
     node verify.js 7 --route  also print the route it found
     node verify.js --bot      also let a bot play the enemy levels (slow)

   For each level it searches for a route that eats every red apple and
   reaches the exit. Each leg of the search (from one apple to the next)
   is a BFS that models what the rules allow — no reversing, ice, portals,
   doors and switches, blink charges, the ghost meter, the cutter, spike
   timing, and the snake's own body clearing out behind it. Every partial
   route is replayed through labyrinth-engine.js itself (enemies removed),
   so only routes the real rules accept survive.

   With --bot, levels with enemies are also played by a bot that re-plans
   every step around them. Enemies move randomly, so its win rate is a
   difficulty hint, not a verdict — a person reacts better than the bot.

   Spike levels need spikeMs to be a whole number of player steps, or the
   timing model is off; the checker flags that.
   ===================================================================== */
"use strict";
var E = require("./labyrinth-engine.js");
var LEVELS = require("./levels.js");
var T = E.T;

function stripEnemies(level) {
  return Object.assign({}, level, { grid: level.grid.map(function (r) { return r.replace(/[WHM]/g, "."); }) });
}

function makeCtx(level) {
  var st = E.create(stripEnemies(level));
  var ms = level.speed || E.CFG.playerMs;
  var spikeMs = level.spikeMs || E.CFG.spikeMs;
  return {
    level: level, lv: st.lv, st: st, tiles: st.lv.tiles, ms: ms,
    spikeMs: spikeMs, hasSpikes: st.lv.hasSpikes,
    aligned: !st.lv.hasSpikes || spikeMs % ms === 0,
  };
}

// Is a spike tile raised at time t (ms since the level started)? Flips land
// before moves that happen at the same instant, as in the engine.
function raisedAt(ctx, tile, t) {
  var phaseA = Math.floor(t / ctx.spikeMs) % 2 === 0;
  return tile === T.SPIKE_A ? phaseA : tile === T.SPIKE_B ? !phaseA : false;
}
// Arriving at a spike cell at time t with a body of `len`: the cell stays
// occupied until the tail leaves, len steps later. Any rise in that window kills.
function spikeSafe(ctx, cell, t, len) {
  var tile = ctx.tiles[cell];
  if (tile !== T.SPIKE_A && tile !== T.SPIKE_B) return true;
  if (raisedAt(ctx, tile, t)) return false;
  var end = t + len * ctx.ms;
  for (var f = (Math.floor(t / ctx.spikeMs) + 1) * ctx.spikeMs; f <= end; f += ctx.spikeMs) {
    if (raisedAt(ctx, tile, f)) return false;
  }
  return true;
}
function doorShut(tile, flipped) {
  return (tile === T.DOOR_SHUT && !flipped) || (tile === T.DOOR_OPEN && flipped);
}

// Where snakes block the grid at the start of a leg. A segment j places back
// from the head of a snake of length L clears after L - j moves; enemy bodies
// are treated as staying put (the bot re-plans every step anyway).
function blockMap(st, withEnemies) {
  var block = new Map();
  var body = st.player.body, L = body.length;
  for (var j = body.length - 1; j >= 0; j--) block.set(body[j], L - j);
  if (withEnemies) {
    st.snakes.forEach(function (s) {
      if (s === st.player || !s.alive) return;
      s.body.forEach(function (c) { block.set(c, Infinity); });
      // Don't step where an enemy head could step at the same moment.
      for (var d = 0; d < 4; d++) {
        var n = E.moveTarget(st, s.body[0], d);
        if (n >= 0 && !block.has(n)) block.set(n, 2);
      }
    });
  }
  return block;
}

// One leg: BFS from the engine state until the head reaches any remaining
// item (it would eat it) or, once every apple is gone, the exit.
function leg(ctx, st, block, stepsSoFar, limit) {
  var tiles = ctx.tiles, ms = ctx.ms, items = st.items, applesLeft = st.applesLeft;
  var period = ctx.hasSpikes ? 2 * Math.round(ctx.spikeMs / ms) : 1;
  var nodes = [], seen = new Set(), blinkDone = new Set(), found = [];
  var p = st.player;
  function key(n) { return n.cell + "," + n.dir + "," + (n.fl ? 1 : 0) + "," + n.tp + "," + n.gh + "," + (n.step % period) + "," + (n.cut ? 1 : 0); }
  function push(n) { var k = key(n); if (!seen.has(k)) { seen.add(k); nodes.push(n); } }
  function arrive(from, n, dir, ghost, blink) {
    var tile = tiles[n], step = from.step + 1, rel = step - stepsSoFar;
    var len = from.cut ? 3 : from.len;
    if (tile === T.WALL && !ghost) return;
    if (doorShut(tile, from.fl) && !ghost) return;
    if (tile === T.EXIT && !ghost && applesLeft > 0) return;
    if (!ghost && block.has(n) && rel < block.get(n)) return;
    if (!spikeSafe(ctx, n, step * ms, len)) return;
    var node = {
      cell: n, dir: dir, fl: tile === T.SWITCH ? !from.fl : from.fl,
      tp: from.tp - (blink ? 1 : 0), gh: from.gh - (ghost ? 1 : 0),
      step: step, len: from.len, cut: from.cut || (tile === T.CUTTER && len > 3),
      prev: from, act: { d: dir, ghost: ghost, blink: blink ? n : -1 },
    };
    if (items[n]) { found.push(node); return; }
    if (tile === T.EXIT && !ghost && applesLeft === 0) { node.exit = true; found.push(node); return; }
    if (tile === T.EXIT) return;
    push(node);
  }
  push({ cell: p.body[0], dir: p.dir, fl: st.flipped, tp: st.teleports, gh: st.ghost, step: stepsSoFar, len: p.body.length, cut: false, prev: null });
  for (var q = 0; q < nodes.length && q < (limit || 300000); q++) {
    var cur = nodes[q], onIce = tiles[cur.cell] === T.ICE;
    for (var d = 0; d < 4; d++) {
      if (cur.dir >= 0) {
        if (d === (cur.dir + 2) % 4) continue;
        if (onIce && d !== cur.dir) continue;
      }
      var n = E.neighbor(st, cur.cell, d);
      if (n < 0) continue;
      if (tiles[n] === T.PORTAL) n = ctx.lv.partner[n];
      arrive(cur, n, d, false, false);
      if (cur.gh > 0) arrive(cur, n, d, true, false);
    }
    // Blink: expand once per resource group — every open cell, same heading.
    if (cur.tp > 0 && cur.dir >= 0) {
      var g = cur.dir + "," + (cur.fl ? 1 : 0) + "," + cur.tp + "," + cur.gh + "," + (cur.step % period) + "," + (cur.cut ? 1 : 0);
      if (!blinkDone.has(g)) {
        blinkDone.add(g);
        for (var c = 0; c < tiles.length; c++) {
          var tl = tiles[c];
          if (c === cur.cell || tl === T.WALL || tl === T.EXIT || tl === T.PORTAL || doorShut(tl, cur.fl)) continue;
          if (raisedAt(ctx, tl, (cur.step + 1) * ms)) continue;
          arrive(cur, c, cur.dir, false, true);
        }
      }
    }
  }
  return found;
}

function pathOf(node) {
  var acts = [];
  for (var n = node; n.prev; n = n.prev) acts.push(n.act);
  return acts.reverse();
}

// Play one action (one player move) on an engine state.
function act(st, a, first) {
  if (first) E.turn(st, a.d);
  else if (a.blink < 0 && a.d !== st.player.dir) E.turn(st, a.d);
  E.setGhost(st, a.ghost);
  if (a.blink >= 0 && !E.blink(st, a.blink)) return "blink refused";
  var left = st.player.timer;
  while (left > 1e-9 && st.status === "play") {
    var chunk = Math.min(100, left);
    E.advance(st, chunk);
    left -= chunk;
  }
  return "";
}

// Replay a route through the real engine (enemies removed unless keepEnemies).
function replay(level, route, keepEnemies) {
  var st = E.create(keepEnemies ? level : stripEnemies(level));
  for (var i = 0; i < route.length; i++) {
    var why = act(st, route[i], i === 0);
    if (why) return { ok: false, st: st, at: i, why: why };
    if (st.status === "won") return { ok: i === route.length - 1, st: st, at: i, elapsed: st.elapsed };
    if (st.status !== "play") return { ok: false, st: st, at: i, why: st.cause };
  }
  return { ok: st.status === "won", st: st, at: route.length, alive: st.status === "play" };
}

// Exit first, then the nearest arrival at each distinct cell, then the other
// ways of reaching those same cells (different heading, door state, ...).
function distinctFirst(found) {
  found.sort(function (a, b) { return (b.exit ? 1 : 0) - (a.exit ? 1 : 0) || a.step - b.step; });
  var seen = {}, first = [], rest = [];
  found.forEach(function (f) { (seen[f.cell] ? rest : first).push(f); seen[f.cell] = true; });
  return first.concat(rest);
}

// Depth-first over which item to go for next, nearest first. Iterative
// widening: first only ever the nearest item, then the 2, 3 and finally
// all nearest — so the common case is found fast and odd orders still get
// tried before giving up.
function solve(level, budget) {
  var ctx = makeCtx(level);
  var legs = 0, best = null, lastFail = null;
  budget = budget || 4000;

  function pass(width) {
    var memo = new Set();
    (function dfs(route) {
      if (best || legs > budget) return;
      var r = replay(level, route, false);
      if (route.length && !r.alive && !r.ok) { lastFail = r; return; }
      if (r.ok) { best = { route: route, elapsed: r.elapsed }; return; }
      var st = r.st;
      var mk = Object.keys(st.items).sort().join(".") + "|" + st.player.body.join(",") + "|" + st.player.dir + st.flipped + st.teleports + "," + st.ghost;
      if (memo.has(mk)) return;
      memo.add(mk);
      legs++;
      var found = distinctFirst(leg(ctx, st, blockMap(st, false), route.length));
      for (var i = 0; i < found.length && i < width && !best && legs <= budget; i++) dfs(route.concat(pathOf(found[i])));
    })([]);
  }
  [1, 2, 3, Infinity].forEach(function (w) { if (!best && legs <= budget) pass(w); });
  return { ctx: ctx, best: best, legs: legs, lastFail: lastFail };
}

// A bot that re-plans every step with enemies as obstacles. Returns true on a win.
function botRun(level, ctx) {
  var st = E.create(level), steps = 0;
  while (st.status === "play" || st.status === "ready") {
    var found = leg(ctx, st, blockMap(st, true), steps, 60000);
    found.sort(function (a, b) { return (b.exit ? 1 : 0) - (a.exit ? 1 : 0) || a.step - b.step; });
    var a = null;
    if (found.length) a = pathOf(found[0])[0];
    else {
      // Nothing reachable right now: take any move that doesn't die this step.
      var head = st.player.body[0];
      for (var d = 0; d < 4 && !a; d++) {
        if (st.player.dir >= 0 && d === (st.player.dir + 2) % 4) continue;
        var n = E.moveTarget(st, head, d);
        var blk = blockMap(st, true);
        if (n >= 0 && !E.solidFor(st, st.player, n, false) && !(blk.has(n) && blk.get(n) > 1)) a = { d: d, ghost: false, blink: -1 };
      }
      if (!a) a = { d: st.player.dir < 0 ? 0 : st.player.dir, ghost: false, blink: -1 };
    }
    act(st, a, steps === 0);
    steps++;
    if (steps > 2000) break;
  }
  return st.status === "won";
}

// ---- report -----------------------------------------------------------------------
if (require.main === module) {
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
    var lv = E.parse(level);
    if (lv.errors.length) { console.log(tag + " FAIL " + lv.errors.join("; ")); bad++; return; }
    var t0 = Date.now();
    var res = solve(level);
    var notes = [];
    if (!res.ctx.aligned) notes.push("spikeMs is not a multiple of the step time — timing unchecked");
    if (lv.hasSpikes && /f/.test(level.grid.join(""))) notes.push("fast apples change the step time on a spike level");
    if (!res.best) {
      console.log(tag + " FAIL no route (" + res.legs + " legs" +
        (res.lastFail ? "; last replay died: " + res.lastFail.why + " at step " + res.lastFail.at : "") + ", " + (Date.now() - t0) + "ms)");
      bad++;
      return;
    }
    var secs = res.best.elapsed / 1000, limit = level.time || 0;
    var line = tag + " ok  " + String(res.best.route.length).padStart(3) + " steps " + secs.toFixed(1).padStart(5) + "s";
    if (limit) {
      var slack = limit / secs;
      line += " / " + limit + "s (x" + slack.toFixed(2) + ")";
      if (slack < 1.25) notes.push("time limit is tight for an exact route");
    }
    if (lv.enemies.length && useBot) {
      var wins = 0, trials = 10;
      for (var i = 0; i < trials; i++) if (botRun(level, res.ctx)) wins++;
      line += "  · bot beats it with enemies " + wins + "/" + trials;
    }
    console.log(line + (notes.length ? "  !! " + notes.join("; ") : "") + "  [" + (Date.now() - t0) + "ms]");
    if (showRoute) {
      var cols = lv.cols;
      console.log(res.best.route.map(function (a) {
        return a.d + (a.ghost ? "g" : "") + (a.blink >= 0 ? "@" + (a.blink % cols) + "," + Math.floor(a.blink / cols) : "");
      }).join(" "));
    }
  });
  if (bad) { console.log(bad + " level(s) failed"); process.exitCode = 1; }
}

module.exports = { solve: solve, replay: replay, botRun: botRun, makeCtx: makeCtx };
