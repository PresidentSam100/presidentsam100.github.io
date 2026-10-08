// Stopwatch: Ctrl / Alt + Space or Enter are left to the browser; a plain
// Space still sets the sweep going.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/stopwatch/");
  const phase = () => p.evaluate(() => document.querySelector(".stage").dataset.phase);
  await p.click("#btn-start"); await p.waitForTimeout(80);
  const ph0 = await phase();
  const claimed = [await lib.fireKey(p, { key: " ", code: "Space", ctrlKey: true }), await lib.fireKey(p, { key: "Enter", code: "Enter", altKey: true })];
  const ph1 = await phase();
  const plain = await lib.fireKey(p, { key: " ", code: "Space" });
  const ph2 = await phase();
  check("stopwatch: Ctrl / Alt + Space or Enter are left to the browser, a plain Space still starts the sweep",
    ph0 === "ready" && claimed.every((x) => !x) && ph1 === "ready" && plain && ph2 === "baking", { ph0, claimed, ph1, plain, ph2 });
  check("stopwatch: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  // the hint names Space with a keyboard; on a touch-only device, just the tap
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/stopwatch/");
    const hint = await q.evaluate(() => document.querySelector(".hint").innerText);
    const ok = label === "desktop" ? /^tap the watch or press Space — once/.test(hint) : /^tap the watch — once/.test(hint) && !/Space/.test(hint);
    check("stopwatch " + label + ": the hint " + (label === "desktop" ? "names Space" : "says tap the watch, no Space"), ok, hint);
    await q.close();
    await c.close();
  }
};
