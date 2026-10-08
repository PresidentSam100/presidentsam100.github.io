// Jam Jar: while paused the keys neither drop a fruit nor move the aim; an
// overflowing jar is "★ New best!" only when it beats the best (not on a tie,
// and not on an empty first jar); on a 2× screen the jar and its fruit are
// drawn at 2× (they were blurry), and a click still drops where it points.
const HOOK = ["    setAim: function (x) { aimX = x; },", `    setAim: function (x) { aimX = x; },
    aim: function () { return aimX; },
    overflow: function (s) { score = s; gameOver(); },
    spriteWidth: function (i) { return SPRITES[i].c.width; },`];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (opts) => lib.open(ctx, base, "games/jam-jar/", Object.assign({ before: (pg) => lib.injectScript(pg, "games/jam-jar/game.js", [HOOK]) }, opts));
  const done = async (p, what) => { check("jam-jar " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- paused, Space / ↓ drop nothing and ← → leave the aim; resumed, Space drops
  let p = await open();
  await p.keyboard.press("Space"); await p.waitForTimeout(500);
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
  const fx = await p.evaluate(() => __game.fruits.length ? Math.round(__game.fruits[0].x) : null);
  await p.evaluate(() => { Object.defineProperty(window, "devicePixelRatio", { get: () => 1, configurable: true }); window.dispatchEvent(new Event("resize")); });
  await p.waitForTimeout(100);
  const one = await size();
  check("jam-jar: on a 2× screen the jar and its fruit are drawn at 2×, a click drops where it points, and a zoom to 1× refits",
    two.w === 1080 && two.h === 1440 && two.berry === 124 && Math.abs(fx - 400) <= 2 && one.w === 540 && one.berry === 62, { two, dropX: fx, one });
  await done(p, "hi-DPI");
  await hi.close();
};
