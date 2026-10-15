// Dead End (a maze chase on foot, with torches and barricades): the rules of
// the chase, the keys, what a bite and a cleared block do, the maze editor,
// and a maze travelling in a link. The rules are driven on small mazes through
// the engine itself; the page through its keys and its test hook.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const box = (p) => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  const snap = (p) => p.evaluate(() => { const s = DeadEnd.st(); return { ui: DeadEnd.ui(), status: s.status, score: s.score, lives: s.lives, planks: s.planks, boards: s.boards.length, cell: s.player.cell, name: s.lv.name, hard: s.hard }; });

  // ---- the rules, on small mazes (no page in them)
  let p = await lib.open(ctx, base, "games/dead-end/");
  const rules = await p.evaluate(() => {
    const E = DeadEndEngine, bad = [];
    const ok = (name, cond, got) => { if (!cond) bad.push(name + " -> " + JSON.stringify(got)); };
    const seeded = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const run = (st, ms, input) => { const seen = []; let first = input; for (let t = 0; t < ms; t += 16) { E.step(st, 16, first); first = null; st.events.forEach((e) => seen.push(e.t)); } return seen; };
    DEAD_END_LEVELS.forEach((lv) => { const q = E.parse(lv); ok(lv.name + " parses, with three of its four dead in the pit", !q.errors.length && q.inPit.join() === "false,true,true,true", q.errors); });
    let st = E.create({ grid: ["#############", "#P....o....Z#", "#############"] }, null, seeded(1));
    run(st, 500); ok("nothing moves until you do", st.status === "ready" && st.dead[0].cell === 24, st.status);
    let seen = run(st, 2200, { dir: 1 });
    ok("tins score, and with a torch lit a touch knocks one of the dead flat", st.tins >= 4 && seen.includes("torch") && seen.includes("knock") && st.lives === 3 && st.score >= 290, { tins: st.tins, score: st.score });
    st = E.create({ grid: ["#########", "#P.....Z#", "#########"] }, null, seeded(2));
    seen = run(st, 4000, { dir: 1 });
    ok("with no torch a touch is a bite: a life gone, everyone back to the start", seen.includes("bitten") && st.lives === 2 && st.status === "ready" && st.player.cell === 10, { lives: st.lives, status: st.status });
    run(st, 4000, { dir: 1 }); run(st, 4000, { dir: 1 });
    ok("the third bite ends it", st.lives === 0 && st.status === "over", st.status);
    st = E.create({ grid: ["#############", "#Z....P.....#", "#############"] }, { planks: 1 }, seeded(3));
    st.dead[0].hold = 1200; run(st, 400, { dir: 1 });
    const up = E.board(st), at = st.boards[0] && st.boards[0].cell;
    ok("a plank goes up across the cell just left, and is spent", up && st.planks === 0 && at === st.player.last && E.board(st) === false, { up, at });
    run(st, 300, { dir: 3 }); ok("your own barricade stops you too", st.player.cell !== at && st.player.to !== at, st.player.cell);
    const t0 = st.clock; seen = [];
    for (let i = 0; i < 700 && st.boards.length; i++) { E.step(st, 16, null); st.events.forEach((e) => seen.push(e.t)); }
    ok("the dead can't pass it, and hammering brings it down early", seen.includes("smash") && st.lives === 3 && st.clock - t0 > 800 && st.clock - t0 < E.TUNE.boardMs, st.clock - t0);
    st = E.create({ grid: ["#######", "#P...##", "####Z=#", "#######"] }, { score: 100, lives: 2, round: 3 }, seeded(5));
    seen = run(st, 1500, { dir: 1 }); run(st, 2500);
    ok("the last tin clears the block (a bonus), and the run carries on to the next", seen.includes("clear") && st.score === 630 && st.lives === 2 && st.status === "next", { score: st.score, status: st.status });
    const errs = (grid) => E.parse({ grid }).errors.join("; ");
    ok("a maze with no start is refused", /needs a start/.test(errs(["#####", "#..Z#", "#...#", "#####"])), 0);
    ok("a tin behind a fence is refused", /can't be reached/.test(errs(["#######", "#P.#.Z#", "#..#..#", "#######"])), errs(["#######", "#P.#.Z#", "#..#..#", "#######"]));
    ok("a walled-in pit is refused", /walled in/.test(errs(["#######", "#P..###", "#...#Z#", "#...###", "#######"])), 0);
    const code = DeadEndCode.encode({ name: "T", grid: ["#####", "#P.Z#", "#####"] }), back = DeadEndCode.decode("https://x/y/#play=" + code);
    ok("a maze survives the trip through a share code", /^d1\./.test(code) && back.name === "T" && back.grid.join() === "#####,#P.Z#,#####", code);
    let threw = ""; try { DeadEndCode.decode("d1.!!!"); } catch (e) { threw = e.message; }
    ok("a damaged code says so", /not a Dead End maze code|damaged/.test(threw), threw);
    return bad;
  });
  check("dead-end rules: tins, torches, bites, barricades that hold until hammered down, a cleared block, refused mazes and share codes", rules.length === 0, rules);

  // ---- the page: nothing moves until a key; a step starts the run; Space nails a plank; P pauses; Esc asks
  await p.keyboard.press("Enter"); await p.waitForTimeout(250);
  const s0 = await snap(p);
  await p.waitForTimeout(500); const s1 = await snap(p);
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(900);
  const s2 = await snap(p);
  await p.keyboard.press("Space"); await p.waitForTimeout(200);
  const s3 = await snap(p);
  await p.keyboard.press("p"); await p.waitForTimeout(250);
  const paused = await p.evaluate(() => !!document.querySelector(".gs-pause:not(.gs-dialog)"));
  const s4 = await snap(p); await p.waitForTimeout(500); const s5 = await snap(p);
  await p.keyboard.press("p"); await p.waitForTimeout(250);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const asked = await box(p);
  await p.keyboard.press("Enter"); await p.waitForTimeout(300);   // (Keep playing)
  const hudText = await p.evaluate(() => ({ score: document.getElementById("hud-score").textContent, hearts: document.querySelectorAll("#hud-lives .heart:not(.gone)").length, planks: document.querySelectorAll("#hud-planks .plk:not(.gone)").length, where: document.getElementById("hud-where").textContent }));
  check("dead-end: Enter starts on Elm Street and nothing moves until an arrow; then tins score, Space nails a plank behind you (one fewer in hand), P pauses the chase, and Esc asks before leaving",
    s0.ui === "run" && s0.status === "ready" && s1.cell === s0.cell && s2.status === "play" && s2.score >= 30 && s3.boards === 1 && s3.planks === s2.planks - 1 && paused && s5.cell === s4.cell && s5.score === s4.score &&
    asked === "Leave this game?" && p.leaves === 0 && hudText.hearts === 3 && hudText.planks === s3.planks && /Elm Street/.test(hudText.where), { s0, s1, s2, s3, paused, s4, s5, asked, hudText });

  // ---- three bites: the end card, with the score, the best kept, Enter to run again and Backspace for the modes
  const end = await p.evaluate(() => {
    const s = DeadEnd.st(); s.lives = 1; s.torch = 0;
    s.dead[0].state = "roam"; s.dead[0].hold = 0; s.dead[0].cell = s.player.cell; s.dead[0].to = -1;
    DeadEnd.advance(3000, null);
    return { ui: DeadEnd.ui(), shown: !document.getElementById("over").hidden, msg: document.getElementById("over-msg").textContent, score: s.score,
      best: localStorage.getItem("deadend_best_shamblers"), caps: [document.getElementById("again").getAttribute("data-gs-key"), document.getElementById("to-menu").getAttribute("data-gs-key")].join(" ") };
  });
  await p.keyboard.press("Enter"); await p.waitForTimeout(250); const again = await snap(p);
  check("dead-end: the last bite brings up the end card with the score, saved as the best; its buttons show Enter and ⌫, and Enter runs again from scratch",
    end.ui === "over" && end.shown && end.score > 0 && end.msg === String(end.score) && end.best === String(end.score) && end.caps === "Enter ⌫" && again.ui === "run" && again.score === 0 && again.lives === 3, { end, again });

  // ---- a cleared block leads to the next street, score and lives carried over
  const next = await p.evaluate(() => {
    const s = DeadEnd.st(); DeadEnd.advance(200, { dir: 3 });
    s.dead.forEach((z) => { z.hold = 1e9; });
    Object.keys(s.items).forEach((k, i) => { if (i > 0) { if (s.items[k] !== "plank") s.left--; delete s.items[k]; } });
    const lastItem = +Object.keys(s.items)[0], was = s.lv.name, score = s.score;
    s.player.cell = lastItem; s.player.to = -1; s.player.last = -1; s.items[lastItem] = "tin";
    // step onto it from next door
    const E = DeadEndEngine; let from = -1, dir = -1;
    for (let d = 0; d < 4; d++) { const m = E.neighbor(s.lv, lastItem, d); if (!s.lv.wall[m] && !s.lv.gate[m]) { from = m; dir = (d + 2) % 4; break; } }
    s.player.cell = from; s.player.dir = -1;
    DeadEnd.advance(3500, { dir });
    const t = DeadEnd.st();
    return { was, now: t.lv.name, carried: t.score >= score + 500, lives: t.lives, status: t.status, ui: DeadEnd.ui() };
  });
  check("dead-end: the last tin clears the block, and the run moves on to Mill Lane with the score (and a bonus) carried over",
    next.was === "Elm Street" && next.now === "Mill Lane" && next.carried && next.lives === 3 && next.ui === "run", next);
  await p.keyboard.press("Escape"); await p.waitForTimeout(250); await p.keyboard.press("Enter"); await p.waitForTimeout(400);
  check("dead-end: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Sprinters is its own mode with its own best; Backspace on the end card goes back to the modes
  p = await lib.open(ctx, base, "games/dead-end/");
  await p.keyboard.press("2"); await p.keyboard.press("Enter"); await p.waitForTimeout(250);
  const sp = await snap(p);
  const spEnd = await p.evaluate(() => { const s = DeadEnd.st(); DeadEnd.advance(600, { dir: 3 }); s.lives = 1; s.dead[0].state = "roam"; s.dead[0].hold = 0; s.dead[0].cell = s.player.cell; s.dead[0].to = -1; s.player.to = -1; DeadEnd.advance(3000, null);
    return { ui: DeadEnd.ui(), fast: localStorage.getItem("deadend_best_sprinters"), slow: localStorage.getItem("deadend_best_shamblers") }; });
  await p.keyboard.press("Backspace"); await p.waitForTimeout(250);
  const backTo = await p.evaluate(() => ({ ui: DeadEnd.ui(), menu: !document.getElementById("menu").hidden, bests: document.getElementById("bests").textContent }));
  check("dead-end: 2 then Enter starts Sprinters (the dead a fifth quicker), which keeps its own best; on the end card Backspace goes back to the modes",
    sp.hard === true && spEnd.ui === "over" && +spEnd.fast > 0 && spEnd.slow === null && backTo.ui === "menu" && backTo.menu && /Sprinters/.test(backTo.bests), { sp, spEnd, backTo });
  await p.close();

  // ---- the editor: draw, see whether it can be played, save it, and send it to the game in a link
  p = await lib.open(ctx, base, "games/dead-end/editor.html");
  const ed = await p.evaluate(() => {
    const ed = DeadEndEditor, text = () => document.getElementById("ed-result").textContent, out = {};
    out.fresh = text(); out.dirty0 = ed.dirty();
    const lv = ed.level(), py = lv.grid.findIndex((r) => r.includes("P")), px = lv.grid[py].indexOf("P");
    ed.paint(px, py, "."); out.noStart = text(); out.playOff = document.getElementById("ed-play").disabled;
    ed.paint(2, 2, "P"); ed.paint(3, 2, "P"); out.starts = ed.level().grid.join("").split("P").length - 1; out.ok = text();
    out.fifth = ed.paint(5, 5, "Z"); out.fourth = ed.paint(6, 5, "Z");        // (three in the pit already)
    out.dead = ed.level().grid.join("").split("Z").length - 1;
    out.dirty1 = ed.dirty();
    document.getElementById("ed-name").value = "Test Alley"; document.getElementById("ed-name").dispatchEvent(new Event("input"));
    document.getElementById("ed-save").click();
    out.saved = JSON.parse(localStorage.getItem("deadend_mine") || "[]").map((m) => m.name).join(); out.dirty2 = ed.dirty();
    out.listed = document.querySelectorAll("#ed-mine .mine-row").length;
    out.url = ed.playUrl();
    return out;
  });
  check("dead-end editor: a fresh block can be played; without a start it says so and Play is off; there is one start and at most four dead; a saved maze is listed and the draft is no longer unsaved",
    /can be played/.test(ed.fresh) && !ed.dirty0 && /needs a start/.test(ed.noStart) && ed.playOff && ed.starts === 1 && /can be played/.test(ed.ok) && ed.fifth === true && ed.fourth === false && ed.dead === 4 &&
    ed.dirty1 && ed.saved === "Test Alley" && !ed.dirty2 && ed.listed === 1 && /#play=d1\./.test(ed.url), ed);
  await p.evaluate(() => DeadEndEditor.paint(4, 4, "#"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const edAsk = await box(p);
  await p.keyboard.press("Enter"); await p.waitForTimeout(250);   // (Keep playing)
  check("dead-end editor: with unsaved drawing on the block, Esc asks before leaving", edAsk === "Leave this game?" && p.leaves === 0, { edAsk, leaves: p.leaves });
  check("dead-end editor: no page errors", p.errs.length === 0, p.errs);
  const link = ed.url.replace(/^.*\/games\//, "games/");
  await p.close();

  p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(base + link, { waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await p.waitForTimeout(400);
  const sh0 = await p.evaluate(() => ({ shared: DeadEnd.shared() && DeadEnd.shared().name, note: document.getElementById("shared").textContent, back: !document.getElementById("to-streets").hidden }));
  await p.keyboard.press("Enter"); await p.waitForTimeout(250);
  const sh1 = await snap(p);
  check("dead-end: a maze in a link is loaded and named on the menu, and Enter plays it", sh0.shared === "Test Alley" && /Test Alley/.test(sh0.note) && sh0.back && sh1.ui === "run" && sh1.name === "Test Alley", { sh0, sh1 });
  await p.goto(base + "games/dead-end/#play=d1.bm90IGEgbWF6ZQ", { waitUntil: "domcontentloaded" }); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await p.waitForTimeout(400);
  const badLink = { box: await box(p), shared: await p.evaluate(() => DeadEnd.shared()) };
  check("dead-end: a link that isn't a maze says so in a box, and the streets are still there to play", badLink.box === "That maze won't open" && badLink.shared === null, badLink);
  check("dead-end (links): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Visual FX off: the sign hangs still (the block is drawn the same, just held steady)
  p = await lib.open(ctx, base, "games/dead-end/");
  const swingOn = await p.evaluate(() => getComputedStyle(document.querySelector(".sign")).animationName);
  await p.click(".rm-toggle"); await p.waitForTimeout(150);
  const swingOff = await p.evaluate(() => getComputedStyle(document.querySelector(".sign")).animationName);
  check("dead-end: with Visual FX on the sign swings on its post; off, it hangs still", swingOn === "de-swing" && swingOff === "none", { swingOn, swingOff });
  await p.close();

  // ---- a phone: the Plank button is there, a swipe runs, nothing is wider than the screen
  {
    const phone = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await lib.open(phone, base, "games/dead-end/");
    await q.tap("#play"); await q.waitForTimeout(300);
    const r = await q.evaluate(() => { const c = document.getElementById("board").getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2, wide: document.documentElement.scrollWidth - innerWidth, plank: getComputedStyle(document.getElementById("pad")).display, fits: c.right <= innerWidth && c.left >= 0,
      caps: [...document.querySelectorAll("[data-gs-key]")].filter((e) => e.getClientRects().length && getComputedStyle(e, "::after").display !== "none").length, note: document.getElementById("note").textContent }; });
    await q.evaluate(([x, y]) => { const c = document.getElementById("board"); const ev = (type, dx) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x + dx, clientY: y, bubbles: true })); ev("pointerdown", 0); ev("pointermove", -40); ev("pointerup", -40); }, [r.x, r.y]);
    await q.waitForTimeout(700);
    const moved = await snap(q);
    await q.tap("#plank-btn"); await q.waitForTimeout(200);
    const planked = await snap(q);
    check("dead-end on a phone: the block fits the screen, the hint says to swipe, a swipe starts the run, and the Plank button nails one up; no keycaps show",
      r.wide <= 0 && r.fits && r.plank !== "none" && r.caps === 0 && /Swipe/.test(r.note) && moved.status === "play" && moved.score > 0 && planked.boards === 1, { r, moved, planked });
    check("dead-end (phone): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await phone.close();
    // the smallest phone, a long street name and a round number: the heads-up line stays one line inside the screen
    const small = await lib.newContext(browser, Object.assign({}, devices["Pixel 7"], { viewport: { width: 320, height: 568 } }));
    const t = await lib.open(small, base, "games/dead-end/");
    await t.tap("#play"); await t.waitForTimeout(300);
    const sm = await t.evaluate(() => {
      DeadEnd.advance(64, { dir: 3 }); DeadEnd.st().score = 123450;
      document.getElementById("hud-where").textContent = "Canal Street · round 12"; DeadEnd.advance(32, null);
      const hud = document.getElementById("hud").getBoundingClientRect(), pl = document.getElementById("plank-btn").getBoundingClientRect();
      return { wide: document.documentElement.scrollWidth - innerWidth, w: innerWidth, h: innerHeight, hudIn: hud.left >= 0 && hud.right <= innerWidth, plankIn: pl.bottom <= innerHeight && pl.top > 0 };
    });
    check("dead-end on a 320 x 568 phone: nothing is wider than the screen, the heads-up line fits, and the Plank button is on screen", sm.wide <= 0 && sm.w === 320 && sm.hudIn && sm.plankIn, sm);
    await t.close();
    await small.close();
  }

  await ctx.close();
};
