/* Steamfitter — lay copper pipe ahead of the rising water. Classic
   place-from-the-queue plumbing: the water starts after a countdown and must
   travel at least the level's quota of pipe segments before it spills. */
(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;

  var COLS = 9, ROWS = 7, TS = 64;
  var OX = (W - COLS * TS) / 2, OY = (H - ROWS * TS) / 2;

  // ---- pipe geometry ----------------------------------------------------------
  var PORTS = { H: ["W", "E"], V: ["N", "S"], NE: ["N", "E"], NW: ["N", "W"], SE: ["S", "E"], SW: ["S", "W"], X: ["N", "S", "E", "W"],
    J: ["N", "E", "S", "W"],   // 4-way junction
    CN: ["N"], CE: ["E"], CS: ["S"], CW: ["W"],
    TN: ["E", "W", "N"], TE: ["N", "S", "E"], TS: ["E", "W", "S"], TW: ["N", "S", "W"] };   // T-junctions: 3 ports
  // Connectivity groups: which ports flow into each other. X is a crossover,
  // TWO independent channels; J is a 4-way junction and a T a 3-way one (water
  // can turn either way); a cap is a single dead-end port.
  var GROUPS = { H: [["W", "E"]], V: [["N", "S"]], NE: [["N", "E"]], NW: [["N", "W"]], SE: [["S", "E"]], SW: [["S", "W"]],
    X: [["N", "S"], ["E", "W"]], J: [["N", "E", "S", "W"]], CN: [["N"]], CE: [["E"]], CS: [["S"]], CW: [["W"]],
    TN: [["E", "W", "N"]], TE: [["N", "S", "E"]], TS: [["E", "W", "S"]], TW: [["N", "S", "W"]] };
  var T_BAR = { TN: "H", TS: "H", TE: "V", TW: "V" }, T_STEM = { TN: "N", TS: "S", TE: "E", TW: "W" };   // caps: one port, sealed end
  function isCap(type) { return type.charAt(0) === "C"; }
  function isJunction(type) { return type === "J" || type.charAt(0) === "T"; }
  var OPP = { N: "S", S: "N", E: "W", W: "E" };
  var DXY = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  var PORT_PT = { N: [0, -TS / 2], S: [0, TS / 2], E: [TS / 2, 0], W: [-TS / 2, 0] };
  // quarter-bend arcs: centre corner + the angle of each port around it
  var BENDS = {
    NE: { cx: TS / 2, cy: -TS / 2, ang: { N: Math.PI, E: Math.PI / 2 } },
    NW: { cx: -TS / 2, cy: -TS / 2, ang: { N: 0, W: Math.PI / 2 } },
    SE: { cx: TS / 2, cy: TS / 2, ang: { S: Math.PI, E: 3 * Math.PI / 2 } },
    SW: { cx: -TS / 2, cy: TS / 2, ang: { S: 0, W: -Math.PI / 2 } },
  };
  function exitFor(type, enter) {
    if (type === "X" || type === "J") return OPP[enter];
    var p = PORTS[type];
    return p[0] === enter ? p[1] : p[0];
  }
  function accepts(type, enter) { return PORTS[type].indexOf(enter) >= 0; }
  function axisOf(enter) { return enter === "N" || enter === "S" ? "V" : "H"; }

  // ---- sound -----------------------------------------------------------------
  var actx = null;
  function ac() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  ["pointerdown", "keydown", "touchend"].forEach(function (t) {
    document.addEventListener(t, function () { ac(); }, true);
  });
  function tone(f, dur, type, vol, delay, slide) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    var c = ac(); if (!c) return;
    var t = c.currentTime, n = c.sampleRate * dur | 0;
    var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 900;
    var g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t);
  }
  function sfxPlace() { tone(140, 0.08, "square", 0.12, 0, 90); noise(0.06, 0.1, 2000); }
  function sfxReplace() { tone(320, 0.05, "square", 0.1); tone(180, 0.09, "square", 0.12, 0.04, 110); }
  function sfxTick(ff) { tone(ff ? 560 : 440, 0.06, "triangle", 0.1); }
  function sfxCross() { [520, 660, 880].forEach(function (f, i) { tone(f, 0.1, "triangle", 0.12, i * 0.05); }); }
  function sfxSpill() { noise(0.6, 0.4, 700); tone(220, 0.5, "sawtooth", 0.14, 0, 60); }
  function sfxLevel() { [392, 523, 659, 784].forEach(function (f, i) { tone(f, 0.16, "triangle", 0.14, i * 0.08); }); }
  function sfxOver() { [330, 262, 208, 156].forEach(function (f, i) { tone(f, 0.28, "sawtooth", 0.12, i * 0.13); }); }
  function sfxDenied() { tone(170, 0.09, "square", 0.1, 0, 120); }
  function sfxCap() { tone(700, 0.05, "square", 0.1); tone(520, 0.06, "square", 0.1, 0.06); tone(130, 0.16, "sine", 0.14, 0.12, 80); }

  // ---- sprites -----------------------------------------------------------------
  function mkCanvas(s) { var c = document.createElement("canvas"); c.width = c.height = s; return c; }
  function pipePath(g, type) {
    g.beginPath();
    if (type === "H") { g.moveTo(-TS / 2, 0); g.lineTo(TS / 2, 0); }
    else if (type === "V") { g.moveTo(0, -TS / 2); g.lineTo(0, TS / 2); }
    else if (BENDS[type]) {
      var b = BENDS[type], p = PORTS[type];
      var a0 = b.ang[p[0]], a1 = b.ang[p[1]];
      g.arc(b.cx, b.cy, TS / 2, a0, a1, a0 > a1);
    }
    else if (isCap(type)) {
      var cp = PORT_PT[PORTS[type][0]];
      g.moveTo(cp[0], cp[1]); g.lineTo(0, 0);
    }
  }
  function strokePipeBody(g, type) {
    [[30, "#3c2517"], [24, "#a35f33"], [16, "#c07a45"]].forEach(function (l) {
      g.lineWidth = l[0]; g.strokeStyle = l[1]; g.lineCap = "butt";
      pipePath(g, type); g.stroke();
    });
    g.lineWidth = 6; g.strokeStyle = "rgba(240,190,140,0.5)"; // top sheen
    pipePath(g, type); g.stroke();
  }
  function flange(g, port) {
    var p = PORT_PT[port];
    var horiz = port === "E" || port === "W";
    g.save();
    g.translate(p[0], p[1]);
    g.fillStyle = "#8a6a2e";
    g.strokeStyle = "#2a2015";
    g.lineWidth = 2;
    if (horiz) { g.fillRect(-5, -17, 10, 34); g.strokeRect(-5, -17, 10, 34); }
    else { g.fillRect(-17, -5, 34, 10); g.strokeRect(-17, -5, 34, 10); }
    g.fillStyle = "#e2c06a";
    var rp = horiz ? [[0, -12], [0, 12]] : [[-12, 0], [12, 0]];
    rp.forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], 2.2, 0, 7); g.fill(); });
    g.restore();
  }
  var SPR = {};
  function buildSprites() {
    Object.keys(PORTS).forEach(function (type) {
      var c = mkCanvas(TS), g = c.getContext("2d");
      g.translate(TS / 2, TS / 2);
      if (type === "X") {
        // a crossover: two separate channels, so the across pipe bridges over
        // the down pipe (no junction ring; that look belongs to the T)
        strokePipeBody(g, "V");
        g.fillStyle = "rgba(0,0,0,0.5)";               // the bridge's shadow on the pipe beneath
        g.fillRect(-15, -20, 30, 40);
        strokePipeBody(g, "H");
        [-17, 17].forEach(function (x) {                // collars where it clears the lower pipe
          g.fillStyle = "#8a6a2e"; g.strokeStyle = "#2a2015"; g.lineWidth = 1.5;
          g.fillRect(x - 2.5, -16, 5, 32); g.strokeRect(x - 2.5, -16, 5, 32);
        });
      } else if (type === "J") {
        // a 4-way junction: one chamber, so it wears the T's junction ring
        strokePipeBody(g, "V");
        strokePipeBody(g, "H");
        g.lineWidth = 4; g.strokeStyle = "#3c2517";
        g.beginPath(); g.arc(0, 0, 15, 0, 7); g.stroke();
        g.lineWidth = 2; g.strokeStyle = "#c9a24b";
        g.beginPath(); g.arc(0, 0, 15, 0, 7); g.stroke();
      } else if (type.charAt(0) === "T") {
        strokePipeBody(g, T_BAR[type]);
        var sp = PORT_PT[T_STEM[type]];
        [[30, "#3c2517"], [24, "#a35f33"], [16, "#c07a45"]].forEach(function (l) {
          g.lineWidth = l[0]; g.strokeStyle = l[1]; g.lineCap = "butt";
          g.beginPath(); g.moveTo(0, 0); g.lineTo(sp[0], sp[1]); g.stroke();
        });
        g.lineWidth = 4; g.strokeStyle = "#3c2517";
        g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke();
        g.lineWidth = 2; g.strokeStyle = "#c9a24b";
        g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke();
      } else {
        strokePipeBody(g, type);
      }
      if (isCap(type)) {
        // the bolted cap plate that seals the stub
        g.fillStyle = "#8a6a2e"; g.strokeStyle = "#2a2015"; g.lineWidth = 3;
        g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill(); g.stroke();
        g.fillStyle = "#e2c06a";
        g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill();
        g.strokeStyle = "#8a6a2e"; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, 8, 0, 7); g.stroke();
        [[0, -11], [11, 0], [0, 11], [-11, 0]].forEach(function (q) {
          g.fillStyle = "#3c2517";
          g.beginPath(); g.arc(q[0], q[1], 2.2, 0, 7); g.fill();
        });
      }
      PORTS[type].forEach(function (p) { flange(g, p); });
      SPR[type] = c;
    });
    // the floor plate every cell sits on
    var t = mkCanvas(TS), g2 = t.getContext("2d");
    g2.fillStyle = "#24282e";
    g2.fillRect(0, 0, TS, TS);
    g2.strokeStyle = "rgba(0,0,0,0.5)"; g2.lineWidth = 2;
    g2.strokeRect(1, 1, TS - 2, TS - 2);
    g2.strokeStyle = "rgba(255,255,255,0.05)";
    g2.strokeRect(3, 3, TS - 6, TS - 6);
    g2.fillStyle = "#171a1e";
    [[7, 7], [TS - 7, 7], [7, TS - 7], [TS - 7, TS - 7]].forEach(function (p) {
      g2.beginPath(); g2.arc(p[0], p[1], 2.4, 0, 7); g2.fill();
    });
    SPR.plate = t;
    // blocked cell: riveted hazard plate
    var b = mkCanvas(TS), g3 = b.getContext("2d");
    g3.drawImage(t, 0, 0);
    g3.fillStyle = "#31353c";
    g3.fillRect(6, 6, TS - 12, TS - 12);
    g3.save();
    g3.beginPath(); g3.rect(6, 6, TS - 12, TS - 12); g3.clip();
    g3.strokeStyle = "rgba(232,182,76,0.4)"; g3.lineWidth = 7;
    for (var k = -2; k < 5; k++) { g3.beginPath(); g3.moveTo(k * 22 - 10, TS + 6); g3.lineTo(k * 22 + 28, -6); g3.stroke(); }
    g3.restore();
    g3.strokeStyle = "#14161a"; g3.lineWidth = 3;
    g3.strokeRect(6, 6, TS - 12, TS - 12);
    SPR.block = b;
  }
  buildSprites();

  // ---- state -------------------------------------------------------------------
  var best = window.GameShell ? GameShell.best("steamfitter_best", { higher: true }) : { get: function () { return 0; }, submit: function () {} };
  var puzzleBest = window.GameShell ? GameShell.best("steamfitter_puzzle_best", { higher: true }) : { get: function () { return 0; }, submit: function () {} };
  var mode = (function () { try { var m = localStorage.getItem("steamfitter_mode"); if (m === "panic" || m === "puzzle" || m === "levels") return m; } catch (e) {} return "levels"; })();
  var grid, queue, state, level, score, goal, distance;
  var drainR = -1, moves = 0, flowing = false, pathLen = 0, flowPath = null, flowIdx = 0, queueSel = 0;
  var srcR, srcC, srcDir;
  var water, countdown, ffHeld = false;
  var doneSegs, particles, hoverRC = null;
  var spillAt = null;   // {x, y} where the water spilled; its puddle stays until the board resets
  var bannerTimer = 0;
  function reduced() { return !!(window.RM_ON && window.RM_ON()); }

  var ROT = { H: "V", V: "H", NE: "SE", SE: "SW", SW: "NW", NW: "NE", X: "X", J: "J",
    CN: "CE", CE: "CS", CS: "CW", CW: "CN",
    TN: "TE", TE: "TS", TS: "TW", TW: "TN" }; // 90° clockwise
  function typeFor(a, b) { // the piece whose two ports are a and b
    var k = [a, b].sort().join("");
    return { EW: "H", NS: "V", EN: "NE", NW: "NW", ES: "SE", SW: "SW" }[k];
  }
  var PIECES = ["H", "V", "NE", "NW", "SE", "SW", "X"];
  function rndPiece() {
    var r = Math.random();
    if (r < 0.17) return "H";
    if (r < 0.34) return "V";
    if (r < 0.80) return ["NE", "NW", "SE", "SW"][(Math.random() * 4) | 0];
    if (r < 0.90) return "X";
    return ["CN", "CE", "CS", "CW"][(Math.random() * 4) | 0];   // a cap
  }

  function newBoard() {
    grid = [];
    for (var r = 0; r < ROWS; r++) {
      grid.push([]);
      for (var c = 0; c < COLS; c++) grid[r].push({ kind: "empty" });
    }
    // the source: somewhere with at least 3 cells of runway
    var tries = 0;
    while (true) {
      srcR = 1 + (Math.random() * (ROWS - 2) | 0);
      srcC = 1 + (Math.random() * (COLS - 2) | 0);
      var dirs = ["N", "S", "E", "W"].filter(function (d) {
        var rr = srcR + DXY[d][1] * 3, cc = srcC + DXY[d][0] * 3;
        return rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS;
      });
      if (dirs.length || tries++ > 60) { srcDir = dirs[(Math.random() * dirs.length) | 0] || "E"; break; }
    }
    grid[srcR][srcC] = { kind: "src" };
    // blocked plates from level 2 on — never right in front of the tap
    var frontR = srcR + DXY[srcDir][1], frontC = srcC + DXY[srcDir][0];
    var nBlocks = Math.min(6, Math.max(0, level - 1));
    var placed = 0, guard = 0;
    while (placed < nBlocks && guard++ < 200) {
      var br = Math.random() * ROWS | 0, bc = Math.random() * COLS | 0;
      if (grid[br][bc].kind !== "empty") continue;
      if (br === frontR && bc === frontC) continue;
      grid[br][bc] = { kind: "block" };
      placed++;
    }
    queue = [];
    queueSel = 0;
    for (var q = 0; q < 5; q++) queue.push(rndPiece());
    water = null;
    doneSegs = []; spillAt = null;
    distance = 0;
    goal = 6 + level * 2;
    countdown = Math.max(5, 15 - level);
    document.getElementById("level").textContent = level;
    refreshHud();
  }

  // Puzzle mode: a scrambled pipeline from the tank to the drain. Click a
  // piece to turn it a quarter clockwise; when the line connects, the water
  // runs it on its own.
  function newPuzzle() {
    grid = [];
    for (var r = 0; r < ROWS; r++) {
      grid.push([]);
      for (var c = 0; c < COLS; c++) grid[r].push({ kind: "empty" });
    }
    srcR = 1 + (Math.random() * (ROWS - 2) | 0);
    srcC = 0; srcDir = "E";
    drainR = 1 + (Math.random() * (ROWS - 2) | 0);
    grid[srcR][0] = { kind: "src" };
    grid[drainR][COLS - 1] = { kind: "drain" };
    // carve a path (rs,1) → (drainR, COLS-2) by random DFS; take the longest
    // of several tries so later levels wander more
    var want = Math.min(26, 6 + level * 2);
    var bestPath = null;
    for (var attempt = 0; attempt < 60; attempt++) {
      var path = carvePath();
      if (path && (!bestPath || Math.abs(path.length - want) < Math.abs(bestPath.length - want))) bestPath = path;
      if (bestPath && bestPath.length >= want) break;
    }
    var cells = bestPath;
    pathLen = cells.length;
    // derive the correct piece for every path cell, then scramble it
    for (var i = 0; i < cells.length; i++) {
      var enter = i === 0 ? "W" : OPP[dirBetween(cells[i - 1], cells[i])];
      var exit = i === cells.length - 1 ? "E" : dirBetween(cells[i], cells[i + 1]);
      var t = typeFor(enter, exit);
      grid[cells[i].r][cells[i].c] = { kind: "pipe", type: t, fillA: 0, fillB: 0, dirA: null, dirB: null };
    }
    // from level 3 the odd 4-way junction stands in for a path piece: it
    // connects every way, so it never needs turning (and is never the first
    // piece, which the anti-solved nudge below turns)
    if (level >= 3) for (i = 1; i < cells.length - 1; i++) {
      if (Math.random() < Math.min(0.12, 0.03 * (level - 2))) grid[cells[i].r][cells[i].c].type = "J";
    }
    // decoy pipes on some empty plates
    var decoyP = Math.min(0.45, 0.15 + level * 0.05);
    for (var rr = 0; rr < ROWS; rr++) for (var cc = 0; cc < COLS; cc++) {
      if (grid[rr][cc].kind === "empty" && Math.random() < decoyP) {
        var dt = level >= 3 && Math.random() < 0.08 ? "J" : PIECES[(Math.random() * 6) | 0];
        grid[rr][cc] = { kind: "pipe", type: dt, fillA: 0, fillB: 0, dirA: null, dirB: null, decoy: true };
      }
    }
    // scramble every piece, then make sure it isn't accidentally solved
    for (rr = 0; rr < ROWS; rr++) for (cc = 0; cc < COLS; cc++) {
      var cell = grid[rr][cc];
      if (cell.kind !== "pipe") continue;
      var spins = (Math.random() * 4) | 0;
      for (var sp2 = 0; sp2 < spins; sp2++) cell.type = ROT[cell.type];
    }
    if (traceConnected()) { var f = grid[cells[0].r][cells[0].c]; f.type = ROT[f.type]; }
    // junctions can open other routes, so keep turning path pieces (never a
    // junction, which turning can't change) until the line really is broken
    for (var guard = 0; guard < 60 && traceConnected(); guard++) {
      var pk = cells[(Math.random() * cells.length) | 0], pc = grid[pk.r][pk.c];
      if (pc.type !== "J") pc.type = ROT[pc.type];
    }
    water = null; doneSegs = []; spillAt = null; distance = 0; goal = pathLen;
    moves = 0; flowing = false; countdown = 0;
    document.getElementById("level").textContent = level;
    refreshHud();
  }
  function dirBetween(a, b) {
    if (b.c > a.c) return "E"; if (b.c < a.c) return "W";
    return b.r > a.r ? "S" : "N";
  }
  function carvePath() {
    var visited = {};
    var out = null;
    function key(r, c) { return r + "," + c; }
    function dfs(r, c, path) {
      if (out) return;
      visited[key(r, c)] = true;
      path.push({ r: r, c: c });
      if (r === drainR && c === COLS - 2) { out = path.slice(); }
      else {
        var dirs = ["N", "S", "E", "W"].sort(function () { return Math.random() - 0.5; });
        for (var i = 0; i < dirs.length && !out; i++) {
          var nr = r + DXY[dirs[i]][1], nc = c + DXY[dirs[i]][0];
          if (nr < 0 || nr >= ROWS || nc < 1 || nc > COLS - 2) continue;
          if (visited[key(nr, nc)]) continue;
          if (nr === srcR && nc === 1 && !(r === srcR && c === 1)) continue;
          dfs(nr, nc, path);
        }
      }
      if (!out) { path.pop(); visited[key(r, c)] = false; }
    }
    dfs(srcR, 1, []);
    return out;
  }
  // the ports you can leave through, having entered on `enter`
  function groupExits(type, enter) {
    var gs = GROUPS[type]; if (!gs) return [];
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].indexOf(enter) >= 0) { var out = []; for (var j = 0; j < gs[i].length; j++) if (gs[i][j] !== enter) out.push(gs[i][j]); return out; }
    }
    return [];
  }
  function hasPort(type, port) { return PORTS[type] && PORTS[type].indexOf(port) >= 0; }
  // BFS over (cell, entered-port) from the tank to the drain. Returns the flow
  // path — [{r,c,enter,exit,vtype}] — or null when not connected. Handles T and
  // X (two channels) uniformly via GROUPS.
  function findFlowPath() {
    var sc = grid[srcR] && grid[srcR][1];
    if (!sc || sc.kind !== "pipe") return null;
    var key = function (r, c, e) { return r + "," + c + "," + e; };
    var q = [{ r: srcR, c: 1, enter: "W" }], seen = {}, prev = {};
    seen[key(srcR, 1, "W")] = true;
    while (q.length) {
      var cur = q.shift(), cell = grid[cur.r][cur.c];
      if (!cell || cell.kind !== "pipe") continue;
      var exits = groupExits(cell.type, cur.enter);
      for (var i = 0; i < exits.length; i++) {
        var ex = exits[i], nr = cur.r + DXY[ex][1], nc = cur.c + DXY[ex][0];
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        var nb = grid[nr][nc]; if (!nb) continue;
        if (nb.kind === "drain") return rebuildPath(prev, cur, ex);
        if (nb.kind !== "pipe") continue;
        var ne = OPP[ex]; if (!hasPort(nb.type, ne)) continue;
        var k = key(nr, nc, ne); if (seen[k]) continue;
        seen[k] = true; prev[k] = { r: cur.r, c: cur.c, enter: cur.enter, exit: ex };
        q.push({ r: nr, c: nc, enter: ne });
      }
    }
    return null;
  }
  function rebuildPath(prev, last, lastExit) {
    var chain = [{ r: last.r, c: last.c, enter: last.enter, exit: lastExit }];
    var k = last.r + "," + last.c + "," + last.enter, pn = prev[k], guard = 0;
    while (pn && guard++ < 200) {
      chain.unshift({ r: pn.r, c: pn.c, enter: pn.enter, exit: pn.exit });
      k = pn.r + "," + pn.c + "," + pn.enter; pn = prev[k];
    }
    for (var i = 0; i < chain.length; i++) {
      var seg = chain[i];
      var ct = grid[seg.r][seg.c].type;
      // tees and crossovers keep their own type: waterPath draws a tee through
      // its junction and a crossover's down channel under its bridge
      seg.vtype = isJunction(ct) || ct === "X" ? ct
        : (seg.exit === OPP[seg.enter]) ? (axisOf(seg.enter) === "V" ? "V" : "H") : typeFor(seg.enter, seg.exit);
    }
    return chain;
  }
  function traceConnected() { return !!findFlowPath(); }
  function rotateAt(r, c) {
    if (state !== "play" || flowing) return;
    var cell = grid[r] && grid[r][c];
    if (!cell || cell.kind !== "pipe") { sfxDenied(); return; }
    cell.type = ROT[cell.type];
    moves++;
    sfxReplace();
    refreshHud();
    if (traceConnected()) {
      flowing = true;
      score += Math.max(50, 300 - moves * 5);
      startWater();
      noise(0.25, 0.2, 600);
    }
  }

  function reset() {
    state = "play";
    level = 1; score = 0;
    particles = [];
    editing = false;
    document.getElementById("levelSelect").classList.add("hidden");
    document.getElementById("editor").classList.add("hidden");
    document.body.dataset.screen = "";
    if (mode === "levels") { showSelect(); }
    else if (mode === "puzzle") newPuzzle();
    else newBoard();
    document.getElementById("overScreen").classList.add("hidden");
    refreshHud();
  }
  function setMode(m) {
    mode = m;
    var how = document.getElementById("howLine");
    if (how) how.textContent = m === "panic"
      ? panicHint()
      : "Click a pipe to turn it a quarter clockwise — connect the tank to the drain.";
    try { localStorage.setItem("steamfitter_mode", m); } catch (e) {}
    document.body.dataset.mode = m;
    document.querySelectorAll("#modeBar .mbtn").forEach(function (b) {
      b.classList.toggle("sel", b.dataset.mode === m);
    });
    reset();
  }

  function refreshHud() {
    var rot = mode === "puzzle" || mode === "levels";
    document.getElementById("score").textContent = rot ? moves : score;
    document.getElementById("scoreLbl").textContent = rot ? "Moves" : "Score";
    if (mode === "levels") { document.getElementById("best").textContent = doneCount() + "/" + LV.length; document.getElementById("bestLbl").textContent = "Solved"; }
    else if (mode === "puzzle") { document.getElementById("best").textContent = Math.max(puzzleBest.get(), level); document.getElementById("bestLbl").textContent = "Best level"; }
    else { document.getElementById("best").textContent = Math.max(best.get(), score); document.getElementById("bestLbl").textContent = "Best"; }
    drawQueue();
  }

  // ---- placing ------------------------------------------------------------------
  function place(r, c) {
    if (state !== "play") return;
    var cell = grid[r] && grid[r][c];
    if (!cell) return;
    if (cell.kind === "src" || cell.kind === "block") { sfxDenied(); return; }
    if (cell.kind === "pipe") {
      if (cell.fillA > 0 || cell.fillB > 0) { sfxDenied(); return; } // watered pipe is welded shut
      if (water && water.r === r && water.c === c) { sfxDenied(); return; } // water is inside it right now
      score = Math.max(0, score - 25); // demolition fee
      sfxReplace();
    } else {
      sfxPlace();
    }
    grid[r][c] = { kind: "pipe", type: queue.splice(queueSel, 1)[0], fillA: 0, fillB: 0, dirA: null, dirB: null };
    queue.push(rndPiece());
    queueSel = 0;
    puff(OX + c * TS + TS / 2, OY + r * TS + TS / 2);
    refreshHud();
  }

  // ---- water --------------------------------------------------------------------
  function waterSpeed() {
    if (mode === "puzzle" || mode === "levels") return 3.2; // the victory lap shouldn't dawdle
    return (0.55 + level * 0.07) * (ffHeld ? 6 : 1);
  }
  function startWater() {
    if (mode === "puzzle" || mode === "levels") {
      flowPath = findFlowPath();
      if (!flowPath || !flowPath.length) { spill(edgePoint(srcR, 1, "W")); return; }
      goal = flowPath.length; flowIdx = 0;
      var s0 = flowPath[0];
      water = { r: s0.r, c: s0.c, enter: s0.enter, exit: s0.exit, vtype: s0.vtype, t: 0 };
      return;
    }
    var r = srcR + DXY[srcDir][1], c = srcC + DXY[srcDir][0];
    enterCell(r, c, OPP[srcDir], true);
  }
  function enterCell(r, c, enter, isFirst) {
    var edgePt = edgePoint(r, c, enter);
    var cell = grid[r] && grid[r][c];
    if (cell && cell.kind === "drain") {
      if (enter === "W") return drainReached();
      return spill(edgePt);
    }
    if (!cell || cell.kind === "empty" || cell.kind === "block" || cell.kind === "src" || !accepts(cell.type, enter)) {
      return spill(edgePt);
    }
    if (cell.type === "X") {
      var axis = axisOf(enter);
      if (axis === "V" ? cell.fillB > 0 && cell.dirB && axisOf(cell.dirB) === "V" || cell.fillA > 0 && cell.dirA && axisOf(cell.dirA) === "V"
                       : cell.fillB > 0 && cell.dirB && axisOf(cell.dirB) === "H" || cell.fillA > 0 && cell.dirA && axisOf(cell.dirA) === "H") {
        return spill(edgePt); // that channel already ran
      }
    } else if (cell.fillA > 0) {
      return spill(edgePt); // simple pipe already used
    }
    water = { r: r, c: c, enter: enter, t: 0 };
    if (isFirst) { /* the tap gurgles open */ noise(0.25, 0.2, 600); }
  }
  function edgePoint(r, c, enter) {
    var x = OX + c * TS + TS / 2, y = OY + r * TS + TS / 2;
    var p = PORT_PT[enter];
    return { x: x + p[0], y: y + p[1] };
  }
  function completeFlowSegment() {
    var seg = flowPath[flowIdx];
    doneSegs.push({ r: seg.r, c: seg.c, type: seg.vtype, enter: seg.enter, exit: seg.exit });
    distance++; flowIdx++;
    sfxTick(false);
    refreshHud();
    if (flowIdx >= flowPath.length) { drainReached(); return; }
    var nx = flowPath[flowIdx];
    water = { r: nx.r, c: nx.c, enter: nx.enter, exit: nx.exit, vtype: nx.vtype, t: 0 };
  }
  function completeSegment() {
    var cell = grid[water.r][water.c];
    if (cell.fillA === 0 || cell.dirA === water.enter) { cell.fillA = 1; cell.dirA = water.enter; }
    else { cell.fillB = 1; cell.dirB = water.enter; score += 300; sfxCross(); scorePop(water.r, water.c, "+300"); }
    distance++;
    score += ffHeld ? 100 : 50;
    sfxTick(ffHeld);
    doneSegs.push({ r: water.r, c: water.c, type: cell.type, enter: water.enter });
    if (isCap(cell.type)) return capped(water.r, water.c);
    var exit = exitFor(cell.type, water.enter);
    var nr = water.r + DXY[exit][1], nc = water.c + DXY[exit][0];
    refreshHud();
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return spill(edgePoint(water.r, water.c, exit));
    enterCell(nr, nc, OPP[exit]);
  }
  function capped(r, c) {
    water = null;
    sfxCap();
    if (distance >= goal) {
      state = "levelend";
      score += 250;
      scorePop(r, c, "SEALED +250");
      sfxLevel();
      banner("LINE CAPPED — LEVEL " + (level + 1));
      bannerTimer = 1.8;
    } else {
      state = "over";
      best.submit(score);
      sfxOver();
      document.getElementById("overTitle").textContent = "Capped too soon!";
      document.getElementById("overDetail").textContent =
        "The cap sealed the line at " + distance + " of the " + goal + " pipes it needed.";
      document.getElementById("finalScore").textContent = score;
      document.getElementById("overBest").textContent = score >= best.get() ? "★ New best!" : "Best: " + best.get();
      document.getElementById("overScreen").classList.remove("hidden");
    }
    refreshHud();
  }
  function drainReached() {
    water = null;
    if (mode === "levels") {
      state = "levelend";
      if (testingEditor) { sfxLevel(); banner("TEST PASSED \u2014 it connects!"); bannerTimer = 1.4; refreshHud(); return; }
      if (!isCustom && curLevel >= 0) {
        progress.done[curLevel] = true;
        var pb = progress.best[curLevel];
        if (pb == null || moves < pb) progress.best[curLevel] = moves;
        saveProgress();
      }
      sfxLevel();
      banner((isCustom ? "CUSTOM" : "LEVEL " + (curLevel + 1)) + " SOLVED — " + moves + " moves");
      bannerTimer = 1.8;
      refreshHud();
      return;
    }
    state = "levelend";
    score += 150;
    puzzleBest.submit(level + 1);
    sfxLevel();
    banner("PIPELINE SEALED — LEVEL " + (level + 1));
    bannerTimer = 1.8;
    refreshHud();
  }
  function spill(pt) {
    water = null;
    sfxSpill();
    spillAt = { x: pt.x, y: pt.y };   // the puddle, in both modes; the spray below is Visual FX only
    for (var i = 0; i < (reduced() ? 0 : 26); i++) {
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 180;
      particles.push({ x: pt.x, y: pt.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, t: 0, life: 0.6 + Math.random() * 0.4, col: "#57d9cf", s: 2 + Math.random() * 3 });
    }
    if (distance >= goal) {
      state = "levelend";
      score += 200;
      sfxLevel();
      banner("SECTION SEALED — LEVEL " + (level + 1));
      bannerTimer = 1.8;
    } else {
      gameOver();
    }
  }
  function gameOver() {
    state = "over";
    best.submit(score);
    sfxOver();
    document.getElementById("overTitle").textContent = "The boiler flooded!";
    document.getElementById("overDetail").textContent =
      "The water ran " + distance + " of the " + goal + " pipes it needed.";
    document.getElementById("finalScore").textContent = score;
    document.getElementById("overBest").textContent = score >= best.get() ? "★ New best!" : "Best: " + best.get();
    document.getElementById("overScreen").classList.remove("hidden");
  }
  function banner(txt) {
    var el = document.getElementById("levelBanner");
    el.textContent = txt;
    el.classList.remove("hidden");
  }
  function hideBanner() { document.getElementById("levelBanner").classList.add("hidden"); }

  function puff(x, y) {
    if (reduced()) return;
    for (var i = 0; i < 6; i++) {
      particles.push({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, t: 0, life: 0.5, col: "rgba(200,205,214,0.5)", s: 4 + Math.random() * 4, steam: true });
    }
  }
  function scorePop(r, c, txt) {
    particles.push({ x: OX + c * TS + TS / 2, y: OY + r * TS, y0: OY + r * TS, vx: 0, vy: -30, t: 0, life: 0.8, txt: txt });
  }
  // The spill, drawn still in both modes: a puddle with a crown of drops at
  // the spot the water got out. It stays until the next board.
  function drawSpill(g, s) {
    g.save();
    g.translate(s.x, s.y);
    g.fillStyle = "rgba(46,169,160,0.88)";
    g.beginPath();
    g.ellipse(0, 6, 24, 11, 0, 0, 7);
    g.ellipse(-14, 2, 12, 8, -0.3, 0, 7);
    g.ellipse(13, 3, 13, 7, 0.25, 0, 7);
    g.fill();
    g.fillStyle = "rgba(140,238,230,0.8)";
    g.beginPath(); g.ellipse(-4, 3, 9, 3.5, 0, 0, 7); g.fill();
    g.fillStyle = "#57d9cf";
    [[-17, -12, 3.2], [-8, -19, 2.6], [3, -22, 3.4], [13, -16, 2.6], [20, -8, 2.2]].forEach(function (d) {
      g.beginPath(); g.arc(d[0], d[1], d[2], 0, 7); g.fill();
    });
    g.restore();
  }

  // ---- update -------------------------------------------------------------------
  function update(dt) {
    if (state === "levelend") {
      bannerTimer -= dt;
      if (bannerTimer <= 0) {
        hideBanner();
        if (mode === "levels") { if (testingEditor) resumeEditor("Test passed \u2014 Save it, or keep editing."); else showSelect(); }
        else { level++; state = "play"; if (mode === "puzzle") newPuzzle(); else newBoard(); }
      }
    }
    if (state === "play") {
      if (mode === "panic" && !water && countdown > 0) {
        countdown -= dt * (ffHeld ? 10 : 1);
        if (countdown <= 0) { countdown = 0; startWater(); }
      } else if (water) {
        water.t += waterSpeed() * dt;
        while (water && water.t >= 1) {
          var carry = water.t - 1;
          if (mode === "puzzle" || mode === "levels") completeFlowSegment(); else completeSegment();
          if (water) water.t = carry;
        }
      }
    }
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.steam && !p.txt) p.vy += 500 * dt;
    }
  }

  // ---- drawing ------------------------------------------------------------------
  function waterPath(g, type, enter, t0, t1, exit) {
    // stroke the watered stretch of a piece from progress t0 to t1 (0..1)
    g.beginPath();
    if (type === "H" || type === "V" || type === "X") {
      var axis = type === "X" ? axisOf(enter) : type;
      var from = PORT_PT[enter];
      var to = PORT_PT[OPP[enter]];
      if (type !== "X" && axis === "H" && enter !== "W" && enter !== "E") { from = PORT_PT[PORTS[type][0]]; to = PORT_PT[PORTS[type][1]]; }
      var line = function (a, b) {
        g.moveTo(from[0] + (to[0] - from[0]) * a, from[1] + (to[1] - from[1]) * a);
        g.lineTo(from[0] + (to[0] - from[0]) * b, from[1] + (to[1] - from[1]) * b);
      };
      // a crossover's down channel runs under the bridge, out of sight
      var h0 = (TS / 2 - 20) / TS, h1 = 1 - h0;
      if (type === "X" && axis === "V") {
        if (t0 < h0) line(t0, Math.min(t1, h0));
        if (t1 > h1) line(Math.max(t0, h1), t1);
      } else line(t0, t1);
    } else if (isJunction(type)) {
      // a tee or 4-way junction: water runs port → centre → port along the
      // pipe (no curve), and once it reaches the junction it fills the spare
      // arms too, out to their flanges, as water would
      var ex = exit || exitFor(type, enter), pa = PORT_PT[enter], pz = PORT_PT[ex];
      var at = function (t) { return t <= 0.5 ? [pa[0] * (1 - 2 * t), pa[1] * (1 - 2 * t)] : [pz[0] * (2 * t - 1), pz[1] * (2 * t - 1)]; };
      var q0 = at(t0), q1 = at(t1);
      g.moveTo(q0[0], q0[1]);
      if (t0 < 0.5 && t1 > 0.5) g.lineTo(0, 0);
      g.lineTo(q1[0], q1[1]);
      if (t1 > 0.5) PORTS[type].forEach(function (port) {
        if (port === enter || port === ex) return;
        // a dead end: stop short so the rounded tip stays inside the flange
        var q = PORT_PT[port], k = (t1 - 0.5) * 2 * (TS / 2 - 8) / (TS / 2);
        g.moveTo(0, 0); g.lineTo(q[0] * k, q[1] * k);
      });
    } else if (isCap(type)) {
      var fromC = PORT_PT[enter];
      g.moveTo(fromC[0] * (1 - t0), fromC[1] * (1 - t0));
      g.lineTo(fromC[0] * (1 - t1), fromC[1] * (1 - t1));
    } else {
      var b = BENDS[type];
      var a0 = b.ang[enter], a1 = b.ang[exitFor(type, enter)];
      var s = a0 + (a1 - a0) * t0, e = a0 + (a1 - a0) * t1;
      g.arc(b.cx, b.cy, TS / 2, s, e, a1 < a0);
    }
  }
  function strokeWater(g, type, enter, t0, t1, head, exit) {
    g.save();
    g.lineCap = "round";
    g.shadowColor = "rgba(87,217,207,0.7)";
    g.shadowBlur = reduced() ? 0 : 8;
    g.lineWidth = 13; g.strokeStyle = "#2ea9a0";
    waterPath(g, type, enter, t0, t1, exit); g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 6; g.strokeStyle = "#8ceee6";
    waterPath(g, type, enter, t0, t1, exit); g.stroke();
    g.restore();
  }

  function drawSource(g) {
    g.save();
    g.translate(OX + srcC * TS + TS / 2, OY + srcR * TS + TS / 2);
    // spout toward the flow direction
    var p = PORT_PT[srcDir];
    g.strokeStyle = "#3c2517"; g.lineWidth = 26; g.lineCap = "butt";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(p[0], p[1]); g.stroke();
    g.strokeStyle = "#a35f33"; g.lineWidth = 20;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(p[0], p[1]); g.stroke();
    flange(g, srcDir);
    // brass tank
    g.fillStyle = "#c9a24b";
    g.strokeStyle = "#5d4a1e"; g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 20, 0, 7);
    g.fill(); g.stroke();
    g.fillStyle = "#e8cf86";
    g.beginPath(); g.arc(-6, -6, 6, 0, 7); g.fill();
    // valve wheel
    g.strokeStyle = "#8a2d22"; g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, 11, 0, 7); g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-11, 0); g.lineTo(11, 0);
    g.moveTo(0, -11); g.lineTo(0, 11);
    g.stroke();
    // pre-flow arrow pulses at the spout (with Visual FX off it stays lit, steady)
    if (!water && state === "play" && countdown > 0) {
      var a = reduced() ? 0.75 : 0.4 + 0.4 * Math.sin(performance.now() / 250);
      g.fillStyle = "rgba(87,217,207," + a.toFixed(2) + ")";
      g.save();
      g.translate(p[0] * 1.35, p[1] * 1.35);
      g.rotate(srcDir === "E" ? 0 : srcDir === "W" ? Math.PI : srcDir === "S" ? Math.PI / 2 : -Math.PI / 2);
      g.beginPath(); g.moveTo(-4, -8); g.lineTo(8, 0); g.lineTo(-4, 8); g.closePath(); g.fill();
      g.restore();
    }
    g.restore();
  }

  function drawDrain(g) {
    g.save();
    g.translate(OX + (COLS - 1) * TS + TS / 2, OY + drainR * TS + TS / 2);
    var p = PORT_PT.W;
    g.strokeStyle = "#3c2517"; g.lineWidth = 26; g.lineCap = "butt";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(p[0], p[1]); g.stroke();
    g.strokeStyle = "#a35f33"; g.lineWidth = 20;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(p[0], p[1]); g.stroke();
    flange(g, "W");
    g.fillStyle = "#57d9cf";
    g.strokeStyle = "#1e5a55"; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#bdf3ee";
    g.beginPath(); g.arc(-6, -6, 6, 0, 7); g.fill();
    g.fillStyle = "#1e5a55";
    g.font = "700 17px 'Saira Condensed', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("OUT", 0, 1);
    g.restore();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!grid) return; // select screen: the DOM overlay covers the board
    var r, c;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      ctx.drawImage(SPR.plate, OX + c * TS, OY + r * TS);
      var cell = grid[r][c];
      if (cell.kind === "block") ctx.drawImage(SPR.block, OX + c * TS, OY + r * TS);
      if (cell.kind === "pipe") ctx.drawImage(SPR[cell.type], OX + c * TS, OY + r * TS);
    }
    // watered history + the advancing head
    var i, seg;
    for (i = 0; i < doneSegs.length; i++) {
      seg = doneSegs[i];
      ctx.save();
      ctx.translate(OX + seg.c * TS + TS / 2, OY + seg.r * TS + TS / 2);
      strokeWater(ctx, seg.type, seg.enter, 0, 1, false, seg.exit);
      ctx.restore();
    }
    if (water) {
      var wc = grid[water.r][water.c];
      ctx.save();
      ctx.translate(OX + water.c * TS + TS / 2, OY + water.r * TS + TS / 2);
      strokeWater(ctx, water.vtype || wc.type, water.enter, 0, Math.min(1, water.t), true, water.exit);
      ctx.restore();
    }
    if (srcR >= 0 && srcR < ROWS) drawSource(ctx);
    if ((mode === "puzzle" || mode === "levels" || state === "edit") && drainR >= 0 && drainR < ROWS) drawDrain(ctx);
    // ghost preview of the next piece under the cursor
    if (hoverRC && state === "play" && mode === "panic") {
      var hc = grid[hoverRC.r][hoverRC.c];
      var can = hc.kind === "empty" || (hc.kind === "pipe" && !hc.fillA && !hc.fillB);
      ctx.globalAlpha = can ? 0.45 : 0.15;
      ctx.drawImage(SPR[queue[0]], OX + hoverRC.c * TS, OY + hoverRC.r * TS);
      if (!can) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "#d94f3d"; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(OX + hoverRC.c * TS + 16, OY + hoverRC.r * TS + 16);
        ctx.lineTo(OX + hoverRC.c * TS + TS - 16, OY + hoverRC.r * TS + TS - 16);
        ctx.moveTo(OX + hoverRC.c * TS + TS - 16, OY + hoverRC.r * TS + 16);
        ctx.lineTo(OX + hoverRC.c * TS + 16, OY + hoverRC.r * TS + TS - 16);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (hoverRC && state === "play" && (mode === "puzzle" || mode === "levels") && !flowing) {
      var hcell = grid[hoverRC.r][hoverRC.c];
      if (hcell.kind === "pipe") {
        ctx.strokeStyle = "rgba(232,182,76,0.7)";
        ctx.lineWidth = 3;
        ctx.strokeRect(OX + hoverRC.c * TS + 3, OY + hoverRC.r * TS + 3, TS - 6, TS - 6);
      }
    }
    if (hoverRC && state === "edit") {
      ctx.strokeStyle = "rgba(240,201,106,0.85)"; ctx.lineWidth = 3;
      ctx.strokeRect(OX + hoverRC.c * TS + 2, OY + hoverRC.r * TS + 2, TS - 4, TS - 4);
    }
    if (spillAt) drawSpill(ctx, spillAt);
    // particles + score pops
    for (i = 0; i < particles.length; i++) {
      var p = particles[i], k = p.t / p.life;
      if (p.txt) {
        // a score pop rises and fades; with Visual FX off it holds still and
        // solid where it appeared until its life runs out (update() drops it)
        var still = reduced();
        ctx.globalAlpha = still ? 1 : 1 - k;
        ctx.fillStyle = "#e8b64c";
        ctx.font = "700 20px 'Saira Condensed', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.txt, p.x, still ? p.y0 : p.y);
      } else {
        ctx.globalAlpha = (1 - k) * (p.steam ? 0.5 : 0.9);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (p.steam ? 1 + k : 1), 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (state !== "edit") drawGauge();
  }

  // ---- side canvases (HiDPI) ------------------------------------------------------
  var DPR2 = Math.min(window.devicePixelRatio || 1, 3);
  function hiDpi(id, cssW, cssH) {
    var el = document.getElementById(id);
    el.style.width = cssW + "px"; el.style.height = cssH + "px";
    el.width = Math.round(cssW * DPR2); el.height = Math.round(cssH * DPR2);
    var g = el.getContext("2d");
    g.setTransform(DPR2, 0, 0, DPR2, 0, 0);
    return g;
  }
  var narrow = window.matchMedia("(max-width: 900px)").matches;
  var queueCtx = narrow ? hiDpi("queue", 220, 52) : hiDpi("queue", 80, 330);
  function drawQueue() {
    if (!queue) return; // puzzle mode has no piece queue
    var g = queueCtx;
    if (narrow) {
      g.clearRect(0, 0, 220, 52);
      for (var i = 0; i < 5; i++) {
        var x = 8 + i * 42;
        g.save(); g.translate(x + 18, 26); g.scale(0.55, 0.55);
        g.drawImage(SPR[queue[i]], -TS / 2, -TS / 2);
        g.restore();
        if (i === queueSel) { g.strokeStyle = "#e8b64c"; g.lineWidth = 2; g.strokeRect(x - 2, 4, 41, 44); }
      }
    } else {
      g.clearRect(0, 0, 80, 330);
      for (var j = 0; j < 5; j++) {
        var y = 290 - j * 64;
        g.save(); g.translate(40, y); g.scale(0.82, 0.82);
        g.drawImage(SPR[queue[j]], -TS / 2, -TS / 2);
        g.restore();
        if (j === queueSel) { g.strokeStyle = "#e8b64c"; g.lineWidth = 2.5; g.strokeRect(9, y - 30, 62, 61); }
      }
    }
  }
  var gaugeCtx = hiDpi("gauge", 120, 120);
  function drawGauge() {
    var g = gaugeCtx;
    g.clearRect(0, 0, 120, 120);
    var cx = 60, cy = 66, R = 48;
    g.fillStyle = "#1b1e23";
    g.beginPath(); g.arc(cx, cy, R + 7, 0, 7); g.fill();
    g.strokeStyle = "#c9a24b"; g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, R + 5, 0, 7); g.stroke();
    var A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    // the quota mark: past this needle position, the section is safe
    g.strokeStyle = "rgba(87,217,207,0.85)"; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, R - 3, A1 - 0.0001 - 0.16, A1); g.stroke();
    g.strokeStyle = "#4a4f57"; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, R - 3, A0, A1 - 0.18); g.stroke();
    for (var k = 0; k <= 8; k++) {
      var a = A0 + (A1 - A0) * k / 8;
      g.strokeStyle = "#8f9096"; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R - 9), cy + Math.sin(a) * (R - 9));
      g.lineTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3));
      g.stroke();
    }
    var frac = Math.min(1, distance / goal);
    var na = A0 + (A1 - A0) * frac;
    g.strokeStyle = "#d94f3d"; g.lineWidth = 3.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(na) * (R - 12), cy + Math.sin(na) * (R - 12)); g.stroke();
    g.fillStyle = "#c9a24b";
    g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
    g.fillStyle = "#f0e6c8";
    g.font = "700 15px 'Saira Condensed', sans-serif";
    g.textAlign = "center";
    g.fillText(distance + " / " + goal, cx, cy + 26);
    var note = document.getElementById("flowNote");
    if (mode === "puzzle" || mode === "levels") {
      note.textContent = flowing ? "connected — water running!" : (state === "play" ? "rotate the pipes to the drain" : "");
    } else if (state === "play" && !water && countdown > 0) note.textContent = "water in " + Math.ceil(countdown) + "s…";
    else if (water) note.textContent = ffHeld ? "valve open — double points!" : "water rising!";
    else note.textContent = "";
  }

  // ---- input --------------------------------------------------------------------
  function cellAt(e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * W - OX;
    var y = (e.clientY - rect.top) / rect.height * H - OY;
    var c = Math.floor(x / TS), r = Math.floor(y / TS);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r: r, c: c };
  }
  canvas.addEventListener("pointermove", function (e) { hoverRC = cellAt(e); });
  canvas.addEventListener("pointerleave", function () { hoverRC = null; });
  canvas.addEventListener("pointerdown", function (e) {
    var rc = cellAt(e);
    if (!rc) return;
    if (state === "edit") { editorClick(rc); return; }
    if (state !== "play") return;
    if (mode === "puzzle" || mode === "levels") rotateAt(rc.r, rc.c);
    else place(rc.r, rc.c);
  });
  var panicPick = (function () { try { return localStorage.getItem("steamfitter_panicpick") !== "forced"; } catch (e) { return true; } })();
  function panicHint() {
    return panicPick
      ? "Pick a pipe from the queue, then click a plate to lay it — beat the water."
      : "Forced queue — lay the NEXT pipe onto a plate. No choosing. Beat the water!";
  }
  var pickToggle = document.getElementById("pickToggle");
  function updatePickToggle() {
    if (pickToggle) pickToggle.textContent = panicPick ? "Queue: Free ▾" : "Queue: Forced ✦";
    document.body.dataset.pick = panicPick ? "free" : "forced";
  }
  if (pickToggle) pickToggle.addEventListener("click", function () {
    panicPick = !panicPick;
    try { localStorage.setItem("steamfitter_panicpick", panicPick ? "free" : "forced"); } catch (e) {}
    queueSel = 0; updatePickToggle(); drawQueue();
    var how = document.getElementById("howLine"); if (how && mode === "panic") how.textContent = panicHint();
  });
  updatePickToggle();
  var queueEl = document.getElementById("queue");
  if (queueEl) queueEl.addEventListener("pointerdown", function (e) {
    if (mode !== "panic" || !panicPick || !queue || state !== "play") return;
    var rect = queueEl.getBoundingClientRect(), idx;
    if (narrow) idx = Math.round(((e.clientX - rect.left) / rect.width * 220 - 26) / 42);
    else idx = Math.round((290 - (e.clientY - rect.top) / rect.height * 330) / 64);
    if (idx >= 0 && idx < 5) { queueSel = idx; drawQueue(); }
  });
  var ffBtn = document.getElementById("ffBtn");
  function ffOn() { ffHeld = true; }
  function ffOff() { ffHeld = false; }
  ffBtn.addEventListener("pointerdown", ffOn);
  ["pointerup", "pointerleave", "pointercancel"].forEach(function (t) { ffBtn.addEventListener(t, ffOff); });
  document.addEventListener("keydown", function (e) {
    // a space typed into a text field (the editor's level name) is just a space
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    if (e.key === " ") { e.preventDefault(); ffOn(); }
  });
  document.addEventListener("keyup", function (e) { if (e.key === " ") ffOff(); });
  document.getElementById("againBtn").addEventListener("click", reset);

  // ---- pause + loop ---------------------------------------------------------------
  var P = window.GameShell
    ? GameShell.pausable({ canPause: function () { return state === "play"; } })
    : { isPaused: function () { return false; } };

  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!P.isPaused()) {
      update(dt);
      draw();
    }
  }
  document.querySelectorAll("#modeBar .mbtn").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.mode !== mode) setMode(b.dataset.mode);
      else if (mode === "levels") { if (testingEditor) resumeEditor("Back in the editor."); else if (state !== "select") showSelect(); }
    });
    b.classList.toggle("sel", b.dataset.mode === mode);
  });
  document.body.dataset.mode = mode;
  (function () {
    var how = document.getElementById("howLine");
    if (how) how.textContent = mode === "panic"
      ? panicHint()
      : "Click a pipe to turn it a quarter clockwise — connect the tank to the drain.";
  })();
  LV = window.STEAMFITTER_LEVELS || [];
  progress = loadProgress();
  customLevels = loadCustom();
  reset();
  requestAnimationFrame(loop);

  // ============================ LEVELS + EDITOR =============================
  var LV = window.STEAMFITTER_LEVELS || [];
  var DECODE = { ".": { kind: "empty" }, "#": { kind: "block" }, "o": { kind: "src" }, "O": { kind: "drain" },
    "h": "H", "v": "V", "a": "NE", "b": "NW", "c": "SE", "d": "SW", "x": "X", "N": "CN", "E": "CE", "S": "CS", "W": "CW",
    "t": "TN", "u": "TE", "y": "TS", "z": "TW", "j": "J" };
  var ENC = { H: "h", V: "v", NE: "a", NW: "b", SE: "c", SW: "d", X: "x", CN: "N", CE: "E", CS: "S", CW: "W", TN: "t", TE: "u", TS: "y", TW: "z", J: "j" };
  var EDIT_CYCLE = { H: "V", V: "NE", NE: "NW", NW: "SE", SE: "SW", SW: "X", X: "CN", CN: "CE", CE: "CS", CS: "CW", CW: "H" };
  var DEFAULT_ORI = { straight: "H", bend: "NE", cross: "X", junction: "J", cap: "CN", tee: "TN" }; // one distinct pipe per shape family
  var curLevel = -1, editing = false, isCustom = false, editTool = "pipe", editCustomIdx = -1;
  var editStash = null, testingEditor = false;
  var progress = loadProgress(), customLevels = loadCustom();

  function loadProgress() { try { var v = JSON.parse(localStorage.getItem("steamfitter_progress")); if (v && v.done) return v; } catch (e) {} return { done: {}, best: {} }; }
  function saveProgress() { try { localStorage.setItem("steamfitter_progress", JSON.stringify(progress)); } catch (e) {} }
  function loadCustom() { try { var a = JSON.parse(localStorage.getItem("steamfitter_custom")); if (Array.isArray(a)) return a; } catch (e) {} return []; }
  function saveCustom() { try { localStorage.setItem("steamfitter_custom", JSON.stringify(customLevels)); } catch (e) {} }
  function doneCount() { var n = 0; for (var k in progress.done) if (progress.done[k]) n++; return n; }

  function seededRng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function gridFromString(g) {
    var out = [];
    for (var r = 0; r < ROWS; r++) { out.push([]); for (var c = 0; c < COLS; c++) {
      var d = DECODE[g.charAt(r * COLS + c)] || { kind: "empty" };
      if (typeof d === "string") out[r].push({ kind: "pipe", type: d, fillA: 0, fillB: 0, dirA: null, dirB: null });
      else out[r].push({ kind: d.kind });
    } }
    return out;
  }
  function stringFromGrid() {
    var s2 = "";
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var cell = grid[r][c];
      s2 += cell.kind === "pipe" ? ENC[cell.type] : cell.kind === "block" ? "#" : cell.kind === "src" ? "o" : cell.kind === "drain" ? "O" : ".";
    }
    return s2;
  }
  function findEdges() {
    srcR = -1; drainR = -1; srcC = 0; srcDir = "E";
    for (var r = 0; r < ROWS; r++) { if (grid[r][0].kind === "src") srcR = r; if (grid[r][COLS - 1].kind === "drain") drainR = r; }
  }
  // length of the solved path (for the gauge readout), traced before scrambling
  function tracePathLen() {
    var r = srcR, c = 1, enter = "W", n = 0, guard = 0;
    while (guard++ < ROWS * COLS * 2) {
      var cell = grid[r] && grid[r][c];
      if (!cell || cell.kind === "drain") return n;
      if (cell.kind !== "pipe" || !accepts(cell.type, enter)) return n;
      if (isCap(cell.type)) return n; // a cap seals the line
      n++;
      var exit = exitFor(cell.type, enter);
      r += DXY[exit][1]; c += DXY[exit][0]; enter = OPP[exit];
    }
    return n;
  }
  // deterministic scramble; guarantee the start is not already connected
  function scrambleGrid(seed) {
    var rand = seededRng(seed || 1), tries = 0;
    do {
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var cell = grid[r][c];
        if (cell.kind !== "pipe") continue;
        var spins = (rand() * 4) | 0;
        for (var k = 0; k < spins; k++) cell.type = ROT[cell.type];
      }
      tries++;
    } while (traceConnected() && tries < 8);
    if (traceConnected() && grid[srcR] && grid[srcR][1] && grid[srcR][1].kind === "pipe") grid[srcR][1].type = ROT[grid[srcR][1].type];
  }

  function loadLevelData(lv, idx, custom) {
    grid = gridFromString(lv.g);
    srcR = lv.s; drainR = lv.d; srcC = 0; srcDir = "E";
    var _fp = findFlowPath(); goal = _fp ? _fp.length : 0;
    scrambleGrid(((idx + 1) * 2654435761) % 2147483647);
    curLevel = idx; isCustom = !!custom; editing = false;
    water = null; doneSegs = []; spillAt = null; particles = []; distance = 0; moves = 0; flowing = false; countdown = 0;
    state = "play";
    document.getElementById("level").textContent = custom ? "★" : (idx + 1);
    hideSelect();
    document.getElementById("editor").classList.add("hidden");
    document.getElementById("overScreen").classList.add("hidden");
    document.body.dataset.screen = "";
    refreshHud();
  }
  function levelUnlocked(i) { return i === 0 || !!progress.done[i - 1] || !!progress.done[i]; }

  // ---- level select ----
  function showSelect() {
    state = "select"; editing = false; water = null; doneSegs = []; spillAt = null;
    document.body.dataset.screen = "select";
    buildSelectDOM();
    document.getElementById("levelSelect").classList.remove("hidden");
    document.getElementById("editor").classList.add("hidden");
  }
  function hideSelect() { document.getElementById("levelSelect").classList.add("hidden"); }
  function buildSelectDOM() {
    var wrap = document.getElementById("levelSelect");
    var h = '<div class="ls-head"><h2>Levels</h2><span class="ls-prog">' + doneCount() + ' / ' + LV.length + ' solved</span></div>';
    h += '<div class="ls-grid">';
    for (var i = 0; i < LV.length; i++) {
      var open = levelUnlocked(i), done = !!progress.done[i];
      var bm = progress.best[i];
      h += '<button class="ls-cell' + (done ? " done" : "") + (open ? "" : " locked") + '"' + (open ? '' : ' disabled') +
        ' data-act="play" data-i="' + i + '" title="' + LV[i].n.replace(/"/g, "") + '">' +
        '<span class="ls-n">' + (done ? "✓" : open ? (i + 1) : "🔒") + '</span>' +
        '<span class="ls-name">' + LV[i].n + '</span>' +
        (bm != null ? '<span class="ls-best">' + bm + ' mv</span>' : '') + '</button>';
    }
    h += '</div>';
    h += '<div class="ls-head"><h2>Your levels</h2><button class="ls-create" data-act="create">＋ Create a level</button></div>';
    h += '<div class="ls-grid custom">';
    if (!customLevels.length) h += '<div class="ls-empty">No custom levels yet — build one with the editor.</div>';
    for (var j = 0; j < customLevels.length; j++) {
      h += '<button class="ls-cell custom" data-act="playc" data-i="' + j + '"><span class="ls-n">★</span>' +
        '<span class="ls-name">' + (customLevels[j].n || "Level") + '</span>' +
        '<span class="ls-cbtns"><i data-act="editc" data-i="' + j + '">edit</i><i data-act="delc" data-i="' + j + '">del</i></span></button>';
    }
    h += '</div>';
    wrap.innerHTML = h;
  }

  // ---- editor ----
  function startEditor(idx) {
    editing = true; state = "edit"; isCustom = true; editCustomIdx = (idx == null ? -1 : idx);
    document.body.dataset.screen = "edit";
    hideSelect();
    if (idx != null && customLevels[idx]) { grid = gridFromString(customLevels[idx].g); document.getElementById("editName").value = customLevels[idx].n || ""; }
    else {
      grid = [];
      for (var r = 0; r < ROWS; r++) { grid.push([]); for (var c = 0; c < COLS; c++) grid[r].push({ kind: "empty" }); }
      grid[3][0] = { kind: "src" }; grid[3][COLS - 1] = { kind: "drain" };
      document.getElementById("editName").value = "";
    }
    findEdges();
    water = null; doneSegs = []; spillAt = null; particles = []; distance = 0; goal = 0;
    document.getElementById("editor").classList.remove("hidden");
    setEditTool("bend"); editMsg("Drag a pipe onto the grid, then click it to rotate. Save or Test when it connects.");
  }
  function setEditTool(t) { editTool = t; var els = document.querySelectorAll("#editTools .etool"); for (var i = 0; i < els.length; i++) els[i].classList.toggle("sel", els[i].dataset.tool === t); }
  function editMsg(m) { var el = document.getElementById("editMsg"); if (el) el.textContent = m || ""; }
  function editorClick(rc) {
    var r = rc.r, c = rc.c, cell = grid[r][c], rr;
    if (editTool === "src") { if (c !== 0) { sfxDenied(); return; } for (rr = 0; rr < ROWS; rr++) if (grid[rr][0].kind === "src") grid[rr][0] = { kind: "empty" }; grid[r][0] = { kind: "src" }; }
    else if (editTool === "drain") { if (c !== COLS - 1) { sfxDenied(); return; } for (rr = 0; rr < ROWS; rr++) if (grid[rr][COLS - 1].kind === "drain") grid[rr][COLS - 1] = { kind: "empty" }; grid[r][COLS - 1] = { kind: "drain" }; }
    else if (editTool === "block") { if (c === 0 || c === COLS - 1) { sfxDenied(); return; } grid[r][c] = cell.kind === "block" ? { kind: "empty" } : { kind: "block" }; }
    else if (editTool === "erase") { if ((c === 0 || c === COLS - 1) && (cell.kind === "src" || cell.kind === "drain")) { sfxDenied(); return; } grid[r][c] = { kind: "empty" }; }
    else { if (c === 0 || c === COLS - 1) { sfxDenied(); return; } if (cell.kind === "pipe") cell.type = ROT[cell.type]; else grid[r][c] = { kind: "pipe", type: DEFAULT_ORI[editTool] || "NE", fillA: 0, fillB: 0, dirA: null, dirB: null }; }
    findEdges(); sfxReplace();
  }
  function editorValid() {
    findEdges();
    if (srcR < 0) { editMsg("Place a Source on the left edge."); return false; }
    if (drainR < 0) { editMsg("Place a Drain on the right edge."); return false; }
    if (!traceConnected()) { editMsg("The pipes must connect the tank to the drain, drawn as shown."); return false; }
    return true;
  }
  function saveEditor() {
    if (!editorValid()) { sfxDenied(); return; }
    var name = ((document.getElementById("editName").value || "").trim().slice(0, 22)) || "My Level";
    var lv = { n: name, s: srcR, d: drainR, g: stringFromGrid() };
    if (editCustomIdx >= 0) customLevels[editCustomIdx] = lv; else customLevels.push(lv);
    saveCustom(); sfxLevel();
    showSelect();
  }
  function resumeEditor(msg) {
    testingEditor = false;
    editing = true; state = "edit"; isCustom = true;
    document.body.dataset.screen = "edit";
    hideSelect();
    grid = gridFromString(editStash.g);
    document.getElementById("editName").value = editStash.n || "";
    editCustomIdx = editStash.idx;
    findEdges();
    water = null; doneSegs = []; spillAt = null; particles = []; distance = 0; goal = 0;
    document.getElementById("editor").classList.remove("hidden");
    document.getElementById("overScreen").classList.add("hidden");
    setEditTool("bend"); editMsg(msg || "Back in the editor.");
  }
  function testEditor() {
    if (!editorValid()) { sfxDenied(); return; }
    editStash = { g: stringFromGrid(), n: (document.getElementById("editName").value || ""), idx: editCustomIdx };
    testingEditor = true; editing = false;
    loadLevelData({ n: editStash.n || "Test", s: srcR, d: drainR, g: editStash.g }, 0, true);
    editMsg("");
  }

  // wire the select + editor DOM (delegated)
  document.getElementById("levelSelect").addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]"); if (!t) return;
    var act = t.dataset.act, i = parseInt(t.dataset.i, 10);
    if (act === "play") { if (levelUnlocked(i)) loadLevelData(LV[i], i, false); }
    else if (act === "create") startEditor(null);
    else if (act === "playc") loadLevelData(customLevels[i], i, true);
    else if (act === "editc") { e.stopPropagation(); startEditor(i); }
    else if (act === "delc") { e.stopPropagation(); customLevels.splice(i, 1); saveCustom(); buildSelectDOM(); }
  });
  (function wireEditor() {
    var tools = document.getElementById("editTools");
    if (tools) tools.addEventListener("click", function (e) { var b = e.target.closest(".etool"); if (b) setEditTool(b.dataset.tool); });
    var sv = document.getElementById("editSave"); if (sv) sv.addEventListener("click", saveEditor);
    var ts = document.getElementById("editTest"); if (ts) ts.addEventListener("click", testEditor);
    var bk = document.getElementById("editBack"); if (bk) bk.addEventListener("click", showSelect);
    var cl = document.getElementById("editClear"); if (cl) cl.addEventListener("click", function () {
      for (var r = 0; r < ROWS; r++) for (var c = 1; c < COLS - 1; c++) grid[r][c] = { kind: "empty" };
      editMsg("Cleared the middle.");
    });
  })();

  // Drag a distinct pipe shape from the palette onto the grid. Clicking a
  // placed pipe rotates it within its family (no duplicate orientation tools).
  (function editorDrag() {
    var ghost = null, dragShape = null, sx = 0, sy = 0, moved = false;
    function makeGhost(glyph) {
      ghost = document.createElement("div");
      ghost.className = "pipe-ghost";
      ghost.textContent = glyph;
      document.body.appendChild(ghost);
    }
    function moveGhost(x, y) { if (ghost) { ghost.style.left = x + "px"; ghost.style.top = y + "px"; } }
    function onMove(e) {
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 5) { moved = true; var b = document.querySelector('.epipe[data-shape="' + dragShape + '"] .eico'); makeGhost(b ? b.textContent : "➕"); }
      if (moved) moveGhost(e.clientX, e.clientY);
    }
    function onUp(e) {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (ghost) { ghost.remove(); ghost = null; }
      var wasDrop = moved && state === "edit" && dragShape;
      dragShape = null; moved = false;
      if (!wasDrop) return;
      var rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      var gx = (e.clientX - rect.left) / rect.width * W - OX, gy = (e.clientY - rect.top) / rect.height * H - OY;
      var c = Math.floor(gx / TS), r = Math.floor(gy / TS);
      if (r < 0 || r >= ROWS || c <= 0 || c >= COLS - 1) return;
      grid[r][c] = { kind: "pipe", type: DEFAULT_ORI[editShapeAt] || "NE", fillA: 0, fillB: 0, dirA: null, dirB: null };
      findEdges(); sfxPlace();
    }
    var editShapeAt = "bend";
    var tools = document.getElementById("editTools");
    if (tools) tools.addEventListener("pointerdown", function (e) {
      var b = e.target.closest(".epipe"); if (!b) return;
      dragShape = editShapeAt = b.dataset.shape; sx = e.clientX; sy = e.clientY; moved = false;
      setEditTool(dragShape);
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  })();

  // test hook
  window.__game = {
    get grid() { return grid; },
    get queue() { return queue; },
    get state() { return state; },
    get water() { return water; },
    get distance() { return distance; },
    get goal() { return goal; },
    get score() { return score; },
    get level() { return level; },
    get src() { return { r: srcR, c: srcC, dir: srcDir }; },
    setQueue: function (arr) { queue = arr.slice(); drawQueue(); },
    place: place,
    rotateAt: rotateAt,
    traceConnected: traceConnected,
    setMode: setMode,
    get mode() { return mode; },
    get moves() { return moves; },
    get queueSel() { return queueSel; },
    get panicPick() { return panicPick; },
    get drainR() { return drainR; },
    get spillAt() { return spillAt; },
    get particles() { return particles; },
    startNow: function () { countdown = 0.01; },
    reset: reset,
    levelCount: LV.length,
    loadLevel: function (i) { loadLevelData(LV[i], i, false); },
    loadCustomLevel: function (i) { loadLevelData(customLevels[i], i, true); },
    showSelect: showSelect,
    startEditor: startEditor,
    editorClick: editorClick,
    setEditTool: setEditTool,
    saveEditor: saveEditor,
    testEditor: testEditor,
    get curLevel() { return curLevel; },
    get editing() { return editing; },
    get customLevels() { return customLevels; },
    get progress() { return progress; },
  };

  // test hooks — the Playwright harness drives runs through these
  window.PipeMania = {
    setQueue: function (a) { queue = a.slice(); refreshHud(); },
    queueNow: function () { return queue.slice(); },
    placeAt: function (r, c) { place(r, c); },
    cellAt: function (r, c) { return grid[r] && grid[r][c] ? { kind: grid[r][c].kind, type: grid[r][c].type } : null; },
    src: function () { return { r: srcR, c: srcC, dir: srcDir }; },
    setGoal: function (n) { goal = n; },
    flood: function () { countdown = 0.01; },
    stateNow: function () { return state; },
    distanceNow: function () { return distance; },
    modeNow: function () { return mode; }
  };
})();
