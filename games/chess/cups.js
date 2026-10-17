/* =====================================================================
   The coffee on the cafe table: a cup for every player at the board (two
   for 2-player chess, four for the 4-player cross, three on the 3-player
   page), each on its player's side, and each a different drink, its saucer
   banded in the player's colour (cafe.css draws them).

   Each cup is set down in the table's free space nearest its player's side
   of the board, as large as that space allows (up to 128px, down to 36px),
   and never over the board, the move log, the side column (trays, clocks,
   buttons), the title lines or the corner buttons, nor over another cup. It
   moves when the window, the board or the page around it changes. With
   Visual FX on, steam drifts up off it (cafe.css); off, it stands still.
   ===================================================================== */
(function () {
  "use strict";
  const MAX = 128, MIN = 36, GAP = 10, EDGE = 12, STEP = 6, NEAR = 0.2;
  const ART = 150;   // the size cafe.css draws a cup at, scaled to fit

  // the players round this board: their colour, their drink, and the point by
  // their side of the board their cup is set down nearest (b: the board's box)
  function players(b) {
    const cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2, w = b.r - b.l, h = b.b - b.t;
    if (document.getElementById("boardSvg")) {     // 3 players: Red's home edge on the left, White's down right, Black's up right
      const at = (dx, dy) => ({ x: cx + dx * w / 2, y: cy + dy * h / 2 });
      return [
        { id: "r", color: "#e2574e", brew: "tea", at: at(-1, 0) },
        { id: "w", color: "#efe7d4", brew: "espresso", at: at(0.5, 0.87) },
        { id: "k", color: "#454552", brew: "cappuccino", at: at(0.5, -0.87) },
      ];
    }
    const board = document.getElementById("board");
    if (board.classList.contains("four")) {          // 4 players: Red below, Blue left, Yellow above, Green right
      return [
        { id: "r", color: "#e2574e", brew: "tea", at: { x: cx, y: b.b } },
        { id: "b", color: "#5a82e6", brew: "cappuccino", at: { x: b.l, y: cy } },
        { id: "y", color: "#e6c63f", brew: "latte", at: { x: cx, y: b.t } },
        { id: "g", color: "#54b96a", brew: "matcha", at: { x: b.r, y: cy } },
      ];
    }
    // 2 players: White's side is the bottom of the board, Black's the top (flipped, the other way)
    const sq = board.querySelector(".sq"), flipped = !!sq && sq.dataset.i !== "0";
    const low = { x: b.r, y: b.b }, high = { x: b.l, y: b.t };
    return [
      { id: "w", color: "#fbf2e2", brew: "espresso", at: flipped ? high : low },
      { id: "b", color: "#2a211a", brew: "cappuccino", at: flipped ? low : high },
    ];
  }

  const set = document.createElement("div");
  set.className = "cupset";
  set.setAttribute("aria-hidden", "true");
  document.body.appendChild(set);

  const doc = (r) => ({ l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY });
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";

  function place() {
    set.style.display = "none";   // (measured without the cups)
    const boardEl = document.getElementById("boardSvg") || document.getElementById("board");
    if (!boardEl || !shown(boardEl)) return;
    const W = document.documentElement.clientWidth, H = Math.max(document.documentElement.scrollHeight, innerHeight);
    // what a cup must never cover: the page's own lines and panels, and the
    // corner buttons, which stay at the top of the window (where they are at
    // the top of the page)
    const keep = [];
    for (const e of document.querySelectorAll("h1, .sub, #status, .layout > *")) if (shown(e)) keep.push(doc(e.getBoundingClientRect()));
    for (const e of document.querySelectorAll(".gs-corner, .nav-back-games")) if (shown(e)) { const r = e.getBoundingClientRect(); keep.push({ l: r.left, t: r.top, r: r.right, b: r.bottom }); }
    const board = doc(boardEl.getBoundingClientRect());
    const cups = [];
    for (const pl of players(board)) {
      // every spot on a fine grid: the largest cup centred there that keeps
      // GAP clear of everything; the one taken scores its size against its
      // distance from the player's side
      let best = null;
      for (let y = EDGE + MIN / 2; y <= H - EDGE - MIN / 2; y += STEP) {
        for (let x = EDGE + MIN / 2; x <= W - EDGE - MIN / 2; x += STEP) {
          let half = Math.min(x - EDGE, W - EDGE - x, y - EDGE, H - EDGE - y, MAX / 2);
          for (const k of keep) {
            const dx = Math.max(k.l - GAP - x, x - k.r - GAP, 0), dy = Math.max(k.t - GAP - y, y - k.b - GAP, 0);
            half = Math.min(half, Math.max(dx, dy));
            if (half * 2 < MIN) break;
          }
          if (half * 2 < MIN) continue;
          const size = Math.floor(half * 2), score = size - NEAR * Math.hypot(x - pl.at.x, y - pl.at.y);
          if (!best || score > best.score) best = { x, y, size, score };
        }
      }
      if (!best) continue;
      const c = { l: best.x - best.size / 2, t: best.y - best.size / 2, r: best.x + best.size / 2, b: best.y + best.size / 2 };
      keep.push(c);
      cups.push(Object.assign({ size: best.size }, c, pl));
    }
    // draw them (reusing the cups already there)
    while (set.children.length > cups.length) set.lastChild.remove();
    cups.forEach((c, i) => {
      let slot = set.children[i];
      if (!slot) { slot = document.createElement("div"); slot.className = "cupslot"; slot.innerHTML = '<div class="cup"><i></i><i></i></div>'; set.appendChild(slot); }
      const cup = slot.firstChild;
      cup.className = "cup " + c.brew;
      cup.style.setProperty("--band", c.color);
      cup.style.transform = "scale(" + (c.size / ART).toFixed(4) + ")";
      Object.assign(slot.style, { left: c.l + "px", top: c.t + "px", width: c.size + "px", height: c.size + "px" });
      slot.dataset.player = c.id;
    });
    set.style.display = "";
  }

  let queued = false;
  function later() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; place(); }); }
  addEventListener("resize", later);
  addEventListener("load", later);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(later);
    ro.observe(document.body);
    document.querySelectorAll(".layout, .layout > *").forEach((e) => ro.observe(e));
  }
  // the board redrawn: a flip, another mode, a move (the side column can change with it)
  const boardEl = document.getElementById("boardSvg") || document.getElementById("board");
  if (boardEl && window.MutationObserver) new MutationObserver(later).observe(boardEl, { childList: true, attributes: true, attributeFilter: ["class"] });
  later();
  window.ChessCups = { place };   // (for the tests)
})();
