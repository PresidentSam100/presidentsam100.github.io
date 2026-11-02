// A browser with no sound to give (no Web Audio: some privacy settings,
// older or embedded browsers, Playwright's WebKit on Windows): every game
// still opens and plays a little (its start keys, a few clicks across the
// middle of the screen), silent, with no page error. A game's first sounds
// come with its first moves, so this is where a sound set up without a guard
// would throw (Neon Pinball's did at the start of a game).
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  await ctx.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
  const bad = {}, gone = [];
  for (const g of lib.gamePages()) {
    const p = await lib.open(ctx, base, "games/" + g);
    if (await p.evaluate(() => typeof window.AudioContext + typeof window.webkitAudioContext) !== "undefinedundefined") gone.push(g);
    const vp = p.viewportSize();
    for (const k of ["Enter", "Space", "1", "ArrowUp", "ArrowLeft", "Enter"]) { await p.keyboard.press(k); await p.waitForTimeout(120); }
    for (let i = 0; i < 10; i++) { await p.mouse.click(vp.width * (0.3 + 0.04 * ((i * 7) % 10)), vp.height * (0.35 + 0.035 * ((i * 3) % 10))); await p.waitForTimeout(100); }
    if (p.errs.length) bad[g] = p.errs.slice(0, 2);
    await p.close();
  }
  check("no Web Audio: every game opens and plays a little (its keys, clicks across the screen), silent, with no page error",
    gone.length === 0 && Object.keys(bad).length === 0, { stillHadAudio: gone, errors: bad });
  await ctx.close();
};
