// Jam Jar: while paused the keys neither drop a fruit nor move the aim; an
// overflowing jar is "★ New best!" only when it beats the best (not on a tie,
// and not on an empty first jar); on a 2× screen the jar and its fruit are
// drawn at 2× (they were blurry), and a click still drops where it points;
// a slow load's out-of-order first frame doesn't end a fresh game; a roll
// slows steadily to a stop, turning till it stops; in a played jar no fruit
// jumps further in a frame than its speed takes it; and the two paces (the
// menu, Rolling Boil's drop every second, its own best: see the end); the
// dashed lines pinned to the jar, still with Visual FX off and drifting with
// it on; "FILL LINE" clear of the glass; and on a short laptop screen
// nothing under the corner buttons and nothing to scroll.
const HOOK = ["    setAim: function (x) { aimX = x; },", `    setAim: function (x) { aimX = x; },
    aim: function () { return aimX; },
    cooldown: function () { return dropCd; },
    paused: function () { return P.isPaused(); },
    overflow: function (s) { score = s; gameOver(); },
    spriteWidth: function (i) { return SPRITES[i].c.width; },`];

// (the physics step itself, for the rolling check: run by hand, so the
// numbers don't depend on the frame rate)
const PHYS_HOOK = ["  window.__game = {", "  window.__game = {\n    physics: physics,"];
// (every drop, where it went and whether the jar dropped it by itself)
const DROPS_HOOK = ["    fruits.push(makeFruit(x, DROP_Y, current));", "    fruits.push(makeFruit(x, DROP_Y, current));\n    (window.__drops = window.__drops || []).push({ x: Math.round(x), auto: !!auto });"];
// requestAnimationFrame and performance.now on a clock the test advances:
// __frames(n) runs n frames of 1/60 s
const STEPPED = () => {
  let t = 1000, q = [];
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__frames = (n) => { for (let i = 0; i < n; i++) { t += 1000 / 60; const run = q; q = []; run.forEach((cb) => cb(t)); } };
};
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (opts) => lib.open(ctx, base, "games/jam-jar/", Object.assign({ before: (pg) => lib.injectScript(pg, "games/jam-jar/game.js", [HOOK]) }, opts));
  const done = async (p, what) => { check("jam-jar " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- paused, Space / ↓ drop nothing and ← → leave the aim; resumed, Space drops
  let p = await open();
  await p.evaluate(() => __game.start("simmer"));
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
    const st = await q.evaluate(() => new Promise((r) => { __game.start("simmer"); let k = 0; (function f() { if (++k < 10) requestAnimationFrame(f); else r(__game.state); })(); }));
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
  await p.evaluate(() => { __game.start("simmer"); __game.setQueue(0, 0); });
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
      __game.start("simmer"); __game.setQueue(0, 0); __game.setAim(270); __game.drop();
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

  // ---- the paces. The page opens on the menu with no jar in play; 2 picks
  // Rolling Boil without starting it and Enter starts it (kept for next
  // time). There a fruit drops by itself each second (60 frames at 60 Hz)
  // where the aim is: a click only aims, Space and ↓ drop nothing, and the
  // waiting fruit's second counts down; nothing drops under the pause card,
  // and the count carries on after it. A finger on the jar aims instead of
  // scrolling, and the hint says how it plays. The jar's best is its own
  // (jamjar_best_boil, on the games page's reset list), and the result
  // card's Backspace goes back to the paces. Slow Simmer still drops on a click.
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/jam-jar/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/jam-jar/game.js", [HOOK, DROPS_HOOK]); } });
    const look = () => q.evaluate(() => ({ state: __game.state, mode: __game.mode, menu: !document.getElementById("menuScreen").classList.contains("hidden"),
      on: (document.querySelector("#pick-mode button.on") || {}).getAttribute ? document.querySelector("#pick-mode button.on").getAttribute("data-v") : null,
      drops: (window.__drops || []).length, auto: (window.__drops || []).map((d) => d.auto), boilT: +__game.boilT.toFixed(3) }));
    await q.evaluate(() => __frames(5));
    const opened = await look();
    await q.keyboard.press("2"); await q.evaluate(() => __frames(2));
    const picked = await look();
    await q.keyboard.press("Enter"); await q.evaluate(() => __frames(2));
    const started = Object.assign(await look(), { kept: await q.evaluate(() => localStorage.getItem("jamjar_mode")) });
    check("jam-jar: the page opens on the paces menu with no jar in play; 2 picks Rolling Boil without starting it, Enter starts it, and the pace is kept",
      opened.state === "menu" && opened.menu && opened.on === "simmer" && picked.state === "menu" && picked.on === "boil" &&
      started.state === "play" && started.mode === "boil" && !started.menu && started.kept === "boil", { opened, picked, started });

    // a click aims, Space and ↓ drop nothing; the jar drops by itself once its second is up, where the aim is
    const box = await q.evaluate(() => { const r = document.getElementById("game").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
    await q.evaluate(() => { __game.setQueue(0, 0); __frames(30); });
    await q.mouse.click(box.x + box.w * (400 / 540), box.y + 200);
    await q.keyboard.press("Space"); await q.keyboard.press("ArrowDown");
    const half = await look();
    await q.evaluate(() => __frames(27));
    const early = await look();
    await q.evaluate(() => __frames(5));
    const first = Object.assign(await look(), { x: await q.evaluate(() => window.__drops && window.__drops[0] && window.__drops[0].x) });
    await q.evaluate(() => __frames(60));
    const second = await look();
    check("jam-jar, Rolling Boil: a click only aims and Space and ↓ drop nothing; the fruit drops by itself when its second is up (not 59 frames in, by 64), where the click aimed, and the next a second later",
      half.drops === 0 && Math.abs(half.boilT - (1 - 32 / 60)) < 0.01 && early.drops === 0 && first.drops === 1 && first.auto[0] === true && Math.abs(first.x - 400) <= 2 && second.drops === 2,
      { half, early, first, second });

    // paused: no drop, the second held; resumed, it carries on
    await q.keyboard.press("p");
    const pausedAt = await look();
    await q.evaluate(() => __frames(150));
    const under = await look();
    await q.keyboard.press("p"); await q.evaluate(() => __frames(2));
    const resumed = await look();
    await q.evaluate(() => __frames(61));
    const after = await look();
    check("jam-jar, Rolling Boil: under the pause card nothing drops and the second holds; resumed, the drops carry on",
      under.drops === pausedAt.drops && under.boilT === pausedAt.boilT && after.drops === resumed.drops + 1, { pausedAt, under, resumed, after });

    const how = await q.evaluate(() => {
      const shown = (sel) => [...document.querySelectorAll(sel)].some((e) => e.getClientRects().length);
      return { touch: getComputedStyle(document.getElementById("game")).touchAction, boilHint: shown(".hint .boil-only"), simmerHint: shown(".hint .simmer-only") };
    });
    check("jam-jar, Rolling Boil: a finger on the jar aims instead of scrolling, and the hint says a fruit drops every second",
      how.touch === "none" && how.boilHint && !how.simmerHint, how);

    // its own best; Backspace on the result card goes back to the paces
    await q.evaluate(() => __game.overflow(25));
    await q.evaluate(() => __frames(60));
    await q.keyboard.press("Backspace"); await q.evaluate(() => __frames(2));
    const back = Object.assign(await look(), await q.evaluate(() => ({ boilBest: localStorage.getItem("jamjar_best_boil"), simmerBest: localStorage.getItem("jamjar_best"),
      menuBest: document.getElementById("menuBest").textContent, touch: getComputedStyle(document.getElementById("game")).touchAction })));
    const hub = await q.evaluate(() => fetch("../index.html").then((r) => r.text()));
    check("jam-jar, Rolling Boil: its best is its own (jamjar_best_boil, on the games page's reset list), and Backspace on the result card goes back to the paces",
      back.boilBest === "25" && back.simmerBest === null && back.state === "menu" && back.menu && /Rolling Boil 25/.test(back.menuBest) && back.touch !== "none" &&
      /"jamjar_best_boil"/.test(hub), back);

    // Slow Simmer: a click drops at once
    await q.keyboard.press("1"); await q.keyboard.press("Enter"); await q.evaluate(() => __frames(2));
    const n0 = await q.evaluate(() => (window.__drops || []).length);
    await q.mouse.click(box.x + box.w * (200 / 540), box.y + 200);
    const simmer = await q.evaluate(() => ({ mode: __game.mode, drops: window.__drops.slice(-1)[0], hint: [...document.querySelectorAll(".hint .simmer-only")].some((e) => e.getClientRects().length) }));
    check("jam-jar, Slow Simmer: 1 and Enter start it, and a click drops at once where it points",
      simmer.mode === "simmer" && (await q.evaluate(() => window.__drops.length)) === n0 + 1 && simmer.drops.auto === false && Math.abs(simmer.drops.x - 200) <= 2 && simmer.hint, simmer);
    check("jam-jar (paces): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }
  // ---- the dashed lines: the aim line's and the fill line's dashes sit on
  // patterns pinned to the jar, so they don't jump when the next fruit (and
  // so where the aim line starts) is another size; with Visual FX off they
  // hold still, with it on they drift at a steady pace, the aim line down
  // and the fill line to the right. And "FILL LINE" is written inside the
  // jar, clear of the left pane of glass (its F was under it). The strokes
  // are read off the canvas calls: a line's phase is where its pattern
  // starts, as a place on the jar.
  {
    const SEEN = () => {
      const P = CanvasRenderingContext2D.prototype, mv = P.moveTo, st = P.stroke, ft = P.fillText;
      window.__lines = {}; window.__label = null;
      P.moveTo = function (x, y) { this.__at = [x, y]; return mv.apply(this, arguments); };
      P.stroke = function () {
        if (this.canvas.id === "game" && this.__at) {
          const d = this.getLineDash().join(",");
          if (d === "4,8") window.__lines.aim = { s: this.__at[1], o: this.lineDashOffset };
          if (d === "9,7") window.__lines.fill = { s: this.__at[0], o: this.lineDashOffset };
        }
        return st.apply(this, arguments);
      };
      P.fillText = function (t, x, y) { if (this.canvas.id === "game" && t === "FILL LINE") window.__label = { x, w: this.measureText(t).width }; return ft.apply(this, arguments); };
    };
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/jam-jar/", { before: async (pg) => { await pg.addInitScript(STEPPED); await pg.addInitScript(SEEN); await lib.injectScript(pg, "games/jam-jar/game.js", [HOOK]); } });
    const got = await q.evaluate(() => {
      const ph = (l, P) => ((l.s - l.o) % P + P) % P;
      const read = () => ({ aim: ph(window.__lines.aim, 12), fill: ph(window.__lines.fill, 16) });
      __frames(2); __game.start("simmer"); __frames(2);
      const out = {};
      // Visual FX off: the same phase whatever the fruit, and still over time
      window.RM_ON = () => true;
      out.off = [];
      for (const tier of [0, 2, 4, 1, 3]) { __game.setQueue(tier, 0); __frames(2); out.off.push(read()); }
      __frames(60); out.off.push(read());
      // Visual FX on: half a second moves each pattern on by 9 px (18 a second), the aim line down, the fill line right
      window.RM_ON = () => false;
      __frames(2); const a = read(); __frames(30); const b = read();
      __game.setQueue(4, 0); __frames(30); const cc = read();
      out.on = { aim: [((b.aim - a.aim) % 12 + 12) % 12, ((cc.aim - b.aim) % 12 + 12) % 12], fill: [((b.fill - a.fill) % 16 + 16) % 16, ((cc.fill - b.fill) % 16 + 16) % 16] };
      out.label = window.__label;
      return out;
    });
    const same = (k) => got.off.every((v) => Math.abs(v[k] - got.off[0][k]) < 0.01);
    check("jam-jar: with Visual FX off the aim line's dashes and the fill line's stay put, whatever the size of the next fruit, and hold still over time",
      same("aim") && same("fill"), got.off);
    check("jam-jar: with Visual FX on the aim line's dashes drift down and the fill line's to the right, at one steady pace (9 px each half second, a change of fruit too)",
      got.on.aim.every((d) => Math.abs(d - 9) < 0.2) && got.on.fill.every((d) => Math.abs(d - 9) < 0.2), got.on);
    check("jam-jar: \"FILL LINE\" is written inside the jar, clear of the left pane of glass",
      !!got.label && got.label.x >= 58 + 3 && got.label.x + got.label.w < 482 - 60, got.label);
    check("jam-jar (dashes): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  // ---- on a short laptop screen the corner buttons cover no panel and not
  // the jar, and the fruit ladder ends with the jar, so nothing scrolls
  for (const [w, h] of [[1366, 657], [1280, 600], [1280, 720], [900, 600], [1280, 900]]) {
    const c = await lib.newContext(browser, { viewport: { width: w, height: h } });
    const q = await lib.open(c, base, "games/jam-jar/");
    await q.keyboard.press("Space"); await q.waitForTimeout(300);
    const got = await q.evaluate(() => {
      const corner = [...document.querySelectorAll(".nav-back-games, .gs-corner > *")].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect());
      const under = [...document.querySelectorAll("#game, .panel")].filter((e) => {
        const r = e.getBoundingClientRect();
        return corner.some((k) => r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top);
      }).map((e) => e.id || e.className);
      const jar = document.getElementById("game").getBoundingClientRect(), chain = document.querySelector(".chain-panel").getBoundingClientRect();
      return { under, jarW: Math.round(jar.width), chainOver: Math.round(chain.bottom - jar.bottom), scroll: document.documentElement.scrollHeight - innerHeight };
    });
    check("jam-jar, " + w + "x" + h + ": the corner buttons cover no panel and not the jar, the fruit ladder ends with the jar, and the page doesn't scroll",
      got.under.length === 0 && got.chainOver <= 0 && got.scroll <= 0, got);
    await c.close();
  }

  // ---- vs CPU. On the menu 3 and 4 pick Solo or vs CPU (kept: jamjar_foe).
  // Against the CPU its own jar stands beside yours, fed the same fruit: in
  // Rolling Boil both drop on the same second and the nth fruit is the same
  // in both; in Slow Simmer it never drops a fruit you haven't dropped yet.
  // Pausing holds both. A jar that overflows stops while the other plays on
  // and wins the moment it passes; both over, the higher score wins (the
  // same: a draw). Your first drop counts a loss until the game is decided,
  // so a game walked away from stays one; the record is per pace (on the
  // games page's reset list), and a jar against the CPU leaves the Solo
  // bests alone.
  const VS_DROPS = ["    fruits.push(makeFruit(x, DROP_Y, current));",
    "    fruits.push(makeFruit(x, DROP_Y, current));\n    (window.__vsDrops = window.__vsDrops || []).push({ cpu: inCpu, tier: fruits[fruits.length - 1].tier, t: performance.now() });"];
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/jam-jar/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/jam-jar/game.js", [HOOK, VS_DROPS]); } });
    const rec = (m) => q.evaluate((m) => JSON.parse(localStorage.getItem("jamjar_vs_" + m) || "null"), m);
    await q.evaluate(() => __frames(5));
    await q.keyboard.press("4"); await q.evaluate(() => __frames(2));
    const menu = await q.evaluate(() => ({ foe: __game.foe, kept: localStorage.getItem("jamjar_foe"), state: __game.state,
      caps: [...document.querySelectorAll("#pick-foe button b")].map((b) => b.getAttribute("data-gs-key")).join(" "),
      on: document.querySelector("#pick-foe button.on").getAttribute("data-v"), cpuJar: document.getElementById("cpu").getClientRects().length > 0 }));
    await q.keyboard.press("3"); await q.evaluate(() => __frames(2));
    const solo = await q.evaluate(() => ({ foe: __game.foe, cpuJar: document.getElementById("cpu").getClientRects().length > 0 }));
    check("jam-jar: on the menu 4 picks vs CPU (kept) and 3 Solo, without starting, each wearing its key; the CPU's jar stands beside yours only against it",
      menu.foe === "cpu" && menu.kept === "cpu" && menu.state === "menu" && menu.caps === "3 4" && menu.on === "cpu" && menu.cpuJar && solo.foe === "solo" && !solo.cpuJar, { menu, solo });

    // Rolling Boil: eight seconds, your aim moved about
    await q.keyboard.press("4"); await q.keyboard.press("2"); await q.keyboard.press("Enter"); await q.evaluate(() => __frames(2));
    const boil = await q.evaluate(() => {
      for (let i = 0; i < 8; i++) { __game.setAim(100 + i * 45); __frames(60); }
      __frames(10);
      const d = window.__vsDrops || [], you = d.filter((x) => !x.cpu), cpu = d.filter((x) => x.cpu);
      return { mode: __game.mode, state: __game.state, n: [you.length, cpu.length], you: you.map((x) => x.tier).join(""), cpu: cpu.map((x) => x.tier).join(""),
        run: you.map((x, i) => __game.fruitAt(i)).join(""), sameTick: you.every((x, i) => cpu[i] && cpu[i].t === x.t), vs: __game.vs() };
    });
    check("jam-jar vs CPU, Rolling Boil: the CPU's jar drops with yours on every second, and the nth fruit is the same in both, the one run of fruit",
      boil.mode === "boil" && boil.state === "play" && boil.n[0] === 8 && boil.n[1] === 8 && boil.you === boil.cpu && boil.you === boil.run && boil.sameTick, boil);
    // paused: neither jar drops and the CPU's aim holds
    await q.keyboard.press("p");
    const p0 = await q.evaluate(() => __game.vs());
    await q.evaluate(() => __frames(150));
    const p1 = await q.evaluate(() => __game.vs());
    await q.keyboard.press("p"); await q.evaluate(() => __frames(65));
    const p2 = await q.evaluate(() => __game.vs());
    check("jam-jar vs CPU: under the pause card neither jar drops and the CPU's aim holds still; resumed, both drop again",
      p1.you.dealt === p0.you.dealt && p1.cpu.dealt === p0.cpu.dealt && p1.cpu.aim === p0.cpu.aim && p2.you.dealt === p0.you.dealt + 1 && p2.cpu.dealt === p0.cpu.dealt + 1, { p0, p1, p2 });
    const walked = await q.evaluate(() => { __game.toMenu(); return JSON.parse(localStorage.getItem("jamjar_vs_boil") || "null"); });

    // Slow Simmer: the CPU waits for your drops, and never drops a fruit you haven't
    await q.keyboard.press("1"); await q.keyboard.press("Enter"); await q.evaluate(() => __frames(2));
    const simmer = await q.evaluate(() => {
      __frames(300);
      const idle = __game.vs();
      let ahead = 0;
      for (let i = 0; i < 3; i++) {
        __game.setAim(120 + i * 150); __game.drop();
        for (let f = 0; f < 90; f += 5) { __frames(5); const v = __game.vs(); if (v.cpu.dealt > v.you.dealt) ahead++; }
      }
      for (let f = 0; f < 480; f += 5) { __frames(5); const v = __game.vs(); if (v.cpu.dealt > v.you.dealt) ahead++; }
      return { idle, ahead, vs: __game.vs(), best: localStorage.getItem("jamjar_best"), rec: JSON.parse(localStorage.getItem("jamjar_vs_simmer") || "null") };
    });
    check("jam-jar vs CPU, Slow Simmer: the CPU drops nothing while you haven't, follows your three drops with its own three, never a fruit ahead of you",
      simmer.idle.cpu.dealt === 0 && simmer.idle.cpu.fruits === 0 && simmer.ahead === 0 && simmer.vs.you.dealt === 3 && simmer.vs.cpu.dealt === 3, simmer);
    // a merge against the CPU leaves the Solo best alone
    const merged = await q.evaluate(() => {
      __game.setQueue(0, 0); __game.setAim(470); __game.drop(); __frames(60);
      __game.setQueue(0, 0); __game.setAim(470); __game.drop(); __frames(90);
      return { score: __game.vs().you.score, best: localStorage.getItem("jamjar_best") };
    });
    check("jam-jar vs CPU: your first drop counts a loss until the game is decided (a game left for the menu stays one), and a merge leaves the Solo best alone",
      walked && walked.l === 1 && walked.w === 0 && simmer.rec && simmer.rec.l === 1 && merged.score > 0 && merged.best === null, { walked, rec: simmer.rec, merged });

    // the winner: Rolling Boil games decided by setting the jars' scores
    const card = () => q.evaluate(() => ({ state: __game.state, up: !document.getElementById("overScreen").classList.contains("hidden"),
      title: document.getElementById("overTitle").textContent, you: document.getElementById("finalScore").textContent, cpu: document.getElementById("cpuFinal").textContent,
      line: document.getElementById("overBest").textContent, cpuShown: document.getElementById("cpuFinal").getClientRects().length > 0 }));
    const fresh = () => q.evaluate(() => { __game.start("boil"); __frames(65); });
    await fresh();
    await q.evaluate(() => __game.setVs(null, { out: true, score: 80 }));
    const waiting = await q.evaluate(() => { const a = __game.vs(); __frames(120); return { state: __game.state, a, b: __game.vs() }; });
    await q.evaluate(() => __game.setVs({ score: 81 }));
    const won = Object.assign(await card(), { rec: await rec("boil") });
    await fresh();
    await q.evaluate(() => __game.setVs({ out: true, score: 100 }));
    const stopped = await q.evaluate(() => { const a = __game.vs(); __frames(180); return { state: __game.state, a, b: __game.vs() }; });
    await q.evaluate(() => __game.setVs(null, { score: 101 }));
    const lost = Object.assign(await card(), { rec: await rec("boil") });
    await fresh();
    await q.evaluate(() => __game.setVs({ out: true, score: 50 }, { out: true, score: 50 }));
    const drew = Object.assign(await card(), { rec: await rec("boil") });
    check("jam-jar vs CPU: the CPU's jar overflowed, you play on (it stays as it stopped) and win the moment you pass it, the card saying so with both scores",
      waiting.state === "play" && waiting.b.cpu.dealt === waiting.a.cpu.dealt && waiting.b.you.dealt === waiting.a.you.dealt + 2 &&
      won.state === "over" && won.up && won.title === "You win!" && won.you === "81" && won.cpu === "80" && won.cpuShown && /won\s1, lost\s1/.test(won.line), { waiting, won });
    check("jam-jar vs CPU: your jar overflowed, the CPU plays on (yours stays as it stopped) and wins the moment it passes you",
      stopped.state === "play" && stopped.b.you.dealt === stopped.a.you.dealt && stopped.b.cpu.dealt === stopped.a.cpu.dealt + 3 &&
      lost.state === "over" && lost.title === "The CPU wins" && lost.you === "100" && lost.cpu === "101", { stopped, lost });
    check("jam-jar vs CPU: both overflowed on the same score is a draw; the record (won 1, lost 2, drawn 1 here) is saved as each game ends",
      drew.title === "A draw!" && won.rec.w === 1 && won.rec.l === 1 && lost.rec.l === 2 && drew.rec.w === 1 && drew.rec.l === 2 && drew.rec.d === 1, { won: won.rec, lost: lost.rec, drew: drew.rec });
    const hub = await q.evaluate(() => fetch("../index.html").then((r) => r.text()));
    check("jam-jar: the records against the CPU are on the games page's reset list, and the opponent picked is not",
      /"jamjar_vs_simmer"/.test(hub) && /"jamjar_vs_boil"/.test(hub) && !/"jamjar_foe"/.test(hub), {});
    check("jam-jar (vs CPU): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- vs CPU, the page: on a phone your jar, the scores, Next and the
  // CPU's jar are all on the first screen (on its side too), nothing wider
  // than the screen; on a laptop nothing scrolls and the corner buttons
  // cover neither jar nor a panel
  for (const [w, h, phone] of [[320, 568, 1], [360, 560, 1], [375, 553, 1], [390, 664, 1], [667, 375, 1], [568, 320, 1], [1366, 657, 0], [1280, 600, 0], [1280, 900, 0]]) {
    const c = await lib.newContext(browser, phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h } });
    const q = await lib.open(c, base, "games/jam-jar/", { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("jamjar_foe", "cpu"); } catch (e) {} }) });
    await q.evaluate(() => __game.start("simmer")); await q.waitForTimeout(300);
    const got = await q.evaluate(({ w, phone }) => {
      const corner = [...document.querySelectorAll(".nav-back-games, .gs-corner > *")].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect());
      const els = [...document.querySelectorAll("#game, #cpu, .panel")].filter((e) => e.getClientRects().length);
      const under = els.filter((e) => { const r = e.getBoundingClientRect(); return corner.some((k) => r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top); }).map((e) => e.id || e.className);
      const first = ["#game", "#cpu", ".score-panel", ".next-panel"].filter((s) => { const r = document.querySelector(s).getBoundingClientRect(); return !(r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 0.5); });
      const jar = document.getElementById("game").getBoundingClientRect(), cpu = document.getElementById("cpu").getBoundingClientRect();
      return { under, offFirst: first, wide: Math.max(document.documentElement.scrollWidth, innerWidth) - w, scroll: phone ? null : document.documentElement.scrollHeight - innerHeight,
        jarW: Math.round(jar.width), cpuW: Math.round(cpu.width), cpuScore: document.getElementById("cpuScore").getClientRects().length > 0 };
    }, { w, phone });
    check("jam-jar vs CPU, " + w + "x" + h + ": your jar, the scores (yours and the CPU's), Next and the CPU's jar on the first screen, nothing under the corner buttons" +
      (phone ? ", nothing wider than the screen" : ", nothing to scroll"),
      got.under.length === 0 && got.offFirst.length === 0 && got.wide <= 0 && (phone || got.scroll <= 0) && got.cpuW > 0 && got.cpuW < got.jarW && got.cpuScore, got);
    // your jar overflowed (on five figures): Speed up sits over it, on the screen, one line, nothing wider or scrolling for it
    await q.evaluate(() => __game.setVs({ out: true, score: 99999 })); await q.waitForTimeout(200);
    const fast = await q.evaluate(({ w, phone }) => {
      const b = document.getElementById("fastBtn").getBoundingClientRect(), jar = document.getElementById("game").getBoundingClientRect();
      return { shown: b.width > 0, inJar: b.left >= jar.left && b.right <= jar.right && b.top >= jar.top && b.bottom <= jar.bottom, onScreen: b.top >= 0 && b.bottom <= innerHeight,
        oneLine: b.height < 60, wide: Math.max(document.documentElement.scrollWidth, innerWidth) - w, scroll: phone ? null : document.documentElement.scrollHeight - innerHeight };
    }, { w, phone });
    check("jam-jar vs CPU, " + w + "x" + h + ": once your jar has overflowed, Speed up sits over it on the first screen, on one line, and nothing gets wider" + (phone ? "" : " or scrolls"),
      fast.shown && fast.inJar && fast.onScreen && fast.oneLine && fast.wide <= 0 && (phone || fast.scroll <= 0), fast);
    check("jam-jar vs CPU, " + w + "x" + h + ": no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- vs CPU, Speed up: once your jar has overflowed and the CPU's plays
  // on, a button over your jar (F) runs the CPU's jar at 4 times the speed,
  // and F again puts it back. It isn't there while both jars play or once
  // the game is decided, and under the pause card F does nothing and nothing
  // moves. Sped up it is the same play: a game played out with the same
  // random numbers ends the same, in a quarter of the frames.
  {
    const SEEDED = () => { let s = 7 * 2654435761 >>> 0; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
    // (frames of 1/64 s, a step the clock holds exactly: 1/60 s ones come out a
    // hair apart from frame to frame, enough to move a second's tick a frame)
    const EXACT = () => {
      let t = 1000, q = [];
      performance.now = () => t;
      window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
      window.__frames = (n) => { for (let i = 0; i < n; i++) { t += 1000 / 64; const run = q; q = []; run.forEach((cb) => cb(t)); } };
    };
    const c = await lib.newContext(browser);
    const open = (seeded) => lib.open(c, base, "games/jam-jar/", { before: async (pg) => {
      await pg.addInitScript(seeded ? EXACT : STEPPED);
      if (seeded) await pg.addInitScript(SEEDED);
      await pg.addInitScript(() => { try { localStorage.setItem("jamjar_foe", "cpu"); } catch (e) {} });
      await lib.injectScript(pg, "games/jam-jar/game.js", [HOOK]);
    } });
    const btn = (q) => q.evaluate(() => { const b = document.getElementById("fastBtn"); return { shown: b.getClientRects().length > 0, key: b.getAttribute("data-gs-key"), text: b.textContent, fast: __game.fast }; });

    // the toggle
    let q = await open(false);
    await q.evaluate(() => { __frames(5); __game.start("boil"); __frames(65); });
    const before = await btn(q);
    await q.evaluate(() => { __game.setVs({ out: true, score: 1e6 }); __frames(1); });   // (the button comes with the next frame)
    const per = () => q.evaluate(() => { const a = __game.vs().cpu.dealt; __frames(120); return __game.vs().cpu.dealt - a; });
    const shown = await btn(q);
    const normal = await per();
    await q.keyboard.press("f");
    const on = await btn(q);
    const sped = await per();
    await q.keyboard.press("p");
    const p0 = await q.evaluate(() => __game.vs().cpu.dealt);
    await q.keyboard.press("f");
    const underPause = Object.assign(await btn(q), { moved: await q.evaluate(() => { __frames(120); return __game.vs().cpu.dealt; }) - p0 });
    await q.keyboard.press("p"); await q.evaluate(() => __frames(2));
    await q.keyboard.press("f");
    const off = await btn(q);
    const back = await per();
    check("jam-jar vs CPU: Speed up shows only once your jar has overflowed (wearing F); F runs the CPU's jar 4 times as fast (8 drops in 2 s, not 2) and F again puts it back; under the pause card F does nothing and nothing moves",
      !before.shown && shown.shown && shown.key === "F" && !shown.fast && normal === 2 && on.fast && on.text === "Normal speed" && sped === 8 &&
      underPause.fast && underPause.moved === 0 && !off.fast && /Speed up/.test(off.text) && back === 2, { before, shown, normal, on, sped, underPause, off, back });
    check("jam-jar (speed up): no page errors", q.errs.length === 0, q.errs);
    await q.close();

    // the same game, played out at normal speed and sped up
    const outcome = async (speedUp) => {
      const g = await open(true);
      await g.evaluate(() => { __frames(5); __game.start("boil"); __frames(70); __game.setVs({ out: true, score: 300 }); __frames(1); });
      if (speedUp) await g.keyboard.press("f");
      const r = await g.evaluate(() => {
        let f = 0;
        while (__game.state === "play" && f < 20000) { __frames(1); f++; }
        const v = __game.vs();
        return { frames: f, state: __game.state, title: document.getElementById("overTitle").textContent, cpu: v.cpu.score, dealt: v.cpu.dealt,
          button: document.getElementById("fastBtn").getClientRects().length > 0, fast: __game.fast };
      });
      r.errs = g.errs.length;
      await g.close();
      return r;
    };
    const slow = await outcome(false), quick = await outcome(true);
    check("jam-jar vs CPU: sped up, the CPU's jar plays the same game (the same random numbers: the same drops, score and result) in a quarter of the frames, and the button goes with the game",
      slow.state === "over" && quick.state === "over" && quick.title === slow.title && quick.cpu === slow.cpu && quick.dealt === slow.dealt &&
      Math.abs(quick.frames * 4 - slow.frames) <= 4 && !quick.button && !quick.fast && slow.errs === 0 && quick.errs === 0, { slow, quick });
    await c.close();
  }

  // ---- a merge's points: "+N" (N what the merge added to the score) where
  // the pair met, on for 0.8 s of the jar's own clock and then gone. With
  // Visual FX on it rises as it fades; off, it holds still, as long on the
  // screen. The pause card holds it. Against the CPU its jar shows its own
  // on a laptop, where they're big enough to read, and not on a phone.
  const TEXTS = () => {
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
      if (/^\+\d+$/.test(t)) (window.__pops = window.__pops || []).push({ c: this.canvas.id, t, x: Math.round(x), y: Math.round(y * 10) / 10, a: Math.round(this.globalAlpha * 100) / 100, f: window.__f || 0 });
      return ft.apply(this, arguments);
    };
  };
  const MERGES = ["    var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;\n",
    "    var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;\n    (window.__merges = window.__merges || []).push({ x: Math.round(mx), y: Math.round(my), cpu: inCpu, before: score, f: window.__f || 0 });\n"];
  {
    const c = await lib.newContext(browser);
    const got = {};
    for (const off of [true, false]) {
      const q = await lib.open(c, base, "games/jam-jar/", { before: async (pg) => { await pg.addInitScript(STEPPED); await pg.addInitScript(TEXTS); await lib.injectScript(pg, "games/jam-jar/game.js", [HOOK, MERGES]); } });
      got[off ? "off" : "on"] = await q.evaluate((off) => {
        __frames(2); window.RM_ON = () => off; __game.start("simmer");
        __game.setQueue(0, 0); __game.setAim(270); __game.drop();
        __frames(40);
        __game.setQueue(0, 0); __game.setAim(270); __game.drop();
        let i = 0;
        for (; i < 200 && !(window.__merges || []).length; i++) { window.__f = i; __frames(1); }
        const end = i + 75;
        for (; i < end; i++) { window.__f = i; __frames(1); }
        const m = window.__merges[0], pops = (window.__pops || []).filter((p) => p.c === "game" && p.f >= m.f);
        return { m, score: __game.score, n: pops.length, text: pops[0] && pops[0].t, first: pops[0], last: pops[pops.length - 1],
          ys: pops.map((p) => p.y), frames: pops.length ? pops[pops.length - 1].f - pops[0].f + 1 : 0, after: (window.__pops || []).filter((p) => p.f > m.f + 60).length };
      }, off);
      check("jam-jar (points, FX " + (off ? "off" : "on") + "): no page errors", q.errs.length === 0, q.errs);
      await q.close();
    }
    const at = (g) => g.first && Math.abs(g.first.x - g.m.x) <= 2 && Math.abs(g.first.y - g.m.y) <= 4;
    check("jam-jar: a merge shows \"+N\" where the pair met, N being what it added to the score (+3 for two blueberries)",
      ["off", "on"].every((k) => got[k].text === "+" + (got[k].score - got[k].m.before) && got[k].text === "+3" && at(got[k])), got);
    check("jam-jar: the \"+N\" fades out and is gone within a second (on about 0.8 s), as long with Visual FX off as on",
      ["off", "on"].every((k) => got[k].frames >= 44 && got[k].frames <= 52 && got[k].last.a < 0.2 && got[k].after === 0) && Math.abs(got.off.frames - got.on.frames) <= 1,
      { off: [got.off.frames, got.off.last, got.off.after], on: [got.on.frames, got.on.last, got.on.after] });
    check("jam-jar: with Visual FX on the \"+N\" rises as it fades; off, it holds still in the same place",
      got.off.ys.every((y) => y === got.off.ys[0]) && got.on.ys.every((y, i) => i === 0 || y <= got.on.ys[i - 1]) && got.on.ys[0] - got.on.ys[got.on.ys.length - 1] > 30,
      { off: got.off.ys.slice(0, 3).concat(got.off.ys.slice(-2)), on: got.on.ys.slice(0, 3).concat(got.on.ys.slice(-2)) });

    // under the pause card it holds; resumed, it runs out
    const q = await lib.open(c, base, "games/jam-jar/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/jam-jar/game.js", [HOOK]); } });
    await q.evaluate(() => {
      __frames(2); __game.start("simmer");
      __game.setQueue(0, 0); __game.setAim(270); __game.drop(); __frames(40);
      __game.setQueue(0, 0); __game.setAim(270); __game.drop();
      for (let i = 0; i < 200 && !__game.pops.length; i++) __frames(1);
      __frames(10);
    });
    await q.keyboard.press("p");
    const held = await q.evaluate(() => { const a = __game.pops.map((p) => p.t); __frames(120); return { a, b: __game.pops.map((p) => p.t) }; });
    await q.keyboard.press("p");
    const ran = await q.evaluate(() => { __frames(60); return __game.pops.length; });
    check("jam-jar: under the pause card the \"+N\" holds where it is in its time; resumed, it runs out",
      held.a.length === 1 && held.b.length === 1 && held.a[0] === held.b[0] && ran === 0, { held, ran });
    check("jam-jar (points, pause): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }
  // the CPU's jar: its own "+N" on a laptop, none on a phone (too small to read)
  for (const [label, opts] of [["laptop", { viewport: { width: 1366, height: 657 } }], ["phone", { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/jam-jar/", { before: async (pg) => {
      await pg.addInitScript(STEPPED); await pg.addInitScript(TEXTS);
      await pg.addInitScript(() => { try { localStorage.setItem("jamjar_foe", "cpu"); } catch (e) {} });
      await lib.injectScript(pg, "games/jam-jar/game.js", [HOOK, MERGES]);
    } });
    const r = await q.evaluate(() => {
      __frames(2); __game.start("boil");
      for (let i = 0; i < 60 * 25 && !(window.__merges || []).some((m) => m.cpu); i++) { window.__f = i; __game.setAim(80 + (i % 380)); __frames(1); }
      __frames(5);
      const m = (window.__merges || []).filter((x) => x.cpu), p = (window.__pops || []).filter((x) => x.c === "cpu");
      return { cpuMerges: m.length, cpuPops: p.length, first: p[0], merge: m[0], state: __game.state };
    });
    check("jam-jar vs CPU, " + label + ": the CPU's jar " + (label === "laptop" ? "shows its own \"+N\" where its pair met" : "shows no \"+N\" at its size (too small to read)"),
      r.state === "play" && r.cpuMerges > 0 && (label === "laptop" ? r.cpuPops > 0 && Math.abs(r.first.y - r.merge.y) <= 46 : r.cpuPops === 0), r);
    check("jam-jar vs CPU, " + label + " (points): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- a held arrow moves the aim from the press on, steadily, with no wait
  // for the keyboard's repeat (a held key here sends one keydown, as the
  // first half second of a real one does); let go, it stops; paused, it holds
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/jam-jar/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/jam-jar/game.js", [HOOK]); } });
    await q.evaluate(() => { __game.start("simmer"); __frames(3); __game.setAim(150); });
    await q.keyboard.down("ArrowRight");
    const a = await q.evaluate(() => { const r = [__game.aim()]; for (let i = 0; i < 3; i++) { __frames(5); r.push(__game.aim()); } return r; });
    await q.keyboard.up("ArrowRight");
    const after = await q.evaluate(() => { const x0 = __game.aim(); __frames(10); return [x0, __game.aim()]; });
    await q.keyboard.down("ArrowLeft");
    const left = await q.evaluate(() => { const x0 = __game.aim(); __frames(10); return [x0, __game.aim()]; });
    await q.keyboard.press("p");
    const paused = await q.evaluate(() => { const x0 = __game.aim(); __frames(10); return [x0, __game.aim(), __game.paused()]; });
    await q.keyboard.up("ArrowLeft");
    const steps = a.slice(1).map((x, i) => +(x - a[i]).toFixed(2));
    check("jam-jar: a held arrow moves the aim from the press on, the same distance every few frames (no wait for the keyboard's repeat); let go, it stops",
      a[0] === 172 && steps.every((d) => Math.abs(d - 35) < 0.5) && after[1] === after[0] && left[1] < left[0] - 60, { a, steps, after, left });
    check("jam-jar: paused, a held arrow doesn't move the aim", paused[2] === true && paused[1] === paused[0], paused);
    check("jam-jar (held arrows): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }
};
