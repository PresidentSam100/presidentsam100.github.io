// Tide Pool: the menu takes 1 and 2 (shown on them, the pick kept) and Space
// or Enter wades in; a fresh pool has no lines on it and a move to make;
// lines of three or more are found across and down; a swap that makes a line
// stands and scores (and what settles into new lines scores again, more),
// one that makes none doesn't, nor do two that aren't neighbours; a Rock pool
// counts its swaps down and ends with the last; the Tide ends with its clock;
// the score is kept as the best; the end card waits a moment for Space,
// then wades in again, and Backspace goes to the menu; the arrows and Space
// swap from the keyboard, but not while paused; with Visual FX on the pieces
// slide and fall into place, with it off they're there at once; on a phone a drag
// from one piece onto its neighbour swaps them.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/tide-pool/", opts);
  const done = async (p, what) => { check("tide-pool " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const idle = (p) => p.waitForFunction(() => !TidePool.busy(), null, { timeout: 15000 });
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);
  // a board with no lines on it: kinds 0 to 3 by a pattern that never repeats three in a row or column
  // (0 1 2 3 0 1 2 3 on one row, 2 3 0 1 2 3 0 1 on the next), so 4 and 5 are free to make lines with
  const PLAIN = "Array.from({ length: 64 }, (_, i) => ((i % 8) + 2 * Math.floor(i / 8)) % 4)";

  // ---- the rules
  let p = await open();
  const rules = await p.evaluate((PLAIN) => {
    const R = TidePool.rules;
    const deals = []; for (let k = 0; k < 30; k++) { const b = R.deal(Math.random); deals.push(R.runs(b).length === 0 && !!R.anyMove(b)); }
    const plain = eval(PLAIN);
    const across = plain.slice(); across[0] = across[1] = across[2] = 5;
    const down = plain.slice(); down[3] = down[11] = down[19] = down[27] = 5;
    return { deals: deals.every(Boolean), plain: R.runs(plain).length, across: R.runs(across).join(), down: R.runs(down).join() };
  }, PLAIN);
  check("tide-pool: a fresh pool never starts with a line on it and always has a move; lines of three across and four down are found",
    rules.deals && rules.plain === 0 && rules.across === "0,1,2" && rules.down === "3,11,19,27", rules);

  // ---- the menu
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-mode button, #play")].map((b) => b.getAttribute("data-gs-key")));
  await p.keyboard.press("2"); await p.waitForTimeout(80);
  const kept = await p.evaluate(() => localStorage.getItem("tidepool_mode"));
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const began = await p.evaluate(() => ({ state: TidePool.state(), mode: TidePool.mode(), left: TidePool.left(), hud: document.getElementById("hud-left").textContent }));
  check("tide-pool: the modes wear 1 and 2 and the start Space or Enter; 2 picks the Rock pool (kept) and Space wades in with 25 swaps",
    caps.join() === "1,2,Space or Enter" && kept === "pool" && began.state === "play" && began.mode === "pool" && began.left === 25 && began.hud === "25 swaps", { caps, kept, began });

  // ---- swaps: one that makes a line stands and scores; one that doesn't, or of two not side by side, doesn't
  const swaps = await p.evaluate((PLAIN) => {
    const b = eval(PLAIN);
    // a line of three to be made by one swap: 5 5 x 5 on the bottom row
    b[56] = 5; b[57] = 5; b[58] = 4; b[59] = 5;
    TidePool.setBoard(b);
    const s0 = TidePool.score(), left0 = TidePool.left();
    const far = TidePool.swap(0, 2);
    const none = TidePool.swap(8, 9);
    const good = TidePool.swap(58, 59);
    return { far, none, good, score: TidePool.score() - s0, left: left0 - TidePool.left() };
  }, PLAIN);
  check("tide-pool: two pieces not side by side don't swap, nor two whose swap makes no line; one that makes a line stands, scores and costs a swap",
    swaps.far === false && swaps.none === false && swaps.good === true && swaps.score >= 30 && swaps.left === 1, swaps);
  await idle(p);
  // what settles into a new line washes away too, and counts double: 5 5 5 goes, the 4 4 above drop beside the swapped-in 4
  const s1 = await p.evaluate((PLAIN) => {
    const b = eval(PLAIN); b[56] = 5; b[57] = 5; b[58] = 4; b[59] = 5; b[49] = 4; b[50] = 4;
    TidePool.setBoard(b); const s0 = TidePool.score(); TidePool.swap(58, 59); return s0;
  }, PLAIN);
  await idle(p);
  const chain = await p.evaluate((s1) => TidePool.score() - s1, s1);
  check("tide-pool: a line the settling makes washes away as well, counting double (30 for the swap's three, 60 for the next three)", chain >= 90, chain);
  await done(p, "rules and swaps");

  // ---- the end: a Rock pool with its last swap, the Tide with its clock; the best kept as it's passed; the card
  p = await open();
  const pool = await p.evaluate(() => new Promise((res) => {
    localStorage.removeItem("tidepool_best_pool");
    TidePool.start("pool");
    let n = 0;
    (function go() {
      if (TidePool.state() !== "play") return res({ state: TidePool.state(), swaps: n, best: Number(localStorage.getItem("tidepool_best_pool")), score: TidePool.score() });
      if (TidePool.busy()) return setTimeout(go, 30);
      const m = TidePool.rules.anyMove(TidePool.board());
      if (m) { TidePool.swap(m[0], m[1]); n++; }
      setTimeout(go, 30);
    })();
  }));
  check("tide-pool: a Rock pool ends after its twenty-fifth swap, its score kept as the best", pool.state === "over" && pool.swaps === 25 && pool.best === pool.score && pool.score > 0, pool);
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
  const early = await p.evaluate(() => TidePool.state());
  await wait(p, 900);
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const again = await p.evaluate(() => ({ state: TidePool.state(), score: TidePool.score() }));
  check("tide-pool: the end card waits a moment for Space, then wades in again", early === "over" && again.state === "play" && again.score === 0, { early, again });
  // the Tide runs out
  await p.evaluate(() => { TidePool.toMenu(); TidePool.start("tide"); TidePool.setTime(0.2); });
  await p.waitForFunction(() => TidePool.state() === "over", null, { timeout: 8000 });
  const tide = await p.evaluate(() => document.getElementById("over-title").textContent);
  await wait(p, 900);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(120);
  check("tide-pool: the Tide ends when its clock runs out, and Backspace on the card goes to the menu", tide === "The tide is in" && (await p.evaluate(() => TidePool.state())) === "menu", tide);
  await done(p, "end");

  // ---- the keyboard: an arrow shows the cursor, Space picks up, an arrow swaps; not while paused
  p = await open();
  await p.evaluate((PLAIN) => {
    TidePool.start("pool");
    const b = eval(PLAIN); b[24] = 5; b[25] = 5; b[26] = 4; b[27] = 5;   // row 3: 5 5 x 5, the swap 26-27 makes a line
    TidePool.setBoard(b);
  }, PLAIN);
  const start = await p.evaluate(() => TidePool.cursor());
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(60);
  const paused = await p.evaluate(() => ({ cursor: TidePool.cursor(), left: TidePool.left() }));
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  await p.keyboard.press("ArrowUp");   // (the first arrow only shows the cursor)
  const c0 = await p.evaluate(() => TidePool.cursor());
  const path2 = [];
  { let r = Math.floor(c0 / 8), c = c0 % 8; while (r !== 3) { path2.push(r < 3 ? "ArrowDown" : "ArrowUp"); r += r < 3 ? 1 : -1; } while (c !== 2) { path2.push(c < 2 ? "ArrowRight" : "ArrowLeft"); c += c < 2 ? 1 : -1; } }
  for (const k of path2) await p.keyboard.press(k);
  await p.keyboard.press("Space"); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(100);
  const swapped = await p.evaluate(() => ({ left: TidePool.left(), score: TidePool.score() }));
  check("tide-pool: paused, the arrows walk nothing; resumed, the arrows walk the cursor, Space picks a piece up and an arrow swaps it",
    paused.cursor === start && paused.left === 25 && swapped.left === 24 && swapped.score > 0, { start, paused, swapped });
  await done(p, "keys");

  // ---- Visual FX: on, the pieces fall into place; off, they're there at once
  const fall = {};
  for (const off of [false, true]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:tide-pool", off ? "1" : "0"); } catch (e) {} }, off) });
    fall[off ? "off" : "on"] = await q.evaluate((PLAIN) => new Promise((res) => {
      TidePool.start("pool");
      const b = eval(PLAIN); b[56] = 5; b[57] = 5; b[58] = 4; b[59] = 5;
      TidePool.setBoard(b); TidePool.swap(58, 59);
      let most = 0; const t0 = performance.now();
      (function look() { most = Math.max(most, TidePool.anims()); if (performance.now() - t0 < 700) requestAnimationFrame(look); else res(most); })();
    }), PLAIN);
    await done(q, "FX " + (off ? "off" : "on"));
  }
  check("tide-pool: with Visual FX on the pieces fall into the gap; with it off they're there at once", fall.on > 0 && fall.off === 0, fall);

  // ---- Visual FX, the motion in detail (the clock held and stepped by the
  // test, so it's exact however busy the machine is). On: a swap's two glide
  // past each other, eased in and out, each to its own side; one that makes
  // no line slides out toward the other's place and springs back, past home a
  // little (and doesn't hold up the next swap); pieces fall gathering speed
  // and squash as they land; each kind leaves in its own way; a long line
  // sends a ring of light across the pool. Off: none of it, the pieces where
  // they go at once, and a swap that makes no line rings the two a moment.
  // (a hook that isn't there, or a step that throws, fails its check rather than the suite)
  const safe = (pr) => pr.catch((e) => ({ error: String(e && e.message || e).split("\n")[0] }));
  const holds = (f) => { try { return !!f(); } catch (e) { return false; } };
  const motion = {};
  for (const off of [false, true]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:tide-pool", off ? "1" : "0"); } catch (e) {} }, off) });
    const r = await safe(q.evaluate((PLAIN) => {
      const M = TidePool.motion, out = {};
      TidePool.start("pool"); M.hold(true);
      // a swap that makes no line, then at once one that does
      let b = eval(PLAIN); b[56] = 5; b[57] = 5; b[58] = 4; b[59] = 5; TidePool.setBoard(b);
      out.failed = TidePool.swap(8, 9); out.ringed = !!M.nope();
      const back = []; for (let k = 0; k <= 17; k++) { back.push(M.pos(8).dx); M.step(0.02); }   // (0.34 s)
      out.back = { most: Math.max(...back), least: Math.min(...back), end: back[back.length - 1] };
      out.again = TidePool.swap(58, 59);
      const sw = []; for (let k = 0; k <= 8; k++) { sw.push([M.pos(58), M.pos(59)]); M.step(0.02); }   // (0.16 s in eight steps)
      out.swap = { q1: sw[2][0].dx, half: sw[4][0].dx, side: sw[4][0].dy, otherSide: sw[4][1].dy, q3: sw[6][0].dx, end: sw[8][0].dx };
      out.clears = M.clears().map((c) => c.k).join();
      out.bubbles = M.bubbles();
      return out;
    }, PLAIN));
    // the fall, once the line has washed away (on the page's own timers; the motion's clock still held)
    await q.waitForFunction(() => TidePool.board()[56] !== 5 || TidePool.motion.kinds().includes("fall"), null, { timeout: 5000 }).catch(() => {});
    r.fall = await safe(q.evaluate(() => {
      const M = TidePool.motion, dys = [], sys = [];
      for (let k = 0; k <= 12; k++) { const p = M.pos(56); dys.push(p.dy); sys.push(p.sy); M.step(0.02); }   // (0.24 s)
      return { start: dys[0], early: dys[4], squash: 1 - Math.min(...sys), end: dys[12], endSy: sys[12] };
    }));
    // a line of five: a ring of light across the pool
    await q.waitForFunction(() => !TidePool.busy(), null, { timeout: 8000 }).catch(() => {});
    r.ripple = await safe(q.evaluate((PLAIN) => {
      const b = eval(PLAIN); b[56] = 5; b[57] = 5; b[58] = 4; b[59] = 5; b[60] = 5; b[50] = 5; TidePool.setBoard(b);
      TidePool.swap(50, 58);
      return TidePool.motion.ripples();
    }, PLAIN));
    await safe(q.evaluate(() => TidePool.motion.hold(false)));
    motion[off ? "off" : "on"] = r;
    await done(q, "motion FX " + (off ? "off" : "on"));
  }
  const on = motion.on, off = motion.off;
  check("tide-pool, FX on: a swap's two pieces glide past each other, eased in and out, each to its own side",
    holds(() => on.again && on.swap.q1 > 0.85 && Math.abs(on.swap.half - 0.5) < 0.05 && on.swap.q3 < 0.15 && on.swap.end === 0 &&
    Math.abs(on.swap.side) > 0.1 && Math.sign(on.swap.side) === -Math.sign(on.swap.otherSide)), on.swap || on);
  check("tide-pool, FX on: a swap that makes no line slides out toward the other's place and springs back, a little past home, and the next swap goes at once",
    holds(() => on.failed === false && on.back.most > 0.45 && on.back.least < -0.005 && Math.abs(on.back.end) < 0.01 && on.again === true), on.back || on);
  check("tide-pool, FX on: a piece falls gathering speed and squashes as it lands",
    holds(() => on.fall.start === -1 && on.fall.early < -0.6 && on.fall.squash > 0.1 && on.fall.end === 0 && on.fall.endSy === 1), on.fall);
  check("tide-pool, FX on: the washed-away pieces leave in their own way, bubbles rising, and a line of five sends a ring across the pool",
    holds(() => on.clears === "5,5,5" && on.bubbles > 0 && on.ripple > 0), { clears: on.clears, bubbles: on.bubbles, ripple: on.ripple });
  check("tide-pool, FX off: none of it (no slide, bounce, fall, leaving, bubbles or ring); a swap that makes no line rings the two, standing still",
    holds(() => off.failed === false && off.ringed && off.back.most === 0 && off.back.least === 0 && off.swap.q1 === 0 && off.swap.side === 0 &&
    off.clears === "" && off.bubbles === 0 && off.fall.start === 0 && off.fall.squash === 0 && off.ripple === 0), off);
  // each kind's own leaving: six different motions, each moving, each gone by the end
  {
    const q = await open();
    const poses = await safe(q.evaluate(() => [0, 1, 2, 3, 4, 5].map((k) => [0.25, 0.5, 0.75, 1].map((u) => {
      const p = TidePool.motion.pose(k, u, 1);
      return [p.dx, p.dy, p.rot, p.sx, p.sy, p.alpha].map((v) => +v.toFixed(3));
    }))));
    const keys = holds(() => poses.length) ? poses.map((s) => JSON.stringify(s.slice(0, 3))) : [];
    const moving = holds(() => poses.every((s) => JSON.stringify(s[1].slice(0, 5)) !== JSON.stringify([0, 0, 0, 1, 1])));
    const gone = holds(() => poses.every((s) => s[3][5] <= 0.05));
    check("tide-pool, FX on: each of the six kinds leaves in its own way (scallop snaps shut and sinks, starfish spins, urchin puffs, sea glass glints and lifts, periwinkle rolls off, pebble sinks), each moving and gone by the end",
      new Set(keys).size === 6 && moving && gone, { poses });
    // and a picked piece stirs in its own way: six different loops
    const stirs = await safe(q.evaluate(() => [0, 1, 2, 3, 4, 5].map((k) => JSON.stringify([0.3, 0.6].map((t) => TidePool.motion.stir(k, t))))));
    check("tide-pool, FX on: each of the six kinds stirs in its own way while picked", holds(() => new Set(stirs).size === 6), stirs);
    await done(q, "poses");
  }

  // ---- a picked piece stirs while it's picked, by a key (Space) or a click,
  // with Visual FX on; with it off it keeps today's plain picked look, still
  const picked = {};
  for (const [label, off, by] of [["on, by key", false, "key"], ["on, by click", false, "click"], ["off, by key", true, "key"]]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:tide-pool", off ? "1" : "0"); } catch (e) {} }, off) });
    await q.evaluate(() => TidePool.start("pool")); await safe(q.evaluate(() => TidePool.motion.hold(true)));
    if (by === "key") { await q.keyboard.press("ArrowUp"); await q.keyboard.press("Space"); }
    else {
      const pt = await q.evaluate(() => { const cv = document.getElementById("stage"), e = cv.getBoundingClientRect(), s = cv.clientWidth / 8; return { x: e.x + cv.clientLeft + s * 3.5, y: e.y + cv.clientTop + s * 3.5 }; });
      await q.mouse.click(pt.x, pt.y);
    }
    picked[label] = await safe(q.evaluate(() => {
      const M = TidePool.motion, out = [];
      for (let k = 0; k < 12; k++) { M.step(0.1); out.push(JSON.stringify(M.picked())); }
      M.hold(false);
      return { sel: TidePool.sel(), poses: new Set(out).size, still: out.every((s) => s === JSON.stringify({ dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, foot: false, glint: -1 })) };
    }));
    await done(q, "picked FX " + label);
  }
  check("tide-pool: a picked piece stirs while it's picked with Visual FX on (by Space or a click); with it off it stays still",
    holds(() => picked["on, by key"].sel >= 0 && picked["on, by key"].poses > 3 && picked["on, by click"].sel >= 0 && picked["on, by click"].poses > 3 &&
    picked["off, by key"].sel >= 0 && picked["off, by key"].still), picked);

  // ---- on a phone: a drag from a piece onto its neighbour swaps them
  {
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    await q.evaluate((PLAIN) => { TidePool.start("pool"); const b = eval(PLAIN); b[56] = 5; b[57] = 5; b[58] = 4; b[59] = 5; TidePool.setBoard(b); }, PLAIN);
    // (the pool inside the rock rim)
    const r = await q.evaluate(() => { const cv = document.getElementById("stage"), e = cv.getBoundingClientRect(), s = cv.clientWidth / 8; return { x: e.x + cv.clientLeft + s * 3.5, y: e.y + cv.clientTop + s * 7.5, s }; });
    const cdp = await c.newCDPSession(q);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x, y: r.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: r.x - r.s * 0.5, y: r.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: r.x - r.s, y: r.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await q.waitForTimeout(150);
    const left = await q.evaluate(() => TidePool.left());
    check("tide-pool, phone: a drag from a piece onto its neighbour swaps them (a line made, a swap spent)", left === 24, left);
    await done(q, "phone");
    await c.close();
  }
  await ctx.close();
};
