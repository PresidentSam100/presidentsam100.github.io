// Stopwatch: Ctrl / Alt + Space or Enter are left to the browser; a plain
// Space still sets the sweep going. A sweep under way when the window loses
// focus is called off, and a new mark is dealt. The end card: Backspace goes
// to the modes, Esc leaves, and neither it nor Space acts in its first second.
// (Math.random takes queued values first, so the marks dealt are known.)
const RANDOM = (pg) => pg.addInitScript(() => {
  const real = Math.random;
  window.__rand = [];
  Math.random = () => (window.__rand.length ? window.__rand.shift() : real());
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/stopwatch/", { before: RANDOM });
  const phase = () => p.evaluate(() => document.querySelector(".stage").dataset.phase);
  await p.evaluate(() => { window.__rand = [0.35]; });   // the first mark: 4s
  await p.click("#btn-start"); await p.waitForTimeout(80);
  const ph0 = await phase();
  const claimed = [await lib.fireKey(p, { key: " ", code: "Space", ctrlKey: true }), await lib.fireKey(p, { key: "Enter", code: "Enter", altKey: true })];
  const ph1 = await phase();
  const plain = await lib.fireKey(p, { key: " ", code: "Space" });
  const ph2 = await phase();
  check("stopwatch: Ctrl / Alt + Space or Enter are left to the browser, a plain Space still starts the sweep",
    ph0 === "ready" && claimed.every((x) => !x) && ph1 === "ready" && plain && ph2 === "baking", { ph0, claimed, ph1, plain, ph2 });

  // a sweep under way when the window loses focus (or the tab is hidden) is
  // called off: not a miss, not a bust, and a new mark is dealt, so a botched
  // sweep can't be had again
  await p.waitForTimeout(300);
  const mark = await p.evaluate(() => document.getElementById("target-big").textContent);
  await p.evaluate(() => { window.__rand = [0.35, 0.75]; window.dispatchEvent(new Event("blur")); });   // 4s again is skipped: 8s
  await p.waitForTimeout(1500);   // past when a bust's end card would be up
  const off = await p.evaluate(() => ({ phase: document.querySelector(".stage").dataset.phase, sub: document.getElementById("sub").textContent,
    mark: document.getElementById("target-big").textContent, round: document.getElementById("round").textContent, score: document.getElementById("score").textContent,
    drift: document.getElementById("used").textContent, over: document.getElementById("overlay-card").classList.contains("show"), best: localStorage.getItem("stopwatch_best") }));
  await p.keyboard.press("Space");
  const again = await phase();
  check("stopwatch: a sweep under way when the window loses focus is called off (no miss, no bust, no best); START goes again",
    off.phase === "ready" && /called off/.test(off.sub) && off.round === "1" && off.score === "0" && off.drift === "0.000" && !off.over && off.best === null && again === "baking",
    { off, again });
  check("stopwatch: after a call-off the mark is a new one", mark === "4s" && off.mark === "8s", { mark, after: off.mark });

  // bust the run (stopped at 0.3 s on the 8s mark): the end card. Space and
  // Backspace in its first second do nothing; then Esc leaves for the games
  // page and Backspace goes back to the modes
  await p.waitForTimeout(300); await p.keyboard.press("Space");
  await p.waitForFunction(() => !!document.getElementById("btn-mode"), null, { timeout: 4000 });
  await p.keyboard.press("Space"); await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const early = await p.evaluate(() => !!document.getElementById("btn-mode") && document.getElementById("overlay-card").classList.contains("show"));
  await p.waitForTimeout(1000);
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  const esc = { card: await p.evaluate(() => !!document.getElementById("btn-mode") && document.getElementById("overlay-card").classList.contains("show")), leaves: p.leaves };
  await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const modes = await p.evaluate(() => !!document.getElementById("btn-start") && document.querySelectorAll(".modebtn").length === 2);
  check("stopwatch: on the end card Esc leaves, Backspace goes back to the modes; neither it nor Space acts in the card's first second",
    early && esc.card && esc.leaves === 1 && modes && p.leaves === 1, { early, esc, modes, leaves: p.leaves });
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
