// Metazac: on the start and game-over cards Enter / Space start a game, but
// not when a focused control acts on the key itself (Space ticks a setting,
// Enter presses a button); a mouse click leaves no button focused; division
// never shows a 0 divisor; the storm button's SPACE tag hides on touch. On a
// phone (no Return key on a number pad) a Pop ✓ button answers, keeping the
// answer box focused, and the key hints name the buttons instead. P pauses,
// typed in the answer box too (it takes digits), and the card wears its
// keys (Resume P, Restart R, Menu ⌫); Esc is the way out, asking mid-run. On
// a laptop's short window the page fits whole, so play never scrolls it.
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

  // ---- P pauses (from the answer box: it takes digits, so P is nobody's
  // letter), the card wearing each button's key; P resumes, the box back in
  // hand; Esc mid-run asks "Leave this game?", the run paused under the box
  {
    const q = await open();
    await q.click("#start-btn"); await q.waitForTimeout(400);
    await q.evaluate(() => __mz.spawn());
    await q.keyboard.type("1"); await q.keyboard.press("p"); await q.waitForTimeout(150);
    const paused = await q.evaluate(() => { const c = document.querySelector(".gs-pause:not(.gs-dialog)"); return { up: !!c && !c.hidden, btns: c ? [...c.querySelectorAll("button")].filter((b) => !b.hidden).map((b) => b.textContent.replace(/\s+/g, " ").trim()).join(" | ") : "", box: document.getElementById("answer").value, shut: document.getElementById("answer").disabled }; });
    await q.keyboard.press("p"); await q.waitForTimeout(150);
    const back = await q.evaluate(() => ({ up: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, box: document.getElementById("answer").value, focused: document.activeElement.id }));
    await q.evaluate(() => { __mz.spawn(); });
    await q.keyboard.press("Escape"); await q.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {});
    const asked = await q.evaluate(() => ({ dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null, under: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden }));
    await q.keyboard.press("Enter"); await q.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 5000 }).catch(() => {});   // (Keep playing: Enter sends answers here, so it mustn't leave)
    check("metazac: P pauses from the answer box (no p typed), the card wearing Resume P, Restart R, Menu ⌫; P resumes with the box in hand; Esc mid-run asks 'Leave this game?' with the run paused under it",
      paused.up && /Resume P \| .*Restart R \| .*Menu ⌫$/.test(paused.btns) && paused.box === "1" && paused.shut && !back.up && back.box === "1" && back.focused === "answer" &&
      asked.dlg === "Leave this game?" && asked.under && q.leaves === 0, { paused, back, asked, leaves: q.leaves });
    check("metazac (P pauses): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- a laptop's short window (the stacked page is 953 px tall): the map
  // stands beside a column with the sign, stats and answer box, so the whole
  // page fits the window. Starting a game (the answer box takes the focus), a
  // wrong answer, a pause and a dart storm never scroll it; the start card
  // fits whole (over the map, or on a small map over the whole window);
  // nothing is under the corner buttons. So too a narrow short window and a
  // touch screen on its side, down to an iPhone SE's (t: touch).
  for (const [w, h, t] of [[1366, 657], [1280, 600], [1024, 600], [800, 600], [1024, 768, 1], [844, 390, 1], [667, 375, 1]]) {
    const c = await lib.newContext(browser, Object.assign({ viewport: { width: w, height: h } }, t ? { hasTouch: true, isMobile: true } : {}));
    const q = await lib.open(c, base, "games/metazac/", { before: (pg) => lib.injectScript(pg, "games/metazac/game.js", [HOOK]) });
    const at = () => q.evaluate(() => ({ y: Math.round(scrollY), tall: document.documentElement.scrollHeight - innerHeight, wide: document.documentElement.scrollWidth - innerWidth }));
    const menu = await q.evaluate(() => {
      const box = (e) => e.getBoundingClientRect(), o = document.getElementById("overlay-start");
      const corner = [...document.querySelectorAll(".nav-back-games, .gs-corner > *")].filter((e) => e.getClientRects().length).map(box);
      const parts = ["#game", ".title", ".stats", "#answer", "#power-btn"].map((s) => document.querySelector(s)).map(box);
      const meet = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return { cardScroll: o.scrollHeight - o.clientHeight, under: parts.filter((p) => corner.some((k) => meet(p, k))).length, map: Math.round(box(document.getElementById("game")).width) };
    });
    const steps = { menu: await at() };
    if (t) await q.evaluate(() => document.getElementById("start-btn").click()); else await q.keyboard.press("Enter");
    await q.waitForTimeout(400);
    steps.start = await at();
    await q.evaluate(() => __mz.spawn());
    await q.keyboard.type("99999"); await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    steps.wrong = await at();
    await q.keyboard.press("p"); await q.waitForTimeout(150); await q.keyboard.press("p"); await q.waitForTimeout(150);
    steps.resumed = await at();
    await q.keyboard.press(" "); await q.waitForTimeout(300);
    steps.storm = await at();
    const focused = await q.evaluate(() => document.activeElement.id);
    const what = "metazac, a " + w + " x " + h + (t ? " touch screen" : " window");
    check(what + ": the whole page fits, and starting a game, a wrong answer, a pause and a dart storm never scroll it",
      Object.values(steps).every((s) => s.y === 0 && s.tall <= 0 && s.wide <= 0) && focused === "answer", { steps, focused });
    check(what + ": the start card fits whole, and nothing is under the corner buttons",
      menu.cardScroll <= 0 && menu.under === 0 && menu.map >= 400, menu);
    check(what + ": no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  await ctx.close();
};
