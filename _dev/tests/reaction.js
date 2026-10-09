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
  // The standoff is 300 ms, shorter than a few round trips on a busy machine:
  // so what must land inside one runs in the page in one go (key() is
  // lib.fireKey's keydown, in the page), and waits are on the page's clock.
  const IN_PAGE = () => {
    window.__key = (init) => { const e = new KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true }, init));
      const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body; t.dispatchEvent(e); return e.defaultPrevented; };
    window.__st = () => ({ state: __reaction.state(), results: __reaction.results() });
    window.__after = (ms) => new Promise((r) => setTimeout(r, ms));
  };
  const hookAll = async (pg) => { await hook(pg); await pg.addInitScript(IN_PAGE); };

  let p = await lib.open(ctx, base, "games/reaction/", { before: hookAll });
  // step into the street and switch away at once (mid-standoff), then wait out
  // the standoff and the shooting window on the page's clock
  const away = await p.evaluate(async () => { document.getElementById("btn-start").click(); window.dispatchEvent(new Event("blur")); await __after(1500); return __st(); });
  // the next tap starts it over (read straight away), and that standoff draws
  const back = await p.evaluate(() => { __key({ key: " ", code: "Space" }); return __st(); });
  const drawn = await p.evaluate(async () => { await __after(400); return __st(); });
  check("reaction: a duel isn't decided while the window is away; the next tap starts it over",
    away.state === "wait" && away.results === 0 && back.state === "wait" && back.results === 0 && drawn.state === "go", { away, back, drawn });
  check("reaction: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  p = await lib.open(ctx, base, "games/reaction/", { before: hookAll });
  // into the street, then the two combos inside its standoff
  const { claimed, combo } = await p.evaluate(() => {
    document.getElementById("btn-start").click();
    const claimed = [__key({ key: " ", code: "Space", ctrlKey: true }), __key({ key: "Enter", code: "Enter", altKey: true })];
    return { claimed, combo: __st() };
  });
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
