/* =====================================================================
   Sudoku generator worker. Hard and Expert can take a few hundred
   attempts on an unlucky roll, which is a visible stall on a phone, so
   puzzles are carved here instead of on the main thread. game.js falls
   back to generating in the page if this worker can't start.
   ===================================================================== */
importScripts("engine.js");

self.onmessage = function (e) {
  const g = SudokuEngine.generate(e.data.level, Math.random);
  self.postMessage({ id: e.data.id, puzzle: g.puzzle, solution: g.solution, level: g.level, tier: g.tier, clues: g.clues });
};
