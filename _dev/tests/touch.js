// Keycaps on games' own buttons show on a desktop and hide on touch-only
// devices (no keyboard to press them on).
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const ctx = await lib.newContext(browser, opts);
    const want = label === "desktop";
    const shown = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s + " .gs-keys"); return e ? getComputedStyle(e).display !== "none" : null; }, sel);

    let p = await lib.open(ctx, base, "games/demolition-row/");
    await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /solo|play|start/i.test(x.textContent)); b && b.click(); });
    await p.waitForTimeout(500);
    check(label + ": demolition-row's pause keycap " + (want ? "shows" : "is hidden"), (await shown(p, "#pause-btn")) === want);
    await p.close();

    p = await lib.open(ctx, base, "games/slither/");
    await p.click("#play-btn"); await p.waitForTimeout(400);
    const s0 = await shown(p, "#pause-btn");
    await p.click("#pause-btn"); await p.waitForTimeout(150);
    const s1 = await shown(p, "#pause-btn");
    check(label + ": slither's pause / resume keycaps " + (want ? "show" : "are hidden"), s0 === want && s1 === want, { s0, s1 });
    await p.close();

    p = await lib.open(ctx, base, "games/crazy-ohio/");
    check(label + ": crazy-ohio's Settings keycap " + (want ? "shows" : "is hidden"), (await shown(p, "#settingsBtn")) === want);
    await p.close();
    await ctx.close();
  }
};
