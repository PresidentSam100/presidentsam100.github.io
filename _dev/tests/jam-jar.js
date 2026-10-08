// Jam Jar: while paused the keys neither drop a fruit nor move the aim; an
// overflowing jar is "★ New best!" only when it beats the best (not on a tie,
// and not on an empty first jar).
const HOOK = ["    setAim: function (x) { aimX = x; },", `    setAim: function (x) { aimX = x; },
    aim: function () { return aimX; },
    overflow: function (s) { score = s; gameOver(); },`];

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
};
