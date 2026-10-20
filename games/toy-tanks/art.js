/* =====================================================================
   Toy Tanks: the drawing. A toy-box arena seen from a little to the south:
   a pale play mat, wooden blocks standing on it (a top and a front face),
   cork blocks speckled darker, holes sunk into the mat, the box's red rim
   round it all. The tanks are seen from above: treads, a hull in the
   tank's colour, a round turret and its barrel.

   Everything takes s, the size of a tile in CSS pixels; a point in tiles
   (x, y) is drawn at (x * s, y * s) from the mat's top left corner.
   ===================================================================== */
(function () {
  "use strict";

  var COLORS = {
    player: "#2f6fd6", brown: "#8b5a2b", ash: "#8f8f88", marine: "#23857f", yellow: "#e2bd2c",
    pink: "#e46d9f", green: "#4a9f36", violet: "#7f4cc2", white: "#ecebe4", black: "#2b2b30"
  };
  var LIFT = 0.34;           // how tall a block stands, in tiles (its front face)

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function c(v) { return Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); }
    return "rgb(" + c(r) + "," + c(g) + "," + c(b) + ")";
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  // a seeded jitter, so the grain and the speckles stay put frame to frame
  function hash(a, b) { var h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }

  // ---- the mat and the rim ------------------------------------------------------
  function mat(g, W, H, s) {
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#efdfb9"); grad.addColorStop(1, "#e6d2a6");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // the mat's weave: faint seams on the tile lines
    g.strokeStyle = "rgba(150, 112, 60, 0.13)"; g.lineWidth = 1;
    g.beginPath();
    for (var x = s; x < W - 1; x += s) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H); }
    for (var y = s; y < H - 1; y += s) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); }
    g.stroke();
    // and a scatter of fibres
    g.fillStyle = "rgba(150, 112, 60, 0.10)";
    for (var i = 0; i < W * H / (s * 2.2); i++) g.fillRect(hash(i, 1) * W, hash(i, 2) * H, 1 + hash(i, 3) * s * 0.18, 1);
  }
  // the box's rim, round the mat (fr thick): painted red wood; the far side
  // shows its inner face, darker
  function rim(g, W, H, fr, s) {
    var lift = s * LIFT, red = "#c63a2c";
    g.fillStyle = red;
    g.fillRect(0, 0, W + fr * 2, fr); g.fillRect(0, H + fr, W + fr * 2, fr);
    g.fillRect(0, 0, fr, H + fr * 2); g.fillRect(W + fr, 0, fr, H + fr * 2);
    g.fillStyle = shade(red, -0.35);
    g.fillRect(fr, fr - lift, W, lift);                        // the far side's inner face
    g.fillStyle = "rgba(255, 255, 255, 0.18)";
    g.fillRect(0, 0, W + fr * 2, 2); g.fillRect(0, H + fr, W + fr * 2, 2);
    g.fillStyle = "rgba(0, 0, 0, 0.18)";                       // a shadow cast on the mat by the near sides
    g.fillRect(fr, fr, 3, H); g.fillRect(fr, fr, W, 3);
  }

  // ---- blocks, cork and holes -----------------------------------------------------
  // a block's sprite: the top face (s x s) above its front face (s x lift)
  function blockSprite(s, cork) {
    var lift = Math.round(s * LIFT), c = document.createElement("canvas"), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.ceil(s * dpr); c.height = Math.ceil((s + lift) * dpr);
    var g = c.getContext("2d");
    g.scale(dpr, dpr);
    var top = cork ? "#a8713f" : "#dcb67a", front = cork ? "#7c4f28" : "#b1874d";
    g.fillStyle = front; g.fillRect(0, s - 0.5, s, lift + 0.5);
    g.fillStyle = top; g.fillRect(0, 0, s, s);
    var i;
    if (cork) {
      // cork: speckled, a little rougher at the edges
      for (i = 0; i < 46; i++) {
        g.fillStyle = hash(i, 9) < 0.5 ? "rgba(60, 30, 10, 0.35)" : "rgba(240, 200, 150, 0.25)";
        var r = 0.6 + hash(i, 4) * s * 0.035;
        g.beginPath(); g.arc(hash(i, 5) * s, hash(i, 6) * s, r, 0, Math.PI * 2); g.fill();
      }
      for (i = 0; i < 14; i++) { g.fillStyle = "rgba(40, 20, 6, 0.3)"; g.fillRect(hash(i, 7) * s, s + hash(i, 8) * lift, 1.5, 1.5); }
    } else {
      // wood: grain running across
      g.strokeStyle = "rgba(140, 95, 45, 0.28)"; g.lineWidth = 1;
      for (i = 0; i < 5; i++) {
        var gy = (i + 0.5) * s / 5 + (hash(i, 1) - 0.5) * s * 0.08;
        g.beginPath(); g.moveTo(0, gy);
        g.bezierCurveTo(s * 0.3, gy + (hash(i, 2) - 0.5) * s * 0.12, s * 0.7, gy + (hash(i, 3) - 0.5) * s * 0.12, s, gy);
        g.stroke();
      }
      g.strokeStyle = "rgba(110, 72, 32, 0.3)";
      g.beginPath(); g.moveTo(0, s + lift * 0.5); g.lineTo(s, s + lift * 0.45); g.stroke();
    }
    // the edges: lit along the top, darker down the sides
    g.fillStyle = "rgba(255, 255, 255, 0.28)"; g.fillRect(0, 0, s, 1.5);
    g.fillStyle = "rgba(0, 0, 0, 0.16)"; g.fillRect(s - 1, 0, 1, s + lift); g.fillRect(0, s - 0.5, s, 1);
    g.fillStyle = "rgba(0, 0, 0, 0.08)"; g.fillRect(0, 0, 1, s + lift);
    return { canvas: c, w: s, h: s + lift, lift: lift };
  }
  function block(g, spr, tx, ty, s) { g.drawImage(spr.canvas, tx * s, ty * s - spr.lift, spr.w, spr.h); }
  function hole(g, tx, ty, s) {
    var cx = (tx + 0.5) * s, cy = (ty + 0.5) * s, r = s * 0.44;
    g.fillStyle = "#3a2717";
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    var grad = g.createRadialGradient(cx, cy + r * 0.25, r * 0.1, cx, cy, r);
    grad.addColorStop(0, "#120b05"); grad.addColorStop(1, "#4a3420");
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r * 0.86, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255, 240, 210, 0.35)"; g.lineWidth = Math.max(1, s * 0.04);
    g.beginPath(); g.arc(cx, cy, r, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  }

  // ---- what's left on the mat: tread marks, the X where a tank was lost -------------
  function track(g, x, y, a, s, age) {
    var al = Math.max(0, 0.22 * (1 - age / 6000));
    if (al <= 0) return;
    g.save(); g.translate(x * s, y * s); g.rotate(a);
    g.fillStyle = "rgba(90, 60, 30, " + al.toFixed(3) + ")";
    var w = s * 0.12, l = s * 0.16, off = s * 0.27;
    g.fillRect(-l / 2, -off - w / 2, l, w); g.fillRect(-l / 2, off - w / 2, l, w);
    g.restore();
  }
  function wreck(g, x, y, s, kind) {
    var c = shade(COLORS[kind] || "#444", -0.35), r = s * 0.32;
    g.save(); g.translate(x * s, y * s);
    g.strokeStyle = "rgba(0, 0, 0, 0.18)"; g.lineWidth = s * 0.16; g.lineCap = "round";
    g.beginPath(); g.moveTo(-r + 1.5, -r + 2); g.lineTo(r + 1.5, r + 2); g.moveTo(r + 1.5, -r + 2); g.lineTo(-r + 1.5, r + 2); g.stroke();
    g.strokeStyle = c; g.lineWidth = s * 0.13;
    g.beginPath(); g.moveTo(-r, -r); g.lineTo(r, r); g.moveTo(r, -r); g.lineTo(-r, r); g.stroke();
    g.restore();
  }

  // ---- a tank ------------------------------------------------------------------------
  // o: { tread (distance driven, for the tread pattern), fx, ghost (0..1 seen) }
  function tank(g, t, s, o) {
    o = o || {};
    var color = COLORS[t.kind] || "#888", dark = shade(color, -0.4), lite = shade(color, 0.3);
    var x = t.x * s, y = t.y * s, L = s * 0.86, Wd = s * 0.74;
    g.save();
    if (o.ghost != null) g.globalAlpha = o.ghost;
    // the shadow
    g.save(); g.translate(x + s * 0.06, y + s * 0.1); g.rotate(t.body);
    g.fillStyle = "rgba(60, 35, 10, 0.25)"; rrect(g, -L / 2, -Wd / 2, L, Wd, s * 0.12); g.fill();
    g.restore();
    // the hull and treads
    g.save(); g.translate(x, y); g.rotate(t.body);
    var tw = s * 0.2;
    g.fillStyle = "#3b3a36";
    rrect(g, -L / 2, -Wd / 2, L, tw, s * 0.06); g.fill();
    rrect(g, -L / 2, Wd / 2 - tw, L, tw, s * 0.06); g.fill();
    // the tread's cleats (they run as the tank drives, with Visual FX on)
    g.fillStyle = "#5c5a54";
    var step = s * 0.14, off = o.fx ? ((o.tread || 0) * s) % step : 0;
    for (var cx = -L / 2 + off; cx < L / 2 - 1; cx += step) {
      g.fillRect(cx, -Wd / 2 + 1, s * 0.05, tw - 2);
      g.fillRect(cx, Wd / 2 - tw + 1, s * 0.05, tw - 2);
    }
    g.fillStyle = color;
    rrect(g, -L * 0.44, -Wd / 2 + tw * 0.7, L * 0.88, Wd - tw * 1.4, s * 0.08); g.fill();
    g.strokeStyle = dark; g.lineWidth = Math.max(1, s * 0.035); g.stroke();
    g.fillStyle = "rgba(255, 255, 255, 0.22)";
    g.fillRect(-L * 0.4, -Wd / 2 + tw * 0.85, L * 0.8, s * 0.05);
    g.restore();
    // the turret and barrel
    g.save(); g.translate(x, y); g.rotate(t.turret);
    var bl = s * 0.56, bw = s * 0.13;
    g.fillStyle = dark; g.fillRect(0, -bw / 2 - 1, bl + 1, bw + 2);
    g.fillStyle = color; g.fillRect(0, -bw / 2, bl, bw);
    g.fillStyle = dark; g.fillRect(bl - s * 0.08, -bw / 2 - 1, s * 0.08, bw + 2);
    g.beginPath(); g.arc(0, 0, s * 0.22, 0, Math.PI * 2);
    g.fillStyle = color; g.fill(); g.strokeStyle = dark; g.lineWidth = Math.max(1, s * 0.04); g.stroke();
    g.beginPath(); g.arc(-s * 0.05, -s * 0.06, s * 0.1, 0, Math.PI * 2); g.fillStyle = lite; g.fill();
    g.restore();
    g.restore();
  }

  // ---- shells, mines, blasts ---------------------------------------------------------------
  function shell(g, sh, s, clock, fx) {
    var x = sh.x * s, y = sh.y * s, a = Math.atan2(sh.vy, sh.vx), l = s * 0.3, w = s * 0.15;
    g.save(); g.translate(x, y); g.rotate(a);
    if (sh.fast) {
      // a rocket: its flame behind (flickering with Visual FX on)
      var fl = l * (fx ? 0.9 + 0.3 * Math.sin(clock / 30 + sh.id) : 1);
      var grad = g.createLinearGradient(-l / 2 - fl, 0, -l / 2, 0);
      grad.addColorStop(0, "rgba(255, 120, 20, 0)"); grad.addColorStop(1, "rgba(255, 190, 60, 0.95)");
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(-l / 2, -w * 0.45); g.lineTo(-l / 2 - fl, 0); g.lineTo(-l / 2, w * 0.45); g.closePath(); g.fill();
    }
    g.fillStyle = "rgba(60, 35, 10, 0.25)"; rrect(g, -l / 2 + 2, -w / 2 + 3, l, w, w / 2); g.fill();
    g.fillStyle = sh.fast ? "#fff4d8" : "#f5f5f0"; rrect(g, -l / 2, -w / 2, l, w, w / 2); g.fill();
    g.strokeStyle = "#3b3a36"; g.lineWidth = Math.max(1, s * 0.03); g.stroke();
    g.fillStyle = sh.enemy ? "#c8372d" : "#2f6fd6"; g.fillRect(-l / 2 + w * 0.3, -w / 2 + 1, w * 0.35, w - 2);
    g.restore();
  }
  // a mine's blink in its last stretch: on or off at this clock (left: ms
  // until it goes off; warn: how long the stretch is)
  function mineBlink(left, warn, clock) { return Math.floor(clock / (left < warn / 3 ? 90 : 180)) % 2 === 0; }
  // left: ms until it goes off on its own; warn: the last stretch, when it blinks
  function mine(g, m, s, left, warn, clock) {
    var x = m.x * s, y = m.y * s, r = s * 0.27;
    g.fillStyle = "rgba(60, 35, 10, 0.25)"; g.beginPath(); g.arc(x + 1.5, y + 2.5, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f0c33c"; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#5a4310"; g.lineWidth = Math.max(1, s * 0.05); g.stroke();
    g.strokeStyle = "rgba(90, 67, 16, 0.5)"; g.lineWidth = Math.max(1, s * 0.03);
    g.beginPath(); g.arc(x, y, r * 0.62, 0, Math.PI * 2); g.stroke();
    // the light in the middle: dark while its layer is still on it, lit once
    // it has driven off (armed), blinking in its last stretch, faster near
    // the end (the page beeps with it: mineBlink), and flashing fast once a
    // tank has come near and set it going
    var on = m.trip != null ? Math.floor(clock / 50) % 2 === 0 : left <= warn ? mineBlink(left, warn, clock) : !!m.armed;
    g.fillStyle = on ? "#e0352a" : "#6e1a12";
    g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill();
  }
  // a blast: a ring out to its reach (R tiles), then fading
  function blast(g, b, s, R, fx) {
    var t = b.age / 900, grow = Math.min(1, b.age / 220), x = b.x * s, y = b.y * s, r = R * s * (0.35 + 0.65 * grow);
    var a = Math.max(0, 1 - t);
    var grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255, 245, 190, " + (0.95 * a).toFixed(3) + ")");
    grad.addColorStop(0.45, "rgba(255, 170, 40, " + (0.85 * a).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(220, 70, 20, " + (fx ? 0 : 0.25 * a).toFixed(3) + ")");
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(160, 50, 15, " + (0.6 * a).toFixed(3) + ")"; g.lineWidth = Math.max(1.5, s * 0.06);
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  }

  // ---- your aim: a line of dots from the barrel to the sight, and the sight -----------------
  function aim(g, t, tx, ty, s, ring) {
    var x0 = t.x * s + Math.cos(t.turret) * s * 0.62, y0 = t.y * s + Math.sin(t.turret) * s * 0.62, x1 = tx * s, y1 = ty * s;
    var d = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(d / (s * 0.42));
    g.fillStyle = "rgba(47, 111, 214, 0.55)";
    for (var i = 1; i < n; i++) { g.beginPath(); g.arc(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, Math.max(1.5, s * 0.05), 0, Math.PI * 2); g.fill(); }
    if (!ring) return;
    g.strokeStyle = "#2f6fd6"; g.lineWidth = Math.max(2, s * 0.07);
    g.beginPath(); g.arc(x1, y1, s * 0.3, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(x1 - s * 0.45, y1); g.lineTo(x1 - s * 0.15, y1); g.moveTo(x1 + s * 0.15, y1); g.lineTo(x1 + s * 0.45, y1);
    g.moveTo(x1, y1 - s * 0.45); g.lineTo(x1, y1 - s * 0.15); g.moveTo(x1, y1 + s * 0.15); g.lineTo(x1, y1 + s * 0.45); g.stroke();
  }

  // ---- a small tank for the HUD and the cards: an inline SVG ---------------------------------
  function badge(kind, size) {
    var c = COLORS[kind] || "#888", d = shade(c, -0.4);
    return '<svg class="tk" viewBox="0 0 20 20" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<rect x="2" y="3" width="16" height="4" rx="1.5" fill="#3b3a36"/><rect x="2" y="13" width="16" height="4" rx="1.5" fill="#3b3a36"/>' +
      '<rect x="3" y="5.5" width="14" height="9" rx="2" fill="' + c + '" stroke="' + d + '" stroke-width="1"/>' +
      '<rect x="10" y="8.8" width="9" height="2.4" fill="' + c + '" stroke="' + d + '" stroke-width=".8"/>' +
      '<circle cx="10" cy="10" r="3.6" fill="' + c + '" stroke="' + d + '" stroke-width="1"/></svg>';
  }

  window.ToyTanksArt = { COLORS: COLORS, LIFT: LIFT, mineBlink: mineBlink, shade: shade, mat: mat, rim: rim, blockSprite: blockSprite, block: block, hole: hole,
    track: track, wreck: wreck, tank: tank, shell: shell, mine: mine, blast: blast, aim: aim, badge: badge };
})();
