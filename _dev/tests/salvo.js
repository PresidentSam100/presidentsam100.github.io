// Salvo: a shot fired in the moment between the last sinking and the end card
// doesn't count the win again; with storage blocked the game still runs.
const HOOK = ['  $("againBtn").addEventListener("click", newGame);', '  window.__salvo = { get enemyShips() { return enemyShips; } };\n  $("againBtn").addEventListener("click", newGame);'];
const BLOCK_STORAGE = (pg) => pg.addInitScript(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const hook = (pg) => lib.injectScript(pg, "games/salvo/game.js", [HOOK]);

  let p = await lib.open(ctx, base, "games/salvo/", { before: hook });
  await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
  await p.keyboard.press("a"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const res = await p.evaluate(async () => {
    const grid = document.getElementById("enemyGrid");
    const cellAt = (r, c) => grid.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');
    const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const ships = new Set();
    __salvo.enemyShips.forEach((s) => s.cells.forEach((rc) => { ships.add(rc[0] + "," + rc[1]); click(cellAt(rc[0], rc[1])); }));   // every shot a hit: the turn never passes
    // the fleet is down and the end card is on its way: one more shot, at open water
    for (let i = 0; i < 100; i++) if (!ships.has(((i / 10) | 0) + "," + (i % 10))) { click(cellAt((i / 10) | 0, i % 10)); break; }
    await new Promise((r) => setTimeout(r, 900));
    return { rec: JSON.parse(localStorage.getItem("battleship_record")), over: !document.getElementById("over").classList.contains("hidden") };
  });
  check("salvo: a shot after the last sinking doesn't count the win twice", res.over && res.rec.w === 1 && res.rec.l === 0, res);

  // the end card: Backspace goes back to the fleet screen, the game's menu,
  // but not in its first second (Backspace is a placement key, Reset); Esc
  // leaves for the games page
  const shown = () => p.evaluate(() => ({ over: !document.getElementById("over").classList.contains("hidden"), placing: document.getElementById("placeControls").style.display !== "none" && document.getElementById("enemyCol").hidden }));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const early = await shown();
  await p.waitForTimeout(1000);
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  const esc = Object.assign(await shown(), { leaves: p.leaves });
  await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const back = await shown();
  check("salvo: on the end card Esc leaves, Backspace goes back to the fleet screen (not in the card's first second)",
    early.over && esc.over && esc.leaves === 1 && !back.over && back.placing && p.leaves === 1, { early, esc, back });
  check("salvo: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  p = await lib.open(ctx, base, "games/salvo/", { before: BLOCK_STORAGE });
  await p.keyboard.press("a"); await p.waitForTimeout(80);
  const placed = await p.evaluate(() => (document.getElementById("placing") || {}).textContent || "");
  check("salvo: with storage blocked the fleet can still be placed", p.errs.length === 0 && /All ships placed/.test(placed), { errs: p.errs, placed });
  await p.close();
  await ctx.close();
};
