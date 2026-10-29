// Page Turner (a bookworm under the falling pages of a picture book). The
// rules first, driven through the engine itself under node: a worm wholly
// inside a hole goes through and one past its edge is squished, for every
// shape; every hole on a page covers as much of it as the others, their
// printed trim clear of each other; no panel is a hole more than three pages
// in a row; several share a hole; worms bump, and one can shove another out of
// a hole, but a CPU worm never presses on a player's (it gives way, and
// makes its way back in round them); pages come faster with fewer, smaller holes; every page's holes
// can be reached from anywhere on it within the warning its shadow gives,
// with a reaction to spare (worked out for every way the holes can fall, and
// played out from the far corner on the last, quickest pages); Party's last
// worm wriggling wins, the last ones squished together draw, and squished
// before the others is a loss in its place; Endless counts pages and closes
// the book at 99; the CPU worms read the pages, the hard ones better, and
// spread over the holes, leaving you your hole's middle; 2 Players: each
// worm on its own keys, the last wriggling wins, squished together a draw.
// Then the page: the menu's keys, the arrows and WASD, a thumb anywhere on
// the screen steering, the Endless best kept the moment it's passed and the
// Party record the moment a game ends, P covering the book and picking up
// where it stopped, the end card's keys, Visual FX off still animating the
// fall (with no dust or shake), 2 Players (WASD against the arrows, a
// thumb on each half of a phone, the sitting's tally), and the book fitting
// laptops and phones.
module.exports = async ({ browser, base, check, lib }) => {
  const path = require("path");
  const { devices } = require("@playwright/test");
  const E = require(path.join(lib.ROOT, "games/page-turner/engine.js"));
  const R = E.TUNE.R;
  const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; a += pts[i][0] * q[1] - q[0] * pts[i][1]; } return Math.abs(a / 2); };
  const seeded = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // ---- the rules ----------------------------------------------------------------------
  // a game at the moment a leaf stands up, with the holes given; CPU worms
  // that should stand still are made to (no brain: they take no input)
  const setup = (mode, holes, page) => {
    const st = E.create({ mode, level: "normal", rng: seeded(7) });
    while (st.phase !== "stand") E.step(st, 1 / 60, null);
    st.page = page || 1; st.t = 0;
    st.leaf = { n: st.page, holes, prints: [], seed: 1 };
    return st;
  };
  const still = (st, i, x, y) => { const w = st.worms[i]; w.cpu = null; w.x = x; w.y = y; w.vx = w.vy = 0; };
  const gone = (st, i) => { st.worms[i].alive = false; };
  // on to the slam (or the end), collecting what happened
  const toSlam = (st, input) => {
    const seen = [];
    for (let i = 0; i < 2000; i++) {
      E.step(st, 1 / 60, input ? input(st) : null);
      st.events.forEach((e) => seen.push(e));
      if (seen.some((e) => e.type === "slam")) break;
    }
    return seen;
  };
  {
    // wholly inside, through; past the edge, squished: each shape, each way round
    const bad = [];
    for (const shape of Object.keys(E.SHAPES)) {
      const rin = E.sizeFor(shape, 0.08), h = E.fitRegion(E.makeHole(4, shape, rin));
      for (let k = 0; k < 8; k++) {
        const e = h.edge[Math.floor(k / 8 * h.edge.length)], dx = e[0] - h.cx, dy = e[1] - h.cy, d = Math.hypot(dx, dy);
        for (const [f, want] of [[0, "through"], [(d - 0.003) / d, "through"], [(d + 0.004) / d, "squish"]]) {
          const st = setup("endless", [E.makeHole(4, shape, rin)]);
          still(st, 0, h.cx + dx * f, h.cy + dy * f);
          const got = toSlam(st).filter((ev) => ev.type === "through" || ev.type === "squish").map((ev) => ev.type).join();
          if (got !== want) bad.push({ shape, k, f: +f.toFixed(3), want, got });
        }
      }
    }
    check("page-turner rules: a worm wholly inside a hole goes through when the leaf lands, one just past the edge is squished (every shape, every side)", bad.length === 0, bad.slice(0, 4));
  }
  {
    // the moon is a hole too: wholly inside its thick middle, through; over
    // its edge into the bite, or off its back, squished
    const got = [];
    if (E.SHAPES.moon && E.sizeFor) {
      const rin = E.sizeFor("moon", E.stage(1).rin), h = E.makeHole(4, "moon", rin), o = E.midOf("moon"), ol = Math.hypot(o[0], o[1]);
      const ux = o[0] / ol, uy = o[1] / ol;          // (from its middle toward the bite)
      for (const [f, want] of [[0, "through"], [h.room - 0.003, "through"], [h.room + 0.004, "squish"], [-(h.room - 0.003), "through"], [-(h.room + 0.004), "squish"]]) {
        const st = setup("endless", [E.makeHole(4, "moon", rin)]);
        still(st, 0, h.cx + ux * f, h.cy + uy * f);
        got.push(toSlam(st).filter((ev) => ev.type === "through" || ev.type === "squish").map((ev) => ev.type).join() === want);
      }
    }
    check("page-turner rules: a moon (crescent) hole: a worm wholly inside it goes through, one over its edge, into the bite or off its back, is squished", got.length === 5 && got.every(Boolean), got);
  }
  {
    // every shape on every page, the star and the moon from page 1, sized
    // to fit their panel; no two holes on a page alike
    const bad = [], seen = { star: new Set(), moon: new Set() };
    for (let seed = 1; seed <= 20; seed++) for (let p = 1; p <= 7; p++) {
      const shapes = E.makeLeaf(p, seeded(seed * 1000 + p)).holes.map((h) => h.shape);
      if (new Set(shapes).size !== shapes.length) bad.push({ seed, p, shapes });
      shapes.forEach((k) => { if (seen[k]) seen[k].add(p); });
    }
    check("page-turner rules: the holes take every shape, stars and moons from page 1 (seen on each of pages 1 to 7 across seeds), no two alike on a page",
      !!E.SHAPES.moon && bad.length === 0 && [1, 2, 3, 4, 5, 6, 7].every((p) => seen.star.has(p) && seen.moon.has(p)), { bad: bad.slice(0, 3), star: [...seen.star], moon: [...seen.moon] });
    // and every hole inside its panel, covering no less page than the last pages', its printed rim outside it
    const out = [], least = area(E.makeHole(4, "sun", E.sizeFor("sun", E.stage(99).rin)).poly);
    for (let seed = 1; seed <= 8; seed++) for (let p = 1; p <= 40; p++) for (const h of E.makeLeaf(p, seeded(seed * 77 + p)).holes) {
      const m = E.panelMid(h.panel), half = E.TUNE.panelHalf;
      if (h.poly.some((q) => Math.abs(q[0] - m[0]) > half || Math.abs(q[1] - m[1]) > half)) out.push({ seed, p, shape: h.shape, why: "past its panel" });
      if (area(h.poly) < least * 0.999) out.push({ seed, p, shape: h.shape, why: "less page than the last pages'", rin: h.rin });
      if (E.rim && E.rim(h, 0.013).some((q) => E.edgeDepth(h, q[0], q[1]) > -0.004)) out.push({ seed, p, shape: h.shape, why: "rim on the hole" });
    }
    check("page-turner rules: every hole lies inside its panel and covers no less page than the last pages' holes, and its printed rim runs outside its cut (the moon's horns too)", !!E.rim && out.length === 0, out.slice(0, 4));
  }
  {
    // every hole on a page covers as much of it as the others, whatever its
    // shape: as much as a round one of the page's size (the moon, which
    // spreads furthest for its fit, no longer looking twice as big)
    const bad = [];
    for (let seed = 1; seed <= 10; seed++) for (let p = 1; p <= 40; p++) {
      const l = E.makeLeaf(p, seeded(seed * 131 + p)), round = area(E.makeHole(4, "sun", E.sizeFor("sun", E.stage(p).rin)).poly);
      l.holes.forEach((h) => { const r = area(h.poly) / round; if (Math.abs(r - 1) > 0.02) bad.push({ seed, p, shape: h.shape, r: +r.toFixed(2) }); });
    }
    check("page-turner rules: every hole on a page covers as much of it as a round one of the page's size, whatever its shape (within 2%; pages 1 to 40)", bad.length === 0, bad.slice(0, 5));
  }
  {
    // no two holes' printed trim meets: each hole's rim (and a sun's rays),
    // the lines' own width included, keeps 0.004 or more from the next one's
    const RIM = E.TUNE.rim || 0.013, INK = 0.0075 / 2, RAY = 0.0075 * 1.3 / 2, GAP = 0.004;
    const rays = (h) => E.sunRays ? E.sunRays(h) : [h.rin + 0.024, Math.min(E.TUNE.panelHalf - 0.004, h.rin + 0.04)];
    const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let s = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; s = Math.max(0, Math.min(1, s)); return Math.hypot(p[0] - a[0] - s * dx, p[1] - a[1] - s * dy); };
    // (a hole's printed trim as line segments, each with how far its line spreads)
    const trim = (h) => {
      const out = [], rim = E.rim(h, RIM);
      rim.forEach((p, i) => out.push([p, rim[(i + 1) % rim.length], INK]));
      if (h.shape === "sun") { const [r0, r1] = rays(h); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; out.push([[h.cx + Math.cos(a) * r0, h.cy + Math.sin(a) * r0], [h.cx + Math.cos(a) * r1, h.cy + Math.sin(a) * r1], RAY]); } }
      return out;
    };
    const apart = (A, B) => { let m = Infinity; for (const [a0, a1, wa] of A) for (const [b0, b1, wb] of B) m = Math.min(m, Math.min(segDist(a0, b0, b1), segDist(a1, b0, b1), segDist(b0, a0, a1), segDist(b1, a0, a1)) - wa - wb); return m; };
    const bad = [];
    for (let seed = 1; seed <= 12; seed++) for (let p = 1; p <= 30; p++) {
      const hs = E.makeLeaf(p, seeded(seed * 59 + p)).holes, tr = hs.map(trim);
      for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) { const d = apart(tr[i], tr[j]); if (d < GAP) bad.push({ seed, p, a: hs[i].shape + "@" + hs[i].panel, b: hs[j].shape + "@" + hs[j].panel, gap: +d.toFixed(4) }); }
    }
    check("page-turner rules: no two holes on a page overlap, nor their printed trim (rims, a sun's rays, the lines' width included: 0.004 apart or more; pages 1 to 30)", bad.length === 0, { n: bad.length, first: bad.slice(0, 4) });
  }
  {
    // no panel is a hole on more than three pages in a row, so a look down
    // holes that line up always ends on a page's paper (the game's own pages)
    const bad = [], longest = [];
    for (let seed = 1; seed <= 12; seed++) {
      const st = E.create({ mode: "endless", rng: seeded(seed * 17 + 3) }), leaves = [];
      for (let i = 0; i < 200000 && st.page < 45 && st.phase !== "over"; i++) {
        if (leaves[leaves.length - 1] !== st.leaf) leaves.push(st.leaf);
        const h = st.leaf.holes[0]; st.worms[0].x = h.cx; st.worms[0].y = h.cy; st.worms[0].vx = st.worms[0].vy = 0;
        E.step(st, 1 / 30, { x: 0, y: 0 });
      }
      let most = 0;
      for (let pn = 0; pn < 9; pn++) { let run = 0; leaves.forEach((l) => { run = l.holes.some((h) => h.panel === pn) ? run + 1 : 0; most = Math.max(most, run); if (run > 3) bad.push({ seed, page: l.n, panel: pn, run }); }); }
      longest.push(most);
    }
    check("page-turner rules: no panel is a hole on more than three pages in a row (12 games to page 45)", bad.length === 0, { longest, first: bad.slice(0, 3) });
  }
  {
    // the star covers about as much page as a window or a flower of the same
    // size (the size that lets a worm through), not half as much again
    const r = {}; for (const k of ["sun", "window", "flower", "star"]) r[k] = +(area(E.SHAPES[k]) / area(E.SHAPES.sun)).toFixed(2);
    check("page-turner rules: a star hole covers about as much page as a window or a flower of its size (within a tenth), not far more",
      Math.abs(r.star - r.window) <= 0.1 * r.window && Math.abs(r.star - r.flower) <= 0.1 * r.flower, r);
  }
  {
    // the leaves to come are made ahead, the same ones whatever happens on
    // the page: the three behind the next stand ready (as far down as holes
    // in a row can show), and move up a place as each leaf lands
    const st = E.create({ mode: "endless", rng: seeded(5) });
    const ahead = () => [st.leaf, st.next].concat(st.later || []).map((l) => l && l.n);
    const first = ahead(), seen = [st.next, (st.later || [])[0], (st.later || [])[1]];
    // (your worm sat in a round hole cut in the first leaf, so it goes through)
    st.leaf.holes = [E.makeHole(4, "sun", 0.135)];
    const m = E.panelMid(4); st.worms[0].x = m[0]; st.worms[0].y = m[1];
    for (let i = 0; i < 2000 && st.page < 2; i++) E.step(st, 1 / 60, { x: 0, y: 0 });
    const was = { leaf: st.leaf === seen[0], next: st.next === seen[1], later: (st.later || [])[0] === seen[2] };
    check("page-turner rules: the leaves to come stand ready three behind the next (pages 1 to 5 at the start), and each moves up a place as a leaf lands",
      first.join() === "1,2,3,4,5" && was.leaf && was.next && was.later && ahead().join() === "2,3,4,5,6", { first, now: ahead(), was });
  }
  {
    // four worms in one big hole all go through; the game goes on to page 2
    const st = setup("party", [E.makeHole(4, "sun", 0.135)]);
    const c = E.panelMid(4);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => still(st, i, c[0] + a * 0.045, c[1] + b * 0.045));
    const seen = toSlam(st);
    check("page-turner rules: several worms share a hole, and all of them go through",
      seen.filter((e) => e.type === "through").length === 4 && st.page === 2 && !st.result && E.alive(st).length === 4, { page: st.page, result: st.result, ev: seen.map((e) => e.type) });
  }
  {
    // worms are solid (they never overlap), and one crawling into a worm
    // settled in a hole shoves it, out of the hole too: a CPU there gives way
    // and, with no room left beside you, is squished while you go through
    const h = E.makeHole(4, "sun", 0.07), c = E.panelMid(4);
    const st = setup("party", [h]);
    gone(st, 2); gone(st, 3);
    still(st, 0, c[0] - 0.2, c[1]);
    // (the rival has read the leaf and sits in the hole's middle)
    const rival = st.worms[1]; rival.x = c[0]; rival.y = c[1]; rival.vx = rival.vy = 0;
    Object.assign(rival.cpu, { read: true, second: true, readAt: 0, next: 0, hole: 0, target: [c[0], c[1]], decoy: false });
    let closest = 1, bumps = 0, out = false;
    const seen = toSlam(st, (s) => {
      const w = s.worms[0];
      if (rival.alive) { closest = Math.min(closest, Math.hypot(w.x - rival.x, w.y - rival.y)); if (!E.fits(h, rival.x, rival.y)) out = true; }
      bumps += s.events.filter((e) => e.type === "bump").length;
      const d = Math.hypot(c[0] - w.x, c[1] - w.y);
      return d < 0.004 ? { x: 0, y: 0 } : { x: (c[0] - w.x) / Math.max(d, 0.035), y: (c[1] - w.y) / Math.max(d, 0.035) };
    });
    check("page-turner rules: worms are solid: one crawling into a worm settled in a hole bumps it and shoves it out; a CPU there gives way, and with no room left beside you it's squished while you go through",
      closest >= 2 * R - 0.002 && bumps > 0 && out && seen.some((e) => e.type === "through" && e.id === 0) && seen.some((e) => e.type === "squish" && e.id === 1),
      { closest, bumps, out, ev: seen.filter((e) => e.type !== "bump").map((e) => e.type + (e.id != null ? e.id : "")) });
  }
  {
    // a CPU knocked out of its hole (its spot now where you are) looks round
    // at once and heads back in, round you, to a spot clear of you, and goes
    // through; on the way it never presses on you, sitting in the middle
    const h = E.makeHole(4, "sun", 0.12), c = E.panelMid(4);
    const st = setup("party", [h]);
    gone(st, 2); gone(st, 3);
    still(st, 0, c[0], c[1]);
    const rival = st.worms[1]; rival.x = c[0] + h.room + 0.03; rival.y = c[1] + 0.012; rival.vx = rival.vy = 0;
    Object.assign(rival.cpu, { read: true, second: true, readAt: 0, next: 1e9, hole: 0, target: [c[0] + 0.03, c[1]], decoy: false, wasIn: true });
    let press = 0, moved = 0, backIn = null, t = 0;
    const seen = toSlam(st, (s) => {
      t += 1 / 60;
      const w = s.worms[0], dx = w.x - rival.x, dy = w.y - rival.y, d = Math.hypot(dx, dy);
      if (d < 2 * R + 0.002 && (rival.vx * dx + rival.vy * dy) / d > 0.1) press += 1 / 60;
      moved = Math.max(moved, Math.hypot(w.x - c[0], w.y - c[1]));
      if (backIn == null && E.fits(h, rival.x, rival.y)) backIn = +t.toFixed(2);
      return null;
    });
    check("page-turner rules: a CPU knocked out of its hole heads straight back in, round you, to a spot clear of you, and goes through; it never presses on you (you, in the middle, aren't moved)",
      press === 0 && moved < 0.002 && backIn != null && backIn < 1 && seen.some((e) => e.type === "through" && e.id === 1),
      { press: +press.toFixed(3), moved: +moved.toFixed(4), backIn, ev: seen.filter((e) => e.type !== "bump").map((e) => e.type + (e.id != null ? e.id : "")) });
  }
  {
    // the CPU worms don't all make for a hole's dead middle: three making for
    // one big hole aim at spots apart, room for each
    const st = E.create({ mode: "party", level: "hard", rng: seeded(3) });
    while (st.phase !== "stand") E.step(st, 1 / 60, null);
    st.t = 0; st.leaf = { n: 1, holes: [E.makeHole(4, "sun", 0.135)], prints: [], seed: 1 };
    still(st, 0, 0.06, 0.94);
    for (let i = 0; i < 60; i++) E.step(st, 1 / 60, null);
    const tg = st.worms.slice(1).map((w) => w.cpu.target), gaps = [];
    for (let i = 0; i < tg.length; i++) for (let j = i + 1; j < tg.length; j++) gaps.push(tg[i] && tg[j] ? Math.hypot(tg[i][0] - tg[j][0], tg[i][1] - tg[j][1]) : 0);
    check("page-turner rules: CPU worms making for one big hole aim at spots apart in it (a worm's width or more), not all for its middle", gaps.length === 3 && Math.min(...gaps) >= 2 * R - 0.012, gaps.map((g) => +g.toFixed(3)));
  }
  {
    // the CPU worms keep out of your way: played out against a you that
    // crawls for the nearest hole's middle and stops there, they spread over
    // the holes there are (sharing yours on under half the pages) and leave
    // you its middle (nearer it than you in no more than 1 in 10 of those)
    const res = {};
    for (const level of ["easy", "normal", "hard"]) {
      let pages = 0, share = 0, nearer = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const st = E.create({ mode: "party", level, rng: seeded(seed * 31 + 7) });
        let reactAt = null, aim = null;
        for (let t = 0; t < 90 && st.phase !== "over"; t += 1 / 60) {
          const w = st.worms[0], live = st.phase === "stand" || st.phase === "fall";
          if (st.phase === "stand" && reactAt == null) { reactAt = t + 0.4; aim = null; }
          if (!live) reactAt = null;
          let input = null;
          if (live && reactAt != null && t >= reactAt) {
            if (!aim) { let bd = 9; st.leaf.holes.forEach((h) => { const d = Math.hypot(h.cx - w.x, h.cy - w.y); if (d < bd) { bd = d; aim = h; } }); }
            const d = Math.hypot(aim.cx - w.x, aim.cy - w.y);
            input = d < 0.01 ? { x: 0, y: 0 } : { x: (aim.cx - w.x) / Math.max(d, 0.035), y: (aim.cy - w.y) / Math.max(d, 0.035) };
          }
          // (who is in your hole as the leaf lands)
          if (st.phase === "fall" && st.t + 1 / 60 >= E.stage(st.page).fall - 1e-9 && w.alive) {
            const hi = E.fitHole(st.leaf, w.x, w.y), h = st.leaf.holes[hi];
            if (hi >= 0) st.worms.slice(1).forEach((o) => { if (o.alive && E.fitHole(st.leaf, o.x, o.y) === hi) { share++; if (Math.hypot(o.x - h.cx, o.y - h.cy) < Math.hypot(w.x - h.cx, w.y - h.cy)) nearer++; } });
          }
          E.step(st, 1 / 60, input);
          if (st.events.some((e) => e.type === "slam")) pages++;
        }
      }
      res[level] = { pages, share, nearer };
    }
    check("page-turner rules: CPU worms (every level) spread over the holes and leave you your hole's middle: in your hole as it lands on under half the pages, nearer its middle than you in 1 in 10 of those at most",
      Object.values(res).every((r) => r.pages > 30 && r.share / r.pages < 0.5 && r.nearer <= Math.max(1, r.share * 0.1)), res);
  }
  {
    // played out against three CPUs (every level), a you that crawls for the
    // nearest hole's middle and stops there: no CPU presses on you (touching
    // you while moving your way: under 0.02 s a page), seldom so much as
    // touches you, never shoves you out of a hole you're settled in; worms
    // seldom turn about in a shoving match; and the CPUs knocked out of a
    // hole with time to spare mostly get back into one
    const res = {};
    for (const level of ["easy", "normal", "hard"]) {
      let pages = 0, shoved = 0, press = 0, touch = 0, turns = 0, knocked = 0, back = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const st = E.create({ mode: "party", level, rng: seeded(seed * 31 + 7) });
        const last = st.worms.map(() => ({ dir: null, at: -9 })), wasIn = st.worms.map(() => false), knockedOn = st.worms.map(() => 0);
        let reactAt = null, aim = null, inFor = 0;
        for (let t = 0; t < 90 && st.phase !== "over"; t += 1 / 60) {
          const w = st.worms[0], live = st.phase === "stand" || st.phase === "fall";
          if (st.phase === "stand" && reactAt == null) { reactAt = t + 0.4; aim = null; }
          if (!live) reactAt = null;
          let input = null;
          if (live && reactAt != null && t >= reactAt) {
            if (!aim) { let bd = 9; st.leaf.holes.forEach((h) => { const d = Math.hypot(h.cx - w.x, h.cy - w.y); if (d < bd) { bd = d; aim = h; } }); }
            const d = Math.hypot(aim.cx - w.x, aim.cy - w.y);
            input = d < 0.01 ? { x: 0, y: 0 } : { x: (aim.cx - w.x) / Math.max(d, 0.035), y: (aim.cy - w.y) / Math.max(d, 0.035) };
          }
          const before = st.worms.map((o) => [o.x, o.y]), stopped = !input || (!input.x && !input.y);
          E.step(st, 1 / 60, input);
          st.events.forEach((e) => { if (e.type === "slam") pages++; });
          const now = st.phase === "stand" || st.phase === "fall";
          const fit = now && w.alive ? E.fitHole(st.leaf, w.x, w.y) >= 0 : false;
          if (fit && stopped) inFor += 1 / 60; else if (!fit) { if (inFor > 0.2 && now) shoved++; inFor = 0; }
          st.worms.forEach((o, i) => {
            if (i && o.alive && w.alive) {
              const dx = w.x - o.x, dy = w.y - o.y, d = Math.hypot(dx, dy);
              if (d < 2 * R + 0.002) { touch += 1 / 60; if ((o.vx * dx + o.vy * dy) / (d || 1) > 0.1) press += 1 / 60; }
            }
            if (i && o.alive && now) {
              const inn = E.fitHole(st.leaf, o.x, o.y) >= 0;
              if (wasIn[i] && !inn && E.timeLeft(st) > 0.6) { knocked++; knockedOn[i] = st.page; }
              if (inn && knockedOn[i] === st.page) { back++; knockedOn[i] = 0; }
              wasIn[i] = inn;
            } else wasIn[i] = false;
            const mx = o.x - before[i][0], my = o.y - before[i][1], md = Math.hypot(mx, my);
            if (!o.alive || md < 0.002) return;
            const dir = [mx / md, my / md], L = last[i], touching = st.worms.some((q) => q !== o && q.alive && Math.hypot(q.x - o.x, q.y - o.y) < 2 * R + 0.004);
            if (L.dir && dir[0] * L.dir[0] + dir[1] * L.dir[1] < -0.5) { if (t - L.at < 0.3 && touching) turns++; L.at = t; }
            L.dir = dir;
          });
        }
      }
      res[level] = { pages, shoved, press: +(press / pages).toFixed(3), touch: +(touch / pages).toFixed(3), turns: +(turns / pages).toFixed(3), knocked, back };
    }
    check("page-turner rules: against CPU worms (every level), no CPU presses on you (under 0.02 s a page touching you while moving your way; touching at all under 0.15 s), none shoves you out of a hole you're settled in, worms seldom turn about in a shoving match (under one in five pages), and CPUs knocked out of a hole with time to spare get back into one (3 in 4 or more)",
      Object.values(res).every((r) => r.pages > 30 && r.press < 0.02 && r.touch < 0.15 && r.shoved === 0 && r.turns < 0.2 && r.back >= r.knocked * 0.75), res);
  }
  {
    // the pace: faster, fewer, smaller, then a floor
    const s = [];
    for (let p = 1; p <= 120; p++) s.push(E.stage(p));
    const never = (f) => s.every((x, i) => i === 0 || f(s[i - 1], x));
    const leaves = [1, 5, 10, 15, 20, 30, 99].map((p) => { const l = E.makeLeaf(p, seeded(p)); return { p, holes: l.holes.length, sized: l.holes.every((h) => Math.abs(h.rin - E.sizeFor(h.shape, E.stage(p).rin)) < 1e-9), want: E.stage(p).holes }; });
    check("page-turner rules: pages come faster as the book goes on, with fewer holes and smaller ones (5 holes on page 1, 1 from page 19; a 3 s warning down to 1.65 s), and each leaf has its page's holes",
      never((a, b) => b.warn <= a.warn + 1e-9) && never((a, b) => b.holes <= a.holes) && never((a, b) => b.rin <= a.rin + 1e-9) &&
      s[0].holes === 5 && s[18].holes === 1 && s[0].rin > s[29].rin * 1.75 && Math.abs(s[0].warn - 3) < 0.01 && Math.abs(s[29].warn - 1.65) < 0.01 && s[119].warn === s[29].warn &&
      leaves.every((l) => l.holes === l.want && l.sized), { first: s[0], floor: s[29], leaves });
  }
  {
    // the pace: the leaf stands a shorter while soon, just under a second by
    // page 9 (from 1.9 s on page 1), on down to 0.8 s by page 30; the holes
    // shrink gently all the way to page 30, never below 0.074
    const st = (p) => E.stage(p);
    check("page-turner rules: the leaf stands just under a second by page 9 (1.9 s on page 1, 0.8 s from page 30), and the holes shrink gently to page 30 (0.074 at the smallest; page 20's still 0.09 or more)",
      Math.abs(st(1).stand - 1.9) < 1e-9 && st(9).stand <= 0.95 && st(9).stand >= 0.85 && st(5).stand < 1.5 && Math.abs(st(30).stand - 0.8) < 1e-9 && st(99).stand === st(30).stand &&
      Math.abs(st(30).rin - 0.074) < 1e-9 && st(99).rin === st(30).rin && st(20).rin >= 0.09 && st(25).rin > st(30).rin,
      [1, 5, 9, 10, 20, 25, 30].map((p) => p + ": stand " + st(p).stand.toFixed(2) + ", holes " + st(p).rin.toFixed(3)));
  }
  {
    // reach: from anywhere on the page (corners too), through some hole of
    // every way the holes can fall, inside the warning with 0.4 s to react
    const N = 13, starts = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) starts.push([R + (1 - 2 * R) * i / (N - 1), R + (1 - 2 * R) * j / (N - 1)]);
    const margins = {};
    for (const p of [1, 3, 4, 7, 8, 12, 13, 18, 19, 24, 25, 29, 30, 99]) {
      const s = E.stage(p), shapes = Object.keys(E.SHAPES), holes = [];
      for (let pn = 0; pn < 9; pn++) holes.push(shapes.map((k) => E.makeHole(pn, k, E.sizeFor(k, s.rin))));
      let worst = 0;
      // (the worst k holes for a start are the k farthest panels, each at its worst shape)
      for (const st of starts) { const per = holes.map((hs) => Math.max(...hs.map((h) => E.travelTime(E.nearestFit(h, st[0], st[1]))))).sort((a, b) => b - a); worst = Math.max(worst, per[s.holes - 1]); }
      margins[p] = +(s.warn - E.TUNE.react - worst).toFixed(3);
    }
    check("page-turner rules: every page's holes can be reached from anywhere on the page within its warning, with 0.4 s to react to spare (the worst margins, by page)",
      Object.values(margins).every((m) => m >= 0.05), margins);
    // and played out: the quickest pages, one hole in a corner panel, the worm in the far corner
    const bad = [];
    for (const p of [19, 25, 30, 99]) for (const shape of Object.keys(E.SHAPES)) for (const [panel, sx, sy] of [[0, 1 - R, 1 - R], [2, R, 1 - R], [6, 1 - R, R], [8, R, R]]) {
      const h = E.makeHole(panel, shape, E.sizeFor(shape, E.stage(p).rin)), st = setup("endless", [h], p);
      still(st, 0, sx, sy);
      let t = 0;
      // (letting go in time to stop on its middle: the moon's thick part is narrow)
      const seen = toSlam(st, (s) => { t += 1 / 60; const w = s.worms[0], d = Math.hypot(h.cx - w.x, h.cy - w.y), v = Math.hypot(w.vx, w.vy); if (t < E.TUNE.react || d <= v * v / (2 * E.TUNE.decel) + 0.002) return { x: 0, y: 0 }; return { x: (h.cx - w.x) / d, y: (h.cy - w.y) / d }; });
      if (!seen.some((e) => e.type === "through")) bad.push({ p, shape, panel });
    }
    check("page-turner rules: on the quickest pages, a worm in the far corner that waits 0.4 s and then crawls straight for the hole's middle, letting go to stop there, gets through it (every shape, every corner)", bad.length === 0, bad.slice(0, 5));
  }
  {
    // Party: last worm wriggling, a draw, a loss in its place
    const c = E.panelMid(4), out = [0.85, 0.85], far = [0.15, 0.85];
    const party = (you, rivals) => {
      const st = setup("party", [E.makeHole(4, "sun", 0.1)], 6);
      still(st, 0, you[0], you[1]);
      [1, 2, 3].forEach((i) => { if (rivals[i - 1]) still(st, i, rivals[i - 1][0], rivals[i - 1][1]); else gone(st, i); });
      toSlam(st);
      return st.result;
    };
    const win = party(c, [out]), draw = party(out, [far]), loss = party(out, [c]), third = party(out, [[c[0] - 0.045, c[1]], [c[0] + 0.045, c[1]]]);
    const st = setup("party", [E.makeHole(4, "sun", 0.1)], 6);
    still(st, 0, c[0] - 0.045, c[1]); still(st, 1, c[0] + 0.045, c[1]); gone(st, 2); gone(st, 3);
    toSlam(st);
    check("page-turner rules (Party): the last worm wriggling wins; squished by the same leaf as the last of the others is a draw; squished while others go through is a loss, in its place; both through, it goes on",
      win && win.outcome === "win" && win.pages === 6 && draw && draw.outcome === "draw" && loss && loss.outcome === "loss" && loss.place === 2 && third && third.outcome === "loss" && third.place === 3 &&
      !st.result && st.page === 7 && st.survived === 6, { win, draw, loss, third, goesOn: { result: st.result, page: st.page } });
  }
  {
    // Endless: pages counted, the book closed at 99
    const c = E.panelMid(4);
    const a = setup("endless", [E.makeHole(4, "sun", 0.1)], 1); still(a, 0, c[0], c[1]); toSlam(a);
    const b = setup("endless", [E.makeHole(4, "sun", 0.1)], 99); still(b, 0, c[0], c[1]); toSlam(b);
    const z = setup("endless", [E.makeHole(4, "sun", 0.1)], 12); still(z, 0, 0.9, 0.9); toSlam(z);
    check("page-turner rules (Endless): each page got through counts, page 99 closes the book, and a squish ends the run with the pages before it",
      a.survived === 1 && !a.result && a.page === 2 && b.result && b.result.outcome === "closed" && b.result.pages === 99 && z.result && z.result.outcome === "squished" && z.result.pages === 11,
      { a: [a.survived, a.page], b: b.result, z: z.result });
  }
  {
    // 2 Players: each worm steered by its own input (Player 1's first), no
    // CPU; one squished while the other goes through is the other's win;
    // both squished by one leaf, a draw; both through, on to the next page;
    // both through page 99, the book closes on a draw
    const c = E.panelMid(4), out = [0.85, 0.85];
    const duo = (a, b, page) => { const st = setup("duo", [E.makeHole(4, "sun", 0.1)], page || 6); still(st, 0, a[0], a[1]); still(st, 1, b[0], b[1]); toSlam(st); return st; };
    const one = duo(c, out), two = duo(out, c), both = duo(out, [0.15, 0.85]), on = duo([c[0] - 0.045, c[1]], [c[0] + 0.045, c[1]]), end = duo([c[0] - 0.045, c[1]], [c[0] + 0.045, c[1]], 99);
    const st = E.create({ mode: "duo", rng: seeded(3) }), a = [st.worms[0].x, st.worms[0].y], b = [st.worms[1].x, st.worms[1].y];
    for (let i = 0; i < 30; i++) E.step(st, 1 / 60, [{ x: 1, y: 0 }, { x: 0, y: -1 }]);
    const steer = { p1: [+(st.worms[0].x - a[0]).toFixed(3), +(st.worms[0].y - a[1]).toFixed(3)], p2: [+(st.worms[1].x - b[0]).toFixed(3), +(st.worms[1].y - b[1]).toFixed(3)] };
    check("page-turner rules (2 Players): two worms, Player 1 and Player 2, each on its own input; squished while the other goes through is the other's win, squished together a draw, both through goes on, and both through page 99 closes the book",
      st.worms.length === 2 && st.worms.map((w) => w.name).join() === "Player 1,Player 2" && st.worms.every((w) => !w.cpu) &&
      steer.p1[0] > 0.1 && Math.abs(steer.p1[1]) < 0.005 && steer.p2[1] < -0.1 && Math.abs(steer.p2[0]) < 0.005 &&
      one.result && one.result.outcome === "win" && one.result.winner === 0 && two.result && two.result.outcome === "win" && two.result.winner === 1 &&
      both.result && both.result.outcome === "draw" && !on.result && on.page === 7 && end.result && end.result.outcome === "closed",
      { steer, one: one.result, two: two.result, both: both.result, on: [on.page, on.result], end: end.result });
  }
  {
    // the CPU worms: all four played by them, hard against easy, over the same pages
    const run = (level, seed) => {
      const st = E.create({ mode: "party", level, rng: seeded(seed) });
      st.worms[0].cpu = { level, readAt: 0, read: false, second: false, target: null, hole: -1, decoy: false, wander: null, next: 0 };
      let page1 = 0, bumps = 0;
      for (let i = 0; i < 60 * 240 && !st.result; i++) {
        E.step(st, 1 / 60, null);
        st.events.forEach((e) => { if (e.type === "slam" && e.page === 1) page1 = e.through; if (e.type === "bump") bumps++; });
        if (E.alive(st).length && !st.worms[0].alive) break;
      }
      const outs = st.worms.map((w) => (w.alive ? st.page : w.out));
      return { page1, bumps, mean: outs.reduce((s, x) => s + x, 0) / 4 };
    };
    const seeds = [1, 2, 3, 4, 5, 6];
    const easy = seeds.map((s) => run("easy", s)), hard = seeds.map((s) => run("hard", s));
    const avg = (xs) => xs.reduce((s, x) => s + x.mean, 0) / xs.length;
    check("page-turner rules: the CPU worms read the pages and head for the holes (nearly all through page 1), they bump one another, and hard ones last longer than easy ones",
      hard.every((r) => r.page1 >= 3) && easy.reduce((s, r) => s + r.page1, 0) >= 16 && [...easy, ...hard].some((r) => r.bumps > 0) && avg(hard) > avg(easy) + 1,
      { easy: avg(easy).toFixed(1), hard: avg(hard).toFixed(1), page1: [easy.map((r) => r.page1).join(""), hard.map((r) => r.page1).join("")] });
  }

  // ---- the page ------------------------------------------------------------------------
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/page-turner/", opts);
  const done = async (p, what) => { check("page-turner " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const fxSet = (off) => (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:page-turner", off ? "1" : "0"); } catch (e) {} }, off);
  // the page's own game, held still at the moment a leaf stands up
  const standing = (p, mode, level) => p.evaluate(([mode, level]) => { const PT = PageTurner; PT.start(mode, level); PT.freeze(true); while (PT.st().phase !== "stand") PT.advance(1 / 60); return PT.st().page; }, [mode, level || "normal"]);

  // ---- a worm squished lies flat on the page that squished it, from the
  // slam until the next page lands over it, and on no later one
  {
    const p = await open();
    const r = await p.evaluate(() => {
      const PT = PageTurner, E = window.PageTurnerEngine;
      PT.start("party", "normal"); PT.freeze(true);
      const st = PT.st();
      // (you kept in a hole, Rosy kept on a panel with no hole, until page 1 lands; then you in page 2's)
      const keep = () => { const h = st.leaf.holes[0]; PT.place(0, h.cx, h.cy); };
      const m = E.panelMid(st.leaf.prints[0].panel);
      while (st.landed === 0) { keep(); PT.place(1, m[0], m[1]); PT.advance(1 / 120); }
      const after = { alive: st.worms[1].alive, floor: st.floor.n, page: st.page, shown: PT.flatsShown() };
      while (st.landed === 1 && st.phase !== "over") { keep(); PT.advance(1 / 120); }
      return { after, next: { floor: st.floor.n, shown: PT.flatsShown(), phase: st.phase } };
    });
    check("page-turner: a worm squished by page 1 lies flat on page 1 from the slam (not on the next page), and is gone once page 2 lands over it",
      !r.after.alive && r.after.floor === 1 && r.after.shown.includes(1) && r.next.floor === 2 && !r.next.shown.includes(1), r);
    await done(p, "(squished worm)");
  }

  // ---- the menu's keys, then the arrows and WASD
  let p = await open();
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-mode button b, #pick-level button, #play")].map((b) => b.getAttribute("data-gs-key")).join(" "));
  await p.keyboard.press("2"); await p.waitForTimeout(80);
  const endless = await p.evaluate(() => ({ mode: PageTurner.mode(), levels: document.getElementById("pick-level").hidden, kept: localStorage.getItem("pageturner_mode") }));
  await p.keyboard.press("1"); await p.keyboard.press("6"); await p.waitForTimeout(80);
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const began = await p.evaluate(() => ({ state: PageTurner.state(), mode: PageTurner.mode(), level: PageTurner.level(), page: document.getElementById("hud-page").textContent, chips: [...document.querySelectorAll("#hud-worms .chip")].map((c) => c.textContent).join(" ") }));
  check("page-turner: the menu's modes wear 1 2 3 and the rivals 4 5 6; 2 picks Endless (no rivals to pick), 1 Party, 6 Hard, and Enter opens the book at page 1 with four worms",
    caps === "1 2 3 4 5 6 Space or Enter" && endless.mode === "endless" && endless.levels && endless.kept === "endless" && began.state === "play" && began.mode === "party" && began.level === "hard" && began.page === "1" && began.chips === "You Rosy Clem Indy",
    { caps, endless, began });
  const moveBy = async (key) => {
    const a = await p.evaluate(() => { const w = PageTurner.st().worms[0]; return [w.x, w.y]; });
    await p.keyboard.down(key); await p.waitForTimeout(60);
    const inp = await p.evaluate(() => PageTurner.input());
    await p.waitForTimeout(240); await p.keyboard.up(key);
    const b = await p.evaluate(() => { const w = PageTurner.st().worms[0]; return [w.x, w.y]; });
    return { dx: +(b[0] - a[0]).toFixed(3), dy: +(b[1] - a[1]).toFixed(3), inp };
  };
  await p.evaluate(() => { PageTurner.start("endless"); PageTurner.place(0, 0.5, 0.5); });
  const right = await moveBy("ArrowRight"), up = await moveBy("w"), left = await moveBy("a");
  const asks = await p.evaluate(() => GameShell.leaveActive());
  check("page-turner: the arrows and WASD crawl the worm that way (→ right, W up, A left), and once it has crawled, leaving asks first",
    right.dx > 0.03 && Math.abs(right.dy) < 0.01 && right.inp.join() === "1,0" && up.dy < -0.03 && left.dx < -0.03 && asks, { right, up, left, asks });

  // ---- P covers the book and holds the leaf where it was; resumed, it goes on from there
  await standing(p, "party");
  await p.evaluate(() => { PageTurner.advance(0.5, [1, 0]); PageTurner.freeze(false); });
  await p.keyboard.press("p"); await p.waitForTimeout(150);
  const held = await p.evaluate(() => { const s = PageTurner.st(), card = document.querySelector(".gs-pause:not(.gs-dialog)"), cs = card && getComputedStyle(card);
    return { up: !!card && !card.hidden, bg: cs && cs.backgroundColor, img: cs && cs.backgroundImage !== "none", phase: s.phase, t: s.t, clock: s.clock }; });
  await p.waitForTimeout(500);
  const still1 = await p.evaluate(() => { const s = PageTurner.st(); return { phase: s.phase, t: s.t, clock: s.clock }; });
  await p.keyboard.press("p");
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const after = await p.evaluate(() => { const s = PageTurner.st(); return { phase: s.phase, t: s.t, page: s.page }; });
  check("page-turner: P pauses with the book covered whole (the card's backdrop opaque), the leaf held where it was; P again picks up from there, not from a fresh leaf",
    held.up && held.img && /rgb\(33, 58, 152\)/.test(held.bg) && still1.clock === held.clock && still1.t === held.t && after.phase === held.phase && after.t >= held.t && after.t < held.t + 0.25 && after.page === 1,
    { held, still1, after });
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  const leaveBox = await p.evaluate(() => { const d = document.querySelector(".gs-dialog"); return d && { title: d.querySelector("h2").textContent, img: getComputedStyle(d).backgroundImage !== "none" }; });
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  check("page-turner: Esc mid-game asks \"Leave this game?\" over the book covered whole; any other key plays on",
    leaveBox && leaveBox.title === "Leave this game?" && leaveBox.img && p.leaves === 0 && (await p.evaluate(() => PageTurner.state())) === "play", { leaveBox, leaves: p.leaves });
  await done(p, "menu, keys and pause");

  // ---- 2 Players: 3 on the menu picks it (no rivals to pick), Enter opens the
  // book with two worms; W A S D steer Player 1 alone, the arrows Player 2
  // alone, the keys line says so; P pauses as in the other modes; the end card
  // names the winner, or a draw, with the sitting's tally, also on the menu
  {
    const q = await open();
    const recBefore = await q.evaluate(() => ["easy", "normal", "hard"].map((l) => localStorage.getItem("pageturner_record_" + l)).join());
    await q.keyboard.press("3"); await q.waitForTimeout(80);
    const picked = await q.evaluate(() => ({ mode: PageTurner.mode(), levels: document.getElementById("pick-level").hidden, kept: localStorage.getItem("pageturner_mode") }));
    await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const began = await q.evaluate(() => {
      const shown = [...document.querySelectorAll("#keys > span")].filter((s) => getComputedStyle(s).display !== "none").map((s) => s.textContent.replace(/\s+/g, " ").trim());
      return { state: PageTurner.state(), mode: PageTurner.mode(), worms: PageTurner.st().worms.length, chips: [...document.querySelectorAll("#hud-worms .chip")].map((c) => c.textContent).join(" "), keys: shown };
    });
    // (the keys held while a leaf stands: 3 s before it lands; the clock held after)
    await q.evaluate(() => { const PT = PageTurner; PT.freeze(true); for (let i = 0; i < 600 && PT.st().phase !== "stand"; i++) PT.advance(1 / 60); PT.place(0, 0.3, 0.6); PT.place(1, 0.7, 0.6); PT.freeze(false); });
    const pos = () => q.evaluate(() => PageTurner.st().worms.map((w) => [+w.x.toFixed(3), +w.y.toFixed(3)]));
    const hold = async (key) => {
      // (both worms at rest first: one let go a moment ago still slides to a stop)
      await q.waitForFunction(() => PageTurner.st().worms.every((w) => Math.hypot(w.vx, w.vy) < 1e-6), null, { timeout: 5000 });
      const a = await pos();
      await q.keyboard.down(key); await q.waitForTimeout(60);
      const inp = await q.evaluate(() => [PageTurner.input(0), PageTurner.input(1)]);
      await q.waitForTimeout(240); await q.keyboard.up(key);
      const b = await pos();
      return { inp, d1: [+(b[0][0] - a[0][0]).toFixed(3), +(b[0][1] - a[0][1]).toFixed(3)], d2: [+(b[1][0] - a[1][0]).toFixed(3), +(b[1][1] - a[1][1]).toFixed(3)] };
    };
    const w = await hold("w"), right = await hold("ArrowRight");
    await q.evaluate(() => PageTurner.freeze(true));
    check("page-turner (2 Players): 3 on the menu picks 2 Players (no rivals to pick), Enter opens the book with Player 1 and Player 2, and the keys line names each one's keys",
      picked.mode === "duo" && picked.levels && picked.kept === "duo" && began.state === "play" && began.mode === "duo" && began.worms === 2 && began.chips === "Player 1 Player 2" &&
      began.keys.join("|") === "Player 1 WASD, Player 2 ←↑↓→ to crawl", { picked, began });
    check("page-turner (2 Players): W A S D steer Player 1 alone (W up) and the arrows Player 2 alone (→ right)",
      w.d1[1] < -0.03 && Math.abs(w.d2[0]) < 0.002 && Math.abs(w.d2[1]) < 0.002 && w.inp[0].join() === "0,-1" && w.inp[1].join() === "0,0" &&
      right.d2[0] > 0.03 && Math.abs(right.d1[0]) < 0.002 && Math.abs(right.d1[1]) < 0.002 && right.inp[1].join() === "1,0" && right.inp[0].join() === "0,0", { w, right });
    await q.keyboard.press("p"); await q.waitForTimeout(150);
    const paused = await q.evaluate(() => { const card = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!card && !card.hidden; });
    await q.keyboard.press("p"); await q.waitForTimeout(100);
    // Player 2 squished, Player 1 through; then both squished together
    const finish = (who) => q.evaluate((who) => {
      const PT = PageTurner;
      if (PT.state() !== "play") PT.start(PT.mode());
      PT.freeze(true);
      for (let i = 0; i < 1200 && PT.state() === "play" && PT.st().phase !== "stand"; i++) PT.advance(1 / 60);
      const s = PT.st(), h = s.leaf.holes[0];
      // (two places well off every hole, apart)
      const spots = [];
      for (let y = 0.06; y < 0.95; y += 0.05) for (let x = 0.06; x < 0.95; x += 0.05) if (s.leaf.holes.every((o) => Math.hypot(o.cx - x, o.cy - y) > o.rin + 0.06)) spots.push([x, y]);
      const a = spots[0], b = spots.find((p) => Math.hypot(p[0] - a[0], p[1] - a[1]) > 0.12);
      for (let i = 0; i < 3600 && PT.state() === "play"; i++) { PT.place(0, who === "draw" ? a[0] : h.cx, who === "draw" ? a[1] : h.cy); PT.place(1, b[0], b[1]); PT.advance(1 / 60); }
    }, who);
    const card = () => q.evaluate(() => ({ title: document.getElementById("over-title").textContent, big: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent, tally: PageTurner.tally && PageTurner.tally() }));
    const before = await q.evaluate(() => (PageTurner.tally ? PageTurner.tally() : [0, 0, 0]));
    await finish("p1");
    await q.waitForFunction(() => PageTurner.state() === "over", null, { timeout: 15000 });
    const won = await card();
    await q.waitForFunction(() => performance.now() - PageTurner.overAt() > 750, null, { timeout: 15000 });
    await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const again = await q.evaluate(() => ({ state: PageTurner.state(), mode: PageTurner.mode() }));
    await finish("draw");
    await q.waitForFunction(() => PageTurner.state() === "over", null, { timeout: 15000 });
    const drew = await card();
    await q.waitForFunction(() => performance.now() - PageTurner.overAt() > 750, null, { timeout: 15000 });
    await q.keyboard.press("Backspace"); await q.waitForTimeout(150);
    const menu = await q.evaluate(() => ({ state: PageTurner.state(), tally: document.getElementById("tally").textContent, rec: ["easy", "normal", "hard"].map((l) => localStorage.getItem("pageturner_record_" + l)).join() }));
    const [p1, p2, d] = before, draws = (n) => (n ? " · " + n + (n === 1 ? " draw" : " draws") : "");
    const wonText = "this sitting: Player 1 " + (p1 + 1) + " · Player 2 " + p2 + draws(d), drewText = "Player 1 " + (p1 + 1) + " · Player 2 " + p2 + draws(d + 1);
    check("page-turner (2 Players): P pauses; Player 2 squished while Player 1 goes through is Player 1's win, both squished a draw; the card keeps the sitting's tally (Player 1 1 · Player 2 0, then · 1 draw), the menu shows it, and no Party record is touched",
      paused && won.title === "Last worm wriggling!" && won.big === "Player 1 wins" && /Player 2 was squished by page \d+/.test(won.stats) && won.stats.endsWith(wonText) &&
      again.state === "play" && again.mode === "duo" && drew.big === "A draw" && drew.stats.endsWith("this sitting: " + drewText) &&
      menu.state === "menu" && menu.tally.includes("2 Players: " + drewText) && menu.rec === recBefore, { paused, won, again, drew, menu, recBefore, before });
    await done(q, "2 Players");
  }

  // ---- Endless: the best is kept the moment it's passed; Party: the record the moment a game ends
  p = await open();
  await standing(p, "endless");
  const best = await p.evaluate(() => {
    const PT = PageTurner, out = [];
    for (let i = 0; i < 2; i++) {
      const s = PT.st(), h = s.leaf.holes[0];
      PT.place(0, h.cx, h.cy);
      while (PT.st().phase !== "land") PT.advance(1 / 60);
      out.push({ best: localStorage.getItem("pageturner_best_endless"), state: PT.state(), hud: document.getElementById("hud-worms").textContent });
      while (PT.st().phase !== "stand") PT.advance(1 / 60);
    }
    return out;
  });
  check("page-turner (Endless): the most pages is saved as each page is got through, mid-run, and the HUD counts it",
    best[0].best === "1" && best[1].best === "2" && best.every((b) => b.state === "play") && /most pages 2/.test(best[1].hud), best);
  await standing(p, "party", "normal");
  const lost = await p.evaluate(() => {
    const PT = PageTurner, s = PT.st();
    let spot = null;
    for (let y = 0.06; y < 0.95 && !spot; y += 0.05) for (let x = 0.06; x < 0.95 && !spot; x += 0.05) if (s.leaf.holes.every((h) => Math.hypot(h.cx - x, h.cy - y) > h.rin + 0.06)) spot = [x, y];
    PT.place(0, spot[0], spot[1]);
    // (a rival parked in a hole, so it's a loss and not a draw)
    s.worms[1].cpu = null; PT.place(1, s.leaf.holes[0].cx, s.leaf.holes[0].cy);
    while (PT.state() === "play") PT.advance(1 / 60);
    return { state: PT.state(), rec: localStorage.getItem("pageturner_record_normal"), card: !document.getElementById("over").hidden };
  });
  // (Space pressed the moment the card comes up, caught as it happens)
  const early = await p.evaluate(() => new Promise((res) => {
    const over = document.getElementById("over");
    const press = () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true })); res(PageTurner.state()); };
    if (!over.hidden) return press();
    const mo = new MutationObserver(() => { if (!over.hidden) { mo.disconnect(); press(); } });
    mo.observe(over, { attributes: true, attributeFilter: ["hidden"] });
  }));
  await p.waitForFunction(() => PageTurner.state() === "over", null, { timeout: 15000 });
  const card = await p.evaluate(() => ({ title: document.getElementById("over-title").textContent, big: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent,
    caps: [document.getElementById("again").getAttribute("data-gs-key"), document.getElementById("to-menu").getAttribute("data-gs-key")].join(" ") }));
  await p.waitForFunction(() => performance.now() - PageTurner.overAt() > 750, null, { timeout: 15000 });
  // (the same Space, a moment later, plays again)
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }))); await p.waitForTimeout(150);
  const again = await p.evaluate(() => ({ state: PageTurner.state(), page: PageTurner.st().page, mode: PageTurner.mode() }));
  check("page-turner (Party): squished while the others go through is a loss, kept the moment the leaf lands; the card says so in its place, a Space pressed as it comes up is ignored, then Space plays again",
    lost.state === "ending" && lost.rec === "{\"w\":0,\"l\":1,\"d\":0}" && !lost.card && card.title === "Squished!" && /of 4/.test(card.big) && /Normal rivals: 0 W · 1 L/.test(card.stats) && card.caps === "Space or Enter ⌫" &&
    early === "over" && again.state === "play" && again.page === 1 && again.mode === "party", { lost, card, early, again });
  await p.evaluate(() => {
    const PT = PageTurner; PT.freeze(true);
    while (PT.st().phase !== "stand") PT.advance(1 / 60);
    const s = PT.st(), h = s.leaf.holes[0];
    s.worms[1].cpu = null; PT.place(1, h.cx, h.cy);
    for (let y = 0.06; y < 0.95; y += 0.05) for (let x = 0.06; x < 0.95; x += 0.05) if (s.leaf.holes.every((o) => Math.hypot(o.cx - x, o.cy - y) > o.rin + 0.06)) { PT.place(0, x, y); y = 1; break; }
    while (PT.state() === "play") PT.advance(1 / 60);
  });
  await p.waitForFunction(() => PageTurner.state() === "over", null, { timeout: 15000 });
  await p.waitForTimeout(800);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  const back = await p.evaluate(() => ({ state: PageTurner.state(), menu: !document.getElementById("menu").hidden, tally: document.getElementById("tally").textContent }));
  check("page-turner: Backspace on the end card goes back to the menu, which shows the record", back.state === "menu" && back.menu && /Normal rivals: 0 W · 2 L/.test(back.tally), back);
  await done(p, "bests and the end card");

  // ---- Visual FX off: the leaf still falls frame by frame (no dust, no shake); on, both
  for (const off of [true, false]) {
    const q = await open(null, { before: fxSet(off) });
    await standing(q, "endless");
    const r = await q.evaluate(() => new Promise((res) => {
      const PT = PageTurner, s = PT.st(), E = PageTurnerEngine;
      PT.advance(E.stage(1).stand + 0.05); PT.freeze(false);
      const cv = document.getElementById("book"), g = cv.getContext("2d"), tilts = [], sums = [];
      const sum = () => { const d = g.getImageData(0, 0, cv.width, cv.height).data; let a = 0; for (let i = 0; i < d.length; i += 97) a += d[i]; return a; };
      let n = 0;
      const tick = () => { tilts.push(E.tilt(PT.st())); sums.push(sum()); if (++n < 8) requestAnimationFrame(tick); else { PT.freeze(true); while (PT.st().phase === "fall") PT.advance(1 / 60); res({ tilts, frames: new Set(sums).size, parts: PT.parts(), shaking: PT.shaking() }); } };
      requestAnimationFrame(tick);
    }));
    const rising = r.tilts.filter((t, i) => i && t > r.tilts[i - 1]).length;
    check("page-turner, FX " + (off ? "off" : "on") + ": the leaf falls frame by frame and is drawn so" + (off ? "; it lands with no dust or shake" : "; it lands with dust and a shake"),
      rising >= 5 && r.frames >= 5 && (off ? r.parts === 0 && !r.shaking : r.parts > 0 && r.shaking), { tilts: r.tilts.map((t) => +t.toFixed(3)), frames: r.frames, parts: r.parts, shaking: r.shaking });
    await done(q, "FX " + (off ? "off" : "on"));
  }

  // ---- a leaf standing at the spine is over the cover's far edge, waiting
  // and as the one in front of it falls (as the falling one is): the red
  // cover shows only either side of the book
  {
    const q = await open(null, { before: fxSet(true) });
    await standing(q, "endless");
    const r = await q.evaluate(() => new Promise((res) => {
      const PT = PageTurner, E = PageTurnerEngine, cv = document.getElementById("book"), g = cv.getContext("2d");
      PT.place(0, 0.5, 0.85);
      const P = (x, y, z) => { const v = PT.view(), w = 1 + 0.06 * (y - 0.5) + 0.08 * z; return [v.CX + (x - 0.5) * v.S * w, v.OY + (y * v.FY - z * v.FZ) * v.S]; };
      const red = (x, y, z) => { const k = cv.width / PT.view().VW, q = P(x, y, z), d = g.getImageData(Math.round(q[0] * k), Math.round(q[1] * k), 1, 1).data; return Math.hypot(d[0] - 217, d[1] - 71, d[2] - 59) < 30; };
      // (just above the spine, under the leaf's printed border; and the cover beside the page lying flat)
      const look = () => ({ spine: [0.15, 0.5, 0.85].filter((x) => red(x, 0, 0.012)).length, sides: [red(-0.025, 0.9, -0.012), red(1.025, 0.9, -0.012)].filter(Boolean).length });
      const frame = (then) => requestAnimationFrame(() => requestAnimationFrame(then));
      PT.advance(E.stage(1).stand * 0.5);
      frame(() => {
        const wait = look();
        while (PT.st().phase !== "fall") PT.advance(1 / 120);
        while (E.tilt(PT.st()) < 0.5) PT.advance(1 / 240);
        frame(() => res({ wait, turn: look(), tilt: +E.tilt(PT.st()).toFixed(2) }));
      });
    }));
    check("page-turner: a leaf standing at the spine is drawn over the cover's far edge, waiting and while the leaf in front of it falls; the red cover still shows either side",
      r.wait.spine === 0 && r.turn.spine === 0 && r.wait.sides === 2 && r.turn.sides === 2, r);
    await done(q, "leaf over the cover");
  }
  await ctx.close();

  // ---- the leaf about to fall stands still till it tips (no twitch, FX on),
  // and the leaves behind it are drawn whole from the start (pictures, words
  // and holes), three of them (as far down as holes in a row can show, so no
  // plain one shows down three holes and comes up whole later), the same
  // ones that stand in front once it falls
  {
    const c = await lib.newContext(browser, { viewport: { width: 1366, height: 657 } });
    const q = await open(c, { before: fxSet(false) });
    await standing(q, "endless");
    const r = await q.evaluate(() => new Promise((res) => {
      const PT = PageTurner, E = PageTurnerEngine, cv = document.getElementById("book"), g = cv.getContext("2d"), st = PT.st();
      PT.place(0, 0.5, 0.9);
      // (the standing half: from the top of the book down to the spine)
      const v = PT.view(), k = cv.width / v.VW, top = Math.max(0, Math.round((v.OY - 1.1 * v.FZ * v.S) * k)), h = Math.round(v.OY * k) - top - 2;
      const shot = () => g.getImageData(0, top, cv.width, h).data;
      const frame = (then) => requestAnimationFrame(() => requestAnimationFrame(then));
      const s = E.stage(st.page), looks = [], snaps = [];
      let i = 0;
      (function next() {
        if (i >= 4) {
          let differ = 0; for (let j = 0; j < snaps[0].length; j += 4) if (Math.abs(snaps[0][j] - snaps[3][j]) + Math.abs(snaps[0][j + 1] - snaps[3][j + 1]) > 6) differ++;
          // then on to the fall: the leaf that stood behind is the one in front now
          while (st.phase !== "fall") PT.advance(1 / 120);
          frame(() => res({ looks, differ, fall: PT.standing ? PT.standing() : null, was: looks[0] }));
          return;
        }
        PT.advance(s.stand * 0.22);
        frame(() => { looks.push(Object.assign({ phase: st.phase, next: st.next.n, later: (st.later || []).map((l) => l.n) }, PT.standing && PT.standing())); snaps.push(shot()); i++; next(); });
      })();
    }));
    const upright = r.looks.every((l) => l.phase === "stand" && Math.abs(l.th - Math.PI / 2) < 1e-9);
    const whole = r.looks.every((l) => l.behind && l.behind.length === 3 && l.behind[0] === l.next && l.behind[1] === l.later[0] && l.behind[2] === l.later[1]);
    check("page-turner: with Visual FX on the leaf about to fall stands still till it tips (upright, the standing half not moving a pixel), and the three leaves behind it are drawn whole (pictures, words, holes) from the start, the same ones that stand in front as it falls",
      upright && whole && r.differ === 0 && r.fall && r.fall.front === r.was.next && r.fall.behind.length === 3 && r.fall.behind[0] === r.was.later[0] && r.fall.behind[2] === r.was.later[2], r);
    check("page-turner (leaf standing still): no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }

  // ---- down a hole in the pages landed, the page beneath shows as it is
  // (its pictures and words, in the hole's shadow), not a plain colour that
  // the page's own details only come up on later
  {
    const c = await lib.newContext(browser, { viewport: { width: 1366, height: 657 } });
    const q = await open(c, { before: fxSet(true) });
    const r = await q.evaluate(() => new Promise((res) => {
      const PT = PageTurner, E = PageTurnerEngine, st = (PT.start("endless"), PT.freeze(true), PT.st());
      // (through pages 1 and 2, your worm kept in a hole; then off the page's holes)
      while (st.landed < 2 && st.phase !== "over") { const h = st.leaf.holes[0]; PT.place(0, h.cx, h.cy); PT.advance(1 / 120); }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const cv = document.getElementById("book"), g = cv.getContext("2d"), cr = cv.getBoundingClientRect(), k = cv.width / cr.width, w = st.worms[0];
        const holes = st.floor.holes.filter((h) => Math.hypot(h.cx - w.x, h.cy - w.y) > h.rin + 0.06).map((h) => {
          const cols = [];
          for (let y = h.cy - 0.2; y <= h.cy + 0.2; y += 0.008) for (let x = h.cx - 0.2; x <= h.cx + 0.2; x += 0.008) {
            if (E.edgeDepth(h, x, y) < 0.02) continue;
            const at = PT.project(x, y, 0), d = g.getImageData(Math.round((at[0] - cr.left) * k), Math.round((at[1] - cr.top) * k), 1, 1).data;
            cols.push([d[0], d[1], d[2]]);
          }
          const med = [0, 1, 2].map((i) => cols.map((c) => c[i]).sort((a, b) => a - b)[cols.length >> 1]);
          const off = cols.filter((c) => Math.abs(c[0] - med[0]) + Math.abs(c[1] - med[1]) + Math.abs(c[2] - med[2]) > 24).length;
          return { shape: h.shape, n: cols.length, inked: +(off / cols.length).toFixed(3) };
        });
        res({ page: st.page, floor: st.floor.n, holes });
      }));
    }));
    check("page-turner: down every hole in the pages landed, the page beneath shows its own pictures and words (some of each hole inked, not one plain colour)",
      r.holes.length >= 2 && r.holes.every((h) => h.n > 20 && h.inked >= 0.03), r);
    await done(q, "the page beneath");
    await c.close();
  }

  // ---- the red cover is one piece either side of the book: from the
  // standing half's board down across the fold at the spine to the flat
  // half's, however many pages have landed (laptop and phone, FX on and off;
  // after 25 with FX off, as with it on the last slam's dust is still about)
  {
    const bad = [];
    for (const [w, h, fxOff] of [[1366, 657, false], [1366, 657, true], [390, 664, false], [390, 664, true]]) {
      const c = await lib.newContext(browser, w < 700 ? Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
      const q = await open(c, { before: fxSet(fxOff) });
      for (const pages of fxOff ? [0, 25] : [0]) {
        const r = await q.evaluate((pages) => new Promise((res) => {
          const PT = PageTurner, st = (PT.start("endless"), PT.freeze(true), PT.st());
          while (st.landed < pages && st.phase !== "over") { const hh = st.leaf.holes[0]; PT.place(0, hh.cx, hh.cy); PT.advance(1 / 60); }
          while (st.phase !== "stand") { const hh = st.leaf.holes[0]; PT.place(0, hh.cx, hh.cy); PT.advance(1 / 60); }
          PT.place(0, 0.5, 0.9);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const cv = document.getElementById("book"), g = cv.getContext("2d"), cr = cv.getBoundingClientRect(), k = cv.width / cr.width;
            const th = 0.012 + Math.min(0.03, st.landed * 0.0012), out = [];
            // (along the fold, each side: from the standing board's foot to the flat board's far edge)
            for (const x of [-0.03, -0.015, 1.015, 1.03]) for (const f of [0.2, 0.5, 0.8]) {
              const at = PT.project(x, -0.035 + 0.005 * f, -0.012 - (th - 0.012) * f), d = g.getImageData(Math.round((at[0] - cr.left) * k), Math.round((at[1] - cr.top) * k), 1, 1).data;
              if (Math.hypot(d[0] - 217, d[1] - 71, d[2] - 59) > 40) out.push({ x, f, rgb: [d[0], d[1], d[2]] });
            }
            res({ landed: st.landed, th: +th.toFixed(3), out });
          }));
        }), pages);
        if (r.out.length) bad.push(Object.assign({ size: w + "x" + h }, r));
      }
      if (q.errs.length) bad.push({ size: w + "x" + h, errs: q.errs });
      await q.close(); await c.close();
    }
    check("page-turner: the red cover runs on unbroken from the standing half's board to the flat half's either side of the book, on the first page and after 25 (laptop and phone, FX on and off)", bad.length === 0, bad);
  }

  // ---- the menu: the Guides pill's words sit in its middle (small letters
  // sit low on the line: the middle of their ascenders-to-baseline and of
  // their x-height band, between them, on the pill's middle), laptop and
  // phone; and the how-to-play says nothing of worms never being shoved out
  {
    const bad = [];
    let how = "";
    for (const [w, h] of [[1366, 657], [390, 664], [320, 568]]) {
      const c = await lib.newContext(browser, { viewport: { width: w, height: h } });
      const q = await open(c);
      const r = await q.evaluate(() => {
        const b = document.getElementById("guides"), br = b.getBoundingClientRect(), cs = getComputedStyle(b);
        const mid = (br.top + parseFloat(cs.borderTopWidth) + br.bottom - parseFloat(cs.borderBottomWidth)) / 2;
        const cx = document.createElement("canvas").getContext("2d"), got = [];
        for (const el of b.querySelectorAll("b, small")) {
          const s = getComputedStyle(el);
          // (the baseline: a zero-sized box sitting on it)
          const mark = document.createElement("span"); mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
          el.appendChild(mark); const base = mark.getBoundingClientRect().top; mark.remove();
          cx.font = s.fontStyle + " " + s.fontWeight + " " + s.fontSize + " " + s.fontFamily;
          got.push({ base, top: base - cx.measureText(el.textContent).actualBoundingBoxAscent, xTop: base - cx.measureText("x").actualBoundingBoxAscent });
        }
        const base = Math.max(...got.map((g) => g.base)), top = Math.min(...got.map((g) => g.top)), xTop = Math.min(...got.map((g) => g.xTop));
        return { off: +((((top + base) / 2 + (xTop + base) / 2) / 2) - mid).toFixed(2), asc: +((top + base) / 2 - mid).toFixed(2), xband: +((xTop + base) / 2 - mid).toFixed(2), how: document.querySelector("#menu .how").textContent };
      });
      how = r.how;
      if (Math.abs(r.off) > 0.75) bad.push({ size: w + "x" + h, off: r.off, asc: r.asc, xband: r.xband });
      await done(q, "Guides pill " + w + "x" + h);
      await c.close();
    }
    check("page-turner: the Guides pill's words sit in its middle (laptop, phone, 320 px: within 0.75 px)", bad.length === 0, bad);
    check("page-turner: the menu's how-to-play no longer says worms can share a hole and none is shoved out", !/shoved out|share a hole/i.test(how), how.trim().replace(/\s+/g, " "));
  }

  // ---- a thumb: down anywhere off the book, dragging steers; up, it stops
  {
    const c = await lib.newContext(browser, Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 664 } }));
    const q = await open(c);
    const hint = await q.evaluate(() => ({ keys: getComputedStyle(document.querySelector("#keys .gs-keys")).display, touch: getComputedStyle(document.querySelector("#keys .gs-touch")).display }));
    await q.evaluate(() => { PageTurner.start("endless"); PageTurner.place(0, 0.5, 0.5); });
    const r = await q.evaluate(() => new Promise((res) => {
      const PT = PageTurner, w = PT.st().worms[0], at = PT.project(w.x, w.y), x0 = innerWidth / 2, y0 = innerHeight - 60;
      const fire = (type, x, y) => document.elementFromPoint(x0, y0).dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y, isPrimary: true }));
      fire("pointerdown", x0, y0); fire("pointermove", x0 + 45, y0);
      const stick = document.getElementById("stick"), sr = stick.getBoundingClientRect(), inp = PT.input(), x1 = w.x, shown = !stick.hidden;
      setTimeout(() => { const x2 = PT.st().worms[0].x; fire("pointerup", x0 + 45, y0); res({ inp, shown, stickAt: [Math.round(sr.left + sr.width / 2), Math.round(sr.top + sr.height / 2)], touch: [x0, y0], worm: at.map(Math.round), moved: +(x2 - x1).toFixed(3), after: PT.input(), hidden: stick.hidden }); }, 300);
    }));
    check("page-turner (phone): the hint speaks of touch; a thumb down below the book and dragged right steers the worm right, the stick shown where the thumb is (well away from the worm); lifted, it stops",
      hint.keys === "none" && hint.touch !== "none" && r.inp[0] > 0.95 && Math.abs(r.inp[1]) < 0.05 && r.shown && Math.hypot(r.stickAt[0] - r.touch[0], r.stickAt[1] - r.touch[1]) < 3 &&
      Math.hypot(r.worm[0] - r.touch[0], r.worm[1] - r.touch[1]) > 80 && r.moved > 0.05 && r.after.join() === "0,0" && r.hidden, { hint, r });
    await done(q, "phone");
    await c.close();
  }

  // ---- 2 Players on a phone: a thumb on each half, at once, each steering
  // its own worm, a stick shown under each (its knob the worm's colour); the
  // hint says which half is whose
  {
    const c = await lib.newContext(browser, Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 664 } }));
    const q = await open(c);
    await q.evaluate(() => { PageTurner.start("duo"); PageTurner.place(0, 0.3, 0.5); PageTurner.place(1, 0.7, 0.5); });
    const hint = await q.evaluate(() => [...document.querySelectorAll("#keys > span")].filter((s) => getComputedStyle(s).display !== "none").map((s) => s.textContent.replace(/\s+/g, " ").trim()));
    const r = await q.evaluate(() => new Promise((res) => {
      const PT = PageTurner, a = PT.st().worms.map((w) => [w.x, w.y]), L = [80, innerHeight - 70], Rt = [innerWidth - 80, innerHeight - 70];
      const fire = (type, id, x, y, at) => document.elementFromPoint(at[0], at[1]).dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: "touch", clientX: x, clientY: y, isPrimary: id === 1 }));
      fire("pointerdown", 1, L[0], L[1], L); fire("pointerdown", 2, Rt[0], Rt[1], Rt);
      fire("pointermove", 1, L[0] + 45, L[1], L); fire("pointermove", 2, Rt[0], Rt[1] - 45, Rt);
      const el = (id) => document.getElementById(id) || { hidden: true };
      const inp = [PT.input(0), PT.input(1)], sticks = ["stick", "stick2"].map((id) => !el(id).hidden), knob2 = document.getElementById("knob2") && getComputedStyle(document.getElementById("knob2")).backgroundColor;
      setTimeout(() => {
        const b = PT.st().worms.map((w) => [w.x, w.y]);
        fire("pointerup", 1, L[0] + 45, L[1], L); fire("pointerup", 2, Rt[0], Rt[1] - 45, Rt);
        res({ inp, sticks, knob2, d1: [+(b[0][0] - a[0][0]).toFixed(3), +(b[0][1] - a[0][1]).toFixed(3)], d2: [+(b[1][0] - a[1][0]).toFixed(3), +(b[1][1] - a[1][1]).toFixed(3)], after: [PT.input(0), PT.input(1)], hidden: ["stick", "stick2"].map((id) => el(id).hidden) });
      }, 300);
    }));
    check("page-turner (2 Players, phone): the hint says Player 1 drags on the left half and Player 2 on the right; a thumb on each, at once, steers each worm its own way (left dragged right, right dragged up), a stick under each, the right one's knob pink; lifted, both stop",
      hint.join("|") === "Player 1 drags on the left half, Player 2 on the right" && r.inp[0][0] > 0.95 && Math.abs(r.inp[0][1]) < 0.05 && r.inp[1][1] < -0.95 && Math.abs(r.inp[1][0]) < 0.05 &&
      r.sticks.every(Boolean) && r.knob2 === "rgb(255, 95, 151)" && r.d1[0] > 0.05 && Math.abs(r.d1[1]) < 0.01 && r.d2[1] < -0.05 && Math.abs(r.d2[0]) < 0.01 &&
      r.after.every((v) => v.join() === "0,0") && r.hidden.every(Boolean), { hint, r });
    await done(q, "2 Players on a phone");
    await c.close();
  }

  // ---- it fits: laptops and phones, the menu (Party picked, with its
  // rivals, and 2 Players) and in play (Party, and 2 Players with its longer
  // keys line)
  {
    const sizes = [[1280, 900], [1366, 657], [1280, 600], [390, 664], [360, 560], [375, 553], [320, 568], [750, 340]];
    const bad = [];
    for (const [w, h] of sizes) {
      const phone = w < 700 || h < 460;
      const c = await lib.newContext(browser, phone ? Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
      const q = await open(c);
      const menuOf = () => q.evaluate((w) => {
        const panel = document.getElementById("menu"), card = panel.querySelector(".card").getBoundingClientRect();
        return { wide: document.documentElement.scrollWidth > w, scrolls: panel.scrollHeight > panel.clientHeight + 1, card: card.bottom <= innerHeight && card.top >= 0 && card.right <= w };
      }, w);
      const playOf = () => q.evaluate((w) => {
        const PT = PageTurner, a = PT.project(-0.05, -0.035, 1.06), b = PT.project(1.05, 1.05, -0.05), c2 = PT.project(1.05, -0.035, 1.06);
        const book = { left: Math.min(a[0], b[0]), right: Math.max(b[0], c2[0]), top: a[1], bottom: b[1] };
        const hit = (r) => r.width > 0 && r.left < book.right && r.right > book.left && r.top < book.bottom && r.bottom > book.top;
        const corner = [...document.querySelectorAll(".nav-back-games, .gs-corner > *")].map((e) => e.getBoundingClientRect());
        const hud = document.getElementById("hud").getBoundingClientRect(), keys = document.getElementById("keys").getBoundingClientRect();
        const hudHit = corner.some((r) => r.width > 0 && r.left < hud.right && r.right > hud.left && r.top < hud.bottom && r.bottom > hud.top);
        return { wide: document.documentElement.scrollWidth > w, inside: book.left >= 0 && book.right <= w && book.top >= 0 && book.bottom <= innerHeight, under: corner.some(hit), hud: hit(hud) || hudHit, keys: keys.height > 0 && keys.bottom <= innerHeight + 0.5 && keys.right <= w, size: Math.round(book.right - book.left) };
      }, w);
      for (const mode of ["party", "duo"]) {
        await q.evaluate((mode) => { PageTurner.toMenu(); const b = document.querySelector('#pick-mode button[data-v="' + mode + '"]'); if (b) b.click(); }, mode);
        const menu = await menuOf();
        await q.evaluate((mode) => { PageTurner.start(mode, "normal"); PageTurner.freeze(true); }, mode);
        await q.waitForTimeout(400);
        const play = await playOf();
        if (menu.wide || menu.scrolls || !menu.card || play.wide || !play.inside || play.under || play.hud || !play.keys) bad.push({ size: w + "x" + h, mode, menu, play });
      }
      if (q.errs.length) bad.push({ size: w + "x" + h, errs: q.errs });
      await q.close(); await c.close();
    }
    check("page-turner: on laptops (1280x900, 1366x657, 1280x600) and phones (390x664, 360x560, 375x553, 320x568, on its side 750x340) nothing is wider than the screen, the menu card shows whole without scrolling (Party with its rivals, and 2 Players), and in play (Party, 2 Players) the book is on screen, clear of the corner buttons and the HUD, with the keys line showing",
      bad.length === 0, bad);
  }

  // ---- guides: on (the light through the coming leaf's holes shows on the
  // page below where they'll land) or off (only the standing leaf shows
  // them), picked on the menu with G and kept; off has records of its own
  {
    const c = await lib.newContext(browser, { viewport: { width: 1366, height: 657 } });
    const q = await lib.open(c, base, "games/page-turner/");
    // the floor's brightness where a round hole's light would land, the leaf standing
    const light = () => q.evaluate(async () => {
      const PT = PageTurner, E = window.PageTurnerEngine;
      PT.start("endless");
      const st = PT.st();
      for (let i = 0; i < 600 && !(st.phase === "stand" && st.t > 0.6); i++) PT.advance(1 / 60, [0, 0]);
      st.leaf.holes = [E.makeHole(4, "sun", 0.12)];
      const h = st.leaf.holes[0];
      PT.place(0, 0.12, 0.88);
      PT.freeze(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cv = document.getElementById("book"), r = cv.getBoundingClientRect(), k = cv.width / r.width, at = PT.project(h.cx, h.cy, 0);
      const d = cv.getContext("2d").getImageData(Math.round((at[0] - r.left) * k), Math.round((at[1] - r.top) * k), 1, 1).data;
      PT.freeze(false); PT.toMenu();
      return Math.round((d[0] + d[1] + d[2]) / 3);
    });
    const before = await q.evaluate(() => ({ on: PageTurner.guides(), key: document.getElementById("guides").getAttribute("data-gs-key"), saved: localStorage.getItem("pageturner_guides") }));
    const lit = await light();
    await q.keyboard.press("g");
    const after = await q.evaluate(() => ({ on: PageTurner.guides(), saved: localStorage.getItem("pageturner_guides"), text: document.getElementById("guides").textContent }));
    const dark = await light();
    await q.reload(); await q.waitForTimeout(400);
    const kept = await q.evaluate(() => PageTurner.guides());
    // records: an Endless page reached with the guides off goes to their own best
    const rec = await q.evaluate(() => {
      const PT = PageTurner, E = window.PageTurnerEngine;
      PT.start("endless");
      const st = PT.st();
      // (a hole where your worm is, each time: through every page)
      for (let i = 0; i < 4000 && st.page < 4; i++) { if (st.leaf) { st.leaf.holes = [E.makeHole(4, "sun", 0.13)]; const m = E.panelMid(4); PT.place(0, m[0], m[1]); } PT.advance(1 / 60, [0, 0]); }
      return { off: localStorage.getItem("pageturner_best_endless_noguides"), on: localStorage.getItem("pageturner_best_endless") };
    });
    check("page-turner: Guides on by default, G on the menu turns them off (its keycap shown), kept; with them on the page below lights up where a hole will land, off it doesn't",
      before.on === true && before.key === "G" && before.saved == null && after.on === false && after.saved === "off" && /off/.test(after.text) && kept === false && lit - dark > 40,
      { before, after, kept, lit, dark });
    check("page-turner: with the guides off, Endless pages count toward a best of their own (pageturner_best_endless_noguides), not the guides-on best",
      Number(rec.off) >= 2 && rec.on == null, rec);
    check("page-turner (guides): no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }
};
