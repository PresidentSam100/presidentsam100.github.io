// Tall Order: a window resized mid-run (a rotated phone, a narrowed window)
// keeps the tower on screen and in the slider's reach; Enter on a focused
// mode button only picks the mode, and a mode clicked with the mouse is the
// one Enter then starts; on a touch-only phone the keycaps hide and the menu
// says tap where it names Space. The sliding tier's shadow lies on the cake
// under it, not across the tier; and everything that falls off is kept, and
// lies heaped on the kitchen floor in the pull-back that ends the run.
const HOOK = ["  // test hooks: the Playwright harness drives runs through these\n", `  window.__to = {
    slider: function () { return slider && { lo: slider.lo, hi: slider.hi, w: slider.w, x: slider.x }; },
    top: function () { var t = tiers[tiers.length - 1]; return { x: t.x, w: t.w }; },
    width: function () { return W; },
    geo: function () {
      return { H: H, SH: SH, W: W, Hh: Hh, floor: A.FLOOR, cam: cam, top: towerTopY(), zoomP: zoomP, n: tiers.length,
        slider: slider && { x: slider.x, y: slider.y, w: slider.w, mode: slider.mode },
        base: tiers.length ? { x: tiers[0].x, w: tiers[0].w } : null,
        fallen: fallen.map(function (f) { return { x: f.x, w: f.w, vx: f.vx, vy: f.vy, y0: f.y0 }; }),
        pile: pile.map(function (q) { return { x: q.x, y: q.y, w: q.w, rot: q.rot, down: q.down }; }),
        debris: debris.length };
    },
    // one frame of the game's own, taken by hand, and the picture it draws
    frame: function (dt) { update(dt); draw(); },
    pixels: function () { return g.getImageData(0, 0, cv.width, cv.height).data; }
  };
  // test hooks: the Playwright harness drives runs through these\n`];

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

  // ---- the end card, centred: the perfect drops on a line of their own,
  // bigger the more there were, and the best as a badge (they shared one
  // small grey line, left-aligned)
  {
    const card = async (perfect) => {
      const pg = await open(ctx);
      await pg.evaluate(() => localStorage.setItem("tallorder_best_bakery", "9"));
      await pg.evaluate(() => TallOrder.start("bakery"));
      for (let i = 0; i < perfect + 1; i++) {
        await pg.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 5000 });
        await pg.evaluate((miss) => TallOrder.placeAndDrop(miss ? 5000 : 0), i === perfect);
      }
      await pg.waitForFunction(() => TallOrder.state() === "over", null, { timeout: 10000 });
      const r = await pg.evaluate(() => {
        const c = document.querySelector("#over .card").getBoundingClientRect(), mid = (e) => { if (!e) return 99; const r = e.getBoundingClientRect(); return Math.round((r.left + r.right) / 2 - (c.left + c.right) / 2); };
        const perf = document.querySelector("#over-stats .perf"), best = document.querySelector("#over-stats .best");
        return { off: ["#over-title", "#over-msg", "#over-stats .perf", "#over-stats .best", "#over .row"].map((s) => mid(document.querySelector(s))),
          perf: perf && perf.textContent, size: perf && parseFloat(getComputedStyle(perf).fontSize), best: best && best.textContent,
          badge: best && getComputedStyle(best).borderTopStyle !== "none" && getComputedStyle(best).backgroundColor !== "rgba(0, 0, 0, 0)" };
      });
      await done(pg, "end card " + perfect);
      return r;
    };
    const none = await card(0), many = await card(4);
    check("tall-order: the end card is centred, the perfect drops on a line of their own and louder the more there were, the best as a badge",
      [none, many].every((r) => r.off.every((d) => Math.abs(d) <= 2) && r.badge && r.best === "best: 9 tiers") &&
        none.perf === "no perfect drops" && /4 perfect drops/.test(many.perf) && many.size > none.size + 2, { none, many });
  }
  await ctx.close();

  // ---- the sliding tier's shadow: on the top of the tower under it (a tier's
  // height lower than it was painted, which was across the sliding tier itself)
  ctx = await lib.newContext(browser);
  p = await open(ctx);
  await p.evaluate(() => {
    // every shadow drawn, with where things were as it was drawn
    const el = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function (x, y) {
      if (/^rgba\(90, ?40, ?56, ?0\.14\)$/.test(String(this.fillStyle))) window.__shadow = { y: y, geo: __to.geo() };
      return el.apply(this, arguments);
    };
    TallOrder.start("bakery");
  });
  await p.waitForFunction(() => window.__shadow && window.__shadow.geo.slider && window.__shadow.geo.slider.mode === "slide", null, { timeout: 10000, polling: "raf" });
  const sh = await p.evaluate(() => { const s = window.__shadow, g = s.geo; return { y: Math.round(s.y), rest: Math.round(g.top - g.cam), sliderBottom: Math.round(g.slider.y - g.cam), H: g.H, SH: g.SH }; });
  check("tall-order: the sliding tier's shadow lies on the top of the tower, under the tier (not across it)",
    sh.y >= sh.rest - 1 && sh.y <= sh.rest + (sh.H - sh.SH) + 1 && sh.y > sh.sliderBottom + 12, sh);

  // ---- what falls off is kept: three offcuts (two to the right, one to the
  // left) and the tier that missed. In the pull-back they lie on the floor
  // under the counter, each on the side it fell to, all of it inside the
  // picture; the second right-hand one, coming down on the first, slides off
  // it outward and lies beside it (it used to stay perched on top).
  const drops = [26, 22, -24];
  for (const off of drops) {
    await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 5000 });
    await p.evaluate((o) => TallOrder.placeAndDrop(o), off);
  }
  await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 5000 });
  const kept = await p.evaluate(() => TallOrder.fallen && TallOrder.fallen());
  await p.evaluate(() => TallOrder.placeAndDrop(TallOrder.topWidth() + 14));     // a clean miss, just past the right edge
  await p.waitForFunction(() => TallOrder.state() === "over", null, { timeout: 15000 });
  const heap = await p.evaluate(() => {
    const g = __to.geo(), cx = g.base.x + g.base.w / 2;
    // the pull-back's own arithmetic: how far out it pulls, and where the stand's plate ends up
    const towerH = g.n * g.H + 70, below = g.floor + 62, fit = Math.min(1, (g.Hh * 0.9) / (towerH + below)), y0 = g.Hh * 0.96 - below * fit;
    const at = (q) => ({ x: g.W / 2 + (q.x + q.w / 2 - cx) * fit, y: y0 + q.y * fit });
    const scr = g.pile.map(at);
    return { fallen: g.fallen.length, pile: g.pile.length, zoomP: g.zoomP,
      // (the three offcuts: each lies on the side it was thrown to)
      sides: g.pile.slice(0, 3).map((q, i) => Math.sign(q.x + q.w / 2 - cx) === Math.sign(g.fallen[i].vx)),
      // (the first to fall lies on the floor itself; nothing lies under the floor)
      onFloor: g.pile[0].y > g.floor && g.pile.every((q) => q.y <= g.floor + 34 && q.y > g.floor - 200),
      // the two right-hand offcuts came down together: the second lies further out, beside the first, not up on it
      beside: g.pile[1].x + g.pile[1].w / 2 > g.pile[0].x + g.pile[0].w / 2 + 4 && g.pile[1].y >= g.pile[0].y - 3,
      inView: scr.every((s) => s.x > 0 && s.x < g.W && s.y > 0 && s.y < g.Hh), floorIn: y0 + g.floor * fit < g.Hh - 4, scr: scr.map((s) => [Math.round(s.x), Math.round(s.y)]) };
  });
  check("tall-order: everything that falls off is kept (three offcuts, then the tier that missed)", kept === 3 && heap.fallen === 4 && heap.pile === 4, { kept, heap });
  check("tall-order: in the pull-back it lies on the kitchen floor, each piece on the side it fell to, a later one slid off an earlier to lie beside it, all inside the picture",
    heap.zoomP === 1 && heap.sides.every(Boolean) && heap.onFloor && heap.beside && heap.inView && heap.floorIn, heap);
  await done(p, "shadow and heap");
  await ctx.close();

  // ---- a tall cake: twenty tiers, each with a right-hand offcut, then a miss.
  // Taken a frame at a time, by hand (60 a second), so nothing else moves:
  // the pull-back's first picture is the one play left off on (it used to
  // jump from the top of the tower down to its stand); the tier that missed,
  // still in the air as it begins, comes down onto the floor during it; each
  // piece comes down where its own fall takes it (its throw and the drawn
  // gravity), or slides off a heap outward from there; and twenty pieces
  // from one edge spread along the floor, not stacked into a tall heap.
  ctx = await lib.newContext(browser, { viewport: { width: 1280, height: 720 } });
  p = await open(ctx);
  await p.evaluate(() => TallOrder.start("bakery"));
  for (let i = 0; i < 20; i++) {
    await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 5000 });
    await p.evaluate(() => TallOrder.placeAndDrop(Math.min(9, TallOrder.topWidth() - 60)));
  }
  await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 5000 });
  const tall = await p.evaluate(() => {
    // how much of the picture changed from one frame to the next (share of pixels)
    const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) n++; return n / (a.length / 4); };
    // (the topper as last drawn: where the cherry and each candle stood)
    let drawn = null;
    const A = window.CakeArt, cherry = A.cherry, candle = A.candle;
    A.cherry = function (g, x, y, s) { drawn = { cherry: [x, y, s], candles: [] }; return cherry.apply(this, arguments); };
    A.candle = function (g, x, y) { if (drawn) drawn.candles.push([x, y]); return candle.apply(this, arguments); };
    const topTier = __to.top();
    TallOrder.placeAndDrop(TallOrder.topWidth() + 14);          // a clean miss, just past the right edge
    const r = { steps: [], jump: null, atStart: null, end: null };
    let prev = null;
    for (let i = 0; i < 600; i++) {
      const was = TallOrder.state();
      if (drawn) drawn = null;                                   // (this frame's own topper only)
      __to.frame(1 / 60);
      const img = __to.pixels(), now = TallOrder.state();
      if (prev && was === now && (now === "tumble" || now === "zoom") && r.steps.length < 400) r.steps.push(changed(prev, img));
      if (was === "tumble" && now === "zoom") { r.jump = changed(prev, img); const g = __to.geo(); r.atStart = { inAir: g.pile.filter((q) => q.down === false).length, debris: g.debris }; }
      prev = img;
      if (now === "over") break;
    }
    const g = __to.geo();
    r.steadiest = r.steps.length ? Math.max(...r.steps) : null;
    r.end = { state: TallOrder.state(), inAir: g.pile.filter((q) => q.down !== true).length, debris: g.debris, n: g.n, floor: g.floor, SH: g.SH,
      // each piece against where its own fall brings it down
      lands: g.fallen.map((f, i) => {
        const floorY = g.floor + 34, t = (-f.vy + Math.sqrt(f.vy * f.vy + 2 * 2200 * Math.max(0, floorY - f.y0))) / 2200;
        const land = f.x + f.w / 2 + f.vx * t, at = g.pile[i].x + g.pile[i].w / 2;
        return Math.round((at - land) * Math.sign(f.vx));
      }),
      high: Math.round(g.floor + 34 - Math.min(...g.pile.map((q) => q.y))),
      spread: Math.round(Math.max(...g.pile.slice(0, -1).map((q) => q.x + q.w)) - Math.min(...g.pile.slice(0, -1).map((q) => q.x))) };
    // the topper against the top tier: its frosted top, and its two ends
    const top = -(g.n - 1) * g.H - g.SH;
    r.topper = drawn && { tier: { x: Math.round(topTier.x), w: Math.round(topTier.w), top },
      cherry: { x: Math.round(drawn.cherry[0]), foot: Math.round(drawn.cherry[1] + drawn.cherry[2]) },
      candles: drawn.candles.map(([x, y]) => [Math.round(x), Math.round(y)]) };
    A.cherry = cherry; A.candle = candle;
    return r;
  });
  check("tall-order: the topper stands on the cake: the cherry on the top tier's frosting, its middle, and a candle a side for every ten tiers on the frosting, inside the tier's ends (they used to hang in the air above it)",
    !!tall.topper && Math.abs(tall.topper.cherry.x - (tall.topper.tier.x + tall.topper.tier.w / 2)) <= 1 && tall.topper.cherry.foot >= tall.topper.tier.top - 1 && tall.topper.cherry.foot <= tall.topper.tier.top + 6 &&
      tall.topper.candles.length === 4 && tall.topper.candles.every(([x, y]) => y >= tall.topper.tier.top && y <= tall.topper.tier.top + 6 && x > tall.topper.tier.x + 2 && x < tall.topper.tier.x + tall.topper.tier.w - 2),
    tall.topper);
  check("tall-order: a tall cake's pull-back starts from the picture play left off on, with no jump, and pulls back smoothly",
    tall.jump !== null && tall.jump < 0.06 && tall.steadiest !== null && tall.steadiest < 0.25, { jump: tall.jump, steadiest: tall.steadiest });
  check("tall-order: the tier that missed, still in the air as the pull-back begins, comes down onto the floor during it",
    !!tall.atStart && tall.atStart.inAir >= 1 && tall.atStart.debris >= 1 && tall.end.state === "over" && tall.end.inAir === 0 && tall.end.debris === 0, { atStart: tall.atStart, end: tall.end });
  check("tall-order: every piece comes down where its own fall takes it, or slides outward off a heap from there",
    tall.end.lands.length === 21 && tall.end.lands.every((d) => d >= -2 && d <= 160), tall.end.lands);
  check("tall-order: twenty pieces from one edge spread along the floor instead of standing in a tall heap",
    tall.end.high <= tall.end.SH * 2.6 && tall.end.spread >= 90, { high: tall.end.high, spread: tall.end.spread, SH: tall.end.SH });
  await done(p, "tall cake");
  await ctx.close();

  // ---- Fredoka sets its letters low in the line: the buttons and keycaps
  // take their padding from the top and give it to the bottom (by --lift), so
  // the words sit in the middle and the boxes keep their size
  ctx = await lib.newContext(browser);
  p = await open(ctx);
  const lean = await p.evaluate(() => ["#pick-mode button", "#play", "#play kbd", "#pick-mode kbd"].map((s) => {
    const cs = getComputedStyle(document.querySelector(s));
    return s + ":" + (parseFloat(cs.paddingBottom) - parseFloat(cs.paddingTop)).toFixed(2);
  }));
  check("tall-order: the menu's buttons and keycaps lean their padding so their words sit in the middle", lean.every((l) => +l.split(":")[1] > 0.5), lean);
  await done(p, "lift");
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
  check("tall-order: on a desktop the menu says to tap or press Space or Enter to drop a tier", /press Space or Enter to drop/.test(desk.how), desk.how);
  check("tall-order: on a touch-only phone the menu says to tap to drop a tier, and every keycap is hidden",
    /tap to drop/.test(phone.how) && !/Space/.test(phone.how) && phone.caps.length > 0 && phone.caps.every((c) => /:none$/.test(c)), phone);
};
