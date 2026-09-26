/* =====================================================================
   Slither — Labyrinth rules engine.

   Pure rules: no DOM, no audio, no clock of its own. The page
   (labyrinth.js) feeds it input and elapsed milliseconds, then turns the
   events it leaves in `state.events` into sound and HUD updates. verify.js
   drives the same code from Node, so the level checker plays by the rules
   the game actually uses.

   Every snake moves on its own timer (the player, a dashing player, and
   each enemy type run at different speeds), so advance() walks time
   forward event by event and resolves all snakes that move at the same
   instant together — head-ons and tail-chasing work like classic Snake.

   Grid legend (levels.js):
     #  wall            .  floor         S  start
     E  exit — opens once every red apple is gone (by you or an enemy)
     a  red apple (required)   t  blink apple: one click-teleport
     g  ghost apple: fills the ghost meter   f  fast apple: permanent speed-up
     ~  ice: you can't turn while on it
     D  door, shut at start   d  door, open at start   k  switch: flips every door
     ^  spikes, raised first  v  spikes, lowered first  (they alternate)
     x  cutter: trims whoever enters it back to 3 segments
     :  darkness: snakes are invisible here (an item with darkness on two
        or more sides is dark too)
     1-4  portal pairs (each digit appears exactly twice)
     W  wanderer   H  hunter   M  muncher (races you for apples)
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.SlitherEngine = mod;
})(this, function () {
  "use strict";

  var T = {
    FLOOR: 0, WALL: 1, EXIT: 2, ICE: 3, DOOR_SHUT: 4, DOOR_OPEN: 5,
    SWITCH: 6, SPIKE_A: 7, SPIKE_B: 8, CUTTER: 9, DARK: 10, PORTAL: 11,
  };

  var LEGEND = {
    "#": { tile: T.WALL }, ".": {}, " ": {},
    "S": { start: true }, "E": { tile: T.EXIT },
    "a": { item: "apple" }, "t": { item: "blink" }, "g": { item: "ghost" }, "f": { item: "fast" },
    "~": { tile: T.ICE }, "D": { tile: T.DOOR_SHUT }, "d": { tile: T.DOOR_OPEN }, "k": { tile: T.SWITCH },
    "^": { tile: T.SPIKE_A }, "v": { tile: T.SPIKE_B }, "x": { tile: T.CUTTER }, ":": { tile: T.DARK },
    "W": { enemy: "wander" }, "H": { enemy: "hunt" }, "M": { enemy: "munch" },
  };

  var CFG = {
    playerMs: 135,        // ms per cell at base speed
    dashFactor: 0.5,      // holding dash halves that
    fastStepMs: 12,       // each fast apple shaves this off the base
    minPlayerMs: 60,
    enemyMs: { wander: 240, hunt: 200, munch: 175 },
    startLen: 3,
    enemyLen: 4,
    ghostPerApple: 10,    // cells of phasing per ghost apple
    ghostMax: 30,
    spikeMs: 1400,        // each phase (raised / lowered) lasts this long
    spikeWarnMs: 450,     // lowered spikes flash for this long before rising
    cutLen: 3,
    maxStepMs: 100,       // a returning background tab must not fast-forward
  };

  // Directions: 0 up, 1 right, 2 down, 3 left.
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  var EPS = 1e-6;

  // ---- parsing -------------------------------------------------------------
  function parse(level) {
    var grid = level.grid, rows = grid.length, cols = rows ? grid[0].length : 0;
    var errors = [];
    var tiles = new Array(cols * rows), items = {}, partner = {}, portalId = {};
    var pairs = {}, enemies = [], start = -1, exits = 0, apples = 0;
    for (var y = 0; y < rows; y++) {
      if (grid[y].length !== cols) errors.push("row " + y + " is " + grid[y].length + " wide, expected " + cols);
      for (var x = 0; x < cols; x++) {
        var ch = grid[y].charAt(x) || "#", i = y * cols + x;
        tiles[i] = T.FLOOR;
        if (ch >= "1" && ch <= "4") { tiles[i] = T.PORTAL; (pairs[ch] = pairs[ch] || []).push(i); continue; }
        var L = LEGEND[ch];
        if (!L) { errors.push("unknown tile '" + ch + "' at " + x + "," + y); continue; }
        if (L.tile != null) tiles[i] = L.tile;
        if (L.tile === T.EXIT) exits++;
        if (L.item) { items[i] = L.item; if (L.item === "apple") apples++; }
        if (L.enemy) enemies.push({ kind: L.enemy, at: i });
        if (L.start) { if (start >= 0) errors.push("more than one start"); start = i; }
      }
    }
    // An item in a dark area sits in the dark too: items are always on floor,
    // so without this every apple would punch a lit hole in the darkness —
    // and show your snake as it passes. Dark behaves exactly like floor.
    Object.keys(items).forEach(function (k) {
      var i = Number(k), x = i % cols, y = Math.floor(i / cols), dark = 0;
      if (tiles[i] !== T.FLOOR) return;
      if (x > 0 && tiles[i - 1] === T.DARK) dark++;
      if (x < cols - 1 && tiles[i + 1] === T.DARK) dark++;
      if (y > 0 && tiles[i - cols] === T.DARK) dark++;
      if (y < rows - 1 && tiles[i + cols] === T.DARK) dark++;
      if (dark >= 2) tiles[i] = T.DARK;
    });
    Object.keys(pairs).forEach(function (k) {
      var p = pairs[k];
      if (p.length !== 2) { errors.push("portal " + k + " appears " + p.length + " times, expected 2"); return; }
      partner[p[0]] = p[1]; partner[p[1]] = p[0];
      portalId[p[0]] = portalId[p[1]] = Number(k) - 1;
    });
    if (start < 0) errors.push("no start (S)");
    if (!exits) errors.push("no exit (E)");
    return {
      cols: cols, rows: rows, tiles: tiles, items: items, partner: partner, portalId: portalId,
      enemies: enemies, start: start, apples: apples, errors: errors,
      hasSpikes: tiles.some(function (t) { return t === T.SPIKE_A || t === T.SPIKE_B; }),
    };
  }

  // ---- state -----------------------------------------------------------------
  function makeSnake(kind, at, len, ms) {
    var body = [];
    for (var i = 0; i < len; i++) body.push(at); // coiled on one cell; uncoils as it moves
    return { kind: kind, body: body, dir: -1, queue: [], alive: true, baseMs: ms, timer: ms, grow: 0, diedAt: 0 };
  }

  function create(level) {
    var lv = parse(level);
    if (lv.errors.length) throw new Error((level.name || "level") + ": " + lv.errors.join("; "));
    var speed = level.speed || CFG.playerMs;
    var enemyMs = level.enemyMs || {};
    var st = {
      lv: lv, cols: lv.cols, rows: lv.rows, tiles: lv.tiles,
      items: Object.assign({}, lv.items),
      applesLeft: lv.apples,
      status: "ready",          // ready -> play -> won | dead
      cause: "",
      flipped: false,           // doors swapped by a switch
      spikePhase: true,         // true: ^ raised, v lowered
      spikeMs: level.spikeMs || CFG.spikeMs,
      spikeTimer: level.spikeMs || CFG.spikeMs,
      timeLimit: (level.time || 0) * 1000,
      timeLeft: level.time ? level.time * 1000 : Infinity,
      elapsed: 0,
      teleports: 0,
      ghost: 0,
      ghostHeld: false,
      ghostActive: false,       // the player phased on its latest move
      dashHeld: false,
      pendingBlink: -1,
      events: [],
      snakes: [],
    };
    st.player = makeSnake("player", lv.start, CFG.startLen, speed);
    st.snakes.push(st.player);
    lv.enemies.forEach(function (e) {
      var s = makeSnake(e.kind, e.at, CFG.enemyLen, enemyMs[e.kind] || CFG.enemyMs[e.kind]);
      s.dir = firstOpenDir(st, s);
      st.snakes.push(s);
    });
    return st;
  }

  // ---- geometry --------------------------------------------------------------
  function neighbor(st, i, d) {
    var x = i % st.cols + DX[d], y = Math.floor(i / st.cols) + DY[d];
    if (x < 0 || y < 0 || x >= st.cols || y >= st.rows) return -1;
    return y * st.cols + x;
  }
  // Where a head heading `d` from `i` ends up: stepping onto a portal lands
  // on its partner, still facing the same way (as in classic Slither).
  function moveTarget(st, i, d) {
    var n = neighbor(st, i, d);
    if (n >= 0 && st.tiles[n] === T.PORTAL) return st.lv.partner[n];
    return n;
  }
  function spikeUp(st, i) {
    var t = st.tiles[i];
    return (t === T.SPIKE_A && st.spikePhase) || (t === T.SPIKE_B && !st.spikePhase);
  }
  function solidFor(st, s, i, ghost) {
    var t = st.tiles[i];
    if (t === T.WALL) return !ghost;
    if (t === T.DOOR_SHUT) return !ghost && !st.flipped;
    if (t === T.DOOR_OPEN) return !ghost && st.flipped;
    // Enemies never take the exit; a locked exit is a wall; a ghost floats
    // through the arch without leaving.
    if (t === T.EXIT) return s.kind !== "player" || (!ghost && st.applesLeft > 0);
    return false;
  }
  function isDoorShut(st, i) {
    var t = st.tiles[i];
    return (t === T.DOOR_SHUT && !st.flipped) || (t === T.DOOR_OPEN && st.flipped);
  }
  function interval(st, s) {
    return s === st.player && st.dashHeld ? s.baseMs * CFG.dashFactor : s.baseMs;
  }
  function occupied(st, i, ignorePlayer) {
    for (var k = 0; k < st.snakes.length; k++) {
      var s = st.snakes[k];
      if (!s.alive || (ignorePlayer && s === st.player)) continue;
      if (s.body.indexOf(i) !== -1) return true;
    }
    return false;
  }

  // ---- player input ----------------------------------------------------------
  // Up to two turns queue, so a quick up-then-left in a corridor lands on
  // consecutive cells instead of the second press being swallowed.
  function turn(st, d) {
    var p = st.player;
    if (!p.alive) return;
    if (st.status === "ready") {
      st.status = "play";
      p.dir = d;
      st.events.push({ type: "start" });
      return;
    }
    if (st.status !== "play") return;
    var last = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
    if (d === last || d === (last + 2) % 4) return;
    if (p.queue.length >= 2) return;
    p.queue.push(d);
  }

  // A blink lands on any open, empty cell — never on a wall, a shut door, the
  // exit, a portal, a raised spike, or a snake.
  function canBlinkTo(st, i) {
    if (i < 0 || i >= st.tiles.length) return false;
    var t = st.tiles[i];
    if (t === T.WALL || t === T.EXIT || t === T.PORTAL) return false;
    if (isDoorShut(st, i) || spikeUp(st, i)) return false;
    return !occupied(st, i, false);
  }
  function blink(st, i) {
    if (st.status !== "play" || st.teleports <= 0 || !canBlinkTo(st, i)) return false;
    st.pendingBlink = i;
    return true;
  }
  function setGhost(st, held) { st.ghostHeld = !!held; }
  function setDash(st, held) {
    held = !!held;
    if (held === st.dashHeld) return;
    st.dashHeld = held;
    // Dash should bite now, not after the current (slow) step finishes.
    if (held) st.player.timer = Math.min(st.player.timer, interval(st, st.player));
  }

  // ---- enemy brains ----------------------------------------------------------
  function safeFor(st, s, n) {
    return n >= 0 && !solidFor(st, s, n, false) && !spikeUp(st, n) && !occupied(st, n, st.ghostActive);
  }
  function firstOpenDir(st, s) {
    for (var d = 0; d < 4; d++) {
      var n = moveTarget(st, s.body[0], d);
      if (n >= 0 && !solidFor(st, s, n, false)) return d;
    }
    return 1;
  }
  // Multi-source BFS from each safe first step; returns the first step whose
  // flood reaches a goal cell first, or -1.
  function pathStep(st, s, options, goals) {
    var seen = {}, queue = [];
    for (var o = 0; o < options.length; o++) {
      var c = options[o].n;
      if (goals[c]) return options[o].d;
      if (!seen[c]) { seen[c] = true; queue.push({ c: c, d: options[o].d }); }
    }
    for (var q = 0; q < queue.length; q++) {
      for (var d = 0; d < 4; d++) {
        var n = moveTarget(st, queue[q].c, d);
        if (n < 0 || seen[n]) continue;
        seen[n] = true;
        if (goals[n]) return queue[q].d;
        if (solidFor(st, s, n, false) || occupied(st, n, st.ghostActive)) continue;
        queue.push({ c: n, d: queue[q].d });
      }
    }
    return -1;
  }
  function hunterGoals(st) {
    // Aim for the cells just ahead of the player's head, so the player is
    // the one who runs into the hunter's body.
    var p = st.player, goals = {}, any = false;
    if (!p.alive || p.dir < 0) return null;
    var c = p.body[0];
    for (var k = 0; k < 4; k++) {
      c = moveTarget(st, c, p.dir);
      if (c < 0 || solidFor(st, p, c, false)) break;
      if (k >= 1) { goals[c] = true; any = true; }
    }
    if (!any) for (var d = 0; d < 4; d++) {
      var n = neighbor(st, p.body[0], d);
      if (n >= 0 && !solidFor(st, p, n, false)) { goals[n] = true; any = true; }
    }
    return any ? goals : null;
  }
  function appleGoals(st) {
    var goals = null;
    Object.keys(st.items).forEach(function (k) {
      if (st.items[k] === "apple") { goals = goals || {}; goals[k] = true; }
    });
    return goals;
  }
  function think(st, s) {
    var head = s.body[0];
    var rev = s.body.length > 1 && s.body[1] !== head ? (s.dir + 2) % 4 : -1;
    var options = [];
    for (var d = 0; d < 4; d++) {
      if (d === rev) continue;
      var n = moveTarget(st, head, d);
      if (safeFor(st, s, n)) options.push({ d: d, n: n });
    }
    if (!options.length) return s.dir < 0 ? 0 : s.dir; // boxed in: it crashes
    var goals = s.kind === "hunt" ? hunterGoals(st) : s.kind === "munch" ? appleGoals(st) : null;
    if (goals) {
      var step = pathStep(st, s, options, goals);
      if (step >= 0) return step;
    }
    for (var o = 0; o < options.length; o++) {
      if (options[o].d === s.dir && Math.random() < 0.75) return s.dir;
    }
    return options[Math.floor(Math.random() * options.length)].d;
  }

  // ---- resolution ------------------------------------------------------------
  function kill(st, s, cause) {
    s.alive = false;
    s.diedAt = st.elapsed;
    if (s === st.player) {
      st.status = "dead";
      st.cause = cause;
      st.events.push({ type: "dead", cause: cause, at: s.body[0] });
    } else {
      st.events.push({ type: "enemyDied", cause: cause, at: s.body[0], kind: s.kind });
    }
  }

  function eats(s, item) { return s.kind === "player" || item === "apple"; }

  function moveSnakes(st, movers) {
    var p = st.player;
    var ghostNow = st.ghostActive;
    var plans = movers.map(function (s) {
      var plan = { s: s, from: s.body[0], to: -1, blink: false, portal: false, dead: "" };
      var onIce = st.tiles[s.body[0]] === T.ICE;
      if (s === p) {
        ghostNow = st.ghostHeld && st.ghost > 0;
        if (st.pendingBlink >= 0) {
          if (canBlinkTo(st, st.pendingBlink)) { plan.to = st.pendingBlink; plan.blink = true; st.teleports--; }
          else st.events.push({ type: "blinkFail" });
          st.pendingBlink = -1;
        }
        if (!plan.blink && !onIce && s.queue.length) s.dir = s.queue.shift();
      } else if (!onIce) {
        s.dir = think(st, s);
      }
      if (!plan.blink) {
        var n = neighbor(st, s.body[0], s.dir);
        if (n >= 0 && st.tiles[n] === T.PORTAL) { n = st.lv.partner[n]; plan.portal = true; }
        plan.to = n;
      }
      return plan;
    });
    if (movers.indexOf(p) !== -1) st.ghostActive = ghostNow;

    // Who occupies what after everyone's tail has moved on. A mover's tail
    // cell frees up unless it is growing (or about to eat).
    var occP = {}, occE = {};
    st.snakes.forEach(function (s) {
      if (!s.alive) return;
      var plan = null;
      for (var k = 0; k < plans.length; k++) if (plans[k].s === s) plan = plans[k];
      var keepTail = !plan || s.grow > 0 || (plan.to >= 0 && st.items[plan.to] && eats(s, st.items[plan.to]));
      var n = s.body.length - (keepTail ? 0 : 1);
      var occ = s === p ? occP : occE;
      for (var j = 0; j < n; j++) occ[s.body[j]] = (occ[s.body[j]] || 0) + 1;
    });

    plans.forEach(function (pl) {
      var s = pl.s, n = pl.to, ghost = s === p && ghostNow;
      if (n < 0) { pl.dead = "edge"; return; }
      if (solidFor(st, s, n, ghost)) { pl.dead = st.tiles[n] === T.EXIT ? "locked" : "wall"; return; }
      if (spikeUp(st, n)) { pl.dead = "spike"; return; }
      if (ghost) return;
      if (s === p) {
        if (occP[n]) pl.dead = "self";
        else if (occE[n]) pl.dead = "enemy";
      } else if (occE[n] || (!st.ghostActive && occP[n])) {
        pl.dead = "body";
      }
    });
    // Head-ons: two heads into one cell, or two heads swapping places.
    for (var a = 0; a < plans.length; a++) {
      for (var b = a + 1; b < plans.length; b++) {
        var A = plans[a], B = plans[b];
        if ((A.s === p && ghostNow) || (B.s === p && ghostNow)) continue;
        if (A.to < 0 || B.to < 0) continue;
        if (A.to === B.to || (A.to === B.from && B.to === A.from)) {
          if (!A.dead) A.dead = A.s === p ? "enemy" : "body";
          if (!B.dead) B.dead = B.s === p ? "enemy" : "body";
        }
      }
    }

    plans.forEach(function (pl) {
      var s = pl.s;
      if (pl.dead) { kill(st, s, pl.dead); return; }
      s.body.unshift(pl.to);
      var item = st.items[pl.to];
      if (item && eats(s, item)) {
        delete st.items[pl.to];
        s.grow++;
        if (item === "apple") {
          st.applesLeft--;
          st.events.push({ type: s === p ? "apple" : "stolen", at: pl.to });
          if (st.applesLeft === 0) st.events.push({ type: "open" });
        } else if (item === "blink") {
          st.teleports++;
          st.events.push({ type: "power", item: item, at: pl.to });
        } else if (item === "ghost") {
          st.ghost = Math.min(CFG.ghostMax, st.ghost + CFG.ghostPerApple);
          st.events.push({ type: "power", item: item, at: pl.to });
        } else if (item === "fast") {
          s.baseMs = Math.max(CFG.minPlayerMs, s.baseMs - CFG.fastStepMs);
          st.events.push({ type: "power", item: item, at: pl.to });
        }
      }
      if (s.grow > 0) s.grow--; else s.body.pop();
      if (pl.portal) st.events.push({ type: "portal", from: pl.from, to: pl.to, player: s === p });
      if (pl.blink) st.events.push({ type: "blink", from: pl.from, to: pl.to });
      var t = st.tiles[pl.to];
      if (t === T.SWITCH && s === p) {
        st.flipped = !st.flipped;
        st.events.push({ type: "switch", at: pl.to });
      } else if (t === T.CUTTER && s.body.length > CFG.cutLen) {
        s.body.length = CFG.cutLen;
        s.grow = 0;
        st.events.push({ type: "cut", at: pl.to, player: s === p });
      } else if (t === T.EXIT && s === p && !ghostNow) {
        st.status = "won";
        st.events.push({ type: "win", at: pl.to });
      }
      if (s === p && ghostNow) st.ghost = Math.max(0, st.ghost - 1);
    });
  }

  function flipSpikes(st) {
    st.spikePhase = !st.spikePhase;
    st.events.push({ type: "spikes" });
    st.snakes.forEach(function (s) {
      if (!s.alive) return;
      for (var j = 0; j < s.body.length; j++) {
        if (spikeUp(st, s.body[j])) { kill(st, s, "spike"); return; }
      }
    });
  }

  // Walk time forward by `dt` ms, stopping at every snake move, spike flip
  // and the time limit, in order.
  function advance(st, dt) {
    if (st.status !== "play") return;
    dt = Math.min(Math.max(dt, 0), CFG.maxStepMs);
    var timed = st.timeLeft !== Infinity;
    while (dt > EPS && st.status === "play") {
      var next = dt;
      st.snakes.forEach(function (s) { if (s.alive && s.timer < next) next = s.timer; });
      if (st.lv.hasSpikes && st.spikeTimer < next) next = st.spikeTimer;
      if (timed && st.timeLeft < next) next = st.timeLeft;
      next = Math.max(next, 0);
      st.snakes.forEach(function (s) { if (s.alive) s.timer -= next; });
      st.spikeTimer -= next;
      st.elapsed += next;
      dt -= next;
      if (timed) {
        st.timeLeft -= next;
        if (st.timeLeft <= EPS) { st.timeLeft = 0; kill(st, st.player, "time"); break; }
      }
      if (st.lv.hasSpikes && st.spikeTimer <= EPS) {
        st.spikeTimer += st.spikeMs;
        flipSpikes(st);
        if (st.status !== "play") break;
      }
      var movers = st.snakes.filter(function (s) { return s.alive && s.timer <= EPS; });
      if (movers.length) {
        moveSnakes(st, movers);
        movers.forEach(function (s) { s.timer += interval(st, s); });
      }
    }
  }

  return {
    T: T, CFG: CFG, DX: DX, DY: DY, LEGEND: LEGEND,
    parse: parse, create: create, advance: advance,
    turn: turn, blink: blink, canBlinkTo: canBlinkTo, setGhost: setGhost, setDash: setDash,
    spikeUp: spikeUp, isDoorShut: isDoorShut, neighbor: neighbor, moveTarget: moveTarget, solidFor: solidFor,
  };
});
