// Sudoku's clock only runs while you can see the board: a tab that opens
// hidden (a Ctrl+click from the games page), a saved game resumed there, or
// a puzzle that finishes printing after you've switched away all start
// paused, so the time isn't spent before you're there.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  // document.hidden, as the page sees it, follows window.__hidden
  const hide = (start) => (pg) => pg.addInitScript((start) => {
    window.__hidden = start;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !!window.__hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__hidden ? "hidden" : "visible") });
  }, start);
  const look = (p) => p.evaluate(() => ({ clock: document.getElementById("timer").textContent, paused: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden }));
  const done = async (p, g) => { check(g + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- opened hidden: a fresh puzzle, then the saved one on reload
  let p = await lib.open(ctx, base, "games/sudoku/", { before: hide(true) });
  await p.waitForTimeout(1600);
  const fresh = await look(p);
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(1600);
  const resumed = await look(p);
  check("sudoku: in a tab that opens hidden the clock waits, paused (a fresh puzzle and a resumed save)",
    fresh.clock === "0:00" && fresh.paused && resumed.clock === "0:00" && resumed.paused, { fresh, resumed });
  await done(p, "sudoku hidden tab");

  // ---- visible: the clock runs; a puzzle printed after you've switched away waits
  p = await lib.open(ctx, base, "games/sudoku/", { before: hide(false) });
  await p.waitForTimeout(1300);
  const shown = await look(p);
  await p.evaluate(() => { window.__hidden = true; });
  await p.click('.lvl[data-level="medium"]');
  await p.waitForFunction(() => document.getElementById("puzzleNo").textContent !== "No. —", null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1300);
  const printed = await look(p);
  check("sudoku: the clock runs on a board you can see; a puzzle printed while the tab is hidden starts paused",
    shown.clock !== "0:00" && !shown.paused && printed.clock === "0:00" && printed.paused, { shown, printed });
  await done(p, "sudoku printed hidden");
  await ctx.close();

  // ---- the Keyboard how-to shows with a keyboard, not on a phone (the tap one shows on both)
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const keys = label === "desktop";
    const c2 = await lib.newContext(browser, opts);
    p = await lib.open(c2, base, "games/sudoku/");
    const how = await p.evaluate(() => { const d = document.querySelector(".rules"); d.open = true; return d.innerText; });
    check("sudoku on a " + label + ": the Keyboard how-to " + (keys ? "shows" : "is hidden") + ", the tap how-to shows",
      /Keyboard:/.test(how) === keys && /Tap or click/.test(how), how.slice(0, 400));
    await done(p, "sudoku " + label + " hints");
    await c2.close();
  }
};
