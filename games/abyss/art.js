/* =====================================================================
   Abyss — the water. Everything moody is painted here: the column of
   sea fading to black, marine snow, jellyfish on their slow patrols,
   the little submarine with its searchlight, and the glowing cells the
   tetrominoes are made of. game.js runs the game and calls in.
   ===================================================================== */
(function () {
  "use strict";

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Seven species of light — [outer glow, body, core] per tetromino. */
  var SPECIES = {
    I: { glow: "rgba(80,200,255,",  body: "#39c0f0", core: "#d8f6ff", name: "siphonophore" },
    O: { glow: "rgba(160,235,235,", body: "#7fd8d4", core: "#eafffd", name: "moon jelly" },
    T: { glow: "rgba(190,120,255,", body: "#a45ce8", core: "#f0dcff", name: "comb jelly" },
    S: { glow: "rgba(110,235,150,", body: "#4ecf7a", core: "#dcffe8", name: "sea sparkle" },
    Z: { glow: "rgba(255,170,80,",  body: "#e8963c", core: "#ffedd0", name: "lure" },
    J: { glow: "rgba(90,130,255,",  body: "#4a6ee8", core: "#dce6ff", name: "lanternfish" },
    L: { glow: "rgba(80,225,205,",  body: "#2fc4ae", core: "#d8fff7", name: "flashlight fish" },
    // the small fry, for Krill mode
    P: { glow: "rgba(255,220,120,", body: "#f0c445", core: "#fff6d8", name: "dinoflagellate" },
    D: { glow: "rgba(255,130,190,", body: "#e8609e", core: "#ffe0ee", name: "twin anglers" },
    V: { glow: "rgba(240,90,110,",  body: "#e04a62", core: "#ffdce0", name: "krill" },
    W: { glow: "rgba(210,230,90,",  body: "#bcd23c", core: "#f6ffd8", name: "glowworm" }
  };

  /* One glowing cell. (x, y) top-left, s the cell size. dim: settled on
     the reef; ghost: the sonar echo (outline only). Drawn at the context's
     alpha (a clearing row fading, a hard drop's trail). */
  function cell(g, x, y, s, type, opts) {
    var sp = SPECIES[type], a0 = g.globalAlpha;
    opts = opts || {};
    var cx = x + s / 2, cy = y + s / 2, r = s * 0.42;
    if (opts.ghost) {
      g.strokeStyle = sp.glow + "0.55)";
      g.lineWidth = Math.max(1, s * 0.07);
      g.setLineDash([s * 0.18, s * 0.14]);
      g.strokeRect(x + s * 0.14, y + s * 0.14, s * 0.72, s * 0.72);
      g.setLineDash([]);
      return;
    }
    var dim = opts.dim ? 0.55 : 1;
    // the glow round it: part of the art, so with Visual FX off too
    var halo = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, s * 0.75);
    halo.addColorStop(0, sp.glow + (0.5 * dim) + ")");
    halo.addColorStop(1, sp.glow + "0)");
    g.fillStyle = halo;
    g.fillRect(x - s * 0.3, y - s * 0.3, s * 1.6, s * 1.6);
    // the body: a soft rounded organism
    g.fillStyle = sp.body;
    g.globalAlpha = a0 * (0.4 + 0.6 * dim);
    rr(g, x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, s * 0.26);
    g.fill();
    g.globalAlpha = a0;
    // membrane edge
    g.strokeStyle = sp.glow + (0.85 * dim) + ")";
    g.lineWidth = Math.max(1, s * 0.06);
    rr(g, x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, s * 0.26);
    g.stroke();
    // the nucleus and a few photophores
    g.fillStyle = sp.core;
    g.globalAlpha = a0 * 0.9 * dim;
    g.beginPath(); g.arc(cx - s * 0.1, cy - s * 0.1, s * 0.13, 0, 7); g.fill();
    g.globalAlpha = a0 * 0.5 * dim;
    g.beginPath(); g.arc(cx + s * 0.18, cy + s * 0.16, s * 0.06, 0, 7); g.fill();
    g.beginPath(); g.arc(cx - s * 0.2, cy + 0.22 * s, s * 0.05, 0, 7); g.fill();
    g.globalAlpha = a0;
  }

  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---- the sea ---------------------------------------------------------
     A persistent scene object: marine snow, jellyfish, fish, the sub.
     draw(t, dt, fxOn, depth01) paints the full-viewport backdrop. */
  function makeSea(w, h) {
    var rng = mulberry(77);
    var snow = [], jellies = [], fish = [];
    for (var i = 0; i < 70; i++) {
      snow.push({ x: rng() * w, y: rng() * h, v: 6 + rng() * 14, r: 0.6 + rng() * 1.4, drift: rng() * 6.28 });
    }
    for (var j = 0; j < 3; j++) {
      jellies.push({ x: rng() * w, y: h * (0.25 + 0.25 * j) + rng() * 60, r: 16 + rng() * 18,
        ph: rng() * 6.28, vx: (rng() - 0.5) * 6, hue: [185, 265, 320][j] });
    }
    for (var f = 0; f < 6; f++) {
      fish.push({ x: rng() * w, y: h * (0.3 + rng() * 0.6), v: 8 + rng() * 16, s: 5 + rng() * 7,
        dir: rng() < 0.5 ? -1 : 1, ph: rng() * 6.28 });
    }
    return {
      resize: function (nw, nh) { w = nw; h = nh; },
      draw: function (g, t, dt, fxOn, danger) {
        // the column of water: dim light above, void below
        var bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, "#0a2438");
        bg.addColorStop(0.45, "#061424");
        bg.addColorStop(1, "#01050c");
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        if (danger > 0) {
          g.fillStyle = "rgba(140,20,25," + (0.12 * danger * (fxOn ? (0.7 + 0.3 * Math.sin(t * 0.008)) : 1)) + ")";
          g.fillRect(0, 0, w, h);
        }
        // light rays from the surface
        g.save();
        g.globalAlpha = fxOn ? 0.05 + 0.02 * Math.sin(t * 0.0006) : 0.05;
        g.fillStyle = "#7fc4e8";
        for (var rI = 0; rI < 4; rI++) {
          var rx = w * (0.12 + rI * 0.24) + (fxOn ? Math.sin(t * 0.0002 + rI) * 30 : 0);
          g.beginPath();
          g.moveTo(rx - 14, 0); g.lineTo(rx + 14, 0);
          g.lineTo(rx + 90, h * 0.55); g.lineTo(rx - 90, h * 0.55);
          g.closePath(); g.fill();
        }
        g.restore();
        // the little submarine on patrol
        var sx = w * 0.5 + (fxOn ? Math.sin(t * 0.00013) * w * 0.4 : -w * 0.3);
        var sy = 40 + (fxOn ? Math.sin(t * 0.0007) * 6 : 0);
        var flip = fxOn ? (Math.cos(t * 0.00013) < 0 ? -1 : 1) : 1;
        g.save();
        g.translate(sx, sy); g.scale(flip, 1);
        g.globalAlpha = 0.8;
        g.fillStyle = "#152a3d";
        g.beginPath(); g.ellipse(0, 0, 34, 12, 0, 0, 7); g.fill();
        g.fillRect(-6, -20, 12, 12);
        g.beginPath(); g.moveTo(-34, -4); g.lineTo(-44, -10); g.lineTo(-44, 8); g.lineTo(-34, 5); g.closePath(); g.fill();
        g.fillStyle = "#2fc4ae"; g.globalAlpha = 0.9;
        g.beginPath(); g.arc(8, -2, 3, 0, 7); g.fill();
        g.beginPath(); g.arc(-8, -2, 3, 0, 7); g.fill();
        // searchlight
        g.globalAlpha = 0.1;
        g.fillStyle = "#bfe8ff";
        g.beginPath(); g.moveTo(30, 2); g.lineTo(150, 60); g.lineTo(150, -34); g.closePath(); g.fill();
        g.restore();
        g.globalAlpha = 1;
        // The snow, jellyfish and fish are there with Visual FX off too, held
        // still where they are (mv: how far they move this frame).
        var mv = fxOn ? dt : 0;
        // marine snow
        g.fillStyle = "rgba(210,230,240,0.5)";
        snow.forEach(function (p) {
          p.y += p.v * mv; if (fxOn) p.x += Math.sin(t * 0.0005 + p.drift) * 0.2;
          if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
        });
        // jellyfish
        jellies.forEach(function (jl) {
          jl.x += jl.vx * mv; jl.ph += mv * 1.6;
          if (fxOn) jl.y += Math.sin(jl.ph) * -0.35 + 2 * dt;
          if (jl.x < -60) jl.x = w + 60; if (jl.x > w + 60) jl.x = -60;
          if (jl.y > h + 80) jl.y = -60;
          var squeeze = fxOn ? 1 + Math.sin(jl.ph) * 0.12 : 1;
          g.save();
          g.translate(jl.x, jl.y);
          g.globalAlpha = 0.35;
          var jg = g.createRadialGradient(0, 0, 2, 0, 0, jl.r * 1.8);
          jg.addColorStop(0, "hsla(" + jl.hue + ",90%,75%,0.8)");
          jg.addColorStop(1, "hsla(" + jl.hue + ",90%,60%,0)");
          g.fillStyle = jg;
          g.beginPath(); g.arc(0, 0, jl.r * 1.8, 0, 7); g.fill();
          g.globalAlpha = 0.55;
          g.fillStyle = "hsla(" + jl.hue + ",85%,72%,0.75)";
          g.beginPath();
          g.ellipse(0, 0, jl.r * squeeze, jl.r * 0.75 / squeeze, 0, Math.PI, 0);
          g.closePath(); g.fill();
          g.strokeStyle = "hsla(" + jl.hue + ",85%,80%,0.5)";
          g.lineWidth = 1.2;
          for (var tn = -2; tn <= 2; tn++) {
            g.beginPath();
            g.moveTo(tn * jl.r * 0.3, jl.r * 0.1);
            g.quadraticCurveTo(tn * jl.r * 0.4 + Math.sin(jl.ph + tn) * 4, jl.r * 0.9,
              tn * jl.r * 0.34 + Math.sin(jl.ph * 1.3 + tn) * 6, jl.r * 1.7);
            g.stroke();
          }
          g.restore();
        });
        // far fish
        g.fillStyle = "rgba(90,140,170,0.3)";
        fish.forEach(function (fs) {
          fs.x += fs.v * fs.dir * mv;
          if (fs.dir > 0 && fs.x > w + 20) { fs.x = -20; fs.y = h * (0.3 + Math.random() * 0.6); }
          if (fs.dir < 0 && fs.x < -20) { fs.x = w + 20; fs.y = h * (0.3 + Math.random() * 0.6); }
          var fy = fs.y + (fxOn ? Math.sin(t * 0.002 + fs.ph) * 3 : 0);
          g.beginPath();
          g.ellipse(fs.x, fy, fs.s, fs.s * 0.38, 0, 0, 7);
          g.fill();
          g.beginPath();
          g.moveTo(fs.x - fs.dir * fs.s, fy);
          g.lineTo(fs.x - fs.dir * fs.s * 1.6, fy - fs.s * 0.4);
          g.lineTo(fs.x - fs.dir * fs.s * 1.6, fy + fs.s * 0.4);
          g.closePath(); g.fill();
        });
      }
    };
  }

  window.AbyssArt = { SPECIES: SPECIES, cell: cell, rr: rr, makeSea: makeSea, mulberry: mulberry };
})();
