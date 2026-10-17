/* =====================================================================
   Rose Window: a brick breaker in a cathedral. A bead of light flies up
   from a brass bar and breaks the panes of a stained-glass window, and
   each broken pane lets the evening in. Eight windows, one after another:
   Pilgrimage with three beads, Vigil with one.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  // ---- the window, in its own units ------------------------------------------
  // The inside of the stone frame: FW across, FH from the crown of its round
  // arch (centre (R, R), radius R) down to the sill. The panes sit on a grid
  // of COLS x ROWS cells of CW x CH, from (GX, GY).
  var FW = 480, FH = 640, R = FW / 2, FRAME = 26;
  var COLS = 14, ROWS = 20, CW = 32, CH = 18, GX = 16, GY = 34;
  var BAR_Y = FH - 40, BAR_H = 12, BAR_W = 86, WIDE_W = 132, BAR_SPEED = 560;
  var BEAD = 6.5;
  var JEWEL_ODDS = 0.11, WIDE_T = 12, SLOW_T = 10;
  var OVER_WAIT = 700;

  var GLASS = {
    ruby: ["#f06a80", "#c3304a", "#6e1124"],        // light, body, deep
    sapphire: ["#7ba4f2", "#3d6fd0", "#16306f"],
    emerald: ["#6ad9a8", "#22a06d", "#0c5236"],
    amber: ["#ffd57a", "#eb9c26", "#8c4f08"],
    violet: ["#c29af2", "#8a4fd0", "#3e1a7a"],
    rose: ["#f8b0c8", "#e0668f", "#8a2a50"],
    gold: ["#fff3c4", "#f0cf6e", "#a07a28"]
  };

  // ---- the eight windows ---------------------------------------------------------
  // Each says what glass fills the cell whose middle is (x, y), as
  // [colour, knocks]: 1 for a pane, 2 for thick glass, 0 for stone tracery
  // (which nothing breaks); null for an empty cell. Whatever falls outside
  // the arch is left out (see inArch).
  function d2(x, y, cx, cy) { return Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)); }
  function ang(x, y, cx, cy) { return Math.atan2(y - cy, x - cx); }
  function nearAngle(a, step, tol) { var k = Math.round(a / step); return Math.abs(a - k * step) < tol; }
  var WINDOWS = [
    { name: "The Lancets", pane: function (x, y) {
      // three tall lights, each pointed at the top
      var lights = [[80, 52, "sapphire"], [240, 62, "ruby"], [400, 52, "sapphire"]];
      for (var i = 0; i < lights.length; i++) {
        var L = lights[i], dx = Math.abs(x - L[0]);
        if (dx > L[1] || y > 360) continue;
        var top = 96 + dx * 1.3;
        if (y < top) return null;
        return [y < top + 34 ? "gold" : L[2], 1];
      }
      return null;
    } },
    { name: "The Quarries", pane: function (x, y, c, r) {
      // a lattice of diamonds, every sixth row of thick glass
      if ((c + r) % 2 || r < 2 || r > 17) return null;
      var hue = ["amber", "emerald", "gold", "emerald"][((c - r) % 4 + 4) % 4];
      return [hue, r % 6 === 2 ? 2 : 1];
    } },
    { name: "The Rose", pane: function (x, y) {
      // rings round a golden heart, held by four stone spokes
      var d = d2(x, y, 240, 200);
      if (d > 176) return null;
      var ring = Math.floor(d / 35);
      if (ring === 2 && nearAngle(ang(x, y, 240, 200), Math.PI / 2, 0.2)) return ["stone", 0];
      return [["gold", "ruby", "sapphire", "emerald", "violet", "violet"][ring], ring === 0 ? 2 : 1];
    } },
    { name: "The Trefoil", pane: function (x, y) {
      // three circles, gold where they meet, thick at their hearts
      var C = [[240, 128, "ruby"], [165, 252, "emerald"], [315, 252, "sapphire"]], hit = [];
      for (var i = 0; i < 3; i++) if (d2(x, y, C[i][0], C[i][1]) <= 74) hit.push(i);
      if (!hit.length) return null;
      if (hit.length > 1) return ["gold", 1];
      return [C[hit[0]][2], d2(x, y, C[hit[0]][0], C[hit[0]][1]) < 26 ? 2 : 1];
    } },
    { name: "The Wheel", pane: function (x, y) {
      // a rim, twelve thick spokes and a hub of stone
      var d = d2(x, y, 240, 212);
      if (d > 186) return null;
      if (d < 22) return ["stone", 0];
      if (d > 160) return ["violet", 1];
      if (nearAngle(ang(x, y, 240, 212), Math.PI / 6, 0.12)) return ["gold", 2];
      return ["rose", 1];
    } },
    { name: "The Tree of Jesse", pane: function (x, y, c, r) {
      // a trunk of thick amber, a canopy of leaves, fruit and flowers in it
      if (Math.abs(x - 240) < 26 && y > 236 && y < 380) return ["amber", 2];
      var e = Math.pow((x - 240) / 206, 2) + Math.pow((y - 150) / 106, 2);
      if (e > 1) return null;
      if ((c * 7 + r * 3) % 9 === 0) return ["ruby", 1];
      if ((c + r * 5) % 13 === 0) return ["violet", 1];
      return ["emerald", 1];
    } },
    { name: "The Star", pane: function (x, y) {
      // eight points round a thick golden middle, stone at the four tips
      var px = Math.abs(x - 240), py = Math.abs(y - 206);
      var diamond = px + py <= 178, square = px <= 104 && py <= 104;
      if (!diamond && !square) return null;
      if (px + py < 76) return ["gold", 2];
      if (diamond && px + py > 158) return ["stone", 0];
      return [square && !diamond ? "sapphire" : square ? "violet" : "ruby", 1];
    } },
    { name: "The Great Rose", pane: function (x, y) {
      // twelve petals in seven rings, a thick ring among them, and stone
      // bosses on the diagonals
      var d = d2(x, y, 240, 214);
      if (d > 206) return null;
      var ring = Math.floor(d / 30);
      if (ring === 0) return ["gold", 2];
      var a = ang(x, y, 240, 214);
      if (ring === 4 && nearAngle(a - Math.PI / 4, Math.PI / 2, 0.1)) return ["stone", 0];
      var sector = Math.floor((a + Math.PI) / (Math.PI / 6));
      var hue = (sector + ring) % 2 ? "ruby" : "sapphire";
      if (ring === 6) hue = "gold";
      return [hue, ring === 3 ? 2 : 1];
    } }
  ];
  var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

  // A cell is glazed only if it lies wholly inside the arch.
  function inArch(x0, y0, x1, y1) {
    var pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    for (var i = 0; i < 4; i++) {
      var p = pts[i];
      if (p[1] < R && d2(p[0], p[1], R, R) > R - 6) return false;
    }
    return true;
  }
  function glaze(n) {
    var out = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var x0 = GX + c * CW, y0 = GY + r * CH;
        if (!inArch(x0, y0, x0 + CW, y0 + CH)) continue;
        var p = WINDOWS[n].pane(x0 + CW / 2, y0 + CH / 2, c, r);
        if (!p) continue;
        out.push({ c: c, r: r, x: x0, y: y0, hue: p[0], hp: p[1], max: p[1], lit: 0, broken: false, seed: (c * 31 + r * 17) % 7 });
      }
    }
    return out;
  }

  // ---- the canvas, and where the window sits on it --------------------------------
  var cv = $("stage"), g = cv.getContext("2d");
  var dpr = 1, VW = 0, VH = 0, S = 1, OX = 0, OY = 0;
  var bg = document.createElement("canvas"), bgc = bg.getContext("2d");
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    VW = window.innerWidth; VH = window.innerHeight;
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
    // under the corner buttons; on a phone the HUD sits below the window
    var narrow = VW <= 640, top = 64, bottom = narrow ? 56 : 18;
    var availW = VW - 20, availH = Math.max(120, VH - top - bottom);
    S = Math.min(availW / (FW + FRAME * 2), availH / (FH + FRAME * 2));
    OX = (VW - FW * S) / 2;
    OY = top + (availH - (FH + FRAME * 2) * S) / 2 + FRAME * S;
    bake();
  }
  // window units -> page pixels, and back (for the pointer)
  function toWinX(px) { return (px - OX) / S; }

  // The wall, the frame and the clear glass behind the panes never change
  // while the window's size doesn't: baked once into `bg`.
  function archPath(c, inset) {
    var rr = R + inset;
    c.beginPath();
    c.moveTo(-inset, FH + inset);
    c.lineTo(-inset, R);
    c.arc(R, R, rr, Math.PI, 0);
    c.lineTo(FW + inset, FH + inset);
    c.closePath();
  }
  function bake() {
    bg.width = cv.width; bg.height = cv.height;
    var b = bgc;
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the nave's wall: dusk on dressed stone
    var wall = b.createLinearGradient(0, 0, 0, VH);
    wall.addColorStop(0, "#2c2733"); wall.addColorStop(1, "#18141d");
    b.fillStyle = wall; b.fillRect(0, 0, VW, VH);
    var bw = 54, bh = 26;
    b.strokeStyle = "rgba(0, 0, 0, 0.32)"; b.lineWidth = 1;
    for (var row = 0, y = 0; y < VH; row++, y += bh) {
      b.beginPath(); b.moveTo(0, y + 0.5); b.lineTo(VW, y + 0.5); b.stroke();
      for (var x = (row % 2) * bw / 2; x < VW; x += bw) { b.beginPath(); b.moveTo(Math.round(x) + 0.5, y); b.lineTo(Math.round(x) + 0.5, y + bh); b.stroke(); }
    }
    b.strokeStyle = "rgba(255, 240, 220, 0.04)";
    for (y = 1; y < VH; y += bh) { b.beginPath(); b.moveTo(0, y + 0.5); b.lineTo(VW, y + 0.5); b.stroke(); }
    // the evening's glow spilling round the window onto the wall
    var cx = OX + R * S, cy = OY + FH * S * 0.42;
    var glow = b.createRadialGradient(cx, cy, 10, cx, cy, Math.max(VW, VH) * 0.6);
    glow.addColorStop(0, "rgba(255, 196, 120, 0.16)"); glow.addColorStop(1, "rgba(255, 196, 120, 0)");
    b.fillStyle = glow; b.fillRect(0, 0, VW, VH);

    b.setTransform(dpr * S, 0, 0, dpr * S, dpr * OX, dpr * OY);
    // the stone frame: a moulding round the arch and the jambs, a sill below
    archPath(b, FRAME);
    var stone = b.createLinearGradient(0, -FRAME, 0, FH + FRAME);
    stone.addColorStop(0, "#8f8799"); stone.addColorStop(1, "#5b5466");
    b.fillStyle = stone; b.fill();
    b.lineWidth = 2; b.strokeStyle = "#2a2530"; b.stroke();
    archPath(b, FRAME * 0.45);
    b.lineWidth = 1.5; b.strokeStyle = "rgba(255, 250, 240, 0.28)"; b.stroke();
    // the clear glass of the window, the dusk sky through it
    archPath(b, 0);
    var sky = b.createLinearGradient(0, 0, 0, FH);
    sky.addColorStop(0, "#1f2147"); sky.addColorStop(0.6, "#33294a"); sky.addColorStop(1, "#4a3046");
    b.fillStyle = sky; b.fill();
    b.save(); b.clip();
    // its leading: plain diamond quarries
    b.strokeStyle = "rgba(10, 8, 14, 0.55)"; b.lineWidth = 1.4;
    for (var k = -FH; k < FW + FH; k += 30) {
      b.beginPath(); b.moveTo(k, 0); b.lineTo(k - FH * 0.6, FH); b.stroke();
      b.beginPath(); b.moveTo(k, 0); b.lineTo(k + FH * 0.6, FH); b.stroke();
    }
    b.restore();
    archPath(b, 0);
    b.lineWidth = 4; b.strokeStyle = "#15121a"; b.stroke();
  }

  // ---- sound ------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function sfxPane() { var f = 1500 + Math.random() * 900; tone(f, 0.22, "sine", 0.07); tone(f * 1.51, 0.16, "triangle", 0.035); }
  function sfxCrack() { tone(900, 0.08, "square", 0.03); tone(620, 0.12, "triangle", 0.05); }
  function sfxStone() { tone(140, 0.09, "triangle", 0.09); }
  function sfxBar() { tone(523, 0.18, "sine", 0.07); tone(784, 0.14, "sine", 0.03); }
  function sfxWall() { tone(330, 0.05, "triangle", 0.03); }
  function sfxLost() { [392, 330, 262].forEach(function (f, i) { tone(f, 0.3, "sine", 0.08, i * 0.12); }); }
  function sfxJewel() { [1046, 1318, 1568].forEach(function (f, i) { tone(f, 0.16, "sine", 0.05, i * 0.05); }); }
  function sfxLit() { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.5, "sine", 0.06, i * 0.09); }); }

  // ---- the run ----------------------------------------------------------------------
  var MODES = { pilgrimage: { name: "Pilgrimage", beads: 3 }, vigil: { name: "Vigil", beads: 1 } };
  var mode = store.get("rosewindow_mode", "pilgrimage");
  if (!MODES[mode]) mode = "pilgrimage";
  var bests = {};
  Object.keys(MODES).forEach(function (m) { bests[m] = window.GameShell ? GameShell.best("rosewindow_best_" + m, { higher: true }) : null; });

  var state = "menu";            // menu | play | over
  var win = 0, panes = [], grid = [];
  var score = 0, runBest = 0, beads = 3, broken = 0, combo = 0;
  var balls = [], jewels = [], shards = [], pops = [];
  var barX = R, barW = BAR_W, wideT = 0, slowT = 0;
  var serving = true, launched = false, litT = 0, overAt = 0, quiet = 0;
  var keys = { left: false, right: false };

  function bestNow() { return bests[mode]; }
  function setScore(n) {
    score = n;
    // a new best is kept the moment it is passed, so leaving mid-run loses nothing
    if (bestNow() && score > runBest) bestNow().submit(score);
    hud();
  }

  function loadWindow(n) {
    win = n;
    panes = glaze(n);
    grid = [];
    for (var r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(null));
    panes.forEach(function (p) { grid[p.r][p.c] = p; });
    jewels = []; shards = []; pops = [];
    wideT = 0; slowT = 0; barW = BAR_W;
    serve();
    hud();
  }
  function serve() {
    serving = true; combo = 0; quiet = 0;
    balls = [{ x: barX, y: BAR_Y - BEAD - 1, vx: 0, vy: 0, trail: [] }];
  }
  function left() { var n = 0; for (var i = 0; i < panes.length; i++) if (!panes[i].broken && panes[i].max > 0) n++; return n; }

  function startRun(m) {
    if (m && MODES[m]) mode = m;
    store.set("rosewindow_mode", mode);
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state = "play";
    score = 0; broken = 0; launched = false; litT = 0;
    beads = MODES[mode].beads;
    runBest = bestNow() ? bestNow().get() : 0;
    barX = R; keys.left = keys.right = false;
    loadWindow(0);
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false;
  }
  function launch() {
    if (state !== "play" || !serving || litT > 0 || P.isPaused()) return;
    serving = false; launched = true;
    var a = (Math.random() * 2 - 1) * 0.2;
    var b = balls[0], sp = speed();
    b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp;
  }
  function speed() { return (330 + 18 * win) * (slowT > 0 ? 0.7 : 1); }

  function hud() {
    $("hud-win").textContent = ROMAN[win] + " · " + WINDOWS[win].name;
    $("hud-score").textContent = score;
    var s = "";
    for (var i = 0; i < beads; i++) s += "●";
    $("hud-beads").textContent = s;
    $("hud-beads").setAttribute("aria-label", beads + (beads === 1 ? " bead" : " beads") + " of light left");
  }

  // ---- play ------------------------------------------------------------------------
  function pop(text, x, y, col) { pops.push({ text: text, x: x, y: y, col: col || "#fff3c4", age: 0 }); }

  function breakPane(p, ball) {
    if (p.max === 0) { sfxStone(); return; }
    p.hp--;
    quiet = 0;
    if (p.hp > 0) { sfxCrack(); setScore(score + 5); return; }
    p.broken = true; broken++;
    combo++;
    var pts = 10 * Math.min(8, combo) * (p.max === 2 ? 2 : 1);
    setScore(score + pts);
    if (combo >= 3 && combo % 3 === 0) pop("×" + Math.min(8, combo), p.x + CW / 2, p.y);
    sfxPane();
    if (fx()) {
      var col = GLASS[p.hue];
      for (var i = 0; i < 7; i++) {
        var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 160;
        shards.push({ x: p.x + Math.random() * CW, y: p.y + Math.random() * CH, vx: Math.cos(a) * sp + (ball ? ball.vx * 0.15 : 0),
          vy: Math.sin(a) * sp - 40, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, s: 3 + Math.random() * 5, col: col[i % 2], age: 0 });
      }
    }
    if (Math.random() < JEWEL_ODDS) {
      var kinds = ["wide", "three", "slow"];
      jewels.push({ kind: kinds[Math.floor(Math.random() * 3)], x: p.x + CW / 2, y: p.y + CH / 2, vy: 110 });
    }
    if (left() === 0) windowLit();
  }

  function windowLit() {
    balls = []; jewels = [];
    litT = 1.8;
    setScore(score + 250 * (win + 1));
    pop("+" + 250 * (win + 1), R, 420, "#ffe7a8");
    sfxLit();
  }

  function catchJewel(j) {
    sfxJewel();
    setScore(score + 50);
    if (j.kind === "wide") { wideT = WIDE_T; pop("a wider bar", barX, BAR_Y - 24); }
    else if (j.kind === "slow") { slowT = SLOW_T; pop("slower light", barX, BAR_Y - 24); }
    else {
      var src = balls.length ? balls[0] : { x: barX, y: BAR_Y - 20 };
      var sp = speed();
      [-0.5, 0.5].forEach(function (a) {
        balls.push({ x: src.x, y: src.y, vx: Math.sin(a) * sp, vy: -Math.cos(a) * sp, trail: [] });
      });
      if (serving) launch();
      pop("three beads", barX, BAR_Y - 24);
    }
  }

  function loseBead() {
    beads--;
    sfxLost();
    wideT = 0; slowT = 0; jewels = [];
    if (beads <= 0) { hud(); gameOver(false); return; }
    serve();
    hud();
  }

  function gameOver(won) {
    state = "over";
    overAt = performance.now();
    var b = bestNow(), isBest = b && score > 0 ? (b.submit(score) || score > runBest) : false;
    $("over-title").textContent = won ? "Every window is lit" : "The light went out";
    $("over-msg").textContent = score;
    var line = document.createElement("span"), best = document.createElement("span");
    line.textContent = won ? "all eight windows, " + broken + " panes broken" :
      "at window " + ROMAN[win] + ", " + WINDOWS[win].name.toLowerCase() + " · " + broken + " panes broken";
    best.className = "best" + (isBest ? " record" : "");
    best.textContent = isBest ? "a new " + MODES[mode].name.toLowerCase() + " record ✦" : b && b.get() ? "best: " + b.get() : "no record yet";
    $("over-stats").replaceChildren(line, best);
    $("hud").hidden = true;
    $("over").hidden = false;
  }

  // one step of the bead: walls, arch, bar, panes
  function stepBall(b, h) {
    b.x += b.vx * h; b.y += b.vy * h;
    var sp = speed();
    // the jambs
    if (b.x < BEAD) { b.x = BEAD; b.vx = Math.abs(b.vx); sfxWall(); quiet += 0.02; }
    else if (b.x > FW - BEAD) { b.x = FW - BEAD; b.vx = -Math.abs(b.vx); sfxWall(); quiet += 0.02; }
    // the arch
    if (b.y < R) {
      var dx = b.x - R, dy = b.y - R, d = Math.sqrt(dx * dx + dy * dy);
      if (d > R - BEAD) {
        var nx = dx / d, ny = dy / d;
        b.x = R + nx * (R - BEAD); b.y = R + ny * (R - BEAD);
        var vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; sfxWall(); }
      }
    }
    // the bar: where the bead lands on it sets the angle it leaves at
    if (b.vy > 0 && b.y + BEAD >= BAR_Y && b.y - BEAD <= BAR_Y + BAR_H && Math.abs(b.x - barX) <= barW / 2 + BEAD) {
      var t = Math.max(-1, Math.min(1, (b.x - barX) / (barW / 2)));
      var a = t * 1.08;
      b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp;
      b.y = BAR_Y - BEAD;
      combo = 0; quiet = 0;
      sfxBar();
    }
    // the panes round it (one knock a step)
    var c0 = Math.floor((b.x - BEAD - GX) / CW), c1 = Math.floor((b.x + BEAD - GX) / CW);
    var r0 = Math.floor((b.y - BEAD - GY) / CH), r1 = Math.floor((b.y + BEAD - GY) / CH);
    for (var r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++) {
      for (var c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) {
        var p = grid[r][c];
        if (!p || p.broken) continue;
        var qx = Math.max(p.x, Math.min(b.x, p.x + CW)), qy = Math.max(p.y, Math.min(b.y, p.y + CH));
        var ex = b.x - qx, ey = b.y - qy;
        if (ex * ex + ey * ey > BEAD * BEAD) continue;
        // knocked back off the face it met
        if (Math.abs(ex) > Math.abs(ey) || (ex === 0 && ey === 0 && Math.abs(b.vx) > Math.abs(b.vy))) {
          b.vx = (ex !== 0 ? Math.sign(ex) : -Math.sign(b.vx)) * Math.abs(b.vx);
          b.x = qx + (ex !== 0 ? Math.sign(ex) : -Math.sign(b.vx || 1)) * BEAD;
        } else {
          b.vy = (ey !== 0 ? Math.sign(ey) : -Math.sign(b.vy)) * Math.abs(b.vy);
          b.y = qy + (ey !== 0 ? Math.sign(ey) : -Math.sign(b.vy || 1)) * BEAD;
        }
        breakPane(p, b);
        // stone round and round: a little turn now and then breaks the loop
        if (p.max === 0 && quiet > 8) { var tw = (Math.random() - 0.5) * 0.5, cs = Math.cos(tw), sn = Math.sin(tw); var vx = b.vx * cs - b.vy * sn; b.vy = b.vx * sn + b.vy * cs; b.vx = vx; }
        return;
      }
    }
  }
  // the bead keeps its speed, and never flies too flat to come back down
  function trim(b) {
    var sp = speed(), v = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
    b.vx *= sp / v; b.vy *= sp / v;
    if (Math.abs(b.vy) < sp * 0.28) {
      b.vy = (b.vy < 0 ? -1 : 1) * sp * 0.28;
      b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(sp * sp - b.vy * b.vy);
    }
  }

  function update(dt) {
    if (state !== "play") { age(dt); return; }
    if (litT > 0) {
      litT -= dt;
      for (var i = 0; i < panes.length; i++) if (panes[i].broken) panes[i].lit = Math.min(1, panes[i].lit + dt * 2.5);
      age(dt);
      if (litT <= 0) {
        if (win + 1 >= WINDOWS.length) { gameOver(true); return; }
        loadWindow(win + 1);
      }
      return;
    }
    // the bar
    var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) barX += dir * BAR_SPEED * dt;
    if (wideT > 0) { wideT -= dt; if (wideT <= 0) wideT = 0; }
    if (slowT > 0) { slowT -= dt; if (slowT <= 0) slowT = 0; }
    var want = wideT > 0 ? WIDE_W : BAR_W;
    barW += (want - barW) * Math.min(1, dt * 10);
    barX = Math.max(barW / 2, Math.min(FW - barW / 2, barX));
    quiet += dt;

    if (serving) { var s0 = balls[0]; s0.x = barX; s0.y = BAR_Y - BEAD - 1; }
    else {
      for (var k = balls.length - 1; k >= 0; k--) {
        var b = balls[k];
        var n = Math.max(1, Math.ceil(speed() * dt / 4));
        for (var j = 0; j < n && state === "play" && litT <= 0; j++) { stepBall(b, dt / n); trim(b); }
        if (litT > 0 || state !== "play") return;
        if (fx()) { b.trail.push([b.x, b.y]); if (b.trail.length > 8) b.trail.shift(); } else b.trail.length = 0;
        if (b.y > FH + BEAD * 2) balls.splice(k, 1);
      }
      if (!balls.length) { loseBead(); if (state !== "play") return; }
    }
    // the jewels fall, and are caught by the bar
    for (var q = jewels.length - 1; q >= 0; q--) {
      var jw = jewels[q];
      jw.y += jw.vy * dt;
      if (jw.y + 9 >= BAR_Y && jw.y - 9 <= BAR_Y + BAR_H && Math.abs(jw.x - barX) <= barW / 2 + 8) { jewels.splice(q, 1); catchJewel(jw); continue; }
      if (jw.y > FH + 20) jewels.splice(q, 1);
    }
    for (var m = 0; m < panes.length; m++) if (panes[m].broken && panes[m].lit < 1) panes[m].lit = fx() ? Math.min(1, panes[m].lit + dt * 2.5) : 1;
    age(dt);
  }
  function age(dt) {
    for (var i = shards.length - 1; i >= 0; i--) {
      var s = shards[i];
      s.age += dt; s.vy += 900 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      if (s.age > 1.1 || s.y > FH + 40) shards.splice(i, 1);
    }
    for (var k = pops.length - 1; k >= 0; k--) { pops[k].age += dt; if (pops[k].age > 1) pops.splice(k, 1); }
  }

  // ---- drawing ---------------------------------------------------------------------
  function drawPane(p) {
    var col = GLASS[p.hue], x = p.x, y = p.y, w = CW, h = CH;
    if (p.max === 0) {
      var st = g.createLinearGradient(x, y, x, y + h);
      st.addColorStop(0, "#a49cae"); st.addColorStop(1, "#6a6375");
      g.fillStyle = st; g.fillRect(x, y, w, h);
      g.strokeStyle = "rgba(255, 255, 255, 0.25)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 2, y + h - 2); g.lineTo(x + 2, y + 2); g.lineTo(x + w - 2, y + 2); g.stroke();
    } else {
      var thick = p.max === 2;
      var gr = g.createLinearGradient(x, y, x + w * 0.6, y + h);
      gr.addColorStop(0, thick ? col[1] : col[0]); gr.addColorStop(1, thick ? col[2] : col[1]);
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      // the glass's own streaks
      g.strokeStyle = "rgba(255, 255, 255, 0.22)"; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x + 4 + p.seed * 2, y + 3); g.lineTo(x + 9 + p.seed * 2, y + h - 4); g.stroke();
      if (thick) { g.strokeStyle = "rgba(255, 255, 255, 0.3)"; g.strokeRect(x + 4, y + 4, w - 8, h - 8); }
      if (thick && p.hp === 1) {
        // cracked: one more knock breaks it
        g.strokeStyle = "rgba(255, 255, 255, 0.85)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.5); g.lineTo(x + 3, y + 2); g.moveTo(x + w * 0.5, y + h * 0.5); g.lineTo(x + w - 4, y + h - 3);
        g.moveTo(x + w * 0.5, y + h * 0.5); g.lineTo(x + w * 0.8, y + 1); g.stroke();
      }
    }
    g.strokeStyle = "#15121a"; g.lineWidth = 2.6;
    g.strokeRect(x, y, w, h);
  }
  function drawLit(p) {
    // the evening through the empty came: a warm haze, never as bright as
    // glass still in place (so it can't be taken for a pane)
    var a = p.lit;
    g.fillStyle = "rgba(255, 206, 140, " + (0.26 * a).toFixed(3) + ")";
    g.fillRect(p.x, p.y, CW, CH);
    g.strokeStyle = "rgba(12, 10, 16, 0.5)"; g.lineWidth = 1.2;
    g.strokeRect(p.x, p.y, CW, CH);
  }
  function drawBar() {
    var x = barX - barW / 2, y = BAR_Y, w = barW, h = BAR_H;
    var gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "#fbe39a"); gr.addColorStop(0.5, "#c9973a"); gr.addColorStop(1, "#7a5418");
    g.fillStyle = gr;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, h / 2); else g.rect(x, y, w, h);
    g.fill();
    g.strokeStyle = "#3a2608"; g.lineWidth = 1.5; g.stroke();
    // a ruby bead at each end
    g.fillStyle = "#c3304a";
    g.beginPath(); g.arc(x + h / 2, y + h / 2, 3.2, 0, 7); g.arc(x + w - h / 2, y + h / 2, 3.2, 0, 7); g.fill();
  }
  function drawBall(b) {
    if (b.trail.length) {
      for (var i = 0; i < b.trail.length; i++) {
        var t = b.trail[i], a = (i + 1) / (b.trail.length + 1);
        g.fillStyle = "rgba(255, 236, 180, " + (0.28 * a).toFixed(3) + ")";
        g.beginPath(); g.arc(t[0], t[1], BEAD * (0.5 + 0.5 * a), 0, 7); g.fill();
      }
    }
    var glow = g.createRadialGradient(b.x, b.y, 1, b.x, b.y, BEAD * 3.2);
    glow.addColorStop(0, "rgba(255, 244, 200, 0.6)"); glow.addColorStop(1, "rgba(255, 220, 140, 0)");
    g.fillStyle = glow; g.beginPath(); g.arc(b.x, b.y, BEAD * 3.2, 0, 7); g.fill();
    g.fillStyle = "#fffbe8"; g.beginPath(); g.arc(b.x, b.y, BEAD, 0, 7); g.fill();
  }
  var JEWEL_COL = { wide: "sapphire", three: "emerald", slow: "amber" };
  function drawJewel(j) {
    var col = GLASS[JEWEL_COL[j.kind]], x = j.x, y = j.y;
    g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 9, y); g.lineTo(x, y + 10); g.lineTo(x - 9, y); g.closePath();
    var gr = g.createLinearGradient(x - 9, y - 10, x + 9, y + 10);
    gr.addColorStop(0, col[0]); gr.addColorStop(1, col[2]);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = "#15121a"; g.lineWidth = 2; g.stroke();
    // what it gives, drawn on its face
    g.strokeStyle = "#fffbe8"; g.fillStyle = "#fffbe8"; g.lineWidth = 1.6;
    if (j.kind === "wide") { g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.moveTo(x - 5, y); g.lineTo(x - 2.5, y - 2.5); g.moveTo(x - 5, y); g.lineTo(x - 2.5, y + 2.5); g.moveTo(x + 5, y); g.lineTo(x + 2.5, y - 2.5); g.moveTo(x + 5, y); g.lineTo(x + 2.5, y + 2.5); g.stroke(); }
    else if (j.kind === "three") { [[0, -3.5], [-3.2, 2.4], [3.2, 2.4]].forEach(function (d) { g.beginPath(); g.arc(x + d[0], y + d[1], 1.7, 0, 7); g.fill(); }); }
    else { g.beginPath(); g.moveTo(x - 3.5, y - 4.5); g.lineTo(x + 3.5, y - 4.5); g.lineTo(x - 3.5, y + 4.5); g.lineTo(x + 3.5, y + 4.5); g.closePath(); g.stroke(); }
  }
  // a line of text on the glass, outlined in lead (uncial: the title hand)
  function text(str, x, y, size, col, uncial) {
    g.font = uncial ? size + "px \"Uncial Antiqua\", serif" : "700 " + size + "px Alegreya, Georgia, serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 4; g.strokeStyle = "rgba(10, 8, 14, 0.85)"; g.strokeText(str, x, y);
    g.fillStyle = col; g.fillText(str, x, y);
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bg, 0, 0);
    g.setTransform(dpr * S, 0, 0, dpr * S, dpr * OX, dpr * OY);
    var i;
    // (everything that moves stays inside the window: shards don't fly out over the stone)
    g.save(); archPath(g, -1.5); g.clip();
    for (i = 0; i < panes.length; i++) if (panes[i].broken) drawLit(panes[i]);
    for (i = 0; i < panes.length; i++) if (!panes[i].broken) drawPane(panes[i]);
    if (state === "menu") { g.restore(); return; }
    for (i = 0; i < jewels.length; i++) drawJewel(jewels[i]);
    drawBar();
    for (i = 0; i < balls.length; i++) drawBall(balls[i]);
    for (i = 0; i < shards.length; i++) {
      var s = shards[i];
      g.save(); g.translate(s.x, s.y); g.rotate(s.rot);
      g.globalAlpha = Math.max(0, 1 - s.age / 1.1);
      g.fillStyle = s.col; g.beginPath(); g.moveTo(-s.s, -s.s * 0.6); g.lineTo(s.s, -s.s * 0.2); g.lineTo(-s.s * 0.2, s.s); g.closePath(); g.fill();
      g.restore();
    }
    g.restore();
    // floating words: they rise and fade with Visual FX on, and hold still
    // while they last with it off
    for (i = 0; i < pops.length; i++) {
      var q = pops[i], rise = fx() ? q.age * 26 : 0;
      g.globalAlpha = fx() ? Math.max(0, 1 - q.age) : 1;
      text(q.text, q.x, q.y - rise, 17, q.col);
      g.globalAlpha = 1;
    }
    if (state === "play" && litT > 0) {
      text("Window " + ROMAN[win] + " is lit", R, 470, 30, "#ffe7a8", true);
      if (win + 1 < WINDOWS.length) text("next: " + WINDOWS[win + 1].name, R, 508, 18, "#efe5cf");
    } else if (state === "play" && serving) {
      text(ROMAN[win] + " · " + WINDOWS[win].name, R, 470, 24, "#ffe7a8", true);
      g.font = "600 16px Alegreya, Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#efe5cf";
      if (window.GameShell && GameShell.drawKeys) GameShell.drawKeys(g, "[Space] or a click sends the light", R, 508, { touch: "tap to send the light" });
      else g.fillText("Space or a click sends the light", R, 508);
    }
  }

  // ---- the loop, the pause and the way out -----------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    // on the card: the same mode from its first window, or back to the modes
    restart: function () { startRun(mode); },
    menu: toMenu
  }) : { isPaused: function () { return false; } };
  // Leaving asks first once the light has been sent (paused or not; nothing
  // is lost before then)
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && launched; },
    pausable: P
  });

  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (!P.isPaused()) update(dt);
    draw();
  }

  // ---- input -----------------------------------------------------------------------
  var downAt = null;
  function aim(e) {
    if (state !== "play" || P.isPaused()) return;
    barX = toWinX(e.clientX);
  }
  cv.addEventListener("pointermove", aim);
  cv.addEventListener("pointerdown", function (e) {
    if (state !== "play" || P.isPaused()) return;
    e.preventDefault();
    downAt = { x: e.clientX, t: performance.now() };
    aim(e);
    // a mouse click sends the light at once; a finger sends it when it lifts
    // without having dragged (a drag only moves the bar)
    if (e.pointerType === "mouse") launch();
  });
  cv.addEventListener("pointerup", function (e) {
    if (e.pointerType !== "mouse" && downAt && Math.abs(e.clientX - downAt.x) < 12) launch();
    downAt = null;
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (state !== "play" || P.isPaused()) return;
    var k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") { keys.left = true; e.preventDefault(); }
    else if (k === "ArrowRight" || k === "d" || k === "D") { keys.right = true; e.preventDefault(); }
    else if (k === " " || k === "Enter" || k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); if (!e.repeat) launch(); }
  });
  document.addEventListener("keyup", function (e) {
    var k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") keys.left = false;
    if (k === "ArrowRight" || k === "d" || k === "D") keys.right = false;
  });
  window.addEventListener("blur", function () { keys.left = keys.right = false; });

  // ---- the menu and the end card ----------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === mode);
    });
    var parts = [];
    Object.keys(MODES).forEach(function (m) { if (bests[m] && bests[m].get()) parts.push(MODES[m].name + " " + bests[m].get()); });
    $("bests").textContent = parts.length ? "best: " + parts.join(" · ") : "no windows lit yet";
  }
  function toMenu() {
    state = "menu";
    balls = []; jewels = []; shards = []; pops = [];
    panes = glaze(0);
    $("over").hidden = true; $("hud").hidden = true; $("menu").hidden = false;
    paintMenu();
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-v");
      store.set("rosewindow_mode", mode);
      paintMenu();
    });
    // a mouse click doesn't take focus (Tab still reaches it): left focused,
    // the Enter that should start would press the mode again
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);
  if (window.GameShell && GameShell.menuKeys) {
    // the modes take 1 and 2, and Space or Enter lights the windows
    GameShell.menuKeys({ active: function () { return state === "menu"; }, groups: ["#pick-mode button"], start: "#play", space: true });
    // the end card: Space or Enter again (not in its first moments, so a key
    // still down from play can't skip it), Backspace back to the modes;
    // Esc is left alone, and leaves for the games page
    GameShell.menuKeys({ active: function () { return state === "over" && performance.now() - overAt > OVER_WAIT; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }], start: "#again", space: true });
  }

  layout();
  window.addEventListener("resize", layout);
  toMenu();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness drives runs through these
  window.RoseWindow = {
    state: function () { return state; },
    mode: function () { return mode; },
    score: function () { return score; },
    beads: function () { return beads; },
    win: function () { return win; },
    left: left,
    serving: function () { return serving; },
    lit: function () { return litT > 0; },
    balls: function () { return balls.map(function (b) { return { x: b.x, y: b.y, vx: b.vx, vy: b.vy }; }); },
    bar: function () { return { x: barX, w: barW, y: BAR_Y }; },
    panes: function () { return panes.map(function (p) { return { c: p.c, r: p.r, x: p.x, y: p.y, hue: p.hue, hp: p.hp, max: p.max, broken: p.broken }; }); },
    windows: function () { return WINDOWS.map(function (w, i) { return { name: w.name, panes: glaze(i).map(function (p) { return [p.c, p.r, p.max]; }) }; }); },
    geo: function () { return { FW: FW, FH: FH, R: R, S: S, OX: OX, OY: OY, CW: CW, CH: CH }; },
    start: startRun,
    toMenu: toMenu,
    launch: launch,
    setBar: function (x) { barX = x; },
    // break every breakable pane but n (the window's last ones are left to the bead)
    breakAllBut: function (n) {
      var keep = n || 0;
      for (var i = panes.length - 1; i >= 0; i--) {
        var p = panes[i];
        if (p.broken || p.max === 0) continue;
        if (keep > 0) { keep--; continue; }
        p.broken = true; p.lit = 1; broken++;
      }
    },
    knock: function (i) { var p = panes.filter(function (q) { return !q.broken && q.max > 0; })[i || 0]; if (p) breakPane(p, null); },
    drop: function (kind) { jewels.push({ kind: kind, x: barX, y: BAR_Y - 40, vy: 110 }); },
    loseBall: function () { balls = []; serving = false; loseBead(); },
    gameOver: gameOver
  };
})();
