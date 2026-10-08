/* =====================================================================
   Slither — Labyrinth mode: level select, HUD, input and drawing.

   The rules live in labyrinth-engine.js and the levels in levels.js.
   game.js owns the page shell (menu, overlays, audio) and hands this
   module a `host` with what it needs; this file only feeds the engine
   input and time, turns its events into sound and effects, and draws.
   ===================================================================== */
window.SlitherLabyrinth = function (host) {
  "use strict";

  var E = window.SlitherEngine, T = E.T, LEVELS = window.SLITHER_LEVELS || [], STAGES = window.SLITHER_STAGES || [];
  var ARENAS = window.SLITHER_ARENAS || [], CHASES = window.SLITHER_CHASES || [], BLASTS = window.SLITHER_BLASTS || [];
  var PROGRESS_KEY = "slither_labyrinth"; // also listed in the hub's reset-scores block
  var CELL = 24;
  var canvas = host.canvas, ctx = host.ctx;

  var el = {
    hud: document.getElementById("lab-hud"),
    level: document.getElementById("lab-level"),
    apples: document.getElementById("lab-apples"),
    time: document.getElementById("lab-time"),
    blink: document.getElementById("lab-blink"),
    ghost: document.getElementById("lab-ghost"),
    ghostFill: document.getElementById("lab-ghostfill"),
    timeBar: document.getElementById("lab-timebar"),
    timeFill: document.getElementById("lab-timefill"),
    hint: document.getElementById("lab-hint"),
    lock: document.getElementById("lab-lock"),
    twins: document.getElementById("lab-twins"),
    boss: document.getElementById("lab-boss"),
    lives: document.getElementById("lab-lives"),
    ghostBtn: document.getElementById("ghost-btn"),
    dashBtn: document.getElementById("dash-btn"),
    holdName: document.querySelector("#lab-btns .dpad-name"),
    eggBtns: Array.prototype.slice.call(document.querySelectorAll(".ebtn")),
  };

  // Temple look: Garden is a mossy courtyard, Ruins sandstone, Citadel
  // obsidian with gold inlay (temple-art.js). Serpents are carved from
  // jade (you), lapis (wanderers), amethyst (hunters) and carnelian (munchers).
  var Art = window.SlitherArt;
  var THEMES = Art.THEMES;
  // Zones are the packs (Ziggy's Easy / Advanced / Expert / Master): the
  // lives mode runs a whole zone on one pool of lives.
  var PACK_OF = { Garden: "Easy", Ruins: "Advanced", Citadel: "Expert", Foundry: "Expert", Astral: "Master" };

  // ---- progress --------------------------------------------------------------
  // { best: { <level id>: <best clear time in ms> } } — keyed by id, not index,
  // so reordering levels.js never scrambles anyone's record.
  function loadProgress() {
    try {
      var p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      if (p && typeof p === "object" && p.best && typeof p.best === "object") return p;
    } catch (e) {}
    return { best: {} };
  }
  function saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) {} }
  var progress = loadProgress();

  function isDone(i) { return progress.best[LEVELS[i].id] != null; }
  function furthestDone() { var m = -1; for (var i = 0; i < LEVELS.length; i++) if (isDone(i)) m = i; return m; }
  // You may leave one level unbeaten and move on — being hard-stuck on a
  // single level was the loudest complaint about Ziggy's Labyrinth.
  function isUnlocked(i) { return i <= furthestDone() + 2 || !!(progress.warped && progress.warped[LEVELS[i].id]); }
  function continueIndex() {
    for (var i = 0; i < LEVELS.length; i++) if (!isDone(i) && isUnlocked(i)) return i;
    return 0;
  }
  function secs(ms) { return (ms / 1000).toFixed(1); }

  // ---- pack runs (Ziggy rules) ----------------------------------------------------
  // Play a whole zone on one pool of lives, as in Ziggy's Labyrinth: 9 to start,
  // one back for each 1-up, and one for every 50 apples on the counter (golden
  // apples add 5; clearing a level adds a time bonus of one apple per 5 s left).
  // Crashing, restarting or quitting mid-level costs a life; at zero the run is
  // over. The run is saved (progress.run) so it survives closing the tab.
  var RUN = { lives: 9, perLife: 50, bonusEvery: 5 };
  var inRun = false;
  function zoneFirst(zone) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].zone === zone) return i; return -1; }
  function zoneLast(zone) { var m = -1; for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].zone === zone) m = i; return m; }
  function zones() { var z = []; LEVELS.forEach(function (lv) { if (z.indexOf(lv.zone) === -1) z.push(lv.zone); }); return z; }
  function startRun(zone) {
    var r = progress.run;
    if (r && window.GameShell) {
      GameShell.confirm({
        title: "Give up your " + r.zone + " run?",
        text: "You're on level " + (r.idx + 1) + " with ×" + r.lives + " lives.",
        ok: "Give it up", cancel: "Keep it"
      }, function (yes) { if (yes) beginRun(zone); });
      return;
    }
    if (r && !confirm("Give up your " + r.zone + " run (level " + (r.idx + 1) + ", ×" + r.lives + " lives)?")) return;
    beginRun(zone);
  }
  function beginRun(zone) {
    progress.run = { zone: zone, idx: zoneFirst(zone), lives: RUN.lives, apples: 0 };
    saveProgress();
    start(progress.run.idx, true);
  }
  function continueRun() { if (progress.run) start(progress.run.idx, true); }
  function addApples(n) {
    var r = progress.run;
    if (!r || !n) return;
    r.apples += n;
    while (r.apples >= RUN.perLife) { r.apples -= RUN.perLife; r.lives++; sfxOneUp(); }
    saveProgress();
  }
  function sfxOneUp() { [660, 880, 1320].forEach(function (f, i) { tone(f, 0.12, "square", 0.07, null, i * 0.08); }); }
  // A life lost to a crash, a restart or leaving mid-level. True if the run is over.
  function loseLife() {
    var r = progress.run;
    if (!r) return false;
    r.lives--;
    if (r.lives <= 0) { progress.run = null; saveProgress(); return true; }
    saveProgress();
    return false;
  }

  // The extra modes sit in collapsible panels above the level grid, so on a
  // phone the campaign levels stay in reach. Open panels stay open.
  var openPanels = {};
  function panel(key, title, forceOpen) {
    var box = document.createElement("details");
    box.className = "lab-runs";
    box.open = !!forceOpen || !!openPanels[key];
    box.addEventListener("toggle", function () { openPanels[key] = box.open; });
    var h = document.createElement("summary");
    h.className = "lab-zone";
    h.textContent = title;
    box.appendChild(h);
    return box;
  }

  function buildRuns(container) {
    var box = panel("runs", "❤ Pack runs · Ziggy rules", progress.run);
    var p = document.createElement("p");
    p.textContent = "Play a whole zone on " + RUN.lives + " lives. 1-ups, every " + RUN.perLife + " apples and leftover time win lives back; crashing, restarting or quitting costs one.";
    box.appendChild(p);
    var row = document.createElement("div");
    row.className = "row";
    if (progress.run) {
      var c = document.createElement("button");
      c.type = "button"; c.className = "btn cont";
      c.textContent = "▶ Continue " + progress.run.zone + " · level " + (progress.run.idx + 1) + " · ❤ ×" + progress.run.lives;
      c.addEventListener("click", continueRun);
      row.appendChild(c);
    }
    zones().forEach(function (zone) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn";
      b.disabled = !isUnlocked(zoneFirst(zone));
      b.textContent = zone;
      var best = progress.runs && progress.runs[zone];
      if (best != null) { var s = document.createElement("small"); s.textContent = "🏆 ×" + best; b.appendChild(s); }
      b.title = b.disabled ? "Reach this zone first" : "Start a " + zone + " run with " + RUN.lives + " lives";
      b.addEventListener("click", function () { startRun(zone); });
      row.appendChild(b);
    });
    box.appendChild(row);
    container.appendChild(box);
  }

  // Stages: Classic rules (endless apples, no exit) on hand-built boards.
  function stageBest(id) { return (progress.stageBest && progress.stageBest[id]) || 0; }
  function buildStages(container) {
    if (!STAGES.length) return;
    var box = panel("stages", "🍎 Stages · Classic rules", false);
    var p = document.createElement("p");
    p.textContent = "Endless apples on hand-built boards: every apple grows another. No exit, no clock; grow as long as you can.";
    box.appendChild(p);
    var row = document.createElement("div");
    row.className = "row";
    STAGES.forEach(function (sg, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn";
      b.textContent = sg.name;
      var best = stageBest(sg.id);
      if (best) { var s = document.createElement("small"); s.textContent = "🍎 " + best; b.appendChild(s); }
      b.title = sg.hint || sg.name;
      b.addEventListener("click", function () { startStage(i); });
      row.appendChild(b);
    });
    box.appendChild(row);
    container.appendChild(box);
  }

  // Arena: last snake standing against rival bots, one or two players here.
  var ARENA_WINS = 3, arenaPlayers = 1, tally = null;
  function matchWon(t) { return !!t && Math.max(t.p1, t.p2, t.rival) >= ARENA_WINS; }
  var RIVAL_PALS = ["garnet", "topaz", "ivory", "carnelian"];
  function buildArenas(container) {
    if (!ARENAS.length) return;
    var box = panel("arena", "🏟 Arena · last snake standing", false);
    var p = document.createElement("p");
    p.textContent = "You (and a friend on this device) against rival snakes. Apples keep growing; the last snake alive takes the round, first to " + ARENA_WINS + " takes the match.";
    box.appendChild(p);
    var who = document.createElement("div");
    who.className = "row";
    [1, 2].forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn" + (arenaPlayers === n ? " sel" : "");
      b.textContent = n === 1 ? "1 player" : "2 players";
      b.title = n === 1 ? "You against three rivals" : "P1 (WASD) and P2 (arrow keys) against two rivals";
      b.addEventListener("click", function () {
        arenaPlayers = n;
        Array.prototype.forEach.call(who.children, function (x) { x.classList.toggle("sel", x === b); });
      });
      who.appendChild(b);
    });
    box.appendChild(who);
    var row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "0.4rem";
    ARENAS.forEach(function (a, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn";
      b.textContent = "🏟 " + a.name;
      b.title = a.hint || a.name;
      b.addEventListener("click", function () { startArena(i, true); });
      row.appendChild(b);
    });
    box.appendChild(row);
    container.appendChild(box);
  }

  // Maze chase: eat every bead while the temple guardians hunt you. A run
  // carries score and lives from maze to maze; the mazes loop, faster each time.
  var chaseRun = null, chaseRunBest = 0;   // (the best as this chase run began)
  function chaseBest() { return progress.chaseBest || 0; }
  function buildChases(container) {
    if (!CHASES.length) return;
    var box = panel("chase", "👻 Maze Chase · outrun the guardians", false);
    var p = document.createElement("p");
    p.textContent = "Eat every bead while four temple guardians hunt you. A sunstone turns them: bite them while they flee. " +
      "Press backwards to flip end for end. " + E.CHASE.lives + " lives; each maze you clear, the next is faster.";
    box.appendChild(p);
    var row = document.createElement("div");
    row.className = "row";
    CHASES.forEach(function (c, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn";
      b.textContent = "👻 " + c.name;
      if (i === 0 && chaseBest()) { var s = document.createElement("small"); s.textContent = "🏆 " + chaseBest(); b.appendChild(s); }
      b.title = i === 0 ? "Start the chase" : "Start the chase in " + c.name;
      b.addEventListener("click", function () { startChase(i, true); });
      row.appendChild(b);
    });
    box.appendChild(row);
    container.appendChild(box);
  }

  // Fire eggs: a blast arena. Lay eggs, crack urns, burn the rivals; first to
  // 3 rounds takes the match, like the Arena.
  var blastPlayers = 1, blastTally = null;
  function buildBlasts(container) {
    if (!BLASTS.length) return;
    var box = panel("blast", "🥚 Fire Eggs · blast arena", false);
    var p = document.createElement("p");
    p.innerHTML = "Lay fire eggs: each bursts into a cross of flame that cracks clay urns and burns any snake it touches. " +
      "Hold a direction to slither, let go to stop; " + keysOr(kbd("Space") + " or " + kbd("E"), "🥚") + " lays an egg. Last snake standing takes the round, first to " + ARENA_WINS + " the match.";
    box.appendChild(p);
    var who = document.createElement("div");
    who.className = "row";
    [1, 2].forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn" + (blastPlayers === n ? " sel" : "");
      b.textContent = n === 1 ? "1 player" : "2 players";
      b.title = n === 1 ? "You against three rivals" : "P1 (WASD, Space) and P2 (arrows, Enter) against two rivals";
      b.addEventListener("click", function () {
        blastPlayers = n;
        Array.prototype.forEach.call(who.children, function (x) { x.classList.toggle("sel", x === b); });
      });
      who.appendChild(b);
    });
    box.appendChild(who);
    var row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "0.4rem";
    BLASTS.forEach(function (a, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn";
      b.textContent = "🥚 " + a.name;
      b.title = a.name;
      b.addEventListener("click", function () { startBlast(i, true); });
      row.appendChild(b);
    });
    box.appendChild(row);
    container.appendChild(box);
  }

  function buildLevelGrid(container) {
    container.innerHTML = "";
    buildRuns(container);
    buildStages(container);
    buildArenas(container);
    buildChases(container);
    buildBlasts(container);
    var zone = null, grid = null;
    LEVELS.forEach(function (lv, i) {
      if (lv.zone !== zone) {
        zone = lv.zone;
        var h = document.createElement("div");
        h.className = "lab-zone";
        h.textContent = zone + (PACK_OF[zone] ? " · " + PACK_OF[zone] : "");
        container.appendChild(h);
        grid = document.createElement("div");
        grid.className = "lab-grid";
        container.appendChild(grid);
      }
      var open = isUnlocked(i), done = isDone(i);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "lab-lv" + (done ? " done" : "") + (i === continueIndex() ? " next" : "");
      b.disabled = !open;
      b.title = open ? lv.name : "Locked";
      var num = document.createElement("b");
      num.textContent = open ? String(i + 1) : "🔒";
      var name = document.createElement("span");
      name.textContent = open ? lv.name : "";
      var best = document.createElement("em");
      best.textContent = done ? "✓ " + secs(progress.best[lv.id]) + "s" : "";
      b.appendChild(num); b.appendChild(name); b.appendChild(best);
      b.addEventListener("click", function () { start(i); });
      grid.appendChild(b);
    });
    // Levels made in the editor (editor.html) and saved to "My levels".
    var mine = myLevels();
    if (mine.length) {
      var h = document.createElement("div");
      h.className = "lab-zone";
      h.textContent = "My levels";
      container.appendChild(h);
      var g = document.createElement("div");
      g.className = "lab-grid";
      mine.forEach(function (lv) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lab-lv";
        b.title = lv.name || "Custom level";
        var num = document.createElement("b"); num.textContent = "✎";
        var name = document.createElement("span"); name.textContent = lv.name || "Custom level";
        b.appendChild(num); b.appendChild(name);
        b.addEventListener("click", function () { startCustom(lv); });
        g.appendChild(b);
      });
      container.appendChild(g);
    }
  }
  function myLevels() {
    try {
      var m = JSON.parse(localStorage.getItem("slither_custom") || "[]");
      return Array.isArray(m) ? m.filter(function (lv) { return lv && Array.isArray(lv.grid) && !E.parse(lv).errors.length; }) : [];
    } catch (e) { return []; }
  }

  // ---- sound -------------------------------------------------------------------
  var tone = host.tone, noise = host.noise;
  var sfx = {
    stolen: function () { tone(330, 0.14, "square", 0.06, 180); },
    open: function () { [784, 988, 1319].forEach(function (f, i) { tone(f, 0.16, "triangle", 0.11, null, i * 0.07); }); },
    power: function (item) {
      if (item === "blink") { tone(700, 0.18, "sine", 0.13, 1600); tone(1600, 0.1, "triangle", 0.06, null, 0.12); }
      else if (item === "ghost") { tone(520, 0.3, "sine", 0.12, 260); tone(780, 0.3, "sine", 0.05, 390); }
      else { tone(660, 0.12, "square", 0.07, 1320); }
    },
    blink: function () { tone(1500, 0.08, "sine", 0.12, 400); tone(400, 0.14, "sine", 0.12, 1700, 0.07); },
    deny: function () { tone(170, 0.12, "square", 0.07); },
    flip: function () { tone(900, 0.04, "square", 0.08); tone(600, 0.06, "square", 0.08, null, 0.05); },
    cut: function () { noise(0.09, 0.25, "highpass", 3000); tone(1250, 0.07, "sawtooth", 0.05, 600); },
    pop: function () { noise(0.16, 0.25, "bandpass", 1600, 300); tone(520, 0.16, "triangle", 0.1, 130); },
    spike: function () { noise(0.2, 0.3, "highpass", 2500, 800); tone(880, 0.2, "sawtooth", 0.08, 220); },
    timeUp: function () { tone(440, 0.22, "square", 0.09, 330); tone(330, 0.35, "square", 0.09, 160, 0.2); },
    tick: function () { tone(1050, 0.05, "square", 0.05); },
    // maze chase
    bead: (function () { var hi = false; return function () { hi = !hi; tone(hi ? 900 : 680, 0.045, "triangle", 0.045); }; })(),
    sunstone: function () { tone(330, 0.3, "sawtooth", 0.06, 880); tone(660, 0.3, "triangle", 0.07, 1320, 0.05); },
    bite: function () { tone(1200, 0.08, "square", 0.06, 300); tone(400, 0.2, "triangle", 0.08, 1600, 0.06); },
    flipEnd: function () { tone(520, 0.05, "sine", 0.05, 780); },   // end for end (switches keep `flip`)
    // fire eggs
    lay: function () { tone(300, 0.08, "sine", 0.09, 180); },
    boom: function () { noise(0.45, 0.32, "lowpass", 900, 120); tone(90, 0.35, "sawtooth", 0.08, 45); },
    crack: function () { noise(0.1, 0.12, "highpass", 1800); },
    wall: function () { tone(70, 0.08, "square", 0.04); },
  };

  // ---- music -------------------------------------------------------------------
  // One tune per zone (music.js); M or the menu button turns it off and on.
  var music = window.SlitherMusic ? window.SlitherMusic(host.audio || function () { return null; }) : null;
  var musicBtn = document.getElementById("music-btn");
  function musicLabel() { if (musicBtn) { musicBtn.textContent = "🎵 Music: " + (music && music.isOn() ? "On" : "Off"); musicBtn.classList.toggle("sel", !!music && music.isOn()); } }
  function toggleMusic() {
    if (!music) return;
    music.setOn(!music.isOn());
    if (music.isOn() && active && st && !paused) music.play(st.level.zone);
    musicLabel();
  }
  if (musicBtn) { if (!music) musicBtn.style.display = "none"; musicBtn.addEventListener("click", toggleMusic); musicLabel(); }

  // ---- state -----------------------------------------------------------------
  var st = null, levelIdx = 0, theme = THEMES.Garden;
  var active = false, paused = false, token = 0, lastTs = 0;
  var effects = [], hover = -1, tap = null, lastTickSec = -1, endTimer = null;
  var held = { ghostKey: false, ghostMouse: false, ghostBtn: false, ghostPad: false, dashKey: false, dashBtn: false, dashPad: false };
  // Sprint the Ziggy way: hold a direction for a moment, or tap it twice.
  var SPRINT = { holdMs: 400, doubleTapMs: 280 };
  var dirHold = { p1: newHold(), p2: newHold() };
  function newHold() { return { d: -1, timer: 0, last: -1, lastAt: 0, sprint: false }; }
  // noHold: a gamepad stick is held all the time, so only a double flick sprints.
  function pressDir(ctrl, d, noHold) {
    if (!active || !st || paused || (st.status !== "play" && st.status !== "ready")) return;
    if (ctrl === "p2" && !twoPlayer()) return;
    var h = dirHold[ctrl], now = performance.now();
    clearTimeout(h.timer);
    h.sprint = h.last === d && now - h.lastAt < SPRINT.doubleTapMs;   // double tap
    h.last = d; h.lastAt = now; h.d = d;
    if (!noHold) h.timer = setTimeout(function () { if (h.d === d) { h.sprint = true; syncHeld(); } }, SPRINT.holdMs);
    if (st.blast) { var hs = heldDirs[ctrl]; if (hs.indexOf(d) === -1) hs.push(d); }
    E.turn(st, d, ctrl);
    syncHeld();
  }
  // In a blast arena a snake only slithers while a direction is held: letting
  // go of one falls back on any other still held, and letting go of all stops it.
  var heldDirs = { p1: [], p2: [] };
  function releaseDir(ctrl, d) {
    if (st && st.blast) {
      var hs = heldDirs[ctrl];
      if (d == null) hs.length = 0; else if (hs.indexOf(d) !== -1) hs.splice(hs.indexOf(d), 1);
      if (hs.length) E.turn(st, hs[hs.length - 1], ctrl); else E.blastStop(st, ctrl);
    }
    var h = dirHold[ctrl];
    if (d != null && h.d !== d) return;
    clearTimeout(h.timer);
    h.d = -1; h.sprint = false;
    syncHeld();
  }
  function vecDir(v) { return v.y < 0 ? 0 : v.x > 0 ? 1 : v.y > 0 ? 2 : 3; }

  function syncHeld() {
    if (!st) return;
    E.setGhost(st, held.ghostKey || held.ghostMouse || held.ghostBtn || held.ghostPad);
    E.setDash(st, held.dashKey || held.dashBtn || held.dashPad || dirHold.p1.sprint);
    E.setDash(st, dirHold.p2.sprint, "p2");
    el.ghostBtn.classList.toggle("held", held.ghostBtn);
    el.dashBtn.classList.toggle("held", held.dashBtn);
  }
  // Called on pause, blur, and leaving the level: a key released while the
  // tab was in the background never sends its keyup, and ghost or dash
  // would otherwise stay stuck on.
  function clearHeld() {
    for (var k in held) held[k] = false;
    ["p1", "p2"].forEach(function (c) {
      clearTimeout(dirHold[c].timer); dirHold[c] = newHold();
      heldDirs[c].length = 0;
      if (st && st.blast) E.blastStop(st, c);
    });
    syncHeld();
  }

  // A level that isn't part of the campaign: from My levels or a share link.
  // It plays exactly the same but doesn't touch campaign progress.
  var custom = null, stageIdx = -1, arenaIdx = -1, chaseIdx = -1, blastIdx = -1;
  function start(i, viaRun) {
    custom = null; stageIdx = -1; arenaIdx = -1; chaseIdx = -1; blastIdx = -1;
    inRun = !!viaRun && !!progress.run;
    levelIdx = Math.max(0, Math.min(LEVELS.length - 1, i));
    launch(LEVELS[levelIdx]);
  }
  function startArena(i, fresh) {
    custom = null; inRun = false; stageIdx = -1; levelIdx = -1; chaseIdx = -1; blastIdx = -1;
    arenaIdx = i;
    if (fresh || !tally) tally = { p1: 0, p2: 0, rival: 0 };
    launch(ARENAS[i]);
  }
  var stageRunBest = 0;   // the stage's best as this go began, for "new best!"
  function startStage(i) {
    custom = null; inRun = false; arenaIdx = -1; chaseIdx = -1; blastIdx = -1;
    stageIdx = i;
    stageRunBest = stageBest(STAGES[i].id);
    levelIdx = -1;
    launch(STAGES[i]);
  }
  function startChase(i, fresh) {
    custom = null; inRun = false; stageIdx = -1; arenaIdx = -1; levelIdx = -1; blastIdx = -1;
    chaseIdx = i;
    if (fresh || !chaseRun) { chaseRun = { score: 0, lives: E.CHASE.lives, round: 1, extraGiven: false, first: i }; chaseRunBest = chaseBest(); }
    launch(CHASES[i]);
  }
  function startBlast(i, fresh) {
    custom = null; inRun = false; stageIdx = -1; arenaIdx = -1; levelIdx = -1; chaseIdx = -1;
    blastIdx = i;
    if (fresh || !blastTally) blastTally = { p1: 0, p2: 0, rival: 0 };
    launch(BLASTS[i]);
  }
  function startCustom(level) {
    custom = level;
    inRun = false; stageIdx = -1; arenaIdx = -1; chaseIdx = -1; blastIdx = -1;
    levelIdx = -1;
    launch(level);
  }
  function launch(level) {
    st = E.create(level, { players: arenaIdx >= 0 ? arenaPlayers : blastIdx >= 0 ? blastPlayers : 1, chase: chaseIdx >= 0 ? chaseRun : null });
    // A chase or a blast arena has no ghosting or sprint, so those touch buttons
    // (and their label) go; a blast arena gets its lay-egg buttons instead.
    el.ghostBtn.style.display = el.dashBtn.style.display = el.holdName.style.display = st.chase || st.blast ? "none" : "";
    el.eggBtns.forEach(function (b) { b.style.display = st.blast ? "" : "none"; });
    // 1-ups and golden apples only exist on pack runs.
    if (!inRun) Object.keys(st.items).forEach(function (k) { if (st.items[k] === "oneup" || st.items[k] === "gold") delete st.items[k]; });
    theme = THEMES[level.zone] || THEMES.Garden;
    clearTimeout(endTimer);
    active = true; paused = false;
    effects = []; tap = null; lastTs = 0; lastTickSec = -1;
    clearHeld();
    host.showBoard(st.cols * CELL, st.rows * CELL, st.cols * 30);
    if (music) music.play(level.zone);
    if (host.showP2Pad) host.showP2Pad(twoPlayer());
    buildLayer();
    el.level.innerHTML = custom ? "<b>✎</b> · " + escapeHtml(level.name || "Custom level") : stageIdx >= 0 ? "<b>Stage</b> · " + level.name
      : arenaIdx >= 0 ? "<b>Arena</b> · " + level.name : chaseIdx >= 0 ? "<b>Chase</b> · " + level.name + " · maze " + st.chase.round
      : blastIdx >= 0 ? "<b>Fire Eggs</b> · " + level.name
      : "<b>" + (levelIdx + 1) + "</b> · " + level.name;
    el.hint.innerHTML = hintHtml(level.hint || "", level.touchHint);
    el.timeBar.style.display = st.timeLimit ? "" : "none";
    updateHud();
    token++;
    var tk = token;
    requestAnimationFrame(function (ts) { frame(ts, tk); });
  }
  function restart() {
    if (custom) { launch(custom); return; }
    if (chaseIdx >= 0) { recordChase(); startChase(chaseRun ? chaseRun.first : chaseIdx, true); return; }
    // (a match that's been won starts over, like its New Match button)
    if (blastIdx >= 0) { startBlast(blastIdx, matchWon(blastTally)); return; }
    if (stageIdx >= 0) { recordStage(); startStage(stageIdx); return; }
    if (arenaIdx >= 0) { startArena(arenaIdx, matchWon(tally)); return; }
    if (!st) return;
    // A crash just took the run's last life: its "Run over" card is on the way.
    if (inRun && !progress.run && st.status === "dead") return;
    // On a run, giving up an attempt in progress costs a life, like crashing.
    if (inRun && st.status === "play") {
      if (loseLife()) { runOver(); return; }
    }
    // A level already cleared on a run can't be replayed for more apples.
    if (inRun && progress.run) { start(progress.run.idx, true); return; }
    start(levelIdx, false);
  }
  function runOver() {
    var lv = LEVELS[levelIdx];
    stopLoop();
    inRun = false;
    paused = false;
    host.setPaused(false);
    host.showResult({
      title: "Run over 💀",
      msg: "Out of lives on level " + (levelIdx + 1) + " · " + lv.name + ". Start the " + lv.zone + " pack again from the level select.",
      primaryLabel: "Level Select",
      primaryFn: host.toMenu,
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function kbd(t) { return '<kbd class="gs-kbd">' + t + "</kbd>"; }   // keycap (style: ../motion-toggle.js)
  // The keys, or on a touch-only device (no keyboard) the touch control that
  // does the same (.gs-keys / .gs-touch: ../motion-toggle.js)
  function keysOr(keys, touch) { return '<span class="gs-keys">' + keys + '</span><span class="gs-touch">' + touch + "</span>"; }
  // "R or Enter to retry"; on touch, the result card's button that does it
  function retryLine(what, button) { return keysOr(kbd("R") + " or " + kbd("Enter") + " to " + what, "tap " + button); }
  // A hint marks its keys as [Shift]: the text is escaped first, then each [key] becomes a keycap.
  // A hint that names keys comes with its touch wording (the level's touchHint).
  function hintHtml(s, touch) {
    var html = escapeHtml(s).replace(/\[([^\[\]]+)\]/g, function (m, t) { return kbd(t); });
    return touch ? keysOr(html, escapeHtml(touch)) : html;
  }
  function stopLoop() {
    active = false;
    token++;
    clearTimeout(endTimer);
    clearHeld();
  }
  function stop() {
    if (music) music.stop();
    // Leaving a run mid-level costs a life (or quitting would be a free retry).
    if (inRun && st && st.status === "play") loseLife();
    if (st && st.stage && st.status === "play") recordStage();   // quitting still keeps your score
    if (st && st.chase) recordChase();
    if (host.showP2Pad) host.showP2Pad(false);
    inRun = false;
    active = false;
    paused = false;
    token++;
    clearTimeout(endTimer);
    clearHeld();
  }

  // (true when it paused or resumed: the keys claim Esc only then)
  function togglePause() {
    if (!active || !st || (st.status !== "play" && st.status !== "ready")) return false;
    paused = !paused;
    clearHeld();
    host.setPaused(paused);
    if (music) { if (paused) music.stop(); else music.play(st.level.zone); }
    return true;
  }
  function autoPause() {
    clearHeld();
    if (active && !paused && st && st.status === "play") togglePause();
  }
  window.addEventListener("blur", function () { if (active) clearHeld(); });

  // ---- input -------------------------------------------------------------------
  var KEY_DIRS = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
  function keydown(e) {
    if (!active || !st) return;
    // Shift turns "g" into "G" and "w" into "W" — compare in lower case.
    var k = (e.key || "").toLowerCase();
    // (R and the toggles act once per press, not on a held key's repeats)
    if (k === "r") { if (!e.repeat) restart(); e.preventDefault(); return; }
    if (k === "m") { if (!e.repeat) toggleMusic(); e.preventDefault(); return; }
    if (st.status === "dead" || st.status === "won" || st.status === "over") {
      // (in a blast arena Space is the egg key, so mashing it mustn't skip the result)
      if ((k === " " || k === "spacebar") && !st.blast) { host.clickResult(); e.preventDefault(); }
      return;
    }
    // Fire eggs: Space or E lays P1's egg, Enter P2's (or P1's alone); P / Esc
    // pause. Paused, the egg keys do nothing (Space mustn't resume what it can't pause).
    if (st.blast && (k === " " || k === "spacebar" || k === "e" || k === "enter")) {
      if (!e.repeat && !paused) E.blastLay(st, k === "enter" && twoPlayer() ? "p2" : "p1");
      e.preventDefault(); return;
    }
    // Esc is claimed only when it pauses or resumes (not while a Maze Chase
    // catch plays out), so otherwise ../motion-toggle.js takes it to the games page
    if (k === " " || k === "spacebar" || k === "p" || k === "escape") { if ((!e.repeat && togglePause()) || k !== "escape") e.preventDefault(); return; }
    if (paused) return;
    if (KEY_DIRS.hasOwnProperty(k)) {
      if (!e.repeat) pressDir(keyCtrl(k), KEY_DIRS[k]);
      e.preventDefault(); return;
    }
    if (k === "shift") { held.dashKey = true; syncHeld(); return; }
    if (k === "1" || k === "2" || k === "3") { if (!e.repeat) clickColor(Number(k) - 1); e.preventDefault(); return; }
    if (k === "g") { held.ghostKey = true; syncHeld(); e.preventDefault(); }
  }
  function keyCtrl(k) { return twoPlayer() && k.indexOf("arrow") === 0 ? "p2" : "p1"; }
  function keyup(e) {
    var k = (e.key || "").toLowerCase();
    if (KEY_DIRS.hasOwnProperty(k)) releaseDir(keyCtrl(k), KEY_DIRS[k]);
    if (k === "shift") { held.dashKey = false; syncHeld(); }
    if (k === "g") { held.ghostKey = false; syncHeld(); }
  }
  // From the shared d-pad and swipe handlers in game.js ({x,y} vectors).
  function steer(v, playerIdx) { pressDir(playerIdx === 1 ? "p2" : "p1", vecDir(v)); }
  function padSteer(v, playerIdx) { pressDir(playerIdx === 1 ? "p2" : "p1", vecDir(v), true); }
  function unsteer(v, playerIdx) { releaseDir(playerIdx === 1 ? "p2" : "p1", v ? vecDir(v) : null); }
  // Gamepad buttons: dash and ghost holds for player 1.
  function padHold(name, on) {
    if (!active || !st) return;
    if (held[name] === on) return;
    held[name] = on;
    syncHeld();
  }
  function twoPlayer() { return !!st && (st.arena || st.blast) && st.snakes.some(function (s) { return s.ctrl === "p2"; }); }
  // Gamepad A in a blast arena: lay an egg for that pad's player. True if handled.
  function padLay(p) {
    if (!active || !st || !st.blast || paused) return false;
    E.blastLay(st, p === 1 && twoPlayer() ? "p2" : "p1");
    return true;
  }

  // Keyboard stand-in for clicking: presses the nearest click-switch of a
  // colour (1 amber, 2 cyan, 3 magenta), so the mouse is never required.
  function clickColor(c) {
    var p = E.primary(st, "p1");
    if (!p || st.status !== "play") return;
    var best = -1, bd = Infinity, hx = p.body[0] % st.cols, hy = Math.floor(p.body[0] / st.cols);
    for (var i = 0; i < st.tiles.length; i++) {
      if (st.tiles[i] !== T.CLICK || (st.lv.doorColor[i] || 0) !== c) continue;
      var d = Math.abs(i % st.cols - hx) + Math.abs(Math.floor(i / st.cols) - hy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && E.click(st, best, "p1") === "denied") sfx.deny();
  }

  function cellAt(e) {
    // (the board's border is outside the grid: measure from its inner edge)
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left - canvas.clientLeft) / canvas.clientWidth * st.cols);
    var y = Math.floor((e.clientY - r.top - canvas.clientTop) / canvas.clientHeight * st.rows);
    if (x < 0 || y < 0 || x >= st.cols || y >= st.rows) return -1;
    return y * st.cols + x;
  }
  function tryBlink(i) {
    if (!st || st.status !== "play" || paused || i < 0) return;
    if (E.click(st, i, "p1") === "denied") sfx.deny();
  }

  canvas.addEventListener("contextmenu", function (e) { if (active) e.preventDefault(); });
  canvas.addEventListener("pointerdown", function (e) {
    if (!active || !st) return;
    if (e.pointerType === "mouse") {
      if (e.button === 2) { held.ghostMouse = true; syncHeld(); e.preventDefault(); }
      else if (e.button === 0) tryBlink(cellAt(e));
      return;
    }
    // Touch: a quick, still tap teleports; anything that moves is a swipe,
    // which game.js already turns into steering. Either way the finger is
    // the cursor (Mouse Eaters chase it, Storm tiles steer by it).
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    E.setCursor(st, cellAt(e));
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!active || !st) return;
    if (e.pointerType === "mouse") {
      hover = cellAt(e);
      E.setCursor(st, hover);
      // A second mouse button pressed while another is down fires no new
      // pointerdown — only `buttons` changes.
      var g = (e.buttons & 2) !== 0;
      if (g !== held.ghostMouse) { held.ghostMouse = g; syncHeld(); }
    } else {
      if (e.buttons || e.pressure) E.setCursor(st, cellAt(e));
      if (tap && (Math.abs(e.clientX - tap.x) > 10 || Math.abs(e.clientY - tap.y) > 10)) tap = null;
    }
  });
  canvas.addEventListener("pointerleave", function (e) { hover = -1; if (st && e.pointerType === "mouse") E.setCursor(st, -1); });
  window.addEventListener("pointerup", function (e) {
    if (!active) return;
    if (e.pointerType === "mouse" && held.ghostMouse && !(e.buttons & 2)) { held.ghostMouse = false; syncHeld(); }
    if (tap && e.pointerId === tap.id) {
      if (performance.now() - tap.t < 350) tryBlink(cellAt(e));
      tap = null;
    }
  });
  window.addEventListener("pointercancel", function () { tap = null; });

  function wireHoldButton(btn, name) {
    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      held[name] = true; syncHeld();
    });
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    function release() { if (held[name]) { held[name] = false; syncHeld(); } }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }
  wireHoldButton(el.ghostBtn, "ghostBtn");
  wireHoldButton(el.dashBtn, "dashBtn");
  el.eggBtns.forEach(function (b) {
    b.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      if (active && st && st.blast && !paused) E.blastLay(st, b.dataset.player === "1" ? "p2" : "p1");
    });
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  });

  // ---- events -> sound / effects / results ---------------------------------------
  function burst(i, color) { effects.push({ i: i, color: color, t0: performance.now() }); }
  function popup(i, text, color) { effects.push({ i: i, text: text, color: color || "#ffe7a3", t0: performance.now(), life: 900 }); }

  function drainEvents() {
    var evs = st.events;
    if (!evs.length) return;
    st.events = [];
    var booms = 0, cracks = 0, walls = 0;
    evs.forEach(function (e) {
      switch (e.type) {
        case "apple": host.SFX.eat(); burst(e.at, "#ff4d6d"); if (inRun) addApples(1); break;
        case "stolen": sfx.stolen(); burst(e.at, "#ff9f1c"); break;
        case "open": sfx.open(); break;
        case "power":
          if (e.item === "oneup") { sfxOneUp(); burst(e.at, "#ff9a3c"); if (inRun && progress.run) { progress.run.lives++; saveProgress(); } break; }
          if (e.item === "gold") { host.SFX.eat(); burst(e.at, "#f2c037"); if (inRun) addApples(5); break; }
          sfx.power(e.item); burst(e.at, e.item === "blink" ? "#b86bff" : e.item === "ghost" ? "#bff3ff" : "#8cff66"); break;
        case "portal": if (e.player) host.SFX.portal(); break;
        case "blink": sfx.blink(); burst(e.from, "#b86bff"); burst(e.to, "#b86bff"); break;
        case "blinkFail": sfx.deny(); break;
        case "switch": sfx.flip(); burst(e.at, "#ffc53d"); break;
        case "cut": sfx.cut(); burst(e.at, "#dfe6f0"); break;
        case "melon": sfx.stolen(); burst(e.at, "#4fd06a"); break;
        case "dream": sfx.power("ghost"); break;
        case "bounce": tone(300, 0.08, "square", 0.06, 600); break;
        case "clone": sfx.power("blink"); burst(e.at, "#9ff0c4"); break;
        case "appleSpawn": burst(e.at, "#ffd7df"); break;
        case "stud": tone(520, 0.07, "square", 0.06, 260); tone(260, 0.1, "square", 0.05, 520, 0.06); burst(e.at, "#f1c27d"); break;
        case "bossHit": sfx.pop(); tone(220, 0.35, "sawtooth", 0.1, 90); burst(e.at, "#ffcf4a"); break;
        case "bossDown": host.SFX.win(); noise(0.6, 0.3, "lowpass", 1200, 200); break;
        case "worms": noise(0.3, 0.18, "bandpass", 900, 2400); break;
        case "flowers": tone(1400, 0.08, "square", 0.05, 900); tone(1400, 0.08, "square", 0.05, 900, 0.12); break;
        case "heartSpawn": tone(880, 0.12, "triangle", 0.07, 1320); burst(e.at, "#ffcf4a"); break;
        case "snakeDied": if (st.status === "play") { host.SFX.body(); burst(e.at, "#ff5a4a"); } break;
        case "storm": noise(0.25, 0.22, "bandpass", 3000, 600); tone(900, 0.12, "sawtooth", 0.05, 1800); break;
        case "cursorEaten": sfx.pop(); sfx.deny(); burst(e.at, "#ff70b0"); clearHeld(); break;
        case "infinity": sfx.power("fast"); burst(e.at, "#7dffb0"); break;
        case "enemyDied": sfx.pop(); burst(e.at, Art.rgb(Art.serpentFor(e.kind).body)); break;
        case "dead": onDead(e); break;
        case "arenaOver": onArenaOver(e); break;
        case "win": onWin(); break;
        // maze chase
        case "bead": sfx.bead(); break;
        case "sunstone": sfx.sunstone(); burst(e.at, "#ffd36e"); break;
        case "guardEaten": sfx.bite(); popup(e.at, String(e.points), Art.rgb(Art.GUARDIANS[e.persona % 4].light)); break;
        case "bonusSpawn": burst(e.at, "#f2c037"); break;
        case "bonus": host.SFX.eat(); popup(e.at, String(e.points), "#f2c037"); break;
        case "extraLife": sfxOneUp(); break;
        case "flip": if (e.ctrl) sfx.flipEnd(); break;
        // fire eggs
        case "eggLaid": sfx.lay(); break;
        case "burst": booms++; break;
        case "urn": cracks++; break;
        case "burnItem": burst(e.at, "#ffb347"); break;
        case "powerUp": if (e.ctrl) sfx.power("fast"); burst(e.at, "#ffe7a3"); popup(e.at, Art.POWER_SIGN[e.item], "#ffe7a3"); break;
        case "burnt": if (e.ctrl) host.SFX.body(); else sfx.pop(); burst(e.at, "#ff5a4a"); break;
        case "closing": sfx.timeUp(); break;
        case "closed": walls++; break;
        case "blastOver": onBlastOver(e); break;
        case "caught": onCaught(e); break;
        case "chaseOver": onChaseOver(); break;
        case "chaseClear": onChaseClear(); break;
      }
    });
    // one boom, crack and thud a frame, however many eggs go off together
    if (booms) sfx.boom();
    if (cracks) sfx.crack();
    if (walls) sfx.wall();
    // A stage or chase score is saved the moment it passes the best (not only
    // when the go ends), so leaving or closing the tab mid-run keeps it
    if (st.stage) recordStage();
    if (st.chase) recordChase();
  }

  var DEATHS = {
    wall: ["Crashed! 💥", "Walls don't move. You do."],
    edge: ["Off the edge! 💥", "Ghosts still can't leave the board."],
    locked: ["Locked out! 🔒", "The exit only opens once every 🍎 is gone."],
    self: ["Tied in a knot! 🪢", "You bit your own tail."],
    enemy: ["Caught! 🐍", "Your head hit another snake. Theirs hitting you is their problem."],
    spike: ["Spiked! 🔺", "Raised spikes cut any part of you — mind your tail."],
    time: ["Out of time! ⏰", "The clock ran out."],
  };
  function onDead(e) {
    if (e.cause === "time") sfx.timeUp();
    else if (e.cause === "spike") sfx.spike();
    else if (e.cause === "self" || e.cause === "enemy") host.SFX.body();
    else host.SFX.wall();
    clearHeld();
    var words = DEATHS[e.cause] || DEATHS.wall;
    if (e.cause === "locked" && st.boss && st.boss.alive) words = [words[0], "The exit stays sealed while the Serpent King lives."];
    if (st.stage) { stageOver(words); return; }
    var over = inRun && loseLife();
    var left = inRun && progress.run ? "  ·  ❤ ×" + progress.run.lives + " left" : "";
    endTimer = setTimeout(function () {
      if (!active) return;
      if (over) { runOver(); return; }
      host.showResult({
        title: words[0],
        msg: escapeHtml(words[1] + left) + "  ·  " + retryLine("retry", "Retry"),
        html: true,
        primaryLabel: "Retry",
        primaryFn: restart,
      });
    }, 650);
  }
  function onWin() {
    host.SFX.win();
    clearHeld();
    if (custom) {
      var tc = st.elapsed;
      endTimer = setTimeout(function () {
        if (!active) return;
        host.showResult({ title: "Level clear! 🎉", msg: "Time " + secs(tc) + "s", primaryLabel: "Play Again", primaryFn: restart });
      }, 550);
      return;
    }
    var level = LEVELS[levelIdx], t = st.elapsed, prev = progress.best[level.id];
    var isBest = prev == null || t < prev;
    if (isBest) { progress.best[level.id] = Math.round(t); saveProgress(); }
    // A warp arch skips ahead: the level counts as cleared, and the target
    // stays unlocked even if you quit before finishing it.
    var warpIdx = -1;
    if (st.warp) {
      for (var w = 0; w < LEVELS.length; w++) if (LEVELS[w].id === st.warp) warpIdx = w;
    }
    if (warpIdx >= 0 && inRun && progress.run && LEVELS[warpIdx].zone === level.zone) {
      progress.warped = progress.warped || {};
      progress.warped[st.warp] = true;
      runWin("Warp! Skipping ahead · Time " + secs(t) + "s", warpIdx);
      return;
    }
    if (warpIdx >= 0) {
      progress.warped = progress.warped || {};
      progress.warped[st.warp] = true;
      saveProgress();
      var target = LEVELS[warpIdx];
      endTimer = setTimeout(function () {
        if (!active) return;
        host.showResult({
          title: "Warp! 🌀",
          msg: "Skipping ahead to level " + (warpIdx + 1) + " · " + target.name + "  ·  Time " + secs(t) + "s",
          primaryLabel: "Warp →",
          primaryFn: function () { start(warpIdx); },
        });
      }, 550);
      return;
    }
    var last = levelIdx === LEVELS.length - 1;
    var msg = "Time " + secs(t) + "s" + (isBest ? (prev != null ? " — new best! 🎉" : "") : "  ·  Best " + secs(prev) + "s");
    if (inRun && progress.run) { runWin(msg, warpIdx); return; }
    endTimer = setTimeout(function () {
      if (!active) return;
      if (last) {
        host.showResult({ title: "You escaped the Labyrinth! 🏆", msg: msg, primaryLabel: "Level Select", primaryFn: host.toMenu });
      } else {
        host.showResult({ title: "Level clear! 🎉", msg: msg, primaryLabel: "Next Level →", primaryFn: function () { start(levelIdx + 1); } });
      }
    }, 550);
  }

  // An arena round is over: tally it, and maybe the match.
  function onArenaOver(e) {
    var human = e.winner === "p1" || e.winner === "p2";
    if (human) host.SFX.win(); else host.SFX.wall();
    clearHeld();
    var two = twoPlayer();
    var names = { p1: two ? "P1" : "You", p2: "P2", rival: "Rivals" };
    var title = e.winner === "p1" ? (two ? "P1 takes the round! 🟢" : "You take the round! 🏆")
      : e.winner === "p2" ? "P2 takes the round! 🔵" : e.winner === "rival" ? "A rival takes the round 🐍" : "Nobody's left: a draw 💥";
    if (arenaIdx < 0) {
      endTimer = setTimeout(function () { if (active) host.showResult({ title: title, msg: retryLine("play again", "Play Again"), html: true, primaryLabel: "Play Again", primaryFn: restart }); }, 650);
      return;
    }
    if (tally[e.winner] != null) tally[e.winner]++;
    var line = (two ? ["p1", "p2", "rival"] : ["p1", "rival"]).map(function (k) { return names[k] + " " + tally[k]; }).join(" · ");
    var champ = tally[e.winner] >= ARENA_WINS ? e.winner : null;
    endTimer = setTimeout(function () {
      if (!active) return;
      if (champ) {
        host.showResult({
          title: champ === "rival" ? "The rivals take the match 🐍" : names[champ] + (champ === "p1" && !two ? " win the match! 🏆" : " wins the match! 🏆"),
          msg: line, primaryLabel: "New Match", primaryFn: function () { startArena(arenaIdx, true); },
        });
      } else {
        host.showResult({ title: title, msg: line + "  ·  first to " + ARENA_WINS, primaryLabel: "Next Round →", primaryFn: function () { startArena(arenaIdx, false); } });
      }
    }, 650);
  }

  // ---- fire eggs results --------------------------------------------------------------
  // A blast round is over: tally it, and maybe the match (first to ARENA_WINS).
  function onBlastOver(e) {
    var human = e.winner === "p1" || e.winner === "p2";
    if (human) host.SFX.win(); else host.SFX.wall();
    clearHeld();
    var two = twoPlayer();
    var names = { p1: two ? "P1" : "You", p2: "P2", rival: "Rivals" };
    var title = e.winner === "p1" ? (two ? "P1 takes the round! 🟢" : "You take the round! 🏆")
      : e.winner === "p2" ? "P2 takes the round! 🔵" : e.winner === "rival" ? "A rival takes the round 🐍" : "Nobody's left: a draw 💥";
    if (blastTally[e.winner] != null) blastTally[e.winner]++;
    var line = (two ? ["p1", "p2", "rival"] : ["p1", "rival"]).map(function (k) { return names[k] + " " + blastTally[k]; }).join(" · ");
    var champ = blastTally[e.winner] >= ARENA_WINS ? e.winner : null;
    endTimer = setTimeout(function () {
      if (!active) return;
      if (champ) {
        host.showResult({
          title: champ === "rival" ? "The rivals take the match 🐍" : names[champ] + (champ === "p1" && !two ? " win the match! 🏆" : " wins the match! 🏆"),
          msg: line, primaryLabel: "New Match", primaryFn: function () { startBlast(blastIdx, true); },
        });
      } else {
        host.showResult({ title: title, msg: line + "  ·  first to " + ARENA_WINS, primaryLabel: "Next Round →", primaryFn: function () { startBlast(blastIdx, false); } });
      }
    }, 900);
  }

  // ---- maze chase results ---------------------------------------------------------
  // Keeps the best chase score; returns the best before this run.
  function recordChase() {
    var prev = chaseBest();
    if (chaseIdx >= 0 && st && st.chase && st.chase.score > prev) { progress.chaseBest = st.chase.score; saveProgress(); }
    return prev;
  }
  // Caught with lives to spare: a beat to see it, then everyone back to their spots.
  function onCaught(e) {
    host.SFX.body();
    burst(e.at, "#ff5a4a");
    clearHeld();
    if (e.lives > 0) {
      endTimer = setTimeout(function () {
        if (!active || !st || st.status !== "caught") return;
        E.chaseRespawn(st);
      }, 1500);
    }
  }
  function onChaseOver() {
    var score = st.chase.score, round = st.chase.round, prev = chaseRunBest;
    recordChase();
    var msg = "Score " + score + (score > prev ? (prev ? " — new best! 🎉" : "") : "  ·  Best " + prev) + "  ·  maze " + round;
    endTimer = setTimeout(function () {
      if (!active) return;
      host.showResult({ title: "The guardians got you 👻", msg: escapeHtml(msg) + "  ·  " + retryLine("play again", "Play Again"), html: true, primaryLabel: "Play Again", primaryFn: restart });
    }, 900);
  }
  function onChaseClear() {
    host.SFX.win();
    clearHeld();
    var C = st.chase, next = (chaseIdx + 1) % CHASES.length;
    recordChase();
    chaseRun = { score: C.score, lives: C.lives, round: C.round + 1, extraGiven: C.extraGiven, first: chaseRun ? chaseRun.first : chaseIdx };
    endTimer = setTimeout(function () {
      if (!active) return;
      host.showResult({
        title: "Maze clear! ✨",
        msg: "Score " + C.score + "  ·  ❤ ×" + C.lives + "  ·  next: " + CHASES[next].name + ", a little faster",
        primaryLabel: "Next Maze →", primaryFn: function () { startChase(next, false); },
      });
    }, 700);
  }

  // A stage ends when you crash: score it.
  // Returns the previous best (0 for none).
  function recordStage() {
    if (stageIdx < 0 || !st || !st.stage) return 0;
    var id = STAGES[stageIdx].id, best = stageBest(id);
    if (st.score > best) { progress.stageBest = progress.stageBest || {}; progress.stageBest[id] = st.score; saveProgress(); }
    return best;
  }
  function stageOver(words) {
    var score = st.score, best = stageRunBest;
    recordStage();
    var msg = "Score " + score + " 🍎" + (stageIdx < 0 ? "" : score > best ? (best ? " — new best! 🎉" : "") : "  ·  Best " + best);
    endTimer = setTimeout(function () {
      if (!active) return;
      host.showResult({ title: words[0], msg: escapeHtml(msg) + "  ·  " + retryLine("play again", "Play Again"), html: true, primaryLabel: "Play Again", primaryFn: restart });
    }, 650);
  }

  // A level cleared on a run: time bonus, then the next level of the zone
  // (or the warp target), or the pack is done.
  function runWin(msg, warpIdx) {
    var r = progress.run, zone = LEVELS[levelIdx].zone;
    var bonus = st.timeLimit ? Math.floor(st.timeLeft / 1000 / RUN.bonusEvery) : 0;
    addApples(bonus);
    var next = warpIdx >= 0 ? warpIdx : levelIdx + 1;
    var stats = (bonus ? "  ·  time bonus +" + bonus + " 🍎" : "") + "  ·  ❤ ×" + r.lives;
    if (next > zoneLast(zone) || LEVELS[next].zone !== zone) {
      progress.runs = progress.runs || {};
      progress.runs[zone] = Math.max(progress.runs[zone] || 0, r.lives);
      progress.run = null;
      saveProgress();
      endTimer = setTimeout(function () {
        if (!active) return;
        host.showResult({ title: zone + " pack cleared! 🏆", msg: "Ziggy rules, with ❤ ×" + r.lives + " to spare.", primaryLabel: "Level Select", primaryFn: host.toMenu });
      }, 550);
      return;
    }
    r.idx = next;
    saveProgress();
    endTimer = setTimeout(function () {
      if (!active) return;
      host.showResult({ title: "Level clear! 🎉", msg: msg + stats, primaryLabel: "Next Level →", primaryFn: function () { start(next, true); } });
    }, 550);
  }

  // ---- HUD ---------------------------------------------------------------------
  function updateHud() {
    if (!st) return;
    if (st.blast) {
      var B = st.blast, two = twoPlayer(), left = st.snakes.filter(function (s) { return s.alive; }).length;
      el.apples.innerHTML = "🐍 <b>" + left + "</b> left" + (blastTally
        ? " · 🏆 " + (two ? "P1 " + blastTally.p1 + " · P2 " + blastTally.p2 : "You " + blastTally.p1) + " · Rivals " + blastTally.rival : "");
      var ms = Math.max(0, E.BLAST.closeAt - B.clock), sec = Math.ceil(ms / 1000);
      el.time.innerHTML = B.closing ? "🧱 <b>closing in</b>" : "⌛ <b>" + Math.floor(sec / 60) + ":" + ("0" + sec % 60).slice(-2) + "</b>";
      var kit = function (ctrl) {
        var s = st.snakes.filter(function (x) { return x.ctrl === ctrl; })[0];
        return s ? "🥚" + s.cap + " 🔥" + s.range + (s.spd ? " ⚡" + s.spd : "") : "";
      };
      el.lives.style.display = "";
      el.lives.title = "Eggs at once · blast range · speed";
      el.lives.innerHTML = two ? "P1 " + kit("p1") + " · P2 " + kit("p2") : kit("p1");
      el.blink.style.display = el.ghost.style.display = el.lock.style.display = el.boss.style.display = el.twins.style.display = "none";
      return;
    }
    el.lives.title = st.chase ? "Lives left" : "Pack run: lives left, and apples toward the next extra life";
    if (st.chase) {
      var C = st.chase, best = Math.max(chaseBest(), C.score);
      el.apples.innerHTML = "✦ <b>" + C.score + "</b>" + (best ? " · best " + best : "");
      el.time.innerHTML = "● <b>" + C.left + "</b> left";
      el.lives.style.display = "";
      el.lives.innerHTML = "❤ <b>×" + C.lives + "</b>";
      el.blink.style.display = el.ghost.style.display = el.lock.style.display = el.boss.style.display = el.twins.style.display = "none";
      return;
    }
    if (st.arena) {
      var left = st.snakes.filter(function (s) { return s.alive && (s.ctrl || s.kind === "rival"); }).length;
      el.apples.innerHTML = "🐍 <b>" + left + "</b> left" + (tally && arenaIdx >= 0 ? " · 🏆 " + (twoPlayer() ? "P1 " + tally.p1 + " · P2 " + tally.p2 : "You " + tally.p1) + " · Rivals " + tally.rival : "");
    } else if (st.stage) el.apples.innerHTML = "🍎 <b>" + st.score + "</b>" + (stageIdx >= 0 && stageBest(STAGES[stageIdx].id) ? " · best " + stageBest(STAGES[stageIdx].id) : "");
    else el.apples.innerHTML = st.applesLeft > 0 ? "🍎 <b>" + st.applesLeft + "</b> left" : E.exitOpen(st) ? "🚪 <b>exit open</b>" : "🚪 <b>sealed</b>";
    var showTime = st.timeLimit ? st.timeLeft : st.elapsed;
    el.time.innerHTML = "⌛ <b>" + secs(showTime) + "</b>";
    if (st.timeLimit) {
      var f = Math.max(0, st.timeLeft / st.timeLimit);
      el.timeFill.style.width = (f * 100).toFixed(2) + "%";
      // Sand runs from gold to ember as the clock drains.
      el.timeFill.style.backgroundColor = f > 0.5 ? "#e8c26a" : f > 0.25 ? "#e3a24c" : f > 0.1 ? "#e0763a" : "#e5484d";
    }
    var r = st.res.p1;
    el.blink.style.display = r.teleports > 0 ? "" : "none";
    el.blink.innerHTML = "✦ <b>×" + r.teleports + "</b>";
    var showGhost = r.ghost > 0 || r.ghostActive;
    el.ghost.style.display = showGhost ? "" : "none";
    el.ghostFill.style.width = (r.ghost / E.CFG.ghostMax * 100).toFixed(1) + "%";
    el.ghost.classList.toggle("on", r.ghostActive);
    el.lock.style.display = r.mouseLock > 0 ? "" : "none";
    el.boss.style.display = st.boss ? "" : "none";
    if (st.boss) {
      var hearts = "";
      for (var hp = 0; hp < st.bossMax; hp++) hearts += hp < st.bossHp ? "♥" : "♡";
      el.boss.innerHTML = st.boss.alive ? "👁 <b>" + hearts + "</b>" : "👁 <b>defeated</b>";
    }
    el.lives.style.display = inRun && progress.run ? "" : "none";
    if (inRun && progress.run) el.lives.innerHTML = "❤ <b>×" + progress.run.lives + "</b> · 🍎 <b>" + progress.run.apples + "</b>/" + RUN.perLife;
    var mine = E.playersOf(st, "p1").length;
    el.twins.style.display = mine > 1 ? "" : "none";
    el.twins.innerHTML = "🐍 <b>×" + mine + "</b>";
    if (r.mouseLock > 0) el.lock.innerHTML = "🖱✖ <b>" + Math.ceil(r.mouseLock / 1000) + "s</b>";
  }

  // ---- loop ----------------------------------------------------------------------
  function frame(ts, tk) {
    if (tk !== token) return;
    // rAF stops while the tab is hidden; the first frame back must not
    // fast-forward the level (the engine clamps too).
    var dt = lastTs ? Math.min(ts - lastTs, 100) : 0;
    lastTs = ts;
    if (!paused && st.status === "play") {
      E.advance(st, dt);
      if (st.timeLimit && st.status === "play") {
        var s = Math.ceil(st.timeLeft / 1000);
        if (s <= 5 && s !== lastTickSec) { lastTickSec = s; sfx.tick(); }
      }
    }
    drainEvents();
    render(ts);
    updateHud();
    requestAnimationFrame(function (t) { frame(t, tk); });
  }

  // ---- drawing ---------------------------------------------------------------------
  // Tiles that never change are painted once per level into `layer`;
  // `live` lists the cells whose look depends on state and is redrawn each frame.
  var layer = null, live = [];
  function cx(i) { return (i % st.cols) * CELL + CELL / 2; }
  function cy(i) { return Math.floor(i / st.cols) * CELL + CELL / 2; }
  function isWall(x, y) { return x < 0 || y < 0 || x >= st.cols || y >= st.rows || st.tiles[y * st.cols + x] === T.WALL; }

  function buildLayer() {
    layer = Art.makeLayer(st.cols * CELL, st.rows * CELL);
    live = [];
    var g = layer.ctx;
    for (var y = 0; y < st.rows; y++) {
      for (var x = 0; x < st.cols; x++) {
        var i = y * st.cols + x, t = st.tiles[i], px = x * CELL, py = y * CELL, seed = i + levelIdx * 7919;
        if (t === T.WALL) {
          Art.wall(g, px, py, CELL, theme, seed, { n: !isWall(x, y - 1), s: !isWall(x, y + 1), w: !isWall(x - 1, y), e: !isWall(x + 1, y) });
          continue;
        }
        if (t === T.ICE) Art.ice(g, px, py, CELL, seed);
        else if (t === T.STORM) Art.storm(g, px, py, CELL, seed);
        else if (t === T.DREAM) {
          var isD = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < st.cols && yy < st.rows && st.tiles[yy * st.cols + xx] === T.DREAM; };
          Art.dream(g, px, py, CELL, seed, { n: !isD(x, y - 1), s: !isD(x, y + 1), w: !isD(x - 1, y), e: !isD(x + 1, y) });
        }
        else if (t === T.DARK) Art.darkFloor(g, px, py, CELL);
        else Art.floor(g, px, py, CELL, theme, seed);
        if (t === T.CUTTER) Art.cutter(g, px, py, CELL);
        else if (t === T.STUD) Art.stud(g, px, py, CELL);
        else if (t === T.INFINITY) Art.infinity(g, px, py, CELL);
        else if (t === T.CLONER) Art.cloner(g, px, py, CELL);
        else if (t === T.OUTLET) Art.outlet(g, px, py, CELL);
        else if (t === T.GATE) Art.gate(g, px, py, CELL);
        else if (t === T.TELE || t === T.TELE_OUT) live.push(i);
        else if (t === T.PORTAL) { Art.portalFrame(g, px + CELL / 2, py + CELL / 2, CELL / 2 - 1); live.push(i); }
        else if (t === T.DOOR_SHUT || t === T.DOOR_OPEN || t === T.SWITCH || t === T.CLICK || t === T.SPIKE_A || t === T.SPIKE_B || t === T.EXIT || t === T.WARP) live.push(i);
      }
    }
  }

  function drawLive(now, fx) {
    var warn = st.status === "play" && !st.lv.hasStuds && st.spikeTimer < E.CFG.spikeWarnMs;
    var blinkOn = !fx || Math.floor(now / 90) % 2 === 1;
    for (var k = 0; k < live.length; k++) {
      var i = live[k], t = st.tiles[i], px = (i % st.cols) * CELL, py = Math.floor(i / st.cols) * CELL;
      var col = st.lv.doorColor[i] || 0;
      if (t === T.DOOR_SHUT || t === T.DOOR_OPEN) Art.door(ctx, px, py, CELL, E.isDoorShut(st, i), col);
      else if (t === T.SWITCH) Art.plate(ctx, px, py, CELL, st.flip[col], col);
      else if (t === T.CLICK) Art.clickSwitch(ctx, px, py, CELL, st.flip[col], col);
      else if (t === T.SPIKE_A || t === T.SPIKE_B) { var up = E.spikeUp(st, i); Art.spikes(ctx, px, py, CELL, up, !up && warn && blinkOn); }
      else if (t === T.EXIT) Art.doorway(ctx, px, py, CELL, E.exitOpen(st), now, fx);
      else if (t === T.WARP) Art.warpway(ctx, px, py, CELL, E.exitOpen(st), now, fx);
      else if (t === T.TELE || t === T.TELE_OUT) Art.telePad(ctx, px, py, CELL, t === T.TELE, st.lv.teleId[i] || 0, now, fx);
      else if (t === T.PORTAL) Art.portalGlow(ctx, px + CELL / 2, py + CELL / 2, CELL / 2 - 1, Art.PORTAL_COLORS[st.lv.portalId[i] % 4], now, fx);
    }
  }

  function drawItem(i, item, now, fx) {
    if (item === "bead") { Art.bead(ctx, cx(i), cy(i), CELL); return; }   // hundreds of them: they sit still
    if (item === "fire" || item === "egg" || item === "speed") { Art.powerTablet(ctx, cx(i), cy(i), CELL, item, now, fx); return; }
    if (item === "sunstone") { Art.sunstone(ctx, cx(i), cy(i), CELL, now, fx); return; }
    var x = cx(i), y = cy(i) + (fx ? Math.sin(now / 180 + i) * 1.3 : 0);
    if (item === "apple") Art.fruit(ctx, x, y, CELL - 6, "🍎");
    else if (item === "fast") Art.fruit(ctx, x, y, CELL - 6, "🍏");
    else if (item === "blink") Art.gem(ctx, x, y, CELL * 0.3);
    else if (item === "ghost") Art.wisp(ctx, x, y, CELL * 0.3, now, fx);
    else Art.itemArt(ctx, item, x, y, CELL, now, fx);
  }

  function drawSnake(s, idx, now, fx) {
    var alpha = 1, isPlayer = !!s.ctrl || s.kind === "rival";
    // in a blast arena the fallen turn to stone and crumble away, clearing the floor
    if (st.blast && !s.alive) { alpha = 1 - (st.elapsed - s.diedAt) / 900; if (alpha <= 0) return; }
    if (!s.alive && !isPlayer) {
      alpha = 1 - (st.elapsed - s.diedAt) / 450;
      if (alpha <= 0) return;
    }
    var ghost = !!s.ctrl && s.alive && st.res[s.ctrl].ghostActive;
    // Shooting through a dream block, a snake is a skeleton (ghosts just phase).
    var skeleton = s.alive && st.tiles[s.body[0]] === T.DREAM && !(E.KINDS[s.kind] && E.KINDS[s.kind].phase);
    Art.serpent(ctx, s.body.map(function (i) { return { x: cx(i), y: cy(i) }; }), {
      cell: CELL,
      pal: skeleton ? Art.SERPENTS.bone : s.alive && st.tiles[s.body[0]] === T.STORM ? Art.SERPENTS.volt
        : s.ctrl === "p2" ? Art.SERPENTS.lapis : s.kind === "rival" ? Art.SERPENTS[RIVAL_PALS[(s.rivalNo || 0) % RIVAL_PALS.length]] : Art.serpentFor(s.kind),
      scale: s.kind === "boss" ? 1.7 : 1,
      cyclops: s.kind === "boss",
      alpha: ghost ? 0.55 : alpha,
      dir: s.dir >= 0 ? { x: E.DX[s.dir], y: E.DY[s.dir] } : null,
      ghost: ghost,
      dead: isPlayer && !s.alive,   // turned to stone
      cross: isPlayer && !s.alive,
      t: now, fx: fx, seed: idx,
    });
  }

  // The guardians: hunting, frightened (flashing as the fright wears off), or
  // just their eyes flying home.
  function drawGuards(now, fx) {
    var C = st.chase, ending = C.fright > 0 && C.fright < 1800;
    st.guards.forEach(function (g) {
      var look = g.state === "eaten" ? "eyes" : !g.fright ? "hunt"
        : ending && (!fx || Math.floor(now / 170) % 2 === 1) ? "flash" : "fright";
      Art.guardian(ctx, cx(g.cell), cy(g.cell), CELL, { persona: g.persona, look: look, dir: { x: E.DX[g.dir], y: E.DY[g.dir] }, t: now, fx: fx });
    });
  }

  // Fire eggs, under the snakes: urns, walls the arena has closed in, the next
  // cells to close (flashing), and the eggs themselves.
  function drawBlastUnder(now, fx) {
    var B = st.blast, i, x, y;
    for (i = 0; i < st.tiles.length; i++) if (st.tiles[i] === T.URN) Art.urn(ctx, (i % st.cols) * CELL, Math.floor(i / st.cols) * CELL, CELL, i);
    B.closed.forEach(function (c) {
      x = c % st.cols; y = Math.floor(c / st.cols);
      Art.wall(ctx, x * CELL, y * CELL, CELL, theme, c, { n: !isWall(x, y - 1), s: !isWall(x, y + 1), w: !isWall(x - 1, y), e: !isWall(x + 1, y) });
    });
    if (B.closing && B.order && (!fx || Math.floor(now / 150) % 2 === 0)) {
      ctx.strokeStyle = "rgba(255,80,60,0.9)"; ctx.lineWidth = 2;
      for (var k = 0; k < Math.min(3, B.order.length); k++) {
        var c = B.order[k];
        ctx.strokeRect((c % st.cols) * CELL + 2, Math.floor(c / st.cols) * CELL + 2, CELL - 4, CELL - 4);
      }
    }
    B.eggs.forEach(function (e) { Art.fireEgg(ctx, cx(e.cell), cy(e.cell), CELL, e.fuse / E.BLAST.fuse, now, fx, e.cell); });
  }
  // Flames go over everything; each cell reaches toward its burning neighbours
  // so a burst reads as one cross, and fades as it dies.
  function drawFlames(now, fx) {
    var hot = {};
    st.blast.flames.forEach(function (f) { hot[f.cell] = true; });
    st.blast.flames.forEach(function (f) {
      var i = f.cell, x = i % st.cols, y = Math.floor(i / st.cols);
      var arms = { n: y > 0 && !!hot[i - st.cols], s: y < st.rows - 1 && !!hot[i + st.cols], w: x > 0 && !!hot[i - 1], e: x < st.cols - 1 && !!hot[i + 1] };
      ctx.globalAlpha = Math.min(1, f.ms / 200);
      Art.flame(ctx, x * CELL, y * CELL, CELL, arms, now, fx, i);
      ctx.globalAlpha = 1;
    });
  }

  function render(now) {
    if (!st || !layer) return;
    var fx = !(window.RM_ON && window.RM_ON());
    var W = st.cols * CELL, H = st.rows * CELL;
    ctx.drawImage(layer.canvas, 0, 0, W, H);
    drawLive(now, fx);
    var keys = Object.keys(st.items);
    keys.forEach(function (k) { drawItem(Number(k), st.items[k], now, fx); });
    st.flowers.forEach(function (f) { Art.flower(ctx, (f.cell % st.cols) * CELL, Math.floor(f.cell / st.cols) * CELL, CELL, f.armed, now, fx); });
    if (st.blast) drawBlastUnder(now, fx);
    for (var s = st.snakes.length - 1; s >= 0; s--) drawSnake(st.snakes[s], s, now, fx);
    if (st.chase) drawGuards(now, fx);
    if (st.blast) drawFlames(now, fx);

    // Unlit halls hide serpents, not the apples you're hunting for.
    for (var i = 0; i < st.tiles.length; i++) {
      if (st.tiles[i] !== T.DARK) continue;
      var px = (i % st.cols) * CELL, py = Math.floor(i / st.cols) * CELL;
      ctx.fillStyle = "#08070a";
      ctx.fillRect(px, py, CELL, CELL);
      if (fx) {
        var e = Art.hash(i, Math.floor(now / 140));
        if (e < 0.05) { ctx.fillStyle = "rgba(255,140,60," + (0.08 + e) + ")"; ctx.fillRect(px + e * 300 % (CELL - 3), py + e * 700 % (CELL - 3), 2, 2); }
      }
      if (st.items[i]) { ctx.globalAlpha = 0.8; drawItem(i, st.items[i], now, fx); ctx.globalAlpha = 1; }
    }

    // In a storm the cursor steers: draw the arc from your head to it.
    var sp = E.primary(st, "p1");
    if (sp && st.tiles[sp.body[0]] === T.STORM && st.cursor >= 0 && st.res.p1.mouseLock <= 0) {
      ctx.strokeStyle = "rgba(190,230,255,0.75)"; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(cx(sp.body[0]), cy(sp.body[0])); ctx.lineTo(cx(st.cursor), cy(st.cursor)); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Where the engine thinks the cursor is — Mouse Eaters hunt it, so show it.
    if (st.cursor >= 0 && st.snakes.some(function (s) { return s.alive && s.kind === "mouse"; })) {
      var mx = cx(st.cursor), my = cy(st.cursor), locked = st.res.p1.mouseLock > 0;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = locked ? "#8a8a8a" : "#fff4e0";
      ctx.strokeStyle = "#1b1204"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx - 3, my - 7); ctx.lineTo(mx - 3, my + 5); ctx.lineTo(mx, my + 2); ctx.lineTo(mx + 2.5, my + 7);
      ctx.lineTo(mx + 4.5, my + 6); ctx.lineTo(mx + 2, my + 1.5); ctx.lineTo(mx + 6, my + 1.5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Teleport aim.
    if (st.res.p1.teleports > 0 && hover >= 0 && st.status === "play" && !paused) {
      var ok = E.canBlinkTo(st, hover);
      ctx.strokeStyle = ok ? "#c99bff" : "#ff5a4a";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(cx(hover), cy(hover), CELL / 2 - 2, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Pickup / death bursts, and the points a bite or a bonus scores.
    effects = effects.filter(function (f) {
      var t = (now - f.t0) / (f.life || 380);
      if (t >= 1 || t < 0) return t < 0;
      if (f.text) {
        ctx.globalAlpha = Math.min(1, (1 - t) * 1.6);
        ctx.font = "700 12px Cinzel, Georgia, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(14,11,8,0.85)";
        var ty = cy(f.i) - (fx ? t * 14 : 6);
        ctx.strokeText(f.text, cx(f.i), ty);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, cx(f.i), ty);
        ctx.globalAlpha = 1;
        return true;
      }
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx(f.i), cy(f.i), CELL * (fx ? 0.35 + t * 0.7 : 0.55), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      return true;
    });

    if (st.status === "ready") {
      ctx.fillStyle = "rgba(14,11,8,0.78)";
      ctx.fillRect(0, H / 2 - 22, W, 44);
      ctx.fillStyle = "rgba(214,176,96,0.8)";
      ctx.fillRect(0, H / 2 - 22, W, 1.5);
      ctx.fillRect(0, H / 2 + 20.5, W, 1.5);
      ctx.fillStyle = "#f3e6c4";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      // The keys, or on a touch-only device the touch controls (drawKeys' `touch`)
      var keys = st.blast ? (twoPlayer() ? "P1: [W][A][S][D] + [Space] · P2: [↑][←][↓][→] + [Enter] · move to begin" : "Hold an arrow key to slither · [Space] lays an egg")
        : twoPlayer() ? "P1: [W][A][S][D] · P2: [↑][←][↓][→] · steer to begin" : "Press an arrow key or [W][A][S][D] to begin";
      var touch = st.blast ? (twoPlayer() ? "Hold a d-pad to slither · 🥚 lays an egg" : "Hold the d-pad to slither · 🥚 lays an egg")
        : twoPlayer() ? "Either d-pad starts the round" : "Swipe or tap the d-pad to begin";
      var ready = window.GameShell && GameShell.touchOnly() ? touch : keys;
      // Each [key] is drawn as a keycap (about 0.92em wider than its letter),
      // so step the size down until the line fits the board.
      var plain = ready.replace(/[\[\]]/g, ""), caps = (ready.match(/\[/g) || []).length, px = 15;
      ctx.font = "700 15px Cinzel, Georgia, serif";
      while (px > 9 && ctx.measureText(plain).width + caps * px * 0.92 > W - 16) ctx.font = "700 " + (--px) + "px Cinzel, Georgia, serif";
      if (window.GameShell) GameShell.drawKeys(ctx, keys, W / 2, H / 2 + 1, { touch: touch });
      else ctx.fillText(plain, W / 2, H / 2 + 1);
    }
  }

  // For leaving the page (game.js): true while that would throw away
  // something unsaved. A pack run is saved as it goes (its apples too), and
  // leaving mid-level only means Continue starts that level over, without
  // the life a quit costs, so it never asks. A level is in progress once the
  // snake is moving; a stage once it has scored; a chase once it has scored
  // (or cleared a maze), until the last life; an arena or fire-eggs match
  // until someone has won it, between rounds too.
  function inProgress() {
    if (!active || !st) return false;
    var s = st.status;
    if (chaseIdx >= 0 && st.chase) return (s === "play" || s === "ready" || s === "caught" || s === "won") && (st.chase.score > 0 || st.chase.round > 1);
    var t = arenaIdx >= 0 ? tally : blastIdx >= 0 ? blastTally : null;
    if (t) return !matchWon(t) && (s === "play" || t.p1 + t.p2 + t.rival > 0);
    if (inRun) return false;
    if (st.stage) return s === "play" && st.score > 0;
    return s === "play";
  }

  return {
    start: start, restart: restart, stop: stop, inProgress: inProgress,
    togglePause: togglePause, autoPause: autoPause, isPaused: function () { return paused; },
    keydown: keydown, keyup: keyup, steer: steer, padSteer: padSteer, unsteer: unsteer, padHold: padHold,
    isOver: function () { return !!st && (st.status === "dead" || st.status === "won" || st.status === "over"); },
    buildLevelGrid: buildLevelGrid, continueIndex: continueIndex, startCustom: startCustom,
    startRun: startRun, continueRun: continueRun, startStage: startStage, startArena: startArena, startChase: startChase,
    startBlast: startBlast, padLay: padLay,
    levelCount: function () { return LEVELS.length; },
  };
};
