/* =====================================================================
   Orbits: the physics. A comet given one push flies under the pull of
   the suns (and a moon, where a chart has one), stepped 240 times to a
   second of flight by velocity Verlet. Pure: no DOM and no clock of its
   own. The page (game.js) and the level checker
   (_dev/tools/orbits-check.js) run this same code.

   The same push gives the same flight on every device, at any frame rate
   and with Visual FX on or off:
   - the push is two whole numbers, a bearing in tenths of a degree
     (0 north, clockwise) and a strength in tenths;
   - the step is fixed, and a flight is worked out whole at the launch,
     then played back by the page;
   - the sums use only + - * / and Math.sqrt, which every browser rounds
     the same way. Math.sin, cos, pow and hypot may differ in their last
     bit from one engine to the next, and a comet swinging close by two
     suns turns that bit into another course, so the sines here are
     worked out from their series with those operations alone.

   The chart is 1000 by 1000 units, y downwards. A flight ends when the
   comet touches a sun, a moon or a dust cloud, crosses the chart's edge,
   or has flown FLIGHT seconds; it is charted when every gate is lit
   (passed through, a gate marked twice twice over; in numbered order on
   a chart whose gates are numbered). Every test is made along the step's
   whole stretch, not only at its end, so a fast comet can't jump a sun
   or a gate between two steps.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.OrbitsPhysics = mod;
})(this, function () {
  "use strict";

  var W = 1000, H = 1000;
  var HZ = 240, DT = 1 / HZ;
  var FLIGHT = 14;                    // seconds: a few loops round a sun
  var STEPS = FLIGHT * HZ;
  var AFTER = HZ * 3 / 2;             // steps flown on once charted (the comet sails on a moment)
  var SPEED = 10;                     // units a second for each unit of strength
  var S_MIN = 50, S_MAX = 600;        // strength in tenths: 5.0 to 60.0
  // suns by size: pull (G times mass) and radius
  var SUNS = { 1: { gm: 1.0e7, r: 22 }, 2: { gm: 1.8e7, r: 28 }, 3: { gm: 3.0e7, r: 36 } };
  var MOON = { gm: 1.6e6, r: 13 };
  var EPS2 = 36;                      // softening (6 units), so the pull stays finite
  var GATE_R = 24;                    // a gate's ring: passing within this of its centre lights it
  var PREVIEW_LEN = 360;              // the dotted line's most, in units of path
  var PREVIEW_GATE = 4 * GATE_R;      // ...and it stops this far short of a gate's centre

  // ---- sines from their series ------------------------------------------
  var PI = 3.141592653589793, HALF = PI / 2, QUARTER = PI / 4, TAU = 2 * PI;
  // x from 0 to pi/4: the series to x^15 and x^14, exact to the last bit or so
  function sinS(x) { var q = x * x; return x * (1 - q / 6 * (1 - q / 20 * (1 - q / 42 * (1 - q / 72 * (1 - q / 110 * (1 - q / 156 * (1 - q / 210))))))); }
  function cosS(x) { var q = x * x; return 1 - q / 2 * (1 - q / 12 * (1 - q / 30 * (1 - q / 56 * (1 - q / 90 * (1 - q / 132 * (1 - q / 182)))))); }
  // r in a quarter turn (radians, 0 to pi/2), turned on q quarter turns
  function quarter(r, q, out) {
    var s, c;
    if (r <= QUARTER) { s = sinS(r); c = cosS(r); } else { s = cosS(HALF - r); c = sinS(HALF - r); }
    if (q === 0) { out[0] = s; out[1] = c; }
    else if (q === 1) { out[0] = c; out[1] = -s; }
    else if (q === 2) { out[0] = -s; out[1] = -c; }
    else { out[0] = -c; out[1] = s; }
    return out;
  }
  // sine and cosine of an angle in radians
  function sinCos(t, out) {
    t -= Math.floor(t / TAU) * TAU;
    var q = Math.floor(t / HALF); if (q > 3) q = 3;
    return quarter(t - q * HALF, q, out || [0, 0]);
  }
  // ...and of a bearing in tenths of a degree (whole numbers, so the
  // quarter turns come off exactly)
  function sinCosTenths(a, out) {
    a = ((a % 3600) + 3600) % 3600;
    var q = Math.floor(a / 900);
    return quarter((a - q * 900) * PI / 1800, q, out || [0, 0]);
  }

  // A push as a velocity: bearing a (tenths of a degree, 0 north and
  // clockwise) and strength s (tenths)
  function velocity(a, s) {
    var sc = sinCosTenths(a), v = s / 10 * SPEED;
    return [sc[0] * v, -sc[1] * v];
  }

  // ---- a chart, made ready to fly ---------------------------------------
  // A level: { start: [x, y], suns: [[x, y, size]], gates: [[x, y, times?]],
  // ordered, dust: [[x, y, r]], moons: [{ sun, r, period, phase, dir }] }
  function prepare(L) {
    return {
      sx: L.start[0], sy: L.start[1],
      suns: L.suns.map(function (s) { var k = SUNS[s[2] || 2]; return { x: s[0], y: s[1], gm: k.gm, r: k.r }; }),
      gates: L.gates.map(function (g) { return { x: g[0], y: g[1], times: g[2] || 1 }; }),
      ordered: !!L.ordered,
      dust: (L.dust || []).map(function (d) { return { x: d[0], y: d[1], r: d[2] }; }),
      moons: (L.moons || []).map(function (m) {
        var s = L.suns[m.sun];
        return { cx: s[0], cy: s[1], r: m.r, phase: m.phase * PI / 180, w: (m.dir < 0 ? -1 : 1) * TAU / (m.period * HZ) };
      })
    };
  }
  // a chart made ready once and remembered (by the chart itself, not a
  // property on it, so a copy of a chart is made ready afresh)
  var ready = typeof WeakMap === "function" ? new WeakMap() : null;
  function prepared(L) {
    if (!ready) return prepare(L);
    var p = ready.get(L);
    if (!p) { p = prepare(L); ready.set(L, p); }
    return p;
  }
  // where a moon is at step n (it waits at its phase while a push is aimed,
  // and goes round from the launch: its place is the step's alone)
  var mc = [0, 0];
  function moonAt(m, n, out) {
    sinCos(m.phase + m.w * n, mc);
    out[0] = m.cx + m.r * mc[0]; out[1] = m.cy - m.r * mc[1];
    return out;
  }

  // the first point along the stretch p0 -> p1 that is within r of (cx, cy),
  // as a fraction of the stretch (0 when p0 is already within), or -1
  function touch(x0, y0, x1, y1, cx, cy, r) {
    var fx = x0 - cx, fy = y0 - cy, c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    var dx = x1 - x0, dy = y1 - y0, a = dx * dx + dy * dy;
    if (a === 0) return -1;
    var b = 2 * (fx * dx + fy * dy), disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    var t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
  }
  // where the stretch first crosses the chart's edge, or -1
  function edge(x0, y0, x1, y1) {
    var t = 2;
    if (x1 < 0) t = Math.min(t, x0 / (x0 - x1));
    if (x1 > W) t = Math.min(t, (W - x0) / (x1 - x0));
    if (y1 < 0) t = Math.min(t, y0 / (y0 - y1));
    if (y1 > H) t = Math.min(t, (H - y0) / (y1 - y0));
    return t <= 1 ? t : -1;
  }

  // ---- a flight -----------------------------------------------------------
  // fly(level, a, s, opts) -> {
  //   xs, ys: the comet at every step (n of them; the last is where it ended),
  //   end: { kind: "sun" | "moon" | "dust" | "edge" | "time" | "charted", at, which },
  //   lit: [{ gate, at, count, done }]: each pass through a gate that counted,
  //   charted: the step (with its fraction) the last gate lit, or null,
  //   preview: the step the dotted line ends at (see below), and
  //   previewWhy: "swing" | "length" | "gate" | "end", what ended it
  // }
  // `at` is a step and its fraction. opts.previewOnly stops at the end of
  // the dotted line.
  //
  // The dotted line shown before a launch is the start of this same flight:
  // up to the comet's first closest pass by a sun (where the distance to the
  // nearest sun, having shrunk, starts to grow), or PREVIEW_LEN units of
  // path, or PREVIEW_GATE short of any gate, whichever comes first, or the
  // flight's end if that is sooner. So it shows the push's first stretch
  // and how the comet starts to fall toward its first sun, never the swing
  // round it, and it never runs up to a gate.
  function fly(level, a, s, opts) {
    var P = prepared(level);
    var previewOnly = !!(opts && opts.previewOnly);
    var max = previewOnly ? Math.min(STEPS, HZ * 4) : STEPS;
    var xs = new Float64Array(max + 1), ys = new Float64Array(max + 1);
    var v = velocity(a, s), x = P.sx, y = P.sy, vx = v[0], vy = v[1];
    var nS = P.suns.length, nM = P.moons.length, nG = P.gates.length, nD = P.dust.length, i, k, t;
    var Sx = new Float64Array(nS), Sy = new Float64Array(nS), Sg = new Float64Array(nS), Sr = new Float64Array(nS);
    for (i = 0; i < nS; i++) { Sx[i] = P.suns[i].x; Sy[i] = P.suns[i].y; Sg[i] = P.suns[i].gm; Sr[i] = P.suns[i].r; }
    var Gx = new Float64Array(nG), Gy = new Float64Array(nG), Gt = new Int32Array(nG);
    for (i = 0; i < nG; i++) { Gx[i] = P.gates[i].x; Gy[i] = P.gates[i].y; Gt[i] = P.gates[i].times; }
    // each moon's place at every step, worked out once (the pull and the
    // test for a touch both read it)
    var Mx = [], My = [], mpos = [0, 0];
    for (k = 0; k < nM; k++) {
      var ax0 = new Float64Array(max + 2), ay0 = new Float64Array(max + 2);
      for (i = 0; i <= max + 1; i++) { moonAt(P.moons[k], i, mpos); ax0[i] = mpos[0]; ay0[i] = mpos[1]; }
      Mx.push(ax0); My.push(ay0);
    }
    var R2 = GATE_R * GATE_R, MG = MOON.gm;
    var count = new Int32Array(nG), inside = new Uint8Array(nG), lit = [], charted = null, done = 0;
    var end = null, preview = -1, why = "end", pathLen = 0, near = Infinity, falling = false;
    for (i = 0; i < nG; i++) inside[i] = (x - Gx[i]) * (x - Gx[i]) + (y - Gy[i]) * (y - Gy[i]) <= R2 ? 1 : 0;
    for (i = 0; i < nS; i++) near = Math.min(near, Math.sqrt((x - Sx[i]) * (x - Sx[i]) + (y - Sy[i]) * (y - Sy[i])));
    xs[0] = x; ys[0] = y;
    var ax = 0, ay = 0, dx, dy, r2, f;
    for (k = 0; k < nS; k++) { dx = Sx[k] - x; dy = Sy[k] - y; r2 = dx * dx + dy * dy + EPS2; f = Sg[k] / (r2 * Math.sqrt(r2)); ax += f * dx; ay += f * dy; }
    for (k = 0; k < nM; k++) { dx = Mx[k][0] - x; dy = My[k][0] - y; r2 = dx * dx + dy * dy + EPS2; f = MG / (r2 * Math.sqrt(r2)); ax += f * dx; ay += f * dy; }
    var n = 0, stopAt = max, h1 = -1, h1t = 2, h2 = -1, h2t = 2;
    var HH = 0.5 * DT * DT;
    while (n < stopAt) {
      // velocity Verlet: a step of position, the pull there, then the velocity
      var nx = x + vx * DT + ax * HH, ny = y + vy * DT + ay * HH;
      var bx = 0, by = 0;
      for (k = 0; k < nS; k++) { dx = Sx[k] - nx; dy = Sy[k] - ny; r2 = dx * dx + dy * dy + EPS2; f = Sg[k] / (r2 * Math.sqrt(r2)); bx += f * dx; by += f * dy; }
      for (k = 0; k < nM; k++) { dx = Mx[k][n + 1] - nx; dy = My[k][n + 1] - ny; r2 = dx * dx + dy * dy + EPS2; f = MG / (r2 * Math.sqrt(r2)); bx += f * dx; by += f * dy; }
      vx += 0.5 * (ax + bx) * DT; vy += 0.5 * (ay + by) * DT;
      ax = bx; ay = by;
      // what this stretch runs into first: a sun, a moon, dust or the edge
      var tEnd = 2, kind = null, which = -1;
      for (i = 0; i < nS; i++) {
        t = touch(x, y, nx, ny, Sx[i], Sy[i], Sr[i]);
        if (t >= 0 && t < tEnd) { tEnd = t; kind = "sun"; which = i; }
      }
      for (i = 0; i < nM; i++) {
        // (the moon moves too: the stretch as seen from the moon)
        t = touch(x - Mx[i][n], y - My[i][n], nx - Mx[i][n + 1], ny - My[i][n + 1], 0, 0, MOON.r);
        if (t >= 0 && t < tEnd) { tEnd = t; kind = "moon"; which = i; }
      }
      for (i = 0; i < nD; i++) {
        t = touch(x, y, nx, ny, P.dust[i].x, P.dust[i].y, P.dust[i].r);
        if (t >= 0 && t < tEnd) { tEnd = t; kind = "dust"; which = i; }
      }
      t = edge(x, y, nx, ny);
      if (t >= 0 && t < tEnd) { tEnd = t; kind = "edge"; which = -1; }
      var tStop = kind ? tEnd : 1;
      // the dotted line's end: short of a gate, at its full length, or at
      // the first closest pass by a sun
      if (preview < 0) {
        var segLen = Math.sqrt((nx - x) * (nx - x) + (ny - y) * (ny - y)), tp = 2, tw = "gate";
        for (i = 0; i < nG; i++) { t = touch(x, y, nx, ny, Gx[i], Gy[i], PREVIEW_GATE); if (t >= 0 && t < tp) tp = t; }
        if (segLen > 0 && pathLen + segLen * tStop >= PREVIEW_LEN) { var tl = (PREVIEW_LEN - pathLen) / segLen; if (tl < tp) { tp = tl; tw = "length"; } }
        if (tp <= tStop) { preview = n + tp; why = tw; }
        else {
          var dn = Infinity;
          for (i = 0; i < nS; i++) dn = Math.min(dn, Math.sqrt((nx - Sx[i]) * (nx - Sx[i]) + (ny - Sy[i]) * (ny - Sy[i])));
          if (dn < near) falling = true;
          else if (falling && dn > near) { preview = n; why = "swing"; }
          near = dn;
          if (kind && preview < 0) { preview = n + tEnd; why = "end"; }
        }
        pathLen += segLen * tStop;
        if (preview >= 0 && previewOnly) stopAt = n;
      }
      // gates passed on the stretch, in the order they're reached, up to
      // whatever ended it (two at most in one stretch: gates lie far apart)
      if (!previewOnly && charted === null) {
        h1 = -1; h1t = 2; h2 = -1; h2t = 2;
        for (i = 0; i < nG; i++) {
          var wasIn = inside[i];
          inside[i] = (nx - Gx[i]) * (nx - Gx[i]) + (ny - Gy[i]) * (ny - Gy[i]) <= R2 ? 1 : 0;
          if (wasIn) continue;
          t = touch(x, y, nx, ny, Gx[i], Gy[i], GATE_R);
          if (t > 0 && t <= tStop) {
            if (t < h1t) { h2 = h1; h2t = h1t; h1 = i; h1t = t; } else if (t < h2t) { h2 = i; h2t = t; }
          }
        }
        for (var h = 0; h < 2 && charted === null; h++) {
          var gi = h === 0 ? h1 : h2, gt = h === 0 ? h1t : h2t;
          if (gi < 0 || count[gi] >= Gt[gi]) continue;
          if (P.ordered) { var open = true; for (i = 0; i < gi; i++) if (count[i] < Gt[i]) open = false; if (!open) continue; }
          count[gi]++;
          var isDone = count[gi] >= Gt[gi];
          if (isDone) done++;
          lit.push({ gate: gi, at: n + gt, count: count[gi], done: isDone });
          if (done === nG) { charted = n + gt; stopAt = Math.min(max, n + 1 + AFTER); }
        }
      }
      if (kind) {
        xs[n + 1] = x + (nx - x) * tEnd; ys[n + 1] = y + (ny - y) * tEnd;
        end = { kind: kind, at: n + tEnd, which: which };
        n++;
        break;
      }
      x = nx; y = ny; n++;
      xs[n] = x; ys[n] = y;
    }
    if (!end) end = { kind: charted !== null ? "charted" : "time", at: n, which: -1 };
    if (preview < 0) preview = n;
    return { xs: xs, ys: ys, n: n + 1, end: end, lit: lit, charted: charted, preview: Math.min(preview, n), previewWhy: why };
  }

  // the dotted line alone: the flight's start, as far as the line goes
  function preview(level, a, s) { return fly(level, a, s, { previewOnly: true }); }

  // where a flight is at step t (with its fraction): between two steps
  function at(f, t, out) {
    out = out || [0, 0];
    if (t <= 0) { out[0] = f.xs[0]; out[1] = f.ys[0]; return out; }
    var last = f.n - 1;
    if (t >= last) { out[0] = f.xs[last]; out[1] = f.ys[last]; return out; }
    var k = Math.floor(t), u = t - k;
    out[0] = f.xs[k] + (f.xs[k + 1] - f.xs[k]) * u; out[1] = f.ys[k] + (f.ys[k + 1] - f.ys[k]) * u;
    return out;
  }

  // A flight as one number, for the tests: every position's bits folded
  // together (the same flight on two devices gives the same number)
  function hash(f) {
    var buf = new Float64Array(1), bytes = new Uint32Array(buf.buffer), h = 2166136261 >>> 0;
    for (var k = 0; k < f.n; k++) {
      buf[0] = f.xs[k]; h = Math.imul(h ^ bytes[0], 16777619) >>> 0; h = Math.imul(h ^ bytes[1], 16777619) >>> 0;
      buf[0] = f.ys[k]; h = Math.imul(h ^ bytes[0], 16777619) >>> 0; h = Math.imul(h ^ bytes[1], 16777619) >>> 0;
    }
    return h.toString(16) + ":" + f.n + ":" + f.end.kind;
  }

  return {
    W: W, H: H, HZ: HZ, DT: DT, FLIGHT: FLIGHT, STEPS: STEPS, SPEED: SPEED, S_MIN: S_MIN, S_MAX: S_MAX,
    SUNS: SUNS, MOON: MOON, GATE_R: GATE_R, PREVIEW_LEN: PREVIEW_LEN, PREVIEW_GATE: PREVIEW_GATE,
    sinCos: sinCos, sinCosTenths: sinCosTenths, velocity: velocity, prepare: prepare, prepared: prepared, moonAt: moonAt,
    fly: fly, preview: preview, at: at, hash: hash
  };
});
