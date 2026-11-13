/* =====================================================================
   Buzz Wire: the course and its obstacles, worked out in board units (a
   square board 1000 a side). Pure: the game draws and plays from it, and
   _dev/tools/buzz-wire-check.js proves every level with the same sums.

   A course is a closed circuit: a smooth centre line through the level's
   points (Catmull-Rom, round and round), with a half-width at each point.
   The channel is every spot within that half-width of the line; its edges
   are the live wires. The ring (radius RING) is clear while its middle is
   at least RING inside the channel, and touches a wire otherwise.

   Every moving obstacle is a function of the beat (b, counted from the
   level's start at its tempo), so the game, the checker and the tests all
   agree on where each one is, music or no music:
   - spark: hops along a stretch of the channel, a station a beat, there
     and back, riding a lane (the middle, or close by one wire)
   - weight: a bob on a rod hung beside the channel, swinging across it,
     at the ends of its swing on the beat
   - live: a stretch of the channel goes live on some beats of a cycle
     (and warns in the beat before)
   - gate: a bar slides out of one wire across the channel and back
   - arm: a bar turns on a hub, a step on the beat
   ===================================================================== */
(function (root) {
  "use strict";

  var W = 1000;            // the board's side, in units
  var RING = 12;           // the ring's radius
  var WIRE = 5;            // the drawn thickness of a live wire
  var CHECKS = 4;          // the circuit is passed in quarters: three marks and the post

  // ---- the centre line ------------------------------------------------------------
  // points: [[x, y, hw?], ...] round the circuit, clockwise on the screen;
  // hw: the half-width where a point gives none
  function build(level) {
    var P = level.path, n = P.length, hw0 = level.hw || 50, pts = [];
    function at(i) { var p = P[((i % n) + n) % n]; return { x: p[0], y: p[1], w: p[2] == null ? hw0 : p[2] }; }
    for (var i = 0; i < n; i++) {
      var p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      var span = Math.hypot(p2.x - p1.x, p2.y - p1.y), k = Math.max(4, Math.ceil(span / 12));
      for (var j = 0; j < k; j++) {
        var t = j / k, t2 = t * t, t3 = t2 * t;
        var x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        var y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        // (the width eases between points, so a pinch narrows smoothly)
        var e = t * t * (3 - 2 * t);
        pts.push({ x: x, y: y, w: p1.w + (p2.w - p1.w) * e });
      }
    }
    // bumps: [[t, extra, span], ...]: the channel wider (or, with a minus,
    // narrower) round arc fraction t, easing off over span either side
    if (level.bumps && level.bumps.length) {
      var acc = [0], tot = 0;
      for (var q0 = 0; q0 < pts.length; q0++) { var nx0 = pts[(q0 + 1) % pts.length]; tot += Math.hypot(nx0.x - pts[q0].x, nx0.y - pts[q0].y); acc.push(tot); }
      pts.forEach(function (p, q1) {
        var t = acc[q1] / tot;
        level.bumps.forEach(function (bm) {
          var dt = Math.abs(((t - bm[0]) % 1 + 1.5) % 1 - 0.5);
          if (dt < bm[2]) p.w += bm[1] * 0.5 * (1 + Math.cos(Math.PI * dt / bm[2]));
        });
      });
    }
    var segs = [], s = 0, maxW = 0;
    for (var q = 0; q < pts.length; q++) {
      var a = pts[q], b = pts[(q + 1) % pts.length], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1e-9;
      var w = (a.w + b.w) / 2;
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, dx: dx / len, dy: dy / len, len: len, w: w, s0: s });
      s += len; if (w > maxW) maxW = w;
    }
    var c = { level: level, pts: pts, segs: segs, L: s, maxW: maxW };
    c.checks = [];
    for (var k2 = 1; k2 < CHECKS; k2++) c.checks.push(s * k2 / CHECKS);
    c.post = posAt(c, 0);
    c.tickets = (level.tickets || []).map(function (tk) {
      var p = posAt(c, tk[0] * s), off = (tk[1] || 0) * Math.max(0, p.w - RING - 4);
      return { x: p.x + p.nx * off, y: p.y + p.ny * off, s: tk[0] * s };
    });
    return c;
  }

  function wrap(c, s) { return ((s % c.L) + c.L) % c.L; }
  // the point of the centre line at arc s: where, its normal (to the right
  // of the way round), its direction and the channel's half-width there
  function posAt(c, s) {
    s = wrap(c, s);
    var lo = 0, hi = c.segs.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (c.segs[mid].s0 <= s) lo = mid; else hi = mid - 1; }
    var g = c.segs[lo], u = Math.min(1, (s - g.s0) / g.len);
    return { x: g.ax + (g.bx - g.ax) * u, y: g.ay + (g.by - g.ay) * u, tx: g.dx, ty: g.dy, nx: -g.dy, ny: g.dx, w: g.w };
  }

  function segDist2(g, x, y) {
    var u = (x - g.ax) * g.dx + (y - g.ay) * g.dy;
    if (u < 0) u = 0; else if (u > g.len) u = g.len;
    var px = g.ax + g.dx * u - x, py = g.ay + g.dy * u - y;
    return { d2: px * px + py * py, u: u };
  }
  // how far inside the channel a point lies (its deepest spot over the
  // capsules that make it up): the ring is clear of the wires while this
  // is at least RING
  function depth(c, x, y) {
    var best = -1e9;
    for (var i = 0; i < c.segs.length; i++) {
      var g = c.segs[i];
      // (no deeper than the nearest it could be: skipped when that can't win)
      var lb = Math.hypot(x - (g.ax + g.bx) / 2, y - (g.ay + g.by) / 2) - g.len / 2;
      if (g.w - (lb > 0 ? lb : 0) <= best) continue;
      var r = segDist2(g, x, y), d = g.w - Math.sqrt(r.d2);
      if (d > best) best = d;
    }
    return best;
  }
  // the arc of the centre line nearest a point; with a hint, only near that
  // arc (a ring that can't jump stays on its own part of the course, even
  // where the circuit passes close to itself)
  function project(c, x, y, hint, span) {
    var best = 1e18, bs = 0, all = hint == null;
    span = span || 90;
    for (var i = 0; i < c.segs.length; i++) {
      var g = c.segs[i];
      if (!all) {
        var mid = g.s0 + g.len / 2, d = Math.abs(wrap(c, mid - hint + c.L / 2) - c.L / 2);
        if (d > span + g.len) continue;
      }
      var r = segDist2(g, x, y);
      if (r.d2 < best) { best = r.d2; bs = g.s0 + r.u; }
    }
    return { s: wrap(c, bs), d: Math.sqrt(best) };
  }

  // ---- the beat ------------------------------------------------------------------------
  function smooth(u) { return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u); }
  // a count that steps on the beat: still for most of each beat, moving
  // over the part mv of it that starts on the beat
  function stepped(b, mv) { var k = Math.floor(b); return k + smooth((b - k) / mv); }
  // there and back over stations 0..n-1
  function pingpong(x, n) { if (n < 2) return 0; var p = 2 * (n - 1), m = ((x % p) + p) % p; return m <= n - 1 ? m : p - m; }
  function inCycle(b, period, from, to) { var m = ((b % period) + period) % period; return m >= from && m < to; }
  // 1 through beats [a, z) of each cycle, easing in over the `ramp` before
  // a and out over the `ramp` after z (round the cycle's ends too)
  function pulse(b, period, a, z, ramp) {
    var m = ((b % period) + period) % period, best = 0;
    for (var k = -1; k <= 1; k++) {
      var a2 = a + k * period, z2 = z + k * period, v;
      if (m >= a2 && m < z2) v = 1;
      else if (m >= a2 - ramp && m < a2) v = smooth((m - a2 + ramp) / ramp);
      else if (m >= z2 && m < z2 + ramp) v = 1 - smooth((m - z2) / ramp);
      else v = 0;
      if (v > best) best = v;
    }
    return best;
  }

  // where every obstacle is at beat b: shapes to draw and to hit
  //   circle: { k, x, y, r }   bar: { k, ax, ay, bx, by, r }   live: { k, s0, s1, on, warn }
  function obstacles(c, b) {
    var out = [], L = c.L;
    (c.level.obs || []).forEach(function (o, i) {
      var every = o.every || 1;
      if (o.k === "spark") {
        var n = o.n || 4, u = pingpong(stepped(b / every + (o.phase || 0), o.mv || 0.35), n);
        var s = (o.t0 + (o.t1 - o.t0) * u / (n - 1)) * L, p = posAt(c, s), lane = (o.lane || 0) * Math.max(0, p.w - 14);
        out.push({ k: "spark", i: i, x: p.x + p.nx * lane, y: p.y + p.ny * lane, r: 12, s: s });
      } else if (o.k === "weight") {
        // (hung d to one side of the channel, its bob reaching `reach` past
        // the middle at the bottom of the swing)
        var q = posAt(c, o.t * L), side = o.side || 1, dd = o.d || 150, l = dd + (o.reach || 0);
        var px = q.x + q.nx * side * dd, py = q.y + q.ny * side * dd;
        var base = Math.atan2(-q.ny * side, -q.nx * side), th = (o.amp || 1) * Math.cos(Math.PI * (b / every + (o.phase || 0)));
        out.push({ k: "weight", i: i, px: px, py: py, x: px + Math.cos(base + th) * l, y: py + Math.sin(base + th) * l, r: o.r || 20 });
      } else if (o.k === "live") {
        var per = o.period || 4, on = o.on || [2, 4], live = inCycle(b, per, on[0], on[1]);
        // (warning through the beat before it goes live)
        out.push({ k: "live", i: i, s0: o.t0 * L, s1: o.t1 * L, on: live, warn: !live && inCycle(b + 1, per, on[0], on[0] + 1) });
      } else if (o.k === "gate") {
        var g = posAt(c, o.t * L), sd = o.side || 1, per2 = o.period || 4, sh = o.shut || [0, 2];
        // (it slides out over the 0.4 beat before it's shut, and back over the 0.4 after)
        var f = pulse(b, per2, sh[0], sh[1], 0.4);
        var reach = f * (o.f || 1) * (2 * g.w + 4), wx = g.x + g.nx * sd * (g.w + 8), wy = g.y + g.ny * sd * (g.w + 8);
        out.push({ k: "gate", i: i, ax: wx, ay: wy, bx: wx - g.nx * sd * (reach + 8), by: wy - g.ny * sd * (reach + 8), r: 7, f: f });
      } else if (o.k === "arm") {
        var h = posAt(c, o.t * L), hx = h.x + h.nx * (o.off || 0), hy = h.y + h.ny * (o.off || 0);
        var turns = o.spin ? b / every : stepped(b / every, o.mv || 0.3);
        var a = Math.atan2(h.ty, h.tx) + ((o.a0 || 0) + (o.turn || 90) * turns) * Math.PI / 180, len = o.len || 70;
        var tip = { x: hx + Math.cos(a) * len, y: hy + Math.sin(a) * len };
        var tail = o.both ? { x: hx - Math.cos(a) * len, y: hy - Math.sin(a) * len } : { x: hx, y: hy };
        out.push({ k: "arm", i: i, ax: tail.x, ay: tail.y, bx: tip.x, by: tip.y, r: 6, hx: hx, hy: hy, hub: 9 });
      }
    });
    return out;
  }

  function dist2Seg(x, y, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, u = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    var px = ax + dx * u - x, py = ay + dy * u - y;
    return px * px + py * py;
  }
  // what the ring at (x, y) touches at beat b, or null: "wire", "spark",
  // "weight", "live", "gate" or "arm". s: the ring's arc on the course (for
  // the live stretches); pad: extra room asked for all round (the checker's
  // margin)
  function hit(c, x, y, b, s, pad, obs) {
    pad = pad || 0;
    var R = RING + pad;
    if (depth(c, x, y) < R) return "wire";
    obs = obs || obstacles(c, b);
    for (var i = 0; i < obs.length; i++) {
      var o = obs[i];
      if (o.k === "spark" || o.k === "weight") { var rr = o.r + R; if ((x - o.x) * (x - o.x) + (y - o.y) * (y - o.y) < rr * rr) return o.k; }
      else if (o.k === "gate") { if (o.f > 0 && dist2Seg(x, y, o.ax, o.ay, o.bx, o.by) < (o.r + R) * (o.r + R)) return "gate"; }
      else if (o.k === "arm") {
        var hr = o.hub + R, ar = o.r + R;
        if ((x - o.hx) * (x - o.hx) + (y - o.hy) * (y - o.hy) < hr * hr || dist2Seg(x, y, o.ax, o.ay, o.bx, o.by) < ar * ar) return "arm";
      } else if (o.k === "live" && o.on) {
        if (s == null) s = project(c, x, y).s;
        var a = wrap(c, s - o.s0 + R), span = o.s1 - o.s0 + 2 * R;
        if (a <= span) return "live";
      }
    }
    return null;
  }

  var api = { W: W, RING: RING, WIRE: WIRE, CHECKS: CHECKS, build: build, posAt: posAt, wrap: wrap, depth: depth, project: project,
              obstacles: obstacles, hit: hit, stepped: stepped, pingpong: pingpong, smooth: smooth };
  root.BuzzCourse = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
