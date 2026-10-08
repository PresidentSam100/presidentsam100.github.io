// Quick Minute: lane changes while paused don't count; after resuming they do.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/quick-minute/");
  const card = () => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });
  const lane = () => p.evaluate(() => __game.player.lane);

  await p.evaluate(() => __game.start("day")); await p.waitForTimeout(100);
  await p.keyboard.press("p"); await p.waitForTimeout(60);
  const paused = await card(), l0 = await lane();
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("a");
  const l1 = await lane();
  await p.keyboard.press("p"); await p.waitForTimeout(60);
  await p.keyboard.press("ArrowLeft");
  const l2 = await lane();
  check("quick-minute: lane changes while paused don't count; after resuming they do", paused && l0 === 2 && l1 === 2 && l2 === 1, { paused, l0, l1, l2 });
  check("quick-minute: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();
};
