// Abyss: a piece slid off a ledge gets a fresh lock delay where it lands; a
// held soft drop lets go when the tab loses focus; the Sprint clock ticks
// between locks; a 0 is never "a new record"; the buttons' keycaps hide on a
// touch-only phone; a full row clears at the same pace with Visual FX on and
// off; Maelstrom, its switches, its turns and its fit (see below); on a
// phone on its side the pad's two halves keep clear of the play area. Frames are
// stepped by the test (see STEPPED), so timing doesn't depend on how busy the
// machine is.
const HOOK = ["start: startRun,", "start: startRun, gameOver: gameOver,"];

// requestAnimationFrame and performance.now on a clock the test advances:
// __frames(n, hz) runs n frames of 1/hz seconds each
const STEPPED = () => {
  let t = 1000, q = [];
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__frames = (n, hz) => {
    for (let i = 0; i < n; i++) {
      t += 1000 / (hz || 60);
      const run = q; q = [];
      run.forEach((cb) => { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } });
    }
  };
};

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  let ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });

  // An O sits half on a one-wide pillar for 450 ms of its 500 ms lock delay,
  // then slides off it in one step and falls to the floor
  const ledge = await p.evaluate(() => {
    __frames(3);
    Abyss.start("descent"); __frames(2);
    for (let y = 8; y < 20; y++) Abyss.test.fill(y, [4]);
    Abyss.test.setGrav(16);
    Abyss.test.setPiece("O"); Abyss.move(-1);              // columns 3-4
    for (let n = 0; n < 200 && Abyss.piece().y < 8; n++) __frames(1);
    __frames(27);
    Abyss.move(-1);                                         // columns 2-3: nothing under it now
    let landed = null, f = 0;
    for (; f < 120; f++) {
      __frames(1);
      const pc = Abyss.piece();
      if (pc.t !== "O" || pc.y < 8) break;                  // it locked (a new piece is up top)
      if (landed === null && pc.y === 20) landed = f;
    }
    Abyss.test.setGrav(0);
    return { landed, locked: f, ms: landed === null ? null : Math.round((f - landed) * 1000 / 60) };
  });
  check("abyss: a piece slid off a ledge gets the whole lock delay where it lands", ledge.ms !== null && ledge.ms >= 480, ledge);

  // Hold ↓, the tab loses focus (it pauses; the key is let go elsewhere, so
  // no keyup comes), resume: nothing should keep soft-dropping
  await p.evaluate(() => { Abyss.start("descent"); Abyss.test.setGrav(100000); __frames(2); });
  await p.keyboard.down("ArrowDown");
  await p.evaluate(() => { __frames(2); window.dispatchEvent(new Event("blur")); });
  const blurred = await p.evaluate(() => !document.querySelector(".gs-pause").hidden);
  const soft = await p.evaluate(() => {
    document.querySelector(".gs-pause button").click();
    const a = { score: Abyss.score(), y: Abyss.piece().y };
    __frames(60);
    return { a, b: { score: Abyss.score(), y: Abyss.piece().y } };
  });
  await p.keyboard.up("ArrowDown");
  check("abyss: a held soft drop lets go when the tab loses focus", blurred && soft.a.score === soft.b.score && soft.a.y === soft.b.y, { blurred, soft });
  await p.evaluate(() => Abyss.test.setGrav(0));

  // Sprint: a second of play with no lock moves the clock on
  const clock = await p.evaluate(() => {
    Abyss.start("sprint"); Abyss.test.setGrav(100000); __frames(2);
    const a = document.getElementById("hud-depth").textContent;
    __frames(60);
    const b = document.getElementById("hud-depth").textContent;
    Abyss.test.setGrav(0);
    return { a, b };
  });
  check("abyss: the Sprint clock ticks between locks", clock.b !== clock.a && /^0:01\.\d\d$/.test(clock.b), clock);

  // A first-ever Descent that ends at 0 (fresh storage: no best yet)
  const zero = await p.evaluate(() => { localStorage.removeItem("abyss_best_descent"); Abyss.start("descent"); __frames(2); Abyss.gameOver(); return { score: Abyss.score(), stats: document.getElementById("over-stats").textContent }; });
  check("abyss: a run that ends at 0 isn't a new record, even the first", zero.score === 0 && !/new record/.test(zero.stats), zero);
  check("abyss: no page errors", p.errs.length === 0, p.errs);
  await ctx.close();

  // Keycaps inside buttons (Dive, Dive again, the mode keys) show with a
  // keyboard and hide on a touch-only phone
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    ctx = await lib.newContext(browser, opts);
    const q = await lib.open(ctx, base, "games/abyss/", { before: (pg) => lib.injectScript(pg, "games/abyss/game.js", [HOOK]) });
    const shown = () => q.evaluate(() => [...document.querySelectorAll(".panel button kbd")].filter((k) => k.getClientRects().length).map((k) => k.closest("button").id || k.closest("button").dataset.v));
    const menu = await shown();
    // the menu's key legend (the touch pad's buttons carry their own icons)
    const legend = await q.evaluate(() => document.querySelector("#menu .keys").getClientRects().length > 0);
    await q.evaluate(() => { Abyss.start("descent"); Abyss.gameOver(); });
    const over = await shown();
    if (label === "phone") check("abyss: on a touch-only phone the buttons' keycaps are hidden", menu.length === 0 && over.length === 0, { menu, over });
    else check("abyss: with a keyboard the buttons' keycaps show (four modes, two switches, Dive)", menu.length === 7 && over.length === 2, { menu, over });
    check("abyss: the menu's key legend " + (label === "phone" ? "is hidden on a touch-only phone" : "shows with a keyboard"), legend === (label !== "phone"), legend);
    await ctx.close();
  }

  // ---- X and Z spin, the up arrow doesn't; the menu's key legend names
  // neither the up arrow nor a pause (the ⏸ button at the top shows that)
  {
    const ctx = await lib.newContext(browser);
    const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });
    const legend = await q.evaluate(() => document.querySelector("#menu .keys").textContent.replace(/\s+/g, " ").trim());
    await q.evaluate(() => { Abyss.start("descent"); Abyss.test.setPiece("T"); __frames(1); });
    const turn = async (key) => { const a = await q.evaluate(() => Abyss.piece().r); await q.keyboard.press(key); return (await q.evaluate(() => Abyss.piece().r)) !== a; };
    const up = await turn("ArrowUp"), x = await turn("x"), z = await turn("z");
    check("abyss: X and Z spin the piece and the up arrow doesn't; the key legend names no up arrow and no pause",
      !up && x && z && !/↑|pause/i.test(legend) && /X/.test(legend) && /Z/.test(legend), { up, x, z, legend });
    check("abyss (spin keys): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await ctx.close();
  }

  // ---- in the middle, top to bottom: each mode's keycap in its row and
  // Dive's beside the word (they sat on the text's foot, three and five
  // pixels low), each button's keycap on the pause card (the keycap set the
  // line, a pixel and a half low), and the score box's figures (on one
  // baseline the small ones hung low)
  {
    const ctx = await lib.newContext(browser);
    const q = await lib.open(ctx, base, "games/abyss/", { before: (pg) => lib.injectScript(pg, "games/abyss/game.js", [HOOK]) });
    const off = (pairs) => q.evaluate((pairs) => pairs.map(([inner, outer]) => {
      return [...document.querySelectorAll(inner)].filter((e) => e.getClientRects().length).map((e) => {
        const r = e.getBoundingClientRect(), b = e.closest(outer).getBoundingClientRect();
        return +(((r.top + r.bottom) - (b.top + b.bottom)) / 2).toFixed(2);
      });
    }).flat(), pairs);
    // (a mode's or a switch's keycap: on its name's line, at the right)
    const menu = (await q.evaluate(() => [...document.querySelectorAll("#menu .seg button kbd")].filter((e) => e.getClientRects().length).map((e) => {
      const r = e.getBoundingClientRect(), b = e.closest("button").querySelector("b").getBoundingClientRect();
      return +(((r.top + r.bottom) - (b.top + b.bottom)) / 2).toFixed(2);
    }))).concat(await off([["#menu .playbtn kbd", "button"]]));
    await q.evaluate(() => Abyss.start("descent")); await q.waitForTimeout(300);
    const hud = await off([["#hud > span", "#hud"]]);
    await q.keyboard.press("p"); await q.waitForTimeout(300);
    const pause = await off([[".gs-pause:not(.gs-dialog) .gs-pause-card button kbd", "button"]]);
    const mid = (a, n, tol) => a.length === n && a.every((d) => Math.abs(d) <= tol);
    check("abyss: each mode's and switch's keycap sits in the middle of its name's line and Dive's beside the word, top to bottom", mid(menu, 7, 1), menu);
    check("abyss: on the pause card each button's keycap sits in the middle of it, top to bottom", mid(pause, 3, 1), pause);
    check("abyss: the score and its two figures sit in the middle of their box, top to bottom", mid(hud, 3, 1.5), hud);
    // the end card's Dive again: its keycap reads dark on the glow, as Dive's
    // does (it was the glow's own colour on the glow, all but invisible)
    const cap = await q.evaluate(() => { document.getElementById("over").hidden = false; const k = document.querySelector("#again kbd"), cs = getComputedStyle(k); return { color: cs.color, shown: k.getClientRects().length > 0 }; });
    check("abyss: on the end card the keycap on Dive again reads dark on the glow", cap.shown && cap.color === "rgb(4, 16, 28)", cap);
    check("abyss (centring): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await ctx.close();
  }

  // ---- full rows take the same time to clear with Visual FX on and off (a
  // quicker clear with it off made every Sprint quicker)
  {
    const frames = {};
    for (const off of [false, true]) {
      const ctx = await lib.newContext(browser);
      const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => {
        await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]);
        await pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:abyss", off ? "1" : "0"); } catch (e) {} }, off);
      } });
      frames[off ? "off" : "on"] = await q.evaluate(() => {
        __frames(2); Abyss.start("descent"); __frames(2);
        Abyss.test.fill(19, [0, 1, 2, 3, 4, 5]);
        Abyss.test.setPiece("I"); Abyss.move(1); Abyss.move(1); Abyss.move(1);   // columns 6-9
        Abyss.hard();
        const was = Abyss.state();
        let f = 0;
        while (Abyss.state() === "clearing" && f < 200) { __frames(1); f++; }
        return { was, f, lines: Abyss.lines() };
      });
      check("abyss (clear pace, FX " + (off ? "off" : "on") + "): no page errors", q.errs.length === 0, q.errs);
      await ctx.close();
    }
    check("abyss: a full row takes the same time to clear with Visual FX off as with it on (about a third of a second)",
      frames.on.was === "clearing" && frames.off.was === "clearing" && frames.on.lines === 1 && Math.abs(frames.on.f - frames.off.f) <= 1 && frames.on.f >= 17, frames);
  }

  // ---- Maelstrom (4): a board shaped like a plus that turns. The menu's 4
  // picks it, and I and J flip its switches (kept; each greyed where it
  // doesn't count). A dive starts with one arm open; Q and E turn nothing
  // until a second opens, every 10 rows; a turn keeps the piece where it is
  // on the screen, the view turning in a fifth of a second (Visual FX on or
  // off); with the arm across open, a piece stops at the middle line; a full
  // column of the core clears as a row does. Juggle with Intense: every arm
  // open from the start, a piece in each at once, the pieces the keys don't
  // move sinking on their own; each way to play keeps its own best, saved as
  // it's passed.
  {
    const ctx = await lib.newContext(browser);
    const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });
    const sw = () => q.evaluate(() => ({ mode: Abyss.mode(), intense: document.getElementById("opt-intense").getAttribute("aria-pressed"), juggle: document.getElementById("opt-juggle").getAttribute("aria-pressed"),
      intenseOff: document.getElementById("opt-intense").disabled, juggleOff: document.getElementById("opt-juggle").disabled,
      kept: ["abyss_mode", "abyss_intense", "abyss_juggle"].map((k) => localStorage.getItem(k)).join() }));
    await q.keyboard.press("2"); const sprint = await sw();
    await q.keyboard.press("4"); const mael = await sw();
    await q.keyboard.press("i"); await q.keyboard.press("j"); const both = await sw();
    await q.keyboard.press("i"); await q.keyboard.press("j"); const neither = await sw();
    check("abyss: 4 picks Maelstrom; I and J flip Intense and Juggle (kept), each greyed where it doesn't count (both in Sprint, Juggle outside Maelstrom)",
      sprint.mode === "sprint" && sprint.intenseOff && sprint.juggleOff && mael.mode === "maelstrom" && !mael.intenseOff && !mael.juggleOff &&
      both.intense === "true" && both.juggle === "true" && both.kept === "maelstrom,1,1" && neither.intense === "false" && neither.juggle === "false" && neither.kept === "maelstrom,0,0",
      { sprint, mael, both, neither });

    const single = await q.evaluate(() => {
      __frames(2); Abyss.start("maelstrom"); __frames(2);
      const B = Abyss.board(), r = {};
      r.start = { open: B.open.join(), pieces: B.pieces().filter(Boolean).length, k: B.piece().k, q: Abyss.turn(-1), e: Abyss.turn(1) };
      // nine rows down already; the tenth (the core's last row, its gap filled by a standing I) opens the east arm
      Abyss.test.setLines(9);
      for (let x = 8; x < 18; x++) if (x !== 12) B.test.set(x, 17, 1);
      B.test.clearPiece(0); B.test.place(0, "I", 1, 2, 2);
      Abyss.hard();
      r.clearing = Abyss.state();
      __frames(30);
      r.cleared = { state: Abyss.state(), lines: Abyss.lines(), open: B.open.join(), gap: [14, 15, 16, 17].map((y) => B.test.get(12, y) ? 1 : 0).join("") };
      // E: the east arm to the top, the piece where it was on the screen; the view a little way round, then all the way
      const p0 = B.piece(), was = { x: p0.x, y: p0.y, r: p0.r };
      r.turned = Abyss.turn(-1);
      const p1 = B.piece();
      r.kept = p1.k === 1 && p1.x === was.x && p1.y === was.y && p1.r === was.r;
      __frames(6); r.mid = Abyss.view().angle;
      __frames(12); r.end = Abyss.view().angle;
      // back to the north arm, the south one open: a piece stops at the middle line
      Abyss.turn(1); __frames(15);
      B.openArms(3);
      B.test.clearPiece(B.top); B.test.place(B.top, "I", 0, 3, -1);
      Abyss.hard();
      r.middle = { top: B.top, row12: [11, 12, 13, 14].every((x) => B.test.get(x, 12)), row13: B.test.get(11, 13) };
      __frames(2);
      // a full column of the core (x 15, rows 8 to 17) clears too
      const lines0 = Abyss.lines();
      for (let y = 9; y < 18; y++) B.test.set(15, y, 1);
      B.test.clearPiece(B.top); B.test.place(B.top, "O", 0, 6, 7);   // (an O on rows 7-8, columns 14-15)
      B.test.lock(B.top);
      __frames(30);
      r.column = { lines: Abyss.lines() - lines0, gone: [9, 12, 17].every((y) => !B.test.get(15, y)) };
      r.best = localStorage.getItem("abyss_best_maelstrom");
      r.score = Abyss.score();
      return r;
    });
    check("abyss, Maelstrom: one arm open, one piece, in it; Q and E turn nothing yet",
      single.start.open === "true,false,false,false" && single.start.pieces === 1 && single.start.k === 0 && !single.start.q && !single.start.e, single.start);
    check("abyss, Maelstrom: the tenth row (the core's last, its gap filled) clears, the blocks above coming down one, and opens the east arm",
      single.clearing === "clearing" && single.cleared.state === "play" && single.cleared.lines === 10 && single.cleared.open === "true,true,false,false" && single.cleared.gap === "0111", single);
    check("abyss, Maelstrom: Q turns the east arm to the top, the piece kept where it was on the screen, the view turning over a fifth of a second",
      single.turned && single.kept && single.mid < -0.2 && single.mid > -1.4 && Math.abs(single.end + Math.PI / 2) < 1e-6, single);
    check("abyss, Maelstrom: with the arm across open, a piece stops at the middle line",
      single.middle.top === 0 && single.middle.row12 && !single.middle.row13, single.middle);
    check("abyss, Maelstrom: a full column of the core clears too, and the dive's best is saved as it's passed",
      single.column.lines === 1 && single.column.gone && Number(single.best) === single.score && single.score > 0, { column: single.column, best: single.best, score: single.score });

    // Juggle and Intense
    await q.evaluate(() => Abyss.toMenu());
    await q.keyboard.press("i"); await q.keyboard.press("j");
    const juggle = await q.evaluate(() => {
      __frames(2); Abyss.start("maelstrom"); __frames(2);
      const B = Abyss.board(), r = {};
      r.open = B.open.join(); r.depth = document.getElementById("hud-depth").textContent;
      const ys = () => B.pieces().map((p) => p && p.y);
      r.y0 = ys(); r.n = B.pieces().filter(Boolean).length;
      __frames(90);
      r.y1 = ys();
      return r;
    });
    await q.keyboard.press("ArrowDown");
    juggle.best = await q.evaluate(() => [localStorage.getItem("abyss_best_maelstrom_juggle_intense"), Abyss.score()]);
    const sank = [1, 2, 3].every((k) => juggle.y1[k] !== null && juggle.y1[k] > juggle.y0[k]);
    check("abyss, Maelstrom with Juggle and Intense: every arm open at the start, a piece in each, the three the keys don't move sinking on their own, three times as deep (300m)",
      juggle.open === "true,true,true,true" && juggle.n === 4 && sank && juggle.depth === "300m", juggle);
    check("abyss, Maelstrom with Juggle and Intense: its best is kept apart from the others",
      Number(juggle.best[0]) === juggle.best[1] && juggle.best[1] > 0, juggle.best);
    check("abyss (Maelstrom): no page errors", q.errs.length === 0, q.errs);
    await ctx.close();
  }

  // ---- Maelstrom paused: Q and E turn nothing and nothing falls under the
  // pause card (a pause is no free turn); resumed, it carries on; Esc mid-dive
  // asks "Leave this game?"
  {
    const ctx = await lib.newContext(browser);
    const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });
    const look = () => q.evaluate(() => { const B = Abyss.board(), pc = B.piece(); return { top: B.top, angle: +Abyss.view().angle.toFixed(4), y: pc ? pc.y : null, x: pc ? pc.x : null, state: Abyss.state(),
      paused: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null }; });
    await q.evaluate(() => { __frames(2); Abyss.start("maelstrom"); Abyss.board().openArms(2); __frames(2); });
    await q.keyboard.press("p");
    const before = await look();
    await q.keyboard.press("q"); await q.keyboard.press("e"); await q.keyboard.press("ArrowLeft");
    await q.evaluate(() => __frames(60));
    const under = await look();
    await q.evaluate(() => document.querySelector(".gs-pause:not(.gs-dialog) button").click());
    await q.evaluate(() => __frames(60));
    const after = await look();
    await q.keyboard.press("Escape"); await q.evaluate(() => __frames(2));
    const esc = await look();
    check("abyss, Maelstrom: under the pause card Q, E and the arrows do nothing and nothing falls; resumed, the piece sinks again; Esc mid-dive asks \"Leave this game?\"",
      before.paused && under.paused && under.top === before.top && under.angle === before.angle && under.x === before.x && under.y === before.y &&
      !after.paused && after.y > under.y && esc.dlg === "Leave this game?", { before, under, after, esc });
    check("abyss (Maelstrom paused): no page errors", q.errs.length === 0, q.errs);
    await ctx.close();
  }

  // ---- Maelstrom on a phone: the pad has the two turn buttons (only in
  // Maelstrom), and they turn the board; the whole plus, with a row above it
  // for the piece coming in, is on the screen between the score box and the
  // pad, on phones and on laptops
  {
    const fits = [];
    for (const [w, h, phone] of [[320, 568, 1], [375, 553, 1], [360, 640, 1], [390, 664, 1], [1366, 657, 0], [1280, 600, 0], [1280, 900, 0]]) {
      const ctx = await lib.newContext(browser, phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h } });
      const q = await lib.open(ctx, base, "games/abyss/", { before: (pg) => lib.injectScript(pg, "games/abyss/game.js", [HOOK]) });
      const look = () => q.evaluate(() => {
        const r = (sel) => { const e = document.querySelector(sel); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; };
        const v = Abyss.view(), hud = r("#hud"), pad = r("#pad");
        return { turns: [r("#p-turnl"), r("#p-turnr")].filter(Boolean).length, top: v.cy - 14 * v.cell, bottom: v.cy + 13 * v.cell, left: v.cx - 13 * v.cell, right: v.cx + 13 * v.cell,
          hud: hud ? hud.bottom : 0, pad: pad ? pad.top : innerHeight, cell: v.cell };
      });
      await q.evaluate(() => { Abyss.start("descent"); });
      const descent = await look();
      await q.evaluate(() => { Abyss.toMenu(); Abyss.start("maelstrom"); Abyss.board().openArms(2); });
      await q.waitForTimeout(100);
      const m = await look();
      let turned = null;
      if (phone) { await q.tap("#p-turnl"); turned = await q.evaluate(() => Abyss.board().top); }
      fits.push({ size: w + "x" + h, ok: m.top >= m.hud - 1 && m.bottom <= m.pad + 1 && m.left >= 0 && m.right <= w && (!phone || (m.turns === 2 && descent.turns === 0 && turned === 1)), m, descentTurns: descent.turns, turned, errs: q.errs.length });
      await ctx.close();
    }
    check("abyss, Maelstrom: on phones the pad's two turn buttons (Maelstrom only) turn the board; at 320 x 568, 375 x 553, 360 x 640, 390 x 664, 1366 x 657, 1280 x 600 and 1280 x 900 the plus fits between the score box and the pad",
      fits.every((f) => f.ok && !f.errs), fits);
  }

  // ---- a phone on its side: the pad in two halves at the screen's sides,
  // and the play area (the well with its hold and next boxes, or the plus
  // with a row above it) between them, on the screen, under no button and
  // not under the score box; in Descent, Maelstrom and Maelstrom juggle
  {
    const side = [];
    for (const [w, h] of [[844, 390], [667, 375], [740, 360]]) {
      const ctx = await lib.newContext(browser, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const q = await lib.open(ctx, base, "games/abyss/");
      for (const m of ["descent", "maelstrom", "juggle"]) {
        const r = await q.evaluate((m) => {
          Abyss.toMenu();
          if (Abyss.switches().juggle !== (m === "juggle")) { Abyss.start("maelstrom"); Abyss.toMenu(); document.getElementById("opt-juggle").click(); }
          Abyss.start(m === "descent" ? "descent" : "maelstrom");
          const box = (e) => { const b = e.getBoundingClientRect(); return { n: e.id, x: b.left, y: b.top, w: b.width, h: b.height }; };
          const areas = Abyss.areas(), hud = box(document.getElementById("hud"));
          const btns = [...document.querySelectorAll("#pad button")].filter((b) => b.getClientRects().length && b.getBoundingClientRect().width).map(box);
          const meet = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
          const play = areas[0], under = [];
          areas.forEach((a) => btns.concat(hud).forEach((b) => { if (meet(a, b)) under.push(a.n + "/" + b.n); }));
          return { juggle: Abyss.switches().juggle, n: btns.length, under, off: areas.filter((a) => a.x < 0 || a.y < 0 || a.x + a.w > innerWidth || a.y + a.h > innerHeight).map((a) => a.n),
            left: btns.filter((b) => b.x + b.w <= play.x).length, right: btns.filter((b) => b.x >= play.x + play.w).length };
        }, m);
        let turned = null;
        if (m === "maelstrom") { await q.evaluate(() => Abyss.board().openArms(2)); await q.tap("#p-turnl"); turned = await q.evaluate(() => Abyss.board().top); }
        side.push({ size: w + "x" + h, m, ok: r.juggle === (m === "juggle") && r.n === (m === "descent" ? 6 : 8) && !r.under.length && !r.off.length && r.left + r.right === r.n && r.left === 4 && (m !== "maelstrom" || turned === 1), r, turned });
      }
      side.push({ size: w + "x" + h, m: "errors", ok: !q.errs.length, errs: q.errs });
      await ctx.close();
    }
    check("abyss: on a phone on its side (844 x 390, 667 x 375, 740 x 360) the pad is in two halves at the screen's sides (four buttons on the left), and in Descent, Maelstrom and Maelstrom juggle the play area is on the screen between them, under no button and not under the score box; its turn buttons still turn the board",
      side.every((s) => s.ok), side.filter((s) => !s.ok).concat(side.length ? [] : ["none run"]));
  }

  // ---- a phone upright: the well and its hold and next boxes (or the plus)
  // all on the screen, none over another, nor under the score box, the
  // corner buttons, the way back or the pad; the hold and next boxes below
  // the score box. At the start of a run and a few pieces in (Sprint's
  // clock widens the score box), small phones and tall ones
  {
    const up = [];
    for (const [w, h] of [[320, 568], [360, 560], [375, 553], [360, 640], [390, 664], [412, 915], [390, 844]]) {
      const ctx = await lib.newContext(browser, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const q = await lib.open(ctx, base, "games/abyss/");
      for (const m of ["descent", "sprint", "maelstrom"]) {
        for (const when of ["start", "in"]) {
          const r = await q.evaluate(([m, when]) => {
            if (when === "start") { Abyss.toMenu(); Abyss.start(m); } else for (let i = 0; i < 3; i++) Abyss.hard();
            const box = (n, e) => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return b.width ? { n, x: b.left, y: b.top, w: b.width, h: b.height } : null; };
            const others = [box("score", document.getElementById("hud")), box("corner", document.querySelector(".gs-corner")), box("back", document.querySelector(".nav-back-games"))]
              .concat([...document.querySelectorAll("#pad button")].map((b) => box(b.id, b))).filter(Boolean);
            const meet = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
            const areas = Abyss.areas(), score = others[0], under = [];
            areas.forEach((a, i) => { others.forEach((o) => { if (meet(a, o)) under.push(a.n + "/" + o.n); }); areas.slice(i + 1).forEach((b) => { if (meet(a, b)) under.push(a.n + "/" + b.n); }); });
            const off = areas.filter((a) => a.x < -0.5 || a.y < -0.5 || a.x + a.w > innerWidth + 0.5 || a.y + a.h > innerHeight + 0.5).map((a) => a.n);
            const high = areas.filter((a) => (a.n === "hold" || a.n === "next") && score && a.y < score.y + score.h).map((a) => a.n);
            return { n: areas.length, under, off, high };
          }, [m, when]);
          up.push({ size: w + "x" + h, m, when, ok: r.n === (m === "maelstrom" ? 1 : 3) && !r.under.length && !r.off.length && !r.high.length, r });
        }
      }
      up.push({ size: w + "x" + h, m: "errors", ok: !q.errs.length, errs: q.errs });
      await ctx.close();
    }
    check("abyss: on a phone upright (320 x 568, 360 x 560, 375 x 553, 360 x 640, 390 x 664, 412 x 915, 390 x 844), in Descent, Sprint and Maelstrom, the well with its hold and next boxes (or the plus) is on the screen, nothing over anything else nor under the score box, the corner buttons, the way back or the pad, the hold and next boxes below the score box",
      up.every((u) => u.ok), up.filter((u) => !u.ok));
  }
};
