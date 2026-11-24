/* =====================================================================
   Dr. Mr.: the play, the drawing and the keys (the rules are rules.js).

   Each vial is a player: you, the CPU, or a second player at the same
   keyboard. A player's capsule goes through its moments in turn:
     toss   Dr. Mr. tosses it into the neck (a breath, so a new capsule is
            never a surprise)
     fall   it falls a row at a time, steered and turned on the way
     clear  lines of four flash, then go
     drop   whatever they held up falls, a row a step; then the lines are
            looked for again (a chain), and when none are left the next
            capsule is tossed
   Levels: clear every germ to cure the level, then the next, the score
   carried. Endless: the culture grows a row from the floor every few
   capsules. Versus (the CPU, or two players): the same germs and the same
   capsules in both vials; the first to cure theirs wins the round, a vial
   filled to the neck loses it, and a chain of two lines or more sends the
   other vial loose halves.
   ===================================================================== */
(function () {
  "use strict";

  var R = window.DrMrRules, W = R.W, H = R.H;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  function bestOf(key) { return window.GameShell ? GameShell.best(key, { higher: true }) : { get: function () { return 0; }, submit: function () { return false; } }; }
  // the best score in Levels and in Endless, and the highest level cured
  var bests = { levels: bestOf("drmr_best_levels"), endless: bestOf("drmr_best_endless"), cured: bestOf("drmr_best_cured") };

  var MODES = ["levels", "endless", "cpu", "duo"];
  var SPEED_NAMES = { low: "Low", med: "Med", hi: "Hi" };
  var CPU_NAMES = { easy: "Easy", normal: "Normal", hard: "Hard" };
  // the CPU's pace (seconds a move) and how loosely it picks its place
  var CPU_PLAY = { easy: { move: 0.26, loose: 0.55 }, normal: { move: 0.14, loose: 0.22 }, hard: { move: 0.075, loose: 0 } };
  var TOUCH = !!(window.GameShell && GameShell.touchOnly && GameShell.touchOnly());

  var mode = store.get("drmr_mode", "levels"); if (MODES.indexOf(mode) < 0) mode = "levels";
  if (TOUCH && mode === "duo") mode = "levels";
  var level = clamp(parseInt(store.get("drmr_level", "5"), 10) || 0, 0, 20);
  var speed = store.get("drmr_speed", "med"); if (!SPEED_NAMES[speed]) speed = "med";
  var cpuLevel = store.get("drmr_cpu", "normal"); if (!CPU_NAMES[cpuLevel]) cpuLevel = "normal";

  // ---- timing (the same with Visual FX on or off) ---------------------------
  // the maker's line: on the lens ring, or on the stage under each vial
  var MARK = "SAM LU PHARMACY · Rx";
  var TOSS = 0.24, CLEAR_T = 0.3, DROP_T = 0.065, SOFT_T = 0.06, DAS = 0.17, ARR = 0.05;   // (SOFT_T: a row while ↓ is held, about 16 a second)
  function fallEvery(p) {
    var base = { low: 0.72, med: 0.46, hi: 0.28 }[speed];
    return Math.max(0.07, base * Math.pow(0.94, Math.floor(p.capsules / 10)));
  }

  // ---- canvas ------------------------------------------------------------------
  var cv = $("stage"), g = cv.getContext("2d");
  var VW = 0, VH = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    VW = window.innerWidth; VH = window.innerHeight;
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
  }

  // ---- sound -----------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, slide, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    gn.gain.setValueAtTime(vol || 0.1, t0);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function sndMove() { tone(520, 0.03, "square", 0.025); }
  function sndTurn() { tone(760, 0.05, "triangle", 0.05, 900); }
  function sndLock() { tone(170, 0.09, "sine", 0.12, 110); }
  function sndClear(chain) { var f = 520 * Math.pow(1.19, Math.min(chain, 6)); tone(f, 0.16, "triangle", 0.09); tone(f * 1.5, 0.2, "sine", 0.05, null, 0.05); }
  function sndJunk() { tone(240, 0.12, "square", 0.04, 160); }
  function sndCure() { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.24, "sine", 0.09, null, i * 0.1); }); }
  function sndOver() { tone(300, 0.5, "square", 0.06, 90); }

  // ---- the game ------------------------------------------------------------------------
  var state = "menu";             // menu | play | cured (a level done) | over
  var players = [];
  var wins = [0, 0];               // rounds won this sitting (versus)
  var clock = 0;                   // seconds, for the drawing
  // the scenery's own clock (the cells drifting across the slide behind the
  // vial): it runs only with Visual FX on, so FX turned off on the way stops
  // them where they are and on again they drift on from there. From a page
  // opened with FX off it stays at 0: the still picture. (The germs and Dr.
  // Mr. are no part of the scenery: with FX off they rest; drawGerm)
  var idle = 0;
  var overAt = 0;
  var lastResult = null;

  function makePlayer(i, ctl, seed, lvl) {
    return {
      i: i, ctl: ctl, seed: seed, board: R.makeGerms(lvl, seed), stream: R.capsuleStream(seed), n: 0,
      piece: null, phase: "toss", pt: 0, fallT: 0, score: 0, level: lvl, capsules: 0,
      chainGerms: 0, chainRuns: 0, chainColors: [], fromJunk: false, junkIn: [], clearing: null,
      soft: false, das: { dir: 0, t: 0 }, rnd: R.mulberry(seed * 31 + i + 7),
      grows: 0, sinceGrow: 0, growEvery: 12, cpu: ctl === "cpu" ? { target: null, t: 0 } : null,
      pops: [], lost: false, view: null
    };
  }

  function startRun(keepScore) {
    audio();
    var seed = (Math.random() * 1e9) >>> 0;
    var carried = keepScore && players[0] ? players[0].score : 0;
    if (mode === "levels" || mode === "endless") {
      players = [makePlayer(0, "you", seed, mode === "endless" ? 3 : level)];
      players[0].score = carried;
      if (mode === "endless") players[0].board = R.makeGerms(3, seed);
    } else {
      players = [makePlayer(0, "you", seed, level), makePlayer(1, mode === "cpu" ? "cpu" : "p2", seed, level)];
    }
    state = "play";
    $("menu").hidden = true; $("over").hidden = true;
    layout(); paintHud(true); layout();
  }
  function nextLevel() {
    level = Math.min(99, level + 1);
    var keep = players[0];
    var seed = (Math.random() * 1e9) >>> 0;
    var p = makePlayer(0, "you", seed, level);
    p.score = keep.score;
    players = [p];
    state = "play";
    $("over").hidden = true;
    layout(); paintHud(true); layout();
  }

  function toMenu() {
    state = "menu"; players = [];
    $("over").hidden = true; $("menu").hidden = false;
    paintMenu(); layout(); paintHud(true); layout();
  }

  // ---- a player's moments ------------------------------------------------------------
  function update(dt) {
    clock += dt;
    if (fx()) idle += dt;
    if (state !== "play") return;
    // (the first vial to end the round ends it there: the other plays no further that frame)
    for (var i = 0; i < players.length && state === "play"; i++) step(players[i], dt);
  }
  function step(p, dt) {
    if (p.lost) return;
    p.pops = p.pops.filter(function (q) { q.t += dt; return q.t < DEATH; });
    if (p.phase === "toss") {
      p.pt += dt;
      if (p.pt >= TOSS) {
        p.piece = R.spawn(p.board, p.stream(p.n));
        p.n++;
        if (!p.piece) return lose(p);
        p.phase = "fall"; p.fallT = 0;
        if (p.cpu) p.cpu.target = null;
      }
    } else if (p.phase === "fall") {
      if (p.cpu) cpuAct(p, dt);
      if (!p.piece) return;
      // a held move repeats after a moment (the key's own repeat is not used)
      if (p.das.dir) {
        p.das.t += dt;
        while (p.das.t >= DAS + ARR) { p.das.t -= ARR; shift(p, p.das.dir, true); }
      }
      p.fallT += dt;
      var every = p.soft ? Math.min(SOFT_T, fallEvery(p)) : fallEvery(p);
      while (p.piece && p.fallT >= every) {
        p.fallT -= every;
        var down = R.moved(p.piece, 0, 1);
        if (R.fits(p.board, down)) p.piece = down; else lockPiece(p);
      }
    } else if (p.phase === "clear") {
      p.pt += dt;
      if (p.pt >= CLEAR_T) {
        var before = p.chainGerms, c = R.clear(p.board, p.clearing);
        p.chainGerms += c.germs; p.chainRuns += c.runs;
        p.clearing.forEach(function (r) { p.chainColors.push(r.c); });
        addPoints(p, before, p.chainGerms);
        p.clearing = null; p.phase = "drop"; p.pt = 0;
      }
    } else if (p.phase === "drop") {
      p.pt += dt;
      while (p.phase === "drop" && p.pt >= DROP_T) {
        p.pt -= DROP_T;
        if (!R.fallStep(p.board).length) lookForLines(p);
      }
    }
  }
  function shift(p, dir, quiet) {
    if (!p.piece || p.phase !== "fall") return false;
    var q = R.moved(p.piece, dir, 0);
    if (!R.fits(p.board, q)) return false;
    p.piece = q; if (!quiet && p.ctl !== "cpu") sndMove();
    return true;
  }
  function turn(p, dir) {
    if (!p.piece || p.phase !== "fall") return false;
    var q = R.turned(p.board, p.piece, dir);
    if (!q) return false;
    p.piece = q; if (p.ctl !== "cpu") sndTurn();
    return true;
  }
  function hardDrop(p) {
    if (!p.piece || p.phase !== "fall") return;
    p.piece = R.dropTo(p.board, p.piece);
    lockPiece(p);
  }
  function lockPiece(p) {
    var ok = R.lock(p.board, p.piece);
    p.piece = null; p.capsules++; p.soft = false;
    sndLock();
    if (!ok) return lose(p);
    p.chainGerms = 0; p.chainRuns = 0; p.chainColors = []; p.fromJunk = false;
    lookForLines(p);
  }
  function lookForLines(p) {
    var rs = R.runs(p.board);
    if (rs.length) {
      p.clearing = rs; p.phase = "clear"; p.pt = 0;
      var seen = {};
      rs.forEach(function (r) { r.cells.forEach(function (i) { if (!seen[i]) { seen[i] = true; var cell = p.board[i]; p.pops.push({ i: i, c: r.c, g: !!(cell && cell.g), link: cell ? cell.link : "", t: 0 }); } }); });
      sndClear(p.chainRuns);
      return;
    }
    endCapsule(p);
  }
  function addPoints(p, before, after) {
    if (after <= before) return;
    p.score += R.points(after, speed) - R.points(before, speed);
    if (mode === "levels" || mode === "endless") bests[mode].submit(p.score);   // (kept the moment it's passed)
  }
  // a capsule's drop is over: junk out and in, the culture's growth, a cure
  function endCapsule(p) {
    var other = players.length > 1 ? players[1 - p.i] : null;
    if (other && !p.fromJunk) {
      var junk = R.junkFor(p.chainRuns, p.chainColors);
      if (junk.length) { other.junkIn = other.junkIn.concat(junk); }
    }
    if (!R.germsLeft(p.board) && mode !== "endless") return cured(p);
    if (p.junkIn.length) {
      R.dropJunk(p.board, p.junkIn.splice(0, 4), p.rnd);
      p.junkIn = [];
      p.fromJunk = true; p.chainGerms = 0; p.chainRuns = 0; p.chainColors = [];
      sndJunk();
      p.phase = "drop"; p.pt = 0;
      return;
    }
    if (mode === "endless") {
      if (!R.germsLeft(p.board)) {
        // a clean vial: a bonus, and the culture grows back at once
        p.score += R.BASE[speed] * 10; bests.endless.submit(p.score);
        p.sinceGrow = p.growEvery;
      }
      p.sinceGrow++;
      if (p.sinceGrow >= p.growEvery) {
        p.sinceGrow = 0; p.grows++;
        p.growEvery = Math.max(6, 12 - Math.floor(p.grows / 2));
        if (!R.growRow(p.board, p.rnd, 2 + Math.min(3, Math.floor(p.grows / 3)))) return lose(p);
      }
    }
    p.phase = "toss"; p.pt = 0;
  }
  function cured(p) {
    if (mode === "levels") {
      bests.cured.submit(p.level);
      sndCure();
      state = "cured";
      showEnd({ kind: "cured", p: p });
      return;
    }
    wins[p.i]++;
    sndCure();
    state = "over";
    showEnd({ kind: "won", p: p });
  }
  function lose(p) {
    p.lost = true; p.piece = null;
    sndOver();
    if (players.length > 1) { var other = players[1 - p.i]; wins[other.i]++; state = "over"; showEnd({ kind: "won", p: other, by: "overflow" }); return; }
    state = "over";
    showEnd({ kind: "over", p: p });
  }

  // ---- the CPU at the controls ------------------------------------------------------
  function cpuAct(p, dt) {
    var play = CPU_PLAY[cpuLevel];
    p.cpu.t += dt;
    if (!p.cpu.target) {
      var pl = R.plan(p.board, p.piece, p.rnd, play.loose);
      p.cpu.target = pl ? pl.target : R.dropTo(p.board, p.piece);
    }
    while (p.piece && p.phase === "fall" && p.cpu.t >= play.move) {
      p.cpu.t -= play.move;
      var r = R.reach(p.board, p.piece), path = R.pathTo(r, p.cpu.target);
      if (!path) { p.cpu.target = null; return; }
      if (!path.length) { lockPiece(p); return; }
      var s = path[0];
      if (s === "left") shift(p, -1, true); else if (s === "right") shift(p, 1, true);
      else if (s === "cw") turn(p, 1); else if (s === "ccw") turn(p, -1);
      else { var d = R.moved(p.piece, 0, 1); if (R.fits(p.board, d)) { p.piece = d; p.fallT = 0; } else lockPiece(p); }
    }
  }

  // ---- keys --------------------------------------------------------------------------
  // one player: arrows move and fall faster, Z and X turn, Space drops.
  // Two at one keyboard: the left vial on the letters, the right on the arrows.
  var KEYMAPS = {
    solo: { arrowleft: "left", arrowright: "right", arrowdown: "soft", " ": "hard", z: "ccw", x: "cw" },
    p1: { a: "left", d: "right", s: "soft", w: "hard", q: "ccw", e: "cw" },
    p2: { arrowleft: "left", arrowright: "right", arrowdown: "soft", arrowup: "hard", ",": "ccw", ".": "cw" }
  };
  function actFor(e) {
    var k = (e.key || "").toLowerCase();
    if (mode === "duo") {
      if (KEYMAPS.p1[k]) return { p: players[0], act: KEYMAPS.p1[k] };
      if (KEYMAPS.p2[k]) return { p: players[1], act: KEYMAPS.p2[k] };
      return null;
    }
    return KEYMAPS.solo[k] ? { p: players[0], act: KEYMAPS.solo[k] } : null;
  }
  function press(p, act) {
    if (!p || p.ctl === "cpu" || p.lost) return;
    if (act === "left" || act === "right") { var dir = act === "left" ? -1 : 1; shift(p, dir); p.das = { dir: dir, t: 0 }; }
    else if (act === "cw") turn(p, 1);
    else if (act === "ccw") turn(p, -1);
    else if (act === "soft") {
      // (the time already waited toward the next row is cut to the fast
      // fall's: kept whole, it was spent at once, several rows in a frame)
      if (!p.soft) p.fallT = Math.min(p.fallT, SOFT_T * 0.5);
      p.soft = true;
    }
    else if (act === "hard") hardDrop(p);
  }
  function release(p, act) {
    if (!p) return;
    if ((act === "left" && p.das.dir === -1) || (act === "right" && p.das.dir === 1)) p.das = { dir: 0, t: 0 };
    if (act === "soft") p.soft = false;
  }
  function paused() { return P.isPaused(); }

  // the end card's keys wait a moment (Space drops a capsule in play: one
  // pressed as the card comes up must not skip it)
  document.addEventListener("keydown", function (e) {
    if ((state === "over" || state === "cured") && (e.key === " " || e.key === "Enter") && performance.now() - overAt < 700) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener("keydown", function (e) {
    if (state !== "play" || e.ctrlKey || e.metaKey || e.altKey || paused()) return;
    if (window.GameShell && GameShell.asking && GameShell.asking()) return;
    var a = actFor(e);
    if (!a) return;
    e.preventDefault();
    if (e.repeat) return;
    press(a.p, a.act);
  });
  document.addEventListener("keyup", function (e) {
    if (state !== "play") return;
    var a = actFor(e);
    if (a) release(a.p, a.act);
  });
  window.addEventListener("blur", function () { players.forEach(function (p) { p.soft = false; p.das = { dir: 0, t: 0 }; }); });

  // the touch pad: the same moves for the one vial a phone plays
  Array.prototype.forEach.call(document.querySelectorAll("#pad button"), function (b) {
    var act = b.getAttribute("data-act");
    b.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      if (state !== "play" || paused()) return;
      b.classList.add("down");
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      press(players[0], act);
    });
    function up() { b.classList.remove("down"); release(players[0], act); }
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("lostpointercapture", up);
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  });

  // ---- pause, leaving -------------------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    // the card's buttons: this run again from its start, or back to the modes
    restart: function () { startRun(false); },
    menu: toMenu,
    onChange: function (on) {
      document.body.classList.toggle("paused", !!on);
      players.forEach(function (p) { p.soft = false; p.das = { dir: 0, t: 0 }; });
    }
  }) : { isPaused: function () { return false; } };
  // leaving asks first once a capsule has gone in (paused or not)
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && players.some(function (p) { return p.capsules > 0; }); },
    pausable: P
  });

  // ---- the menu ------------------------------------------------------------------------------
  function paintMenu() {
    Array.prototype.forEach.call(document.querySelectorAll("#modes button"), function (b) {
      var v = b.getAttribute("data-v");
      b.classList.toggle("on", v === mode);
      b.setAttribute("aria-pressed", v === mode ? "true" : "false");
      if (v === "duo") b.disabled = TOUCH;
    });
    $("lvl").textContent = level;
    $("speed-v").textContent = SPEED_NAMES[speed];
    $("cpu-v").textContent = CPU_NAMES[cpuLevel];
    $("opt-cpu").hidden = mode !== "cpu";
    // (Endless has no level to pick: it starts small and grows)
    $("level-pick").style.visibility = mode === "endless" ? "hidden" : "";
    $("lvl-down").disabled = $("lvl-up").disabled = mode === "endless";
    var parts = [];
    if (bests.levels.get()) parts.push("Levels " + bests.levels.get());
    if (bests.endless.get()) parts.push("Endless " + bests.endless.get());
    var cur = bests.cured.get();
    $("bests").textContent = parts.length ? "best: " + parts.join(" · ") + (cur ? " · cured up to level " + cur : "") : "no cures on the record yet";
  }
  function setMode(v) { if (v === "duo" && TOUCH) return; mode = v; store.set("drmr_mode", mode); paintMenu(); layout(); }
  function setLevel(v) { level = clamp(v, 0, 20); store.set("drmr_level", String(level)); paintMenu(); layout(); }
  Array.prototype.forEach.call(document.querySelectorAll("#modes button"), function (b) {
    b.addEventListener("click", function () { setMode(b.getAttribute("data-v")); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });   // (a click keeps no focus: Enter then starts)
  });
  $("lvl-down").addEventListener("click", function () { setLevel(level - 1); });
  $("lvl-up").addEventListener("click", function () { setLevel(level + 1); });
  $("opt-speed").addEventListener("click", function () { var k = ["low", "med", "hi"]; speed = k[(k.indexOf(speed) + 1) % 3]; store.set("drmr_speed", speed); paintMenu(); });
  $("opt-cpu").addEventListener("click", function () { var k = ["easy", "normal", "hard"]; cpuLevel = k[(k.indexOf(cpuLevel) + 1) % 3]; store.set("drmr_cpu", cpuLevel); paintMenu(); });
  ["lvl-down", "lvl-up", "opt-speed", "opt-cpu", "play"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });
  $("play").addEventListener("click", function () { wins = [0, 0]; startRun(false); });
  $("again").addEventListener("click", function () { if (state === "cured") nextLevel(); else startRun(false); });
  $("to-menu").addEventListener("click", toMenu);
  if (window.GameShell && GameShell.menuKeys) {
    GameShell.menuKeys({
      active: function () { return state === "menu"; },
      groups: [
        { sel: "#modes button", keys: ["1", "2", "3", "4"], into: "b" },
        { sel: "#lvl-down, #lvl-up", keys: ["arrowleft", "arrowright"] },
        { sel: "#opt-speed", keys: ["s"] },
        { sel: "#opt-cpu", keys: ["c"] }
      ],
      start: "#play", space: true
    });
    GameShell.menuKeys({
      active: function () { return state === "over" || state === "cured"; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }],
      start: "#again", space: true
    });
  }

  // the end of a run, a round or a level
  function showEnd(r) {
    lastResult = r;
    players.forEach(function (q) { q.pops = []; });   // (the clears' rings are done with)
    var p = r.p, title, msg, stats = [];
    if (r.kind === "cured") {
      title = "Level " + p.level + " cured!";
      msg = p.score.toLocaleString("en-US");
      stats.push(p.capsules + " capsule" + (p.capsules === 1 ? "" : "s"));
      $("again").textContent = "Next level";
    } else if (r.kind === "over") {
      title = mode === "endless" ? "The culture won" : "The vial filled up";
      msg = p.score.toLocaleString("en-US");
      stats.push(mode === "endless" ? p.grows + " growth" + (p.grows === 1 ? "" : "s") + " held back" : "level " + p.level);
      $("again").textContent = "Again";
    } else {
      // p won the round, by curing first or by the other's vial filling up:
      // the card says who won outright, then why, then the rounds so far
      var vs = mode === "cpu", loser = 1 - p.i;
      title = vs ? (p.i === 0 ? "You win!" : "The CPU wins") : "Player " + (p.i + 1) + " wins!";
      var why = r.by === "overflow"
        ? (vs ? (loser === 0 ? "your vial filled to the neck" : "the CPU's vial filled to the neck") : "Player " + (loser + 1) + "'s vial filled to the neck")
        : (vs ? (p.i === 0 ? "you cured your vial first" : "the CPU cured its vial first") : "Player " + (p.i + 1) + " cured their vial first");
      msg = (vs ? "You " : "P1 ") + wins[0] + " : " + wins[1] + (vs ? " CPU" : " P2");
      stats.push(why);
      $("again").textContent = "Next round";
    }
    $("over-title").textContent = title;
    $("over-msg").textContent = msg;
    var box = $("over-stats"); box.replaceChildren();
    stats.forEach(function (s) { var e = document.createElement("span"); e.textContent = s; box.appendChild(e); });
    if (mode === "levels" || mode === "endless") {
      var b = bests[mode].get(), e2 = document.createElement("span");
      var record = p.score > 0 && p.score >= b;
      e2.className = "best" + (record ? " record" : "");
      e2.textContent = record ? "a new best!" : "best: " + b.toLocaleString("en-US");
      box.appendChild(e2);
    }
    $("over").hidden = false;
    overAt = performance.now();
    paintHud(true);
  }

  // ---- the charts and the keys under the vials -------------------------------------------
  var hudCache = {};
  function setText(id, v) { v = String(v); if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function germCounts(b) { var n = [0, 0, 0]; b.forEach(function (c) { if (c && c.g) n[c.c]++; }); return n; }
  function paintHud(force) {
    if (force) hudCache = {};
    var on = state !== "menu" && players.length;
    var c0 = $("chart0"), c1 = $("chart1");
    c0.hidden = !on; c1.hidden = !(on && players.length > 1);
    if (!on) return;
    var p0 = players[0], solo = players.length === 1;
    setText("who0", solo ? "Your chart" : mode === "cpu" ? "You" : "Player 1");
    setText("score0", p0.score.toLocaleString("en-US"));
    setText("best0", (bests[mode] ? bests[mode].get() : 0).toLocaleString("en-US"));
    setText("level0", mode === "endless" ? "+" + p0.grows : p0.level);
    setText("speed0", SPEED_NAMES[speed]);
    setText("germs0", R.germsLeft(p0.board));
    setText("wins0", wins[0]);
    c0.querySelector(".row-best").hidden = !solo;
    c0.querySelector(".row-score").hidden = !solo;
    c0.querySelector(".row-speed").hidden = !solo || c0.classList.contains("strip");
    c0.querySelector(".row-wins").hidden = solo;
    c0.querySelector(".row-level").querySelector("dt").textContent = mode === "endless" ? "Grown" : "Level";
    if (players.length > 1) {
      setText("who1", mode === "cpu" ? "CPU" : "Player 2");
      setText("germs1", R.germsLeft(players[1].board));
      setText("wins1", wins[1]);
    }
  }

  // ---- where everything goes ----------------------------------------------------------------
  /* A vial in cells: the band above its shoulders (Dr. Mr. and the neck)
     2.5 tall, the glass 16 rows and its foot, the stage under it 1.6.
     So 20.45 cells tall. Across: the 8 columns, the glass walls (0.4 a
     side) and the stage's ends past them (0.25 a side), 9.3. */
  var BAND = 2.5, FOOT = 0.35, STAGE = 1.6, TALL = BAND + H + FOOT + STAGE, WIDE = W + 1.3, LIP = 0.65;
  var views = [];
  function layout() {
    if (!VW) return;
    // (under the vials: a keyboard's key line, two lines for two players' narrower vials)
    // A short, wide screen (a phone on its side): the vials stand from near
    // the top, between the corner buttons, and the pad splits to the bottom
    // corners, beside them rather than under them.
    var wide = VW >= 640, short = wide && VH < 500;
    var top = short ? 10 : 64, keysUnder = TOUCH ? 0 : mode === "duo" && state !== "menu" ? 50 : 28;
    var padH = TOUCH && state === "play" && !short ? 74 : 0;
    var n = state === "menu" || !players.length ? 1 : players.length;
    $("pad").classList.toggle("split", short);
    views = [];
    var stripH = 0, c, gap;
    if (n === 1) {
      if (wide) {
        c = Math.min(46, (VH - top - keysUnder - padH - 16) / TALL, (VW - 2 * (150 + 30)) / WIDE);
        var x0 = (VW - WIDE * c) / 2;
        views.push({ c: c, x: x0, y: top + 4 });
      } else {
        stripH = 44;
        c = Math.min(44, (VH - top - stripH - keysUnder - padH - 10) / TALL, (VW - 16) / WIDE);
        views.push({ c: c, x: (VW - WIDE * c) / 2, y: top + stripH });
      }
    } else if (wide) {
      stripH = 40; gap = 46;
      c = Math.min(40, (VH - top - stripH - keysUnder - padH - 12) / TALL, (VW - gap - 32) / (2 * WIDE));
      var tw = 2 * WIDE * c + gap, xs = (VW - tw) / 2;
      views.push({ c: c, x: xs, y: top + stripH }, { c: c, x: xs + WIDE * c + gap, y: top + stripH });
    } else {
      // a phone: your vial at full size, the other's at half, side by side
      stripH = 40; gap = 10;
      c = Math.min(40, (VH - top - stripH - keysUnder - padH - 10) / TALL, (VW - 16 - gap) / (1.5 * WIDE));
      var c2 = c / 2, tw2 = WIDE * c + gap + WIDE * c2, xs2 = (VW - tw2) / 2;
      views.push({ c: c, x: xs2, y: top + stripH }, { c: c2, x: xs2 + WIDE * c + gap, y: top + stripH });
    }
    views.forEach(function (v) {
      v.ix = v.x + LIP * v.c;                    // the inside of the glass, row 0's top left
      v.iy = v.y + BAND * v.c;
      v.iw = W * v.c; v.ih = H * v.c;
    });
    players.forEach(function (p, i) { p.view = views[i] || views[0]; });
    placeHud(n, wide, stripH);
    placeField(wide);
  }

  /* The eyepiece's view: the slide lit in a circle, its lens ring round it.
     The circle centres on the vials and always holds the whole of them,
     stage and all, so the ring passes outside them, never under or over a
     vial. On a wide screen it is at least the screen's height across; on a
     narrow one it runs past the screen's sides.
     The maker's line is engraved round the ring's top where that stretch
     is on the screen and clear of the vials, the charts, the keys and the
     corner buttons; elsewhere it stays on the stage under each vial. */
  var field = null;
  function placeField(wide) {
    if (!views.length) { field = null; return; }
    var L = Infinity, Rt = -Infinity, T = Infinity, B = -Infinity;
    views.forEach(function (v) { L = Math.min(L, v.x); Rt = Math.max(Rt, v.x + WIDE * v.c); T = Math.min(T, v.y); B = Math.max(B, v.y + TALL * v.c); });
    var f = {}, m = Math.min(VW, VH);
    f.rw = clamp(m * 0.024, 12, 18);
    f.cx = (L + Rt) / 2; f.cy = (T + B) / 2;
    var hold = Math.sqrt(Math.pow((Rt - L) / 2, 2) + Math.pow((B - T) / 2, 2)) + 6;   // (to the vials' far corners)
    f.R = Math.max(wide ? m / 2 - f.rw - 3 : VW / 2 + 30, hold);
    f.size = clamp(f.rw * 0.7, 9.5, 12.5);
    g.font = "600 " + f.size.toFixed(1) + "px Lexend, sans-serif";
    f.track = f.size * 0.16; f.ws = []; f.total = 0;
    for (var i = 0; i < MARK.length; i++) { f.ws.push(g.measureText(MARK[i]).width); f.total += f.ws[i]; }
    f.total += f.track * (MARK.length - 1);
    var mid = f.R + f.rw / 2, half = f.total / 2, sag = mid - Math.sqrt(Math.max(0, mid * mid - half * half));
    var box = { l: f.cx - half - 4, r: f.cx + half + 4, t: f.cy - mid - f.size * 0.75, b: f.cy - mid + f.size * 0.75 + sag };
    var hit = function (a, b) { return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t; };
    var clear = box.t >= 0 && box.l >= 0 && box.r <= VW;
    views.forEach(function (v) { if (hit(box, { l: v.x, r: v.x + WIDE * v.c, t: v.y, b: v.y + TALL * v.c })) clear = false; });
    Array.prototype.forEach.call(document.querySelectorAll(".nav-back-games, .gs-corner button, #chart0, #chart1, .legend"), function (e) {
      if (e.hidden || e.closest("[hidden]")) return;
      var r = e.getBoundingClientRect();
      if (r.width && hit(box, { l: r.left, r: r.right, t: r.top, b: r.bottom })) clear = false;
    });
    f.ring = clear; f.box = box;
    field = f;
  }
  // a few cells drifting out of focus across the slide (held where they are
  // with Visual FX off: they drift on the idle clock)
  var CELLS = (function () {
    var r = R.mulberry(4177), out = [];
    for (var i = 0; i < 16; i++) out.push({ u: r() * 2 - 1, w: r() * 2 - 1, s: 0.04 + r() * 0.1, ph: r() * 6.28, sp: 0.6 + r() * 0.8, lilac: r() < 0.45 });
    return out;
  })();
  function drawField() {
    var f = field; if (!f) return;
    var t = idle;
    g.save();
    g.beginPath(); g.arc(f.cx, f.cy, f.R, 0, 7); g.clip();
    var lg = g.createRadialGradient(f.cx, f.cy - f.R * 0.12, f.R * 0.05, f.cx, f.cy, f.R);
    lg.addColorStop(0, "#fbfefd"); lg.addColorStop(0.65, "#e5f2ee"); lg.addColorStop(1, "#c3dbd5");
    g.fillStyle = lg; g.fillRect(f.cx - f.R, f.cy - f.R, 2 * f.R, 2 * f.R);
    CELLS.forEach(function (q) {
      // (a slow wander, each cell at its own pace: about a fiftieth of the field a second)
      var x = f.cx + (q.u * 0.82 + Math.sin(t * 0.3 * q.sp + q.ph) * 0.07) * f.R, y = f.cy + (q.w * 0.82 + Math.cos(t * 0.23 * q.sp + q.ph * 1.3) * 0.07) * f.R, r = q.s * f.R;
      var col = q.lilac ? "150,120,190" : "60,150,135";
      g.fillStyle = "rgba(" + col + ",0.09)"; g.strokeStyle = "rgba(" + col + ",0.22)"; g.lineWidth = Math.max(1, r * 0.06);
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "rgba(" + col + ",0.15)";
      g.beginPath(); g.arc(x + r * 0.25, y - r * 0.2, r * 0.32, 0, 7); g.fill();
    });
    var vg = g.createRadialGradient(f.cx, f.cy, f.R * 0.72, f.cx, f.cy, f.R);
    vg.addColorStop(0, "rgba(10,20,22,0)"); vg.addColorStop(1, "rgba(10,20,22,0.3)");
    g.fillStyle = vg; g.fillRect(f.cx - f.R, f.cy - f.R, 2 * f.R, 2 * f.R);
    g.restore();
    // the lens ring: gunmetal, a brass bevel on its inner edge, a glint on its outer
    var mid = f.R + f.rw / 2;
    g.lineWidth = f.rw; g.strokeStyle = "#23292d"; g.beginPath(); g.arc(f.cx, f.cy, mid, 0, 7); g.stroke();
    g.lineWidth = 2; g.strokeStyle = "#b8954a"; g.beginPath(); g.arc(f.cx, f.cy, f.R + 1, 0, 7); g.stroke();
    g.lineWidth = 1; g.strokeStyle = "rgba(255,255,255,0.14)"; g.beginPath(); g.arc(f.cx, f.cy, f.R + f.rw - 0.5, 0, 7); g.stroke();
    if (!f.ring) return;
    // the maker's line round its top, a letter at a time along the arc
    g.font = "600 " + f.size.toFixed(1) + "px Lexend, sans-serif";
    g.fillStyle = "#e2c27a"; g.textAlign = "center"; g.textBaseline = "middle";
    var a = -Math.PI / 2 - (f.total / 2) / mid;
    for (var i = 0; i < MARK.length; i++) {
      var th = a + (f.ws[i] / 2) / mid;
      g.save(); g.translate(f.cx + mid * Math.cos(th), f.cy + mid * Math.sin(th)); g.rotate(th + Math.PI / 2);
      g.fillText(MARK[i], 0, f.size * 0.04); g.restore();
      a += (f.ws[i] + f.track) / mid;
    }
    g.textBaseline = "alphabetic";
    marks.push({ text: MARK, size: f.size, kind: "ring", x: f.box.l, y: f.box.t, w: f.box.r - f.box.l, h: f.box.b - f.box.t });
  }
  function placeHud(n, wide, stripH) {
    var c0 = $("chart0"), c1 = $("chart1"), v0 = views[0];
    var strip = n > 1 || !wide;
    c0.classList.toggle("strip", strip); c1.classList.toggle("strip", true);
    c1.classList.toggle("tight", !wide);
    if (!v0) return;
    // one vial on a wide screen: the chart stands beside it. Otherwise a
    // strip over each vial (one vial alone on a phone: the strip may run the
    // screen's width, its heading left off, the figures being plainly yours)
    $("who0").hidden = strip && n === 1;
    if (!strip) {
      // (beside the glass, level with its middle)
      c0.style.left = Math.round(v0.x + WIDE * v0.c + 20) + "px";
      c0.style.top = Math.round(v0.iy + Math.max(0, (v0.ih - c0.offsetHeight) / 2)) + "px";
      c0.style.maxWidth = "";
    } else {
      c0.style.maxWidth = Math.round(n === 1 ? VW - 16 : WIDE * v0.c) + "px";
      var w0 = c0.offsetWidth || 0, mid = v0.x + WIDE * v0.c / 2;
      c0.style.left = Math.round(n === 1 ? clamp(mid - w0 / 2, 8, VW - 8 - w0) : v0.x) + "px";
      c0.style.top = Math.round(v0.y - stripH + 2) + "px";
    }
    if (views[1]) {
      c1.style.left = Math.round(views[1].x) + "px";
      c1.style.top = Math.round(views[1].y - stripH + 2) + "px";
      c1.style.maxWidth = Math.round(Math.max(WIDE * views[1].c, VW - views[1].x - 8)) + "px";
    }
    // the keys under each vial (a keyboard's); the pad under the one vial (a phone's)
    var l0 = $("legend0"), l1 = $("legend1"), pad = $("pad");
    var playing = state === "play" || state === "over" || state === "cured";
    l0.hidden = !(playing && !TOUCH); l1.hidden = !(playing && !TOUCH && mode === "duo");
    if (!l0.hidden) {
      l0.innerHTML = mode === "duo"
        ? keyLine([["A", "D", "move"], ["Q", "E", "turn"], ["S", "faster"], ["W", "drop"]])
        : keyLine([["&larr;", "&rarr;", "move"], ["Z", "X", "turn"], ["&darr;", "faster"], ["Space", "drop"]]);
      placeUnder(l0, v0);
    }
    if (!l1.hidden && views[1]) {
      l1.innerHTML = keyLine([["&larr;", "&rarr;", "move"], [",", ".", "turn"], ["&darr;", "faster"], ["&uarr;", "drop"]]);
      placeUnder(l1, views[1]);
    }
    pad.hidden = !(TOUCH && state === "play");
    if (!pad.hidden) {
      pad.style.left = "0px"; pad.style.right = "0px";
      pad.style.top = Math.round(VH - 66) + "px";
    }
  }
  // a key line: each keys-and-word item kept whole, so a line breaks between them
  function keyLine(items) {
    return items.map(function (it) {
      var word = it[it.length - 1], keys = it.slice(0, -1).map(function (k) { return "<kbd>" + k + "</kbd>"; }).join(" ");
      return "<span>" + keys + " " + word + "</span>";
    }).join(" · ");
  }
  function placeUnder(el, v) {
    // (one key line: as wide as the screen allows; two players' lines: each under its own vial)
    el.style.maxWidth = Math.round(mode === "duo" ? Math.max(WIDE * v.c + 20, 200) : VW - 16) + "px";
    var w = el.offsetWidth, cx = v.x + WIDE * v.c / 2;
    el.style.left = Math.round(clamp(cx - w / 2, 8, VW - w - 8)) + "px";
    el.style.top = Math.round(v.y + TALL * v.c + 2) + "px";
  }

  // ---- drawing ------------------------------------------------------------------------------
  var PAL = [
    { base: "#e5484d", dark: "#a7262b", light: "#ff9a9c" },
    { base: "#f2c230", dark: "#b8890c", light: "#fff0a8" },
    { base: "#3d7be0", dark: "#1f4ea0", light: "#a8c8fb" }
  ];
  var INK = "#17363a";

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* A germ: a fuzzy blob with a face. With Visual FX on, each germ does one
     of its colour's acts now and then, going through them in turn (an act
     every three to five seconds, on its own clock, resting between; the
     next act starts only when its cycle comes round, so none is cut off
     midway), and blinks now and then:
       red, cross (>:( and >:o):
         a puff: it swells, its brows drop, it shouts and shakes
         a stomp: crouch, hop, slam down flat, a puff of dust at its feet
         a tantrum spin: one furious turn, its fuzz flaring, and a huff
       yellow, too cool (:|), its shades on under level brows, a slow sway and a nod:
         a bubble of gum that swells and pops
         its shades pushed up above its eyes, a wink, and down again
         a glare: the shades slide down its face, it glares sideways over
           them, and pushes them back up
         a duck: squashed down low as if hiding, then up it pops, with a
           little sideways smile
         and now and then a glint across its shades
       blue, up to no good (>:] and >:D):
         a sly look one way and the other, then a snicker: the smirk opens
           into the laugh, the jaw bobbing with three little shakes
         an evil shimmy: a quick wiggle side to side, grinning wide
         a raspberry: eyes squeezed shut, its tongue out and wobbling, then
           back in to the smirk
     its fuzz rippling round it in a slow wave. A germ is a piece of the
     game, not the scenery behind it: with Visual FX off (turned off on the
     way too) it holds still on its first face. */
  function germBody(r, col, wavePh, moving, c, flare) {
    var p = PAL[col];
    g.strokeStyle = p.dark; g.lineWidth = Math.max(1, c * 0.05); g.lineCap = "round";
    g.beginPath();
    for (var k = 0; k < 12; k++) {
      var wave = moving ? Math.sin(wavePh - k * 0.9) : 0;
      var a = k / 12 * Math.PI * 2 + wave * 0.12, len = 1.2 + (moving ? 0.06 * wave : 0) + 0.35 * (flare || 0);
      g.moveTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
      g.lineTo(Math.cos(a) * r * len, Math.sin(a) * r * len);
    }
    g.stroke();
    var gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    gr.addColorStop(0, p.light); gr.addColorStop(0.55, p.base); gr.addColorStop(1, p.dark);
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  }
  function ease(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
  // 0 to 1 and back over [a, b], eased at both ends, held at 1 in between
  function envAt(f, a, b, edge) { return f < a || f > b ? 0 : f < a + edge ? ease((f - a) / edge) : f > b - edge ? ease((b - f) / edge) : 1; }
  function puffAt(x, y, rad, alpha) {
    g.fillStyle = "rgba(255,255,255," + (0.95 * alpha).toFixed(3) + ")";
    g.strokeStyle = "rgba(110,130,135," + (0.6 * alpha).toFixed(3) + ")"; g.lineWidth = Math.max(1, rad * 0.12);
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.stroke();
  }
  var ACTS = [3, 4, 3];
  // a germ's own clock: its time, its cycle's length, where it is in the
  // cycle (f, 0 to 1) and which act the cycle holds. The act changes only as
  // f comes back round to 0, where every act is at rest.
  function germCycle(col, phase, seed) {
    var ph = ((seed || 0) * 0.618034) % 1;
    var tg = clock + (phase || 0) * 0.6 + ph * 7.3, period = 3.2 + ph * 1.8;
    return { ph: ph, tg: tg, period: period, f: (tg % period) / period, act: (Math.floor(tg / period) + Math.floor(ph * 12)) % ACTS[col] };
  }
  function drawGerm(cx, cy, c, col, phase, seed) {
    var r = c * 0.4, p = PAL[col], moving = fx(), u = c / 40;
    var cyc = germCycle(col, phase, seed), ph = cyc.ph, tg = cyc.tg, period = cyc.period, f = cyc.f, act = cyc.act;
    var sx = 1, sy = 1, dx = 0, dy = 0, rot = 0, spin = 0, blink = false, lift = 0, grin = 0, brow = 0, shout = 0, look = 0, sn = 0;
    var gum = 0, popT = 0, pursed = false, wink = false, glint = -1, flare = 0, dust = -1, huff = -1;
    var glare = 0, smile = 0, squint = false, tongue = 0;
    if (moving) {
      blink = ((tg + ph * 5) % 5.3) < 0.13;
      if (col === 0) {
        if (act === 0) {
          var puff = f < 0.28 ? Math.pow(Math.sin(Math.PI * f / 0.28), 2) : 0;
          sx = 1 + 0.08 * puff; sy = 1 - 0.05 * puff;
          shout = puff; brow = puff;
          if (puff > 0.35) dx = Math.sin(tg * 50) * 0.022 * c;
        } else if (act === 1) {
          // the stomp: crouch, up, down flat, dust
          var crouch = envAt(f, 0.02, 0.16, 0.06), up = f >= 0.16 && f < 0.34 ? Math.sin(Math.PI * (f - 0.16) / 0.18) : 0;
          var slam = f >= 0.34 && f < 0.46 ? Math.sin(Math.PI * (f - 0.34) / 0.12) : 0;
          sx = 1 + 0.08 * crouch - 0.05 * up + 0.22 * slam; sy = 1 - 0.1 * crouch + 0.08 * up - 0.24 * slam;
          dy = -up * 0.16 * c;
          brow = envAt(f, 0.02, 0.62, 0.05);
          dust = f >= 0.34 && f < 0.62 ? (f - 0.34) / 0.28 : -1;
        } else {
          // the tantrum spin: a furious turn, fuzz flaring, then a huff
          var turn = f >= 0.04 && f < 0.32 ? ease((f - 0.04) / 0.28) : f >= 0.32 ? 1 : 0;
          spin = turn < 1 ? turn * Math.PI * 2 : 0;
          flare = f >= 0.04 && f < 0.32 ? Math.sin(Math.PI * (f - 0.04) / 0.28) : 0;
          brow = envAt(f, 0.02, 0.5, 0.05);
          huff = f >= 0.32 && f < 0.52 ? (f - 0.32) / 0.2 : -1;
          if (huff >= 0) { var hb = Math.sin(Math.PI * Math.min(1, huff * 2)); sy = 1 - 0.06 * hb; sx = 1 + 0.05 * hb; }
        }
      } else if (col === 1) {
        rot = Math.sin(tg * 1.4) * 0.09;
        dy = -Math.abs(Math.sin(tg * 1.4)) * 0.018 * c - Math.abs(Math.sin(tg * Math.PI * 1.2)) * 0.012 * c;
        if (act === 0) {
          gum = f < 0.3 ? ease(f / 0.3) : 0; pursed = f < 0.3;
          popT = f >= 0.3 && f < 0.37 ? (f - 0.3) / 0.07 : 0;
        } else if (act === 1) {
          lift = f < 0.1 ? 0 : f < 0.2 ? ease((f - 0.1) / 0.1) : f < 0.56 ? 1 : f < 0.66 ? 1 - ease((f - 0.56) / 0.1) : 0;
          wink = f > 0.32 && f < 0.42;
        } else if (act === 2) {
          // the glare: shades down its face, eyes sideways over them
          glare = envAt(f, 0.04, 0.6, 0.08);
          look = glare;
        } else {
          // the duck: down low, a moment, then up it pops and settles, smiling
          var down = envAt(f, 0.03, 0.4, 0.1), pop = f >= 0.4 && f < 0.52 ? Math.sin(Math.PI * (f - 0.4) / 0.12) : 0;
          sx = 1 + 0.18 * down - 0.06 * pop; sy = 1 - 0.32 * down + 0.16 * pop;
          dy = (dy - pop * 0.1 * c);
          smile = envAt(f, 0.42, 0.8, 0.06);
        }
        glint = act !== 2 && f > 0.72 && f < 0.84 ? (f - 0.72) / 0.12 : -1;
      } else {
        if (act === 0) {
          look = f < 0.1 ? -ease(f / 0.06) : f < 0.22 ? -1 + 2 * ease((f - 0.1) / 0.08) : f < 0.3 ? 1 - ease((f - 0.22) / 0.06) : 0;
          brow = f < 0.3 ? Math.sin(Math.PI * f / 0.3) : 0;
          grin = f < 0.32 ? 0 : f < 0.38 ? ease((f - 0.32) / 0.06) : f < 0.66 ? 1 : f < 0.74 ? 1 - ease((f - 0.66) / 0.08) : 0;
          sn = f >= 0.38 && f < 0.66 ? Math.abs(Math.sin((f - 0.38) / 0.28 * Math.PI * 3)) : 0;
          dy = -sn * 0.035 * c; sy = 1 - 0.04 * sn; sx = 1 + 0.03 * sn;
        } else if (act === 1) {
          // the evil shimmy: a wiggle side to side, a toothy grin, the eyes
          // and brows going with it
          var sh = envAt(f, 0.04, 0.5, 0.06), wig = Math.sin(tg * 20);
          grin = 0.55 * sh;
          dx = wig * 0.06 * c * sh; rot = wig * 0.11 * sh;
          look = wig * sh;
          brow = sh * (0.5 + 0.5 * Math.sin(tg * 10));
        } else {
          // the raspberry: eyes shut tight, tongue out and wobbling, back in
          tongue = envAt(f, 0.05, 0.55, 0.07);
          squint = tongue > 0.2;
          dx = Math.sin(tg * 34) * 0.012 * c * tongue;
        }
      }
    }
    // the stomp's dust, behind it: puffs kicked out from its feet either side
    if (dust >= 0) {
      for (var ds = -1; ds <= 1; ds += 2) {
        puffAt(cx + ds * r * (0.95 + 0.75 * dust), cy + r * 0.82 - dust * r * 0.25, r * (0.2 + 0.12 * dust), 1 - dust * dust);
        puffAt(cx + ds * r * (0.6 + 0.5 * dust), cy + r * 0.98, r * (0.16 + 0.08 * dust), 1 - dust * dust);
      }
    }
    g.save();
    // (squash and stretch from its foot, so a hop lands; a spin turns it
    // round its middle)
    g.translate(cx + dx, cy + dy + r); g.rotate(rot); g.scale(sx, sy); g.translate(0, -r); g.rotate(spin);
    // the fuzz (a slow ripple running round it, flaring in a tantrum) and the body
    germBody(r, col, tg * 3 + ph * 6, moving, c, flare);
    // the face
    g.fillStyle = INK; g.strokeStyle = INK; g.lineWidth = Math.max(1, 2.2 * u); g.lineCap = "round"; g.lineJoin = "round";
    var ex = 5.5 * u, ey = -2 * u;
    if (squint) {
      // eyes squeezed shut: > <
      g.beginPath();
      g.moveTo(-ex - 2.2 * u, ey - 2.2 * u); g.lineTo(-ex + 1.8 * u, ey); g.lineTo(-ex - 2.2 * u, ey + 2.2 * u);
      g.moveTo(ex + 2.2 * u, ey - 2.2 * u); g.lineTo(ex - 1.8 * u, ey); g.lineTo(ex + 2.2 * u, ey + 2.2 * u);
      g.stroke();
    }
    else if (blink) { g.fillRect(-ex - 2.4 * u, ey - 0.6 * u, 4.8 * u, 1.3 * u); g.fillRect(ex - 2.4 * u, ey - 0.6 * u, 4.8 * u, 1.3 * u); }
    else if (wink) {
      g.beginPath(); g.arc(-ex, ey, 2.3 * u, 0, 7); g.fill();
      g.beginPath(); g.moveTo(ex - 2.6 * u, ey + 0.4 * u); g.quadraticCurveTo(ex, ey - 1.8 * u, ex + 2.6 * u, ey + 0.4 * u); g.stroke();
    }
    else {
      var lx = look * 1.6 * u;
      g.beginPath(); g.arc(-ex + lx, ey, 2.3 * u, 0, 7); g.fill();
      g.beginPath(); g.arc(ex + lx, ey, 2.3 * u, 0, 7); g.fill();
    }
    if (col === 0) {               // red: long brows down hard toward the middle (the > of >:()
      var bd = brow * 1.6 * u;
      g.beginPath();
      g.moveTo(-10 * u, ey - 7 * u); g.lineTo(-3 * u, ey - 4 * u + bd);
      g.moveTo(10 * u, ey - 7 * u); g.lineTo(3 * u, ey - 4 * u + bd);
      g.stroke();
    } else if (col === 2) {        // blue: shorter brows, just over each eye, slanting in (the > of >:])
      var bb = -brow * 1.8 * u;
      g.beginPath();
      g.moveTo(-8.2 * u, ey - 6.4 * u + bb); g.lineTo(-3.6 * u, ey - 4.2 * u + bb);
      g.moveTo(8.2 * u, ey - 6.4 * u + bb); g.lineTo(3.6 * u, ey - 4.2 * u + bb);
      g.stroke();
    } else {
      // yellow: level brows over its shades; they show under the shades when
      // those are pushed up onto its head, and come down into a scowl for a glare
      var bo = ey - 6.2 * u + u * lift + 2 * u * glare, bi = ey - 6.2 * u + u * lift + 3 * u * glare;
      g.lineWidth = Math.max(1, 1.8 * u);
      g.beginPath();
      g.moveTo(-ex - 3 * u, bo); g.lineTo(-ex + 2.6 * u, bi);
      g.moveTo(ex + 3 * u, bo); g.lineTo(ex - 2.6 * u, bi);
      g.stroke();
      g.lineWidth = Math.max(1, 2.2 * u);
    }
    var my = 7 * u + 1.6 * u * glare;     // (a glare sets the mouth lower, clear of the shades)
    g.beginPath();
    if (col === 0) {
      if (shout < 0.35) { g.arc(0, my + 4 * u, 5 * u, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }        // >:(
      else { g.ellipse(0, my, (2.8 + 1.2 * shout) * u, (3 + 1.4 * shout) * u, 0, 0, 7); g.fill(); }        // >:o
    } else if (col === 1) {
      if (pursed) { g.arc(1.5 * u, my, 1.7 * u, 0, 7); g.fill(); }                                           // (blowing)
      else if (smile > 0) { g.moveTo(-5 * u, my); g.quadraticCurveTo(1 * u, my + 1.4 * u * smile, 5 * u, my - 2.2 * u * smile); g.stroke(); }   // (a sideways smile)
      else { g.moveTo(-5 * u, my); g.lineTo(5 * u, my); g.stroke(); }                                        // :|
      // its shades: over the eyes; pushed up above them; or slid down its face for a glare
      var sy2 = ey - 9.2 * u * lift + 4 * u * glare;
      g.fillStyle = "#1d2329";
      rr(-10 * u, sy2 - 2.7 * u, 8.6 * u, 5.4 * u, 2 * u); g.fill();
      rr(1.4 * u, sy2 - 2.7 * u, 8.6 * u, 5.4 * u, 2 * u); g.fill();
      g.fillRect(-1.8 * u, sy2 - 1.9 * u, 3.6 * u, 1.4 * u);
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.fillRect(-8.4 * u, sy2 - 1.6 * u, 2.2 * u, 1.1 * u); g.fillRect(3 * u, sy2 - 1.6 * u, 2.2 * u, 1.1 * u);
      // a glint running across the shades while they're on
      if (glint >= 0 && lift < 0.1) {
        var gx2 = -13 * u + 26 * u * glint;
        [-10, 1.4].forEach(function (lx0) {
          g.save(); rr(lx0 * u, sy2 - 2.7 * u, 8.6 * u, 5.4 * u, 2 * u); g.clip();
          g.fillStyle = "rgba(255,255,255,0.75)";
          g.beginPath(); g.moveTo(gx2, sy2 - 3 * u); g.lineTo(gx2 + 2.2 * u, sy2 - 3 * u); g.lineTo(gx2 - 0.8 * u, sy2 + 3 * u); g.lineTo(gx2 - 3 * u, sy2 + 3 * u); g.closePath(); g.fill();
          g.restore();
        });
      }
      // a bubble of gum, swelling from its lips; then the pop
      if (gum > 0) {
        var br = r * 0.62 * gum, bx = 1.5 * u + br * 0.15, by = my + br * 0.15;
        g.fillStyle = "#f59fc0"; g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
        g.strokeStyle = "#d9628f"; g.lineWidth = Math.max(1, 1.2 * u); g.stroke();
        g.fillStyle = "rgba(255,255,255,0.65)"; g.beginPath(); g.ellipse(bx - br * 0.35, by - br * 0.4, br * 0.22, br * 0.13, -0.6, 0, 7); g.fill();
      }
      if (popT > 0) {
        g.strokeStyle = "rgba(217,98,143," + (1 - popT).toFixed(3) + ")"; g.lineWidth = Math.max(1, 1.4 * u);
        g.beginPath();
        for (var pk = 0; pk < 6; pk++) {
          var pa = pk / 6 * Math.PI * 2, r1 = r * (0.25 + 0.3 * popT), r2 = r * (0.42 + 0.35 * popT);
          g.moveTo(1.5 * u + Math.cos(pa) * r1, my + Math.sin(pa) * r1); g.lineTo(1.5 * u + Math.cos(pa) * r2, my + Math.sin(pa) * r2);
        }
        g.stroke();
      }
    } else if (tongue > 0) {
      // the raspberry: lips in a small round, the tongue out and wobbling
      var tl = (2 + 5.5 * tongue) * u, tw = Math.sin(tg * 30) * 1.4 * u * tongue;
      g.fillStyle = "#e86f7c"; g.strokeStyle = "#b8434f"; g.lineWidth = Math.max(1, 1.1 * u);
      g.beginPath();
      g.moveTo(-2.8 * u, my - 0.5 * u); g.lineTo(-2.8 * u + tw * 0.3, my + tl - 2.4 * u);
      g.quadraticCurveTo(tw, my + tl + 1.6 * u, 2.8 * u + tw * 0.3, my + tl - 2.4 * u); g.lineTo(2.8 * u, my - 0.5 * u); g.closePath();
      g.fill(); g.stroke();
      g.strokeStyle = "#b8434f"; g.beginPath(); g.moveTo(tw * 0.5, my + 0.5 * u); g.lineTo(tw * 0.7, my + tl - 2.8 * u); g.stroke();
      g.fillStyle = INK; g.beginPath(); g.ellipse(0, my - 0.8 * u, 4 * u, 1.6 * u, 0, 0, 7); g.fill();
    } else if (grin < 0.04) {
      g.moveTo(-6 * u, my); g.quadraticCurveTo(3.2 * u, my + 1.6 * u, 6.5 * u, my - 3 * u); g.stroke();      // >:] (one lopsided curve up into its corner)
    } else {
      // the jaw drops: a dark slit that widens to the laugh (>:D), the
      // smirk's raised corner settling level as it opens; the jaw bobs a
      // little with each snicker. The teeth run the whole top of the mouth,
      // the tongue shows once it is wide open.
      var lipY = my - 1.5 * u * grin, half = 6 * u, corner = 3 * u * Math.max(0, 1 - grin * 2);
      var depth = 6.4 * u * grin * (1 - 0.18 * sn);
      var mouth = function () { g.beginPath(); g.moveTo(-half, lipY); g.quadraticCurveTo(half * 0.5, lipY + corner * 0.55, half, lipY - corner); g.ellipse(0, lipY, half, depth, 0, 0, Math.PI); g.closePath(); };
      mouth(); g.fill();
      g.save(); mouth(); g.clip();
      if (depth > 3.2 * u) { g.fillStyle = "#e86f7c"; g.beginPath(); g.ellipse(0.6 * u, lipY + depth, 3.8 * u, 2.6 * u, 0, 0, 7); g.fill(); }
      g.fillStyle = "#fff"; g.fillRect(-half, lipY - corner - u, 2 * half, corner + u + Math.min(1.8 * u, depth * 0.45));
      g.restore();
    }
    g.restore();
    // the huff: two puffs blown out of the corners of its mouth, out past
    // its fuzz, shrinking as they go
    if (huff >= 0) {
      var hk = ease(huff), hmy = cy + 6 * u;
      for (var hs = -1; hs <= 1; hs += 2) puffAt(cx + hs * (6 + 18 * hk) * u, hmy - 5 * u * hk, (3 - 1.2 * hk) * u, huff < 0.7 ? 1 : (1 - huff) / 0.3);
    }
  }

  /* A germ cleared goes out in its own way, the same colour's act turned
     against it, its eyes crossed out (X X):
       red: swells and darkens, then bursts into a puff of steam that rises
       yellow: its shades fly off turning; it melts into a puddle and fades
       blue: spins away, shrinking, three stars circling its head
     over DEATH seconds (the clear itself still takes CLEAR_T: the act runs
     on as the board moves on). A capsule's half flashes, shrinks and rings.
     With Visual FX off, each holds one still pose, the hit (red puffed with
     steam over it, yellow's shades knocked askew, blue tipped with its
     stars), while the clear lasts, and is then gone. */
  var DEATH = 0.62;
  function xEyes(u) {
    g.strokeStyle = INK; g.lineWidth = Math.max(1, 2 * u); g.lineCap = "round";
    g.beginPath();
    [-5.5, 5.5].forEach(function (ex) {
      g.moveTo((ex - 2.3) * u, -4.3 * u); g.lineTo((ex + 2.3) * u, 0.3 * u);
      g.moveTo((ex + 2.3) * u, -4.3 * u); g.lineTo((ex - 2.3) * u, 0.3 * u);
    });
    g.stroke();
  }
  function star(x, y, s, alpha) {
    g.save(); g.globalAlpha *= alpha; g.translate(x, y);
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? s * 0.45 : s; g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    g.closePath();
    g.fillStyle = "#fff3b0"; g.fill(); g.strokeStyle = "rgba(23,54,58,0.6)"; g.lineWidth = Math.max(1, s * 0.15); g.stroke();
    g.restore();
  }
  function drawDyingGerm(cx, cy, c, col, t) {
    var r = c * 0.4, u = c / 40, moving = fx();
    var k = moving ? Math.min(1, t / DEATH) : 0;
    g.save(); g.translate(cx, cy);
    if (col === 0) {
      var swell = moving ? (k < 0.4 ? 1 + 0.35 * ease(k / 0.4) : 1.35 * (1 - ease((k - 0.4) / 0.35))) : 1.15;
      if (swell > 0.02) {
        g.save(); g.scale(swell, swell);
        germBody(r, 0, 0, false, c);
        g.fillStyle = "rgba(110,0,12," + (moving ? 0.35 * Math.min(1, k / 0.4) : 0.3).toFixed(3) + ")";
        g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
        xEyes(u);
        g.fillStyle = INK; g.beginPath(); g.ellipse(0, 7 * u, 3 * u, 3.6 * u, 0, 0, 7); g.fill();
        g.restore();
      }
      var st = moving ? Math.max(0, (k - 0.3) / 0.7) : 0.35;
      if (st > 0) for (var i = 0; i < 5; i++) {
        var a = -Math.PI / 2 + (i - 2) * 0.45, dist = r * (0.6 + 1.4 * st), pr = r * (0.22 + 0.25 * st);
        g.fillStyle = "rgba(236,242,242," + (0.92 * (1 - st * 0.85)).toFixed(3) + ")";
        g.beginPath(); g.arc(Math.cos(a) * dist, Math.sin(a) * dist - (moving ? r * 0.6 * st : 0), pr, 0, 7); g.fill();
      }
    } else if (col === 1) {
      var melt = moving ? ease(Math.max(0, (k - 0.15) / 0.85)) : 0.2;
      g.save();
      g.globalAlpha = moving ? 1 - Math.max(0, (k - 0.7) / 0.3) : 1;
      g.translate(0, r * melt * 0.8); g.scale(1 + 0.5 * melt, 1 - 0.75 * melt);
      germBody(r, 1, 0, false, c); xEyes(u);
      g.strokeStyle = INK; g.lineWidth = Math.max(1, 2 * u);
      g.beginPath(); g.moveTo(-5 * u, 7 * u); g.quadraticCurveTo(0, 5 * u, 5 * u, 8.5 * u); g.stroke();
      g.restore();
      var fly = moving ? ease(k / 0.8) : 0.18;
      g.save();
      g.globalAlpha = moving ? 1 - Math.max(0, (k - 0.6) / 0.4) : 1;
      g.translate(fly * r * 1.2, -r * 0.35 - fly * r * 1.6); g.rotate(moving ? fly * Math.PI * 1.5 : 0.45);
      g.fillStyle = "#1d2329";
      rr(-10 * u, -2.7 * u, 8.6 * u, 5.4 * u, 2 * u); g.fill();
      rr(1.4 * u, -2.7 * u, 8.6 * u, 5.4 * u, 2 * u); g.fill();
      g.fillRect(-1.8 * u, -1.9 * u, 3.6 * u, 1.4 * u);
      g.restore();
    } else {
      var spin = moving ? ease(k) : 0.06, sc = moving ? 1 - ease(Math.max(0, (k - 0.3) / 0.7)) : 1;
      if (sc > 0.02) {
        g.save(); g.rotate(spin * Math.PI * 3); g.scale(sc, sc);
        germBody(r, 2, 0, false, c); xEyes(u);
        g.strokeStyle = INK; g.lineWidth = Math.max(1, 2 * u);
        g.beginPath(); g.moveTo(-5 * u, 7 * u); g.quadraticCurveTo(-2.5 * u, 5 * u, 0, 7 * u); g.quadraticCurveTo(2.5 * u, 9 * u, 5 * u, 7 * u); g.stroke();
        g.restore();
      }
      var sa = moving ? k * Math.PI * 4 : 0.6, salpha = moving ? 1 - Math.max(0, (k - 0.65) / 0.35) : 1;
      for (var s2 = 0; s2 < 3; s2++) {
        var an = sa + s2 * 2.094;
        star(Math.cos(an) * r * 1.1, -r * 1.0 + Math.sin(an) * r * 0.34, r * 0.36, salpha);
      }
    }
    g.restore();
  }
  // a capsule's half cleared: a white flash, then it shrinks away in a ring
  function drawDyingHalf(v, q) {
    var c = v.c, x = q.i % W, y = Math.floor(q.i / W), px = v.ix + x * c, py = v.iy + y * c, moving = fx();
    var k = moving ? Math.min(1, q.t / DEATH) : 0, sc = moving ? 1 - ease(Math.max(0, (k - 0.25) / 0.6)) : 1;
    if (sc > 0.02) {
      g.save();
      g.translate(px + c / 2, py + c / 2); g.scale(sc, sc); g.translate(-c / 2, -c / 2);
      drawHalf(0, 0, c, q.c, q.link);
      g.fillStyle = "rgba(255,255,255," + (moving ? 0.6 * (1 - k) : 0.45).toFixed(3) + ")";
      g.beginPath(); g.arc(c / 2, c / 2, c * 0.46, 0, 7); g.fill();
      g.restore();
    }
    if (moving && k > 0.3) {
      g.strokeStyle = PAL[q.c].base; g.lineWidth = Math.max(1, c * 0.06); g.globalAlpha = Math.max(0, 1 - (k - 0.3) / 0.7);
      g.beginPath(); g.arc(px + c / 2, py + c / 2, c * (0.25 + 0.35 * (k - 0.3) / 0.7), 0, 7); g.stroke();
      g.globalAlpha = 1;
    }
  }

  // half a capsule: round on its own end, flat where it meets its partner
  function drawHalf(x, y, c, col, link) {
    var p = PAL[col], pad = c * 0.07, s = c - pad * 2, r = s / 2;
    var X = x + pad, Y = y + pad;
    // stretch the flat side to the cell's edge so the two halves meet
    var ext = { l: [x, Y, s + pad, s], r: [X, Y, s + pad, s], u: [X, y, s, s + pad], d: [X, Y, s, s + pad] }[link] || [X, Y, s, s];
    g.save();
    g.beginPath();
    if (!link) { g.arc(X + r, Y + r, r, 0, 7); }
    else {
      var bx = ext[0], by = ext[1], bw = ext[2], bh = ext[3];
      if (link === "r") { g.moveTo(bx + bw, by); g.lineTo(bx + r, by); g.arc(bx + r, by + r, r, -Math.PI / 2, Math.PI / 2, true); g.lineTo(bx + bw, by + bh); }
      else if (link === "l") { g.moveTo(bx, by); g.lineTo(bx + bw - r, by); g.arc(bx + bw - r, by + r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(bx, by + bh); }
      else if (link === "d") { g.moveTo(bx, by + bh); g.lineTo(bx, by + r); g.arc(bx + r, by + r, r, Math.PI, 0); g.lineTo(bx + bw, by + bh); }
      else { g.moveTo(bx, by); g.lineTo(bx, by + bh - r); g.arc(bx + r, by + bh - r, r, Math.PI, 0, true); g.lineTo(bx + bw, by); }
      g.closePath();
    }
    var gr = g.createLinearGradient(X, Y, X + s, Y + s);
    gr.addColorStop(0, p.light); gr.addColorStop(0.45, p.base); gr.addColorStop(1, p.dark);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = "rgba(23,54,58,0.55)"; g.lineWidth = Math.max(1, c * 0.035); g.stroke();
    // the gloss
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath(); g.ellipse(X + s * 0.36, Y + s * 0.3, s * 0.16, s * 0.09, -0.6, 0, 7); g.fill();
    g.restore();
  }

  // each germ keeps the clock it was first drawn with, so a germ pushed up
  // a row (Endless) carries on with its act instead of jumping to another
  var germSeeds = new WeakMap();
  function germSeed(cell, x, y) { if (!germSeeds.has(cell)) germSeeds.set(cell, y * W + x); return germSeeds.get(cell); }
  function drawCell(v, x, y, cell, phase) {
    var px = v.ix + x * v.c, py = v.iy + y * v.c;
    if (cell.g) drawGerm(px + v.c / 2, py + v.c / 2, v.c, cell.c, phase + cell.c * 0.33, germSeed(cell, x, y));
    else drawHalf(px, py, v.c, cell.c, cell.link);
  }

  // the vial on its stage, lit from below, the counting grid on its back glass
  function drawVial(v, p, demo) {
    var c = v.c, ix = v.ix, iy = v.iy, iw = v.iw, ih = v.ih;
    var gx = ix - 0.4 * c, gw = iw + 0.8 * c, gyBot = iy + ih + FOOT * c;
    var neckL = ix + 3 * c - 0.12 * c, neckR = ix + 5 * c + 0.12 * c, neckTop = iy - 1.15 * c, shoulder = iy - 0.55 * c;
    // the stage: a steel plate and its clips (the slide's light is the eyepiece's, drawField)
    var sx = gx - 0.25 * c, sw = gw + 0.5 * c, sy = gyBot + 0.1 * c, sh = STAGE * c * 0.8;
    var st = g.createLinearGradient(0, sy, 0, sy + sh);
    st.addColorStop(0, "#eef2f4"); st.addColorStop(0.4, "#c9d2d7"); st.addColorStop(1, "#8f9ba3");
    g.fillStyle = st; rr(sx, sy, sw, sh, c * 0.18); g.fill();
    g.strokeStyle = "#6f7c84"; g.lineWidth = 1; rr(sx + 0.5, sy + 0.5, sw - 1, sh - 1, c * 0.18); g.stroke();
    g.fillStyle = "#56636b";
    g.fillRect(gx + 0.2 * c, sy - 0.12 * c, 1.6 * c, 0.2 * c); g.fillRect(gx + gw - 1.8 * c, sy - 0.12 * c, 1.6 * c, 0.2 * c);
    if (!field || !field.ring) drawMark(v, sx, sy, sw, sh);
    // the back glass: pale, lit from under, ruled like a counting chamber
    var bg = g.createLinearGradient(0, iy, 0, iy + ih);
    bg.addColorStop(0, "rgba(214,238,232,0.72)"); bg.addColorStop(1, "rgba(238,252,255,0.92)");
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(gx, iy); g.lineTo(gx, gyBot - 0.5 * c); g.quadraticCurveTo(gx, gyBot, gx + 0.6 * c, gyBot);
    g.lineTo(gx + gw - 0.6 * c, gyBot); g.quadraticCurveTo(gx + gw, gyBot, gx + gw, gyBot - 0.5 * c); g.lineTo(gx + gw, iy);
    g.lineTo(neckR, shoulder); g.lineTo(neckR, neckTop); g.lineTo(neckL, neckTop); g.lineTo(neckL, shoulder); g.closePath();
    g.fill();
    g.strokeStyle = "rgba(35,120,105,0.16)"; g.lineWidth = 1;
    g.beginPath();
    for (var x = 1; x < W; x++) { g.moveTo(ix + x * c + 0.5, iy); g.lineTo(ix + x * c + 0.5, iy + ih); }
    for (var y = 1; y < H; y++) { g.moveTo(ix, iy + y * c + 0.5); g.lineTo(ix + iw, iy + y * c + 0.5); }
    g.stroke();
    g.strokeStyle = "rgba(35,120,105,0.28)";
    g.beginPath();
    for (var x4 = 0; x4 <= W; x4 += 4) { g.moveTo(ix + x4 * c - 1.5, iy); g.lineTo(ix + x4 * c - 1.5, iy + ih); g.moveTo(ix + x4 * c + 1.5, iy); g.lineTo(ix + x4 * c + 1.5, iy + ih); }
    for (var y4 = 0; y4 <= H; y4 += 4) { g.moveTo(ix, iy + y4 * c - 1.5); g.lineTo(ix + iw, iy + y4 * c - 1.5); g.moveTo(ix, iy + y4 * c + 1.5); g.lineTo(ix + iw, iy + y4 * c + 1.5); }
    g.stroke();
    // the contents
    var b = p ? p.board : demo, phase = p ? p.i * 0.5 : 0;
    var flash = p && p.phase === "clear" ? p.clearing : null, flashing = {};
    if (flash) flash.forEach(function (r) { r.cells.forEach(function (i) { flashing[i] = true; }); });
    for (var i = 0; i < b.length; i++) {
      if (!b[i] || flashing[i]) continue;
      drawCell(v, i % W, Math.floor(i / W), b[i], phase);
    }
    if (p && p.piece) R.cellsOf(p.piece).forEach(function (q) { drawHalf(ix + q.x * c, iy + q.y * c, c, q.c, q.link); });
    // the cleared, going out (with Visual FX off: a still pose while the clear lasts)
    if (p) p.pops.forEach(function (q) {
      if (!fx() && q.t >= CLEAR_T) return;
      if (q.g) drawDyingGerm(ix + (q.i % W + 0.5) * c, iy + (Math.floor(q.i / W) + 0.5) * c, c, q.c, q.t);
      else drawDyingHalf(v, q);
    });
    // the glass itself: walls, shoulders, the neck and its lip
    g.strokeStyle = "rgba(120,170,175,0.95)"; g.lineWidth = Math.max(2, c * 0.08); g.lineJoin = "round";
    g.beginPath();
    g.moveTo(neckL - 0.15 * c, neckTop); g.lineTo(neckL, neckTop + 0.1 * c); g.lineTo(neckL, shoulder); g.lineTo(gx, iy);
    g.lineTo(gx, gyBot - 0.5 * c); g.quadraticCurveTo(gx, gyBot, gx + 0.6 * c, gyBot);
    g.lineTo(gx + gw - 0.6 * c, gyBot); g.quadraticCurveTo(gx + gw, gyBot, gx + gw, gyBot - 0.5 * c);
    g.lineTo(gx + gw, iy); g.lineTo(neckR, shoulder); g.lineTo(neckR, neckTop + 0.1 * c); g.lineTo(neckR + 0.15 * c, neckTop);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = Math.max(1.5, c * 0.07);
    g.beginPath(); g.moveTo(gx + 0.18 * c, iy + 0.6 * c); g.lineTo(gx + 0.18 * c, iy + ih * 0.7); g.stroke();
  }

  // the maker's line engraved on the stage's front edge, where the lens ring
  // carries none (just Rx on a stage too small to read the rest)
  var marks = [];
  function drawMark(v, sx, sy, sw, sh) {
    var size = Math.min(15, Math.max(8, v.c * 0.36)), text = MARK;
    g.font = "600 " + size.toFixed(1) + "px Lexend, sans-serif";
    var w = g.measureText(text).width;
    while (w > sw - 12 && size > 8) { size -= 0.5; g.font = "600 " + size.toFixed(1) + "px Lexend, sans-serif"; w = g.measureText(text).width; }
    if (w > sw - 12) { text = "Rx"; w = g.measureText(text).width; }
    var tx = sx + sw / 2, ty = sy + sh * 0.58;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(255,255,255,0.7)"; g.fillText(text, tx, ty + 1);
    g.fillStyle = "#3f4b52"; g.fillText(text, tx, ty);
    marks.push({ text: text, size: size, kind: "stage", x: tx - w / 2, y: ty - size / 2, w: w, h: size });
  }

  // Dr. Mr. is a capsule himself: standing upright on the vial's left
  // shoulder by the neck, his top half mint (the second player's coral) with
  // his face on it: huge round glasses, cartoon eyes that blink now and then
  // with Visual FX on, brows, a smile, rosy cheeks. A short white lab coat
  // over his lower half opens in a V at his seam, a navy bow tie there,
  // buttons and pens in its pocket; stubby sleeves with round white gloves,
  // little legs in black shoes. One glove holds the next capsule up and
  // swings it into the neck as he tosses it. The CPU's vial has a steel
  // dispensing arm in his place. (Drawn in his own units, 46 to a cell.)
  function drawDoctor(v, p, demoPair) {
    var c = v.c, s = c / 46;
    var tossing = p && p.phase === "toss", k = tossing ? p.pt / TOSS : 0;
    var pair = p ? p.stream(p.n) : demoPair;
    if (p && p.ctl === "cpu") return drawArm(v, p, pair, k, tossing);
    var two = p && p.ctl === "p2", top = two ? ["#f6907f", "#f06f5a", "#c4473a"] : ["#5fcfae", "#23a487", "#157a63"];
    var fx0 = v.ix + 1.2 * c, fy0 = v.iy - 0.26 * c;           // (between his shoes, on the shoulder's glass)
    var swing = tossing ? Math.sin(Math.min(1, k * 1.4) * Math.PI / 2) : 0;
    var hx = 21 + 8 * swing, hy = -60 + 12 * swing;              // (the raised glove, in his units)
    var ink = "#1d3236", coat = "#fbfdfc";
    var lw = function (w) { g.lineWidth = Math.max(w, 1 / s); };
    // a round white cartoon glove, in his units
    var glove = function (x, y) {
      g.fillStyle = "#ffffff"; g.strokeStyle = ink; lw(1.1);
      g.beginPath(); g.arc(x, y, 3.8, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(x - 1.6, y - 1); g.lineTo(x - 1.6, y + 1.6); g.moveTo(x + 0.4, y - 1); g.lineTo(x + 0.4, y + 1.6); g.stroke();
    };
    g.save();
    g.translate(fx0, fy0); g.scale(s, s);
    g.lineJoin = "round"; g.lineCap = "round";
    // little legs and shoes
    g.strokeStyle = "#2b2f36"; lw(3.6);
    g.beginPath(); g.moveTo(-5.5, -13); g.lineTo(-6, -4); g.moveTo(5.5, -13); g.lineTo(6, -4); g.stroke();
    g.fillStyle = "#1f2328";
    g.beginPath(); g.ellipse(-7.5, -2.6, 5, 2.7, 0, 0, 7); g.ellipse(7.5, -2.6, 5, 2.7, 0, 0, 7); g.fill();
    // the hanging arm and its glove, behind the coat
    g.strokeStyle = coat; lw(6.5);
    g.beginPath(); g.moveTo(-14, -36); g.quadraticCurveTo(-20, -30, -20, -22); g.stroke();
    g.strokeStyle = ink; lw(1);
    g.beginPath(); g.moveTo(-17, -38.5); g.quadraticCurveTo(-23.6, -31, -23.3, -22); g.stroke();
    glove(-20, -19.5);
    // his capsule body: the mint top, round, down to the seam
    var bg = g.createLinearGradient(-15, 0, 15, 0);
    bg.addColorStop(0, top[0]); bg.addColorStop(0.5, top[1]); bg.addColorStop(1, top[2]);
    g.fillStyle = bg;
    g.beginPath(); g.moveTo(-15, -40); g.lineTo(-15, -56); g.arc(0, -56, 15, Math.PI, 0); g.lineTo(15, -40); g.closePath(); g.fill();
    g.strokeStyle = ink; lw(1.3); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.beginPath(); g.ellipse(-8.5, -62, 2.4, 5, -0.35, 0, 7); g.fill();
    // the lab coat over his lower half, open in a V at the seam
    g.fillStyle = coat; g.strokeStyle = ink; lw(1.2);
    g.beginPath();
    g.moveTo(-16, -42); g.lineTo(-17.5, -14); g.quadraticCurveTo(-17.5, -10, -13, -10); g.lineTo(13, -10);
    g.quadraticCurveTo(17.5, -10, 17.5, -14); g.lineTo(16, -42); g.lineTo(5.5, -42); g.lineTo(0, -33); g.lineTo(-5.5, -42); g.closePath();
    g.fill(); g.stroke();
    g.strokeStyle = "rgba(29,50,54,0.5)"; lw(1);
    g.beginPath(); g.moveTo(0, -33); g.lineTo(0, -10); g.moveTo(-14, -21); g.lineTo(-7, -21); g.moveTo(7, -21); g.lineTo(14, -21); g.stroke();
    g.fillStyle = "#b9c7cc";
    g.beginPath(); g.arc(2.6, -27, 1.1, 0, 7); g.arc(2.6, -16.5, 1.1, 0, 7); g.fill();
    g.fillStyle = "#3d7be0"; g.fillRect(-12.6, -24.5, 1.5, 3.6);
    g.fillStyle = "#e5484d"; g.fillRect(-10.4, -24, 1.5, 3.1);
    // the bow tie at his seam
    g.fillStyle = "#1f3a5a";
    g.beginPath(); g.moveTo(0, -39.5); g.lineTo(-6.5, -43.5); g.lineTo(-6.5, -35.5); g.closePath();
    g.moveTo(0, -39.5); g.lineTo(6.5, -43.5); g.lineTo(6.5, -35.5); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, -39.5, 2, 0, 7); g.fill();
    // his face: huge round glasses, eyes looking toward the neck, brows, a smile
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.beginPath(); g.arc(-6.4, -56, 6.3, 0, 7); g.arc(6.4, -56, 6.3, 0, 7); g.fill();
    var blink = fx() && (clock % 4.2) < 0.12;
    g.fillStyle = ink;
    if (blink) { g.fillRect(-9, -56.6, 5.4, 1.3); g.fillRect(3.8, -56.6, 5.4, 1.3); }
    else { g.beginPath(); g.arc(-5, -55.6, 2.2, 0, 7); g.arc(7.8, -55.6, 2.2, 0, 7); g.fill(); }
    g.strokeStyle = "#1d2329"; lw(1.8);
    g.beginPath(); g.arc(-6.4, -56, 6.3, 0, 7); g.moveTo(12.7, -56); g.arc(6.4, -56, 6.3, 0, 7); g.stroke();
    lw(1.3);
    g.beginPath(); g.moveTo(-10, -65.5); g.quadraticCurveTo(-6.4, -67.5, -3, -65.8); g.moveTo(3, -65.8); g.quadraticCurveTo(6.4, -67.5, 10, -65.5); g.stroke();
    g.fillStyle = "rgba(255,140,140,0.45)";
    g.beginPath(); g.arc(-11.2, -47.5, 2.2, 0, 7); g.arc(11.2, -47.5, 2.2, 0, 7); g.fill();
    g.strokeStyle = ink; lw(1.4);
    g.beginPath(); g.arc(0, -48.2, 3.6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    // the raised arm, its glove holding the capsule
    g.strokeStyle = coat; lw(6.5);
    g.beginPath(); g.moveTo(14, -36); g.quadraticCurveTo(22, -40, hx, hy + 3); g.stroke();
    g.strokeStyle = ink; lw(1);
    g.beginPath(); g.moveTo(17, -33); g.quadraticCurveTo(25.5, -38, hx + 3.2, hy + 3.5); g.stroke();
    glove(hx, hy);
    g.restore();
    drawHeld(v, p, pair, fx0 + hx * s, fy0 + hy * s, k, tossing);
  }
  function drawArm(v, p, pair, k, tossing) {
    var c = v.c, x0 = v.ix + 0.4 * c, y0 = v.iy - 0.2 * c;
    var hx = x0 + 2.2 * c + (tossing ? 0.4 * c * k : 0), hy = v.iy - 1.7 * c;
    g.strokeStyle = "#7d8a92"; g.lineWidth = Math.max(2, c * 0.22); g.lineCap = "round";
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 0.6 * c, hy); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = "#c9d2d7"; g.beginPath(); g.arc(x0 + 0.6 * c, hy, c * 0.2, 0, 7); g.fill();
    g.fillStyle = "#56636b"; g.fillRect(hx - c * 0.1, hy - c * 0.3, c * 0.2, c * 0.6);
    drawHeld(v, p, pair, hx + 0.3 * c, hy, k, tossing);
  }
  // the capsule in hand, or on its way into the neck
  function drawHeld(v, p, pair, hx, hy, k, tossing) {
    if (!pair) return;
    var c = v.c, tx = v.ix + 3 * c, ty = v.iy;
    if (!tossing) {
      var hc = c * 0.58;
      drawHalf(hx - hc * 0.55, hy - hc * 0.95, hc, pair[0], "r");
      drawHalf(hx + hc * 0.45, hy - hc * 0.95, hc, pair[1], "l");
      return;
    }
    // along an arc from the hand into the neck, growing to its full size
    var e = k, x = hx + (tx - hx) * e, y = hy + (ty - hy) * e - Math.sin(e * Math.PI) * c * 1.4;
    var size = c * (0.62 + 0.38 * e), spin = fx() ? (1 - e) * Math.PI * 2 : 0;
    g.save();
    g.translate(x + size, y + size / 2); g.rotate(spin); g.translate(-size, -size / 2);
    drawHalf(0, 0, size, pair[0], "r"); drawHalf(size, 0, size, pair[1], "l");
    g.restore();
  }

  // the count of each colour's germs left, on a little tray right of the neck
  function drawTray(v, b) {
    var c = v.c, n = germCounts(b), x = v.ix + 5.4 * c, y = v.iy - 1.25 * c, cc = c * 0.62;
    if (c < 14) return;
    g.fillStyle = "rgba(201,210,215,0.9)"; rr(x - 0.15 * c, y - 0.5 * c, 2.75 * c, 0.95 * c, 0.2 * c); g.fill();
    g.font = "700 " + Math.max(9, c * 0.32).toFixed(1) + "px Lexend, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle";
    for (var i = 0; i < 3; i++) {
      var gx = x + i * 0.88 * c + cc * 0.32;
      drawGerm(gx, y - 0.04 * c, cc, i, 0);
      g.fillStyle = INK; g.fillText(String(n[i]), gx + cc * 0.42, y + 0.12 * c);
    }
  }

  var demoBoard = R.makeGerms(5, 20251114), demoPair = [0, 2];
  function draw() {
    g.clearRect(0, 0, VW, VH);
    marks = [];
    drawField();
    if (state === "menu" || !players.length) {
      if (views[0]) { drawDoctor(views[0], null, demoPair); drawVial(views[0], null, demoBoard); drawTray(views[0], demoBoard); }
      return;
    }
    players.forEach(function (p) {
      var v = p.view; if (!v) return;
      drawDoctor(v, p);
      drawVial(v, p);
      drawTray(v, p.board);
      if (p.lost) {
        g.fillStyle = "rgba(23,54,58,0.35)"; g.fillRect(v.ix, v.iy, v.iw, v.ih);
      }
    });
  }

  // ---- the loop ----------------------------------------------------------------------------------
  var last = 0, held = false;     // (held: a test runs the clock by hand)
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (!P.isPaused() && !held) update(dt);
    draw();
    if (state === "play") paintHud(false);
  }
  window.addEventListener("resize", resize);
  resize();
  paintMenu();
  layout();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness reads and drives the vials through these
  function cellsOut(b) { return b.map(function (c) { return c ? (c.g ? "G" : "h") + c.c + (c.link || "") : ""; }); }
  window.DrMr = {
    state: function () { return state; },
    mode: function () { return mode; },
    setMode: setMode, setLevel: setLevel,
    start: function (m) { if (m) setMode(m); wins = [0, 0]; startRun(false); },
    toMenu: toMenu,
    players: function () {
      return players.map(function (p) {
        return { ctl: p.ctl, phase: p.phase, score: p.score, level: p.level, capsules: p.capsules, germs: R.germsLeft(p.board), lost: p.lost,
          piece: p.piece && { x: p.piece.x, y: p.piece.y, rot: p.piece.rot, a: p.piece.a, b: p.piece.b }, next: p.stream(p.n), junkIn: p.junkIn.slice(), grows: p.grows };
      });
    },
    board: function (i) { return cellsOut(players[i || 0].board); },
    // lay out a vial for a test: rows of strings, "." empty, r y b a germ, R Y B a loose half
    setBoard: function (i, rows) {
      var p = players[i || 0], b = R.emptyBoard();
      rows.forEach(function (row, y) {
        for (var x = 0; x < row.length && x < W; x++) {
          var ch = row[x], k = "rybRYB".indexOf(ch);
          if (k >= 0) b[R.idx(x, H - rows.length + y)] = { c: k % 3, g: k < 3, link: "" };
        }
      });
      p.board = b;
    },
    setNext: function (i, pairs) { var p = players[i || 0], list = pairs.slice(), base = p.stream; p.stream = function (n) { return n - p.n < list.length && n >= p.n ? list[n - p.n].slice() : base(n); }; },
    press: function (i, act) { press(players[i || 0], act); },
    release: function (i, act) { release(players[i || 0], act); },
    // run the game's clock by hand (a test holds the frames still first)
    step: function (dt, n) { for (var k = 0; k < (n || 1); k++) update(dt); draw(); },
    hold: function (on) { held = on !== false; },
    layout: function () { return views.map(function (v) { return { c: v.c, x: v.x, y: v.y, ix: v.ix, iy: v.iy, iw: v.iw, ih: v.ih }; }); },
    marks: function () { return marks.slice(); },
    // the germ at (x, y) in player i's vial: which act it is on, and where in its cycle
    germCycle: function (i, x, y) {
      var p = players[i || 0], cell = p && p.board[R.idx(x, y)];
      if (!cell || !cell.g) return null;
      var cyc = germCycle(cell.c, p.i * 0.5 + cell.c * 0.33, germSeed(cell, x, y));
      return { act: cyc.act, f: cyc.f, seed: germSeed(cell, x, y) };
    },
    faceFrame: function () { return fx() ? Math.floor(clock / 0.6) % 2 : 0; },
    idle: function () { return idle; },
    rules: R
  };
})();
