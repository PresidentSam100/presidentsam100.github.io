/* =====================================================================
   Dead End: everything drawn on the block, for the game and the editor.

   A fenced-in block seen from above after dark: asphalt, board fences
   for walls, tins and torches lying about, the pit behind its iron gate.
   The dead are green and goggle-eyed, arms out; you're the one in the
   yellow coat with the lantern. Nothing is a picture: it's all canvas
   paths, sized by the cell.

   `t` is the clock in ms; `fx` is Visual FX. With it off nothing sways,
   flickers or shakes: the same drawing, held still.
   ===================================================================== */
(function () {
  "use strict";

  var COAT = ["#d9523f", "#4f8fd6", "#e3b23c", "#8a5fc7"];        // Shambler, Lurker, Sniffer, Brute
  var NAMES = ["Shambler", "Lurker", "Sniffer", "Brute"];

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function floor(g, x, y, s, odd) {
    g.fillStyle = odd ? "#262a34" : "#22252e";
    g.fillRect(x, y, s, s);
  }
  // a length of board fence; `open` says which sides have no fence next to them (up, right, down, left)
  function wall(g, x, y, s, open) {
    g.fillStyle = "#3d2a1a"; g.fillRect(x, y, s, s);
    var in0 = Math.max(1, s * 0.06);
    g.fillStyle = "#6f4d2f";
    g.fillRect(x + (open[3] ? in0 : 0), y + (open[0] ? in0 : 0), s - (open[3] ? in0 : 0) - (open[1] ? in0 : 0), s - (open[0] ? in0 : 0) - (open[2] ? in0 * 2 : 0));
    g.fillStyle = "rgba(255, 214, 150, 0.16)";
    if (open[0]) g.fillRect(x, y + in0, s, Math.max(1, s * 0.09));
    g.fillStyle = "rgba(0, 0, 0, 0.28)";
    g.fillRect(x + s * 0.48, y, Math.max(1, s * 0.05), s);                    // the gap between two boards
    g.fillStyle = "#2a1c10";
    var n = Math.max(1, s * 0.05);
    g.fillRect(x + s * 0.2, y + s * 0.22, n, n); g.fillRect(x + s * 0.74, y + s * 0.7, n, n);       // nails
  }
  function gate(g, x, y, s) {
    g.fillStyle = "#15171d"; g.fillRect(x, y, s, s);
    g.strokeStyle = "#8c939e"; g.lineWidth = Math.max(1.5, s * 0.09); g.lineCap = "round";
    for (var k = 1; k <= 3; k++) { g.beginPath(); g.moveTo(x + s * k / 4, y + s * 0.12); g.lineTo(x + s * k / 4, y + s * 0.88); g.stroke(); }
    g.lineWidth = Math.max(1, s * 0.07);
    g.beginPath(); g.moveTo(x + s * 0.08, y + s * 0.3); g.lineTo(x + s * 0.92, y + s * 0.3); g.stroke();
  }
  function tin(g, x, y, s) {
    var w = s * 0.24, h = s * 0.3, cx = x + s / 2, cy = y + s / 2;
    g.fillStyle = "#c9ced6"; rr(g, cx - w / 2, cy - h / 2, w, h, w * 0.22); g.fill();
    g.fillStyle = "#d9523f"; g.fillRect(cx - w / 2, cy - h * 0.16, w, h * 0.36);
    g.fillStyle = "rgba(255, 255, 255, 0.55)"; g.fillRect(cx - w * 0.3, cy - h * 0.42, w * 0.18, h * 0.84);
  }
  function torch(g, x, y, s, t, fx) {
    var cx = x + s / 2, cy = y + s / 2, f = fx ? Math.sin(t / 90 + x) * 0.06 + Math.sin(t / 37 + y) * 0.04 : 0;
    g.fillStyle = "rgba(255, 154, 60, 0.22)"; g.beginPath(); g.arc(cx, cy, s * (0.46 + f), 0, 7); g.fill();
    g.strokeStyle = "#7a5433"; g.lineWidth = Math.max(2, s * 0.1); g.lineCap = "round";
    g.beginPath(); g.moveTo(cx, cy + s * 0.3); g.lineTo(cx, cy); g.stroke();
    g.fillStyle = "#ff8a2a"; g.beginPath();
    g.moveTo(cx, cy - s * (0.36 + f)); g.quadraticCurveTo(cx + s * 0.22, cy - s * 0.04, cx, cy + s * 0.06); g.quadraticCurveTo(cx - s * 0.22, cy - s * 0.04, cx, cy - s * (0.36 + f)); g.fill();
    g.fillStyle = "#ffe07a"; g.beginPath();
    g.moveTo(cx, cy - s * (0.2 + f * 0.6)); g.quadraticCurveTo(cx + s * 0.1, cy - s * 0.02, cx, cy + s * 0.03); g.quadraticCurveTo(cx - s * 0.1, cy - s * 0.02, cx, cy - s * (0.2 + f * 0.6)); g.fill();
  }
  function plankShape(g, cx, cy, len, wid, ang, crack) {
    g.save(); g.translate(cx, cy); g.rotate(ang);
    g.fillStyle = "#9c7448"; rr(g, -len / 2, -wid / 2, len, wid, wid * 0.2); g.fill();
    g.strokeStyle = "#4a3320"; g.lineWidth = Math.max(1, wid * 0.14); g.stroke();
    g.fillStyle = "#2a1c10"; var n = Math.max(1, wid * 0.22);
    g.fillRect(-len * 0.4, -n / 2, n, n); g.fillRect(len * 0.4 - n, -n / 2, n, n);
    if (crack > 0) {                                     // splitting as it gives way
      g.strokeStyle = "#2a1c10"; g.lineWidth = Math.max(1, wid * 0.12); g.beginPath();
      g.moveTo(-len * 0.12, -wid / 2); g.lineTo(len * 0.02, 0); g.lineTo(-len * 0.06, wid / 2);
      if (crack > 1) { g.moveTo(len * 0.2, -wid / 2); g.lineTo(len * 0.12, wid * 0.1); g.lineTo(len * 0.24, wid / 2); }
      g.stroke();
    }
    g.restore();
  }
  function plank(g, x, y, s) { plankShape(g, x + s / 2, y + s / 2, s * 0.7, s * 0.2, -0.5, 0); }
  // a barricade: two planks nailed across; `frac` is what's left of it (1 new, 0 gone), `hit` how many are hammering
  function barricade(g, x, y, s, frac, hit, t, fx) {
    var j = hit && fx ? Math.sin(t / 28) * s * 0.035 : 0, crack = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
    plankShape(g, x + s / 2 + j, y + s / 2, s * 1.06, s * 0.22, 0.42, crack);
    plankShape(g, x + s / 2 - j, y + s / 2, s * 1.06, s * 0.22, -0.42, crack);
  }

  // you: a yellow coat, a face, and a lantern held out the way you're heading
  function player(g, cx, cy, s, face, t, moving, fx) {
    var bob = moving && fx ? Math.sin(t / 70) * s * 0.03 : 0, dx = [0, 1, 0, -1][face] || 0, dy = [-1, 0, 1, 0][face] || 0;
    g.fillStyle = "rgba(0, 0, 0, 0.35)"; g.beginPath(); g.ellipse(cx, cy + s * 0.3, s * 0.26, s * 0.1, 0, 0, 7); g.fill();
    g.fillStyle = "#f2c230"; rr(g, cx - s * 0.24, cy - s * 0.08 + bob, s * 0.48, s * 0.4, s * 0.16); g.fill();
    g.fillStyle = "#c9972a"; g.fillRect(cx - s * 0.03, cy - s * 0.02 + bob, s * 0.06, s * 0.3);
    g.fillStyle = "#f4d3b0"; g.beginPath(); g.arc(cx, cy - s * 0.17 + bob, s * 0.17, 0, 7); g.fill();
    g.fillStyle = "#e0a82a"; g.beginPath(); g.arc(cx, cy - s * 0.2 + bob, s * 0.18, Math.PI, 0); g.fill();       // the hood
    g.fillStyle = "#23252c";
    g.beginPath(); g.arc(cx - s * 0.06 + dx * s * 0.04, cy - s * 0.16 + bob + dy * s * 0.03, s * 0.025, 0, 7); g.arc(cx + s * 0.06 + dx * s * 0.04, cy - s * 0.16 + bob + dy * s * 0.03, s * 0.025, 0, 7); g.fill();
    var lx = cx + dx * s * 0.3 + (dy ? s * 0.26 : 0), ly = cy + dy * s * 0.26 + s * 0.06 + bob;
    g.fillStyle = "#ffe9a0"; g.beginPath(); g.arc(lx, ly, s * 0.08, 0, 7); g.fill();
    g.strokeStyle = "#5a4a2a"; g.lineWidth = Math.max(1, s * 0.03); g.stroke();
  }
  // one of the dead. state: roam | scared | down | den
  function dead(g, cx, cy, s, kind, state, dir, t, o) {
    o = o || {};
    var fx = o.fx, big = kind === 3 ? 1.16 : 1, w = s * 0.5 * big, h = s * 0.5 * big;
    var sway = fx && state !== "down" ? Math.sin(t / (kind === 3 ? 260 : 170) + kind * 2) : 0;
    var dx = [0, 1, 0, -1][dir] || 0, dy = [-1, 0, 1, 0][dir] || 0;
    if (state === "down") {                              // knocked flat, crawling home: a puddle with eyes
      g.fillStyle = "rgba(140, 196, 99, 0.75)"; g.beginPath(); g.ellipse(cx, cy + s * 0.08, s * 0.3, s * 0.16, 0, 0, 7); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(cx - s * 0.08, cy + s * 0.04, s * 0.07, 0, 7); g.arc(cx + s * 0.09, cy + s * 0.06, s * 0.05, 0, 7); g.fill();
      g.fillStyle = "#16181d"; g.beginPath(); g.arc(cx - s * 0.08 + dx * s * 0.02, cy + s * 0.04 + dy * s * 0.02, s * 0.03, 0, 7); g.arc(cx + s * 0.09 + dx * s * 0.02, cy + s * 0.06 + dy * s * 0.02, s * 0.022, 0, 7); g.fill();
      return;
    }
    var scared = state === "scared", shake = scared && fx ? Math.sin(t / 22 + kind) * s * 0.025 : 0;
    var skin = scared ? "#bcd6e6" : "#8cc463", dark = scared ? "#7f9fb3" : "#5d8f3f";
    cx += shake; cy += sway * s * 0.02;
    g.fillStyle = "rgba(0, 0, 0, 0.35)"; g.beginPath(); g.ellipse(cx, cy + s * 0.32 * big, w * 0.52, s * 0.1, 0, 0, 7); g.fill();
    // arms out in front, one up one down as it shambles (hammering: both pumping)
    g.strokeStyle = skin; g.lineWidth = Math.max(2, s * 0.11 * big); g.lineCap = "round";
    var reach = s * 0.3 * big, swing = (o.pound && fx ? Math.sin(t / 60) : sway) * s * 0.07;
    var px = dy ? s * 0.2 * big : 0, py = dx ? s * 0.12 * big : 0;
    g.beginPath();
    g.moveTo(cx - px, cy + s * 0.04 - py); g.lineTo(cx - px + (dx || 0) * reach + (dy ? 0 : 0), cy + s * 0.04 - py + dy * reach + swing);
    g.moveTo(cx + px, cy + s * 0.04 + py); g.lineTo(cx + px + (dx || 0) * reach, cy + s * 0.04 + py + dy * reach - swing);
    g.stroke();
    g.fillStyle = scared ? "#8fa9bb" : COAT[kind]; rr(g, cx - w / 2, cy - h * 0.1, w, h * 0.78, w * 0.26); g.fill();           // the shirt
    g.fillStyle = "rgba(0, 0, 0, 0.22)"; g.beginPath(); g.moveTo(cx - w * 0.5, cy + h * 0.68); g.lineTo(cx - w * 0.2, cy + h * 0.5); g.lineTo(cx, cy + h * 0.68); g.lineTo(cx + w * 0.25, cy + h * 0.5); g.lineTo(cx + w * 0.5, cy + h * 0.68); g.fill();    // torn hem
    g.fillStyle = skin; g.beginPath(); g.arc(cx, cy - h * 0.3, w * 0.42, 0, 7); g.fill();
    g.strokeStyle = dark; g.lineWidth = Math.max(1, s * 0.03); g.stroke();
    if (kind === 2) { g.fillStyle = dark; g.beginPath(); g.ellipse(cx + dx * w * 0.2, cy - h * 0.2 + dy * w * 0.1, w * 0.13, w * 0.1, 0, 0, 7); g.fill(); }          // the Sniffer's nose
    if (kind === 1) { g.fillStyle = "#2c3a55"; g.beginPath(); g.arc(cx, cy - h * 0.38, w * 0.44, Math.PI, 0); g.fill(); }                                    // the Lurker's cap
    // one big eye, one small
    var ex = dx * w * 0.08, ey = dy * w * 0.06;
    g.fillStyle = "#fffbe8"; g.beginPath(); g.arc(cx - w * 0.17 + ex, cy - h * 0.34 + ey, w * 0.15, 0, 7); g.arc(cx + w * 0.19 + ex, cy - h * 0.3 + ey, w * 0.1, 0, 7); g.fill();
    g.fillStyle = "#16181d"; g.beginPath();
    if (scared) { g.rect(cx - w * 0.24 + ex, cy - h * 0.36 + ey, w * 0.14, w * 0.04); g.rect(cx + w * 0.13 + ex, cy - h * 0.32 + ey, w * 0.12, w * 0.04); }
    else { g.arc(cx - w * 0.17 + ex * 2, cy - h * 0.34 + ey * 2, w * 0.06, 0, 7); g.arc(cx + w * 0.19 + ex * 2, cy - h * 0.3 + ey * 2, w * 0.045, 0, 7); }
    g.fill();
    g.strokeStyle = "#3a2a1a"; g.lineWidth = Math.max(1, s * 0.03); g.beginPath();                    // a crooked mouth
    g.moveTo(cx - w * 0.14, cy - h * 0.1); g.lineTo(cx - w * 0.02, cy - h * (scared ? 0.14 : 0.06)); g.lineTo(cx + w * 0.14, cy - h * 0.1); g.stroke();
  }
  // their eyes show in the dark: drawn over the night, so you can see them coming
  function eyes(g, cx, cy, s, kind, dir) {
    var big = kind === 3 ? 1.16 : 1, w = s * 0.5 * big, h = s * 0.5 * big, dx = [0, 1, 0, -1][dir] || 0, dy = [-1, 0, 1, 0][dir] || 0;
    g.fillStyle = "rgba(190, 255, 120, 0.85)"; g.beginPath();
    g.arc(cx - w * 0.17 + dx * w * 0.08, cy - h * 0.34 + dy * w * 0.06, w * 0.09, 0, 7); g.arc(cx + w * 0.19 + dx * w * 0.08, cy - h * 0.3 + dy * w * 0.06, w * 0.06, 0, 7); g.fill();
  }
  // the night, with a pool of light round (cx, cy)
  function night(g, W, H, cx, cy, r, lit) {
    var grad = g.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
    grad.addColorStop(0, lit ? "rgba(255, 150, 50, 0.10)" : "rgba(10, 10, 18, 0)");
    grad.addColorStop(0.55, lit ? "rgba(60, 26, 6, 0.12)" : "rgba(10, 10, 18, 0.18)");
    grad.addColorStop(1, lit ? "rgba(14, 8, 10, 0.4)" : "rgba(8, 8, 16, 0.54)");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  }

  // a bare maze from its glyphs (the editor, and the game's backdrop)
  function tile(g, ch, x, y, s, t, fx, open) {
    if (ch === "#") { wall(g, x, y, s, open || [1, 1, 1, 1]); return; }
    floor(g, x, y, s, ((x / s + y / s) | 0) % 2);
    if (ch === "=") gate(g, x, y, s);
    else if (ch === ".") tin(g, x, y, s);
    else if (ch === "o") torch(g, x, y, s, t || 0, fx);
    else if (ch === "+") plank(g, x, y, s);
    else if (ch === "P") player(g, x + s / 2, y + s / 2, s, 1, 0, false, false);
    else if (ch === "Z") dead(g, x + s / 2, y + s / 2, s, (open && open.kind) || 0, "roam", 2, 0, {});
  }

  window.DeadEndArt = {
    floor: floor, wall: wall, gate: gate, tin: tin, torch: torch, plank: plank, barricade: barricade,
    player: player, dead: dead, eyes: eyes, night: night, tile: tile, COAT: COAT, NAMES: NAMES
  };
})();
