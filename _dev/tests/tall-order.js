// Tall Order: a window resized mid-run (a rotated phone, a narrowed window)
// keeps the tower on screen and in the slider's reach; Enter on a focused
// mode button only picks the mode, and a mode clicked with the mouse is the
// one Enter then starts; on a touch-only phone the keycaps hide and the menu
// says tap where it names Space.
const HOOK = ["  // test hooks — the Playwright harness drives runs through these\n", `  window.__to = {
    slider: function () { return slider && { lo: slider.lo, hi: slider.hi, w: slider.w, x: slider.x }; },
    top: function () { var t = tiers[tiers.length - 1]; return { x: t.x, w: t.w }; },
    width: function () { return W; }
  };
  // test hooks — the Playwright harness drives runs through these\n`];

module.exports = async ({ browser, base, check, lib }) => {
  const open = (ctx) => lib.open(ctx, base, "games/tall-order/", { before: (pg) => lib.injectScript(pg, "games/tall-order/game.js", [HOOK]) });
  const done = async (p, what) => { check("tall-order " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- narrowing the window mid-run: the tower comes back on screen, and the
  // sliding tier can still be dropped onto it (it used to slide well short)
  let ctx = await lib.newContext(browser, { viewport: { width: 1600, height: 900 } });
  let p = await open(ctx);
  await p.evaluate(() => TallOrder.start("bakery"));
  for (let i = 0; i < 3; i++) {
    await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 4000 });
    await p.evaluate(() => TallOrder.placeAndDrop(0));
  }
  await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 4000 });
  await p.setViewportSize({ width: 700, height: 900 }); await p.waitForTimeout(150);
  const reach = (s) => s.top.x >= 0 && s.top.x + s.top.w <= s.W && s.sl.lo >= 0 && s.sl.hi + s.sl.w <= s.W &&
    s.sl.hi + s.sl.w > s.top.x + 4 && s.sl.lo < s.top.x + s.top.w - 4;
  const snap = () => p.evaluate(() => ({ top: __to.top(), sl: __to.slider(), W: __to.width() }));
  const now = await snap();
  await p.evaluate(() => TallOrder.placeAndDrop(0));
  await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 4000 });
  const next = await snap();
  check("tall-order: after the window narrows mid-run, the tower is on screen and the sliding tier can reach it",
    now.W === 700 && reach(now) && reach(next) && (await p.evaluate(() => TallOrder.state())) === "play", { now, next });
  await done(p, "resize");
  await ctx.close();

  ctx = await lib.newContext(browser);
  // ---- Enter on a focused mode button picks that mode and starts nothing
  p = await open(ctx);
  await p.keyboard.press("1");
  await p.evaluate(() => document.querySelector('#pick-mode button[data-v="rush"]').focus());
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await p.evaluate(() => ({ state: TallOrder.state(), mode: localStorage.getItem("tallorder_mode"), rush: document.querySelector('#pick-mode button[data-v="rush"]').classList.contains("on") }));
  check("tall-order: Enter on the focused Rush order button picks it, without starting a Bakery run", menu.state === "menu" && menu.mode === "rush" && menu.rush, menu);
  await done(p, "menu Enter");

  // ---- a mode clicked with the mouse, then another picked by key: Enter
  // starts the one the menu shows (the clicked button used to take over)
  p = await open(ctx);
  await p.click('#pick-mode button[data-v="rush"]');
  await p.keyboard.press("1");
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const run = await p.evaluate(() => ({ state: TallOrder.state(), mode: localStorage.getItem("tallorder_mode") }));
  check("tall-order: after clicking Rush order then pressing 1, Enter starts a Bakery run and it stays Bakery", run.state === "play" && run.mode === "bakery", run);
  await done(p, "mouse then Enter");

  // ---- the record: a run that drops nothing onto the base it was given isn't
  // one (missing the first drop used to be "a new bakery record!" at 1 tier);
  // one that places a tier is, and an old best still shows
  const serve = async (placed, seedBest) => {
    const pg = await open(ctx);
    if (seedBest) await pg.evaluate((b) => localStorage.setItem("tallorder_best_bakery", b), seedBest);
    await pg.evaluate(() => TallOrder.start("bakery"));
    for (let i = 0; i <= placed; i++) {
      await pg.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 4000 });
      await pg.evaluate((miss) => TallOrder.placeAndDrop(miss ? 5000 : 0), i === placed);
    }
    await pg.waitForFunction(() => TallOrder.state() === "over", null, { timeout: 10000 });
    const r = await pg.evaluate(() => ({ stats: document.getElementById("over-stats").textContent, best: localStorage.getItem("tallorder_best_bakery") }));
    await done(pg, "record " + placed + (seedBest ? " vs " + seedBest : ""));
    return r;
  };
  const none = await serve(0), one = await serve(1), old = await serve(0, "5");
  check("tall-order: missing the first drop isn't a record: nothing is saved and the card doesn't call it one", !/new bakery record/.test(none.stats) && none.best === null, none);
  check("tall-order: a run that places a tier is a first record, saved (guard)", /new bakery record/.test(one.stats) && one.best === "2", one);
  check("tall-order: after missing the first drop, the card shows the best already held (guard)", /best: 5 tiers/.test(old.stats) && old.best === "5", old);
  await ctx.close();

  // ---- the menu's "how" names the key on a desktop, and says tap on a phone,
  // where every keycap of the game's own (the pause card's aside) is hidden
  const how = async (dev) => {
    const c = await lib.newContext(browser, dev);
    const pg = await open(c);
    const r = await pg.evaluate(() => ({
      how: document.querySelector("#menu .how").innerText,
      caps: [...document.querySelectorAll("kbd")].filter((k) => !k.closest(".gs-pause")).map((k) => { const s = k.closest(".gs-keys"); return k.textContent + ":" + (s ? getComputedStyle(s).display : "unwrapped"); })
    }));
    await done(pg, "how to play");
    await c.close();
    return r;
  };
  const desk = await how({}), phone = await how(require("@playwright/test").devices["Pixel 7"]);
  check("tall-order: on a desktop the menu says to tap or press Space to drop a tier", /press Space to drop/.test(desk.how), desk.how);
  check("tall-order: on a touch-only phone the menu says to tap to drop a tier, and every keycap is hidden",
    /tap to drop/.test(phone.how) && !/Space/.test(phone.how) && phone.caps.length > 0 && phone.caps.every((c) => /:none$/.test(c)), phone);
};
