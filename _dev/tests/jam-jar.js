// Jam Jar: while paused the keys neither drop a fruit nor move the aim; an
// overflowing jar is "★ New best!" only when it beats the best (not on a tie,
// and not on an empty first jar); on a 2× screen the jar and its fruit are
// drawn at 2× (they were blurry), and a click still drops where it points;
// a slow load's out-of-order first frame doesn't end a fresh game; a roll
// slows steadily to a stop, turning till it stops; and in a played jar no
// fruit jumps further in a frame than its speed takes it.
const HOOK = ["    setAim: function (x) { aimX = x; },", `    setAim: function (x) { aimX = x; },
    aim: function () { return aimX; },
    cooldown: function () { return dropCd; },
    paused: function () { return P.isPaused(); },
    overflow: function (s) { score = s; gameOver(); },
    spriteWidth: function (i) { return SPRITES[i].c.width; },`];

// (the physics step itself, for the rolling check: run by hand, so the
// numbers don't depend on the frame rate)
const PHYS_HOOK = ["  window.__game = {", "  window.__game = {\n    physics: physics,"];
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (opts) => lib.open(ctx, base, "games/jam-jar/", Object.assign({ before: (pg) => lib.injectScript(pg, "games/jam-jar/game.js", [HOOK]) }, opts));
  const done = async (p, what) => { check("jam-jar " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- paused, Space / ↓ drop nothing and ← → leave the aim; resumed, Space drops
  let p = await open();
  await p.keyboard.press("Space");
  // the next drop waits out a 0.45 s cooldown on the jar's own clock (slow
  // frames slow it): wait for it to run out, so the resumed Space can drop
  await p.waitForFunction(() => __game.cooldown() <= 0, null, { timeout: 10000 }).catch(() => {});
  await p.keyboard.press("p"); await p.waitForTimeout(80);
  const before = await p.evaluate(() => ({ n: __game.fruits.length, aim: __game.aim() }));
  for (const k of ["Space", "ArrowDown", "ArrowLeft", "ArrowLeft"]) await p.keyboard.press(k);
  const paused = await p.evaluate(() => ({ n: __game.fruits.length, aim: __game.aim(), up: !document.querySelector(".gs-pause").hidden }));
  await p.keyboard.press("p"); await p.waitForTimeout(80);
  await p.keyboard.press("Space"); await p.waitForTimeout(80);
  const resumed = await p.evaluate(() => __game.fruits.length);
  check("jam-jar: while paused Space and ↓ drop nothing and ← → leave the aim; after resuming Space drops",
    before.n === 1 && paused.up && paused.n === 1 && paused.aim === before.aim && resumed === 2, { before, paused, resumed });
  await done(p, "paused keys");

  // ---- a first frame stamped before the game read its clock (a slow load) is
  // a negative step: it used to run the overflow timer up on the empty jar and
  // end the fresh game. Served here with the clock read 3 s late, so it always is.
  {
    const q = await lib.open(ctx, base, "games/jam-jar/", { before: (pg) => lib.injectScript(pg, "games/jam-jar/game.js",
      [HOOK, ["  var last = performance.now();\n  function loop(now) {", "  var last = performance.now() + 3000;\n  function loop(now) {"]]) });
    const st = await q.evaluate(() => new Promise((r) => { let k = 0; (function f() { if (++k < 10) requestAnimationFrame(f); else r(__game.state); })(); }));
    check("jam-jar: a slow load's out-of-order first frame doesn't end a fresh game", st === "play", st);
    await done(q, "first frame");
  }

  // ---- the overflow card's "New best!" is for a jar that beats the best
  p = await open();
  const card = async (s) => { await p.evaluate((s) => { __game.reset(); __game.overflow(s); }, s); return p.evaluate(() => document.getElementById("overBest").textContent); };
  const empty = await card(0);           // a first jar with no points
  await p.evaluate(() => localStorage.setItem("jamjar_best", "40"));
  const tie = await card(40), beat = await card(41);
  check("jam-jar: \"★ New best!\" isn't shown for an empty first jar or a tie, only for a jar that beats the best",
    !/New best/.test(empty) && !/New best/.test(tie) && /New best/.test(beat), { empty, tie, beat });
  await done(p, "new best");
  await ctx.close();

  // ---- a 2× screen: the backing store and the fruit sprites are 2×, a click
  // drops the berry where it points, and a ratio change (zoom) refits
  const hi = await lib.newContext(browser, { deviceScaleFactor: 2 });
  p = await lib.open(hi, base, "games/jam-jar/", { before: (pg) => lib.injectScript(pg, "games/jam-jar/game.js", [HOOK]) });
  const size = () => p.evaluate(() => { const c = document.getElementById("game"); return { w: c.width, h: c.height, berry: __game.spriteWidth(0) }; });
  const two = await size();
  await p.evaluate(() => __game.setQueue(0, 0));
  const box = await p.evaluate(() => { const r = document.getElementById("game").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
  await p.mouse.click(box.x + box.w * (400 / 540), box.y + 200); await p.waitForTimeout(100);
  const fx = await p.evaluate(() => __game.fruits.length ? Math.round(__game.fruits[0].x) : "none (" + (__game.paused() ? "paused" : __game.cooldown() > 0 ? "cooling" : "?") + ")");
  await p.evaluate(() => { Object.defineProperty(window, "devicePixelRatio", { get: () => 1, configurable: true }); window.dispatchEvent(new Event("resize")); });
  await p.waitForTimeout(100);
  const one = await size();
  check("jam-jar: on a 2× screen the jar and its fruit are drawn at 2×, a click drops where it points, and a zoom to 1× refits",
    two.w === 1080 && two.h === 1440 && two.berry === 124 && Math.abs(fx - 400) <= 2 && one.w === 540 && one.berry === 62, { two, dropX: fx, one });
  await done(p, "hi-DPI");
  await hi.close();

  // ---- a fruit rolling along the jar's floor keeps its way: a quarter of a
  // second on it has lost a few px/s of its speed (it used to lose a seventh,
  // and more on a faster screen), while a creep still comes to rest.
  // The physics is stepped by hand, all in one go, so no frame comes between.
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/jam-jar/", { before: (pg) => lib.injectScript(pg, "games/jam-jar/game.js", [HOOK, PHYS_HOOK]) });
    const roll = await q.evaluate(() => {
      __game.setQueue(0, 0); __game.setAim(270); __game.drop();
      const f = __game.fruits[0], step = 1 / 120;
      for (let i = 0; i < 480; i++) __game.physics(step);          // down onto the floor, and still
      const rest = Math.abs(f.vx) + Math.abs(f.vy);
      const run = (v, steps) => { f.vx = v; for (let i = 0; i < steps; i++) __game.physics(step); return Math.round(f.vx * 10) / 10; };
      const fast = run(300, 30);
      f.x = 270;
      const slow = run(8, 90);
      return { rest: Math.round(rest * 10) / 10, fast, slow, fruits: __game.fruits.length };
    });
    check("jam-jar: a fruit rolling along the jar's floor keeps its way (from 300, a quarter of a second leaves it over 272, where it used to be down to 254), and a creep still comes to rest",
      roll.fruits === 1 && roll.rest < 1 && roll.fast > 272 && roll.fast < 296 && Math.abs(roll.slow) < 1, roll);
    // ...and it slows the same each moment to the end, turning as it rolls
    // till the moment it stops (it used to crawl on, a share of its speed lost
    // each second, then stop dead under 14 px/s, and stop turning under 12)
    const glide = await q.evaluate(() => {
      __game.reset(); __game.setQueue(0, 0); __game.setAim(100); __game.drop();
      const f = __game.fruits[0], step = 1 / 120;
      for (let i = 0; i < 480; i++) __game.physics(step);
      f.vx = 60;
      const sp = [Math.abs(f.vx)];
      let turn = Infinity, stopAt = null;
      for (let i = 1; i <= 6 * 120; i++) {
        __game.physics(step);
        if (Math.abs(f.vx) > 3 && Math.abs(f.vx) < 12) turn = Math.min(turn, f.w * f.r / f.vx);
        if (stopAt === null && f.vx === 0) stopAt = i / 120;
        if (i % 12 === 0) sp.push(Math.abs(f.vx));
      }
      const x = f.x;
      for (let i = 0; i < 120; i++) __game.physics(step);
      // the slowing in each tenth of a second the fruit was still rolling at its end
      const slow = sp.slice(1).map((v, i) => [sp[i] - v, v]).filter(([, v]) => v > 0).map(([d]) => Math.round(d * 100) / 100);
      return { slow, stopAt, turn: Math.round(turn * 100) / 100, still: f.vx === 0 && Math.abs(f.x - x) < 0.01 };
    });
    check("jam-jar: a roll along the floor slows the same each moment, no harder at the end, and stops; it turns as it rolls till it stops, then stays put",
      glide.slow.length > 20 && Math.max(...glide.slow) <= glide.slow[0] * 1.2 && glide.stopAt !== null && glide.stopAt < 7 && glide.turn > 0.85 && glide.still,
      { stopAt: glide.stopAt, turn: glide.turn, still: glide.still, first: glide.slow.slice(0, 3), most: Math.max(...glide.slow), last: glide.slow.slice(-3) });
    check("jam-jar (rolling): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  // ---- no fruit jumps further in a frame than its speed takes it: a jar
  // played for 40 s (the same fruit and drops each time: a seeded random),
  // stepped as a 60 Hz screen does. A merge's newborn grows into its room,
  // pushing its neighbours aside; it used to arrive full size and throw them
  // up to 30 px in one frame, and the passes that part fruit fought over them.
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/jam-jar/", { before: async (pg) => {
      await lib.injectScript(pg, "games/jam-jar/game.js", [HOOK, PHYS_HOOK]);
      await pg.addInitScript(() => { let s = 2 * 2654435761 >>> 0; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); });
    } });
    const jumps = await q.evaluate(() => {
      const G = __game, step = 1 / 120;
      G.reset();
      let t = 0, nextDrop = 0, worst = 0, at = null, merges = 0;
      const last = new Map();
      while (t < 40 && G.state === "play") {
        if (t >= nextDrop) { G.setAim(78 + Math.random() * 384); G.drop(); nextDrop = t + 0.9; }
        const v0 = new Map(G.fruits.map((f) => [f, Math.hypot(f.vx, f.vy)])), n0 = G.fruits.length;
        G.physics(step); G.physics(step); t += 2 * step;
        if (G.fruits.length < n0) merges++;
        for (const f of G.fruits) {
          const l = last.get(f);
          if (l && v0.has(f)) {
            const over = Math.hypot(f.x - l.x, f.y - l.y) - Math.max(v0.get(f), Math.hypot(f.vx, f.vy)) * 2 * step;
            if (over > worst) { worst = over; at = Math.round(t * 10) / 10; }
          }
          last.set(f, { x: f.x, y: f.y });
        }
      }
      return { worst: Math.round(worst * 10) / 10, at, merges, state: G.state, fruits: G.fruits.length };
    });
    check("jam-jar: in a played jar no fruit jumps further in a frame than its speed takes it (8 px at most beyond), merges included",
      jumps.state === "play" && jumps.merges >= 5 && jumps.worst <= 8, jumps);
    check("jam-jar (jumps): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }
};
