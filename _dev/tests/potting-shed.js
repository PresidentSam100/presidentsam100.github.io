// Potting Shed: the sheds are a list of tiles, a shed opening once the one
// before it is potted (a locked one says why and stays shut); a tile goes
// straight in, the arrows (shown on the list's heading) ring a shed and
// choose it, Enter going in, and Space or Enter goes into the chosen one;
// thirty sheds, each with as many patches of sun as pots and its gardener
// inside the walls, and each potted by its solution (the fewest pushes, from
// a solver) played in the page; the gardener walks, benches stop him, a pot
// goes one cell where it's pushed but not into a bench or another pot, and
// moves and pushes are counted; Undo takes a step back; a pot in the sun
// blooms; the last pot in the sun pots the shed, keeping the fewest moves at
// once, and the card waits for its flower to open (nothing more done in the
// shed meanwhile), then a moment for Space, which goes on to the next shed
// (R again, Backspace the sheds); paused, the arrows do nothing; the
// gardener and the pot slide to their cells with Visual FX on and off alike;
// on a phone the pad and a swipe walk him; the menu fits phones and laptops.
// (SOLUTIONS, each shed's moves, are at the end of the file.)
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/potting-shed/", opts);
  const done = async (p, what) => { check("potting-shed " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);
  const list = (p) => p.evaluate(() => [...document.querySelectorAll("#shed-grid .tile")].map((t) => (t.classList.contains("locked") ? "L" : "o") + (t.classList.contains("current") ? "*" : "") + (t.classList.contains("potted") ? "p" : "")));

  // ---- the list of sheds: on a first visit only the first is open
  let p = await open();
  const first = await list(p);
  const head = await p.evaluate(() => [...document.querySelectorAll("#sheds-k kbd")].map((k) => k.textContent).join(" "));
  // a locked tile says why and stays shut
  await p.click("#shed-grid .tile:nth-child(3)"); await p.waitForTimeout(80);
  const shut = await p.evaluate(() => ({ state: PottingShed.state(), note: document.getElementById("lock-note").textContent }));
  check("potting-shed: thirty sheds in the list, the first open and chosen, the rest locked; a locked one says why and stays shut; the arrows and Enter shown on the heading",
    first.length === 30 && first[0] === "o*" && first.slice(1).every((t) => t === "L") && shut.state === "menu" && /Shed 3 is locked/.test(shut.note) &&
      head === "← ↑ ↓ → Enter", { first, shut, head });
  // potted sheds open the next: 1 and 2 potted, 3 opens; the arrows ring and choose, Enter goes in
  await p.evaluate(() => { localStorage.setItem("pottingshed_best", JSON.stringify({ 0: { m: 1, p: 1 }, 1: { m: 30, p: 4 } })); });
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await p.waitForTimeout(200);
  const opened = await list(p);
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(60);     // the ring on the chosen one (the next to pot: 3)
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(60);     // to 2: chosen
  const ringed = await p.evaluate(() => ({ shed: PottingShed.shed(), name: document.getElementById("pick-name").textContent, kept: localStorage.getItem("pottingshed_shed") }));
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(80);   // 3, then 4 (locked: it says so, 3 stays chosen)
  const onLocked = await p.evaluate(() => ({ shed: PottingShed.shed(), note: document.getElementById("lock-note").textContent }));
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(60);
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const went = await p.evaluate(() => ({ state: PottingShed.state(), shed: PottingShed.shed(), hud: document.getElementById("hud-shed").textContent }));
  check("potting-shed: a potted shed opens the next (the list chooses the first not yet potted); the arrows ring a shed and choose it (kept), a locked one says why, and Enter goes into the ringed one",
    opened.slice(0, 4).join() === "op,op,o*,L" && opened.slice(4).every((t) => t === "L") && ringed.shed === 1 && ringed.name === "Cold Frame" && ringed.kept === "1" &&
      onLocked.shed === 2 && /Shed 4 is locked\. Pot shed 3 to open it\./.test(onLocked.note) && went.state === "play" && went.shed === 1 && /^2 · Cold Frame$/.test(went.hud),
    { opened, ringed, onLocked, went });
  // a tile goes straight in; Space goes into the chosen shed, wearing Space or Enter
  await p.evaluate(() => PottingShed.toMenu());
  await p.click("#shed-grid .tile:nth-child(1)"); await p.waitForTimeout(120);
  const tapped = await p.evaluate(() => ({ state: PottingShed.state(), shed: PottingShed.shed() }));
  await p.evaluate(() => PottingShed.toMenu());
  const cap = await p.evaluate(() => document.getElementById("play").getAttribute("data-gs-key"));
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const spaced = await p.evaluate(() => ({ state: PottingShed.state(), shed: PottingShed.shed() }));
  check("potting-shed: a tile goes straight into its shed, and Space (on Pot this shed: Space or Enter) into the chosen one",
    tapped.state === "play" && tapped.shed === 0 && cap === "Space or Enter" && spaced.state === "play" && spaced.shed === 0, { tapped, cap, spaced });
  await p.evaluate(() => localStorage.removeItem("pottingshed_best"));

  // ---- every shed: as many suns as pots, the gardener inside
  const sheds = await p.evaluate(() => { const out = []; for (let n = 0; n < PottingShed.count; n++) { const L = PottingShed.level(n); out.push({ n, pots: L.pots.length, suns: L.sun.filter(Boolean).length, inside: !L.wall[L.me] }); } return out; });
  check("potting-shed: thirty sheds, each with as many patches of sun as pots and the gardener on the floor", sheds.length === 30 && sheds.every((s) => s.pots === s.suns && s.pots > 0 && s.inside), sheds);

  // ---- every shed is potted by its solution, played in the page (pushes as the solver counted)
  const solved = await p.evaluate((sols) => sols.map((s, n) => {
    PottingShed.start(n);
    const D = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
    for (const ch of s.moves) PottingShed.step(D[ch][0], D[ch][1]);
    return { n: n + 1, name: PottingShed.name(n), ok: PottingShed.state() !== "play", pushes: PottingShed.pushes(), want: s.pushes };
  }), SOLUTIONS);
  check("potting-shed: every one of the thirty sheds is potted by its solution played in the page, in the fewest pushes the solver found",
    solved.length === 30 && solved.every((s) => s.ok && s.pushes === s.want), solved.filter((s) => !s.ok || s.pushes !== s.want));
  await p.evaluate(() => { localStorage.removeItem("pottingshed_best"); PottingShed.toMenu(); });

  // ---- walking and pushing, on the third shed (two pots by the door)
  const walk = await p.evaluate(() => {
    PottingShed.start(2);
    const me0 = PottingShed.me(), L = PottingShed.level(), w = L.w;
    PottingShed.step(-1, 0); const left = PottingShed.me();          // a step left onto the floor
    PottingShed.step(-1, 0); const blocked = PottingShed.me();       // a bench: no step
    PottingShed.step(1, 0);                                          // back
    const pots0 = PottingShed.pots().slice();
    PottingShed.step(1, 0);                                          // push the pot to the right
    const pushed = { me: PottingShed.me(), pots: PottingShed.pots(), moves: PottingShed.moves(), pushes: PottingShed.pushes() };
    PottingShed.undo();
    const undone = { me: PottingShed.me(), pots: PottingShed.pots(), moves: PottingShed.moves(), pushes: PottingShed.pushes() };
    return { w, me0, left, blocked, pots0, pushed, undone };
  });
  check("potting-shed: the gardener walks, a bench stops him, a pot goes one cell where it's pushed (a move and a push counted), and Undo puts both back",
    walk.left === walk.me0 - 1 && walk.blocked === walk.left && walk.pushed.me === walk.me0 + 1 && walk.pushed.pots.includes(walk.me0 + 2) && walk.pushed.pushes === 1 &&
      walk.undone.me === walk.me0 && walk.undone.pots.join() === walk.pots0.join() && walk.undone.pushes === 0, walk);
  // a pot won't go into a bench or another pot
  const stuck = await p.evaluate(() => {
    PottingShed.start(3);   // Seed Trays: four pots in a row
    const before = PottingShed.pots().join();
    // to the left of the row, then push right into the next pot
    const L = PottingShed.level(), w = L.w, row = Math.floor(L.pots[0] / w);
    // walk to the cell left of the first pot: from the gardener, left then up
    const target = L.pots[0] - 1;
    const path = [];
    let me = PottingShed.me();
    while (me % w > target % w) { PottingShed.step(-1, 0); me = PottingShed.me(); if (path.push(me) > 40) break; }
    while (Math.floor(me / w) > row) { PottingShed.step(0, -1); me = PottingShed.me(); if (path.push(me) > 60) break; }
    const at = PottingShed.me();
    PottingShed.step(1, 0);
    return { at, target, before, after: PottingShed.pots().join(), me: PottingShed.me() };
  });
  check("potting-shed: a pot won't be pushed into another pot", stuck.after === stuck.before && stuck.me === stuck.at, stuck);

  // ---- the first shed: one push pots it, the fewest moves kept; the card
  // comes once the flower has opened, then waits a moment for Space, which
  // goes to the next shed
  const potted = await p.evaluate(() => {
    PottingShed.start(0); PottingShed.step(1, 0);
    return { state: PottingShed.state(), blooms: PottingShed.blooms(), best: PottingShed.best(0) };
  });
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
  const early = await p.evaluate(() => PottingShed.state());
  await p.waitForFunction(() => PottingShed.state() === "done", null, { timeout: 8000 });
  const card = await p.evaluate(() => document.getElementById("done-title").textContent);
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
  const held = await p.evaluate(() => PottingShed.state());
  await wait(p, 900);
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const next = await p.evaluate(() => ({ state: PottingShed.state(), shed: PottingShed.shed() }));
  check("potting-shed: the last pot in the sun blooms and pots the shed, keeping the fewest moves; the card comes once the flower is open and waits a moment for Space, which goes to the next shed",
    potted.state === "blooming" && potted.blooms >= 1 && potted.best && potted.best.m === 1 && early === "blooming" && card === "Potted!" && held === "done" &&
      next.state === "play" && next.shed === 1, { potted, early, card, held, next });
  const pot = async () => { await p.evaluate(() => { PottingShed.start(0); PottingShed.step(1, 0); }); await p.waitForFunction(() => PottingShed.state() === "done", null, { timeout: 8000 }); };
  await pot();
  await wait(p, 900);
  await p.keyboard.press("r"); await p.waitForTimeout(120);
  const again = await p.evaluate(() => ({ state: PottingShed.state(), shed: PottingShed.shed(), moves: PottingShed.moves() }));
  await pot();
  await wait(p, 900);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(120);
  const back = await p.evaluate(() => PottingShed.state());
  const doneCaps = await p.evaluate(() => ["next", "replay", "to-sheds"].map((id) => document.getElementById(id).getAttribute("data-gs-key")));
  check("potting-shed: on the potted card R pots the same shed again and Backspace goes to the sheds; the buttons wear Space or Enter, R and ⌫",
    again.state === "play" && again.shed === 0 && again.moves === 0 && back === "menu" && doneCaps.join() === "Space or Enter,R,⌫", { again, back, doneCaps });
  await done(p, "play");

  // ---- paused, the arrows do nothing
  p = await open();
  await p.evaluate(() => PottingShed.start(2)); await p.waitForTimeout(120);
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  const m0 = await p.evaluate(() => PottingShed.me());
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(80);
  const m1 = await p.evaluate(() => PottingShed.me());
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(80);
  const m2 = await p.evaluate(() => PottingShed.me());
  check("potting-shed: paused, the arrows don't walk the gardener; resumed, they do", m1 === m0 && m2 === m0 - 1, { m0, m1, m2 });
  await done(p, "pause");

  // ---- a step slides, with Visual FX on and off alike (where he goes is play)
  const slide = {};
  for (const off of [false, true]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:potting-shed", off ? "1" : "0"); } catch (e) {} }, off) });
    slide[off ? "off" : "on"] = await q.evaluate(() => { PottingShed.start(2); PottingShed.step(-1, 0); return PottingShed.tweening(); });
    await done(q, "FX " + (off ? "off" : "on"));
  }
  check("potting-shed: a step slides to the next cell with Visual FX on and with it off", slide.on === true && slide.off === true, slide);

  // ---- the potted card waits for the last flower to open, with Visual FX on
  // and off alike: the fewest moves are kept the moment the pot lands, the
  // shed takes nothing more meanwhile (a step, Undo, Start over, Sheds), and
  // the card is up only once the pot has arrived and its flower is open
  const bloom = {};
  for (const off of [false, true]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:potting-shed", off ? "1" : "0"); } catch (e) {} }, off) });
    bloom[off ? "off" : "on"] = await q.evaluate(() => new Promise((res) => {
      const card = document.getElementById("done");
      PottingShed.start(0);
      const t0 = performance.now();
      PottingShed.step(1, 0);
      const at = { state: PottingShed.state(), best: PottingShed.best(0), card: !card.hidden };
      PottingShed.undo(); PottingShed.step(-1, 0);
      document.getElementById("btn-restart").click(); document.getElementById("btn-sheds").click();
      const tried = { state: PottingShed.state(), moves: PottingShed.moves(), pots: PottingShed.pots().join() };
      new MutationObserver(() => {
        if (!card.hidden) res({ at, tried, after: Math.round(performance.now() - t0), open: PottingShed.bloomed() });
      }).observe(card, { attributes: true, attributeFilter: ["hidden"] });
      setTimeout(() => res({ at, tried, after: null }), 6000);
    }));
    await done(q, "bloom FX " + (off ? "off" : "on"));
  }
  check("potting-shed: the potted card waits for the last pot's flower to open (FX on and off alike), the fewest moves kept at once and nothing more done in the shed meanwhile",
    ["on", "off"].every((m) => { const b = bloom[m]; return b.at.state === "blooming" && !b.at.card && b.at.best && b.at.best.m === 1 && b.tried.state === "blooming" && b.tried.moves === 1 && b.after >= 600 && b.open === true; }),
    bloom);

  // ---- the potted card: Again and Sheds side by side on the first row, the
  // next shed across the row under them, on a laptop and on phones
  const rows = {};
  for (const [w, h] of [[1280, 900], [390, 664], [320, 568]]) {
    const c = await lib.newContext(browser, { viewport: { width: w, height: h } });
    const q = await open(c);
    await q.evaluate(() => { PottingShed.start(0); PottingShed.step(1, 0); });
    await q.waitForFunction(() => PottingShed.state() === "done", null, { timeout: 8000 });
    rows[w + "x" + h] = await q.evaluate(() => {
      const box = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; };
      return { again: box("replay"), sheds: box("to-sheds"), next: box("next"), wide: document.documentElement.scrollWidth <= innerWidth };
    });
    await done(q, "potted card " + w + "x" + h);
    await c.close();
  }
  check("potting-shed: on the potted card Again and Sheds share the first row (Again first) and Next shed has the row under them to itself (laptop, 390 and 320 px)",
    Object.values(rows).every((o) => Math.abs(o.again.t - o.sheds.t) <= 1 && o.again.r <= o.sheds.l && o.next.t >= Math.max(o.again.b, o.sheds.b) &&
      o.next.l <= o.again.l + 1 && o.next.r >= o.sheds.r - 1 && o.wide), rows);

  // ---- counts read right: one move, one push, one pot, and the plural for 0
  // and for 2 or more (the HUD, the potted card, the fewest, the menu)
  {
    const c = await lib.newContext(browser);
    const q = await open(c);
    const hud = () => q.evaluate(() => document.getElementById("hud").textContent.replace(/\s+/g, " ").trim());
    const card = () => q.evaluate(() => ({ msg: document.getElementById("done-msg").textContent, line: document.querySelector("#done-stats > span:not(.time):not(.bests)").textContent, pills: Array.from(document.querySelectorAll("#done-stats .best")).map((s) => s.textContent) }));
    const potted = () => q.waitForFunction(() => PottingShed.state() === "done", null, { timeout: 8000 });
    await q.evaluate(() => PottingShed.start(0));
    const h0 = await hud();
    await q.evaluate(() => PottingShed.step(1, 0));
    const h1 = await hud();
    await potted();
    const c1 = await card();
    // the long way round: a step back, a step on, then the push (3 moves, 1 push)
    await q.evaluate(() => { PottingShed.start(0); PottingShed.step(-1, 0); PottingShed.step(1, 0); PottingShed.step(1, 0); });
    const h3 = await hud();
    await potted();
    const c3 = await card();
    await q.evaluate(() => PottingShed.toMenu());
    const menu = await q.evaluate(() => ({ note: document.getElementById("pick-note").textContent, best: document.getElementById("pick-best").textContent }));
    check("potting-shed: counts read right, one or many: 0 moves 0 pushes, 1 move 1 push, 3 moves; the card's 1 move and 1 push, fewest: 1 move; the menu's 1 pot and (1 push)",
      / 0 moves 0 pushes( |$)/.test(h0) && / 1 move 1 push( |$)/.test(h1) && / 3 moves 1 push( |$)/.test(h3) &&
        c1.msg === "1 move" && /^1 push · shed 1,/.test(c1.line) && c3.msg === "3 moves" && c3.pills[0] === "fewest: 1 move" &&
        menu.note === "shed 1 of 30 · 1 pot" && /^fewest moves: 1 \(1 push\)( |$)/.test(menu.best),
      { h0, h1, h3, c1, c3, menu });
    await done(q, "counts");
    await c.close();
  }

  // ---- the clock: it starts on the first step, holds while paused (the shed
  // out of sight), and stops the moment the last pot lands, saved there and
  // then (before the flower has opened); the card shows it. Start over keeps
  // it running, Again starts a new one. (Waits are on the page's own clock.)
  const tenth = (ms) => { const t = Math.floor(ms / 100), s = Math.floor(t / 10); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + "." + (t % 10); };
  {
    const c = await lib.newContext(browser);
    const q = await open(c);
    const r = await q.evaluate(async () => {
      const PS = PottingShed, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      PS.start(0); await sleep(300);
      const before = PS.clock();
      PS.step(0, -1);
      const a0 = PS.clock();
      PS.pause(true);
      const hidden = getComputedStyle(document.getElementById("stage")).visibility;
      await sleep(800);
      const a1 = PS.clock();
      PS.pause(false); await sleep(400);
      const a2 = PS.clock();
      PS.step(0, 1); PS.step(1, 0);
      const tf = PS.clock(), saved = JSON.parse(localStorage.getItem("pottingshed_best") || "{}")[0], state = PS.state();
      await sleep(500);
      return { before, a0, a1, a2, hidden, tf, tf2: PS.clock(), saved, state };
    });
    await q.waitForFunction(() => PottingShed.state() === "done", null, { timeout: 8000 });
    const shown = await q.evaluate(() => { const t = (sel) => { const e = document.querySelector(sel); return e ? e.textContent : null; }; return { time: t("#done-stats .time"), hud: t("#hud-time") }; });
    const r2 = await q.evaluate(async () => {
      const PS = PottingShed, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      document.getElementById("replay").click();
      const again = PS.clock();
      PS.step(0, -1); await sleep(300);
      const s0 = PS.clock();
      document.getElementById("btn-restart").click();
      await sleep(200);
      return { again, s0, s1: PS.clock(), moves: PS.moves(), state: PS.state() };
    });
    check("potting-shed: the clock starts on the first step, holds while paused (the shed hidden), stops the moment the last pot lands and is saved there and then; the card and the HUD show it; Start over keeps it running, Again starts it again",
      r.before === 0 && r.a0 < 100 && r.hidden === "hidden" && r.a1 - r.a0 < 250 && r.a2 - r.a1 >= 300 && r.state === "blooming" && r.tf2 === r.tf &&
        r.saved && r.saved.t === r.tf && shown.time === "in " + tenth(r.tf) && shown.hud === "0:00" &&
        r2.again === 0 && r2.s0 >= 250 && r2.s1 >= r2.s0 && r2.moves === 0 && r2.state === "play",
      { r, shown, r2 });
    await done(q, "clock");
    await c.close();
  }

  // ---- the fewest moves and the fastest time are records of their own, each
  // kept only when beaten; an old save with no time takes its first one
  {
    const c = await lib.newContext(browser);
    const q = await open(c);
    const runs = await q.evaluate(async () => {
      const PS = PottingShed, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const best = () => JSON.parse(localStorage.getItem("pottingshed_best") || "{}")[0];
      const out = [];
      const go = async (path, pause) => {
        PS.start(0);
        for (let i = 0; i < path.length; i++) { PS.step(path[i][0], path[i][1]); if (i === 0 && pause) await sleep(pause); }
        out.push({ t: PS.clock(), moves: PS.moves(), best: best() });
      };
      const U = [0, -1], D = [0, 1], R = [1, 0];
      await go([U, D, U, D, R], 0);   // 5 moves, quick
      await go([U, D, R], 500);       // 3 moves, slower: the moves record, the time kept
      await go([U, D, U, D, R], 300); // 5 moves, slower again: neither
      return out;
    });
    await q.waitForFunction(() => PottingShed.state() === "done", null, { timeout: 8000 });
    const pills = await q.evaluate(() => Array.from(document.querySelectorAll("#done-stats .best")).map((s) => s.textContent));
    await done(q, "records");
    await c.close();
    const c2 = await lib.newContext(browser);
    const q2 = await open(c2, { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("pottingshed_best", '{"0":{"m":2,"p":1}}'); } catch (e) {} }) });
    await q2.evaluate(() => { PottingShed.start(0); PottingShed.step(1, 0); });
    await q2.waitForFunction(() => PottingShed.state() === "done", null, { timeout: 8000 });
    const old = await q2.evaluate(() => ({ best: PottingShed.best(0), pills: Array.from(document.querySelectorAll("#done-stats .best")).map((s) => s.textContent) }));
    await done(q2, "old save");
    await c2.close();
    const [a, b, d] = runs;
    check("potting-shed: the fewest moves and the fastest time are separate records, each kept only when beaten (the card names both); an old save with no time takes its first",
      a.best.m === 5 && a.best.t === a.t && b.t >= 450 && b.best.m === 3 && b.best.t === a.t && d.t >= 250 && d.best.m === 3 && d.best.t === a.t &&
        pills[0] === "fewest: 3 moves" && pills[1] === "fastest: " + tenth(a.t) &&
        old.best.m === 1 && typeof old.best.t === "number" && old.pills.join("|") === "your fewest moves here yet|first time on the clock",
      { runs, pills, old });
  }

  // ---- one press, one step: a held arrow's repeats walk no further, and a
  // held Ctrl+Z takes back one step
  {
    const q = await open();
    const r = await q.evaluate(() => {
      const PS = PottingShed, key = (k, repeat, ctrl) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, repeat: !!repeat, ctrlKey: !!ctrl, bubbles: true, cancelable: true }));
      PS.start(2);
      key("ArrowDown"); for (let i = 0; i < 4; i++) key("ArrowDown", true);
      const held = PS.moves();
      key("ArrowUp");
      const two = PS.moves();
      key("z", false, true); for (let i = 0; i < 3; i++) key("z", true, true);
      return { held, two, undone: PS.moves() };
    });
    check("potting-shed: a walk key held down steps once (its repeats do nothing), and Ctrl+Z held takes back one step",
      r.held === 1 && r.two === 2 && r.undone === 1, r);
    await done(q, "held keys");
  }

  // ---- back to front: a flower standing up into the cell above is drawn over
  // the pot there, and over the gardener there
  {
    const q = await open();
    const r = await q.evaluate(async () => {
      const PS = PottingShed, frames = (n) => new Promise((res) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); });
      PS.start(2);   // Two by the Door: sun at (6, 2) and (6, 3)
      PS.put(11, [30, 22]); await frames(3);   // a pot open in the sun at (6, 3), a pot over it at (6, 2)
      const d1 = PS.drawn();
      PS.put(22, [30, 27]); await frames(3);   // the same, the gardener over it
      const d2 = PS.drawn();
      const at = (d, f) => d.findIndex(f), fl = (d) => (d.find((x) => x.k === 30) || {}).flower;
      return { pot: { upper: at(d1, (x) => x.k === 22), lower: at(d1, (x) => x.k === 30), flower: fl(d1) }, me: { me: at(d2, (x) => x.me), lower: at(d2, (x) => x.k === 30), flower: fl(d2) } };
    });
    check("potting-shed: drawn back to front, a pot's open flower comes over the pot in the cell above it, and over the gardener there",
      r.pot.upper >= 0 && r.pot.lower > r.pot.upper && r.pot.flower === 1 && r.me.me >= 0 && r.me.lower > r.me.me && r.me.flower === 1, r);
    await done(q, "back to front");
  }

  // ---- a pot pushed out of the sun: with Visual FX on its flower closes as it
  // goes (as one opens), with it off it's gone at once; Undo of a push into
  // the sun closes it the same way
  const wilt = {};
  for (const off of [false, true]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:potting-shed", off ? "1" : "0"); } catch (e) {} }, off) });
    wilt[off ? "off" : "on"] = await q.evaluate(async () => {
      const PS = PottingShed, frames = (n) => new Promise((res) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); });
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms)), f = () => { const d = PS.drawn().find((x) => x.pot === 0); return d ? d.flower : null; };
      PS.start(2);
      PS.put(30, [22, 27]); await frames(3);   // the pot open in the sun at (6, 2), the gardener under it
      const open0 = f();
      PS.step(0, -1); await frames(2);         // pushed up, out of the sun
      const mid = f();
      await sleep(600); await frames(2);
      const gone = f();
      PS.put(20, [21, 27]);                    // the gardener at (4, 2), the pot at (5, 2)
      PS.step(1, 0); await sleep(500); await frames(2);   // pushed into the sun at (6, 2)
      const opened = f();
      PS.undo(); await frames(2);
      return { open0, mid, gone, opened, undone: f(), moves: PS.moves() };
    });
    await done(q, "wilt FX " + (off ? "off" : "on"));
  }
  check("potting-shed: a pot pushed out of the sun closes its flower as it goes with Visual FX on (part closed a couple of frames on, gone soon after), at once with it off; Undo of a push into the sun closes it the same way",
    wilt.on.open0 === 1 && wilt.on.mid > 0 && wilt.on.mid < 1 && wilt.on.gone === 0 && wilt.on.opened === 1 && wilt.on.undone > 0 && wilt.on.undone < 1 &&
      wilt.off.open0 === 1 && wilt.off.mid === 0 && wilt.off.gone === 0 && wilt.off.opened === 1 && wilt.off.undone === 0,
    wilt);

  // ---- on a phone: the pad walks him, and so does a swipe
  {
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    await q.evaluate(() => PottingShed.start(2)); await q.waitForTimeout(150);
    const m0p = await q.evaluate(() => PottingShed.me());
    const padShown = await q.evaluate(() => getComputedStyle(document.getElementById("pad")).display);
    const b = await q.evaluate(() => { const r = document.getElementById("t-left").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await q.touchscreen.tap(b.x, b.y); await q.waitForTimeout(150);
    const m1p = await q.evaluate(() => PottingShed.me());
    const cvr = await q.evaluate(() => { const r = document.getElementById("stage").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const cdp = await c.newCDPSession(q);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cvr.x, y: cvr.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cvr.x + 40, y: cvr.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cvr.x + 80, y: cvr.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await q.waitForTimeout(150);
    const m2p = await q.evaluate(() => PottingShed.me());
    check("potting-shed, phone: the pad shows and its ◀ walks him left; a swipe right walks him back", padShown === "grid" && m1p === m0p - 1 && m2p === m0p, { padShown, m0p, m1p, m2p });
    await done(q, "phone");
    await c.close();
  }

  // ---- the menu fits: on phones (upright, and short with the browser's bars
  // showing) and laptops, nothing wider than the screen, the heading below the
  // corner buttons, all thirty tiles big enough to tap and everything on the
  // card shown; on a laptop the whole card at once, with no scrolling
  {
    const { devices } = require("@playwright/test");
    const bad = [], seen = {};
    for (const [w, h, phone] of [[320, 568, 1], [360, 640, 1], [390, 664, 1], [375, 553, 1], [360, 560, 1], [1280, 900, 0], [1366, 657, 0], [1280, 600, 0]]) {
      const c = await lib.newContext(browser, phone ? Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
      const q = await open(c);
      await q.evaluate(() => localStorage.setItem("pottingshed_best", JSON.stringify({ 0: { m: 999, p: 99 } })));   // (a best: the card at its tallest)
      await q.reload({ waitUntil: "domcontentloaded" }); await q.waitForSelector(".mute-toggle"); await q.waitForTimeout(250);
      const m = await q.evaluate((w) => {
        const r = (s) => document.querySelector(s).getBoundingClientRect(), panel = document.getElementById("menu");
        const tiles = [...document.querySelectorAll("#shed-grid .tile")].map((t) => t.getBoundingClientRect());
        const shown = ["#menu h1", "#menu .tag", "#menu .how", "#pick-pic", "#pick-name", "#pick-note", "#pick-best", "#play", "#sheds-k", "#shed-grid"]
          .filter((s) => { const e = document.querySelector(s), b = e.getBoundingClientRect(); return !(b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden"); });
        return { over: Math.max(document.documentElement.scrollWidth, innerWidth) - w, head: Math.round(r("#menu h1").top - r(".nav-back-games").bottom),
          tiles: tiles.length, small: tiles.filter((t) => t.width < 40 || t.height < 34).length, minW: Math.round(Math.min(...tiles.map((t) => t.width))),
          missing: shown, scrolls: panel.scrollHeight - panel.clientHeight };
      }, w);
      seen[w + "x" + h] = m;
      if (m.over > 0 || m.head < 0 || m.tiles !== 30 || m.small || m.missing.length || (!phone && m.scrolls > 1)) bad.push(w + "x" + h + " " + JSON.stringify(m));
      await done(q, "fit " + w + "x" + h);
      await c.close();
    }
    check("potting-shed: the menu fits at 320 x 568, 360 x 640, 390 x 664, 375 x 553 and 360 x 560 phones and 1280 x 900, 1366 x 657 and 1280 x 600 laptops: nothing wider than the screen, the heading below the corner buttons, thirty tiles at least 40 x 34 px and all of the card shown (on a laptop with no scrolling)",
      bad.length === 0, bad.length ? bad : seen);
  }
  await ctx.close();
};

// each shed's moves (L R U D), the fewest pushes, from a solver
const SOLUTIONS = [
  { pushes: 1, moves: "R" },
  { pushes: 4, moves: "LLUUULURDDDDRRRRUUUULDRDDLLDLU" },
  { pushes: 6, moves: "RRRLLLDRRR" },
  { pushes: 6, moves: "LLUUURDLDDRRUUDRRRUULLDLDDRRUURULDLLLLDR" },
  { pushes: 8, moves: "LULUURRDLDLURDDRUUDRDRUU" },
  { pushes: 9, moves: "RRDRRUULULLLULLDRDDRRRDRRUULULLLRRRRDDDLLLLULUURULRDRRRDD" },
  { pushes: 9, moves: "LUUUULLDRURDLDDRRRUULRURRDLULDLDDLLURLUURDDURRD" },
  { pushes: 9, moves: "UULULDDRRUURRDDLLLRRRDDLLL" },
  { pushes: 10, moves: "LULURULRDRRDRULURLDLLLDDRRRURDLLLDLRURRDR" },
  { pushes: 12, moves: "LLULLUURURDRRRDRRULULDLLLLDRDRRRRULDLLLLLDRDRULURDRRRDRRULDLURUL" },
  { pushes: 14, moves: "UUDLRDDLLUUURRDRLDDRRUUULLDDDLUUURDDDRUUU" },
  { pushes: 15, moves: "LUUULURURRDRRLLDDDDLLURRRRLLUUURRDRDDUURUULDDLULLULLDRRRRLLDDDRRRRDL" },
  { pushes: 19, moves: "RRRDRDDLULLDLLUURURRRURDDULLLLLDDDRRURRURULLLULLDDRULURLDDDDRRULDLUUURRRRRDD" },
  { pushes: 20, moves: "LULLUURRDULLLLLDDRRLDDRRUULUURRRDDLLUDRRUULLLRRRDDRDDLUUUDDLULLLDDRRUUULURLDDLLUUR" },
  { pushes: 21, moves: "RURRDLLLLULDDRDLRRRDRRULLUURDLDLLULDRRRDRRULLLLDLRUULD" },
  { pushes: 24, moves: "LDLLULLURDRDRRURUULLLDURRDULLDDUURRDDLLLULDDURRDRURDLLULLDDUURRRDDLLRRDRRULLLUULLDLDDRLUURDUURRDDLLULD" },
  { pushes: 26, moves: "UULLULLDRRRRRLDDRRUULURLDLDDLLDLLURUDRRUULULLDRRRRRLLDDRRDRRULUULLDDRDRU" },
  { pushes: 27, moves: "LLLUULURRRRURDLLLLDDDLUURUULLDRRRRURDDULLLDDDRRRRULUURDLDDLLLLULLDRRRRRR" },
  { pushes: 28, moves: "RRRRURRDLLLLULDDURRRRRRDLULLLLLLDDRDRRURRDRUURULLLLLULDLDDRRRLLLUURDLDRDRRULLUURRRRRDDLLL" },
  { pushes: 30, moves: "LLLULDDRURRRDDLURULLLDLDURUULDDRURRRDDDDLLLULRDRRRUULUULLLDDLLDDRULLUUURRRDDLRURURRRDDDDLLLULLRRDRRUUURULLLULDDDLDRUUULLLDDRLDR" },
  { pushes: 32, moves: "UULLLLDDLLLLUUUURRDRDRRRUULLDLLDUULLDDRLUURRDRDRLULULLDDRRURRDRLULLDRRDDRRUUUDDDLLUUUURRLLDDRLUURRDDRRUULRDDLLLLDDLLUDLLUURRURRDRRRRDDLLLLUUULLDRRRRRLLLDDRRRRUUUDLLLLLLDDRRRR" },
  { pushes: 32, moves: "LLRRUULLDLDURURRDDLLLULDDURRDLULLDDDRRRURRDLLLLLUUURRDLULDRRURRDLLLDLRUULDRRRDDRRULDLLLUURRDRDLL" },
  { pushes: 33, moves: "RDLDDLLLLLUURRURDLLLDDRRRRRDDRRRUUUULLULDRRRDDDDLLLLLLLLUUUURRRDULLLDDDDRRRRRRRRUUUULLLLRRRRDDDDLLLLLLLLUUUURRURDRRDDLLRRUULLDDLLRRRRUURRRDDDDLLLLLLLLUURRRRRUURRRDDLLLUULLDDDUUURRDDLRUULLDDRRRRRDDLLLLLLLRRRRRRRUULLLLLDURRRRRDDLLLLLUURRDULLDDLRRRR" },
  { pushes: 36, moves: "RDDLLLUURURLDLDDRRRUURLDDRRRRUUULDDRDDLDLLLUUUURRLLDDLLLUURRRRLDDDDRRRRUUUUULDRDDLRUULDRDDLDLLLUUUURRURRDDLDRUUULDRDDLLLRRRUULDULLLDDUURRRRDDLLLLLLRRUULLLDDRRRDURRRRDDLLLLUURRRDULLLDDLLRRUURRRRDDLLLL" },
  { pushes: 37, moves: "RLDLLURDRRURUULULLDRRRDDRRLLLDLLURRRUULLLDURRRDDLLDLLURRLUURRRDDRDRRUUDDLLULUURRURRDLLLLLULLDDDRRLLUUURRDRRRRDDDLLURDRUUURULLDLLLULLDDDRRRRRDRUUDLLLUURRURRDLLL" },
  { pushes: 41, moves: "LLDUULLLDDRDRRUUULLDRRRRRURDLLLLDDLLULURRRRRURRDDUULLDRURRDDLURULDLLLLDDRRUURRDDUULLLLDDDDLLUUULURRURDDULLDDRRRLUURRDDDUUURRDDDRDLUUUULLDDRLUURRDDD" },
  { pushes: 41, moves: "RRURRDLLLRRRDDLLLDLDLLUUUUURRDRRRDULLLULLDDDDDRRRUULLLUUURRDDUULLDDDDDRRRUULLRDDLLUUUUDDRRUUULLRRDRRRRDDLLLLLRDDLLUUUUDDRRRRRRDDLURULLLLLRDDLLUUUDRRRRRDDLLLL" },
  { pushes: 46, moves: "DDRLUULLDDRLUURRRDDRRRUURRDDDDLLLLLLLLUURRRRLLLLDDRRUUDDRRRRRRUUUULLDDDUUURRDDDDLLLLLLUURRRURDDUUURRDDLRUULLLDDLLLDDRRRRLLLLUURUULDDLLDDRRRRLLLLUURRDURRRURURRDDLLLLLULDLLDDRRUURUULLLDDRRURULLRDDLLD" },
  { pushes: 51, moves: "LDLLURUULURRRDRRRRUULLLDLDDDLDLUUULUURRDRRURRRDDDDDLLULLUUULULLDRRRDDDRRDRRUUULLLRRRUULLLDURRRDDDDDLLLULLDLUUUDDRRRRDRRULLLLLRRRRRUUUULLLDLLULLDDRDDUULUURDDURRRURRRDDDDLLLLUUDDRRRRUUUULLLDLLULLDDRURRRURRRDDLLLUURRDRDDDLLLLUURULLLDLURRRRURRRDDLLLRRRDDLLLLUURULLLRRDDDLLUDLDR" },
  { pushes: 61, moves: "LULLRRURRRDLULLDLDRUURRRDDULULLDLDDURUURRRDDDUULULLDLLULLDRDDRLLDDRRURRDRRUURUULULLDLLRDDURUURRRDDDLDDLLULRRDRRUULDLLLUURUURRRDDULULLDLDDDRRRRDLULLLUURUURRRDDDLDLLLUUULULLDRDDRLLDDRRURRRRURUULULLDLLULDRRDDLDDLLUURLDDRRURRLUURUURRRDDDLDDLRUURUULULLDLDDDRRDRRUULDLLLUURUURRRDDULULLDLDDDRRRRDLULLLUURUURRRDDDLDLLLLDLLUURRDRRRRURUULULLDLLLDURRRURRRDDDLDLLLLDLLUURLDDRRURRRRDRUUUDLDLLLLDLLUURUURRDDUULLDDRDRRRRDRUULDLLLLULUURRDDLDRRRRDRU" }
];
