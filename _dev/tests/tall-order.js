// Tall Order: a window resized mid-run (a rotated phone, a narrowed window)
// keeps the tower on screen and in the slider's reach; Enter on a focused
// mode button only picks the mode, and a mode clicked with the mouse is the
// one Enter then starts; the buttons' keycaps hide on a touch-only phone.
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
  await ctx.close();

  // ---- the keycaps on the menu and end-card buttons hide on a touch-only phone
  ctx = await lib.newContext(browser, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  p = await open(ctx);
  const caps = await p.evaluate(() => [...document.querySelectorAll("button kbd")].map((k) => { const s = k.closest(".gs-keys"); return k.textContent + ":" + (s ? getComputedStyle(s).display : "unwrapped"); }));
  check("tall-order: on a touch-only phone the buttons' keycaps are hidden", caps.length > 0 && caps.every((c) => /:none$/.test(c)), caps);
  await done(p, "touch keycaps");
  await ctx.close();
};
