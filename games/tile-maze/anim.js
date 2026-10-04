/* Tile Maze — shared move animation (DOM).
   Used by BOTH game.js and editor.js so the real game and the editor's
   test-play animate identically:
     • per-tile movement speed (water = slow, ice = fast, everything else
       normal), and crucially the speed switches at the MIDPOINT between two
       tiles — the first half of a step runs at the tile you're leaving, the
       second half at the tile you're entering;
     • an electric "zap" hold on yellow / live-water before the rebound;
     • a wall "bump" (slower when you're standing in water).
   Event marks that hold still in both modes, cleared by timers (with Visual
   FX off there's no transitionend / animationend to wait for):
     • a bar on the side of the ball that met a wall (player[data-bump]);
     • Visual FX off only: a slide jumps straight to its last tile, so the
       tiles it crossed get a brief dashed trail (.tile.trail). */
(function (root, factory) {
  const mod = factory();
  if (typeof window !== "undefined") window.TileAnim = mod;
})(this, function () {
  "use strict";

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const DELTA = { up: { r: -1, c: 0 }, down: { r: 1, c: 0 }, left: { r: 0, c: -1 }, right: { r: 0, c: 1 } };

  // Per-tile traversal time (ms for a full tile). Speed = inverse of this.
  const STEP = 115;   // ordinary tile
  const WATER = 300;  // blue water — slow (wading)
  const ICE = 75;     // purple ice — fast (sliding)
  const ZAP = 300;    // electric zap hold before the rebound
  const REBOUND = 150;
  const MARK = 500;   // how long the still wall-bump bar and slide trail stay

  // The wall-bump bar: data-bump="up|down|left|right" on the player for MARK ms.
  function markBump(el, dir) {
    if (!el || !DELTA[dir]) return;
    el.dataset.bump = dir;
    clearTimeout(el._bumpT);
    el._bumpT = setTimeout(() => { delete el.dataset.bump; }, MARK);
  }
  function clearBump(el) { clearTimeout(el._bumpT); delete el.dataset.bump; }

  // The slide trail (Visual FX off): a class on each crossed tile for MARK ms.
  function markTrail(ctx, tiles) {
    if (!ctx.tileEl) return;
    tiles.forEach((t) => {
      const te = ctx.tileEl(t.r, t.c);
      if (!te) return;
      te.classList.add("trail");
      clearTimeout(te._trailT);
      te._trailT = setTimeout(() => te.classList.remove("trail"), MARK);
    });
  }

  function perTile(grid, t) {
    const ch = grid[t.r][t.c];
    if (ch === "b") return WATER;
    if (ch === "u") return ICE;
    return STEP;
  }

  function landSound(ctx, ch) {
    const s = ctx.sfx;
    if (!s) return;
    if (ch === "g") s.green && s.green();
    else if (ch === "o") s.orange && s.orange();
    else if (ch === "b") (s.water ? s.water() : s.step && s.step());
    else if (ch === "X") { /* win fanfare is handled by the caller */ }
    else s.step && s.step();
  }

  // Drive the player along a poly-line of waypoints, each segment with its own
  // duration, at constant velocity within the segment (rAF, so speed can vary
  // across the path — which a single CSS transition can't do).
  function animatePath(el, pts, durs) {
    const cum = [0];
    for (let k = 0; k < durs.length; k++) cum.push(cum[k] + durs[k]);
    const total = cum[cum.length - 1];
    const set = (p) => { el.style.transform = "translate(" + p.x + "px, " + p.y + "px)"; };
    if (total <= 0) { set(pts[pts.length - 1]); return Promise.resolve(); }
    return new Promise((resolve) => {
      el.style.transition = "none"; // rAF owns the transform now
      const start = performance.now();
      function frame(now) {
        const e = now - start;
        if (e >= total) { set(pts[pts.length - 1]); resolve(); return; }
        let seg = 0;
        while (seg < durs.length - 1 && e > cum[seg + 1]) seg++;
        const lt = Math.min(1, (e - cum[seg]) / (durs[seg] || 0.0001));
        const a = pts[seg], b = pts[seg + 1];
        set({ x: a.x + (b.x - a.x) * lt, y: a.y + (b.y - a.y) * lt });
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  // Animate one resolved move. Returns a promise that settles when done.
  // ctx: { playerEl, gap, cell()->px, grid()->rows, reduced()->bool,
  //        from:{r,c} (tile before the move), setFlavor(f), sfx|null, flashTile(r,c) }
  async function play(ctx, res) {
    const steps = res.steps;
    if (!steps || !steps.length) return;
    const grid = ctx.grid();
    const el = ctx.playerEl;
    const cg = ctx.cell() + ctx.gap;
    const center = (s) => ({ x: s.c * cg, y: s.r * cg });
    const reduced = !!(ctx.reduced && ctx.reduced());
    clearBump(el);   // a move away takes the last bump's bar with it

    const bounced = !!res.bounced;
    const forward = bounced ? steps.slice(0, -1) : steps;
    const rebound = bounced ? steps[steps.length - 1] : null;
    const last = forward[forward.length - 1];
    const lastCh = grid[last.r][last.c];
    let fwdFlavor = null;
    for (let i = forward.length - 1; i >= 0; i--) if (forward[i].flavor) { fwdFlavor = forward[i].flavor; break; }

    // Reduced motion: jump to the final tile, keep the cues. A jump of more
    // than one tile (an ice slide) leaves a trail on the tiles it crossed —
    // where it started and what it slid over — so you can see where you went.
    if (reduced) {
      const fin = res.final;
      const crossed = [ctx.from || forward[0]].concat(bounced ? forward.slice(0, -1) : forward)
        .filter((t) => t.r !== fin.r || t.c !== fin.c);
      if (crossed.length > 1) markTrail(ctx, crossed);
      el.style.transition = "none"; el.style.transform = "translate(" + (res.final.c * cg) + "px, " + (res.final.r * cg) + "px)";
      void el.offsetWidth; el.style.transition = "";
      if (fwdFlavor) ctx.setFlavor(fwdFlavor);
      if (bounced) { ctx.flashTile && ctx.flashTile(last.r, last.c); ctx.sfx && ctx.sfx.bounce && ctx.sfx.bounce(); }
      else landSound(ctx, lastCh);
      return;
    }

    if (fwdFlavor) ctx.setFlavor(fwdFlavor);
    const isSlide = forward.some((s) => grid[s.r][s.c] === "u");
    if (isSlide) ctx.sfx && ctx.sfx.slide && ctx.sfx.slide();

    // Build the path: origin tile + every forward step. Between each tile pair
    // we insert the midpoint, so the first half runs at the leaving tile's speed
    // and the second half at the entering tile's speed.
    const origin = ctx.from || forward[0];
    const tiles = [origin].concat(forward);
    const pts = [center(tiles[0])];
    const durs = [];
    for (let k = 0; k < tiles.length - 1; k++) {
      const A = tiles[k], B = tiles[k + 1];
      const pa = center(A), pb = center(B);
      pts.push({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, pb);
      durs.push(perTile(grid, A) / 2, perTile(grid, B) / 2);
    }
    await animatePath(el, pts, durs);
    el.style.transition = "";
    if (!bounced) landSound(ctx, lastCh);

    // ----- electric zap, then rebound -----
    if (bounced) {
      ctx.flashTile && ctx.flashTile(last.r, last.c);
      el.classList.add("zap");
      ctx.sfx && ctx.sfx.bounce && ctx.sfx.bounce();
      await wait(ZAP);
      el.classList.remove("zap");
      el.style.transition = "transform " + REBOUND + "ms ease-in";
      el.style.transform = "translate(" + (rebound.c * cg) + "px, " + (rebound.r * cg) + "px)";
      await wait(REBOUND);
      el.style.transition = "";
    }
  }

  // Nudge toward a wall the player tried to enter, then settle back. Awaitable.
  // pos = the player's current resting tile {r,c}; slower when that tile is water.
  // The bar on the wall side shows in both modes; with Visual FX off the ball
  // doesn't nudge (the flattened transition only made it twitch), but the
  // promise takes just as long, so the input lock is the same in both modes.
  function bump(ctx, dir, pos) {
    const d = DELTA[dir];
    if (!d) return Promise.resolve();
    const el = ctx.playerEl;
    const cg = ctx.cell() + ctx.gap;
    const baseX = pos.c * cg, baseY = pos.r * cg;
    const nudge = Math.min(16, ctx.cell() * 0.34);
    const slow = ctx.grid()[pos.r][pos.c] === "b";
    const out = slow ? 150 : 80, back = slow ? 235 : 130;
    markBump(el, dir);
    if (ctx.reduced && ctx.reduced()) return wait(out + back + 20);
    return new Promise((resolve) => {
      el.style.transition = "transform " + out + "ms ease-out";
      el.style.transform = "translate(" + (baseX + d.c * nudge) + "px, " + (baseY + d.r * nudge) + "px)";
      setTimeout(() => {
        el.style.transition = "transform " + back + "ms ease-in";
        el.style.transform = "translate(" + baseX + "px, " + baseY + "px)";
        setTimeout(() => { el.style.transition = ""; resolve(); }, back + 10);
      }, out + 10);
    });
  }

  return { play, bump, markBump };
});
