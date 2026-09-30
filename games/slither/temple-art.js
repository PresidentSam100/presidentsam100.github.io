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
    umber: { body: [150, 98, 56], light: [214, 168, 120], dark: [66, 38, 18], eye: "#ffe9a8" },
    topaz: { body: [242, 196, 40], light: [255, 238, 150], dark: [70, 52, 8], eye: "#1b1204", stripes: true },
    ruby: { body: [214, 48, 62], light: [255, 150, 160], dark: [96, 12, 22], eye: "#ffe9a8" },
    steel: { body: [150, 160, 176], light: [236, 242, 250], dark: [58, 64, 76], eye: "#ffb24a", sheen: true },
    pearl: { body: [226, 220, 240], light: [255, 255, 255], dark: [120, 110, 150], eye: "#7a5cff" },
    wraith: { body: [110, 232, 150], light: [210, 255, 225], dark: [30, 110, 64], eye: "#eaffef", spectral: true },
    onyx: { body: [44, 36, 58], light: [120, 96, 170], dark: [12, 8, 20], eye: "#c77dff", spectral: true },
    rose: { body: [238, 112, 168], light: [255, 200, 225], dark: [110, 30, 70], eye: "#1b1204" },
    bone: { body: [236, 228, 210], light: [255, 252, 240], dark: [112, 100, 86], eye: "#ff5a4a" },
    volt: { body: [150, 220, 255], light: [255, 255, 255], dark: [40, 90, 170], eye: "#ffffff", spectral: true },
    demon: { body: [132, 26, 48], light: [255, 130, 130], dark: [34, 4, 12], eye: "#ffd23f", spectral: true },
    garnet: { body: [206, 58, 92], light: [255, 170, 190], dark: [92, 14, 34], eye: "#fff0c0" },
    ivory: { body: [226, 214, 186], light: [255, 250, 236], dark: [120, 104, 76], eye: "#3a2a10" },
    ember: { body: [255, 150, 60], light: [255, 230, 160], dark: [120, 40, 8], eye: "#1b1204" },
    prism: { body: [240, 240, 240], light: [255, 255, 255], dark: [60, 60, 80], eye: "#ffffff", rainbow: true },
  };

  // Portal pair colours (1-4).
  var PORTAL_COLORS = ["#ff9a3c", "#b36bff", "#3fd6ec", "#ff7ac0"];

  // Which palette each kind of snake is carved from.
  var SERPENT_OF = { player: "jade", wander: "lapis", hunt: "amethyst", munch: "carnelian", drift: "umber", zip: "topaz", loop: "ruby", metal: "steel", copy: "pearl", gghost: "wraith", bghost: "onyx", mouse: "rose", rainbow: "prism", boss: "demon", worm: "ember" };
  function serpentFor(kind) { return SERPENTS[SERPENT_OF[kind] || "lapis"]; }

  // Board looks: Classic's temple floor and the three Labyrinth zones.
  var THEMES = {
    classic: { floor: [45, 40, 32], mortar: [24, 21, 16], vary: 0.07, speck: [74, 66, 52], wall: [128, 110, 84], hi: [176, 158, 124], lo: [66, 56, 42], face: [94, 80, 60], moss: 0, trim: null },
    Garden: { floor: [40, 42, 35], mortar: [21, 23, 18], vary: 0.06, speck: [66, 70, 58], wall: [100, 112, 94], hi: [148, 162, 136], lo: [50, 58, 46], face: [74, 84, 68], moss: 0.55, trim: null },
    Ruins: { floor: [48, 38, 26], mortar: [26, 20, 13], vary: 0.07, speck: [78, 62, 42], wall: [172, 140, 94], hi: [216, 186, 136], lo: [102, 80, 50], face: [136, 108, 70], moss: 0, trim: null },
    Citadel: { floor: [31, 28, 39], mortar: [16, 14, 21], vary: 0.05, speck: [52, 46, 64], wall: [62, 52, 90], hi: [118, 102, 160], lo: [28, 22, 44], face: [44, 36, 68], moss: 0, trim: [222, 184, 88] },
    // Foundry: riveted iron plates over ember-lit floors.
    Foundry: { floor: [38, 33, 31], mortar: [17, 15, 14], vary: 0.06, speck: [74, 52, 40], wall: [118, 76, 54], hi: [176, 118, 82], lo: [56, 34, 24], face: [88, 54, 38], moss: 0, trim: [255, 132, 52], rivets: true },
    // Astral: moonlit white marble floating over night.
    Astral: { floor: [26, 26, 46], mortar: [12, 12, 24], vary: 0.05, speck: [70, 72, 120], wall: [168, 166, 196], hi: [226, 224, 248], lo: [88, 86, 128], face: [122, 120, 162], moss: 0, trim: [150, 200, 255], stars: true },
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
    if (th.stars && hash(seed, 40) < 0.12) {
      g.fillStyle = "rgba(210,220,255," + (0.35 + hash(seed, 41) * 0.5).toFixed(2) + ")";
      g.fillRect(px + 2 + hash(seed, 42) * (c - 4), py + 2 + hash(seed, 43) * (c - 4), 1.2, 1.2);
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
    if (th.rivets) {
      g.fillStyle = rgb(th.lo, 0.9);
      [[3, 3], [c - 4, 3], [3, c * 0.45], [c - 4, c * 0.45]].forEach(function (r) { if (r[1] < topH - 1) { g.beginPath(); g.arc(px + r[0], py + r[1], 1.2, 0, Math.PI * 2); g.fill(); } });
    }
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

  // Dream block: a black void with drifting red and grey clouds and stars.
  // `open` marks sides that touch ordinary ground, which get a violet rim.
  function dream(g, px, py, c, seed, open) {
    g.fillStyle = "#0c0912";
    g.fillRect(px, py, c, c);
    var blobs = [["rgba(200,54,70,0.32)", 50], ["rgba(170,168,196,0.22)", 60]];
    blobs.forEach(function (b) {
      if (hash(seed, b[1]) < 0.6) {
        g.fillStyle = b[0];
        g.beginPath(); g.arc(px + hash(seed, b[1] + 1) * c, py + hash(seed, b[1] + 2) * c, c * (0.25 + hash(seed, b[1] + 3) * 0.3), 0, Math.PI * 2); g.fill();
      }
    });
    g.fillStyle = "rgba(255,240,255,0.8)";
    if (hash(seed, 70) < 0.5) g.fillRect(px + hash(seed, 71) * (c - 2), py + hash(seed, 72) * (c - 2), 1.3, 1.3);
    if (open) {
      g.fillStyle = "rgba(190,120,255,0.7)";
      if (open.n) g.fillRect(px, py, c, 1.5);
      if (open.s) g.fillRect(px, py + c - 1.5, c, 1.5);
      if (open.w) g.fillRect(px, py, 1.5, c);
      if (open.e) g.fillRect(px + c - 1.5, py, 1.5, c);
    }
  }

  // Storm tile: a thundercloud with a little bolt in it.
  function storm(g, px, py, c, seed) {
    g.fillStyle = "#1a2334";
    g.fillRect(px, py, c, c);
    g.fillStyle = "rgba(120,150,200,0.28)";
    g.beginPath(); g.arc(px + c * (0.3 + hash(seed, 80) * 0.4), py + c * 0.45, c * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(170,200,240,0.22)";
    g.beginPath(); g.arc(px + c * (0.2 + hash(seed, 81) * 0.6), py + c * 0.3, c * 0.24, 0, Math.PI * 2); g.fill();
    if (hash(seed, 82) < 0.35) {
      g.strokeStyle = "rgba(255,240,140,0.85)"; g.lineWidth = 1.3;
      var bx = px + c * (0.35 + hash(seed, 83) * 0.3), by = py + c * 0.2;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - 3, by + 6); g.lineTo(bx + 1, by + 6); g.lineTo(bx - 2, by + 12); g.stroke();
    }
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

  // One-way teleporter: the send pad glows red with an arrow ring; the
  // landing pad is a dark red ring.
  function telePad(ctx, px, py, c, entry, id, t, fx) {
    var cx = px + c / 2, cy = py + c / 2, r = c * 0.36;
    var hue = ["#ff4b3a", "#ff7a2e", "#ff3a7a", "#e8452e", "#ff5c5c"][id % 5];
    ctx.fillStyle = "#1a0d0b";
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hue; ctx.lineWidth = entry ? 2.4 : 1.4;
    ctx.globalAlpha = entry ? 1 : 0.6;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (entry) {
      var spin = fx ? (t || 0) / 300 : 0;
      ctx.fillStyle = hue;
      for (var k = 0; k < 3; k++) {
        var a = spin + k * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
        ctx.lineTo(cx + Math.cos(a + 0.5) * r * 0.45, cy + Math.sin(a + 0.5) * r * 0.45);
        ctx.lineTo(cx + Math.cos(a - 0.3) * r * 0.4, cy + Math.sin(a - 0.3) * r * 0.4);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#ffe0d8";
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = hue;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Infinity machine: an iron block with a glowing ∞.
  function infinity(g, px, py, c) {
    g.fillStyle = "#2a2622";
    g.fillRect(px + 1, py + 1, c - 2, c - 2);
    g.strokeStyle = "#6a5a48"; g.lineWidth = 1;
    g.strokeRect(px + 1.5, py + 1.5, c - 3, c - 3);
    var cx = px + c / 2, cy = py + c / 2, a = c * 0.3, b = c * 0.16;
    g.strokeStyle = "#7dffb0"; g.lineWidth = 2;
    g.beginPath();
    for (var k = 0; k <= 40; k++) {
      var tt = k / 40 * Math.PI * 2, d = 1 + Math.sin(tt) * Math.sin(tt);
      var x = cx + a * Math.cos(tt) / d, y = cy + b * 2 * Math.sin(tt) * Math.cos(tt) / d;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }

  // Cloner machine: an iron block showing two coiled snakes.
  function cloner(g, px, py, c) {
    g.fillStyle = "#2a2622"; g.fillRect(px + 1, py + 1, c - 2, c - 2);
    g.strokeStyle = "#6a5a48"; g.lineWidth = 1; g.strokeRect(px + 1.5, py + 1.5, c - 3, c - 3);
    [[0.34, "#3ad08a"], [0.66, "#9ff0c4"]].forEach(function (k) {
      g.strokeStyle = k[1]; g.lineWidth = 2;
      g.beginPath(); g.arc(px + c * k[0], py + c / 2, c * 0.16, 0, Math.PI * 1.7); g.stroke();
    });
  }
  // Cloner outlet: where the twin appears.
  function outlet(g, px, py, c) {
    var cx = px + c / 2, cy = py + c / 2;
    g.strokeStyle = "#9ff0c4"; g.lineWidth = 1.5; g.setLineDash([2, 2]);
    g.beginPath(); g.arc(cx, cy, c * 0.38, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#9ff0c4";
    g.fillRect(cx - 4, cy - 1, 8, 2); g.fillRect(cx - 1, cy - 4, 2, 8);
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

  // Door and switch colours (amber / cyan / magenta — see engine COLORS).
  var DOOR = [
    { bar: "#c48a3a", hi: "#f0c27a", cross: "#9a6a28", bg: "#24190c", dash: "rgba(214,160,80,0.5)", glow: "255,211,106" },
    { bar: "#3aa6b8", hi: "#a6eef6", cross: "#22727f", bg: "#0b1d22", dash: "rgba(90,200,220,0.55)", glow: "120,230,245" },
    { bar: "#b8479a", hi: "#f2a6de", cross: "#7a2a66", bg: "#220b1c", dash: "rgba(225,115,195,0.55)", glow: "245,140,215" },
  ];

  function door(ctx, px, py, c, shut, color) {
    var k = DOOR[color || 0];
    if (shut) {
      ctx.fillStyle = k.bg;
      ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
      for (var b = 0; b < 3; b++) {
        var bx = px + c * (0.2 + b * 0.3) - 1.5;
        ctx.fillStyle = k.bar; ctx.fillRect(bx, py + 2, 3.5, c - 4);
        ctx.fillStyle = k.hi; ctx.fillRect(bx, py + 2, 1.2, c - 4);
      }
      ctx.fillStyle = k.cross; ctx.fillRect(px + 2, py + c * 0.46, c - 4, 3);
    } else {
      ctx.strokeStyle = k.dash;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(px + 2.5, py + 2.5, c - 5, c - 5);
      ctx.setLineDash([]);
    }
  }

  // Pressure plate (a switch you roll over). Pressed = sunk and glowing.
  function plate(ctx, px, py, c, pressed, color) {
    var k = DOOR[color || 0], cx = px + c / 2, cy = py + c / 2;
    ctx.fillStyle = "#1c1711";
    ctx.beginPath(); ctx.arc(cx, cy, c * 0.44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pressed ? "#7d6a48" : "#a8946c";
    ctx.beginPath(); ctx.arc(cx, cy + (pressed ? 0.8 : -0.8), c * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = pressed ? k.hi : k.bar;
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(cx, cy + (pressed ? 0.8 : -0.8), c * 0.22, 0, Math.PI * 2); ctx.stroke();
    if (pressed) {
      ctx.fillStyle = "rgba(" + k.glow + ",0.35)";
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Click-switch: a raised stone button with a pointer carved on it.
  function clickSwitch(ctx, px, py, c, pressed, color) {
    var k = DOOR[color || 0], x = px + 3, y = py + 3 + (pressed ? 1 : 0), w = c - 6;
    ctx.fillStyle = "#1c1711";
    ctx.fillRect(px + 2, py + 3, c - 4, c - 4);
    ctx.fillStyle = pressed ? k.cross : k.bar;
    ctx.fillRect(x, y, w, w - 1);
    ctx.fillStyle = k.hi;
    ctx.fillRect(x, y, w, 1.5);
    // Pointer arrow.
    var ax = px + c * 0.38, ay = py + c * 0.28 + (pressed ? 1 : 0), s = c / 24;
    ctx.fillStyle = "#fff8e8";
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(ax, ay + 12 * s); ctx.lineTo(ax + 3 * s, ay + 9 * s); ctx.lineTo(ax + 5.5 * s, ay + 13.5 * s);
    ctx.lineTo(ax + 7 * s, ay + 12.7 * s); ctx.lineTo(ax + 4.7 * s, ay + 8.3 * s); ctx.lineTo(ax + 8.5 * s, ay + 8.3 * s);
    ctx.closePath(); ctx.fill();
    if (pressed) {
      ctx.fillStyle = "rgba(" + k.glow + ",0.3)";
      ctx.fillRect(px, py, c, c);
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

  // Spike stud: a bronze boss set in the floor, with a spike mark.
  function stud(ctx, px, py, c) {
    var cx = px + c / 2, cy = py + c / 2, r = c * 0.36;
    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
    g.addColorStop(0, "#f1c27d"); g.addColorStop(0.6, "#b57a35"); g.addColorStop(1, "#6b4219");
    ctx.fillStyle = g; ctx.strokeStyle = "#3d2408"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#3d2408";
    ctx.beginPath(); ctx.moveTo(cx - r * 0.45, cy + r * 0.35); ctx.lineTo(cx, cy - r * 0.5); ctx.lineTo(cx + r * 0.45, cy + r * 0.35); ctx.closePath(); ctx.fill();
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

  // A warp arch: like the doorway, but violet, with a swirl inside once open.
  function warpway(ctx, px, py, c, open, t, fx) {
    var cx = px + c / 2, cy = py + c * 0.58;
    if (open) {
      var g = ctx.createRadialGradient(cx, cy, 2, cx, cy, c);
      g.addColorStop(0, "rgba(190,120,255," + (fx ? 0.35 + 0.2 * Math.sin(t / 150) : 0.45).toFixed(3) + ")");
      g.addColorStop(1, "rgba(190,120,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - c / 2, py - c / 2, c * 2, c * 2);
    }
    ctx.fillStyle = open ? "#2a0f48" : "#15110c";
    ctx.fillRect(px + 5, py + 6, c - 10, c - 6);
    if (open) {
      ctx.strokeStyle = "#e3c4ff"; ctx.lineWidth = 1.5;
      var spin = fx ? t / 260 : 0;
      ctx.beginPath();
      for (var k = 0; k <= 24; k++) {
        var a = spin + k * 0.55, r = 0.5 + k * 0.28;
        var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = open ? "#c9a8f0" : "#8f86a0";
    ctx.fillRect(px + 1, py + 4, 4, c - 4);
    ctx.fillRect(px + c - 5, py + 4, 4, c - 4);
    ctx.fillRect(px, py + 1, c, 5);
    ctx.fillStyle = open ? "#6a3fa0" : "#4d4658";
    ctx.fillRect(px, py + 5, c, 1.2);
    // Two chevrons on the lintel: "this one skips ahead".
    ctx.strokeStyle = open ? "#fff3c4" : "#c9c0d6"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 4, py + 2); ctx.lineTo(cx - 1.5, py + 3.5); ctx.lineTo(cx - 4, py + 5);
    ctx.moveTo(cx + 0.5, py + 2); ctx.lineTo(cx + 3, py + 3.5); ctx.lineTo(cx + 0.5, py + 5);
    ctx.stroke();
    if (!open) {
      ctx.strokeStyle = "#8f86a0"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.16, 0, Math.PI * 2); ctx.stroke();
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

  // Watermelon: only enemies can eat it; to you it's a wall.
  function melon(ctx, cx, cy, r) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.95, r * 0.9, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f8f3a";
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.86, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1a5a22"; ctx.lineWidth = 1.4;
    for (var k = -2; k <= 2; k++) {
      ctx.beginPath(); ctx.ellipse(cx + k * r * 0.34, cy, r * 0.12, r * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "rgba(210,255,200,0.35)";
    ctx.beginPath(); ctx.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
  }
  // Extra items drawn by kind (the editor and the game both call this).
  // Damage fruit: a glowing golden star-fruit with a red core.
  function heart(ctx, cx, cy, r, t, fx) {
    var glow = fx ? 0.35 + 0.2 * Math.sin((t || 0) / 180) : 0.45;
    var g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 1.8);
    g.addColorStop(0, "rgba(255,210,90," + glow.toFixed(3) + ")"); g.addColorStop(1, "rgba(255,210,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffcf4a"; ctx.strokeStyle = "#8a5a10"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var k = 0; k < 10; k++) {
      var a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.5 : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e5484d";
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2); ctx.fill();
  }
  // 1-up: an orange token stamped "1UP".
  function oneUp(ctx, cx, cy, r) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.95, r * 0.85, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
    g.addColorStop(0, "#ffd08a"); g.addColorStop(1, "#e2641c");
    ctx.fillStyle = g; ctx.strokeStyle = "#7a2e06"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff8ec";
    ctx.font = "900 " + Math.round(r * 0.9) + "px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("1UP", cx, cy + r * 0.05);
  }
  // Golden apple: a gilded apple with a leaf and a glint.
  function goldApple(ctx, cx, cy, r, t, fx) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.95, r * 0.8, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.3, 1, cx, cy, r * 1.1);
    g.addColorStop(0, "#fff3b0"); g.addColorStop(0.45, "#f2c037"); g.addColorStop(1, "#a06a0a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.6);
    ctx.bezierCurveTo(cx + r * 0.9, cy - r * 1.05, cx + r * 1.25, cy + r * 0.2, cx + r * 0.35, cy + r * 0.9);
    ctx.quadraticCurveTo(cx, cy + r * 0.75, cx - r * 0.35, cy + r * 0.9);
    ctx.bezierCurveTo(cx - r * 1.25, cy + r * 0.2, cx - r * 0.9, cy - r * 1.05, cx, cy - r * 0.6);
    ctx.fill();
    ctx.strokeStyle = "#5a3a08"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.55); ctx.lineTo(cx + r * 0.1, cy - r * 0.95); ctx.stroke();
    ctx.fillStyle = "#4f9a3a";
    ctx.beginPath(); ctx.ellipse(cx + r * 0.35, cy - r * 0.85, r * 0.3, r * 0.13, -0.5, 0, Math.PI * 2); ctx.fill();
    var a = fx ? 0.5 + 0.5 * Math.sin((t || 0) / 240) : 0.8;
    ctx.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
    ctx.beginPath(); ctx.ellipse(cx - r * 0.38, cy - r * 0.15, r * 0.14, r * 0.26, 0.4, 0, Math.PI * 2); ctx.fill();
  }
  function itemArt(ctx, item, cx, cy, c, t, fx) {
    if (item === "melon") melon(ctx, cx, cy, c * 0.36);
    else if (item === "heart") heart(ctx, cx, cy, c * 0.38, t, fx);
    else if (item === "oneup") oneUp(ctx, cx, cy, c * 0.36);
    else if (item === "gold") goldApple(ctx, cx, cy, c * 0.38, t, fx);
  }
  // Spike flower: a flashing red bud while it warns, then steel spikes.
  function flower(ctx, px, py, c, armed, t, fx) {
    var cx = px + c / 2, cy = py + c / 2;
    if (!armed) {
      var on = !fx || Math.floor((t || 0) / 110) % 2 === 0;
      ctx.strokeStyle = on ? "#ff4a4a" : "rgba(255,74,74,0.35)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,74,74,0.25)";
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.18, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.fillStyle = "#d9dee6"; ctx.strokeStyle = "#6c7480"; ctx.lineWidth = 1;
    for (var k = 0; k < 8; k++) {
      var a = k * Math.PI / 4, r = c * 0.46;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.28) * c * 0.14, cy + Math.sin(a - 0.28) * c * 0.14);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a + 0.28) * c * 0.14, cy + Math.sin(a + 0.28) * c * 0.14);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = "#b8202e";
    ctx.beginPath(); ctx.arc(cx, cy, c * 0.15, 0, Math.PI * 2); ctx.fill();
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

  // ---- maze chase ----------------------------------------------------------------
  // Beads: little gold offerings. Hundreds sit on a board at once, so they are
  // two flat circles — no gradients, no shadows.
  function bead(ctx, cx, cy, c) {
    var r = Math.max(1.6, c * 0.1);
    ctx.fillStyle = "#b8862e";
    ctx.beginPath(); ctx.arc(cx, cy + 0.6, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f6d98a";
    ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.2, r * 0.72, 0, Math.PI * 2); ctx.fill();
  }
  // Sunstone: a gold sun disc that pulses; eat it and the guardians take fright.
  function sunstone(ctx, cx, cy, c, t, fx) {
    var pulse = fx ? 0.5 + 0.5 * Math.sin((t || 0) / 160) : 0.6, r = c * 0.26;
    var g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 2.2);
    g.addColorStop(0, "rgba(255,214,110," + (0.35 + 0.3 * pulse).toFixed(3) + ")"); g.addColorStop(1, "rgba(255,214,110,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f2b33a";
    ctx.beginPath();
    for (var k = 0; k < 16; k++) {
      var a = k * Math.PI / 8 + (fx ? (t || 0) / 2400 : 0), rr = k % 2 ? r * 0.95 : r * 1.45;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffe7a3"; ctx.strokeStyle = "#9a5f12"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#c9811f";
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  // The shrine gate: a bronze lattice only guardians pass (static layer).
  function gate(g, px, py, c) {
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(px, py + c * 0.36, c, c * 0.34);
    g.fillStyle = "#b37a34"; g.strokeStyle = "#4a2c0c"; g.lineWidth = 1;
    g.fillRect(px, py + c * 0.3, c, c * 0.12); g.strokeRect(px + 0.5, py + c * 0.3 + 0.5, c - 1, c * 0.12 - 1);
    g.fillRect(px, py + c * 0.6, c, c * 0.12); g.strokeRect(px + 0.5, py + c * 0.6 + 0.5, c - 1, c * 0.12 - 1);
    for (var k = 0; k < 3; k++) {
      var x = px + c * (0.2 + k * 0.3) - 1.5;
      g.fillStyle = "#d9a24e"; g.fillRect(x, py + c * 0.22, 3, c * 0.58);
      g.strokeRect(x + 0.5, py + c * 0.22 + 0.5, 2, c * 0.58 - 1);
    }
  }
  // Temple guardians: flame spirits behind carved masks, one gem colour each.
  var GUARDIANS = [
    { body: [255, 112, 58], light: [255, 222, 150], dark: [132, 30, 8], name: "Ember" },
    { body: [178, 96, 240], light: [232, 204, 255], dark: [72, 22, 122], name: "Amethyst" },
    { body: [66, 140, 238], light: [184, 218, 255], dark: [18, 48, 122], name: "Lapis" },
    { body: [236, 190, 52], light: [255, 242, 172], dark: [116, 80, 8], name: "Topaz" },
  ];
  var FRIGHT = { body: [128, 180, 255], light: [226, 240, 255], dark: [34, 62, 140] };
  var FLASH = { body: [236, 238, 255], light: [255, 255, 255], dark: [120, 124, 170] };
  //   o: { persona, look: "hunt" | "fright" | "flash" | "eyes", dir: {x, y}, t, fx }
  function guardian(ctx, cx, cy, c, o) {
    var t = o.t || 0, fx = o.fx, d = o.dir || { x: 0, y: 1 };
    var r = c * 0.42, bob = fx ? Math.sin(t / 210 + o.persona * 1.7) * c * 0.05 : 0;
    cy += bob;
    if (o.look === "eyes") {
      // eaten: just its two ember eyes, streaking home
      for (var s = -1; s <= 1; s += 2) {
        var ex = cx + s * r * 0.34 + d.x * r * 0.15, ey = cy - r * 0.05 + d.y * r * 0.15;
        var gl = ctx.createRadialGradient(ex, ey, 0.5, ex, ey, r * 0.45);
        gl.addColorStop(0, "rgba(255,236,190,0.95)"); gl.addColorStop(1, "rgba(255,160,60,0)");
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(ex, ey, r * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff6dc";
        ctx.beginPath(); ctx.arc(ex, ey, r * 0.13, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    var pal = o.look === "fright" ? FRIGHT : o.look === "flash" ? FLASH : GUARDIANS[o.persona % 4];
    var sway = fx ? Math.sin(t / 90 + o.persona) * r * 0.12 : 0, top = cy - r * 1.3;
    // halo
    var halo = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.6);
    halo.addColorStop(0, rgb(pal.body, 0.35)); halo.addColorStop(1, rgb(pal.body, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2); ctx.fill();
    // the flame: a pointed crown over a rounded base
    var body = ctx.createLinearGradient(cx, top, cx, cy + r);
    body.addColorStop(0, rgb(pal.light)); body.addColorStop(0.45, rgb(pal.body)); body.addColorStop(1, rgb(pal.dark));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(cx + sway, top);
    ctx.quadraticCurveTo(cx + r * 0.35, cy - r * 0.75, cx + r * 0.62, cy - r * 0.95);   // a side tongue
    ctx.quadraticCurveTo(cx + r * 0.6, cy - r * 0.45, cx + r * 0.95, cy + r * 0.05);
    ctx.arc(cx, cy + r * 0.05, r * 0.95, 0, Math.PI);
    ctx.quadraticCurveTo(cx - r * 0.6, cy - r * 0.45, cx - r * 0.62, cy - r * 0.95);
    ctx.quadraticCurveTo(cx - r * 0.35, cy - r * 0.75, cx + sway, top);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgb(pal.dark); ctx.lineWidth = 1.2; ctx.stroke();
    // the carved mask
    var mx = cx, my = cy + r * 0.08, mw = r * 0.78, mh = r * 0.5;
    ctx.fillStyle = o.look === "hunt" ? "#efe2c4" : "#2a3350";
    ctx.strokeStyle = o.look === "hunt" ? "#5a4526" : "#0e1428"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(mx, my, mw, mh, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (o.look === "hunt") {
      // slit eyes that watch where it's going
      var lx = d.x * r * 0.14, ly = d.y * r * 0.1;
      ctx.fillStyle = "#1b0f06";
      for (var e = -1; e <= 1; e += 2) {
        ctx.beginPath(); ctx.ellipse(mx + e * r * 0.34 + lx, my - r * 0.04 + ly, r * 0.2, r * 0.09, e * 0.25, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = rgb(pal.body);
      for (var e2 = -1; e2 <= 1; e2 += 2) { ctx.beginPath(); ctx.arc(mx + e2 * r * 0.34 + lx * 1.4, my - r * 0.04 + ly * 1.4, r * 0.06, 0, Math.PI * 2); ctx.fill(); }
    } else {
      // frightened: round startled eyes and a trembling mouth
      ctx.fillStyle = "#f4f7ff";
      for (var f = -1; f <= 1; f += 2) { ctx.beginPath(); ctx.arc(mx + f * r * 0.3, my - r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = "#f4f7ff"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var w = 0; w <= 6; w++) ctx.lineTo(mx - r * 0.42 + w * r * 0.14, my + r * 0.2 + (w % 2 ? -1 : 1) * r * 0.06);
      ctx.stroke();
    }
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
    var W = c * 0.7 * (o.scale || 1);
    function adj(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < c * 1.05; }
    var tl = Math.max(2, Math.min(6, Math.floor(n * 0.6)));
    function width(k) { var from = n - tl; return k <= from ? W : W * (1 - 0.55 * (k - from) / tl); }

    ctx.save();
    ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * (pal.spectral ? 0.78 : 1);
    if (pal.spectral && !o.dead) { ctx.shadowColor = rgb(pal.light, 0.8); ctx.shadowBlur = 8; }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Rainbows shift hue along the body and over time.
    function hue(k) { return "hsl(" + Math.round(((o.t || 0) / 8 + k * 28) % 360) + ",85%,58%)"; }
    function links(off, extra, style) {
      ctx.strokeStyle = style;
      for (var k = n - 1; k >= 1; k--) {
        var a = P[k], b = P[k - 1];
        if (pal.rainbow && extra === 0 && off === 0) ctx.strokeStyle = hue(k);
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
      // Stripes (zippers) or dorsal diamonds with a pale scale between them.
      if (!o.ghost && pal.stripes) {
        ctx.strokeStyle = rgb(pal.dark, 0.85);
        for (var k2 = 1; k2 < n; k2++) {
          var a2 = P[k2], b2 = P[k2 - 1];
          if (!adj(a2, b2)) continue;
          var mx = (a2.x + b2.x) / 2, my = (a2.y + b2.y) / 2, horiz = Math.abs(a2.x - b2.x) > Math.abs(a2.y - b2.y), hw = width(k2) * 0.46;
          ctx.lineWidth = Math.max(1.5, width(k2) * 0.2);
          ctx.beginPath();
          if (horiz) { ctx.moveTo(mx, my - hw); ctx.lineTo(mx, my + hw); } else { ctx.moveTo(mx - hw, my); ctx.lineTo(mx + hw, my); }
          ctx.stroke();
        }
      } else if (!o.ghost) {
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
    ctx.fillStyle = pal.rainbow ? hue(0) : rgb(pal.body);
    ctx.strokeStyle = rgb(pal.dark);
    ctx.lineWidth = 1.6;
    var hs = o.scale || 1;
    ctx.beginPath(); ctx.ellipse(hx, hy, c * 0.5 * hs, c * 0.41 * hs, ang, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgb(pal.light, 0.45);
    ctx.beginPath(); ctx.ellipse(hx + d.x * c * 0.2, hy + d.y * c * 0.2, c * 0.2, c * 0.12, ang, 0, Math.PI * 2); ctx.fill();
    var tipX = hx + d.x * c * 0.5, tipY = hy + d.y * c * 0.5;
    if (o.cyclops && !o.dead) {
      // One great eye, looking where it hunts.
      var R = c * 0.3 * hs;
      ctx.fillStyle = "#fff4d0";
      ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pal.eye;
      ctx.beginPath(); ctx.arc(hx + d.x * R * 0.25, hy + d.y * R * 0.25, R * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#140d04";
      ctx.beginPath(); ctx.ellipse(hx + d.x * R * 0.3, hy + d.y * R * 0.3, R * 0.5, R * 0.16, ang + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    } else if (o.cross) {
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
    hash: hash, rgb: rgb, shade: shade, SERPENTS: SERPENTS, SERPENT_OF: SERPENT_OF, serpentFor: serpentFor, PORTAL_COLORS: PORTAL_COLORS, THEMES: THEMES, makeLayer: makeLayer,
    floor: floor, wall: wall, ice: ice, dream: dream, storm: storm, darkFloor: darkFloor, cutter: cutter, portalFrame: portalFrame,
    portalGlow: portalGlow, door: door, plate: plate, clickSwitch: clickSwitch, spikes: spikes, doorway: doorway, warpway: warpway, DOOR: DOOR,
    fruit: fruit, gem: gem, wisp: wisp, melon: melon, itemArt: itemArt, telePad: telePad, infinity: infinity, cloner: cloner, outlet: outlet, flower: flower, stud: stud, serpent: serpent,
    bead: bead, sunstone: sunstone, gate: gate, guardian: guardian, GUARDIANS: GUARDIANS,
  };
})();
