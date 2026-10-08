// ClickTap: with storage blocked the game still runs (no best shown, clicks
// still count).
const BLOCK_STORAGE = (pg) => pg.addInitScript(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/click-tap/", { before: BLOCK_STORAGE });
  const setup = await p.evaluate(() => document.getElementById("setupBest").textContent);
  await p.click("#startBtn"); await p.waitForTimeout(80);
  await p.evaluate(() => { const pad = document.getElementById("pad"), r = pad.getBoundingClientRect(); pad.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true })); });
  const clicks = await p.evaluate(() => document.getElementById("vClicks").textContent);
  check("click-tap: with storage blocked the game still runs (no best shown, clicks count)", p.errs.length === 0 && /No record/.test(setup) && clicks === "1", { errs: p.errs, setup, clicks });
  await p.close();
  await ctx.close();
};
