// Page Turner (a bookworm under the falling pages of a picture book). The
// rules first, driven through the engine itself under node: a worm wholly
// inside a hole goes through and one past its edge is squished, for every
// shape; several share a hole; worms bump, and one can shove another out of
// a hole; pages come faster with fewer, smaller holes; every page's holes
// can be reached from anywhere on it within the warning its shadow gives,
// with a reaction to spare (worked out for every way the holes can fall, and
// played out from the far corner on the last, quickest pages); Party's last
// worm wriggling wins, the last ones squished together draw, and squished
// before the others is a loss in its place; Endless counts pages and closes
// the book at 99; the CPU worms read the pages, the hard ones better.
// Then the page: the menu's keys, the arrows and WASD, a thumb anywhere on
// the screen steering, the Endless best kept the moment it's passed and the
// Party record the moment a game ends, P covering the book and picking up
// where it stopped, the end card's keys, Visual FX off still animating the
// fall (with no dust or shake), and the book fitting laptops and phones.
module.exports = async ({ browser, base, check, lib }) => {
  const path = require("path");
  const { devices } = require("@playwright/test");
  const E = require(path.join(lib.ROOT, "games/page-turner/engine.js"));
  const R = E.TUNE.R;
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
      const rin = E.shapesFor(0.08).includes(shape) ? 0.08 : 0.066, h = E.fitRegion(E.makeHole(4, shape, rin));
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
    // four worms in one big hole all go through; the game goes on to page 2
    const st = setup("party", [E.makeHole(4, "sun", 0.135)]);
    const c = E.panelMid(4);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => still(st, i, c[0] + a * 0.045, c[1] + b * 0.045));
    const seen = toSlam(st);
    check("page-turner rules: several worms share a hole, and all of them go through",
      seen.filter((e) => e.type === "through").length === 4 && st.page === 2 && !st.result && E.alive(st).length === 4, { page: st.page, result: st.result, ev: seen.map((e) => e.type) });
  }
  {
    // a worm crawling into another shoves it (they never overlap); out of a hole too
    const h = E.makeHole(4, "sun", 0.07), c = E.panelMid(4);
    const st = setup("party", [h]);
    gone(st, 2); gone(st, 3);
    still(st, 0, c[0] - 0.2, c[1]);
    const rival = st.worms[1]; rival.x = c[0]; rival.y = c[1]; rival.cpu.readAt = 1e9; rival.cpu.wander = [c[0], c[1]];
    let closest = 1, bumps = 0;
    const seen = toSlam(st, (s) => { closest = Math.min(closest, Math.hypot(s.worms[0].x - rival.x, s.worms[0].y - rival.y)); bumps += s.events.filter((e) => e.type === "bump").length; return { x: 1, y: 0 }; });
    check("page-turner rules: worms are solid: one crawling into another bumps it and shoves it along, out of the hole it was standing in, and it's squished",
      closest >= 2 * R - 0.002 && bumps > 0 && rival.x > c[0] + h.room && seen.some((e) => e.type === "squish" && e.id === 1), { closest, bumps, rivalX: rival.x, edge: c[0] + h.room, ev: seen.filter((e) => e.type !== "bump").map((e) => e.type + (e.id != null ? e.id : "")) });
  }
  {
    // the pace: faster, fewer, smaller, then a floor
    const s = [];
    for (let p = 1; p <= 120; p++) s.push(E.stage(p));
    const never = (f) => s.every((x, i) => i === 0 || f(s[i - 1], x));
    const leaves = [1, 5, 10, 15, 20, 30, 99].map((p) => { const l = E.makeLeaf(p, seeded(p)); return { p, holes: l.holes.length, rin: l.holes[0].rin, want: E.stage(p).holes }; });
    check("page-turner rules: pages come faster as the book goes on, with fewer holes and smaller ones (5 holes on page 1, 1 from page 19; a 3 s warning down to 1.65 s), and each leaf has its page's holes",
      never((a, b) => b.warn <= a.warn + 1e-9) && never((a, b) => b.holes <= a.holes) && never((a, b) => b.rin <= a.rin + 1e-9) &&
      s[0].holes === 5 && s[18].holes === 1 && s[0].rin > s[29].rin * 1.9 && Math.abs(s[0].warn - 3) < 0.01 && Math.abs(s[29].warn - 1.65) < 0.01 && s[119].warn === s[29].warn &&
      leaves.every((l) => l.holes === l.want && Math.abs(l.rin - E.stage(l.p).rin) < 1e-9), { first: s[0], floor: s[29], leaves });
  }
  {
    // reach: from anywhere on the page (corners too), through some hole of
    // every way the holes can fall, inside the warning with 0.4 s to react
    const N = 13, starts = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) starts.push([R + (1 - 2 * R) * i / (N - 1), R + (1 - 2 * R) * j / (N - 1)]);
    const margins = {};
    for (const p of [1, 3, 4, 7, 8, 12, 13, 18, 19, 24, 25, 29, 30, 99]) {
      const s = E.stage(p), shapes = E.shapesFor(s.rin), holes = [];
      for (let pn = 0; pn < 9; pn++) holes.push(shapes.map((k) => E.makeHole(pn, k, s.rin)));
      let worst = 0;
      // (the worst k holes for a start are the k farthest panels, each at its worst shape)
      for (const st of starts) { const per = holes.map((hs) => Math.max(...hs.map((h) => E.travelTime(E.nearestFit(h, st[0], st[1]))))).sort((a, b) => b - a); worst = Math.max(worst, per[s.holes - 1]); }
      margins[p] = +(s.warn - E.TUNE.react - worst).toFixed(3);
    }
    check("page-turner rules: every page's holes can be reached from anywhere on the page within its warning, with 0.4 s to react to spare (the worst margins, by page)",
      Object.values(margins).every((m) => m >= 0.05), margins);
    // and played out: the quickest pages, one hole in a corner panel, the worm in the far corner
    const bad = [];
    for (const p of [19, 25, 30, 99]) for (const shape of E.shapesFor(E.stage(p).rin)) for (const [panel, sx, sy] of [[0, 1 - R, 1 - R], [2, R, 1 - R], [6, 1 - R, R], [8, R, R]]) {
      const h = E.makeHole(panel, shape, E.stage(p).rin), st = setup("endless", [h], p);
      still(st, 0, sx, sy);
      let t = 0;
      const seen = toSlam(st, (s) => { t += 1 / 60; const w = s.worms[0]; if (t < E.TUNE.react || E.fits(h, w.x, w.y)) return { x: 0, y: 0 }; const d = Math.hypot(h.cx - w.x, h.cy - w.y); return { x: (h.cx - w.x) / d, y: (h.cy - w.y) / d }; });
      if (!seen.some((e) => e.type === "through")) bad.push({ p, shape, panel });
    }
    check("page-turner rules: on the quickest pages, a worm in the far corner that waits 0.4 s and then crawls straight for the hole gets through it (every shape, every corner)", bad.length === 0, bad.slice(0, 5));
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

  // ---- the menu's keys, then the arrows and WASD
  let p = await open();
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-mode button b, #pick-level button, #play")].map((b) => b.getAttribute("data-gs-key")).join(" "));
  await p.keyboard.press("2"); await p.waitForTimeout(80);
  const endless = await p.evaluate(() => ({ mode: PageTurner.mode(), levels: document.getElementById("pick-level").hidden, kept: localStorage.getItem("pageturner_mode") }));
  await p.keyboard.press("1"); await p.keyboard.press("5"); await p.waitForTimeout(80);
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const began = await p.evaluate(() => ({ state: PageTurner.state(), mode: PageTurner.mode(), level: PageTurner.level(), page: document.getElementById("hud-page").textContent, chips: [...document.querySelectorAll("#hud-worms .chip")].map((c) => c.textContent).join(" ") }));
  check("page-turner: the menu's modes wear 1 and 2 and the rivals 3 4 5; 2 picks Endless (no rivals to pick), 1 Party, 5 Hard, and Enter opens the book at page 1 with four worms",
    caps === "1 2 3 4 5 Space or Enter" && endless.mode === "endless" && endless.levels && endless.kept === "endless" && began.state === "play" && began.mode === "party" && began.level === "hard" && began.page === "1" && began.chips === "You Rosy Clem Indy",
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

  // ---- it fits: laptops and phones, the menu and in play
  {
    const sizes = [[1280, 900], [1366, 657], [1280, 600], [390, 664], [360, 560], [375, 553], [320, 568], [750, 340]];
    const bad = [];
    for (const [w, h] of sizes) {
      const phone = w < 700 || h < 460;
      const c = await lib.newContext(browser, phone ? Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
      const q = await open(c);
      const menu = await q.evaluate((w) => {
        const panel = document.getElementById("menu"), card = panel.querySelector(".card").getBoundingClientRect();
        return { wide: document.documentElement.scrollWidth > w, scrolls: panel.scrollHeight > panel.clientHeight + 1, card: card.bottom <= innerHeight && card.top >= 0 && card.right <= w };
      }, w);
      await q.evaluate(() => { PageTurner.start("party", "normal"); PageTurner.freeze(true); });
      await q.waitForTimeout(400);
      const play = await q.evaluate((w) => {
        const PT = PageTurner, a = PT.project(-0.05, -0.035, 1.06), b = PT.project(1.05, 1.05, -0.05), c2 = PT.project(1.05, -0.035, 1.06);
        const book = { left: Math.min(a[0], b[0]), right: Math.max(b[0], c2[0]), top: a[1], bottom: b[1] };
        const hit = (r) => r.width > 0 && r.left < book.right && r.right > book.left && r.top < book.bottom && r.bottom > book.top;
        const corner = [...document.querySelectorAll(".nav-back-games, .gs-corner > *")].map((e) => e.getBoundingClientRect());
        const hud = document.getElementById("hud").getBoundingClientRect(), keys = document.getElementById("keys").getBoundingClientRect();
        const hudHit = corner.some((r) => r.width > 0 && r.left < hud.right && r.right > hud.left && r.top < hud.bottom && r.bottom > hud.top);
        return { wide: document.documentElement.scrollWidth > w, inside: book.left >= 0 && book.right <= w && book.top >= 0 && book.bottom <= innerHeight, under: corner.some(hit), hud: hit(hud) || hudHit, keys: keys.height > 0 && keys.bottom <= innerHeight + 0.5 && keys.right <= w, size: Math.round(book.right - book.left) };
      }, w);
      if (menu.wide || menu.scrolls || !menu.card || play.wide || !play.inside || play.under || play.hud || !play.keys) bad.push({ size: w + "x" + h, menu, play });
      if (q.errs.length) bad.push({ size: w + "x" + h, errs: q.errs });
      await q.close(); await c.close();
    }
    check("page-turner: on laptops (1280x900, 1366x657, 1280x600) and phones (390x664, 360x560, 375x553, 320x568, on its side 750x340) nothing is wider than the screen, the menu card shows whole without scrolling, and in play the book is on screen, clear of the corner buttons and the HUD, with the keys line showing",
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
