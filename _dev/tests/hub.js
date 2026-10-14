// The games page: Enter is 🎲 random game and Esc is 🗑️ reset all high scores,
// each key shown on its button (not on a touch-only device). Enter on a game's
// card, reached by Tab, still opens that game. In the reset box only Enter
// resets: Esc, a letter or an arrow cancels (the button says "any other key"),
// and a cancelled box clears nothing.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const seed = (pg) => pg.addInitScript(() => { try { localStorage.setItem("rushhour_best_day", "777"); localStorage.setItem("sudoku_prefs", "{\"level\":\"hard\"}"); } catch (e) {} });
  const open = (c) => lib.open(c, base, "games/", { waitCorner: false, before: seed });
  const gamePath = (p) => p.evaluate(() => (/\/games\/([^/]+)\//.exec(location.pathname) || [])[1] || null);
  const box = (p) => p.evaluate(() => { const d = document.getElementById("reset-dialog"); return { open: d.open, focus: document.activeElement && document.activeElement.className }; });
  const best = (p) => p.evaluate(() => ({ best: localStorage.getItem("rushhour_best_day"), prefs: localStorage.getItem("sudoku_prefs") }));

  // ---- the keys are on the buttons
  let p = await open(ctx);
  const caps = await p.evaluate(() => {
    const cap = (id) => { const k = document.querySelector("#" + id + " kbd"); return k && getComputedStyle(k).display !== "none" ? k.textContent : null; };
    return { random: cap("random-game"), reset: cap("reset-scores") };
  });
  check("games page: 🎲 random game shows Enter and 🗑️ reset all high scores shows Esc", caps.random === "Enter" && caps.reset === "Esc", caps);

  // ---- Esc opens the reset box; a letter, an arrow and Esc all cancel it; nothing is cleared
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const opened = await box(p);
  const words = await p.evaluate(() => ({ cancel: document.querySelector("#reset-dialog .dialog-cancel").textContent.replace(/\s+/g, " ").trim(), ok: document.querySelector("#reset-dialog .dialog-ok").textContent.replace(/\s+/g, " ").trim() }));
  await p.keyboard.press("Shift"); await p.keyboard.press("Tab"); await p.waitForTimeout(100);
  const still = await box(p);                                   // (Shift and Tab answer nothing)
  await p.keyboard.press("k"); await p.waitForTimeout(150);
  const afterLetter = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(150);
  const afterArrow = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const afterEsc = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("Space"); await p.waitForTimeout(150);  // (Cancel has the focus)
  const afterSpace = await box(p);
  const keptAll = await best(p);
  check("games page: Esc opens \"Reset all saved high scores?\" with Cancel focused; the box says any other key cancels and Enter resets",
    opened.open && /dialog-cancel/.test(opened.focus || "") && /^Cancel any other key$/.test(words.cancel) && /^Reset scores Enter$/.test(words.ok), { opened, words });
  check("games page: in the reset box a letter, an arrow, Esc and Space each cancel (Shift and Tab answer nothing), and nothing is cleared",
    still.open && !afterLetter.open && !afterArrow.open && !afterEsc.open && !afterSpace.open && keptAll.best === "777", { still, afterLetter, afterArrow, afterEsc, afterSpace, keptAll });

  // ---- ...and Enter resets: the scores go, a game's settings stay
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("Enter"); await p.waitForTimeout(250);
  const cleared = await best(p), closed = await box(p);
  check("games page: Enter in the reset box clears the high scores (and leaves a game's settings alone)",
    !closed.open && cleared.best === null && /hard/.test(cleared.prefs || ""), { closed, cleared });
  check("games page: Enter in the box hasn't also set off the random game", (await gamePath(p)) === null, await gamePath(p));

  // ---- Enter is the random game, from anywhere but a link or a button
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => /\/games\/[^/]+\//.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
  const went = await gamePath(p);
  check("games page: Enter opens a random game", !!went, went);
  check("games page: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Enter on a game's card (reached by Tab) opens that game, not a random one
  p = await open(ctx);
  const card = await p.evaluate(() => { const a = document.querySelectorAll(".games-grid .game-card")[7]; a.focus(); return a.getAttribute("href").replace(/^\.\//, "").replace(/\/$/, ""); });
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => /\/games\/[^/]+\//.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
  const opened2 = await gamePath(p);
  check("games page: Enter on a focused game card opens that game", opened2 === card, { card, opened2 });
  await p.close();
  await ctx.close();

  // ---- a touch-only phone: no keycaps on the buttons or in the box
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  p = await open(phone);
  await p.tap("#reset-scores"); await p.waitForTimeout(150);
  const touch = await p.evaluate(() => [...document.querySelectorAll(".reset-row kbd, #reset-dialog kbd, #reset-dialog .anykey")].filter((e) => getComputedStyle(e).display !== "none").length);
  check("games page, a touch-only phone: no keycaps on the two buttons or in the reset box", touch === 0, touch);
  check("games page (phone): no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await phone.close();
};
