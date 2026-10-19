// Potting Shed: the shed picker takes ← and → (shown on its arrows, the pick
// kept) and Space or Enter goes in; every shed has as many patches of sun as
// pots, and its gardener inside the walls; the gardener walks, benches stop
// him, a pot goes one cell where it's pushed but not into a bench or another
// pot, and moves and pushes are counted; Undo takes a step back; a pot in the
// sun blooms; the last pot in the sun pots the shed, keeping the fewest moves,
// and the card waits a moment for Space, which goes on to the next shed (R
// again, Backspace the sheds); paused, the arrows do nothing; the gardener
// and the pot slide to their cells with Visual FX on and off alike; on a
// phone the pad and a swipe walk him.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/potting-shed/", opts);
  const done = async (p, what) => { check("potting-shed " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);

  // ---- the picker
  let p = await open();
  const caps = await p.evaluate(() => ["pick-prev", "pick-next", "play"].map((id) => document.getElementById(id).getAttribute("data-gs-key")));
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(80);
  const picked = await p.evaluate(() => ({ shed: PottingShed.shed(), name: document.getElementById("pick-name").textContent, kept: localStorage.getItem("pottingshed_shed") }));
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(80);
  const wrapped = await p.evaluate(() => PottingShed.shed());
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const began = await p.evaluate(() => ({ state: PottingShed.state(), shed: PottingShed.shed(), hud: document.getElementById("hud-shed").textContent }));
  check("potting-shed: the picker's arrows wear ← and →, the start Space or Enter; → → goes to the third shed (kept), ← goes round from the first to the last, and Space goes in",
    caps.join() === "←,→,Space or Enter" && picked.shed === 2 && picked.name === "Two by the Door" && picked.kept === "2" && wrapped === 11 && began.state === "play" && began.shed === 0 && /^1 · First Pot$/.test(began.hud),
    { caps, picked, wrapped, began });

  // ---- every shed: as many suns as pots, the gardener inside
  const sheds = await p.evaluate(() => { const out = []; for (let n = 0; n < PottingShed.count; n++) { const L = PottingShed.level(n); out.push({ n, pots: L.pots.length, suns: L.sun.filter(Boolean).length, inside: !L.wall[L.me] }); } return out; });
  check("potting-shed: twelve sheds, each with as many patches of sun as pots and the gardener on the floor", sheds.length === 12 && sheds.every((s) => s.pots === s.suns && s.pots > 0 && s.inside), sheds);

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

  // ---- the first shed: one push pots it; the fewest moves kept; Space waits, then the next shed
  const potted = await p.evaluate(() => {
    localStorage.removeItem("pottingshed_best");
    PottingShed.start(0); PottingShed.step(1, 0);
    return { state: PottingShed.state(), blooms: PottingShed.blooms(), best: PottingShed.best(0), card: document.getElementById("done-title").textContent };
  });
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
  const early = await p.evaluate(() => PottingShed.state());
  await wait(p, 900);
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const next = await p.evaluate(() => ({ state: PottingShed.state(), shed: PottingShed.shed() }));
  check("potting-shed: the last pot in the sun blooms and pots the shed, keeping the fewest moves; the card waits a moment for Space, which goes to the next shed",
    potted.state === "done" && potted.blooms >= 1 && potted.best && potted.best.m === 1 && potted.card === "Potted!" && early === "done" && next.state === "play" && next.shed === 1, { potted, early, next });
  await p.evaluate(() => { PottingShed.start(0); PottingShed.step(1, 0); });
  await wait(p, 900);
  await p.keyboard.press("r"); await p.waitForTimeout(120);
  const again = await p.evaluate(() => ({ state: PottingShed.state(), shed: PottingShed.shed(), moves: PottingShed.moves() }));
  await p.evaluate(() => PottingShed.step(1, 0));
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
  await ctx.close();
};
