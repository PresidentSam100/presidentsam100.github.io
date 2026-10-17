/* =====================================================================
   Tide Pool: match three on a rock pool at low tide. Swap two side by
   side to line up three or more of a kind (scallops, starfish, urchins,
   sea glass, periwinkles, pebbles); they wash away, the rest settle, and
   the tide brings more. Tide mode runs against the clock; Rock pool
   gives a set number of swaps.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  var N = 8, KINDS = 6;
  var NAMES = ["scallop", "starfish", "urchin", "sea glass", "periwinkle", "pebble"];
  var MODES = { tide: { name: "Tide", time: 90 }, pool: { name: "Rock pool", swaps: 25 } };

  // ---- the rules -----------------------------------------------------------------------
  // the board: N*N kinds, row by row from the top
  function runs(b) {
    // every cell in a line of three or more of a kind
    var hit = [];
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var k = b[r * N + c]; if (k < 0) continue;
      if (c <= N - 3 && b[r * N + c + 1] === k && b[r * N + c + 2] === k) { var e = c; while (e < N && b[r * N + e] === k) { hit[r * N + e] = true; e++; } }
      if (r <= N - 3 && b[(r + 1) * N + c] === k && b[(r + 2) * N + c] === k) { var f = r; while (f < N && b[f * N + c] === k) { hit[f * N + c] = true; f++; } }
    }
    var out = []; for (var i = 0; i < N * N; i++) if (hit[i]) out.push(i);
    return out;
  }
  function swapped(b, a, c) { var nb = b.slice(), t = nb[a]; nb[a] = nb[c]; nb[c] = t; return nb; }
  function adjacent(a, c) { var ra = Math.floor(a / N), rc = Math.floor(c / N); return (ra === rc && Math.abs(a - c) === 1) || Math.abs(a - c) === N; }
  // a swap that makes a line, if there is one
  function anyMove(b) {
    for (var i = 0; i < N * N; i++) {
      if (i % N < N - 1 && runs(swapped(b, i, i + 1)).length) return [i, i + 1];
      if (i < N * (N - 1) && runs(swapped(b, i, i + N)).length) return [i, i + N];
    }
    return null;
  }
  // a fresh board: no lines on it, and at least one move
  function deal(rnd) {
    var b;
    do {
      b = [];
      for (var i = 0; i < N * N; i++) {
        var k, tries = 0;
        do { k = Math.floor(rnd() * KINDS); tries++; }
        while (tries < 20 && ((i % N >= 2 && b[i - 1] === k && b[i - 2] === k) || (i >= 2 * N && b[i - N] === k && b[i - 2 * N] === k)));
        b.push(k);
      }
    } while (runs(b).length || !anyMove(b));
    return b;
  }

  // ---- the canvas ------------------------------------------------------------------------
  var cv = $("stage"), g = cv.getContext("2d");
  var dpr = 1, SIZE = 400, CELL = 50;
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var host = $("basin").getBoundingClientRect();
    var rim = (parseFloat(getComputedStyle(cv).borderTopWidth) || 0) * 2;   // (the rock rim round it)
    SIZE = Math.max(160, Math.floor(Math.min(host.width, host.height) - rim));
    CELL = SIZE / N;
    cv.width = Math.round(SIZE * dpr); cv.height = Math.round(SIZE * dpr);
    cv.style.width = SIZE + "px"; cv.style.height = SIZE + "px";
  }

  // ---- sound --------------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // a wash of water: a little noise through a low filter
  function splash(chain) {
    var ac = audio(); if (!ac) return;
    var len = Math.floor(ac.sampleRate * 0.25), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    var src = ac.createBufferSource(), lp = ac.createBiquadFilter(), gn = ac.createGain();
    src.buffer = buf; lp.type = "lowpass"; lp.frequency.value = 900 + chain * 300; gn.gain.value = 0.22;
    src.connect(lp); lp.connect(gn); gn.connect(ac.destination); src.start();
    tone(523 * Math.pow(1.12, chain), 0.18, "sine", 0.05);
  }
  function sfxNo() { tone(180, 0.12, "triangle", 0.06); }
  function sfxEnd() { [784, 659, 523].forEach(function (f, i) { tone(f, 0.4, "sine", 0.06, i * 0.12); }); }

  // ---- the game --------------------------------------------------------------------------------
  var mode = store.get("tidepool_mode", "tide"); if (!MODES[mode]) mode = "tide";
  var bests = {};
  Object.keys(MODES).forEach(function (m) { bests[m] = window.GameShell ? GameShell.best("tidepool_best_" + m, { higher: true }) : null; });
  var state = "menu", board = deal(Math.random), score = 0, runBest = 0, timeLeft = 0, swapsLeft = 0, chainMax = 0, cleared = 0;
  var sel = -1, cursor = 27, keyed = false, busy = false, hintAt = null, idle = 0, overAt = 0, OVER_WAIT = 700;
  var anims = [];   // [{i, fr, fc, t, d}] pieces sliding or settling into place from row fr, column fc (Visual FX on)
  var washing = []; // cells being washed away, shown a moment
  var bubbles = [];
  var STEP_MS = 260;

  function bestNow() { return bests[mode]; }
  function startRun(m) {
    if (m && MODES[m]) mode = m;
    store.set("tidepool_mode", mode);
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    board = deal(Math.random); score = 0; chainMax = 0; cleared = 0; sel = -1; busy = false; hintAt = null; idle = 0; anims = []; washing = []; bubbles = [];
    runBest = bestNow() ? bestNow().get() : 0;
    timeLeft = MODES[mode].time || 0; swapsLeft = MODES[mode].swaps || 0;
    state = "play";
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false;
    layout(); hud();
  }
  function hud() {
    $("hud-score").textContent = score;
    $("hud-left").textContent = mode === "tide" ? Math.ceil(timeLeft) + "s" : swapsLeft + (swapsLeft === 1 ? " swap" : " swaps");
    $("hud-left").classList.toggle("low", mode === "tide" ? timeLeft < 10 : swapsLeft <= 3);
  }
  function addScore(n) {
    score += n;
    if (bestNow() && score > runBest) bestNow().submit(score);
    hud();
  }

  // try a swap; it stands only if it makes a line
  function trySwap(a, c) {
    if (state !== "play" || busy || P.isPaused() || !adjacent(a, c)) return false;
    var nb = swapped(board, a, c);
    hintAt = null; idle = 0;
    if (!runs(nb).length) { sfxNo(); shake = { a: a, c: c, t: 0 }; sel = -1; return false; }
    board = nb; sel = -1;
    // (the two slide past each other)
    if (fx()) anims = [{ i: a, fr: Math.floor(c / N), fc: c % N, t: 0, d: 0.14 }, { i: c, fr: Math.floor(a / N), fc: a % N, t: 0, d: 0.14 }];
    if (mode === "pool") swapsLeft--;
    hud();
    resolve(1);
    return true;
  }
  var shake = null;
  // wash away the lines, settle, bring more; again while lines are left
  function resolve(chain) {
    var hit = runs(board);
    if (!hit.length) {
      busy = false;
      if (!anyMove(board)) { board = deal(Math.random); anims = []; flash("the tide turns the pool over"); }
      if (mode === "pool" && swapsLeft <= 0) finish();
      return;
    }
    busy = true;
    chainMax = Math.max(chainMax, chain);
    cleared += hit.length;
    // points: 10 a piece, more for long lines, doubled by each wave of a chain
    addScore(hit.length * 10 * chain + (hit.length > 3 ? (hit.length - 3) * 20 : 0));
    splash(chain);
    if (chain > 1) flash("tide ×" + chain);
    washing = hit.slice();
    if (fx()) hit.forEach(function (i) { for (var k = 0; k < 3; k++) bubbles.push({ x: (i % N + 0.5) * CELL + (Math.random() - 0.5) * CELL * 0.6, y: (Math.floor(i / N) + 0.5) * CELL, r: 2 + Math.random() * 4, v: 40 + Math.random() * 60, t: 0 }); });
    later(function () {
      hit.forEach(function (i) { board[i] = -1; });
      washing = [];
      settle();
      later(function () { resolve(chain + 1); });
    });
  }
  // the pieces fall into the gaps, and new ones come in from the top
  function settle() {
    anims = [];
    for (var c = 0; c < N; c++) {
      var w = N - 1;
      for (var r = N - 1; r >= 0; r--) {
        var k = board[r * N + c];
        if (k >= 0) { if (w !== r) { board[w * N + c] = k; board[r * N + c] = -1; anims.push({ i: w * N + c, fr: r, fc: c, t: 0 }); } w--; }
      }
      for (var n = w; n >= 0; n--) { board[n * N + c] = Math.floor(Math.random() * KINDS); anims.push({ i: n * N + c, fr: n - (w + 1), fc: c, t: 0 }); }
    }
    if (!fx()) anims = [];
  }
  var timers = [];
  function later(fn) { timers.push(setTimeout(function () { if (state === "play" || state === "over") fn(); }, STEP_MS)); }
  var flashText = "", flashT = 0;
  function flash(t) { flashText = t; flashT = 1.2; }

  function finish() {
    if (state !== "play") return;
    state = "over"; busy = false;
    overAt = performance.now();
    sfxEnd();
    var b = bestNow(), isBest = b && score > 0 ? (b.submit(score) || score > runBest) : false;
    $("over-title").textContent = mode === "tide" ? "The tide is in" : "The pool is still";
    $("over-msg").textContent = score;
    var line = document.createElement("span"), best = document.createElement("span");
    line.textContent = cleared + " washed away · longest chain ×" + Math.max(1, chainMax);
    best.className = "best" + (isBest ? " record" : "");
    best.textContent = isBest ? "a new " + MODES[mode].name.toLowerCase() + " record" : b && b.get() ? "best: " + b.get() : "no record yet";
    $("over-stats").replaceChildren(line, best);
    $("hud").hidden = true;
    $("over").hidden = false;
  }
  function toMenu() {
    timers.forEach(clearTimeout); timers = [];
    state = "menu"; busy = false; sel = -1;
    $("over").hidden = true; $("hud").hidden = true; $("menu").hidden = false;
    paintMenu();
  }

  // ---- the loop -------------------------------------------------------------------------------
  function update(dt) {
    for (var i = anims.length - 1; i >= 0; i--) { anims[i].t += dt / (anims[i].d || 0.22); if (anims[i].t >= 1) anims.splice(i, 1); }
    for (var k = bubbles.length - 1; k >= 0; k--) { var bb = bubbles[k]; bb.t += dt; bb.y -= bb.v * dt; if (bb.t > 0.7) bubbles.splice(k, 1); }
    if (shake) { shake.t += dt; if (shake.t > 0.3) shake = null; }
    if (flashT > 0) flashT -= dt;
    if (state !== "play") return;
    if (mode === "tide" && !busy) { timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; hud(); finish(); return; } hud(); }
    else if (mode === "tide") { timeLeft -= dt; if (timeLeft < 0) timeLeft = 0; hud(); }
    idle += dt;
    if (idle > 7 && !hintAt && !busy) hintAt = anyMove(board);
  }
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    for (var i = 0; i < N * N; i++) {
      var r = Math.floor(i / N), c = i % N, x = c * CELL, y = r * CELL;
      // the sand of each cell, a ripple of light on it
      g.fillStyle = (r + c) % 2 ? "rgba(236, 222, 186, 0.92)" : "rgba(226, 210, 170, 0.92)";
      g.fillRect(x, y, CELL, CELL);
    }
    if (state === "menu") return;
    for (i = 0; i < N * N; i++) {
      var k = board[i]; if (k < 0) continue;
      r = Math.floor(i / N); c = i % N;
      var px = c * CELL, py = r * CELL;
      var an = null; for (var a = 0; a < anims.length; a++) if (anims[a].i === i) an = anims[a];
      if (an) { var e = 1 - Math.pow(1 - an.t, 2); px = (an.fc + (c - an.fc) * e) * CELL; py = (an.fr + (r - an.fr) * e) * CELL; }
      if (shake && (i === shake.a || i === shake.c)) px += Math.sin(shake.t * 60) * 4 * (fx() ? 1 : 0);
      var fade = washing.indexOf(i) >= 0;
      g.globalAlpha = fade ? 0.4 : 1;
      drawPiece(k, px, py, CELL);
      g.globalAlpha = 1;
    }
    // the picked piece, the keyboard's cursor, the hint
    if (sel >= 0) ring(sel, "#ffffff", 3);
    if (keyed && state === "play") ring(cursor, "#ff7a59", 3);
    if (hintAt) { ring(hintAt[0], "rgba(255, 255, 255, 0.85)", 2); ring(hintAt[1], "rgba(255, 255, 255, 0.85)", 2); }
    for (var b = 0; b < bubbles.length; b++) { var bb = bubbles[b]; g.strokeStyle = "rgba(255, 255, 255, " + (0.8 * (1 - bb.t / 0.7)).toFixed(2) + ")"; g.lineWidth = 1.5; g.beginPath(); g.arc(bb.x, bb.y, bb.r, 0, 7); g.stroke(); }
    if (flashT > 0) {
      g.globalAlpha = fx() ? Math.min(1, flashT) : 1;
      g.font = "800 " + Math.round(CELL * 0.55) + "px \"Sniglet\", sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 5; g.strokeStyle = "#0f5d6b"; g.strokeText(flashText, SIZE / 2, SIZE / 2); g.fillStyle = "#fffaf0"; g.fillText(flashText, SIZE / 2, SIZE / 2);
      g.globalAlpha = 1;
    }
  }
  function ring(i, col, w) {
    var x = (i % N) * CELL, y = Math.floor(i / N) * CELL;
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); if (g.roundRect) g.roundRect(x + 3, y + 3, CELL - 6, CELL - 6, CELL * 0.18); else g.rect(x + 3, y + 3, CELL - 6, CELL - 6); g.stroke();
  }
  // the six pieces of the pool
  function drawPiece(k, x, y, s) {
    var cx = x + s / 2, cy = y + s / 2, r = s * 0.36;
    g.save();
    g.fillStyle = "rgba(40, 60, 60, 0.22)"; g.beginPath(); g.ellipse(cx, cy + r * 0.85, r * 0.8, r * 0.22, 0, 0, 7); g.fill();
    if (k === 0) {        // a scallop shell: a fan of ribs
      g.fillStyle = "#f2a07b"; g.beginPath(); g.moveTo(cx, cy + r * 0.9);
      for (var a = -1; a <= 1.001; a += 0.25) g.lineTo(cx + Math.sin(a * 1.2) * r * 1.05, cy + r * 0.9 - Math.cos(a * 1.2) * r * 1.7);
      g.closePath(); g.fill();
      g.strokeStyle = "#c86a47"; g.lineWidth = s * 0.03;
      for (a = -0.75; a <= 0.76; a += 0.25) { g.beginPath(); g.moveTo(cx, cy + r * 0.85); g.lineTo(cx + Math.sin(a * 1.2) * r * 0.95, cy + r * 0.9 - Math.cos(a * 1.2) * r * 1.55); g.stroke(); }
    } else if (k === 1) { // a starfish
      g.fillStyle = "#e8742a"; g.beginPath();
      for (var p = 0; p < 10; p++) { var rr = p % 2 ? r * 0.45 : r * 1.1, an = -Math.PI / 2 + p * Math.PI / 5; g.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr); }
      g.closePath(); g.fill();
      g.fillStyle = "#ffd2a8"; for (p = 0; p < 5; p++) { var a2 = -Math.PI / 2 + p * Math.PI * 2 / 5; g.beginPath(); g.arc(cx + Math.cos(a2) * r * 0.5, cy + Math.sin(a2) * r * 0.5, s * 0.025, 0, 7); g.fill(); }
    } else if (k === 2) { // a sea urchin: a purple ball of spines
      g.strokeStyle = "#5b2a7a"; g.lineWidth = s * 0.025;
      for (var q = 0; q < 16; q++) { var a3 = q * Math.PI / 8; g.beginPath(); g.moveTo(cx + Math.cos(a3) * r * 0.6, cy + Math.sin(a3) * r * 0.6); g.lineTo(cx + Math.cos(a3) * r * 1.05, cy + Math.sin(a3) * r * 1.05); g.stroke(); }
      var gu = g.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 1, cx, cy, r * 0.7); gu.addColorStop(0, "#a571c8"); gu.addColorStop(1, "#6b3591");
      g.fillStyle = gu; g.beginPath(); g.arc(cx, cy, r * 0.68, 0, 7); g.fill();
    } else if (k === 3) { // sea glass: a frosted rounded shard
      var gg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r); gg.addColorStop(0, "#9fe3d6"); gg.addColorStop(1, "#3fae9c");
      g.fillStyle = gg; g.beginPath(); g.moveTo(cx - r * 0.9, cy - r * 0.2); g.quadraticCurveTo(cx - r * 0.6, cy - r, cx + r * 0.3, cy - r * 0.8);
      g.quadraticCurveTo(cx + r, cy - r * 0.4, cx + r * 0.85, cy + r * 0.5); g.quadraticCurveTo(cx + r * 0.2, cy + r, cx - r * 0.6, cy + r * 0.7); g.closePath(); g.fill();
      g.fillStyle = "rgba(255, 255, 255, 0.5)"; g.beginPath(); g.ellipse(cx - r * 0.25, cy - r * 0.35, r * 0.3, r * 0.12, -0.5, 0, 7); g.fill();
    } else if (k === 4) { // a periwinkle: a spiral shell
      var gp = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r); gp.addColorStop(0, "#c99a6b"); gp.addColorStop(1, "#6e4526");
      g.fillStyle = gp; g.beginPath(); g.arc(cx, cy, r * 0.9, 0, 7); g.fill();
      g.strokeStyle = "#f3dcc0"; g.lineWidth = s * 0.03; g.beginPath();
      for (var t = 0; t < 14; t += 0.2) { var rad = r * 0.08 * t * 0.55, a4 = t; var xx = cx + Math.cos(a4) * rad, yy = cy + Math.sin(a4) * rad; if (t === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy); }
      g.stroke();
    } else {              // a smooth grey pebble with a white band
      var gb = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 1, cx, cy, r); gb.addColorStop(0, "#a9b3b8"); gb.addColorStop(1, "#5f6b72");
      g.fillStyle = gb; g.beginPath(); g.ellipse(cx, cy, r * 1.0, r * 0.75, -0.3, 0, 7); g.fill();
      g.strokeStyle = "rgba(255, 255, 255, 0.75)"; g.lineWidth = s * 0.04; g.beginPath(); g.ellipse(cx, cy, r * 1.0, r * 0.18, -0.3, 0, 7); g.stroke();
    }
    g.restore();
  }

  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    restart: function () { timers.forEach(clearTimeout); timers = []; startRun(mode); },
    menu: toMenu
  }) : { isPaused: function () { return false; } };
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && score > 0; },
    pausable: P
  });
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (!P.isPaused()) update(dt);
    draw();
  }

  // ---- input ---------------------------------------------------------------------------------------
  function cellAt(e) {
    // (inside the rock rim)
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left - cv.clientLeft, y = e.clientY - r.top - cv.clientTop;
    var c = Math.floor(x / (cv.clientWidth / N)), rr = Math.floor(y / (cv.clientHeight / N));
    if (c < 0 || c >= N || rr < 0 || rr >= N) return -1;
    return rr * N + c;
  }
  var down = null;
  cv.addEventListener("pointerdown", function (e) {
    if (state !== "play" || P.isPaused()) return;
    e.preventDefault();
    var i = cellAt(e); if (i < 0) return;
    keyed = false;
    down = { i: i, x: e.clientX, y: e.clientY };
  });
  cv.addEventListener("pointerup", function (e) {
    if (!down || state !== "play") { down = null; return; }
    var dx = e.clientX - down.x, dy = e.clientY - down.y, i = down.i; down = null;
    // a drag swaps with the neighbour it heads for; a tap picks, then a tap beside swaps
    if (Math.max(Math.abs(dx), Math.abs(dy)) > CELL * 0.35) {
      var j = Math.abs(dx) > Math.abs(dy) ? i + (dx > 0 ? 1 : -1) : i + (dy > 0 ? N : -N);
      if (j >= 0 && j < N * N && adjacent(i, j)) trySwap(i, j);
      return;
    }
    if (sel >= 0 && adjacent(sel, i)) trySwap(sel, i);
    else sel = sel === i ? -1 : i;
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || state !== "play" || P.isPaused()) return;
    var D = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -N, ArrowDown: N }, d = D[e.key];
    if (d != null) {
      e.preventDefault();
      if (!keyed) { keyed = true; return; }
      var to = cursor + d;
      if (to < 0 || to >= N * N || !adjacent(cursor, to)) return;
      // with a piece picked up, an arrow swaps it that way
      if (sel === cursor) { trySwap(cursor, to); return; }
      cursor = to;
    } else if ((e.key === "Enter" || e.key === " ") && !(e.target && e.target.closest && e.target.closest("button"))) {
      e.preventDefault();
      if (e.repeat) return;
      keyed = true; sel = sel === cursor ? -1 : cursor;
    }
  });

  // ---- the menu and the end card -------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === mode); });
    var parts = [];
    Object.keys(MODES).forEach(function (m) { if (bests[m] && bests[m].get()) parts.push(MODES[m].name + " " + bests[m].get()); });
    $("bests").textContent = parts.length ? "best: " + parts.join(" · ") : "no pools played yet";
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () { mode = b.dataset.v; store.set("tidepool_mode", mode); paintMenu(); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("btn-hint").addEventListener("click", function () { if (state === "play" && !busy) hintAt = anyMove(board); });
  $("btn-menu").addEventListener("click", function () {
    if (window.GameShell && GameShell.askQuit) GameShell.askQuit({ title: "Leave this pool for the menu?", ok: "Menu" }, toMenu); else toMenu();
  });
  ["btn-hint", "btn-menu"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);
  if (window.GameShell && GameShell.menuKeys) {
    GameShell.menuKeys({ active: function () { return state === "menu"; }, groups: ["#pick-mode button"], start: "#play", space: true });
    GameShell.menuKeys({ active: function () { return state === "play" && !P.isPaused(); }, groups: [{ sel: "#tools button", keys: ["h", "backspace"] }] });
    GameShell.menuKeys({ active: function () { return state === "over" && performance.now() - overAt > OVER_WAIT; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }], start: "#again", space: true });
  }
  window.addEventListener("resize", layout);
  toMenu();
  layout();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness drives pools through these
  window.TidePool = {
    state: function () { return state; },
    mode: function () { return mode; },
    score: function () { return score; },
    busy: function () { return busy; },
    board: function () { return board.slice(); },
    setBoard: function (b) { board = b.slice(); },
    left: function () { return mode === "tide" ? timeLeft : swapsLeft; },
    setTime: function (t) { timeLeft = t; },
    sel: function () { return sel; },
    cursor: function () { return cursor; },
    hint: function () { return hintAt; },
    anims: function () { return anims.length; },
    swap: trySwap,
    start: startRun,
    toMenu: toMenu,
    rules: { runs: runs, anyMove: anyMove, deal: deal }
  };
})();
