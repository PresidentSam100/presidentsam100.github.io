/* =====================================================================
   Toy Tanks: the rules. No page here: art.js draws, game.js runs the page.

   A copy of Wii Play's Tanks!, to its rules (the Nintendo wiki's tank
   table, the game's manual): your blue tank against the enemy tanks of an
   arena of blocks, cork blocks and holes.
   - Shells: yours bounce off a wall once (the second wall stops them), 5
     at most in the air. Shells destroy shells; a shell destroys any tank it
     hits, your own included once it has left your barrel.
   - Mines: 2 at most of yours down. One goes off after 10 s, when a tank
     comes close (not the one that laid it, until it has driven clear), or
     when a shell hits it. The blast takes every tank, shell and cork block
     in reach, through a wall too, and sets off mines in reach.
   - Holes stop tanks, not shells. Blocks stop both; cork blocks too, until
     a blast breaks them.
   - Lose a tank and you lose a life and the mission starts over, with the
     enemy tanks you've already destroyed staying destroyed. 3 lives, and one
     more for every 5 missions cleared.

   Units are tiles (the arena is COLS x ROWS); time is ms; angles radians,
   0 pointing right, growing clockwise (screen y grows downward).
   ===================================================================== */
(function () {
  "use strict";

  var COLS = 22, ROWS = 17;
  var TANK_R = 0.42, SHELL_R = 0.1, MINE_R = 0.28;
  var TUNE = {
    lives: 3, lifeEvery: 5,
    shellSpeed: { normal: 5.2, fast: 8.2 },        // tiles a second
    move: { none: 0, slow: 1.5, normal: 2.3, fast: 3.1, vfast: 4.1 },
    fuseMs: 10000, mineWarnMs: 2000,                // (the last 2 s it blinks)
    trigger: 1.05,                                  // a tank this near sets a mine off...
    tripMs: 400,                                    // ...with a beep, and it goes off this long after
    blast: 2.0,                                     // the blast's reach
    armClear: 1.3,                                  // its layer must get this far away before it can set it off
    keepOff: 2.9,                                   // how far the tanks keep from a mine they mind (the blast's reach and a margin)
    playerShells: 5, playerMines: 2, playerBounces: 1, playerCooldown: 120,
    leaveBarrelMs: 160,                             // a shell can't hit the tank that fired it until then
    turretTurn: 4.2,                                // radians a second (enemy turrets)
    startMs: 1600                                   // the mission card before the tanks move
  };

  // The enemy tanks, from the Nintendo wiki's table (movement, shell speed,
  // fire rate, ricochets, shells at once, mines, behaviour). Fire is the
  // least time between shells (ms); the AI's own manner is in `ai`. How
  // sharp a shot each one is is this game's own: `look` is how many bank
  // shots it weighs (0: it only fires straight at you), `wobble` how far
  // off its aim can be (radians either way). The violet tank drives at
  // your own tank's pace, though the table has it fast.
  var KINDS = {
    brown:  { name: "Brown",  move: "none",   shell: "normal", fire: 2600, bounces: 1, shells: 1, mines: 0, ai: "passive",    look: 0,  wobble: 0.12 },
    ash:    { name: "Ash",    move: "slow",   shell: "normal", fire: 2200, bounces: 1, shells: 1, mines: 0, ai: "defensive",  look: 8,  wobble: 0.09 },
    marine: { name: "Marine", move: "slow",   shell: "fast",   fire: 2200, bounces: 0, shells: 1, mines: 0, ai: "defensive",  look: 0,  wobble: 0.05 },
    yellow: { name: "Yellow", move: "normal", shell: "normal", fire: 2200, bounces: 1, shells: 1, mines: 4, ai: "incautious", look: 12, wobble: 0.08 },
    pink:   { name: "Pink",   move: "slow",   shell: "normal", fire: 650,  bounces: 1, shells: 3, mines: 0, ai: "offensive",  look: 16, wobble: 0.07 },
    green:  { name: "Green",  move: "none",   shell: "fast",   fire: 1000, bounces: 2, shells: 2, mines: 0, ai: "active",     look: 40, wobble: 0.025 },
    violet: { name: "Violet", move: "normal", shell: "normal", fire: 750,  bounces: 1, shells: 5, mines: 2, ai: "offensive",  look: 20, wobble: 0.06 },
    white:  { name: "White",  move: "slow",   shell: "normal", fire: 750,  bounces: 1, shells: 5, mines: 2, ai: "offensive",  look: 20, wobble: 0.06, invisible: true },
    black:  { name: "Black",  move: "vfast",  shell: "fast",   fire: 600,  bounces: 0, shells: 3, mines: 2, ai: "dynamic",    look: 0,  wobble: 0.02 }
  };
  var KEEP_OFF = TUNE.keepOff;
  // How wary each kind is (the ones that move; brown and green can't): the
  // chance it heeds a given shell at all, how far ahead it sees one coming
  // (ms), whether it sees one coming off a wall, and whether it keeps clear
  // of every mine's blast or only its own side's (and any about to go off).
  // None drives over a mine. The yellow tank is careless of shells.
  var WARY = {
    ash:    { heed: 0.1,  see: 450,  bank: false, mines: "own" },
    marine: { heed: 0.15, see: 500,  bank: false, mines: "own" },
    yellow: { heed: 0,    see: 0,    bank: false, mines: "all" },
    pink:   { heed: 0.45, see: 700,  bank: true,  mines: "all" },
    violet: { heed: 0.6,  see: 850,  bank: true,  mines: "all" },
    white:  { heed: 0.6,  see: 850,  bank: true,  mines: "all" },
    black:  { heed: 0.75, see: 1100, bank: true,  mines: "all" }
  };
  var LETTER = { b: "brown", a: "ash", m: "marine", y: "yellow", p: "pink", g: "green", v: "violet", w: "white", k: "black" };

  // ---- random numbers, seeded (a mission plays the same for the tests) ------
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- the arena ----------------------------------------------------------------
  // A mission's layout is ROWS strings of COLS: "." floor, "#" block, "c"
  // cork block, "o" hole, "P" your tank, and a letter for an enemy tank (see
  // LETTER), each on floor.
  function parse(mission) {
    var rows = mission.map, grid = [], player = null, enemies = [], errors = [];
    if (!rows || rows.length !== ROWS) errors.push("the arena needs " + ROWS + " rows");
    for (var y = 0; y < ROWS; y++) {
      var line = (rows && rows[y]) || "";
      if (line.length !== COLS) errors.push("row " + (y + 1) + " needs " + COLS + " squares");
      for (var x = 0; x < COLS; x++) {
        var ch = line.charAt(x) || ".";
        grid.push(ch === "#" ? 1 : ch === "c" ? 2 : ch === "o" ? 3 : 0);
        if (ch === "P") player = { x: x + 0.5, y: y + 0.5 };
        else if (LETTER[ch]) enemies.push({ kind: LETTER[ch], x: x + 0.5, y: y + 0.5 });
      }
    }
    if (!player) errors.push("the arena has no P for your tank");
    if (!enemies.length) errors.push("the arena has no enemy tank");
    return { grid: grid, player: player, enemies: enemies, errors: errors };
  }
  function tile(st, x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return 1;   // (the arena's rim is a wall)
    return st.grid[ty * COLS + tx];
  }
  function stopsShell(t) { return t === 1 || t === 2; }
  function stopsTank(t) { return t !== 0; }

  // ---- a run and its missions ----------------------------------------------------
  // create(missions, opts): opts.seed, opts.start (the mission index to begin at)
  function create(missions, opts) {
    opts = opts || {};
    var st = { missions: missions, mi: opts.start || 0, lives: TUNE.lives, kills: 0, cleared: 0,
      random: rng(opts.seed == null ? 1 : opts.seed), events: [], status: "start", clock: 0, statusMs: 0 };
    loadMission(st, true);
    return st;
  }
  // (fresh: a new mission; otherwise the same one again after a lost life,
  // its destroyed tanks staying destroyed)
  function loadMission(st, fresh) {
    var m = st.missions[st.mi], lv = parse(m);
    if (fresh) {
      st.grid = lv.grid.slice();
      st.gone = lv.enemies.map(function () { return false; });
    } else st.grid = lv.grid.slice();     // (broken cork comes back with the mission)
    st.gridVer = (st.gridVer || 0) + 1;     // (the shells' paths, as the enemies see them, worked out afresh)
    st.lv = lv;
    st.shells = []; st.mines = []; st.blasts = []; st.tracks = [];
    st.player = tank("player", lv.player.x, lv.player.y, 0);
    st.enemies = [];
    lv.enemies.forEach(function (e, i) {
      if (st.gone[i]) return;
      var t = tank(e.kind, e.x, e.y, Math.PI);
      t.slot = i;
      t.cool = 1000 + st.random() * 700;      // (a moment at the start before an enemy's first shot)
      t.ai.think = st.random() * 400;           // (and each thinks in its own time, not all on one step)
      t.ai.mineT = 1500;                        // (and drives a while before its first mine)
      st.enemies.push(t);
    });
    st.status = "start"; st.statusMs = 0; st.nextId = st.nextId || 1;
    st.events.push({ t: "load", fresh: fresh, mission: st.mi + 1 });
  }
  function tank(kind, x, y, face) {
    var k = KINDS[kind];
    return { kind: kind, x: x, y: y, body: face, turret: face, alive: true, cool: kind === "player" ? 0 : 600, vx: 0, vy: 0,
      burst: 0, ai: { t: 0, goal: null, dodge: null, flee: 0, aimAt: null, think: 0, mineT: 0 },
      player: kind === "player", spec: k || null };
  }
  function enemyCount(st) { return st.lv.enemies.length; }
  function enemiesLeft(st) { return st.enemies.filter(function (e) { return e.alive; }).length; }

  // ---- moving a tank -------------------------------------------------------------
  // A circle against the tiles that stop tanks: each axis on its own, so a tank
  // slides along a wall it meets at an angle.
  function blockedAt(st, x, y, r) {
    for (var ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++)
      for (var tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        if (!stopsTank(tile(st, tx + 0.5, ty + 0.5))) continue;
        var cx = Math.max(tx, Math.min(x, tx + 1)), cy = Math.max(ty, Math.min(y, ty + 1));
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r - 1e-9) return true;
      }
    return false;
  }
  function moveTank(st, t, dx, dy) {
    if (dx && !blockedAt(st, t.x + dx, t.y, TANK_R)) t.x += dx;
    if (dy && !blockedAt(st, t.x, t.y + dy, TANK_R)) t.y += dy;
  }
  // tanks push one another apart (the wiki: enemy tanks push each other around)
  function separate(st) {
    var all = [st.player].concat(st.enemies).filter(function (t) { return t.alive; });
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length; j++) {
      var a = all[i], b = all[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy), min = TANK_R * 2;
      if (d >= min || d === 0) continue;
      var push = (min - d) / 2, ux = dx / d, uy = dy / d;
      moveTank(st, a, -ux * push, -uy * push); moveTank(st, b, ux * push, uy * push);
    }
  }

  // ---- shells ------------------------------------------------------------------------
  function shellsOf(st, t) { var n = 0; st.shells.forEach(function (s) { if (s.owner === t) n++; }); return n; }
  function minesOf(st, t) { var n = 0; st.mines.forEach(function (m) { if (m.owner === t) n++; }); return n; }
  function fire(st, t) {
    var spec = t.player ? null : t.spec, max = t.player ? TUNE.playerShells : spec.shells;
    if (t.cool > 0 || shellsOf(st, t) >= max) return false;
    var speed = TUNE.shellSpeed[t.player ? "normal" : spec.shell], ax = Math.cos(t.turret), ay = Math.sin(t.turret);
    var mx = t.x + ax * (TANK_R + 0.2), my = t.y + ay * (TANK_R + 0.2);
    var s = { id: st.nextId++, x: mx, y: my, vx: ax * speed, vy: ay * speed, owner: t, bounces: t.player ? TUNE.playerBounces : spec.bounces, b0: t.player ? TUNE.playerBounces : spec.bounces,
      fast: !t.player && spec.shell === "fast", age: 0, enemy: !t.player };
    // a barrel inside a block: the shell is spent at once (it would come out the far side)
    if (stopsShell(tile(st, mx, my))) { st.events.push({ t: "fizz", x: mx, y: my }); t.cool = t.player ? TUNE.playerCooldown : spec.fire; return true; }
    st.shells.push(s);
    t.cool = t.player ? TUNE.playerCooldown : spec.fire;
    st.events.push({ t: "fire", x: mx, y: my, player: t.player, fast: s.fast });
    return true;
  }
  // One shell's step: in short hops, bouncing off a wall face (each axis on
  // its own) while it has bounces left, spent on the next. (ev: where its
  // events go; none when the enemies only work out where it will be.)
  function stepShell(st, s, dt) { return moveShell(st, s, dt, st.events); }
  function moveShell(st, s, dt, ev) {
    var dist = Math.sqrt(s.vx * s.vx + s.vy * s.vy) * dt / 1000, hops = Math.max(1, Math.ceil(dist / 0.1));
    for (var h = 0; h < hops; h++) {
      var nx = s.x + s.vx * dt / 1000 / hops, ny = s.y + s.vy * dt / 1000 / hops;
      var hitX = stopsShell(tile(st, nx, s.y)), hitY = stopsShell(tile(st, s.x, ny)), hitXY = stopsShell(tile(st, nx, ny));
      if (hitX || hitY || hitXY) {
        if (s.bounces <= 0) { if (ev) ev.push({ t: "spent", x: s.x, y: s.y }); return false; }
        s.bounces--;
        if (hitX) s.vx = -s.vx;
        if (hitY) s.vy = -s.vy;
        if (!hitX && !hitY) { s.vx = -s.vx; s.vy = -s.vy; }   // (a corner, head on)
        if (ev) ev.push({ t: "bounce", x: s.x, y: s.y });
        continue;
      }
      s.x = nx; s.y = ny;
    }
    return true;
  }

  // ---- mines -------------------------------------------------------------------------
  function layMine(st, t) {
    var max = t.player ? TUNE.playerMines : t.spec.mines;
    if (!max || minesOf(st, t) >= max) return false;
    for (var i = 0; i < st.mines.length; i++) { var m = st.mines[i]; if (Math.hypot(m.x - t.x, m.y - t.y) < 0.8) return false; }
    st.mines.push({ id: st.nextId++, x: t.x, y: t.y, owner: t, age: 0, armed: false, enemy: !t.player });
    st.events.push({ t: "mine", x: t.x, y: t.y, player: t.player });
    return true;
  }
  function boom(st, m) {
    if (m.gone) return;
    m.gone = true;
    st.blasts.push({ x: m.x, y: m.y, age: 0 });
    st.events.push({ t: "blast", x: m.x, y: m.y });
    var R = TUNE.blast;
    // cork in reach breaks (a block's centre within it)
    for (var ty = Math.floor(m.y - R); ty <= Math.floor(m.y + R); ty++) for (var tx = Math.floor(m.x - R); tx <= Math.floor(m.x + R); tx++) {
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
      if (st.grid[ty * COLS + tx] === 2 && Math.hypot(tx + 0.5 - m.x, ty + 0.5 - m.y) <= R + 0.2) { st.grid[ty * COLS + tx] = 0; st.gridVer++; st.events.push({ t: "cork", x: tx + 0.5, y: ty + 0.5 }); }
    }
    st.shells = st.shells.filter(function (s) { return Math.hypot(s.x - m.x, s.y - m.y) > R; });
    [st.player].concat(st.enemies).forEach(function (t) { if (t.alive && Math.hypot(t.x - m.x, t.y - m.y) <= R + TANK_R * 0.5) kill(st, t, "blast", m.owner); });
    st.mines.forEach(function (o) { if (!o.gone && Math.hypot(o.x - m.x, o.y - m.y) <= R) boom(st, o); });
  }

  // (by: whose shell or mine it was, "you", "self" or "enemy")
  function kill(st, t, how, owner) {
    if (!t.alive) return;
    t.alive = false;
    st.events.push({ t: "dead", x: t.x, y: t.y, kind: t.kind, how: how, by: !owner ? "" : owner.player ? "you" : owner === t ? "self" : "enemy" });
    if (!t.player) { st.gone[t.slot] = true; st.kills++; }
  }

  // ---- one step of the game: dt ms, input { mx, my, aim, fire, mine } ----------------
  //   mx, my: the drive direction (each -1, 0 or 1, or a stick's -1..1)
  //   aim: the turret's angle; fire, mine: pressed this step
  function step(st, dt, input) {
    st.events = [];
    st.clock += dt;
    if (st.status === "start") {
      st.statusMs += dt;
      if (input && input.aim != null) st.player.turret = input.aim;
      if (st.statusMs >= TUNE.startMs) { st.status = "play"; st.statusMs = 0; st.events.push({ t: "go" }); }
      return st.events;
    }
    if (st.status === "lost" || st.status === "won") {
      st.statusMs += dt;
      if (st.statusMs >= 1700) advanceAfter(st);
      stepEffects(st, dt);
      return st.events;
    }
    if (st.status !== "play") return st.events;

    // your tank
    var p = st.player;
    if (p.alive) {
      input = input || {};
      if (input.aim != null) p.turret = input.aim;
      var mx = input.mx || 0, my = input.my || 0, len = Math.hypot(mx, my), ox = p.x, oy = p.y;
      if (len > 1) { mx /= len; my /= len; len = 1; }
      if (len > 0.05) {
        var sp = TUNE.move.normal * dt / 1000;
        moveTank(st, p, mx * sp, my * sp);
        p.body = turnToward(p.body, Math.atan2(my, mx), 9 * dt / 1000, true);
        trackMark(st, p);
      }
      // (how fast you're really going, walls and all: the green tank leads you by it)
      p.vx = (p.x - ox) / (dt / 1000); p.vy = (p.y - oy) / (dt / 1000);
      p.cool = Math.max(0, p.cool - dt);
      if (input.fire) fire(st, p);
      if (input.mine) layMine(st, p);
    }
    // the enemy tanks (each seeing where the shells will go)
    st.seen = shellPaths(st);
    st.enemies.forEach(function (e) { if (e.alive) think(st, e, dt); });
    separate(st);
    stepShells(st, dt);
    stepMines(st, dt);
    stepEffects(st, dt);

    if (!p.alive) { st.status = "lost"; st.statusMs = 0; st.lives--; st.events.push({ t: "lost", lives: st.lives }); endShells(st); }
    else if (!enemiesLeft(st)) { st.status = "won"; st.statusMs = 0; st.cleared++; st.events.push({ t: "won", mission: st.mi + 1 }); endShells(st); }
    return st.events;
  }
  // the mission's over: the shells still in the air go out in a puff (one
  // can't win or lose it after the fact)
  function endShells(st) {
    st.shells.forEach(function (s) { st.events.push({ t: "spent", x: s.x, y: s.y }); });
    st.shells = [];
  }
  function advanceAfter(st) {
    if (st.status === "lost") {
      if (st.lives <= 0) { st.status = "over"; st.events.push({ t: "over" }); return; }
      loadMission(st, false);
      return;
    }
    // won: a life for each fifth mission cleared (5, 10, 15, ...), then the next mission (or the end)
    if ((st.mi + 1) % TUNE.lifeEvery === 0) { st.lives++; st.events.push({ t: "life", lives: st.lives }); }
    if (st.mi + 1 >= st.missions.length) { st.status = "done"; st.events.push({ t: "done" }); return; }
    st.mi++;
    loadMission(st, true);
  }
  function stepShells(st, dt) {
    var keep = [];
    st.shells.forEach(function (s) {
      s.age += dt;
      if (s.dead || !stepShell(st, s, dt)) return;
      keep.push(s);
    });
    st.shells = keep;
    // shell against shell: both go
    for (var i = 0; i < st.shells.length; i++) for (var j = i + 1; j < st.shells.length; j++) {
      var a = st.shells[i], b = st.shells[j];
      if (!a.dead && !b.dead && Math.hypot(a.x - b.x, a.y - b.y) < SHELL_R * 2.6) { a.dead = b.dead = true; st.events.push({ t: "clash", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); }
    }
    // shell against tank, and against mine
    st.shells.forEach(function (s) {
      if (s.dead) return;
      [st.player].concat(st.enemies).forEach(function (t) {
        if (s.dead || !t.alive) return;
        if (t === s.owner && s.age < TUNE.leaveBarrelMs) return;
        if (Math.hypot(s.x - t.x, s.y - t.y) < TANK_R + SHELL_R) { s.dead = true; kill(st, t, "shell", s.owner); }
      });
      st.mines.forEach(function (m) { if (!s.dead && !m.gone && Math.hypot(s.x - m.x, s.y - m.y) < MINE_R + SHELL_R) { s.dead = true; boom(st, m); } });
    });
    st.shells = st.shells.filter(function (s) { return !s.dead; });
  }
  function stepMines(st, dt) {
    st.mines.forEach(function (m) {
      if (m.gone) return;
      m.age += dt;
      if (!m.armed && (!m.owner.alive || Math.hypot(m.owner.x - m.x, m.owner.y - m.y) > TUNE.armClear)) m.armed = true;
      if (m.age >= TUNE.fuseMs) { boom(st, m); return; }
      // a tank come near (its layer too, once it has been off it): a beep, and
      // a moment later it goes off (`trip`: ms since the beep)
      if (m.trip != null) { m.trip += dt; if (m.trip >= TUNE.tripMs) boom(st, m); return; }
      [st.player].concat(st.enemies).forEach(function (t) {
        if (m.gone || m.trip != null || !t.alive) return;
        if (t === m.owner && !m.armed) return;
        if (Math.hypot(t.x - m.x, t.y - m.y) < TUNE.trigger) { m.trip = 0; st.events.push({ t: "trip", x: m.x, y: m.y }); }
      });
    });
    st.mines = st.mines.filter(function (m) { return !m.gone; });
  }
  function stepEffects(st, dt) {
    st.blasts.forEach(function (b) { b.age += dt; });
    st.blasts = st.blasts.filter(function (b) { return b.age < 900; });
    st.tracks.forEach(function (k) { k.age += dt; });
    st.tracks = st.tracks.filter(function (k) { return k.age < 6000; });
  }
  function trackMark(st, t) {
    var last = t.lastTrack;
    if (last && Math.hypot(last.x - t.x, last.y - t.y) < 0.35) return;
    t.lastTrack = { x: t.x, y: t.y };
    st.tracks.push({ x: t.x, y: t.y, a: t.body, age: 0, white: t.kind === "white" });
    if (st.tracks.length > 400) st.tracks.shift();
  }

  // ---- angles ----------------------------------------------------------------------------
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  // (a tank's body has no front or back: turning to face either way will do)
  function turnToward(a, to, max, either) {
    var d = wrap(to - a);
    if (either && Math.abs(d) > Math.PI / 2) d = wrap(d - Math.PI);
    return wrap(a + Math.max(-max, Math.min(max, d)));
  }

  // ---- the enemies' minds ------------------------------------------------------------------
  // A shell's path from (x, y) at angle a, bounces as given: where it goes,
  // and which tank it would hit first (null for none within reach).
  // (clear: how wide a berth the path gives tanks other than you, so an
  // enemy's shot keeps clear of its own side as they move about)
  function trace(st, x, y, a, bounces, from, reach, clear) {
    var vx = Math.cos(a), vy = Math.sin(a), dist = 0, stepL = 0.14, pts = [{ x: x, y: y }];
    // (a barrel up against a block: the shell would be spent at once)
    if (stopsShell(tile(st, x, y))) return { hit: null, pts: pts };
    var tanks = [], rr = [], i;
    [st.player].concat(st.enemies).forEach(function (t) {
      if (!t.alive || t === from) return;
      var r = TANK_R + SHELL_R + (t.player ? 0 : clear || 0);
      tanks.push(t); rr.push(r * r);
    });
    var self = (TANK_R + SHELL_R) * (TANK_R + SHELL_R), n = 0;
    while (dist < reach) {
      var nx = x + vx * stepL, ny = y + vy * stepL;
      // (the square it's in is open, so only a step into another square can meet a wall:
      // the same three looks a shell's own step takes, made only then)
      var cx = Math.floor(nx) !== Math.floor(x), cy = Math.floor(ny) !== Math.floor(y);
      var hx = cx && stopsShell(tile(st, nx, y)), hy = cy && stopsShell(tile(st, x, ny)), hxy = (cx || cy) && stopsShell(tile(st, nx, ny));
      if (hx || hy || hxy) {
        if (bounces <= 0) return { hit: null, pts: pts.concat({ x: x, y: y }) };
        bounces--;
        if (hx) vx = -vx;
        if (hy) vy = -vy;
        if (!hx && !hy) { vx = -vx; vy = -vy; }
        pts.push({ x: x, y: y });
        continue;
      }
      x = nx; y = ny; dist += stepL;
      // (the tanks every other step: 0.28 apart, well inside a tank's width)
      if (++n % 2) continue;
      for (i = 0; i < tanks.length; i++) {
        var dx = tanks[i].x - x, dy = tanks[i].y - y;
        if (dx * dx + dy * dy < rr[i]) return { hit: tanks[i], pts: pts.concat({ x: x, y: y }), dist: dist };
      }
      if (from && dist > 0.8) { var fx = from.x - x, fy = from.y - y; if (fx * fx + fy * fy < self) return { hit: from, pts: pts.concat({ x: x, y: y }), dist: dist }; }
    }
    return { hit: null, pts: pts.concat({ x: x, y: y }) };
  }
  function losClear(st, ax, ay, bx, by) {
    var d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.2);
    for (var i = 1; i < n; i++) if (stopsShell(tile(st, ax + (bx - ax) * i / n, ay + (by - ay) * i / n))) return false;
    return true;
  }

  // Where to aim: the straight line first; then, with bounces, angles round
  // the circle (finer for the green tank, which also leads its target). An
  // angle counts if its shell would reach you before any other tank: the
  // enemies never fire into one of their own (the wiki).
  var PER_THINK = 10;
  function chooseShot(st, e) {
    var p = st.player, spec = e.spec;
    var tx = p.x, ty = p.y;
    if (spec.ai === "active" || spec.ai === "dynamic") { // the green and black tanks lead you
      var lead = Math.hypot(p.x - e.x, p.y - e.y) / TUNE.shellSpeed[spec.shell];
      tx = p.x + p.vx * lead; ty = p.y + p.vy * lead;
    }
    var direct = Math.atan2(ty - e.y, tx - e.x);
    var cands = [direct];
    // (the bank shots in turns: a slice of the circle each time it thinks,
    // round it in a few goes, so no one step weighs them all)
    if (spec.bounces > 0 && spec.look) {
      var n = spec.look, k = Math.min(n, PER_THINK), from = e.ai.sweepAt || 0;
      var off = st.random() * 2 * Math.PI / n;
      for (var i = 0; i < k; i++) cands.push(off + ((from + i) % n) * 2 * Math.PI / n);
      e.ai.sweepAt = (from + k) % n;
    }
    var reach = 26;
    for (var c = 0; c < cands.length; c++) {
      var r = trace(st, e.x + Math.cos(cands[c]) * (TANK_R + 0.2), e.y + Math.sin(cands[c]) * (TANK_R + 0.2), cands[c], spec.bounces, e, reach, 0.55);
      if (r.hit === p) return cands[c];
    }
    return null;
  }

  function think(st, e, dt) {
    var spec = e.spec, p = st.player, ai = e.ai;
    e.cool = Math.max(0, e.cool - dt);
    ai.think -= dt;
    // the white tank fades from sight once the mission is under way
    if (spec.invisible) e.hidden = true;

    // flee a mine in reach (the mines it minds: see WARY).
    // Once fleeing it keeps on a little past the edge of the reach, and done,
    // it picks a fresh way to go: the old one would take it straight back in,
    // and it would dither on the edge, in and out a step at a time.
    var threat = null, was = ai.flee;
    st.mines.forEach(function (m) {
      if (!minds(e, m)) return;
      var d = Math.hypot(m.x - e.x, m.y - e.y);
      if (d < KEEP_OFF + (was ? 0.4 : 0) && (!threat || d < threat.d)) threat = { m: m, d: d };
    });
    if (threat && threat.d >= KEEP_OFF && ai.fleeTo && Math.hypot(ai.fleeTo.x - e.x, ai.fleeTo.y - e.y) < 0.3) threat = null;
    ai.flee = threat ? 1 : 0;
    if (was && !ai.flee) { ai.goal = null; ai.fleeTo = null; }

    // dodge a shell it sees coming (its own too, back off a wall): the way
    // to drive is worked out afresh every little while as long as one is
    var dodge = null, w = WARY[e.kind], speed = TUNE.move[spec.move];
    if (w && w.see > 0 && speed > 0) {
      // (it looks every other step: its look ahead is far longer than that)
      ai.lookT = (ai.lookT || 0) - dt;
      if (ai.lookT <= 0) { ai.lookT = 32; ai.danger = incoming(st, e, w); }
      if (ai.danger) {
        ai.dodgeT = (ai.dodgeT || 0) - dt;
        if (!ai.dodge || ai.dodgeT <= 0) { ai.dodge = dodgeWay(st, e, w, speed); ai.dodgeT = 120; }
        dodge = ai.dodge;
      } else ai.dodge = null;
    }

    // turret and fire
    if (!ai.flee && p.alive) {
      if (ai.think <= 0) {
        ai.think = spec.ai === "passive" ? 500 : 260 + st.random() * 160;
        ai.aimAt = chooseShot(st, e);
        if (ai.aimAt != null && spec.wobble) ai.aimAt += (st.random() * 2 - 1) * spec.wobble;
        // the brown tank only sweeps its turret about, and fires when it happens to bear on you
        if (spec.ai === "passive" && ai.aimAt == null) ai.sweep = (ai.sweep || e.turret) + (st.random() - 0.5) * 1.2;
      }
      var want = ai.aimAt != null ? ai.aimAt : ai.sweep != null ? ai.sweep : Math.atan2(p.y - e.y, p.x - e.x);
      e.turret = turnToward(e.turret, want, TUNE.turretTurn * dt / 1000);
      if (ai.aimAt != null && Math.abs(wrap(e.turret - ai.aimAt)) < 0.06 && e.cool <= 0) {
        // (checked again as it fires, the scene having moved: never into one of its own, or itself)
        var check = trace(st, e.x + Math.cos(e.turret) * (TANK_R + 0.2), e.y + Math.sin(e.turret) * (TANK_R + 0.2), e.turret, spec.bounces, e, 30, 0.55);
        if (!check.hit || check.hit === p) { fire(st, e); ai.paused = spec.move === "vfast" || spec.move === "fast" ? 160 : 0; ai.think = 0; }
      }
    }

    // mines: the yellow tank lays them often, the others now and then near you
    if (spec.mines && !ai.flee) {
      ai.mineT -= dt;
      var near = Math.hypot(p.x - e.x, p.y - e.y);
      if (ai.mineT <= 0) {
        ai.mineT = spec.ai === "incautious" ? 1500 + st.random() * 1500 : 4000 + st.random() * 4000;
        // (only where it can get clear of the blast: never into a corner it can't drive out of)
        if ((spec.ai === "incautious" || near < 6) && minesOf(st, e) < spec.mines && canClear(st, e) && layMine(st, e)) {
          ai.flee = 1; threat = { m: st.mines[st.mines.length - 1], d: 0 }; ai.fleeTo = null;
        }
      }
    }

    // where to drive
    if (!speed) return;
    if (ai.paused > 0) { ai.paused -= dt; if (!dodge) return; }   // (a fast tank stops a moment as it fires, unless it has to dodge)
    var dir = null;
    if (dodge) dir = dodge.x || dodge.y ? dodge : null;           // (out of the way may be where it is)
    else if (threat) {
      // off to the safest open spot it can drive straight to (straight away
      // from the mine goes nowhere from one just laid underneath, or with a
      // wall behind)
      // (a spot kept until it's reached, or the tank is stuck, or another mine is down)
      var minded = st.mines.filter(function (m) { return minds(e, m); }).length;
      if (!ai.fleeTo || ai.fleeN !== minded || Math.hypot(ai.fleeTo.x - e.x, ai.fleeTo.y - e.y) < 0.3) { ai.fleeTo = fleeGoal(st, e, null); ai.fleeN = minded; }
      if (ai.fleeTo) { var fx = ai.fleeTo.x - e.x, fy = ai.fleeTo.y - e.y, fl = Math.hypot(fx, fy) || 1; dir = { x: fx / fl, y: fy / fl }; }
    }
    else {
      ai.fleeTo = null;
      ai.t -= dt;
      if (!ai.goal || ai.t <= 0 || Math.hypot(ai.goal.x - e.x, ai.goal.y - e.y) < 0.4) { ai.goal = pickGoal(st, e); ai.t = 1600 + st.random() * 1600; }
      if (ai.goal) { var gx = ai.goal.x - e.x, gy = ai.goal.y - e.y, gl = Math.hypot(gx, gy) || 1; dir = { x: gx / gl, y: gy / gl }; }
    }
    if (dir) {
      var stepL = speed * dt / 1000, ox = e.x, oy = e.y;
      moveTank(st, e, dir.x * stepL, dir.y * stepL);
      if (e.x === ox && e.y === oy) { ai.t = 0; ai.fleeTo = null; }   // (stuck: find another way)
      e.body = turnToward(e.body, Math.atan2(dir.y, dir.x), 8 * dt / 1000, true);
      e.vx = (e.x - ox) / (dt / 1000); e.vy = (e.y - oy) / (dt / 1000);
      trackMark(st, e);
    }
  }
  // A nearby open tile to drive to: toward you for the offensive and
  // dynamic tanks, keeping a distance for the defensive ones, anywhere for
  // the yellow; one the tank can see a way to (a straight run of open floor).
  function pickGoal(st, e) {
    var p = st.player, best = null, bestScore = -1e9, spec = e.spec;
    for (var i = 0; i < 14; i++) {
      var a = st.random() * Math.PI * 2, d = 1.2 + st.random() * 3.5;
      var gx = e.x + Math.cos(a) * d, gy = e.y + Math.sin(a) * d;
      if (gx < 0.6 || gy < 0.6 || gx > COLS - 0.6 || gy > ROWS - 0.6) continue;
      if (blockedAt(st, gx, gy, TANK_R) || !pathClear(st, e.x, e.y, gx, gy) || mineOnPath(st, e, gx, gy)) continue;
      // (never into the reach of a mine it minds: it would only flee again)
      if (st.mines.some(function (m) { return minds(e, m) && Math.hypot(m.x - gx, m.y - gy) < KEEP_OFF; })) continue;
      var pd = Math.hypot(p.x - gx, p.y - gy), score = st.random() * 2;
      if (spec.ai === "offensive" || spec.ai === "dynamic") score -= pd;
      else if (spec.ai === "defensive") score -= Math.abs(pd - 7);
      if (st.mines.some(function (m) { return Math.hypot(m.x - gx, m.y - gy) < TUNE.blast + 0.6; })) score -= 20;
      if (score > bestScore) { bestScore = score; best = { x: gx, y: gy }; }
    }
    return best;
  }
  function pathClear(st, ax, ay, bx, by) {
    var d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.25);
    for (var i = 1; i <= n; i++) if (blockedAt(st, ax + (bx - ax) * i / n, ay + (by - ay) * i / n, TANK_R * 0.95)) return false;
    return true;
  }
  // Would the straight drive from the tank to (bx, by) take it into a mine's
  // reach: near enough to set it off (any mine), or into the blast's reach of
  // one it minds that it's outside now (it could go off as the tank passes)?
  // Its own, until it's armed, it can drive off.
  function mineOnPath(st, e, bx, by) {
    var ax = e.x, ay = e.y, vx = bx - ax, vy = by - ay, ll = vx * vx + vy * vy || 1, zone = KEEP_OFF;
    return st.mines.some(function (m) {
      if (m.gone || (m.owner === e && !m.armed)) return false;
      var k = Math.max(0, Math.min(1, ((m.x - ax) * vx + (m.y - ay) * vy) / ll));
      var near = Math.hypot(ax + vx * k - m.x, ay + vy * k - m.y);
      return near < TUNE.trigger + 0.15 || (minds(e, m) && near < zone && Math.hypot(ax - m.x, ay - m.y) >= zone);
    });
  }
  // The mines a tank keeps clear of: every one, for the wary kinds; for the
  // others their own side's, and any about to go off (blinking, or set
  // going by a tank come near).
  function minds(e, m) {
    var w = WARY[e.kind];
    return !m.gone && ((w && w.mines === "all") || m.enemy || m.trip != null || TUNE.fuseMs - m.age <= TUNE.mineWarnMs);
  }

  // ---- seeing shells coming ------------------------------------------------------------
  // Where a shell will be, every LOOK ms from when it's first looked at,
  // bounces and all (the very steps it will take): worked out once and kept
  // with it, again only if a block has gone since (cork, broken by a mine).
  // Each point: where, and how many walls it has come off by then (nb).
  // (It's worked out only as far ahead as a tank looks: a shell gone first
  // costs no more.)
  var LOOK = 40, LOOK_N = 30;
  function bounced(s) { return (s.b0 != null ? s.b0 : s.bounces) - s.bounces; }
  function pathTo(st, s, upto) {
    if (!s.path || s.pathGrid !== st.gridVer) {
      s.path = []; s.pathAge = s.age; s.pathGrid = st.gridVer; s.pathEnd = false;
      s.pathRun = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, bounces: s.bounces, b: s.bounces, done: bounced(s) };
    }
    var c = s.pathRun;
    while (!s.pathEnd && s.path.length < upto) {
      if (moveShell(st, c, LOOK, null)) s.path.push({ x: c.x, y: c.y, nb: c.done + c.b - c.bounces });
      else s.pathEnd = true;
    }
    return s.path;
  }
  // every shell, for the tanks to look at this step: its path, the point
  // next ahead of where it is now (k), the walls it has come off (done)
  function shellPaths(st) {
    return st.shells.map(function (s) {
      var k = s.path && s.pathGrid === st.gridVer ? Math.max(0, Math.floor((s.age - s.pathAge) / LOOK)) : 0;
      return { s: s, path: pathTo(st, s, k + LOOK_N), k: k, done: bounced(s), speed: Math.hypot(s.vx, s.vy) };
    });
  }
  // the i-th point ahead on a shell's path that a tank sees: as far ahead as
  // it looks, off a wall only if it sees bank shots, and its own only once
  // it has come back off one (null: not this one)
  function sees(e, w, P, i) {
    var q = P.path[P.k + i];
    if (!q || i * LOOK >= w.see) return null;
    if (q.nb > P.done && !w.bank) return null;
    if (P.s.owner === e && !q.nb) return null;
    return q;
  }
  // (a shell too far off to come near in the time a tank looks ahead isn't looked at)
  function within(P, e, ms) { return Math.hypot(P.s.x - e.x, P.s.y - e.y) <= P.speed * ms / 1000 + DANGER + 0.5; }
  // A shell on its way to the tank that it heeds (whether it does is
  // settled the first time it sees it coming, and kept with the shell)
  var DANGER = TANK_R + SHELL_R + 0.3;
  function incoming(st, e, w) {
    return st.seen.some(function (P) {
      if (!within(P, e, w.see)) return false;
      for (var i = 0; i * LOOK < w.see && P.path[P.k + i]; i++) {
        var q = sees(e, w, P, i);
        if (!q || Math.hypot(q.x - e.x, q.y - e.y) >= DANGER) continue;
        var heeds = P.s.heeds || (P.s.heeds = {});
        if (heeds[e.slot] == null) heeds[e.slot] = st.random() < w.heed;
        return heeds[e.slot];
      }
      return false;
    });
  }
  // Which way to drive out of the way: of sixteen headings, and staying put,
  // the one that keeps furthest from every shell it sees over the time it
  // looks ahead (stopping where a block would stop it), and doesn't take it
  // over a mine.
  function dodgeWay(st, e, w, speed) {
    var n = Math.min(LOOK_N, Math.ceil(w.see / LOOK) + 3), sl = speed * LOOK / 1000, most = sl * n, best = null, bestScore = -1e9;
    var mv = Math.hypot(e.vx, e.vy) || 1, near = st.seen.filter(function (P) { return within(P, e, n * LOOK); });
    for (var k = -1; k < 16; k++) {
      var dx = k < 0 ? 0 : Math.cos(k * Math.PI / 8), dy = k < 0 ? 0 : Math.sin(k * Math.PI / 8), free = 0, clear = 1e9;
      if (k >= 0) while (free < most && !blockedAt(st, e.x + dx * (free + 0.2), e.y + dy * (free + 0.2), TANK_R)) free += 0.2;
      for (var i = 0; i < n; i++) {
        var d = Math.min(sl * (i + 1), free), x = e.x + dx * d, y = e.y + dy * d;
        for (var j = 0; j < near.length; j++) {
          var P = near[j], q = P.path[P.k + i];
          if (!q || (q.nb > P.done && !w.bank) || (P.s.owner === e && !q.nb)) continue;
          clear = Math.min(clear, Math.hypot(q.x - x, q.y - y));
        }
      }
      // (clear enough is clear enough; then: not over a mine, and keeping on
      // much as it was going rather than turning about)
      var score = Math.min(clear, DANGER + 0.5) * 10;
      if (k >= 0 && mineOnPath(st, e, e.x + dx * Math.min(free, most), e.y + dy * Math.min(free, most))) score -= 30;
      if (k >= 0) score += (dx * e.vx + dy * e.vy) / mv * 0.2; else score -= 0.3;
      if (score > bestScore) { bestScore = score; best = { x: dx, y: dy }; }
    }
    return best;
  }
  // The open spot nearby farthest from the mines it minds (out of the
  // blast's reach if it can), that it can drive straight to; `extra`, a mine
  // it means to lay where it stands. Null when there's none.
  function fleeGoal(st, e, extra) {
    var ms = st.mines.filter(function (m) { return minds(e, m); });
    if (extra) ms = ms.concat(extra);
    var best = null, bestScore = -1e9;
    for (var i = 0; i < 28; i++) {
      var a = st.random() * Math.PI * 2, d = 1.5 + st.random() * 4;
      var gx = e.x + Math.cos(a) * d, gy = e.y + Math.sin(a) * d;
      if (gx < 0.6 || gy < 0.6 || gx > COLS - 0.6 || gy > ROWS - 0.6) continue;
      if (blockedAt(st, gx, gy, TANK_R) || !pathClear(st, e.x, e.y, gx, gy) || mineOnPath(st, e, gx, gy)) continue;
      var safe = 1e9;
      ms.forEach(function (m) { safe = Math.min(safe, Math.hypot(m.x - gx, m.y - gy)); });
      var score = Math.min(safe, KEEP_OFF + 0.6) * 3 - d * 0.3 + st.random() * 0.2;
      if (score > bestScore) { bestScore = score; best = { x: gx, y: gy, safe: safe }; }
    }
    return best;
  }
  // somewhere out of the blast's reach to go, were it to lay a mine here
  // (and no other tank beside it, which would set it off at once)
  function canClear(st, e) {
    if ([st.player].concat(st.enemies).some(function (t) { return t !== e && t.alive && Math.hypot(t.x - e.x, t.y - e.y) < TUNE.trigger + 0.5; })) return false;
    var g = fleeGoal(st, e, { x: e.x, y: e.y });
    return !!g && g.safe >= KEEP_OFF;
  }

  window.ToyTanksEngine = {
    COLS: COLS, ROWS: ROWS, TANK_R: TANK_R, SHELL_R: SHELL_R, MINE_R: MINE_R, TUNE: TUNE, KINDS: KINDS, LETTER: LETTER,
    rng: rng, parse: parse, create: create, step: step, fire: fire, layMine: layMine, trace: trace, tile: tile,
    enemyCount: enemyCount, enemiesLeft: enemiesLeft, shellsOf: shellsOf, minesOf: minesOf, losClear: losClear
  };
})();
