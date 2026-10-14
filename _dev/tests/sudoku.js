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

  // ---- a wide window: nothing to scroll to. The levels, New puzzle, the
  // record and How to play stand beside the board, with the pad and the tools
  // on its other side, all inside the window at once, How to play shut or open
  // (it scrolls inside its own column). On a big window and on short laptops.
  {
    const sizes = [[1700, 920], [1280, 900], [1366, 657], [1280, 600]], seen = {};
    let ok = true;
    for (const [w, h] of sizes) {
      const c = await lib.newContext(browser, { viewport: { width: w, height: h } });
      const q = await lib.open(c, base, "games/sudoku/");
      await q.waitForSelector("#board .c.given", { timeout: 20000 });
      await q.waitForTimeout(250);
      const look = () => q.evaluate(() => {
        const H = innerHeight, W = innerWidth, r = (e) => e.getBoundingClientRect();
        const inView = (e) => { const b = r(e); return b.width > 0 && b.height > 0 && b.top >= -0.5 && b.bottom <= H + 0.5 && b.left >= -0.5 && b.right <= W + 0.5; };
        const all = (sel) => [...document.querySelectorAll(sel)];
        const board = r(document.getElementById("board"));
        return {
          scroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - H,
          board: Math.round(board.width),
          levels: all(".levels .lvl").filter(inView).length, keys: all("#pad .key").filter(inView).length, tools: all(".tools .tool").filter(inView).length,
          newBtn: inView(document.getElementById("newBtn")), stats: inView(document.getElementById("stats")), rules: inView(document.querySelector(".rules summary")),
          status: inView(document.getElementById("status")), boardIn: inView(document.getElementById("board")), mast: inView(document.querySelector(".nameplate")),
          // (nothing lies over the board, and the two sides don't run into each other)
          clear: all(".side > *").every((e) => { const b = r(e); return b.right <= board.left + 0.5 || b.left >= board.right - 0.5; }),
        };
      });
      const shut = await look();
      await q.click(".rules summary"); await q.waitForTimeout(150);
      const open = await look();
      const rulesBox = await q.evaluate(() => { const e = document.querySelector(".rules"); return { scrolls: e.scrollHeight > e.clientHeight + 1, lastShown: (() => { e.scrollTop = e.scrollHeight; const p = [...e.querySelectorAll("p")].filter((x) => getComputedStyle(x).display !== "none").pop().getBoundingClientRect(); return p.bottom <= innerHeight + 0.5 && p.height > 8; })() }; });
      const good = (s) => s.scroll <= 0 && s.levels === 4 && s.keys === 9 && s.tools === 4 && s.newBtn && s.stats && s.rules && s.status && s.boardIn && s.mast && s.clear && s.board >= 300;
      seen[w + "x" + h] = { shut, open, rulesBox };
      if (!(good(shut) && good(open) && rulesBox.lastShown)) ok = false;
      if (q.errs.length) { ok = false; seen[w + "x" + h].errs = q.errs; }
      await q.close(); await c.close();
    }
    check("sudoku, a wide window (1700 x 920, 1280 x 900, 1366 x 657, 1280 x 600): the four levels, New puzzle, the record, How to play, the nine digits and the four tools are all on the screen beside the board with nothing to scroll to, How to play shut or open (it scrolls in its own column, to its last line)", ok, seen);
  }
};
