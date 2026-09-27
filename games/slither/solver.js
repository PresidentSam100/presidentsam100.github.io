/* =====================================================================
   Slither — Labyrinth level solver. Used by verify.js (Node) and the
   level editor (browser) to prove a level can be finished.

   It searches for a route that eats every red apple and reaches an exit.
   Each leg of the search (from one item to the next) is a BFS that models
   what the rules allow — no reversing, ice, portals and teleporters, doors
   of each colour and their switches, blink charges, the ghost meter, the
   cutter, spike timing, and the snake's own body clearing out behind it.
   Every partial route is replayed through labyrinth-engine.js itself
   (enemies removed), so only routes the real rules accept survive.

   Levels the solver can't judge (they need enemies to do something, or a
   boss) carry `unproven: "<reason>"` and are reported as such, never "ok".
   ===================================================================== */
(function (root, factory) {
  var E = typeof module !== "undefined" && module.exports ? require("./labyrinth-engine.js") : (root || self).SlitherEngine;
  var mod = factory(E);
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.SlitherSolver = mod;
  else if (typeof self !== "undefined") self.SlitherSolver = mod; // a Web Worker (the editor's checker)
})(this, function (E) {
  "use strict";
  var T = E.T;

  // Every enemy glyph, straight from the engine's table.
  var ENEMY_GLYPHS = Object.keys(E.LEGEND).filter(function (ch) { return E.LEGEND[ch].enemy; });
  function stripEnemies(level) {
    return Object.assign({}, level, { grid: level.grid.map(function (r) {
      return r.split("").map(function (ch) { return ENEMY_GLYPHS.indexOf(ch) === -1 ? ch : "."; }).join("");
    }) });
  }
  // 1-ups and golden apples only appear on pack runs; levels are checked as
  // they play normally, without them.
  var BONUS_GLYPHS = Object.keys(E.LEGEND).filter(function (ch) { var it = E.LEGEND[ch].item; return it === "oneup" || it === "gold"; });
  function plain(level) {
    if (!level.grid.some(function (r) { return BONUS_GLYPHS.some(function (ch) { return r.indexOf(ch) !== -1; }); })) return level;
    return Object.assign({}, level, { grid: level.grid.map(function (r) {
      return r.split("").map(function (ch) { return BONUS_GLYPHS.indexOf(ch) === -1 ? ch : "."; }).join("");
    }) });
  }

  function makeCtx(level) {
    var st = E.create(stripEnemies(plain(level)));
    var ms = level.speed || E.CFG.playerMs;
    var spikeMs = level.spikeMs || E.CFG.spikeMs;
    return {
      level: level, lv: st.lv, st: st, tiles: st.lv.tiles, ms: ms,
      spikeMs: spikeMs, hasSpikes: st.lv.hasSpikes && !st.lv.hasStuds, studs: st.lv.hasStuds,
      aligned: !st.lv.hasSpikes || st.lv.hasStuds || spikeMs % ms === 0,
    };
  }

  // Is a spike tile raised at time t (ms since the level started)? Flips land
  // before moves that happen at the same instant, as in the engine. In a stud
  // level there is no beat: bit 8 of the flip mask says a stud flipped them.
  function raisedAt(ctx, tile, t, fl) {
    var phaseA = ctx.studs ? !(fl & 8) : Math.floor(t / ctx.spikeMs) % 2 === 0;
    return tile === T.SPIKE_A ? phaseA : tile === T.SPIKE_B ? !phaseA : false;
  }
  // Arriving at a spike cell at time t with a body of `len`: the cell stays
  // occupied until the tail leaves, len steps later. Any rise in that window kills.
  function spikeSafe(ctx, cell, t, len, fl) {
    var tile = ctx.tiles[cell];
    if (tile !== T.SPIKE_A && tile !== T.SPIKE_B) return true;
    if (raisedAt(ctx, tile, t, fl)) return false;
    if (ctx.studs) return true;   // only a stud can raise it, and that's checked there
    var end = t + len * ctx.ms;
    for (var f = (Math.floor(t / ctx.spikeMs) + 1) * ctx.spikeMs; f <= end; f += ctx.spikeMs) {
      if (raisedAt(ctx, tile, f)) return false;
    }
    return true;
  }
  // Door state from a bitmask of flipped colours.
  function doorShut(ctx, cell, fl) {
    var t = ctx.tiles[cell];
    if (t !== T.DOOR_SHUT && t !== T.DOOR_OPEN) return false;
    var flipped = !!(fl & (1 << (ctx.lv.doorColor[cell] || 0)));
    return (t === T.DOOR_SHUT) !== flipped;
  }
  function flipMask(st) {
    return (st.flip[0] ? 1 : 0) | (st.flip[1] ? 2 : 0) | (st.flip[2] ? 4 : 0) | (st.lv.hasStuds && !st.spikePhase ? 8 : 0);
  }
  // A stud flips every spike field: would the body (head at `head`, the rest
  // back along the path, then the snake's body at the start of the leg) be
  // lying on a spike that rises?
  function studCuts(ctx, head, from, len, fl, body) {
    var cells = [head];
    for (var n = from; n && cells.length < len; n = n.prev) if (!(n.act && n.act.click != null)) cells.push(n.cell);
    for (var j = 1; j < body.length && cells.length < len; j++) cells.push(body[j]);
    for (var k = 0; k < cells.length; k++) if (raisedAt(ctx, ctx.tiles[cells[k]], 0, fl)) return true;
    return false;
  }

  // Where snakes block the grid at the start of a leg. A segment j places back
  // from the head of a snake of length L clears after L - j moves (never, if it
  // is growing endlessly); enemy bodies are treated as staying put.
  function blockMap(st, withEnemies) {
    var block = new Map();
    block.foe = new Set();      // cells held by enemies (a skeleton can't pass these)
    block.flower = new Set();   // spike flowers: never enter, not even ghosting
    var p = E.primary(st, "p1");
    if (p) {
      var body = p.body, L = body.length;
      for (var j = body.length - 1; j >= 0; j--) block.set(body[j], p.infinite ? Infinity : L - j);
    }
    if (withEnemies) {
      (st.flowers || []).forEach(function (f) { block.set(f.cell, Infinity); block.foe.add(f.cell); block.flower.add(f.cell); });
      st.snakes.forEach(function (s) {
        if (s.ctrl || !s.alive) return;
        s.body.forEach(function (c) { block.set(c, Infinity); block.foe.add(c); });
        // Don't step where an enemy head could step at the same moment.
        for (var d = 0; d < 4; d++) {
          var n = E.moveTarget(st, s.body[0], d);
          if (n >= 0 && !block.has(n)) { block.set(n, 2); block.foe.add(n); }
        }
      });
    }
    return block;
  }

  // Cells of each colour's click-switch (one per colour is enough to click).
  function clickCells(ctx) {
    if (ctx.clicks) return ctx.clicks;
    var out = [];
    for (var i = 0; i < ctx.tiles.length; i++) {
      if (ctx.tiles[i] !== T.CLICK) continue;
      var c = ctx.lv.doorColor[i] || 0;
      if (!out.some(function (o) { return o.color === c; })) out.push({ color: c, cell: i });
    }
    return (ctx.clicks = out);
  }

  // One leg: BFS from the engine state until the head reaches any remaining
  // item (it would eat it) or, once every apple is gone, an exit.
  function leg(ctx, st, block, stepsSoFar, limit) {
    var tiles = ctx.tiles, ms = ctx.ms, items = st.items, open = E.exitOpen(st);
    var period = ctx.hasSpikes ? 2 * Math.round(ctx.spikeMs / ms) : 1;
    var nodes = [], seen = new Set(), blinkDone = new Set(), found = [];
    var p = E.primary(st, "p1"), r = st.res.p1;
    if (!p) return found;
    function key(n) { return n.cell + "," + n.dir + "," + n.fl + "," + n.tp + "," + n.gh + "," + (n.step % period) + "," + (n.cut ? 1 : 0) + (n.inf ? "i" : ""); }
    function push(n) { var k = key(n); if (!seen.has(k)) { seen.add(k); nodes.push(n); } }
    function arrive(from, n, dir, ghost, blink) {
      var tile = tiles[n], step = from.step + 1, rel = step - stepsSoFar;
      var skeleton = tiles[from.cell] === T.DREAM || tile === T.DREAM;
      // An Infinity machine means the tail never leaves: spikes can't be cleared.
      var len = from.inf ? 1e6 : from.cut ? 3 : from.len;
      if (tile === T.WALL && !ghost) return;
      if (doorShut(ctx, n, from.fl) && !ghost) return;
      if ((tile === T.EXIT || tile === T.WARP) && !ghost && !open) return;
      if (items[n] === "melon" && !ghost) return;
      // A skeleton passes through its own body, never through an enemy.
      if (!ghost && block.has(n) && rel < block.get(n) && !(skeleton && !(block.foe && block.foe.has(n)))) return;
      if (block.flower && block.flower.has(n)) return;
      if (!spikeSafe(ctx, n, step * ms, len, from.fl)) return;
      var fl = tile === T.SWITCH ? from.fl ^ (1 << (ctx.lv.doorColor[n] || 0)) : tile === T.STUD ? from.fl ^ 8 : from.fl;
      if (tile === T.STUD && studCuts(ctx, n, from, Math.min(len, 4096), fl, p.body)) return;
      var node = {
        cell: n, dir: dir, fl: fl,
        tp: from.tp - (blink ? 1 : 0), gh: from.gh - (ghost ? 1 : 0),
        step: step, len: from.len, cut: from.cut || (tile === T.CUTTER && (len > 3 || from.inf)),
        inf: tile === T.CUTTER ? false : from.inf || tile === T.INFINITY,
        prev: from, act: { d: dir, ghost: ghost, blink: blink ? n : -1 },
      };
      if (items[n] && items[n] !== "melon") { found.push(node); return; }
      if ((tile === T.EXIT || tile === T.WARP) && !ghost && open) { node.exit = true; found.push(node); return; }
      if (tile === T.EXIT || tile === T.WARP) return;
      push(node);
    }
    // The body still owed from the last item eaten counts: the tail lingers that much longer.
    push({ cell: p.body[0], dir: p.dir, fl: flipMask(st), tp: r.teleports, gh: r.ghost, step: stepsSoFar, len: p.body.length + (p.grow || 0), cut: false, inf: p.infinite, prev: null });
    var clicks = clickCells(ctx);
    for (var q = 0; q < nodes.length && q < (limit || 300000); q++) {
      var cur = nodes[q], onIce = tiles[cur.cell] === T.ICE;
      // In a dream block the path is forced: straight on, bouncing off walls.
      if (tiles[cur.cell] === T.DREAM && cur.dir >= 0) {
        var dd = cur.dir, nn = E.neighbor(st, cur.cell, dd);
        if (nn < 0 || tiles[nn] === T.WALL || doorShut(ctx, nn, cur.fl) || ((tiles[nn] === T.EXIT || tiles[nn] === T.WARP) && !open) || items[nn] === "melon") {
          dd = (dd + 2) % 4;
        }
        var tgt = E.moveTarget(st, cur.cell, dd);
        if (tgt >= 0) arrive(cur, tgt, dd, false, false);
        continue;
      }
      // Clicking a switch costs no time: same cell, same moment, colour flipped.
      if (cur.dir >= 0) clicks.forEach(function (k) {
        push({ cell: cur.cell, dir: cur.dir, fl: cur.fl ^ (1 << k.color), tp: cur.tp, gh: cur.gh, step: cur.step, len: cur.len, cut: cur.cut, inf: cur.inf,
          prev: cur, act: { click: k.cell, d: cur.dir, ghost: false, blink: -1 } });
      });
      for (var d = 0; d < 4; d++) {
        if (cur.dir >= 0) {
          if (d === (cur.dir + 2) % 4) continue;
          if (onIce && d !== cur.dir) continue;
        }
        var n = E.moveTarget(st, cur.cell, d);
        if (n < 0) continue;
        arrive(cur, n, d, false, false);
        if (cur.gh > 0) arrive(cur, n, d, true, false);
      }
      // Blink: expand once per resource group — every open cell, same heading.
      if (cur.tp > 0 && cur.dir >= 0) {
        var g = cur.dir + "," + cur.fl + "," + cur.tp + "," + cur.gh + "," + (cur.step % period) + "," + (cur.cut ? 1 : 0);
        if (!blinkDone.has(g)) {
          blinkDone.add(g);
          for (var c = 0; c < tiles.length; c++) {
            var tl = tiles[c];
            if (c === cur.cell || tl === T.WALL || tl === T.EXIT || tl === T.WARP || tl === T.PORTAL || tl === T.TELE || doorShut(ctx, c, cur.fl)) continue;
            if (items[c] === "melon" || raisedAt(ctx, tl, (cur.step + 1) * ms, cur.fl)) continue;
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

  // Play one action (one player move, or an instant click) on an engine state.
  function act(st, a, first) {
    if (a.click != null) return E.click(st, a.click, "p1") === "switch" ? "" : "click refused";
    var p = E.primary(st, "p1");
    if (first) E.turn(st, a.d);
    else if (a.blink < 0 && p && a.d !== p.dir) E.turn(st, a.d);
    E.setGhost(st, a.ghost);
    // On a storm tile the cursor steers: aim it well off in the direction we want.
    p = E.primary(st, "p1");
    if (p && st.tiles[p.body[0]] === E.T.STORM) {
      var x = p.body[0] % st.cols + E.DX[a.d] * 8, y = Math.floor(p.body[0] / st.cols) + E.DY[a.d] * 8;
      x = Math.max(0, Math.min(st.cols - 1, x)); y = Math.max(0, Math.min(st.rows - 1, y));
      E.setCursor(st, y * st.cols + x);
    } else E.setCursor(st, -1);
    if (a.blink >= 0 && !E.blink(st, a.blink)) return "blink refused";
    p = E.primary(st, "p1");
    var left = p ? p.timer : 0;
    while (left > 1e-9 && st.status === "play") {
      var chunk = Math.min(100, left);
      E.advance(st, chunk);
      left -= chunk;
    }
    return "";
  }

  // Replay a route through the real engine (enemies removed unless keepEnemies).
  function replay(level, route, keepEnemies) {
    var st = E.create(keepEnemies ? plain(level) : stripEnemies(plain(level)));
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
        if (r.ok) { best = { route: route, elapsed: r.elapsed, warp: r.st.warp }; return; }
        var st = r.st, p = E.primary(st, "p1"), res = st.res.p1;
        var mk = Object.keys(st.items).sort().join(".") + "|" + p.body.join(",") + "|" + p.dir + "," + flipMask(st) + "," + res.teleports + "," + res.ghost;
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

  // How many open cells a head at `from` could still reach (walls, shut doors,
  // melons, spikes and blocked cells excluded) — the bot's room to breathe.
  function room(st, from, blk, cap) {
    var seen = new Set([from]), q = [from];
    for (var k = 0; k < q.length && seen.size < cap; k++) {
      for (var d = 0; d < 4; d++) {
        var n = E.moveTarget(st, q[k], d);
        if (n < 0 || seen.has(n)) continue;
        var t = st.tiles[n];
        if (t === T.WALL || E.isDoorShut(st, n) || st.items[n] === "melon" || E.spikeUp(st, n)) continue;
        if ((t === T.EXIT || t === T.WARP) && !E.exitOpen(st)) continue;
        if (blk.has(n) && blk.get(n) > k + 1) continue;
        seen.add(n); q.push(n);
      }
    }
    return seen.size;
  }

  // A bot that re-plans every step with enemies as obstacles. Returns
  // { won, status, cause, secs }.
  function botRun(level, ctx) {
    var st = E.create(plain(level)), steps = 0;
    while (st.status === "play" || st.status === "ready") {
      var found = distinctFirst(leg(ctx, st, blockMap(st, true), steps, 60000));
      var a = null;
      if (found.length) a = pathOf(found[0])[0];
      else {
        // Nothing reachable right now (say, waiting for a damage fruit to grow):
        // take the move that doesn't die this step and leaves the most room.
        // A cell nothing can reach this step beats one an enemy only might.
        var p = E.primary(st, "p1"), head = p.body[0], blk = blockMap(st, true), bestScore = -1;
        for (var d = 0; d < 4; d++) {
          if (p.dir >= 0 && d === (p.dir + 2) % 4) continue;
          var n = E.moveTarget(st, head, d);
          if (n < 0 || E.solidFor(st, p, n, false) || blk.flower.has(n) || E.spikeUp(st, n)) continue;
          var b = blk.has(n) ? blk.get(n) : 0;
          if (b === Infinity || (b > 1 && !blk.foe.has(n))) continue;
          // Spike beds rise on a beat: stepping onto one to wait is how bots die.
          var spiky = st.tiles[n] === T.SPIKE_A || st.tiles[n] === T.SPIKE_B;
          var score = (b <= 1 ? 1e5 : 0) - (spiky ? 5e4 : 0) + room(st, n, blk, 400);
          if (score > bestScore) { bestScore = score; a = { d: d, ghost: false, blink: -1 }; }
        }
        if (!a) a = { d: p.dir < 0 ? 0 : p.dir, ghost: false, blink: -1 };
      }
      act(st, a, steps === 0);
      steps++;
      if (steps > 3000) break;
    }
    return { won: st.status === "won", status: st.status, cause: st.cause, secs: st.elapsed / 1000 };
  }

  // Routes written as text (verify.js --route prints them): "0 1 1g 2@5,3 click@4,8".
  function routeFromText(text, cols) {
    return String(text).trim().split(/\s+/).map(function (tok) {
      var m = /^click@(\d+),(\d+)$/.exec(tok);
      if (m) return { click: Number(m[2]) * cols + Number(m[1]), d: 0, ghost: false, blink: -1 };
      m = /^(\d)(g?)(?:@(\d+),(\d+))?$/.exec(tok);
      if (!m) throw new Error("bad route step '" + tok + "'");
      return { d: Number(m[1]), ghost: m[2] === "g", blink: m[3] != null ? Number(m[4]) * cols + Number(m[3]) : -1 };
    });
  }
  function routeToText(route, cols) {
    return route.map(function (a) {
      if (a.click != null) return "click@" + (a.click % cols) + "," + Math.floor(a.click / cols);
      return a.d + (a.ghost ? "g" : "") + (a.blink >= 0 ? "@" + (a.blink % cols) + "," + Math.floor(a.blink / cols) : "");
    }).join(" ");
  }

  // Check one level: { status: "ok" | "unproven" | "fail", ... }.
  function check(level, opts) {
    opts = opts || {};
    var lv = E.parse(level);
    if (lv.errors.length) return { status: "fail", reason: lv.errors.join("; ") };
    if (lv.mode === "stage") return { status: "unproven", reason: "a stage has no exit: its apples keep coming until you crash" };
    if (lv.mode === "arena") return { status: "unproven", reason: "an arena has no exit: the last snake standing wins" };
    if (level.unproven) {
      // A level the search can't judge may carry a hand-checked proof route,
      // replayed with its enemies and twins in play.
      if (level.proof) {
        var pr = routeFromText(level.proof, lv.cols), rep = replay(level, pr, true);
        if (rep.ok) return { status: "ok", route: pr, secs: rep.elapsed / 1000, notes: ["proven by its proof route (" + level.unproven + ")"], byProof: true };
        return { status: "fail", reason: "its proof route no longer works (" + (rep.why || "no win") + " at step " + rep.at + ")" };
      }
      return { status: "unproven", reason: level.unproven };
    }
    var res = solve(level, opts.budget);
    var notes = [];
    if (!res.ctx.aligned) notes.push("spikeMs is not a multiple of the step time — timing unchecked");
    if (!res.best) {
      return { status: "fail", legs: res.legs, reason: "no route" + (res.lastFail ? " (last replay died: " + res.lastFail.why + " at step " + res.lastFail.at + ")" : "") };
    }
    var secs = res.best.elapsed / 1000;
    if (level.time && level.time / secs < 1.25) notes.push("time limit is tight for an exact route");
    return { status: "ok", route: res.best.route, secs: secs, warp: res.best.warp, notes: notes, ctx: res.ctx };
  }

  return {
    stripEnemies: stripEnemies, makeCtx: makeCtx, solve: solve, replay: replay, botRun: botRun, check: check,
    routeFromText: routeFromText, routeToText: routeToText,
    // Internals, for debugging tools.
    leg: leg, blockMap: blockMap, pathOf: pathOf, distinctFirst: distinctFirst, act: act,
  };
});
