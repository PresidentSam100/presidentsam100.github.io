/* =====================================================================
   Buzz Wire: the thirty circuits, in six stages, each stage bringing in
   one new obstacle (the last mixes them). A level is:
     path:    the circuit's points, clockwise on the screen from the post
     hw:      the channel's half-width (bumps: wider or narrower stretches,
              [arc fraction, extra, span])
     bpm:     the tempo the obstacles keep (and the backing plays at)
     tickets: [arc fraction, lane] (lane -1 to 1 across the channel)
     obs:     the obstacles (see course.js)
   _dev/tools/buzz-wire-check.js proves every circuit can be closed.
   ===================================================================== */
(function (root) {
  "use strict";
  var D = Math.PI / 180;
  function r1(v) { return Math.round(v * 10) / 10; }

  // an oval round (cx, cy), starting at angle a0 (90: the bottom), with
  // lobes: its radius swells and dips `lobes` times by `amp`
  function oval(cx, cy, rx, ry, n, o) {
    o = o || {};
    var a0 = (o.a0 == null ? 90 : o.a0) * D, out = [];
    for (var i = 0; i < n; i++) {
      var u = i / n * 2 * Math.PI, th = a0 + u, m = 1 + (o.amp || 0) * Math.cos((o.lobes || 0) * u + (o.ph || 0) * D);
      out.push([r1(cx + rx * m * Math.cos(th)), r1(cy + ry * m * Math.sin(th))]);
    }
    return out;
  }
  // a polygon with its corners rounded (radius rc), its sides laid out in
  // points every `step`; it starts at the point nearest `post`
  function roundPoly(corners, rc, step, post) {
    var n = corners.length, out = [];
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l, l]; }
    for (var i = 0; i < n; i++) {
      var p = corners[(i - 1 + n) % n], c = corners[i], q = corners[(i + 1) % n];
      var din = unit(p, c), dout = unit(c, q), k = Math.min(rc, din[2] / 2 - 1, dout[2] / 2 - 1);
      var a = [c[0] - din[0] * k, c[1] - din[1] * k], b = [c[0] + dout[0] * k, c[1] + dout[1] * k];
      for (var t = 0; t <= 3; t++) {
        var u = t / 3, w0 = (1 - u) * (1 - u), w1 = 2 * (1 - u) * u, w2 = u * u;
        out.push([r1(w0 * a[0] + w1 * c[0] + w2 * b[0]), r1(w0 * a[1] + w1 * c[1] + w2 * b[1])]);
      }
      // the side on to the next corner
      var e = unit(c, q), kn = Math.min(rc, e[2] / 2 - 1), run = e[2] - k - kn, m = Math.max(0, Math.floor(run / step));
      for (var j = 1; j <= m; j++) {
        var f = k + run * j / (m + 1);
        out.push([r1(c[0] + e[0] * f), r1(c[1] + e[1] * f)]);
      }
    }
    if (post) {
      var bi = 0, bd = 1e9;
      out.forEach(function (pt, i2) { var d = Math.hypot(pt[0] - post[0], pt[1] - post[1]); if (d < bd) { bd = d; bi = i2; } });
      out = out.slice(bi).concat(out.slice(0, bi));
    }
    return out;
  }
  // a serpentine: k runs up and down between x0 and x1 (the last coming
  // down to the base), and back along the base
  function comb(x0, x1, yTop, yBot, yBase, k, rc) {
    var xs = [], c = [[x0, yBase]];
    for (var j = 0; j < k; j++) xs.push(x0 + j * (x1 - x0) / (k - 1));
    for (j = 0; j < k; j++) {
      if (j % 2 === 0) { c.push([xs[j], yTop]); c.push([xs[j + 1], yTop]); }
      else if (j === k - 1) c.push([xs[j], yBase]);
      else { c.push([xs[j], yBot]); c.push([xs[j + 1], yBot]); }
    }
    return roundPoly(c, rc, 90, [(x0 + x1) / 2, yBase]);
  }
  var RECT = [[150, 840], [150, 160], [850, 160], [850, 840]];

  var stages = [
    { numeral: "I", name: "Plain Wire" },
    { numeral: "II", name: "Sparks" },
    { numeral: "III", name: "Weights" },
    { numeral: "IV", name: "Live Rails" },
    { numeral: "V", name: "Gates" },
    { numeral: "VI", name: "Arms" }
  ];

  var levels = [
    // ---- I. the plain wire: the circuit alone, tickets to gather on the way
    { name: "First Circuit", stage: 0, bpm: 92, hw: 60, path: oval(500, 500, 330, 300, 20),
      tickets: [[0.25, 0], [0.5, 0], [0.75, 0]] },
    { name: "Peanut", stage: 0, bpm: 92, hw: 56, path: oval(500, 500, 330, 300, 24, { lobes: 2, amp: 0.2, ph: 180 }),
      tickets: [[0.2, 0.6], [0.45, -0.6], [0.7, 0.6], [0.9, -0.5]] },
    { name: "Clover", stage: 0, bpm: 96, hw: 50, path: oval(500, 500, 300, 300, 30, { lobes: 3, amp: 0.3, ph: 180 }),
      tickets: [[0.17, 0], [0.5, 0], [0.83, 0], [0.33, 0.7]] },
    { name: "Narrows", stage: 0, bpm: 96, hw: 52, path: oval(500, 500, 340, 320, 24),
      bumps: [[0.25, -20, 0.08], [0.5, -22, 0.06], [0.75, -20, 0.08]],
      tickets: [[0.125, 0], [0.375, 0.7], [0.625, -0.7], [0.875, 0]] },
    { name: "Switchback", stage: 0, bpm: 96, hw: 42, path: comb(160, 840, 160, 600, 850, 6, 66),
      tickets: [[0.12, 0], [0.3, 0], [0.48, 0], [0.66, 0]] },

    // ---- II. sparks hop along the channel, a station a beat
    { name: "First Spark", stage: 1, bpm: 100, hw: 52, path: roundPoly(RECT, 130, 95, [500, 840]),
      tickets: [[0.25, 0], [0.5, 0.6], [0.75, 0]],
      obs: [{ k: "spark", t0: 0.42, t1: 0.58, n: 5 }] },
    { name: "Two Rails", stage: 1, bpm: 100, hw: 52, path: oval(500, 500, 350, 320, 24),
      tickets: [[0.3, 0], [0.55, 0], [0.8, 0]],
      obs: [{ k: "spark", t0: 0.2, t1: 0.34, n: 4, lane: 1 }, { k: "spark", t0: 0.6, t1: 0.74, n: 4, lane: -1, phase: 1.5 }] },
    { name: "Spark Train", stage: 1, bpm: 104, hw: 50, path: roundPoly([[110, 700], [110, 300], [890, 300], [890, 700]], 150, 95, [500, 700]),
      tickets: [[0.2, 0], [0.45, -0.7], [0.72, 0.7]],
      obs: [{ k: "spark", t0: 0.36, t1: 0.62, n: 7 }, { k: "spark", t0: 0.36, t1: 0.62, n: 7, phase: 2 }, { k: "spark", t0: 0.36, t1: 0.62, n: 7, phase: 4 }] },
    { name: "Crosswind", stage: 1, bpm: 104, hw: 48, path: oval(500, 500, 300, 300, 30, { lobes: 3, amp: 0.3, ph: 180 }),
      tickets: [[0.17, 0.6], [0.5, -0.6], [0.83, 0.6]],
      obs: [{ k: "spark", t0: 0.08, t1: 0.26, n: 5, lane: -1 }, { k: "spark", t0: 0.41, t1: 0.59, n: 5, lane: 1, phase: 1 }, { k: "spark", t0: 0.74, t1: 0.92, n: 5, lane: -1, phase: 2 }] },
    { name: "Short Fuse", stage: 1, bpm: 104, hw: 38, path: roundPoly(RECT, 120, 95, [500, 840]),
      tickets: [[0.12, 0], [0.37, 0], [0.62, 0], [0.87, 0]],
      obs: [{ k: "spark", t0: 0.18, t1: 0.32, n: 4, lane: 1 }, { k: "spark", t0: 0.18, t1: 0.32, n: 4, lane: -1, phase: 1.5 },
            { k: "spark", t0: 0.68, t1: 0.82, n: 4, lane: -1 }, { k: "spark", t0: 0.68, t1: 0.82, n: 4, lane: 1, phase: 1.5 }] },

    // ---- III. weights swing across the channel, at the ends of their swing on the beat
    { name: "Pendulum", stage: 2, bpm: 88, hw: 52, path: oval(500, 500, 340, 310, 24),
      tickets: [[0.3, 0], [0.55, 0], [0.85, 0]],
      obs: [{ k: "weight", t: 0.72, side: 1, d: 150, reach: 26 }] },
    { name: "Two Clocks", stage: 2, bpm: 88, hw: 50, path: roundPoly([[110, 720], [110, 280], [890, 280], [890, 720]], 160, 95, [500, 720]),
      tickets: [[0.2, 0], [0.5, 0], [0.8, 0]],
      obs: [{ k: "weight", t: 0.42, side: 1, d: 160, reach: 30 }, { k: "weight", t: 0.58, side: 1, d: 160, reach: 30, phase: 0.5 }] },
    { name: "Belfry", stage: 2, bpm: 92, hw: 44, path: comb(170, 830, 190, 620, 850, 4, 90),
      tickets: [[0.15, 0], [0.4, 0], [0.62, 0]],
      obs: [{ k: "weight", t: 0.255, side: -1, d: 150, reach: 20 }, { k: "weight", t: 0.535, side: -1, d: 150, reach: 20, phase: 0.5 }] },
    { name: "Grandfather", stage: 2, bpm: 92, hw: 50, path: oval(500, 500, 330, 300, 24, { lobes: 2, amp: 0.2, ph: 180 }),
      tickets: [[0.12, 0], [0.37, 0], [0.62, 0], [0.87, 0]],
      obs: [{ k: "weight", t: 0.25, side: 1, d: 140, reach: 34 }, { k: "weight", t: 0.5, side: 1, d: 140, reach: 34, phase: 0.5 }, { k: "weight", t: 0.75, side: 1, d: 140, reach: 34 }] },
    { name: "Metronome Row", stage: 2, bpm: 96, hw: 48, path: roundPoly([[120, 820], [120, 200], [880, 200], [880, 820]], 140, 95, [500, 820]),
      tickets: [[0.25, 0], [0.5, 0], [0.75, 0]],
      obs: [{ k: "weight", t: 0.39, side: 1, d: 150, reach: 30 }, { k: "weight", t: 0.47, side: 1, d: 150, reach: 30, phase: 0.5 },
            { k: "weight", t: 0.55, side: 1, d: 150, reach: 30 }, { k: "weight", t: 0.63, side: 1, d: 150, reach: 30, phase: 0.5 }] },

    // ---- IV. live rails: a stretch of channel goes live on some beats (warning the beat before)
    { name: "Live Stretch", stage: 3, bpm: 108, hw: 52, path: oval(500, 500, 340, 310, 24),
      tickets: [[0.25, 0], [0.62, 0], [0.85, 0]],
      obs: [{ k: "live", t0: 0.42, t1: 0.52, period: 4, on: [2, 4] }] },
    { name: "Relay", stage: 3, bpm: 108, hw: 50, path: roundPoly(RECT, 130, 95, [500, 840]),
      tickets: [[0.2, 0], [0.5, 0], [0.8, 0]],
      obs: [{ k: "live", t0: 0.3, t1: 0.4, period: 4, on: [0, 2] }, { k: "live", t0: 0.6, t1: 0.7, period: 4, on: [2, 4] }] },
    { name: "Hot Corners", stage: 3, bpm: 112, hw: 48, path: oval(500, 500, 300, 300, 30, { lobes: 3, amp: 0.3, ph: 180 }),
      tickets: [[0.08, 0], [0.42, 0], [0.75, 0]],
      obs: [{ k: "live", t0: 0.13, t1: 0.21, period: 6, on: [3, 6] }, { k: "live", t0: 0.46, t1: 0.54, period: 6, on: [1, 4] },
            { k: "live", t0: 0.79, t1: 0.87, period: 6, on: [0, 3] }] },
    { name: "Third Rail", stage: 3, bpm: 112, hw: 50, path: roundPoly([[110, 720], [110, 280], [890, 280], [890, 720]], 160, 95, [500, 720]),
      tickets: [[0.15, 0], [0.5, 0.6], [0.85, 0]],
      obs: [{ k: "live", t0: 0.3, t1: 0.4, period: 4, on: [2, 4] }, { k: "spark", t0: 0.44, t1: 0.6, n: 5, lane: -1 },
            { k: "live", t0: 0.64, t1: 0.74, period: 4, on: [0, 2] }] },
    { name: "Power Cut", stage: 3, bpm: 112, hw: 46, path: comb(160, 840, 170, 610, 850, 6, 66),
      tickets: [[0.1, 0], [0.42, 0], [0.7, 0]],
      obs: [{ k: "live", t0: 0.2, t1: 0.3, period: 8, on: [4, 8] }, { k: "live", t0: 0.5, t1: 0.6, period: 8, on: [0, 4] }] },

    // ---- V. gates slide out of a wire and across the channel
    { name: "Turnstile", stage: 4, bpm: 116, hw: 52, path: oval(500, 500, 340, 310, 24),
      tickets: [[0.25, 0], [0.6, 0], [0.85, 0]],
      obs: [{ k: "gate", t: 0.45, side: 1, period: 4, shut: [0, 2] }] },
    { name: "Lock Step", stage: 4, bpm: 116, hw: 50, path: roundPoly([[110, 720], [110, 280], [890, 280], [890, 720]], 160, 95, [500, 720]),
      tickets: [[0.2, 0], [0.5, 0], [0.8, 0]],
      obs: [{ k: "gate", t: 0.4, side: 1, period: 4, shut: [0, 2] }, { k: "gate", t: 0.48, side: -1, period: 4, shut: [1, 3] },
            { k: "gate", t: 0.56, side: 1, period: 4, shut: [2, 4] }] },
    { name: "Portcullis", stage: 4, bpm: 120, hw: 44, path: comb(170, 830, 190, 620, 850, 4, 90),
      tickets: [[0.12, 0], [0.4, 0], [0.62, 0]],
      obs: [{ k: "gate", t: 0.2, side: 1, period: 4, shut: [0, 2] }, { k: "gate", t: 0.34, side: -1, period: 4, shut: [2, 4] },
            { k: "gate", t: 0.48, side: 1, period: 4, shut: [0, 2] }] },
    { name: "Half Shut", stage: 4, bpm: 120, hw: 54, path: oval(500, 500, 350, 320, 26),
      tickets: [[0.15, 0], [0.45, 0], [0.75, 0]],
      obs: [{ k: "gate", t: 0.27, side: 1, period: 2, shut: [0, 1], f: 0.55 }, { k: "gate", t: 0.32, side: -1, period: 2, shut: [1, 2], f: 0.55 },
            { k: "gate", t: 0.6, side: -1, period: 2, shut: [0, 1], f: 0.55 }, { k: "gate", t: 0.65, side: 1, period: 2, shut: [1, 2], f: 0.55 }] },
    { name: "Gatehouse", stage: 4, bpm: 120, hw: 50, path: roundPoly(RECT, 130, 95, [500, 840]),
      tickets: [[0.2, 0], [0.5, 0], [0.8, 0]],
      obs: [{ k: "gate", t: 0.33, side: 1, period: 4, shut: [2, 4] }, { k: "weight", t: 0.5, side: 1, d: 150, reach: 26 },
            { k: "gate", t: 0.67, side: -1, period: 4, shut: [0, 2] }] },

    // ---- VI. arms turn on a hub, a step on the beat
    { name: "Windmill", stage: 5, bpm: 120, hw: 52, path: oval(500, 500, 340, 310, 24), bumps: [[0.5, 30, 0.07]],
      tickets: [[0.25, 0], [0.7, 0], [0.88, 0]],
      obs: [{ k: "arm", t: 0.5, len: 74, a0: 0, turn: 90 }] },
    { name: "Ratchet", stage: 5, bpm: 120, hw: 50, path: roundPoly([[110, 720], [110, 280], [890, 280], [890, 720]], 160, 95, [500, 720]),
      bumps: [[0.4, 28, 0.05], [0.6, 28, 0.05]],
      tickets: [[0.2, 0], [0.5, 0], [0.8, 0]],
      obs: [{ k: "arm", t: 0.4, len: 72, a0: 90, turn: 90, every: 1 }, { k: "arm", t: 0.6, len: 72, a0: 0, turn: -90, every: 1 }] },
    { name: "Propeller", stage: 5, bpm: 124, hw: 50, path: oval(500, 500, 350, 320, 26), bumps: [[0.3, 34, 0.06], [0.7, 34, 0.06]],
      tickets: [[0.15, 0], [0.5, 0], [0.85, 0]],
      obs: [{ k: "arm", t: 0.3, len: 80, both: true, spin: true, turn: 45, every: 1 }, { k: "arm", t: 0.7, len: 80, both: true, spin: true, turn: -45, every: 1 }] },
    { name: "Clockwork", stage: 5, bpm: 124, hw: 50, path: roundPoly(RECT, 130, 95, [500, 840]), bumps: [[0.45, 28, 0.05]],
      tickets: [[0.2, 0], [0.6, 0], [0.82, 0]],
      obs: [{ k: "gate", t: 0.3, side: 1, period: 4, shut: [0, 2] }, { k: "arm", t: 0.45, len: 70, a0: 0, turn: 90 },
            { k: "spark", t0: 0.66, t1: 0.76, n: 4, lane: 1 }] },
    { name: "Grand Circuit", stage: 5, bpm: 128, hw: 50, path: oval(500, 500, 360, 330, 32, { lobes: 4, amp: 0.1, ph: 0 }),
      bumps: [[0.62, 30, 0.05]],
      tickets: [[0.1, 0], [0.3, 0.6], [0.5, -0.6], [0.7, 0], [0.9, 0.6]],
      obs: [{ k: "spark", t0: 0.12, t1: 0.22, n: 4, lane: -1 }, { k: "weight", t: 0.33, side: 1, d: 150, reach: 26 },
            { k: "live", t0: 0.42, t1: 0.5, period: 4, on: [2, 4] }, { k: "gate", t: 0.55, side: -1, period: 4, shut: [0, 2] },
            { k: "arm", t: 0.62, len: 72, a0: 0, turn: 90 }, { k: "gate", t: 0.8, side: 1, period: 4, shut: [2, 4], f: 0.6 }] }
  ];

  // the backing for each stage, synthesized by game.js: a bar of eight
  // eighths twice (MIDI notes, 0 a rest) for the bass and the bell, and
  // the drum pattern (k kick, h hat, . rest) over the same eighths
  var tunes = [
    { bass: [43, 0, 43, 0, 46, 0, 41, 0, 43, 0, 43, 0, 50, 0, 48, 0], bell: [0, 0, 74, 0, 0, 0, 70, 0, 0, 0, 74, 0, 77, 0, 0, 0], drums: "k.h.k.h.k.h.khh." },
    { bass: [45, 45, 0, 45, 52, 0, 50, 0, 45, 45, 0, 45, 48, 0, 47, 0], bell: [0, 76, 0, 0, 0, 79, 0, 0, 0, 76, 0, 0, 81, 0, 79, 0], drums: "khh.khh.khh.khhh" },
    { bass: [38, 0, 0, 0, 45, 0, 0, 0, 41, 0, 0, 0, 43, 0, 45, 0], bell: [74, 0, 0, 0, 0, 0, 72, 0, 69, 0, 0, 0, 0, 0, 0, 0], drums: "k...h...k...h.h." },
    { bass: [40, 40, 52, 40, 40, 52, 47, 40, 40, 40, 52, 40, 43, 45, 47, 0], bell: [0, 0, 0, 76, 0, 0, 0, 71, 0, 0, 0, 76, 0, 0, 79, 0], drums: "k.hkk.h.k.hkk.hh" },
    { bass: [36, 0, 48, 36, 0, 48, 39, 0, 41, 0, 53, 41, 0, 53, 43, 0], bell: [72, 0, 0, 75, 0, 0, 79, 0, 77, 0, 0, 72, 0, 0, 74, 0], drums: "khhkkhhkkhhkkhkh" },
    { bass: [41, 41, 53, 41, 44, 44, 56, 44, 46, 46, 58, 46, 48, 48, 51, 53], bell: [77, 0, 80, 0, 82, 0, 80, 0, 77, 0, 75, 0, 72, 0, 75, 0], drums: "k.hhk.hhk.hhkkhh" }
  ];

  var api = { stages: stages, levels: levels, tunes: tunes, oval: oval, roundPoly: roundPoly, comb: comb };
  root.BuzzLevels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
