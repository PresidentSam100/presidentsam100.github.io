// 24: the keyboard legend under the phone shows with a keyboard and hides on
// a touch-only phone, where the phone's own labelled keys are the controls.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const ctx = await lib.newContext(browser, opts);
    const p = await lib.open(ctx, base, "games/24/");
    const shown = await p.evaluate(() => document.querySelector(".keys-help").getClientRects().length > 0);
    check("24: the keyboard legend " + (label === "phone" ? "is hidden on a touch-only phone" : "shows with a keyboard"), shown === (label !== "phone"), shown);
    check("24 (" + label + "): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }
};
