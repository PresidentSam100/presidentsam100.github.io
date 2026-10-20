/* =====================================================================
   Page Turner: a bookworm under the falling pages of a picture book.
   The rules live in engine.js; this file paints the book, reads the keys
   and the thumb, plays the sounds and keeps the scores.

   The view looks down on the book from in front of it, a little tilted:
   the half the worms crawl on lies flat, the far half stands upright, and
   each leaf swings over from it and lands flat on the worms. Light from
   behind shines through the holes of the standing leaf, so its shadow on
   the page below has bright patches exactly where the holes will land.
   ===================================================================== */
(function () {
  "use strict";

  var E = window.PageTurnerEngine, T = E.TUNE;
  var $ = function (id) { return document.getElementById(id); };
  var GS = window.GameShell;
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = GS ? GS.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  // ---- the colours ----------------------------------------------------------------------
  // each leaf is one board-book colour, in turn: its paper and the ink printed on it
  var PAGES = [
    ["#ffd447", "#94640a"],   // sunflower
    ["#7cc4ff", "#1d5895"],   // sky
    ["#6be0b5", "#16705a"],   // mint
    ["#c6a8ff", "#5634a0"],   // lilac
    ["#ff8f73", "#a03822"],   // coral
    ["#ffb45c", "#94500a"],   // tangerine
    ["#ff9fcb", "#9c2c62"]    // pink
  ];
  var WORMS = [
    { body: "#4cc35c", dark: "#237a33", light: "#b4f0a8" },   // you
    { body: "#ff5f97", dark: "#a5245a", light: "#ffc0d6" },   // Rosy
    { body: "#ff9d2e", dark: "#9a560c", light: "#ffd9a6" },   // Clem
    { body: "#7484ff", dark: "#2f3aa0", light: "#c4caff" }    // Indy
  ];
  var INK = "#2b1d3d", CLOTH = "#d9473b", CLOTH_DARK = "#97281f";
  function paper(n) { return PAGES[((n % PAGES.length) + PAGES.length) % PAGES.length]; }
  function shadeHex(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    return "rgb(" + Math.round(r * k) + "," + Math.round(gg * k) + "," + Math.round(b * k) + ")";
  }

  // ---- the view --------------------------------------------------------------------------
  // P(x, y, z): a point of the book (in page widths: y from the spine
  // towards you, z up) to the canvas. The page tilts away a little, and
  // what is nearer or higher is drawn a touch wider.
  var cv = $("book"), g = cv.getContext("2d");
  var dpr = 1, VW = 0, VH = 0, S = 300, CX = 0, OY = 0;
  var FY = 0.92, FZ = 0.36, BOOK_W = 1.17, BOOK_TOP = 0.42, BOOK_H = 1.42;
  var EDGE_ON = (Math.PI - Math.atan(FY / FZ) - Math.PI / 2) / (Math.PI / 2);   // how far over a falling leaf is when seen edge-on
  function P(x, y, z) { var w = 1 + 0.06 * (y - 0.5) + 0.08 * z; return [CX + (x - 0.5) * S * w, OY + (y * FY - z * FZ) * S]; }
  function floorMap(x, r) { return P(x, r, 0); }
  // a leaf turned to `th` (PI / 2 standing up, PI flat on the page); with
  // Visual FX on its outer edge lags as it falls (curl)
  function leafMap(th, curl, back) {
    return function (x, r) { var t = th - curl * r * r; return P(x, -r * Math.cos(t) - (back || 0), r * Math.sin(t)); };
  }
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var host = $("stage").getBoundingClientRect();
    VW = Math.max(160, host.width); VH = Math.max(140, host.height);
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
    cv.style.width = VW + "px"; cv.style.height = VH + "px";
    // the biggest book that fits, its top clear of the corner buttons
    var corners = Array.prototype.slice.call(document.querySelectorAll(".nav-back-games, .gs-corner > *"))
      .map(function (e) { return e.getBoundingClientRect(); }).filter(function (r) { return r.width > 0; });
    var top = 0;
    for (var pass = 0; pass < 4; pass++) {
      S = Math.max(60, Math.min(VW / BOOK_W, (VH - top) / BOOK_H));
      var spare = Math.max(0, VH - top - S * BOOK_H), upright = VW < VH * 0.8;
      var y0 = top + (upright ? Math.min(spare / 2, 8) : spare / 2);
      CX = VW / 2; OY = y0 + BOOK_TOP * S;
      var left = host.left + CX - S * BOOK_W / 2, right = host.left + CX + S * BOOK_W / 2, bookTop = host.top + y0, need = 0;
      corners.forEach(function (r) { if (r.right > left && r.left < right && r.bottom + 6 > bookTop) need = Math.max(need, r.bottom + 6 - host.top); });
      if (need <= top + 0.5) break;
      top = need;
    }
    floorKey = "";
  }

  // ---- sound ---------------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) try { actx = new AC(); } catch (e) { actx = null; } }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, delay, to) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, freq, q, vol, delay, to, kind) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), len = Math.max(1, Math.floor(ac.sampleRate * dur)), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    var src = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain();
    src.buffer = buf; f.type = kind || "bandpass"; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gn.gain.value = vol;
    src.connect(f); f.connect(gn); gn.connect(ac.destination); src.start(t0);
  }
  var lastBump = 0;
  function sfxStand() { noise(0.16, 2200, 1.4, 0.12); }
  function sfxTip(dur) { noise(dur, 500, 0.9, 0.22, 0, 2600); }
  function sfxSlam() { tone(78, 0.3, "sine", 0.22, 0, 46); noise(0.22, 420, 0.7, 0.5, 0, 0, "lowpass"); }
  function sfxThrough(id) { tone(560 + id * 70, 0.1, "triangle", 0.05, 0.03); tone(840 + id * 90, 0.12, "triangle", 0.04, 0.09); }
  function sfxSquish() { tone(360, 0.32, "sawtooth", 0.035, 0, 70); noise(0.18, 900, 1.2, 0.18); }
  function sfxBump() { var now = performance.now(); if (now - lastBump < 140) return; lastBump = now; tone(210 + Math.random() * 40, 0.06, "triangle", 0.04); }
  function sfxWin() { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.35, "triangle", 0.06, i * 0.1); }); }
  function sfxLose() { [392, 330, 262].forEach(function (f, i) { tone(f, 0.32, "triangle", 0.05, i * 0.13); }); }
  function sfxBest() { tone(1046, 0.18, "sine", 0.05); tone(1568, 0.25, "sine", 0.04, 0.08); }

  // ---- the game ----------------------------------------------------------------------------------
  var LEVELS = ["easy", "normal", "hard"], LEVEL_NAMES = { easy: "Easy", normal: "Normal", hard: "Hard" };
  var mode = store.get("pageturner_mode", "party"); if (mode !== "endless") mode = "party";
  var level = store.get("pageturner_level", "normal"); if (LEVELS.indexOf(level) < 0) level = "normal";
  // Guides: the light through the coming leaf's holes on the page below,
  // where they'll land (on: the easy way); off, only the standing leaf shows
  // where its holes are (the hard way), with records of its own. A setting,
  // picked on the menu, so never changed mid-run.
  var guides = store.get("pageturner_guides", "on") !== "off";
  var records = { on: {}, off: {} }, bests = {};
  ["on", "off"].forEach(function (g) {
    var tail = g === "on" ? "" : "_noguides";
    LEVELS.forEach(function (l) { records[g][l] = GS && GS.record ? GS.record("pageturner_record_" + l + tail) : { get: function () { return { w: 0, l: 0, d: 0 }; }, add: function () {}, text: function () { return ""; } }; });
    bests[g] = GS ? GS.best("pageturner_best_endless" + tail, { higher: true }) : { get: function () { return 0; }, submit: function () { return false; } };
  });
  // (the records for the way the guides are set)
  function rec(l) { return records[guides ? "on" : "off"][l]; }
  function best() { return bests[guides ? "on" : "off"]; }
  var OFF_NOTE = ", guides off";
  var state = "menu";        // menu | play | ending (the last slam settling) | over
  var st = null, demo = null, moved = false, endAt = 0, overAt = 0, newBest = false, OVER_WAIT = 700, END_BEAT = 1000;
  var flats = [], pops = {}, parts = [], shake = 0, clockMs = 0;

  function start(m, l) {
    if (m) mode = m === "endless" ? "endless" : "party";
    if (l && LEVELS.indexOf(l) >= 0) level = l;
    store.set("pageturner_mode", mode); store.set("pageturner_level", level);
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    st = E.create({ mode: mode, level: level });
    state = "play"; moved = false; newBest = false; flats = []; pops = {}; parts = []; shake = 0; frozen = false;
    clearInput();
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false; $("keys").hidden = false;
    layout(); hud();
  }
  function update(dt, forced) {
    if (!st || state !== "play" || pause.isPaused()) return;
    var inp = forced || currentInput();
    if (inp[0] || inp[1]) moved = true;
    E.step(st, dt, { x: inp[0], y: inp[1] });
    st.events.forEach(handle);
  }
  // a squished worm shows on the page that squished it, until the next one lands over it
  function onFloor(f, scene) { return !!scene.floor && f.page === scene.floor.n; }
  function handle(e) {
    if (e.type === "stand") { sfxStand(); hud(); }
    else if (e.type === "tip") sfxTip(E.stage(st.page).fall);
    else if (e.type === "bump") sfxBump();
    else if (e.type === "through") { pops[e.id] = clockMs; sfxThrough(e.id); }
    else if (e.type === "squish") {
      var w = st.worms[e.id];
      // (the page that landed on it: by now the book has gone on to the next)
      flats.push({ id: e.id, x: w.x, y: w.y, ang: w.ang, at: clockMs, page: w.out });
      sfxSquish();
      if (fx()) puff(w.x, w.y, 10, WORMS[e.id].light);
    } else if (e.type === "slam") {
      sfxSlam(); floorKey = "";
      if (fx()) { shake = 1; slamDust(); }
      if (st.mode === "endless" && st.worms[0].alive && best().submit(st.survived)) { if (!newBest) sfxBest(); newBest = true; }
      hud();
    } else if (e.type === "over") ended();
  }
  // the game's over: the score is kept now; the card comes up a moment later
  function ended() {
    var r = st.result;
    if (st.mode === "party") rec(level).add(r.outcome === "win" ? "w" : r.outcome === "draw" ? "d" : "l");
    else if (r.pages > 0 && best().submit(r.pages)) newBest = true;
    state = "ending"; endAt = performance.now();
    if (r.outcome === "win" || r.outcome === "closed") setTimeout(sfxWin, 250); else setTimeout(sfxLose, 350);
    hud();
  }
  function ordinal(n) { return n + (n === 2 ? "nd" : n === 3 ? "rd" : n === 1 ? "st" : "th"); }
  function showEnd() {
    var r = st.result, title, big, lines = [], pill = null;
    if (st.mode === "party") {
      var rc = rec(level).get(), recText = LEVEL_NAMES[level] + " rivals" + (guides ? "" : OFF_NOTE) + ": " + rc.w + " W · " + rc.l + " L" + (rc.d ? " · " + rc.d + " D" : "");
      if (r.outcome === "win") { title = "Last worm wriggling!"; big = "You win"; lines.push("the others were squished by page " + r.page); }
      else if (r.outcome === "draw") { title = "Squished together"; big = "A draw"; lines.push("page " + r.page + " flattened the last of you at once"); }
      else {
        var left = E.alive(st).length;
        title = "Squished!"; big = ordinal(r.place) + " of 4";
        lines.push("flattened by page " + r.page + ", " + left + (left === 1 ? " worm" : " worms") + " still wriggling");
      }
      pill = { text: recText, record: false };
    } else {
      var b = best().get();
      if (r.outcome === "closed") { title = "The End"; big = r.pages + " pages"; lines.push("you crawled through every page of the book"); }
      else { title = "Squished!"; big = r.pages + (r.pages === 1 ? " page" : " pages"); lines.push("flattened by page " + r.page); }
      pill = newBest ? { text: "your most pages yet" + (guides ? "" : OFF_NOTE), record: true } : { text: "most pages" + (guides ? "" : OFF_NOTE) + ": " + b, record: false };
    }
    $("over-title").textContent = title;
    $("over-msg").textContent = big;
    var kids = lines.map(function (t) { var s = document.createElement("span"); s.textContent = t; return s; });
    if (pill) { var p = document.createElement("span"); p.className = "best" + (pill.record ? " record" : ""); p.textContent = pill.text; kids.push(p); }
    $("over-stats").replaceChildren.apply($("over-stats"), kids);
    $("over").hidden = false; $("keys").hidden = true;
    state = "over"; overAt = performance.now();
  }
  function toMenu() {
    state = "menu"; st = null; flats = []; parts = []; clearInput();
    $("over").hidden = true; $("hud").hidden = true; $("keys").hidden = true; $("menu").hidden = false;
    floorKey = ""; paintMenu();
  }
  function hud() {
    if (!st) return;
    $("hud-page").textContent = st.page;
    var box = $("hud-worms");
    if (st.mode === "endless") { box.textContent = "most pages " + Math.max(best().get(), st.survived); return; }
    box.replaceChildren.apply(box, st.worms.map(function (w) {
      var c = document.createElement("span"), dot = document.createElement("i");
      c.className = "chip" + (w.id === 0 ? " you" : "") + (w.alive ? "" : " out");
      dot.style.background = WORMS[w.id].body;
      c.appendChild(dot); c.appendChild(document.createTextNode(w.name));
      return c;
    }));
  }

  // ---- what each page has printed on it ----------------------------------------------------------
  // (made once for each leaf from its own seed: the nonsense words, and the
  // first page of the book, which has no holes at all)
  function rand(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var TITLE = (function () {
    var r = rand(7), kinds = ["words", "sun", "words", "moon", "words", "star", "words", "flower", "words"];
    return { n: 0, holes: [], prints: kinds.map(function (k, i) { return { panel: i, kind: k }; }), seed: Math.floor(r() * 1e9) };
  })();
  function artOf(leaf) {
    if (leaf.art) return leaf.art;
    var r = rand(leaf.seed || 1), words = [];
    leaf.prints.forEach(function (p) {
      if (p.kind !== "words") return;
      var c = p.panel % 3, row = Math.floor(p.panel / 3), x0 = c / 3 + 0.04, x1 = (c + 1) / 3 - 0.04;
      for (var line = 0; line < 5; line++) {
        var y = row / 3 + 0.075 + line * 0.047, x = x0 + (line === 0 ? 0.03 : 0), end = line === 4 ? x0 + (x1 - x0) * (0.4 + r() * 0.3) : x1;
        while (x < end - 0.02) { var len = Math.min(end - x, 0.02 + r() * 0.05); words.push([x, x + len, y]); x += len + 0.018; }
      }
    });
    leaf.art = { words: words };
    return leaf.art;
  }
  // the outline of a printed picture, round its middle (page widths): the
  // holes' own shapes (the moon's whole circle on the panel's middle, as its hole's is)
  function motif(kind, cx, cy, s) {
    var pts;
    if (kind === "moon") { var o = E.midOf("moon"); pts = E.SHAPES.moon.map(function (p) { return [cx + (p[0] - o[0]) * s * 0.5, cy + (p[1] - o[1]) * s * 0.5]; }); }
    else if (kind === "star") pts = E.SHAPES.star.map(function (p) { return [cx + p[0] * s * 0.75, cy + p[1] * s * 0.75]; });
    else if (kind === "flower") pts = E.SHAPES.flower.map(function (p) { return [cx + p[0] * s * 0.8, cy + p[1] * s * 0.8]; });
    else if (kind === "window") pts = E.SHAPES.window.map(function (p) { return [cx + p[0] * s * 0.78, cy + p[1] * s * 0.78]; });
    else pts = E.SHAPES.sun.map(function (p) { return [cx + p[0] * s * 0.62, cy + p[1] * s * 0.62]; });
    return pts;
  }

  // ---- drawing a page ---------------------------------------------------------------------------------
  function trace(pts, map) {
    for (var i = 0; i < pts.length; i++) { var q = map(pts[i][0], pts[i][1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
    g.closePath();
  }
  function quadPts(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
  // a whole leaf: its paper with the holes cut out, the pictures and words
  // printed on it. `under` is the colour seen down a hole (a page lying
  // flat); without it the holes are see-through. `shade` darkens it.
  function drawLeaf(leaf, map, opts) {
    opts = opts || {};
    var col = paper(leaf.n), ink = col[1], lw = Math.max(1, S * 0.0075), art = artOf(leaf);
    g.beginPath(); trace(quadPts(0, 0, 1, 1), map);
    leaf.holes.forEach(function (h) { trace(h.poly, map); });
    g.fillStyle = col[0]; g.fill("evenodd");
    g.save(); g.clip("evenodd");
    // a printed border, as a picture book has
    g.lineWidth = lw; g.strokeStyle = ink; g.globalAlpha = 0.55;
    g.beginPath(); trace(quadPts(0.025, 0.025, 0.975, 0.975), map); g.stroke();
    g.globalAlpha = 0.28; g.beginPath(); trace(quadPts(0.04, 0.04, 0.96, 0.96), map); g.stroke();
    // the pictures that are only printed
    leaf.prints.forEach(function (p) {
      if (p.kind === "words") return;
      var m = E.panelMid(p.panel), pts = motif(p.kind, m[0], m[1], 0.105);
      g.globalAlpha = 0.16; g.fillStyle = ink; g.beginPath(); trace(pts, map); g.fill();
      g.globalAlpha = 0.75; g.strokeStyle = ink; g.lineWidth = lw; g.beginPath(); trace(pts, map); g.stroke();
      if (p.kind === "sun") rays(m[0], m[1], 0.08, 0.115, map, lw);
      if (p.kind === "window") { g.beginPath(); var a = map(m[0] - 0.08, m[1]), b = map(m[0] + 0.08, m[1]), c = map(m[0], m[1] - 0.08), d = map(m[0], m[1] + 0.08); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke(); }
    });
    // round each hole, a printed rim along its cut
    leaf.holes.forEach(function (h) {
      g.globalAlpha = 0.7; g.strokeStyle = ink; g.lineWidth = lw;
      g.beginPath(); trace(E.rim(h, 0.013), map); g.stroke();
      if (h.shape === "sun") rays(h.cx, h.cy, h.rin + 0.024, Math.min(T.panelHalf - 0.004, h.rin + 0.04), map, lw);
    });
    // the words, nonsense in tidy lines
    g.globalAlpha = 0.5; g.strokeStyle = ink; g.lineWidth = Math.max(1.2, S * 0.011); g.lineCap = "round";
    g.beginPath();
    art.words.forEach(function (w) { var a = map(w[0], w[2]), b = map(w[1], w[2]); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
    g.stroke(); g.lineCap = "butt";
    g.globalAlpha = 1;
    g.restore();
    // down a hole in a page lying flat: the page beneath, in the hole's shadow
    if (opts.under) leaf.holes.forEach(function (h) {
      g.beginPath(); trace(h.poly, map); g.fillStyle = shadeHex(paper(leaf.n - 1)[0], 0.8); g.fill();
      g.save(); g.clip(); g.lineWidth = Math.max(2, S * 0.012); g.strokeStyle = "rgba(43, 29, 61, 0.35)";
      g.beginPath(); trace(h.poly, function (x, r) { return map(x, r - 0.006); }); g.stroke(); g.restore();
    });
    if (opts.shade) {
      g.beginPath(); trace(quadPts(0, 0, 1, 1), map); leaf.holes.forEach(function (h) { trace(h.poly, map); });
      g.fillStyle = "rgba(43, 29, 61, " + opts.shade + ")"; g.fill("evenodd");
    }
    // the leaf's edge
    g.lineWidth = Math.max(1, S * 0.004); g.strokeStyle = "rgba(43, 29, 61, 0.55)";
    g.beginPath(); trace(quadPts(0, 0, 1, 1), map); g.stroke();
  }
  function rays(cx, cy, r0, r1, map, lw) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2, p = map(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0), q = map(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
    g.lineWidth = lw * 1.3; g.lineCap = "round"; g.stroke(); g.lineCap = "butt";
  }

  // ---- the book --------------------------------------------------------------------------------------
  // The page lying flat and the cover under it change only when a leaf
  // lands, so they are painted once onto a canvas of their own.
  var fcv = document.createElement("canvas"), fg = fcv.getContext("2d"), floorKey = "";
  function poly3(pts, ctx) { (ctx || g).beginPath(); pts.forEach(function (p, i) { var q = P(p[0], p[1], p[2]); if (i) (ctx || g).lineTo(q[0], q[1]); else (ctx || g).moveTo(q[0], q[1]); }); (ctx || g).closePath(); }
  function paintFloor(scene) {
    var key = [VW, VH, S, scene.floor ? scene.floor.n : 0, scene.landed || 0].join(",");
    if (key === floorKey) return;
    floorKey = key;
    fcv.width = cv.width; fcv.height = cv.height;
    var keep = g; g = fg;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, VW, VH);
    var th = 0.012 + Math.min(0.03, (scene.landed || 0) * 0.0012);
    // the cover board under the pages, its edge, and the pages already landed
    g.fillStyle = "rgba(20, 24, 70, 0.35)"; poly3([[-0.06, -0.02, -th - 0.03], [1.06, -0.02, -th - 0.03], [1.07, 1.075, -th - 0.03], [-0.07, 1.075, -th - 0.03]]); g.fill();
    g.fillStyle = CLOTH; poly3([[-0.05, -0.03, -th], [1.05, -0.03, -th], [1.05, 1.05, -th], [-0.05, 1.05, -th]]); g.fill();
    g.fillStyle = CLOTH_DARK; poly3([[-0.05, 1.05, -th], [1.05, 1.05, -th], [1.05, 1.05, -th - 0.03], [-0.05, 1.05, -th - 0.03]]); g.fill();
    g.fillStyle = "#f4f1ff"; poly3([[0, 1, 0], [1, 1, 0], [1, 1, -th], [0, 1, -th]]); g.fill();
    var n = Math.max(3, Math.min(14, (scene.landed || 0) + 3));
    for (var i = 0; i < n; i++) {
      var z = -th * (i + 0.5) / n, a = P(0, 1, z), b = P(1, 1, z);
      g.strokeStyle = paper((scene.floor ? scene.floor.n : 0) - i)[0]; g.lineWidth = Math.max(1, th * FZ * S / n * 0.8);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    drawLeaf(scene.floor || TITLE, floorMap, { under: !!scene.floor });
    g = keep;
  }
  // the far half, standing: the cover behind, the edges of the leaves still
  // to fall, and the front one, its holes showing the leaf behind it
  function drawStanding(scene, front, th) {
    g.fillStyle = CLOTH; poly3([[-0.05, -0.035, -0.012], [1.05, -0.035, -0.012], [1.05, -0.035, 1.06], [-0.05, -0.035, 1.06]]); g.fill();
    g.fillStyle = CLOTH_DARK; poly3([[-0.05, -0.035, 1.06], [1.05, -0.035, 1.06], [1.05, -0.06, 1.06], [-0.05, -0.06, 1.06]]); g.fill();
    for (var i = 0; i < 5; i++) {
      var y = -0.03 + i * 0.006;
      g.fillStyle = paper(front.n + 5 - i)[0]; poly3([[0, y, 1], [1, y, 1], [1, y + 0.006, 1], [0, y + 0.006, 1]]); g.fill();
    }
    // the leaf behind the front one
    g.fillStyle = shadeHex(paper(front.n + 1)[0], 0.82); poly3([[0, -0.004, 0], [1, -0.004, 0], [1, -0.004, 1], [0, -0.004, 1]]); g.fill();
    drawLeaf(front, leafMap(th, 0), { shade: 0.1 });
  }
  // the shadow of the leaf about to fall, with the light through its holes
  // where they will land: crisp from the first moment, the dark deepening
  // and the glow closing in as the leaf comes over
  // (Guides off: the shadow alone, darkening as the leaf comes over, no
  // light through it to give its holes away)
  function drawShadow(scene, near) {
    var leaf = scene.leaf, i;
    if (!guides && scene === st) {
      g.beginPath(); trace(quadPts(0, 0, 1, 1), floorMap);
      g.fillStyle = "rgba(24, 18, 66, " + (0.2 + 0.3 * near).toFixed(3) + ")"; g.fill();
      return;
    }
    g.beginPath(); trace(quadPts(0, 0, 1, 1), floorMap); leaf.holes.forEach(function (h) { trace(h.poly, floorMap); });
    g.fillStyle = "rgba(24, 18, 66, " + (0.2 + 0.3 * near).toFixed(3) + ")"; g.fill("evenodd");
    g.save();
    g.shadowColor = "rgba(255, 240, 180, 0.95)"; g.shadowBlur = Math.max(1, (0.05 - 0.04 * near) * S);
    g.fillStyle = "rgba(255, 248, 220, " + (0.62 + 0.3 * near).toFixed(3) + ")";
    for (i = 0; i < leaf.holes.length; i++) { g.beginPath(); trace(leaf.holes[i].poly, floorMap); g.fill(); }
    g.restore();
    g.strokeStyle = "rgba(255, 255, 248, 0.95)"; g.lineWidth = Math.max(1.5, S * 0.005);
    for (i = 0; i < leaf.holes.length; i++) { g.beginPath(); trace(leaf.holes[i].poly, floorMap); g.stroke(); }
  }

  // ---- worms ----------------------------------------------------------------------------------------------
  // A worm is five round segments inside its footprint (what the rules
  // test), its head in front with reading glasses. It wriggles as it
  // crawls: side to side along the body, more with Visual FX on.
  var SEGS = [[-0.8, 0.25], [-0.55, 0.35], [-0.26, 0.42], [0.04, 0.47], [0.4, 0.55]];
  // (squished, it spreads: longer, and wider still)
  function wormParts(w, flat) {
    var R = T.R, ca = Math.cos(w.ang), sa = Math.sin(w.ang), wig = flat ? 0 : (fx() ? 0.13 : 0.07) * R, ph = w.crawl * 42, bend = Math.max(-0.35, Math.min(0.35, (w.bend || 0) * 0.012)) * R;
    var along = flat ? 1.3 : 1, across = flat ? 1.55 : 1;
    return SEGS.map(function (s, i) {
      var k = (4 - i) / 4, lat = wig * Math.sin(ph - i * 1.3) * (0.35 + 0.65 * k) - bend * k * k;
      return { x: w.x + ca * s[0] * R * along - sa * lat, y: w.y + sa * s[0] * R * along + ca * lat, r: s[1] * R * across };
    });
  }
  function drawWorm(w, opts) {
    opts = opts || {};
    var flat = !!opts.flat, c = WORMS[w.id], parts = wormParts(w, flat), base = P(w.x, w.y, 0), sc = opts.scale || 1, i;
    var k = S * (1 + 0.06 * (w.y - 0.5));
    g.save();
    if (opts.alpha != null) g.globalAlpha = opts.alpha;
    g.translate(base[0], base[1]);
    if (flat && opts.sx) g.scale(opts.sx, 1 / opts.sx); else if (sc !== 1) g.scale(sc, sc);
    g.translate(-base[0], -base[1]);
    if (flat) {
      // pressed into the page: a dark print of it round the edge
      g.fillStyle = "rgba(43, 29, 61, 0.28)";
      parts.forEach(function (p) { var q = P(p.x, p.y, 0); g.beginPath(); g.ellipse(q[0], q[1], p.r * k * 1.25, p.r * k * 1.25 * FY, 0, 0, 7); g.fill(); });
    }
    if (!flat) { g.fillStyle = "rgba(24, 18, 66, 0.25)"; g.beginPath(); g.ellipse(base[0], base[1] + T.R * 0.15 * k, T.R * 1.05 * k, T.R * 0.62 * k, 0, 0, 7); g.fill(); }
    if (opts.you) { g.strokeStyle = "rgba(255, 255, 255, 0.85)"; g.lineWidth = Math.max(1.5, k * 0.006); g.beginPath(); g.ellipse(base[0], base[1], T.R * 1.25 * k, T.R * 1.25 * k * FY, 0, 0, 7); g.stroke(); }
    var pts = parts.map(function (p) { var q = P(p.x, p.y, flat ? 0 : p.r * 0.9); return [q[0], q[1], p.r * k]; });
    for (i = 0; i < pts.length; i++) {
      var q = pts[i];
      g.fillStyle = flat ? c.light : (i % 2 ? c.body : shadeHex(c.body, 0.92));
      g.strokeStyle = INK; g.lineWidth = Math.max(1, k * 0.0045);
      g.beginPath(); g.arc(q[0], q[1], q[2], 0, 7); g.fill(); g.stroke();
      if (!flat) { g.fillStyle = c.light; g.globalAlpha *= 0.7; g.beginPath(); g.arc(q[0] - q[2] * 0.3, q[1] - q[2] * 0.35, q[2] * 0.32, 0, 7); g.fill(); g.globalAlpha = opts.alpha != null ? opts.alpha : 1; }
    }
    // the face: eyes (crossed out when squished), glasses, a smile when facing you
    var h = pts[4], hr = h[2], dx = Math.cos(w.ang), dy = Math.sin(w.ang) * FY, dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    var ex = h[0] + dx * hr * 0.26, ey = h[1] + dy * hr * 0.26 - hr * 0.14, px = -dy, py = dx;
    for (var s = -1; s <= 1; s += 2) {
      var x = ex + px * hr * 0.4 * s, y = ey + py * hr * 0.4 * s;
      if (flat) {
        g.strokeStyle = INK; g.lineWidth = Math.max(1.2, hr * 0.14);
        g.beginPath(); g.moveTo(x - hr * 0.16, y - hr * 0.16); g.lineTo(x + hr * 0.16, y + hr * 0.16); g.moveTo(x + hr * 0.16, y - hr * 0.16); g.lineTo(x - hr * 0.16, y + hr * 0.16); g.stroke();
        continue;
      }
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x, y, hr * 0.27, 0, 7); g.fill();
      g.fillStyle = INK; g.beginPath(); g.arc(x + dx * hr * 0.09, y + dy * hr * 0.09, hr * 0.14, 0, 7); g.fill();
      g.strokeStyle = INK; g.lineWidth = Math.max(1, hr * 0.1);
      g.beginPath(); g.arc(x, y, hr * 0.36, 0, 7); g.stroke();
      g.fillStyle = "rgba(255, 255, 255, 0.35)"; g.beginPath(); g.arc(x - hr * 0.12, y - hr * 0.13, hr * 0.1, 0, 7); g.fill();
    }
    if (!flat) {
      g.strokeStyle = INK; g.lineWidth = Math.max(1, hr * 0.1);
      // the bridge of the glasses
      g.beginPath(); g.moveTo(ex - px * hr * 0.06, ey - py * hr * 0.06 - hr * 0.04); g.lineTo(ex + px * hr * 0.06, ey + py * hr * 0.06 - hr * 0.04); g.stroke();
      if (dy > 0.25) { g.beginPath(); g.arc(h[0] + dx * hr * 0.5, h[1] + dy * hr * 0.5 + hr * 0.05, hr * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    }
    g.restore();
  }

  // ---- dust, puffs and the shake (Visual FX on) ----------------------------------------------------------
  function puff(x, y, n, color) {
    var c = P(x, y, 0);
    for (var i = 0; i < n; i++) { var a = (i / n) * Math.PI * 2 + Math.random() * 0.4, sp = (0.25 + Math.random() * 0.3) * S; parts.push({ x: c[0], y: c[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * FY, life: 0, max: 0.45 + Math.random() * 0.2, r: S * (0.008 + Math.random() * 0.008), color: color }); }
  }
  function slamDust() {
    for (var i = 0; i < 26; i++) {
      var side = i % 3, t = Math.random(), x = side === 0 ? t : side === 1 ? -0.01 : 1.01, y = side === 0 ? 1.01 : t;
      var c = P(x, y, 0), a = side === 0 ? Math.PI / 2 : side === 1 ? Math.PI : 0, sp = (0.15 + Math.random() * 0.25) * S;
      a += (Math.random() - 0.5) * 1.2;
      parts.push({ x: c[0], y: c[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.4 + Math.random() * 0.3, r: S * (0.01 + Math.random() * 0.012), color: "#ffffff" });
    }
  }
  function stepParts(dt) {
    parts = parts.filter(function (p) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; return p.life < p.max; });
    shake = Math.max(0, shake - dt * 5);
  }

  // ---- a frame ----------------------------------------------------------------------------------------------
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, VW, VH);
    var scene = st || demo;
    if (!scene) return;
    paintFloor(scene);
    var sx = 0, sy = 0;
    if (shake > 0 && fx()) { sx = (Math.random() - 0.5) * S * 0.02 * shake; sy = (Math.random() - 0.5) * S * 0.02 * shake; }
    g.translate(sx, sy);
    var tilt = E.tilt(scene), falling = scene.phase === "fall", s = E.stage(scene.page);
    var front = falling || scene.phase === "over" ? scene.next : scene.leaf, tremble = 0;
    if (scene.phase === "stand" && fx() && state === "play") { var u = scene.t / s.stand; tremble = 0.035 * Math.sin(scene.t * 13) * u * u; }
    // the half lying flat, then the half standing over it: the cover's far
    // edge runs on behind the spine, so a standing leaf hides it (the cover
    // still shows either side), as the leaf does once it falls
    g.drawImage(fcv, 0, 0, fcv.width, fcv.height, 0, 0, VW, VH);
    drawStanding(scene, front, Math.PI / 2 + Math.max(0, tremble));
    if (scene.phase === "stand" || falling) drawShadow(scene, scene.phase === "stand" ? 0.3 * Math.min(1, scene.t / s.stand) : 0.3 + 0.7 * tilt);
    var th = Math.PI / 2 + tilt * Math.PI / 2, curl = fx() ? 0.22 * Math.sin(Math.PI * tilt) : 0, over = falling && tilt > EDGE_ON;
    if (falling && !over) drawLeaf(scene.leaf, leafMap(th, curl), { shade: 0.1 * (1 - tilt) });
    // the squished, flat on the page they were squished by
    flats.forEach(function (f) {
      if (!onFloor(f, scene)) return;
      var age = (clockMs - f.at) / 1000, sxk = fx() ? 1 + 0.16 * Math.sin(age * 26) * Math.exp(-age * 5) : 0;
      drawWorm({ id: f.id, x: f.x, y: f.y, ang: f.ang, crawl: 0, bend: 0 }, { flat: true, sx: sxk });
    });
    var ws = scene.worms.filter(function (w) { return w.alive; }).sort(function (a, b) { return a.y - b.y; });
    ws.forEach(function (w) {
      var sc = 1, p = pops[w.id];
      if (p != null && fx()) { var age = (clockMs - p) / 1000; if (age < 0.4) sc = 1 + 0.22 * Math.sin(age / 0.4 * Math.PI); }
      drawWorm(w, { scale: sc, you: w.id === 0 && scene.mode === "party" });
    });
    if (over) {
      drawLeaf(scene.leaf, leafMap(th, curl), { shade: 0.08 * (1 - tilt) });
      // the worms under it, seen through it, so a last dash can still be steered
      ws.forEach(function (w) { drawWorm(w, { alpha: 0.42 }); });
    }
    parts.forEach(function (p) {
      var a = 1 - p.life / p.max;
      g.globalAlpha = Math.max(0, a * 0.85); g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.r * (1 + p.life * 1.5), 0, 7); g.fill();
    });
    g.globalAlpha = 1;
  }

  // ---- the loop, pause and the way out --------------------------------------------------------------------
  var pause = GS ? GS.pausable({
    canPause: function () { return state === "play"; },
    restart: function () { start(mode, level); },
    menu: toMenu,
    onChange: function () { clearInput(); }
  }) : { isPaused: function () { return false; } };
  if (GS && GS.guardLeave) GS.guardLeave({
    active: function () { return state === "play" && !!st && (moved || st.page > 1); },
    pausable: pause
  });
  var last = 0, frozen = false;   // (frozen: the tests hold the game still to look at it)
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (state === "play" && !pause.isPaused() && !frozen) { clockMs += dt * 1000; update(dt); stepParts(dt); }
    else if (state !== "play") { clockMs += dt * 1000; stepParts(dt); }
    if (state === "ending" && now - endAt > END_BEAT) showEnd();
    draw();
  }

  // ---- input: the arrows or WASD, or a thumb anywhere ------------------------------------------------------
  var DIRS = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
  var held = {}, stick = null;
  function clearInput() { held = {}; stick = null; $("stick").hidden = true; }
  function currentInput() {
    if (stick) {
      var dx = stick.x - stick.x0, dy = stick.y - stick.y0, len = Math.hypot(dx, dy);
      if (len < 6) return [0, 0];
      var m = Math.min(1, (len - 6) / 34);
      return [dx / len * m, dy / len * m];
    }
    var x = 0, y = 0;
    for (var k in held) if (held[k] && DIRS[k]) { x += DIRS[k][0]; y += DIRS[k][1]; }
    var l = Math.hypot(x, y);
    return l ? [x / l, y / l] : [0, 0];
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (!DIRS[k] || state !== "play" || pause.isPaused()) return;
    e.preventDefault();
    held[k] = true;
    audio();
  });
  document.addEventListener("keyup", function (e) { var k = e.key.toLowerCase(); if (DIRS[k]) delete held[k]; });
  window.addEventListener("blur", clearInput);
  // the stick: wherever a finger (or the mouse) goes down, dragging from there steers
  function stickAt(x, y) {
    var el = $("stick"), knob = $("knob"), dx = x - stick.x0, dy = y - stick.y0, len = Math.hypot(dx, dy), m = Math.min(1, 40 / (len || 1));
    el.style.left = stick.x0 + "px"; el.style.top = stick.y0 + "px";
    knob.style.transform = "translate(" + (len > 40 ? dx * m : dx) + "px, " + (len > 40 ? dy * m : dy) + "px)";
  }
  document.addEventListener("pointerdown", function (e) {
    if (state !== "play" || pause.isPaused() || stick) return;
    if (e.target.closest && e.target.closest("button, a, .panel, .gs-corner, .gs-pause, .gs-dialog")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    $("stick").hidden = false; stickAt(e.clientX, e.clientY);
    audio();
  });
  document.addEventListener("pointermove", function (e) { if (!stick || e.pointerId !== stick.id) return; stick.x = e.clientX; stick.y = e.clientY; stickAt(e.clientX, e.clientY); });
  function lift(e) { if (stick && e.pointerId === stick.id) { stick = null; $("stick").hidden = true; } }
  document.addEventListener("pointerup", lift);
  document.addEventListener("pointercancel", lift);

  // ---- the menu and the end card ------------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === mode); });
    document.querySelectorAll("#pick-level button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === level); });
    $("pick-level").hidden = mode !== "party";
    var gb = $("guides");
    gb.classList.toggle("on", guides); gb.setAttribute("aria-pressed", guides ? "true" : "false");
    gb.querySelector("b").textContent = guides ? "on" : "off"; gb.querySelector("small").textContent = guides ? "easy: see where holes land" : "hard: read the standing page";
    var r = rec(level).get(), parts2 = [], bp = best().get(), off = guides ? "" : OFF_NOTE;
    if (r.w + r.l + r.d) parts2.push(LEVEL_NAMES[level] + " rivals" + off + ": " + r.w + " W · " + r.l + " L" + (r.d ? " · " + r.d + " D" : ""));
    if (bp) parts2.push("Endless" + off + ": " + bp + (bp === 1 ? " page" : " pages"));
    $("tally").textContent = parts2.join(" · ");
    demo = E.create({ mode: mode, level: level, rng: rand(11) });
    floorKey = "";
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () { mode = b.dataset.v; store.set("pageturner_mode", mode); paintMenu(); });
  });
  document.querySelectorAll("#pick-level button").forEach(function (b) {
    b.addEventListener("click", function () { level = b.dataset.v; store.set("pageturner_level", level); paintMenu(); });
  });
  $("guides").addEventListener("click", function () { guides = !guides; store.set("pageturner_guides", guides ? "on" : "off"); paintMenu(); });
  document.querySelectorAll(".card button").forEach(function (b) { b.addEventListener("mousedown", function (e) { e.preventDefault(); }); });
  $("play").addEventListener("click", function () { start(mode, level); });
  $("again").addEventListener("click", function () { start(mode, level); });
  $("to-menu").addEventListener("click", toMenu);
  if (GS && GS.menuKeys) {
    // the menu: 1 2 the mode, 3 4 5 how good the rivals are, G the guides, Space or Enter opens the book
    GS.menuKeys({ active: function () { return state === "menu"; }, groups: [{ sel: "#pick-mode button", into: "b" }, "#pick-level button", { sel: "#guides", keys: ["g"] }], start: "#play", space: true });
    // the end card: Space or Enter again (not in its first moment), Backspace the menu
    GS.menuKeys({ active: function () { return state === "over" && performance.now() - overAt > OVER_WAIT; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }], start: "#again", space: true });
  }

  window.addEventListener("resize", layout);
  toMenu();
  layout();
  // (again once the corner buttons are in, which the book keeps clear of)
  setTimeout(layout, 300);
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness drives games through these
  window.PageTurner = {
    state: function () { return state; },
    mode: function () { return mode; },
    level: function () { return level; },
    st: function () { return st; },
    start: start,
    toMenu: toMenu,
    // run the game on by `sec`, as if `input` ([x, y]) were held throughout
    advance: function (sec, input) { var n = Math.round(sec * 120); for (var i = 0; i < n && state === "play"; i++) { clockMs += 1000 / 120; update(1 / 120, input || [0, 0]); } },
    place: function (i, x, y) { var w = st.worms[i]; w.x = x; w.y = y; w.vx = w.vy = 0; },
    input: currentInput,
    record: function (l) { return rec(l || level).get(); },
    guides: function () { return guides; },
    best: function () { return best().get(); },
    view: function () { return { S: S, CX: CX, OY: OY, VW: VW, VH: VH, FY: FY, FZ: FZ }; },
    project: function (x, y, z) { var r = $("stage").getBoundingClientRect(), q = P(x, y, z || 0); return [r.left + q[0], r.top + q[1]]; },
    flats: function () { return flats.length; },
    flatsShown: function () { return st ? flats.filter(function (f) { return onFloor(f, st); }).map(function (f) { return f.id; }) : []; },
    parts: function () { return parts.length; },
    shaking: function () { return shake > 0; },
    freeze: function (on) { frozen = !!on; },
    overAt: function () { return overAt; }
  };
})();
