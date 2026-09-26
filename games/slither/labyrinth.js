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

  var THEMES = {
    Garden: { floor: "#0f1612", grid: "rgba(160,255,190,0.04)", wall: "#2d5a3a", hi: "#4f8f5f", lo: "#1a3322" },
    Ruins: { floor: "#15120e", grid: "rgba(255,220,160,0.04)", wall: "#6b5536", hi: "#9c7f52", lo: "#3d301f" },
    Citadel: { floor: "#110f18", grid: "rgba(200,170,255,0.045)", wall: "#453a6b", hi: "#6d5ea3", lo: "#261f3d" },
  };
  var PORTAL_COLORS = ["#ff8c2b", "#a25cff", "#22d3ee", "#f472b6"];
  var SNAKE_RGB = { player: [57, 255, 136], wander: [77, 163, 255], hunt: [214, 72, 255], munch: [255, 159, 28] };

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
  var fx = [], hover = -1, tap = null, lastTickSec = -1, endTimer = null;
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
    fx = []; tap = null; lastTs = 0; lastTickSec = -1;
    clearHeld();
    host.showBoard(st.cols * CELL, st.rows * CELL, st.cols * 30);
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
  function burst(i, color) { fx.push({ i: i, color: color, t0: performance.now() }); }

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
        case "enemyDied": sfx.pop(); burst(e.at, rgb(SNAKE_RGB[e.kind] || SNAKE_RGB.wander, 1)); break;
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
    el.time.innerHTML = "⏱ <b>" + secs(showTime) + "</b>";
    if (st.timeLimit) {
      var f = Math.max(0, st.timeLeft / st.timeLimit);
      el.timeFill.style.width = (f * 100).toFixed(2) + "%";
      el.timeFill.style.background = f > 0.5 ? "#39ff88" : f > 0.25 ? "#ffd23f" : f > 0.1 ? "#ff9f1c" : "#ff4d6d";
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
  function rgb(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function cx(i) { return (i % st.cols) * CELL + CELL / 2; }
  function cy(i) { return Math.floor(i / st.cols) * CELL + CELL / 2; }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function isWall(x, y) { return x < 0 || y < 0 || x >= st.cols || y >= st.rows || st.tiles[y * st.cols + x] === T.WALL; }

  function drawTiles(now, reduced) {
    var pulse = reduced ? 0 : Math.sin(now / 220);
    for (var y = 0; y < st.rows; y++) {
      for (var x = 0; x < st.cols; x++) {
        var i = y * st.cols + x, t = st.tiles[i], px = x * CELL, py = y * CELL;
        if (t === T.WALL) {
          ctx.fillStyle = theme.wall;
          ctx.fillRect(px, py, CELL, CELL);
          if (!isWall(x, y - 1)) { ctx.fillStyle = theme.hi; ctx.fillRect(px, py, CELL, 3); }
          if (!isWall(x, y + 1)) { ctx.fillStyle = theme.lo; ctx.fillRect(px, py + CELL - 4, CELL, 4); }
          if (!isWall(x - 1, y)) { ctx.fillStyle = theme.hi; ctx.globalAlpha = 0.5; ctx.fillRect(px, py, 2, CELL); ctx.globalAlpha = 1; }
          if (!isWall(x + 1, y)) { ctx.fillStyle = theme.lo; ctx.globalAlpha = 0.7; ctx.fillRect(px + CELL - 2, py, 2, CELL); ctx.globalAlpha = 1; }
        } else if (t === T.ICE) {
          ctx.fillStyle = "#16324a";
          ctx.fillRect(px, py, CELL, CELL);
          ctx.strokeStyle = "rgba(170,225,255,0.35)";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(px + 5, py + CELL - 7); ctx.lineTo(px + 12, py + 6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px + 12, py + CELL - 4); ctx.lineTo(px + 17, py + 12); ctx.stroke();
        } else if (t === T.DOOR_SHUT || t === T.DOOR_OPEN) {
          if (E.isDoorShut(st, i)) {
            ctx.fillStyle = "#c9891a";
            rr(px + 1, py + 1, CELL - 2, CELL - 2, 3); ctx.fill();
            ctx.fillStyle = "#7a4f0c";
            ctx.fillRect(px + 6, py + 3, 3, CELL - 6);
            ctx.fillRect(px + CELL - 9, py + 3, 3, CELL - 6);
          } else {
            ctx.strokeStyle = "rgba(255,197,61,0.45)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            rr(px + 2.5, py + 2.5, CELL - 5, CELL - 5, 3); ctx.stroke();
            ctx.setLineDash([]);
          }
        } else if (t === T.SWITCH) {
          ctx.fillStyle = "#231d10";
          ctx.beginPath(); ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#ffc53d"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 2 - 4, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = st.flipped ? "#ffc53d" : "rgba(255,197,61,0.25)";
          ctx.beginPath(); ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 2 - 8, 0, Math.PI * 2); ctx.fill();
        } else if (t === T.SPIKE_A || t === T.SPIKE_B) {
          ctx.fillStyle = "#1c2029";
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          var up = E.spikeUp(st, i);
          var warn = !up && st.status === "play" && st.spikeTimer < E.CFG.spikeWarnMs;
          for (var s = 0; s < 4; s++) {
            var sx = px + (s % 2 ? CELL * 0.7 : CELL * 0.3), sy = py + (s < 2 ? CELL * 0.3 : CELL * 0.72);
            if (up) {
              ctx.fillStyle = "#dfe5ef";
              ctx.beginPath(); ctx.moveTo(sx - 4, sy + 4); ctx.lineTo(sx, sy - 5); ctx.lineTo(sx + 4, sy + 4); ctx.closePath(); ctx.fill();
              ctx.fillStyle = "#ff4d6d";
              ctx.beginPath(); ctx.arc(sx, sy - 4, 1.2, 0, Math.PI * 2); ctx.fill();
            } else {
              ctx.fillStyle = warn && (reduced || Math.floor(now / 90) % 2) ? "#ff4d6d" : "#4a5263";
              ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill();
            }
          }
        } else if (t === T.CUTTER) {
          ctx.fillStyle = "#262c38";
          rr(px + 1, py + 1, CELL - 2, CELL - 2, 4); ctx.fill();
          ctx.fillStyle = "#dfe6f0";
          ctx.font = (CELL - 8) + "px serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("✂", px + CELL / 2, py + CELL / 2 + 1);
        } else if (t === T.DARK) {
          ctx.fillStyle = "#07080c";
          ctx.fillRect(px, py, CELL, CELL);
        } else if (t === T.PORTAL) {
          var col = PORTAL_COLORS[st.lv.portalId[i] % PORTAL_COLORS.length];
          ctx.strokeStyle = col; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 2 - 3 + pulse * 0.8, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = col; ctx.globalAlpha = 0.35;
          ctx.beginPath(); ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 2 - 7, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        } else if (t === T.EXIT) {
          drawExit(px, py, now, reduced);
        }
      }
    }
  }

  function drawExit(px, py, now, reduced) {
    var open = st.applesLeft === 0;
    var glow = open && !reduced ? 0.55 + 0.45 * Math.sin(now / 160) : 1;
    if (open) {
      ctx.fillStyle = "rgba(255,210,63," + (0.22 * glow).toFixed(3) + ")";
      ctx.fillRect(px - 3, py - 3, CELL + 6, CELL + 6);
    }
    // Stone arch: two pillars and a rounded top.
    ctx.fillStyle = open ? "#ffd23f" : "#6c7385";
    ctx.beginPath();
    ctx.moveTo(px + 2, py + CELL - 1);
    ctx.lineTo(px + 2, py + CELL / 2);
    ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 2 - 2, Math.PI, 0);
    ctx.lineTo(px + CELL - 2, py + CELL - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = open ? "#2a1f00" : "#1a1d26";
    ctx.beginPath();
    ctx.moveTo(px + 7, py + CELL - 1);
    ctx.lineTo(px + 7, py + CELL / 2 + 1);
    ctx.arc(px + CELL / 2, py + CELL / 2 + 1, CELL / 2 - 7, Math.PI, 0);
    ctx.lineTo(px + CELL - 7, py + CELL - 1);
    ctx.closePath();
    ctx.fill();
    if (!open) {
      ctx.fillStyle = "#c9ced8";
      ctx.fillRect(px + CELL / 2 - 3, py + CELL / 2 + 1, 6, 5);
      ctx.strokeStyle = "#c9ced8"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px + CELL / 2, py + CELL / 2 + 1, 2.5, Math.PI, 0); ctx.stroke();
    }
  }

  function drawItem(i, item, now, reduced) {
    var x = cx(i), y = cy(i) + (reduced ? 0 : Math.sin(now / 180 + i) * 1.3);
    if (item === "apple" || item === "fast") {
      ctx.font = (CELL - 5) + "px serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(item === "apple" ? "🍎" : "🍏", x, y + 1);
    } else if (item === "blink") {
      var g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, CELL / 2 - 2);
      g.addColorStop(0, "#f0dcff"); g.addColorStop(0.5, "#a44dff"); g.addColorStop(1, "#4c1a8a");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, CELL / 2 - 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(x, y - 6); ctx.lineTo(x + 1.6, y - 1.6); ctx.lineTo(x + 6, y); ctx.lineTo(x + 1.6, y + 1.6);
      ctx.lineTo(x, y + 6); ctx.lineTo(x - 1.6, y + 1.6); ctx.lineTo(x - 6, y); ctx.lineTo(x - 1.6, y - 1.6);
      ctx.closePath(); ctx.fill();
    } else if (item === "ghost") {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#d9f7ff";
      ctx.beginPath();
      ctx.arc(x, y - 1, CELL / 2 - 4, Math.PI, 0);
      ctx.lineTo(x + CELL / 2 - 4, y + 7);
      ctx.lineTo(x + 3, y + 4); ctx.lineTo(x, y + 7); ctx.lineTo(x - 3, y + 4);
      ctx.lineTo(x - CELL / 2 + 4, y + 7);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#16324a";
      ctx.beginPath(); ctx.arc(x - 3, y - 1, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 3, y - 1, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawSnake(s, now) {
    var base = SNAKE_RGB[s.kind] || SNAKE_RGB.wander, alpha = 1;
    if (!s.alive) {
      if (s === st.player) alpha = 0.55;
      else { alpha = 1 - (st.elapsed - s.diedAt) / 450; if (alpha <= 0) return; }
    }
    var ghost = s === st.player && st.ghostActive && s.alive;
    if (ghost) { base = [200, 245, 255]; alpha = 0.5; }
    var body = s.body, n = body.length, w = CELL * 0.7;
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineWidth = w;
    for (var k = n - 1; k >= 1; k--) {
      var a = body[k], b = body[k - 1];
      var shade = 0.45 + 0.55 * (1 - k / Math.max(1, n - 1));
      ctx.strokeStyle = rgb([Math.round(base[0] * shade), Math.round(base[1] * shade), Math.round(base[2] * shade)], 1);
      var adjacent = a !== b && Math.abs(a % st.cols - b % st.cols) + Math.abs(Math.floor(a / st.cols) - Math.floor(b / st.cols)) === 1;
      ctx.beginPath();
      ctx.moveTo(cx(a), cy(a));
      ctx.lineTo(adjacent ? cx(b) : cx(a) + 0.01, adjacent ? cy(b) : cy(a)); // a portal or blink gap: just a dot
      ctx.stroke();
    }
    // Head.
    var h = body[0], hx = cx(h), hy = cy(h);
    ctx.fillStyle = rgb(base, 1);
    ctx.beginPath(); ctx.arc(hx, hy, CELL * 0.42, 0, Math.PI * 2); ctx.fill();
    var d = s.dir < 0 ? 1 : s.dir, fx_ = E.DX[d], fy_ = E.DY[d];
    var ex = fx_ * 4, ey = fy_ * 4, px = -fy_ * 4, py = fx_ * 4;
    if (s === st.player && !s.alive) {
      ctx.strokeStyle = "#ff4d6d"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hx - 5, hy - 5); ctx.lineTo(hx + 5, hy + 5); ctx.moveTo(hx + 5, hy - 5); ctx.lineTo(hx - 5, hy + 5); ctx.stroke();
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(hx + ex + px * 0.6, hy + ey + py * 0.6, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + ex - px * 0.6, hy + ey - py * 0.6, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s.kind === "hunt" ? "#ff2a2a" : "#0b1016";
      ctx.beginPath(); ctx.arc(hx + ex * 1.2 + px * 0.6, hy + ey * 1.2 + py * 0.6, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + ex * 1.2 - px * 0.6, hy + ey * 1.2 - py * 0.6, 1.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render(now) {
    if (!st) return;
    var reduced = !!(window.RM_ON && window.RM_ON());
    var W = st.cols * CELL, H = st.rows * CELL;
    ctx.fillStyle = theme.floor;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (var gx = 1; gx < st.cols; gx++) { ctx.beginPath(); ctx.moveTo(gx * CELL + 0.5, 0); ctx.lineTo(gx * CELL + 0.5, H); ctx.stroke(); }
    for (var gy = 1; gy < st.rows; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * CELL + 0.5); ctx.lineTo(W, gy * CELL + 0.5); ctx.stroke(); }

    drawTiles(now, reduced);
    var keys = Object.keys(st.items);
    keys.forEach(function (k) { drawItem(Number(k), st.items[k], now, reduced); });
    for (var s = st.snakes.length - 1; s >= 0; s--) drawSnake(st.snakes[s], now);

    // Darkness hides snakes, not the apples you're hunting for.
    for (var i = 0; i < st.tiles.length; i++) {
      if (st.tiles[i] !== T.DARK) continue;
      ctx.fillStyle = "#050609";
      ctx.fillRect((i % st.cols) * CELL, Math.floor(i / st.cols) * CELL, CELL, CELL);
      if (st.items[i]) { ctx.globalAlpha = 0.75; drawItem(i, st.items[i], now, reduced); ctx.globalAlpha = 1; }
    }

    // Teleport aim.
    if (st.teleports > 0 && hover >= 0 && st.status === "play" && !paused) {
      var ok = E.canBlinkTo(st, hover);
      ctx.strokeStyle = ok ? "#c58bff" : "#ff4d6d";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(cx(hover), cy(hover), CELL / 2 - 2, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Pickup / death bursts.
    fx = fx.filter(function (f) {
      var t = (now - f.t0) / 380;
      if (t >= 1 || t < 0) return t < 0;
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx(f.i), cy(f.i), CELL * (reduced ? 0.55 : 0.35 + t * 0.7), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      return true;
    });

    if (st.status === "ready") {
      ctx.fillStyle = "rgba(5,7,10,0.62)";
      ctx.fillRect(0, H / 2 - 22, W, 44);
      ctx.fillStyle = "#e6edf3";
      ctx.font = "700 16px Rajdhani, system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      ctx.fillText(touch ? "Swipe or tap the d-pad to start" : "Press an arrow key or WASD to start", W / 2, H / 2);
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
