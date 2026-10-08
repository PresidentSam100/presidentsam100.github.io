// Metazac: on the start and game-over cards Enter / Space start a game, but
// not when a focused control acts on the key itself (Space ticks a setting,
// Enter presses a button); a mouse click leaves no button focused; division
// never shows a 0 divisor; the storm button's SPACE tag hides on touch.
const HOOK = ["  function endGame() {", "  window.__mz = { end: function () { endGame(); }, make: function () { return makeProblem(); } };\n  function endGame() {"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = () => lib.open(ctx, base, "games/metazac/", { before: (pg) => lib.injectScript(pg, "games/metazac/game.js", [HOOK]) });
  const screen = (p) => p.evaluate(() => ({
    start: !document.getElementById("overlay-start").classList.contains("hidden"),
    over: !document.getElementById("overlay-over").classList.contains("hidden"),
  }));

  // ---- keys on the start card
  let p = await open();
  await p.focus("#mul-on");
  await p.keyboard.press(" "); await p.waitForTimeout(100);
  const space = { checked: await p.evaluate(() => document.getElementById("mul-on").checked), screen: await screen(p) };
  check("metazac: Space on a focused setting ticks it and doesn't start a game", space.checked === false && space.screen.start, space);
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  await p.click("#sub-on"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const clicked = { sub: await p.evaluate(() => document.getElementById("sub-on").checked), screen: await screen(p) };
  check("metazac: click a setting, then Enter starts the game", clicked.sub === false && !clicked.screen.start, clicked);

  // ---- the game-over card: Enter on a focused Main Menu goes to the menu
  await p.evaluate(() => __mz.end()); await p.waitForTimeout(800);
  await p.focus("#menu-btn"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await screen(p);
  check("metazac: Enter on a focused Main Menu button goes to the menu, not a new game", menu.start && !menu.over, menu);

  // ---- a mouse click doesn't leave a card button focused (Tab still reaches them)
  const held = await p.evaluate(() => ["start-btn", "retry-btn", "menu-btn"].filter((id) => {
    const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    document.getElementById(id).dispatchEvent(e);
    return !e.defaultPrevented;
  }));
  check("metazac: a mouse click leaves no Start / Play Again / Main Menu button focused", held.length === 0, held);

  // ---- the storm button's key tag is a hint that hides on touch
  check("metazac: the storm button's SPACE tag hides on touch (in .gs-keys)", await p.evaluate(() => !!document.querySelector("#power-btn .gs-keys .power-key")));
  check("metazac: no page errors (keys)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- division with a 0 in the multiplication ranges: never "… / 0"
  p = await open();
  await p.evaluate(() => {
    ["add-on", "sub-on", "mul-on"].forEach((id) => { document.getElementById(id).checked = false; });
    document.getElementById("div-on").checked = true;
    [["mul-min1", 0], ["mul-max1", 0], ["mul-min2", 0], ["mul-max2", 3]].forEach(([id, v]) => { document.getElementById(id).value = v; });
  });
  await p.click("#start-btn"); await p.waitForTimeout(100);
  const bad = await p.evaluate(() => {
    const out = [];
    for (let i = 0; i < 200; i++) {
      const q = __mz.make(), m = /^(\d+) \/ (\d+)$/.exec(q.text);
      if (!m || +m[2] === 0 || +m[1] / +m[2] !== q.ans) out.push(q.text + " = " + q.ans);
    }
    return out;
  });
  check("metazac: division never divides by 0, even with 0 in the multiplication ranges", bad.length === 0, bad.slice(0, 5));
  check("metazac: no page errors (division)", p.errs.length === 0, p.errs);
  await p.close();

  await ctx.close();
};
