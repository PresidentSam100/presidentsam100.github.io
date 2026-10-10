/* Jam Jar — a Suika-style merge-drop. Drop fruit into a preserving jar; two of
   a kind squish into the next fruit up the chain. Overflow the jar and the
   preserves are ruined. Plain circle physics, no libraries. */
(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;   // the logical size everything is drawn in

  // Hi-DPI: the backing store is W×H times the device pixel ratio (up to 2),
  // drawn through a matching transform, so the jar is sharp on retina screens
  // and phones; the fruit sprites are painted at the same ratio (buildSprites).
  // A ratio change (browser zoom, another screen) refits both.
  var dpr = 1;
  function fitCanvas() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();
  window.addEventListener("resize", function () {
    if (Math.min(2, window.devicePixelRatio || 1) === dpr) return;
    fitCanvas();
    buildSprites();
  });

  // jar interior
  var JL = 58, JR = W - 58, FLOOR = H - 34, RIM = 96;
  var GLASS = 9;         // glass thickness, drawn just OUTSIDE the walls above
  var LOSE_Y = 116;      // the fill line — settled fruit above this ends the run
  var DROP_Y = 64;

  // ---- the fruit chain -------------------------------------------------------
  var TIERS = [
    { name: "Blueberry",  r: 15,  col: "#5e70d6", dark: "#3d4da8" },
    { name: "Cherry",     r: 19,  col: "#e04a4a", dark: "#a82a2a" },
    { name: "Strawberry", r: 24,  col: "#ee5a7a", dark: "#bb3555" },
    { name: "Plum",       r: 30,  col: "#9b59c9", dark: "#6f3a97" },
    { name: "Apricot",    r: 37,  col: "#ffb14e", dark: "#d1832a" },
    { name: "Apple",      r: 45,  col: "#7fbf4d", dark: "#558e2c" },
    { name: "Peach",      r: 54,  col: "#ff9d85", dark: "#d66b55" },
    { name: "Grapefruit", r: 65,  col: "#ff8b3d", dark: "#cc611d" },
    { name: "Pineapple",  r: 78,  col: "#e8b93c", dark: "#b3861f" },
    { name: "Melon",      r: 93,  col: "#c4dd8e", dark: "#8fb35a" },
    { name: "Watermelon", r: 110, col: "#3f9448", dark: "#26702f" },
  ];
  var MERGE_SCORE = [0, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66]; // points for CREATING tier i
  var DROP_TIERS = 5; // random drops come from the first five

  // ---- sound -----------------------------------------------------------------
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
    var c = ac(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function sfxDrop() { tone(170, 0.09, "sine", 0.14, 0, 120); }
  function sfxMerge(tier) { // rises with the fruit you made
    tone(240 + tier * 55, 0.12, "triangle", 0.2);
    tone(360 + tier * 70, 0.16, "sine", 0.14, 0.05);
  }
  function sfxMelon() { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.18, "triangle", 0.16, i * 0.08); }); }
  function sfxOver() { [392, 311, 262, 196].forEach(function (f, i) { tone(f, 0.26, "sawtooth", 0.12, i * 0.12); }); }

  // ---- fruit sprites (drawn once per tier — fruits don't rotate) --------------
  // Every tier wears its own face — same family, different personalities.
  function faceFor(g, r, tier) {
    var INK = "#3a2417";
    var ex = r * 0.28, ey = -r * 0.12, er = Math.max(1.6, r * 0.07);
    var lw = Math.max(1.4, r * 0.05);
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = lw; g.lineCap = "round";
    function dot(x, y, rr) { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
    function arcStroke(x, y, rr, a0, a1) { g.beginPath(); g.arc(x, y, rr, a0, a1); g.stroke(); }
    function blush(col) {
      g.fillStyle = col || "rgba(255,120,120,0.4)";
      g.beginPath(); g.ellipse(-r * 0.5, r * 0.12, r * 0.13, r * 0.08, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(r * 0.5, r * 0.12, r * 0.13, r * 0.08, 0, 0, 7); g.fill();
      g.fillStyle = INK;
    }
    switch (tier) {
      case 0: // blueberry: wide baby eyes, little "o" mouth
        dot(-ex, ey, er * 1.25); dot(ex, ey, er * 1.25);
        g.fillStyle = "#fff"; dot(-ex + er * 0.4, ey - er * 0.4, er * 0.4); dot(ex + er * 0.4, ey - er * 0.4, er * 0.4);
        g.fillStyle = INK;
        g.beginPath(); g.arc(0, r * 0.14, r * 0.08, 0, 7); g.stroke();
        break;
      case 1: // cherry: a wink and a cheeky grin
        dot(-ex, ey, er);
        arcStroke(ex, ey, er * 1.1, Math.PI * 1.15, Math.PI * 1.85); // winking eye ^
        arcStroke(0, r * 0.02, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
        g.beginPath(); g.moveTo(r * 0.12, r * 0.2); g.quadraticCurveTo(r * 0.2, r * 0.3, r * 0.08, r * 0.3); g.stroke(); // tongue tip
        break;
      case 2: // strawberry: happy closed eyes, big smile
        arcStroke(-ex, ey, er * 1.3, Math.PI * 1.1, Math.PI * 1.9);
        arcStroke(ex, ey, er * 1.3, Math.PI * 1.1, Math.PI * 1.9);
        arcStroke(0, r * 0.02, r * 0.24, 0.15 * Math.PI, 0.85 * Math.PI);
        blush();
        break;
      case 3: // plum: sleepy lids and a tiny content smile
        g.beginPath(); g.moveTo(-ex - er, ey); g.lineTo(-ex + er, ey); g.stroke();
        g.beginPath(); g.moveTo(ex - er, ey); g.lineTo(ex + er, ey); g.stroke();
        arcStroke(0, r * 0.08, r * 0.12, 0.2 * Math.PI, 0.8 * Math.PI);
        break;
      case 4: // apricot: joyful ^ ^ and an open smile
        arcStroke(-ex, ey + er * 0.3, er * 1.2, Math.PI * 1.15, Math.PI * 1.85);
        arcStroke(ex, ey + er * 0.3, er * 1.2, Math.PI * 1.15, Math.PI * 1.85);
        g.beginPath(); g.arc(0, r * 0.06, r * 0.16, 0.1 * Math.PI, 0.9 * Math.PI); g.closePath(); g.fill();
        break;
      case 5: // apple: determined brows and a grin
        dot(-ex, ey, er); dot(ex, ey, er);
        g.beginPath(); g.moveTo(-ex - er * 1.2, ey - er * 1.8); g.lineTo(-ex + er * 0.8, ey - er * 1.1); g.stroke();
        g.beginPath(); g.moveTo(ex + er * 1.2, ey - er * 1.8); g.lineTo(ex - er * 0.8, ey - er * 1.1); g.stroke();
        arcStroke(0, r * 0.02, r * 0.2, 0.2 * Math.PI, 0.8 * Math.PI);
        break;
      case 6: // peach: shy sideways glance and a blush
        dot(-ex + er * 0.7, ey, er); dot(ex + er * 0.7, ey, er);
        arcStroke(er * 0.5, r * 0.09, r * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
        blush("rgba(230,90,90,0.45)");
        break;
      case 7: // grapefruit: deadpan — the same flat brows, now over a plain smile
        dot(-ex, ey, er); dot(ex, ey, er);
        g.beginPath(); g.moveTo(-ex - er, ey - er * 1.6); g.lineTo(-ex + er, ey - er * 1.6); g.stroke();
        g.beginPath(); g.moveTo(ex - er, ey - er * 1.6); g.lineTo(ex + er, ey - er * 1.6); g.stroke();
        arcStroke(0, r * 0.02, r * 0.2, 0.2 * Math.PI, 0.8 * Math.PI);
        break;
      case 8: // pineapple: too cool — a shades bar and a smirk
        g.fillRect(-ex - er * 1.6, ey - er * 0.9, (ex + er * 1.6) * 2, er * 1.8);
        g.beginPath(); g.moveTo(-ex - er * 1.6, ey - er * 0.4); g.lineTo(-r * 0.55, ey - er * 0.8); g.stroke();
        g.beginPath(); g.moveTo(ex + er * 1.6, ey - er * 0.4); g.lineTo(r * 0.55, ey - er * 0.8); g.stroke();
        g.beginPath(); g.moveTo(-r * 0.06, r * 0.14); g.quadraticCurveTo(r * 0.1, r * 0.2, r * 0.16, r * 0.1); g.stroke();
        break;
      case 9: // melon: the serene elder, spectacles and closed eyes
        // a ∪ arc draws below its centre, so lift it to sit mid-lens
        arcStroke(-ex, ey - er * 0.8, er * 1.15, 0.15 * Math.PI, 0.85 * Math.PI); // ∪ closed eyes
        arcStroke(ex, ey - er * 0.8, er * 1.15, 0.15 * Math.PI, 0.85 * Math.PI);
        g.lineWidth = lw * 0.7;
        arcStroke(-ex, ey, er * 2, 0, 7); arcStroke(ex, ey, er * 2, 0, 7); // glasses
        g.beginPath(); g.moveTo(-ex + er * 2, ey); g.lineTo(ex - er * 2, ey); g.stroke();
        g.lineWidth = lw;
        arcStroke(0, r * 0.06, r * 0.14, 0.2 * Math.PI, 0.8 * Math.PI);
        break;
      default: // watermelon: the beaming king — starry eyes, huge open grin
        g.save();
        g.translate(-ex, ey); star(g, er * 1.5); g.restore();
        g.save();
        g.translate(ex, ey); star(g, er * 1.5); g.restore();
        g.beginPath(); g.arc(0, r * 0.05, r * 0.24, 0.08 * Math.PI, 0.92 * Math.PI); g.closePath(); g.fill();
        g.fillStyle = "#e0413f";
        g.beginPath(); g.arc(0, r * 0.21, r * 0.1, Math.PI, 0); g.fill();
        g.fillStyle = INK;
    }
  }
  function star(g, rr) {
    g.beginPath();
    for (var i = 0; i <= 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var rad = i % 2 ? rr * 0.45 : rr;
      if (i === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath(); g.fill();
  }
  var SPRITES = [];
  // the grapefruit's pores are scattered once, so every drawing of it — in
  // the jar, in Next, on the ladder — is the same fruit
  var PORES = [];
  for (var pI0 = 0; pI0 < 14; pI0++) PORES.push([Math.random() * Math.PI * 2, Math.sqrt(Math.random()) * 0.75]);
  // Paints tier ti as vectors at its true radius, centred on the origin. Any
  // scale already on g applies to the paths themselves, so a small copy is
  // as crisp as the big one.
  function paintFruit(g, ti) {
    var t = TIERS[ti], r = t.r;
    // body
    var grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r * 1.05);
    grad.addColorStop(0, lighten(t.col, 0.28));
    grad.addColorStop(0.72, t.col);
    grad.addColorStop(1, t.dark);
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.strokeStyle = t.dark; g.lineWidth = Math.max(1.6, r * 0.045);
    g.beginPath(); g.arc(0, 0, r - g.lineWidth / 2 + 0.5, 0, 7); g.stroke();
    // per-fruit decorations
    g.strokeStyle = t.dark; g.fillStyle = t.dark; g.lineCap = "round";
    if (ti === 0) { // blueberry crown
      g.lineWidth = 1.6;
      for (var a = 0; a < 5; a++) {
        var an = -Math.PI / 2 + (a - 2) * 0.28;
        g.beginPath();
        g.moveTo(Math.cos(an) * r * 0.62, Math.sin(an) * r * 0.62 - r * 0.12);
        g.lineTo(Math.cos(an) * r * 0.8, Math.sin(an) * r * 0.8 - r * 0.12);
        g.stroke();
      }
    } else if (ti === 1) { // cherry stem
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(0, -r * 0.85); g.quadraticCurveTo(r * 0.32, -r * 1.25, r * 0.15, -r * 1.45); g.stroke();
    } else if (ti === 2) { // strawberry seeds
      g.fillStyle = "#ffe9a8";
      for (var i = 0; i < 8; i++) {
        var sa = i / 8 * Math.PI * 2 + 0.4;
        g.beginPath(); g.ellipse(Math.cos(sa) * r * 0.55, Math.sin(sa) * r * 0.55, r * 0.05, r * 0.08, sa, 0, 7); g.fill();
      }
    } else if (ti === 3) { // plum sheen
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = r * 0.09;
      g.beginPath(); g.arc(0, 0, r * 0.7, -2.4, -1.7); g.stroke();
    } else if (ti === 4 || ti === 6) { // apricot / peach crease
      g.lineWidth = Math.max(1.6, r * 0.035); g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(0, -r * 0.9); g.quadraticCurveTo(r * 0.22, 0, 0, r * 0.9); g.stroke();
      g.globalAlpha = 1;
    } else if (ti === 5) { // apple stem + leaf
      g.strokeStyle = "#6b4423"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, -r * 0.9); g.lineTo(0, -r * 1.12); g.stroke();
      g.fillStyle = "#4d8a2a";
      g.beginPath(); g.ellipse(r * 0.16, -r * 1.05, r * 0.16, r * 0.08, -0.5, 0, 7); g.fill();
    } else if (ti === 7) { // grapefruit pores
      g.globalAlpha = 0.35;
      for (var pI = 0; pI < PORES.length; pI++) {
        var pa = PORES[pI][0], pd = PORES[pI][1] * r;
        g.beginPath(); g.arc(Math.cos(pa) * pd, Math.sin(pa) * pd + r * 0.15, r * 0.03, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    } else if (ti === 8) { // pineapple: diamond crosshatch + leafy crown
      g.save();
      g.beginPath(); g.arc(0, 0, r - 2, 0, 7); g.clip();
      g.strokeStyle = "rgba(179,134,31,0.65)"; g.lineWidth = Math.max(1.4, r * 0.03);
      for (var q = -4; q <= 4; q++) {
        g.beginPath(); g.moveTo(q * r * 0.42 - r, -r); g.lineTo(q * r * 0.42 + r, r); g.stroke();
        g.beginPath(); g.moveTo(q * r * 0.42 + r, -r); g.lineTo(q * r * 0.42 - r, r); g.stroke();
      }
      g.restore();
      g.fillStyle = "#4d8a2a"; // the crown
      for (var lf = -2; lf <= 2; lf++) {
        g.beginPath();
        g.moveTo(lf * r * 0.16, -r * 0.82);
        g.lineTo(lf * r * 0.3, -r * 1.28);
        g.lineTo(lf * r * 0.16 + r * 0.12, -r * 0.86);
        g.closePath(); g.fill();
      }
    } else if (ti === 9) { // melon netting, clipped to the body
      g.save();
      g.beginPath(); g.arc(0, 0, r - 2.5, 0, 7); g.clip();
      g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.4; g.globalAlpha = 0.8;
      for (var m = -3; m <= 3; m++) {
        g.beginPath(); g.arc(m * r * 0.5, 0, r * 0.85, -1.1, 1.1); g.stroke();
        g.beginPath(); g.arc(0, m * r * 0.5, r * 0.85, Math.PI / 2 - 1.1, Math.PI / 2 + 1.1); g.stroke();
      }
      g.globalAlpha = 1;
      g.restore();
    } else if (ti === 10) { // watermelon stripes
      g.save();
      g.beginPath(); g.arc(0, 0, r - 2, 0, 7); g.clip();
      g.strokeStyle = "#26702f"; g.lineWidth = r * 0.16;
      for (var w = -2; w <= 2; w++) {
        g.beginPath(); g.moveTo(w * r * 0.42, -r * 1.1); g.quadraticCurveTo(w * r * 0.62, 0, w * r * 0.42, r * 1.1); g.stroke();
      }
      g.restore();
    }
    faceFor(g, r, ti);
  }
  // each sprite is `size` logical px square, painted at the canvas's pixel
  // ratio (so drawn with an explicit size: drawSprite)
  function buildSprites() {
    SPRITES = TIERS.map(function (t, ti) {
      var r = t.r, pad = 16, s = document.createElement("canvas"); // room for the cherry's stem tip
      var size = (r + pad) * 2;
      s.width = s.height = Math.round(size * dpr);
      var g = s.getContext("2d");
      g.scale(dpr, dpr);
      g.translate(r + pad, r + pad);
      paintFruit(g, ti);
      return { c: s, off: r + pad, size: size, ext: inkRows(s, r + pad, dpr) };
    });
  }
  function drawSprite(sp, x, y) { ctx.drawImage(sp.c, x - sp.off, y - sp.off, sp.size, sp.size); }
  // how far a sprite's ink reaches above and below its centre — stems,
  // leaves and crowns included — read off the finished pixels (k of them
  // to a logical px)
  function inkRows(s, off, k) {
    var n = s.width, px = s.getContext("2d").getImageData(0, 0, n, n).data;
    function inked(y) { for (var x = 0; x < n; x++) if (px[(y * n + x) * 4 + 3] > 24) return true; return false; }
    var top = 0, bot = n - 1;
    while (top < bot && !inked(top)) top++;
    while (bot > top && !inked(bot)) bot--;
    return { up: off - top / k, down: (bot + 1) / k - off };
  }
  function lighten(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g2 = n >> 8 & 255, b = n & 255;
    return "rgb(" + Math.round(r + (255 - r) * amt) + "," + Math.round(g2 + (255 - g2) * amt) + "," + Math.round(b + (255 - b) * amt) + ")";
  }
  buildSprites();

  // ---- state -----------------------------------------------------------------
  var best = window.GameShell ? GameShell.best("jamjar_best", { higher: true }) : { get: function () { return 0; }, submit: function () {} };
  var fruits = [], particles = [];
  var state = "play"; // play | over
  var dropped = false; // a fruit has gone into this jar (until then leaving doesn't ask, see the pause)
  var score = 0, aimX = W / 2, dropCd = 0, dangerT = 0;
  var runBest = 0; // the best as this jar began (the stored one climbs mid-run, see applyMerge)
  var current = 0, next = 0;
  function rndTier() { var r = Math.random(); return r < 0.30 ? 0 : r < 0.55 ? 1 : 0.75 > r ? 2 : r < 0.9 ? 3 : 4; }
  function reduced() { return !!(window.RM_ON && window.RM_ON()); }

  function reset() {
    fruits = []; particles = [];
    score = 0; dropCd = 0; dangerT = 0; state = "play"; dropped = false;
    runBest = best.get();
    current = rndTier(); next = rndTier();
    refreshHud();
    drawChain();
    document.getElementById("overScreen").classList.add("hidden");
  }

  function makeFruit(x, y, tier) {
    var r = TIERS[tier].r;
    // weight goes with volume (r³), like real fruit: a peach outweighs a
    // berry ~47×, so it barrels through berries while a berry barely nudges it
    return { x: x, y: y, px: x, py: y, vx: 0, vy: 0, r: r, tier: tier, im: 1 / (r * r * r), mergeCd: 0.1,
             rot: 0, w: 0, // upright, just as it hung before the drop touch: false, contacted: false, dead: false,
             rollNx: 0, rollNy: -Infinity, rollOn: null };
  }

  function drop() {
    if (state !== "play" || dropCd > 0 || P.isPaused()) return;
    var r = TIERS[current].r;
    var x = Math.max(JL + r + 1, Math.min(JR - r - 1, aimX));
    fruits.push(makeFruit(x, DROP_Y, current));
    dropped = true;
    sfxDrop();
    current = next; next = rndTier();
    dropCd = 0.45;
    refreshHud();
  }

  // ---- physics ---------------------------------------------------------------
  var GRAV = 1500, REST = 0.22, WALL_REST = 0.38, MU = 0.15;
  var MERGE_SLOP = 2; // px — twins this close count as touching
  function physics(dt) {
    var i, j, f;
    for (i = 0; i < fruits.length; i++) {
      f = fruits[i];
      f.vy += GRAV * dt;
      f.wasC = !!f.contacted; f.vy0 = f.vy;   // for the landing squash (below)
      if (f.sq && (f.sq.t += dt) >= SQ_T) f.sq = null;
      f.vx *= 0.9995;               // barely any air drag — momentum carries
      f.rot += f.w * dt;
      f.w *= 0.999;
      f.touch = false;
      f.supMin = Infinity; f.supMax = -Infinity; f.supSide = 0; f.supNy = 0; f.supFlat = false;
      f.rollNx = 0; f.rollNy = -Infinity; f.rollOn = null;
      f.px = f.x; f.py = f.y;
      // clamp: nothing should ever be moving absurdly fast inside a jar
      if (f.vx > 1200) f.vx = 1200; if (f.vx < -1200) f.vx = -1200;
      if (f.vy > 1600) f.vy = 1600; if (f.vy < -1600) f.vy = -1600;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.mergeCd > 0) f.mergeCd -= dt;
    }
    var merges = [];
    for (var iter = 0; iter < 8; iter++) {
      // pairs
      for (i = 0; i < fruits.length; i++) {
        var a = fruits[i];
        if (a.dead) continue;
        for (j = i + 1; j < fruits.length; j++) {
          var b = fruits[j];
          if (b.dead) continue;
          var dx = b.x - a.x, dy = b.y - a.y;
          var rr = a.r + b.r;
          var d2 = dx * dx + dy * dy;
          if (d2 === 0) continue;
          // same tier touching → merge (queued; each fruit merges once per
          // frame). "Touching" gets a hair of slop: resting twins settle a
          // fraction of a pixel apart, and the sprites draw a touch past r, so
          // demanding real overlap left pairs that looked squished together
          // sitting unmerged forever
          if (iter === 0 && a.tier === b.tier && a.mergeCd <= 0 && b.mergeCd <= 0 &&
              d2 < (rr + MERGE_SLOP) * (rr + MERGE_SLOP)) {
            a.dead = b.dead = true;
            merges.push([a, b]);
            break; // a is spent — it mustn't merge with (or shove) anyone else
          }
          if (d2 >= rr * rr) continue;
          var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          var overlap = rr - d;
          a.contacted = b.contacted = true;
          a.touch = b.touch = true;
          // support bookkeeping: is the other fruit holding this one up, and
          // from which side? (drives cradled-vs-perched behaviour below)
          if (ny > 0.4) { // b sits below a
            var sideA = a.x - b.x;
            if (sideA < a.supMin) a.supMin = sideA;
            if (sideA > a.supMax) a.supMax = sideA;
            if (ny > a.supNy) { a.supNy = ny; a.supSide = sideA; }
          } else if (ny < -0.4) { // a sits below b
            var sideB = b.x - a.x;
            if (sideB < b.supMin) b.supMin = sideB;
            if (sideB > b.supMax) b.supMax = sideB;
            if (-ny > b.supNy) { b.supNy = -ny; b.supSide = sideB; }
          } else { // side by side: each props the other up from that side
            var sideS = a.x - b.x;
            if (sideS < a.supMin) a.supMin = sideS;
            if (sideS > a.supMax) a.supMax = sideS;
            if (-sideS < b.supMin) b.supMin = -sideS;
            if (-sideS > b.supMax) b.supMax = -sideS;
          }
          // the surface each one rolls on: whichever contact sits most
          // squarely underneath it (normals point from the fruit to it)
          if (ny > a.rollNy) { a.rollNx = nx; a.rollNy = ny; a.rollOn = b; }
          if (-ny > b.rollNy) { b.rollNx = -nx; b.rollNy = -ny; b.rollOn = a; }
          var tm = a.im + b.im;
          var push = overlap / tm * 0.85;
          a.x -= nx * push * a.im; a.y -= ny * push * a.im;
          b.x += nx * push * b.im; b.y += ny * push * b.im;
          var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            var imp = -(1 + REST) * rel / tm;
            a.vx -= nx * imp * a.im; a.vy -= ny * imp * a.im;
            b.vx += nx * imp * b.im; b.vy += ny * imp * b.im;
            // tangential friction: a fraction of the sliding motion becomes
            // shared momentum + spin, so piles jostle and fruit rolls off fruit
            var tx2 = -ny, ty2 = nx;
            var relT = (b.vx - a.vx) * tx2 + (b.vy - a.vy) * ty2;
            var mu = (a.perched || b.perched) ? 0 : MU; // no grip while balancing
            var jt = Math.max(-imp * mu, Math.min(imp * mu, relT / tm * 0.6));
            a.vx += tx2 * jt * a.im; a.vy += ty2 * jt * a.im;
            b.vx -= tx2 * jt * b.im; b.vy -= ty2 * jt * b.im;
          }
        }
      }
      // merges apply the moment they're found, so the bigger fruit takes part
      // in the REMAINING relaxation passes and can't sit clipped into a
      // neighbour for a frame
      if (iter === 0 && merges.length) {
        for (i = 0; i < merges.length; i++) applyMerge(merges[i][0], merges[i][1]);
        merges = [];
        fruits = fruits.filter(function (x) { return !x.dead; });
      }
      // jar walls + floor
      for (i = 0; i < fruits.length; i++) {
        f = fruits[i];
        if (f.x - f.r < JL) { f.x = JL + f.r; if (f.vx < 0) f.vx = -f.vx * WALL_REST; f.contacted = f.touch = true; }
        if (f.x + f.r > JR) { f.x = JR - f.r; if (f.vx > 0) f.vx = -f.vx * WALL_REST; f.contacted = f.touch = true; }
        if (f.y + f.r > FLOOR) {
          f.y = FLOOR - f.r;
          if (f.vy > 60) f.vy = -f.vy * 0.28;   // a real bounce on a hard landing
          else if (f.vy > 0) f.vy = 0;
          f.contacted = f.touch = true;
          f.supFlat = true;
        }
        // pressed against the glass? (with a hair of tolerance: once clamped,
        // a resting fruit sits exactly on the line, and the later passes add
        // no gravity to push it back over)
        f.pinL = f.x - f.r < JL + 0.5;
        f.pinR = f.x + f.r > JR - 0.5;
        f.onFloor = f.y + f.r > FLOOR - 0.5;
        // the glass props a fruit up from the side just like a neighbour
        // would — so one resting on a single fruit and leaning on the wall
        // is wedged, not balancing (it was being tipped into the glass)
        if (f.pinL && f.supMax < f.r) f.supMax = f.r;
        if (f.pinR && f.supMin > -f.r) f.supMin = -f.r;
        if (f.onFloor) { f.rollNx = 0; f.rollNy = 1; f.rollOn = null; }
        else if (f.rollNy < 0 && (f.pinL || f.pinR)) { f.rollNx = f.pinL ? -1 : 1; f.rollNy = 0; f.rollOn = null; }
      }
    }
    stack();
    unjam();
    // rolling: anything in contact turns with its travel ACROSS the surface it
    // rolls on — the floor, the curve of another fruit, the glass — so
    // ω = (speed along that surface, relative to it) / r. Travel means how far
    // it really moved this step, not vx: in a packed pile vx is mostly push
    // the position passes cancel out, and following it set settled fruit
    // spinning in place. Floor-rollers feel a touch of rolling resistance
    // instead of a handbrake.
    for (i = 0; i < fruits.length; i++) {
      f = fruits[i];
      f.mvx = (f.x - f.px) / dt; f.mvy = (f.y - f.py) / dt;
    }
    for (i = 0; i < fruits.length; i++) {
      f = fruits[i];
      if (f.touch) {
        if (f.rollNy > -Infinity) {
          var s = f.rollOn, rvx = f.mvx, rvy = f.mvy;
          if (s && !s.dead) { rvx -= s.mvx; rvy -= s.mvy; }
          var spin = (rvx * f.rollNy - rvy * f.rollNx) / f.r;
          f.w += (spin - f.w) * Math.min(1, dt * 20);
        }
        // Cradled = the floor, or held up from below with something propping
        // BOTH sides (another fruit underneath, a neighbour beside it, or the
        // glass). Perched = balanced on one off-centre contact with nothing on
        // the side it leans to — that fruit must tip and roll off, so it never
        // gets the sleep treatment.
        var lip = f.r * 0.08;
        var cradled = f.supFlat || (f.supNy > 0 && f.supMin < -lip && f.supMax > lip);
        f.perched = false;
        if (cradled) {
          f.tipDir = 0;
          if (f.mvx * f.mvx + f.mvy * f.mvy < 144) f.w *= 0.82; // resting fruit stops turning
          // free-rolling stays free; slow creep meets static-style friction,
          // and near-rest contact all but freezes (kills wedge-creep for good)
          if (f.onFloor) f.vx *= Math.abs(f.vx) < 25 ? 0.9 : 0.995;
          if (Math.abs(f.vx) < 10 && Math.abs(f.vy) < 10) f.vx *= 0.5;
        } else if (f.supNy > 0) {
          // Gravity wins the balancing act: slide down whichever side it
          // leans toward. On a perfect balance (a berry dead-centre on a
          // melon's wide crown) the coin flip is STICKY — re-rolling it every
          // substep would just dither in place forever.
          f.perched = true;
          if (Math.abs(f.supSide) > 0.5) f.tipDir = f.supSide > 0 ? 1 : -1;
          else if (!f.tipDir) f.tipDir = Math.random() < 0.5 ? -1 : 1;
          f.vx += f.tipDir * 200 * dt;
        } else {
          f.tipDir = 0;
        }
      } else {
        f.tipDir = 0;
        f.perched = false; // airborne: its next landing gets full grip
      }
      var wMax = 900 / f.r;                      // never a blur, even for berries
      if (f.w > wMax) f.w = wMax; if (f.w < -wMax) f.w = -wMax;
    }
    // (merges are applied inside the iteration loop above)

    // overflow: settled fruit sitting above the fill line
    var danger = false;
    for (i = 0; i < fruits.length; i++) {
      f = fruits[i];
      // over = its top edge is past the drawn line, exactly what you see
      if (f.contacted && f.y - f.r < LOSE_Y && Math.abs(f.vy) < 90 && Math.abs(f.vx) < 90) { danger = true; break; }
    }
    dangerT = danger ? dangerT + dt : Math.max(0, dangerT - dt * 2);
    if (dangerT > 1.15 && state === "play") gameOver();

    if (dropCd > 0) dropCd -= dt;

    // Visual FX on: a fruit's first touchdown squashes it by how hard it hit,
    // and it springs back (drawFruit). A merged fruit is born touching, so
    // only a dropped one lands. With FX off it simply lands.
    for (i = 0; i < fruits.length; i++) {
      f = fruits[i];
      if (f.wasC || !f.contacted || f.dead) continue;
      if (!reduced() && f.vy0 > 120) f.sq = { t: 0, a: Math.min(0.2, f.vy0 / 4500) };
    }

    // particles
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      if (p.still) { // the FX-off merge ring doesn't fly; it goes if its fruit merges on
        if (p.f && p.f.dead) particles.splice(i, 1);
        continue;
      }
      if (p.ring) continue; // the merge ring stays where the fruits met (it has no velocity: moving it made it NaN, so it never drew)
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt;
    }
  }

  // The passes above trade pushes in proportion to mass, which is right for a
  // collision but hopeless for a pile: a berry pinned under a grapefruit is 19×
  // lighter, so it can't pass the floor's support up to it and the big fruit
  // slowly sinks through the little one. So finish by walking the jar bottom-up
  // and lifting each fruit clear of anything it RESTS on (lower fruit already
  // settled, treated as solid), cancelling whatever velocity was still driving
  // it down into them. Side-by-side contacts stay with the solver above.
  var STACK_NY = 0.35;
  function stack() {
    var order = fruits.slice().sort(function (p, q) { return q.y - p.y; });
    for (var i = 0; i < order.length; i++) {
      var u = order[i];
      for (var pass = 0; pass < 3; pass++) {
        var moved = false;
        for (var j = 0; j < i; j++) {
          var l = order[j];
          var sx = u.x - l.x, sy = u.y - l.y, rr = u.r + l.r, d2 = sx * sx + sy * sy;
          if (d2 >= rr * rr || d2 === 0) continue;
          var d = Math.sqrt(d2), nx = sx / d, ny = sy / d; // l → u
          if (ny > -STACK_NY) continue;                    // beside l, not on it
          var ov = rr - d;
          u.x += nx * ov; u.y += ny * ov;
          var vn = (u.vx - l.vx) * nx + (u.vy - l.vy) * ny;
          if (vn < 0) { u.vx -= nx * vn; u.vy -= ny * vn; }
          moved = true;
        }
        if (u.x - u.r < JL) { u.x = JL + u.r; if (u.vx < 0) u.vx = 0; }
        if (u.x + u.r > JR) { u.x = JR - u.r; if (u.vx > 0) u.vx = 0; }
        if (!moved) break;
      }
    }
  }

  // Whatever overlap is STILL left is a jam — a berry wedged in a gap between
  // heavy fruit that's too narrow for it. Splitting by weight can't clear it
  // (the berry takes every push and gets pushed straight back), so split the
  // leftover evenly: the berry is solid too, and the big fruit have to make
  // room. Position only; momentum stays with the impulses above.
  function unjam() {
    for (var i = 0; i < fruits.length; i++) {
      var a = fruits[i];
      for (var j = i + 1; j < fruits.length; j++) {
        var b = fruits[j];
        var dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 >= (rr - 1) * (rr - 1) || d2 === 0) continue; // a pixel of give is fine
        var d = Math.sqrt(d2), h = (rr - d) / 2;
        a.x -= dx / d * h; a.y -= dy / d * h;
        b.x += dx / d * h; b.y += dy / d * h;
      }
    }
    for (i = 0; i < fruits.length; i++) {
      var f = fruits[i];
      if (f.x - f.r < JL) f.x = JL + f.r;
      if (f.x + f.r > JR) f.x = JR - f.r;
      if (f.y + f.r > FLOOR) f.y = FLOOR - f.r;
    }
  }

  function applyMerge(pa, pb) {
    var t = pa.tier;
    var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    juice(mx, my, TIERS[t].col, TIERS[t].r);
    if (t === TIERS.length - 1) {             // two watermelons vanish in glory
      score += 100;
      sfxMelon();
      mergeMark(mx, my, TIERS[t].r, TIERS[t].col, null);
    } else {
      var nf = makeFruit(mx, my, t + 1);
      nf.vx = (pa.vx + pb.vx) / 2;
      nf.vy = Math.min((pa.vy + pb.vy) / 2, 0) - 40; // a happy little hop
      nf.contacted = true;
      nf.supMin = Infinity; nf.supMax = -Infinity; nf.supSide = 0; nf.supNy = 0; nf.supFlat = false;
      // the newborn is bigger than the pair it replaces: shove it clear of its
      // neighbours right now, before it ever gets drawn overlapped
      for (var rl = 0; rl < 12; rl++) {
        var moved = false;
        for (var k = 0; k < fruits.length; k++) {
          var o = fruits[k];
          if (o.dead) continue;
          var ddx = nf.x - o.x, ddy = nf.y - o.y;
          var rr2 = nf.r + o.r;
          var dd = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
          if (dd >= rr2) continue;
          // a neighbour already pressed against the glass can't be shoved
          // into it, so on that axis the newborn has to make the room itself
          var ux = ddx / dd, uy = ddy / dd;
          var ox = (o.pinL && ux > 0) || (o.pinR && ux < 0) ? 0 : 1;
          var oy = o.onFloor && uy < 0 ? 0 : 1;
          var ov = rr2 - dd, s = ov / (nf.im + o.im * (ox * ux * ux + oy * uy * uy));
          nf.x += ux * s * nf.im; nf.y += uy * s * nf.im;
          o.x -= ox * ux * s * o.im; o.y -= oy * uy * s * o.im;
          if (o.x - o.r < JL) o.x = JL + o.r;
          if (o.x + o.r > JR) o.x = JR - o.r;
          if (o.y + o.r > FLOOR) o.y = FLOOR - o.r;
          moved = true;
        }
        if (nf.x - nf.r < JL) { nf.x = JL + nf.r; moved = true; }
        if (nf.x + nf.r > JR) { nf.x = JR - nf.r; moved = true; }
        if (nf.y + nf.r > FLOOR) { nf.y = FLOOR - nf.r; moved = true; }
        if (!moved) break;
      }
      nf.px = nf.x; nf.py = nf.y; // its travel this step starts here, not mid-shove
      fruits.push(nf);
      mergeMark(nf.x, nf.y, nf.r, TIERS[t].col, nf);
      score += MERGE_SCORE[t + 1];
      sfxMerge(t + 1);
      if (t + 1 === TIERS.length - 1) sfxMelon(); // first watermelon fanfare
    }
    // a new best is saved the moment the score passes it, not only when the
    // jar overflows, so closing the tab mid-jar keeps it
    best.submit(score);
    refreshHud();
  }

  function juice(x, y, col, r) {
    if (reduced()) return;
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * (140 + r * 2);
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, t: 0, life: 0.5 + Math.random() * 0.3, col: col, s: 2 + Math.random() * 3.5 });
    }
    particles.push({ x: x, y: y, t: 0, life: 0.35, ring: true, col: col, s: r });
  }

  // Visual FX off: juice() makes no splatter, so a merge gets a steady ring in
  // the juice colour instead: round the newborn fruit (following it as it
  // settles) or, for two watermelons, where they vanished. It holds for
  // MARK_LIFE seconds of play, then the particle update drops it.
  var MARK_LIFE = 0.5;
  function mergeMark(x, y, r, col, fruit) {
    if (!reduced()) return;
    particles.push({ x: x, y: y, t: 0, life: MARK_LIFE, still: true, col: col, s: r + 5, f: fruit });
  }

  function gameOver() {
    state = "over";
    best.submit(score);
    sfxOver();
    document.getElementById("finalScore").textContent = score;
    // (against the best as the jar began: the stored one has kept pace mid-run;
    // a tie, or an empty first jar, isn't a new best)
    document.getElementById("overBest").textContent = score > 0 && score > runBest ? "★ New best!" : "Best: " + best.get();
    document.getElementById("overScreen").classList.remove("hidden");
    refreshHud();
  }

  // ---- drawing ---------------------------------------------------------------
  // the landing squash: flat and wide at the touch, a little stretch back up,
  // settled by SQ_T; it keeps the fruit's bottom where it sits
  var SQ_T = 0.32;
  function squashOf(f) {
    if (!f.sq) return 0;
    return f.sq.a * Math.exp(-f.sq.t * 11) * Math.cos(f.sq.t * 26);
  }
  function drawFruit(f) {
    var sp = SPRITES[f.tier], k = squashOf(f);
    ctx.save();
    ctx.translate(f.x, f.y + f.r * k);
    if (k) ctx.scale(1 + k, 1 - k);
    ctx.rotate(f.rot);
    drawSprite(sp, 0, 0);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var T = performance.now() / 1000;

    // glass back wall (a whisper of tint)
    ctx.fillStyle = "rgba(190, 225, 235, 0.16)";
    ctx.fillRect(JL - GLASS, RIM, JR - JL + GLASS * 2, FLOOR - RIM + GLASS);

    // the fill line
    var warn = dangerT > 0.03;
    // the warning pulses with Visual FX on; with it off it holds steady
    ctx.strokeStyle = warn
      ? "rgba(210, 60, 40," + (reduced() ? 0.85 : 0.55 + 0.35 * Math.sin(T * 10)) + ")"
      : "rgba(160, 106, 51, 0.5)";
    ctx.setLineDash([9, 7]);
    ctx.lineWidth = warn ? 2.5 : 1.5;
    ctx.beginPath(); ctx.moveTo(JL - 6, LOSE_Y); ctx.lineTo(JR + 6, LOSE_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "700 11px 'Baloo 2', sans-serif";
    ctx.fillStyle = warn ? "rgba(210,60,40,0.9)" : "rgba(160,106,51,0.7)";
    ctx.textAlign = "left";
    ctx.fillText("FILL LINE", JL - 4, LOSE_Y - 6);

    // aim guide + the fruit waiting to drop
    if (state === "play") {
      var r = TIERS[current].r;
      var ax = Math.max(JL + r + 1, Math.min(JR - r - 1, aimX));
      ctx.strokeStyle = "rgba(90, 50, 24, 0.22)";
      ctx.setLineDash([4, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, DROP_Y + r); ctx.lineTo(ax, FLOOR); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = dropCd > 0 ? 0.45 : 1;
      drawSprite(SPRITES[current], ax, DROP_Y);
      ctx.globalAlpha = 1;
    }

    // fruit
    for (var i = 0; i < fruits.length; i++) drawFruit(fruits[i]);

    // juice
    for (i = 0; i < particles.length; i++) {
      var p = particles[i], k = p.t / p.life;
      if (p.still) { // FX off: a steady merge ring, no growth or fade
        var rx = p.f ? p.f.x : p.x, ry = p.f ? p.f.y : p.y;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = p.col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(rx, ry, p.s, 0, 7); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(rx, ry, p.s, 0, 7); ctx.stroke();
        continue;
      }
      ctx.globalAlpha = 1 - k;
      if (p.ring) {
        ctx.strokeStyle = p.col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.6 + k * 0.9), 0, 7); ctx.stroke();
      } else {
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // glass jar in front: walls, bottom, rim, highlight. The glass's INNER
    // face sits exactly on the walls and floor the fruit collide with, so
    // fruit come to rest against the glass rather than a few px shy of it.
    var g = GLASS / 2, C = 16; // stroke runs down the middle of the glass
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(215, 240, 248, 0.5)";
    ctx.lineWidth = GLASS;
    ctx.beginPath();
    ctx.moveTo(JL - g, RIM - 8);
    ctx.lineTo(JL - g, FLOOR + g - C);
    ctx.quadraticCurveTo(JL - g, FLOOR + g, JL - g + C, FLOOR + g);
    ctx.lineTo(JR + g - C, FLOOR + g);
    ctx.quadraticCurveTo(JR + g, FLOOR + g, JR + g, FLOOR + g - C);
    ctx.lineTo(JR + g, RIM - 8);
    ctx.stroke();
    // a sparkle down the left pane
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(JL - g, RIM + 40); ctx.lineTo(JL - g, RIM + 150); ctx.stroke();
    // rim lip
    ctx.strokeStyle = "rgba(200, 232, 242, 0.75)";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(JL - g - 7, RIM - 10); ctx.lineTo(JL - g + 7, RIM - 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(JR + g - 7, RIM - 10); ctx.lineTo(JR + g + 7, RIM - 10); ctx.stroke();
  }

  // ---- HUD -------------------------------------------------------------------
  // The little side canvases render at the device pixel ratio so they're crisp.
  var DPR2 = Math.min(window.devicePixelRatio || 1, 3);
  function hiDpi(id, cssW, cssH) {
    var el = document.getElementById(id);
    el.style.width = cssW + "px"; el.style.height = cssH + "px";
    el.width = Math.round(cssW * DPR2); el.height = Math.round(cssH * DPR2);
    var g = el.getContext("2d");
    g.setTransform(DPR2, 0, 0, DPR2, 0, 0);
    return g;
  }
  var CHAIN_W = 100, ICON_R = 15, CHAIN = chainLayout();
  var nextCtx = hiDpi("next", 86, 86);
  var chainCtx = hiDpi("chain", CHAIN_W, CHAIN.h);
  function refreshHud() {
    document.getElementById("score").textContent = score;
    document.getElementById("best").textContent = Math.max(best.get(), score);
    nextCtx.clearRect(0, 0, 86, 86);
    var scale = Math.min(1, 34 / TIERS[next].r);
    nextCtx.save();
    nextCtx.translate(43, 43);
    nextCtx.scale(scale, scale);
    paintFruit(nextCtx, next); // vectors at the panel's own resolution
    nextCtx.restore();
  }
  // The little evolution ladder. Every fruit at one body size, painted as
  // vectors at the panel's resolution (not a big sprite squashed down, which
  // came out jagged for the large fruit and soft for the small), on an even
  // step that's just tall enough for the tallest stem or crown to sit in the
  // gap instead of on the fruit above.
  function chainLayout() {
    var i, slots = [], step = 0, edge = 4;
    for (i = 0; i < TIERS.length; i++) {
      var k = ICON_R / TIERS[i].r, ext = SPRITES[i].ext;
      slots.push({ k: k, up: ext.up * k, down: ext.down * k });
      if (i) step = Math.max(step, slots[i - 1].down + slots[i].up + 3);
    }
    for (i = 0; i < slots.length; i++) slots[i].y = edge + slots[0].up + i * step;
    var last = slots[slots.length - 1];
    return { slots: slots, h: Math.ceil(last.y + last.down + edge) };
  }
  function drawChain() {
    var g = chainCtx, slots = CHAIN.slots;
    g.clearRect(0, 0, CHAIN_W, CHAIN.h);
    g.strokeStyle = "rgba(160,106,51,0.5)";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(CHAIN_W / 2, slots[0].y); g.lineTo(CHAIN_W / 2, slots[slots.length - 1].y); g.stroke();
    for (var i = 0; i < slots.length; i++) {
      g.save(); g.translate(CHAIN_W / 2, slots[i].y); g.scale(slots[i].k, slots[i].k);
      paintFruit(g, i);
      g.restore();
    }
  }

  // ---- input -----------------------------------------------------------------
  function canvasX(e) {
    var rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) / rect.width * W;
  }
  canvas.addEventListener("pointermove", function (e) { aimX = canvasX(e); });
  canvas.addEventListener("pointerdown", function (e) {
    aimX = canvasX(e);
    if (state === "play") drop();
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    if (P.isPaused()) return;                          // paused: no aiming, no dropping
    if (e.key === "ArrowLeft") { e.preventDefault(); aimX -= e.repeat ? 14 : 22; }
    else if (e.key === "ArrowRight") { e.preventDefault(); aimX += e.repeat ? 14 : 22; }
    else if (e.key === " " || e.key === "ArrowDown") { e.preventDefault(); if (!e.repeat) drop(); }
    aimX = Math.max(JL, Math.min(JR, aimX));
  });
  document.getElementById("againBtn").addEventListener("click", reset);

  // ---- pause + loop ------------------------------------------------------------
  var P = window.GameShell
    ? GameShell.pausable({ canPause: function () { return state === "play"; } })
    : { isPaused: function () { return false; } };
  // The game opens on an empty jar, already in play. Until the first fruit
  // drops there's nothing to lose, so leaving asks first only once a fruit is
  // in the jar (paused included), pausing through P; an empty jar and the
  // overflow card don't
  if (window.GameShell) GameShell.guardLeave({ active: function () { return state === "play" && dropped; }, pausable: P });

  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    // (never below 0: the first frame's timestamp can come before `last` was
    // read, and a negative step ran the overflow timer up on an empty jar,
    // ending a fresh game by itself on a slow load)
    var dt = Math.max(0, Math.min((now - last) / 1000, 0.04));
    last = now;
    if (!P.isPaused()) {
      if (state === "play") {
        // two substeps keep tall stacks calm
        physics(dt / 2);
        physics(dt / 2);
      }
      draw();
    }
  }
  reset();
  requestAnimationFrame(loop);

  // test hook
  window.__game = {
    get fruits() { return fruits; },
    get state() { return state; },
    get score() { return score; },
    get dangerT() { return dangerT; },
    get particles() { return particles; },
    squash: function (f) { return squashOf(f); },
    setQueue: function (c, n) { current = c; next = n; refreshHud(); },
    setAim: function (x) { aimX = x; },
    drop: drop,
    reset: reset,
  };
})();
