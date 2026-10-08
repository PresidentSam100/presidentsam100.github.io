// Reaction: switching away mid-standoff calls the duel off instead of letting
// it play out unseen (the next tap starts it over, not as a false start);
// Ctrl / Alt + Space or Enter are left to the browser.
const HOOKS = [
  ["  function standoffMs() {", "  function standoffMs() { return 300;"],   // a short, fixed standoff
  ["  // ------------------------------------------------ boot", "  window.__reaction = { state: function () { return state; }, results: function () { return results.length; } };\n  // ------------------------------------------------ boot"],
];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const hook = (pg) => lib.injectScript(pg, "games/reaction/game.js", HOOKS);
  const st = (p) => p.evaluate(() => ({ state: __reaction.state(), results: __reaction.results() }));

  let p = await lib.open(ctx, base, "games/reaction/", { before: hook });
  await p.click("#btn-start"); await p.waitForTimeout(50);
  await p.evaluate(() => window.dispatchEvent(new Event("blur")));
  await p.waitForTimeout(1500);   // the standoff and the shooting window, long gone
  const away = await st(p);
  await p.keyboard.press("Space"); await p.waitForTimeout(50);
  const back = await st(p);
  await p.waitForTimeout(400);
  const drawn = await st(p);
  check("reaction: a duel isn't decided while the window is away; the next tap starts it over",
    away.state === "wait" && away.results === 0 && back.state === "wait" && back.results === 0 && drawn.state === "go", { away, back, drawn });
  check("reaction: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  p = await lib.open(ctx, base, "games/reaction/", { before: hook });
  await p.click("#btn-start"); await p.waitForTimeout(50);
  const claimed = [await lib.fireKey(p, { key: " ", code: "Space", ctrlKey: true }), await lib.fireKey(p, { key: "Enter", code: "Enter", altKey: true })];
  const combo = await st(p);
  check("reaction: Ctrl / Alt + Space or Enter are left to the browser (no false start)", claimed.every((x) => !x) && combo.state === "wait" && combo.results === 0, { claimed, combo });
  await p.close();
  await ctx.close();

  // the hint names Space with a keyboard; on a touch-only device, just the tap
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/reaction/");
    const hint = await q.evaluate(() => document.querySelector(".hint").innerText);
    const ok = label === "desktop" ? /^tap the street or press Space the moment/.test(hint) : /^tap the street the moment/.test(hint) && !/Space/.test(hint);
    check("reaction " + label + ": the hint " + (label === "desktop" ? "names Space" : "says tap the street, no Space"), ok, hint);
    await q.close();
    await c.close();
  }
};
