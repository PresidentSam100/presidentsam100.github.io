// Meteor Menace!: a key held as the window loses focus (its keyup goes to
// another window) isn't stuck down once the game resumes; with Visual FX off
// the menu's rocket stands still (it's still drawn), with FX on it drifts.
const HOOK = ["  function drawShipAt(x, y, a, opts) {\n", "  function drawShipAt(x, y, a, opts) {\n    if (opts && opts.scale === 1.6) window.__menuShip = [x, y, a];\n"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = () => lib.open(ctx, base, "games/meteor-menace/", { before: (pg) => lib.injectScript(pg, "games/meteor-menace/game.js", [HOOK]) });
  const done = async (p, what) => { check("meteor-menace " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- hold ↑, lose focus (auto-pause; the keyup never comes), resume: no thrust
  let p = await open();
  await p.evaluate(() => __game.start());
  await p.keyboard.down("ArrowUp"); await p.waitForTimeout(150);
  const held = await p.evaluate(() => !!(__game.ship && __game.ship.thrusting));
  await p.evaluate(() => window.dispatchEvent(new Event("blur"))); await p.waitForTimeout(80);
  await p.click(".gs-pause button"); await p.waitForTimeout(150);
  const after = await p.evaluate(() => !!(__game.ship && __game.ship.thrusting));
  await p.keyboard.up("ArrowUp");
  check("meteor-menace: a key held when the window loses focus isn't stuck down after resuming", held && !after, { held, after });
  await done(p, "held keys");

  // ---- the menu rocket: still with FX off, drifting with it on
  const menuShip = async (off) => {
    const pg = await open();
    await pg.evaluate((off) => localStorage.setItem("reduceMotion:meteor-menace", off ? "1" : "0"), off);
    await pg.reload({ waitUntil: "domcontentloaded" }); await pg.waitForTimeout(200);
    const a = await pg.evaluate(() => window.__menuShip);
    await pg.waitForTimeout(300);
    const b = await pg.evaluate(() => window.__menuShip);
    await done(pg, "menu ship FX " + (off ? "off" : "on"));
    return { a, b, still: !!a && !!b && a.every((v, i) => v === b[i]) };
  };
  const off = await menuShip(true), on = await menuShip(false);
  check("meteor-menace: with Visual FX off the menu rocket is drawn standing still; with FX on it drifts", off.still && !!on.a && !on.still, { off, on });
  await ctx.close();
};
