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
  await p.waitForFunction(() => document.getElementById("puzzleNo").textContent !== "No. …", null, { timeout: 15000 }).catch(() => {});
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

  // ---- digits sit on the middle of their squares, by their ink. A font's
  // digits don't sit on the middle of its line: the printed clues rode high
  // and the pen's script digits low and well to the right. Measured here as
  // the game does (what the font draws, on a canvas), plus what the game moved
  // each digit by: clues and pen digits alike end up within a pixel of the
  // middle, in whichever font is showing.
  {
    const c3 = await lib.newContext(browser);
    const q = await lib.open(c3, base, "games/sudoku/");
    await q.waitForSelector("#board .c.given", { timeout: 15000 });
    // a pen digit in each of a few empty squares
    for (const d of ["1", "4", "7", "9"]) { await q.click("#board .c:not(.given):not(:has(.v))"); await q.keyboard.press(d); }
    await q.waitForTimeout(300);
    const ink = await q.evaluate(() => {
      const ctx2 = document.createElement("canvas").getContext("2d"), out = { given: [], pen: [] };
      document.querySelectorAll("#board .c").forEach((cell) => {
        const v = cell.querySelector(".v"); if (!v) return;
        const cs = getComputedStyle(cell), px = parseFloat(cs.fontSize);
        ctx2.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
        const f = ctx2.measureText("Hg"), m = ctx2.measureText(v.textContent);
        let up = 0, down = -1e9;
        for (let d = 1; d <= 9; d++) { const n = ctx2.measureText(String(d)); up = Math.max(up, n.actualBoundingBoxAscent); down = Math.max(down, n.actualBoundingBoxDescent); }
        const raw = { x: (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - m.width / 2, y: (f.fontBoundingBoxAscent - f.fontBoundingBoxDescent) / 2 + (down - up) / 2 };
        const moved = { x: (parseFloat(v.style.left) || 0) * px, y: (parseFloat(v.style.top) || 0) * px };
        out[cell.classList.contains("given") ? "given" : "pen"].push({ d: v.textContent, was: [+raw.x.toFixed(1), +raw.y.toFixed(1)], now: [+(raw.x + moved.x).toFixed(1), +(raw.y + moved.y).toFixed(1)] });
      });
      return out;
    });
    const off = (list) => Math.max(...list.map((o) => Math.max(Math.abs(o.now[0]), Math.abs(o.now[1]))));
    const was = (list) => Math.max(...list.map((o) => Math.max(Math.abs(o.was[0]), Math.abs(o.was[1]))));
    check("sudoku: the clues and the digits you write sit on the middle of their squares, by their ink (they rode off it by a pixel or more before being moved)",
      ink.given.length >= 17 && ink.pen.length === 4 && off(ink.given) <= 0.6 && off(ink.pen) <= 0.6 && was(ink.given.concat(ink.pen)) >= 1,
      { given: ink.given.slice(0, 3), pen: ink.pen, worst: { given: off(ink.given), pen: off(ink.pen) } });
    await done(q, "sudoku digit ink");
    await c3.close();
  }
};
