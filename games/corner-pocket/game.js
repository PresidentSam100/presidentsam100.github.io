/* Corner Pocket — 8-ball pool against the CPU or a friend on the same screen.
   Game flow, drawing and input live here; the table physics, the rules and
   the CPU are in physics.js, rules.js and ai.js. */
(function () {
  "use strict";
  var P = window.PoolPhysics, Ru = window.PoolRules, AI = window.PoolAI;
  var L = P.L, W = P.W, R = P.R;
  var RAIL = 0.118, CUSH = 0.042;       // wood rail and cushion depth behind the cushion nose (m)
  var LEVEL_KEYS = ["easy", "medium", "hard"];

  // ---- canvas and the one view transform ----------------------------------------
  // Drawing and hit-testing both go through V, so the portrait (table on its
  // side) layout can never drift out of step with the input.
  var canvas = document.getElementById("table");
  var ctx = canvas.getContext("2d");
  var stat = document.createElement("canvas"), sctx = stat.getContext("2d");
  var DPR = 1, CW = 0, CH = 0, lastBand = "";
  var V = { s: 300, ox: 0, oy: 0, portrait: false, outer: { x: 0, y: 0, w: 0, h: 0 } };
  var UI = { hud: null, spin: null, power: null, wheel: null, menu: null, hudInBand: true };

  function toWorld(X, Y) {
    return V.portrait ? { x: L - (Y - V.oy) / V.s, y: (X - V.ox) / V.s }
                      : { x: (X - V.ox) / V.s, y: (Y - V.oy) / V.s };
  }
  function toScreen(x, y) {
    return V.portrait ? { x: V.ox + y * V.s, y: V.oy + (L - x) * V.s }
                      : { x: V.ox + x * V.s, y: V.oy + y * V.s };
  }
  function worldXf(g) {
    var s = V.s * DPR;
    if (V.portrait) g.setTransform(0, -s, s, 0, V.ox * DPR, (V.oy + L * V.s) * DPR);
    else g.setTransform(s, 0, 0, s, V.ox * DPR, V.oy * DPR);
  }
  function screenXf(g) { g.setTransform(DPR, 0, 0, DPR, 0, 0); }

  function chromeBand() {
    // the free strip at the top between "← Games" and the pause / sound / FX buttons
    var back = document.querySelector(".nav-back-games");
    var left = back ? back.getBoundingClientRect().right + 12 : 110;
    var right = CW - 12;
    [".gs-pause-btn", ".mute-toggle", ".rm-toggle"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (r.width) right = Math.min(right, r.left - 12);
    });
    return { x: left, w: right - left };
  }

  function layout() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);   // 3x phones gain nothing visible for 2.25x the fill cost
    CW = window.innerWidth; CH = window.innerHeight;
    canvas.width = stat.width = Math.round(CW * DPR);
    canvas.height = stat.height = Math.round(CH * DPR);
    V.portrait = CH > CW * 1.08;

    var band = chromeBand(), TOP = 54, hudH = 46;
    lastBand = band.x + ":" + band.w;
    UI.hudInBand = band.w >= 400;
    UI.hud = UI.hudInBand ? { x: band.x, y: 7, w: band.w, h: 42 } : { x: 8, y: TOP, w: CW - 16, h: hudH };
    var top = UI.hudInBand ? TOP : TOP + hudH + 6;

    var avail, tw, th;
    if (!V.portrait) {
      avail = { x: 8 + 62, y: top, w: CW - 16 - 62 - 46, h: CH - top - 10 };
      tw = L + 2 * RAIL; th = W + 2 * RAIL;
    } else {
      avail = { x: 8, y: top, w: CW - 16, h: CH - top - 10 - 64 };
      tw = W + 2 * RAIL; th = L + 2 * RAIL;
    }
    V.s = Math.max(40, Math.min(avail.w / tw, avail.h / th));
    var ow = tw * V.s, oh = th * V.s;
    var ox = avail.x + (avail.w - ow) / 2, oy = avail.y + Math.max(0, (avail.h - oh) / 2);
    V.outer = { x: ox, y: oy, w: ow, h: oh };
    V.ox = ox + RAIL * V.s; V.oy = oy + RAIL * V.s;

    if (!V.portrait) {
      var colX = ox - 50;
      UI.spin = { x: colX + 18, y: oy + 30, r: 21 };
      UI.menu = { x: colX + 2, y: oy + oh - 34, w: 32, h: 32 };
      UI.power = { x: colX + 1, y: oy + 82, w: 34, h: oh - 82 - 46, vertical: true };
      UI.wheel = { x: ox + ow + 10, y: oy + 18, w: 26, h: oh - 36, vertical: true };
    } else {
      var rowY = oy + oh + 10;
      UI.spin = { x: ox + 24, y: rowY + 24, r: 21 };
      UI.menu = { x: ox + ow - 32, y: rowY + 8, w: 32, h: 32 };
      var wheelW = Math.min(96, ow * 0.26);
      UI.wheel = { x: UI.menu.x - 10 - wheelW, y: rowY + 9, w: wheelW, h: 30, vertical: false };
      UI.power = { x: ox + 56, y: rowY + 7, w: UI.wheel.x - 12 - (ox + 56), h: 34, vertical: false };
    }
    buildStatic();
    SPR.size = 0; // ball sprites re-render at the new scale
  }

  // ---- sound ---------------------------------------------------------------------
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
    var c = actx; if (!c) return;
    var t = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  var noiseBuf = null;
  function noise(dur, vol, freq, q, type, delay) {
    var c = actx; if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = c.currentTime + (delay || 0);
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf;
    f.type = type || "bandpass"; f.frequency.value = freq || 2000; f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
  }
  function sfxClick(v) {        // ball on ball: a hard, bright clack that grows with the hit
    var k = Math.min(1, v / 3);
    if (k < 0.02) return;
    noise(0.03 + 0.02 * k, 0.12 + 0.45 * k, 3200, 1.4);
    tone(1700 + Math.random() * 500, 0.035, "sine", 0.05 + 0.18 * k);
  }
  function sfxRail(v) {
    var k = Math.min(1, v / 3);
    if (k < 0.03) return;
    tone(120, 0.09, "sine", 0.06 + 0.2 * k, 0, 70);
    noise(0.05, 0.05 + 0.12 * k, 500, 0.8, "lowpass");
  }
  function sfxPocket() {
    noise(0.14, 0.3, 380, 0.7, "lowpass");
    tone(95, 0.16, "triangle", 0.2, 0, 55);
    tone(210, 0.05, "sine", 0.06, 0.12);
    noise(0.22, 0.06, 900, 2, "bandpass", 0.16);   // the rattle down the return
  }
  function sfxCue(p) {
    noise(0.03, 0.12 + 0.3 * p, 1500, 1.2);
    tone(650, 0.03, "triangle", 0.05 + 0.1 * p);
  }
  function sfxFoul() { tone(220, 0.16, "square", 0.05); tone(165, 0.24, "square", 0.05, 0.14); }
  function sfxTurn() { tone(660, 0.08, "sine", 0.05); tone(880, 0.1, "sine", 0.04, 0.07); }
  function sfxWin() { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, "triangle", 0.13, i * 0.1); }); }
  function sfxLose() { [392, 330, 262].forEach(function (f, i) { tone(f, 0.28, "sawtooth", 0.06, i * 0.14); }); }

  // ---- ball sprites ---------------------------------------------------------------
  // Each ball is shaded per pixel from its real 3-D orientation, so numbers and
  // stripes roll the way the ball does. Shading tables depend only on the sprite
  // size; a sprite re-renders only when its ball has turned.
  var COLORS = [
    [246, 242, 230], [244, 190, 16], [28, 72, 196], [212, 36, 38], [100, 44, 150],
    [240, 118, 22], [20, 128, 72], [128, 28, 34], [22, 22, 24]
  ];
  var WHITE = [245, 241, 230], INK = [22, 20, 20], DOT = [205, 40, 44];
  var SPOT_COS = Math.cos(0.4), SPOT_SIN = Math.sin(0.4);
  var GS = 40, GLYPH = [];
  (function glyphs() {
    var c = document.createElement("canvas"); c.width = c.height = GS;
    var g = c.getContext("2d", { willReadFrequently: true });
    for (var id = 1; id <= 15; id++) {
      g.clearRect(0, 0, GS, GS);
      g.fillStyle = "#000";
      g.font = "bold " + (id > 9 ? 21 : 26) + "px Arial, Helvetica, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(id), GS / 2, GS / 2 + 1.5);
      var d = g.getImageData(0, 0, GS, GS).data, a = new Uint8Array(GS * GS);
      for (var i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      GLYPH[id] = a;
    }
  })();

  var SPR = { size: 0, rpx: 0, S: 0, tab: null, cache: [] };
  function shadeTables(rpx) {
    var S = Math.ceil(rpx * 2 + 2), c = S / 2, n = S * S;
    var t = { nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
              lit: new Float32Array(n), spec: new Float32Array(n), a: new Float32Array(n) };
    var lx = -0.36, ly = -0.46, lz = -0.81, lm = Math.sqrt(lx * lx + ly * ly + lz * lz);
    lx /= lm; ly /= lm; lz /= lm;
    var hx = lx, hy = ly, hz = lz - 1, hm = Math.sqrt(hx * hx + hy * hy + hz * hz);
    hx /= hm; hy /= hm; hz /= hm;
    for (var py = 0; py < S; py++) for (var px = 0; px < S; px++) {
      var i = py * S + px;
      var dx = (px + 0.5 - c) / rpx, dy = (py + 0.5 - c) / rpx, d = Math.sqrt(dx * dx + dy * dy);
      var a = rpx * (1 - d) + 0.5;
      if (a <= 0) continue;
      t.a[i] = a > 1 ? 1 : a;
      if (d > 0.999) { dx /= d / 0.999; dy /= d / 0.999; }
      var dz = -Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
      t.nx[i] = dx; t.ny[i] = dy; t.nz[i] = dz;
      var diff = Math.max(0, dx * lx + dy * ly + dz * lz);
      t.lit[i] = (0.3 + 0.78 * diff) * (0.8 + 0.2 * -dz);
      var sp = Math.max(0, dx * hx + dy * hy + dz * hz);
      var s2 = sp * sp, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s32 = s16 * s16, s64 = s32 * s32;
      t.spec[i] = 240 * s64 + 36 * s8;
    }
    return { S: S, t: t };
  }
  function sprite(b) {
    var rpx = Math.min(34, R * V.s * DPR);
    if (SPR.size !== rpx) {
      SPR.size = rpx;
      var st = shadeTables(rpx);
      SPR.S = st.S; SPR.tab = st.t; SPR.cache = [];
    }
    var e = SPR.cache[b.id];
    if (!e) {
      var c = document.createElement("canvas");
      c.width = c.height = SPR.S;
      var g = c.getContext("2d");
      e = SPR.cache[b.id] = { c: c, g: g, img: g.createImageData(SPR.S, SPR.S), q: [9, 9, 9, 9] };
    }
    var q = b.q;
    if (Math.abs(q[0] - e.q[0]) + Math.abs(q[1] - e.q[1]) + Math.abs(q[2] - e.q[2]) + Math.abs(q[3] - e.q[3]) < 2e-4) return e.c;
    e.q[0] = q[0]; e.q[1] = q[1]; e.q[2] = q[2]; e.q[3] = q[3];
    paintBall(e, b.id, q);
    return e.c;
  }
  function paintBall(e, id, q) {
    var w = q[0], x = q[1], y = q[2], z = q[3];
    // rows of the body-to-world rotation; local = Rᵀ · world
    var m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - w * z), m02 = 2 * (x * z + w * y);
    var m10 = 2 * (x * y + w * z), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - w * x);
    var m20 = 2 * (x * z - w * y), m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y);
    var t = SPR.tab, n = SPR.S * SPR.S, data = e.img.data;
    var col = COLORS[id > 8 ? id - 8 : id], stripe = id > 8, cue = id === 0, glyph = GLYPH[id];
    for (var i = 0; i < n; i++) {
      var a = t.a[i], k = i * 4;
      if (a <= 0) { data[k + 3] = 0; continue; }
      var nx = t.nx[i], ny = t.ny[i], nz = t.nz[i];
      var lx = m00 * nx + m10 * ny + m20 * nz;
      var ly = m01 * nx + m11 * ny + m21 * nz;
      var lz = m02 * nx + m12 * ny + m22 * nz;
      var r, g, bb;
      if (cue) {
        var mx = Math.max(Math.abs(lx), Math.abs(ly), Math.abs(lz));
        if (mx > 0.992) { r = DOT[0]; g = DOT[1]; bb = DOT[2]; }
        else { r = col[0]; g = col[1]; bb = col[2]; }
      } else {
        var ax = lx < 0 ? -lx : lx;
        // body: colour, or the white caps of a stripe ball
        var wz = 0;
        if (stripe) { var az = lz < 0 ? -lz : lz; wz = az <= 0.5 ? 0 : az >= 0.53 ? 1 : (az - 0.5) / 0.03; }
        r = col[0] + (WHITE[0] - col[0]) * wz; g = col[1] + (WHITE[1] - col[1]) * wz; bb = col[2] + (WHITE[2] - col[2]) * wz;
        if (ax > SPOT_COS - 0.012) {
          // the number spot: white disc, the number printed in it
          var ws = ax >= SPOT_COS ? 1 : (ax - (SPOT_COS - 0.012)) / 0.012;
          var ink = 0;
          if (ax >= SPOT_COS - 0.004) {
            var u = (lx > 0 ? ly : -ly) / SPOT_SIN, v = lz / SPOT_SIN;
            var tx = ((u * 0.5 + 0.5) * GS) | 0, ty = ((v * 0.5 + 0.5) * GS) | 0;
            if (tx >= 0 && tx < GS && ty >= 0 && ty < GS) ink = glyph[ty * GS + tx] / 255;
          }
          var sr = WHITE[0] + (INK[0] - WHITE[0]) * ink, sg = WHITE[1] + (INK[1] - WHITE[1]) * ink, sb = WHITE[2] + (INK[2] - WHITE[2]) * ink;
          r += (sr - r) * ws; g += (sg - g) * ws; bb += (sb - bb) * ws;
        }
      }
      var lit = t.lit[i], sp = t.spec[i];
      r = r * lit + sp; g = g * lit + sp; bb = bb * lit + sp;
      data[k] = r > 255 ? 255 : r; data[k + 1] = g > 255 ? 255 : g; data[k + 2] = bb > 255 ? 255 : bb;
      data[k + 3] = a * 255;
    }
    e.g.putImageData(e.img, 0, 0);
  }
  var shadowSprite = (function () {
    var c = document.createElement("canvas"); c.width = c.height = 64;
    var g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(0.55, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  })();

  // a flat little ball for the scoreboard
  function miniBall(g, x, y, r, id, dim) {
    g.save();
    g.globalAlpha = dim ? 0.28 : 1;
    var col = COLORS[id > 8 ? id - 8 : id];
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = id > 8 ? "rgb(245,241,230)" : "rgb(" + col.join(",") + ")";
    g.fill();
    if (id > 8) {
      g.save(); g.clip();
      g.fillStyle = "rgb(" + col.join(",") + ")";
      g.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1);
      g.restore();
    }
    if (id > 0) {
      g.beginPath(); g.arc(x, y, r * 0.52, 0, Math.PI * 2);
      g.fillStyle = "#f5f1e6"; g.fill();
      g.fillStyle = "#161414";
      g.font = "700 " + Math.round(r * (id > 9 ? 0.72 : 0.86)) + "px Arial, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(id), x, y + r * 0.04);
    }
    var hl = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
    hl.addColorStop(0, "rgba(255,255,255,0.45)"); hl.addColorStop(0.35, "rgba(255,255,255,0)"); hl.addColorStop(1, "rgba(0,0,0,0.3)");
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = hl; g.fill();
    g.restore();
  }

  // ---- the static table ---------------------------------------------------------------
  function holeOf(k) {
    var p = P.pockets[k];
    return p.side ? { x: p.mx, y: p.my + p.oy * 0.056, r: 0.054 }
                  : { x: p.mx + p.ox * (0.0608 + 0.026), y: p.my + p.oy * (0.0608 + 0.026), r: 0.061 };
  }
  // the cushion rubber: each nose segment, closed off along its pocket jaws
  function cushionPolys() {
    var out = [];
    for (var i = 0; i < P.segs.length; i++) {
      var s = P.segs[i];
      if (s.len < 0.2) continue;                       // a jaw, not a rail
      var mx = (s.ax + s.bx) / 2 - L / 2, my = (s.ay + s.by) / 2 - W / 2;
      var sg = s.nx * mx + s.ny * my > 0 ? 1 : -1, onx = s.nx * sg, ony = s.ny * sg;   // outward
      var pts = [[s.ax, s.ay], [s.bx, s.by]], back = [];
      for (var e = 1; e >= 0; e--) {
        var px = pts[e][0], py = pts[e][1], jaw = null;
        for (var j = 0; j < P.segs.length; j++) {
          var q = P.segs[j];
          if (q.len < 0.2 && Math.abs(q.ax - px) < 1e-9 && Math.abs(q.ay - py) < 1e-9) jaw = q;
        }
        var dx = jaw ? jaw.dx : onx, dy = jaw ? jaw.dy : ony, dn = dx * onx + dy * ony;
        back.push([px + dx * CUSH / dn, py + dy * CUSH / dn]);
      }
      out.push([pts[0], pts[1], back[0], back[1]]);
    }
    return out;
  }
  function jawThroats() {
    var out = [];
    for (var k = 0; k < 6; k++) {
      var p = P.pockets[k], ends = [];
      p.jaw.forEach(function (pt) {
        for (var j = 0; j < P.segs.length; j++) {
          var q = P.segs[j];
          if (q.len < 0.2 && Math.abs(q.ax - pt[0]) < 1e-9 && Math.abs(q.ay - pt[1]) < 1e-9) ends.push([q.bx, q.by]);
        }
      });
      out.push([p.jaw[0], ends[0], ends[1], p.jaw[1]]);
    }
    return out;
  }
  function poly(g, pts) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  var feltNoise = (function () {
    var c = document.createElement("canvas"); c.width = c.height = 96;
    var g = c.getContext("2d"), img = g.createImageData(96, 96);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = Math.random();
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0.5 ? 255 : 0;
      img.data[i + 3] = Math.random() * 16;
    }
    g.putImageData(img, 0, 0);
    return c;
  })();

  function buildStatic() {
    var g = sctx;
    screenXf(g);
    g.clearRect(0, 0, CW, CH);
    // the room: dark, warm, one lamp over the table
    var o = V.outer, cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    var room = g.createRadialGradient(cx, cy, Math.min(o.w, o.h) * 0.3, cx, cy, Math.max(CW, CH) * 0.8);
    room.addColorStop(0, "#3a2516"); room.addColorStop(0.5, "#1c120b"); room.addColorStop(1, "#080504");
    g.fillStyle = room; g.fillRect(0, 0, CW, CH);
    // table's shadow on the floor
    g.save();
    g.shadowColor = "rgba(0,0,0,0.75)"; g.shadowBlur = 40 * DPR; g.shadowOffsetY = 16 * DPR;
    roundRect(g, o.x + 4, o.y + 4, o.w - 8, o.h - 8, 0.07 * V.s);
    g.fillStyle = "#1a0e07"; g.fill();
    g.restore();

    worldXf(g);
    var px = 1 / V.s;   // one css pixel, in metres
    // walnut rail
    roundRect(g, -RAIL, -RAIL, L + 2 * RAIL, W + 2 * RAIL, 0.07);
    var wood = g.createLinearGradient(0, -RAIL, 0, W + RAIL);
    wood.addColorStop(0, "#7a4523"); wood.addColorStop(0.08, "#5d321a"); wood.addColorStop(0.5, "#4a2713");
    wood.addColorStop(0.92, "#5d321a"); wood.addColorStop(1, "#3b1f0f");
    g.fillStyle = wood; g.fill();
    // grain
    g.save();
    roundRect(g, -RAIL, -RAIL, L + 2 * RAIL, W + 2 * RAIL, 0.07); g.clip();
    g.lineWidth = px * 1.2;
    for (var i = 0; i < 40; i++) {
      var off = -RAIL + (i / 40) * (RAIL - CUSH);
      g.strokeStyle = "rgba(20,8,2," + (0.08 + 0.1 * ((i * 37) % 7) / 7) + ")";
      g.beginPath(); g.moveTo(-RAIL, off); g.bezierCurveTo(L * 0.3, off + 0.004, L * 0.7, off - 0.004, L + RAIL, off + 0.002); g.stroke();
      g.beginPath(); g.moveTo(-RAIL, W - off); g.bezierCurveTo(L * 0.3, W - off - 0.003, L * 0.7, W - off + 0.004, L + RAIL, W - off); g.stroke();
      g.beginPath(); g.moveTo(off, -RAIL); g.bezierCurveTo(off + 0.003, W * 0.4, off - 0.003, W * 0.6, off, W + RAIL); g.stroke();
      g.beginPath(); g.moveTo(L - off, -RAIL); g.bezierCurveTo(L - off - 0.003, W * 0.4, L - off + 0.002, W * 0.6, L - off, W + RAIL); g.stroke();
    }
    g.restore();
    // brass-lined outer edge highlight
    roundRect(g, -RAIL + px, -RAIL + px, L + 2 * RAIL - 2 * px, W + 2 * RAIL - 2 * px, 0.07);
    g.strokeStyle = "rgba(255,210,150,0.25)"; g.lineWidth = px * 1.5; g.stroke();

    // cloth (runs under the cushions and into the pocket throats)
    var felt = g.createRadialGradient(L / 2, W / 2, 0.1, L / 2, W / 2, L * 0.62);
    felt.addColorStop(0, "#2a9a58"); felt.addColorStop(0.55, "#1f7e46"); felt.addColorStop(1, "#135a30");
    g.fillStyle = felt;
    g.fillRect(-CUSH, -CUSH, L + 2 * CUSH, W + 2 * CUSH);
    jawThroats().forEach(function (t) { poly(g, t); g.fill(); });
    // cloth texture, in screen pixels, clipped to the cloth
    g.save();
    g.beginPath(); g.rect(-CUSH, -CUSH, L + 2 * CUSH, W + 2 * CUSH); g.clip();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = g.createPattern(feltNoise, "repeat");
    g.fillRect(0, 0, stat.width, stat.height);
    g.restore();
    worldXf(g);

    // pockets: leather liner on the wood, then the hole
    for (var k = 0; k < 6; k++) {
      var h = holeOf(k);
      g.beginPath(); g.arc(h.x, h.y, h.r + 0.014, 0, Math.PI * 2);
      g.fillStyle = "#1e120a"; g.fill();
      g.strokeStyle = "rgba(201,164,92,0.55)"; g.lineWidth = px * 1.5; g.stroke();
      var hg = g.createRadialGradient(h.x, h.y, h.r * 0.2, h.x, h.y, h.r);
      hg.addColorStop(0, "#000"); hg.addColorStop(0.75, "#070404"); hg.addColorStop(1, "#1a0f08");
      g.beginPath(); g.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      g.fillStyle = hg; g.fill();
    }
    // cushions
    cushionPolys().forEach(function (c) {
      poly(g, c);
      g.fillStyle = "#17693a"; g.fill();
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = px; g.stroke();
      // lit nose
      g.beginPath(); g.moveTo(c[0][0], c[0][1]); g.lineTo(c[1][0], c[1][1]);
      g.strokeStyle = "rgba(160,235,180,0.35)"; g.lineWidth = px * 1.6; g.stroke();
    });
    // cushion shadow on the cloth
    g.save();
    g.beginPath(); g.rect(0, 0, L, W); g.clip();
    g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = 0.012;
    g.strokeRect(0, 0, L, W);
    g.restore();

    // mother-of-pearl sights
    var dRail = -(RAIL + CUSH) / 2;
    function sight(x, y) {
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
      g.fillStyle = "#efe6cf"; g.fillRect(-0.0055, -0.0055, 0.011, 0.011);
      g.restore();
    }
    for (i = 1; i < 8; i++) { if (i === 4) continue; sight(L * i / 8, dRail); sight(L * i / 8, W - dRail); }
    for (i = 1; i < 4; i++) { sight(dRail, W * i / 4); sight(L - dRail, W * i / 4); }

    // head string and foot spot
    g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = px * 1.2;
    g.beginPath(); g.moveTo(P.HEAD_X, 0); g.lineTo(P.HEAD_X, W); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.3)";
    g.beginPath(); g.arc(P.FOOT_X, W / 2, 0.005, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(P.HEAD_X, W / 2, 0.004, 0, Math.PI * 2); g.fill();

    // the lamp's pool of light
    var lamp = g.createRadialGradient(L / 2, W / 2, 0.05, L / 2, W / 2, L * 0.7);
    lamp.addColorStop(0, "rgba(255,240,200,0.10)"); lamp.addColorStop(1, "rgba(0,0,0,0.22)");
    g.fillStyle = lamp;
    g.fillRect(-RAIL, -RAIL, L + 2 * RAIL, W + 2 * RAIL);
  }

  // ---- game state ---------------------------------------------------------------------
  var store = window.GameShell ? GameShell.store : { get: function (k, f) { return f; }, set: function () {} };
  var settings = (function () {
    try { var s = JSON.parse(store.get("cornerpocket_settings", "") || "null"); if (s) return s; } catch (e) {}
    return { mode: "cpu", level: 1 };
  })();
  function saveSettings() { store.set("cornerpocket_settings", JSON.stringify(settings)); }
  function record(level) {
    return window.GameShell ? GameShell.record("cornerpocket_record_" + LEVEL_KEYS[level])
                            : { add: function () {}, text: function () { return ""; } };
  }

  var G = {
    phase: "menu",          // menu | flip | aim | cpu | roll | wait | over
    mode: "cpu", level: 1, names: ["You", "CPU"],
    balls: null, st: null, world: null, before: null, rng: null,
    aim: 0, power: 0, tip: { x: 0, y: 0 },
    called: -1, calledManual: false,
    acc: 0, waitT: 0, charging: false,
    cpu: null, sinking: [], toasts: [], lastTurn: -1, tally: [0, 0], pendingOver: null,
    wheelOff: 0, placeBad: false, shotCall: -1,
    aimHeld: 0,             // repeats of the arrow key held down (the aim speeds up)
    shots: 0                // shots taken this rack (none yet: nothing to lose)
  };
  var drag = null;

  function human() { return G.mode === "2p" || G.st.turn === 0; }
  function cue() { return G.balls[0]; }
  function nameOf(p) { return G.names[p]; }

  // ---- Visual FX on: the shot's motion (RM_ON() is true when FX is off) ----
  // The cue thrusts through the ball and fades (strike), fast balls leave a
  // short trail (trails: each ball's last few positions while they roll), and
  // a hard hit between balls throws sparks where they meet (sparks). With FX
  // off none of it is drawn: the stick just goes as the ball leaves.
  function fxOn() { return !(window.RM_ON && window.RM_ON()); }
  var STRIKE = 0.22, TRAIL = 5, SPARK_V = 2.2;
  var fxs = { strike: null, trails: {}, sparks: [] };
  function sparkAt(x, y, v) {
    var n = Math.min(14, 5 + Math.round(v * 1.2));
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * (0.25 + v * 0.12);
      fxs.sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.22 + Math.random() * 0.18 });
    }
  }

  function newRack(breaker) {
    fxs = { strike: null, trails: {}, sparks: [] };
    G.rng = P.rng((Math.random() * 4294967296) >>> 0);
    G.balls = P.rack(G.rng);
    G.st = Ru.newGame(breaker);
    G.sinking = []; G.toasts = []; G.lastTurn = -1; G.shots = 0;
    G.aim = 0; G.power = 0; G.tip = { x: 0, y: 0 };
    beginTurn(true);
  }

  function beginTurn(first) {
    var st = G.st;
    G.power = 0; G.tip = { x: 0, y: 0 }; G.charging = false;
    G.called = -1; G.calledManual = false; G.placeBad = false;
    if (st.inHand) {
      var c = cue(), kitchen = st.inHand === "kitchen";
      var fx = c.on ? c.x : P.HEAD_X - 0.1, fy = c.on ? c.y : W / 2;
      if (kitchen) { fx = Math.min(fx, P.HEAD_X - 0.05); }
      var spot = P.nearestFree(G.balls, fx, fy, kitchen);
      c.on = true; c.pocket = -1; c.x = spot.x; c.y = spot.y;
      c.vx = c.vy = c.wx = c.wy = c.sz = 0;
    }
    if (first) aimAtRack();
    var who = nameOf(st.turn);
    if (st.turn !== G.lastTurn && !first) sfxTurn();
    G.lastTurn = st.turn;
    if (first) toast(G.mode === "2p" ? who + " to break" : st.turn === 0 ? "Your break" : "CPU breaks", "info");
    if (human()) {
      G.phase = "aim";
      if (Ru.needsCall(st, G.balls)) toast((G.mode === "2p" ? who + ": c" : "C") + "all a pocket for the 8", "info");
    } else {
      G.phase = "cpu";
      var planBalls = G.balls;
      G.cpu = { plan: AI.plan(planBalls, st, G.level, G.rng), stage: "think", t: 0, st: 0, shot: null };
    }
  }
  function aimAtRack() {
    var c = cue(), best = null, bd = Infinity;
    for (var i = 1; i < G.balls.length; i++) {
      var b = G.balls[i];
      if (!b.on) continue;
      var d = Math.abs(b.x - P.FOOT_X) + Math.abs(b.y - W / 2);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) G.aim = Math.atan2(best.y - c.y, best.x - c.x);
  }

  function shoot(angle, power, tipX, tipY, call) {
    if (G.phase !== "aim" && G.phase !== "cpu") return;
    G.shots++;
    G.before = P.cloneBalls(G.balls);
    G.world = P.makeWorld(G.balls, true);
    P.strike(G.world, angle, power, tipX, tipY);
    G.shotCall = call;
    G.phase = "roll"; G.acc = 0; G.charging = false;
    sfxCue(power);
    var cb = cue();
    if (fxOn()) fxs.strike = { x: cb.x, y: cb.y, ang: angle, pull: 0.012 + power * 0.24, t: 0 };
  }

  var FOUL = { scratch: "scratch", nohit: "no ball hit", wrongball: "wrong ball first",
               eightfirst: "hit the 8 first", norail: "no rail after contact" };

  function endShot() {
    var res = Ru.resolve(G.st, G.before, G.world.ev, G.shotCall);
    var o = res.out, me = o.shooter, st = res.st;
    if (o.respot8) { P.spotBall(G.balls, 8); toast("The 8 went down on the break — respotted", "info"); }
    if (o.cueIn) { cue().on = false; }
    G.st = st;
    if (o.winner >= 0) { gameOver(o); return; }
    var yours = G.mode === "cpu" && st.turn === 0;
    if (o.foul) {
      sfxFoul();
      toast("Foul: " + FOUL[o.foul] + " — " + (yours ? "your ball in hand" : "ball in hand, " + nameOf(st.turn)), "bad");
    } else if (o.assigned) {
      var g = o.assigned === "solid" ? "solids" : "stripes";
      toast(G.mode === "2p" ? nameOf(me) + " takes " + g : me === 0 ? "You're " + g + "!" : "CPU takes " + g, "good");
    } else if (st.turn !== me) {
      toast(yours ? "Your turn" : nameOf(st.turn) + "'s turn", "info");
    }
    G.phase = "wait"; G.waitT = 0.45;
  }

  function gameOver(o) {
    G.phase = "wait"; G.waitT = 1.1;
    var winner = o.winner, loser = 1 - winner;
    var human0 = G.mode === "cpu";
    var title = G.mode === "2p" ? nameOf(winner) + " wins!" : winner === 0 ? "You win!" : "CPU wins";
    var W8 = {
      eight: (human0 && winner === 0 ? "You" : nameOf(winner)) + " sank the 8 in the called pocket.",
      early8: (human0 && loser === 0 ? "You" : nameOf(loser)) + " sank the 8 too early.",
      // any foul on the 8 loses, and only a scratch is a scratch
      foul8: (human0 && loser === 0 ? "You" : nameOf(loser)) + (o.foul === "scratch" ? " scratched on the 8." : " fouled on the 8: " + FOUL[o.foul] + "."),
      wrongpocket: (human0 && loser === 0 ? "You" : nameOf(loser)) + " sank the 8 in the wrong pocket."
    };
    var recText = "";
    if (G.mode === "cpu") {
      var rec = record(G.level);
      rec.add(winner === 0 ? "w" : "l");
      recText = "vs " + AI.LEVELS[G.level].name + " CPU: " + rec.text();
    } else {
      G.tally[winner]++;
      recText = G.names[0] + " " + G.tally[0] + " – " + G.tally[1] + " " + G.names[1];
    }
    G.pendingOver = { title: title, why: W8[o.reason] || "", rec: recText, good: G.mode === "2p" || winner === 0 };
  }
  function showOver() {
    var po = G.pendingOver;
    G.phase = "over";
    document.getElementById("overTitle").textContent = po.title;
    document.getElementById("overWhy").textContent = po.why;
    document.getElementById("overRec").textContent = po.rec;
    document.getElementById("over").classList.remove("hidden");
    if (po.good) sfxWin(); else sfxLose();
    setTimeout(function () { document.getElementById("againBtn").focus(); }, 30);
  }

  function toast(text, tone) {
    G.toasts.push({ text: text, tone: tone || "info", t: 0, life: 2.6 });
    if (G.toasts.length > 3) G.toasts.shift();
  }

  // ---- update -----------------------------------------------------------------------------
  function autoCall() {
    // point at the pocket the 8 is heading for; the player can tap another
    if (G.calledManual || !Ru.needsCall(G.st, G.balls)) return;
    var pr = P.predict(G.balls, G.aim);
    if (!pr || pr.kind !== "ball" || pr.id !== 8) return;
    var eight = P.byId(G.balls, 8);
    var h = P.cast(G.balls, eight.x, eight.y, pr.onx, pr.ony, 8);
    if (h && h.kind === "pocket") { G.called = h.pocket; return; }
    var best = -1, bd = -2;
    for (var k = 0; k < 6; k++) {
      var p = P.pockets[k], dx = p.mx - eight.x, dy = p.my - eight.y, m = Math.hypot(dx, dy);
      var d = (dx * pr.onx + dy * pr.ony) / m;
      if (d > bd) { bd = d; best = k; }
    }
    G.called = best;
  }

  function update(dt) {
    var i;
    if (fxs.strike && (fxs.strike.t += dt) > STRIKE) fxs.strike = null;
    for (i = fxs.sparks.length - 1; i >= 0; i--) {
      var sk = fxs.sparks[i];
      sk.t += dt; sk.x += sk.vx * dt; sk.y += sk.vy * dt; sk.vx *= 0.9; sk.vy *= 0.9;
      if (sk.t > sk.life) fxs.sparks.splice(i, 1);
    }
    if (G.phase === "roll" && fxOn() && G.balls) {
      G.balls.forEach(function (b) {
        var tr = fxs.trails[b.id] || (fxs.trails[b.id] = []);
        if (!b.on) { tr.length = 0; return; }
        tr.push({ x: b.x, y: b.y });
        if (tr.length > TRAIL) tr.shift();
      });
    } else fxs.trails = {};
    for (i = G.toasts.length - 1; i >= 0; i--) { G.toasts[i].t += dt; if (G.toasts[i].t > G.toasts[i].life) G.toasts.splice(i, 1); }
    for (i = G.sinking.length - 1; i >= 0; i--) { G.sinking[i].t += dt; if (G.sinking[i].t > 0.28) G.sinking.splice(i, 1); }

    if (G.phase === "aim") {
      if (G.charging) G.power = Math.min(1, G.power + dt / 1.5);
      autoCall();
    } else if (G.phase === "roll") {
      G.acc += dt;
      var n = 0;
      while (G.acc >= P.DT && n < 48) {
        P.step(G.world, P.DT);
        G.acc -= P.DT; n++;
        if (P.atRest(G.balls)) { G.acc = 0; break; }
      }
      drainSfx();
      if (P.atRest(G.balls)) endShot();
    } else if (G.phase === "cpu") {
      cpuUpdate(dt);
    } else if (G.phase === "wait") {
      G.waitT -= dt;
      if (G.waitT <= 0) {
        if (G.pendingOver) { showOver(); G.pendingOver = null; }
        else beginTurn(false);
      }
    }
  }

  function drainSfx() {
    var list = G.world.sfx, clicks = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.k === "ball") { if (clicks++ < 4) sfxClick(e.v); if (e.v >= SPARK_V && fxOn()) sparkAt(e.x, e.y, e.v); }
      else if (e.k === "rail") { if (clicks++ < 5) sfxRail(e.v); }
      else if (e.k === "pocket") {
        sfxPocket();
        var h = holeOf(e.pocket);
        G.sinking.push({ id: e.id, x: e.x, y: e.y, hx: h.x, hy: h.y, t: 0, q: P.byId(G.balls, e.id).q.slice() });
      }
    }
    list.length = 0;
  }

  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
  function angleLerp(a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function cpuUpdate(dt) {
    var c = G.cpu;
    c.t += dt; c.st += dt;
    if (c.stage === "think") {
      var done = c.plan.step(7);
      if (done && c.t > 0.7) {
        c.shot = c.plan.result;
        c.fromAngle = G.aim;
        var cb = cue();
        c.from = { x: cb.x, y: cb.y };
        c.stage = c.shot.place && G.st.inHand ? "place" : "aim";
        c.st = 0;
      }
    } else if (c.stage === "place") {
      var k = ease(c.st / 0.5), cb2 = cue();
      cb2.x = c.from.x + (c.shot.place.x - c.from.x) * k;
      cb2.y = c.from.y + (c.shot.place.y - c.from.y) * k;
      if (c.st >= 0.5) {
        var kitchen = G.st.inHand === "kitchen";
        var ok = P.placeOk(G.balls, c.shot.place.x, c.shot.place.y, kitchen);
        var spot = ok ? c.shot.place : P.nearestFree(G.balls, c.shot.place.x, c.shot.place.y, kitchen);
        cb2.x = spot.x; cb2.y = spot.y;
        c.stage = "aim"; c.st = 0; c.fromAngle = G.aim;
      }
    } else if (c.stage === "aim") {
      G.aim = angleLerp(c.fromAngle, c.shot.angle, ease(c.st / 0.6));
      G.tip = { x: c.shot.tipX, y: c.shot.tipY };
      if (Ru.needsCall(G.st, G.balls)) { G.called = c.shot.call; G.calledManual = true; }
      if (c.st >= 0.75) { G.aim = c.shot.angle; c.stage = "pull"; c.st = 0; }
    } else if (c.stage === "pull") {
      G.power = c.shot.power * ease(c.st / 0.45);
      if (c.st >= 0.55) shoot(c.shot.angle, c.shot.power, c.shot.tipX, c.shot.tipY, c.shot.call);
    }
  }

  // ---- drawing ------------------------------------------------------------------------------
  function draw() {
    screenXf(ctx);
    ctx.clearRect(0, 0, CW, CH);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(stat, 0, 0);
    if (!G.balls) { drawHud(); return; }
    worldXf(ctx);
    var px = 1 / V.s;
    var aiming = G.phase === "aim" || (G.phase === "cpu" && G.cpu && G.cpu.stage !== "think");
    var st = G.st;

    // the kitchen, lit up while placing for the break
    if (st.inHand === "kitchen" && (G.phase === "aim" || G.phase === "cpu")) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, 0, P.HEAD_X, W);
      ctx.setLineDash([0.02, 0.014]);
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = px * 1.5;
      ctx.beginPath(); ctx.moveTo(P.HEAD_X, 0); ctx.lineTo(P.HEAD_X, W); ctx.stroke();
      ctx.setLineDash([]);
    }
    // pocket calls
    var needCall = (G.phase === "aim" || G.phase === "cpu") && Ru.needsCall(st, G.balls);
    if (needCall) drawCalls(px);

    // shadows, then balls
    var i, b;
    for (i = 0; i < G.balls.length; i++) {
      b = G.balls[i];
      if (!b.on) continue;
      ctx.drawImage(shadowSprite, b.x - R * 0.95 + R * 0.28, b.y - R * 0.95 + R * 0.36, R * 2.1, R * 2.1);
    }
    for (i = 0; i < G.sinking.length; i++) drawSinking(G.sinking[i]);
    // (Visual FX on) a fast ball's trail: fading copies where it just was
    if (fxOn()) {
      for (i = 0; i < G.balls.length; i++) {
        b = G.balls[i];
        var tr = fxs.trails[b.id];
        if (!b.on || !tr || tr.length < 2 || Math.hypot(b.x - tr[0].x, b.y - tr[0].y) < R * 1.2) continue;
        var spT = sprite(b), hT = SPR.S / 2 * R / SPR.size;
        for (var k = 0; k < tr.length - 1; k++) {
          ctx.globalAlpha = 0.07 + 0.2 * (k / (tr.length - 1));
          ctx.drawImage(spT, tr[k].x - hT, tr[k].y - hT, hT * 2, hT * 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    for (i = 0; i < G.balls.length; i++) {
      b = G.balls[i];
      if (!b.on) continue;
      var sp = sprite(b), hh = SPR.S / 2 * R / SPR.size;   // the sprite's half-width, in metres
      ctx.drawImage(sp, b.x - hh, b.y - hh, hh * 2, hh * 2);
    }
    // ball in hand: the cue ball can be picked up
    if (st.inHand && G.phase === "aim") {
      // the ring breathes; with Visual FX off it holds at its middle brightness
      var c = cue(), pulse = window.RM_ON && window.RM_ON() ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() / 260);
      ctx.strokeStyle = G.placeBad ? "rgba(255,90,80,0.95)" : "rgba(255,255,255," + (0.45 + 0.4 * pulse) + ")";
      ctx.lineWidth = px * 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, R * 1.55, 0, Math.PI * 2); ctx.stroke();
    }
    // (Visual FX on) sparks off a hard hit
    if (fxs.sparks.length && fxOn()) {
      ctx.lineCap = "round"; ctx.lineWidth = px * 2;
      fxs.sparks.forEach(function (sk) {
        var a = 1 - sk.t / sk.life;
        ctx.strokeStyle = "rgba(255,240,190," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.moveTo(sk.x, sk.y); ctx.lineTo(sk.x - sk.vx * 0.03, sk.y - sk.vy * 0.03); ctx.stroke();
      });
    }
    if (aiming && cue().on) {
      drawGuide(px);
      stick(function () { drawCue(cue().x, cue().y, G.aim, G.power); });
    } else if (fxs.strike && fxOn()) {
      // the strike: from its pull-back the stick drives through where the
      // ball sat, follows through a touch, and fades
      var so = fxs.strike, k2 = so.t / STRIKE, drive = Math.min(1, k2 / 0.3);
      var pull = so.pull + (-0.03 - so.pull) * (1 - (1 - drive) * (1 - drive));
      stick(function () {
        ctx.globalAlpha = k2 < 0.4 ? 1 : Math.max(0, 1 - (k2 - 0.4) / 0.6);
        drawCue(so.x, so.y, so.ang, 0, pull);
        ctx.globalAlpha = 1;
      });
    }
    drawHud();
    drawControls();
    drawToasts();
  }

  function drawCalls(px) {
    var t = performance.now() / 1000, still = !!(window.RM_ON && window.RM_ON());   // Visual FX off: the called ring doesn't throb
    for (var k = 0; k < 6; k++) {
      var h = holeOf(k), on = k === G.called;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 0.012 + (on && !still ? 0.004 * Math.sin(t * 5) : 0), 0, Math.PI * 2);
      ctx.strokeStyle = on ? "rgba(255,214,90,0.95)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = px * (on ? 3 : 1.5);
      ctx.stroke();
      if (on) {
        // a little 8-ball marks the called pocket (drawn in screen space so the digit stays upright)
        var sc = toScreen(h.x, h.y), rr = Math.max(7, 0.022 * V.s);
        screenXf(ctx);
        miniBall(ctx, sc.x, sc.y, rr, 8, false);
        worldXf(ctx);
      }
    }
  }

  function drawSinking(s) {
    var k = Math.min(1, s.t / 0.26), e = k * k;
    var x = s.x + (s.hx - s.x) * e, y = s.y + (s.hy - s.y) * e, sc = 1 - 0.45 * e;
    var sp = sprite({ id: s.id, q: s.q }), half = SPR.S / 2 * R / SPR.size * sc;
    ctx.globalAlpha = 1 - e * 0.9;
    ctx.drawImage(sp, x - half, y - half, half * 2, half * 2);
    ctx.globalAlpha = 1;
  }

  function drawGuide(px) {
    var pr = P.predict(G.balls, G.aim);
    if (!pr) return;
    var c = cue(), targets = Ru.targets(G.st, G.balls);
    var legal = pr.kind !== "ball" || targets.indexOf(pr.id) >= 0;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = px * 1.6;
    ctx.beginPath(); ctx.moveTo(c.x + pr.dx * R, c.y + pr.dy * R); ctx.lineTo(pr.gx - pr.dx * R, pr.gy - pr.dy * R); ctx.stroke();
    // the ghost ball
    ctx.beginPath(); ctx.arc(pr.gx, pr.gy, R, 0, Math.PI * 2);
    ctx.strokeStyle = legal ? "rgba(255,255,255,0.9)" : "rgba(255,80,70,0.95)";
    ctx.lineWidth = px * 1.6; ctx.stroke();
    if (pr.kind === "ball") {
      if (!legal) {
        var r2 = R * 0.55;
        ctx.beginPath();
        ctx.moveTo(pr.gx - r2, pr.gy - r2); ctx.lineTo(pr.gx + r2, pr.gy + r2);
        ctx.moveTo(pr.gx + r2, pr.gy - r2); ctx.lineTo(pr.gx - r2, pr.gy + r2);
        ctx.stroke();
        return;
      }
      var along = Math.cos(pr.cut);
      var len = 0.1 + 0.32 * along;
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = px * 1.6;
      ctx.beginPath(); ctx.moveTo(pr.ox + pr.onx * R, pr.oy + pr.ony * R); ctx.lineTo(pr.ox + pr.onx * (R + len), pr.oy + pr.ony * (R + len)); ctx.stroke();
      if (pr.cdx || pr.cdy) {
        var clen = 0.05 + 0.2 * Math.sin(pr.cut);
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath(); ctx.moveTo(pr.gx, pr.gy); ctx.lineTo(pr.gx + pr.cdx * clen, pr.gy + pr.cdy * clen); ctx.stroke();
      }
    } else if (pr.kind === "rail") {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath(); ctx.moveTo(pr.gx, pr.gy); ctx.lineTo(pr.gx + pr.rdx * 0.14, pr.gy + pr.rdy * 0.14); ctx.stroke();
    }
  }

  // the stick slides under the controls rather than across them
  function stick(paint) {
    ctx.save();
    screenXf(ctx);
    ctx.beginPath();
    ctx.rect(0, 0, CW, CH);
    var s = UI.spin;
    [UI.power, UI.wheel, UI.menu, { x: s.x - s.r - 4, y: s.y - s.r - 4, w: 2 * s.r + 8, h: 2 * s.r + 20 }].forEach(function (r) {
      ctx.rect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    });
    ctx.clip("evenodd");
    worldXf(ctx);
    paint();
    ctx.restore();
  }

  // (pullAt: how far back the tip sits, for the strike; otherwise from power)
  function drawCue(x, y, ang, power, pullAt) {
    var dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    var pull = pullAt !== undefined ? pullAt : 0.012 + power * 0.24;
    var tip = R + 0.004 + pull, LEN = 1.45;
    function wAt(d) { return 0.0062 + (0.0145 - 0.0062) * (d / LEN); }
    function quad(d0, d1, fill) {
      var w0 = wAt(d0), w1 = wAt(d1);
      var ax = x - dx * (tip + d0), ay = y - dy * (tip + d0), bx = x - dx * (tip + d1), by = y - dy * (tip + d1);
      ctx.beginPath();
      ctx.moveTo(ax + nx * w0, ay + ny * w0); ctx.lineTo(bx + nx * w1, by + ny * w1);
      ctx.lineTo(bx - nx * w1, by - ny * w1); ctx.lineTo(ax - nx * w0, ay - ny * w0);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    // shadow on the cloth
    ctx.save();
    ctx.translate(0.012, 0.022);
    ctx.globalAlpha = 0.28;
    quad(0, LEN, "#000");
    ctx.restore();
    var shaft = ctx.createLinearGradient(x + nx * 0.01, y + ny * 0.01, x - nx * 0.01, y - ny * 0.01);
    shaft.addColorStop(0, "#f3dcaa"); shaft.addColorStop(0.5, "#dcb877"); shaft.addColorStop(1, "#a9824a");
    quad(0, 0.006, "#3f7fd8");                 // chalked tip
    quad(0.006, 0.028, "#f3efe2");             // ferrule
    quad(0.028, 0.92, shaft);                  // maple shaft
    quad(0.92, 0.935, "#d8b25e");              // brass joint
    quad(0.935, 1.1, "#2a170d");               // forearm
    quad(1.1, 1.12, "#d8b25e");
    quad(1.12, 1.3, "#5a1f1a");                // wrap
    quad(1.3, 1.315, "#d8b25e");
    quad(1.315, LEN, "#20120a");               // butt
    // shine along the shaft
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 0.002;
    ctx.beginPath();
    ctx.moveTo(x - dx * (tip + 0.03) + nx * 0.003, y - dy * (tip + 0.03) + ny * 0.003);
    ctx.lineTo(x - dx * (tip + 0.9) + nx * 0.006, y - dy * (tip + 0.9) + ny * 0.006);
    ctx.stroke();
  }

  function drawHud() {
    screenXf(ctx);
    var h = UI.hud;
    if (!h || G.phase === "menu") return;
    var plateW = Math.min(290, (h.w - 16) / 2), plateH = h.h;
    for (var p = 0; p < 2; p++) {
      var x = p === 0 ? h.x : h.x + h.w - plateW, y = h.y;
      var active = G.st && G.st.winner < 0 && G.st.turn === p && G.phase !== "menu" && G.phase !== "over";
      ctx.save();
      roundRect(ctx, x, y, plateW, plateH, 10);
      ctx.fillStyle = active ? "rgba(58,36,20,0.95)" : "rgba(28,17,9,0.85)";
      ctx.fill();
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeStyle = active ? "#e8c97c" : "rgba(201,164,92,0.35)";
      if (active) { ctx.shadowColor = "rgba(232,201,124,0.6)"; ctx.shadowBlur = 10; }
      ctx.stroke();
      ctx.restore();
      // avatar
      var ax = p === 0 ? x + plateH / 2 : x + plateW - plateH / 2, ay = y + plateH / 2, ar = plateH / 2 - 6;
      ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.fillStyle = p === 0 ? "#2f6f45" : (G.mode === "cpu" ? "#7a2d2a" : "#2d4f7a"); ctx.fill();
      ctx.fillStyle = "#f4e3b5"; ctx.font = "600 " + Math.round(ar * 0.9) + "px Oswald, system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(G.mode === "cpu" ? (p === 0 ? "YOU" : "CPU").slice(0, 3) : "P" + (p + 1), ax, ay + 1);
      if (!G.st) continue;
      // name
      var nameX = p === 0 ? x + plateH + 2 : x + plateW - plateH - 2;
      ctx.textAlign = p === 0 ? "left" : "right";
      ctx.fillStyle = active ? "#f7e6b8" : "#cdb27a";
      ctx.font = "600 13px Oswald, system-ui, sans-serif";
      var who = G.mode === "cpu" ? (p === 0 ? "You" : "CPU") : G.names[p];
      var grp = G.st.groups[p], gname = grp === "solid" ? "solids" : grp === "stripe" ? "stripes" : "";
      var room = plateW - plateH - 10;
      var tries = [
        G.mode === "cpu" && p === 1 ? who + " · " + AI.LEVELS[G.level].name + (gname ? "  ·  " + gname : "") : null,
        who + (gname ? "  ·  " + gname : ""),
        gname || who
      ];
      var label = who;
      for (var ti = 0; ti < tries.length; ti++) if (tries[ti] && ctx.measureText(tries[ti]).width <= room) { label = tries[ti]; break; }
      ctx.fillText(label, nameX, y + 13);
      // the group's balls
      var br = Math.max(5, Math.min(8, (plateW - plateH - 20) / 16)), gap = br * 2 + 3;
      var ids = grp === "solid" ? [1, 2, 3, 4, 5, 6, 7] : grp === "stripe" ? [9, 10, 11, 12, 13, 14, 15] : null;
      var onEight = grp && Ru.countOn(G.balls, grp) === 0;
      for (var i = 0; i < 7; i++) {
        var bx = p === 0 ? nameX + br + i * gap : nameX - br - i * gap, by = y + plateH - br - 5;
        if (ids) {
          var ball = P.byId(G.balls, ids[i]);
          miniBall(ctx, bx, by, br, ids[i], !ball.on);
        } else {
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(201,164,92,0.35)"; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      if (onEight) {
        var ex = p === 0 ? nameX + br + 7 * gap + 4 : nameX - br - 7 * gap - 4;
        miniBall(ctx, ex, y + plateH - br - 5, br, 8, false);
      }
    }
    // the middle: what's going on
    if (G.st && UI.hud.w - 2 * plateW > 60) {
      var status = statusText();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#cdb27a"; ctx.font = "500 12px Oswald, system-ui, sans-serif";
      ctx.fillText(status, h.x + h.w / 2, h.y + h.h / 2);
    }
  }
  function statusText() {
    var st = G.st;
    if (G.phase === "cpu" && G.cpu && G.cpu.stage === "think") return "CPU is lining up…";
    if (G.phase === "roll" || G.phase === "over" || G.phase === "flip" || st.winner >= 0) return "";
    if (st.isBreak) return "BREAK";
    if (st.inHand) return "BALL IN HAND";
    if (Ru.needsCall(st, G.balls)) return "CALL THE 8";
    if (st.open) return "OPEN TABLE";
    return "";
  }

  function drawControls() {
    screenXf(ctx);
    var hum = G.phase === "aim";
    var inactive = !hum;
    // spin: the cue ball, and where the cue will meet it
    var s = UI.spin;
    ctx.save();
    ctx.globalAlpha = inactive && G.phase !== "cpu" ? 0.45 : 1;
    var sg = ctx.createRadialGradient(s.x - s.r * 0.35, s.y - s.r * 0.4, 1, s.x, s.y, s.r);
    sg.addColorStop(0, "#ffffff"); sg.addColorStop(0.6, "#efeadb"); sg.addColorStop(1, "#b9b09a");
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = sg; ctx.fill();
    ctx.strokeStyle = "rgba(201,164,92,0.8)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(s.x + G.tip.x * s.r * 0.72, s.y - G.tip.y * s.r * 0.72, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = "#d8262c"; ctx.fill();
    ctx.fillStyle = "#b89a62"; ctx.font = "600 9px Oswald, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("SPIN", s.x, s.y + s.r + 3);
    ctx.restore();

    // power bar: pull the cue down (or along) and let go
    var pb = UI.power;
    ctx.save();
    roundRect(ctx, pb.x, pb.y, pb.w, pb.h, 9);
    ctx.fillStyle = "rgba(20,11,5,0.9)"; ctx.fill();
    ctx.strokeStyle = "rgba(201,164,92,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();
    var pw = G.power, inset = 5;
    if (pw > 0) {
      var grad = pb.vertical ? ctx.createLinearGradient(0, pb.y, 0, pb.y + pb.h) : ctx.createLinearGradient(pb.x, 0, pb.x + pb.w, 0);
      grad.addColorStop(0, "#5fd06a"); grad.addColorStop(0.55, "#f2cf45"); grad.addColorStop(1, "#e2483a");
      ctx.fillStyle = grad;
      if (pb.vertical) roundRect(ctx, pb.x + inset, pb.y + inset, pb.w - 2 * inset, (pb.h - 2 * inset) * pw, 5);
      else roundRect(ctx, pb.x + inset, pb.y + inset, (pb.w - 2 * inset) * pw, pb.h - 2 * inset, 5);
      ctx.fill();
    }
    // the little cue in the slot slides back as you pull
    ctx.globalAlpha = inactive && G.phase !== "cpu" ? 0.4 : 1;
    ctx.save();
    roundRect(ctx, pb.x + 2, pb.y + 2, pb.w - 4, pb.h - 4, 7); ctx.clip();
    var slot = (pb.vertical ? pb.h : pb.w) - 2 * inset, shift = slot * pw;
    function stick(a, b, col) {   // a..b along the slot, measured from the tip
      ctx.fillStyle = col;
      if (pb.vertical) ctx.fillRect(pb.x + pb.w / 2 - 3, pb.y + inset + shift + a, 6, b - a);
      else ctx.fillRect(pb.x + inset + shift + a, pb.y + pb.h / 2 - 3, b - a, 6);
    }
    stick(0, 3, "#3f7fd8");
    stick(3, 9, "#f3efe2");
    stick(9, slot * 0.62, "#e3c58a");
    stick(slot * 0.62, slot * 0.64, "#d8b25e");
    stick(slot * 0.64, slot + 4, "#4a2a16");
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#b89a62"; ctx.font = "600 9px Oswald, system-ui, sans-serif"; ctx.textAlign = "center";
    if (pb.vertical) {
      ctx.textBaseline = "bottom";
      ctx.fillText(pw > 0 ? Math.round(pw * 100) + "%" : "PULL", pb.x + pb.w / 2, pb.y - 3);
    } else {
      ctx.textBaseline = "middle";
      if (pw === 0) { ctx.fillStyle = "rgba(205,178,122,0.8)"; ctx.fillText("PULL THE CUE  ▸", pb.x + pb.w / 2 + 10, pb.y + pb.h / 2); }
      else { ctx.fillStyle = "#1b0f07"; ctx.fillText(Math.round(pw * 100) + "%", pb.x + Math.max(20, (pb.w - 10) * pw - 10), pb.y + pb.h / 2); }
    }
    ctx.restore();

    // fine-tune wheel
    var wh = UI.wheel;
    ctx.save();
    roundRect(ctx, wh.x, wh.y, wh.w, wh.h, 8);
    ctx.fillStyle = "rgba(20,11,5,0.9)"; ctx.fill();
    ctx.strokeStyle = "rgba(201,164,92,0.5)"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.clip();
    var len = wh.vertical ? wh.h : wh.w, step = 7, off = ((G.wheelOff % step) + step) % step;
    for (var d = -step + off; d < len + step; d += step) {
      var f = Math.sin(Math.PI * Math.max(0, Math.min(1, d / len)));
      ctx.strokeStyle = "rgba(232,201,124," + (0.15 + 0.55 * f) + ")"; ctx.lineWidth = 2;
      ctx.beginPath();
      if (wh.vertical) { ctx.moveTo(wh.x + 5, wh.y + d); ctx.lineTo(wh.x + wh.w - 5, wh.y + d); }
      else { ctx.moveTo(wh.x + d, wh.y + 5); ctx.lineTo(wh.x + d, wh.y + wh.h - 5); }
      ctx.stroke();
    }
    ctx.restore();

    // menu
    var m = UI.menu;
    ctx.save();
    roundRect(ctx, m.x, m.y, m.w, m.h, 8);
    ctx.fillStyle = "rgba(28,17,9,0.9)"; ctx.fill();
    ctx.strokeStyle = "rgba(201,164,92,0.6)"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = "#e8c97c";
    for (var li = 0; li < 3; li++) ctx.fillRect(m.x + 9, m.y + 10 + li * 5.5, m.w - 18, 2.2);
    ctx.restore();
  }

  function drawToasts() {
    if (!G.toasts.length) return;
    screenXf(ctx);
    var t = G.toasts[G.toasts.length - 1];
    var a = Math.min(1, t.t / 0.18, (t.life - t.t) / 0.4);
    if (window.RM_ON && window.RM_ON()) a = t.t < t.life - 0.3 ? 1 : 0;
    var o = V.outer, x = o.x + o.w / 2, y = o.y + Math.max(16, RAIL * V.s * 0.5);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = "600 14px Oswald, system-ui, sans-serif";
    var w = ctx.measureText(t.text).width + 28;
    roundRect(ctx, x - w / 2, y - 14, w, 28, 14);
    ctx.fillStyle = t.tone === "bad" ? "rgba(120,24,20,0.95)" : t.tone === "good" ? "rgba(26,86,44,0.95)" : "rgba(30,18,9,0.94)";
    ctx.fill();
    ctx.strokeStyle = t.tone === "bad" ? "#ff9a8a" : t.tone === "good" ? "#9fe3a4" : "#c9a45c"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#f7e6b8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(t.text, x, y + 1);
    ctx.restore();
  }

  // ---- input --------------------------------------------------------------------------------
  function inRect(r, x, y, pad) { pad = pad || 0; return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad; }
  function setAimToward(w) {
    var c = cue(), dx = w.x - c.x, dy = w.y - c.y;
    if (dx * dx + dy * dy > R * R * 0.25) G.aim = Math.atan2(dy, dx);
  }
  function modalOpen() {
    return ["menu", "over", "spinPad", "confirmQuit"].some(function (id) { return !document.getElementById(id).classList.contains("hidden"); });
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (modalOpen() || (Pz && Pz.isPaused()) || !UI.menu) return;
    var x = e.clientX, y = e.clientY;
    if (inRect(UI.menu, x, y, 6)) { if (G.phase !== "menu") openQuit(); return; }
    if (G.phase !== "aim") return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    var s = UI.spin;
    if (Math.hypot(x - s.x, y - s.y) <= s.r + 8) { openSpin(); return; }
    if (inRect(UI.power, x, y, 10)) { drag = { kind: "power", x0: x, y0: y }; G.charging = false; return; }
    if (inRect(UI.wheel, x, y, 8)) { drag = { kind: "wheel", last: UI.wheel.vertical ? y : x }; return; }
    var w = toWorld(x, y), c = cue();
    if (Ru.needsCall(G.st, G.balls)) {
      for (var k = 0; k < 6; k++) {
        var h = holeOf(k);
        if (Math.hypot(w.x - h.x, w.y - h.y) < h.r + 0.035) { G.called = k; G.calledManual = true; return; }
      }
    }
    var grab = Math.max(R * 2.2, 22 / V.s);
    if (G.st.inHand && Math.hypot(w.x - c.x, w.y - c.y) < grab) {
      drag = { kind: "cue", dx: c.x - w.x, dy: c.y - w.y };
      return;
    }
    drag = { kind: "aim" };
    setAimToward(w);
  });
  window.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var x = e.clientX, y = e.clientY;
    if (drag.kind === "power") {
      var len = (UI.power.vertical ? UI.power.h : UI.power.w) - 16;
      var d = UI.power.vertical ? y - drag.y0 : x - drag.x0;
      G.power = Math.max(0, Math.min(1, d / len));
    } else if (drag.kind === "wheel") {
      var v = UI.wheel.vertical ? y : x, dd = v - drag.last;
      drag.last = v;
      G.aim += dd * 0.0011 * (UI.wheel.vertical ? 1 : -1);
      G.wheelOff += dd;
    } else if (drag.kind === "cue") {
      var w = toWorld(x, y), c = cue(), kitchen = G.st.inHand === "kitchen";
      var nx = Math.max(R, Math.min((kitchen ? P.HEAD_X : L - R), w.x + drag.dx));
      var ny = Math.max(R, Math.min(W - R, w.y + drag.dy));
      c.x = nx; c.y = ny;
      G.placeBad = !P.placeOk(G.balls, nx, ny, kitchen);
    } else if (drag.kind === "aim") {
      setAimToward(toWorld(x, y));
    }
  });
  function endDrag() {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (d.kind === "power") {
      if (G.power >= 0.02 && G.phase === "aim") humanShoot();
      else G.power = 0;
    } else if (d.kind === "cue") dropCue();
  }
  // however a cue-ball drag ends, the ball lands on a legal spot, never left
  // sitting on another ball
  function dropCue() {
    var c = cue(), kitchen = G.st.inHand === "kitchen";
    if (!P.placeOk(G.balls, c.x, c.y, kitchen)) {
      var spot = P.nearestFree(G.balls, c.x, c.y, kitchen);
      c.x = spot.x; c.y = spot.y;
    }
    G.placeBad = false;
  }
  // a drag cut short (a pause, a cancelled touch) shoots nothing
  function cancelDrag() {
    if (drag && drag.kind === "power") G.power = 0;
    if (drag && drag.kind === "cue") dropCue();
    drag = null;
  }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", cancelDrag);
  canvas.addEventListener("wheel", function (e) {
    if (G.phase !== "aim" || modalOpen()) return;
    e.preventDefault();
    G.aim += (e.deltaY > 0 ? 1 : -1) * (e.shiftKey ? 0.01 : 0.0017);
    G.wheelOff += e.deltaY > 0 ? 3 : -3;
  }, { passive: false });

  var CALL_FIRST = "Call a pocket for the 8 first: tap one, or aim at the 8";
  function humanShoot() {
    if (G.placeBad) { G.power = 0; return; }   // not with the cue ball on top of another
    var needCall = Ru.needsCall(G.st, G.balls);
    // on the 8 a pocket must be named first: no shot goes without one
    if (needCall && G.called < 0) {
      G.power = 0;
      var last = G.toasts[G.toasts.length - 1];
      if (!last || last.text !== CALL_FIRST) toast(CALL_FIRST, "bad");
      return;
    }
    shoot(G.aim, G.power, G.tip.x, G.tip.y, needCall ? G.called : -1);
  }

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts aren't game keys (Alt+← is Back)
    if (modalOpen()) {
      // Esc just closes the spin pad (claimed, so the page stays)
      if (e.key === "Escape" && !document.getElementById("spinPad").classList.contains("hidden")) { e.preventDefault(); closeSpin(); }
      // and on "Leave this rack?" it's Keep playing
      else if (e.key === "Escape" && quitOpen()) { e.preventDefault(); closeQuit(); }
      // on the result card Backspace is its Menu button; Esc is left unclaimed there, so it leaves for the games page
      else if (e.key === "Backspace" && !e.repeat && !e.altKey && !document.getElementById("over").classList.contains("hidden")) { e.preventDefault(); document.getElementById("toMenuBtn").click(); }
      return;
    }
    if (G.phase !== "aim" || (Pz && Pz.isPaused())) return;
    var k = e.key;
    if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      // a press turns the aim a hair and Shift+arrow the finest step; held,
      // the arrow speeds up, so a long swing doesn't take an age
      G.aimHeld = e.repeat ? G.aimHeld + 1 : 0;
      var stepA = e.shiftKey ? 0.0009 : 0.0044 * Math.min(6, 1 + G.aimHeld / 6);
      G.aim += k === "ArrowRight" ? stepA : -stepA;
    } else if (k === " ") {
      e.preventDefault();
      if (!e.repeat && !G.charging) { G.charging = true; G.power = 0; }
    } else if (k === "w" || k === "W" || k === "s" || k === "S" || k === "a" || k === "A" || k === "d" || k === "D") {
      var lk = k.toLowerCase();
      var t = { x: G.tip.x + (lk === "d" ? 0.2 : lk === "a" ? -0.2 : 0), y: G.tip.y + (lk === "w" ? 0.2 : lk === "s" ? -0.2 : 0) };
      var m = Math.hypot(t.x, t.y);
      if (m > 1) { t.x /= m; t.y /= m; }
      G.tip = t;
    } else if (k === "c" || k === "C") {
      G.tip = { x: 0, y: 0 };
    }
  });
  document.addEventListener("keyup", function (e) {
    if (e.key === " " && G.charging) {
      e.preventDefault();
      G.charging = false;
      if (G.phase === "aim" && G.power >= 0.02) humanShoot();
      else G.power = 0;
    }
  });

  // ---- spin pad -------------------------------------------------------------------------------
  var spinCanvas = document.getElementById("spinCanvas"), spinCtx = null, spinDrag = false;
  (function () {
    var d = Math.min(window.devicePixelRatio || 1, 3);
    spinCanvas.width = 200 * d; spinCanvas.height = 200 * d;
    spinCtx = spinCanvas.getContext("2d");
    spinCtx.setTransform(d, 0, 0, d, 0, 0);
  })();
  function drawSpinPad() {
    var g = spinCtx, cx = 100, cy = 100, r = 88;
    g.clearRect(0, 0, 200, 200);
    var sg = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 6, cx, cy, r);
    sg.addColorStop(0, "#ffffff"); sg.addColorStop(0.6, "#efeadb"); sg.addColorStop(1, "#aaa18a");
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = sg; g.fill();
    g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.72, 0, Math.PI * 2); g.setLineDash([4, 5]); g.stroke(); g.setLineDash([]);
    var tx = cx + G.tip.x * r * 0.72, ty = cy - G.tip.y * r * 0.72;
    g.beginPath(); g.arc(tx, ty, 9, 0, Math.PI * 2); g.fillStyle = "#d8262c"; g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
  }
  function spinFromEvent(e) {
    var rc = spinCanvas.getBoundingClientRect();
    var x = (e.clientX - rc.left) / rc.width * 200 - 100, y = (e.clientY - rc.top) / rc.height * 200 - 100;
    var t = { x: x / (88 * 0.72), y: -y / (88 * 0.72) }, m = Math.hypot(t.x, t.y);
    if (m > 1) { t.x /= m; t.y /= m; }
    G.tip = t;
    drawSpinPad();
  }
  spinCanvas.addEventListener("pointerdown", function (e) { spinDrag = true; try { spinCanvas.setPointerCapture(e.pointerId); } catch (er) {} spinFromEvent(e); });
  spinCanvas.addEventListener("pointermove", function (e) { if (spinDrag) spinFromEvent(e); });
  spinCanvas.addEventListener("pointerup", function () { spinDrag = false; });
  function openSpin() { drawSpinPad(); document.getElementById("spinPad").classList.remove("hidden"); }
  function closeSpin() { document.getElementById("spinPad").classList.add("hidden"); releaseFocus(); }
  // a hidden overlay's button keeps focus, and Space (the shoot key) would press it again
  function releaseFocus() {
    var el = document.activeElement;
    if (el && el !== document.body && el.blur) el.blur();
  }
  document.getElementById("spinDone").addEventListener("click", closeSpin);
  document.getElementById("spinReset").addEventListener("click", function () { G.tip = { x: 0, y: 0 }; drawSpinPad(); });
  document.getElementById("spinPad").addEventListener("pointerdown", function (e) { if (e.target.id === "spinPad") closeSpin(); });

  // ---- menus ------------------------------------------------------------------------------------
  var menuEl = document.getElementById("menu");
  function renderMenu() {
    document.querySelectorAll("#modeSeg button").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.mode === settings.mode ? "true" : "false"); });
    document.querySelectorAll("#levelSeg button").forEach(function (b) { b.setAttribute("aria-checked", +b.dataset.level === settings.level ? "true" : "false"); });
    document.getElementById("levelField").style.display = settings.mode === "cpu" ? "" : "none";
    document.getElementById("recLine").textContent = settings.mode === "cpu"
      ? "Your record vs " + AI.LEVELS[settings.level].name + ": " + record(settings.level).text()
      : "Two players, one screen — pass it back and forth.";
  }
  document.querySelectorAll("#modeSeg button").forEach(function (b) {
    b.addEventListener("click", function () { settings.mode = b.dataset.mode; saveSettings(); renderMenu(); });
  });
  document.querySelectorAll("#levelSeg button").forEach(function (b) {
    b.addEventListener("click", function () { settings.level = +b.dataset.level; saveSettings(); renderMenu(); });
  });
  function startGame(fresh) {
    G.mode = settings.mode; G.level = settings.level;
    G.names = G.mode === "cpu" ? ["You", "CPU"] : ["Player 1", "Player 2"];
    if (fresh) G.tally = [0, 0];
    menuEl.classList.add("hidden");
    document.getElementById("over").classList.add("hidden");
    releaseFocus();
    G.phase = "flip";
    // show the racked table under the coin flip
    G.balls = P.rack(P.rng((Math.random() * 4294967296) >>> 0));
    G.st = Ru.newGame(0);
    G.st.turn = -1;       // nobody's plate lights up until the flip lands
    G.pendingOver = null;
    var go = function (who) { if (G.phase === "flip") newRack(who === "you" ? 0 : 1); };
    if (window.coinFlip) {
      coinFlip(G.mode === "cpu"
        ? { you: "You", cpu: "CPU", accent: "#c9a45c", youColor: "#9fe3a4", cpuColor: "#ff9a8a" }
        : { you: "Player 1", cpu: "Player 2", accent: "#c9a45c", youColor: "#9fe3a4", cpuColor: "#8ab8ff" }, go);
    } else go(Math.random() < 0.5 ? "you" : "cpu");
  }
  document.getElementById("startBtn").addEventListener("click", function () { ac(); startGame(true); });
  document.getElementById("againBtn").addEventListener("click", function () { startGame(false); });
  document.getElementById("toMenuBtn").addEventListener("click", function () {
    document.getElementById("over").classList.add("hidden");
    showMenu();
  });
  function showMenu() {
    G.phase = "menu";
    renderMenu();
    menuEl.classList.remove("hidden");
    setTimeout(function () { document.getElementById("startBtn").focus(); }, 30);
  }
  // Menu keys, shown on the buttons: 1 2 the opponent, 3 4 5 the CPU's level
  // (Enter is the Rack 'em button's own, as it has the focus)
  if (window.GameShell && GameShell.menuKeys) GameShell.menuKeys({
    active: function () { return G.phase === "menu" && !menuEl.classList.contains("hidden"); },
    groups: ["#modeSeg button", "#levelSeg button"],
    start: "#startBtn"
  });
  // "Leave this rack?" holds the table while it asks: the CPU and a rolling
  // shot wait (see frame), and a drag or a charging shot is let go
  function quitOpen() { return !document.getElementById("confirmQuit").classList.contains("hidden"); }
  // A rack under way: from the break, through the CPU's turns, to the shot
  // that decides it. Before the break there's nothing to lose, and once it's
  // decided the record is in.
  function rackUnderway() { return G.shots > 0 && !G.pendingOver && ["aim", "cpu", "roll", "wait"].indexOf(G.phase) >= 0; }
  // Quitting one against the CPU for the menu is a loss, or a rack going badly
  // could just be walked away from. (Leaving the page isn't counted.)
  function quitIsLoss() { return G.mode === "cpu" && rackUnderway(); }
  function openQuit() {
    cancelDrag(); G.charging = false;
    document.getElementById("quitLoss").hidden = !quitIsLoss();
    document.getElementById("confirmQuit").classList.remove("hidden");
  }
  function closeQuit() { document.getElementById("confirmQuit").classList.add("hidden"); releaseFocus(); }
  document.getElementById("quitNo").addEventListener("click", closeQuit);
  document.getElementById("quitYes").addEventListener("click", function () {
    if (quitIsLoss()) record(G.level).add("l");
    document.getElementById("confirmQuit").classList.add("hidden");
    document.getElementById("over").classList.add("hidden");   // a result card mustn't sit over the menu
    drag = null; G.charging = false;
    showMenu();
  });

  // ---- pause + loop ------------------------------------------------------------------------------
  var Pz = window.GameShell
    ? GameShell.pausable({
        // (not under "Leave this rack?": that already holds the table, and the card would cover it)
        canPause: function () { return ["aim", "cpu", "roll", "wait"].indexOf(G.phase) >= 0 && !quitOpen(); },
        onChange: function (p) { if (p) { G.charging = false; cancelDrag(); } }
      })
    : null;
  // Leaving asks first (pausing the table) once a rack is under way
  if (Pz) GameShell.guardLeave({ active: rackUnderway, pausable: Pz });

  var last = performance.now(), frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // the shared corner buttons re-place themselves as fonts load and labels
    // change; keep the scoreboard clear of them
    if (++frames % 30 === 0) {
      var b = chromeBand();
      if (b.x + ":" + b.w !== lastBand) layout();
    }
    if (!(Pz && Pz.isPaused()) && !quitOpen()) update(dt);
    draw();
  }

  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", function () { setTimeout(layout, 120); });
  layout();
  // the chrome buttons settle a moment after load; lay out again once they have
  setTimeout(layout, 150);
  setTimeout(layout, 600);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  G.balls = P.rack(P.rng(7));
  G.st = Ru.newGame(0);
  showMenu();
  requestAnimationFrame(frame);

  // test hook
  window.__pool = {
    get G() { return G; },
    get V() { return V; },
    get UI() { return UI; },
    shoot: function (a, p, tx, ty) { G.aim = a; G.power = p; G.tip = { x: tx || 0, y: ty || 0 }; humanShoot(); },
    toScreen: toScreen, toWorld: toWorld, layout: layout,
    get fx() { return { strike: !!fxs.strike, sparks: fxs.sparks.length, trails: Object.keys(fxs.trails).length }; }
  };
})();
