/* Slither — runs the level checker (solver.js) off the main thread for the
   level editor, so checking a big level never freezes the page. */
importScripts("labyrinth-engine.js", "solver.js");
self.onmessage = function (e) {
  try {
    var r = self.SlitherSolver.check(e.data);
    self.postMessage({ status: r.status, reason: r.reason || "", steps: r.route ? r.route.length : 0, secs: r.secs || 0, warp: r.warp || null, notes: r.notes || [] });
  } catch (err) {
    self.postMessage({ status: "fail", reason: String((err && err.message) || err) });
  }
};
