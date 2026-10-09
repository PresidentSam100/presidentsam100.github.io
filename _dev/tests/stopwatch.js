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

  // a sweep under way when the window loses focus (or the tab is hidden) is
  // called off: not a miss, not a bust; the same mark waits on START
  await p.waitForTimeout(300);
  const mark = await p.evaluate(() => document.getElementById("target-big").textContent);
  await p.evaluate(() => window.dispatchEvent(new Event("blur")));
  await p.waitForTimeout(1500);   // past when a bust's end card would be up
  const off = await p.evaluate(() => ({ phase: document.querySelector(".stage").dataset.phase, sub: document.getElementById("sub").textContent,
    mark: document.getElementById("target-big").textContent, round: document.getElementById("round").textContent, score: document.getElementById("score").textContent,
    drift: document.getElementById("used").textContent, over: document.getElementById("overlay-card").classList.contains("show"), best: localStorage.getItem("stopwatch_best") }));
  await p.keyboard.press("Space");
  const again = await phase();
  check("stopwatch: a sweep under way when the window loses focus is called off (no miss, no bust, no best); the same mark goes again",
    off.phase === "ready" && /called off/.test(off.sub) && off.mark === mark && off.round === "1" && off.score === "0" && off.drift === "0.000" && !off.over && off.best === null && again === "baking",
    { mark, off, again });
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
