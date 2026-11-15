/* =====================================================================
   Fish-A-Fish, the drawing: a summer pond at first light, and everything
   on it. The sky, far shore and water are painted once into a cached
   layer; mist, shimmer, bobbers, ripples, fish and reeds are live.
   No images: everything is canvas paths.

   FishArt.scene(ctx, W, H, t, fx) -> waterY   (the horizon line)
   FishArt.bobber(ctx, x, y, r, dip, tilt, t)  dip 0..1 pulls it under
   FishArt.ring(ctx, x, y, r, alpha)           a ripple, in perspective
   FishArt.shadowFish(ctx, x, y, s, t)         the shape under the water
   FishArt.leapFish(ctx, x, y, s, species, ang)
   FishArt.junk(ctx, x, y, s, t)               an old boot
   FishArt.tag(ctx, x, y, s, label, on)        the key tag for a spot
   FishArt.boat(ctx, x, y, s)                  menu: fisherman at dawn
   FishArt.SPECIES                             { name, points, colors... }
   ===================================================================== */
window.FishArt = (function () {
  "use strict";
  var INK = "#17262c";

  var SPECIES = {
    bluegill: { name: "Bluegill", points: 1, body: "#5b8fa8", belly: "#cfe3d8", fin: "#3c6478" },
    perch: { name: "Perch", points: 2, body: "#7a9a4e", belly: "#e8e3b0", fin: "#c8742c" },
    koi: { name: "Koi", points: 3, body: "#e8e4da", belly: "#f6f3ea", fin: "#d84f30", patch: "#d84f30" },
    golden: { name: "Golden carp", points: 5, body: "#e8b33a", belly: "#f8e39a", fin: "#c07818", shiny: true },
  };

  // ---- the pond ---------------------------------------------------------------
  var cache = { key: "", canvas: null };
  function waterLine(H) { return H * 0.34; }
  function paintStill(g, W, H) {
    var wy = waterLine(H);
    // Dawn sky: pale blue high up, then rose, then gold at the horizon.
    var sky = g.createLinearGradient(0, 0, 0, wy);
    sky.addColorStop(0, "#a9c3d6");
    sky.addColorStop(0.45, "#e3bfc0");
    sky.addColorStop(0.8, "#f6cfa0");
    sky.addColorStop(1, "#fbe3b4");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, wy);
    // A low, hazy sun.
    var sx = W * 0.68, sy = wy * 0.78, sr = Math.min(W, H) * 0.09;
    var halo = g.createRadialGradient(sx, sy, 1, sx, sy, sr * 4);
    halo.addColorStop(0, "rgba(255,245,214,0.9)");
    halo.addColorStop(0.35, "rgba(255,232,180,0.35)");
    halo.addColorStop(1, "rgba(255,232,180,0)");
    g.fillStyle = halo;
    g.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
    g.fillStyle = "#fff6da";
    g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
    // The far shore: two soft tree lines.
    function shore(base, amp, seed, color) {
      var rnd = seed;
      function r() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, wy);
      var x = 0;
      g.lineTo(0, base - amp * r());
      while (x < W) {
        var w = W * (0.03 + r() * 0.05), h = base - amp * (0.3 + r() * 0.7);
        g.quadraticCurveTo(x + w * 0.5, h - amp * 0.4, x + w, h);
        x += w;
      }
      g.lineTo(W, wy);
      g.closePath(); g.fill();
    }
    shore(wy * 0.88, wy * 0.16, 13, "rgba(122,144,150,0.55)");
    shore(wy * 0.96, wy * 0.12, 47, "rgba(64,96,100,0.75)");
    // The water: the sky upside down, deepened.
    var wg = g.createLinearGradient(0, wy, 0, H);
    wg.addColorStop(0, "#f0d5a6");
    wg.addColorStop(0.12, "#c9b092");
    wg.addColorStop(0.35, "#5c7a78");
    wg.addColorStop(0.75, "#2c4a52");
    wg.addColorStop(1, "#1b333c");
    g.fillStyle = wg;
    g.fillRect(0, wy, W, H - wy);
    // The sun's reflection: a broken column of light.
    g.fillStyle = "rgba(255,240,200,0.28)";
    var rw = sr * 2.2;
    for (var k = 0; k < 14; k++) {
      var yy = wy + (H - wy) * (0.02 + k * 0.05), ww = rw * (1 - k * 0.05) * (0.5 + ((k * 37) % 7) / 9);
      g.beginPath(); g.ellipse(sx, yy, ww, Math.max(1.5, (H - wy) * 0.006), 0, 0, Math.PI * 2); g.fill();
    }
    // Tree-line reflection hugging the far bank.
    g.fillStyle = "rgba(64,96,100,0.28)";
    g.fillRect(0, wy, W, (H - wy) * 0.07);
  }
  function scene(ctx, W, H, t, fx) {
    var key = W + "x" + H;
    if (cache.key !== key) {
      if (!cache.canvas) cache.canvas = document.createElement("canvas");
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cache.canvas.width = Math.round(W * dpr);
      cache.canvas.height = Math.round(H * dpr);
      var g = cache.canvas.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintStill(g, W, H);
      cache.key = key;
    }
    ctx.drawImage(cache.canvas, 0, 0, W, H);
    var wy = waterLine(H);
    pondSign(ctx, W, H, wy, t, fx);
    // Morning mist drifting over the far water.
    ctx.fillStyle = "rgba(240,244,240,0.16)";
    var drift = fx ? t * 0.006 : 0;
    [[0.36, 0.02, 0.55], [0.4, 0.014, 0.75], [0.45, 0.024, 0.5]].forEach(function (m, i) {
      var y = H * m[0], h = H * m[1], w = W * m[2];
      var x = ((i * 0.41 + drift * (0.5 + i * 0.25) / W) % 1.5 - 0.25) * W;
      ctx.beginPath(); ctx.ellipse(x + w / 2, y, w / 2, h, 0, 0, Math.PI * 2); ctx.fill();
    });
    // Faint shimmer lines sliding on the near water (with Visual FX off they're
    // there too, lying still)
    var ts = fx ? t : 0;
    ctx.strokeStyle = "rgba(255,244,214,0.08)";
    ctx.lineWidth = 1.5;
    for (var k = 0; k < 5; k++) {
      var y = wy + (H - wy) * (0.25 + k * 0.16) + Math.sin(ts * 0.0011 + k * 2.2) * 3;
      var x0 = W * ((k * 0.23 + ts * 0.00002 * (k + 1)) % 1);
      ctx.beginPath(); ctx.moveTo(x0 - W * 0.09, y); ctx.lineTo(x0 + W * 0.09, y); ctx.stroke();
    }
    return wy;
  }

  // ---- the pond's name board ----------------------------------------------------
  // A painted wooden board on two posts, planted at the water's edge on the far
  // bank, left of the sun (and clear of the menu's rowboat, out on the right):
  // SAM LU'S POND in the game's own letters, in the tags' cream and ink. Its
  // reflection lies faint in the water under it, and with Visual FX on it
  // wavers a little as the water moves; off, it lies still. Painted live (not
  // into the cached pond) so the letters come in the right face once it loads.
  var SIGN = "SAM LU'S POND", signBox = null;
  function signLayout(ctx, W, H, wy) {
    var size = Math.round(Math.max(11, Math.min(16, H * 0.018, W * 0.034)));
    ctx.font = "700 " + size + "px Fredoka, system-ui, sans-serif";
    var track = size * 0.06, tw = track * (SIGN.length - 1);
    for (var i = 0; i < SIGN.length; i++) tw += ctx.measureText(SIGN[i]).width;   // (a letter at a time, as it's painted)
    var w = Math.round(tw + size * 1.4), h = Math.round(size * 1.6), post = Math.round(size * 0.85);
    var x = Math.round(Math.max(12, W * 0.2 - w / 2)), y = Math.round(wy - post - h);
    return { size: size, track: track, tw: tw, x: x, y: y, w: w, h: h, post: post, feet: wy };
  }
  function board(ctx, s, wood, edge) {
    var r = Math.max(2, s.size * 0.22);
    ctx.beginPath();
    ctx.moveTo(s.x + r, s.y);
    ctx.arcTo(s.x + s.w, s.y, s.x + s.w, s.y + s.h, r);
    ctx.arcTo(s.x + s.w, s.y + s.h, s.x, s.y + s.h, r);
    ctx.arcTo(s.x, s.y + s.h, s.x, s.y, r);
    ctx.arcTo(s.x, s.y, s.x + s.w, s.y, r);
    ctx.closePath();
    ctx.fillStyle = wood; ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, s.size * 0.09); ctx.stroke(); }
  }
  function posts(ctx, s, color) {
    var pw = Math.max(2, Math.round(s.size * 0.24));
    ctx.fillStyle = color;
    [0.2, 0.8].forEach(function (u) { ctx.fillRect(Math.round(s.x + s.w * u - pw / 2), s.y + s.h - 1, pw, s.feet - (s.y + s.h) + 1); });
  }
  function pondSign(ctx, W, H, wy, t, fx) {
    var s = signLayout(ctx, W, H, wy);
    // the reflection: the posts and board upside down under the feet, in a few
    // strips that sway apart with the water (FX on) or lie straight (off)
    var SQ = 0.7, depth = (s.post + s.h) * SQ, strips = 4;
    for (var k = 0; k < strips; k++) {
      var y0 = wy + (k / strips) * depth, y1 = wy + ((k + 1) / strips) * depth;
      var dx = fx ? Math.sin(t * 0.0016 + k * 1.7) * (0.6 + k * 0.45) : 0;
      ctx.save();
      ctx.beginPath(); ctx.rect(s.x - 8, y0, s.w + 16, y1 - y0 + 0.5); ctx.clip();
      // (mirrored in the water line, and shortened: y goes to wy + SQ * (wy - y))
      ctx.translate(dx, wy); ctx.scale(1, -SQ); ctx.translate(0, -wy);
      ctx.globalAlpha = 0.2 * (1 - k / (strips + 1));
      posts(ctx, s, "#17262c");
      board(ctx, s, "#17262c", null);
      ctx.restore();
    }
    // the posts, then the board on them, and tufts of the bank's grass at their feet
    posts(ctx, s, "#5b4532");
    ctx.fillStyle = "#3d5a5c";
    [0.2, 0.8].forEach(function (u, j) {
      var fx0 = s.x + s.w * u, bl = Math.max(4, s.size * 0.42);
      for (var b = -2; b <= 2; b++) {
        var lean = (b + (j ? 0.4 : -0.4)) * bl * 0.32;
        ctx.beginPath();
        ctx.moveTo(fx0 + b * bl * 0.28 - 1.2, wy + 0.5);
        ctx.quadraticCurveTo(fx0 + b * bl * 0.28 + lean * 0.4, wy - bl * 0.6, fx0 + b * bl * 0.28 + lean, wy - bl * (1 - Math.abs(b) * 0.18));
        ctx.lineTo(fx0 + b * bl * 0.28 + 1.2, wy + 0.5);
        ctx.closePath(); ctx.fill();
      }
    });
    ctx.save();
    var wood = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    wood.addColorStop(0, "#e6cd9c"); wood.addColorStop(1, "#cfae79");
    board(ctx, s, wood, "rgba(74,52,32,0.9)");
    // weathered grain, and the light of the low sun along its top edge
    ctx.strokeStyle = "rgba(110,76,44,0.3)"; ctx.lineWidth = 1;
    [0.3, 0.72].forEach(function (v) { ctx.beginPath(); ctx.moveTo(s.x + s.size * 0.4, s.y + s.h * v); ctx.lineTo(s.x + s.w - s.size * 0.4, s.y + s.h * v); ctx.stroke(); });
    ctx.fillStyle = "rgba(255,246,218,0.55)";
    ctx.fillRect(s.x + s.size * 0.3, s.y + Math.max(1, s.size * 0.09) + 0.5, s.w - s.size * 0.6, Math.max(1, s.size * 0.08));
    // the name, painted in the pond's ink
    ctx.fillStyle = "#24363c";
    ctx.font = "700 " + s.size + "px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    var x = s.x + (s.w - s.tw) / 2;
    for (var i = 0; i < SIGN.length; i++) { ctx.fillText(SIGN[i], x, s.y + s.h / 2 + s.size * 0.05); x += ctx.measureText(SIGN[i]).width + s.track; }
    ctx.restore();
    signBox = { text: SIGN, size: s.size, x: s.x, y: s.y, w: s.w, h: s.h + s.post, board: { x: s.x, y: s.y, w: s.w, h: s.h }, waterY: wy };
  }

  // ---- reeds in the near corners ------------------------------------------------
  var reeds = null, reedsFor = "";
  function foreground(ctx, W, H, t, fx) {
    if (reedsFor !== W + "x" + H) {
      reedsFor = W + "x" + H;
      reeds = [];
      var rnd = 9;
      function r() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
      for (var i = 0; i < 14; i++) {
        var left = i < 7;
        reeds.push({ x: (left ? 0.01 + r() * 0.09 : 0.9 + r() * 0.09) * W, h: H * (0.12 + r() * 0.14), lean: (r() - 0.5) * 0.5, phase: r() * 6.28, cat: r() < 0.55 });
      }
    }
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineCap = "round";
    reeds.forEach(function (b) {
      var sway = fx ? Math.sin(t * 0.0012 + b.phase) * 0.1 : 0;
      var tipX = b.x + (b.lean + sway) * b.h, tipY = H - b.h;
      ctx.lineWidth = Math.max(2, H * 0.005);
      ctx.beginPath();
      ctx.moveTo(b.x, H + 4);
      ctx.quadraticCurveTo(b.x + (b.lean + sway) * b.h * 0.3, H - b.h * 0.55, tipX, tipY);
      ctx.stroke();
      if (b.cat) {   // the cattail head
        ctx.save();
        ctx.translate(tipX, tipY);
        ctx.rotate((b.lean + sway) * 0.6);
        ctx.beginPath(); ctx.ellipse(0, -b.h * 0.05, Math.max(2.5, b.h * 0.03), b.h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    });
  }

  // ---- things on the water ---------------------------------------------------------
  function ring(ctx, x, y, r, alpha) {
    ctx.strokeStyle = "rgba(255,244,220," + alpha.toFixed(3) + ")";
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // dip 0 floats, 1 fully under; tilt rocks it sideways (junk nibbling).
  function bobber(ctx, x, y, r, dip, tilt, t) {
    var bob = Math.sin(t * 0.0021 + x) * r * 0.08;
    var cy = y + bob + dip * r * 2.6;
    ctx.save();
    ctx.translate(x, cy);
    ctx.rotate(tilt || 0);
    // Below the waterline the bobber shows as a dim shape.
    ctx.beginPath();
    ctx.rect(-r * 2, -r * 2.4 - Math.max(0, bob), r * 4, r * 2.4);   // above-water window
    ctx.clip();
    ctx.fillStyle = "#e8574a";
    ctx.beginPath(); ctx.arc(0, -r * 0.5, r, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#f4efe2";
    ctx.beginPath(); ctx.arc(0, -r * 0.5, r, 0, Math.PI); ctx.fill();
    ctx.fillStyle = "#c8342a";
    ctx.fillRect(-r * 0.12, -r * 1.9, r * 0.24, r * 0.55);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.85, r * 0.18, r * 0.28, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (dip > 0.05) ring(ctx, x, y, r * (1.4 + dip), 0.5);
  }
  function shadowFish(ctx, x, y, s, t) {
    var wag = Math.sin(t * 0.012);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(16,34,40,0.42)";
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.34, wag * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.85, 0);
    ctx.lineTo(-s * 1.3, -s * 0.3 * (0.6 + wag * 0.4));
    ctx.lineTo(-s * 1.3, s * 0.3 * (0.6 - wag * 0.4));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function leapFish(ctx, x, y, s, species, ang) {
    var S = SPECIES[species] || SPECIES.bluegill;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang || 0);
    // Tail, body, belly, an eye: a plump cartoon fish.
    ctx.fillStyle = S.fin;
    ctx.beginPath();
    ctx.moveTo(-s * 0.75, 0);
    ctx.quadraticCurveTo(-s * 1.35, -s * 0.55, -s * 1.2, 0);
    ctx.quadraticCurveTo(-s * 1.35, s * 0.55, -s * 0.75, 0);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.32); ctx.quadraticCurveTo(s * 0.05, -s * 0.75, s * 0.35, -s * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = S.body;
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = S.belly;
    ctx.beginPath(); ctx.ellipse(s * 0.05, s * 0.16, s * 0.8, s * 0.3, 0, 0, Math.PI); ctx.fill();
    if (S.patch) {
      ctx.fillStyle = S.patch;
      ctx.beginPath(); ctx.ellipse(-s * 0.25, -s * 0.15, s * 0.32, s * 0.22, 0.3, 0, Math.PI * 2); ctx.fill();
    }
    if (S.shiny) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.25, s * 0.5, s * 0.1, -0.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#10222a";
    ctx.beginPath(); ctx.arc(s * 0.62, -s * 0.12, s * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.arc(s * 0.64, -s * 0.15, s * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function junk(ctx, x, y, s, t) {
    // A sodden old boot, sole up, barely breaking the surface.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 0.004) * 0.12);
    ctx.fillStyle = "rgba(30,42,44,0.9)";
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, 0);
    ctx.quadraticCurveTo(-s * 0.75, -s * 0.55, -s * 0.3, -s * 0.55);
    ctx.lineTo(s * 0.05, -s * 0.5);
    ctx.quadraticCurveTo(s * 0.15, -s * 0.18, s * 0.55, -s * 0.15);
    ctx.quadraticCurveTo(s * 0.8, -s * 0.12, s * 0.75, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(60,74,72,0.9)";
    ctx.fillRect(-s * 0.62, -s * 0.6, s * 0.32, s * 0.12);
    ctx.restore();
    ring(ctx, x, y + s * 0.1, s * 1.1, 0.35);
  }
  // The key tag: a little wooden float tied under each spot.
  function tag(ctx, x, y, s, label, on, shift) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = shift ? "#ffd889" : on ? "#f4e6c4" : "rgba(238,222,188,0.82)";
    ctx.strokeStyle = "rgba(23,38,44,0.75)";
    ctx.lineWidth = Math.max(1, s * 0.07);
    var w = s * 1.5, h = s * 1.15, rr = s * 0.3;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + rr, -h / 2);
    ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, rr);
    ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, rr);
    ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, rr);
    ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, rr);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2c4048";
    ctx.font = "700 " + Math.round(s * 0.78) + "px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, s * 0.06);
    ctx.restore();
  }
  // The menu's fisherman: a rowboat, a figure, a rod, a line to a bobber.
  function boat(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-60, 0);
    ctx.quadraticCurveTo(-52, 16, -30, 18);
    ctx.lineTo(34, 18);
    ctx.quadraticCurveTo(58, 15, 66, -2);
    ctx.lineTo(52, 0);
    ctx.lineTo(-48, 0);
    ctx.closePath(); ctx.fill();
    // The figure: hunched, hat brim, knees up.
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.quadraticCurveTo(-16, -26, 0, -30);
    ctx.quadraticCurveTo(14, -27, 12, -8);
    ctx.lineTo(20, -6);
    ctx.lineTo(20, 0);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(2, -34, 12, 3.5, -0.08, 0, Math.PI * 2); ctx.fill();   // hat
    ctx.beginPath(); ctx.arc(2, -31, 6, Math.PI, 0); ctx.fill();
    // The rod and its line.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(8, -12); ctx.quadraticCurveTo(48, -46, 82, -52); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(23,38,44,0.6)";
    ctx.beginPath(); ctx.moveTo(82, -52); ctx.quadraticCurveTo(84, -26, 80, -4); ctx.stroke();
    ctx.restore();
  }

  return { scene: scene, foreground: foreground, waterLine: waterLine, bobber: bobber, ring: ring, shadowFish: shadowFish, leapFish: leapFish, junk: junk, tag: tag, boat: boat, SPECIES: SPECIES, INK: INK,
    signBox: function () { return signBox; } };
})();
