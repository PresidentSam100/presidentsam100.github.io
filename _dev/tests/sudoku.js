// Sudoku's clock only runs while you can see the board: a tab that opens
// hidden (a Ctrl+click from the games page), a saved game resumed there, or
// a puzzle that finishes printing after you've switched away all start
// paused, so the time isn't spent before you're there. Every row of the
// board keeps its share whatever is written in it, and the hand's 1 stands
// on a foot, so it can't pass for its 7, the pad's counts' 1 too. A hint
// fills in a square for 30 s on the clock, for good, and a solve with hints
// still sets a best time.
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

  // ---- every row of the board stays its share however much is written in
  // it (sized by their content, the rows a digit went into grew and the rest
  // shrank, by 7 px on a laptop); and the hand's 1 stands on a foot, so it
  // can't be taken for its 7: the face's own foot where it has one, else one
  // drawn under the stem (Caveat's 1 has none: a stand-in face without one
  // here, Arial, as the suites don't load web fonts). Judged by the ink in
  // the square: the bottom of the 1 several times as wide as its stem, and
  // much wider than the bottom of the 7. On a laptop and a phone
  {
    const { devices } = require("@playwright/test");
    const CAVEAT = '@font-face { font-family: "Caveat"; src: local("Arial"); font-weight: 100 900; }';
    const seen = {};
    for (const [label, opts] of [["laptop", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ["phone", Object.assign({}, devices["Pixel 7"], { deviceScaleFactor: 3 })]]) {
      const c = await lib.newContext(browser, opts);
      await c.route(/fonts\.googleapis/, (r) => r.fulfill({ contentType: "text/css", body: CAVEAT }));
      const q = await lib.open(c, base, "games/sudoku/");
      await q.waitForSelector("#board .c.given", { timeout: 15000 });
      await q.evaluate(() => document.fonts.ready); await q.waitForTimeout(300);
      const heights = () => q.evaluate(() => [...new Set([...document.querySelectorAll("#board .c")].map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10))]);
      const before = await heights();
      // an empty square where each digit breaks no rule (so it's in pen, not red, and no ring)
      const spot = (d) => q.evaluate((d) => {
        const cells = [...document.querySelectorAll("#board .c")].map((e) => { const r = e.getBoundingClientRect(); return { e, x: r.left, y: r.top, v: (e.querySelector(".v") || {}).textContent || "" }; });
        const xs = [...new Set(cells.map((c) => Math.round(c.x)))].sort((a, b) => a - b), ys = [...new Set(cells.map((c) => Math.round(c.y)))].sort((a, b) => a - b);
        cells.forEach((c) => { c.c = xs.indexOf(Math.round(c.x)); c.r = ys.indexOf(Math.round(c.y)); });
        const free = cells.find((a) => !a.v && !cells.some((b) => b.v === d && (b.r === a.r || b.c === a.c || (Math.floor(b.r / 3) === Math.floor(a.r / 3) && Math.floor(b.c / 3) === Math.floor(a.c / 3)))));
        if (!free) return null;
        free.e.setAttribute("data-probe", d);
        return true;
      }, d);
      const r = seen[label] = {};
      for (const d of ["7", "1"]) { if (await spot(d)) { await q.click('[data-probe="' + d + '"]'); await q.keyboard.press(d); await q.waitForTimeout(250); } }
      r.rows = { before, after: await heights() };
      // the ink of each digit: the width of its bottom, and of the 1's stem
      const inkOf = async (d) => {
        const el = q.locator('[data-probe="' + d + '"]');
        if (!(await el.count())) return null;
        const png = (await el.screenshot()).toString("base64");
        return q.evaluate((png) => new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
            const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
            const px = g.getImageData(0, 0, cv.width, cv.height).data, m = Math.round(cv.width * 0.12);
            const row = (y) => { let a = -1, b = -1; for (let x = m; x < cv.width - m; x++) { const i = (y * cv.width + x) * 4; if (px[i] + px[i + 1] + px[i + 2] < 360) { if (a < 0) a = x; b = x; } } return a < 0 ? 0 : b - a + 1; };
            // (the widest row of ink in the bottom 15% of the digit, so a foot that
            // leans still shows its whole width)
            const low = (row, top, bottom) => { let w = 0; for (let y = bottom - Math.max(2, Math.round((bottom - top) * 0.15)); y <= bottom; y++) w = Math.max(w, row(y)); return w; };
            let top = -1, bottom = -1;
            for (let y = m; y < cv.height - m; y++) if (row(y)) { if (top < 0) top = y; bottom = y; }
            const h = bottom - top;
            res({ h, stem: row(Math.round(top + h * 0.6)), bottom: low(row, top, bottom) });
          };
          img.src = "data:image/png;base64," + png;
        }), png);
      };
      r.one = await inkOf("1"); r.seven = await inkOf("7");
      await q.close(); await c.close();
    }
    check("sudoku: every row of the board keeps its share, written in or not (laptop and phone)",
      ["laptop", "phone"].every((k) => { const r = seen[k].rows; return r.before.length === 1 && r.after.length === 1 && r.after[0] === r.before[0]; }), seen);
    check("sudoku: the hand's 1 stands on a foot (its bottom three times its stem or more), so it can't pass for its 7 (the 1's bottom twice the 7's or more); laptop and phone",
      ["laptop", "phone"].every((k) => { const { one, seven } = seen[k]; return one && seven && one.h > 10 && one.bottom >= one.stem * 3 && one.bottom >= seven.bottom * 2; }), seen);
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

  // A save written in before the game reads it, on the next load (a reload
  // saves the puzzle on its way out, so it can't be set from the page)
  const plant = (pg) => pg.addInitScript(() => {
    try {
      const m = sessionStorage.getItem("__plant");
      if (m) { sessionStorage.removeItem("__plant"); const o = JSON.parse(m); localStorage.setItem(o.k, o.v); }
    } catch (e) {}
  });
  const readSave = (q) => q.evaluate(() => JSON.parse(localStorage.getItem("sudoku_save_easy")));
  const replant = async (q, o) => {
    await q.evaluate((v) => sessionStorage.setItem("__plant", JSON.stringify({ k: "sudoku_save_easy", v })), JSON.stringify(o));
    await q.reload({ waitUntil: "domcontentloaded" });
    await q.waitForSelector("#board .c.given", { timeout: 15000 });
    await q.waitForTimeout(300);
  };
  // marks the square at row-major index `at` (the board nests its squares in boxes)
  const mark = (q, at, name) => q.evaluate(({ at, name }) => {
    const cells = [...document.querySelectorAll("#board .c")].map((e) => { const b = e.getBoundingClientRect(); return { e, x: b.left, y: b.top }; });
    cells.sort((a, b) => Math.round(a.y) - Math.round(b.y) || a.x - b.x);
    cells[at].e.setAttribute("data-probe", name);
  }, { at, name });

  // ---- a hint fills in a square and puts 30 s on the clock at once, for
  // good: undoing the square, reloading or restarting the puzzle never gives
  // the time back. A wrong digit is put right. A solve with hints still sets
  // a best time, with their 30 s in it (hinted solves were unranked, and a
  // hint was free). On a laptop and a phone
  {
    const { devices } = require("@playwright/test");
    const seen = {};
    for (const [label, opts] of [["laptop", { viewport: { width: 1280, height: 900 } }], ["phone", devices["Pixel 7"]]]) {
      const c = await lib.newContext(browser, opts);
      const q = await lib.open(c, base, "games/sudoku/", { before: plant });
      await q.waitForSelector("#board .c.given", { timeout: 15000 });
      await q.waitForTimeout(300);
      const secs = () => q.evaluate(() => document.getElementById("timer").textContent.split(":").reduce((a, b) => a * 60 + +b, 0));
      // the squares you've written in, and whether every one is the answer
      const board = async () => {
        const sv = await readSave(q);
        let mine = 0, right = true;
        for (let i = 0; i < 81; i++) if (sv.p[i] === "0" && sv.g[i] !== "0") { mine++; if (sv.g[i] !== sv.s[i]) right = false; }
        return { mine, right, h: sv.h };
      };
      const r = seen[label] = {};
      // (the clock reads whole seconds, and a busy machine can take a while
      // between two readings: each check allows for the time that passed)
      const w0 = Date.now(), t0 = await secs(), b0 = await board();
      await q.click("#hintBtn"); await q.waitForTimeout(150);
      const t1 = await secs(), b1 = await board(), s1 = (Date.now() - w0) / 1000;
      r.hint = { t0, t1, b0, b1, s1 };
      await q.click("#undoBtn"); await q.waitForTimeout(150);
      r.undo = { t: await secs(), b: await board() };
      // a wrong digit in an empty square, then a hint
      const sv = await readSave(q);
      const at = [...sv.g].findIndex((v, i) => v === "0" && sv.p[i] === "0");
      const wrongD = String((+sv.s[at] % 9) + 1);
      await mark(q, at, "wrong");
      await q.click('[data-probe="wrong"]'); await q.keyboard.press(wrongD); await q.waitForTimeout(150);
      const was = (await readSave(q)).g[at], w2 = Date.now(), t2 = await secs();
      await q.click("#hintBtn"); await q.waitForTimeout(150);
      const sv2 = await readSave(q);
      r.wrong = { at, wrongD, was, t2, t3: await secs(), s3: (Date.now() - w2) / 1000, now: sv2.g[at], answer: sv2.s[at] };
      // a reload, then a restart of the puzzle from the pause card
      await q.reload({ waitUntil: "domcontentloaded" }); await q.waitForSelector("#board .c.given", { timeout: 15000 }); await q.waitForTimeout(300);
      r.reload = { t: await secs(), badge: await q.textContent("#hintBadge") };
      await q.keyboard.press("p"); await q.waitForTimeout(200);
      await q.keyboard.press("r"); await q.waitForSelector(".gs-dialog", { timeout: 3000 }).catch(() => {});
      r.asked = await q.evaluate(() => (document.querySelector(".gs-dialog") || {}).innerText || "");
      const w4 = Date.now();
      await q.keyboard.press("Enter"); await q.waitForTimeout(300);
      r.restart = { t: await secs(), s: (Date.now() - w4) / 1000, b: await board(), badge: await q.textContent("#hintBadge") };
      // a puzzle one square from done, 5 s in and no hints: the hint finishes it
      const last = await readSave(q);
      const gap = [...last.p].findIndex((v) => v === "0");
      const g = [...last.s].map((v, i) => (i === gap ? "0" : v)).join("");
      await replant(q, Object.assign({}, last, { g, n: new Array(81).fill(0), t: 5000, h: 0 }));
      await q.click("#hintBtn"); await q.waitForTimeout(400);
      r.win = await q.evaluate(() => ({ won: document.getElementById("field").classList.contains("won"), best: localStorage.getItem("sudoku_best_easy"), status: document.getElementById("status").textContent, stats: document.getElementById("stats").textContent }));
      r.errs = q.errs;
      await q.close(); await c.close();
    }
    check("sudoku: a hint fills in a right digit and puts 30 s on the clock at once; undoing it keeps the time on (laptop and phone)",
      ["laptop", "phone"].every((k) => { const { hint, undo } = seen[k]; return hint.b1.mine === hint.b0.mine + 1 && hint.b1.right && hint.b1.h === 1 && hint.t1 - hint.t0 >= 30 && hint.t1 - hint.t0 <= 31 + Math.floor(hint.s1) && undo.b.mine === hint.b0.mine && undo.t >= hint.t1; }), seen);
    check("sudoku: a hint at a wrong digit puts it right, for another 30 s (laptop and phone)",
      ["laptop", "phone"].every((k) => { const w = seen[k].wrong; return w.was === w.wrongD && w.now === w.answer && w.t3 - w.t2 >= 30 && w.t3 - w.t2 <= 31 + Math.floor(w.s3); }), seen);
    check("sudoku: the hints' time stays on the clock through a reload and a restart of the puzzle (two hints: a minute, on a cleared board), and they stay counted (laptop and phone)",
      ["laptop", "phone"].every((k) => { const { reload, restart, wrong } = seen[k]; return reload.t >= wrong.t3 && reload.badge === "2" && restart.b.mine === 0 && restart.t >= 60 && restart.t <= 61 + Math.floor(restart.s) && restart.badge === "2"; }), seen);
    check("sudoku: asked before that restart, it says the 1:00 the two hints cost stays on the clock (laptop and phone)",
      ["laptop", "phone"].every((k) => /The 1:00 your 2 hints cost stays on the clock/.test(seen[k].asked)), ["laptop", "phone"].map((k) => seen[k].asked));
    check("sudoku: a solve with hints sets a best time, the hint's 30 s in it (laptop and phone)",
      ["laptop", "phone"].every((k) => { const w = seen[k].win; return w.won && +w.best >= 35 && +w.best <= 45 && /new best/.test(w.status) && /\+0:30/.test(w.status); }), seen);
    check("sudoku hint penalty: no page errors", ["laptop", "phone"].every((k) => !seen[k].errs.length), ["laptop", "phone"].map((k) => seen[k].errs));
  }

  // ---- the pad's counts in pencil are in the hand too, so a count of 1
  // stands on a foot like every other 1 of the hand (it was the bare flag
  // and stem, like a 7). Arial standing in for Caveat, as above; a digit
  // with eight placed shows a 1. On a laptop and a phone
  {
    const { devices } = require("@playwright/test");
    const CAVEAT = '@font-face { font-family: "Caveat"; src: local("Arial"); font-weight: 100 900; }';
    const seen = {};
    for (const [label, opts] of [["laptop", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3 }], ["phone", Object.assign({}, devices["Pixel 7"], { deviceScaleFactor: 3 })]]) {
      const c = await lib.newContext(browser, opts);
      await c.route(/fonts\.googleapis/, (r) => r.fulfill({ contentType: "text/css", body: CAVEAT }));
      const q = await lib.open(c, base, "games/sudoku/", { before: plant });
      await q.waitForSelector("#board .c.given", { timeout: 15000 });
      await q.waitForTimeout(300);
      const sv = await readSave(q);
      const placed = (d) => [...sv.p].filter((v) => v === d).length;
      const d = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].find((d) => placed(d) <= 8);
      let n = placed(d);
      const g = [...sv.p].map((v, i) => (v === "0" && sv.s[i] === d && n < 8 ? (n++, d) : v)).join("");
      await replant(q, Object.assign({}, sv, { g }));
      await q.evaluate(() => document.fonts.ready);
      await q.click("#notesBtn"); await q.waitForTimeout(250);
      await q.addStyleTag({ content: ".key small { color: #000 !important; }" });
      await q.waitForTimeout(100);
      const png = (await q.locator('.key[data-d="' + d + '"] small').screenshot()).toString("base64");
      seen[label] = await q.evaluate(({ png, d }) => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
          const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
          const px = g.getImageData(0, 0, cv.width, cv.height).data;
          const row = (y) => { let a = -1, b = -1; for (let x = 0; x < cv.width; x++) { const i = (y * cv.width + x) * 4; if (px[i] + px[i + 1] + px[i + 2] < 360) { if (a < 0) a = x; b = x; } } return a < 0 ? 0 : b - a + 1; };
          // (the widest row of ink in the bottom 15% of the digit, so a foot that
          // leans still shows its whole width)
          const low = (row, top, bottom) => { let w = 0; for (let y = bottom - Math.max(2, Math.round((bottom - top) * 0.15)); y <= bottom; y++) w = Math.max(w, row(y)); return w; };
          let top = -1, bottom = -1;
          for (let y = 0; y < cv.height; y++) if (row(y)) { if (top < 0) top = y; bottom = y; }
          const h = bottom - top;
          res({ d, text: document.querySelector('.key[data-d="' + d + '"] small').textContent, notes: document.getElementById("pad").classList.contains("notes-on"), h, stem: row(Math.round(top + h * 0.6)), bottom: low(row, top, bottom) });
        };
        img.src = "data:image/png;base64," + png;
      }), { png, d });
      seen[label].errs = q.errs;
      await q.close(); await c.close();
    }
    check("sudoku: in pencil, the pad's count of 1 stands on a foot like the hand's other 1s (its bottom two and a half times its stem or more); laptop and phone",
      ["laptop", "phone"].every((k) => { const r = seen[k]; return r.text === "1" && r.notes && r.h > 8 && r.bottom >= r.stem * 2.5 && !r.errs.length; }), seen);
  }
};
