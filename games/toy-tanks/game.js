/* =====================================================================
   Toy Tanks: the page round the battle.

   The rules are engine.js (it knows nothing of the page), the drawing
   art.js, the missions levels.js. This file runs the clock, takes the keys,
   the mouse and the touch sticks, keeps the records, and walks a run
   through the missions.

   Records (each saved the moment it's earned): the most missions cleared
   and the most tanks destroyed in one run, counted from the mission the run
   starts on (any of them, picked on the menu) to its end.

   Keys: WASD or the arrows drive, the mouse aims, a click or Space fires,
   a right-click or E lays a mine, P pauses; on the menu ← → pick the
   mission to start from (held, they run on) and Space or Enter starts;
   on the end card Space or Enter plays again and Backspace is the menu. Esc leaves (asking first mid-run): the
   shared scripts.
   ===================================================================== */
(function () {
  "use strict";

  var E = window.ToyTanksEngine, A = window.ToyTanksArt, L = window.ToyTanksLevels, TOTAL = L.TOTAL;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var COLS = E.COLS, ROWS = E.ROWS;

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    getNum: function (k, f) { var v = parseFloat(this.get(k, "")); return isNaN(v) ? f : v; },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  function record(key) {
    if (window.GameShell && GameShell.best) return GameShell.best(key, { higher: true });
    return { get: function () { return store.getNum(key, 0); }, submit: function (v) { if (v > this.get()) { store.set(key, v); return true; } return false; } };
  }
  var bestCleared = record("toytanks_best_cleared"), bestKills = record("toytanks_best_kills");

  // ---- sound ------------------------------------------------------------------
  // (muting is the shared speaker button's: mute-toggle.js routes every context)
  var actx = null, noiseBuf = null;
  function audio() {
    try {
      if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
      if (actx && actx.state === "suspended") actx.resume();
    } catch (e) {}
    return actx;
  }
  function tone(freq, dur, type, vol, when, slide) {
    var a = audio(); if (!a) return;
    try {
      var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function noise(dur, vol, cutoff) {
    var a = audio(); if (!a) return;
    try {
      if (!noiseBuf) {
        noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      var src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
      src.buffer = noiseBuf; f.type = "lowpass"; f.frequency.setValueAtTime(cutoff || 900, t);
      f.frequency.exponentialRampToValueAtTime(80, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(a.destination); src.start(t); src.stop(t + dur + 0.05);
    } catch (e) {}
  }
  var SFX = {
    fire: function (fast) { if (fast) { noise(0.25, 0.12, 2400); tone(520, 0.2, "sawtooth", 0.04, 0, 180); } else { tone(300, 0.07, "square", 0.06, 0, 120); noise(0.08, 0.08, 1500); } },
    bounce: function () { tone(1100, 0.04, "triangle", 0.035); },
    spent: function () { noise(0.07, 0.05, 1200); },
    clash: function () { tone(1500, 0.06, "square", 0.04); tone(900, 0.08, "triangle", 0.04, 0.03); },
    mine: function () { tone(880, 0.06, "square", 0.04); tone(660, 0.06, "square", 0.04, 0.08); },
    tick: function () { tone(1480, 0.05, "square", 0.035); },        // a mine in its last stretch, with each blink
    trip: function () { tone(1900, 0.09, "square", 0.05); },         // a tank come near a mine: it goes off a moment later
    blast: function () { noise(0.7, 0.3, 700); tone(90, 0.5, "sine", 0.18, 0, 40); },
    dead: function (you) { noise(0.45, 0.22, you ? 500 : 1100); tone(you ? 160 : 240, 0.35, "sawtooth", 0.07, 0, 60); },
    won: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, "square", 0.05, i * 0.11); }); },
    lost: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.28, "triangle", 0.07, i * 0.2); }); },
    life: function () { [784, 988, 1175].forEach(function (f, i) { tone(f, 0.12, "square", 0.045, i * 0.08); }); },
    go: function () { tone(660, 0.1, "square", 0.05); tone(990, 0.16, "square", 0.05, 0.1); },
    over: function () { [330, 262, 220, 165].forEach(function (f, i) { tone(f, 0.32, "sawtooth", 0.06, i * 0.22); }); }
  };

  // ---- state --------------------------------------------------------------------
  var ui = "menu";               // menu | run | over
  var from = 1;                  // the mission this run started from
  var counts = true;             // this run sets records (a mission of your own doesn't)
  var before = { cleared: 0, kills: 0 };
  // the mission a run starts from, kept (any of them)
  var startAt = (function () { var v = store.get("toytanks_start", "1"); return Math.max(1, parseInt(v, 10) || 1); })();
  var st = null, begun = false;  // begun: a mission's under way (leaving asks from then on)
  var keys = {}, firePress = false, minePress = false;
  var aimPt = null;              // where the mouse points, in tiles (null: it hasn't)
  var stickMove = null, stickAim = null, aimAngle = null;
  var parts = [], shake = 0, clock = 0, overAt = 0;
  var canvas = $("arena"), g = canvas.getContext("2d"), back = document.createElement("canvas");
  var s = 28, fr = 14, sprites = null;
  function inRun() { return ui === "run" && !!st && begun && st.status !== "over" && st.status !== "done"; }

  // ---- the canvas: sized to the window -------------------------------------------
  // The arena has the window's height less everything else on the page,
  // measured (the lid with the HUD, and under the arena the sticks or how to
  // play), and the width less the gutters: as big as that leaves room for.
  // A touch screen on its side has the sticks beside the arena instead
  // (styles.css), so there it's the width they leave.
  var sideQuery = window.matchMedia ? window.matchMedia("(hover: none) and (orientation: landscape)") : null;
  function side() { return !!(sideQuery && sideQuery.matches); }
  var fitChrome = 0;
  function chrome() {
    var cs = getComputedStyle(document.body), pads = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    if (side()) return Math.ceil(pads + $("hint").offsetHeight + 10);
    return Math.ceil($("box").offsetHeight - canvas.offsetHeight + pads);
  }
  function sideRoom() {
    if (!side()) return 0;
    return Math.max($("move-stick").offsetWidth, $("hud").offsetWidth) + Math.max($("mine-btn").offsetWidth, $("aim-stick").offsetWidth) + 2 * 14;
  }
  function fit() {
    var roomW = Math.min(1040, document.documentElement.clientWidth - 16 - sideRoom());
    fitChrome = chrome();
    var roomH = Math.max(200, window.innerHeight - fitChrome);
    s = Math.max(10, Math.floor(Math.min(roomW / (COLS + 1), roomH / (ROWS + 1))));
    fr = Math.round(s / 2);
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = COLS * s + fr * 2, H = ROWS * s + fr * 2;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    back.width = canvas.width; back.height = canvas.height;
    sprites = { wood: A.blockSprite(s, false), cork: A.blockSprite(s, true) };
    paintBack();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // the mat, the rim and the holes: drawn once a mission (they never change)
  function paintBack() {
    var b = back.getContext("2d"), dpr = back.width / (COLS * s + fr * 2);
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.clearRect(0, 0, COLS * s + fr * 2, ROWS * s + fr * 2);
    b.save(); b.translate(fr, fr); A.mat(b, COLS * s, ROWS * s, s); b.restore();
    A.rim(b, COLS * s, ROWS * s, fr, s);
    if (!st) return;
    b.save(); b.translate(fr, fr);
    for (var i = 0; i < st.grid.length; i++) if (st.grid[i] === 3) A.hole(b, i % COLS, Math.floor(i / COLS), s);
    b.restore();
  }

  // ---- drawing ------------------------------------------------------------------------
  function render() {
    var W = COLS * s + fr * 2, H = ROWS * s + fr * 2, f = fx();
    g.save();
    g.clearRect(0, 0, W, H);
    if (shake > 0 && f) g.translate(Math.sin(clock / 23) * shake * s * 0.18, Math.cos(clock / 17) * shake * s * 0.14);
    g.drawImage(back, 0, 0, W, H);
    g.save(); g.translate(fr, fr);
    // on the mat: the blocks' shadows, tread marks, wrecks, mines
    g.fillStyle = "rgba(110, 72, 30, 0.2)";
    for (var bi = 0; bi < st.grid.length; bi++) if (st.grid[bi] === 1 || st.grid[bi] === 2) g.fillRect((bi % COLS) * s + s * 0.14, Math.floor(bi / COLS) * s + s * 0.1, s, s);
    st.tracks.forEach(function (k) { A.track(g, k.x, k.y, k.a, s, k.age); });     // (the white tank's too: they give it away)
    st.wrecks.forEach(function (w) { A.wreck(g, w.x, w.y, s, w.kind); });
    st.mines.forEach(function (m) { A.mine(g, m, s, E.TUNE.fuseMs - m.age, E.TUNE.mineWarnMs, clock); });
    // standing up: blocks, tanks and shells, nearest the bottom drawn last
    var list = [], i;
    for (i = 0; i < st.grid.length; i++) {
      var t = st.grid[i];
      if (t === 1 || t === 2) list.push({ y: Math.floor(i / COLS) + 1, k: 0, i: i, cork: t === 2 });
    }
    var tanks = [st.player].concat(st.enemies).filter(function (t) { return t.alive; });
    tanks.forEach(function (t) { list.push({ y: t.y + E.TANK_R, k: 1, t: t }); });
    st.shells.forEach(function (sh) { list.push({ y: sh.y + 0.1, k: 2, sh: sh }); });
    list.sort(function (a, b) { return a.y - b.y || a.k - b.k; });
    // (a white tank is seen on the mission card, before it fades; never again
    // that mission, a lost tank's end included)
    var showAll = st.status === "start";
    list.forEach(function (o) {
      if (o.k === 0) A.block(g, o.cork ? sprites.cork : sprites.wood, o.i % COLS, Math.floor(o.i / COLS), s);
      else if (o.k === 1) {
        // the white tank fades from sight once a mission is under way
        if (o.t.hidden && !showAll) return;
        A.tank(g, o.t, s, { fx: f, tread: o.t.tread || 0 });
      } else A.shell(g, o.sh, s, clock, f);
    });
    // effects: smoke, sparks, flashes (Visual FX on), then the blasts
    parts.forEach(function (p) {
      var a = p.fade ? p.fade.a0 * Math.max(0, 1 - (p.age - p.fade.t0) / (p.life - p.fade.t0)) : Math.max(0, 1 - p.age / p.life);
      if (p.t === "smoke") { g.fillStyle = "rgba(235, 228, 214, " + (0.5 * a).toFixed(3) + ")"; g.beginPath(); g.arc(p.x * s, p.y * s, s * (0.08 + 0.16 * (1 - a)), 0, Math.PI * 2); g.fill(); }
      else if (p.t === "spark") { g.fillStyle = "rgba(255, 210, 90, " + a.toFixed(3) + ")"; g.fillRect(p.x * s - 1.5, p.y * s - 1.5, 3, 3); }
      else if (p.t === "chip") { g.fillStyle = p.c; g.globalAlpha = a; g.fillRect(p.x * s - s * 0.06, p.y * s - s * 0.06, s * 0.12, s * 0.12); g.globalAlpha = 1; }
      else if (p.t === "flash") { g.fillStyle = "rgba(255, 236, 160, " + (0.85 * a).toFixed(3) + ")"; g.beginPath(); g.arc(p.x * s, p.y * s, s * 0.22 * (1.2 - a * 0.4), 0, Math.PI * 2); g.fill(); }
    });
    st.blasts.forEach(function (b) { A.blast(g, b, s, E.TUNE.blast, f); });
    // your aim
    var p = st.player;
    if (p.alive && st.status !== "won" && st.status !== "lost") {
      if (aimPt && !touchAim) A.aim(g, p, aimPt.x, aimPt.y, s, true);
      else if (stickAim) A.aim(g, p, p.x + Math.cos(p.turret) * 4.5, p.y + Math.sin(p.turret) * 4.5, s, false);
    }
    g.restore();
    g.restore();
  }
  var touchAim = false;     // the last aim came from a touch: no sight under the finger

  // ---- the HUD and the banner over the arena -------------------------------------------
  var hudKey = "";
  function hud() {
    $("h-mission").textContent = st.mi + 1;
    var left = E.enemiesLeft(st), all = E.enemyCount(st);
    $("h-left").textContent = left + " / " + all;
    $("h-kills").textContent = st.kills;
    var lives = Math.max(0, st.lives);
    if ($("h-lives").dataset.v !== String(lives)) {
      $("h-lives").dataset.v = lives;
      var html = "";
      for (var i = 0; i < Math.min(lives, 6); i++) html += A.badge("player", 18);
      $("h-lives").innerHTML = html + (lives > 6 ? "<b>+" + (lives - 6) + "</b>" : "");
      $("h-lives").setAttribute("aria-label", lives + (lives === 1 ? " life" : " lives"));
    }
    $("mine-btn").disabled = !(ui === "run" && st.status === "play" && st.player.alive && E.minesOf(st, st.player) < E.TUNE.playerMines);
    var key = $("hud").hidden + "|" + $("hud").textContent;
    if (key !== hudKey) { hudKey = key; if (chrome() !== fitChrome) { fit(); } }
  }
  var bannerText = "";
  function banner(html) {
    if (html === bannerText) return;
    bannerText = html;
    $("banner").innerHTML = html;
    $("banner").className = html ? "show" : "";
  }
  function missionCard() {
    var kinds = {}, order = [];
    st.enemies.forEach(function (e) { if (!kinds[e.kind]) { kinds[e.kind] = 0; order.push(e.kind); } kinds[e.kind]++; });
    banner('<span class="b-title">Mission ' + (st.mi + 1) + '</span><span class="b-line">Enemy tanks: ' + st.enemies.length + "</span>" +
      '<span class="b-kinds">' + order.map(function (k) { return '<span class="b-kind">' + A.badge(k, 22) + "<b>&times;" + kinds[k] + "</b></span>"; }).join("") + "</span>");
  }

  // ---- a run ----------------------------------------------------------------------------
  // (at: a mission to start from, for the tests; a click passes its event)
  function startRun(at) {
    audio();
    from = typeof at === "number" ? at : Math.min(startAt, TOTAL);
    counts = true;
    // (the records as the run starts: saved as they're passed, its end card
    // still knows which it beat)
    before = { cleared: bestCleared.get(), kills: bestKills.get() };
    // (the run's seed draws up the missions between the hand-made ones)
    var seed = (Math.random() * 4294967296) >>> 0;
    st = E.create(L.campaign(seed, E.rng), { seed: seed, start: from - 1 });
    st.wrecks = [];
    ui = "run"; begun = false; parts = []; shake = 0; overAt = 0;
    document.body.classList.add("run");
    keys = {}; firePress = minePress = false; stickMove = stickAim = null;
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false; $("h-lives").dataset.v = "";
    newMission();
    hud(); fit(); render();
  }
  function newMission() {
    st.wrecks = st.wrecks.filter(function (w) { return w.mi === st.mi; });
    paintBack();
    missionCard();
  }
  function finish(done) {
    ui = "over"; overAt = performance.now();
    if (counts) { bestCleared.submit(st.cleared); bestKills.submit(st.kills); }
    var mission = st.mi + 1, newCleared = counts && st.cleared > before.cleared, newKills = counts && st.kills > before.kills;
    banner("");
    $("over-title").textContent = done ? "Every mission cleared!" : "Game over";
    $("over-msg").textContent = done ? "All " + TOTAL + " missions" : "Mission " + mission;
    document.body.classList.remove("run");
    var tally = {}, order = [];
    (st.tally || []).forEach(function (k) { if (!tally[k]) { tally[k] = 0; order.push(k); } tally[k]++; });
    $("over-tally").innerHTML = order.length ? order.map(function (k) { return '<span class="b-kind">' + A.badge(k, 24) + "<b>&times;" + tally[k] + "</b></span>"; }).join("") : "";
    $("over-stats").textContent = st.kills + (st.kills === 1 ? " tank" : " tanks") + " destroyed, " + st.cleared + (st.cleared === 1 ? " mission" : " missions") + " cleared" + (from > 1 ? " from mission " + from : "") + ". " +
      (newKills && st.kills > 0 ? "A new best! " : "Best: " + bestKills.get() + ". ") + "Most cleared in a run: " + bestCleared.get() + (newCleared && st.cleared > 0 ? " (new)" : "") + ".";
    $("over").hidden = false;
    paintMenu();
  }
  function toMenu() {
    ui = "menu"; begun = false;
    document.body.classList.remove("run");
    // (behind the menu: the first hand-made mission, standing still)
    st = E.create([{ map: L.FIXED[5] }], { seed: 1 }); st.wrecks = [];
    $("menu").hidden = false; $("over").hidden = true; $("hud").hidden = true;
    // (the HUD, unseen, filled as a run starts it: the same size, so nothing moves when one does)
    $("h-lives").dataset.v = ""; hud();
    banner("");
    paintBack(); paintMenu();
  }

  function burst(x, y, n, t, life, spread, c) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * spread;
      parts.push({ t: t, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: life * (0.6 + Math.random() * 0.6), c: c });
    }
  }
  function handle(events) {
    var f = fx();
    events.forEach(function (e) {
      if (e.t === "fire") { SFX.fire(e.fast); if (f) parts.push({ t: "flash", x: e.x, y: e.y, vx: 0, vy: 0, age: 0, life: 120 }); }
      else if (e.t === "bounce") { SFX.bounce(); if (f) burst(e.x, e.y, 4, "spark", 220, 1.6); }
      else if (e.t === "spent" || e.t === "fizz") { SFX.spent(); if (f) burst(e.x, e.y, 5, "smoke", 380, 0.5); }
      else if (e.t === "clash") { SFX.clash(); if (f) burst(e.x, e.y, 7, "spark", 260, 2); }
      else if (e.t === "mine") SFX.mine();
      else if (e.t === "trip") SFX.trip();
      else if (e.t === "blast") { SFX.blast(); if (f) { shake = Math.min(1.4, shake + 1); burst(e.x, e.y, 14, "smoke", 700, 1.2); burst(e.x, e.y, 10, "spark", 420, 3.2); } }
      else if (e.t === "cork") { if (f) burst(e.x, e.y, 8, "chip", 600, 2.4, "#8a5a30"); }
      else if (e.t === "dead") {
        SFX.dead(e.kind === "player");
        st.wrecks.push({ x: e.x, y: e.y, kind: e.kind, mi: st.mi });
        if (e.kind !== "player") { (st.tally = st.tally || []).push(e.kind); if (counts) bestKills.submit(st.kills); }
        if (f) { shake = Math.min(1.4, shake + 0.7); burst(e.x, e.y, 10, "chip", 650, 2.6, A.COLORS[e.kind]); burst(e.x, e.y, 8, "smoke", 650, 0.9); }
      }
      else if (e.t === "load") {
        // a mission begins: a new one, or the same again after a lost tank
        // (the tanks destroyed stay destroyed, and so do their wrecks)
        if (e.fresh) newMission();
        else { st.wrecks = st.wrecks.filter(function (w) { return w.kind !== "player"; }); missionCard(); }
      }
      else if (e.t === "go") { SFX.go(); begun = true; banner(""); }
      else if (e.t === "won") { SFX.won(); banner('<span class="b-title">Mission cleared!</span>'); if (counts) bestCleared.submit(st.cleared); }
      else if (e.t === "lost") { SFX.lost(); banner('<span class="b-title">Tank destroyed</span><span class="b-line">' + (e.lives > 0 ? e.lives + (e.lives === 1 ? " life" : " lives") + " left" : "No lives left") + "</span>"); }
      else if (e.t === "life") SFX.life();
      else if (e.t === "over") { SFX.over(); finish(false); }
      else if (e.t === "done") { SFX.won(); finish(true); }
    });
  }

  // ---- the clock ---------------------------------------------------------------------------
  function input() {
    var mx = 0, my = 0;
    if (keys.left) mx -= 1; if (keys.right) mx += 1; if (keys.up) my -= 1; if (keys.down) my += 1;
    if (stickMove) { mx = stickMove.x; my = stickMove.y; }
    var p = st.player, aim = null;
    if (stickAim && stickAim.len > 0.2) { aim = Math.atan2(stickAim.y, stickAim.x); aimAngle = aim; }
    else if (aimPt && !touchAim) aim = Math.atan2(aimPt.y - p.y, aimPt.x - p.x);
    else if (aimAngle != null) aim = aimAngle;
    var o = { mx: mx, my: my, aim: aim, fire: firePress, mine: minePress };
    firePress = minePress = false;
    return o;
  }
  var last = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min(100, now - last) : 16;
    last = now;
    var paused = P && P.isPaused();
    // (paused, the arena is covered: a pause is no time to study a shell in flight)
    if (document.body.classList.contains("paused") !== !!paused) document.body.classList.toggle("paused", !!paused);
    if (ui === "run" && !paused) {
      acc += dt;
      while (acc >= 16) {
        acc -= 16; clock += 16;
        handle(E.step(st, 16, input()));
        if (ui !== "run") break;
        // the treads turn as far as each tank drove
        [st.player].concat(st.enemies).forEach(function (t) { if (t.lx != null) t.tread = (t.tread || 0) + Math.hypot(t.x - t.lx, t.y - t.ly); t.lx = t.x; t.ly = t.y; });
        tick(16);
        mineBeeps();
      }
      hud();
    } else if (ui !== "run") clock += dt;
    if (ui === "over") tick(dt);
    if (st) render();
  }
  // a mine in its last stretch beeps each time its light blinks on (faster
  // near the end, as the light does: A.mineBlink); one a tank has set going
  // beeps once, by its event
  function mineBeeps() {
    var warn = E.TUNE.mineWarnMs;
    st.mines.forEach(function (m) {
      var left = E.TUNE.fuseMs - m.age, on = m.trip == null && left <= warn && A.mineBlink(left, warn, clock);
      if (on && !m.lit) SFX.tick();
      m.lit = on;
    });
  }
  function tick(dt) {
    // a shell gone (two meeting, a wall, a tank): what's left of its trail
    // lingers and fades out together, rather than going with it
    if (st) {
      var live = {};
      st.shells.forEach(function (sh) { live[sh.id] = 1; });
      parts.forEach(function (p) { if (p.sid != null && !live[p.sid] && !p.fade) { p.fade = { t0: p.age, a0: Math.max(0, 1 - p.age / p.life) }; p.life = p.age + 650; } });
    }
    parts.forEach(function (p) { p.age += dt; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.vx *= 0.94; p.vy *= 0.94; });
    parts = parts.filter(function (p) { return p.age < p.life; });
    // a smoke trail behind each shell (Visual FX on)
    if (fx() && st) st.shells.forEach(function (sh) { if (Math.random() < 0.45) parts.push({ t: "smoke", sid: sh.id, x: sh.x - sh.vx * 0.03, y: sh.y - sh.vy * 0.03, vx: 0, vy: 0, age: 0, life: sh.fast ? 520 : 360 }); });
    shake = Math.max(0, shake - dt / 380);
  }

  // ---- keys -----------------------------------------------------------------------------------
  var DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (ui !== "run" || (P && P.isPaused())) return;
    if (DIRS[e.key]) { e.preventDefault(); keys[DIRS[e.key]] = true; audio(); return; }
    if (e.key === " " || e.code === "Space") { e.preventDefault(); if (!e.repeat) firePress = true; return; }
    if (e.key === "e" || e.key === "E") { e.preventDefault(); if (!e.repeat) minePress = true; }
  });
  document.addEventListener("keyup", function (e) { if (DIRS[e.key]) keys[DIRS[e.key]] = false; });
  // a key let go in another window sends no keyup: losing focus lets go of everything
  window.addEventListener("blur", function () { keys = {}; stickMove = null; stickAim = null; });

  // ---- the mouse, and taps on the arena ----------------------------------------------------------
  function toTiles(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - fr) / s, y: (cy - r.top - fr) / s };
  }
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    aimPt = toTiles(e.clientX, e.clientY); touchAim = false;
  });
  canvas.addEventListener("pointerdown", function (e) {
    audio();
    if (ui !== "run" || (P && P.isPaused())) return;
    e.preventDefault();
    var pt = toTiles(e.clientX, e.clientY);
    if (e.pointerType === "mouse") {
      aimPt = pt; touchAim = false;
      if (e.button === 0) firePress = true; else if (e.button === 2) minePress = true;
    } else {
      // a tap on the arena: the turret turns to it and fires
      touchAim = true; aimAngle = Math.atan2(pt.y - st.player.y, pt.x - st.player.x);
      st.player.turret = aimAngle; firePress = true;
    }
  });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ---- the touch sticks and the Mine button -------------------------------------------------------
  function stick(el, onMove, onEnd) {
    var id = null, knob = el.querySelector("i");
    function at(e) {
      var r = el.getBoundingClientRect(), R = r.width / 2, dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R), d = Math.hypot(dx, dy), k = Math.min(1, d / (R * 0.62));
      var v = d ? { x: dx / d * k, y: dy / d * k, len: k } : { x: 0, y: 0, len: 0 };
      knob.style.transform = "translate(" + (v.x * R * 0.5).toFixed(1) + "px," + (v.y * R * 0.5).toFixed(1) + "px)";
      return v;
    }
    el.addEventListener("pointerdown", function (e) { e.preventDefault(); audio(); id = e.pointerId; try { el.setPointerCapture(id); } catch (x) {} el.classList.add("held"); onMove(at(e), true); });
    el.addEventListener("pointermove", function (e) { if (e.pointerId === id) onMove(at(e), false); });
    function end(e) { if (e.pointerId !== id) return; id = null; el.classList.remove("held"); knob.style.transform = ""; onEnd(e.type === "pointerup"); }
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  }
  stick($("move-stick"), function (v) { stickMove = v.len > 0.15 ? v : { x: 0, y: 0, len: 0 }; }, function () { stickMove = null; });
  // the aim stick: drag to aim (the dots show the line), let go to fire; a tap fires along the barrel
  stick($("aim-stick"), function (v) { stickAim = v; touchAim = true; }, function (up) {
    if (up && ui === "run" && !(P && P.isPaused())) firePress = true;
    stickAim = null;
  });
  $("mine-btn").addEventListener("click", function () { if (ui === "run") minePress = true; });
  $("mine-btn").addEventListener("mousedown", function (e) { e.preventDefault(); });

  // ---- the menu -------------------------------------------------------------------------------
  function paintMenu() {
    startAt = Math.max(1, Math.min(startAt, TOTAL));
    $("stage-n").textContent = "From mission " + startAt;
    $("stage-note").textContent = startAt === 1 ? "the whole campaign" : "missions " + startAt + " to " + TOTAL;
    $("stage-down").disabled = startAt <= 1;
    $("stage-up").disabled = startAt >= TOTAL;
    var bc = bestCleared.get(), bk = bestKills.get();
    $("bests").textContent = bc || bk ? "Most in a run: " + bc + (bc === 1 ? " mission" : " missions") + " cleared · " + bk + " destroyed" : "";
    if (window.GameShell && GameShell.menuKeys && menuApi) menuApi.refresh && menuApi.refresh();
  }
  function stepStart(d) {
    var n = Math.max(1, Math.min(TOTAL, startAt + d));
    if (n === startAt) return;
    startAt = n; store.set("toytanks_start", String(n)); paintMenu();
  }
  // ◀ ▶ step a mission; held down (a finger, the mouse) they run on. A press
  // steps as it lands, so the click after it is let by; a key's click (from
  // the menu's ← →) steps on its own.
  ["stage-down", "stage-up"].forEach(function (id, i) {
    var b = $(id), d = i ? 1 : -1, hold = null;
    function stop() { clearTimeout(hold); clearInterval(hold); hold = null; }
    b.addEventListener("pointerdown", function (e) {
      if (b.disabled || e.button > 0) return;
      e.preventDefault(); stepStart(d); stop();
      hold = setTimeout(function () { hold = setInterval(function () { if (b.disabled) stop(); else stepStart(d); }, 70); }, 420);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (t) { b.addEventListener(t, stop); });
    b.addEventListener("click", function (e) { if (!e.detail) stepStart(d); });
  });
  // (and ← → held down run on too: the menu's keys take a press, not its repeats)
  document.addEventListener("keydown", function (e) {
    if (ui !== "menu" || !e.repeat || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".gs-dialog")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); stepStart(e.key === "ArrowLeft" ? -1 : 1); }
  });
  $("play").addEventListener("click", startRun);
  $("again").addEventListener("click", startRun);
  $("to-menu").addEventListener("click", toMenu);

  // ---- pause, leaving, and the menus' keys -------------------------------------------------------
  var P = window.GameShell && GameShell.pausable ? GameShell.pausable({
    canPause: function () { return ui === "run" && !!st && (st.status === "play" || st.status === "start") && begun; },
    restart: function () { startRun(from); }, menu: toMenu }) : null;     // on the card: the run again from where it started, or the menu
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave(P ? { active: inRun, pausable: P } : inRun);
  var menuApi = null;
  if (window.GameShell && GameShell.menuKeys) {
    menuApi = GameShell.menuKeys({ active: function () { return ui === "menu"; }, groups: [{ sel: "#stage-down", keys: ["arrowleft"] }, { sel: "#stage-up", keys: ["arrowright"] }], start: "#play", space: true });
    // (the end card: Space fires in play, so for a moment after the card comes
    // up no key counts: one pressed as the last tank went can't skip it)
    GameShell.menuKeys({ active: function () { return ui === "over" && performance.now() - overAt > 700; }, groups: [{ sel: "#to-menu", keys: ["Backspace"] }], start: "#again", space: true });
  }

  window.addEventListener("resize", function () { if (st) { fit(); render(); } });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (st) { hudKey = ""; hud(); fit(); render(); } });

  toMenu();
  fit();
  requestAnimationFrame(frame);

  // test hooks: the Playwright harness drives runs through these
  window.ToyTanks = {
    ui: function () { return ui; },
    st: function () { return st; },
    start: startRun,
    end: function () { if (ui === "run") finish(false); },
    cell: function () { return s; },
    fx: function () { return { parts: parts.length, shake: shake }; },
    // run the rules on by hand (ms of game time) with this input each step
    advance: function (ms, inp) { var seen = []; for (var t = 0; t < ms && ui === "run"; t += 16) { handle(E.step(st, 16, inp || {})); st.events.forEach(function (e) { seen.push(e.t); }); } hud(); return seen; }
  };
})();
