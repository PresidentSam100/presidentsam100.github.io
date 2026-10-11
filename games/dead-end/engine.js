/* =====================================================================
   Dead End: the rules of the chase, with no page in them.

   A maze chase on foot. Pick up every tin in the maze while the dead
   shamble after you. They're slower than you, but they never lose the
   way: each one walks the shortest path to wherever it's heading. Two
   things keep you alive:
     a torch    for a few seconds they shrink from the fire, and you can
                knock them flat (they crawl back to the pit and rise again)
     a plank    nail a barricade across the corridor behind you. Nothing
                gets through, you included, until it gives way: slowly on
                its own, quickly with the dead hammering on it

   The four of them hunt differently:
     0 Shambler  straight for you
     1 Lurker    for the spot a few steps ahead of you
     2 Sniffer   wanders until you're near, then comes fast
     3 Brute     slow, never goes round a barricade, and breaks one fast

   Glyphs:  #  a wall            .  a tin               (space) bare ground
            o  a torch           +  a plank to pick up
            P  where you start   Z  one of the dead (up to four)
            =  the pit's gate: only the dead pass
   A row or column left open at both ends wraps round.

   step(st, ms, input) moves the game on; what happened lands in st.events
   (a tin eaten, a board nailed up, a bite...), for the page to draw and
   sound. Nothing here touches the document, so it runs under node too.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.DeadEndEngine = mod;
})(this, function () {
  "use strict";

  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];          // up, right, down, left
  var MAX_SIDE = 40, MAX_DEAD = 4;
  var TUNE = {
    playerSpeed: 6.2,                                   // cells a second
    speeds: [4.3, 4.5, 3.6, 3.3],                       // by kind, hunting
    sniffSpeed: 5.3, sniffNear: 8, sniffFar: 12,        // the Sniffer, once it has your scent
    scaredSpeed: 2.7, downSpeed: 10,
    roundStep: 0.06, roundCap: 1.45,                    // the dead quicken each time round
    torchMs: 6500, torchStep: 600, torchMin: 2500,
    huntMs: 18000, wanderMs: 5000, firstWanderMs: 3000,
    release: [0, 2500, 6000, 10000], riseMs: 3500,
    planks: 2, maxPlanks: 3, tinsPerPlank: 30,
    boardMs: 6500, pound: 2.5, brutePound: 7,           // a barricade's life, and how fast hammering shortens it
    detour: 10,                                         // how many cells out of the way they'll go rather than hammer
    lives: 3, biteMs: 1500, clearMs: 1700,
    tin: 10, torch: 50, plank: 20, knock: 200, clear: 500,
    touch: 0.6
  };

  // ---- reading a maze --------------------------------------------------------------
  function parse(level) {
    var grid = (level && level.grid) || [], errors = [];
    var rows = grid.length, cols = rows ? grid[0].length : 0, n = cols * rows, i;
    var lv = { cols: cols, rows: rows, wall: new Uint8Array(n), gate: new Uint8Array(n), items: {}, start: -1, dead: [], tins: 0, errors: errors, name: (level && level.name) || "" };
    if (rows < 3 || cols < 3 || rows > MAX_SIDE || cols > MAX_SIDE) { errors.push("a maze is between 3 and " + MAX_SIDE + " cells each way"); return lv; }
    for (var y = 0; y < rows; y++) {
      if (grid[y].length !== cols) { errors.push("every row must be the same length"); return lv; }
      for (var x = 0; x < cols; x++) {
        var ch = grid[y].charAt(x); i = y * cols + x;
        if (ch === "#") lv.wall[i] = 1;
        else if (ch === "=") lv.gate[i] = 1;
        else if (ch === ".") { lv.items[i] = "tin"; lv.tins++; }
        else if (ch === "o") lv.items[i] = "torch";
        else if (ch === "+") lv.items[i] = "plank";
        else if (ch === "P") { if (lv.start >= 0) errors.push("only one start (P)"); lv.start = i; }
        else if (ch === "Z") lv.dead.push(i);
        else if (ch !== " ") errors.push("unknown tile '" + ch + "'");
      }
    }
    if (lv.start < 0) errors.push("the maze needs a start (P)");
    if (!lv.dead.length) errors.push("the maze needs at least one of the dead (Z)");
    if (lv.dead.length > MAX_DEAD) errors.push("at most " + MAX_DEAD + " of the dead (Z)");
    if (!lv.tins) errors.push("the maze needs tins (.) to pick up");
    if (errors.length) return lv;
    // every tin, torch and plank must be reachable on foot, and every one of the dead must be able to reach you
    var mine = flood(lv, lv.start, false), theirs = flood(lv, lv.start, true), lost = 0;
    Object.keys(lv.items).forEach(function (k) { if (mine[k] < 0) lost++; });
    if (lost) errors.push(lost + (lost === 1 ? " thing" : " things") + " to pick up can't be reached from the start");
    if (lv.dead.some(function (c) { return theirs[c] < 0; })) errors.push("one of the dead is walled in: give the pit a gate (=)");
    // the pit: the dead who can't be reached without crossing a gate wait inside it
    lv.inPit = lv.dead.map(function (c) { return mine[c] < 0; });
    lv.exit = -1; lv.den = -1;
    for (i = 0; i < n && lv.exit < 0; i++) {
      if (!lv.gate[i]) continue;
      for (var d = 0; d < 4; d++) {
        var m = neighbor(lv, i, d);
        if (m < 0 || lv.wall[m] || lv.gate[m]) continue;
        if (mine[m] >= 0) lv.exit = m; else lv.den = m;
      }
    }
    if (lv.exit < 0) lv.exit = lv.dead[0];
    if (lv.den < 0) lv.den = lv.dead[0];
    return lv;
  }
  // the cell next door (wrapping at the edges), or -1
  function neighbor(lv, i, d) {
    var x = i % lv.cols + DX[d], y = Math.floor(i / lv.cols) + DY[d];
    if (x < 0) x = lv.cols - 1; else if (x >= lv.cols) x = 0;
    if (y < 0) y = lv.rows - 1; else if (y >= lv.rows) y = 0;
    return y * lv.cols + x;
  }
  // steps from `from` to every cell (-1: can't get there); gates are walls unless `gates`
  function flood(lv, from, gates, blocked) {
    var dist = new Int16Array(lv.cols * lv.rows).fill(-1), q = [from], k, d, c, m;
    dist[from] = 0;
    for (k = 0; k < q.length; k++) {
      c = q[k];
      for (d = 0; d < 4; d++) {
        m = neighbor(lv, c, d);
        if (dist[m] >= 0 || lv.wall[m] || (!gates && lv.gate[m]) || (blocked && blocked[m])) continue;
        dist[m] = dist[c] + 1; q.push(m);
      }
    }
    return dist;
  }

  // ---- a game -----------------------------------------------------------------------
  // run: what carries over from the maze before ({ score, lives, round, planks, hard })
  function create(level, run, rng) {
    var lv = parse(level);
    if (lv.errors.length) throw new Error(lv.errors[0]);
    run = run || {};
    var st = {
      lv: lv, rng: rng || Math.random, items: {}, left: 0,
      score: run.score || 0, lives: run.lives != null ? run.lives : TUNE.lives, round: run.round || 1, hard: !!run.hard,
      planks: run.planks != null ? run.planks : TUNE.planks, tins: 0,
      boards: [], blocked: new Uint8Array(lv.cols * lv.rows), version: 0,
      torch: 0, chain: 0, wander: true, modeLeft: TUNE.firstWanderMs,
      status: "ready", wait: 0, clock: 0, events: [], fields: {}
    };
    Object.keys(lv.items).forEach(function (k) { st.items[k] = lv.items[k]; if (lv.items[k] !== "plank") st.left++; });
    st.player = { cell: lv.start, to: -1, p: 0, dir: -1, want: -1, face: 1, last: -1 };
    st.dead = lv.dead.map(function (c, k) { return { kind: k % 4, home: c, cell: c, to: -1, p: 0, dir: 2, state: "den", release: 0, pound: false, scent: false }; });
    place(st);
    return st;
  }
  // everyone back where they began (a new maze, or after a bite)
  function place(st) {
    var p = st.player, lv = st.lv;
    p.cell = lv.start; p.to = -1; p.p = 0; p.dir = -1; p.want = -1; p.last = -1;
    st.dead.forEach(function (z, k) {
      z.cell = z.home; z.to = -1; z.p = 0; z.pound = false; z.scent = false;
      z.state = lv.inPit[k] ? "den" : "roam";
      z.release = lv.inPit[k] ? TUNE.release[Math.min(k, 3)] : 0;
      z.hold = lv.inPit[k] ? 0 : 600 + k * 500;          // (out in the open they give you a moment)
    });
    st.boards = []; st.blocked.fill(0); st.version++;
    st.torch = 0; st.chain = 0; st.wander = true; st.modeLeft = TUNE.firstWanderMs;
  }

  function openForPlayer(st, c) { return !st.lv.wall[c] && !st.lv.gate[c] && !st.blocked[c]; }
  function speedOf(st, z) {
    if (z.state === "down") return TUNE.downSpeed;
    if (z.state === "den" || z.state === "leave") return 3.4;
    var up = Math.min(TUNE.roundCap, 1 + TUNE.roundStep * (st.round - 1)) * (st.hard ? 1.2 : 1);
    if (st.torch > 0) return TUNE.scaredSpeed * Math.min(1.2, up);
    return (z.kind === 2 && z.scent ? TUNE.sniffSpeed : TUNE.speeds[z.kind]) * up;
  }
  function torchFor(round) { return Math.max(TUNE.torchMin, TUNE.torchMs - TUNE.torchStep * (round - 1)); }

  // distance fields from a cell, kept until the cell or the barricades change
  function field(st, name, from, boards, gates) {
    var f = st.fields[name];
    if (f && f.from === from && f.version === st.version) return f.dist;
    var dist = flood(st.lv, from, gates, boards ? st.blocked : null);
    st.fields[name] = { from: from, version: st.version, dist: dist };
    return dist;
  }
  // the neighbour of `c` nearest the field's source: [cell, dir], or null
  function downhill(st, dist, c, gates) {
    var best = null, bd = dist[c] < 0 ? 32767 : dist[c];
    for (var d = 0; d < 4; d++) {
      var m = neighbor(st.lv, c, d);
      if (st.lv.wall[m] || (!gates && st.lv.gate[m]) || dist[m] < 0) continue;
      if (dist[m] < bd) { bd = dist[m]; best = [m, d]; }
    }
    return best;
  }

  // ---- you ----------------------------------------------------------------------------
  function turn(st, d) { if (d >= 0 && d < 4) st.player.want = d; }
  function movePlayer(st, dist) {
    var p = st.player, lv = st.lv, guard = 0;
    while (dist > 0 && guard++ < 8) {
      if (p.to < 0) {
        var d = -1, m;
        if (p.want >= 0 && openForPlayer(st, neighbor(lv, p.cell, p.want))) d = p.want;
        else if (p.dir >= 0 && openForPlayer(st, neighbor(lv, p.cell, p.dir))) d = p.dir;
        if (d < 0) { p.dir = -1; return; }
        m = neighbor(lv, p.cell, d);
        p.dir = d; p.face = d; p.to = m; p.p = 0;
      } else if (p.want >= 0 && p.want === (p.dir + 2) % 4) {       // straight back: turn on the spot
        var t = p.cell; p.cell = p.to; p.to = t; p.p = 1 - p.p; p.dir = p.want; p.face = p.dir;
      }
      var need = 1 - p.p;
      if (dist < need) { p.p += dist; return; }
      dist -= need;
      p.last = p.cell; p.cell = p.to; p.to = -1; p.p = 0;
      arrive(st);
      if (st.status !== "play") return;
    }
  }
  function arrive(st) {
    var c = st.player.cell, it = st.items[c];
    if (!it) return;
    delete st.items[c];
    if (it === "tin") {
      st.score += TUNE.tin; st.tins++; st.left--;
      st.events.push({ t: "tin", cell: c });
      if (st.tins % TUNE.tinsPerPlank === 0 && st.planks < TUNE.maxPlanks) { st.planks++; st.events.push({ t: "plank", cell: c, earned: true }); }
    } else if (it === "torch") {
      st.score += TUNE.torch; st.left--;
      st.torch = torchFor(st.round); st.chain = 0;
      st.events.push({ t: "torch", cell: c });
    } else if (it === "plank") {
      st.score += TUNE.plank;
      if (st.planks < TUNE.maxPlanks) st.planks++;
      st.events.push({ t: "plank", cell: c });
    }
    if (st.left <= 0) { st.status = "clear"; st.wait = TUNE.clearMs; st.score += TUNE.clear; st.events.push({ t: "clear" }); }
  }
  // nail a barricade across the cell you've just left
  function board(st) {
    var p = st.player, c = p.last, ok = st.status === "play" && st.planks > 0 && c >= 0 && c !== p.cell && c !== p.to && !st.lv.wall[c] && !st.lv.gate[c] && !st.blocked[c];
    if (ok) ok = !st.dead.some(function (z) { return z.state !== "den" && (z.cell === c || z.to === c); });
    if (!ok) { st.events.push({ t: "nope" }); return false; }
    st.planks--;
    st.boards.push({ cell: c, hp: TUNE.boardMs, max: TUNE.boardMs, hit: 0 });
    st.blocked[c] = 1; st.version++;
    st.events.push({ t: "board", cell: c });
    return true;
  }

  // ---- the dead --------------------------------------------------------------------------
  function target(st, z) {
    var p = st.player, lv = st.lv;
    if (z.kind === 1 && p.dir >= 0) {                     // the Lurker: a few steps ahead of you
      var c = p.to >= 0 ? p.to : p.cell;
      for (var k = 0; k < 4; k++) { var m = neighbor(lv, c, p.dir); if (lv.wall[m] || lv.gate[m]) break; c = m; }
      return c;
    }
    return p.to >= 0 && p.p > 0.5 ? p.to : p.cell;
  }
  function randomStep(st, z) {
    var opts = [], back = (z.dir + 2) % 4, d, m;
    for (d = 0; d < 4; d++) { m = neighbor(st.lv, z.cell, d); if (!st.lv.wall[m] && !st.lv.gate[m] && !st.blocked[m] && d !== back) opts.push([m, d]); }
    if (!opts.length) { m = neighbor(st.lv, z.cell, back); return st.lv.wall[m] || st.lv.gate[m] || st.blocked[m] ? null : [m, back]; }
    for (d = 0; d < opts.length; d++) if (opts[d][1] === z.dir && st.rng() < 0.55) return opts[d];
    return opts[Math.floor(st.rng() * opts.length)];
  }
  // where one of the dead steps next from the middle of its cell: [cell, dir], or null to stay put
  function choose(st, z) {
    var lv = st.lv, step, me = st.player.cell;
    z.pound = false;
    if (z.state === "den") return null;
    if (z.state === "down") {
      if (z.cell === lv.den || z.cell === z.home) { z.state = "den"; z.release = TUNE.riseMs; st.events.push({ t: "home", kind: z.kind }); return null; }
      return downhill(st, field(st, "den", lv.den, false, true), z.cell, true);
    }
    if (z.state === "leave") {
      if (z.cell === lv.exit) z.state = "roam";
      else return downhill(st, field(st, "exit", lv.exit, false, true), z.cell, true);
    }
    if (st.torch > 0) {                                    // the fire: away from you, whichever way is furthest
      var away = field(st, "me", me, true, false), best = null, bd = -1;
      for (var d = 0; d < 4; d++) {
        var m = neighbor(lv, z.cell, d);
        if (lv.wall[m] || lv.gate[m] || st.blocked[m]) continue;
        var v = away[m] < 0 ? 999 : away[m] + st.rng() * 0.5;
        if (v > bd) { bd = v; best = [m, d]; }
      }
      return best;
    }
    var free = field(st, "me-free", me, false, false);     // the way to you, barricades or no
    if (z.kind === 2) {                                    // the Sniffer has your scent near, and loses it far
      var far = free[z.cell];
      if (far >= 0 && far <= TUNE.sniffNear) z.scent = true; else if (far < 0 || far > TUNE.sniffFar) z.scent = false;
      if (!z.scent) return randomStep(st, z);
    } else if (st.wander) return randomStep(st, z);
    var tg = target(st, z);
    var open = field(st, "t" + z.kind, tg, true, false), thru = field(st, "f" + z.kind, tg, false, false);
    var round = open[z.cell], straight = thru[z.cell];
    if (z.kind !== 3 && round >= 0 && (straight < 0 || round - straight <= TUNE.detour)) {
      step = downhill(st, open, z.cell, false);
      if (step) return step;
    }
    step = downhill(st, thru, z.cell, false);
    if (step && st.blocked[step[0]]) { z.pound = true; z.dir = step[1]; return null; }     // in the way: hammer on it
    return step || randomStep(st, z);
  }
  function moveDead(st, z, ms) {
    if (z.hold > 0) { z.hold -= ms; return; }
    if (z.state === "den") {
      z.release -= ms;
      if (z.release <= 0) z.state = "leave"; else return;
    }
    var dist = speedOf(st, z) * ms / 1000, guard = 0;
    while (dist > 0 && guard++ < 8) {
      if (z.to < 0) {
        var step = choose(st, z);
        if (!step) return;
        z.to = step[0]; z.dir = step[1]; z.p = 0;
      }
      var need = 1 - z.p;
      if (dist < need) { z.p += dist; return; }
      dist -= need;
      z.cell = z.to; z.to = -1; z.p = 0;
    }
  }
  // where an actor is, in cells (the drawing uses the same figures)
  function where(lv, a) {
    var x = a.cell % lv.cols, y = Math.floor(a.cell / lv.cols);
    if (a.to < 0 || a.dir < 0) return { x: x, y: y };
    return { x: x + DX[a.dir] * a.p, y: y + DY[a.dir] * a.p };
  }

  // ---- one tick ----------------------------------------------------------------------------
  function step(st, ms, input) {
    st.events.length = 0;
    if (input) { if (input.dir != null) turn(st, input.dir); if (input.board) board(st); }
    if (st.status === "ready") { if (st.player.want >= 0) st.status = "play"; else return st.events; }
    if (st.status === "bitten" || st.status === "clear") {
      st.wait -= ms;
      if (st.wait <= 0 && st.status === "bitten") {
        if (st.lives <= 0) { st.status = "over"; st.events.push({ t: "over" }); }
        else { place(st); st.status = "ready"; st.events.push({ t: "again" }); }
      } else if (st.wait <= 0) st.status = "next";
      return st.events;
    }
    if (st.status !== "play") return st.events;
    st.clock += ms;
    // the dead take turns hunting and wandering; a lit torch stops the clock
    if (st.torch > 0) {
      st.torch -= ms;
      if (st.torch <= 0) { st.torch = 0; st.chain = 0; st.events.push({ t: "dark" }); }
    } else {
      st.modeLeft -= ms;
      if (st.modeLeft <= 0) { st.wander = !st.wander; st.modeLeft = st.wander ? TUNE.wanderMs : TUNE.huntMs; }
    }
    movePlayer(st, TUNE.playerSpeed * ms / 1000);
    if (st.status !== "play") return st.events;
    var i, z, b;
    for (i = 0; i < st.dead.length; i++) moveDead(st, st.dead[i], ms);
    // barricades give way: slowly alone, fast with the dead hammering
    for (i = st.boards.length - 1; i >= 0; i--) {
      b = st.boards[i];
      var rate = 1; b.hit = 0;
      st.dead.forEach(function (zz) { if (zz.pound && zz.to < 0 && neighbor(st.lv, zz.cell, zz.dir) === b.cell) { rate += zz.kind === 3 ? TUNE.brutePound : TUNE.pound; b.hit++; } });
      b.hp -= ms * rate;
      if (b.hp <= 0) { st.boards.splice(i, 1); st.blocked[b.cell] = 0; st.version++; st.events.push({ t: "smash", cell: b.cell, hammered: b.hit > 0 }); }
    }
    // touching one of the dead: a bite, or with a torch lit a knock-down
    var me = where(st.lv, st.player);
    for (i = 0; i < st.dead.length; i++) {
      z = st.dead[i];
      if (z.state !== "roam") continue;
      var at = where(st.lv, z);
      if (Math.abs(at.x - me.x) + Math.abs(at.y - me.y) > TUNE.touch) continue;
      if (st.torch > 0) {
        var pts = TUNE.knock * Math.pow(2, st.chain++);
        st.score += pts; z.state = "down"; z.pound = false;
        if (z.to >= 0 && z.p < 0.5) { z.to = -1; z.p = 0; } else if (z.to >= 0) { z.cell = z.to; z.to = -1; z.p = 0; }
        st.events.push({ t: "knock", kind: z.kind, pts: pts, x: at.x, y: at.y });
      } else {
        st.lives--; st.status = "bitten"; st.wait = TUNE.biteMs;
        st.events.push({ t: "bitten", kind: z.kind, lives: st.lives });
        break;
      }
    }
    return st.events;
  }

  return {
    parse: parse, create: create, step: step, turn: turn, board: board, where: where, neighbor: neighbor, flood: flood,
    TUNE: TUNE, MAX_SIDE: MAX_SIDE, MAX_DEAD: MAX_DEAD, DX: DX, DY: DY
  };
});
