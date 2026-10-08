// Road Bird with Visual FX off: the menu, the pause card, the eagle's swoop
// and the game-over card draw the same at any moment (no bob, pulse, ripple,
// coin spin or wing flap, the art still all there); with FX on the menu moves.
const HOOK = ["window.__game = {", "window.__game = {\n  render: render,\n  eagle: function () { triggerEagle(); },"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/road-bird/", { before: (pg) => lib.injectScript(pg, "games/road-bird/game.js", [HOOK]) });
  // the same moment of play drawn twice, 0.7 s of clock apart: the pixels that differ
  const moved = (eagle) => p.evaluate((eagle) => {
    const c = document.getElementById("game"), g = c.getContext("2d"), now = performance.now;
    if (eagle) __game.eagle();
    const shot = (t) => { performance.now = () => t; __game.render(); return g.getImageData(0, 0, c.width, c.height).data; };
    try {
      const a = shot(10000), b = shot(10700);
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
      return n;
    } finally { performance.now = now; }
  }, eagle);
  const fxOff = (off) => p.evaluate((off) => { if (window.RM_ON() !== off) document.querySelector(".rm-toggle").click(); }, off);

  await fxOff(false);
  const menuOn = await moved();
  await fxOff(true);
  const menuOff = await moved();
  check("road-bird: the menu moves with FX on, and holds still with FX off", menuOn > 0 && menuOff === 0, { menuOn, menuOff });

  await p.keyboard.press("Space"); await p.waitForTimeout(200);
  await p.keyboard.press("ArrowUp"); await p.waitForTimeout(300);
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const paused = await moved();
  check("road-bird, FX off: the pause card and the scene under it hold still", paused === 0, paused);

  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const swoop = await moved(true);
  check("road-bird, FX off: the eagle's wings hold still as it swoops", swoop === 0, swoop);

  await p.waitForFunction(() => __game.state === "dead", null, { timeout: 5000 });
  const over = await moved();
  check("road-bird, FX off: the game-over card (with its NEW BEST) holds still", over === 0, over);

  check("road-bird: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();
};
