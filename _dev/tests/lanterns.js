// Lanterns: letters typed while paused don't light anything; Enter on a
// focused mode button only picks the mode; a 0-point first night isn't a
// record; the results show the best streak of the night; a narrower window
// brings the lanterns back inside it.
const HOOK = ["start: startRun,", "start: startRun, gameOver: gameOver, xs: function () { return lanterns.map(function (l) { return l.x; }); }, width: function () { return W; },"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = () => lib.open(ctx, base, "games/lanterns/", { before: (pg) => lib.injectScript(pg, "games/lanterns/game.js", [HOOK]) });
  const done = async (p, what) => { check("lanterns " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- paused, the letters land in the hidden typing box but light nothing
  let p = await open();
  await p.evaluate(() => { Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0); });
  await p.waitForTimeout(100);
  await p.evaluate(() => Lanterns.spawnWord("我", 0.5, 300));
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await p.keyboard.type("wo"); await p.waitForTimeout(100);
  const paused = await p.evaluate(() => ({ score: Lanterns.score(), lit: Lanterns.clearedCount(), up: Lanterns.active().length }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await p.keyboard.type("wo"); await p.waitForTimeout(100);
  const resumed = await p.evaluate(() => ({ score: Lanterns.score(), lit: Lanterns.clearedCount() }));
  check("lanterns: typing a word while paused lights nothing; after resuming it lights",
    paused.score === 0 && paused.lit === 0 && paused.up === 1 && resumed.lit === 1 && resumed.score > 0, { paused, resumed });
  await done(p, "paused typing");

  // ---- Enter on a focused mode button picks that mode and starts nothing
  p = await open();
  await p.keyboard.press("1");
  await p.evaluate(() => document.querySelector('#pick-mode button[data-v="tone"]').focus());
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await p.evaluate(() => ({ state: Lanterns.state(), tone: document.querySelector('#pick-mode button[data-v="tone"]').classList.contains("on") }));
  check("lanterns: Enter on the focused Tone Master button picks it, without starting a Festival night", menu.state === "menu" && menu.tone, menu);
  await p.evaluate(() => document.activeElement.blur());
  await p.click('#pick-mode button[data-v="festival"]');
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const clicked = await p.evaluate(() => Lanterns.state());
  check("lanterns: clicking a mode, then Enter, starts the night", clicked === "play", clicked);
  await done(p, "menu Enter");

  // ---- a first night that lit nothing isn't a record; the streak shown is the night's best
  p = await open();
  await p.evaluate(() => { Lanterns.start("festival"); Lanterns.noSpawn(); });
  await p.waitForTimeout(100);
  await p.evaluate(() => Lanterns.gameOver()); await p.waitForTimeout(100);
  const zero = await p.evaluate(() => document.getElementById("over-stats").textContent);
  check("lanterns: a 0-point first night isn't \"a new record night\"", !/new record/.test(zero), zero);
  await p.evaluate(() => {
    Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0);
    Lanterns.spawnWord("我", 0.3, 300); Lanterns.type("wo");
    Lanterns.spawnWord("你", 0.6, 300); Lanterns.type("ni");
    Lanterns.spawnWord("他", 0.5, 300); Lanterns.type("tq");   // a miss resets the streak
    Lanterns.gameOver();
  });
  await p.waitForTimeout(100);
  const streak = await p.evaluate(() => document.getElementById("over-stats").textContent);
  check("lanterns: the results show the night's best streak, not the one it ended on", /×1\.1/.test(streak), streak);
  await done(p, "results");

  // ---- narrowing the window brings a lantern near its right edge back in
  p = await open();
  await p.evaluate(() => { Lanterns.start("festival"); Lanterns.noSpawn(); Lanterns.setRise(0); Lanterns.spawnWord("我", 0.95, 300); });
  await p.setViewportSize({ width: 412, height: 900 }); await p.waitForTimeout(200);
  const fit = await p.evaluate(() => ({ xs: Lanterns.xs(), w: Lanterns.width() }));
  check("lanterns: after the window narrows, every lantern is inside it", fit.w === 412 && fit.xs.length === 1 && fit.xs.every((x) => x > 0 && x < fit.w), fit);
  await done(p, "resize");

  await ctx.close();
};
