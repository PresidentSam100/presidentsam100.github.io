// Steamfitter: every level flows tank-to-drain when solved and doesn't start
// solved; Puzzle boards never start solved and get junctions from level 3;
// tees / junctions / crossovers keep their own type on the flow path (so the
// water is drawn through the junction, or under the bridge); the editor's
// Junction and Crossover tools; spaces in a level name.
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
`],
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
  await ctx.close();
};
