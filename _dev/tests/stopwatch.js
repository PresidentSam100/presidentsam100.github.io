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
};
