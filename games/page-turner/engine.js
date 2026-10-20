/* =====================================================================
   Page Turner: the rules of the falling pages, with no page in them.

   A giant picture book lies open with its far half standing upright.
   One leaf at a time stands up from that half, tips over and falls flat
   onto the half the worms crawl on. Every leaf is a grid of 3 x 3 panels
   and some of its pictures are cut right through: a worm wholly inside one
   of those holes when the leaf lands goes through to the next page; one
   anywhere else is squished flat and out. Several worms may share a hole,
   and worms are solid, so one can shove another out of it.

   Pages come faster as the book goes on, with fewer holes, and the holes
   get smaller. Light from behind the book shines through the holes of the
   leaf that is standing up, so its shadow on the page below carries bright
   patches exactly where the holes will land.

   Geometry is in page widths: the page the worms crawl on runs from 0 to 1
   both ways, y = 0 along the spine. A worm is a circle of radius TUNE.R.

     Party      you and three CPU worms; last worm wriggling wins, and the
                last ones squished by the same leaf draw
     Endless    you alone: how many pages you last, up to page 99

   step(st, dt, input) moves the game on; what happened lands in st.events
   (a leaf standing up, the slam, a worm through or squished...) for the
   page to draw and sound. Nothing here touches the document, so it runs
   under node too.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.PageTurnerEngine = mod;
})(this, function () {
  "use strict";

  var TUNE = {
    R: 0.04,            // a worm's footprint, in page widths
    squeeze: 0.006,     // how far a footprint may poke past a hole's edge and still squeeze through
    speed: 1.0,         // page widths a second
    accel: 9,           // speeding up, page widths a second a second...
    decel: 30,          // ...and stopping, quicker, so a worm can stop inside a small hole
    react: 0.4,         // the reaction every warning leaves room for
    intro: 1.2,         // the book settling open before the first leaf stands up
    cap: 99,            // Endless closes the book after this page
    panelHalf: 0.1667,  // half a panel
    holeRoom: 0.162     // how far a hole may reach from its panel's middle
  };

  // ---- the pace ----------------------------------------------------------------------
  // By page: how many holes, their size (the radius of the biggest circle that
  // fits inside, whatever the shape), how long the leaf stands before it tips,
  // how long it takes to fall, and the beat after it lands. The warning is
  // stand + fall: from the moment the shadow shows where the holes will land
  // to the slam. The holes shrink gently all the way to page 30; the leaf
  // stands a shorter while quickly, just under a second by page 9, then
  // eases on to its floor at page 30, as does everything else.
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function stage(p) {
    p = Math.max(1, p | 0);
    var size = clamp01((p - 1) / 29), pace = clamp01((p - 1) / 29);
    var s = {
      holes: p <= 3 ? 5 : p <= 7 ? 4 : p <= 12 ? 3 : p <= 18 ? 2 : 1,
      rin: lerp(0.135, 0.074, size),
      stand: p <= 9 ? lerp(1.9, 0.9, (p - 1) / 8) : lerp(0.9, 0.8, clamp01((p - 9) / 21)),
      fall: lerp(1.1, 0.85, pace),
      land: lerp(0.45, 0.35, pace)
    };
    s.warn = s.stand + s.fall;
    return s;
  }

  // ---- the holes -----------------------------------------------------------------------
  // Each shape is drawn to a unit inscribed circle round its middle, so a star
  // and a sun of one size let the same worm through; `ext` is how far the
  // shape reaches from its middle. A hole sits with the middle of the circle
  // round the whole shape on its panel's middle (MID: that point, from the
  // shape's own middle; only the moon's is off it), and `room` is how far it
  // reaches from there, which keeps it inside the panel.
  function ring(n, f) { var out = []; for (var i = 0; i < n; i++) { var a = (i / n) * Math.PI * 2 - Math.PI / 2; var r = f(a, i); out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; }
  function inradius(pts) { var m = Infinity; for (var i = 0; i < pts.length; i++) { var d = segDist(0, 0, pts[i], pts[(i + 1) % pts.length]); if (d < m) m = d; } return m; }
  function scaleTo(pts) { var k = 1 / inradius(pts); return pts.map(function (p) { return [p[0] * k, p[1] * k]; }); }
  // A moon: a crescent, the disc of radius 1 less a bite as big as its
  // offset, the bite to the upper right. `grow` widens it all round (the disc
  // bigger, the bite smaller: a rim along its cut keeps clear of the horns).
  // Its own middle is the biggest circle's inside it, in the thick of it:
  // across from the back (x = -1) to the bite's near edge (x = 0), so at
  // MOON_C with radius MOON_R.
  var MOON_BITE = 0.75, MOON_TURN = Math.atan2(-0.2, 0.45), MOON_C = -0.5, MOON_R = 0.5;
  function crescent(grow) {
    var d = MOON_BITE, ro = 1 + grow, rb = MOON_BITE - grow, n = 24, pts = [], i, a;
    var hx = (ro * ro + d * d - rb * rb) / (2 * d), hy = Math.sqrt(Math.max(0, ro * ro - hx * hx));
    var from = Math.atan2(hy, hx), lo = Math.atan2(-hy, hx - d) + Math.PI * 2, hi = Math.atan2(hy, hx - d);
    for (i = 0; i <= n; i++) { a = from + (Math.PI * 2 - 2 * from) * i / n; pts.push([Math.cos(a) * ro, Math.sin(a) * ro]); }
    for (i = 1; i < n; i++) { a = lo + (hi - lo) * i / n; pts.push([d + Math.cos(a) * rb, Math.sin(a) * rb]); }
    // (to the unit circle round its own middle, and turned)
    var c = Math.cos(MOON_TURN), s = Math.sin(MOON_TURN);
    return pts.map(function (p) { var x = (p[0] - MOON_C) / MOON_R, y = p[1] / MOON_R; return [x * c - y * s, x * s + y * c]; });
  }
  var SHAPES = {
    // a sun: a round hole (a printed ring of rays round it)
    sun: scaleTo(ring(40, function () { return 1; })),
    // a window: a square with round corners
    window: (function () {
      var out = [], rc = 0.4, c = 1 - rc;
      [[c, c, 0], [-c, c, 1], [-c, -c, 2], [c, -c, 3]].forEach(function (k) {
        for (var i = 0; i <= 6; i++) { var a = (k[2] + i / 6) * Math.PI / 2; out.push([k[0] + Math.cos(a) * rc, k[1] + Math.sin(a) * rc]); }
      });
      return scaleTo(out);
    })(),
    // a flower: six round petals
    flower: scaleTo(ring(60, function (a) { return 1 + 0.2 * Math.pow(Math.abs(Math.cos(a * 3)), 1.6); })),
    // a star: five fat points
    star: scaleTo(ring(10, function (a, i) { return i % 2 ? 0.6 : 1; })),
    // a moon: a fat crescent
    moon: crescent(0)
  };
  // (the moon's horns lie on its disc, so the circle round it all is that disc)
  var MID = { moon: [Math.cos(MOON_TURN) * -MOON_C / MOON_R, Math.sin(MOON_TURN) * -MOON_C / MOON_R] };
  function midOf(k) { return MID[k] || [0, 0]; }
  var SHAPE_EXT = {}, SHAPE_ROOM = {};
  Object.keys(SHAPES).forEach(function (k) {
    var m = midOf(k);
    SHAPE_EXT[k] = SHAPES[k].reduce(function (r, p) { return Math.max(r, Math.hypot(p[0], p[1])); }, 0);
    SHAPE_ROOM[k] = SHAPES[k].reduce(function (r, p) { return Math.max(r, Math.hypot(p[0] - m[0], p[1] - m[1])); }, 0);
  });
  // How big a hole of this shape is on a page whose holes are `rin`: that
  // size if it fits its panel, else as big as fits. Every shape comes on
  // every page: the star and the moon, which reach furthest, are smaller
  // than a page's other holes until those are as small, and never smaller
  // than the last pages' holes (the moon's biggest is just over those).
  function sizeFor(shape, rin) { return Math.min(rin, TUNE.holeRoom / SHAPE_ROOM[shape]); }

  function segDist(px, py, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var ex = px - a[0] - t * dx, ey = py - a[1] - t * dy;
    return Math.sqrt(ex * ex + ey * ey);
  }
  function inside(poly, x, y) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // how far inside a hole's edge a point is (negative: outside it)
  function edgeDepth(h, x, y) {
    var m = Infinity, poly = h.poly;
    for (var i = 0; i < poly.length; i++) { var d = segDist(x, y, poly[i], poly[(i + 1) % poly.length]); if (d < m) m = d; }
    return inside(poly, x, y) ? m : -m;
  }
  // does a worm standing here go through this hole?
  function fits(h, x, y) { return edgeDepth(h, x, y) >= TUNE.R - TUNE.squeeze; }
  function fitHole(leaf, x, y) { for (var i = 0; i < leaf.holes.length; i++) if (fits(leaf.holes[i], x, y)) return i; return -1; }

  function panelMid(i) { return [(i % 3) / 3 + 1 / 6, Math.floor(i / 3) / 3 + 1 / 6]; }
  function makeHole(panel, shape, rin) {
    var m = panelMid(panel), base = SHAPES[shape], o = midOf(shape), cx = m[0] - o[0] * rin, cy = m[1] - o[1] * rin;
    var h = { panel: panel, shape: shape, rin: rin, cx: cx, cy: cy, poly: base.map(function (p) { return [cx + p[0] * rin, cy + p[1] * rin]; }) };
    h.room = rin - (TUNE.R - TUNE.squeeze);        // the fit region's own radius, round the middle
    return h;
  }
  // a hole's outline widened by `grow` all round (a rim printed along its
  // cut): the shape spread about its middle, or for the moon, a fatter moon
  function rim(h, grow) {
    if (h.shape === "moon") return crescent(grow / h.rin * MOON_R).map(function (p) { return [h.cx + p[0] * h.rin, h.cy + p[1] * h.rin]; });
    var k = (h.rin + grow) / h.rin;
    return h.poly.map(function (p) { return [h.cx + (p[0] - h.cx) * k, h.cy + (p[1] - h.cy) * k]; });
  }
  // the edge of the region where a worm's middle can stand and go through
  // (the nearest way in from outside is always across it). Every shape's
  // region is seen whole from the hole's middle, so it's traced by rays out
  // from there; worked out when first asked for, by the reach check.
  function fitRegion(h) {
    if (h.edge) return h;
    var edge = [], N = 144, far = SHAPE_EXT[h.shape] * h.rin;
    for (var k = 0; k < N; k++) {
      var a = k / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), lo = 0, hi = far;
      for (var it = 0; it < 16; it++) { var mid = (lo + hi) / 2; if (fits(h, h.cx + c * mid, h.cy + s * mid)) lo = mid; else hi = mid; }
      edge.push([h.cx + c * lo, h.cy + s * lo]);
    }
    h.edge = edge;
    return h;
  }
  // how many worms can stand in a hole at once (the fit region as a disc;
  // worms keep their middles 2R apart)
  function capacity(h) {
    var f = h.room / TUNE.R;
    return f < 1 ? 1 : f < 1.155 ? 2 : f < 1.414 ? 3 : f < 1.701 ? 4 : f < 2 ? 5 : 6;
  }

  // ---- a leaf -------------------------------------------------------------------------
  // Its holes, and what is printed in the other panels: a picture that is
  // only printed (no way through), or a block of the book's nonsense words.
  var PRINTS = ["sun", "moon", "star", "flower", "window"];
  function makeLeaf(n, rng) {
    var s = stage(n), panels = [0, 1, 2, 3, 4, 5, 6, 7, 8], i;
    for (i = panels.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = panels[i]; panels[i] = panels[j]; panels[j] = t; }
    // (each hole's shape drawn from those not yet on the page: no two alike)
    var left = [], leaf = { n: n, holes: [], prints: [], seed: Math.floor(rng() * 1e9) };
    for (i = 0; i < 9; i++) {
      if (!left.length) left = Object.keys(SHAPES);
      if (i < s.holes) { var shape = left.splice(Math.floor(rng() * left.length), 1)[0]; leaf.holes.push(makeHole(panels[i], shape, sizeFor(shape, s.rin))); }
      else leaf.prints.push({ panel: panels[i], kind: rng() < 0.6 ? PRINTS[Math.floor(rng() * PRINTS.length)] : "words" });
    }
    leaf.holes.sort(function (a, b) { return a.panel - b.panel; });
    return leaf;
  }

  // ---- worms --------------------------------------------------------------------------
  var NAMES = ["You", "Rosy", "Clem", "Indy"];
  var LEVELS = {
    // read: seconds after a leaf stands before it's read; speed: of yours;
    // err: how far off its middle a hole is aimed at; misread: the chance
    // of heading for a printed picture; second: when, through the fall, it
    // takes a second look (the easy ones late, often too late)
    easy:   { read: [0.55, 0.85], speed: 0.82, err: 0.034, misread: 0.2,  second: 0.6 },
    normal: { read: [0.34, 0.52], speed: 0.9,  err: 0.017, misread: 0.1,  second: 0.35 },
    hard:   { read: [0.2, 0.3],   speed: 0.97, err: 0.006, misread: 0.03, second: 0.2 }
  };
  function makeWorm(i, x, y, level) {
    return { id: i, name: NAMES[i], x: x, y: y, vx: 0, vy: 0, ang: -Math.PI / 2, crawl: 0, alive: true, out: 0, place: 0,
      cpu: level ? { level: level, readAt: 0, read: false, second: false, target: null, hole: -1, decoy: false, wander: null, next: 0 } : null };
  }

  // ---- a game -------------------------------------------------------------------------
  // opts: { mode: "party" | "endless", level: "easy" | "normal" | "hard", rng }
  function create(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random, mode = opts.mode === "endless" ? "endless" : "party";
    var st = { mode: mode, level: LEVELS[opts.level] ? opts.level : "normal", rng: rng, clock: 0, t: 0, phase: "intro",
      page: 1, survived: 0, landed: 0, leaf: null, next: null, floor: null, worms: [], events: [], result: null };
    st.leaf = makeLeaf(1, rng); st.next = makeLeaf(2, rng);
    if (mode === "endless") st.worms.push(makeWorm(0, 0.5, 0.62, null));
    else {
      st.worms.push(makeWorm(0, 0.3, 0.68, null));
      st.worms.push(makeWorm(1, 0.7, 0.68, st.level));
      st.worms.push(makeWorm(2, 0.3, 0.36, st.level));
      st.worms.push(makeWorm(3, 0.7, 0.36, st.level));
    }
    return st;
  }
  function alive(st) { return st.worms.filter(function (w) { return w.alive; }); }
  function emit(st, type, extra) { var e = extra || {}; e.type = type; e.at = st.clock; st.events.push(e); }

  // how far over the leaf is: 0 standing up, 1 flat on the worms
  // (it falls the way a leaf does: slowly at first, then all at once)
  function tilt(st) {
    if (st.phase === "fall") { var s = stage(st.page), u = clamp01(st.t / s.fall); return u * u; }
    return st.phase === "land" ? 1 : 0;
  }

  // one worm's move: the wanted direction (length up to 1) at its top speed
  function moveWorm(w, ix, iy, dt, top) {
    crawl(w, ix, iy, dt, top);
    var R = TUNE.R;
    if (w.x < R) { w.x = R; if (w.vx < 0) w.vx = 0; } else if (w.x > 1 - R) { w.x = 1 - R; if (w.vx > 0) w.vx = 0; }
    if (w.y < R) { w.y = R; if (w.vy < 0) w.vy = 0; } else if (w.y > 1 - R) { w.y = 1 - R; if (w.vy > 0) w.vy = 0; }
  }
  // (the move itself, with no page edge to stop it)
  function crawl(w, ix, iy, dt, top) {
    var m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; m = 1; }
    var tx = ix * top, ty = iy * top, dvx = tx - w.vx, dvy = ty - w.vy, dl = Math.hypot(dvx, dvy);
    var rate = (m * top < Math.hypot(w.vx, w.vy) - 1e-9) ? TUNE.decel : TUNE.accel, stepv = rate * dt;
    if (dl <= stepv) { w.vx = tx; w.vy = ty; } else { w.vx += dvx / dl * stepv; w.vy += dvy / dl * stepv; }
    w.x += w.vx * dt; w.y += w.vy * dt;
    var sp = Math.hypot(w.vx, w.vy);
    if (sp > 0.05) {
      var want = Math.atan2(w.vy, w.vx), d = want - w.ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      var turn = Math.max(-12 * dt, Math.min(12 * dt, d));
      w.ang += turn; w.bend = turn / Math.max(dt, 1e-6);
    } else w.bend = 0;
    w.crawl += sp * dt;
  }

  // solid worms: overlapping footprints push apart, half each, so a worm
  // crawling into another shoves it along at half speed. But a worm settled
  // wholly inside a hole of the leaf standing or falling keeps its place:
  // one that runs into it takes the whole push, so no worm is shoved out of
  // a hole it got to first (it gives its half only where that leaves it still
  // wholly inside, making room in a hole for two); of two settled in one hole,
  // the one moving takes it, as much as it's the quicker (two loose ones share
  // it half each)
  // (a's share of a push between two settled worms: the moving one's)
  function quicker(a, b) { var sa = Math.hypot(a.vx, a.vy), sb = Math.hypot(b.vx, b.vy); return sa + sb < 1e-6 ? 0.5 : sa / (sa + sb); }
  function separate(st) {
    var ws = alive(st), R2 = TUNE.R * 2, hit = 0, live = st.phase === "stand" || st.phase === "fall";
    var settled = ws.map(function (w) { return live ? fitHole(st.leaf, w.x, w.y) >= 0 : false; }), holeOf = ws.map(function (w) { return live ? fitHole(st.leaf, w.x, w.y) : -1; });
    // (a settled worm moved by dx, dy: still wholly inside its hole?)
    var stays = function (k, w, dx, dy) { return fits(st.leaf.holes[holeOf[k]], w.x + dx, w.y + dy); };
    for (var it = 0; it < 3; it++) {
      for (var i = 0; i < ws.length; i++) for (var j = i + 1; j < ws.length; j++) {
        var a = ws[i], b = ws[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= R2) continue;
        var nx, ny;
        if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { var g = st.rng() * Math.PI * 2; nx = Math.cos(g); ny = Math.sin(g); }
        var push = R2 - d, ka = settled[i] === settled[j] ? (settled[i] ? quicker(a, b) : 0.5) :
          settled[i] ? (stays(i, a, -nx * push / 2, -ny * push / 2) ? 0.5 : 0) : (stays(j, b, nx * push / 2, ny * push / 2) ? 0.5 : 1);
        a.x -= nx * push * ka; a.y -= ny * push * ka; b.x += nx * push * (1 - ka); b.y += ny * push * (1 - ka);
        if (it === 0 && R2 - d > 0.002) hit = Math.max(hit, Math.hypot(a.vx - b.vx, a.vy - b.vy));
      }
      ws.forEach(function (w) { var R = TUNE.R; w.x = Math.max(R, Math.min(1 - R, w.x)); w.y = Math.max(R, Math.min(1 - R, w.y)); });
    }
    if (hit > 0.3) emit(st, "bump", { speed: hit });
  }

  // ---- the CPU worms ---------------------------------------------------------------------
  // They read a leaf once it has stood a moment (sooner the harder they are),
  // head for a hole that isn't too far or too full, and aim a little off its
  // middle; the easy ones sometimes head for a picture that is only printed.
  // A second look while it falls puts that right, for the ones that take one.
  function timeLeft(st) {
    var s = stage(st.page);
    return st.phase === "stand" ? s.stand - st.t + s.fall : st.phase === "fall" ? s.fall - st.t : 0;
  }
  function crowd(st, w, hi) {
    var h = st.leaf.holes[hi], n = 0;
    st.worms.forEach(function (o) { if (o !== w && o.alive && (o.cpu ? o.cpu.hole === hi : fits(h, o.x, o.y))) n++; });
    return n;
  }
  // (first: the first reading of a leaf, the only one that can misread it)
  function choose(st, w, exact, first) {
    var b = w.cpu, L = LEVELS[b.level], left = timeLeft(st), top = TUNE.speed * L.speed, best = -1, bestScore = Infinity;
    st.leaf.holes.forEach(function (h, i) {
      var d = Math.hypot(h.cx - w.x, h.cy - w.y), go = d / top + 0.12;
      var full = crowd(st, w, i) - capacity(h) + 1;
      var score = go + (full > 0 ? 0.7 * full : 0) + (go > left ? 5 : 0) + (i === b.hole ? -0.15 : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    });
    b.hole = best; b.decoy = false;
    if (first && st.leaf.prints.length && st.rng() < L.misread) {
      var pr = st.leaf.prints[Math.floor(st.rng() * st.leaf.prints.length)], m = panelMid(pr.panel);
      b.target = [m[0], m[1]]; b.decoy = true; b.hole = -1;
      return;
    }
    var h = st.leaf.holes[best], e = exact ? L.err * 0.25 : L.err, a = st.rng() * Math.PI * 2, r = e * Math.sqrt(st.rng()), at = spot(st, w, best, e);
    b.target = [at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r];
  }
  // Where in a hole to make for: of its middle and six spots round it (all
  // wholly inside), the one furthest from the worms in it or making for it,
  // the nearer to this one of those as far: not all for the dead middle.
  // (off: how far off it the worm's aim may be: the spots keep that far in,
  // so a worm misses a hole no more often than when all aimed at the middle)
  function spot(st, w, hi, off) {
    var h = st.leaf.holes[hi], q = Math.max(0, Math.min(h.room * 0.85, h.room - (off || 0))), best = [h.cx, h.cy], bestScore = -Infinity, others = [];
    st.worms.forEach(function (o) {
      if (o === w || !o.alive) return;
      if (fits(h, o.x, o.y)) others.push([o.x, o.y]);
      if (o.cpu && o.cpu.hole === hi && o.cpu.target) others.push(o.cpu.target);
    });
    for (var k = -1; k < 6; k++) {
      var x = k < 0 ? h.cx : h.cx + Math.cos(k * Math.PI / 3) * q, y = k < 0 ? h.cy : h.cy + Math.sin(k * Math.PI / 3) * q, clear = 1;
      others.forEach(function (o) { clear = Math.min(clear, Math.hypot(o[0] - x, o[1] - y)); });
      var score = Math.min(clear, TUNE.R * 2 + 0.01) * 10 - Math.hypot(x - w.x, y - w.y);
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return best;
  }
  function brain(st, w) {
    var b = w.cpu, L = LEVELS[b.level];
    if (st.phase === "stand" || st.phase === "fall") {
      var since = st.phase === "stand" ? st.t : stage(st.page).stand + st.t;
      if (!b.read && since >= b.readAt) { b.read = true; choose(st, w, false, true); b.next = since + 0.25; }
      if (b.read && !b.second && st.phase === "fall" && st.t >= L.second * stage(st.page).fall) { b.second = true; choose(st, w, true, false); }
      // a full hole: look again for one with room that can still be reached
      if (b.read && !b.decoy && since >= b.next) {
        b.next = since + 0.25;
        var h = st.leaf.holes[b.hole];
        if (h && crowd(st, w, b.hole) >= capacity(h) && !fits(h, w.x, w.y)) choose(st, w, b.second, false);
        // its spot taken by a worm settled there: another spot in the same hole
        else if (h && b.target && st.worms.some(function (o) { return o !== w && o.alive && fits(h, o.x, o.y) && Math.hypot(o.x - b.target[0], o.y - b.target[1]) < TUNE.R * 2; })) b.target = spot(st, w, b.hole);
      }
    }
    if (!b.read || !b.target) {
      // between leaves: drift about, the better ones keeping to the middle
      if (!b.wander || Math.hypot(b.wander[0] - w.x, b.wander[1] - w.y) < 0.03) {
        var spread = b.level === "easy" ? 0.36 : b.level === "normal" ? 0.2 : 0.12;
        b.wander = [0.5 + (st.rng() - 0.5) * 2 * spread, 0.5 + (st.rng() - 0.5) * 2 * spread];
      }
      return steer(w, b.wander, 0.35);
    }
    return steer(w, b.target, 1);
  }
  // head for a point and slow down on arriving
  function steer(w, to, gain) {
    var dx = to[0] - w.x, dy = to[1] - w.y, d = Math.hypot(dx, dy);
    if (d < 0.004) return [0, 0];
    var m = Math.min(1, d / 0.035) * gain;
    return [dx / d * m, dy / d * m];
  }

  // ---- one tick ----------------------------------------------------------------------------
  // input: { x, y } the way you're crawling (length up to 1), or null
  function step(st, dt, input) {
    st.events = [];
    var left = Math.max(0, Math.min(0.25, dt));
    while (left > 1e-9) { var h = Math.min(left, 1 / 120); tick(st, h, input); left -= h; }
    return st;
  }
  function tick(st, dt, input) {
    if (st.phase === "over") return;
    st.clock += dt; st.t += dt;
    var s = stage(st.page);
    if (st.phase === "intro" && st.t >= TUNE.intro) { st.t -= TUNE.intro; standUp(st); }
    else if (st.phase === "stand" && st.t >= s.stand) { st.phase = "fall"; st.t -= s.stand; emit(st, "tip", { page: st.page }); }
    else if (st.phase === "fall" && st.t >= s.fall) { st.t -= s.fall; slam(st); }
    else if (st.phase === "land" && st.t >= s.land) { st.t -= s.land; standUp(st); }
    if (st.phase === "over") return;
    st.worms.forEach(function (w) {
      if (!w.alive) return;
      var inp = w.cpu ? brain(st, w) : (input ? [input.x || 0, input.y || 0] : [0, 0]);
      moveWorm(w, inp[0], inp[1], dt, TUNE.speed * (w.cpu ? LEVELS[w.cpu.level].speed : 1));
    });
    separate(st);
  }
  function standUp(st) {
    st.phase = "stand";
    st.worms.forEach(function (w) {
      if (!w.cpu) return;
      var L = LEVELS[w.cpu.level];
      w.cpu.read = false; w.cpu.second = false; w.cpu.target = null; w.cpu.hole = -1; w.cpu.decoy = false;
      w.cpu.readAt = L.read[0] + st.rng() * (L.read[1] - L.read[0]);
    });
    emit(st, "stand", { page: st.page });
  }
  // the leaf lands: through, or squished
  function slam(st) {
    var before = alive(st), through = [], flat = [], leaf = st.leaf;
    before.forEach(function (w) {
      var hi = fitHole(leaf, w.x, w.y);
      if (hi >= 0) { through.push(w); w.hole = hi; emit(st, "through", { id: w.id, hole: hi }); }
      else { flat.push(w); w.alive = false; w.out = st.page; w.vx = w.vy = 0; emit(st, "squish", { id: w.id }); }
    });
    emit(st, "slam", { page: st.page, through: through.length, flat: flat.length });
    st.floor = leaf; st.landed++;
    var you = st.worms[0], page = st.page;
    if (st.mode === "endless") {
      if (!you.alive) return finish(st, "squished", page - 1);
      st.survived = page;
      if (page >= TUNE.cap) return finish(st, "closed", page);
    } else {
      if (you.alive) st.survived = page;
      if (!you.alive && through.length === 0) return finish(st, "draw", page - 1);
      if (!you.alive) { you.place = through.length + 1; return finish(st, "loss", page - 1); }
      if (through.length === 1) { you.place = 1; return finish(st, "win", page); }
    }
    st.page++; st.leaf = st.next; st.next = makeLeaf(st.page + 1, st.rng);
    st.phase = "land";
  }
  function finish(st, outcome, pages) {
    st.phase = "over"; st.t = 0;
    st.result = { outcome: outcome, pages: pages, page: st.page, place: st.worms[0].place || 0 };
    emit(st, "over", { outcome: outcome });
  }

  // ---- reach: the warning is always long enough --------------------------------------------------
  // How long a worm standing still takes to get its middle a distance d away,
  // crawling straight at full tilt (the same moves as in play).
  var travelMemo = {};
  function travelTime(d) {
    var key = Math.round(d * 1000);
    if (travelMemo[key] != null) return travelMemo[key];
    var w = { x: 0, y: 0, vx: 0, vy: 0, ang: 0, crawl: 0 }, t = 0, go = key / 1000, dt = 1 / 120;
    while (w.x < go && t < 10) { crawl(w, 1, 0, dt, TUNE.speed); t += dt; }
    travelMemo[key] = t;
    return t;
  }
  // the nearest place to (x, y) where a worm goes through this hole
  function nearestFit(h, x, y) {
    if (fits(h, x, y)) return 0;
    var e = fitRegion(h).edge, best = Infinity;
    for (var i = 0; i < e.length; i++) { var d = segDist(x, y, e[i], e[(i + 1) % e.length]); if (d < best) best = d; }
    return best;
  }
  // the time from standing still at (x, y) to being through the nearest hole of a leaf
  function reach(leaf, x, y) {
    var best = Infinity;
    leaf.holes.forEach(function (h) { var t = travelTime(nearestFit(h, x, y)); if (t < best) best = t; });
    return best;
  }

  return {
    TUNE: TUNE, LEVELS: LEVELS, NAMES: NAMES, SHAPES: SHAPES, SHAPE_EXT: SHAPE_EXT, SHAPE_ROOM: SHAPE_ROOM, PRINTS: PRINTS,
    stage: stage, sizeFor: sizeFor, midOf: midOf, makeHole: makeHole, rim: rim, fitRegion: fitRegion, makeLeaf: makeLeaf, panelMid: panelMid,
    fits: fits, fitHole: fitHole, edgeDepth: edgeDepth, capacity: capacity,
    create: create, step: step, tilt: tilt, alive: alive, timeLeft: timeLeft,
    travelTime: travelTime, nearestFit: nearestFit, reach: reach, moveWorm: moveWorm
  };
});
