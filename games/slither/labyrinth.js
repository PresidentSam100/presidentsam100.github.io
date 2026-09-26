/* =====================================================================
   Slither — Labyrinth mode: level select, HUD, input and drawing.

   The rules live in labyrinth-engine.js and the levels in levels.js.
   game.js owns the page shell (menu, overlays, audio) and hands this
   module a `host` with what it needs; this file only feeds the engine
   input and time, turns its events into sound and effects, and draws.
   ===================================================================== */
window.SlitherLabyrinth = function (host) {
  "use strict";

  var E = window.SlitherEngine, T = E.T, LEVELS = window.SLITHER_LEVELS || [];
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
    ghostBtn: document.getElementById("ghost-btn"),
    dashBtn: document.getElementById("dash-btn"),
  };

  // Temple look: Garden is a mossy courtyard, Ruins sandstone, Citadel
  // obsidian with gold inlay (temple-art.js). Serpents are carved from
  // jade (you), lapis (wanderers), amethyst (hunters) and carnelian (munchers).
  var Art = window.SlitherArt;
  var THEMES = Art.THEMES;
  var PORTAL_COLORS = ["#ff9a3c", "#b36bff", "#3fd6ec", "#ff7ac0"];
  var SERPENT_OF = { player: "jade", wander: "lapis", hunt: "amethyst", munch: "carnelian" };

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
  function isUnlocked(i) { return i <= furthestDone() + 2; }
  function continueIndex() {
    for (var i = 0; i < LEVELS.length; i++) if (!isDone(i) && isUnlocked(i)) return i;
    return 0;
  }
  function secs(ms) { return (ms / 1000).toFixed(1); }

  function buildLevelGrid(container) {
    container.innerHTML = "";
    var zone = null, grid = null;
    LEVELS.forEach(function (lv, i) {
      if (lv.zone !== zone) {
        zone = lv.zone;
        var h = document.createElement("div");
        h.className = "lab-zone";
        h.textContent = zone;
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
  };

  // ---- state -----------------------------------------------------------------
  var st = null, levelIdx = 0, theme = THEMES.Garden;
  var active = false, paused = false, token = 0, lastTs = 0;
  var effects = [], hover = -1, tap = null, lastTickSec = -1, endTimer = null;
  var held = { ghostKey: false, ghostMouse: false, ghostBtn: false, dashKey: false, dashBtn: false };

  function syncHeld() {
    if (!st) return;
    E.setGhost(st, held.ghostKey || held.ghostMouse || held.ghostBtn);
    E.setDash(st, held.dashKey || held.dashBtn);
    el.ghostBtn.classList.toggle("held", held.ghostBtn);
    el.dashBtn.classList.toggle("held", held.dashBtn);
  }
  // Called on pause, blur, and leaving the level: a key released while the
  // tab was in the background never sends its keyup, and ghost or dash
  // would otherwise stay stuck on.
  function clearHeld() {
    for (var k in held) held[k] = false;
    syncHeld();
  }

  function start(i) {
    levelIdx = Math.max(0, Math.min(LEVELS.length - 1, i));
    var level = LEVELS[levelIdx];
    st = E.create(level);
    theme = THEMES[level.zone] || THEMES.Garden;
    clearTimeout(endTimer);
    active = true; paused = false;
    effects = []; tap = null; lastTs = 0; lastTickSec = -1;
    clearHeld();
    host.showBoard(st.cols * CELL, st.rows * CELL, st.cols * 30);
    buildLayer();
    el.level.innerHTML = "<b>" + (levelIdx + 1) + "</b> · " + level.name;
    el.hint.textContent = level.hint || "";
    el.timeBar.style.display = st.timeLimit ? "" : "none";
    updateHud();
    token++;
    var tk = token;
    requestAnimationFrame(function (ts) { frame(ts, tk); });
  }
  function restart() { if (st) start(levelIdx); }
  function stop() {
    active = false;
    paused = false;
    token++;
    clearTimeout(endTimer);
    clearHeld();
  }

  function togglePause() {
    if (!active || !st || (st.status !== "play" && st.status !== "ready")) return;
    paused = !paused;
    clearHeld();
    host.setPaused(paused);
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
    if (k === "r") { restart(); e.preventDefault(); return; }
    if (st.status === "dead" || st.status === "won") {
      if (k === " " || k === "spacebar") { host.clickResult(); e.preventDefault(); }
      return;
    }
    if (k === " " || k === "spacebar" || k === "p" || k === "escape") { togglePause(); e.preventDefault(); return; }
    if (paused) return;
    if (KEY_DIRS.hasOwnProperty(k)) { E.turn(st, KEY_DIRS[k]); e.preventDefault(); return; }
    if (k === "shift") { held.dashKey = true; syncHeld(); return; }
    if (k === "g") { held.ghostKey = true; syncHeld(); e.preventDefault(); }
  }
  function keyup(e) {
    var k = (e.key || "").toLowerCase();
    if (k === "shift") { held.dashKey = false; syncHeld(); }
    if (k === "g") { held.ghostKey = false; syncHeld(); }
  }
  // From the shared d-pad and swipe handlers in game.js ({x,y} vectors).
  function steer(v) {
    if (!active || !st || paused || st.status === "dead" || st.status === "won") return;
    E.turn(st, v.y < 0 ? 0 : v.x > 0 ? 1 : v.y > 0 ? 2 : 3);
  }

  function cellAt(e) {
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) / r.width * st.cols);
    var y = Math.floor((e.clientY - r.top) / r.height * st.rows);
    if (x < 0 || y < 0 || x >= st.cols || y >= st.rows) return -1;
    return y * st.cols + x;
  }
  function tryBlink(i) {
    if (!st || st.status !== "play" || paused || st.teleports <= 0 || i < 0) return;
    if (!E.blink(st, i)) sfx.deny();
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
    // which game.js already turns into steering.
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!active || !st) return;
    if (e.pointerType === "mouse") {
      hover = cellAt(e);
      // A second mouse button pressed while another is down fires no new
      // pointerdown — only `buttons` changes.
      var g = (e.buttons & 2) !== 0;
      if (g !== held.ghostMouse) { held.ghostMouse = g; syncHeld(); }
    } else if (tap && (Math.abs(e.clientX - tap.x) > 10 || Math.abs(e.clientY - tap.y) > 10)) {
      tap = null;
    }
  });
  canvas.addEventListener("pointerleave", function () { hover = -1; });
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

  // ---- events -> sound / effects / results ---------------------------------------
  function burst(i, color) { effects.push({ i: i, color: color, t0: performance.now() }); }

  function drainEvents() {
    var evs = st.events;
    if (!evs.length) return;
    st.events = [];
    evs.forEach(function (e) {
      switch (e.type) {
        case "apple": host.SFX.eat(); burst(e.at, "#ff4d6d"); break;
        case "stolen": sfx.stolen(); burst(e.at, "#ff9f1c"); break;
        case "open": sfx.open(); break;
        case "power": sfx.power(e.item); burst(e.at, e.item === "blink" ? "#b86bff" : e.item === "ghost" ? "#bff3ff" : "#8cff66"); break;
        case "portal": if (e.player) host.SFX.portal(); break;
        case "blink": sfx.blink(); burst(e.from, "#b86bff"); burst(e.to, "#b86bff"); break;
        case "blinkFail": sfx.deny(); break;
        case "switch": sfx.flip(); burst(e.at, "#ffc53d"); break;
        case "cut": sfx.cut(); burst(e.at, "#dfe6f0"); break;
        case "enemyDied": sfx.pop(); burst(e.at, Art.rgb(Art.SERPENTS[SERPENT_OF[e.kind] || "lapis"].body)); break;
        case "dead": onDead(e); break;
        case "win": onWin(); break;
      }
    });
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
    endTimer = setTimeout(function () {
      if (!active) return;
      host.showResult({
        title: words[0],
        msg: words[1] + "  ·  R or Enter to retry",
        primaryLabel: "Retry",
        primaryFn: restart,
      });
    }, 650);
  }
  function onWin() {
    host.SFX.win();
    clearHeld();
    var level = LEVELS[levelIdx], t = st.elapsed, prev = progress.best[level.id];
    var isBest = prev == null || t < prev;
    if (isBest) { progress.best[level.id] = Math.round(t); saveProgress(); }
    var last = levelIdx === LEVELS.length - 1;
    var msg = "Time " + secs(t) + "s" + (isBest ? (prev != null ? " — new best! 🎉" : "") : "  ·  Best " + secs(prev) + "s");
    endTimer = setTimeout(function () {
      if (!active) return;
      if (last) {
        host.showResult({ title: "You escaped the Labyrinth! 🏆", msg: msg, primaryLabel: "Level Select", primaryFn: host.toMenu });
      } else {
        host.showResult({ title: "Level clear! 🎉", msg: msg, primaryLabel: "Next Level →", primaryFn: function () { start(levelIdx + 1); } });
      }
    }, 550);
  }

  // ---- HUD ---------------------------------------------------------------------
  function updateHud() {
    if (!st) return;
    el.apples.innerHTML = st.applesLeft > 0 ? "🍎 <b>" + st.applesLeft + "</b> left" : "🚪 <b>exit open</b>";
    var showTime = st.timeLimit ? st.timeLeft : st.elapsed;
    el.time.innerHTML = "⌛ <b>" + secs(showTime) + "</b>";
    if (st.timeLimit) {
      var f = Math.max(0, st.timeLeft / st.timeLimit);
      el.timeFill.style.width = (f * 100).toFixed(2) + "%";
      // Sand runs from gold to ember as the clock drains.
      el.timeFill.style.backgroundColor = f > 0.5 ? "#e8c26a" : f > 0.25 ? "#e3a24c" : f > 0.1 ? "#e0763a" : "#e5484d";
    }
    el.blink.style.display = st.teleports > 0 ? "" : "none";
    el.blink.innerHTML = "✦ <b>×" + st.teleports + "</b>";
    var showGhost = st.ghost > 0 || st.ghostActive;
    el.ghost.style.display = showGhost ? "" : "none";
    el.ghostFill.style.width = (st.ghost / E.CFG.ghostMax * 100).toFixed(1) + "%";
    el.ghost.classList.toggle("on", st.ghostActive);
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
        else if (t === T.DARK) Art.darkFloor(g, px, py, CELL);
        else Art.floor(g, px, py, CELL, theme, seed);
        if (t === T.CUTTER) Art.cutter(g, px, py, CELL);
        else if (t === T.PORTAL) { Art.portalFrame(g, px + CELL / 2, py + CELL / 2, CELL / 2 - 1); live.push(i); }
        else if (t === T.DOOR_SHUT || t === T.DOOR_OPEN || t === T.SWITCH || t === T.SPIKE_A || t === T.SPIKE_B || t === T.EXIT) live.push(i);
      }
    }
  }

  function drawLive(now, fx) {
    var warn = st.status === "play" && st.spikeTimer < E.CFG.spikeWarnMs;
    var blinkOn = !fx || Math.floor(now / 90) % 2 === 1;
    for (var k = 0; k < live.length; k++) {
      var i = live[k], t = st.tiles[i], px = (i % st.cols) * CELL, py = Math.floor(i / st.cols) * CELL;
      if (t === T.DOOR_SHUT || t === T.DOOR_OPEN) Art.door(ctx, px, py, CELL, E.isDoorShut(st, i));
      else if (t === T.SWITCH) Art.plate(ctx, px, py, CELL, st.flipped);
      else if (t === T.SPIKE_A || t === T.SPIKE_B) { var up = E.spikeUp(st, i); Art.spikes(ctx, px, py, CELL, up, !up && warn && blinkOn); }
      else if (t === T.EXIT) Art.doorway(ctx, px, py, CELL, st.applesLeft === 0, now, fx);
      else if (t === T.PORTAL) Art.portalGlow(ctx, px + CELL / 2, py + CELL / 2, CELL / 2 - 1, PORTAL_COLORS[st.lv.portalId[i] % PORTAL_COLORS.length], now, fx);
    }
  }

  function drawItem(i, item, now, fx) {
    var x = cx(i), y = cy(i) + (fx ? Math.sin(now / 180 + i) * 1.3 : 0);
    if (item === "apple") Art.fruit(ctx, x, y, CELL - 6, "🍎");
    else if (item === "fast") Art.fruit(ctx, x, y, CELL - 6, "🍏");
    else if (item === "blink") Art.gem(ctx, x, y, CELL * 0.3);
    else if (item === "ghost") Art.wisp(ctx, x, y, CELL * 0.3, now, fx);
  }

  function drawSnake(s, idx, now, fx) {
    var alpha = 1, isPlayer = s === st.player;
    if (!s.alive && !isPlayer) {
      alpha = 1 - (st.elapsed - s.diedAt) / 450;
      if (alpha <= 0) return;
    }
    var ghost = isPlayer && s.alive && st.ghostActive;
    Art.serpent(ctx, s.body.map(function (i) { return { x: cx(i), y: cy(i) }; }), {
      cell: CELL,
      pal: Art.SERPENTS[SERPENT_OF[s.kind] || "lapis"],
      alpha: ghost ? 0.55 : alpha,
      dir: s.dir >= 0 ? { x: E.DX[s.dir], y: E.DY[s.dir] } : null,
      ghost: ghost,
      dead: isPlayer && !s.alive,   // turned to stone
      cross: isPlayer && !s.alive,
      t: now, fx: fx, seed: idx,
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
    for (var s = st.snakes.length - 1; s >= 0; s--) drawSnake(st.snakes[s], s, now, fx);

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

    // Teleport aim.
    if (st.teleports > 0 && hover >= 0 && st.status === "play" && !paused) {
      var ok = E.canBlinkTo(st, hover);
      ctx.strokeStyle = ok ? "#c99bff" : "#ff5a4a";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(cx(hover), cy(hover), CELL / 2 - 2, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Pickup / death bursts.
    effects = effects.filter(function (f) {
      var t = (now - f.t0) / 380;
      if (t >= 1 || t < 0) return t < 0;
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
      ctx.font = "700 15px Cinzel, Georgia, serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      ctx.fillText(touch ? "Swipe or tap the d-pad to begin" : "Press an arrow key or WASD to begin", W / 2, H / 2 + 1);
    }
  }

  return {
    start: start, restart: restart, stop: stop,
    togglePause: togglePause, autoPause: autoPause, isPaused: function () { return paused; },
    keydown: keydown, keyup: keyup, steer: steer,
    buildLevelGrid: buildLevelGrid, continueIndex: continueIndex,
    levelCount: function () { return LEVELS.length; },
  };
};
