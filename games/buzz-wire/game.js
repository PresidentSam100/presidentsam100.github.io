/* =====================================================================
   Buzz Wire: a penny-arcade test of nerve. Each level is a closed circuit
   of live wire round the board. Pick the ring up at the post and carry it
   all the way round, forwards, back across the post: that closes the
   circuit, once every ticket on the way has been taken (until then the
   post stays shut). Touch a wire, or anything moving, and it buzzes: the
   ring is back on the post at once. Thirty levels in six stages, each
   stage bringing in one new obstacle; they all keep the level's beat.

   The sums are course.js's (the level checker runs them too). The beat
   clock counts the level's beats at its tempo from the moment it opens,
   holds while paused, and runs the same with the sound off or Visual FX
   off: the backing (synthesized here, a pattern a stage) only follows it,
   and every obstacle shows its timing on the board.

   A mouse carries the ring where it points, once picked up; a finger
   would hide it, so a finger moves it by as much as the finger moves
   (TOUCH_GAIN of it), from wherever it touches, and lifting the finger
   leaves the ring where it is. Every step of the way is checked, between
   pointer readings too, so a quick flick can't pass through a wire, and
   the pointer leaving the board counts as a touch. A pause leaves the
   ring where it was: a mouse has to come back and pick it up again.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var C = window.BuzzCourse, LVS = window.BuzzLevels, LEVELS = LVS.levels, STAGES = LVS.stages, TUNES = LVS.tunes;
  var GS = window.GameShell || null;
  var RING = C.RING, TICKET = 14, PICK = RING + 16, TOUCH_GAIN = 0.7, STEP = 3;
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = GS ? GS.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function secs(ms) { return (ms / 1000).toFixed(2) + " s"; }

  // ---- records -------------------------------------------------------------------------
  // buzzwire_best: { level: the fastest close, ms }; buzzwire_level: the level chosen
  function readJSON(k) { try { var v = JSON.parse(store.get(k, "{}")); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  var bests = readJSON("buzzwire_best");
  function cleared(n) { return bests[n] != null; }
  function isOpen(n) { return n === 0 || cleared(n) || cleared(n - 1); }
  function clearedCount() { var k = 0; for (var n = 0; n < LEVELS.length; n++) if (cleared(n)) k++; return k; }
  var kept = store.get("buzzwire_level", null), pick = kept == null ? -1 : clamp(Number(kept) || 0, 0, LEVELS.length - 1);
  if (pick < 0 || !isOpen(pick)) for (pick = 0; pick < LEVELS.length - 1 && isOpen(pick + 1) && cleared(pick); pick++);

  function nameOf(n) { return (n + 1) + " · " + LEVELS[n].name; }
  function stageOf(n) { return STAGES[LEVELS[n].stage]; }

  // ---- the state -----------------------------------------------------------------------
  var state = "menu";          // menu | play | done
  var idx = 0, L = null, c = null;
  var beat = 0;                // the level's beat clock
  var run = null;              // the ring: see freshRun
  var cardAt = 0, doneAt = 0, DONE_WAIT = 700, lastTime = 0, record = false;
  var marks = [];              // a buzz's spot: { x, y, t } (shown for a moment)
  var pops = [];               // a ticket just taken: { x, y, t }
  var trail = [];              // the ring's way, for its trail (Visual FX on)
  var shakeT = 0;

  // (how the ring was last taken: a mouse, or a finger; a touch-only screen starts on a finger)
  var lastVia = GS && GS.touchOnly && GS.touchOnly() ? "touch" : "mouse";
  function freshRun() {
    return { x: c.post.x, y: c.post.y, s: 0, P: 0, started: false, held: false, dropped: false, via: lastVia, t: 0,
             got: c.tickets.map(function () { return false; }), won: false, shutSaid: -1 };
  }
  function ticketsLeft() { var k = 0; run.got.forEach(function (g) { if (!g) k++; }); return k; }

  // ---- sound -----------------------------------------------------------------------------
  var actx = null, noise = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) try { actx = new AC(); } catch (e) { actx = null; } }
    if (actx && actx.state === "suspended") { try { actx.resume(); } catch (e) {} }
    if (actx && !noise) {
      try {
        noise = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.4), actx.sampleRate);
        var d = noise.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { noise = null; }
    }
    return actx;
  }
  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function voice(when, f, dur, type, vol, slide) {
    var ac = actx; if (!ac) return;
    try {
      var o = ac.createOscillator(), gn = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, when);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, when + dur);
      gn.gain.setValueAtTime(0.0001, when); gn.gain.exponentialRampToValueAtTime(vol, when + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(gn); gn.connect(ac.destination); o.start(when); o.stop(when + dur + 0.03);
    } catch (e) {}
  }
  function hiss(when, dur, freq, vol, type) {
    var ac = actx; if (!ac || !noise) return;
    try {
      var src = ac.createBufferSource(), fl = ac.createBiquadFilter(), gn = ac.createGain();
      src.buffer = noise; fl.type = type || "highpass"; fl.frequency.value = freq;
      gn.gain.setValueAtTime(vol, when); gn.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(fl); fl.connect(gn); gn.connect(ac.destination); src.start(when); src.stop(when + dur + 0.02);
    } catch (e) {}
  }
  function now() { return actx ? actx.currentTime : 0; }
  function sfxBuzz() { if (!audio()) return; var t = now(); voice(t, 90, 0.32, "sawtooth", 0.09, 70); voice(t, 135, 0.28, "square", 0.04, 100); hiss(t, 0.25, 2200, 0.08, "bandpass"); }
  function sfxTicket(k) { if (!audio()) return; var t = now(), f = [1047, 1175, 1319, 1397, 1568][k % 5]; voice(t, f, 0.18, "sine", 0.06); voice(t + 0.05, f * 1.5, 0.16, "sine", 0.025); }
  function sfxPick() { if (!audio()) return; voice(now(), 660, 0.06, "triangle", 0.04); }
  function sfxShut() { if (!audio()) return; var t = now(); voice(t, 330, 0.12, "triangle", 0.05); voice(t + 0.12, 247, 0.18, "triangle", 0.05); }
  function sfxBell() {
    if (!audio()) return; var t = now();
    [1568, 1975, 2349].forEach(function (f, i) { voice(t + i * 0.09, f, 1.2, "sine", 0.05); voice(t + i * 0.09, f * 2.76, 0.5, "sine", 0.012); });
  }

  // The backing: eighths of the stage's pattern, scheduled a moment ahead
  // from the beat clock (so a pause, which holds the clock, holds them too).
  var nextEighth = 0, AHEAD = 0.12;
  function music() {
    var ac = actx; if (!ac || ac.state !== "running" || state !== "play") return;
    var spb = 60 / L.bpm, tune = TUNES[L.stage], t0 = ac.currentTime;
    while (nextEighth / 2 <= beat + AHEAD / spb) {
      var e = nextEighth++, at = t0 + (e / 2 - beat) * spb;
      if (at < t0 - 0.03) continue;
      at = Math.max(at, t0);
      var i = e % 16, dr = tune.drums.charAt(i);
      if (dr === "k") voice(at, 120, 0.13, "sine", 0.16, 42);
      else if (dr === "h") hiss(at, 0.035, 7500, 0.035);
      if (tune.bass[i]) voice(at, midi(tune.bass[i]), spb * 0.45, "triangle", 0.075);
      if (tune.bell[i]) { voice(at, midi(tune.bell[i]), 0.45, "sine", 0.03); voice(at, midi(tune.bell[i]) * 3, 0.2, "sine", 0.007); }
    }
  }

  // ---- the board on the canvas -------------------------------------------------------
  var cv = $("board"), g = cv.getContext("2d");
  var dpr = 1, SIDE = 300, M = 12, K = 0.28;
  var still = document.createElement("canvas"), sg = still.getContext("2d"), stillFor = "";
  function sx(x) { return M + x * K; }
  function sy(y) { return M + y * K; }
  function toWorld(cx, cy) { var r = cv.getBoundingClientRect(); return [(cx - r.left - M) / K, (cy - r.top - M) / K]; }

  // Wide screens: the board in the middle at the screen's full height, the
  // level's plate to its left and the meters to its right, both clear of
  // the corner buttons. Tall ones: the plate over the board and the meters
  // under it, the board as wide as the screen allows.
  var wide = false;
  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight, cab = $("cabinet"), log = $("log"), helm = $("helm");
    dpr = Math.min(2, window.devicePixelRatio || 1);
    wide = vw >= vh * 1.2 && vw >= 560;
    document.body.classList.toggle("wide", wide);
    document.body.classList.toggle("tall", !wide);
    var back = document.querySelector(".nav-back-games"), br = back ? back.getBoundingClientRect() : { right: 110, bottom: 46 };
    var rightmost = vw;
    document.querySelectorAll(".gs-corner, .mute-toggle, .motion-toggle, .gs-pause-btn").forEach(function (el) {
      var r = el.getBoundingClientRect(); if (r.width && r.top < 70) rightmost = Math.min(rightmost, r.left);
    });
    var side, x0, y0;
    if (wide) {
      var left = Math.max(br.right + 12, Math.min(210, vw * 0.2)), right = Math.max(vw - rightmost + 12, Math.min(260, vw * 0.28));
      side = Math.max(180, Math.floor(Math.min(vh - 16, vw - left - right - 16)));
      x0 = Math.round(left + Math.max(0, vw - left - right - side) / 2); y0 = Math.round((vh - side) / 2);
      var top = Math.max(br.bottom, 40) + 18;
      log.style.cssText = "left:12px;top:" + top + "px;width:" + Math.max(110, x0 - 26) + "px";
      helm.style.cssText = "left:" + (x0 + side + 14) + "px;top:" + top + "px;width:" + Math.max(150, vw - x0 - side - 26) + "px";
    } else {
      var top2 = Math.max(br.bottom, 40) + 8, w = Math.min(vw - 16, 560);
      log.style.cssText = "left:8px;right:8px;top:" + top2 + "px";
      helm.style.cssText = "width:" + w + "px;left:" + Math.round((vw - w) / 2) + "px;top:0px";
      var lh = log.hidden ? 0 : log.offsetHeight, hh = helm.hidden ? 0 : helm.offsetHeight;
      side = Math.max(160, Math.floor(Math.min(vw - 12, vh - top2 - lh - hh - 20)));
      x0 = Math.round((vw - side) / 2); y0 = top2 + lh + 6;
      helm.style.top = (y0 + side + 8) + "px";
    }
    cab.style.left = x0 + "px"; cab.style.top = y0 + "px"; cab.style.width = side + "px"; cab.style.height = side + "px";
    SIDE = side;
    cv.width = Math.round(side * dpr); cv.height = Math.round(side * dpr);
    cv.style.width = side + "px"; cv.style.height = side + "px";
    M = Math.max(9, Math.round(side * 0.04));
    K = (side - 2 * M) / C.W;
    stillFor = "";
  }

  // the parts that don't move: the frame, the board, the channel and its
  // wires, the way-round arrows (drawn once a level and size)
  function paintStill() {
    var key = idx + ":" + SIDE + ":" + dpr;
    if (stillFor === key) return;
    stillFor = key;
    still.width = cv.width; still.height = cv.height;
    var m = sg;
    m.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.clearRect(0, 0, SIDE, SIDE);
    // the mahogany frame and its brass bezel
    var fr = m.createLinearGradient(0, 0, SIDE, SIDE);
    fr.addColorStop(0, "#7a3520"); fr.addColorStop(0.5, "#5b2416"); fr.addColorStop(1, "#3a160d");
    m.fillStyle = fr; m.fillRect(0, 0, SIDE, SIDE);
    m.strokeStyle = "rgba(30, 8, 2, 0.35)"; m.lineWidth = 1;
    for (var gi = 0; gi < 18; gi++) { var gy = (gi + 0.5) * SIDE / 18; m.beginPath(); m.moveTo(0, gy); m.bezierCurveTo(SIDE * 0.3, gy + 4, SIDE * 0.6, gy - 5, SIDE, gy + 2); m.stroke(); }
    m.fillStyle = "#18110e"; m.fillRect(M - 3, M - 3, SIDE - 2 * M + 6, SIDE - 2 * M + 6);
    m.strokeStyle = "#c9a24a"; m.lineWidth = 2.5; m.strokeRect(M - 3, M - 3, SIDE - 2 * M + 6, SIDE - 2 * M + 6);
    m.strokeStyle = "rgba(236, 210, 140, 0.4)"; m.lineWidth = 1; m.strokeRect(M - 6, M - 6, SIDE - 2 * M + 12, SIDE - 2 * M + 12);
    // brass terminals in the corners
    [[M / 2, M / 2], [SIDE - M / 2, M / 2], [M / 2, SIDE - M / 2], [SIDE - M / 2, SIDE - M / 2]].forEach(function (p) {
      var rr = Math.max(3, M * 0.3), bg = m.createRadialGradient(p[0] - rr * 0.3, p[1] - rr * 0.3, 1, p[0], p[1], rr);
      bg.addColorStop(0, "#f5e2a8"); bg.addColorStop(0.6, "#c9a24a"); bg.addColorStop(1, "#7d5d1e");
      m.fillStyle = bg; m.beginPath(); m.arc(p[0], p[1], rr, 0, 6.3); m.fill();
      m.strokeStyle = "#5a4012"; m.lineWidth = 1; m.beginPath(); m.moveTo(p[0] - rr * 0.6, p[1]); m.lineTo(p[0] + rr * 0.6, p[1]); m.stroke();
    });
    // the ebonite board, faintly grained
    m.save(); m.beginPath(); m.rect(M, M, SIDE - 2 * M, SIDE - 2 * M); m.clip();
    var eb = m.createRadialGradient(SIDE * 0.45, SIDE * 0.4, SIDE * 0.05, SIDE / 2, SIDE / 2, SIDE * 0.75);
    eb.addColorStop(0, "#241914"); eb.addColorStop(1, "#140d0a");
    m.fillStyle = eb; m.fillRect(M, M, SIDE - 2 * M, SIDE - 2 * M);
    // the live wires: the channel's edges in copper, the channel inside
    function capsules(extra, style) {
      m.strokeStyle = style; m.lineCap = "round";
      c.segs.forEach(function (s) { m.lineWidth = Math.max(1, 2 * (s.w + extra) * K); m.beginPath(); m.moveTo(sx(s.ax), sy(s.ay)); m.lineTo(sx(s.bx), sy(s.by)); m.stroke(); });
    }
    capsules(C.WIRE + 2.5, "rgba(120, 190, 255, 0.10)");
    capsules(C.WIRE, "#b86b38");
    capsules(C.WIRE * 0.45, "#e7a06a");
    capsules(0, "#2e231c");
    // the way round: faint chevrons along the middle
    m.strokeStyle = "rgba(201, 162, 74, 0.32)"; m.lineWidth = Math.max(1, 2.2 * K * 1.4); m.lineCap = "round"; m.lineJoin = "round";
    for (var s = 120; s < c.L - 60; s += 170) {
      var p = C.posAt(c, s), a = 9;
      m.beginPath();
      m.moveTo(sx(p.x - p.tx * a + p.nx * a), sy(p.y - p.ty * a + p.ny * a));
      m.lineTo(sx(p.x), sy(p.y));
      m.lineTo(sx(p.x - p.tx * a - p.nx * a), sy(p.y - p.ty * a - p.ny * a));
      m.stroke();
    }
    m.restore();
  }

  // the two live wires as lines (for the glow on the beat): either side of
  // the middle by the channel's half-width and half a wire
  var walls = null, wallsFor = null;
  function wallsOf() {
    if (wallsFor === c) return walls;
    var n = c.pts.length, out = [[], []];
    c.pts.forEach(function (q, i) {
      var a = c.pts[(i - 1 + n) % n], b = c.pts[(i + 1) % n], tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l, d = q.w + C.WIRE / 2;
      out[0].push([q.x + nx * d, q.y + ny * d]); out[1].push([q.x - nx * d, q.y - ny * d]);
    });
    wallsFor = c; walls = out;
    return walls;
  }
  function circle(x, y, r) { g.beginPath(); g.arc(sx(x), sy(y), Math.max(0.5, r * K), 0, Math.PI * 2); }
  // the channel between arcs s0 and s1, stroked `width` either side of the
  // middle (the channel's own width where none is given)
  // (one path, stroked once, so a see-through colour stays even)
  function stretch(s0, s1, width) {
    var n = c.segs.length, i0 = 0, w = 0, k = 0;
    for (var i = 0; i < n; i++) if (c.segs[i].s0 <= C.wrap(c, s0)) i0 = i;
    g.beginPath();
    for (var j = 0; j < n; j++) {
      var sg2 = c.segs[(i0 + j) % n];
      if (j && C.wrap(c, sg2.s0 - s0) > s1 - s0) break;
      if (!j) g.moveTo(sx(sg2.ax), sy(sg2.ay));
      g.lineTo(sx(sg2.bx), sy(sg2.by));
      w += sg2.w; k++;
    }
    g.lineJoin = "round"; g.lineCap = "butt"; g.lineWidth = Math.max(1, 2 * (width == null ? w / Math.max(1, k) : width) * K); g.stroke();
  }
  var drawn = { obstacles: 0, ring: null };
  function draw(nowT) {
    if (!c) return;
    paintStill();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    var shx = 0, shy = 0;
    if (shakeT > 0 && fx()) { shx = (Math.random() * 2 - 1) * 4 * shakeT; shy = (Math.random() * 2 - 1) * 4 * shakeT; }
    g.setTransform(dpr, 0, 0, dpr, shx * dpr, shy * dpr);
    g.drawImage(still, 0, 0, SIDE, SIDE);
    g.save(); g.beginPath(); g.rect(M, M, SIDE - 2 * M, SIDE - 2 * M); g.clip();
    var fxOn = fx(), obs = C.obstacles(c, beat);
    drawn.obstacles = obs.length;
    // (Visual FX on: the live wire glows up on each beat and dies away)
    if (fxOn && state === "play") {
      var fade = 1 - (beat - Math.floor(beat)), glow = 0.16 * fade * fade;
      if (glow > 0.01) {
        g.strokeStyle = "rgba(130, 205, 255, " + glow.toFixed(3) + ")"; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = Math.max(2, (C.WIRE + 9) * K);
        wallsOf().forEach(function (wl) { g.beginPath(); wl.forEach(function (q, i) { if (i) g.lineTo(sx(q[0]), sy(q[1])); else g.moveTo(sx(q[0]), sy(q[1])); }); g.closePath(); g.stroke(); });
      }
    }
    // live stretches: lit electric blue while live; in the beat before,
    // flickering (Visual FX on) or edged in amber dashes (off)
    obs.forEach(function (o) {
      if (o.k !== "live") return;
      g.lineCap = "round";
      if (o.on) {
        g.strokeStyle = "rgba(110, 196, 255, " + (fxOn ? 0.36 + 0.1 * Math.sin(nowT / 40) : 0.4) + ")"; stretch(o.s0, o.s1);
        g.strokeStyle = "rgba(225, 245, 255, 0.5)"; stretch(o.s0, o.s1, 6);
      } else if (o.warn) {
        if (fxOn) { g.strokeStyle = "rgba(110, 196, 255, " + (0.12 + 0.2 * (0.5 + 0.5 * Math.sin(nowT / 45))).toFixed(3) + ")"; stretch(o.s0, o.s1); }
        else { g.strokeStyle = "rgba(242, 154, 56, 0.85)"; g.setLineDash([3, 4]); stretch(o.s0, o.s1, 4); g.setLineDash([]); }
      } else { g.strokeStyle = "rgba(110, 196, 255, 0.16)"; g.setLineDash([2, 5]); stretch(o.s0, o.s1, 3); g.setLineDash([]); }
    });
    // the checkpoints round the circuit: lamps lit as they're passed
    c.checks.forEach(function (s, k) {
      var p = C.posAt(c, s), lit = run && run.P >= s, x = p.x + p.nx * (p.w + C.WIRE + 9), y = p.y + p.ny * (p.w + C.WIRE + 9);
      circle(x, y, 7); g.fillStyle = lit ? "#f2c35a" : "#3a2a1c"; g.fill();
      g.lineWidth = 1; g.strokeStyle = "#7d5d1e"; g.stroke();
      if (lit && fxOn) { circle(x, y, 12); g.fillStyle = "rgba(242, 195, 90, 0.18)"; g.fill(); }
    });
    // the post: brass, its lamp red while shut, gold once every ticket is in
    var post = c.post, open = run && ticketsLeft() === 0;
    var px = post.x - post.nx * (post.w + C.WIRE + 12), py = post.y - post.ny * (post.w + C.WIRE + 12);
    g.strokeStyle = "#c9a24a"; g.lineWidth = Math.max(1.5, 4 * K); g.beginPath();
    g.moveTo(sx(post.x - post.nx * (post.w + 2)), sy(post.y - post.ny * (post.w + 2))); g.lineTo(sx(post.x + post.nx * (post.w + 2)), sy(post.y + post.ny * (post.w + 2))); g.stroke();
    circle(px, py, 10); g.fillStyle = open ? "#f2c35a" : "#b23a2e"; g.fill(); g.lineWidth = 1.2; g.strokeStyle = "#5a4012"; g.stroke();
    if (open && fxOn) { circle(px, py, 18); g.fillStyle = "rgba(242, 195, 90, 0.22)"; g.fill(); }
    // tickets: orange paper, a punched hole
    c.tickets.forEach(function (t, k) {
      if (run && run.got[k]) return;
      var p = C.posAt(c, t.s), a = Math.atan2(p.ty, p.tx);
      g.save(); g.translate(sx(t.x), sy(t.y)); g.rotate(a);
      var w = 26 * K, h = 16 * K;
      g.fillStyle = "#f29a38"; g.strokeStyle = "#8a4a12"; g.lineWidth = 1;
      g.beginPath(); g.rect(-w / 2, -h / 2, w, h); g.fill(); g.stroke();
      g.fillStyle = "#2e231c"; g.beginPath(); g.arc(-w * 0.28, 0, Math.max(0.8, 2.6 * K), 0, 6.3); g.fill();
      g.strokeStyle = "rgba(138, 74, 18, 0.7)"; g.setLineDash([1.5, 1.5]); g.beginPath(); g.moveTo(-w * 0.1, -h / 2); g.lineTo(-w * 0.1, h / 2); g.stroke(); g.setLineDash([]);
      g.restore();
    });
    pops = pops.filter(function (q) { return nowT - q.t < 500; });
    if (fxOn) pops.forEach(function (q) { var u = (nowT - q.t) / 500; circle(q.x, q.y, 14 + 26 * u); g.strokeStyle = "rgba(242, 154, 56, " + (1 - u) + ")"; g.lineWidth = 2; g.stroke(); });
    // the obstacles
    obs.forEach(function (o) {
      if (o.k === "spark") {
        if (fxOn) {
          circle(o.x, o.y, o.r * 2); g.fillStyle = "rgba(120, 200, 255, 0.18)"; g.fill();
          g.strokeStyle = "rgba(210, 240, 255, 0.9)"; g.lineWidth = 1.2;
          for (var j = 0; j < 5; j++) {
            var a = Math.random() * 6.28, l1 = o.r * (0.9 + Math.random() * 0.7);
            g.beginPath(); g.moveTo(sx(o.x), sy(o.y)); g.lineTo(sx(o.x + Math.cos(a) * l1 * 0.5 + Math.random() * 3), sy(o.y + Math.sin(a) * l1 * 0.5 + Math.random() * 3)); g.lineTo(sx(o.x + Math.cos(a) * l1), sy(o.y + Math.sin(a) * l1)); g.stroke();
          }
        } else {
          g.strokeStyle = "rgba(190, 230, 255, 0.9)"; g.lineWidth = 1.2;
          for (var j2 = 0; j2 < 4; j2++) { var a2 = j2 * Math.PI / 4; g.beginPath(); g.moveTo(sx(o.x - Math.cos(a2) * o.r), sy(o.y - Math.sin(a2) * o.r)); g.lineTo(sx(o.x + Math.cos(a2) * o.r), sy(o.y + Math.sin(a2) * o.r)); g.stroke(); }
        }
        circle(o.x, o.y, o.r * 0.6); g.fillStyle = "#e9f7ff"; g.fill();
        circle(o.x, o.y, o.r); g.strokeStyle = "#7fd0ff"; g.lineWidth = 1.5; g.stroke();
      } else if (o.k === "weight") {
        g.strokeStyle = "#3a2a1c"; g.lineWidth = Math.max(1.5, 5 * K); g.lineCap = "round";
        g.beginPath(); g.moveTo(sx(o.px), sy(o.py)); g.lineTo(sx(o.x), sy(o.y)); g.stroke();
        g.strokeStyle = "#8a6a30"; g.lineWidth = Math.max(1, 2 * K); g.stroke();
        circle(o.px, o.py, 7); g.fillStyle = "#c9a24a"; g.fill();
        var wg = g.createRadialGradient(sx(o.x - o.r * 0.35), sy(o.y - o.r * 0.35), 1, sx(o.x), sy(o.y), o.r * K);
        wg.addColorStop(0, "#f5e2a8"); wg.addColorStop(0.55, "#c9a24a"); wg.addColorStop(1, "#6e5016");
        circle(o.x, o.y, o.r); g.fillStyle = wg; g.fill(); g.strokeStyle = "#7fd0ff"; g.lineWidth = 1.2; g.stroke();
      } else if (o.k === "gate") {
        if (o.f <= 0.001) return;
        g.lineCap = "round"; g.strokeStyle = "#7d5d1e"; g.lineWidth = Math.max(2, (2 * o.r + 3) * K);
        g.beginPath(); g.moveTo(sx(o.ax), sy(o.ay)); g.lineTo(sx(o.bx), sy(o.by)); g.stroke();
        g.strokeStyle = "#d9b25a"; g.lineWidth = Math.max(1.5, 2 * o.r * K); g.stroke();
        circle(o.bx, o.by, o.r * 0.6); g.fillStyle = "#e9f7ff"; g.fill();
      } else if (o.k === "arm") {
        g.lineCap = "round"; g.strokeStyle = "#7d5d1e"; g.lineWidth = Math.max(2, (2 * o.r + 3) * K);
        g.beginPath(); g.moveTo(sx(o.ax), sy(o.ay)); g.lineTo(sx(o.bx), sy(o.by)); g.stroke();
        g.strokeStyle = "#d9b25a"; g.lineWidth = Math.max(1.5, 2 * o.r * K); g.stroke();
        circle(o.hx, o.hy, o.hub); g.fillStyle = "#c9a24a"; g.fill(); g.strokeStyle = "#5a4012"; g.lineWidth = 1; g.stroke();
        circle(o.bx, o.by, o.r * 0.7); g.fillStyle = "#e9f7ff"; g.fill();
      }
    });
    // a buzz's spot
    marks = marks.filter(function (q) { return nowT - q.t < 800; });
    marks.forEach(function (q) {
      var u = (nowT - q.t) / 800;
      if (fxOn) { circle(q.x, q.y, 10 + 40 * u); g.fillStyle = "rgba(150, 215, 255, " + (0.55 * (1 - u)) + ")"; g.fill(); }
      g.strokeStyle = "rgba(240, 250, 255, " + (fxOn ? 1 - u : 0.95) + ")"; g.lineWidth = 2;
      var a3 = 9 * K;
      g.beginPath(); g.moveTo(sx(q.x) - a3, sy(q.y) - a3); g.lineTo(sx(q.x) + a3, sy(q.y) + a3); g.moveTo(sx(q.x) + a3, sy(q.y) - a3); g.lineTo(sx(q.x) - a3, sy(q.y) + a3); g.stroke();
    });
    // the ring (its trail behind it, Visual FX on)
    if (run) {
      if (fxOn && trail.length > 1) {
        for (var ti = 1; ti < trail.length; ti++) {
          var u2 = ti / trail.length;
          g.strokeStyle = "rgba(236, 210, 140, " + (0.35 * u2) + ")"; g.lineWidth = Math.max(1, 2 * RING * K * u2 * 0.8); g.lineCap = "round";
          g.beginPath(); g.moveTo(sx(trail[ti - 1][0]), sy(trail[ti - 1][1])); g.lineTo(sx(trail[ti][0]), sy(trail[ti][1])); g.stroke();
        }
      }
      if (run.held && fxOn) { circle(run.x, run.y, RING + 7); g.fillStyle = "rgba(242, 210, 120, 0.16)"; g.fill(); }
      circle(run.x, run.y, RING); g.lineWidth = Math.max(2, 4 * K); g.strokeStyle = "#ecd28c"; g.stroke();
      circle(run.x, run.y, RING - 2); g.lineWidth = 1; g.strokeStyle = "#7d5d1e"; g.stroke();
      circle(run.x, run.y, 3); g.fillStyle = run.held ? "#fff6d8" : "#c9a24a"; g.fill();
      // waiting to be picked up: a ring round it, pulsing (Visual FX on)
      if (!run.held && (!run.started || run.dropped) && state === "play") {
        var pr = PICK + (fxOn ? 3 * Math.sin(nowT / 220) : 0);
        circle(run.x, run.y, pr); g.setLineDash([3, 4]); g.strokeStyle = "rgba(236, 210, 140, 0.75)"; g.lineWidth = 1.2; g.stroke(); g.setLineDash([]);
      }
      drawn.ring = { x: run.x, y: run.y };
    }
    g.restore();
  }

  // ---- the run ---------------------------------------------------------------------------
  var REASON = { wire: "the ring touched the wire", spark: "a spark caught the ring", weight: "a weight caught the ring",
                 live: "the ring was on a live rail", gate: "a gate caught the ring", arm: "an arm caught the ring", off: "the ring left the board" };
  function say(text, tone) { var el = $("status"); el.textContent = text; el.className = "status" + (tone ? " " + tone : ""); }
  function sayWaiting() {
    if (!run) return;
    var touch = run.via === "touch";
    if (!run.started) say(touch ? "Touch anywhere to take hold of the ring, then slide: it goes as your finger goes." : "Press on the ring at the post to pick it up, then carry it all the way round.", "");
    else if (run.dropped) say(touch ? "Touch anywhere to carry on." : "Press on the ring to pick it up again.", "");
    else if (touch && !run.held) say("Touch anywhere to carry on.", "");
  }
  function startLevel(n) {
    idx = n; L = LEVELS[n]; c = C.build(L);
    pick = n; store.set("buzzwire_level", String(n));
    state = "play"; beat = 0; nextEighth = 0; record = false;
    run = freshRun(); trail = []; marks = []; pops = [];
    audio();
    $("menu").hidden = true; $("done").hidden = true; $("log").hidden = false; $("helm").hidden = false; $("cabinet").hidden = false;
    $("log-name").textContent = nameOf(n);
    $("log-stage").textContent = "Stage " + stageOf(n).numeral + " · " + stageOf(n).name;
    paintBest();
    paintMeters();
    layout();
    sayWaiting();
  }
  function restartLevel() { if (L) { run = freshRun(); trail = []; paintMeters(); sayWaiting(); } }
  function paintBest() {
    var b = bests[idx];
    $("log-best").textContent = b != null ? "best " + secs(b) : "not cleared yet";
    $("log-best").classList.toggle("won", b != null);
  }
  var shownBeat = -1;
  function paintMeters() {
    if (!run) return;
    $("tickets").textContent = (c.tickets.length - ticketsLeft()) + " / " + c.tickets.length;
    $("log-time").textContent = secs(run.t * 1000);
  }
  function paintBeat() {
    var k = Math.floor(beat) % 4;
    if (k === shownBeat) return;
    shownBeat = k;
    Array.prototype.forEach.call($("beats").children, function (d, i) { d.classList.toggle("on", i === k); });
  }

  function buzz(why, x, y) {
    marks.push({ x: x, y: y, t: performance.now() });
    shakeT = 1;
    sfxBuzz();
    run = freshRun(); trail = [];
    say("Buzz! " + REASON[why].charAt(0).toUpperCase() + REASON[why].slice(1) + ": back to the post.", "bad");
    paintMeters();
  }
  // the ring's way from where it is to (tx, ty), a step of STEP units at
  // a time: each step checked against the wires and the obstacles, tickets
  // taken, the way round counted and the post crossed
  function moveTo(tx, ty) {
    var dx = tx - run.x, dy = ty - run.y, d = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(d / STEP));
    var obs = C.obstacles(c, beat);
    for (var i = 1; i <= n; i++) {
      var x = run.x + dx / n, y = run.y + dy / n;
      var pr = C.project(c, x, y, run.s, 60), ds = C.wrap(c, pr.s - run.s + c.L / 2) - c.L / 2;
      var why = C.hit(c, x, y, beat, pr.s, 0, obs);
      if (why) { buzz(why, x, y); return false; }
      var before = run.P;
      run.x = x; run.y = y; run.s = pr.s; run.P += ds;
      c.tickets.forEach(function (t, k) {
        if (run.got[k] || Math.hypot(t.x - x, t.y - y) > RING + TICKET) return;
        run.got[k] = true; pops.push({ x: t.x, y: t.y, t: performance.now() });
        sfxTicket(c.tickets.length - ticketsLeft());
        var left = ticketsLeft();
        say(left ? left + (left === 1 ? " ticket" : " tickets") + " to go." : "Every ticket's in: back to the post!", left ? "" : "good");
        paintMeters();
      });
      // across the post, forwards, a whole circuit or more from the start
      var lap = Math.floor(run.P / c.L);
      if (lap >= 1 && lap > Math.floor(before / c.L)) {
        if (ticketsLeft() === 0) { win(); return false; }
        if (run.shutSaid !== lap) {
          run.shutSaid = lap; sfxShut();
          var left2 = ticketsLeft();
          say("The post stays shut: " + left2 + (left2 === 1 ? " ticket" : " tickets") + " still to take. Round again!", "bad");
        }
      }
    }
    trail.push([run.x, run.y]); if (trail.length > 10) trail.shift();
    return true;
  }
  function win() {
    run.won = true; run.held = false;
    var ms = Math.round(run.t * 1000), was = bests[idx];
    record = was == null || ms < was;
    // (the best is kept the moment it's earned, before the card)
    if (record) { bests[idx] = ms; store.set("buzzwire_best", JSON.stringify(bests)); }
    lastTime = ms;
    sfxBell();
    say("Ding! Circuit closed in " + secs(ms) + ".", "good");
    paintBest();
    state = "done"; cardAt = performance.now() + 650;
  }
  function showDone() {
    $("done").hidden = false; doneAt = performance.now();
    $("done-msg").textContent = secs(lastTime);
    var best = bests[idx], pill = document.createElement("span"), all = document.createElement("span");
    pill.className = "best" + (record ? " record" : "");
    pill.textContent = record ? "a new best" : "best " + secs(best);
    all.textContent = clearedCount() + " of " + LEVELS.length + " levels cleared";
    $("done-stats").replaceChildren(pill, all);
    $("next").hidden = idx >= LEVELS.length - 1;
  }
  function toMenu() {
    state = "menu"; run = null;
    $("done").hidden = true; $("log").hidden = true; $("helm").hidden = true; $("cabinet").hidden = true; $("menu").hidden = false;
    paintMenu();
  }

  // ---- pause, leaving and the loop --------------------------------------------------------
  var P = GS && GS.pausable ? GS.pausable({
    canPause: function () { return state === "play"; },
    restart: { go: restartLevel, title: "Start this level over?", text: "The ring goes back to the post.", ok: "Start over" },
    menu: toMenu,
    // (paused, the ring stays where it is: a mouse has to pick it up again)
    onChange: function (on) {
      if (on && run && run.held) { run.held = false; if (run.started && run.via === "mouse") run.dropped = true; }
      if (!on) sayWaiting();
    }
  }) : { isPaused: function () { return false; }, pause: function () {}, resume: function () {} };
  function paused() { return P.isPaused(); }
  if (GS && GS.guardLeave) GS.guardLeave({ active: function () { return state === "play" && !!run && run.started && !run.won; }, pausable: P });

  var last = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(0.05, (t - last) / 1000)); last = t;
    if ((state === "play" || state === "done") && !paused() && L) {
      var b0 = beat;
      beat += dt * L.bpm / 60;
      music();
      if (state === "play" && run && run.started && !run.won) {
        run.t += dt;
        // anything moving into the ring since the last frame (checked at
        // steps of a twentieth of a beat, so nothing passes through it)
        var n = Math.max(1, Math.ceil((beat - b0) * 20));
        for (var i = 1; i <= n; i++) {
          var b = b0 + (beat - b0) * i / n, why = C.hit(c, run.x, run.y, b, run.s, 0);
          if (why) { buzz(why, run.x, run.y); break; }
        }
        paintMeters();
      }
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt * 4);
    }
    if (state === "done" && $("done").hidden && t >= cardAt) showDone();
    if (state !== "menu") { paintBeat(); draw(t); }
  }

  // ---- input -------------------------------------------------------------------------------
  var finger = null;     // the finger holding the ring: { id, x, y }
  cv.addEventListener("pointerdown", function (e) {
    if (state !== "play" || paused() || !run) return;
    e.preventDefault();
    audio();
    if (e.pointerType === "touch") {
      run.via = lastVia = "touch";
      finger = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      run.held = true; run.dropped = false;
      if (!run.started) { run.started = true; sfxPick(); say("Round you go: carry the ring all the way round, back to the post.", ""); }
      return;
    }
    run.via = lastVia = "mouse";
    if (run.held) return;
    var w = toWorld(e.clientX, e.clientY);
    if (Math.hypot(w[0] - run.x, w[1] - run.y) > PICK) { sayWaiting(); return; }
    run.held = true; run.dropped = false;
    if (!run.started) { run.started = true; say("Round you go: carry the ring all the way round, back to the post.", ""); }
    sfxPick();
    moveTo(w[0], w[1]);
  });
  cv.addEventListener("pointermove", function (e) {
    if (state !== "play" || paused() || !run || !run.held || run.won) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!evs.length) evs = [e];
    if (e.pointerType === "touch") {
      if (!finger || e.pointerId !== finger.id) return;
      for (var i = 0; i < evs.length; i++) {
        var dx = (evs[i].clientX - finger.x) / K * TOUCH_GAIN, dy = (evs[i].clientY - finger.y) / K * TOUCH_GAIN;
        finger.x = evs[i].clientX; finger.y = evs[i].clientY;
        if (!moveTo(run.x + dx, run.y + dy)) return;
      }
      return;
    }
    for (var j = 0; j < evs.length; j++) {
      var w = toWorld(evs[j].clientX, evs[j].clientY);
      if (!moveTo(w[0], w[1])) return;
    }
  });
  function lift(e) {
    if (finger && e.pointerId === finger.id) {
      finger = null;
      if (run && run.held && state === "play") { run.held = false; sayWaiting(); }
    }
  }
  cv.addEventListener("pointerup", lift);
  cv.addEventListener("pointercancel", lift);
  // the mouse off the board, carrying the ring: a touch
  cv.addEventListener("pointerleave", function (e) {
    if (e.pointerType === "touch" || state !== "play" || paused() || !run || !run.held || run.won) return;
    var w = toWorld(e.clientX, e.clientY);
    buzz("off", clamp(w[0], 0, C.W), clamp(w[1], 0, C.W));
  });

  $("btn-restart").addEventListener("click", function () { if (state === "play" && !paused()) restartLevel(); });
  $("btn-levels").addEventListener("click", function () {
    if (state !== "play") return;
    if (GS && GS.askQuit && run && run.started) GS.askQuit({ title: "Leave this level for the list?", ok: "Levels" }, toMenu); else toMenu();
  });
  ["btn-restart", "btn-levels"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });

  // ---- the levels: the list, the chosen one and the card ----------------------------------
  var grid = $("grid"), lockNote = $("lock-note"), noteT = 0;
  function paintMenu() {
    paintGrid();
    paintChosen();
    var k = clearedCount();
    $("tally").textContent = k ? k + " of " + LEVELS.length + " cleared" : "";
  }
  function paintGrid() {
    grid.replaceChildren();
    STAGES.forEach(function (st, si) {
      var k = document.createElement("span");
      k.className = "stage-k";
      k.innerHTML = st.numeral + "<small></small>";
      k.lastChild.textContent = st.name;
      grid.appendChild(k);
      LEVELS.forEach(function (lv, i) {
        if (lv.stage !== si) return;
        var b = document.createElement("button"), open = isOpen(i);
        b.type = "button";
        b.className = "lv" + (open ? "" : " locked") + (cleared(i) ? " cleared" : "") + (i === pick ? " current" : "");
        b.textContent = i + 1;
        b.setAttribute("aria-label", "Level " + (i + 1) + ", " + (open ? lv.name + (cleared(i) ? ", best " + secs(bests[i]) : "") : "locked"));
        b.addEventListener("click", function () { if (isOpen(i)) startLevel(i); else sayLocked(i, b); });
        grid.appendChild(b);
      });
    });
  }
  function sayLocked(i, b) {
    lockNote.textContent = "Level " + (i + 1) + " is locked. " + (isOpen(i - 1) ? "Clear level " + i + " to open it." : "Clear the ones before it first.");
    if (b) { b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope"); }
    clearTimeout(noteT);
    noteT = setTimeout(function () { lockNote.textContent = ""; if (b) b.classList.remove("nope"); }, 2600);
  }
  function choose(n) {
    pick = n;
    store.set("buzzwire_level", String(pick));
    Array.prototype.forEach.call(grid.querySelectorAll(".lv"), function (t, i) { t.classList.toggle("current", i === pick); });
    paintChosen();
  }
  function paintChosen() {
    var lv = LEVELS[pick];
    $("pick-name").textContent = lv.name;
    $("pick-note").textContent = "level " + (pick + 1) + " · stage " + STAGES[lv.stage].numeral + " · " + STAGES[lv.stage].name.toLowerCase();
    $("pick-best").textContent = cleared(pick) ? "best " + secs(bests[pick]) : "not cleared yet";
    $("play").textContent = cleared(pick) ? "Play it again" : "Play this level";
    paintMini($("pick-pic"), lv);
  }
  // a level in small: its circuit and the post
  function paintMini(cnv, lv) {
    var r = cnv.getBoundingClientRect(), s = Math.max(40, Math.round(r.width || 76)), d = 2, cc = C.build(lv);
    cnv.width = s * d; cnv.height = s * d;
    var m = cnv.getContext("2d"), k = (s - 6) / C.W, X = function (x) { return 3 + x * k; };
    m.setTransform(d, 0, 0, d, 0, 0); m.clearRect(0, 0, s, s);
    m.fillStyle = "#18110e"; m.fillRect(0, 0, s, s);
    m.lineCap = "round";
    [["#b86b38", C.WIRE], ["#2e231c", 0]].forEach(function (st) {
      m.strokeStyle = st[0];
      cc.segs.forEach(function (sg2) { m.lineWidth = Math.max(1, 2 * (sg2.w + st[1]) * k); m.beginPath(); m.moveTo(X(sg2.ax), X(sg2.ay)); m.lineTo(X(sg2.bx), X(sg2.by)); m.stroke(); });
    });
    m.fillStyle = "#f29a38";
    cc.tickets.forEach(function (t) { m.beginPath(); m.arc(X(t.x), X(t.y), 1.6, 0, 6.3); m.fill(); });
    m.fillStyle = "#ecd28c"; m.beginPath(); m.arc(X(cc.post.x), X(cc.post.y), 2.4, 0, 6.3); m.fill();
  }
  new MutationObserver(function () {
    var t = grid.querySelector(".lv[data-gs-pick]"), i = Array.prototype.indexOf.call(grid.querySelectorAll(".lv"), t);
    if (i < 0) return;
    if (isOpen(i)) { if (i !== pick) choose(i); } else sayLocked(i, null);
  }).observe(grid, { subtree: true, attributes: true, attributeFilter: ["data-gs-pick"] });
  $("play").addEventListener("click", function () { startLevel(pick); });
  $("next").addEventListener("click", function () { startLevel(Math.min(LEVELS.length - 1, idx + 1)); });
  $("again").addEventListener("click", function () { startLevel(idx); });
  $("to-levels").addEventListener("click", toMenu);

  if (GS && GS.gridKeys) {
    GS.gridKeys({ active: function () { return state === "menu"; }, sel: "#grid .lv", first: function () { return grid.querySelector(".lv.current"); } });
    $("levels-k").insertAdjacentHTML("beforeend", GS.gridKeys.hint());
  }
  if (GS && GS.menuKeys) {
    GS.menuKeys({ active: function () { return state === "menu"; }, groups: [], start: "#play", space: true });
    GS.menuKeys({ active: function () { return state === "play" && !paused(); }, groups: [{ sel: "#btn-restart", keys: ["r"] }, { sel: "#btn-levels", keys: ["backspace"] }] });
    GS.menuKeys({ active: function () { return state === "done" && !$("done").hidden && performance.now() - doneAt > DONE_WAIT; },
      groups: [{ sel: "#again", keys: ["r"] }, { sel: "#to-levels", keys: ["backspace"] }], start: "#next", space: true });
  }

  window.addEventListener("resize", function () { layout(); if (state === "menu") paintChosen(); });
  if (window.ResizeObserver) {
    var seen = {}, ro = new ResizeObserver(function (es) {
      var moved = false;
      es.forEach(function (e) { var h = Math.round(e.target.offsetHeight); if (seen[e.target.id] !== h) { seen[e.target.id] = h; moved = true; } });
      if (moved && !wide && state !== "menu") layout();
    });
    ro.observe($("log")); ro.observe($("helm"));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); if (state === "menu") paintChosen(); });
  toMenu();
  layout();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness drives the game through these
  window.BuzzWire = {
    count: LEVELS.length,
    state: function () { return state; },
    level: function () { return idx; },
    isOpen: isOpen,
    start: startLevel,
    toMenu: toMenu,
    restart: restartLevel,
    beat: function () { return beat; },
    course: function () { return c; },
    run: function () { return run ? { x: run.x, y: run.y, s: run.s, P: run.P, started: run.started, held: run.held, dropped: run.dropped, via: run.via, t: run.t, got: run.got.slice(), won: run.won } : null; },
    best: function (n) { var v = bests[n == null ? idx : n]; return v == null ? null : v; },
    obstacles: function () { return c ? C.obstacles(c, beat) : []; },
    // where a point of the board is on the screen (client px)
    screen: function (x, y) { var r = cv.getBoundingClientRect(); return [r.left + sx(x), r.top + sy(y)]; },
    scale: function () { return K; },
    pause: function (on) { if (on) P.pause(); else P.resume(); },
    drawn: function () { return drawn; },
    eighths: function () { return nextEighth; }
  };
})();
