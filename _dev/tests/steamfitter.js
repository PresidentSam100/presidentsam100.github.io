// Steamfitter: every level flows tank-to-drain when solved and doesn't start
// solved; Puzzle boards never start solved and get junctions from level 3;
// tees / junctions / crossovers keep their own type on the flow path (so the
// water is drawn through the junction, or under the bridge); the editor's
// Junction and Crossover tools; spaces in a level name. Puzzle boards deal at
// once (no runaway path carve) and still deal when every carve gives up;
// Panic's hover ghost shows the queued pipe you picked. The mode bar asks
// before it throws away a run or an unsaved level, and "del" asks first.
const HOOKS = [
  ["window.PipeMania = {", `window.PipeMania = {
    __n: function () { return LV.length; },
    __load: function (i) { loadLevelData(LV[i], i); return traceConnected(); },
    __solveAndFlow: function (i) { grid = gridFromString(LV[i].g); flowing = true; startWater(); },
    __pathTypes: function (i) { grid = gridFromString(LV[i].g); srcR = LV[i].s; drainR = LV[i].d; var fp = findFlowPath();
      return fp.map(function (s) { return { cell: grid[s.r][s.c].type, drawn: s.vtype }; }); },
    __puzzle: function (l) { level = l; newPuzzle(); var j = 0; for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) if (grid[r][c].type === "J") j++; return { solved: traceConnected(), j: j }; },
    __geom: function () { return { OX: OX, OY: OY, TS: TS }; },
    __enc: function () { return stringFromGrid(); },
    __pathLen: function () { return pathLen; },
    __spr: function (t) { return SPR[t]; },
`],
  // count the path carve's steps per board, and stop a runaway one (it froze the tab)
  ["function newPuzzle() {", "function newPuzzle() { window.__dfsCalls = 0;"],
  ["function dfs(r, c, path) {", 'function dfs(r, c, path) { if (++window.__dfsCalls > 200000) throw new Error("carve runaway: " + window.__dfsCalls);'],
  // a shuffle that repeats under a seeded Math.random (a sort with a random
  // comparator doesn't, run to run)
  ['var dirs = ["N", "S", "E", "W"].sort(function () { return Math.random() - 0.5; });',
    'var dirs = ["N", "S", "E", "W"]; for (var q = 3; q > 0; q--) { var w = (Math.random() * (q + 1)) | 0, tmp = dirs[q]; dirs[q] = dirs[w]; dirs[w] = tmp; }'],
  // every carve try gives up
  ["var path = carvePath();", "var path = window.__noCarve ? null : carvePath();"],
  // the victory lap at test speed
  ['if (mode === "puzzle" || mode === "levels") return 3.2;', 'if (mode === "puzzle" || mode === "levels") return 80;'],
];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await ctx.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await lib.injectScript(p, "games/steamfitter/game.js", HOOKS);
  await p.goto(base + "games/steamfitter/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(500);

  // boards whose path carve ran for minutes (seeded Math.random; each took over
  // 200k steps) now deal at once, and a board deals even if every carve gives up
  const carve = await p.evaluate(() => {
    const seeded = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const orig = Math.random, out = [];
    for (const [seed, l] of [[10, 10], [23, 10], [29, 10], [36, 3]]) {
      Math.random = seeded(seed);
      try { PipeMania.__puzzle(l); out.push(window.__dfsCalls); } catch (e) { out.push(e.message); } finally { Math.random = orig; }
    }
    return out;
  });
  check("puzzle: boards that froze the tab carving their path deal at once", carve.every((n) => typeof n === "number"), carve);
  const fallback = await p.evaluate(() => {
    window.__noCarve = true;
    try { const r = PipeMania.__puzzle(5); return { len: PipeMania.__pathLen(), solved: r.solved }; } catch (e) { return e.message; } finally { window.__noCarve = false; }
  });
  check("puzzle: a board still deals when every carve try gives up", !!fallback && fallback.len >= 7 && fallback.solved === false, fallback);

  const n = await p.evaluate(() => PipeMania.__n());
  const notFlowing = [], startSolved = [];
  for (let i = 0; i < n; i++) {
    if (await p.evaluate((i) => PipeMania.__load(i), i)) startSolved.push(i + 1);
    await p.evaluate((i) => PipeMania.__solveAndFlow(i), i);
    const ok = await p.waitForFunction(() => PipeMania.stateNow() !== "play", null, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ok || (await p.evaluate(() => PipeMania.stateNow())) !== "levelend") notFlowing.push(i + 1);
  }
  check("all " + n + " levels flow tank-to-drain when solved", notFlowing.length === 0, notFlowing);
  check("no level starts out solved after the scramble", startSolved.length === 0, startSolved);

  const kinds = { tee: 0, junction: 0, crossover: 0 }, wrong = [];
  for (let i = 0; i < n; i++) {
    for (const s of await p.evaluate((i) => PipeMania.__pathTypes(i), i)) {
      const special = s.cell === "J" ? "junction" : s.cell === "X" ? "crossover" : s.cell.charAt(0) === "T" ? "tee" : null;
      if (!special) continue;
      kinds[special]++;
      if (s.drawn !== s.cell) wrong.push((i + 1) + ":" + s.cell + "→" + s.drawn);
    }
  }
  check("tees and junctions on a flow path keep their own type (drawn through the junction)", kinds.tee > 0 && kinds.junction > 0 && wrong.length === 0, { kinds, wrong });

  const boards = {};
  let presolved = 0, earlyJ = 0, lateJ = 0;
  for (let l = 1; l <= 8; l++) {
    for (let k = 0; k < 12; k++) {
      const r = await p.evaluate((l) => PipeMania.__puzzle(l), l);
      if (r.solved) presolved++;
      if (l < 3) earlyJ += r.j; else lateJ += r.j;
    }
  }
  check("puzzle boards never start solved (96 boards, levels 1-8)", presolved === 0, presolved);
  check("puzzle junctions appear from level 3, not before", earlyJ === 0 && lateJ > 0, { earlyJ, lateJ });

  // Panic: pick the third queued pipe, hover a plate: the ghost is that pipe
  await p.evaluate(() => { __game.setMode("panic"); __game.setQueue(["H", "V", "NE", "NW", "SE"]); }); await p.waitForTimeout(150);
  const qbox = await p.locator("#queue").boundingBox();
  await p.mouse.click(qbox.x + qbox.width / 2, qbox.y + (290 - 2 * 64) / 330 * qbox.height);
  const geo = await p.evaluate(() => PipeMania.__geom()), gbox = await p.locator("#game").boundingBox();
  const gs = gbox.width / (await p.evaluate(() => document.getElementById("game").width));
  const empty = await p.evaluate(() => { const g = __game.grid; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c].kind === "empty") return { r, c }; });
  await p.evaluate(() => {
    const g = document.getElementById("game").getContext("2d"), draw = g.drawImage;
    window.__ghosts = [];
    g.drawImage = function (img) { if (Math.abs(this.globalAlpha - 0.45) < 0.01) window.__ghosts.push(img); return draw.apply(this, arguments); };
  });
  const gx = gbox.x + (geo.OX + (empty.c + 0.5) * geo.TS) * gs, gy = gbox.y + (geo.OY + (empty.r + 0.5) * geo.TS) * gs;
  await p.mouse.move(gx - 5, gy); await p.mouse.move(gx, gy); await p.waitForTimeout(150);
  const ghost = await p.evaluate(() => {
    const g = window.__ghosts;
    delete document.getElementById("game").getContext("2d").drawImage;
    return { sel: __game.queueSel, drawn: g.length, picked: g.length > 0 && g.every((i) => i === PipeMania.__spr("NE")) };
  });
  await p.mouse.move(gbox.x - 20, gbox.y - 20);
  check("panic: the hover ghost shows the queued pipe you picked", ghost.sel === 2 && ghost.picked, ghost);

  // the editor: Junction places J, Crossover places X, and the level code keeps both
  await p.evaluate(() => document.querySelector('#modeBar .mbtn[data-mode="levels"]').click()); await p.waitForTimeout(300);
  await p.evaluate(() => { const c = document.querySelector('[data-act="create"]'); c && c.click(); }); await p.waitForTimeout(400);
  const g = await p.evaluate(() => PipeMania.__geom());
  const box = await p.locator("#game").boundingBox(), sx = box.width / (await p.evaluate(() => document.getElementById("game").width));
  const at = (r, c) => ({ x: box.x + (g.OX + (c + 0.5) * g.TS) * sx, y: box.y + (g.OY + (r + 0.5) * g.TS) * sx });
  await p.click('.etool[data-tool="junction"]'); let pt = at(3, 3); await p.mouse.click(pt.x, pt.y);
  await p.click('.etool[data-tool="cross"]'); pt = at(3, 5); await p.mouse.click(pt.x, pt.y);
  const cells = await p.evaluate(() => [PipeMania.cellAt(3, 3).type, PipeMania.cellAt(3, 5).type]);
  const enc = await p.evaluate(() => PipeMania.__enc());
  check("editor: Junction places a J, Crossover an X, and the level code writes j and x", cells[0] === "J" && cells[1] === "X" && enc.includes("j") && enc.includes("x"), { cells });

  // a space typed into the level name is a space (not the fast-forward key)
  await p.click("#editName"); await p.keyboard.type("My Cool Level");
  check("editor: the level name takes spaces", (await p.evaluate(() => document.getElementById("editName").value)) === "My Cool Level");

  check("steamfitter: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // a 2× screen: the board has twice the pixels, and a click turns the pipe under it
  const retina = await lib.newContext(browser, { deviceScaleFactor: 2 });
  const q = await retina.newPage();
  q.errs = []; q.on("pageerror", (e) => q.errs.push(e.message));
  await lib.injectScript(q, "games/steamfitter/game.js", HOOKS);
  await q.goto(base + "games/steamfitter/", { waitUntil: "domcontentloaded" });
  await q.evaluate(() => localStorage.clear()); await q.reload({ waitUntil: "domcontentloaded" }); await q.waitForTimeout(500);
  await q.evaluate(() => PipeMania.__load(0)); await q.waitForTimeout(150);
  const size = await q.evaluate(() => ({ w: document.getElementById("game").width, h: document.getElementById("game").height }));
  const rg = await q.evaluate(() => PipeMania.__geom()), rbox = await q.locator("#game").boundingBox(), rs = rbox.width / 640;   // (640 × 490 logical)
  const pipe = await q.evaluate(() => { const g = __game.grid; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c].kind === "pipe") return { r, c, type: g[r][c].type }; });
  await q.mouse.click(rbox.x + (rg.OX + (pipe.c + 0.5) * rg.TS) * rs, rbox.y + (rg.OY + (pipe.r + 0.5) * rg.TS) * rs); await q.waitForTimeout(200);
  const turned = await q.evaluate((pc) => ({ moves: __game.moves, type: __game.grid[pc.r][pc.c].type }), pipe);
  check("2× screen: the board has twice the pixels, and a click turns the pipe under it",
    size.w === 1280 && size.h === 980 && turned.moves === 1 && turned.type !== pipe.type, { size, pipe, turned });
  // the pipe and plate sprites too: built at twice the pixels, stamped at a tile's size
  const stamps = await q.evaluate(() => new Promise((done) => {
    const g = document.getElementById("game").getContext("2d"), draw = g.drawImage, seen = [];
    const sprites = ["plate", "H", "V", "NE", "X", "J", "TN", "CN"].map((t) => PipeMania.__spr(t));
    g.drawImage = function (img) { if (sprites.indexOf(img) >= 0) seen.push(arguments.length === 5 ? arguments[3] + "x" + arguments[4] : "natural " + img.width); return draw.apply(this, arguments); };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      delete g.drawImage;
      done({ built: sprites.map((s) => s.width), drawn: [...new Set(seen)] });
    }));
  }));
  check("2× screen: the pipe sprites have twice the pixels and are stamped at a tile's size",
    stamps.built.every((w) => w === 128) && stamps.drawn.length === 1 && stamps.drawn[0] === "64x64", stamps);
  check("2× screen: frames draw with no page errors", q.errs.length === 0, q.errs);
  await q.close();
  await retina.close();

  // ---- the mode bar asks before it throws a run, or an unsaved level, away
  const custom = JSON.stringify([{ n: "Pipe Dream", s: 3, d: 3, g: ".......................chd.ohhhhb.aO..........................." }]);
  const a = await lib.open(ctx, base, "games/steamfitter/", { before: async (pg) => {
    await pg.addInitScript((c) => { try { localStorage.setItem("steamfitter_custom", c); } catch (e) {} }, custom);
    await lib.injectScript(pg, "games/steamfitter/game.js", HOOKS);
  } });
  const dlg = () => a.evaluate(() => { const d = document.querySelector(".gs-dialog"); return d ? { title: d.querySelector("h2").textContent, text: (d.querySelector("p") || {}).textContent || "" } : null; });
  const mbtn = (m) => a.evaluate((m) => document.querySelector('#modeBar .mbtn[data-mode="' + m + '"]').click(), m);
  const where = () => a.evaluate(() => ({ mode: __game.mode, state: __game.state, paused: (() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; })() }));

  // a fresh Panic run switches at once; one with a pipe laid asks, paused under the box
  await a.evaluate(() => { __game.setMode("panic"); }); await a.waitForTimeout(100);
  await mbtn("puzzle"); await a.waitForTimeout(150);
  const fresh = { box: await dlg(), at: await where() };
  check("mode bar (guard): a fresh run switches modes at once", !fresh.box && fresh.at.mode === "puzzle", fresh);
  await a.evaluate(() => { __game.setMode("panic"); __game.setQueue(["H", "H", "H", "H", "H"]); const g = __game.grid;
    for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c].kind === "empty") { __game.place(r, c); return; } });
  await mbtn("levels"); await a.waitForTimeout(150);
  const asked = { box: await dlg(), at: await where() };
  await a.keyboard.press("Escape"); await a.waitForTimeout(150);
  const kept = { box: await dlg(), at: await where() };
  await mbtn("levels"); await a.waitForTimeout(150); await a.keyboard.press("Enter"); await a.waitForTimeout(200);
  const quit = { box: await dlg(), at: await where() };
  check("mode bar mid-run asks \"Quit this game?\" (paused under it); Keep playing plays on, Quit switches",
    asked.box && asked.box.title === "Quit this game?" && asked.at.mode === "panic" && asked.at.paused &&
    !kept.box && kept.at.mode === "panic" && kept.at.state === "play" && !kept.at.paused &&
    !quit.box && quit.at.mode === "levels" && !quit.at.paused && a.leaves === 0, { asked, kept, quit });

  // the editor: untouched, the mode bar switches at once; with an unsaved level it asks
  await a.evaluate(() => __game.startEditor()); await a.waitForTimeout(100);
  await mbtn("panic"); await a.waitForTimeout(150);
  const blank = { box: await dlg(), at: await where() };
  check("mode bar (guard): an editor with nothing unsaved switches at once", !blank.box && blank.at.mode === "panic", blank);
  await mbtn("levels"); await a.waitForTimeout(150);
  await a.evaluate(() => { __game.startEditor(); __game.setEditTool("bend"); __game.editorClick({ r: 3, c: 3 }); }); await a.waitForTimeout(100);
  await mbtn("panic"); await a.waitForTimeout(150);
  const ed = { box: await dlg(), at: await where() };
  await a.keyboard.press("Escape"); await a.waitForTimeout(150);
  const stay = { box: await dlg(), at: await where() };
  await mbtn("levels"); await a.waitForTimeout(150);   // the same mode: back to the level list
  const ed2 = { box: await dlg() };
  await a.keyboard.press("Enter"); await a.waitForTimeout(150);
  const left = { box: await dlg(), at: await where() };
  check("mode bar in the editor with an unsaved level asks \"Leave the editor?\"; Keep editing stays, Leave goes",
    ed.box && ed.box.title === "Leave the editor?" && /unsaved level will be lost/.test(ed.box.text) && ed.at.state === "edit" &&
    !stay.box && stay.at.state === "edit" && stay.at.mode === "levels" && ed2.box && ed2.box.title === "Leave the editor?" &&
    !left.box && left.at.state === "select", { ed, stay, ed2, left });

  // the editor's own ◂ Back asks the same; untouched, it goes at once
  await a.evaluate(() => __game.startEditor()); await a.waitForTimeout(100);
  await a.click("#editBack"); await a.waitForTimeout(150);
  const back0 = { box: await dlg(), at: await where() };
  check("editor ◂ Back (guard): with nothing unsaved it goes at once", !back0.box && back0.at.state === "select", back0);
  await a.evaluate(() => { __game.startEditor(); __game.setEditTool("bend"); __game.editorClick({ r: 3, c: 3 }); }); await a.waitForTimeout(100);
  await a.click("#editBack"); await a.waitForTimeout(150);
  const back1 = { box: await dlg(), at: await where() };
  await a.keyboard.press("Escape"); await a.waitForTimeout(150);
  const back2 = { box: await dlg(), at: await where() };
  await a.evaluate(() => document.getElementById("editBack").click()); await a.waitForTimeout(150); await a.keyboard.press("Enter"); await a.waitForTimeout(150);
  const back3 = { box: await dlg(), at: await where() };
  check("editor ◂ Back with an unsaved level asks \"Leave the editor?\"; Keep editing stays, Leave goes",
    back1.box && back1.box.title === "Leave the editor?" && back1.at.state === "edit" && !back2.box && back2.at.state === "edit" &&
    !back3.box && back3.at.state === "select", { back1, back2, back3 });

  // "del" on a custom level asks first, naming it
  const count = () => a.evaluate(() => ({ saved: __game.customLevels.length, shown: document.querySelectorAll('#levelSelect [data-act="delc"]').length }));
  const c0 = await count();
  const delc = () => a.evaluate(() => { const d = document.querySelector('#levelSelect [data-act="delc"]'); if (d) d.click(); });
  await delc(); await a.waitForTimeout(150);
  const del = { box: await dlg(), n: await count() };
  await a.keyboard.press("Escape"); await a.waitForTimeout(150);
  const keep = await count();
  await delc(); await a.waitForTimeout(150); await a.keyboard.press("Enter"); await a.waitForTimeout(150);
  const gone = await count();
  check("del asks \"Delete this level?\" naming it; Keep it keeps it, Delete deletes it",
    c0.saved === 1 && del.box && del.box.title === "Delete this level?" && del.box.text === "Pipe Dream will be gone for good." && del.n.saved === 1 &&
    keep.saved === 1 && keep.shown === 1 && gone.saved === 0 && gone.shown === 0, { c0, del, keep, gone });
  check("steamfitter: no page errors (asking first)", a.errs.length === 0, a.errs);
  await a.close();

  await ctx.close();
};
