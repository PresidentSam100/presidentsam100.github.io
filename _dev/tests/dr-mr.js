// Dr. Mr.: the rules (a level's germs, how many and how high, never three of
// a colour in a line to start; a turn and its step off the wall; four in a
// line clear, loose halves fall, a lying capsule waits for both halves to be
// free; a chain; points doubling per germ by speed; junk from two lines);
// a capsule that clears the last germ cures the level, the best kept at once,
// and the card's Space waits a moment; the keys in play; pausing covers the
// vials; with Visual FX off the germs and Dr. Mr. hold still; Endless grows a
// row from the floor; versus sends junk and the CPU plays; two players share
// the keyboard; the menu's keys; the touch pad; and every size fits, the
// maker's line SAM LU PHARMACY engraved on each stage.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const done = async (p, what) => { check("dr-mr " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const open = (c) => lib.open(c, base, "games/dr-mr/");
  let ctx = await lib.newContext(browser);

  // ---- the rules ------------------------------------------------------------
  let p = await open(ctx);
  const rules = await p.evaluate(() => {
    const R = DrMr.rules, at = (b, x, y) => b[y * 8 + x];
    const out = { counts: [0, 10, 20, 30].map((L) => R.germCount(L)), wrongCount: 0, tooHigh: 0, threes: 0 };
    for (const L of [0, 7, 14, 15, 17, 19, 20]) for (let s = 1; s <= 12; s++) {
      const b = R.makeGerms(L, s * 977 + L);
      if (R.germsLeft(b) !== R.germCount(L)) out.wrongCount++;
      for (let i = 0; i < b.length; i++) if (b[i] && Math.floor(i / 8) < 16 - R.germRows(L)) out.tooHigh++;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
        const c = at(b, x, y); if (!c) continue;
        if (x < 6 && at(b, x + 1, y) && at(b, x + 2, y) && at(b, x + 1, y).c === c.c && at(b, x + 2, y).c === c.c) out.threes++;
        if (y < 14 && at(b, x, y + 1) && at(b, x, y + 2) && at(b, x, y + 1).c === c.c && at(b, x, y + 2).c === c.c) out.threes++;
      }
    }
    // turning: lying a b, turned clockwise, a stands over b at the pivot; a
    // standing capsule at the right wall turned to lie steps one cell left
    const e = R.emptyBoard(), q = R.turned(e, R.spawn(e, [0, 1]), 1);
    out.turn = JSON.stringify(R.cellsOf(q).map((c) => [c.x, c.y, c.c]));
    const k = R.turned(e, { x: 7, y: 8, rot: 1, a: 0, b: 1 }, 1);
    out.kick = k && [k.x, k.rot];
    // a chain: three red germs and three yellow on the floor, a capsule standing
    // at x 3, yellow over red: the reds go, the yellow half falls into the yellows
    const b = R.emptyBoard(), put = (x, y, c) => { b[y * 8 + x] = { c, g: true, link: "" }; };
    put(0, 15, 0); put(1, 15, 0); put(2, 15, 0); put(4, 15, 1); put(5, 15, 1); put(6, 15, 1);
    const res = R.resolve(b, { x: 3, y: 15, rot: 1, a: 1, b: 0 });
    out.chain = { germs: res.germs, runs: res.runs, left: R.germsLeft(b), pts: R.points(res.germs, "med") };
    // a lying capsule stays up while either half rests on something
    const h = R.emptyBoard();
    h[15 * 8] = { c: 2, g: true, link: "" }; h[10 * 8] = { c: 0, g: false, link: "r" }; h[10 * 8 + 1] = { c: 1, g: false, link: "l" };
    R.settle(h);
    out.lying = !!(h[14 * 8] && h[14 * 8 + 1] && h[14 * 8].link === "r");
    out.points = [R.points(1, "low"), R.points(1, "med"), R.points(1, "hi"), R.points(7, "low")];
    out.junk = [R.junkFor(1, [0]).length, JSON.stringify(R.junkFor(2, [0, 2])), R.junkFor(6, [0, 1, 2, 0, 1, 2]).length];
    return out;
  });
  check("dr-mr: a level's germs number 4 for each level and one (84 from level 20 on), every time, none above its rows, never three of a colour in a line",
    JSON.stringify(rules.counts) === "[4,44,84,84]" && rules.wrongCount === 0 && rules.tooHigh === 0 && rules.threes === 0, rules);
  check("dr-mr: turned clockwise, a lying capsule stands its left half over its right at the pivot; turned to lie against the right wall it steps a cell left",
    rules.turn === "[[3,-1,0],[3,0,1]]" && JSON.stringify(rules.kick) === "[6,2]", { turn: rules.turn, kick: rules.kick });
  check("dr-mr: four in a line clear, germs and halves alike; the loose half falls and clears again (a chain, 6 germs: 12,600 at Med)",
    rules.chain.germs === 6 && rules.chain.runs === 2 && rules.chain.left === 0 && rules.chain.pts === 12600, rules.chain);
  check("dr-mr: a lying capsule waits up while either half rests on something", rules.lying, rules);
  check("dr-mr: a germ is worth 100 at Low, 200 at Med, 300 at Hi, each after it in one drop twice the one before, up to the sixth's worth",
    JSON.stringify(rules.points) === "[100,200,300,9500]", rules.points);
  check("dr-mr: two lines or more in one drop send the other vial that many loose halves in their colours, four at most",
    JSON.stringify(rules.junk) === '[0,"[0,2]",4]', rules.junk);
  await done(p, "rules");

  // ---- the last germ cured: the card, the best kept, Space waits ------------------
  p = await open(ctx);
  await p.evaluate(() => { DrMr.setLevel(3); DrMr.start("levels"); DrMr.hold(); DrMr.setBoard(0, ["rrr....."]); DrMr.setNext(0, [[0, 1]]); DrMr.step(0.3); });
  const before = await p.evaluate(() => DrMr.players()[0].piece);
  await p.keyboard.press("Space");
  await p.evaluate(() => DrMr.step(0.05, 20));
  const cured = await p.evaluate(() => ({ state: DrMr.state(), score: DrMr.players()[0].score, best: localStorage.getItem("drmr_best_levels"), lvl: localStorage.getItem("drmr_best_cured"),
    title: document.getElementById("over-title").textContent, again: document.getElementById("again").textContent, shown: !document.getElementById("over").hidden }));
  check("dr-mr: Space drops the capsule; three red germs and its red half clear, the level is cured (1,400 at Med), the card says so, the best and the level are kept",
    before && before.x === 3 && cured.state === "cured" && cured.score === 1400 && cured.best === "1400" && cured.lvl === "3" && /Level 3 cured/.test(cured.title) && cured.again === "Next level" && cured.shown, { before, cured });
  await p.keyboard.press("Space"); await p.waitForTimeout(80);
  const early = await p.evaluate(() => DrMr.state());
  await p.waitForTimeout(750);
  await p.keyboard.press("Space"); await p.waitForTimeout(80);
  const next = await p.evaluate(() => ({ state: DrMr.state(), level: DrMr.players()[0].level, score: DrMr.players()[0].score }));
  check("dr-mr: on the card Space waits a moment (one pressed as the level ends can't skip it), then goes on to the next level, the score carried",
    early === "cured" && next.state === "play" && next.level === 4 && next.score === 1400, { early, next });
  await done(p, "cure");

  // ---- the keys in play ----------------------------------------------------------
  p = await open(ctx);
  await p.evaluate(() => { DrMr.start("levels"); DrMr.hold(); DrMr.setBoard(0, ["y......."]); DrMr.step(0.3); });
  const pc = () => p.evaluate(() => DrMr.players()[0].piece);
  const k0 = await pc();
  await p.keyboard.down("ArrowLeft");
  const k1 = await pc();
  await p.evaluate(() => DrMr.step(0.1));
  const k2 = await pc();
  await p.evaluate(() => DrMr.step(0.13));
  const k3 = await pc();
  await p.keyboard.up("ArrowLeft");
  await p.evaluate(() => DrMr.step(0.1));
  const k4 = await pc();
  check("dr-mr: ← moves the capsule a cell; held, it waits a moment, then repeats; let go, it stops",
    k0.x === 3 && k1.x === 2 && k2.x === 2 && k3.x === 1 && k4.x === 1, [k0, k1, k2, k3, k4].map((q) => q.x));
  await p.keyboard.press("x"); const t1 = await pc();
  await p.keyboard.press("z"); const t2 = await pc();
  await p.keyboard.press("z"); const t3 = await pc();
  check("dr-mr: X turns the capsule clockwise, Z the other way", t1.rot === 1 && t2.rot === 0 && t3.rot === 3, [t1.rot, t2.rot, t3.rot]);
  const y0 = (await pc()).y;
  await p.evaluate(() => DrMr.step(0.2));
  const y1 = (await pc()).y;
  await p.keyboard.down("ArrowDown"); await p.evaluate(() => DrMr.step(0.3)); await p.keyboard.up("ArrowDown");
  const y2 = (await pc()).y;
  check("dr-mr: held, ↓ makes the capsule fall fast, but not in a flash (about 16 rows a second, to Med's 2): 5 rows in 0.3 s (it was 10)",
    y1 - y0 <= 1 && y2 - y1 === 5, { y0, y1, y2 });
  // ↓ pressed just before the next row was due starts from there: a row,
  // then the next, never several at once (the wait already built up was spent
  // in one frame, so the capsule jumped down part of the vial)
  const jump = await p.evaluate(() => {
    DrMr.start("levels"); DrMr.hold(); DrMr.setBoard(0, ["y......."]); DrMr.step(0.3);
    DrMr.step(0.44);
    const y0 = DrMr.players()[0].piece.y;
    DrMr.press(0, "soft"); DrMr.step(0.05);
    const y1 = DrMr.players()[0].piece.y;
    DrMr.release(0, "soft");
    return { y0, y1 };
  });
  check("dr-mr: ↓ pressed late in a row's wait moves the capsule one row at first, never several at once", jump.y1 - jump.y0 === 1, jump);
  await done(p, "keys");

  // ---- pausing covers the vials and stops the clock --------------------------------------
  p = await open(ctx);
  await p.evaluate(() => { DrMr.start("levels"); });
  await p.waitForFunction(() => DrMr.players()[0].phase === "fall", null, { timeout: 8000 });
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const pz0 = await p.evaluate(() => ({ cls: document.body.classList.contains("paused"), vis: getComputedStyle(document.getElementById("stage")).visibility,
    chart: getComputedStyle(document.getElementById("chart0")).visibility, keys: getComputedStyle(document.getElementById("legend0")).visibility, y: DrMr.players()[0].piece.y }));
  await p.waitForTimeout(1200);
  const pz1 = await p.evaluate(() => DrMr.players()[0].piece.y);
  await p.keyboard.press("p"); await p.waitForTimeout(150);
  const pz2 = await p.evaluate(() => ({ cls: document.body.classList.contains("paused"), vis: getComputedStyle(document.getElementById("stage")).visibility }));
  check("dr-mr: P pauses: the view is covered (no planning while the clock is stopped), the chart and the key line with it, and nothing falls; P again plays on",
    pz0.cls && pz0.vis === "hidden" && pz0.chart === "hidden" && pz0.keys === "hidden" && pz1 === pz0.y && !pz2.cls && pz2.vis === "visible", { pz0, pz1, pz2 });
  await done(p, "pause");
  await ctx.close();

  // ---- Visual FX: off, the germs, their fuzz and Dr. Mr. hold still; on, they move ------------
  const still = async (off) => {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/dr-mr/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:dr-mr", off ? "1" : "0"); } catch (e) {} }, off) });
    const shot = () => q.evaluate(() => document.getElementById("stage").toDataURL());
    const frames = (n) => q.evaluate((n) => new Promise((r) => { let k = 0; (function f() { if (++k > n) r(); else requestAnimationFrame(f); })(); }), n);
    await frames(3);
    const a = await shot(); await frames(50); const b = await shot();
    const errs = q.errs; await c.close();
    return { same: a === b, errs };
  };
  const fxOff = await still(true), fxOn = await still(false);
  check("dr-mr, Visual FX off: the vial's germs, their fuzz and Dr. Mr. hold still (on, the faces change and the fuzz stirs)", fxOff.same && !fxOn.same, { fxOff: fxOff.same, fxOn: fxOn.same });
  check("dr-mr (FX): no page errors", fxOff.errs.length === 0 && fxOn.errs.length === 0, [fxOff.errs, fxOn.errs]);

  // ---- Visual FX turned off on the way: the scenery (the cells drifting
  // across the slide) stops where it is, held there, and on again it drifts
  // on from that spot (its clock goes on from where it stopped). The germs
  // are no part of the scenery: with FX off they rest on their first face,
  // whenever it goes off, just as on a page opened with FX off. Each germ is
  // read as where and how its body is drawn (centred on its own spot, lit
  // from its top left), as the vial's glass lets the cells show through.
  // The page's clock is run by hand
  {
    const spy = (pg) => pg.addInitScript(() => {
      const make = CanvasRenderingContext2D.prototype.createRadialGradient;
      CanvasRenderingContext2D.prototype.createRadialGradient = function (x0, y0, r0, x1, y1, r1) {
        if (window.__g && x1 === 0 && y1 === 0 && x0 < 0) { const m = this.getTransform(); window.__g.push([m.a, m.b, m.c, m.d, m.e, m.f, r1].map((v) => v.toFixed(2)).join(",")); }
        return make.apply(this, arguments);
      };
    });
    // (one frame drawn there and then, the germs' bodies noted as it goes)
    const germs = (q) => q.evaluate(() => { window.__g = []; DrMr.step(0); const out = window.__g; window.__g = null; return out.join(" "); });
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/dr-mr/", { before: async (pg) => { await pg.clock.install(); await spy(pg); await pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:dr-mr", "0"); } catch (e) {} }); } });
    await q.clock.pauseAt(await q.evaluate(() => Date.now()) + 500);
    const shot = () => q.evaluate(() => document.getElementById("stage").toDataURL());
    const idle = () => q.evaluate(() => (DrMr.idle ? DrMr.idle() : -1));
    const flip = () => q.evaluate(() => document.querySelector(".rm-toggle").click());
    await q.clock.runFor(7000);
    const moving = await germs(q);
    await flip(); await q.clock.runFor(100);
    const b = await shot(), at = await idle(), offB = await germs(q);
    await q.clock.runFor(1500);
    const held = await shot(), atHeld = await idle();
    await flip(); await q.clock.runFor(2300);
    const later = await idle();
    await flip(); await q.clock.runFor(100);
    const again = await shot(), offC = await germs(q);
    const c2 = await lib.newContext(browser);
    const r = await lib.open(c2, base, "games/dr-mr/", { before: async (pg) => { await spy(pg); await pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:dr-mr", "1"); } catch (e) {} }); } });
    const rest = await germs(r);
    // (the second time off, the germs as the first time, so what differs is the cells)
    check("dr-mr: Visual FX turned off on the way stops the cells drifting across the slide where they are, held there; on again they drift on from that spot",
      at > 6 && b === held && atHeld === at && Math.abs(later - at - 2.3) < 0.2 && offC === offB && again !== held, { at, atHeld, later, held: b === held, movedOn: again !== held });
    check("dr-mr: Visual FX turned off on the way, at any moment, puts every germ back on its first face, as on a page opened with FX off (on, they were mid-act)",
      rest.length > 0 && offB === rest && offC === rest && moving !== rest, { germs: rest.split(" ").length, first: offB === rest, second: offC === rest, wasMoving: moving !== rest });
    check("dr-mr (FX turned off on the way): no page errors", q.errs.length === 0 && r.errs.length === 0, [q.errs, r.errs]);
    await c.close(); await c2.close();
  }

  // ---- a germ's acts: the next starts only when its cycle comes round, never midway ---------
  ctx = await lib.newContext(browser);
  p = await open(ctx);
  const acts = await p.evaluate(() => {
    DrMr.start("levels"); DrMr.hold(); DrMr.setBoard(0, ["rybrybry", "ybrybryb", "brybrybr"]);
    const last = {}, bad = [];
    let changes = 0;
    for (let k = 0; k < 240; k++) {
      DrMr.step(0.05);
      for (let y = 13; y < 16; y++) for (let x = 0; x < 8; x++) {
        const cy = DrMr.germCycle(0, x, y), key = x + "," + y, was = last[key];
        if (!cy) continue;
        if (was && cy.act !== was.act) { changes++; if (!(cy.f < was.f)) bad.push({ key, was, now: cy }); }
        last[key] = cy;
      }
    }
    return { changes, bad: bad.slice(0, 3), state: DrMr.state() };
  });
  check("dr-mr: a germ moves on to its next act only as its cycle comes back round, never partway through one (24 germs over 12 s)",
    acts.changes >= 24 && acts.bad.length === 0 && acts.state === "play", acts);
  await done(p, "acts");

  // ---- Endless: the culture grows a row from the floor -------------------------------------
  p = await open(ctx);
  const grown = await p.evaluate(() => {
    DrMr.start("endless"); DrMr.hold(); DrMr.setBoard(0, ["y......."]);
    const seed0 = DrMr.germCycle(0, 0, 15).seed;
    for (let i = 0; i < 12; i++) { DrMr.step(0.3); DrMr.press(0, "hard"); DrMr.step(0.05, 30); }
    const pl = DrMr.players()[0], b = DrMr.board(0), up = DrMr.germCycle(0, 0, 14);
    return { grows: pl.grows, capsules: pl.capsules, floor: b.slice(120).filter((c) => /^G/.test(c)).length, state: DrMr.state(), seed0, seed1: up && up.seed };
  });
  check("dr-mr: in Endless the culture grows a row of germs from the floor after the first dozen capsules, pushing everything up",
    grown.grows === 1 && grown.capsules === 12 && grown.floor >= 2 && grown.state === "play", grown);
  check("dr-mr: a germ pushed up a row keeps its own clock, so it carries on with its act instead of jumping to another",
    grown.seed0 === 120 && grown.seed1 === 120, { seed0: grown.seed0, seed1: grown.seed1 });
  await done(p, "endless");

  // ---- versus: two lines in one drop send junk; the first to cure wins; the CPU plays ----------
  p = await open(ctx);
  const vs = await p.evaluate(() => {
    DrMr.start("cpu"); DrMr.hold(); DrMr.setBoard(0, ["rrr..yyy"]); DrMr.setNext(0, [[0, 1]]);
    DrMr.step(0.3); DrMr.press(0, "hard"); DrMr.step(0.05, 30);
    return { state: DrMr.state(), junk: DrMr.players()[1].junkIn, title: document.getElementById("over-title").textContent, msg: document.getElementById("over-msg").textContent,
      why: document.getElementById("over-stats").textContent };
  });
  check("dr-mr vs CPU: a drop that clears a red line and a yellow one sends the CPU a red half and a yellow; curing first wins the round, and the card says so outright",
    JSON.stringify(vs.junk) === "[0,1]" && vs.state === "over" && vs.title === "You win!" && /you cured your vial first/.test(vs.why) && vs.msg === "You 1 : 0 CPU", vs);
  // your vial full to the neck: the CPU wins the round, and the card says why
  const full = await p.evaluate(() => {
    DrMr.start("cpu"); DrMr.hold();
    const rows = []; for (let y = 0; y < 16; y++) rows.push(["rrbbyyrr", "yyrrbbyy", "bbyyrrbb"][y % 3]);
    DrMr.setBoard(0, rows); DrMr.step(0.3);
    return { state: DrMr.state(), title: document.getElementById("over-title").textContent, msg: document.getElementById("over-msg").textContent, why: document.getElementById("over-stats").textContent };
  });
  check("dr-mr vs CPU: with your vial full to the neck the CPU wins the round: the card reads The CPU wins, because your vial filled, You 0 : 1 CPU",
    full.state === "over" && full.title === "The CPU wins" && /your vial filled to the neck/.test(full.why) && full.msg === "You 0 : 1 CPU", full);
  const cpu = await p.evaluate(() => {
    DrMr.start("cpu"); DrMr.hold();
    for (let i = 0; i < 500; i++) DrMr.step(0.05);
    const c = DrMr.players()[1];
    return { capsules: c.capsules, germs: c.germs, lost: c.lost };
  });
  check("dr-mr vs CPU: the CPU steers and drops its capsules (25 seconds of play, several capsules in)", cpu.capsules >= 4, cpu);
  await done(p, "versus");

  // ---- two players at one keyboard -----------------------------------------------------------
  p = await open(ctx);
  await p.evaluate(() => { DrMr.start("duo"); DrMr.hold(); DrMr.step(0.3); });
  const xs = () => p.evaluate(() => DrMr.players().map((q) => q.piece && [q.piece.x, q.piece.rot]));
  const d0 = await xs();
  await p.keyboard.press("a"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("e"); await p.keyboard.press(",");
  const d1 = await xs();
  await p.keyboard.press("w"); await p.keyboard.press("ArrowUp");
  const d2 = await p.evaluate(() => DrMr.players().map((q) => q.capsules));
  check("dr-mr two players: A and D steer the left vial, the arrows the right; Q E and , . turn them; W and ↑ drop them",
    JSON.stringify(d0) === "[[3,0],[3,0]]" && JSON.stringify(d1) === "[[2,1],[4,3]]" && JSON.stringify(d2) === "[1,1]", { d0, d1, d2 });
  await done(p, "two players");

  // ---- the menu's keys, kept between visits -------------------------------------------------------
  p = await open(ctx);
  const caps = await p.evaluate(() => [...document.querySelectorAll("#modes button b, #lvl-down, #lvl-up, #opt-speed, #play")].map((e) => e.getAttribute("data-gs-key")));
  await p.keyboard.press("2"); await p.waitForTimeout(60);
  const m2 = await p.evaluate(() => ({ mode: DrMr.mode(), lvl: getComputedStyle(document.getElementById("level-pick")).visibility }));
  await p.keyboard.press("3"); await p.waitForTimeout(60);
  const m3 = await p.evaluate(() => ({ mode: DrMr.mode(), cpu: !document.getElementById("opt-cpu").hidden, cap: document.getElementById("opt-cpu").getAttribute("data-gs-key") }));
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowLeft");
  await p.keyboard.press("s"); await p.keyboard.press("c"); await p.waitForTimeout(60);
  const m4 = await p.evaluate(() => ({ lvl: document.getElementById("lvl").textContent, speed: document.getElementById("speed-v").textContent, cpu: document.getElementById("cpu-v").textContent,
    kept: [localStorage.getItem("drmr_mode"), localStorage.getItem("drmr_level"), localStorage.getItem("drmr_speed"), localStorage.getItem("drmr_cpu")].join() }));
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const m5 = await p.evaluate(() => ({ state: DrMr.state(), n: DrMr.players().length, ctl: DrMr.players().map((q) => q.ctl).join() }));
  check("dr-mr: the menu's buttons wear their keys (1 to 4, ← →, S, Space or Enter); 2 picks Endless (no level to pick), 3 Vs CPU (and its C); ← → set the level, S the speed, C the CPU, all kept; Space starts",
    caps.join() === "1,2,3,4,←,→,S,Space or Enter" && m2.mode === "endless" && m2.lvl === "hidden" && m3.mode === "cpu" && m3.cpu && m3.cap === "C" &&
    m4.lvl === "6" && m4.speed === "Hi" && m4.cpu === "Hard" && m4.kept === "cpu,6,hi,hard" && m5.state === "play" && m5.n === 2 && m5.ctl === "you,cpu", { caps, m2, m3, m4, m5 });
  await done(p, "menu keys");
  await ctx.close();

  // ---- a phone: the pad plays, two players wait for a keyboard -----------------------------------
  {
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    const menu = await q.evaluate(() => ({ duo: document.querySelector('#modes [data-v="duo"]').disabled, note: getComputedStyle(document.querySelector(".duo-note .gs-touch")).display }));
    await q.evaluate(() => { DrMr.start("levels"); DrMr.hold(); DrMr.setBoard(0, ["y......."]); DrMr.step(0.3); });
    const pad = await q.evaluate(() => { const r = document.getElementById("pad").getBoundingClientRect(); return { shown: !document.getElementById("pad").hidden && r.height > 0, bottom: r.bottom, H: innerHeight }; });
    const x0 = await q.evaluate(() => DrMr.players()[0].piece.x);
    await q.tap('#pad [data-act="left"]');
    const x1 = await q.evaluate(() => DrMr.players()[0].piece.x);
    await q.tap('#pad [data-act="hard"]');
    const n1 = await q.evaluate(() => DrMr.players()[0].capsules);
    check("dr-mr, phone: Two players is greyed out (it says it needs a keyboard); in play the pad shows on the screen, ◀ moves the capsule and the drop button drops it",
      menu.duo && menu.note !== "none" && pad.shown && pad.bottom <= pad.H && x1 === x0 - 1 && n1 === 1, { menu, pad, x0, x1, n1 });
    await done(q, "phone pad");
    await c.close();
  }

  // ---- every size: the vials, charts, keys and pad inside the screen, clear of each other and
  // of the corner buttons, nothing scrolls; the stage's maker's line is drawn; no "made by" line
  const mob = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  for (const [label, opts] of [["1280x900", {}], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }],
    ["Pixel 7", devices["Pixel 7"]], ["phone 320x568", mob(320, 568)], ["phone 375x553", mob(375, 553)], ["phone 360x560", mob(360, 560)], ["Pixel 7 sideways", devices["Pixel 7 landscape"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await open(c);
    const modes = (await q.evaluate(() => !document.querySelector('#modes [data-v="duo"]').disabled)) ? ["levels", "cpu", "duo"] : ["levels", "cpu"];
    const bad = [], seen = [];
    for (const m of modes) {
      await q.evaluate((m) => { DrMr.start(m); DrMr.hold(); DrMr.step(0.3); }, m);
      await q.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const r = await q.evaluate(() => {
        const W = innerWidth, H = innerHeight, out = [];
        const rect = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
        const vials = DrMr.layout().map((v) => ({ l: v.x, t: v.y, r: v.x + 9.3 * v.c, b: v.y + 20.45 * v.c, inner: { l: v.ix, t: v.iy, r: v.ix + v.iw, b: v.iy + v.ih }, c: v.c }));
        const corners = [...document.querySelectorAll(".nav-back-games, .gs-corner button")].filter((e) => e.offsetParent !== null).map(rect);
        const bits = [...document.querySelectorAll("#chart0, #chart1, #legend0, #legend1, #pad button")].filter((e) => !e.hidden && !e.closest("[hidden]") && e.getBoundingClientRect().width > 0).map((e) => Object.assign(rect(e), { id: e.id || e.getAttribute("data-act") }));
        vials.forEach((v, i) => {
          if (v.l < -0.5 || v.t < -0.5 || v.r > W + 0.5 || v.b > H + 0.5) out.push("vial " + i + " off the screen");
          corners.forEach((k) => { if (hit(v, k)) out.push("vial " + i + " under a corner button"); });
          bits.forEach((bt) => { if (hit(v.inner, bt)) out.push(bt.id + " over vial " + i); });
        });
        bits.forEach((bt) => {
          if (bt.l < -0.5 || bt.t < -0.5 || bt.r > W + 0.5 || bt.b > H + 0.5) out.push(bt.id + " off the screen");
          corners.forEach((k) => { if (hit(bt, k)) out.push(bt.id + " under a corner button"); });
        });
        // the maker's line: once round the lens ring (on the screen, clear of the
        // vials, the charts, the keys and the corner buttons), or on each stage
        const marks = DrMr.marks(), ring = marks.filter((m) => m.kind === "ring");
        if (ring.length) {
          const m = ring[0], mb = { l: m.x, t: m.y, r: m.x + m.w, b: m.y + m.h };
          if (ring.length !== 1 || marks.length !== 1 || m.text !== "SAM LU PHARMACY · Rx" || m.size < 9.5 || mb.l < 0 || mb.t < 0 || mb.r > W || mb.b > H) out.push("ring's maker's line: " + JSON.stringify(marks));
          vials.forEach((v, i) => { if (hit(mb, v)) out.push("ring's maker's line over vial " + i); });
          corners.concat(bits).forEach((k) => { if (hit(mb, k)) out.push("ring's maker's line under " + (k.id || "a corner button")); });
        } else if (marks.length !== vials.length || marks.some((m) => !/^(SAM LU PHARMACY · Rx|Rx)$/.test(m.text) || m.size < 8) || !/^SAM LU PHARMACY · Rx$/.test(marks[0].text)) out.push("maker's line: " + JSON.stringify(marks));
        if (document.documentElement.scrollWidth > W || document.documentElement.scrollHeight > H) out.push("scrolls");
        if (/made by/i.test(document.body.innerText)) out.push("made by");
        return { out, c: vials.map((v) => +v.c.toFixed(1)), where: ring.length ? "ring" : "stage" };
      });
      seen.push(m + " " + r.c.join("/") + " " + r.where);
      r.out.forEach((o) => bad.push(m + ": " + o));
    }
    check("dr-mr, " + label + ": in every mode the vials, charts, keys and pad sit on the screen, clear of each other and the corner buttons, nothing scrolls, and the lens ring (or each stage) carries SAM LU PHARMACY · Rx",
      bad.length === 0, bad.length ? bad : seen);
    await done(q, "fit, " + label);
    await c.close();
  }
};
