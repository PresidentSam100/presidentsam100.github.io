/* =====================================================================
   Sunset Slice — the drawing: sky, sun, mountains, grass, and the things
   you cut. Targets are black silhouettes against the sun with a rim of
   sunlight on the side facing it; cut one and each half shows its inside
   in colour. No images: everything is drawn with canvas paths.

   SunsetArt.sky(ctx, W, H, dusk, t, fx)       dusk: 0 low sun -> 1 set
   SunsetArt.mountains(W, H)                   -> a cached canvas layer
   SunsetArt.grass(ctx, W, H, t, fx)
   SunsetArt.target(ctx, type, r, t, lightAng, rim)   whole, at the origin
   SunsetArt.half(ctx, type, r, t)                    cross-section face
   SunsetArt.TYPES[type] = { flesh, skin, juice, points }
   ===================================================================== */
window.SunsetArt = (function () {
  "use strict";
  var INK = "#140a0e";

  function lerp(a, b, k) { return a + (b - a) * k; }
  function mix(c1, c2, k) {
    return "rgb(" + Math.round(lerp(c1[0], c2[0], k)) + "," + Math.round(lerp(c1[1], c2[1], k)) + "," + Math.round(lerp(c1[2], c2[2], k)) + ")";
  }
  function horizonY(H) { return H * 0.7; }
  function sunGeom(W, H, dusk) {
    var R = Math.min(W, H) * 0.26, hy = horizonY(H);
    return { x: W * 0.5, y: lerp(hy - R * 0.55, hy + R * 1.1, dusk), R: R };
  }

  // ---- sky and sun ---------------------------------------------------------------
  // The gradients cover the whole screen, so they're painted into a cached
  // layer and only repainted when the sunset has moved on a notch.
  var skyCache = { key: "", canvas: null };
  function sky(ctx, W, H, dusk, t, fx) {
    var step = Math.round(dusk * 120) / 120, key = W + "x" + H + ":" + step;
    if (skyCache.key !== key) {
      if (!skyCache.canvas) skyCache.canvas = document.createElement("canvas");
      var c = skyCache.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      var g2 = c.getContext("2d");
      g2.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintSky(g2, W, H, step);
      skyCache.key = key;
    }
    ctx.drawImage(skyCache.canvas, 0, 0, W, H);
    var s = sunGeom(W, H, step);
    // Thin cloud streaks drifting across the sun (cheap, so drawn live).
    ctx.fillStyle = "rgba(90,24,52," + (0.28 + step * 0.2).toFixed(3) + ")";
    var drift = fx ? t * 0.004 : 0;
    [[0.52, 0.018, 0.9], [0.58, 0.012, 0.6], [0.63, 0.02, 1.2], [0.44, 0.01, 0.5]].forEach(function (cl, i) {
      var y = H * cl[0], h = H * cl[1], w = W * cl[2], x = ((i * 0.37 + drift * (i + 1) * 0.3) % 1.4 - 0.2) * W;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    return s;
  }
  function paintSky(ctx, W, H, dusk) {
    var hy = horizonY(H);
    var g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, mix([74, 28, 70], [18, 12, 38], dusk));
    g.addColorStop(0.45, mix([196, 58, 62], [72, 30, 78], dusk));
    g.addColorStop(0.8, mix([245, 122, 56], [150, 58, 70], dusk));
    g.addColorStop(1, mix([255, 196, 104], [214, 96, 70], dusk));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    var s = sunGeom(W, H, dusk);
    // The glow around the sun (a gradient, not shadowBlur: cheap on phones).
    var glow = ctx.createRadialGradient(s.x, s.y, s.R * 0.8, s.x, s.y, s.R * 2.6);
    glow.addColorStop(0, "rgba(255,170,90," + (0.55 * (1 - dusk * 0.7)).toFixed(3) + ")");
    glow.addColorStop(1, "rgba(255,120,60,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    var body = ctx.createRadialGradient(s.x, s.y - s.R * 0.2, s.R * 0.1, s.x, s.y, s.R);
    body.addColorStop(0, "#fff0c8");
    body.addColorStop(0.55, mix([255, 196, 110], [255, 150, 90], dusk));
    body.addColorStop(1, mix([255, 110, 60], [230, 70, 60], dusk));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.R, 0, Math.PI * 2); ctx.fill();
  }

  // ---- mountains (static: cached) ------------------------------------------------------
  function ridge(ctx, W, H, base, amp, seed, color) {
    var rnd = seed;
    function r() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    var x = 0, y = base - amp * r();
    ctx.lineTo(0, y);
    while (x < W) {
      x += W * (0.05 + r() * 0.08);
      y = base - amp * (0.3 + r() * 0.7);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
  function mountains(W, H) {
    var c = document.createElement("canvas"), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    var g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var hy = horizonY(H);
    // A far volcano-like peak, then two ranges; the nearest is almost black.
    g.fillStyle = "#6a2a4c";
    g.beginPath();
    g.moveTo(W * 0.55, hy + 2);
    g.lineTo(W * 0.72, hy - H * 0.2);
    g.lineTo(W * 0.76, hy - H * 0.205);
    g.lineTo(W * 0.95, hy + 2);
    g.closePath(); g.fill();
    ridge(g, W, H, hy + H * 0.02, H * 0.08, 7, "#52193c");
    ridge(g, W, H, hy + H * 0.09, H * 0.07, 23, "#3a1230");
    ridge(g, W, H, hy + H * 0.16, H * 0.05, 91, "#2a0e21");   // a touch lighter than ink, so the grass shows
    // Pines on the near ridge.
    var rnd = 5;
    function r() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
    g.fillStyle = INK;
    for (var k = 0; k < 9; k++) {
      var px = W * (0.04 + r() * 0.92), ph = H * (0.05 + r() * 0.05), pw = ph * 0.45, py = hy + H * 0.14;
      for (var tier = 0; tier < 3; tier++) {
        var ty = py - ph * (tier / 3), tw = pw * (1 - tier * 0.28);
        g.beginPath(); g.moveTo(px - tw, ty); g.lineTo(px, ty - ph * 0.5); g.lineTo(px + tw, ty); g.closePath(); g.fill();
      }
    }
    return c;
  }

  // ---- foreground grass ------------------------------------------------------------------
  var blades = null, bladesFor = "";
  function grass(ctx, W, H, t, fx) {
    if (bladesFor !== W + "x" + H) {
      bladesFor = W + "x" + H;
      blades = [];
      var n = Math.round(W / 7), rnd = 11;
      for (var i = 0; i < n; i++) {
        rnd = (rnd * 16807) % 2147483647;
        var a = rnd / 2147483647;
        blades.push({ x: (i + a) * (W / n), h: H * (0.06 + a * 0.1), phase: a * 6.28, lean: (a - 0.5) * 0.3 });
      }
    }
    ctx.fillStyle = INK;
    ctx.fillRect(0, H - H * 0.03, W, H * 0.03);
    ctx.strokeStyle = INK;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, W / 500);
    ctx.beginPath();
    for (var k = 0; k < blades.length; k++) {
      var b = blades[k], sway = fx ? Math.sin(t * 0.0016 + b.phase) * 0.18 + 0.12 : 0.12;
      var tipX = b.x + (b.lean + sway) * b.h, tipY = H - b.h;
      ctx.moveTo(b.x, H);
      ctx.quadraticCurveTo(b.x + (b.lean + sway) * b.h * 0.3, H - b.h * 0.55, tipX, tipY);
    }
    ctx.stroke();
  }

  // ---- targets ------------------------------------------------------------------------------
  var TYPES = {
    persimmon: { flesh: "#f59a3a", skin: "#d8561e", juice: "#ff9d3b", points: 1 },
    peach: { flesh: "#ffc9a0", skin: "#e8667a", juice: "#ffb08f", points: 1 },
    bamboo: { flesh: "#d9e8a8", skin: "#6f9a3c", juice: "#cfe39a", points: 1 },
    lantern: { flesh: "#ffe08a", skin: "#d2432f", juice: "#ffd35a", points: 1 },
    koban: { flesh: "#ffe08a", skin: "#c99a2e", juice: "#ffe7a0", points: 5 },
    bomb: { flesh: "#2a1a1a", skin: INK, juice: "#ff8a3a", points: 0 },
  };

  function outline(ctx, type, r) {
    ctx.beginPath();
    if (type === "bamboo") {
      var w = r * 0.62, h = r * 1.9;
      ctx.moveTo(-w / 2, -h / 2 + w * 0.12);
      ctx.lineTo(-w / 2, h / 2 - w * 0.12);
      ctx.quadraticCurveTo(0, h / 2 + w * 0.12, w / 2, h / 2 - w * 0.12);
      ctx.lineTo(w / 2, -h / 2 + w * 0.12);
      ctx.quadraticCurveTo(0, -h / 2 - w * 0.12, -w / 2, -h / 2 + w * 0.12);
    } else if (type === "lantern") ctx.ellipse(0, 0, r * 0.82, r * 0.98, 0, 0, Math.PI * 2);
    else if (type === "koban") ctx.ellipse(0, 0, r * 0.62, r * 0.92, 0, 0, Math.PI * 2);
    else if (type === "persimmon") ctx.ellipse(0, r * 0.05, r, r * 0.86, 0, 0, Math.PI * 2);
    else if (type === "peach") {
      // Round, with the cleft dipping in at the top.
      ctx.moveTo(0, -r * 0.7);
      ctx.bezierCurveTo(r * 0.35, -r * 1.02, r * 1.02, -r * 0.72, r * 0.98, -r * 0.05);
      ctx.bezierCurveTo(r * 0.95, r * 0.6, r * 0.45, r * 0.98, 0, r * 0.98);
      ctx.bezierCurveTo(-r * 0.45, r * 0.98, -r * 0.95, r * 0.6, -r * 0.98, -r * 0.05);
      ctx.bezierCurveTo(-r * 1.02, -r * 0.72, -r * 0.35, -r * 1.02, 0, -r * 0.7);
    }
    else ctx.arc(0, 0, r, 0, Math.PI * 2);
  }

  // The rim of sunlight: a bright edge on the side facing the sun (ang is the
  // direction to the sun in the target's own frame). `rim` 0..1 grows at dusk.
  function rimLight(ctx, type, r, ang, rim) {
    ctx.save();
    outline(ctx, type, r);
    ctx.clip();
    var lx = Math.cos(ang) * r * 1.35, ly = Math.sin(ang) * r * 1.35;
    var g = ctx.createRadialGradient(lx, ly, r * 0.2, lx, ly, r * 1.25);
    g.addColorStop(0, "rgba(255,196,120," + (0.55 + 0.4 * rim).toFixed(3) + ")");
    g.addColorStop(1, "rgba(255,160,90,0)");
    ctx.lineWidth = r * 0.22;
    ctx.strokeStyle = g;
    outline(ctx, type, r);
    ctx.stroke();
    ctx.restore();
    // A faint halo so silhouettes still read against a dark sky.
    if (rim > 0.3) {
      ctx.strokeStyle = "rgba(255,190,140," + (0.18 * rim).toFixed(3) + ")";
      ctx.lineWidth = r * 0.12;
      outline(ctx, type, r * 1.06);
      ctx.stroke();
    }
  }

  function target(ctx, type, r, t, ang, rim) {
    if (type === "koban") return koban(ctx, r, t, ang);
    if (type === "bomb") return bomb(ctx, r, t);
    ctx.fillStyle = INK;
    outline(ctx, type, r);
    ctx.fill();
    // Sunlit rim first, so leaves, caps and stems sit on top of it.
    rimLight(ctx, type, r, ang, rim);
    ctx.fillStyle = INK;
    if (type === "persimmon") {
      // Four-leaf calyx and stem.
      for (var k = 0; k < 4; k++) {
        ctx.save(); ctx.translate(0, -r * 0.8); ctx.rotate(-0.9 + k * 0.6);
        ctx.beginPath(); ctx.ellipse(0, -r * 0.18, r * 0.12, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.fillRect(-r * 0.05, -r * 1.2, r * 0.1, r * 0.3);
    } else if (type === "peach") {
      // A stem and two leaves in a V above the cleft; a small dab of ink
      // fills the cleft so the rim light can't glint there like eyes.
      ctx.beginPath(); ctx.ellipse(0, -r * 0.72, r * 0.2, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-r * 0.04, -r * 1.02, r * 0.08, r * 0.34);
      [[-0.55, -1], [0.55, 1]].forEach(function (lf) {
        ctx.save(); ctx.translate(lf[1] * r * 0.3, -r * 1.06); ctx.rotate(lf[0]);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.34, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
    } else if (type === "bamboo") {
      ctx.fillStyle = "rgba(255,190,120,0.35)";
      [-0.35, 0.35].forEach(function (k) { ctx.fillRect(-r * 0.31, r * 1.9 * k - r * 0.03, r * 0.62, r * 0.06); });
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.ellipse(r * 0.36, -r * 0.35, r * 0.26, r * 0.07, -0.5, 0, Math.PI * 2); ctx.fill();
    } else if (type === "lantern") {
      // Warm light through the paper, ribs, and the black caps.
      var glow = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 0.95);
      glow.addColorStop(0, "rgba(255,190,90,0.85)");
      glow.addColorStop(1, "rgba(220,80,50,0.25)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.74, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.05);
      for (var j = -3; j <= 3; j++) {
        var yy = j * r * 0.24, ww = r * 0.8 * Math.sqrt(Math.max(0, 1 - (yy / (r * 0.95)) * (yy / (r * 0.95))));
        ctx.beginPath(); ctx.moveTo(-ww, yy); ctx.lineTo(ww, yy); ctx.stroke();
      }
      ctx.fillStyle = INK;
      ctx.fillRect(-r * 0.45, -r * 1.05, r * 0.9, r * 0.2);
      ctx.fillRect(-r * 0.45, r * 0.86, r * 0.9, r * 0.2);
      ctx.fillRect(-r * 0.04, -r * 1.3, r * 0.08, r * 0.28);
    }
  }

  // A gold koban coin: it reads as treasure even against the sun.
  function koban(ctx, r, t, ang) {
    var g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, "#fff1b0"); g.addColorStop(0.5, "#e9b640"); g.addColorStop(1, "#9c6a14");
    ctx.fillStyle = g;
    outline(ctx, "koban", r); ctx.fill();
    ctx.strokeStyle = "#7a4d0c"; ctx.lineWidth = Math.max(1.5, r * 0.07);
    outline(ctx, "koban", r * 0.86); ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.04);
    for (var k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(-r * 0.4, k * r * 0.2); ctx.lineTo(r * 0.4, k * r * 0.2); ctx.stroke(); }
    var shine = (t * 0.002) % 3;
    if (shine < 1) {
      ctx.save(); outline(ctx, "koban", r); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(-r + shine * r * 2.4 - r * 0.2, -r, r * 0.25, r * 2);
      ctx.restore();
    }
  }

  // A fire bomb: a round shell, a rope collar, and a fuse spitting sparks.
  function bomb(ctx, r, t) {
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.012);
    var halo = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.7);
    halo.addColorStop(0, "rgba(255,70,40," + (0.25 + 0.2 * pulse).toFixed(3) + ")");
    halo.addColorStop(1, "rgba(255,70,40,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0a0507";
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,120,80,0.55)"; ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2); ctx.stroke();
    // Rope collar.
    ctx.strokeStyle = "#8a6a4a"; ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath(); ctx.ellipse(0, -r * 0.72, r * 0.4, r * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
    // Fuse.
    ctx.strokeStyle = "#c9a36b"; ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.quadraticCurveTo(r * 0.25, -r * 1.15, r * 0.1, -r * 1.35); ctx.stroke();
    // Sparks at the tip.
    var sx = r * 0.1, sy = -r * 1.38;
    ctx.fillStyle = "#fff6c8";
    ctx.beginPath(); ctx.arc(sx, sy, r * (0.14 + 0.06 * pulse), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffd36a"; ctx.lineWidth = Math.max(1, r * 0.04);
    for (var k = 0; k < 7; k++) {
      var a = k * 0.9 + t * 0.02, l = r * (0.22 + 0.2 * ((k * 37 + Math.floor(t / 60)) % 5) / 5);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); ctx.stroke();
    }
  }

  // The cut face of one half: flesh, the real skin colour as a rim, and seeds.
  function half(ctx, type, r, t) {
    var T = TYPES[type];
    if (type === "bomb") return;   // bombs don't get cut in half: they go off
    ctx.fillStyle = T.skin;
    outline(ctx, type, r); ctx.fill();
    ctx.fillStyle = T.flesh;
    outline(ctx, type, r * 0.84); ctx.fill();
    if (type === "persimmon") {
      ctx.strokeStyle = "rgba(255,230,170,0.8)"; ctx.lineWidth = Math.max(1, r * 0.05);
      for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); ctx.stroke(); }
    } else if (type === "peach") {
      ctx.fillStyle = "#e0506a";
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.4, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7a3b2a";
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.26, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    } else if (type === "bamboo") {
      ctx.fillStyle = "#f4f0d8";
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.17, r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    } else if (type === "lantern") {
      var g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.8);
      g.addColorStop(0, "#fffbe6"); g.addColorStop(1, "rgba(255,200,90,0.2)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.7, r * 0.84, 0, 0, Math.PI * 2); ctx.fill();
    } else if (type === "koban") {
      ctx.fillStyle = "#f7d36a";
      outline(ctx, "koban", r * 0.6); ctx.fill();
    }
  }

  // Two samurai silhouettes facing each other on the horizon (the menu).
  function samurai(ctx, x, y, s, facing) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s * facing, s);
    ctx.fillStyle = INK;
    ctx.beginPath();
    // Hakama (wide trousers) and kimono body.
    ctx.moveTo(-18, 0); ctx.lineTo(-11, -34); ctx.lineTo(-9, -60); ctx.lineTo(9, -60); ctx.lineTo(12, -34); ctx.lineTo(20, 0);
    ctx.closePath(); ctx.fill();
    // Shoulders (kataginu) and arms reaching to the hilt.
    ctx.beginPath(); ctx.moveTo(-16, -58); ctx.lineTo(16, -58); ctx.lineTo(12, -50); ctx.lineTo(-12, -50); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -54); ctx.lineTo(20, -44); ctx.lineTo(18, -40); ctx.lineTo(4, -48); ctx.closePath(); ctx.fill();
    // Head and topknot.
    ctx.beginPath(); ctx.arc(1, -68, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-2, -77, 3, 5, -0.5, 0, Math.PI * 2); ctx.fill();
    // The katana, low and forward.
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(16, -42); ctx.quadraticCurveTo(38, -36, 58, -18); ctx.stroke();
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(12, -45); ctx.lineTo(19, -41); ctx.stroke();
    // Scabbard at the hip.
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-6, -40); ctx.lineTo(-30, -26); ctx.stroke();
    ctx.restore();
  }

  return { sky: sky, sunGeom: sunGeom, horizonY: horizonY, mountains: mountains, grass: grass, target: target, half: half, outline: outline, samurai: samurai, TYPES: TYPES, INK: INK };
})();
