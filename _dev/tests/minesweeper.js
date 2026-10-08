// Minesweeper: the title bar's × and the Classic / Daily / Endless tabs are
// ways out of a game too, so mid-game they ask "Leave this game?" like
// ← Games does; once you confirm, a tab still goes to its own page.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const settle = (p) => p.waitForTimeout(250);
  const dlg = (p) => p.evaluate(() => { const h = document.querySelector(".gs-dialog h2"); return h ? h.textContent : null; });
  // a real mouse click on the middle cell (on Endless a right-click: a flag starts the run)
  const midCell = async (p, button) => {
    const pt = await p.evaluate(() => { const c = document.querySelectorAll(".field .c"); const e = c[Math.floor(c.length / 2)]; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.click(pt.x, pt.y, button ? { button } : undefined); await settle(p);
  };
  const done = async (p, g) => { check(g + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- Classic: × asks mid-game, Enter leaves for the games page
  let p = await lib.open(ctx, base, "games/minesweeper/");
  await midCell(p);
  await p.click(".tb-close"); await settle(p);
  const closeAsk = await dlg(p), closeHeld = p.leaves;
  await p.keyboard.press("Enter"); await settle(p);
  check("minesweeper: mid-game the title bar's × asks 'Leave this game?'; Enter leaves",
    closeAsk === "Leave this game?" && closeHeld === 0 && p.leaves === 1, { closeAsk, closeHeld, leaves: p.leaves });
  await done(p, "minesweeper ×");

  // ---- Classic: the Daily tab asks mid-game, then opens the daily board
  p = await lib.open(ctx, base, "games/minesweeper/");
  await midCell(p);
  await p.click("#navDaily"); await settle(p);
  const tabAsk = await dlg(p), tabUrl = p.url();
  await Promise.all([p.waitForURL(/\?daily$/, { timeout: 8000 }).catch(() => {}), p.keyboard.press("Enter")]);
  check("minesweeper: mid-game the Daily tab asks first; Leave opens the daily board, not the games page",
    tabAsk === "Leave this game?" && !/\?daily/.test(tabUrl) && /\?daily$/.test(p.url()) && p.leaves === 0, { tabAsk, tabUrl, url: p.url(), leaves: p.leaves });
  await p.close();

  // ---- Endless: × asks mid-run (Esc keeps playing); the Classic tab asks, then goes to Classic
  p = await lib.open(ctx, base, "games/minesweeper/endless.html");
  await midCell(p, "right");
  await p.click(".tb-close"); await settle(p);
  const eClose = await dlg(p);
  await p.keyboard.press("Escape"); await settle(p);
  const eKept = { dlg: await dlg(p), leaves: p.leaves };
  await p.click('.mode[href="./"]'); await settle(p);
  const eTab = await dlg(p);
  await Promise.all([p.waitForURL(/\/minesweeper\/$/, { timeout: 8000 }).catch(() => {}), p.keyboard.press("Enter")]);
  check("minesweeper endless: mid-run × and the Classic tab ask first; Esc keeps playing, Leave on the tab opens Classic",
    eClose === "Leave this game?" && !eKept.dlg && eKept.leaves === 0 && eTab === "Leave this game?" && /\/minesweeper\/$/.test(p.url()) && p.leaves === 0,
    { eClose, eKept, eTab, url: p.url(), leaves: p.leaves });
  await p.close();

  // ---- nothing in play: a tab goes straight to its page
  p = await lib.open(ctx, base, "games/minesweeper/");
  await Promise.all([p.waitForURL(/\?daily$/, { timeout: 8000 }).catch(() => {}), p.click("#navDaily")]);
  check("minesweeper: before the first dig the Daily tab opens at once, no box", /\?daily$/.test(p.url()) && !(await dlg(p)), p.url());
  await p.close();

  await ctx.close();
};
