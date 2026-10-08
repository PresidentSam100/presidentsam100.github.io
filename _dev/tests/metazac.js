// Metazac: on the start and game-over cards Enter / Space start a game, but
// not when a focused control acts on the key itself (Space ticks a setting,
// Enter presses a button); a mouse click leaves no button focused; division
// never shows a 0 divisor; the storm button's SPACE tag hides on touch. On a
// phone (no Return key on a number pad) a Pop ✓ button answers, keeping the
// answer box focused, and the key hints name the buttons instead.
const HOOK = ["  function endGame() {", "  window.__mz = { end: function () { endGame(); }, make: function () { return makeProblem(); },\n" +
  "    spawn: function () { spawnBloon(); return bloons[bloons.length - 1].ans; }, score: function () { return score; } };\n  function endGame() {"];

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

  // ---- key hints and the Pop ✓ button: keys on a desktop, buttons on a phone
  const { devices } = require("@playwright/test");
  const shows = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display !== "none" : null; }, sel);
  const hints = async (p) => ({
    pop: await shows(p, "#pop-btn"),
    hintKeys: await shows(p, ".hint .gs-keys"), hintTouch: await shows(p, ".hint .gs-touch"),
    noteKeys: await shows(p, ".power-note .gs-keys"), noteTouch: await shows(p, ".power-note .gs-touch"),
  });
  p = await open();
  const desk = await hints(p);
  check("metazac, desktop: the hints name Enter and Space, and there's no Pop button",
    desk.pop === false && desk.hintKeys && desk.hintTouch === false && desk.noteKeys && desk.noteTouch === false, desk);
  await p.close();

  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(phone, base, "games/metazac/", { before: (pg) => lib.injectScript(pg, "games/metazac/game.js", [HOOK]) });
  const ph = await hints(p);
  check("metazac, phone: the hints name the Pop and dart buttons, not keys, and the Pop button shows",
    ph.pop === true && ph.hintKeys === false && ph.hintTouch && ph.noteKeys === false && ph.noteTouch, ph);
  await p.tap("#start-btn"); await p.waitForTimeout(200);
  const ans = await p.evaluate(() => __mz.spawn());
  await p.locator("#answer").fill(String(ans));
  await p.tap("#pop-btn"); await p.waitForTimeout(100);
  const right = await p.evaluate(() => ({ score: __mz.score(), value: document.getElementById("answer").value, focused: document.activeElement && document.activeElement.id }));
  await p.locator("#answer").fill("987654");
  await p.tap("#pop-btn"); await p.waitForTimeout(50);
  const wrong = await p.evaluate(() => ({ red: document.getElementById("answer").classList.contains("wrong"), value: document.getElementById("answer").value, focused: document.activeElement && document.activeElement.id }));
  check("metazac, phone: Pop ✓ answers like Enter (pops a match, flags a miss) and keeps the answer box focused",
    right.score > 0 && right.value === "" && right.focused === "answer" && wrong.red && wrong.value === "" && wrong.focused === "answer", { right, wrong });
  check("metazac, phone: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await phone.close();

  await ctx.close();
};
