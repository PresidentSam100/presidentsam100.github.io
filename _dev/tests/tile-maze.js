// Tile Maze: the board fits its panel (and a phone) whatever level came
// before; a reset or a new level drops the move still animating; the level
// clock holds while the window is away; the Tile Guide holds the board; the
// Level Editor link asks first mid-level; the editor's test play does the
// same on R / Stop test, one move per key press; the editor's Save updates
// the saved level it opened; progress is kept by level, under its id (an old
// save carries over, a re-sort can't move it, a rename can't lose it); and key
// hints show only where there's a keyboard.
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

  // ---- ◀ Prev / Next ▶ are dimmed with nowhere to go, and a press says why:
  // on a fresh save level 2 is locked, so Next (and E) say so and stay put;
  // solving level 1 lifts the dim at once, and on level 2 it is Next again
  p = await lib.open(ctx, base, "games/tile-maze/", { before: seed("{}") });   // (a fresh save: nothing solved)
  const steps = () => p.evaluate(() => {
    const b = (id) => { const e = document.getElementById(id); return { dim: e.classList.contains("locked") && e.getAttribute("aria-disabled") === "true" && +getComputedStyle(e).opacity < 0.7, off: e.disabled }; };
    return { lvl: document.getElementById("lvlNum").textContent, prev: b("prevBtn"), next: b("nextBtn"), note: document.getElementById("stepNote").textContent };
  });
  const lk0 = await steps();
  await p.keyboard.press("e"); await p.waitForTimeout(80);
  const lkE = await steps();
  await p.keyboard.press("r"); await p.waitForTimeout(80);          // (a new board clears the line)
  const lkR = await steps();
  await p.click("#nextBtn", { force: true }); await p.waitForTimeout(80);   // (force: Playwright won't click an aria-disabled button; a mouse does)
  const lkC = await steps();
  await p.keyboard.press("q"); await p.waitForTimeout(80);
  const lkQ = await steps();
  check("tile-maze: with level 2 locked, Next ▶ is dimmed (and ◀ Prev on level 1), still pressable; E or a click stays on level 1 and says level 2 is locked",
    lk0.lvl === "1" && lk0.next.dim && !lk0.next.off && lk0.prev.dim && lk0.note === "" &&
    lkE.lvl === "1" && /Level 2 is locked/.test(lkE.note) && lkR.note === "" && lkC.lvl === "1" && /Level 2 is locked/.test(lkC.note) && /first level/.test(lkQ.note) && !(await p.evaluate(() => !!document.querySelector(".gs-dialog"))),
    { lk0, lkE, lkR, lkC, lkQ });
  await keys(p, "RRRDDLL");
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(60);
  const lkW = await steps();                                          // (solved: the dim lifts before the slide ends)
  await p.waitForTimeout(700);
  await p.keyboard.press("e"); await p.waitForTimeout(250);
  const lk2 = await steps();
  check("tile-maze: solving level 1 lifts the dim on Next ▶ at once; E then opens level 2, where ◀ Prev is lit and Next ▶ dimmed again",
    !lkW.next.dim && lkW.prev.dim && lk2.lvl === "2" && !lk2.prev.dim && lk2.next.dim && lk2.note === "", { lkW, lk2 });
  await done(p, "locked Next");

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

  // ---- ...and a level that's renamed keeps what was saved for it: progress is
  // under the level's id, which stays (it used to be under the name, so a
  // rename lost the level's tick and best time and locked the level after it)
  p = await lib.open(ctx, base, "games/tile-maze/", { before: async (pg) => {
    await seed('{"done":["First Steps"],"open":[],"bestTimes":{"First Steps":1000}}')(pg);
    await lib.injectScript(pg, "games/tile-maze/levels.js", [['name: "First Steps"', 'name: "Baby Steps"']]);
  } });
  const renamed = { first: await p.evaluate(() => LEVELS[0].name), tip: await p.evaluate(() => document.querySelector("#levelPick .lvlbtn").title), picker: await picker(), lvl: await p.textContent("#lvlNum") };
  check("tile-maze: a renamed level keeps its tick and best time, and the level after it stays open",
    renamed.first === "Baby Steps" && /^Baby Steps, best /.test(renamed.tip) && renamed.picker.slice(0, 3).join() === "open+done+best,open,locked" && renamed.lvl === "2", renamed);
  await done(p, "renamed level");
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

  // ---- Visual FX off: thrown back by a yellow tile, or by live water (water
  // beside a yellow tile), the ball still goes onto that tile, is held there
  // lit through the zap (still: no shake), and comes back to where it came
  // from (it was put straight back, only the tile lighting up), never drawn
  // behind the tile it left (a first frame could be, before). The moves are
  // the engine's own, played by the game's animation on the real page.
  {
    ctx = await lib.newContext(browser);
    p = await lib.open(ctx, base, "games/tile-maze/", { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:tile-maze", "1"); } catch (e) {} }) });
    const zaps = await p.evaluate(async () => {
      const cg = 50, out = {};
      for (const [name, grid] of [["yellow", ["Spy"]], ["live water", ["Spby"]]]) {
        const el = document.createElement("div"); el.className = "player"; el.innerHTML = '<div class="soul"></div>'; document.getElementById("player").parentNode.appendChild(el);
        const xs = [];
        new MutationObserver(() => { const m = /translate\(([-\d.]+)px/.exec(el.style.transform); if (m) xs.push(+m[1]); }).observe(el, { attributes: true, attributeFilter: ["style"] });
        const res = TileEngine.resolveMove(grid, { r: 0, c: 1, flavor: "Plain" }, "right");
        let held = null;
        const ctx = { playerEl: el, gap: 0, cell: () => cg, grid: () => grid, from: { r: 0, c: 1 }, setFlavor: () => {}, sfx: null, stale: () => false,
          flashTile: () => { setTimeout(() => { const m = /translate\(([-\d.]+)px/.exec(el.style.transform); held = { x: m ? +m[1] : null, zap: el.classList.contains("zap"), anim: getComputedStyle(el.querySelector(".soul")).animationName }; }, 120); } };
        await TileAnim.play(ctx, res);
        out[name] = { bounced: res.bounced, least: Math.min(...xs) / cg, reached: Math.max(...xs) / cg, held, back: xs[xs.length - 1] / cg };
        el.remove();
      }
      return out;
    });
    check("tile-maze, FX off: thrown back by a yellow tile or live water, the ball goes onto it, is held there lit and still through the zap, then comes back",
      ["yellow", "live water"].every((k) => { const z = zaps[k]; return z.bounced && z.least >= 1 - 0.001 && Math.abs(z.reached - 2) < 0.01 && z.held && z.held.zap && z.held.anim === "none" && Math.abs(z.held.x / 50 - 2) < 0.01 && Math.abs(z.back - 1) < 0.01; }), zaps);
    await done(p, "zap");
    await ctx.close();
  }
};
