// Science Fair: a first run that ends at round 0 isn't "a new best"; the
// buttons' keycaps (the mode keys, Blast off, Again) show with a keyboard
// and hide on a touch-only phone.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  // a Classic run that misses the very first note: round 0
  const missFirst = async (p) => {
    await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start("classic"); });
    await p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 });
    await p.evaluate(() => { const s = ScienceFair.seq(); ScienceFair.press((s[0] + 1) % 4); });
    await p.waitForFunction(() => ScienceFair.state() === "over", null, { timeout: 8000 });
  };

  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const ctx = await lib.newContext(browser, opts);
    const p = await lib.open(ctx, base, "games/science-fair/");
    const shown = () => p.evaluate(() => [...document.querySelectorAll(".panel button kbd")].filter((k) => k.getClientRects().length).map((k) => k.closest("button").id || k.closest("button").dataset.v));
    const menu = await shown();
    await missFirst(p);
    const over = await shown();
    if (label === "desktop") {
      const r = await p.evaluate(() => ({ msg: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent }));
      check("science-fair: a first run that ends at round 0 isn't a new best", r.msg === "Round 0" && !/new best/.test(r.stats), r);
      check("science-fair: with a keyboard the buttons' keycaps show", menu.length === 4 && over.length === 2, { menu, over });
    } else check("science-fair: on a touch-only phone the buttons' keycaps are hidden", menu.length === 0 && over.length === 0, { menu, over });
    check("science-fair (" + label + "): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }
};
