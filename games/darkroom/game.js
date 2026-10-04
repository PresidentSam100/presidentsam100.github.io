/* =====================================================================
   Darkroom — nonograms under a red safelight.

   Every puzzle is a "negative": fill the right cells and the photo
   develops. Clues are the run lengths of each row and column; the line
   solver (nono.js) has proven every shipped picture — and the daily —
   solvable with no guessing. Trying to develop a wrong cell fogs the
   print: +1 fog, +30 seconds on the clock, and the cell is marked ✕ for
   you. The penalty is what makes fog matter — without it a wrong click
   would be a free "is this ink?" probe, and clicking around would beat
   deducing. Finish with no fog and the print is flawless. Solved prints
   hang in the gallery.

   Controls: left-click / drag uses the active tool — develop or mark ✕
   — switched with the HUD button or the 1 / 2 keys (right-click / drag
   always marks, for mice; taps use the tool too). Arrows move, Z or
   Space develops, X marks. Esc pauses (the shared shell).
   ===================================================================== */
(function () {
  "use strict";
  var Nono = window.DarkroomNono, ROLLS = window.DarkroomPuzzles;
  var store = window.GameShell ? GameShell.store : { get: function (k, f) { return f; }, set: function () {}, getNum: function (k, f) { return f; } };
  var K = { album: "darkroom_album", daily: "darkroom_daily", progress: "darkroom_progress", tool: "dkroom_tool" };
  var DAY0 = Date.UTC(2026, 8, 27);   // Daily #1's date

  function jget(key) { try { var v = JSON.parse(store.get(key, "null")); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function jset(key, obj) { store.set(key, JSON.stringify(obj)); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function now() { return performance.now(); }
  function mmss(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

  var ALL = [];
  ROLLS.forEach(function (r) { r.puzzles.forEach(function (p) { ALL.push(p); p.roll = r; }); });
  function puzzleById(id) { for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i]; return null; }
  function today() {
    var d = new Date();
    var ymd = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    var n = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DAY0) / 86400000) + 1;
    return { ymd: ymd, n: n };
  }

  // ---- sound ------------------------------------------------------------------
  var actx = null, noiseB = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  ["pointerdown", "pointerup", "touchend", "keydown", "click"].forEach(function (t) {
    document.addEventListener(t, function () { audio(); }, true);
  });
  function tone(freq, dur, gain, type, slide, delay) {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(dur, gain, type, f0, f1, delay) {
    var ac = audio(); if (!ac) return;
    if (!noiseB) {
      noiseB = ac.createBuffer(1, Math.floor(ac.sampleRate), ac.sampleRate);
      var d = noiseB.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = ac.currentTime + (delay || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseB; f.type = type; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(ac.destination); s.start(t); s.stop(t + dur + 0.05);
  }
  var SFX = {
    dip: function () { tone(340, 0.05, 0.035, "sine", 300); },
    mark: function () { tone(1500, 0.03, 0.022, "square"); },
    erase: function () { tone(700, 0.04, 0.02, "sine", 500); },
    fog: function () { tone(150, 0.2, 0.09, "sine", 90); hiss(0.25, 0.06, "lowpass", 900, 250); },
    line: function () { tone(880, 0.09, 0.03, "triangle"); },
    slosh: function () { hiss(0.5, 0.09, "lowpass", 700, 200); hiss(0.4, 0.05, "bandpass", 400, 900, 0.18); },
    win: function () { SFX.slosh(); [659, 784, 988, 1319].forEach(function (f, i) { tone(f, 0.3, 0.05, "triangle", null, 0.3 + i * 0.1); }); },
    ui: function () { tone(950, 0.035, 0.025, "square"); },
    drip: function () { tone(1900, 0.03, 0.012, "sine", 700); tone(500, 0.08, 0.008, "sine", 300, 0.03); },
  };

  // ---- prints (small rendered photos) ---------------------------------------------
  function renderPrint(cv, rows, cell, developed) {
    var w = rows[0].length, h = rows.length, b = Math.max(2, Math.round(cell * 0.9));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = (w * cell + b * 2) * dpr; cv.height = (h * cell + b * 2) * dpr;
    cv.style.width = (w * cell + b * 2) + "px";
    var g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = developed ? "#f4efe4" : "#efe9db";
    g.fillRect(0, 0, w * cell + b * 2, h * cell + b * 2);
    g.fillStyle = developed ? "#241d1a" : "#3a2f2a";
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (rows[y][x] === "#") g.fillRect(b + x * cell, b + y * cell, cell, cell);
    }
  }

  // ---- state -----------------------------------------------------------------------
  var screen = "menu";           // menu | puzzle | gallery
  var cur = null;                // { p, w, h, clues, cells[], ink, filled, fog, ms, isDaily, won, startAt }
  var winPhase = 0;              // 0 none, then a timestamp while developing
  var cursor = { x: 0, y: 0, on: false };
  var hover = { x: -1, y: -1 };
  var tool = store.get(K.tool, "fill") === "mark" ? "mark" : "fill";
  var FOG_PENALTY_MS = 30000;
  var develops = [];             // per-cell fade-ins { i, t0 }
  var flashes = [];              // wrong-cell flashes
  var floats = [];               // "+0:30" drifting off a fogged cell
  var dripIn = 9;

  var $ = function (id) { return document.getElementById(id); };
  var board = $("board"), bctx = board.getContext("2d");
  var ui = {
    menu: $("menu"), gallery: $("gallery"), hudTop: $("hud"), win: $("win"),
    label: $("hud-label"), time: $("hud-time"), fog: $("hud-fog"), toolFill: $("tool-fill"), toolMark: $("tool-mark"),
    winName: $("win-name"), winStats: $("win-stats"), winPrint: $("win-print"), winNext: $("win-next"),
    easel: $("easel"), rolls: $("rolls"), dailyBtn: $("daily-btn"), dailySub: $("daily-sub"),
    tally: $("tally"), wires: $("wires"), share: $("share-out"),
  };

  // ---- opening and leaving puzzles ---------------------------------------------------
  function progKey() { return cur.isDaily ? "daily:" + cur.dailyYmd : cur.p.id; }
  function openPuzzle(p, isDaily) {
    cur = {
      p: p, isDaily: !!isDaily, dailyYmd: isDaily ? today().ymd : null,
      w: p.rows[0].length, h: p.rows.length,
      clues: Nono.cluesOf(p.rows),
      cells: new Array(p.rows[0].length * p.rows.length).fill(0),
      ink: p.rows.join("").split("#").length - 1,
      filled: 0, fog: 0, ms: 0, won: false, startAt: now(),
    };
    var prog = jget(K.progress)[progKey()];
    if (prog && typeof prog.c === "string" && prog.c.length === cur.cells.length) {
      for (var i = 0; i < prog.c.length; i++) {
        cur.cells[i] = +prog.c[i] || 0;
        if (cur.cells[i] === 1) cur.filled++;
      }
      cur.ms = prog.ms || 0; cur.fog = prog.fog || 0;
    }
    winPhase = 0; develops = []; flashes = []; floats = [];
    cursor = { x: 0, y: 0, on: false };
    lineCache = {};
    screen = "puzzle";
    show();
    layout();
    hud(true);
  }
  function saveProgress() {
    if (!cur || cur.won) return;
    var all = jget(K.progress);
    if (cur.filled === 0 && cur.cells.indexOf(2) === -1 && !cur.fog) delete all[progKey()];
    else all[progKey()] = { c: cur.cells.join(""), ms: Math.round(cur.ms), fog: cur.fog };
    jset(K.progress, all);
  }
  function clearProgress() {
    var all = jget(K.progress);
    delete all[progKey()];
    jset(K.progress, all);
  }
  function restartPuzzle() {
    if (!cur) return;
    clearProgress();
    var p = cur.p, d = cur.isDaily;
    openPuzzle(p, d);
    SFX.ui();
  }
  function toMenu() {
    saveProgress();
    cur = null; screen = "menu";
    buildMenu(); show();
  }
  function toGallery() {
    saveProgress();
    cur = null; screen = "gallery";
    buildGallery(); show();
  }
  function show() {
    ui.menu.hidden = screen !== "menu";
    ui.gallery.hidden = screen !== "gallery";
    ui.hudTop.hidden = screen !== "puzzle";
    ui.easel.hidden = screen !== "puzzle";
    ui.win.hidden = true;
  }

  // ---- the daily -----------------------------------------------------------------------
  var dailyCache = null;
  function dailyPuzzle() {
    var t = today();
    if (!dailyCache || dailyCache.n !== t.n) {
      var g = Nono.daily(t.n, 10, 10);
      dailyCache = { n: t.n, p: { id: "daily", name: "Found Film #" + t.n, rows: g.rows } };
    }
    return dailyCache.p;
  }

  // ---- menu and gallery --------------------------------------------------------------
  function albumGet() { return jget(K.album); }
  function buildMenu() {
    var album = albumGet(), t = today(), dlog = jget(K.daily);
    var done = Object.keys(album).length;
    ui.tally.textContent = done + " of " + ALL.length + " prints developed";
    var dd = dlog[t.ymd];
    ui.dailySub.textContent = dd ? "developed in " + mmss(dd.ms) + (dd.fog ? "" : " · flawless") : "one negative, the same for everyone";
    ui.dailyBtn.querySelector("b").textContent = "Daily negative #" + t.n + (dd ? " ✓" : "");
    ui.rolls.innerHTML = "";
    ROLLS.forEach(function (roll) {
      var wrap = document.createElement("section");
      wrap.className = "roll";
      var solvedHere = roll.puzzles.filter(function (p) { return album[p.id]; }).length;
      var head = document.createElement("h2");
      head.innerHTML = roll.name + " <small>" + roll.blurb + " · " + solvedHere + "/" + roll.puzzles.length + "</small>";
      wrap.appendChild(head);
      var strip = document.createElement("div");
      strip.className = "strip";
      roll.puzzles.forEach(function (p, i) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "frame" + (album[p.id] ? " done" : "");
        var solvedP = album[p.id];
        btn.setAttribute("aria-label", solvedP ? p.name + ", developed" : "Negative " + (i + 1));
        if (solvedP) {
          var cv = document.createElement("canvas");
          renderPrint(cv, p.rows, Math.max(2, Math.floor(52 / p.rows.length)), true);
          btn.appendChild(cv);
        } else {
          var num = document.createElement("b");
          num.textContent = i + 1;
          btn.appendChild(num);
          if (jget(K.progress)[p.id]) { var dot = document.createElement("i"); dot.title = "in the tray"; btn.appendChild(dot); }
        }
        btn.addEventListener("click", function () { SFX.ui(); openPuzzle(p, false); });
        strip.appendChild(btn);
      });
      wrap.appendChild(strip);
      ui.rolls.appendChild(wrap);
    });
  }
  function buildGallery() {
    var album = albumGet();
    ui.wires.innerHTML = "";
    var any = false;
    ROLLS.forEach(function (roll) {
      roll.puzzles.forEach(function (p) {
        var a = album[p.id];
        if (!a) return;
        any = true;
        var fig = document.createElement("figure");
        fig.className = "print" + (a.fog ? "" : " flawless");
        var cv = document.createElement("canvas");
        renderPrint(cv, p.rows, Math.max(4, Math.floor(110 / p.rows.length)), true);
        var cap = document.createElement("figcaption");
        cap.innerHTML = "<b>" + p.name + "</b>" + mmss(a.ms) + (a.fog ? " · fog " + a.fog : " · flawless");
        fig.appendChild(cv); fig.appendChild(cap);
        ui.wires.appendChild(fig);
      });
    });
    $("gallery-empty").hidden = any;
  }

  // ---- board layout and drawing --------------------------------------------------------
  var L = null;   // { cell, gx, gy, cw, ch, clueFont }
  function layout() {
    if (!cur) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var availW = Math.min(window.innerWidth - 24, 760);
    var availH = window.innerHeight - 150;
    var maxRow = Math.max.apply(null, cur.clues.rows.map(function (c) { return Math.max(1, c.length); }));
    var maxCol = Math.max.apply(null, cur.clues.cols.map(function (c) { return Math.max(1, c.length); }));
    var cell = Math.floor(Math.min((availW - 8) / (cur.w + maxRow * 0.62 + 0.6), (availH - 8) / (cur.h + maxCol * 0.62 + 0.6), 44));
    cell = Math.max(15, cell);
    var gx = Math.round(maxRow * cell * 0.62 + cell * 0.35), gy = Math.round(maxCol * cell * 0.62 + cell * 0.35);
    var cw = gx + cur.w * cell + 3, ch = gy + cur.h * cell + 3;
    board.width = Math.round(cw * dpr); board.height = Math.round(ch * dpr);
    board.style.width = cw + "px"; board.style.height = ch + "px";
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    L = { cell: cell, gx: gx, gy: gy, cw: cw, ch: ch };
  }
  window.addEventListener("resize", function () { if (screen === "puzzle") layout(); });

  // Which lines are already satisfied (their clue exactly matches the fills).
  var lineCache = {};
  function lineDone(kind, i) {
    var key = kind + i;
    if (key in lineCache) return lineCache[key];
    var runs = [], n = 0, len = kind === "r" ? cur.w : cur.h;
    for (var k = 0; k < len; k++) {
      var v = kind === "r" ? cur.cells[i * cur.w + k] : cur.cells[k * cur.w + i];
      if (v === 1) n++; else if (n) { runs.push(n); n = 0; }
    }
    if (n) runs.push(n);
    var clue = kind === "r" ? cur.clues.rows[i] : cur.clues.cols[i];
    var done = runs.length === clue.length && runs.every(function (v, j) { return v === clue[j]; });
    lineCache[key] = done;
    return done;
  }

  function draw(t) {
    if (screen !== "puzzle" || !cur || !L) return;
    var f = fx(), cell = L.cell, gx = L.gx, gy = L.gy;
    var winT = winPhase ? Math.min(1, (t - winPhase) / (f ? 1600 : 1)) : 0;
    // Paper.
    bctx.fillStyle = winT > 0.6 ? "#f4efe4" : "#efe6d2";
    bctx.fillRect(0, 0, L.cw, L.ch);
    var fade = 1 - Math.min(1, winT * 1.8);   // the working chrome fades as it develops
    // Crosshair.
    if (fade > 0 && (hover.x >= 0 || cursor.on) && !cur.won) {
      var hx = cursor.on ? cursor.x : hover.x, hy = cursor.on ? cursor.y : hover.y;
      bctx.fillStyle = "rgba(196,62,44," + (0.07 * fade).toFixed(3) + ")";
      bctx.fillRect(gx + hx * cell, 0, cell, L.ch);
      bctx.fillRect(0, gy + hy * cell, L.cw, cell);
    }
    // Grid lines.
    if (fade > 0) {
      bctx.strokeStyle = "rgba(90,62,50," + (0.35 * fade).toFixed(3) + ")";
      bctx.lineWidth = 1;
      for (var x = 0; x <= cur.w; x++) {
        bctx.beginPath(); bctx.moveTo(gx + x * cell + 0.5, gy); bctx.lineTo(gx + x * cell + 0.5, gy + cur.h * cell); bctx.stroke();
      }
      for (var y = 0; y <= cur.h; y++) {
        bctx.beginPath(); bctx.moveTo(gx, gy + y * cell + 0.5); bctx.lineTo(gx + cur.w * cell, gy + y * cell + 0.5); bctx.stroke();
      }
      bctx.strokeStyle = "rgba(90,62,50," + (0.8 * fade).toFixed(3) + ")";
      bctx.lineWidth = 1.6;
      for (var x5 = 0; x5 <= cur.w; x5 += 5) { bctx.beginPath(); bctx.moveTo(gx + x5 * cell, gy); bctx.lineTo(gx + x5 * cell, gy + cur.h * cell); bctx.stroke(); }
      for (var y5 = 0; y5 <= cur.h; y5 += 5) { bctx.beginPath(); bctx.moveTo(gx, gy + y5 * cell); bctx.lineTo(gx + cur.w * cell, gy + y5 * cell); bctx.stroke(); }
    }
    // Clues.
    if (fade > 0) {
      var fs = Math.max(9, Math.round(cell * 0.42));
      bctx.font = "700 " + fs + "px 'Special Elite', ui-monospace, monospace";
      bctx.textBaseline = "middle";
      for (var ry = 0; ry < cur.h; ry++) {
        var rc = cur.clues.rows[ry].length ? cur.clues.rows[ry] : [0];
        var doneR = lineDone("r", ry);
        bctx.fillStyle = doneR ? "rgba(150,130,110," + (0.75 * fade) + ")" : "rgba(60,38,30," + fade + ")";
        bctx.textAlign = "right";
        for (var ci = 0; ci < rc.length; ci++) {
          bctx.fillText(rc[rc.length - 1 - ci], gx - 5 - ci * cell * 0.62, gy + ry * cell + cell / 2 + 1);
        }
      }
      bctx.textAlign = "center";
      for (var cx = 0; cx < cur.w; cx++) {
        var cc = cur.clues.cols[cx].length ? cur.clues.cols[cx] : [0];
        var doneC = lineDone("c", cx);
        bctx.fillStyle = doneC ? "rgba(150,130,110," + (0.75 * fade) + ")" : "rgba(60,38,30," + fade + ")";
        for (var cj = 0; cj < cc.length; cj++) {
          bctx.fillText(cc[cc.length - 1 - cj], gx + cx * cell + cell / 2, gy - 7 - cj * cell * 0.62);
        }
      }
    }
    // Cells.
    for (var i = 0; i < cur.cells.length; i++) {
      var vx = i % cur.w, vy = Math.floor(i / cur.w);
      var px = gx + vx * cell, py = gy + vy * cell;
      if (cur.cells[i] === 1) {
        var a = 1;
        bctx.fillStyle = winT > 0.6 ? "#241d1a" : "#33241e";
        bctx.fillRect(px + 1, py + 1, cell - 1, cell - 1);
      } else if (cur.cells[i] === 2 && fade > 0) {
        bctx.strokeStyle = "rgba(196,62,44," + (0.55 * fade).toFixed(3) + ")";
        bctx.lineWidth = Math.max(1.2, cell * 0.06);
        var m = cell * 0.3;
        bctx.beginPath();
        bctx.moveTo(px + m, py + m); bctx.lineTo(px + cell - m, py + cell - m);
        bctx.moveTo(px + cell - m, py + m); bctx.lineTo(px + m, py + cell - m);
        bctx.stroke();
      }
    }
    // Fresh fills bloom in like developing silver.
    if (f) {
      for (var dv = develops.length - 1; dv >= 0; dv--) {
        var D = develops[dv], age = (t - D.t0) / 300;
        if (age > 1) { develops.splice(dv, 1); continue; }
        var dx = D.i % cur.w, dy = Math.floor(D.i / cur.w);
        bctx.fillStyle = "rgba(239,230,210," + (1 - age).toFixed(3) + ")";
        bctx.fillRect(gx + dx * cell + 1, gy + dy * cell + 1, cell - 1, cell - 1);
      }
    }
    // A fogged cell blushes red: it fades out with Visual FX on, and holds
    // still at full strength for the same 450 ms with it off.
    for (var fl = flashes.length - 1; fl >= 0; fl--) {
      var F = flashes[fl], fa = (t - F.t0) / 450;
      if (fa > 1) { flashes.splice(fl, 1); continue; }
      var fxx = F.i % cur.w, fyy = Math.floor(F.i / cur.w);
      bctx.fillStyle = "rgba(196,62,44," + (0.5 * (f ? 1 - fa : 1)).toFixed(3) + ")";
      bctx.fillRect(gx + fxx * cell, gy + fyy * cell, cell, cell);
    }
    // The cost of a fogged cell drifts up off it (with Visual FX off it holds
    // still and solid on the cell for its 1.1 s).
    for (var ft = floats.length - 1; ft >= 0; ft--) {
      var FL = floats[ft], fla = (t - FL.t0) / 1100;
      if (fla > 1) { floats.splice(ft, 1); continue; }
      var flx = FL.i % cur.w, fly = Math.floor(FL.i / cur.w);
      bctx.font = "700 " + Math.max(11, Math.round(cell * 0.5)) + "px 'Special Elite', ui-monospace, monospace";
      bctx.textAlign = "center";
      bctx.fillStyle = "rgba(196,62,44," + (f ? 1 - fla : 1).toFixed(3) + ")";
      bctx.fillText("+0:30", gx + flx * cell + cell / 2, gy + fly * cell + cell * 0.55 - (f ? fla * cell * 0.9 : 0));
    }
    // Keyboard cursor.
    if (cursor.on && fade > 0 && !cur.won) {
      bctx.strokeStyle = "rgba(196,62,44," + (0.9 * fade) + ")";
      bctx.lineWidth = 2;
      bctx.strokeRect(gx + cursor.x * cell + 1.5, gy + cursor.y * cell + 1.5, cell - 3, cell - 3);
    }
    // The fix: a white sweep at the end of developing.
    if (winPhase && f && winT > 0.75 && winT < 0.95) {
      bctx.fillStyle = "rgba(255,252,240," + (0.7 * (1 - Math.abs((winT - 0.85) / 0.1))).toFixed(3) + ")";
      bctx.fillRect(0, 0, L.cw, L.ch);
    }
  }

  // ---- HUD --------------------------------------------------------------------------------
  var hudCache = "";
  function hud(force) {
    if (screen !== "puzzle" || !cur) return;
    var label = cur.isDaily ? "Daily negative #" + today().n
      : cur.p.roll.name + " · negative " + (cur.p.roll.puzzles.indexOf(cur.p) + 1) + " · " + cur.w + "×" + cur.h;
    var key = label + "|" + mmss(cur.ms) + "|" + cur.fog;
    if (!force && key === hudCache) return;
    hudCache = key;
    ui.label.textContent = label;
    ui.time.textContent = mmss(cur.ms);
    ui.fog.textContent = cur.fog ? "fog ×" + cur.fog : "no fog";
    ui.fog.className = cur.fog ? "fogged" : "";
  }

  // ---- input -------------------------------------------------------------------------------
  function cellAt(e) {
    var r = board.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left - L.gx * r.width / L.cw) / (L.cell * r.width / L.cw));
    var y = Math.floor((e.clientY - r.top - L.gy * r.height / L.ch) / (L.cell * r.height / L.ch));
    return x >= 0 && y >= 0 && x < cur.w && y < cur.h ? { x: x, y: y } : null;
  }
  function truth(x, y) { return cur.p.rows[y][x] === "#"; }
  // The one move: develop (fill) or mark ✕. Wrong develops fog the print and
  // turn into ✕ for you, so the picture is never wrongly dark.
  function apply(x, y, action) {
    if (!cur || cur.won || P.isPaused()) return "";
    var i = y * cur.w + x, v = cur.cells[i];
    lineCache = {};
    if (action === "fill") {
      if (v === 1) { cur.cells[i] = 0; cur.filled--; SFX.erase(); return "unfill"; }
      if (v === 2) return "";
      if (!truth(x, y)) {
        cur.cells[i] = 2; cur.fog++;
        cur.ms += FOG_PENALTY_MS;
        flashes.push({ i: i, t0: now() });
        floats.push({ i: i, t0: now() });
        ui.time.classList.add("penalty");
        clearTimeout(penaltyTimer);
        penaltyTimer = setTimeout(function () { ui.time.classList.remove("penalty"); }, 1000);
        SFX.fog();
        hud(true);
        return "fog";
      }
      cur.cells[i] = 1; cur.filled++;
      develops.push({ i: i, t0: now() });
      SFX.dip();
      if (lineDone("r", y) || lineDone("c", x)) SFX.line();
      if (cur.filled === cur.ink) win();
      return "fill";
    }
    if (v === 2) { cur.cells[i] = 0; SFX.erase(); return "unmark"; }
    if (v === 1) return "";
    cur.cells[i] = 2;
    SFX.mark();
    return "mark";
  }

  // The board's cursor mirrors whichever action the pointer would take —
  // including a right-button drag, which marks whatever the toolbar says.
  function boardCursor(action) {
    board.classList.toggle("tool-fill", action === "fill");
    board.classList.toggle("tool-mark", action === "mark");
  }
  var penaltyTimer = 0;
  var drag = null;
  board.addEventListener("pointerdown", function (e) {
    if (screen !== "puzzle" || !cur || cur.won || P.isPaused()) return;
    e.preventDefault();
    try { board.setPointerCapture(e.pointerId); } catch (err) {}
    var c = cellAt(e);
    if (!c) return;
    cursor.on = false;
    var action = e.button === 2 ? "mark" : tool;
    var v = cur.cells[c.y * cur.w + c.x];
    // Starting on a matching cell means the drag erases instead.
    boardCursor(action);
    var res = apply(c.x, c.y, action);
    drag = { id: e.pointerId, action: action, erase: res === "unfill" || res === "unmark", last: c.x + "," + c.y };
    saveSoon();
  });
  board.addEventListener("pointermove", function (e) {
    if (screen !== "puzzle" || !cur) return;
    var c = cellAt(e);
    hover = c ? { x: c.x, y: c.y } : { x: -1, y: -1 };
    if (!drag || e.pointerId !== drag.id || !c) return;
    var key = c.x + "," + c.y;
    if (key === drag.last) return;
    drag.last = key;
    var i = c.y * cur.w + c.x, v = cur.cells[i];
    if (drag.erase) {
      if ((drag.action === "fill" && v === 1) || (drag.action === "mark" && v === 2)) apply(c.x, c.y, drag.action);
    } else if (v === 0) apply(c.x, c.y, drag.action);
    saveSoon();
  });
  function endDrag(e) { if (drag && (!e || e.pointerId === drag.id)) { drag = null; boardCursor(tool); saveProgress(); } }
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);
  board.addEventListener("pointerleave", function () { hover = { x: -1, y: -1 }; });
  board.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  var saveTimer = 0;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveProgress, 400); }
  window.addEventListener("pagehide", function () { if (cur && !cur.won) saveProgress(); });

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (screen !== "puzzle" || !cur) return;
    if (!ui.win.hidden) {
      if (e.key === "Enter") { e.preventDefault(); ui.winNext.click(); }
      return;
    }
    if (cur.won || P.isPaused()) return;
    var moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      cursor.on = true;
      cursor.x = Math.max(0, Math.min(cur.w - 1, cursor.x + moves[e.key][0]));
      cursor.y = Math.max(0, Math.min(cur.h - 1, cursor.y + moves[e.key][1]));
      return;
    }
    if (e.repeat) return;
    var k = e.key.toLowerCase();
    if (k === "1" || k === "2") { e.preventDefault(); setTool(k === "1" ? "fill" : "mark"); return; }
    if (k === "z" || k === " ") { e.preventDefault(); cursor.on = true; apply(cursor.x, cursor.y, "fill"); saveSoon(); }
    else if (k === "x") { e.preventDefault(); cursor.on = true; apply(cursor.x, cursor.y, "mark"); saveSoon(); }
    else if (k === "r") { e.preventDefault(); restartPuzzle(); }
  });

  ui.toolFill.addEventListener("click", function () { setTool("fill"); });
  ui.toolMark.addEventListener("click", function () { setTool("mark"); });
  function setTool(t) {
    if (t === tool) return;
    tool = t;
    store.set(K.tool, tool);
    toolLabel();
    SFX.ui();
  }
  function toolLabel() {
    boardCursor(tool);
    ui.toolFill.classList.toggle("on", tool === "fill");
    ui.toolMark.classList.toggle("on", tool === "mark");
    ui.toolFill.setAttribute("aria-pressed", tool === "fill");
    ui.toolMark.setAttribute("aria-pressed", tool === "mark");
  }
  toolLabel();

  // ---- winning ------------------------------------------------------------------------------
  function win() {
    cur.won = true;
    winPhase = now();
    clearProgress();
    SFX.win();
    var a = albumGet();
    if (!cur.isDaily) {
      var old = a[cur.p.id];
      if (!old || cur.ms < old.ms || (old.fog && !cur.fog)) a[cur.p.id] = { ms: Math.round(cur.ms), fog: cur.fog };
      jset(K.album, a);
    } else {
      var dlog = jget(K.daily);
      if (!dlog[cur.dailyYmd]) { dlog[cur.dailyYmd] = { ms: Math.round(cur.ms), fog: cur.fog }; jset(K.daily, dlog); }
    }
    setTimeout(function () {
      if (screen !== "puzzle" || !cur || !cur.won) return;
      ui.winName.textContent = "It's " + (/^[AEIOU]/i.test(cur.p.name) ? "an " : "a ") + cur.p.name + "!";
      if (cur.isDaily) ui.winName.textContent = cur.p.name + " — developed!";
      ui.winStats.textContent = mmss(cur.ms) + (cur.fog ? " · fog ×" + cur.fog : " · a flawless print");
      renderPrint(ui.winPrint, cur.p.rows, Math.max(6, Math.floor(150 / cur.h)), true);
      var nxt = nextUndeveloped();
      ui.winNext.textContent = cur.isDaily ? "To the darkroom" : nxt ? "Next negative" : "To the gallery";
      $("win-share").hidden = !cur.isDaily;
      ui.win.hidden = false;
      ui.winNext.focus({ preventScroll: true });
    }, fx() ? 1750 : 250);
  }
  function nextUndeveloped() {
    if (!cur || cur.isDaily) return null;
    var album = albumGet(), list = cur.p.roll.puzzles, at = list.indexOf(cur.p);
    for (var k = 1; k <= list.length; k++) {
      var p = list[(at + k) % list.length];
      if (!album[p.id]) return p;
    }
    for (var j = 0; j < ALL.length; j++) if (!album[ALL[j].id]) return ALL[j];
    return null;
  }
  ui.winNext.addEventListener("click", function () {
    SFX.ui();
    if (cur && cur.isDaily) return toMenu();
    var nxt = nextUndeveloped();
    if (nxt) openPuzzle(nxt, false); else toGallery();
  });
  $("win-menu").addEventListener("click", function () { SFX.ui(); toMenu(); });
  $("win-share").addEventListener("click", function () {
    var t = today(), d = jget(K.daily)[t.ymd] || { ms: cur ? cur.ms : 0, fog: cur ? cur.fog : 0 };
    var text = "Darkroom · Daily negative #" + t.n + " (" + t.ymd + ")\nDeveloped in " + mmss(d.ms) + (d.fog ? " · fog ×" + d.fog : " · flawless print 🏆") +
      "\n" + location.origin + location.pathname;
    function fallback() { ui.share.hidden = false; ui.share.querySelector("textarea").value = text; }
    function copied() { $("win-share").textContent = "Copied!"; }
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function (e2) { if (!e2 || e2.name !== "AbortError") fallback(); });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, fallback);
    else fallback();
  });

  // ---- menu buttons ---------------------------------------------------------------------------
  ui.dailyBtn.addEventListener("click", function () { SFX.ui(); openPuzzle(dailyPuzzle(), true); });
  $("to-gallery").addEventListener("click", function () { SFX.ui(); toGallery(); });
  $("gallery-back").addEventListener("click", function () { SFX.ui(); toMenu(); });
  $("hud-back").addEventListener("click", function () { SFX.ui(); toMenu(); });
  $("hud-restart").addEventListener("click", restartPuzzle);

  var P = window.GameShell ? GameShell.pausable({ canPause: function () { return screen === "puzzle" && cur && !cur.won; } })
    : { isPaused: function () { return false; } };

  // ---- the loop -------------------------------------------------------------------------------
  var lastT = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    var dt = lastT ? Math.min(200, t - lastT) : 0;
    lastT = t;
    if (screen === "puzzle" && cur && !cur.won && !P.isPaused() && !document.hidden) {
      cur.ms += dt;
      dripIn -= dt / 1000;
      if (dripIn <= 0) { SFX.drip(); dripIn = 8 + Math.random() * 9; }
    }
    draw(t);
    hud();
  }
  buildMenu();
  show();
  requestAnimationFrame(frame);

  // ---- test hooks -----------------------------------------------------------------------------
  window.Darkroom = {
    open: function (id) { var p = puzzleById(id); if (p) openPuzzle(p, false); },
    openDaily: function () { openPuzzle(dailyPuzzle(), true); },
    toMenu: toMenu, toGallery: toGallery,
    apply: apply,
    state: function () {
      return { screen: screen, id: cur && (cur.isDaily ? "daily" : cur.p.id), won: !!(cur && cur.won),
        filled: cur && cur.filled, ink: cur && cur.ink, fog: cur && cur.fog, ms: cur && Math.round(cur.ms),
        paused: P.isPaused(), cells: cur ? cur.cells.join("") : "",
        flashes: flashes.length, floats: floats.length };
    },
    art: function () { return cur ? cur.p.rows : null; },
    cellRect: function (x, y) {
      var r = board.getBoundingClientRect();
      return { x: r.left + (L.gx + (x + 0.5) * L.cell) * r.width / L.cw, y: r.top + (L.gy + (y + 0.5) * L.cell) * r.height / L.ch };
    },
    solveNow: function () { if (!cur) return; for (var y = 0; y < cur.h; y++) for (var x = 0; x < cur.w; x++) if (truth(x, y) && cur.cells[y * cur.w + x] !== 1) apply(x, y, "fill"); },
  };
})();
