// 2048: a winning move that also leaves no moves still ends the game — after
// "Keep Going" the Game Over card comes up and leaving no longer asks; the AC
// key and the mode buttons ask before wiping a game in progress, and don't
// on a fresh board or a finished game.
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

  // ---- what a button press leaves: the ask (if any), the mode, the board
  const dialog = () => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  const board = () => p.evaluate(() => ({ mode: localStorage.getItem("game2048_mode") || "normal", score: document.getElementById("score").textContent, tiles: document.querySelectorAll("#tiles .tile").length }));
  const press = (sel) => p.evaluate((s) => document.querySelector(s).click(), sel);

  // a finished game: AC deals a fresh board at once
  await press("#new-game"); await p.waitForTimeout(80);
  const over = { ask: await dialog(), after: await board() };
  check("2048: after Game Over, AC deals a fresh board at once (guard)", over.ask === null && over.after.score === "0" && over.after.tiles === 2, over);

  // a fresh board: a mode button switches at once
  await press("#mode-fib"); await p.waitForTimeout(80);
  const fresh = { ask: await dialog(), after: await board() };
  check("2048: on a fresh board, a mode button switches at once (guard)", fresh.ask === null && fresh.after.mode === "fib", fresh);
  await press("#mode-normal"); await p.waitForTimeout(80);

  // mid-game (one merge made): ask first; Esc keeps the game, Enter wipes it
  const midGame = async (sel) => {
    await p.evaluate(() => __set2048([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]));
    await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(200);
    const played = await board();
    await press(sel); await p.waitForTimeout(80);
    const ask = await dialog();
    await p.keyboard.press("Escape"); await p.waitForTimeout(80);
    const kept = await board();
    await press(sel); await p.waitForTimeout(80);
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const went = await board();
    return { ask, played, kept, went, leaves: p.leaves };
  };
  const ac = await midGame("#new-game");
  check("2048: mid-game, AC asks \"Start a new game?\"; Esc keeps the game, Enter deals a fresh board",
    ac.ask === "Start a new game?" && ac.played.score === "4" && ac.kept.score === "4" && ac.kept.tiles === ac.played.tiles && ac.went.score === "0" && ac.went.tiles === 2 && ac.leaves === 0, ac);
  const fib = await midGame("#mode-fib");
  check("2048: mid-game, Fibonacci asks \"Start a new game?\"; Esc keeps the game and mode, Enter switches to a fresh Fibonacci board",
    fib.ask === "Start a new game?" && fib.kept.mode === "normal" && fib.kept.score === "4" && fib.went.mode === "fib" && fib.went.score === "0" && fib.went.tiles === 2 && fib.leaves === 0, fib);
  check("2048: no page errors", p.errs.length === 0, p.errs);
  await ctx.close();
};
