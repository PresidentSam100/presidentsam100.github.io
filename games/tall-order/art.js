/* =====================================================================
   Tall Order — everything delicious is painted here.

   A tier is drawn as a real slice-through of cake: sponge with a baked
   crust line, filling stripes, a glossy frosting cap that overhangs and
   drips down the sides, and decorations perched on top. Six flavours
   cycle as the tower climbs. game.js animates; this file only paints.
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

  /* The six flavours. sponge: [top, bottom] of the cake gradient;
     fill: the jam/cream stripes; frost: the cap; deco: what sits on top. */
  var FLAVOURS = [
    { name: "strawberry shortcake", sponge: ["#f9ecd0", "#efd9ac"], crust: "#d9b97e", fill: "#f296b1",
      frost: ["#fff8f3", "#fbe9e4"], frostEdge: "#eecfd0", deco: "strawberry" },
    { name: "chocolate fudge", sponge: ["#8a5a33", "#63401f"], crust: "#4a2e14", fill: "#3d2513",
      frost: ["#6b4226", "#4a2c15"], frostEdge: "#33200e", deco: "chip", glossy: true },
    { name: "matcha cream", sponge: ["#cfe0ac", "#aec98a"], crust: "#8fae66", fill: "#fdf8ec",
      frost: ["#eef4dd", "#dcead2"], frostEdge: "#bcd3a4", deco: "whitechip" },
    { name: "blueberry lavender", sponge: ["#e3d9f2", "#c9bce4"], crust: "#a793cc", fill: "#7a68b5",
      frost: ["#fbf7ff", "#efe7fa"], frostEdge: "#d7c8ec", deco: "blueberry" },
    { name: "lemon curd", sponge: ["#fdf3c1", "#f5e08e"], crust: "#dcbd62", fill: "#f2c53d",
      frost: ["#fffdf4", "#fdf3d9"], frostEdge: "#ecd9a4", deco: "lemon" },
    { name: "red velvet", sponge: ["#b03a48", "#8a2434"], crust: "#6e1a27", fill: "#fdf6ea",
      frost: ["#fffaf2", "#f7ecdc"], frostEdge: "#e8d4bc", deco: "rosette" }
  ];

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

  // ---- decorations -------------------------------------------------------
  function strawberry(g, x, y, s) {
    // a halved strawberry, cut face out: white rim, red flesh, pale core
    g.fillStyle = "#e8425a";
    g.beginPath();
    g.moveTo(x, y - s);
    g.bezierCurveTo(x + s * 1.05, y - s * 0.9, x + s * 0.75, y + s * 0.35, x, y + s * 0.72);
    g.bezierCurveTo(x - s * 0.75, y + s * 0.35, x - s * 1.05, y - s * 0.9, x, y - s);
    g.fill();
    g.strokeStyle = "#fbe4e6"; g.lineWidth = s * 0.16; g.stroke();
    g.fillStyle = "#f8b7c0";
    g.beginPath();
    g.moveTo(x, y - s * 0.55);
    g.bezierCurveTo(x + s * 0.5, y - s * 0.45, x + s * 0.35, y + s * 0.15, x, y + s * 0.4);
    g.bezierCurveTo(x - s * 0.35, y + s * 0.15, x - s * 0.5, y - s * 0.45, x, y - s * 0.55);
    g.fill();
    g.fillStyle = "#fff3f4";
    g.fillRect(x - s * 0.06, y - s * 0.4, s * 0.12, s * 0.6);
    // leaves
    g.fillStyle = "#5da24f";
    g.beginPath(); g.ellipse(x - s * 0.3, y - s * 0.95, s * 0.32, s * 0.14, -0.5, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x + s * 0.3, y - s * 0.95, s * 0.32, s * 0.14, 0.5, 0, 7); g.fill();
  }
  function blueberry(g, x, y, s) {
    var gr = g.createRadialGradient(x - s * 0.3, y - s * 0.35, s * 0.1, x, y, s);
    gr.addColorStop(0, "#7d8fd6"); gr.addColorStop(0.55, "#4a5a9e"); gr.addColorStop(1, "#2c3763");
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    g.strokeStyle = "#1e2647"; g.lineWidth = 1;
    var k;
    g.beginPath();
    for (k = 0; k < 5; k++) {
      var a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
      g.moveTo(x + Math.cos(a) * s * 0.16, y - s * 0.62 + Math.sin(a) * s * 0.16);
    }
    g.arc(x, y - s * 0.62, s * 0.18, 0, 7); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.beginPath(); g.arc(x - s * 0.32, y - s * 0.32, s * 0.16, 0, 7); g.fill();
  }
  function chip(g, x, y, s, white) {
    g.fillStyle = white ? "#f6efe0" : "#3a2416";
    g.beginPath();
    g.moveTo(x, y - s);
    g.bezierCurveTo(x + s * 0.9, y - s * 0.4, x + s * 0.75, y + s * 0.5, x, y + s * 0.6);
    g.bezierCurveTo(x - s * 0.75, y + s * 0.5, x - s * 0.9, y - s * 0.4, x, y - s);
    g.fill();
    g.fillStyle = white ? "#fffdf6" : "rgba(255,235,210,0.5)";
    g.beginPath(); g.arc(x - s * 0.25, y - s * 0.25, s * 0.2, 0, 7); g.fill();
  }
  function lemon(g, x, y, s) {
    // a candied lemon wheel, half sunk into the frosting
    g.fillStyle = "#f7d84a";
    g.beginPath(); g.arc(x, y, s, Math.PI, 0); g.closePath(); g.fill();
    g.fillStyle = "#fdf0a8";
    g.beginPath(); g.arc(x, y, s * 0.78, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = "#eec83a"; g.lineWidth = Math.max(1, s * 0.1);
    for (var k = 1; k < 5; k++) {
      var a = Math.PI + (k / 5) * Math.PI;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * s * 0.75, y + Math.sin(a) * s * 0.75); g.stroke();
    }
    g.beginPath(); g.arc(x, y, s, Math.PI, 0); g.stroke();
  }
  function rosette(g, x, y, s) {
    // a piped buttercream swirl
    g.strokeStyle = "#f4a7b9"; g.lineWidth = s * 0.55; g.lineCap = "round";
    g.beginPath();
    for (var t = 0; t < Math.PI * 2 * 2.2; t += 0.25) {
      var r2 = s * (0.15 + 0.32 * t / (Math.PI * 2 * 2.2));
      var px = x + Math.cos(t + 2) * r2, py = y + Math.sin(t + 2) * r2 * 0.85;
      if (t === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = s * 0.18;
    g.beginPath(); g.arc(x - s * 0.1, y - s * 0.15, s * 0.28, 3.6, 5.6); g.stroke();
  }
  function cherry(g, x, y, s) {
    g.strokeStyle = "#7a4a26"; g.lineWidth = Math.max(1.5, s * 0.14); g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y - s * 0.5); g.quadraticCurveTo(x + s * 0.5, y - s * 1.8, x + s * 0.15, y - s * 2.2); g.stroke();
    var gr = g.createRadialGradient(x - s * 0.3, y - s * 0.35, s * 0.1, x, y, s);
    gr.addColorStop(0, "#f56a72"); gr.addColorStop(0.6, "#d92c3e"); gr.addColorStop(1, "#9e1626");
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.beginPath(); g.ellipse(x - s * 0.32, y - s * 0.35, s * 0.22, s * 0.14, -0.6, 0, 7); g.fill();
  }
  function candle(g, x, y, s, flame) {
    g.fillStyle = "#8fd0e8";
    rr(g, x - s * 0.16, y - s * 1.6, s * 0.32, s * 1.6, s * 0.1); g.fill();
    g.fillStyle = "#f4f9fc";
    g.fillRect(x - s * 0.16, y - s * 1.25, s * 0.32, s * 0.18);
    g.fillRect(x - s * 0.16, y - s * 0.7, s * 0.32, s * 0.18);
    g.strokeStyle = "#555"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y - s * 1.6); g.lineTo(x, y - s * 1.85); g.stroke();
    if (flame) {
      var gr = g.createRadialGradient(x, y - s * 2.05, 0, x, y - s * 2.05, s * 0.42);
      gr.addColorStop(0, "#fff3c0"); gr.addColorStop(0.55, "#f7b23c"); gr.addColorStop(1, "rgba(247,140,40,0)");
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(x, y - s * 2.05, s * 0.28, s * 0.42, 0, 0, 7); g.fill();
    }
  }
  function sprinkle(g, x, y, ang, s, col) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = col;
    rr(g, -s, -s * 0.32, s * 2, s * 0.64, s * 0.32); g.fill();
    g.restore();
  }
  var SPRINKLE_COLS = ["#f26d8d", "#f7b23c", "#7cc47f", "#6aa7e8", "#c78ae0", "#fdf6ea"];

  function drawDeco(g, kind, x, y, s, rng) {
    if (kind === "strawberry") strawberry(g, x, y - s * 0.4, s);
    else if (kind === "blueberry") blueberry(g, x, y - s * 0.5, s * 0.8);
    else if (kind === "chip") chip(g, x, y - s * 0.4, s * 0.75);
    else if (kind === "whitechip") chip(g, x, y - s * 0.4, s * 0.75, true);
    else if (kind === "lemon") lemon(g, x, y, s);
    else if (kind === "rosette") rosette(g, x, y - s * 0.45, s * 0.8);
  }

  /* ---- one tier of cake ---------------------------------------------------
     (x, y) is the top-left of the sponge box, w x h. The frosting cap is
     painted above y (its height is ~0.42h, overhanging 3px each side), so
     callers leave that much headroom. decos: [{u, s, a}] with u in 0..1. */
  function drawTier(g, x, y, w, h, fl, decos, opts) {
    opts = opts || {};
    var capH = h * 0.42, over = Math.min(4, w * 0.04);
    // sponge
    var sp = g.createLinearGradient(0, y, 0, y + h);
    sp.addColorStop(0, fl.sponge[0]); sp.addColorStop(1, fl.sponge[1]);
    g.fillStyle = sp;
    rr(g, x, y, w, h, 3); g.fill();
    // baked crust on the cut sides
    g.strokeStyle = fl.crust; g.lineWidth = 1.6;
    rr(g, x + 0.8, y + 0.8, w - 1.6, h - 1.6, 3); g.stroke();
    // filling stripes
    g.fillStyle = fl.fill;
    var fy1 = y + h * 0.36, fy2 = y + h * 0.68, fh = Math.max(2, h * 0.09);
    rr(g, x + 2, fy1, w - 4, fh, fh / 2); g.fill();
    rr(g, x + 2, fy2, w - 4, fh, fh / 2); g.fill();
    // frosting cap with drips
    var fr = g.createLinearGradient(0, y - capH, 0, y + capH * 0.5);
    fr.addColorStop(0, fl.frost[0]); fr.addColorStop(1, fl.frost[1]);
    g.fillStyle = fr;
    rr(g, x - over, y - capH, w + over * 2, capH + 2, Math.min(7, capH * 0.55)); g.fill();
    var rng = mulberry(opts.seed || 1), nd = Math.max(3, Math.floor(w / 26));
    for (var d = 0; d < nd; d++) {
      var du = (d + 0.5) / nd + (rng() - 0.5) * 0.5 / nd;
      var dx = x - over + du * (w + over * 2);
      var dl = capH * (0.5 + rng() * 0.9);
      var dw = Math.min(10, 5 + rng() * 4);
      g.beginPath();
      g.moveTo(dx - dw / 2, y + 1);
      g.lineTo(dx - dw / 2, y + dl - dw / 2);
      g.arc(dx, y + dl - dw / 2, dw / 2, Math.PI, 0, true);
      g.lineTo(dx + dw / 2, y + 1);
      g.closePath(); g.fill();
    }
    g.strokeStyle = fl.frostEdge; g.lineWidth = 1;
    rr(g, x - over + 0.5, y - capH + 0.5, w + over * 2 - 1, capH + 1.5, Math.min(7, capH * 0.55)); g.stroke();
    // gloss
    g.fillStyle = fl.glossy ? "rgba(255,240,220,0.28)" : "rgba(255,255,255,0.55)";
    g.beginPath();
    g.ellipse(x + w * 0.24, y - capH * 0.55, w * 0.16, capH * 0.2, -0.08, 0, 7);
    g.fill();
    // decorations on the cap
    if (decos) {
      for (var i = 0; i < decos.length; i++) {
        var dc = decos[i];
        drawDeco(g, fl.deco, x + dc.u * w, y - capH, dc.s);
      }
    }
  }

  // decoration layout for a fresh tier, deterministic per seed
  function decosFor(w, seed) {
    var rng = mulberry(seed), out = [];
    var nn = Math.max(2, Math.min(6, Math.floor(w / 56)));
    for (var i = 0; i < nn; i++) {
      out.push({ u: (i + 0.5) / nn + (rng() - 0.5) * 0.3 / nn, s: 10 + rng() * 5 });
    }
    return out;
  }

  /* ---- the kitchen -------------------------------------------------------
     Painted in world space each frame (it's cheap: flats and a few
     shapes). cam = world y at the top of the screen. */
  function drawKitchen(g, w, h, cam, tint) {
    // wallpaper: pastel with a soft vertical stripe
    g.fillStyle = "hsl(" + tint + ", 58%, 91%)";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "hsla(" + tint + ", 45%, 84%, 0.55)";
    var sw = 46, off = 0;
    for (var x = off; x < w; x += sw * 2) g.fillRect(x, 0, sw, h);
    // faint dots
    g.fillStyle = "hsla(" + tint + ", 40%, 74%, 0.35)";
    var dot = 90;
    var y0 = -((cam % dot) + dot) % dot;
    for (var yy = y0; yy < h; yy += dot) {
      for (var xx = 23; xx < w; xx += dot) {
        g.beginPath(); g.arc(xx, yy, 2.2, 0, 7); g.fill();
      }
    }
  }

  // the counter, cake stand and the big oven — world coords near y=0
  function drawCounter(g, w, h, worldToY, baseX, baseW) {
    var cy = worldToY(0);
    if (cy > h + 300) return;
    // counter top (extends past both edges so the zoomed-out view is covered)
    g.fillStyle = "#e8d7c3";
    g.fillRect(-w, cy + 62, w * 3, 16);
    g.fillStyle = "#d9c4ab";
    g.fillRect(-w, cy + 78, w * 3, Math.max(0, h - (cy + 78)));
    // cabinet lines
    g.strokeStyle = "rgba(122,94,60,0.25)"; g.lineWidth = 2;
    for (var x = -w + 40; x < w * 2; x += 170) {
      g.strokeRect(x, cy + 96, 130, Math.max(0, h - cy - 116));
    }
    // the cake stand
    var sx = baseX + baseW / 2;
    g.fillStyle = "#f4f9fc";
    g.beginPath();
    g.ellipse(sx, cy + 8, baseW * 0.62, 10, 0, 0, 7); g.fill();
    g.strokeStyle = "#c9d8e4"; g.lineWidth = 2;
    g.beginPath(); g.ellipse(sx, cy + 8, baseW * 0.62, 10, 0, 0, 7); g.stroke();
    g.fillStyle = "#dfe9f2";
    g.fillRect(sx - 12, cy + 12, 24, 34);
    g.beginPath(); g.ellipse(sx, cy + 50, 42, 9, 0, 0, 7); g.fill();
  }

  function drawOven(g, w, h, worldToY, glow) {
    var cy = worldToY(0);
    if (cy > h + 340 || w < 700) return;
    var ox = w - 218, oy = cy - 148;
    g.fillStyle = "#f3f6f8";
    rr(g, ox, oy, 178, 210, 10); g.fill();
    g.strokeStyle = "#c3ccd4"; g.lineWidth = 2; rr(g, ox, oy, 178, 210, 10); g.stroke();
    // dials
    g.fillStyle = "#aeb9c2";
    for (var d = 0; d < 3; d++) { g.beginPath(); g.arc(ox + 36 + d * 30, oy + 20, 8, 0, 7); g.fill(); }
    // window with warm light
    var wg = g.createLinearGradient(0, oy + 46, 0, oy + 150);
    wg.addColorStop(0, glow ? "#f9c96a" : "#7c6a54");
    wg.addColorStop(1, glow ? "#e8862c" : "#4a3e30");
    g.fillStyle = wg;
    rr(g, ox + 18, oy + 46, 142, 104, 8); g.fill();
    g.strokeStyle = "#8a949c"; g.lineWidth = 4; rr(g, ox + 18, oy + 46, 142, 104, 8); g.stroke();
    if (glow) {
      g.fillStyle = "rgba(122,74,32,0.85)";
      rr(g, ox + 34, oy + 106, 110, 12, 5); g.fill();   // the rack
      g.fillStyle = "#e8b464";
      for (var c = 0; c < 3; c++) { g.beginPath(); g.arc(ox + 56 + c * 34, oy + 100, 11, 0, 7); g.fill(); }
    }
    // handle
    g.fillStyle = "#aeb9c2";
    rr(g, ox + 14, oy + 162, 150, 9, 4); g.fill();
  }

  // pencil growth-chart mark on the wallpaper every ten tiers
  function drawMark(g, x, y, nTiers) {
    g.strokeStyle = "rgba(90,80,90,0.55)";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y); g.stroke();
    g.fillStyle = "rgba(90,80,90,0.7)";
    g.font = "600 15px Fredoka, sans-serif";
    g.textAlign = "left";
    g.fillText(nTiers + " tiers!", x + 32, y + 5);
  }

  window.CakeArt = {
    FLAVOURS: FLAVOURS,
    SPRINKLE_COLS: SPRINKLE_COLS,
    drawTier: drawTier,
    decosFor: decosFor,
    drawKitchen: drawKitchen,
    drawCounter: drawCounter,
    drawOven: drawOven,
    drawMark: drawMark,
    cherry: cherry,
    candle: candle,
    sprinkle: sprinkle,
    rr: rr,
    mulberry: mulberry
  };
})();
