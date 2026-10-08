// Abyss: a piece slid off a ledge gets a fresh lock delay where it lands; a
// held soft drop lets go when the tab loses focus; the Sprint clock ticks
// between locks; a 0 is never "a new record"; the buttons' keycaps hide on a
// touch-only phone. Frames are stepped by the test (see STEPPED), so timing
// doesn't depend on how busy the machine is.
const HOOK = ["start: startRun,", "start: startRun, gameOver: gameOver,"];

// requestAnimationFrame and performance.now on a clock the test advances:
// __frames(n, hz) runs n frames of 1/hz seconds each
const STEPPED = () => {
  let t = 1000, q = [];
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__frames = (n, hz) => {
    for (let i = 0; i < n; i++) {
      t += 1000 / (hz || 60);
      const run = q; q = [];
      run.forEach((cb) => { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } });
    }
  };
};

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  let ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });

  // An O sits half on a one-wide pillar for 450 ms of its 500 ms lock delay,
  // then slides off it in one step and falls to the floor
  const ledge = await p.evaluate(() => {
    __frames(3);
    Abyss.start("descent"); __frames(2);
    for (let y = 8; y < 20; y++) Abyss.test.fill(y, [4]);
    Abyss.test.setGrav(16);
    Abyss.test.setPiece("O"); Abyss.move(-1);              // columns 3-4
    for (let n = 0; n < 200 && Abyss.piece().y < 8; n++) __frames(1);
    __frames(27);
    Abyss.move(-1);                                         // columns 2-3: nothing under it now
    let landed = null, f = 0;
    for (; f < 120; f++) {
      __frames(1);
      const pc = Abyss.piece();
      if (pc.t !== "O" || pc.y < 8) break;                  // it locked (a new piece is up top)
      if (landed === null && pc.y === 20) landed = f;
    }
    Abyss.test.setGrav(0);
    return { landed, locked: f, ms: landed === null ? null : Math.round((f - landed) * 1000 / 60) };
  });
  check("abyss: a piece slid off a ledge gets the whole lock delay where it lands", ledge.ms !== null && ledge.ms >= 480, ledge);

  // Hold ↓, the tab loses focus (it pauses; the key is let go elsewhere, so
  // no keyup comes), resume: nothing should keep soft-dropping
  await p.evaluate(() => { Abyss.start("descent"); Abyss.test.setGrav(100000); __frames(2); });
  await p.keyboard.down("ArrowDown");
  await p.evaluate(() => { __frames(2); window.dispatchEvent(new Event("blur")); });
  const blurred = await p.evaluate(() => !document.querySelector(".gs-pause").hidden);
  const soft = await p.evaluate(() => {
    document.querySelector(".gs-pause button").click();
    const a = { score: Abyss.score(), y: Abyss.piece().y };
    __frames(60);
    return { a, b: { score: Abyss.score(), y: Abyss.piece().y } };
  });
  await p.keyboard.up("ArrowDown");
  check("abyss: a held soft drop lets go when the tab loses focus", blurred && soft.a.score === soft.b.score && soft.a.y === soft.b.y, { blurred, soft });
  await p.evaluate(() => Abyss.test.setGrav(0));

  // Sprint: a second of play with no lock moves the clock on
  const clock = await p.evaluate(() => {
    Abyss.start("sprint"); Abyss.test.setGrav(100000); __frames(2);
    const a = document.getElementById("hud-depth").textContent;
    __frames(60);
    const b = document.getElementById("hud-depth").textContent;
    Abyss.test.setGrav(0);
    return { a, b };
  });
  check("abyss: the Sprint clock ticks between locks", clock.b !== clock.a && /^0:01\.\d\d$/.test(clock.b), clock);

  // A first-ever Descent that ends at 0 (fresh storage: no best yet)
  const zero = await p.evaluate(() => { localStorage.removeItem("abyss_best_descent"); Abyss.start("descent"); __frames(2); Abyss.gameOver(); return { score: Abyss.score(), stats: document.getElementById("over-stats").textContent }; });
  check("abyss: a run that ends at 0 isn't a new record, even the first", zero.score === 0 && !/new record/.test(zero.stats), zero);
  check("abyss: no page errors", p.errs.length === 0, p.errs);
  await ctx.close();

  // Keycaps inside buttons (Dive, Dive again, the mode keys) show with a
  // keyboard and hide on a touch-only phone
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    ctx = await lib.newContext(browser, opts);
    const q = await lib.open(ctx, base, "games/abyss/", { before: (pg) => lib.injectScript(pg, "games/abyss/game.js", [HOOK]) });
    const shown = () => q.evaluate(() => [...document.querySelectorAll(".panel button kbd")].filter((k) => k.getClientRects().length).map((k) => k.closest("button").id || k.closest("button").dataset.v));
    const menu = await shown();
    // the menu's key legend (the touch pad's buttons carry their own icons)
    const legend = await q.evaluate(() => document.querySelector("#menu .keys").getClientRects().length > 0);
    await q.evaluate(() => { Abyss.start("descent"); Abyss.gameOver(); });
    const over = await shown();
    if (label === "phone") check("abyss: on a touch-only phone the buttons' keycaps are hidden", menu.length === 0 && over.length === 0, { menu, over });
    else check("abyss: with a keyboard the buttons' keycaps show", menu.length === 4 && over.length === 2, { menu, over });
    check("abyss: the menu's key legend " + (label === "phone" ? "is hidden on a touch-only phone" : "shows with a keyboard"), legend === (label !== "phone"), legend);
    await ctx.close();
  }
};
