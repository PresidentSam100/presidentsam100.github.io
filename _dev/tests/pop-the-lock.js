// Pop the Lock: a tap while paused isn't scored; Ctrl / Alt + Space or Enter
// are left to the browser; with storage blocked the game still runs.
const HOOK = ["  // ---- Boot ----", "  window.__lock = { state: () => state, score: () => score };\n  // ---- Boot ----"];
const BLOCK_STORAGE = (pg) => pg.addInitScript(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const hook = (pg) => lib.injectScript(pg, "games/pop-the-lock/game.js", [HOOK]);
  const card = (p) => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });
  const st = (p) => p.evaluate(() => window.__lock ? { state: __lock.state(), score: __lock.score() } : null);

  let p = await lib.open(ctx, base, "games/pop-the-lock/", { before: hook });
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  await p.keyboard.press("p"); await p.waitForTimeout(80);
  const paused = await card(p);
  await p.keyboard.press("Space"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const during = await st(p);
  await p.keyboard.press("p"); await p.waitForTimeout(80);
  const after = await st(p);
  check("pop-the-lock: Space / Enter while paused don't tap the lock", paused && during.state === "play" && during.score === 0 && after.state === "play" && !(await card(p)), { paused, during, after });
  check("pop-the-lock: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // on the menu, the combos start nothing
  p = await lib.open(ctx, base, "games/pop-the-lock/", { before: hook });
  const claimed = [await lib.fireKey(p, { key: " ", code: "Space", ctrlKey: true }), await lib.fireKey(p, { key: "Enter", code: "Enter", altKey: true })];
  const menu = await st(p);
  check("pop-the-lock: Ctrl / Alt + Space or Enter are left to the browser", claimed.every((x) => !x) && menu.state === "menu", { claimed, menu });
  await p.close();

  p = await lib.open(ctx, base, "games/pop-the-lock/", { before: async (pg) => { await BLOCK_STORAGE(pg); await hook(pg); } });
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const blocked = await st(p);
  check("pop-the-lock: with storage blocked the game still starts", p.errs.length === 0 && !!blocked && blocked.state === "play", { errs: p.errs, blocked });
  await p.close();
  await ctx.close();

  // the hint names Space with a keyboard; on a touch-only device, just Tap
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/pop-the-lock/");
    const hint = await q.evaluate(() => document.querySelector(".hint").innerText.replace(/\s+/g, " "));
    const ok = label === "desktop" ? /^Click \/ Tap \/ Space • Don't miss/.test(hint) : /^Tap • Don't miss/.test(hint);
    check("pop-the-lock " + label + ": the hint " + (label === "desktop" ? "names Space" : "says Tap, no Space"), ok, hint);
    await q.close();
    await c.close();
  }
};
