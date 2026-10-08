// Typetwo with Visual FX off: the night scene (stars, ward, runes, the
// wizard's robe and orb) is drawn but holds still; with FX on it moves.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const frames = async (fxOff) => {
    const p = await lib.open(ctx, base, "games/typetwo/");
    await p.evaluate((off) => localStorage.setItem("reduceMotion:typetwo", off ? "1" : "0"), fxOff);
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
    const shot = () => p.evaluate(() => document.getElementById("game").toDataURL());
    const a = await shot(); await p.waitForTimeout(400); const b = await shot();
    const blank = await p.evaluate(() => { const c = document.createElement("canvas"), g = document.getElementById("game"); c.width = g.width; c.height = g.height; return c.toDataURL(); });
    const errs = p.errs;
    await p.close();
    return { still: a === b, drawn: a !== blank, errs };
  };
  const off = await frames(true), on = await frames(false);
  check("typetwo, FX off: the menu's night scene is drawn and holds still (FX on, it moves)", off.still && off.drawn && !on.still, { off, on });
  check("typetwo (FX): no page errors", off.errs.length === 0 && on.errs.length === 0, [off.errs, on.errs]);
  await ctx.close();
};
