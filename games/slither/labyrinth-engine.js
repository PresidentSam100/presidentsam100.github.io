/* =====================================================================
   Slither — Labyrinth rules engine.

   Pure rules: no DOM, no audio, no clock of its own. The page
   (labyrinth.js) feeds it input and elapsed milliseconds, then turns the
   events it leaves in `state.events` into sound and HUD updates. solver.js
   (the level checker, used by verify.js and the editor) drives the same
   code, so levels are checked against the rules the game actually plays.

   Every snake moves on its own timer, so advance() walks time forward
   event by event and resolves all snakes that move at the same instant
   together — head-ons and tail-chasing work like classic Snake.

   Snakes carry a controller: "p1" / "p2" for players (a Cloner can give a
   player several snakes; they all obey that player's input) or null for
   AI. Each player has its own resources (teleports, ghost meter, dash,
   mouse lock) in state.res[ctrl]. The page reports the pointer's cell as
   state.cursor; clicks, Storm aiming and Mouse Eaters use it.

   The glyph table (LEGEND) is the single source for levels, the editor
   palette and share links. Glyphs never change meaning once published;
   `ready: false` marks ones whose mechanic hasn't landed yet (parse
   rejects them, the editor hides them).
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.SlitherEngine = mod;
  else if (typeof self !== "undefined") self.SlitherEngine = mod; // a Web Worker (the editor's checker)
})(this, function () {
  "use strict";

  var T = {
    FLOOR: 0, WALL: 1, EXIT: 2, ICE: 3, DOOR_SHUT: 4, DOOR_OPEN: 5,
    SWITCH: 6, SPIKE_A: 7, SPIKE_B: 8, CUTTER: 9, DARK: 10, PORTAL: 11,
    WARP: 12, CLICK: 13, TELE: 14, TELE_OUT: 15, INFINITY: 16, CLONER: 17,
    OUTLET: 18, DREAM: 19, STORM: 20, STUD: 21, GATE: 22, URN: 23,
  };
  var COLORS = ["amber", "cyan", "magenta"];

  // Enemy kinds: speed (ms per cell), brain, and traits.
  //   phase: passes through walls, bodies and spikes, and never crashes —
  //          but its own body is solid to everyone else.
  //   careful: never moves into danger; waits instead.
  var KINDS = {
    wander: { ms: 240, ai: "wander", eats: true, name: "Wanderer" },
    hunt: { ms: 200, ai: "hunt", eats: true, name: "Hunter" },
    munch: { ms: 175, ai: "munch", eats: true, name: "Muncher" },
    drift: { ms: 230, ai: "drift", eats: true, name: "Drifter" },
    zip: { ms: 105, ai: "wander", turn: 0.5, eats: true, name: "Zipper" },
    loop: { ms: 190, ai: "loop", eats: true, name: "Looper" },
    metal: { ms: 220, ai: "drift", eats: true, spikeProof: true, name: "Metal" },
    copy: { ms: 0, ai: "copy", eats: true, name: "Copycat" },
    gghost: { ms: 260, ai: "straight", phase: true, name: "Green ghost" },
    bghost: { ms: 300, ai: "chase", phase: true, name: "Black ghost" },
    mouse: { ms: 190, ai: "cursor", eats: true, name: "Mouse Eater" },
    rainbow: { ms: 150, ai: "smart", careful: true, eats: true, name: "Rainbow" },
    rival: { ms: 0, ai: "rival", eats: true, len: 3, name: "Rival" },
    worm: { ms: 115, ai: "wander", turn: 0.35, len: 3, name: "Worm" },
    boss: { ms: 280, ai: "boss", phase: true, len: 18, name: "Serpent King" },
  };

  // The glyph table. group/name/desc feed the editor and the legend.
  var LEGEND = {
    "#": { tile: T.WALL, group: "terrain", name: "Wall", desc: "Solid. Crashing into it ends the run.", ready: true },
    ".": { group: "terrain", name: "Floor", desc: "Open ground.", ready: true },
    " ": { group: "terrain", name: "Floor", desc: "Open ground.", ready: true, hidden: true },
    "S": { start: "p1", group: "terrain", name: "Start", desc: "Where you begin, coiled up.", ready: true },
    "s": { start: "p2", group: "terrain", name: "Player 2 start", desc: "Arena: where player 2 begins. In a one-player game a rival takes the spot.", ready: true },
    "E": { tile: T.EXIT, group: "terrain", name: "Exit arch", desc: "Opens once every red apple is gone. A locked arch is a wall.", ready: true },
    "Q": { tile: T.WARP, group: "terrain", name: "Warp exit", desc: "A second arch that skips ahead to the level named in the level's warps list. Opens with the exit.", ready: true },
    "~": { tile: T.ICE, group: "terrain", name: "Ice", desc: "You can't turn while on it.", ready: true },
    ":": { tile: T.DARK, group: "terrain", name: "Darkness", desc: "Snakes are invisible here; apples aren't.", ready: true },
    "^": { tile: T.SPIKE_A, group: "hazard", name: "Spikes (up first)", desc: "Rise and fall on a beat. Raised spikes cut any part of a snake.", ready: true },
    "v": { tile: T.SPIKE_B, group: "hazard", name: "Spikes (down first)", desc: "Like ^ but on the opposite beat.", ready: true },
    "*": { tile: T.STUD, group: "hazard", name: "Spike stud", desc: "Step on it and every spike field flips: raised ones sink, lowered ones rise. In a level with studs the spikes have no beat; only studs move them.", ready: true },
    "x": { tile: T.CUTTER, group: "machine", name: "Cutter", desc: "Trims whoever enters it to three segments, and stops Infinity growth.", ready: true },
    "I": { tile: T.INFINITY, group: "machine", name: "Infinity machine", desc: "Whoever enters it keeps growing every move until they pass a Cutter.", ready: true },
    "Z": { tile: T.CLONER, group: "machine", name: "Cloner", desc: "Whoever enters it gets a twin at the matching outlet (z).", ready: true },
    "z": { tile: T.OUTLET, group: "machine", name: "Cloner outlet", desc: "Where the Cloner's twin appears. Pairs with Z in reading order.", ready: true },
    "%": { tile: T.DREAM, group: "terrain", name: "Dream block", desc: "Shoot straight through as a skeleton: you pass through yourself and bounce off walls.", ready: true },
    "&": { tile: T.STORM, group: "terrain", name: "Storm tile", desc: "Fly through as a thunderbolt, steered toward the cursor (your finger on phones; arrow keys if there is no pointer). Walls still kill.", ready: true },
    "D": { tile: T.DOOR_SHUT, color: 0, group: "doors", name: "Amber door (shut)", desc: "Opens when an amber switch flips.", ready: true },
    "d": { tile: T.DOOR_OPEN, color: 0, group: "doors", name: "Amber door (open)", desc: "Shuts when an amber switch flips.", ready: true },
    "k": { tile: T.SWITCH, color: 0, group: "doors", name: "Amber switch", desc: "Roll over it to flip every amber door.", ready: true },
    "K": { tile: T.CLICK, color: 0, group: "doors", name: "Amber click-switch", desc: "Click or tap it to flip every amber door.", ready: true },
    "C": { tile: T.DOOR_SHUT, color: 1, group: "doors", name: "Cyan door (shut)", desc: "Opens when a cyan switch flips.", ready: true },
    "c": { tile: T.DOOR_OPEN, color: 1, group: "doors", name: "Cyan door (open)", desc: "Shuts when a cyan switch flips.", ready: true },
    "n": { tile: T.SWITCH, color: 1, group: "doors", name: "Cyan switch", desc: "Roll over it to flip every cyan door.", ready: true },
    "N": { tile: T.CLICK, color: 1, group: "doors", name: "Cyan click-switch", desc: "Click or tap it to flip every cyan door.", ready: true },
    "P": { tile: T.DOOR_SHUT, color: 2, group: "doors", name: "Magenta door (shut)", desc: "Opens when a magenta switch flips.", ready: true },
    "p": { tile: T.DOOR_OPEN, color: 2, group: "doors", name: "Magenta door (open)", desc: "Shuts when a magenta switch flips.", ready: true },
    "o": { tile: T.SWITCH, color: 2, group: "doors", name: "Magenta switch", desc: "Roll over it to flip every magenta door.", ready: true },
    "O": { tile: T.CLICK, color: 2, group: "doors", name: "Magenta click-switch", desc: "Click or tap it to flip every magenta door.", ready: true },
    "a": { item: "apple", group: "items", name: "Apple", desc: "Eat every one to open the exit.", ready: true },
    "t": { item: "blink", group: "items", name: "Blink apple", desc: "One teleport: click any open cell.", ready: true },
    "g": { item: "ghost", group: "items", name: "Ghost apple", desc: "Fills the ghost meter: hold to phase through walls.", ready: true },
    "f": { item: "fast", group: "items", name: "Fast apple", desc: "A permanent speed-up.", ready: true },
    "m": { item: "melon", group: "items", name: "Watermelon", desc: "Only enemies can eat it — to you it's a wall.", ready: true },
    "h": { item: "heart", group: "items", name: "Damage fruit", desc: "Boss levels: eat it to wound the boss. Every h also marks a spot where a new one can grow.", ready: true },
    "+": { item: "oneup", group: "items", name: "1-up", desc: "Pack runs (Ziggy rules) only: an extra life. In ordinary play it isn't there.", ready: true },
    "$": { item: "gold", group: "items", name: "Golden apple", desc: "Pack runs only: +5 on the apple counter (every 50 apples is an extra life). The exit doesn't need it.", ready: true },
    "W": { enemy: "wander", group: "enemies", name: "Wanderer", desc: "Roams at random.", ready: true },
    "H": { enemy: "hunt", group: "enemies", name: "Hunter", desc: "Tries to cut you off.", ready: true },
    "M": { enemy: "munch", group: "enemies", name: "Muncher", desc: "Races you for apples (and melons).", ready: true },
    "B": { enemy: "drift", group: "enemies", name: "Drifter", desc: "Goes straight until blocked — steer it with your body.", ready: true },
    "Y": { enemy: "zip", group: "enemies", name: "Zipper", desc: "Fast and erratic.", ready: true },
    "R": { enemy: "loop", group: "enemies", name: "Looper", desc: "Follows walls in endless loops.", ready: true },
    "A": { enemy: "metal", group: "enemies", name: "Metal snake", desc: "Drifts like brown snakes, immune to spikes.", ready: true },
    "J": { enemy: "copy", group: "enemies", name: "Copycat", desc: "Mirrors your every turn.", ready: true },
    "G": { enemy: "gghost", group: "enemies", name: "Green ghost", desc: "Glides straight (starting rightward) through everything and wraps at the edges. You can't pass through it.", ready: true },
    "L": { enemy: "gghost", dir: 2, group: "enemies", name: "Green ghost (vertical)", desc: "A green ghost that starts heading down instead of right.", ready: true },
    "X": { enemy: "bghost", group: "enemies", name: "Black ghost", desc: "Hunts you straight through walls.", ready: true },
    "V": { enemy: "mouse", group: "enemies", name: "Mouse Eater", desc: "Chases your cursor (your last touch on phones). Catch it and your teleport, ghost and click-switches stall for 6 s.", ready: true },
    "U": { enemy: "rainbow", group: "enemies", name: "Rainbow", desc: "The smartest hunter. Never crashes — trap it and it crumbles.", ready: true },
    "r": { enemy: "rival", group: "enemies", name: "Arena rival", desc: "Arena: a rival snake that hunts apples, grows, and tries to outlast you.", ready: true },
    "@": { enemy: "boss", group: "enemies", name: "Serpent King", desc: "Boss: a giant one-eyed serpent that hunts through walls, summons worms and grows spike flowers. Only damage fruit hurts it; the exit opens when it falls.", ready: true },
  };
  // Maze chase glyphs (chases.js). Their group isn't one the editor lists, and
  // parse rejects them anywhere but a maze chase. In a chase maze every "."
  // also carries a bead.
  LEGEND["0"] = { item: "sunstone", group: "chase", name: "Sunstone", desc: "Maze chase: the guardians take fright for a few seconds, and you can bite them.", ready: true };
  LEGEND["u"] = { guard: true, group: "chase", name: "Guardian", desc: "Maze chase: where a temple guardian starts. The first (reading order) starts outside the shrine, the rest inside.", ready: true };
  LEGEND["="] = { tile: T.GATE, group: "chase", name: "Shrine gate", desc: "Maze chase: only guardians pass.", ready: true };
  for (var dg = 1; dg <= 4; dg++) LEGEND[String(dg)] = { portal: dg, group: "terrain", name: "Portal " + dg, desc: "Pairs with the other " + dg + "; you keep your heading.", ready: true };
  for (dg = 5; dg <= 9; dg++) LEGEND[String(dg)] = { tele: dg, group: "terrain", name: "Teleporter " + dg, desc: "One-way: the first " + dg + " (reading order) sends you to the second; list the digit under Reverse teleporters to flip it.", ready: true };

  var CFG = {
    playerMs: 135,        // ms per cell at base speed
    dashFactor: 0.5,      // holding dash halves that
    fastStepMs: 12,       // each fast apple shaves this off the base
    minPlayerMs: 60,
    startLen: 3,
    enemyLen: 4,
    ghostPerApple: 10,    // cells of phasing per ghost apple
    ghostMax: 30,
    spikeMs: 1400,        // each phase (raised / lowered) lasts this long
    spikeWarnMs: 450,     // lowered spikes flash for this long before rising
    cutLen: 3,
    maxStepMs: 100,       // a returning background tab must not fast-forward
    mouseLockMs: 6000,
    bossAttackMs: 5000,   // the boss alternates worms and spike flowers this often
    flowerWarnMs: 1000,   // a flower buds (harmless, flashing) this long before its spikes arm
    flowerMs: 4500,       // then stays armed this long
    heartRespawnMs: 2500,
    stageSpeedup: 2,      // stages: each apple takes this many ms off your step…
    stageMinMs: 75,       // …down to this
    rushFactor: 1 / 3,    // Dream and Storm tiles fling you at triple speed
    maxSnakes: 40,
  };

  // Maze chase tuning. Times in ms; speeds are ms per cell.
  var CHASE = {
    len: 4,                                   // the snake never grows in a chase
    playerMs: 128, playerMinMs: 100, playerStepMs: 3,
    guardMs: 160, guardMinMs: 108, guardStepMs: 7,    // guardians quicken every round…
    frightMs: 240, eyesMs: 70, houseMs: 190,
    fright: 6500, frightMin: 1500, frightStep: 700,   // …and sunstones wear off sooner
    phases: [7000, 20000, 7000, 20000, 5000, 20000, 5000], // scatter, hunt, scatter… then hunt for good
    release: [0, 1500, 5000, 9000],           // when each guardian leaves the shrine, after a (re)start
    bead: 10, sunstone: 50, guard: 200, lives: 3, extraLifeAt: 10000,
    bonusAt: [0.3, 0.7], bonusMs: 9500,       // a golden apple appears at the start at these shares of the beads
    bonus: [100, 300, 500, 700, 1000, 2000, 3000, 5000],
  };

  // Fire eggs tuning (blast arena). Times in ms; speeds are ms per cell.
  var BLAST = {
    len: 3, ms: 170, speedStep: 14, speedMax: 3,
    fuse: 2400, flame: 550, range: 2, rangeMax: 7, eggs: 1, eggsMax: 5,
    urns: 0.62,                               // share of open floor that starts as clay urns…
    hidden: 0.3, kinds: ["fire", "fire", "egg", "egg", "speed"],   // …and how many hide a power-up
    closeAt: 90000, closeEvery: 180,          // then the arena closes in from the edges
  };

  // Directions: 0 up, 1 right, 2 down, 3 left.
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  var EPS = 1e-6;

  // ---- parsing -------------------------------------------------------------
  function parse(level) {
    var grid = level.grid, rows = grid.length, cols = rows ? grid[0].length : 0;
    var errors = [];
    var tiles = new Array(cols * rows), items = {}, partner = {}, portalId = {}, doorColor = {};
    var pairs = {}, teles = {}, enemies = [], starts = { p1: -1, p2: -1 }, exits = 0, apples = 0;
    var warps = [], cloners = [], outlets = [], hearts = [], guards = [], beads = 0;
    var used = {};
    var mode = level.mode || "campaign";
    for (var y = 0; y < rows; y++) {
      if (grid[y].length !== cols) errors.push("row " + y + " is " + grid[y].length + " wide, expected " + cols);
      for (var x = 0; x < cols; x++) {
        var ch = grid[y].charAt(x) || "#", i = y * cols + x;
        tiles[i] = T.FLOOR;
        var L = LEGEND[ch];
        if (!L) { errors.push("unknown tile '" + ch + "' at " + x + "," + y); continue; }
        if (!L.ready) { errors.push("'" + ch + "' (" + L.name + ") isn't available yet, at " + x + "," + y); continue; }
        used[ch] = true;
        if (L.portal) { tiles[i] = T.PORTAL; (pairs[ch] = pairs[ch] || []).push(i); continue; }
        if (L.tele) { (teles[ch] = teles[ch] || []).push(i); continue; }
        if (L.tile != null) tiles[i] = L.tile;
        if (L.color != null) doorColor[i] = L.color;
        if (L.tile === T.EXIT) exits++;
        if (L.tile === T.WARP) { exits++; warps.push(i); }
        if (L.tile === T.CLONER) cloners.push(i);
        if (L.tile === T.OUTLET) outlets.push(i);
        if (L.item) {
          items[i] = L.item;
          if (L.item === "apple") apples++;
          if (L.item === "heart") hearts.push(i);
          if (L.item === "sunstone") beads++;
        }
        if (mode === "chase" && ch === ".") { items[i] = "bead"; beads++; }
        if (L.guard) guards.push(i);
        if (L.enemy) enemies.push({ kind: L.enemy, at: i, dir: L.dir });
        if (L.start) {
          if (starts[L.start] >= 0) errors.push("more than one " + L.name.toLowerCase());
          starts[L.start] = i;
        }
      }
    }
    // An item in a dark area sits in the dark too: items are always on floor,
    // so without this every apple would punch a lit hole in the darkness —
    // and show your snake as it passes. Dark behaves exactly like floor.
    // The same goes for storms: an apple in a storm field is storm too, so
    // eating it doesn't drop you out of the storm for a step.
    Object.keys(items).forEach(function (k) {
      var i = Number(k), x = i % cols, y = Math.floor(i / cols);
      if (tiles[i] !== T.FLOOR) return;
      [T.DARK, T.STORM].forEach(function (kind) {
        var n = 0;
        if (x > 0 && tiles[i - 1] === kind) n++;
        if (x < cols - 1 && tiles[i + 1] === kind) n++;
        if (y > 0 && tiles[i - cols] === kind) n++;
        if (y < rows - 1 && tiles[i + cols] === kind) n++;
        if (n >= 2 && tiles[i] === T.FLOOR) tiles[i] = kind;
      });
    });
    Object.keys(pairs).forEach(function (k) {
      var p = pairs[k];
      if (p.length !== 2) { errors.push("portal " + k + " appears " + p.length + " times, expected 2"); return; }
      partner[p[0]] = p[1]; partner[p[1]] = p[0];
      portalId[p[0]] = portalId[p[1]] = Number(k) - 1;
    });
    // One-way teleporters: the first of each digit (reading order) sends you
    // to the second, which is just a landing pad — unless the level lists
    // that digit in teleReverse, which swaps them (so pads can send you up).
    var teleTo = {}, teleId = {};
    Object.keys(teles).forEach(function (k) {
      var p = teles[k];
      if (p.length !== 2) { errors.push("teleporter " + k + " appears " + p.length + " times, expected 2"); return; }
      if (String(level.teleReverse || "").indexOf(k) !== -1) p = [p[1], p[0]];
      tiles[p[0]] = T.TELE; tiles[p[1]] = T.TELE_OUT;
      teleTo[p[0]] = p[1];
      teleId[p[0]] = teleId[p[1]] = Number(k) - 5;
    });
    if (cloners.length !== outlets.length) errors.push(cloners.length + " cloner(s) but " + outlets.length + " outlet(s)");
    var outletOf = {};
    cloners.forEach(function (c, n) { if (outlets[n] != null) outletOf[c] = outlets[n]; });
    if (starts.p1 < 0) errors.push("no start (S)");
    if (mode !== "chase" && (guards.length || used["0"] || used["="])) errors.push("guardians (u), sunstones (0) and shrine gates (=) only work in a maze chase");
    if (mode === "chase") {
      if (exits) errors.push("a maze chase has no exit: eating every bead clears it");
      if (!guards.length) errors.push("a maze chase needs a guardian (u)");
      if (guards.length > 4) errors.push("at most four guardians (u)");
      if (enemies.length) errors.push("only guardians (u) hunt in a maze chase");
      if (guards.length > 1 && !used["="]) errors.push("guardians in the shrine need a gate (=) to leave by");
      if (!beads) errors.push("a maze chase needs beads (.) to eat");
    }
    if (!exits && mode === "campaign") errors.push("no exit (E)");
    if (mode === "stage" && exits) errors.push("a stage has no exit: its apples never run out");
    var versus = mode === "arena" || mode === "blast";
    if (versus && exits) errors.push("an arena has no exit: the last snake standing wins");
    if (versus && starts.p2 < 0 && !enemies.some(function (e) { return e.kind === "rival"; })) errors.push("an arena needs someone to beat: a player 2 start (s) or a rival (r)");
    if (!versus && starts.p2 >= 0) errors.push("a player 2 start (s) only works in an arena");
    if (!versus && enemies.some(function (e) { return e.kind === "rival"; })) errors.push("rivals (r) only work in an arena");
    if (mode === "blast" && enemies.some(function (e) { return e.kind !== "rival"; })) errors.push("only rivals (r) play in a fire-egg arena");
    if (mode === "blast" && enemies.length > 3) errors.push("at most four snakes in a fire-egg arena");
    if (warps.length && (!level.warps || level.warps.length < warps.length)) errors.push("warp exit(s) need a target in the level's warps list");
    var bosses = enemies.filter(function (e) { return e.kind === "boss"; }).length;
    if (bosses > 1) errors.push("only one boss (@) per level");
    if (bosses && !hearts.length) errors.push("a boss needs at least one damage fruit (h) to be beaten");
    return {
      cols: cols, rows: rows, tiles: tiles, items: items, partner: partner, portalId: portalId,
      teleTo: teleTo, teleId: teleId, doorColor: doorColor, outletOf: outletOf,
      warps: warps, warpTarget: (level.warps || []).slice(), hearts: hearts,
      enemies: enemies, start: starts.p1, start2: starts.p2, apples: apples, errors: errors, used: used, mode: mode,
      guards: guards, beads: beads,
      hasSpikes: tiles.some(function (t) { return t === T.SPIKE_A || t === T.SPIKE_B; }),
      hasStuds: tiles.indexOf(T.STUD) !== -1,
    };
  }

  // ---- state -----------------------------------------------------------------
  function newRes() {
    return { teleports: 0, ghost: 0, ghostHeld: false, ghostActive: false, dashHeld: false, pendingBlink: -1, mouseLock: 0 };
  }

  function makeSnake(st, kind, at, len, ms, ctrl) {
    var body = [];
    for (var i = 0; i < len; i++) body.push(at); // coiled on one cell; uncoils as it moves
    return {
      id: st.nextId++, kind: kind, ctrl: ctrl || null, body: body, dir: -1, queue: [], alive: true,
      baseMs: ms, timer: ms, grow: 0, diedAt: 0, infinite: false, stuck: 0,
    };
  }

  function create(level, opts) {
    opts = opts || {};
    var lv = parse(level);
    if (lv.errors.length) throw new Error((level.name || "level") + ": " + lv.errors.join("; "));
    var speed = level.speed || CFG.playerMs;
    var enemyMs = level.enemyMs || {};
    var st = {
      lv: lv, cols: lv.cols, rows: lv.rows, tiles: lv.tiles, level: level,
      items: Object.assign({}, lv.items),
      applesLeft: lv.apples,
      status: "ready",          // ready -> play -> won | dead
      cause: "",
      flip: [false, false, false], // per door colour: flipped by a switch
      spikePhase: true,         // true: ^ raised, v lowered
      spikeMs: level.spikeMs || CFG.spikeMs,
      spikeTimer: level.spikeMs || CFG.spikeMs,
      timeLimit: (level.time || 0) * 1000,
      timeLeft: level.time ? level.time * 1000 : Infinity,
      elapsed: 0,
      res: { p1: newRes(), p2: newRes() },
      cursor: -1,
      events: [],
      snakes: [],
      nextId: 1,
      warp: null,
      enemySwitches: !!level.enemySwitches,
      boss: null, bossHp: 0, bossMax: 0, bossTimer: 0, bossTurn: 0, flowers: [], heartQueue: [], lastHeart: -1,
      stage: lv.mode === "stage", score: 0,
      arena: lv.mode === "arena", winner: null,
    };
    if (lv.mode === "chase") {
      var round = (opts.chase && opts.chase.round) || 1;
      speed = level.speed || Math.max(CHASE.playerMinMs, CHASE.playerMs - CHASE.playerStepMs * (round - 1));
    }
    st.player = makeSnake(st, "player", lv.start, lv.mode === "chase" ? CHASE.len : CFG.startLen, speed, "p1");
    st.snakes.push(st.player);
    if (lv.mode === "chase") chaseSetup(st, opts.chase || {});
    if (lv.mode === "blast") { blastSetup(st, opts); return st; }
    // Arena: player 2 (or, in a one-player game, a rival) starts at s.
    var rivals = 0;
    if (st.arena && lv.start2 >= 0) {
      if (opts.players === 2) st.snakes.push(makeSnake(st, "player", lv.start2, CFG.startLen, speed, "p2"));
      else lv = Object.assign({}, lv, { enemies: [{ kind: "rival", at: lv.start2 }].concat(lv.enemies) });
    }
    lv.enemies.forEach(function (e) {
      var K = KINDS[e.kind];
      var ms = enemyMs[e.kind] || K.ms || speed;
      var len = e.kind === "boss" && level.bossLen ? level.bossLen : K.len || CFG.enemyLen;
      var s = makeSnake(st, e.kind, e.at, len, ms, null);
      s.dir = e.dir != null ? e.dir : firstOpenDir(st, s);
      if (e.kind === "rival") s.rivalNo = rivals++;
      st.snakes.push(s);
      if (e.kind === "boss" && !st.boss) {
        st.boss = s;
        st.bossHp = st.bossMax = level.bossHp || 3;
        st.bossTimer = level.bossAttackMs || CFG.bossAttackMs;
      }
    });
    // Arena snakes all start facing the middle of the board.
    if (st.arena) st.snakes.forEach(function (s) { s.dir = centerDir(st, s.body[0]); });
    // A stage always has an apple on the board.
    if (st.stage && !st.applesLeft) spawnApple(st, st.player.body[0]);
    if (st.boss && lv.hearts.length) {
      // One damage fruit at a time: it grows on one h spot, and each new one elsewhere.
      lv.hearts.forEach(function (i) { delete st.items[i]; });
      st.items[lv.hearts[Math.floor(Math.random() * lv.hearts.length)]] = "heart";
    }
    return st;
  }

  function isPlayer(s) { return s.ctrl === "p1" || s.ctrl === "p2"; }
  function kindOf(s) { return KINDS[s.kind] || {}; }
  function playersOf(st, ctrl) { return st.snakes.filter(function (s) { return s.alive && s.ctrl === ctrl; }); }
  // The snake a player's teleport moves: their first (oldest) living snake.
  function primary(st, ctrl) {
    for (var k = 0; k < st.snakes.length; k++) { var s = st.snakes[k]; if (s.alive && s.ctrl === ctrl) return s; }
    return null;
  }

  // ---- geometry --------------------------------------------------------------
  function neighbor(st, i, d) {
    var x = i % st.cols + DX[d], y = Math.floor(i / st.cols) + DY[d];
    if (x < 0 || y < 0 || x >= st.cols || y >= st.rows) return -1;
    return y * st.cols + x;
  }
  // Where a head heading `d` from `i` ends up: stepping onto a portal lands
  // on its partner; stepping onto a one-way teleporter lands on its pad.
  function moveTarget(st, i, d) {
    var n = neighbor(st, i, d);
    if (n < 0) return n;
    if (st.tiles[n] === T.PORTAL) return st.lv.partner[n];
    if (st.tiles[n] === T.TELE) return st.lv.teleTo[n];
    return n;
  }
  function spikeUp(st, i) {
    var t = st.tiles[i];
    return (t === T.SPIKE_A && st.spikePhase) || (t === T.SPIKE_B && !st.spikePhase);
  }
  function isDoorShut(st, i) {
    var t = st.tiles[i];
    if (t !== T.DOOR_SHUT && t !== T.DOOR_OPEN) return false;
    var flipped = st.flip[st.lv.doorColor[i] || 0];
    return (t === T.DOOR_SHUT) !== flipped;
  }
  function exitOpen(st) { return st.applesLeft === 0 && !(st.boss && st.boss.alive); }
  function flowerAt(st, i, armedOnly) {
    for (var k = 0; k < st.flowers.length; k++) if (st.flowers[k].cell === i && (!armedOnly || st.flowers[k].armed)) return st.flowers[k];
    return null;
  }
  function solidFor(st, s, i, ghost) {
    var t = st.tiles[i];
    if (kindOf(s).phase) return false;
    if (t === T.WALL) return !ghost;
    if (t === T.DOOR_SHUT || t === T.DOOR_OPEN) return !ghost && isDoorShut(st, i);
    // Enemies never take an exit; a locked exit is a wall; a ghost floats
    // through the arch without leaving.
    if (t === T.EXIT || t === T.WARP) return !isPlayer(s) || (!ghost && !exitOpen(st));
    if (t === T.GATE || t === T.URN) return true;   // the shrine gate lets only guardians through, and they aren't snakes
    // Watermelons are for enemies only; to a player they're a wall.
    if (st.items[i] === "melon" && isPlayer(s)) return !ghost;
    return false;
  }
  function interval(st, s) {
    var t = st.tiles[s.body[0]];
    if (t === T.DREAM || t === T.STORM) return s.baseMs * CFG.rushFactor;
    if (isPlayer(s)) return st.res[s.ctrl].dashHeld ? s.baseMs * CFG.dashFactor : s.baseMs;
    if (s.kind === "copy") { var p = primary(st, "p1"); return p ? interval(st, p) : s.baseMs; }
    return s.baseMs;
  }
  // Is cell i covered by a snake? Ghosting players are intangible to others.
  function occupied(st, i, exceptIntangible) {
    for (var k = 0; k < st.snakes.length; k++) {
      var s = st.snakes[k];
      if (!s.alive) continue;
      if (exceptIntangible && isPlayer(s) && st.res[s.ctrl].ghostActive) continue;
      if (s.body.indexOf(i) !== -1) return true;
    }
    return false;
  }

  // ---- player input ----------------------------------------------------------
  // Up to two turns queue per snake, so a quick up-then-left in a corridor
  // lands on consecutive cells instead of the second press being swallowed.
  function turn(st, d, ctrl) {
    ctrl = ctrl || "p1";
    if (st.chase) { chaseTurn(st, d); return; }
    if (st.blast) { blastTurn(st, d, ctrl); return; }
    var mine = playersOf(st, ctrl);
    if (!mine.length) return;
    if (st.status === "ready") {
      st.status = "play";
      // (In an arena the other player keeps facing the middle until they steer.)
      mine.forEach(function (s) { s.dir = d; });
      st.events.push({ type: "start" });
      return;
    }
    if (st.status !== "play") return;
    mine.forEach(function (s) {
      var last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
      if (d === last || d === (last + 2) % 4) return;
      if (s.queue.length >= 2) return;
      s.queue.push(d);
    });
  }

  // A blink lands on any open, empty cell — never on a wall, a shut door, an
  // exit, a portal or teleporter, a raised spike, a melon, or a snake.
  function canBlinkTo(st, i) {
    if (i < 0 || i >= st.tiles.length) return false;
    var t = st.tiles[i];
    if (t === T.WALL || t === T.EXIT || t === T.WARP || t === T.PORTAL || t === T.TELE) return false;
    if (isDoorShut(st, i) || spikeUp(st, i) || st.items[i] === "melon" || flowerAt(st, i, true)) return false;
    return !occupied(st, i, false);
  }
  function blink(st, i, ctrl) {
    var r = st.res[ctrl || "p1"];
    if (st.status !== "play" || r.teleports <= 0 || r.mouseLock > 0 || !canBlinkTo(st, i)) return false;
    r.pendingBlink = i;
    return true;
  }
  // A click (or tap) on a cell: flips a click-switch there, otherwise spends
  // a teleport. Returns "switch", "blink", "denied" or "".
  function click(st, i, ctrl) {
    var r = st.res[ctrl || "p1"];
    if (st.status !== "play" || i < 0 || i >= st.tiles.length) return "";
    if (st.tiles[i] === T.CLICK) {
      if (r.mouseLock > 0) return "denied";
      var c = st.lv.doorColor[i] || 0;
      st.flip[c] = !st.flip[c];
      st.events.push({ type: "switch", at: i, color: c, click: true });
      return "switch";
    }
    if (r.teleports <= 0) return "";
    return blink(st, i, ctrl) ? "blink" : "denied";
  }
  // A chase has no ghosting and no sprint: players hold directions all the
  // time there, and holding one is how sprint is triggered.
  function setGhost(st, held, ctrl) { if (!st.chase && !st.blast) st.res[ctrl || "p1"].ghostHeld = !!held; }
  function setDash(st, held, ctrl) {
    if (st.chase || st.blast) return;
    var r = st.res[ctrl || "p1"];
    held = !!held;
    if (held === r.dashHeld) return;
    r.dashHeld = held;
    // Dash should bite now, not after the current (slow) step finishes.
    if (held) playersOf(st, ctrl || "p1").forEach(function (s) { s.timer = Math.min(s.timer, interval(st, s)); });
  }
  function setCursor(st, i) { st.cursor = i == null ? -1 : i; }

  // Storm tiles: head toward the cursor along whichever axis is farther off,
  // never straight back. With no cursor (keyboard only), you steer normally.
  function aimDir(st, s) {
    var hx = s.body[0] % st.cols, hy = Math.floor(s.body[0] / st.cols);
    var dx = st.cursor % st.cols - hx, dy = Math.floor(st.cursor / st.cols) - hy;
    if (!dx && !dy) return s.dir;
    var h = dx > 0 ? 1 : 3, v = dy > 0 ? 2 : 0;
    var horizontalFirst = Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && (s.dir === 1 || s.dir === 3));
    var picks = (horizontalFirst ? [h, v] : [v, h]).filter(function (d) { return d === h ? dx !== 0 : dy !== 0; });
    var rev = s.dir >= 0 && s.body.length > 1 && s.body[1] !== s.body[0] ? (s.dir + 2) % 4 : -1;
    for (var k = 0; k < picks.length; k++) if (picks[k] !== rev) return picks[k];
    return s.dir;
  }

  // ---- enemy brains ----------------------------------------------------------
  function safeFor(st, s, n) {
    if (n < 0) return false;
    if (kindOf(s).phase) return true;
    if (solidFor(st, s, n, false)) return false;
    if (!kindOf(s).spikeProof && (spikeUp(st, n) || flowerAt(st, n, false))) return false;
    return !occupied(st, n, true);
  }
  // Enemies start facing right if they can, then down, left, up — so level
  // designers can predict where drifters, loopers and ghosts head first.
  function firstOpenDir(st, s) {
    var order = [1, 2, 3, 0];
    for (var k = 0; k < 4; k++) {
      var n = moveTarget(st, s.body[0], order[k]);
      if (n >= 0 && !solidFor(st, s, n, false)) return order[k];
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
        if (solidFor(st, s, n, false) || occupied(st, n, true)) continue;
        queue.push({ c: n, d: queue[q].d });
      }
    }
    return -1;
  }
  function hunterGoals(st) {
    // Aim for the cells just ahead of a player's head, so the player is the
    // one who runs into the hunter's body.
    var p = primary(st, "p1"), goals = {}, any = false;
    if (!p || p.dir < 0) return null;
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
  // Mouse Eaters go for the cursor — unless it's already been eaten.
  function cursorGoal(st) {
    if (st.cursor < 0 || st.res.p1.mouseLock > 0) return null;
    var g = {}; g[st.cursor] = true; return g;
  }
  function foodGoals(st, melons) {
    var goals = null;
    Object.keys(st.items).forEach(function (k) {
      var it = st.items[k];
      if (it === "apple" || (melons && it === "melon")) { goals = goals || {}; goals[k] = true; }
    });
    return goals;
  }
  function think(st, s) {
    var K = kindOf(s), head = s.body[0];
    var rev = s.body.length > 1 && s.body[1] !== head ? (s.dir + 2) % 4 : -1;
    // Green ghosts never turn: they glide straight and wrap at the edges.
    if (K.ai === "straight") return s.dir < 0 ? 1 : s.dir;
    // Black ghosts close in on your head along the longer axis, straight
    // through anything in the way.
    if (K.ai === "chase" || K.ai === "boss") {
      var p0 = primary(st, "p1");
      if (!p0) return s.dir < 0 ? 1 : s.dir;
      var dx = p0.body[0] % st.cols - head % st.cols, dy = Math.floor(p0.body[0] / st.cols) - Math.floor(head / st.cols);
      var h = dx > 0 ? 1 : 3, v = dy > 0 ? 2 : 0, picks = Math.abs(dx) >= Math.abs(dy) ? [h, v] : [v, h];
      if (dx === 0) picks = [v]; else if (dy === 0) picks = [h];
      for (var c2 = 0; c2 < picks.length; c2++) if (picks[c2] !== rev && neighbor(st, head, picks[c2]) >= 0) return picks[c2];
      for (var d2 = 0; d2 < 4; d2++) if (d2 !== rev && neighbor(st, head, d2) >= 0) return d2;
      return s.dir;
    }
    var options = [];
    for (var d = 0; d < 4; d++) {
      if (d === rev) continue;
      var n = moveTarget(st, head, d);
      if (safeFor(st, s, n)) options.push({ d: d, n: n });
    }
    // Copycats copy the player's heading every move, danger or not — which is
    // how you kill them: lead them into a wall.
    if (K.ai === "copy") {
      var p = primary(st, "p1");
      var want = p && p.dir >= 0 ? p.dir : s.dir;
      return want === rev ? s.dir : want;
    }
    // Careful snakes (Rainbow) never move into danger: boxed in, they wait.
    if (!options.length) return K.careful ? -1 : s.dir < 0 ? 0 : s.dir; // boxed in: it crashes
    function ok(d) { for (var o = 0; o < options.length; o++) if (options[o].d === d) return true; return false; }
    // Drifters (and metal snakes) go straight until blocked, then turn right
    // if they can, else left: predictable, so your body can steer them.
    if (K.ai === "drift") {
      if (s.dir >= 0 && ok(s.dir)) return s.dir;
      if (s.dir >= 0 && ok((s.dir + 1) % 4)) return (s.dir + 1) % 4;
      if (s.dir >= 0 && ok((s.dir + 3) % 4)) return (s.dir + 3) % 4;
      return options[0].d;
    }
    // Loopers keep a wall on their right: they circle rooms and pillars forever.
    if (K.ai === "loop") {
      var order = s.dir < 0 ? [1, 2, 3, 0] : [(s.dir + 1) % 4, s.dir, (s.dir + 3) % 4];
      for (var q = 0; q < order.length; q++) if (ok(order[q])) return order[q];
      return options[0].d;
    }
    if (K.ai === "rival") return rivalThink(st, s, options);
    var goals = K.ai === "hunt" || K.ai === "smart" ? hunterGoals(st) : K.ai === "munch" ? foodGoals(st, true)
      : K.ai === "cursor" ? cursorGoal(st) : null;
    if (goals) {
      var step = pathStep(st, s, options, goals);
      if (step >= 0) return step;
    }
    var keep = 1 - (K.turn || 0.25);
    for (var o = 0; o < options.length; o++) {
      if (options[o].d === s.dir && Math.random() < keep) return s.dir;
    }
    return options[Math.floor(Math.random() * options.length)].d;
  }

  // ---- resolution ------------------------------------------------------------
  function kill(st, s, cause) {
    s.alive = false;
    s.diedAt = st.elapsed;
    if (isPlayer(s)) {
      st.events.push({ type: "snakeDied", cause: cause, at: s.body[0], ctrl: s.ctrl });
      if (s === st.player) { var next = primary(st, "p1"); if (next) st.player = next; }
      if (s.ctrl === "p1" && !primary(st, "p1") && st.status === "play" && !st.arena) {
        st.status = "dead";
        st.cause = cause;
        st.events.push({ type: "dead", cause: cause, at: s.body[0] });
      }
    } else {
      st.events.push({ type: "enemyDied", cause: cause, at: s.body[0], kind: s.kind });
    }
  }

  function eats(s, item) {
    if (isPlayer(s)) return item !== "melon";
    if (!kindOf(s).eats) return false;
    return item === "apple" || item === "melon";
  }

  function moveSnakes(st, movers) {
    var plans = movers.map(function (s) {
      var plan = { s: s, from: s.body[0], to: -1, blink: false, portal: false, dead: "", ghost: false };
      var here = st.tiles[s.body[0]];
      // Dream blocks: no steering (like ice) — you shoot straight through.
      var onIce = here === T.ICE || (here === T.DREAM && !kindOf(s).phase);
      if (isPlayer(s)) {
        var r = st.res[s.ctrl];
        plan.ghost = r.ghostHeld && r.ghost > 0 && r.mouseLock <= 0;
        if (r.pendingBlink >= 0 && s === primary(st, s.ctrl)) {
          if (canBlinkTo(st, r.pendingBlink)) { plan.to = r.pendingBlink; plan.blink = true; r.teleports--; }
          else st.events.push({ type: "blinkFail" });
          r.pendingBlink = -1;
        }
        if (!plan.blink && here === T.STORM && st.cursor >= 0 && r.mouseLock <= 0) s.dir = aimDir(st, s);
        else if (!plan.blink && !onIce && s.queue.length) s.dir = s.queue.shift();
      } else if (!onIce || kindOf(s).phase) {
        var nd = think(st, s);
        if (nd < 0) plan.wait = true; else s.dir = nd;
      }
      if (!plan.blink) {
        var n = neighbor(st, s.body[0], s.dir);
        // Inside a dream block, a wall ahead bounces you straight back.
        if (here === T.DREAM && !kindOf(s).phase && (n < 0 || solidFor(st, s, n, plan.ghost))) {
          s.dir = (s.dir + 2) % 4;
          n = neighbor(st, s.body[0], s.dir);
          plan.bounce = true;
        }
        // Green ghosts wrap around the board's edges.
        if (n < 0 && kindOf(s).ai === "straight") {
          var wx = (s.body[0] % st.cols + DX[s.dir] + st.cols) % st.cols, wy = (Math.floor(s.body[0] / st.cols) + DY[s.dir] + st.rows) % st.rows;
          n = wy * st.cols + wx;
        }
        if (n >= 0 && st.tiles[n] === T.PORTAL) { n = st.lv.partner[n]; plan.portal = true; }
        else if (n >= 0 && st.tiles[n] === T.TELE) { n = st.lv.teleTo[n]; plan.portal = true; }
        plan.to = n;
      }
      return plan;
    });
    // A careful snake with nowhere safe to go waits; trapped three moves in a
    // row, it crumbles (so a Rainbow can be beaten by boxing it in).
    plans = plans.filter(function (pl) {
      if (!pl.wait) { pl.s.stuck = 0; return true; }
      pl.s.stuck++;
      pl.s.timer = 0;
      if (pl.s.stuck >= 3) kill(st, pl.s, "trapped");
      return false;
    });
    // A player phases on a move only while holding ghost with meter left.
    plans.forEach(function (pl) { if (isPlayer(pl.s)) st.res[pl.s.ctrl].ghostActive = pl.ghost; });

    // Who covers which cell once every mover's tail has moved on. A mover's
    // tail frees up unless it is growing (or about to eat).
    var occ = {};
    st.snakes.forEach(function (s) {
      if (!s.alive) return;
      var plan = null;
      for (var k = 0; k < plans.length; k++) if (plans[k].s === s) plan = plans[k];
      var keepTail = !plan || s.grow > 0 || s.infinite || (plan.to >= 0 && st.items[plan.to] && eats(s, st.items[plan.to]));
      var n = s.body.length - (keepTail ? 0 : 1);
      var intangible = isPlayer(s) && st.res[s.ctrl].ghostActive;
      for (var j = 0; j < n; j++) {
        var c = s.body[j];
        (occ[c] = occ[c] || []).push({ s: s, intangible: intangible });
      }
    });

    plans.forEach(function (pl) {
      var s = pl.s, n = pl.to, K = kindOf(s);
      if (n < 0) { pl.dead = "edge"; return; }
      if (K.phase) return;
      if (solidFor(st, s, n, pl.ghost)) { pl.dead = (st.tiles[n] === T.EXIT || st.tiles[n] === T.WARP) ? "locked" : "wall"; return; }
      if (spikeUp(st, n) && !K.spikeProof) { pl.dead = "spike"; return; }
      if (flowerAt(st, n, true)) { pl.dead = "spike"; return; }
      if (pl.ghost) return;
      // A skeleton (head in or entering a dream block) passes through itself.
      var skeleton = st.tiles[pl.from] === T.DREAM || st.tiles[n] === T.DREAM;
      var here = occ[n] || [];
      for (var k = 0; k < here.length; k++) {
        if (here[k].intangible) continue;
        if (skeleton && here[k].s === s) continue;
        pl.dead = isPlayer(s) ? (here[k].s === s ? "self" : "enemy") : "body";
        return;
      }
    });
    // Head-ons: two heads into one cell, or two heads swapping places.
    for (var a = 0; a < plans.length; a++) {
      for (var b = a + 1; b < plans.length; b++) {
        var A = plans[a], B = plans[b];
        if (A.ghost || B.ghost || kindOf(A.s).phase || kindOf(B.s).phase) continue;
        if (A.to < 0 || B.to < 0) continue;
        if (A.to === B.to || (A.to === B.from && B.to === A.from)) {
          if (!A.dead) A.dead = isPlayer(A.s) ? "enemy" : "body";
          if (!B.dead) B.dead = isPlayer(B.s) ? "enemy" : "body";
        }
      }
    }

    plans.forEach(function (pl) {
      var s = pl.s, player = isPlayer(s);
      if (pl.dead) { kill(st, s, pl.dead); return; }
      if (!s.alive) return;
      s.body.unshift(pl.to);
      var item = st.items[pl.to];
      if (item && eats(s, item)) {
        delete st.items[pl.to];
        s.grow++;
        if (item === "apple") {
          st.applesLeft--;
          st.events.push({ type: player ? "apple" : "stolen", at: pl.to });
          if (st.stage || st.arena) {
            // Classic rules: another apple grows elsewhere (and on a stage, you speed up).
            if (player && st.stage) { st.score++; s.baseMs = Math.max(CFG.stageMinMs, s.baseMs - CFG.stageSpeedup); }
            spawnApple(st, pl.to);
          } else if (exitOpen(st)) st.events.push({ type: "open" });
        } else if (item === "melon") {
          st.events.push({ type: "melon", at: pl.to });
        } else if (player) {
          var r = st.res[s.ctrl];
          if (item === "blink") r.teleports++;
          else if (item === "ghost") r.ghost = Math.min(CFG.ghostMax, r.ghost + CFG.ghostPerApple);
          else if (item === "fast") s.baseMs = Math.max(CFG.minPlayerMs, s.baseMs - CFG.fastStepMs);
          else if (item === "heart") hitBoss(st, pl.to);
          st.events.push({ type: "power", item: item, at: pl.to, ctrl: s.ctrl });
        }
      }
      if (s.grow > 0) s.grow--; else if (!s.infinite) s.body.pop();
      if (pl.portal) st.events.push({ type: "portal", from: pl.from, to: pl.to, player: player });
      if (pl.bounce && player) st.events.push({ type: "bounce", at: pl.to });
      if (player && st.tiles[pl.to] === T.DREAM && st.tiles[pl.from] !== T.DREAM) st.events.push({ type: "dream", at: pl.to });
      if (player && st.tiles[pl.to] === T.STORM && st.tiles[pl.from] !== T.STORM) st.events.push({ type: "storm", at: pl.to });
      if (pl.blink) st.events.push({ type: "blink", from: pl.from, to: pl.to });
      var t = st.tiles[pl.to];
      if (t === T.SWITCH && (player || st.enemySwitches)) {
        var c = st.lv.doorColor[pl.to] || 0;
        st.flip[c] = !st.flip[c];
        st.events.push({ type: "switch", at: pl.to, color: c });
      } else if (t === T.STUD && (player || st.enemySwitches)) {
        st.events.push({ type: "stud", at: pl.to });
        flipSpikes(st);
      } else if (t === T.CUTTER && (s.body.length > CFG.cutLen || s.infinite)) {
        if (s.body.length > CFG.cutLen) s.body.length = CFG.cutLen;
        s.grow = 0;
        s.infinite = false;
        st.events.push({ type: "cut", at: pl.to, player: player });
      } else if (t === T.CLONER) {
        // A twin appears at the matching outlet, heading the same way. Your
        // twins obey your controls too; enemy twins just multiply.
        var outlet = st.lv.outletOf[pl.to];
        // Only onto a clear outlet — not one a snake is landing on this very move.
        var landing = plans.some(function (o) { return o !== pl && !o.dead && o.to === outlet; });
        if (outlet != null && st.snakes.length < CFG.maxSnakes && !landing && !occupied(st, outlet, false)) {
          var twin = makeSnake(st, s.kind, outlet, CFG.startLen, s.baseMs, s.ctrl);
          twin.dir = s.dir;
          twin.queue = s.queue.slice();
          twin.timer = interval(st, s);
          st.snakes.push(twin);
          st.events.push({ type: "clone", at: outlet, player: player });
        }
      } else if (t === T.INFINITY && !s.infinite) {
        s.infinite = true;
        st.events.push({ type: "infinity", at: pl.to, player: player });
      } else if ((t === T.EXIT || t === T.WARP) && player && !pl.ghost && st.status === "play") {
        st.status = "won";
        if (t === T.WARP) st.warp = st.lv.warpTarget[st.lv.warps.indexOf(pl.to)] || null;
        st.events.push({ type: "win", at: pl.to, warp: st.warp });
      }
      // A Mouse Eater that reaches the cursor eats it: mouse powers stall.
      if (s.kind === "mouse" && pl.to === st.cursor && st.res.p1.mouseLock <= 0) {
        st.res.p1.mouseLock = CFG.mouseLockMs;
        st.events.push({ type: "cursorEaten", at: pl.to });
      }
      if (player && pl.ghost && s === primary(st, s.ctrl)) {
        var rr = st.res[s.ctrl];
        rr.ghost = Math.max(0, rr.ghost - 1);
      }
    });
  }

  // ---- arena -------------------------------------------------------------------
  function centerDir(st, i) {
    var dx = (st.cols - 1) / 2 - i % st.cols, dy = (st.rows - 1) / 2 - Math.floor(i / st.cols);
    return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  }
  function isContender(s) { return isPlayer(s) || s.kind === "rival"; }
  // Open cells reachable from n (bodies count as walls), up to cap.
  function room(st, s, n, cap) {
    var seen = {}, q = [n], count = 0;
    seen[n] = true;
    for (var k = 0; k < q.length && count < cap; k++) {
      count++;
      for (var d = 0; d < 4; d++) {
        var m = moveTarget(st, q[k], d);
        if (m < 0 || seen[m]) continue;
        seen[m] = true;
        if (solidFor(st, s, m, false) || spikeUp(st, m) || occupied(st, m, false)) continue;
        q.push(m);
      }
    }
    return count;
  }
  // Rivals chase apples but won't take a step into a pocket too small for
  // them, and shy away from cells another snake's head could reach first.
  function rivalThink(st, s, options) {
    if (!options.length) return s.dir < 0 ? 0 : s.dir;
    var food = pathStep(st, s, options, foodGoals(st, false) || {});
    var need = Math.min(s.body.length + 3, 40), best = options[0].d, bestScore = -Infinity;
    options.forEach(function (o) {
      // Ice can't be steered: follow the slide to where it ends.
      var end = o.n, crash = false;
      for (var guard = 0; st.tiles[end] === T.ICE && guard < st.cols + st.rows; guard++) {
        var nx = moveTarget(st, end, o.d);
        if (!safeFor(st, s, nx)) { crash = true; break; }
        end = nx;
      }
      var r = crash ? 0 : room(st, s, end, need + 1), risky = false;
      st.snakes.forEach(function (t) {
        if (t === s || !t.alive || !isContender(t)) return;
        for (var d = 0; d < 4; d++) if (moveTarget(st, t.body[0], d) === o.n) risky = true;
      });
      // Spike beds rise on a beat, and a long body can't clear them in time.
      var spiky = st.tiles[o.n] === T.SPIKE_A || st.tiles[o.n] === T.SPIKE_B;
      var score = (crash ? -2000 : r >= need ? 1000 : r * 10) + (o.d === food ? 60 : 0) + (o.d === s.dir ? 4 : 0) -
        (risky ? 300 : 0) - (spiky ? 700 : 0) + Math.random() * 3;
      if (score > bestScore) { bestScore = score; best = o.d; }
    });
    return best;
  }
  // The round ends when at most one snake is left, or no human is.
  function arenaCheck(st) {
    if (!st.arena || st.status !== "play") return;
    var alive = st.snakes.filter(function (s) { return s.alive && isContender(s); });
    var humans = alive.filter(isPlayer);
    if (alive.length > 1 && humans.length > 0) {
      // Two humans left and no rivals: play on. One human and rivals: play on.
      return;
    }
    var w = alive.length === 1 ? alive[0] : null;
    st.status = "over";
    st.winner = w ? (isPlayer(w) ? w.ctrl : "rival") : alive.length ? "rival" : "draw";
    st.events.push({ type: "arenaOver", winner: st.winner, rivalNo: w && !isPlayer(w) ? w.rivalNo : -1, at: w ? w.body[0] : -1 });
  }

  // ---- stages ------------------------------------------------------------------
  // A new apple on a random open cell, a few cells away from `near` if possible.
  function spawnApple(st, near) {
    var nx = near % st.cols, ny = Math.floor(near / st.cols), far = [], any = [];
    for (var i = 0; i < st.tiles.length; i++) {
      var t = st.tiles[i];
      if (t !== T.FLOOR && t !== T.ICE && t !== T.DARK && t !== T.DREAM && t !== T.STORM) continue;
      if (st.items[i] || occupied(st, i, false) || flowerAt(st, i, false)) continue;
      any.push(i);
      if (Math.abs(i % st.cols - nx) + Math.abs(Math.floor(i / st.cols) - ny) >= 4) far.push(i);
    }
    var pool = far.length ? far : any;
    if (!pool.length) return;
    var c = pool[Math.floor(Math.random() * pool.length)];
    st.items[c] = "apple";
    st.applesLeft++;
    st.events.push({ type: "appleSpawn", at: c });
  }

  // ---- the boss --------------------------------------------------------------
  function killOnCell(st, i) {
    st.snakes.forEach(function (s) {
      if (!s.alive || kindOf(s).phase) return;
      if (s.body.indexOf(i) !== -1) kill(st, s, "spike");
    });
  }
  function freeCell(st, i) {
    var t = st.tiles[i];
    return t !== T.WALL && t !== T.EXIT && t !== T.WARP && t !== T.PORTAL && t !== T.TELE && !isDoorShut(st, i) &&
      !st.items[i] && !flowerAt(st, i, false) && !occupied(st, i, false);
  }
  function hitBoss(st, at) {
    if (!st.boss || !st.boss.alive) return;
    st.bossHp--;
    st.lastHeart = at;
    st.events.push({ type: "bossHit", at: at, hp: st.bossHp });
    if (st.bossHp > 0) { st.heartQueue.push(st.elapsed + CFG.heartRespawnMs); return; }
    kill(st, st.boss, "defeated");
    st.snakes.forEach(function (s) { if (s.alive && s.kind === "worm") kill(st, s, "defeated"); });
    st.flowers = [];
    st.events.push({ type: "bossDown", at: st.boss.body[0] });
    if (exitOpen(st)) st.events.push({ type: "open" });
  }
  function spawnWorms(st) {
    var worms = st.snakes.filter(function (s) { return s.alive && s.kind === "worm"; }).length;
    var head = st.boss.body[0], made = 0;
    for (var d = 0; d < 4 && made < 2 && worms + made < 4; d++) {
      var dir = (d + st.bossTurn) % 4, n = neighbor(st, head, dir);
      if (n < 0 || !freeCell(st, n)) continue;
      var w = makeSnake(st, "worm", n, KINDS.worm.len, KINDS.worm.ms, null);
      w.dir = dir;
      st.snakes.push(w);
      made++;
    }
    if (made) st.events.push({ type: "worms", at: head });
  }
  function spawnFlowers(st) {
    var p = primary(st, "p1");
    if (!p) return;
    var hx = p.body[0] % st.cols, hy = Math.floor(p.body[0] / st.cols), cand = [];
    for (var y = Math.max(0, hy - 6); y <= Math.min(st.rows - 1, hy + 6); y++) {
      for (var x = Math.max(0, hx - 6); x <= Math.min(st.cols - 1, hx + 6); x++) {
        var dist = Math.abs(x - hx) + Math.abs(y - hy), i = y * st.cols + x;
        if (dist >= 2 && dist <= 6 && freeCell(st, i)) cand.push(i);
      }
    }
    var n = Math.min(st.level.flowers != null ? st.level.flowers : 5, cand.length);
    for (var k = 0; k < n; k++) {
      var j = k + Math.floor(Math.random() * (cand.length - k));
      var t = cand[j]; cand[j] = cand[k]; cand[k] = t;
      st.flowers.push({ cell: cand[k], armAt: st.elapsed + CFG.flowerWarnMs, until: st.elapsed + CFG.flowerWarnMs + CFG.flowerMs, armed: false });
    }
    if (n) st.events.push({ type: "flowers" });
  }
  function spawnHeart(st) {
    var spots = st.lv.hearts.filter(function (i) { return freeCell(st, i); });
    var fresh = spots.filter(function (i) { return i !== st.lastHeart; });
    if (fresh.length) spots = fresh;
    if (!spots.length) return false;
    var i = spots[Math.floor(Math.random() * spots.length)];
    st.items[i] = "heart";
    st.events.push({ type: "heartSpawn", at: i });
    return true;
  }
  function bossTick(st, dt) {
    if (!st.boss || !st.boss.alive || st.status !== "play") return;
    st.flowers = st.flowers.filter(function (f) {
      if (!f.armed && st.elapsed >= f.armAt) { f.armed = true; killOnCell(st, f.cell); }
      return st.elapsed < f.until;
    });
    st.heartQueue = st.heartQueue.filter(function (at) { return !(st.elapsed >= at && spawnHeart(st)); });
    st.bossTimer -= dt;
    if (st.bossTimer <= 0) {
      st.bossTimer += st.level.bossAttackMs || CFG.bossAttackMs;
      if (st.bossTurn++ % 2 === 0) spawnWorms(st); else spawnFlowers(st);
    }
  }

  function flipSpikes(st) {
    st.spikePhase = !st.spikePhase;
    st.events.push({ type: "spikes" });
    st.snakes.forEach(function (s) {
      if (!s.alive || kindOf(s).phase || kindOf(s).spikeProof) return;
      for (var j = 0; j < s.body.length; j++) {
        if (spikeUp(st, s.body[j])) { kill(st, s, "spike"); return; }
      }
    });
  }

  // ---- maze chase -------------------------------------------------------------
  // mode "chase" (chases.js): eat every bead (".") and sunstone ("0") to clear
  // the maze while temple guardians ("u") hunt you. The snake keeps its
  // length, flips end for end when you press backwards, and walls stop it
  // rather than kill it; a turn you press early waits for the next opening.
  // Only a guardian touching the snake kills — unless a sunstone has
  // frightened them, when your head can bite them instead.
  //
  // Guardians aren't snakes. They live in st.guards, move on their own
  // timers in chaseAdvance, and nothing in the snake machinery (bodies,
  // head-ons, pathing, apples) ever sees them. Each has a way of hunting
  // (by persona, in reading order of the "u"s) and they all take turns
  // between hunting and scattering to their own corners.
  //   states: "house" (waiting in the shrine), "leave" (heading out through
  //   the gate), "roam", "eaten" (a spark flying back to the shrine).
  var CORNERS = [function (st) { return { x: st.cols - 2, y: -3 }; }, function () { return { x: 1, y: -3 }; },
                 function (st) { return { x: st.cols - 1, y: st.rows + 2 }; }, function (st) { return { x: 0, y: st.rows + 2 }; }];

  function chaseSetup(st, run) {
    var C = st.chase = {
      score: run.score || 0, lives: run.lives != null ? run.lives : CHASE.lives, round: run.round || 1, extraGiven: !!run.extraGiven,
      left: st.lv.beads, eaten: 0, want: -1, fright: 0, chain: 0, phase: 0, scatter: true, modeLeft: CHASE.phases[0],
      clock: 0, bonusLeft: 0, exit: -1, den: -1,
    };
    // The shrine door: flood out from the start without crossing a gate; a
    // gate's outside neighbour is the exit, its inside neighbour the den.
    var out = {}, q = [st.lv.start];
    out[st.lv.start] = true;
    for (var k = 0; k < q.length; k++) {
      for (var d = 0; d < 4; d++) {
        var n = moveTarget(st, q[k], d);
        if (n < 0 || out[n] || st.tiles[n] === T.WALL || st.tiles[n] === T.GATE) continue;
        out[n] = true; q.push(n);
      }
    }
    for (var i = 0; i < st.tiles.length && C.exit < 0; i++) {
      if (st.tiles[i] !== T.GATE) continue;
      for (var e = 0; e < 4; e++) {
        var m = neighbor(st, i, e);
        if (m < 0 || st.tiles[m] === T.WALL || st.tiles[m] === T.GATE) continue;
        if (out[m]) C.exit = m; else C.den = m;
      }
    }
    if (C.exit < 0) C.exit = st.lv.guards[0];
    if (C.den < 0) C.den = C.exit;
    st.guards = st.lv.guards.map(function (at, p) {
      return { persona: p, home: at, cell: at, dir: 3, state: "house", fright: false, timer: 0 };
    });
    chasePlace(st);
  }

  // Everyone back to their starting spots (a new maze, or after being caught).
  function chasePlace(st) {
    var C = st.chase, s = st.player;
    s.body = [];
    for (var k = 0; k < CHASE.len; k++) s.body.push(st.lv.start);
    s.dir = -1; s.queue = []; s.alive = true; s.timer = s.baseMs;
    st.guards.forEach(function (g) {
      g.cell = g.home; g.dir = 3; g.fright = false;
      g.state = g.persona === 0 && g.home !== C.den ? "roam" : "house";
      g.timer = guardMs(st, g);
    });
    C.want = -1; C.fright = 0; C.chain = 0; C.phase = 0; C.scatter = true; C.modeLeft = CHASE.phases[0]; C.clock = 0;
    if (C.bonusLeft > 0) { C.bonusLeft = 0; if (st.items[st.lv.start] === "gold") delete st.items[st.lv.start]; }
  }
  // After a catch with lives to spare: back to the start, beads as they were.
  function chaseRespawn(st) {
    if (!st.chase || st.status !== "caught") return;
    chasePlace(st);
    st.status = "ready";
  }

  function chaseTurn(st, d) {
    var C = st.chase;
    if (st.status === "ready") {
      st.status = "play";
      st.player.dir = d;
      C.want = d;
      st.events.push({ type: "start" });
      return;
    }
    if (st.status === "play") C.want = d;
  }

  function guardMs(st, g) {
    if (g.state === "eaten") return CHASE.eyesMs;
    if (g.state === "house" || g.state === "leave") return CHASE.houseMs;
    if (g.fright) return CHASE.frightMs;
    return Math.max(CHASE.guardMinMs, CHASE.guardMs - CHASE.guardStepMs * (st.chase.round - 1));
  }
  function frightFor(round) { return Math.max(CHASE.frightMin, CHASE.fright - CHASE.frightStep * (round - 1)); }

  // Can the snake's head go `d` right now? Walls, the gate and its own body
  // (all but the tail, which moves on) stop it.
  function chaseOpen(st, s, d) {
    var n = moveTarget(st, s.body[0], d);
    if (n < 0) return false;
    var t = st.tiles[n];
    if (t === T.WALL || t === T.GATE || t === T.EXIT || t === T.WARP || isDoorShut(st, n)) return false;
    for (var k = 0; k < s.body.length - 1; k++) if (s.body[k] === n) return false;
    return true;
  }
  // Flip end for end: the tail becomes the head, facing on along the body.
  function chaseFlip(st, s, want) {
    s.body.reverse();
    var h = s.body[0], nb = -1, d = -1;
    for (var k = 1; k < s.body.length; k++) if (s.body[k] !== h) { nb = s.body[k]; break; }
    if (nb >= 0) for (var q = 0; q < 4; q++) if (moveTarget(st, nb, q) === h) d = q;
    s.dir = d >= 0 ? d : want;
    st.events.push({ type: "flip", at: h, ctrl: s.ctrl });
  }

  function chaseScore(st, pts) {
    var C = st.chase;
    C.score += pts;
    if (!C.extraGiven && C.score >= CHASE.extraLifeAt) {
      C.extraGiven = true;
      C.lives++;
      st.events.push({ type: "extraLife", lives: C.lives });
    }
  }

  function chasePlayerMove(st) {
    var C = st.chase, s = st.player;
    if (C.want >= 0 && s.dir >= 0 && C.want === (s.dir + 2) % 4) chaseFlip(st, s, C.want);
    var d = C.want >= 0 && chaseOpen(st, s, C.want) ? C.want : s.dir >= 0 && chaseOpen(st, s, s.dir) ? s.dir : -1;
    if (d < 0) return;   // blocked: wait here until a way opens
    var from = s.body[0], n = moveTarget(st, from, d), step = neighbor(st, from, d);
    s.dir = d;
    s.body.unshift(n);
    s.body.pop();
    if (step >= 0 && st.tiles[step] === T.PORTAL) st.events.push({ type: "portal", from: from, to: n, player: true });
    var it = st.items[n];
    if (it === "bead" || it === "sunstone") {
      delete st.items[n];
      C.left--; C.eaten++;
      chaseScore(st, it === "bead" ? CHASE.bead : CHASE.sunstone);
      st.events.push({ type: it, at: n });
      if (it === "sunstone") chaseFright(st);
      var due = CHASE.bonusAt.some(function (f) { return C.eaten === Math.round(st.lv.beads * f); });
      if (due && C.left && !st.items[st.lv.start]) {
        st.items[st.lv.start] = "gold";
        C.bonusLeft = CHASE.bonusMs;
        st.events.push({ type: "bonusSpawn", at: st.lv.start });
      }
      if (!C.left) {
        st.status = "won";
        st.events.push({ type: "chaseClear", at: n, score: C.score });
      }
    } else if (it === "gold") {
      delete st.items[n];
      C.bonusLeft = 0;
      var pts = CHASE.bonus[Math.min(C.round, CHASE.bonus.length) - 1];
      chaseScore(st, pts);
      st.events.push({ type: "bonus", at: n, points: pts });
    }
  }

  function chaseFright(st) {
    var C = st.chase;
    C.fright = frightFor(C.round);
    C.chain = 0;
    st.guards.forEach(function (g) {
      if (g.state === "eaten") return;
      g.fright = true;
      if (g.state === "roam") g.dir = (g.dir + 2) % 4;
    });
  }
  function chaseUnfright(st) {
    st.chase.fright = 0;
    st.guards.forEach(function (g) { g.fright = false; });
  }
  // Hunt and scatter take turns; every switch turns the roaming guardians round.
  function chaseNextPhase(st) {
    var C = st.chase;
    C.phase++;
    C.scatter = C.phase % 2 === 0;
    C.modeLeft = C.phase < CHASE.phases.length ? CHASE.phases[C.phase] : Infinity;
    st.guards.forEach(function (g) { if (g.state === "roam") g.dir = (g.dir + 2) % 4; });
  }

  function guardPassable(st, n, gate) {
    if (n < 0) return false;
    var t = st.tiles[n];
    if (t === T.WALL || t === T.EXIT || t === T.WARP || isDoorShut(st, n)) return false;
    return t !== T.GATE || gate;
  }
  // First step of a shortest way from `from` to `to` (gates allowed), or -1.
  function guardPath(st, from, to) {
    if (from === to) return -1;
    var seen = {}, q = [];
    seen[from] = true;
    for (var d = 0; d < 4; d++) {
      var n = moveTarget(st, from, d);
      if (!guardPassable(st, n, true) || seen[n]) continue;
      if (n === to) return d;
      seen[n] = true; q.push({ c: n, d: d });
    }
    for (var k = 0; k < q.length; k++) {
      for (var e = 0; e < 4; e++) {
        var m = moveTarget(st, q[k].c, e);
        if (!guardPassable(st, m, true) || seen[m]) continue;
        if (m === to) return q[k].d;
        seen[m] = true; q.push({ c: m, d: q[k].d });
      }
    }
    return -1;
  }
  // Where a roaming guardian wants to be.
  function guardTarget(st, g) {
    var C = st.chase, p = st.player, h = p.body[0];
    var hx = h % st.cols, hy = Math.floor(h / st.cols), pd = p.dir >= 0 ? p.dir : 3;
    if (C.scatter) return CORNERS[g.persona](st);
    if (g.persona === 1) return { x: hx + 4 * DX[pd], y: hy + 4 * DY[pd] };          // cuts in ahead of you
    if (g.persona === 2) {                                                        // pincers you with the first
      var lead = st.guards[0], ax = hx + 2 * DX[pd], ay = hy + 2 * DY[pd];
      return { x: 2 * ax - lead.cell % st.cols, y: 2 * ay - Math.floor(lead.cell / st.cols) };
    }
    if (g.persona === 3) {                                                        // bold from afar, shy up close
      var dx = g.cell % st.cols - hx, dy = Math.floor(g.cell / st.cols) - hy;
      if (dx * dx + dy * dy <= 64) return CORNERS[3](st);
    }
    return { x: hx, y: hy };                                                      // straight for you
  }
  // Roaming: never straight back unless it's the only way; at a fork take the
  // step nearest the target (ties: up, left, down, right). Frightened, pick at random.
  function guardRoamStep(st, g) {
    var rev = (g.dir + 2) % 4, opts = [];
    [0, 3, 2, 1].forEach(function (d) {
      if (d === rev) return;
      var n = moveTarget(st, g.cell, d);
      if (guardPassable(st, n, false)) opts.push({ d: d, n: n });
    });
    if (!opts.length) return guardPassable(st, moveTarget(st, g.cell, rev), false) ? rev : -1;
    if (g.fright) return opts[Math.floor(Math.random() * opts.length)].d;
    var t = guardTarget(st, g), best = opts[0].d, bd = Infinity;
    opts.forEach(function (o) {
      var x = o.n % st.cols - t.x, y = Math.floor(o.n / st.cols) - t.y, dd = x * x + y * y;
      if (dd < bd) { bd = dd; best = o.d; }
    });
    return best;
  }
  function guardMove(st, g) {
    var C = st.chase, d;
    if (g.state === "house") {
      if (C.clock < CHASE.release[g.persona]) return;
      g.state = "leave";
    }
    if (g.state === "leave" || g.state === "eaten") {
      var goal = g.state === "leave" ? C.exit : C.den;
      if (g.cell === goal) {
        // out of the shrine: start roaming (westward first); eyes home: head straight back out
        if (g.state === "leave") { g.state = "roam"; g.dir = 3; } else g.state = "leave";
        return;
      }
      d = guardPath(st, g.cell, goal);
    } else d = guardRoamStep(st, g);
    if (d < 0) return;
    g.dir = d;
    g.cell = moveTarget(st, g.cell, d);
  }

  // Any guardian on the snake? Checked after every single move, so a head
  // and a guardian meeting in one instant, or one entering a cell a tail has
  // just left, resolve in the order the moves actually happened.
  function chaseTouch(st) {
    var C = st.chase, p = st.player, head = p.body[0];
    for (var k = 0; k < st.guards.length && st.status === "play"; k++) {
      var g = st.guards[k];
      if (g.state === "house" || g.state === "eaten") continue;
      if (g.fright) {
        if (g.cell !== head) continue;
        C.chain++;
        var pts = CHASE.guard * Math.pow(2, Math.min(C.chain, 4) - 1);
        chaseScore(st, pts);
        g.state = "eaten"; g.fright = false;
        st.events.push({ type: "guardEaten", at: g.cell, persona: g.persona, points: pts });
        continue;
      }
      if (p.body.indexOf(g.cell) === -1) continue;
      C.lives--;
      p.alive = false;
      p.diedAt = st.elapsed;
      st.events.push({ type: "caught", at: head, persona: g.persona, lives: C.lives });
      if (C.lives > 0) st.status = "caught";
      else {
        st.status = "dead"; st.cause = "caught";
        st.events.push({ type: "chaseOver", score: C.score });
      }
    }
  }

  // The chase's own clock: the snake, each guardian, the fright, the hunt /
  // scatter schedule and the bonus apple, event by event.
  function chaseAdvance(st, dt) {
    if (st.status !== "play") return;
    var C = st.chase, p = st.player;
    dt = Math.min(Math.max(dt, 0), CFG.maxStepMs);
    while (dt > EPS && st.status === "play") {
      var next = dt;
      if (p.timer < next) next = p.timer;
      st.guards.forEach(function (g) { if (g.timer < next) next = g.timer; });
      if (C.fright > 0) { if (C.fright < next) next = C.fright; }
      else if (C.modeLeft < next) next = C.modeLeft;
      if (C.bonusLeft > 0 && C.bonusLeft < next) next = C.bonusLeft;
      next = Math.max(next, 0);
      p.timer -= next;
      st.guards.forEach(function (g) { g.timer -= next; });
      // the schedule stands still while the guardians are frightened
      if (C.fright > 0) { C.fright -= next; if (C.fright <= EPS) chaseUnfright(st); }
      else { C.modeLeft -= next; if (C.modeLeft <= EPS) chaseNextPhase(st); }
      if (C.bonusLeft > 0) {
        C.bonusLeft -= next;
        if (C.bonusLeft <= EPS) { C.bonusLeft = 0; if (st.items[st.lv.start] === "gold") { delete st.items[st.lv.start]; st.events.push({ type: "bonusGone" }); } }
      }
      C.clock += next;
      st.elapsed += next;
      dt -= next;
      if (p.timer <= EPS) {
        chasePlayerMove(st);
        p.timer += p.baseMs;
        if (st.status === "play") chaseTouch(st);
        if (st.status !== "play") break;
      }
      for (var k = 0; k < st.guards.length; k++) {
        var g = st.guards[k];
        if (g.timer > EPS) continue;
        guardMove(st, g);
        g.timer += guardMs(st, g);
        chaseTouch(st);
        if (st.status !== "play") break;
      }
    }
  }

  // ---- fire eggs (blast arena) ----------------------------------------------------
  // mode "blast" (blasts.js): a snake lays a fire egg where its head is. After
  // a fuse the egg bursts into a cross of flame that shatters clay urns, sets
  // off any egg it reaches and burns every snake it touches. Some urns hide a
  // power-up. Last snake standing takes the round; after two minutes the
  // arena closes in from the edges. Snakes move as in the maze chase — fixed
  // length, walls stop rather than kill, pressing backwards flips — so only
  // fire (or the closing walls) kills. Eggs block heads; a body slides over.
  // Players and rival snakes all live in st.snakes, but only this section
  // moves them.
  function blastSetup(st, opts) {
    var lv = st.lv, rnd = opts.rng || Math.random, rivals = 0;
    // cpuOnly: every snake is a rival (a match to watch, and how the rivals get tested)
    var B = st.blast = { eggs: [], flames: [], hidden: {}, clock: 0, closing: false, closeTimer: 0, order: null, closed: [], cpuOnly: !!opts.cpuOnly };
    st.snakes = [];
    function add(at, ctrl) {
      var s = makeSnake(st, ctrl ? "player" : "rival", at, BLAST.len, BLAST.ms, ctrl);
      s.want = -1; s.cap = BLAST.eggs; s.range = BLAST.range; s.spd = 0; s.out = 0;
      s.moving = false; s.stepOnce = false; s.lastMove = -Infinity;
      if (!ctrl) s.rivalNo = rivals++;
      st.snakes.push(s);
      return s;
    }
    var starts = [lv.start];
    st.player = add(lv.start, B.cpuOnly ? null : "p1");
    if (lv.start2 >= 0) { add(lv.start2, opts.players === 2 && !B.cpuOnly ? "p2" : null); starts.push(lv.start2); }
    lv.enemies.forEach(function (e) { add(e.at, null); starts.push(e.at); });
    // Clay urns fill the open floor ("."; a space stays bare), except the two
    // cells either way from each start, so everyone can uncoil.
    var grid = st.level.grid, density = st.level.urns != null ? st.level.urns : BLAST.urns;
    for (var i = 0; i < st.tiles.length; i++) {
      var x = i % st.cols, y = Math.floor(i / st.cols);
      if (st.tiles[i] !== T.FLOOR || grid[y].charAt(x) !== ".") continue;
      var nearStart = starts.some(function (s) {
        var sx = s % st.cols, sy = Math.floor(s / st.cols);
        return (sx === x && Math.abs(sy - y) <= 2) || (sy === y && Math.abs(sx - x) <= 2);
      });
      if (nearStart || rnd() >= density) continue;
      st.tiles[i] = T.URN;
      if (rnd() < BLAST.hidden) B.hidden[i] = BLAST.kinds[Math.floor(rnd() * BLAST.kinds.length)];
    }
  }

  // In a blast arena a snake only slithers while a direction is held (a tap
  // still moves it one cell), so it can wait out a burst like anyone else.
  function blastTurn(st, d, ctrl) {
    var s = primary(st, ctrl);
    if (!s) return;
    if (st.status === "ready") { st.status = "play"; st.events.push({ type: "start" }); }
    if (st.status !== "play") return;
    // setting off from a standstill: step now, not at the next tick of its clock
    if (!s.moving && st.elapsed - s.lastMove >= blastMs(s)) s.timer = 0;
    s.want = d;
    s.moving = true;
    s.stepOnce = true;
    if (s.dir < 0) s.dir = d;
  }
  function blastStop(st, ctrl) {
    var s = st.blast && primary(st, ctrl || "p1");
    if (s) s.moving = false;
  }
  function blastMs(s) { return BLAST.ms - BLAST.speedStep * s.spd; }
  function eggAt(st, c) {
    var eggs = st.blast.eggs;
    for (var k = 0; k < eggs.length; k++) if (eggs[k].cell === c) return eggs[k];
    return null;
  }
  // Is c blocked for snake s's head? Walls, urns, eggs and every body — its
  // own tail excepted, since that moves on.
  function blastSolid(st, s, c) {
    var t = st.tiles[c];
    if (t === T.WALL || t === T.URN || t === T.GATE || isDoorShut(st, c) || eggAt(st, c)) return true;
    for (var k = 0; k < st.snakes.length; k++) {
      var o = st.snakes[k];
      if (!o.alive) continue;
      var lim = o === s ? o.body.length - 1 : o.body.length;
      for (var j = 0; j < lim; j++) if (o.body[j] === c) return true;
    }
    return false;
  }
  function blastOpen(st, s, d) {
    var n = moveTarget(st, s.body[0], d);
    return n >= 0 && !blastSolid(st, s, n);
  }
  function blastMove(st, s) {
    if (!s.moving && !s.stepOnce) return;
    s.stepOnce = false;
    if (s.want >= 0 && s.dir >= 0 && s.want === (s.dir + 2) % 4) chaseFlip(st, s, s.want);
    var d = s.want >= 0 && blastOpen(st, s, s.want) ? s.want : s.dir >= 0 && blastOpen(st, s, s.dir) ? s.dir : -1;
    if (d < 0) return;
    var n = moveTarget(st, s.body[0], d);
    s.dir = d;
    s.body.unshift(n);
    s.body.pop();
    s.lastMove = st.elapsed;
    var it = st.items[n];
    if (it === "fire" || it === "egg" || it === "speed") {
      delete st.items[n];
      if (it === "fire") s.range = Math.min(BLAST.rangeMax, s.range + 1);
      else if (it === "egg") s.cap = Math.min(BLAST.eggsMax, s.cap + 1);
      else s.spd = Math.min(BLAST.speedMax, s.spd + 1);
      st.events.push({ type: "powerUp", item: it, at: n, ctrl: s.ctrl, rivalNo: s.rivalNo });
    }
  }
  function layEgg(st, s) {
    var cell = s.body[0];
    if (s.out >= s.cap || eggAt(st, cell)) return false;
    st.blast.eggs.push({ cell: cell, owner: s, fuse: BLAST.fuse, range: s.range });
    s.out++;
    st.events.push({ type: "eggLaid", at: cell, ctrl: s.ctrl });
    return true;
  }
  // A player lays an egg (Space / E, or the 🥚 button).
  function blastLay(st, ctrl) {
    if (!st.blast || st.status !== "play") return false;
    var s = primary(st, ctrl || "p1");
    return !!s && layEgg(st, s);
  }

  // The cells a burst from `cell` reaches: out to `range` each way, stopped
  // by walls; an urn or another egg takes the flame and stops it there.
  function blastLines(st, cell, range, isEgg) {
    var out = [cell];
    for (var d = 0; d < 4; d++) {
      var c = cell;
      for (var k = 1; k <= range; k++) {
        c = neighbor(st, c, d);
        if (c < 0 || st.tiles[c] === T.WALL) break;
        out.push(c);
        if (st.tiles[c] === T.URN || isEgg(c)) break;
      }
    }
    return out;
  }
  function burst(st, egg) {
    var B = st.blast, i = B.eggs.indexOf(egg);
    if (i < 0) return;
    B.eggs.splice(i, 1);
    egg.owner.out = Math.max(0, egg.owner.out - 1);
    var cells = blastLines(st, egg.cell, egg.range, function (c) { return !!eggAt(st, c); }), chained = [];
    cells.forEach(function (c) {
      if (st.tiles[c] === T.URN) {
        // the urn takes this flame, so what it hid survives it
        st.tiles[c] = T.FLOOR;
        if (B.hidden[c]) { st.items[c] = B.hidden[c]; delete B.hidden[c]; }
        st.events.push({ type: "urn", at: c });
      } else if (c !== egg.cell && st.items[c]) {
        delete st.items[c];
        st.events.push({ type: "burnItem", at: c });
      }
      var other = eggAt(st, c);
      if (other && other !== egg) chained.push(other);
      var f = null;
      for (var k = 0; k < B.flames.length; k++) if (B.flames[k].cell === c) f = B.flames[k];
      if (f) { f.ms = BLAST.flame; f.owner = egg.owner; } else B.flames.push({ cell: c, ms: BLAST.flame, owner: egg.owner });
    });
    st.events.push({ type: "burst", at: egg.cell, cells: cells, ctrl: egg.owner.ctrl });
    chained.forEach(function (e) { burst(st, e); });
  }
  // by: whose egg lit the flame (null when the walls closed in)
  function blastKill(st, s, cause, at, by) {
    s.alive = false;
    s.diedAt = st.elapsed;
    st.events.push({ type: "burnt", at: at, cause: cause, ctrl: s.ctrl, rivalNo: s.rivalNo, own: by === s,
                     byCtrl: by ? by.ctrl : null, byRival: by && !by.ctrl ? by.rivalNo : -1 });
  }
  function blastBurn(st) {
    var B = st.blast;
    if (!B.flames.length) return;
    var hot = {};
    B.flames.forEach(function (f) { hot[f.cell] = f; });
    st.snakes.forEach(function (s) {
      if (!s.alive) return;
      for (var k = 0; k < s.body.length; k++) {
        var f = hot[s.body[k]];
        if (f) { blastKill(st, s, "fire", s.body[k], f.owner); return; }
      }
    });
  }
  // The round ends when at most one snake is left, or no human is.
  function blastCheck(st) {
    if (st.status !== "play") return;
    var alive = st.snakes.filter(function (s) { return s.alive; }), humans = alive.filter(isPlayer);
    if (alive.length > 1 && (humans.length || st.blast.cpuOnly)) return;
    var w = alive.length === 1 ? alive[0] : null;
    st.status = "over";
    st.winner = w ? (isPlayer(w) ? w.ctrl : "rival") : alive.length ? "rival" : "draw";
    st.events.push({ type: "blastOver", winner: st.winner, rivalNo: w && !isPlayer(w) ? w.rivalNo : -1, at: w ? w.body[0] : -1 });
  }
  // The closing walls: ring by ring from the edge inward, clockwise.
  function closeOrder(st) {
    var out = [], seen = {};
    for (var k = 0; 2 * k < Math.min(st.cols, st.rows); k++) {
      var x0 = k, y0 = k, x1 = st.cols - 1 - k, y1 = st.rows - 1 - k, ring = [], x, y;
      for (x = x0; x <= x1; x++) ring.push(y0 * st.cols + x);
      for (y = y0 + 1; y <= y1; y++) ring.push(y * st.cols + x1);
      if (y1 > y0) for (x = x1 - 1; x >= x0; x--) ring.push(y1 * st.cols + x);
      if (x1 > x0) for (y = y1 - 1; y > y0; y--) ring.push(y * st.cols + x0);
      ring.forEach(function (c) { if (!seen[c] && st.tiles[c] !== T.WALL) { seen[c] = true; out.push(c); } });
    }
    return out;
  }
  function closeOne(st) {
    var B = st.blast;
    while (B.order.length) {
      var c = B.order.shift();
      if (st.tiles[c] === T.WALL) continue;
      st.tiles[c] = T.WALL;
      B.closed.push(c);
      delete st.items[c];
      delete B.hidden[c];
      var e = eggAt(st, c);
      if (e) { B.eggs.splice(B.eggs.indexOf(e), 1); e.owner.out = Math.max(0, e.owner.out - 1); }
      st.snakes.forEach(function (s) { if (s.alive && s.body.indexOf(c) !== -1) blastKill(st, s, "crushed", c); });
      st.events.push({ type: "closed", at: c });
      return;
    }
  }

  // ---- rival brains -------------------------------------------------------------
  // When fire will reach each cell (ms from now, chain reactions included), and
  // how long the flames already there keep burning. `extra` is an egg the
  // rival is thinking of laying.
  function blastDanger(st, extra) {
    var B = st.blast, n = st.tiles.length;
    var eggs = B.eggs.map(function (e) { return { cell: e.cell, t: e.fuse, range: e.range }; });
    if (extra) eggs.push(extra);
    var cellsOf = {};
    eggs.forEach(function (e) { cellsOf[e.cell] = true; });
    var isEgg = function (c) { return !!cellsOf[c]; };
    var lines = eggs.map(function (e) { return blastLines(st, e.cell, e.range, isEgg); });
    for (var pass = 0, changed = true; changed && pass < 12; pass++) {
      changed = false;
      for (var a = 0; a < eggs.length; a++) {
        for (var b = 0; b < eggs.length; b++) {
          if (a !== b && eggs[b].t > eggs[a].t && lines[a].indexOf(eggs[b].cell) !== -1) { eggs[b].t = eggs[a].t; changed = true; }
        }
      }
    }
    var at = new Array(n), burn = new Array(n), wall = new Array(n);
    for (var i = 0; i < n; i++) { at[i] = Infinity; burn[i] = 0; wall[i] = Infinity; }
    eggs.forEach(function (e, k) { lines[k].forEach(function (c) { if (e.t < at[c]) at[c] = e.t; }); });
    B.flames.forEach(function (f) { if (f.ms > burn[f.cell]) burn[f.cell] = f.ms; });
    // the closing walls: when each of the next cells in line will be taken
    if (B.closing) {
      var ahead = Math.min(B.order.length, 60);
      for (var j = 0; j < ahead; j++) wall[B.order[j]] = B.closeTimer + j * BLAST.closeEvery;
    }
    return { at: at, burn: burn, wall: wall };
  }
  // Would a snake part on cell c between t0 and t1 get burnt (or walled in)?
  function hotDuring(D, c, t0, t1) {
    if (D.burn[c] > 0 && t0 < D.burn[c] + 60) return true;
    if (t1 > D.wall[c] - 300) return true;
    var a = D.at[c];
    return a !== Infinity && t1 > a - 80 && t0 < a + BLAST.flame + 80;
  }
  function doomed(D, c) { return D.at[c] !== Infinity || D.burn[c] > 0 || D.wall[c] !== Infinity; }
  // Where snake s can get to: a breadth-first walk from its head (or from its
  // tail, if it flips), stepping only where no part of it will be burnt as its
  // body follows. Each node knows its first move and whether it's a haven (it
  // and the cells the body will rest on never burn). score(node) picks the goal.
  // avoid: keep out of every blast zone altogether (unless escaping, a snake
  // that wanders back into the fire it just left dithers there until it burns).
  function blastRoute(st, s, D, score, avoid) {
    var ms = blastMs(s), L = s.body.length, head = s.body[0], tail = s.body[L - 1];
    var seen = {}, q = [], best = null, bestV = -Infinity;
    // its own body is in the way of any route (and no route doubles back through it)
    s.body.forEach(function (c) { seen[c] = true; });
    function push(c, from, first, flip) {
      if (c < 0 || seen[c] || blastSolid(st, s, c) || (avoid && doomed(D, c))) return;
      seen[c] = true;
      var steps = from ? from.steps + 1 : 1, t0 = s.timer + (steps - 1) * ms;
      if (hotDuring(D, c, t0, t0 + (L + 1) * ms)) return;
      var node = { c: c, from: from, first: first, flip: flip, steps: steps };
      // The cells the whole body will lie on: the path's last few, plus, on a
      // short route, the ones it hasn't left yet. `soon` is when the first of
      // them burns (or walls in); a haven is where none ever do.
      var soon = Infinity, p = node, k = 0;
      function mark(cell) { soon = Math.min(soon, D.burn[cell] > 0 ? 0 : D.at[cell], D.wall[cell]); }
      for (; k < L && p; k++, p = p.from) mark(p.c);
      var rest = flip ? s.body.slice().reverse() : s.body;
      for (var j = 0; k < L; j++, k++) mark(rest[j]);
      node.soon = soon;
      node.haven = soon === Infinity;
      q.push(node);
    }
    for (var d = 0; d < 4; d++) {
      var n = moveTarget(st, head, d);
      if (n !== s.body[1]) push(n, null, d, false);
    }
    if (s.dir >= 0 && L > 1 && tail !== head) {
      // flipping: the tail becomes the head and sets off any way but back up the body
      for (var e = 0; e < 4; e++) {
        var fn = moveTarget(st, tail, e);
        if (fn !== s.body[L - 2]) push(fn, null, e, true);
      }
    }
    for (var k2 = 0; k2 < q.length; k2++) {
      var node = q[k2], v = score(node);
      if (v > bestV) { bestV = v; best = node; }
      if (node.steps > 24) continue;
      for (var d2 = 0; d2 < 4; d2++) push(moveTarget(st, node.c, d2), node, node.first, node.flip);
    }
    return best;
  }
  function rivalBlast(st, s) {
    var D = blastDanger(st), L = s.body.length, ms = blastMs(s);
    var foes = st.snakes.filter(function (o) { return o.alive && o !== s; });
    var urnsLeft = 0;
    for (var u = 0; u < st.tiles.length; u++) if (st.tiles[u] === T.URN) urnsLeft++;
    function foeDist(c) {
      var x = c % st.cols, y = Math.floor(c / st.cols), m = Infinity;
      foes.forEach(function (o) { var h = o.body[0]; m = Math.min(m, Math.abs(h % st.cols - x) + Math.abs(Math.floor(h / st.cols) - y)); });
      return m;
    }
    // A rival flips and turns in one move (a player presses back, then the turn).
    function steer(node) {
      s.moving = !!node;
      if (!node) return;
      if (node.flip) chaseFlip(st, s, node.first);
      s.want = node.first;
    }
    // Flipping costs a little, so a snake doesn't dither end for end.
    var escape = function (node) {
      if (node.haven) return 10000 - node.steps * 10 - (node.flip ? 25 : 0) + Math.random();
      return Math.min(node.soon, 8000) / 10 - node.steps;   // no haven: put the fire off as long as possible
    };
    var threatened = s.body.some(function (c) { return doomed(D, c); });
    if (threatened) { steer(blastRoute(st, s, D, escape)); return; }
    // Lay an egg when it would crack an urn or catch a rival — and only with
    // a way out before it bursts.
    var head = s.body[0];
    if (s.out < s.cap && !eggAt(st, head)) {
      var hits = blastLines(st, head, s.range, function (c) { return !!eggAt(st, c); });
      var value = 0;
      hits.forEach(function (c) {
        if (st.tiles[c] === T.URN) value += 1;
        foes.forEach(function (o) {
          if (o.body.indexOf(c) !== -1) value += 3;
          else if (o.body[0] !== c) for (var d = 0; d < 4; d++) if (neighbor(st, o.body[0], d) === c) { value += 1; break; }   // a head about to step in
        });
      });
      if (value > 0) {
        var D2 = blastDanger(st, { cell: head, t: BLAST.fuse, range: s.range });
        var out = blastRoute(st, s, D2, function (node) { return node.haven ? 10000 - node.steps * 10 + Math.random() : -Infinity; });
        if (out && out.haven && out.steps * ms < BLAST.fuse - 400) { layEgg(st, s); steer(out); return; }
      }
    }
    // Otherwise go for power-ups, urns to crack and rivals to catch — by safe
    // paths only, never through a blast zone.
    var roam = blastRoute(st, s, D, function (node) {
      if (!node.haven) return -5000 + Math.min(node.soon, 8000) / 10 - node.steps;
      var c = node.c, v = -node.steps * 6 - (node.flip ? 30 : 0) + Math.random() * 4;
      var it = st.items[c];
      if (it === "fire" || it === "egg" || it === "speed") v += 400;
      for (var d = 0; d < 4; d++) { var nb = neighbor(st, c, d); if (nb >= 0 && st.tiles[nb] === T.URN) { v += 50; break; } }
      // hunt: close in on the nearest rival, harder once the urns run out
      var fd = foeDist(c);
      if (fd <= s.range + 1) v += 60; else v -= fd * (urnsLeft > 12 ? 2 : 5);
      return v;
    }, true);
    // Safe where it is but hemmed in by blast zones: wait for them to burn out.
    steer(roam);
  }

  function blastAdvance(st, dt) {
    if (st.status !== "play") return;
    var B = st.blast;
    dt = Math.min(Math.max(dt, 0), CFG.maxStepMs);
    while (dt > EPS && st.status === "play") {
      var next = dt;
      st.snakes.forEach(function (s) { if (s.alive && s.timer < next) next = s.timer; });
      B.eggs.forEach(function (e) { if (e.fuse < next) next = e.fuse; });
      B.flames.forEach(function (f) { if (f.ms < next) next = f.ms; });
      if (!B.closing) { if (BLAST.closeAt - B.clock < next) next = BLAST.closeAt - B.clock; }
      else if (B.closeTimer < next) next = B.closeTimer;
      next = Math.max(next, 0);
      st.snakes.forEach(function (s) { if (s.alive) s.timer -= next; });
      B.eggs.forEach(function (e) { e.fuse -= next; });
      B.flames.forEach(function (f) { f.ms -= next; });
      if (B.closing) B.closeTimer -= next;
      B.clock += next;
      st.elapsed += next;
      dt -= next;
      B.flames = B.flames.filter(function (f) { return f.ms > EPS; });
      if (!B.closing && B.clock >= BLAST.closeAt - EPS) {
        B.closing = true; B.closeTimer = 0; B.order = closeOrder(st);
        st.events.push({ type: "closing" });
      }
      if (B.closing && B.closeTimer <= EPS) { closeOne(st); B.closeTimer += BLAST.closeEvery; }
      for (var guard = 0; guard < 60; guard++) {
        var due = null;
        for (var k = 0; k < B.eggs.length; k++) if (B.eggs[k].fuse <= EPS) { due = B.eggs[k]; break; }
        if (!due) break;
        burst(st, due);
      }
      blastBurn(st);
      blastCheck(st);
      if (st.status !== "play") break;
      for (var m = 0; m < st.snakes.length; m++) {
        var s = st.snakes[m];
        if (!s.alive || s.timer > EPS) continue;
        if (!s.ctrl) rivalBlast(st, s);
        blastMove(st, s);
        s.timer += blastMs(s);
        blastBurn(st);
        blastCheck(st);
        if (st.status !== "play") break;
      }
    }
  }

  // Walk time forward by `dt` ms, stopping at every snake move, spike flip
  // and the time limit, in order.
  function advance(st, dt) {
    if (st.chase) { chaseAdvance(st, dt); return; }
    if (st.blast) { blastAdvance(st, dt); return; }
    if (st.status !== "play") return;
    dt = Math.min(Math.max(dt, 0), CFG.maxStepMs);
    var timed = st.timeLeft !== Infinity;
    ["p1", "p2"].forEach(function (c) { var r = st.res[c]; if (r.mouseLock > 0) r.mouseLock = Math.max(0, r.mouseLock - dt); });
    while (dt > EPS && st.status === "play") {
      var next = dt;
      st.snakes.forEach(function (s) { if (s.alive && s.timer < next) next = s.timer; });
      var beat = st.lv.hasSpikes && !st.lv.hasStuds;   // studs replace the beat
      if (beat && st.spikeTimer < next) next = st.spikeTimer;
      if (timed && st.timeLeft < next) next = st.timeLeft;
      next = Math.max(next, 0);
      st.snakes.forEach(function (s) { if (s.alive) s.timer -= next; });
      st.spikeTimer -= next;
      st.elapsed += next;
      dt -= next;
      if (st.boss) { bossTick(st, next); if (st.status !== "play") break; }
      if (timed) {
        st.timeLeft -= next;
        if (st.timeLeft <= EPS) {
          st.timeLeft = 0;
          playersOf(st, "p1").forEach(function (s) { kill(st, s, "time"); });
          break;
        }
      }
      if (beat && st.spikeTimer <= EPS) {
        st.spikeTimer += st.spikeMs;
        flipSpikes(st);
        arenaCheck(st);
        if (st.status !== "play") break;
      }
      var movers = st.snakes.filter(function (s) { return s.alive && s.timer <= EPS; });
      if (movers.length) {
        moveSnakes(st, movers);
        movers.forEach(function (s) { s.timer += interval(st, s); });
      }
      arenaCheck(st);
    }
  }

  return {
    T: T, CFG: CFG, DX: DX, DY: DY, LEGEND: LEGEND, KINDS: KINDS, COLORS: COLORS, CHASE: CHASE, BLAST: BLAST,
    parse: parse, create: create, advance: advance, chaseRespawn: chaseRespawn, blastLay: blastLay, blastStop: blastStop,
    turn: turn, blink: blink, click: click, canBlinkTo: canBlinkTo, setGhost: setGhost, setDash: setDash, setCursor: setCursor,
    spikeUp: spikeUp, isDoorShut: isDoorShut, exitOpen: exitOpen, neighbor: neighbor, moveTarget: moveTarget, solidFor: solidFor,
    isPlayer: isPlayer, primary: primary, playersOf: playersOf, flowerAt: flowerAt,
  };
});
