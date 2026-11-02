/* Jam Jar: a Suika-style merge-drop. Drop fruit into a preserving jar; two of
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
  var LOSE_Y = 116;      // the fill line: settled fruit above this ends the run
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
    if (inCpu) return;   // (the CPU's jar plays without a sound: the ones you hear are yours)
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

  // ---- fruit sprites (each tier's body drawn once; its face drawn live) -------
  // Every tier wears its own face: same family, different personalities.
  // `u` is how far through its idle the fruit is (0 to 1, see idleU), or
  // below 0 at rest: every idle starts and ends on the face at rest, drawn
  // by exactly the calls that draw it then.
  function faceFor(g, r, tier, u) {
    var INK = "#3a2417";
    var ex = r * 0.28, ey = -r * 0.12, er = Math.max(1.6, r * 0.07);
    var lw = Math.max(1.4, r * 0.05);
    if (u == null) u = -1;
    var A0 = g.globalAlpha;   // (a fruit drawn faded stays faded: the waiting one, cooling down)
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = lw; g.lineCap = "round";
    function dot(x, y, rr) { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
    function oval(x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, Math.max(0.01, ry), 0, 0, 7); g.fill(); }
    function arcStroke(x, y, rr, a0, a1) { g.beginPath(); g.arc(x, y, rr, a0, a1); g.stroke(); }
    // (an arc pressed flat by ky: a ^ closing to a line, or opening from one)
    function arcFlat(x, y, rr, a0, a1, ky) {
      if (ky >= 1) { arcStroke(x, y, rr, a0, a1); return; }
      g.beginPath();
      for (var i = 0; i <= 12; i++) { var a = a0 + (a1 - a0) * i / 12; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * ky); }
      g.stroke();
    }
    function blush(col) {
      g.fillStyle = col || "rgba(255,120,120,0.4)";
      g.beginPath(); g.ellipse(-r * 0.5, r * 0.12, r * 0.13, r * 0.08, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(r * 0.5, r * 0.12, r * 0.13, r * 0.08, 0, 0, 7); g.fill();
      g.fillStyle = INK;
    }
    // (the face lifted or lowered by dy for a bob, a hop or a nod; untouched at rest)
    function shift(dy) { if (dy) { g.save(); g.translate(0, dy); } return dy; }
    function unshift(dy) { if (dy) g.restore(); }
    var a, b, d, o, s;
    switch (tier) {
      case 0: // blueberry: wide baby eyes, little "o" mouth
        // idle: a big slow blink, then a hiccup (the "o" puffs and the face jolts up)
        o = 1 - 0.9 * bump(u, 0.04, 0.34); a = bump(u, 0.5, 0.78);
        d = shift(-r * 0.06 * a);
        if (o === 1) { dot(-ex, ey, er * 1.25); dot(ex, ey, er * 1.25); }
        else { oval(-ex, ey, er * 1.25, er * 1.25 * o); oval(ex, ey, er * 1.25, er * 1.25 * o); }
        if (o > 0.6) { g.fillStyle = "#fff"; dot(-ex + er * 0.4, ey - er * 0.4 * o, er * 0.4); dot(ex + er * 0.4, ey - er * 0.4 * o, er * 0.4); }
        g.fillStyle = INK;
        g.beginPath(); g.arc(0, r * 0.14, r * 0.08 * (1 + 0.5 * a), 0, 7); g.stroke();
        unshift(d);
        break;
      case 1: // cherry: a wink and a cheeky grin
        // idle: the wink swaps to the other eye, the tongue pokes out further, and back
        s = ramp(u, 0.1, 0.28) - ramp(u, 0.72, 0.9); a = bump(u, 0.38, 0.66);
        wink(-ex, 1 - s); wink(ex, s);
        arcStroke(0, r * 0.02, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
        // the tongue tip, poking out of the grin: a U from the grin's line and back to it
        // (its two ends on the arc above: x 0.14 r and 0.04 r on a circle of 0.2 r round (0, 0.02 r))
        g.beginPath(); g.moveTo(r * 0.14, r * 0.1628);
        g.bezierCurveTo(r * (0.17 + 0.02 * a), r * (0.27 + 0.08 * a), r * 0.05, r * (0.33 + 0.08 * a), r * 0.04, r * 0.216); g.stroke();
        break;
      case 2: // strawberry: happy closed eyes, big smile
        // idle: a giggle, two quick bobs, the smile wider and the blush glowing
        a = bump(u, 0.05, 0.75); d = shift(-r * 0.075 * (bump(u, 0.08, 0.3) + bump(u, 0.3, 0.52)));
        arcStroke(-ex, ey, er * 1.3, Math.PI * 1.1, Math.PI * 1.9);
        arcStroke(ex, ey, er * 1.3, Math.PI * 1.1, Math.PI * 1.9);
        arcStroke(0, r * 0.02, r * 0.24 * (1 + 0.12 * a), 0.15 * Math.PI, 0.85 * Math.PI);
        unshift(d);
        blush(a ? "rgba(255,120,120," + (0.4 + 0.25 * a) + ")" : null);
        break;
      case 3: // plum: sleepy lids and a tiny content smile
        // idle: a slow yawn, the mouth opening to an O while the lids droop, and back
        a = ramp(u, 0.05, 0.35) - ramp(u, 0.62, 0.9); d = er * 0.45 * a;
        g.beginPath(); g.moveTo(-ex - er, ey + d); g.lineTo(-ex + er, ey + d); g.stroke();
        g.beginPath(); g.moveTo(ex - er, ey + d); g.lineTo(ex + er, ey + d); g.stroke();
        if (!a) arcStroke(0, r * 0.08, r * 0.12, 0.2 * Math.PI, 0.8 * Math.PI);
        else {
          // (the smile itself opening into the O: its corners drawing in, the
          // lip under it dropping, one over it rising from the line between its
          // corners; never the smile and the O at once)
          var mw = r * (0.097 - 0.027 * a), my = r * (0.15 - 0.02 * a);
          g.beginPath();
          g.ellipse(0, my, mw, r * (0.05 + 0.07 * a), 0, 0, Math.PI);
          g.ellipse(0, my, mw, Math.max(0.01, r * 0.1 * a), 0, Math.PI, Math.PI * 2);
          g.closePath(); g.fill(); g.stroke();
        }
        break;
      case 4: // apricot: joyful ^ ^ and an open smile
        // idle: a happy hop and a little one after, the eyes squeezing, the smile wider
        a = bump(u, 0.04, 0.62); d = shift(-r * 0.1 * bump(u, 0.06, 0.36) - r * 0.05 * bump(u, 0.4, 0.6));
        arcStroke(-ex, ey + er * 0.3, er * 1.2 * (1 - 0.12 * a), Math.PI * 1.15, Math.PI * 1.85);
        arcStroke(ex, ey + er * 0.3, er * 1.2 * (1 - 0.12 * a), Math.PI * 1.15, Math.PI * 1.85);
        g.beginPath(); g.arc(0, r * 0.06, r * 0.16 * (1 + 0.15 * a), 0.1 * Math.PI, 0.9 * Math.PI); g.closePath(); g.fill();
        unshift(d);
        break;
      case 5: // apple: determined brows and a grin
        // idle: game face, the brows dipping and the eyes narrowing, then a firm nod
        a = ramp(u, 0.05, 0.25) - ramp(u, 0.75, 0.92); d = shift(r * 0.05 * bump(u, 0.42, 0.62));
        if (a) { oval(-ex, ey, er, er * (1 - 0.35 * a)); oval(ex, ey, er, er * (1 - 0.35 * a)); }
        else { dot(-ex, ey, er); dot(ex, ey, er); }
        g.beginPath(); g.moveTo(-ex - er * 1.2, ey - er * (1.8 - 0.2 * a)); g.lineTo(-ex + er * 0.8, ey - er * (1.1 - 0.5 * a)); g.stroke();
        g.beginPath(); g.moveTo(ex + er * 1.2, ey - er * (1.8 - 0.2 * a)); g.lineTo(ex - er * 0.8, ey - er * (1.1 - 0.5 * a)); g.stroke();
        arcStroke(0, r * 0.02, r * 0.2, 0.2 * Math.PI, 0.8 * Math.PI);
        unshift(d);
        break;
      case 6: // peach: shy sideways glance and a blush
        // idle: a glance the other way and back, the blush deepening
        a = ramp(u, 0.08, 0.26) - ramp(u, 0.62, 0.82); s = 1 - 2 * a;
        dot(-ex + er * (0.7 - 1.7 * a), ey, er); dot(ex + er * (0.7 - 1.7 * a), ey, er);
        arcStroke(er * 0.5 * s, r * 0.09, r * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
        blush("rgba(230,90,90," + (a ? 0.45 + 0.22 * a : 0.45) + ")");
        break;
      case 7: // grapefruit: deadpan, the same flat brows, now over a plain smile
        // idle: one brow slowly rises, unimpressed (its eye a touch wider), and drops
        a = ramp(u, 0.08, 0.4) - ramp(u, 0.7, 0.92);
        dot(-ex, ey, er); dot(ex, ey, er * (1 + 0.15 * a));
        g.beginPath(); g.moveTo(-ex - er, ey - er * 1.6); g.lineTo(-ex + er, ey - er * 1.6); g.stroke();
        g.beginPath(); g.moveTo(ex - er, ey - er * (1.6 + 1.1 * a)); g.lineTo(ex + er, ey - er * (1.6 + 1.5 * a)); g.stroke();
        arcStroke(0, r * 0.02, r * 0.2, 0.2 * Math.PI, 0.8 * Math.PI);
        break;
      case 8: // pineapple: too cool, a shades bar and a smirk
        // idle: the shades slide down for a peek over them and push back up, the smirk lifting
        a = ramp(u, 0.1, 0.3) - ramp(u, 0.66, 0.86); d = er * 1.5 * a;
        if (a) { dot(-ex, ey - er * 0.1, er * 0.85); dot(ex, ey - er * 0.1, er * 0.85); }
        g.fillRect(-ex - er * 1.6, ey - er * 0.9 + d, (ex + er * 1.6) * 2, er * 1.8);
        g.beginPath(); g.moveTo(-ex - er * 1.6, ey - er * 0.4 + d); g.lineTo(-r * 0.55, ey - er * 0.8 + d); g.stroke();
        g.beginPath(); g.moveTo(ex + er * 1.6, ey - er * 0.4 + d); g.lineTo(r * 0.55, ey - er * 0.8 + d); g.stroke();
        g.beginPath(); g.moveTo(-r * 0.06, r * 0.14); g.quadraticCurveTo(r * 0.1, r * (0.2 - 0.05 * a), r * 0.16, r * (0.1 - 0.04 * a)); g.stroke();
        break;
      case 9: // melon: the serene elder, spectacles and closed eyes
        // idle: the eyes open for a calm peek, a glint crosses the glasses, and they close
        o = ramp(u, 0.12, 0.3) - ramp(u, 0.64, 0.84);
        // a ∪ arc draws below its centre, so lift it to sit mid-lens
        if (o) g.globalAlpha = A0 * (1 - o);
        arcStroke(-ex, ey - er * 0.8, er * 1.15, 0.15 * Math.PI, 0.85 * Math.PI); // ∪ closed eyes
        arcStroke(ex, ey - er * 0.8, er * 1.15, 0.15 * Math.PI, 0.85 * Math.PI);
        g.globalAlpha = A0;
        if (o) { dot(-ex, ey, er * 0.9 * o); dot(ex, ey, er * 0.9 * o); }
        g.lineWidth = lw * 0.7;
        arcStroke(-ex, ey, er * 2, 0, 7); arcStroke(ex, ey, er * 2, 0, 7); // glasses
        g.beginPath(); g.moveTo(-ex + er * 2, ey); g.lineTo(ex - er * 2, ey); g.stroke();
        // (the glint: a streak across each lens in turn, inside its rim)
        [[-ex, 0.3, 0.52], [ex, 0.4, 0.62]].forEach(function (L) {
          var gb = bump(u, L[1], L[2]);
          if (!gb) return;
          var gp = (u - L[1]) / (L[2] - L[1]);
          g.save();
          g.beginPath(); g.arc(L[0], ey, er * 2 - lw * 0.35, 0, 7); g.clip();
          g.strokeStyle = "rgba(255,255,255," + (0.9 * gb) + ")"; g.lineWidth = lw * 1.5;
          g.beginPath(); g.moveTo(L[0] - er * 3 + er * 4.4 * gp, ey - er * 2.2); g.lineTo(L[0] - er * 4.4 + er * 4.4 * gp, ey + er * 2.2); g.stroke();
          g.restore();
        });
        g.lineWidth = lw;
        arcStroke(0, r * 0.06, r * 0.14, 0.2 * Math.PI, 0.8 * Math.PI);
        break;
      default: // watermelon: the beaming king, starry eyes, huge open grin
        // idle: the star eyes twinkle round a full turn, swelling, and the grin widens
        s = ramp(u, 0.08, 0.7); a = bump(u, 0.08, 0.7); b = bump(u, 0.15, 0.75);
        g.save();
        g.translate(-ex, ey); if (a) { g.rotate(s * Math.PI * 2); g.scale(1 + 0.25 * a, 1 + 0.25 * a); } star(g, er * 1.5); g.restore();
        g.save();
        g.translate(ex, ey); if (a) { g.rotate(-s * Math.PI * 2); g.scale(1 + 0.25 * a, 1 + 0.25 * a); } star(g, er * 1.5); g.restore();
        g.beginPath(); g.arc(0, r * 0.05, r * 0.24 * (1 + 0.1 * b), 0.08 * Math.PI, 0.92 * Math.PI); g.closePath(); g.fill();
        g.fillStyle = "#e0413f";
        g.beginPath(); g.arc(0, r * 0.21 + r * 0.024 * b, r * 0.1 * (1 + 0.1 * b), Math.PI, 0); g.fill();
        g.fillStyle = INK;
    }
    // (an eye open (1) or winking (0): a dot pressing flat to a line, then a ^ rising from it)
    function wink(x, op) {
      if (op >= 1) dot(x, ey, er);
      else if (op <= 0) arcStroke(x, ey, er * 1.1, Math.PI * 1.15, Math.PI * 1.85); // winking eye ^
      else if (op > 0.5) oval(x, ey, er, er * (op - 0.5) * 2);
      else arcFlat(x, ey, er * 1.1, Math.PI * 1.15, Math.PI * 1.85, (0.5 - op) * 2);
    }
  }
  // (0 to 1 and back over [a, b] of an idle, eased in and out; 0 outside it and at rest)
  function bump(u, a, b) { if (u < a || u > b) return 0; var s = Math.sin(Math.PI * (u - a) / (b - a)); return s * s; }
  // (0 to 1 over [a, b] of an idle, eased; 0 before it and at rest, 1 after)
  function ramp(u, a, b) { if (u <= a) return 0; if (u >= b) return 1; var x = (u - a) / (b - a); return x * x * (3 - 2 * x); }
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
  // the grapefruit's pores are scattered once, so every drawing of it: in
  // the jar, in Next, on the ladder: is the same fruit
  var PORES = [];
  for (var pI0 = 0; pI0 < 14; pI0++) PORES.push([Math.random() * Math.PI * 2, Math.sqrt(Math.random()) * 0.75]);
  // Paints tier ti as vectors at its true radius, centred on the origin. Any
  // scale already on g applies to the paths themselves, so a small copy is
  // as crisp as the big one. `u`: where it is in its idle (faceFor); `bare`:
  // the body alone, its face left to be drawn live over it.
  function paintFruit(g, ti, u, bare) {
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
    if (!bare) faceFor(g, r, ti, u);
  }
  // each sprite is `size` logical px square, painted at the canvas's pixel
  // ratio (so drawn with an explicit size: drawSprite). A tier's sprite has
  // its face, for how far its ink reaches; its body is the same without it,
  // drawn under a face drawn live (drawFace), which can move.
  var BODIES = [];
  function buildSprites() {
    function sprite(ti, bare) {
      var r = TIERS[ti].r, pad = 16, s = document.createElement("canvas"); // room for the cherry's stem tip
      var size = (r + pad) * 2;
      s.width = s.height = Math.round(size * dpr);
      var g = s.getContext("2d");
      g.scale(dpr, dpr);
      g.translate(r + pad, r + pad);
      paintFruit(g, ti, -1, bare);
      return { c: s, off: r + pad, size: size, ext: bare ? null : inkRows(s, r + pad, dpr) };
    }
    SPRITES = TIERS.map(function (t, ti) { return sprite(ti, false); });
    BODIES = TIERS.map(function (t, ti) { return sprite(ti, true); });
  }
  function drawSprite(sp, x, y) { ctx.drawImage(sp.c, x - sp.off, y - sp.off, sp.size, sp.size); }
  // a fruit of tier ti at (x, y) of the current transform: its body, and its
  // face live over it, `at` its idle's start (idleU)
  function drawFace(ti, x, y, at) {
    drawSprite(BODIES[ti], x, y);
    ctx.save(); ctx.translate(x, y);
    faceFor(ctx, TIERS[ti].r, ti, idleU(at));
    ctx.restore();
  }
  // how far a sprite's ink reaches above and below its centre, and to
  // either side: stems, leaves and crowns included: read off the finished
  // pixels (k of them to a logical px)
  function inkRows(s, off, k) {
    var n = s.width, px = s.getContext("2d").getImageData(0, 0, n, n).data;
    function inked(y) { for (var x = 0; x < n; x++) if (px[(y * n + x) * 4 + 3] > 24) return true; return false; }
    function inkedCol(x) { for (var y = 0; y < n; y++) if (px[(y * n + x) * 4 + 3] > 24) return true; return false; }
    var top = 0, bot = n - 1, lft = 0, rgt = n - 1;
    while (top < bot && !inked(top)) top++;
    while (bot > top && !inked(bot)) bot--;
    while (lft < rgt && !inkedCol(lft)) lft++;
    while (rgt > lft && !inkedCol(rgt)) rgt--;
    return { up: off - top / k, down: (bot + 1) / k - off, left: off - lft / k, right: (rgt + 1) / k - off };
  }
  function lighten(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g2 = n >> 8 & 255, b = n & 255;
    return "rgb(" + Math.round(r + (255 - r) * amt) + "," + Math.round(g2 + (255 - g2) * amt) + "," + Math.round(b + (255 - b) * amt) + ")";
  }
  buildSprites();

  // ---- state -----------------------------------------------------------------
  // Two paces. Slow Simmer: a fruit drops when you click (or tap, or press
  // Space). Rolling Boil: one drops by itself every BOIL_S seconds wherever
  // you're aiming, and a click only aims. Each keeps its own best.
  var MODES = { simmer: "jamjar_best", boil: "jamjar_best_boil" }, BOIL_S = 1;
  var store = window.GameShell ? GameShell.store : { get: function (k, f) { return f; }, set: function () {} };
  var mode = store.get("jamjar_mode", "simmer");
  if (!MODES[mode]) mode = "simmer";
  var bests = {};
  function bestOf(m) {
    if (!bests[m]) bests[m] = window.GameShell ? GameShell.best(MODES[m], { higher: true }) : { get: function () { return 0; }, submit: function () {} };
    return bests[m];
  }
  var best = bestOf(mode);
  var fruits = [], particles = [];
  var state = "menu"; // menu | play | over
  var dropped = false; // a fruit has gone into this jar (until then leaving doesn't ask, see the pause)
  var score = 0, aimX = W / 2, dropCd = 0, dangerT = 0, boilT = BOIL_S;
  var runBest = 0; // the best as this jar began (the stored one climbs mid-run, see applyMerge)
  var current = 0, next = 0, heldAt = 0, nextAt = 0;   // (when the fruit waiting at the top, and the one in Next, came: their idles)
  function rndTier(r) { return r < 0.30 ? 0 : r < 0.55 ? 1 : 0.75 > r ? 2 : r < 0.9 ? 3 : 4; }
  function reduced() { return !!(window.RM_ON && window.RM_ON()); }
  // ---- idles (Visual FX on) ----------------------------------------------------
  // Every fruit has an idle of its own (faceFor), all the same length: IDLE_ACT
  // s of it, then its face at rest, every IDLE_T s from the moment the fruit
  // came (dropped, made by a merge, waiting at the top, shown in Next), so
  // fruit that came apart idle apart; the Preserves' fruit idle together. The
  // clock stops with a pause. With Visual FX off every face rests.
  var IDLE_T = 4, IDLE_ACT = 2, idleT = 0;
  function idleU(at) {
    if (reduced() || at == null) return -1;
    var t = (idleT - at) % IDLE_T;
    if (t < 0) t += IDLE_T;
    return t < IDLE_ACT ? t / IDLE_ACT : -1;
  }
  // The fruit to come: one seeded run for each jar begun, read by each jar at
  // its own count (dealt: the fruit it has dropped), so against the CPU the
  // nth fruit is the same in both jars.
  var seed = 1, seq = [], dealt = 0;
  function rand() {   // (a small seeded generator, mulberry32)
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function fruitAt(i) {
    while (seq.length <= i) seq.push(rndTier(rand()));
    return seq[i];
  }

  // ---- vs CPU ------------------------------------------------------------------
  // Against the CPU it plays a jar of its own, on the very same code as yours.
  // For its step and its drawing its jar is swapped into the jar variables
  // (the fruit, the score, the fruit waiting, the aim ...) and the one not in
  // play waits in `other`; a second swap puts yours back. So `other` is the
  // CPU's jar while yours is in play, and yours while the CPU's is.
  var foe = store.get("jamjar_foe", "solo") === "cpu" ? "cpu" : "solo";
  var inCpu = false, out = false, lastDrop = null;   // out: this jar has overflowed (the other plays on)
  var pops = [];   // the merges' "+N" (popScore)
  var cpuCanvas = document.getElementById("cpu"), cctx = cpuCanvas.getContext("2d"), cpuScale = 0;   // (css px to a jar unit)
  function freshJar() {
    return { fruits: [], particles: [], score: 0, dangerT: 0, dropCd: 0, current: current, next: next, heldAt: idleT, nextAt: idleT, aimX: W / 2,
             dealt: 0, out: false, lastDrop: null, pops: [], ctx: cctx };
  }
  var other = freshJar();
  function swapJar() {
    var o = other, t;
    t = fruits; fruits = o.fruits; o.fruits = t;
    t = particles; particles = o.particles; o.particles = t;
    t = score; score = o.score; o.score = t;
    t = dangerT; dangerT = o.dangerT; o.dangerT = t;
    t = dropCd; dropCd = o.dropCd; o.dropCd = t;
    t = current; current = o.current; o.current = t;
    t = next; next = o.next; o.next = t;
    t = heldAt; heldAt = o.heldAt; o.heldAt = t;
    t = nextAt; nextAt = o.nextAt; o.nextAt = t;
    t = aimX; aimX = o.aimX; o.aimX = t;
    t = dealt; dealt = o.dealt; o.dealt = t;
    t = out; out = o.out; o.out = t;
    t = lastDrop; lastDrop = o.lastDrop; o.lastDrop = t;
    t = pops; pops = o.pops; o.pops = t;
    t = ctx; ctx = o.ctx; o.ctx = t;
    inCpu = !inCpu;
  }
  function asCpu(fn) { swapJar(); try { fn(); } finally { swapJar(); } }
  // the CPU's jar is drawn in the same W×H as yours, at the resolution its
  // smaller size on the page needs
  function fitCpu() {
    var w = cpuCanvas.getBoundingClientRect().width;
    if (!w) return;
    var k = Math.min(dpr, Math.max(0.25, Math.ceil(w * (window.devicePixelRatio || 1) / W * 20) / 20));
    if (cpuCanvas.width !== Math.round(W * k)) { cpuCanvas.width = Math.round(W * k); cpuCanvas.height = Math.round(H * k); }
    cctx.setTransform(k, 0, 0, k, 0, 0);
    cpuScale = w / W;
  }
  // the page as the opponent picked lays it out: the CPU's jar beside yours
  // or not, and the ladder fitted to your jar's new height
  function relayout() {
    document.body.dataset.foe = foe;
    fitCpu();
    layChain();
  }

  // The record against the CPU, for each pace: won, lost, drawn. Your first
  // drop counts the game as lost until it is decided (then put right), so a
  // game walked away from is a loss, and the record can't be padded that way.
  var pending = false;
  function recKey(m) { return "jamjar_vs_" + m + (level === "medium" ? "" : "_" + level); }   // (Medium keeps the first key)
  function vsRecord(m) {
    try {
      var o = JSON.parse(store.get(recKey(m), ""));
      if (o && typeof o === "object") return { w: o.w | 0, l: o.l | 0, d: o.d | 0 };
    } catch (e) {}
    return { w: 0, l: 0, d: 0 };
  }
  function vsSave(m, r) { store.set(recKey(m), JSON.stringify(r)); }
  function vsPlayed() { var r = vsRecord(mode); r.l++; vsSave(mode, r); pending = true; }
  function recordText(m) { var r = vsRecord(m); return "won\u00a0" + r.w + ", lost\u00a0" + r.l + (r.d ? ", drawn\u00a0" + r.d : ""); }   // (a count never wraps away from its word)

  // A jar that overflows stops and the other plays on: it wins the moment its
  // score passes the stopped one's, and if it overflows too, the higher score
  // wins (the same score: a draw). Run after each frame's steps, yours in play.
  function judge() {
    if (foe !== "cpu" || state !== "play") return;
    var me = score, it = other.score;
    if (out && other.out) finish(me > it ? "win" : me < it ? "loss" : "draw");
    else if (out && it > me) finish("loss");
    else if (other.out && me > it) finish("win");
  }
  var TITLES = { win: "You win!", loss: "The CPU wins", draw: "A draw!" };
  function finish(res) {
    state = "over";
    aiming();
    overAt = performance.now();
    var r = vsRecord(mode);
    if (pending) r.l = Math.max(0, r.l - 1);
    pending = false;
    r[res.charAt(0)]++;
    vsSave(mode, r);
    if (res === "win") sfxMelon();
    document.getElementById("overTitle").textContent = TITLES[res];
    document.getElementById("finalScore").textContent = score;
    document.getElementById("cpuFinal").textContent = other.score;
    document.getElementById("overBest").textContent = (mode === "boil" ? "Rolling Boil" : "Slow Simmer") + " vs " + LEVELS[level].name + " CPU: " + recordText(mode);
    document.getElementById("overScreen").classList.remove("hidden");
    refreshHud();
  }

  // ---- the CPU's hand ----------------------------------------------------------
  // It sees what you see: the fruit waiting and the next (in Slow Simmer it
  // never drops a fruit you haven't dropped yet, so neither is ever further
  // on). Its aim slides to its spot as a hand would, the same with Visual FX
  // on or off (where a fruit goes is the game).
  var CPU_AIM_V = 700;   // px a second, in the jar's own units
  var brain = { at: null, wait: 0, since: 0, again: false };
  function think(dt) {   // (run with the CPU's jar in play: asCpu)
    if (out) return;
    if (mode === "boil") {
      // Rolling Boil: its fruit drops with yours on the second; it picks a
      // spot after each drop, and looks again at half time
      if (brain.at === null || (!brain.again && boilT < BOIL_S / 2)) { brain.again = brain.at !== null; brain.at = choose(); }
      slide(dt);
      return;
    }
    // Slow Simmer: once its last fruit has (mostly) settled it picks a spot,
    // slides there and drops it after a moment's thought
    brain.since += dt;
    if (!settled()) return;
    if (brain.at === null) { brain.at = choose(); brain.wait = 0.35 + Math.random() * 0.5; }
    slide(dt);
    if ((brain.wait -= dt) > 0 || Math.abs(aimX - brain.at) > 0.5 || dropCd > 0) return;
    if (dealt >= other.dealt && !other.out) return;   // (waiting for you to drop yours)
    drop();
  }
  function slide(dt) {
    var d = brain.at - aimX, s = CPU_AIM_V * dt;
    aimX += Math.abs(d) <= s ? d : d > 0 ? s : -s;
  }
  function settled() {
    var f = lastDrop;
    return !f || f.dead || brain.since > 1.6 || (f.contacted && Math.abs(f.vx) < 40 && Math.abs(f.vy) < 40);
  }
  // Its pick: every spot across the jar, the fruit dropped straight down onto
  // the pile as it lies now. A spot scores for a twin it comes to rest
  // against (more for a bigger pair, and for a fruit there to take the merge
  // on), and against height (far more near the fill line), a smaller fruit
  // buried under it and odd neighbours. Its level sets how often it drops
  // carelessly (slip: anywhere that isn't over the fill line), how much noise
  // there is in its scoring, how far its hand misses, and how much it plans
  // two fruit at a time (ahead): the one waiting and the next, which you see
  // too, never anything further.
  var LEVELS = {
    easy: { slip: 0.8, noise: 70, hand: 40, ahead: 0, name: "Easy" },
    medium: { slip: 0.3, noise: 70, hand: 10, ahead: 0, name: "Medium" },
    hard: { slip: 0, noise: 30, hand: 8, ahead: 0.7, name: "Hard" },
  };
  var level = LEVELS[store.get("jamjar_cpu", "")] ? store.get("jamjar_cpu", "") : "medium";
  function choose() {
    var L = LEVELS[level], c = current, r = TIERS[c].r, spot = W / 2, top = -Infinity, slip = Math.random() < L.slip;
    var pile = fruits.map(function (f) { return { x: f.x, y: f.y, r: f.r, tier: f.tier }; });
    for (var x = JL + r + 1; x <= JR - r - 1; x += 6) {
      var y = landing(pile, x, r), s;
      if (slip) { s = Math.random() * 1000; if (y - r < LOSE_Y + 40) s -= 3000; }
      else {
        s = spotScore(pile, c, x, y);
        // two at a time: as good as the best spot for the next fruit on the pile this one leaves
        if (L.ahead) s += L.ahead * bestSpot(settle(pile, c, x, y), next);
      }
      s += (Math.random() - 0.5) * 2 * L.noise;
      if (s > top) { top = s; spot = x; }
    }
    if (slip) cpuSlips++;
    spot += (Math.random() + Math.random() - 1) * L.hand;
    return Math.max(JL + r + 1, Math.min(JR - r - 1, spot));
  }
  var cpuSlips = 0;   // (the careless ones, for the tests)
  // where fruit of radius r dropped at x comes to rest on the pile
  function landing(pile, x, r) {
    var y = FLOOR - r;
    for (var i = 0; i < pile.length; i++) {
      var f = pile[i], dx = Math.abs(f.x - x), rr = f.r + r;
      if (dx < rr) { var yc = f.y - Math.sqrt(rr * rr - dx * dx); if (yc < y) y = yc; }
    }
    return y;
  }
  function spotScore(pile, c, x, y) {
    var r = TIERS[c].r, s = -(FLOOR - y) * 0.6;
    if (y - r < LOSE_Y + 40) s -= 3000;
    for (var i = 0; i < pile.length; i++) {
      var f = pile[i];
      if (Math.hypot(f.x - x, f.y - y) > f.r + r + 8) continue;
      if (f.tier === c) {
        s += 300 + 60 * c;
        for (var k = 0; k < pile.length; k++) {
          var g = pile[k];
          if (g.tier === c + 1 && Math.hypot(g.x - f.x, g.y - f.y) < g.r + TIERS[Math.min(c + 1, TIERS.length - 1)].r + 20) { s += 100; break; }
        }
      } else if (f.tier < c && f.y > y) s -= 50 * (c - f.tier);
      else s -= 12 * Math.abs(f.tier - c);
    }
    return s;
  }
  // the best a fruit c can do anywhere on the pile (a coarser look)
  function bestSpot(pile, c) {
    var r = TIERS[c].r, top = -Infinity;
    for (var x = JL + r + 1; x <= JR - r - 1; x += 12) top = Math.max(top, spotScore(pile, c, x, landing(pile, x, r)));
    return top;
  }
  // the pile once fruit c rests at (x, y), roughly: merged with a twin it touches
  function settle(pile, c, x, y) {
    var r = TIERS[c].r, after = pile.slice();
    for (var i = 0; i < after.length; i++) {
      var f = after[i];
      if (f.tier === c && Math.hypot(f.x - x, f.y - y) <= f.r + r + 8) {
        after.splice(i, 1);
        if (c + 1 < TIERS.length) after.push({ x: (f.x + x) / 2, y: Math.max(f.y, y), r: TIERS[c + 1].r, tier: c + 1 });
        return after;
      }
    }
    after.push({ x: x, y: y, r: r, tier: c });
    return after;
  }

  function reset(m) {
    if (MODES[m]) { mode = m; store.set("jamjar_mode", mode); }
    best = bestOf(mode);
    document.body.dataset.mode = mode;
    fruits = []; particles = []; pops = [];
    score = 0; dropCd = 0; dangerT = 0; boilT = BOIL_S; state = "play"; dropped = false;
    runBest = best.get();
    seed = (Math.random() * 4294967296) | 0; seq = []; dealt = 0;
    current = fruitAt(0); next = fruitAt(1); heldAt = nextAt = idleT;
    out = false; lastDrop = null; pending = false;
    other = freshJar();   // (the CPU's: the same first fruit and next as yours)
    brain = { at: null, wait: 0, since: 0, again: false };
    fast = false;
    relayout();
    refreshHud();
    drawChain();
    document.getElementById("overScreen").classList.add("hidden");
    document.getElementById("menuScreen").classList.add("hidden");
    aiming();
  }
  // the menu: an empty jar behind the paces and the opponents, the last ones played picked
  function toMenu() {
    state = "menu"; fruits = []; particles = []; pops = []; dangerT = 0;
    out = false; other = freshJar(); fast = false;   // (the CPU's jar empty behind the menu too)
    document.getElementById("overScreen").classList.add("hidden");
    document.getElementById("menuScreen").classList.remove("hidden");
    paintMenu();
    aiming();
  }
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === mode); });
    document.querySelectorAll("#pick-foe button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === foe); });
    document.querySelectorAll("#pick-level button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === level); });
    var s = bestOf("simmer").get(), b2 = bestOf("boil").get(), rs = vsRecord("simmer"), rb = vsRecord("boil");
    document.getElementById("menuBest").textContent = foe === "cpu"
      ? (rs.w + rs.l + rs.d + rb.w + rb.l + rb.d ? "vs " + LEVELS[level].name + " CPU · Slow Simmer: " + recordText("simmer") + " · Rolling Boil: " + recordText("boil") : "no games against the " + LEVELS[level].name + " CPU yet")
      : s || b2 ? "best: Slow Simmer " + s + " · Rolling Boil " + b2 : "no jars filled yet";
    relayout();
  }
  // (Rolling Boil, in play: a finger slid on the jar aims instead of scrolling the page)
  function aiming() { document.body.classList.toggle("aiming", state === "play" && mode === "boil"); }

  function makeFruit(x, y, tier) {
    var r = TIERS[tier].r;
    // weight goes with volume (r³), like real fruit: a peach outweighs a
    // berry ~47×, so it barrels through berries while a berry barely nudges it
    // (r is its size now, R its own: a newborn grows into it, see GROW_T)
    return { x: x, y: y, px: x, py: y, vx: 0, vy: 0, r: r, R: r, grow: 0, tier: tier, im: 1 / (r * r * r), mergeCd: 0.1,
             born: idleT, // (its idle counts from now: idleU)
             rot: 0, w: 0, // upright, just as it hung before the drop touch: false, contacted: false, dead: false,
             rollNx: 0, rollNy: -Infinity, rollOn: null };
  }

  // auto: Rolling Boil's own drop (there a click, a tap or a key only aims)
  function drop(auto) {
    if (state !== "play" || out || P.isPaused() || (mode === "boil") !== !!auto) return;
    if (dropCd > 0 && !auto) return;
    var r = TIERS[current].r;
    var x = Math.max(JL + r + 1, Math.min(JR - r - 1, aimX));
    fruits.push(makeFruit(x, DROP_Y, current));
    lastDrop = fruits[fruits.length - 1];
    if (inCpu) brain = { at: null, wait: 0, since: 0, again: false };
    else { if (!dropped && foe === "cpu") vsPlayed(); dropped = true; }
    sfxDrop();
    dealt++;
    current = next; next = fruitAt(dealt + 1); heldAt = nextAt = idleT;
    dropCd = auto ? 0 : 0.45;
    refreshHud();
  }

  // ---- physics ---------------------------------------------------------------
  var GRAV = 1500, REST = 0.22, WALL_REST = 0.38, MU = 0.1;
  // Rolling resistance on the jar's floor: a steady slowing, the same at any
  // speed (px/s, each second), as a real rolling thing has. The speed falls in
  // a straight line and meets zero, so a roll fades out to a stop. (It was a
  // share of the speed each second, which never reaches zero: a roll crawled
  // on, and a cut-off at 14 px/s then stopped it dead.)
  var ROLL_DECEL = 12;
  // A newborn grows into its size over GROW_T s (its skin moving out at most
  // GROW_V px/s), so it shoulders its neighbours aside; born full size it
  // threw them clear in a single frame. It starts at GROW_FROM of a parent's
  // size, or less if a neighbour is nearer: it's born into the room the pair
  // leaves, a fruit nestled in the dip between them included.
  var GROW_T = 0.18, GROW_V = 150, GROW_FROM = 0.6;
  var MERGE_SLOP = 2; // px: twins this close count as touching
  function physics(dt) {
    var i, j, f;
    for (i = 0; i < fruits.length; i++) {
      f = fruits[i];
      f.vy += GRAV * dt;
      f.wasC = !!f.contacted; f.vy0 = f.vy;   // for the landing squash (below)
      if (f.sq && (f.sq.t += dt) >= SQ_T) f.sq = null;
      f.vx *= Math.exp(-0.06 * dt);  // barely any air drag: momentum carries
      f.rot += f.w * dt;
      f.w *= Math.exp(-0.12 * dt);
      if (f.r < f.R) f.r = Math.min(f.R, f.r + f.grow * dt);
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
            break; // a is spent: it mustn't merge with (or shove) anyone else
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
          // A fruit pressed against the glass, or on the floor, can't be
          // pushed further into it: on that axis it is as solid as the jar,
          // and the other fruit takes the whole push and the knock. (Split by
          // weight alone, a berry against the glass took every shove from the
          // heavy fruit beside it and the glass shoved it straight back, each
          // step: the two shook.)
          var ax = (a.pinL && nx > 0) || (a.pinR && nx < 0) ? 0 : a.im, ay = a.onFloor && ny < 0 ? 0 : a.im;
          var bx = (b.pinR && nx > 0) || (b.pinL && nx < 0) ? 0 : b.im, by = b.onFloor && ny > 0 ? 0 : b.im;
          var tm = (ax + bx) * nx * nx + (ay + by) * ny * ny;
          if (!(tm > 0)) { ax = ay = a.im; bx = by = b.im; tm = a.im + b.im; }
          var push = overlap / tm * 0.85;
          a.x -= nx * push * ax; a.y -= ny * push * ay;
          b.x += nx * push * bx; b.y += ny * push * by;
          // (a newborn's skin moves out as it grows, GROW_V: what it pushes
          // gets that speed, and carries on as anything pushed would)
          var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny - (a.r < a.R ? a.grow : 0) - (b.r < b.R ? b.grow : 0);
          if (rel < 0) {
            var imp = -(1 + REST) * rel / tm;
            a.vx -= nx * imp * ax; a.vy -= ny * imp * ay;
            b.vx += nx * imp * bx; b.vy += ny * imp * by;
            // tangential friction: a fraction of the sliding motion becomes
            // shared momentum + spin, so piles jostle and fruit rolls off fruit
            var tx2 = -ny, ty2 = nx;
            var relT = (b.vx - a.vx) * tx2 + (b.vy - a.vy) * ty2;
            var mu = (a.perched || b.perched) ? 0 : MU; // no grip while balancing
            var jt = Math.max(-imp * mu, Math.min(imp * mu, relT / (a.im + b.im) * 0.6));
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
        // would, so one resting on a single fruit and leaning on the wall
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
    // rolls on (the floor, the curve of another fruit, the glass) so
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
        // the side it leans to: that fruit must tip and roll off, so it never
        // gets the sleep treatment.
        var lip = f.r * 0.08;
        var cradled = f.supFlat || (f.supNy > 0 && f.supMin < -lip && f.supMax > lip);
        f.perched = false;
        if (cradled) {
          f.tipDir = 0;
          if (f.onFloor) {
            // rolling resistance (ROLL_DECEL); its spin goes on following its
            // roll, so it turns until the moment it stops
            var dv = ROLL_DECEL * dt;
            f.vx = f.vx > dv ? f.vx - dv : f.vx < -dv ? f.vx + dv : 0;
          } else {
            // held in the pile: a resting fruit stops turning, and near-rest
            // contact all but freezes (kills wedge-creep for good); both by
            // the clock, not by the step
            if (f.mvx * f.mvx + f.mvy * f.mvy < 144) f.w *= Math.exp(-24 * dt);
            if (Math.abs(f.vx) < 8 && Math.abs(f.vy) < 8) f.vx *= Math.exp(-83 * dt);
          }
        } else if (f.supNy > 0) {
          // Gravity wins the balancing act: slide down whichever side it
          // leans toward. On a perfect balance (a berry dead-centre on a
          // melon's wide crown) the coin flip is STICKY: re-rolling it every
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
      if (p.ring) continue; // the merge ring stays where the fruits met (it has no velocity: moving it made it NaN, so it never drew)
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt;
    }
    agePops(dt);
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

  // Whatever overlap is STILL left is a jam: a berry wedged in a gap between
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
        // back to that pixel, not to none (clearing it all let the next step
        // press it in again, and the pair flicked to and fro every frame), and
        // the two stop closing on each other, an even share each
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, h = (rr - 1 - d) / 2;
        a.x -= nx * h; a.y -= ny * h;
        b.x += nx * h; b.y += ny * h;
        var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { a.vx += nx * rel / 2; a.vy += ny * rel / 2; b.vx -= nx * rel / 2; b.vy -= ny * rel / 2; }
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
      popScore(mx, my, 100);
      sfxMelon();
    } else {
      var nf = makeFruit(mx, my, t + 1);
      // (it grows, GROW_T: from as big as the room it's born in allows)
      var r0 = pa.r * GROW_FROM;
      for (var q = 0; q < fruits.length; q++) {
        if (fruits[q].dead) continue;
        var room = Math.hypot(fruits[q].x - mx, fruits[q].y - my) - fruits[q].r;
        if (room < r0) r0 = room;
      }
      nf.r = Math.max(pa.r * 0.25, r0);
      nf.grow = Math.min((nf.R - nf.r) / GROW_T, GROW_V);
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
      score += MERGE_SCORE[t + 1];
      popScore(mx, my, MERGE_SCORE[t + 1]);
      sfxMerge(t + 1);
      if (t + 1 === TIERS.length - 1) sfxMelon(); // first watermelon fanfare
    }
    // a new best is saved the moment the score passes it, not only when the
    // jar overflows, so closing the tab mid-jar keeps it (a jar against the
    // CPU keeps a record of its own instead: see vsRecord)
    if (foe === "solo") best.submit(score);
    refreshHud();
  }

  // A merge's splatter and ring, with Visual FX on. With it off there are
  // neither, and no outline in their place: the bigger fruit and its sound
  // are the merge.
  function juice(x, y, col, r) {
    if (reduced()) return;
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * (140 + r * 2);
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, t: 0, life: 0.5 + Math.random() * 0.3, col: col, s: 2 + Math.random() * 3.5 });
    }
    particles.push({ x: x, y: y, t: 0, life: 0.35, ring: true, col: col, s: r });
  }

  // A merge's points, "+N", where the pair met: on for POP_T s of the jar's
  // own clock (so a pause holds it), fading over the last part. With Visual
  // FX on it rises a little; off, it holds still: the same text, in the same
  // place, as long. It sits below the rim, clear of the fruit waiting to
  // drop, and one born beside a newer one moves out of its way.
  var POP_T = 0.8, POP_RISE = 44, POP_PX = 32, POP_TOP = RIM + 70;
  function popScore(x, y, n) {
    y = Math.max(POP_TOP, y);
    for (var i = 0; i < pops.length; i++) {
      var o = pops[i];
      if (o.t < 0.4 && Math.abs(o.x - x) < 70 && Math.abs(o.y - y) < 38) y = o.y - 40 >= POP_TOP ? o.y - 40 : o.y + 40;
    }
    pops.push({ x: x, y: y, n: n, t: 0 });
  }
  function agePops(dt) {
    for (var i = pops.length - 1; i >= 0; i--) if ((pops[i].t += dt) >= POP_T) pops.splice(i, 1);
  }
  function drawPop(p) {
    var k = p.t / POP_T, text = "+" + p.n;
    var y = p.y - (reduced() ? 0 : POP_RISE * (1 - (1 - k) * (1 - k)));   // (rising, easing out)
    ctx.font = "800 " + (POP_PX + Math.min(16, p.n / 4)) + "px 'Baloo 2', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var half = ctx.measureText(text).width / 2 + 6, x = Math.max(JL + half, Math.min(JR - half, p.x));
    ctx.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
    ctx.lineJoin = "round"; ctx.lineWidth = 7; ctx.strokeStyle = "#fff3df";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#c2452f";
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1; ctx.lineJoin = "miter"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  // when the result card came up, for Space's moment's wait on it (see the keys)
  var OVER_WAIT = 700, overAt = 0;
  function gameOver() {
    // against the CPU the jar just stops (yours or the CPU's, whichever is in
    // play), and judge() decides the game
    if (foe === "cpu") { out = true; sfxOver(); return; }
    state = "over";
    aiming();
    overAt = performance.now();
    best.submit(score);
    sfxOver();
    document.getElementById("overTitle").textContent = "The jar overflowed!";
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
    var k = squashOf(f);
    ctx.save();
    ctx.translate(f.x, f.y + f.r * k);
    if (k) ctx.scale(1 + k, 1 - k);
    if (f.r < f.R) ctx.scale(f.r / f.R, f.r / f.R);   // a newborn, growing
    ctx.rotate(f.rot);
    drawFace(f.tier, 0, 0, f.born);
    ctx.restore();
  }

  // The two dashed lines run on patterns pinned to the jar, not to where each
  // line starts, so the aim line's dashes don't jump when the next fruit
  // (and so the line's top) is a different size. With Visual FX on they
  // drift at a steady DASH_V px a second (the fill line to the right, the
  // aim line down); off, they hold still.
  var DASH_V = 18;
  function dashOffset(start, period, T) {
    var o = (start - (reduced() ? 0 : T * DASH_V)) % period;
    return o < 0 ? o + period : o;
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
    ctx.lineDashOffset = dashOffset(JL - 6, 16, T);
    ctx.lineWidth = warn ? 2.5 : 1.5;
    ctx.beginPath(); ctx.moveTo(JL - 6, LOSE_Y); ctx.lineTo(JR + 6, LOSE_Y); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.font = "700 11px 'Baloo 2', sans-serif";
    ctx.fillStyle = warn ? "rgba(210,60,40,0.9)" : "rgba(160,106,51,0.7)";
    ctx.textAlign = "left";
    // (inside the jar, clear of the left pane of glass drawn over its edge)
    ctx.fillText("FILL LINE", JL + 5, LOSE_Y - 6);

    // aim guide + the fruit waiting to drop
    if (state === "play" && !out) {
      var r = TIERS[current].r;
      var ax = Math.max(JL + r + 1, Math.min(JR - r - 1, aimX));
      ctx.strokeStyle = "rgba(90, 50, 24, 0.22)";
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = dashOffset(DROP_Y + r, 12, T);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, DROP_Y + r); ctx.lineTo(ax, FLOOR); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.globalAlpha = dropCd > 0 ? 0.45 : 1;
      drawFace(current, ax, DROP_Y, heldAt);
      ctx.globalAlpha = 1;
      // Rolling Boil: a ring round it closes as its second runs out (the
      // same with Visual FX on or off: it tells the time)
      if (mode === "boil") {
        var left = Math.max(0, Math.min(1, boilT / BOIL_S));
        ctx.lineWidth = 4; ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(160, 106, 51, 0.25)";
        ctx.beginPath(); ctx.arc(ax, DROP_Y, r + 7, 0, 7); ctx.stroke();
        ctx.strokeStyle = "rgba(194, 69, 47, 0.9)";
        ctx.beginPath(); ctx.arc(ax, DROP_Y, r + 7, -Math.PI / 2, -Math.PI / 2 + (1 - left) * Math.PI * 2); ctx.stroke();
        ctx.lineCap = "butt";
      }
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

    // the merges' points (on the CPU's jar only where it is big enough to read them)
    if (!inCpu || cpuScale * POP_PX >= 10) for (i = 0; i < pops.length; i++) drawPop(pops[i]);

    // against the CPU: a jar that has overflowed says so under a wash, and
    // while the other plays on, that one shows the score it has to pass
    if (foe === "cpu" && state === "play") {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (out) {
        ctx.fillStyle = "rgba(255, 243, 223, 0.72)";
        ctx.fillRect(JL - GLASS, 0, JR - JL + GLASS * 2, FLOOR + GLASS);   // (a fruit stopped in the air above it too)
        ctx.fillStyle = "#c2452f";
        ctx.font = "800 46px 'Baloo 2', sans-serif";
        ctx.fillText("OVERFLOWED", W / 2, H * 0.42);
        ctx.fillStyle = "#5a3218";
        ctx.font = "800 34px 'Baloo 2', sans-serif";
        ctx.fillText(score + " points", W / 2, H * 0.42 + 52);
      } else if (other.out) {
        var line = "PASS " + other.score + " TO WIN";
        ctx.font = "800 30px 'Baloo 2', sans-serif";
        var tw = ctx.measureText(line).width + 36;
        ctx.fillStyle = "rgba(255, 243, 223, 0.9)";
        ctx.beginPath(); ctx.arc(W / 2 - tw / 2 + 23, RIM + 63, 23, Math.PI / 2, Math.PI * 1.5); ctx.arc(W / 2 + tw / 2 - 23, RIM + 63, 23, -Math.PI / 2, Math.PI / 2); ctx.fill();
        ctx.fillStyle = "#c2452f";
        ctx.fillText(line, W / 2, RIM + 64);
      }
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
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
  var ICON_R = 15, CHAIN, chainCtx;
  var nextCtx = hiDpi("next", 86, 86);
  // The ladder stands up beside the jar, each fruit's name beside it; on a
  // phone, where the panels go under the jar (styles.css), it lies across
  // its panel in rows, smallest fruit first, each name under its fruit.
  var across = window.matchMedia ? window.matchMedia("(max-width: 760px)") : null;
  function layChain() {
    var el = document.getElementById("chain"), box = el.parentNode, cs = getComputedStyle(box);
    var w = Math.floor(box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    CHAIN = across && across.matches ? chainAcross(w) : chainUpright(el, box, w);
    chainCtx = hiDpi("chain", CHAIN.w, CHAIN.h);
    drawChain();
  }
  // Standing, the ladder reaches no lower than the jar beside it (a laptop
  // screen is short): its fruit come smaller until the panel ends with the
  // jar, and until every name fits beside them.
  function chainUpright(el, box, w) {
    var c = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    var room = document.getElementById("game").getBoundingClientRect().bottom - c.top - (b.bottom - c.bottom);
    for (var r = ICON_R; r > 8; r -= 0.25) { var L = chainLayout(r, w); if (L.h <= room && L.fits) return L; }
    return chainLayout(8, w);
  }
  // The fruit's names: the biggest size (12 px down to 10) whose widest
  // name fits the room
  var NAME_INK = "#7a4d22", measure = document.createElement("canvas").getContext("2d");
  function nameFont(px) { return "700 " + px + "px 'Baloo 2', sans-serif"; }
  function nameW(px) { measure.font = nameFont(px); var m = 0; TIERS.forEach(function (t) { m = Math.max(m, measure.measureText(t.name).width); }); return m; }
  function nameSize(room) { for (var px = 12; px > 10; px -= 0.5) if (nameW(px) <= room) return px; return 10; }
  function refreshHud() {
    if (inCpu) return;   // (the CPU's jar in play: the panels are yours, see cpuHud)
    document.getElementById("score").textContent = score;
    document.getElementById("best").textContent = Math.max(best.get(), state === "menu" ? 0 : score);
    cpuHud();
    paintNext();
  }
  var nextU = -1, chainU = -1;   // (the idle moments Next and the Preserves were last painted at)
  function paintNext() {
    nextU = idleU(nextAt);
    nextCtx.clearRect(0, 0, 86, 86);
    var scale = Math.min(1, 34 / TIERS[next].r);
    nextCtx.save();
    nextCtx.translate(43, 43);
    nextCtx.scale(scale, scale);
    paintFruit(nextCtx, next, nextU); // vectors at the panel's own resolution
    nextCtx.restore();
  }
  // the CPU's score beside yours (run with yours in play, so the CPU's jar is `other`)
  function cpuHud() {
    var el = document.getElementById("cpuScore"), v = String(other.score);
    if (el.textContent !== v) el.textContent = v;
  }
  // The little evolution ladder, standing: every fruit at one body size r,
  // painted as vectors at the panel's resolution (not a big sprite squashed
  // down, which came out jagged for the large fruit and soft for the small),
  // on an even step just tall enough for the tallest stem or crown to sit in
  // the gap instead of on the fruit above, and for a name: the fruit down the
  // left of `w` px, each name beside it.
  function chainLayout(r, w) {
    var i, slots = [], step = 0, edge = 4, left = 0, right = 0;
    for (i = 0; i < TIERS.length; i++) {
      var k = r / TIERS[i].r, ext = SPRITES[i].ext;
      slots.push({ k: k, up: ext.up * k, down: ext.down * k });
      left = Math.max(left, ext.left * k); right = Math.max(right, ext.right * k);
    }
    var x = edge + left, tx = x + right + 5, px = nameSize(w - tx - 1);
    for (i = 1; i < slots.length; i++) step = Math.max(step, slots[i - 1].down + slots[i].up + 3, px + 3);
    for (i = 0; i < slots.length; i++) { slots[i].x = x; slots[i].y = edge + slots[0].up + i * step; slots[i].tx = tx; slots[i].ty = slots[i].y; }
    var last = slots[slots.length - 1];
    return { slots: slots, rows: [slots], w: w, h: Math.ceil(last.y + last.down + edge), px: px, side: true, fits: nameW(px) <= w - tx - 1 };
  }
  // The same ladder lying across `w` px, in rows: every fruit at the
  // standing one's size, each name under it; as many to a row as the widest
  // name leaves room for, the rows as few as names of 10 px or more allow
  // (the names as big as that leaves them), as even as they go, each centred.
  function chainAcross(w) {
    var i, n = TIERS.length, gap = 6, edge = 3, R = ICON_R, up = 0, down = 0, wide = 0;
    for (i = 0; i < n; i++) {
      var ext = SPRITES[i].ext, k = R / TIERS[i].r;
      up = Math.max(up, ext.up * k); down = Math.max(down, ext.down * k); wide = Math.max(wide, (ext.left + ext.right) * k);
    }
    function most(px) { return Math.max(1, Math.floor((w - 2 * edge + gap) / (Math.max(wide, nameW(px)) + gap))); }
    var px = 12, fewest = Math.ceil(n / most(10));
    while (px > 10 && Math.ceil(n / most(px)) > fewest) px -= 0.5;
    var cell = Math.max(wide, nameW(px)) + gap, rowsN = Math.ceil(n / most(px)), per = Math.ceil(n / rowsN);
    var rowH = up + down + px + 6, slots = [], rows = [];
    for (i = 0; i < n; i++) {
      var row = Math.floor(i / per), col = i % per, inRow = Math.min(per, n - row * per);
      var x = (w - inRow * cell) / 2 + cell / 2 + col * cell, y = edge + up + row * rowH;
      var sl = { k: R / TIERS[i].r, x: x, y: y, tx: x, ty: y + down + 2 + px / 2 };
      slots.push(sl); (rows[row] = rows[row] || []).push(sl);
    }
    return { slots: slots, rows: rows, w: w, h: Math.ceil(2 * edge + rowsN * rowH - 2), px: px, side: false };
  }
  function drawChain() {
    var g = chainCtx, slots = CHAIN.slots, i;
    chainU = idleU(0);   // (all of them at once)
    g.clearRect(0, 0, CHAIN.w, CHAIN.h);
    g.strokeStyle = "rgba(160,106,51,0.5)";
    g.lineWidth = 2;
    CHAIN.rows.forEach(function (row) {
      if (row.length < 2) return;
      g.beginPath(); g.moveTo(row[0].x, row[0].y); g.lineTo(row[row.length - 1].x, row[row.length - 1].y); g.stroke();
    });
    for (i = 0; i < slots.length; i++) {
      g.save(); g.translate(slots[i].x, slots[i].y); g.scale(slots[i].k, slots[i].k);
      paintFruit(g, i, chainU);
      g.restore();
    }
    // each fruit's name, beside it standing, under it lying across
    g.font = nameFont(CHAIN.px); g.fillStyle = NAME_INK;
    g.textBaseline = "middle"; g.textAlign = CHAIN.side ? "left" : "center";
    for (i = 0; i < slots.length; i++) g.fillText(TIERS[i].name, slots[i].tx, slots[i].ty);
    g.textAlign = "left"; g.textBaseline = "alphabetic";
  }

  // ---- input -----------------------------------------------------------------
  function canvasX(e) {
    var rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) / rect.width * W;
  }
  canvas.addEventListener("pointermove", function (e) { aimX = canvasX(e); });
  canvas.addEventListener("pointerdown", function (e) {
    aimX = canvasX(e);
    if (state === "play" && mode === "simmer") drop();
  });
  // A held arrow moves the aim from the moment it's pressed, AIM_SPEED a
  // second (the keyboard's own repeat waits half a second first): the press
  // nudges it a step, and the loop runs it on while the key stays down.
  var held = { L: false, R: false }, AIM_SPEED = 420;
  document.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft") held.L = false;
    else if (e.key === "ArrowRight") held.R = false;
  });
  window.addEventListener("blur", function () { held.L = held.R = false; });   // (a key let go in another window never comes up here)
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    // the result card: Space is New jar's (below), but it is the drop key in
    // play, so for a moment after the jar overflows it does nothing (one
    // pressed as the last fruit fell mustn't skip the result), and one held
    // down never counts
    if (state !== "play") {
      if (state === "over" && e.key === " " && (e.repeat || performance.now() - overAt < OVER_WAIT)) e.preventDefault();
      return;
    }
    if (P.isPaused()) return;                          // paused: no aiming, no dropping
    if (e.key === "ArrowLeft") { e.preventDefault(); if (!e.repeat) { held.L = true; aimX -= 22; } }
    else if (e.key === "ArrowRight") { e.preventDefault(); if (!e.repeat) { held.R = true; aimX += 22; } }
    else if (e.key === " " || e.key === "ArrowDown") { e.preventDefault(); if (!e.repeat && mode === "simmer") drop(); }
    aimX = Math.max(JL, Math.min(JR, aimX));
  });
  document.getElementById("againBtn").addEventListener("click", function () { reset(); });
  document.getElementById("modesBtn").addEventListener("click", toMenu);
  document.getElementById("playBtn").addEventListener("click", function () { reset(mode); });
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () { mode = b.getAttribute("data-v"); store.set("jamjar_mode", mode); paintMenu(); });
  });
  document.querySelectorAll("#pick-foe button").forEach(function (b) {
    b.addEventListener("click", function () { foe = b.getAttribute("data-v"); store.set("jamjar_foe", foe); paintMenu(); });
  });
  document.querySelectorAll("#pick-level button").forEach(function (b) {
    b.addEventListener("click", function () { level = b.getAttribute("data-v"); store.set("jamjar_cpu", level); paintMenu(); });
  });
  if (window.GameShell && GameShell.menuKeys) {
    // the menu: 1 and 2 pick the pace, 3 and 4 Solo or vs CPU, 5 6 7 the CPU's level (shown against it), Space or Enter starts
    GameShell.menuKeys({
      active: function () { return state === "menu"; },
      groups: [{ sel: "#pick-mode button", into: "b" }, { sel: "#pick-foe button", into: "b" }, { sel: "#pick-level button", into: "b" }], start: "#playBtn", space: true
    });
    // on the result card Space or Enter is New jar, Backspace the menu (keycaps on the buttons)
    GameShell.menuKeys({
      active: function () { return !document.getElementById("overScreen").classList.contains("hidden"); },
      groups: [{ sel: "#modesBtn", keys: ["backspace"], caps: false }], start: "#againBtn", space: true
    });
  }

  // ---- pause + loop ------------------------------------------------------------
  var P = window.GameShell
    ? GameShell.pausable({ canPause: function () { return state === "play"; }, restart: function () { reset(); }, menu: toMenu })   // (on the card: an empty jar again at the same pace, or the menu)
    : { isPaused: function () { return false; } };
  // Until the first fruit drops there's nothing to lose, so leaving asks
  // first only once a fruit is in the jar (paused included), pausing through
  // P; the menu, an empty jar and the overflow card don't
  if (window.GameShell) GameShell.guardLeave({ active: function () { return state === "play" && dropped; }, pausable: P });

  // One frame of play: dt seconds of both jars.
  function step(dt) {
    // Rolling Boil: the next fruit goes when its second is up (the CPU's with yours)
    if (mode === "boil") {
      boilT -= dt;
      if (boilT <= 0) { boilT += BOIL_S; drop(true); if (foe === "cpu") asCpu(function () { drop(true); }); }
    }
    // steps of 1/120 s or less, two at the least: tall stacks stay calm,
    // and a slower screen's longer frames don't set the pile shivering
    // (a jar that has overflowed stays as it stopped)
    var n = Math.max(2, Math.ceil(dt * 120 - 1e-6));
    for (var s = 0; s < n && !out; s++) physics(dt / n);
    if (out) agePops(dt);   // (an overflowed jar's last points still fade)
    if (foe === "cpu") {
      asCpu(function () { think(dt); for (var s2 = 0; s2 < n && !out; s2++) physics(dt / n); if (out) agePops(dt); });
      cpuHud();
      judge();
    }
  }

  // Speed up: once your jar has overflowed and the CPU's plays on, its jar
  // can run at FAST times the speed until the game is decided, and back. It
  // is the same play, frame for frame (FAST frames of it to each one drawn),
  // so the CPU picks and drops exactly as it would have, only sooner.
  var FAST = 4, fast = false, fastBtn = document.getElementById("fastBtn");
  function fastUi() {
    var show = foe === "cpu" && state === "play" && out && !other.out;
    if (!show) fast = false;
    if (fastBtn.hidden === show) { fastBtn.hidden = !show; if (show) placeFast(); }
    var label = fast ? "Normal speed" : "Speed up ▸▸";
    if (fastBtn.textContent !== label) { fastBtn.textContent = label; fastBtn.setAttribute("aria-pressed", String(fast)); }
  }
  // (over your jar, under OVERFLOWED)
  function placeFast() {
    var g = document.getElementById("game");
    fastBtn.style.left = (g.offsetLeft + g.offsetWidth / 2) + "px";
    fastBtn.style.top = (g.offsetTop + g.offsetHeight * 0.6) + "px";
  }
  fastBtn.addEventListener("click", function () { if (!fastBtn.hidden) { fast = !fast; fastUi(); } });
  window.addEventListener("resize", function () { if (!fastBtn.hidden) placeFast(); });
  if (window.GameShell && GameShell.menuKeys) {
    // F presses it (its keycap on it), never under the pause card
    GameShell.menuKeys({ active: function () { return !fastBtn.hidden && !P.isPaused(); }, groups: [{ sel: "#fastBtn", keys: ["f"] }] });
  }

  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    // (never below 0: the first frame's timestamp can come before `last` was
    // read, and a negative step ran the overflow timer up on an empty jar,
    // ending a fresh game by itself on a slow load)
    var dt = Math.max(0, Math.min((now - last) / 1000, 0.04));
    last = now;
    if (!P.isPaused()) {
      idleT += dt;
      // (Next and the Preserves painted again while their fruit move, and once more as they come to rest)
      if (!inCpu && (nextU >= 0 || idleU(nextAt) >= 0)) paintNext();
      if (chainCtx && (chainU >= 0 || idleU(0) >= 0)) drawChain();
      if (state === "play" && held.L !== held.R) aimX = Math.max(JL, Math.min(JR, aimX + (held.R ? 1 : -1) * AIM_SPEED * dt));
      for (var k = fast ? FAST : 1; k > 0 && state === "play"; k--) step(dt);
      fastUi();
      draw();
      if (foe === "cpu") asCpu(draw);
    }
  }
  layChain();
  window.addEventListener("resize", layChain);   // (a phone turned, a window narrowed: the ladder stands or lies, and fills its panel)
  if (document.fonts) document.fonts.ready.then(layChain);   // (the panel's label, in its own face, may take another line)
  window.addEventListener("resize", fitCpu);
  document.body.dataset.mode = mode;
  refreshHud();
  toMenu();
  requestAnimationFrame(loop);

  // test hook
  window.__game = {
    get fruits() { return fruits; },
    get state() { return state; },
    get mode() { return mode; },
    get boilT() { return boilT; },
    get score() { return score; },
    get dangerT() { return dangerT; },
    get particles() { return particles; },
    get pops() { return pops; },
    squash: function (f) { return squashOf(f); },
    // the idles: the clock, an idle's moment for a start time (below 0: at
    // rest), when the fruit waiting and the one in Next came, the moment the
    // Preserves were last painted at; and a fruit painted at a moment u, as a
    // hash of its pixels, or how many of them differ between two moments
    idle: function () { return { t: idleT, T: IDLE_T, ACT: IDLE_ACT, heldAt: heldAt, nextAt: nextAt, chainU: chainU, nextU: nextU }; },
    idleU: idleU,
    facePixels: function (ti, u) {
      var r = TIERS[ti].r, n = Math.ceil((r + 16) * 4), c = document.createElement("canvas");
      c.width = c.height = n;
      var g = c.getContext("2d");
      g.scale(2, 2); g.translate(r + 16, r + 16);
      paintFruit(g, ti, u);
      return g.getImageData(0, 0, n, n).data;
    },
    faceHash: function (ti, u) { var d = this.facePixels(ti, u), h = 2166136261; for (var i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619); return (h >>> 0).toString(16); },
    // the Preserves as laid out: its size, the names' size, each fruit's
    // place and body radius and its name's box ([x, y, w, h])
    chain: function () {
      measure.font = nameFont(CHAIN.px);
      return { w: CHAIN.w, h: CHAIN.h, px: CHAIN.px, side: CHAIN.side, slots: CHAIN.slots.map(function (sl, i) {
        var nw = measure.measureText(TIERS[i].name).width;
        return { x: sl.x, y: sl.y, r: TIERS[i].r * sl.k, name: [CHAIN.side ? sl.tx : sl.tx - nw / 2, sl.ty - CHAIN.px / 2, nw, CHAIN.px] };
      }) };
    },
    faceDiff: function (ti, u1, u2) { var a = this.facePixels(ti, u1), b = this.facePixels(ti, u2), n = 0; for (var i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; },
    setQueue: function (c, n) { current = c; next = n; refreshHud(); },
    setAim: function (x) { aimX = x; },
    drop: function () { drop(mode === "boil"); },
    reset: reset,
    start: function (m) { reset(m || mode); },
    toMenu: toMenu,
    get foe() { return foe; },
    get level() { return level; },
    setLevel: function (v) { level = v; store.set("jamjar_cpu", level); paintMenu(); },
    // the CPU's pick for a pile laid out here ([{ x, tier }], each resting on
    // the floor unless it gives its y), the fruit waiting and the next
    cpuPick: function (pile, c, n) {
      var r;
      asCpu(function () {
        fruits = pile.map(function (q) { var f = makeFruit(q.x, q.y != null ? q.y : FLOOR - TIERS[q.tier].r, q.tier); f.contacted = true; return f; });
        current = c; next = n;
        r = choose();
      });
      return r;
    },
    get cpuSlips() { return cpuSlips; },
    get fast() { return fast; },
    setFoe: function (f) { foe = f; store.set("jamjar_foe", foe); paintMenu(); },
    // both jars as they stand (yours, the CPU's), and the shared run of fruit
    vs: function () { return { you: { score: score, out: out, dealt: dealt, fruits: fruits.length }, cpu: { score: other.score, out: other.out, dealt: other.dealt, fruits: other.fruits.length, aim: other.aimX } }; },
    fruitAt: fruitAt,
    // set either jar's score and whether it has overflowed, then judge
    setVs: function (you, cpu) {
      if (you) { if ("score" in you) score = you.score; if ("out" in you) out = you.out; }
      if (cpu) { if ("score" in cpu) other.score = cpu.score; if ("out" in cpu) other.out = cpu.out; }
      refreshHud();
      judge();
    },
  };
})();
