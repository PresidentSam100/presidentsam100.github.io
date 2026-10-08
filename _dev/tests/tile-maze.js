// Tile Maze: the board fits its panel (and a phone) whatever level came
// before; a reset or a new level drops the move still animating; the level
// clock holds while the window is away; the Tile Guide holds the board; the
// Level Editor link asks first mid-level; and the editor's test play does
// the same on R / Stop test, one move per key press.
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
  const keys = async (p, seq) => { for (const k of seq) { await p.keyboard.press({ R: "ArrowRight", L: "ArrowLeft", U: "ArrowUp", D: "ArrowDown" }[k]); await p.waitForTimeout(400); } };
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
  const b = await p.evaluate(() => ({ lvl: document.getElementById("lvlNum").textContent, overlay: !document.getElementById("overlay").hidden, completed: JSON.parse(localStorage.getItem("tileMaze.v1")).completed }));
  check("tile-maze: Next during the winning slide opens level 2 with no Level Complete card over it (the win still counts)", b.lvl === "2" && !b.overlay && b.completed.includes(0), b);

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
  const t0 = await secs();
  await p.evaluate(() => window.dispatchEvent(new Event("blur"))); await p.waitForTimeout(1500);
  await p.evaluate(() => window.dispatchEvent(new Event("focus"))); await p.waitForTimeout(300);
  const t1 = await secs();
  check("tile-maze: the level clock holds while the window is away", t1 - t0 < 0.9, { t0, t1 });

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
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(40);
  await p.click("#testBtn"); await p.waitForTimeout(600);
  const solved = await p.evaluate(() => !document.getElementById("testOverlay").hidden);
  check("tile-maze editor: Stop test during the winning move brings no Solved! card over the editor", !solved, solved);
  await done(p, "editor");
  await ctx.close();
};
