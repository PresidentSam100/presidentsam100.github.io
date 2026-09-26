/* =====================================================================
   Slither — temple-ruins drawing kit, shared by Classic (game.js) and the
   Labyrinth (labyrinth.js): carved-stone serpents, flagstone floors,
   ashlar walls, rune portals, bronze traps and the temple doorway.

   Canvas only, no DOM. Everything draws in the caller's CSS-pixel space.
   Tiles that never change (floor, walls, ice, dark floor, cutters, portal
   frames) are painted once into an offscreen layer (makeLayer) and stamped
   each frame; everything with state (doors, plates, spikes, the doorway,
   portal glow, items, serpents) is drawn live. Texture variation comes
   from a hash of the cell index, so a level looks the same every time.
   ===================================================================== */
window.SlitherArt = (function () {
  "use strict";

  function hash(n, salt) {
    var h = (n * 374761393 + (salt || 0) * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rgb(c, a) { return a == null ? "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")" : "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function shade(c, f) { return [Math.round(Math.min(255, c[0] * f)), Math.round(Math.min(255, c[1] * f)), Math.round(Math.min(255, c[2] * f))]; }

  // Serpent palettes. Hue families are part of the rules text ("blue
  // wanderers", "purple hunters", "orange munchers", P1 green / P2 blue).
  var SERPENTS = {
    jade: { body: [52, 190, 120], light: [170, 248, 205], dark: [12, 72, 44], eye: "#ffcf4a" },
    lapis: { body: [62, 124, 230], light: [170, 205, 255], dark: [20, 44, 116], eye: "#ffcf4a" },
    amethyst: { body: [168, 82, 232], light: [226, 180, 255], dark: [66, 22, 104], eye: "#ff3b30" },
    carnelian: { body: [236, 124, 44], light: [255, 206, 140], dark: [116, 48, 10], eye: "#ffe9a8" },
    spirit: { body: [196, 238, 252], light: [245, 253, 255], dark: [112, 164, 192], eye: "#eafcff" },
    stone: { body: [128, 124, 116], light: [178, 174, 166], dark: [60, 58, 54], eye: "#6f6b64" },
  };

  // Board looks: Classic's temple floor and the three Labyrinth zones.
  var THEMES = {
    classic: { floor: [45, 40, 32], mortar: [24, 21, 16], vary: 0.07, speck: [74, 66, 52], wall: [128, 110, 84], hi: [176, 158, 124], lo: [66, 56, 42], face: [94, 80, 60], moss: 0, trim: null },
    Garden: { floor: [40, 42, 35], mortar: [21, 23, 18], vary: 0.06, speck: [66, 70, 58], wall: [100, 112, 94], hi: [148, 162, 136], lo: [50, 58, 46], face: [74, 84, 68], moss: 0.55, trim: null },
    Ruins: { floor: [48, 38, 26], mortar: [26, 20, 13], vary: 0.07, speck: [78, 62, 42], wall: [172, 140, 94], hi: [216, 186, 136], lo: [102, 80, 50], face: [136, 108, 70], moss: 0, trim: null },
    Citadel: { floor: [31, 28, 39], mortar: [16, 14, 21], vary: 0.05, speck: [52, 46, 64], wall: [62, 52, 90], hi: [118, 102, 160], lo: [28, 22, 44], face: [44, 36, 68], moss: 0, trim: [222, 184, 88] },
  };

  function makeLayer(w, h) {
    var dpr = window.devicePixelRatio || 1;
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    var g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas: c, ctx: g, w: w, h: h };
  }

  // ---- static tiles ----------------------------------------------------------
  function floor(g, px, py, c, th, seed) {
    g.fillStyle = rgb(th.mortar);
    g.fillRect(px, py, c, c);
    g.fillStyle = rgb(shade(th.floor, 1 + (hash(seed, 1) - 0.5) * 2 * th.vary));
    g.fillRect(px + 1, py + 1, c - 1.5, c - 1.5);
    // Worn specks, and now and then a crack or a tuft of moss.
    g.fillStyle = rgb(th.speck, 0.55);
    for (var s = 0; s < 3; s++) {
      g.fillRect(px + 2 + hash(seed, 10 + s) * (c - 5), py + 2 + hash(seed, 20 + s) * (c - 5), 1.4, 1.4);
    }
    if (hash(seed, 2) < 0.04) {
      g.strokeStyle = rgb(th.mortar, 0.6);
      g.lineWidth = 1;
      g.beginPath();
      var x0 = px + c * (0.2 + hash(seed, 3) * 0.6), y0 = py + c * (0.2 + hash(seed, 30) * 0.6);
      g.moveTo(x0, y0);
      for (var j = 0; j < 3; j++) {
        var a = hash(seed, 31 + j) * Math.PI * 2, l = c * (0.1 + hash(seed, 35 + j) * 0.12);
        x0 = Math.max(px + 2, Math.min(px + c - 2, x0 + Math.cos(a) * l));
        y0 = Math.max(py + 2, Math.min(py + c - 2, y0 + Math.sin(a) * l));
        g.lineTo(x0, y0);
      }
      g.stroke();
    }
    if (th.moss && hash(seed, 4) < 0.14) {
      g.fillStyle = "rgba(96,146,66,0.55)";
      var mx = px + (hash(seed, 5) < 0.5 ? 2 : c - 6), my = py + (hash(seed, 6) < 0.5 ? 2 : c - 6);
      g.beginPath(); g.arc(mx + 2, my + 2, 2.2, 0, Math.PI * 2); g.arc(mx + 4.5, my + 3, 1.6, 0, Math.PI * 2); g.fill();
    }
    if (th.trim && hash(seed, 7) < 0.05) {
      g.fillStyle = rgb(th.trim, 0.5);
      g.fillRect(px + c * 0.3 + hash(seed, 8) * c * 0.4, py + c * 0.3 + hash(seed, 9) * c * 0.4, 1.3, 1.3);
    }
  }

  // Ashlar wall. `open` says which neighbours are not wall: an open south
  // side shows the wall's front face, which is what makes walls read as
  // raised from above. Joints are laid out in board coordinates, so the
  // masonry runs continuously across cells.
  function wall(g, px, py, c, th, seed, open) {
    var base = shade(th.wall, 1 + (hash(seed, 1) - 0.5) * 0.08);
    g.fillStyle = rgb(base);
    g.fillRect(px, py, c, c);
    var faceH = open.s ? Math.round(c * 0.34) : 0, topH = c - faceH;
    g.strokeStyle = rgb(th.lo, 0.55);
    g.lineWidth = 1;
    var course = c / 2;
    for (var k = 0; k < 2; k++) {
      var y = py + k * course, row = Math.round(py / course) + k;
      if (y + 0.5 > py + topH) break;
      if (k > 0) { g.beginPath(); g.moveTo(px, y + 0.5); g.lineTo(px + c, y + 0.5); g.stroke(); }
      var span = c * 1.5, off = (row % 2) * c * 0.75;
      for (var jx = Math.floor((px - off) / span) * span + off; jx < px + c; jx += span) {
        if (jx <= px || jx >= px + c) continue;
        g.beginPath(); g.moveTo(Math.round(jx) + 0.5, y); g.lineTo(Math.round(jx) + 0.5, Math.min(y + course, py + topH)); g.stroke();
      }
    }
    if (open.n) { g.fillStyle = rgb(th.hi); g.fillRect(px, py, c, 2.5); }
    if (open.w) { g.fillStyle = rgb(th.hi, 0.5); g.fillRect(px, py, 1.5, topH); }
    if (open.e) { g.fillStyle = rgb(th.lo, 0.7); g.fillRect(px + c - 1.5, py, 1.5, topH); }
    if (faceH) {
      g.fillStyle = rgb(th.face);
      g.fillRect(px, py + topH, c, faceH);
      g.fillStyle = rgb(th.lo);
      g.fillRect(px, py + topH, c, 1.5);
      g.fillRect(px, py + c - 1.5, c, 1.5);
    }
    if (th.trim && open.n) { g.fillStyle = rgb(th.trim, 0.85); g.fillRect(px, py + 2.5, c, 1.2); }
    if (th.trim && faceH) { g.fillStyle = rgb(th.trim, 0.7); g.fillRect(px, py + topH + 1.5, c, 1); }
    if (th.moss && hash(seed, 11) < th.moss) {
      g.fillStyle = "rgba(92,150,62,0.8)";
      var n = 2 + Math.floor(hash(seed, 12) * 3);
      for (var m = 0; m < n; m++) {
        var mx = px + hash(seed, 13 + m) * c, my = py + (open.n ? 1.5 : hash(seed, 17 + m) * topH);
        g.beginPath(); g.arc(mx, my, 1.5 + hash(seed, 21 + m) * 2, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function ice(g, px, py, c, seed) {
    g.fillStyle = "#1f4a66";
    g.fillRect(px, py, c, c);
    g.fillStyle = "rgba(140,205,240,0.14)";
    g.fillRect(px + 1, py + 1, c - 2, c - 2);
    g.strokeStyle = "rgba(200,238,255,0.45)";
    g.lineWidth = 1.5;
    var o = hash(seed, 1) * c * 0.3;
    g.beginPath(); g.moveTo(px + 4 + o * 0.3, py + c - 6); g.lineTo(px + 10 + o * 0.3, py + 5); g.stroke();
    g.beginPath(); g.moveTo(px + 11 + o * 0.3, py + c - 4); g.lineTo(px + 15 + o * 0.3, py + 11); g.stroke();
  }

  function darkFloor(g, px, py, c) {
    g.fillStyle = "#0b0a0c";
    g.fillRect(px, py, c, c);
  }

  // A bronze plate with crossed shears on it — the ✂ the hints talk about.
  function cutter(g, px, py, c) {
    g.fillStyle = "#3a2f22";
    g.fillRect(px + 1, py + 1, c - 2, c - 2);
    g.save();
    g.translate(px + c / 2, py + c / 2);
    // Each half is one blade and the opposite handle ring; tilted apart they cross.
    for (var side = -1; side <= 1; side += 2) {
      g.save();
      g.rotate(side * 0.5);
      g.fillStyle = "#dfe4ea";
      g.beginPath(); g.moveTo(-1.7, 1.5); g.lineTo(0, -c * 0.4); g.lineTo(1.7, 1.5); g.closePath(); g.fill();
      g.strokeStyle = "#dfe4ea"; g.lineWidth = 1.6;
      g.beginPath(); g.arc(0, c * 0.24, c * 0.1, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    g.fillStyle = "#c48a3a";
    g.beginPath(); g.arc(0, 0, 1.7, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function portalFrame(g, cx, cy, r) {
    g.fillStyle = "#17130f";
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#8f8068"; g.lineWidth = 2.5;
    g.beginPath(); g.arc(cx, cy, r - 1.5, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "#4d4436"; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, r - 3.5, 0, Math.PI * 2); g.stroke();
  }

  // ---- live tiles ------------------------------------------------------------
  function portalGlow(ctx, cx, cy, r, color, t, fx) {
    var gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, r - 3);
    gl.addColorStop(0, color);
    gl.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = fx ? 0.75 + 0.25 * Math.sin(t / 240) : 0.9;
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // Three runes carved into the rim, glowing in the pair's colour.
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = "round";
    var spin = fx ? t / 900 : 0;
    for (var k = 0; k < 3; k++) {
      var a = spin + k * Math.PI * 2 / 3;
      ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, a, a + 0.55); ctx.stroke();
    }
  }

  function door(ctx, px, py, c, shut) {
    if (shut) {
      ctx.fillStyle = "#24190c";
      ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
      for (var b = 0; b < 3; b++) {
        var bx = px + c * (0.2 + b * 0.3) - 1.5;
        ctx.fillStyle = "#c48a3a"; ctx.fillRect(bx, py + 2, 3.5, c - 4);
        ctx.fillStyle = "#f0c27a"; ctx.fillRect(bx, py + 2, 1.2, c - 4);
      }
      ctx.fillStyle = "#9a6a28"; ctx.fillRect(px + 2, py + c * 0.46, c - 4, 3);
    } else {
      ctx.strokeStyle = "rgba(214,160,80,0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(px + 2.5, py + 2.5, c - 5, c - 5);
      ctx.setLineDash([]);
    }
  }

  // Pressure plate (a switch). Pressed = sunk and glowing.
  function plate(ctx, px, py, c, pressed) {
    var cx = px + c / 2, cy = py + c / 2;
    ctx.fillStyle = "#1c1711";
    ctx.beginPath(); ctx.arc(cx, cy, c * 0.44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pressed ? "#7d6a48" : "#a8946c";
    ctx.beginPath(); ctx.arc(cx, cy + (pressed ? 0.8 : -0.8), c * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = pressed ? "#ffd36a" : "#c48a3a";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy + (pressed ? 0.8 : -0.8), c * 0.22, 0, Math.PI * 2); ctx.stroke();
    if (pressed) {
      ctx.fillStyle = "rgba(255,211,106,0.35)";
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function spikes(ctx, px, py, c, up, warnOn) {
    ctx.fillStyle = "#1d1a16";
    ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
    for (var s = 0; s < 4; s++) {
      var sx = px + (s % 2 ? c * 0.7 : c * 0.3), sy = py + (s < 2 ? c * 0.3 : c * 0.72);
      if (up) {
        ctx.fillStyle = "#d9dee6";
        ctx.beginPath(); ctx.moveTo(sx - 4, sy + 4); ctx.lineTo(sx, sy - 5.5); ctx.lineTo(sx + 4, sy + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#7c8490";
        ctx.beginPath(); ctx.moveTo(sx, sy - 5.5); ctx.lineTo(sx + 4, sy + 4); ctx.lineTo(sx + 1, sy + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#e5484d";
        ctx.beginPath(); ctx.arc(sx, sy - 4.5, 1.1, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = warnOn ? "#ff5a4a" : "#4b4438";
        ctx.beginPath(); ctx.arc(sx, sy, 1.9, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // The temple doorway: stone pillars and lintel; sealed until it opens,
  // then gold light pours out.
  function doorway(ctx, px, py, c, open, t, fx) {
    var glow = open ? (fx ? 0.6 + 0.4 * Math.sin(t / 170) : 1) : 0;
    if (open) {
      var g = ctx.createRadialGradient(px + c / 2, py + c / 2, 2, px + c / 2, py + c / 2, c);
      g.addColorStop(0, "rgba(255,214,110," + (0.55 * glow).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,214,110,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - c / 2, py - c / 2, c * 2, c * 2);
    }
    // Opening.
    if (open) {
      var in_ = ctx.createLinearGradient(px, py + 4, px, py + c);
      in_.addColorStop(0, "#fff1b8"); in_.addColorStop(1, "#e0a53a");
      ctx.fillStyle = in_;
    } else ctx.fillStyle = "#15110c";
    ctx.fillRect(px + 5, py + 6, c - 10, c - 6);
    // Pillars and lintel.
    ctx.fillStyle = open ? "#d8c08a" : "#9c907a";
    ctx.fillRect(px + 1, py + 4, 4, c - 4);
    ctx.fillRect(px + c - 5, py + 4, 4, c - 4);
    ctx.fillRect(px, py + 1, c, 5);
    ctx.fillStyle = open ? "#8a6a2a" : "#5c5446";
    ctx.fillRect(px, py + 5, c, 1.2);
    ctx.fillRect(px + 4, py + 6, 1, c - 6);
    ctx.fillRect(px + c - 5, py + 6, 1, c - 6);
    if (!open) {
      // A round carved seal across the opening.
      ctx.strokeStyle = "#8f846e"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px + c / 2, py + c * 0.6, c * 0.18, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + c / 2, py + c * 0.46); ctx.lineTo(px + c / 2, py + c * 0.74); ctx.stroke();
    }
  }

  // ---- items -------------------------------------------------------------------
  function fruit(ctx, cx, cy, size, glyph) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(cx, cy + size * 0.42, size * 0.34, size * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000"; // colour emoji take this alpha, so it must be opaque
    ctx.font = size + "px serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(glyph, cx, cy + 1);
  }

  // Blink apple: a cut amethyst carrying a ✦.
  function gem(ctx, cx, cy, r) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r + 1, r * 0.8, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    var top = cy - r, mid = cy - r * 0.25, bot = cy + r;
    ctx.fillStyle = "#7a2fc2";
    ctx.beginPath(); ctx.moveTo(cx - r, mid); ctx.lineTo(cx - r * 0.5, top); ctx.lineTo(cx + r * 0.5, top); ctx.lineTo(cx + r, mid); ctx.lineTo(cx, bot); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b67cff";
    ctx.beginPath(); ctx.moveTo(cx - r * 0.5, top); ctx.lineTo(cx + r * 0.5, top); ctx.lineTo(cx + r * 0.25, mid); ctx.lineTo(cx - r * 0.25, mid); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8d2ff";
    ctx.beginPath(); ctx.moveTo(cx - r * 0.25, mid); ctx.lineTo(cx + r * 0.25, mid); ctx.lineTo(cx, bot); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#3e1470"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r, mid); ctx.lineTo(cx - r * 0.5, top); ctx.lineTo(cx + r * 0.5, top); ctx.lineTo(cx + r, mid); ctx.lineTo(cx, bot); ctx.closePath(); ctx.stroke();
    // The ✦ the hints and HUD use for blinks.
    var sr = r * 0.62, sx = cx, sy = cy - r * 0.05;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(sx, sy - sr); ctx.lineTo(sx + sr * 0.25, sy - sr * 0.25); ctx.lineTo(sx + sr, sy); ctx.lineTo(sx + sr * 0.25, sy + sr * 0.25);
    ctx.lineTo(sx, sy + sr); ctx.lineTo(sx - sr * 0.25, sy + sr * 0.25); ctx.lineTo(sx - sr, sy); ctx.lineTo(sx - sr * 0.25, sy - sr * 0.25);
    ctx.closePath(); ctx.fill();
  }

  // Ghost apple: a pale spirit flame.
  function wisp(ctx, cx, cy, r, t, fx) {
    var sway = fx ? Math.sin(t / 150) * r * 0.18 : 0;
    var g = ctx.createRadialGradient(cx, cy + r * 0.2, 1, cx, cy, r * 1.3);
    g.addColorStop(0, "rgba(220,250,255,0.95)"); g.addColorStop(1, "rgba(150,220,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e9fbff";
    ctx.beginPath();
    ctx.moveTo(cx + sway, cy - r * 1.1);
    ctx.quadraticCurveTo(cx + r * 0.95, cy - r * 0.1, cx + r * 0.62, cy + r * 0.7);
    ctx.quadraticCurveTo(cx, cy + r * 1.05, cx - r * 0.62, cy + r * 0.7);
    ctx.quadraticCurveTo(cx - r * 0.95, cy - r * 0.1, cx + sway, cy - r * 1.1);
    ctx.fill();
    ctx.fillStyle = "#28506a";
    ctx.beginPath(); ctx.arc(cx - r * 0.28, cy + r * 0.2, r * 0.13, 0, Math.PI * 2); ctx.arc(cx + r * 0.28, cy + r * 0.2, r * 0.13, 0, Math.PI * 2); ctx.fill();
  }

  // ---- serpents ----------------------------------------------------------------
  // pts: segment centres, head first, in pixels. Segments stacked on one cell
  // (a snake still coiled at its start) collapse into a coil; segments that
  // aren't next to each other (a portal or blink jump) are not joined.
  //   o: { cell, pal, alpha, dir: {x,y} | null, ghost, dead, t, fx, seed, cross }
  function serpent(ctx, pts, o) {
    var c = o.cell, P = [];
    for (var i = 0; i < pts.length; i++) {
      var q = pts[i], last = P[P.length - 1];
      if (last && Math.abs(last.x - q.x) < 0.5 && Math.abs(last.y - q.y) < 0.5) continue;
      P.push(q);
    }
    var n = P.length, coiled = pts.length > 1 && n === 1;
    var pal = o.dead ? SERPENTS.stone : o.ghost ? SERPENTS.spirit : o.pal;
    var W = c * 0.7;
    function adj(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < c * 1.05; }
    var tl = Math.max(2, Math.min(6, Math.floor(n * 0.6)));
    function width(k) { var from = n - tl; return k <= from ? W : W * (1 - 0.55 * (k - from) / tl); }

    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function links(off, extra, style) {
      ctx.strokeStyle = style;
      for (var k = n - 1; k >= 1; k--) {
        var a = P[k], b = P[k - 1];
        ctx.lineWidth = width(k) + extra;
        ctx.beginPath();
        ctx.moveTo(a.x + off, a.y + off * 1.3);
        if (adj(a, b)) ctx.lineTo(b.x + off, b.y + off * 1.3);
        else ctx.lineTo(a.x + off + 0.01, a.y + off * 1.3);
        ctx.stroke();
      }
    }
    if (coiled) {
      ctx.lineWidth = W * 0.55;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.arc(P[0].x + 1.5, P[0].y + 2, c * 0.33, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rgb(pal.dark); ctx.lineWidth = W * 0.55 + 2.5;
      ctx.beginPath(); ctx.arc(P[0].x, P[0].y, c * 0.33, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rgb(pal.body); ctx.lineWidth = W * 0.55;
      ctx.beginPath(); ctx.arc(P[0].x, P[0].y, c * 0.33, 0, Math.PI * 2); ctx.stroke();
    } else if (n > 1) {
      if (!o.ghost) links(1.5, 0, "rgba(0,0,0,0.35)");
      links(0, 2.5, rgb(pal.dark));
      links(0, 0, rgb(pal.body));
      // Dorsal diamonds, and a pale scale between them.
      if (!o.ghost) {
        for (var k = 1; k < n; k++) {
          var p = P[k], prev = P[k - 1], nxt = P[k + 1];
          var dx = 0, dy = 0;
          if (adj(p, prev)) { dx = prev.x - p.x; dy = prev.y - p.y; }
          else if (nxt && adj(p, nxt)) { dx = p.x - nxt.x; dy = p.y - nxt.y; }
          var len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
          var s = width(k) * 0.32;
          ctx.fillStyle = rgb(pal.dark, 0.8);
          ctx.beginPath();
          ctx.moveTo(p.x + ux * s * 1.3, p.y + uy * s * 1.3);
          ctx.lineTo(p.x - uy * s, p.y + ux * s);
          ctx.lineTo(p.x - ux * s * 1.3, p.y - uy * s * 1.3);
          ctx.lineTo(p.x + uy * s, p.y - ux * s);
          ctx.closePath(); ctx.fill();
          if (adj(p, prev)) {
            ctx.fillStyle = rgb(pal.light, 0.55);
            ctx.beginPath(); ctx.arc((p.x + prev.x) / 2, (p.y + prev.y) / 2, width(k) * 0.12, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    // Head: an oval, wider than the neck, pointing where it's going.
    var d = o.dir && (o.dir.x || o.dir.y) ? o.dir : n > 1 && adj(P[0], P[1]) ? { x: Math.sign(P[0].x - P[1].x), y: Math.sign(P[0].y - P[1].y) } : { x: 1, y: 0 };
    var h = P[0], ang = Math.atan2(d.y, d.x), hx = h.x + d.x * c * 0.06, hy = h.y + d.y * c * 0.06;
    if (!o.ghost) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.ellipse(hx + 1.5, hy + 2, c * 0.5, c * 0.41, ang, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = rgb(pal.body);
    ctx.strokeStyle = rgb(pal.dark);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(hx, hy, c * 0.5, c * 0.41, ang, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgb(pal.light, 0.45);
    ctx.beginPath(); ctx.ellipse(hx + d.x * c * 0.2, hy + d.y * c * 0.2, c * 0.2, c * 0.12, ang, 0, Math.PI * 2); ctx.fill();
    var tipX = hx + d.x * c * 0.5, tipY = hy + d.y * c * 0.5;
    if (o.cross) {
      ctx.strokeStyle = "#e5484d"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(h.x - 5, h.y - 5); ctx.lineTo(h.x + 5, h.y + 5); ctx.moveTo(h.x + 5, h.y - 5); ctx.lineTo(h.x - 5, h.y + 5); ctx.stroke();
    } else {
      // Tongue: a quick forked flick every couple of seconds (Visual FX on).
      if (o.fx && !o.dead && !o.ghost && ((o.t + (o.seed || 0) * 977) % 2600) < 240) {
        var tx = tipX + d.x * c * 0.32, ty = tipY + d.y * c * 0.32, px_ = -d.y, py_ = d.x;
        ctx.strokeStyle = "#e5484d"; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY); ctx.lineTo(tx, ty);
        ctx.lineTo(tx + d.x * 3 + px_ * 2.5, ty + d.y * 3 + py_ * 2.5);
        ctx.moveTo(tx, ty); ctx.lineTo(tx + d.x * 3 - px_ * 2.5, ty + d.y * 3 - py_ * 2.5);
        ctx.stroke();
      }
      var er = Math.max(1.8, c * 0.11), ex = hx + d.x * c * 0.1, ey = hy + d.y * c * 0.1, pX = -d.y * c * 0.2, pY = d.x * c * 0.2;
      for (var side = -1; side <= 1; side += 2) {
        var cx = ex + pX * side, cy = ey + pY * side;
        ctx.fillStyle = pal.eye;
        ctx.beginPath(); ctx.arc(cx, cy, er, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#140d04";
        ctx.beginPath(); ctx.ellipse(cx + d.x * 0.4, cy + d.y * 0.4, er * 0.8, er * 0.3, ang, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  return {
    hash: hash, rgb: rgb, shade: shade, SERPENTS: SERPENTS, THEMES: THEMES, makeLayer: makeLayer,
    floor: floor, wall: wall, ice: ice, darkFloor: darkFloor, cutter: cutter, portalFrame: portalFrame,
    portalGlow: portalGlow, door: door, plate: plate, spikes: spikes, doorway: doorway,
    fruit: fruit, gem: gem, wisp: wisp, serpent: serpent,
  };
})();
