/* Jam Jar — a Suika-style merge-drop. Drop fruit into a preserving jar; two of
   a kind squish into the next fruit up the chain. Overflow the jar and the
   preserves are ruined. Plain circle physics, no libraries. */
(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;

  // jar interior
  var JL = 58, JR = W - 58, FLOOR = H - 34, RIM = 96;
  var LOSE_Y = 152;      // the fill line — settled fruit above this ends the run
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
  function buildSprites() {
    SPRITES = TIERS.map(function (t, ti) {
      var r = t.r, pad = 14, s = document.createElement("canvas");
      s.width = s.height = (r + pad) * 2;
      var g = s.getContext("2d");
      g.translate(r + pad, r + pad);
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
        g.beginPath(); g.moveTo(0, -r * 0.85); g.quadraticCurveTo(r * 0.35, -r * 1.4, r * 0.15, -r * 1.7); g.stroke();
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
        for (var pI = 0; pI < 14; pI++) {
          var pa = Math.random() * Math.PI * 2, pd = Math.sqrt(Math.random()) * r * 0.75;
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
      return { c: s, off: r + pad };
    });
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
  var score = 0, aimX = W / 2, dropCd = 0, dangerT = 0;
  var current = 0, next = 0;
  function rndTier() { var r = Math.random(); return r < 0.30 ? 0 : r < 0.55 ? 1 : 0.75 > r ? 2 : r < 0.9 ? 3 : 4; }
  function reduced() { return !!(window.RM_ON && window.RM_ON()); }

  function reset() {
    fruits = []; particles = [];
    score = 0; dropCd = 0; dangerT = 0; state = "play";
    current = rndTier(); next = rndTier();
    refreshHud();
    drawChain();
    document.getElementById("overScreen").classList.add("hidden");
  }

  function makeFruit(x, y, tier) {
    var r = TIERS[tier].r;
    return { x: x, y: y, vx: 0, vy: 0, r: r, tier: tier, im: 1 / (r * r), mergeCd: 0.1,
             rot: Math.random() * 0.4 - 0.2, w: 0, touch: false, contacted: false, dead: false };
  }

  function drop() {
    if (state !== "play" || dropCd > 0) return;
    var r = TIERS[current].r;
    var x = Math.max(JL + r + 1, Math.min(JR - r - 1, aimX));
    fruits.push(makeFruit(x, DROP_Y, current));
    sfxDrop();
    current = next; next = rndTier();
    dropCd = 0.45;
    refreshHud();
  }

  // ---- physics ---------------------------------------------------------------
  var GRAV = 1500, REST = 0.22, WALL_REST = 0.38, MU = 0.15;
  function physics(dt) {
    var i, j, f;
    for (i = 0; i < fruits.length; i++) {
      f = fruits[i];
      f.vy += GRAV * dt;
      f.vx *= 0.9995;               // barely any air drag — momentum carries
      f.rot += f.w * dt;
      f.w *= 0.999;
      f.touch = false;
      f.supMin = Infinity; f.supMax = -Infinity; f.supSide = 0; f.supNy = 0; f.supFlat = false;
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
          if (d2 >= rr * rr || d2 === 0) continue;
          var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          var overlap = rr - d;
          a.contacted = b.contacted = true;
          // same tier touching → merge (queued; each fruit merges once per frame)
          if (iter === 0 && a.tier === b.tier && a.mergeCd <= 0 && b.mergeCd <= 0) {
            a.dead = b.dead = true;
            merges.push([a, b]);
            continue;
          }
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
          }
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
          f.onFloor = true;
          f.supFlat = true;
        } else f.onFloor = false;
      }
    }
    // rolling: anything in contact turns with its own travel (ω → v/r), and
    // floor-rollers feel a touch of rolling resistance instead of a handbrake
    for (i = 0; i < fruits.length; i++) {
      f = fruits[i];
      if (f.touch) {
        f.w += (f.vx / f.r - f.w) * Math.min(1, dt * 20);
        // Cradled = the floor, or supports on BOTH sides. Perched = balanced
        // on one off-centre contact — that fruit must tip and roll off, so it
        // never gets the sleep treatment.
        var lip = f.r * 0.08;
        var cradled = f.supFlat || (f.supMin < -lip && f.supMax > lip);
        f.perched = false;
        if (cradled) {
          f.tipDir = 0;
          if (Math.abs(f.vx) < 12) f.w *= 0.82; // resting fruit stops turning
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
      }
      var wMax = 900 / f.r;                      // never a blur, even for berries
      if (f.w > wMax) f.w = wMax; if (f.w < -wMax) f.w = -wMax;
    }
    // (merges are applied inside the iteration loop above)

    // overflow: settled fruit sitting above the fill line
    var danger = false;
    for (i = 0; i < fruits.length; i++) {
      f = fruits[i];
      if (f.contacted && f.y - f.r * 0.4 < LOSE_Y && Math.abs(f.vy) < 90 && Math.abs(f.vx) < 90) { danger = true; break; }
    }
    dangerT = danger ? dangerT + dt : Math.max(0, dangerT - dt * 2);
    if (dangerT > 1.15 && state === "play") gameOver();

    if (dropCd > 0) dropCd -= dt;

    // particles
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt;
    }
  }

  function applyMerge(pa, pb) {
    var t = pa.tier;
    var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    juice(mx, my, TIERS[t].col, TIERS[t].r);
    if (t === TIERS.length - 1) {             // two watermelons vanish in glory
      score += 100;
      sfxMelon();
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
          var ov = rr2 - dd, tm2 = nf.im + o.im;
          nf.x += ddx / dd * ov * (nf.im / tm2);
          nf.y += ddy / dd * ov * (nf.im / tm2);
          o.x -= ddx / dd * ov * (o.im / tm2);
          o.y -= ddy / dd * ov * (o.im / tm2);
          moved = true;
        }
        if (nf.x - nf.r < JL) { nf.x = JL + nf.r; moved = true; }
        if (nf.x + nf.r > JR) { nf.x = JR - nf.r; moved = true; }
        if (nf.y + nf.r > FLOOR) { nf.y = FLOOR - nf.r; moved = true; }
        if (!moved) break;
      }
      fruits.push(nf);
      score += MERGE_SCORE[t + 1];
      sfxMerge(t + 1);
      if (t + 1 === TIERS.length - 1) sfxMelon(); // first watermelon fanfare
    }
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

  function gameOver() {
    state = "over";
    best.submit(score);
    sfxOver();
    document.getElementById("finalScore").textContent = score;
    document.getElementById("overBest").textContent = score >= best.get() ? "★ New best!" : "Best: " + best.get();
    document.getElementById("overScreen").classList.remove("hidden");
    refreshHud();
  }

  // ---- drawing ---------------------------------------------------------------
  function drawFruit(f) {
    var sp = SPRITES[f.tier];
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.drawImage(sp.c, -sp.off, -sp.off);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var T = performance.now() / 1000;

    // glass back wall (a whisper of tint)
    ctx.fillStyle = "rgba(190, 225, 235, 0.16)";
    ctx.fillRect(JL - 8, RIM, JR - JL + 16, FLOOR - RIM + 14);

    // the fill line
    var warn = dangerT > 0.03;
    ctx.strokeStyle = warn
      ? "rgba(210, 60, 40," + (0.55 + 0.35 * Math.sin(T * 10)) + ")"
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
      var spc = SPRITES[current];
      ctx.drawImage(spc.c, ax - spc.off, DROP_Y - spc.off);
      ctx.globalAlpha = 1;
    }

    // fruit
    for (var i = 0; i < fruits.length; i++) drawFruit(fruits[i]);

    // juice
    for (i = 0; i < particles.length; i++) {
      var p = particles[i], k = p.t / p.life;
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

    // glass jar in front: walls, bottom, rim, highlight
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(215, 240, 248, 0.5)";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(JL - 9, RIM - 8);
    ctx.lineTo(JL - 9, FLOOR - 6);
    ctx.quadraticCurveTo(JL - 9, FLOOR + 10, JL + 10, FLOOR + 10);
    ctx.lineTo(JR - 10, FLOOR + 10);
    ctx.quadraticCurveTo(JR + 9, FLOOR + 10, JR + 9, FLOOR - 6);
    ctx.lineTo(JR + 9, RIM - 8);
    ctx.stroke();
    // inner sparkle on the left wall
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(JL + 2, RIM + 40); ctx.lineTo(JL + 2, RIM + 150); ctx.stroke();
    // rim lip
    ctx.strokeStyle = "rgba(200, 232, 242, 0.75)";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(JL - 16, RIM - 10); ctx.lineTo(JL - 2, RIM - 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(JR + 2, RIM - 10); ctx.lineTo(JR + 16, RIM - 10); ctx.stroke();
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
  var nextCtx = hiDpi("next", 86, 86);
  var chainCtx = hiDpi("chain", 100, 410);
  function refreshHud() {
    document.getElementById("score").textContent = score;
    document.getElementById("best").textContent = Math.max(best.get(), score);
    nextCtx.clearRect(0, 0, 86, 86);
    var sp = SPRITES[next];
    var scale = Math.min(1, 34 / TIERS[next].r);
    nextCtx.save();
    nextCtx.translate(43, 43);
    nextCtx.scale(scale, scale);
    nextCtx.drawImage(sp.c, -sp.off, -sp.off);
    nextCtx.restore();
  }
  function drawChain() { // the little evolution ladder
    var g = chainCtx;
    g.clearRect(0, 0, 100, 410);
    g.strokeStyle = "rgba(160,106,51,0.5)";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(50, 20); g.lineTo(50, 390); g.stroke();
    for (var i = 0; i < TIERS.length; i++) {
      var y = 22 + i * 37;
      var sp = SPRITES[i];
      var scale = Math.min(1, 17 / TIERS[i].r);
      g.save(); g.translate(50, y); g.scale(scale, scale);
      g.drawImage(sp.c, -sp.off, -sp.off);
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

  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min((now - last) / 1000, 0.04);
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
    setQueue: function (c, n) { current = c; next = n; refreshHud(); },
    setAim: function (x) { aimX = x; },
    drop: drop,
    reset: reset,
  };
})();
