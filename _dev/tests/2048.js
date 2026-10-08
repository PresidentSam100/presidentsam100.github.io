// 2048: a winning move that also leaves no moves still ends the game — after
// "Keep Going" the Game Over card comes up and leaving no longer asks.
const HOOK = ["  newGame();\n})();", `  newGame();
  window.__set2048 = function (rows) {
    newGame(); tilesEl.innerHTML = ""; tiles = {}; grid = [];
    for (var r = 0; r < 4; r++) grid.push([null, null, null, null]);
    for (r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (rows[r][c]) makeTile(r, c, rows[r][c], null);
  };
})();`];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/2048/", { before: (pg) => lib.injectScript(pg, "games/2048/game.js", [HOOK]) });
  // ← merges the 1024s into 2048, and the tile that spawns in the one free
  // cell (a 2 or a 4) leaves no merge anywhere
  await p.evaluate(() => __set2048([[1024, 1024, 8, 16], [32, 64, 128, 256], [128, 256, 512, 8], [8, 16, 32, 64]]));
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(550);
  const won = await p.evaluate(() => document.getElementById("overlay-title").textContent);
  await p.click("#overlay-keepgoing"); await p.waitForTimeout(550);
  const end = await p.evaluate(() => ({ shown: document.getElementById("overlay").classList.contains("show"), title: document.getElementById("overlay-title").textContent, asks: GameShell.leaveActive() }));
  check("2048: a winning move that leaves no moves reaches Game Over after Keep Going", /win/i.test(won) && end.shown && /Game Over/.test(end.title) && !end.asks, { won, end });
  check("2048: no page errors", p.errs.length === 0, p.errs);
  await ctx.close();
};
