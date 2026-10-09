// Tile Maze: the board fits its panel (and a phone) whatever level came
// before; a reset or a new level drops the move still animating; the level
// clock holds while the window is away; the Tile Guide holds the board; the
// Level Editor link asks first mid-level; the editor's test play does the
// same on R / Stop test, one move per key press; the editor's Save updates
// the saved level it opened; progress is kept by level name (an old save
// carries over, and a re-sort can't move it); and key hints show only where
// there's a keyboard.
module.exports = async ({ browser, base, check, lib }) => {
  const seed = (save) => (pg) => pg.addInitScript((s) => { try { localStorage.setItem("tileMaze.v1", s); } catch (e) {} }, save);
  const cellPx = (p) => p.evaluate(() => parseInt(getComputedStyle(document.documentElement).getPropertyValue("--cell"), 10));
  const pick = async (p, n) => { await p.evaluate((n) => document.querySelectorAll("#levelPick .lvlbtn")[n - 1].click(), n); await p.waitForTimeout(100); };
  // is the ball drawn on the tile `sel`?
  const onTile = (p, sel, ball) => p.evaluate(([sel, ball]) => {
    const a = document.querySelector(ball).getBoundingClientRect(), b = document.querySelector(sel).getBoundingClientRect();
    return Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) < 2;
  }, [sel, ball || "#player"]);
  const moves = (p) => p.textContent("#moveCount");
  // Each move animates, and a key pressed mid-move is ignored (slower on a busy
  // machine, so a fixed beat could drop a move): where the page exposes the
  // game's move lock (the desktop context below), wait for it to open.
  const keys = async (p, seq) => {
    for (const k of seq) {
      await p.keyboard.press({ R: "ArrowRight", L: "ArrowLeft", U: "ArrowUp", D: "ArrowDown" }[k]);
      if (await p.evaluate(() => typeof window.__tmLocked === "function")) await p.waitForFunction(() => !window.__tmLocked(), null, { timeout: 10000 }).catch(() => {});
      else await p.waitForTimeout(400);
    }
  };
  const done = async (p, what) => { check("tile-maze " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- the board's size comes from its panel, not from the last board drawn
  let ctx = await lib.newContext(browser, { viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
  let p = await lib.open(ctx, base, "games/tile-maze/", { before: seed('{"unlocked":60}') });
  const over = await p.evaluate(() => {
    const out = [];
    for (let i = 0; i < 60; i++) {
      document.querySelectorAll("#levelPick .lvlbtn")[i].click();
      const b = document.getElementById("board").getBoundingClientRect(), w = document.querySelector(".boardwrap");
      const inner = w.getBoundingClientRect().right - parseFloat(getComputedStyle(w).paddingRight);
      if (b.right > inner + 0.5 || document.documentElement.scrollWidth > 375) out.push(i + 1);
    }
    return out;
  });
  check("tile-maze: on a 375 px phone every level's board fits its panel, the page never wider than the screen", over.length === 0, over);
  await done(p, "phone");
  await ctx.close();

  ctx = await lib.newContext(browser);
  // (the game served with its move lock exposed, for keys() above)
  const tmSrc = require("fs").readFileSync(require("path").join(lib.ROOT, "games/tile-maze/game.js"), "utf8");
  if (!tmSrc.includes("  async function doMove(dir) {")) throw new Error("tile-maze: game.js anchor not found");
  const tmHooked = tmSrc.replace("  async function doMove(dir) {", "  window.__tmLocked = function () { return locked; };\n  async function doMove(dir) {");
  await ctx.route(/\/games\/tile-maze\/game\.js$/, (r) => r.fulfill({ contentType: "text/javascript", body: tmHooked }));
  const edSrc = require("fs").readFileSync(require("path").join(lib.ROOT, "games/tile-maze/editor.js"), "utf8");
  if (!edSrc.includes("  async function testMove(dir) {")) throw new Error("tile-maze: editor.js anchor not found");
  const edHooked = edSrc.replace("  async function testMove(dir) {", "  window.__tmLocked = function () { return tlocked; };\n  async function testMove(dir) {");
  await ctx.route(/\/games\/tile-maze\/editor\.js$/, (r) => r.fulfill({ contentType: "text/javascript", body: edHooked }));
  p = await lib.open(ctx, base, "games/tile-maze/", { before: seed('{"unlocked":3}') });
  const c3 = await cellPx(p);
  await pick(p, 1); await pick(p, 3);
  const c3b = await cellPx(p);
  check("tile-maze: on a wide screen the board is drawn full size, the same whichever level came before", c3 >= 56 && c3b === c3, { first: c3, again: c3b });

  // ---- (a) R mid-slide (level 3's ice): back on START, and the next move starts there
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(120);
  await p.keyboard.press("r"); await p.waitForTimeout(900);
  const home = await onTile(p, ".t-start");
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(900);
  const m = await moves(p);
  check("tile-maze: R during an ice slide puts the ball back on START, and the next move starts from there", home && m === "1", { home, moves: m });

  // ---- (b) Next ▶ during the winning slide: no "Level Complete!" over the next level
  await pick(p, 1);
  await keys(p, "RRRDDLL");
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(30);
  await p.evaluate(() => document.getElementById("nextBtn").click());
  await p.waitForTimeout(900);
  const b = await p.evaluate(() => ({ lvl: document.getElementById("lvlNum").textContent, overlay: !document.getElementById("overlay").hidden, won1: document.querySelectorAll("#levelPick .lvlbtn")[0].classList.contains("done") }));
  check("tile-maze: Next during the winning slide opens level 2 with no Level Complete card over it (the win still counts)", b.lvl === "2" && !b.overlay && b.won1, b);

  // ---- (c) R just after a win: the fresh board gets no Level Complete card
  await pick(p, 1);
  await keys(p, "RRRDDLL");
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(250);
  await p.keyboard.press("r"); await p.waitForTimeout(600);
  const c = await p.evaluate(() => ({ overlay: !document.getElementById("overlay").hidden, moves: document.getElementById("moveCount").textContent }));
  check("tile-maze: R right after a win resets the board without the Level Complete card popping up on it", !c.overlay && c.moves === "0", c);

  // ---- (d) R during a wall bump: the ball isn't put back where it bumped
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(400);
  await p.keyboard.press("ArrowUp"); await p.waitForTimeout(40);
  await p.keyboard.press("r"); await p.waitForTimeout(400);
  check("tile-maze: R during a wall bump leaves the ball drawn on START", await onTile(p, ".t-start"));

  // ---- the level clock holds while the window is away
  const secs = () => p.evaluate(() => parseFloat(document.getElementById("timeVal").textContent));
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(400);
  // away for 1.5 s of the page's own time, with the shown clock read either side
  // and the time that really passed: the clock may run while the page is here
  // (more on a busy machine) but has to hold for the 1.5 s it's away
  const away = await p.evaluate(async () => {
    const shown = () => parseFloat(document.getElementById("timeVal").textContent), frame2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await frame2(); const t0 = shown(), w0 = performance.now();
    window.dispatchEvent(new Event("blur"));
    await new Promise((r) => setTimeout(r, 1500));
    window.dispatchEvent(new Event("focus"));
    await frame2(); return { t0, t1: shown(), wall: (performance.now() - w0) / 1000 };
  });
  check("tile-maze: the level clock holds while the window is away", away.t1 - away.t0 < away.wall - 1.0, away);

  // ---- the Tile Guide holds the board
  await p.keyboard.press("r"); await p.waitForTimeout(100);
  await p.click("#guideBtn");
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(300);
  const g = { moves: await moves(p), home: await onTile(p, ".t-start") };
  await p.keyboard.press("Escape");
  check("tile-maze: arrows do nothing to the board while the Tile Guide is open", g.moves === "0" && g.home, g);

  // ---- the Level Editor link asks first mid-level
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(400);
  await p.click("a.editor-link"); await p.waitForTimeout(300);
  const e = await p.evaluate(() => ({ dlg: !!document.querySelector(".gs-dialog"), path: location.pathname }));
  check("tile-maze: the Level Editor link asks before leaving a level in progress", e.dlg && /\/tile-maze\/$/.test(e.path), e);
  await done(p, "game");

  // ---- the editor's Copy where the clipboard refuses (no permission): no error
  p = await lib.open(ctx, base, "games/tile-maze/editor.html");
  await p.evaluate(() => { if (navigator.clipboard) navigator.clipboard.writeText = () => Promise.reject(new Error("Write permission denied.")); });
  await p.click("#exportBtn"); await p.waitForTimeout(100);
  await p.click("#copyBtn"); await p.waitForTimeout(300);
  check("tile-maze editor: Copy where the clipboard refuses throws no error (the copy falls back)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the editor's test play: R and Stop test drop the move animating; held keys move once
  p = await lib.open(ctx, base, "games/tile-maze/editor.html");
  await p.click("#testBtn"); await p.waitForTimeout(100);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(40);
  await p.keyboard.press("r"); await p.waitForTimeout(400);
  check("tile-maze editor: R during a test move puts the ball back on START", await onTile(p, "#edBoard .t-start", "#frame .player"));
  await p.keyboard.press("r"); await p.waitForTimeout(100);
  await lib.fireKey(p, { key: "ArrowRight", code: "ArrowRight", repeat: true }); await p.waitForTimeout(300);
  check("tile-maze editor: a held key's repeats don't move the test ball", await onTile(p, "#edBoard .t-start", "#frame .player"));
  await p.keyboard.press("r"); await p.waitForTimeout(100);
  await keys(p, "RRRRRDD");
  // the winning move, and Stop test while it's still moving: in one step, as a
  // click's own checks can outlast the move on a busy machine
  await p.evaluate(() => {
    const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    t.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true }));
    document.getElementById("testBtn").click();
  });
  await p.evaluate(() => new Promise((r) => setTimeout(r, 600)));
  const solved = await p.evaluate(() => !document.getElementById("testOverlay").hidden);
  check("tile-maze editor: Stop test during the winning move brings no Solved! card over the editor", !solved, solved);
  await done(p, "editor");

  // ---- 💾 Save updates the saved level it was opened from; Save as new copies it; a new level adds one
  p = await lib.open(ctx, base, "games/tile-maze/editor.html");
  const list = () => p.evaluate(() => JSON.parse(localStorage.getItem("tileMaze.customLevels") || "[]").map((l) => l.name + (l.hint ? "/" + l.hint : "")));
  const saveAsNew = async () => { if (await p.$("#saveNewBtn:not([hidden])")) await p.click("#saveNewBtn"); };
  const edit = (i) => p.evaluate((i) => document.querySelectorAll("#saved .saved-item")[i].querySelector("button").click(), i);
  await p.fill("#nameIn", "A"); await p.click("#saveBtn");
  await p.fill("#nameIn", "A2"); await p.click("#saveBtn");
  const s1 = await list();                       // saved twice: still one level
  await edit(0); await p.fill("#nameIn", "B"); await saveAsNew();
  const s2 = await list();                       // a copy under a new name
  await p.click("#newBtn"); await p.fill("#nameIn", "C"); await p.click("#saveBtn");
  const s3 = await list();                       // a brand-new level adds one
  await edit(1);                                 // B ...
  await p.evaluate(() => document.querySelectorAll("#saved .saved-item")[0].querySelectorAll("button")[1].click());   // ... then A2 is deleted
  await p.fill("#hintIn", "h"); await p.click("#saveBtn");
  const s4 = await list();                       // B (now first) is the one updated
  check("tile-maze editor: 💾 Save updates the saved level it came from, Save as new copies it, and a new level adds one",
    s1.join() === "A2" && s2.join() === "A2,B" && s3.join() === "A2,B,C" && s4.join() === "B/h,C", { s1, s2, s3, s4 });
  await done(p, "editor save");

  // ---- Esc closes the editor's Import / Export drawer (claiming the key); with nothing open it does nothing
  p = await lib.open(ctx, base, "games/tile-maze/editor.html");
  const drawer = () => p.evaluate(() => !document.getElementById("ioPanel").hidden);
  await p.click("#importBtn"); await p.waitForTimeout(100);   // (the paste box has focus)
  const i0 = await drawer(), iClaimed = await lib.fireKey(p, { key: "Escape", code: "Escape" }), i1 = await drawer();
  await p.click("#exportBtn"); await p.waitForTimeout(100);
  const e0 = await drawer();
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  const e1 = await drawer();
  const idle = await lib.fireKey(p, { key: "Escape", code: "Escape" }); await p.waitForTimeout(250);
  check("tile-maze editor: Esc closes the Import / Export drawer and claims the key; with nothing open it does nothing",
    i0 && iClaimed && !i1 && e0 && !e1 && !idle && p.leaves === 0, { i0, iClaimed, i1, e0, e1, idle, leaves: p.leaves });
  await done(p, "editor drawer");

  // ---- progress is kept by level name: an old index-based save carries over...
  p = await lib.open(ctx, base, "games/tile-maze/", { before: seed('{"unlocked":3,"completed":[0,1],"bestTimes":{"First Steps":1000}}') });
  const picker = () => p.evaluate(() => [...document.querySelectorAll("#levelPick .lvlbtn")].slice(0, 4).map((b) => (b.classList.contains("locked") ? "locked" : "open") + (b.classList.contains("done") ? "+done" : "") + (/best/.test(b.title) ? "+best" : "")));
  const m1 = { lvl: await p.textContent("#lvlNum"), picker: await picker(), saved: await p.evaluate(() => JSON.parse(localStorage.getItem("tileMaze.v1"))) };
  check("tile-maze: an old save (levels by number) carries over to names, the same levels done and open",
    m1.lvl === "3" && m1.picker.join() === "open+done+best,open+done,open,locked" &&
    (m1.saved.done || []).join() === "First Steps,Live Wires" && !("completed" in m1.saved) && !("unlocked" in m1.saved) && m1.saved.bestTimes["First Steps"] === 1000, m1);
  await p.close();

  // ---- ...and survives the levels being re-sorted
  p = await lib.open(ctx, base, "games/tile-maze/");
  await keys(p, "RRRDDLLL"); await p.waitForTimeout(500);
  await lib.injectScript(p, "games/tile-maze/levels.js", [["  return [", "  return (function (L) { return [L[1], L[0]].concat(L.slice(2)); })(["], ["  ];\n});", "  ]);\n});"]]);
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(400);
  const names = await p.evaluate(() => LEVELS.slice(0, 3).map((l) => l.name).join());
  const re = await picker();
  // (First Steps, now 2nd, is the one done and timed; Slippery Slope, now after it, opens)
  check("tile-maze: progress stays with its levels when they're re-sorted",
    names === "Live Wires,First Steps,Slippery Slope" && re.join() === "open,open+done+best,open,locked", { names, re });
  await done(p, "progress");
  await ctx.close();

  // ---- key hints: keys on a desktop; on a phone none (the game's legend), or the pad (the editor's test play)
  const { devices } = require("@playwright/test");
  const shown = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); return { keys: [...el.querySelectorAll("kbd")].some((k) => k.getClientRects().length > 0), text: el.innerText }; }, sel);
  for (const [label, opts] of [["phone", devices["Pixel 7"]], ["desktop", {}]]) {
    const phone = label === "phone";
    ctx = await lib.newContext(browser, opts);
    p = await lib.open(ctx, base, "games/tile-maze/");
    const legend = await shown(p, ".credit");
    check("tile-maze, " + label + ": the move / reset key legend " + (phone ? "is hidden (the Tile Guide line stays)" : "shows"),
      legend.keys === !phone && /to move/.test(legend.text) === !phone && /Tile Guide/.test(legend.text), legend);
    await done(p, label + " legend");
    p = await lib.open(ctx, base, "games/tile-maze/editor.html");
    await p.click("#testBtn"); await p.waitForTimeout(100);
    const status = await shown(p, "#status");
    check("tile-maze editor, " + label + ": test play's status " + (phone ? "says to tap the pad, naming no keys" : "names the keys"),
      status.keys === !phone && /tap the pad/.test(status.text) === phone && /to restart/.test(status.text) === !phone, status);
    await done(p, label + " editor status");
    await ctx.close();
  }
};
