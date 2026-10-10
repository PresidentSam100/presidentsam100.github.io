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
    // the how-to line names the number keys only where there are keys, and so
    // do the keycaps on the planets' tags
    const how = await p.evaluate(() => ({ text: document.querySelector("#menu .how").innerText, tags: [...document.querySelectorAll(".hang .tag kbd")].filter((k) => k.getClientRects().length).length }));
    if (label === "phone") check("science-fair: on a touch-only phone the how-to says tap, and the planets' tags show no keycaps",
      /by tapping them\./.test(how.text) && !/number keys|1–9/.test(how.text) && how.tags === 0, how);
    else check("science-fair: with a keyboard the how-to names the number keys, and the planets' tags show them",
      /pressing their number keys \(1–9\)/.test(how.text) && how.tags === 9, how);
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

  // Enter on a focused mode button picks that mode and stays on the menu (it
  // used to start a run in the old mode as well); a mode picked with the
  // mouse doesn't keep the focus, so the next Enter is Blast off
  {
    const ctx = await lib.newContext(browser);
    const p = await lib.open(ctx, base, "games/science-fair/");
    const look = () => p.evaluate(() => ({ state: ScienceFair.state(), on: (document.querySelector("#pick-mode button.on") || {}).dataset.v, focus: document.activeElement.tagName }));
    await p.focus('#pick-mode button[data-v="grand"]'); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const a = await look();
    await p.evaluate(() => document.activeElement.blur());
    await p.click('#pick-mode button[data-v="classic"]'); const b = await look();
    await p.evaluate(() => ScienceFair.fast()); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    const c = await look();
    check("science-fair: Enter on a focused mode button only picks it; after a mouse pick (which keeps no focus) Enter blasts off",
      a.state === "menu" && a.on === "grand" && b.on === "classic" && b.focus !== "BUTTON" && c.state !== "menu", { a, b, c });
    check("science-fair (menu keys): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }
};
