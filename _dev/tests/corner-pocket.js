// Corner Pocket: the ⏸ card's Restart and Menu ask first from the moment a
// rack is on, before the break too, the table held under the box (the CPU
// waits, any other key keeps the game), by the mouse and on a phone; there's
// no ☰; the aim wheel is beside the table side by side and, on an upright
// phone, takes the power bar's place by FINE AIM (POWER brings the bar back);
// a pull started anywhere on the power bar reaches full power at its far
// end; a cue ball let go
// by a pause or a cancelled touch lands on a free spot, and no shot goes while
// it sits on another ball; losing on the 8 names the foul; with Visual FX off
// the ball-in-hand ring and the called pocket hold still. The break follows
// the standard rules: the 8 on the break is respotted and the breaker plays
// on, and a scratch on the break is ball in hand behind the head string.
// A slow load's out-of-order first frame doesn't step the clock back.
const HOOK = ["    shoot: function (a, p, tx, ty) {", `    endShot: function () { endShot(); },
    shoot: function (a, p, tx, ty) {`];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (opts) => lib.open(ctx, base, "games/corner-pocket/", Object.assign({ before: (pg) => lib.injectScript(pg, "games/corner-pocket/game.js", [HOOK]) }, opts));
  const done = async (p, what) => { check("corner-pocket " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const start = async (p, who) => {
    await p.evaluate((who) => { window.coinFlip = (o, cb) => cb(who); }, who);
    await p.click("#startBtn");
    await p.waitForFunction((ph) => __pool.G.phase === ph, who === "you" ? "aim" : "cpu", { timeout: 8000 });
  };

  // ---- the break, by the standard (WPA) rules
  let p = await open();
  const brk = await p.evaluate(() => {
    const Ru = PoolRules, balls = []; for (let i = 0; i <= 15; i++) balls.push({ id: i, on: true });
    const r = (ev, later) => { const st = Ru.newGame(0); if (later) { st.isBreak = false; st.inHand = null; } const x = Ru.resolve(st, balls, ev, -1); return { respot: x.out.respot8, foul: x.out.foul, turn: x.st.turn, inHand: x.st.inHand, winner: x.st.winner }; };
    return {
      eight: r({ firstHit: 1, railAfter: true, pocketed: [{ id: 8, pocket: 2 }] }),
      eightScratch: r({ firstHit: 1, railAfter: true, pocketed: [{ id: 8, pocket: 2 }, { id: 0, pocket: 1 }] }),
      scratch: r({ firstHit: 1, railAfter: true, pocketed: [{ id: 0, pocket: 1 }] }),
      later: r({ firstHit: 1, railAfter: true, pocketed: [{ id: 0, pocket: 1 }] }, true),
    };
  });
  check("corner-pocket: the 8 on the break is neither a win nor a loss: it is respotted and the breaker plays on",
    brk.eight.respot && !brk.eight.foul && brk.eight.turn === 0 && brk.eight.winner === -1, brk.eight);
  check("corner-pocket: a scratch on the break (with the 8 or without) is ball in hand behind the head string; a scratch later in the rack, anywhere",
    brk.eightScratch.respot && brk.eightScratch.turn === 1 && brk.eightScratch.inHand === "kitchen" && brk.eightScratch.winner === -1 &&
    brk.scratch.inHand === "kitchen" && brk.scratch.turn === 1 && brk.later.inHand === "any", brk);
  await done(p, "break rules");

  // ---- in hand behind the line (after a scratch on the break): the cue ball
  // may not be played straight at a ball that lies behind the line too, but
  // may hit one beyond it, or come back to one after crossing the line; the
  // game names the foul; and the CPU keeps to both halves at every level
  p = await open();
  const line = await p.evaluate(() => {
    const P = PoolPhysics, Ru = PoolRules, AI = PoolAI, W = P.W, H = P.HEAD_X, G = __pool.G;
    const state = (inHand) => { const s = Ru.newGame(0); s.isBreak = false; s.turn = 1; s.inHand = inHand; return s; };
    const play = (balls, angle, power, inHand) => {
      const w = P.simulate(balls, { angle, power, tipX: 0, tipY: 0 }), r = Ru.resolve(state(inHand), balls, w.ev, -1);
      return { first: w.ev.firstHit, behind: w.ev.firstBehind, crossed: w.ev.crossed, foul: r.out.foul, inHand: r.st.inHand, turn: r.st.turn };
    };
    // the cue ball in the kitchen, the 1 behind the line beside it, the 9 beyond the line, the 8 out of the way
    const side = () => [P.makeBall(0, H - 0.2, W / 2), P.makeBall(1, H - 0.2, W / 2 - 0.25), P.makeBall(9, H + 0.5, W / 2), P.makeBall(8, P.FOOT_X + 0.3, W / 4)];
    // the 1 behind the cue ball, on the line it comes back along off the foot rail
    const back = () => [P.makeBall(0, H - 0.2, W / 2), P.makeBall(1, H - 0.4, W / 2), P.makeBall(8, P.FOOT_X + 0.3, W / 4)];
    const out = {
      direct: play(side(), -Math.PI / 2, 0.3, "kitchen"), beyond: play(side(), 0, 0.3, "kitchen"),
      round: play(back(), 0, 0.85, "kitchen"), anywhere: play(side(), -Math.PI / 2, 0.3, "any"),
    };
    // the game's own words for it
    G.balls = side(); G.st = state("kitchen"); G.before = P.cloneBalls(G.balls); G.toasts = [];
    G.world = { ev: { firstHit: 1, firstBehind: true, railAfter: true, pocketed: [] } }; G.shotCall = -1;
    __pool.endShot();
    out.toast = G.toasts.map((t) => t.text).join(" | ");
    // the CPU, in hand behind the line with an easy ball lying there (the 1, by the head corner pocket)
    out.cpu = [0, 1, 2].map((level) => {
      const balls = [P.makeBall(0, H - 0.1, W / 2), P.makeBall(1, 0.16, 0.14), P.makeBall(2, H + 0.6, 0.3), P.makeBall(9, H + 0.9, 0.7),
        P.makeBall(10, P.L - 0.25, 0.5), P.makeBall(8, P.FOOT_X + 0.3, W / 4)];
      const plan = AI.plan(balls, state("kitchen"), level, P.rng(11 + level));
      for (let i = 0; i < 4000 && !plan.step(50); i++);
      const s = plan.result, b = P.cloneBalls(balls);
      if (s && s.place) { b[0].x = s.place.x; b[0].y = s.place.y; }
      const w = s ? P.simulate(b, s) : null;
      return { placed: !!(s && s.place), x: s && s.place ? +(s.place.x / H).toFixed(3) : null, first: w ? w.ev.firstHit : null, behind: w ? w.ev.firstBehind : null };
    });
    return out;
  });
  check("corner-pocket: in hand behind the line, a shot straight at a ball behind the line is a foul (ball in hand anywhere for the other player), and the game says so",
    line.direct.first === 1 && line.direct.behind === true && line.direct.foul === "behindline" && line.direct.inHand === "any" && line.direct.turn === 0 &&
    /Foul: hit a ball behind the line/.test(line.toast), { direct: line.direct, toast: line.toast });
  check("corner-pocket: in hand behind the line, a ball beyond the line may be hit, and so may one behind it once the cue ball has crossed the line and come back; with ball in hand anywhere there is no such foul",
    line.beyond.first === 9 && line.beyond.behind === false && line.beyond.foul !== "behindline" &&
    line.round.first === 1 && line.round.crossed === true && line.round.behind === false && line.round.foul !== "behindline" &&
    line.anywhere.first === 1 && line.anywhere.foul !== "behindline", { beyond: line.beyond, round: line.round, anywhere: line.anywhere });
  check("corner-pocket: the CPU, in hand behind the line, sets the cue ball down behind it and doesn't play at the ball lying there (all three levels)",
    line.cpu.every((c) => c.placed && c.x <= 1.0001 && c.first !== 1 && c.behind === false), line.cpu);
  await done(p, "behind the line");

  // ---- the ⏸ card's Restart and Menu ask first from the moment the rack is
  // on (here before the CPU's break), the table held under the box: the CPU
  // waits, any other key keeps the game (still paused), Enter goes
  const dialog = (p) => p.evaluate(() => { const d = document.querySelector(".gs-dialog h2"); return d ? d.textContent : null; });
  const gone = (p) => p.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 5000 }).catch(() => {});
  const cardUp = (p) => p.evaluate(() => { const c = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!c && !c.hidden; });
  p = await open();
  await start(p, "cpu");
  await p.click(".gs-pause-btn"); await p.waitForTimeout(150);
  await p.click('[data-gs-act="restart"]'); await p.waitForTimeout(150);
  const restartAsks = await dialog(p);
  await p.waitForTimeout(3500);
  const held = await p.evaluate(() => ({ phase: __pool.G.phase, shots: __pool.G.shots }));
  await p.keyboard.press("x"); await gone(p);
  const kept = { dialog: await dialog(p), card: await cardUp(p), shots: await p.evaluate(() => __pool.G.shots) };
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  const menuAsks = await dialog(p);
  await p.keyboard.press("Enter"); await gone(p);
  await p.waitForFunction(() => !document.getElementById("menu").classList.contains("hidden"), null, { timeout: 5000 }).catch(() => {});
  const left = await p.evaluate(() => ({ phase: __pool.G.phase, card: !!document.querySelector(".gs-pause:not(.gs-dialog):not([hidden])"),
    over: !document.getElementById("over").classList.contains("hidden") }));
  check("corner-pocket: before the break the ⏸ card's Restart asks \"Start over?\" with the CPU waiting under the box; any other key keeps the game, still paused; Menu asks \"Quit this game?\" and Enter goes to the menu, nothing left over it",
    restartAsks === "Start over?" && held.phase === "cpu" && held.shots === 0 && kept.dialog === null && kept.card && kept.shots === 0 &&
    menuAsks === "Quit this game?" && left.phase === "menu" && !left.card && !left.over && p.leaves === 0, { restartAsks, held, kept, menuAsks, left, leaves: p.leaves });
  await done(p, "pause card asks");

  // and on a phone, tapped (you to break): both ask, and Keep playing keeps the rack
  {
    const { devices } = require("@playwright/test");
    const ph = await lib.newContext(browser, devices["iPhone 13"]);
    p = await lib.open(ph, base, "games/corner-pocket/", { before: (pg) => lib.injectScript(pg, "games/corner-pocket/game.js", [HOOK]) });
    await start(p, "you");
    const tapAsk = async (act) => {
      await p.tap(".gs-pause-btn"); await p.waitForTimeout(250);
      await p.tap('[data-gs-act="' + act + '"]'); await p.waitForTimeout(450);
      const asked = await dialog(p);
      if (asked) { await p.tap('.gs-dialog button:has-text("Keep playing")'); await gone(p); }
      const st = await p.evaluate(() => ({ phase: __pool.G.phase, menu: !document.getElementById("menu").classList.contains("hidden") }));
      if (await cardUp(p)) { await p.keyboard.press("p"); await p.waitForTimeout(150); }   // (resume)
      return { asked, ...st };
    };
    const taps = { restart: await tapAsk("restart"), menu: await tapAsk("menu") };
    check("corner-pocket, on a phone: before the break the ⏸ card's Restart and Menu, tapped, ask first, and Keep playing keeps the rack",
      taps.restart.asked === "Start over?" && taps.menu.asked === "Quit this game?" && taps.restart.phase === "aim" && taps.menu.phase === "aim" && !taps.menu.menu, taps);
    await done(p, "pause card asks (phone)");
    await ph.close();
  }

  // ---- ball in hand: drag the cue ball onto a ball, then let a pause or a
  // cancelled touch end the drag; and no shot while it's there
  p = await open();
  await start(p, "you");
  await p.evaluate(() => { __pool.G.st.inHand = "any"; __pool.G.st.isBreak = false; __pool.G.toasts = []; });
  const legal = () => p.evaluate(() => { const G = __pool.G, c = G.balls[0]; return { ok: PoolPhysics.placeOk(G.balls, c.x, c.y, false), bad: G.placeBad }; });
  const dragOnto = async (id) => {
    const pt = await p.evaluate((id) => { const G = __pool.G, c = G.balls[0], b = G.balls.find((x) => x.id === id); return { c: __pool.toScreen(c.x, c.y), b: __pool.toScreen(b.x, b.y) }; }, id);
    await p.mouse.move(pt.c.x, pt.c.y); await p.mouse.down();
    await p.mouse.move((pt.c.x + pt.b.x) / 2, (pt.c.y + pt.b.y) / 2, { steps: 4 });
    await p.mouse.move(pt.b.x + 1, pt.b.y, { steps: 4 });
  };
  await dragOnto(5);
  const onBall = await legal();
  const shot = await p.evaluate(() => { __pool.shoot(0, 0.5); return { phase: __pool.G.phase, shots: __pool.G.shots }; });
  check("corner-pocket: no shot goes while the cue ball sits on another ball", !onBall.ok && onBall.bad && shot.phase === "aim" && shot.shots === 0, { onBall, shot });
  await p.keyboard.press("p"); await p.waitForFunction(() => !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, null, { timeout: 5000 }).catch(() => {});
  await p.keyboard.press("p"); await p.waitForFunction(() => document.querySelector(".gs-pause:not(.gs-dialog)").hidden, null, { timeout: 5000 }).catch(() => {});
  await p.mouse.up();
  const afterPause = await legal();
  await dragOnto(9);
  await p.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true })));
  const afterCancel = await legal();
  await p.mouse.up();
  check("corner-pocket: a cue ball let go by a pause or a cancelled touch lands on a free spot",
    afterPause.ok && !afterPause.bad && afterCancel.ok && !afterCancel.bad, { afterPause, afterCancel });
  await done(p, "ball in hand");

  // ---- losing on the 8: the result names the foul (wrong ball first isn't a scratch)
  p = await open();
  const why = await p.evaluate(() => {
    const G = __pool.G, Ru = PoolRules, P = PoolPhysics;
    const lose = (ev) => {
      G.balls = P.rack(P.rng(3));
      G.balls.forEach((b) => { if (b.id >= 1 && b.id <= 7) b.on = false; });   // your solids are all down
      G.st = Ru.newGame(0); G.st.isBreak = false; G.st.open = false; G.st.groups = ["solid", "stripe"]; G.st.inHand = null;
      G.before = P.cloneBalls(G.balls);
      ev.pocketed.forEach((q) => { P.byId(G.balls, q.id).on = false; });
      G.world = { ev: ev }; G.shotCall = 2; G.pendingOver = null;
      __pool.endShot();
      return G.pendingOver.why;
    };
    return {
      wrong: lose({ firstHit: 9, railAfter: true, pocketed: [{ id: 8, pocket: 2 }] }),
      scratch: lose({ firstHit: 8, railAfter: true, pocketed: [{ id: 8, pocket: 2 }, { id: 0, pocket: 5 }] })
    };
  });
  check("corner-pocket: losing on the 8 by a foul names it (wrong ball first isn't called a scratch)",
    /wrong ball first/.test(why.wrong) && !/scratch/.test(why.wrong) && /scratched/.test(why.scratch), why);
  await done(p, "foul on the 8");

  // ---- Visual FX off: the ball-in-hand ring and the called pocket hold still (FX on, they pulse)
  const still = {};
  for (const off of [true, false]) {
    p = await open({ before: async (pg) => {
      await lib.injectScript(pg, "games/corner-pocket/game.js", [HOOK]);
      await pg.addInitScript((off) => localStorage.setItem("reduceMotion:corner-pocket", off ? "1" : "0"), off);
    } });
    await start(p, "you");
    await p.evaluate(() => {
      const G = __pool.G;
      G.balls.forEach((b) => { if (b.id >= 1 && b.id <= 7) b.on = false; });   // on the 8, with a pocket called
      G.st.isBreak = false; G.st.open = false; G.st.groups = ["solid", "stripe"]; G.st.inHand = "any";
      G.called = 0; G.calledManual = true; G.toasts = [];
    });
    await p.waitForTimeout(200);
    const a = await p.evaluate(() => document.getElementById("table").toDataURL());
    await p.waitForTimeout(170);
    const b = await p.evaluate(() => document.getElementById("table").toDataURL());
    still[off ? "off" : "on"] = a === b;
    await done(p, "fx " + (off ? "off" : "on"));
  }
  check("corner-pocket: with Visual FX off the ball-in-hand ring and the called pocket hold still; with it on they pulse", still.off && !still.on, still);

  // ---- How to play: its keys show on a desktop, not on a phone (the touch ways stay)
  const { devices } = require("@playwright/test");
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  const how = {};
  for (const [label, c] of [["desktop", ctx], ["phone", phone]]) {
    p = await lib.open(c, base, "games/corner-pocket/");
    how[label] = await p.evaluate(() => {
      document.querySelector(".how").open = true;
      const kbd = [...document.querySelectorAll(".how kbd")];
      const text = document.querySelector(".how ul").innerText;
      return { keys: kbd.length, shown: kbd.filter((k) => k.getClientRects().length > 0).length, wheel: /ribbed wheel/.test(text), swap: /FINE AIM/.test(text) && /POWER/.test(text), bar: /power bar/.test(text), spin: /tap the cue ball icon/.test(text) };
    });
    await done(p, label + " how to play");
  }
  check("corner-pocket: How to play shows its keys on a desktop and hides them on a phone, keeping the touch ways (the wheel, and FINE AIM / POWER to swap it in for the bar)",
    how.desktop.keys > 0 && how.desktop.shown === how.desktop.keys && how.phone.shown === 0 && how.phone.wheel && how.phone.swap && how.phone.bar && how.phone.spin, how);
  await phone.close();

  // ---- the controls: no ☰ (the ⏸ card has Menu). Side by side the aim
  // wheel stands right of the table and the bar left of it; on an upright
  // phone they share the row under the table, one at a time: FINE AIM swaps
  // the wheel in (a drag along it turns the aim, and no power comes of it),
  // POWER the bar back. A pull started halfway along the bar reaches full
  // power at its far end.
  const lay = {};
  for (const [label, opts] of [["390 x 664", { ...devices["iPhone 13"], viewport: { width: 390, height: 664 } }], ["320 x 568", { ...devices["iPhone SE"], viewport: { width: 320, height: 568 } }],
    ["375 x 553", { ...devices["iPhone 8"], viewport: { width: 375, height: 553 } }], ["1366 x 657", { viewport: { width: 1366, height: 657 } }], ["1280 x 900", { viewport: { width: 1280, height: 900 } }]]) {
    const c = await lib.newContext(browser, opts);
    p = await lib.open(c, base, "games/corner-pocket/", { before: (pg) => lib.injectScript(pg, "games/corner-pocket/game.js", [HOOK]) });
    await start(p, "you");
    const m = await p.evaluate(() => {
      const U = __pool.UI, o = __pool.V.outer, r = (b) => b && { x: b.x, y: b.y, w: b.w, h: b.h, v: !!b.vertical };
      return { extra: Object.keys(U).filter((k) => /menu/.test(k) && U[k]), W: innerWidth, H: innerHeight, table: { l: o.x, r: o.x + o.w, b: o.y + o.h },
        bar: r(U.power), wheel: r(U.wheel), swap: r(U.swap) };
    });
    if (m.swap) {
      const tapSwap = () => p.tap("canvas", { position: { x: m.swap.x + m.swap.w / 2, y: m.swap.y + m.swap.h / 2 } }).then(() => p.waitForTimeout(100));
      await tapSwap();
      const a0 = await p.evaluate(() => __pool.G.aim), wy = m.wheel.y + m.wheel.h / 2;
      await p.mouse.move(m.wheel.x + m.wheel.w / 2, wy); await p.mouse.down(); await p.mouse.move(m.wheel.x + m.wheel.w / 2 + 40, wy, { steps: 4 }); await p.mouse.up();
      m.swapped = await p.evaluate((a0) => ({ wheelUp: __pool.wheelUp, turned: __pool.G.aim !== a0, power: __pool.G.power, phase: __pool.G.phase }), a0);
      await tapSwap();
      m.back = await p.evaluate(() => __pool.wheelUp);
    }
    const b = m.bar, x0 = b.x + b.w / 2, y0 = b.y + b.h / 2, x1 = b.v ? x0 : b.x + b.w - 2, y1 = b.v ? b.y + b.h - 2 : y0;
    await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x1, y1, { steps: 6 });
    m.power = await p.evaluate(() => __pool.G.power);
    await p.mouse.up();
    lay[label] = m;
    await done(p, label + " controls");
    await c.close();
  }
  const near = (a, b) => Math.abs(a - b) < 1;
  const phoneOk = (m) => !!m.swap && !m.bar.v && near(m.wheel.x, m.bar.x) && near(m.wheel.w, m.bar.w) && near(m.bar.x + m.bar.w + 10, m.swap.x) && near(m.swap.x + m.swap.w, m.table.r) &&
    m.swap.y + m.swap.h <= m.H && m.swapped.wheelUp && m.swapped.turned && m.swapped.power === 0 && m.swapped.phase === "aim" && m.back === false;
  const deskOk = (m) => !m.swap && m.bar.v && m.wheel.v && m.bar.x + m.bar.w < m.table.l && m.wheel.x > m.table.r && m.wheel.x + m.wheel.w <= m.W;
  check("corner-pocket: no ☰ at any size; a pull from halfway along the power bar to its far end is full power",
    Object.values(lay).every((m) => m.extra.length === 0 && m.power >= 0.99), Object.fromEntries(Object.entries(lay).map(([k, m]) => [k, { extra: m.extra, power: m.power }])));
  check("corner-pocket: on phones (390 x 664, 320 x 568, 375 x 553) FINE AIM swaps the aim wheel in for the power bar (dragged, it turns the aim and gives no power) and POWER swaps the bar back; on laptops (1366 x 657, 1280 x 900) the bar is left of the table and the wheel right of it",
    phoneOk(lay["390 x 664"]) && phoneOk(lay["320 x 568"]) && phoneOk(lay["375 x 553"]) && deskOk(lay["1366 x 657"]) && deskOk(lay["1280 x 900"]), lay);

  // ---- quitting to the menu by the ⏸ card's Menu: a rack under way vs the CPU
  // counts as a loss (and the box says so); not before the break, not a
  // two-player rack, not one already decided (which goes without asking)
  // pause, press Menu, read what the box says and press Enter; the stored records after
  const quitRack = async (p) => {
    await p.click(".gs-pause-btn"); await p.waitForTimeout(150);
    await p.click('[data-gs-act="menu"]'); await p.waitForTimeout(150);
    const box = await p.evaluate(() => { const d = document.querySelector(".gs-dialog"); return d ? d.innerText : null; });
    if (box) { await p.keyboard.press("Enter"); await gone(p); }
    await p.waitForFunction(() => !document.getElementById("menu").classList.contains("hidden"), null, { timeout: 5000 }).catch(() => {});
    const recs = await p.evaluate(() => Object.keys(localStorage).filter((k) => /^cornerpocket_record/.test(k)).map((k) => k + "=" + localStorage.getItem(k)));
    return { asked: !!box, said: /counts as a loss/.test(box || ""), recs, menu: await p.evaluate(() => document.getElementById("recLine").textContent),
      over: await p.evaluate(() => !document.getElementById("over").classList.contains("hidden")) };
  };
  const broken = (p) => p.evaluate(() => __pool.shoot(0, 0.5)).then(() => p.waitForFunction(() => __pool.G.shots === 1 && ["aim", "cpu"].includes(__pool.G.phase), null, { timeout: 15000 }));
  const quits = {};
  p = await open();
  await start(p, "you"); await broken(p);
  quits.underway = await quitRack(p);
  await done(p, "quit under way");
  p = await open();
  await start(p, "you");
  quits.beforeBreak = await quitRack(p);
  await done(p, "quit before the break");
  p = await open();
  await p.click('#modeSeg button[data-mode="2p"]');
  await start(p, "you"); await broken(p);
  quits.twoPlayer = await quitRack(p);
  await done(p, "quit two players");
  p = await open();
  await start(p, "you"); await broken(p);
  await p.evaluate(() => {   // the rack ends: you foul on the 8 (a loss, recorded then)
    const G = __pool.G, P = PoolPhysics;
    G.balls.forEach((b) => { if (b.id >= 1 && b.id <= 8) b.on = false; });
    G.st.isBreak = false; G.st.open = false; G.st.groups = ["solid", "stripe"]; G.st.turn = 0; G.st.inHand = null;
    G.before = P.cloneBalls(G.balls); P.byId(G.before, 8).on = true;
    G.world = { ev: { firstHit: 9, railAfter: true, pocketed: [{ id: 8, pocket: 2 }] } }; G.shotCall = 2;
    __pool.endShot();
    G.waitT = 1e9;   // (hold the result card back, so the table can still be paused)
  });
  quits.decided = await quitRack(p);
  await done(p, "quit a decided rack");
  const LOSS = "cornerpocket_record_medium=" + JSON.stringify({ w: 0, l: 1, d: 0 });
  check("corner-pocket: quitting a rack under way vs the CPU to the menu counts as a loss, and the box says so first",
    quits.underway.asked && quits.underway.said && quits.underway.recs.join() === LOSS && /1 L/.test(quits.underway.menu), quits.underway);
  check("corner-pocket: quitting before the break or a two-player rack asks but records nothing, and the box doesn't say it counts; a decided rack goes without asking, records nothing new and leaves no result card over the menu",
    quits.beforeBreak.asked && !quits.beforeBreak.said && quits.beforeBreak.recs.length === 0 && quits.twoPlayer.asked && !quits.twoPlayer.said && quits.twoPlayer.recs.length === 0 &&
    !quits.decided.asked && quits.decided.recs.join() === LOSS && !quits.decided.over, { beforeBreak: quits.beforeBreak, twoPlayer: quits.twoPlayer, decided: quits.decided });

  // ---- the 8-ball rules, worked through endShot (the table as it stood, what
  // the shot did): you have solids, and are on the 8 or not
  p = await open();
  await start(p, "you");
  const rule = (setup) => p.evaluate((setup) => {
    const G = __pool.G, Ru = PoolRules, P = PoolPhysics;
    G.balls = P.rack(P.rng(5));
    if (setup.onEight) G.balls.forEach((b) => { if (b.id >= 1 && b.id <= 7) b.on = false; });
    G.st = Ru.newGame(0); G.st.isBreak = false; G.st.open = false; G.st.groups = ["solid", "stripe"]; G.st.inHand = null;
    G.before = P.cloneBalls(G.balls);
    setup.ev.pocketed.forEach((q) => { P.byId(G.balls, q.id).on = false; });
    G.world = { ev: setup.ev }; G.shotCall = setup.call == null ? 2 : setup.call; G.pendingOver = null; G.toasts = [];
    __pool.endShot();
    G.waitT = 1e9;   // (no result card yet)
    return { foul: G.toasts.map((t) => t.text).join(" | "), why: G.pendingOver && G.pendingOver.why, title: G.pendingOver && G.pendingOver.title };
  }, setup);
  const r8 = {
    first: await rule({ ev: { firstHit: 8, railAfter: true, pocketed: [] } }),                                       // (a) the 8 first, group not cleared
    early: await rule({ ev: { firstHit: 3, railAfter: true, pocketed: [{ id: 8, pocket: 2 }] } }),                   // (b) the 8 down too early
    scratch: await rule({ onEight: true, ev: { firstHit: 8, railAfter: true, pocketed: [{ id: 8, pocket: 2 }, { id: 0, pocket: 4 }] } }),   // (c)
    elsewhere: await rule({ onEight: true, call: 5, ev: { firstHit: 8, railAfter: true, pocketed: [{ id: 8, pocket: 2 }] } }),            // (d)
    called: await rule({ onEight: true, ev: { firstHit: 8, railAfter: true, pocketed: [{ id: 8, pocket: 2 }] } }),
  };
  check("corner-pocket: hitting the 8 first before your group is cleared is a foul, and says so",
    /Foul: hit the 8 first/.test(r8.first.foul) && !r8.first.why, r8.first);
  check("corner-pocket (a guard): the 8 sunk early, with the cue ball, or in a pocket not called loses; in the called pocket it wins",
    /too early/.test(r8.early.why) && /CPU wins/.test(r8.early.title) && /scratched/.test(r8.scratch.why) && /CPU wins/.test(r8.scratch.title) &&
    /wrong pocket/.test(r8.elsewhere.why) && /CPU wins/.test(r8.elsewhere.title) && /You win/.test(r8.called.title), r8);
  await done(p, "8-ball rules");

  // ---- on the 8, no shot goes until a pocket is called (and the table says so)
  p = await open();
  await start(p, "you");
  const call = await p.evaluate(() => {
    const G = __pool.G;
    G.balls.forEach((b) => { if (b.id >= 1 && b.id <= 7) b.on = false; });
    G.st.isBreak = false; G.st.open = false; G.st.groups = ["solid", "stripe"]; G.st.inHand = null;
    G.called = -1; G.calledManual = true; G.toasts = [];
    __pool.shoot(Math.PI, 0.4);   // away from the rack: no call made by aiming
    const blocked = { phase: G.phase, shots: G.shots, say: G.toasts.map((t) => t.text).join(" | ") };
    G.called = 0;
    __pool.shoot(Math.PI, 0.4);
    return { blocked, after: { phase: G.phase, shots: G.shots } };
  });
  check("corner-pocket: on the 8, a shot with no pocket called doesn't go, and the table says to call one; once called it goes",
    call.blocked.phase === "aim" && call.blocked.shots === 0 && /Call a pocket for the 8 first/.test(call.blocked.say) && call.after.shots === 1, call);
  await done(p, "call the 8");

  // ---- (a guard) the CPU always calls a pocket on the 8, at every level
  p = await open();
  const cpuCalls = await p.evaluate(() => {
    const out = [];
    for (let level = 0; level < 3; level++) for (let seed = 1; seed <= 3; seed++) {
      const P = PoolPhysics, Ru = PoolRules, balls = P.rack(P.rng(seed * 11));
      balls.forEach((b) => { if (b.id >= 9) b.on = false; });   // the CPU's stripes are down
      const st = Ru.newGame(0); st.isBreak = false; st.open = false; st.groups = ["solid", "stripe"]; st.turn = 1; st.inHand = seed === 2 ? "any" : null;
      const plan = PoolAI.plan(balls, st, level, P.rng(seed));
      let n = 0; while (!plan.step(1e6) && n++ < 50);
      out.push(plan.result.call);
    }
    return out;
  });
  check("corner-pocket (a guard): the CPU always calls a pocket for the 8", cpuCalls.length === 9 && cpuCalls.every((c) => c >= 0 && c <= 5), cpuCalls);
  await done(p, "cpu calls");

  // ---- aiming keys: Shift+← / → are the finest steps, a held arrow speeds up,
  // and Alt+← / → are left to the browser (Back / Forward)
  p = await open();
  await start(p, "you");
  const aimBy = (init) => p.evaluate((init) => {
    const G = __pool.G, a = G.aim;
    const e = new KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true }, init));
    document.body.dispatchEvent(e);
    return { d: +(G.aim - a).toFixed(5), claimed: e.defaultPrevented };
  }, init);
  const keys = {
    plain: await aimBy({ key: "ArrowRight" }),
    shift: await aimBy({ key: "ArrowRight", shiftKey: true }),
    alt: await aimBy({ key: "ArrowRight", altKey: true }),
  };
  for (let i = 0; i < 30; i++) await aimBy({ key: "ArrowRight", repeat: true });
  keys.held = await aimBy({ key: "ArrowRight", repeat: true });
  check("corner-pocket: Shift+→ makes the finest aim step, a held → speeds up, and Alt+→ is left to the browser",
    keys.shift.d > 0 && keys.shift.d < keys.plain.d && keys.alt.d === 0 && !keys.alt.claimed && keys.held.d > keys.plain.d * 3, keys);
  await done(p, "aim keys");

  // ---- a first frame stamped before the game read its clock (a slow load) is
  // a step back: served here with the clock read 3 s late, so it always is.
  // The step the table is handed is never below 0.
  {
    const q = await lib.open(ctx, base, "games/corner-pocket/", { before: (pg) => lib.injectScript(pg, "games/corner-pocket/game.js", [HOOK,
      ["  var last = performance.now(), frames = 0;", "  var last = performance.now() + 3000, frames = 0;"],
      ["if (!(Pz && Pz.isPaused())) update(dt);", "if (!(Pz && Pz.isPaused())) { (window.__dts = window.__dts || []).push(dt); update(dt); }"]]) });
    const dts = await q.evaluate(() => new Promise((r) => { let k = 0; (function f() { if (++k < 10) requestAnimationFrame(f); else r(window.__dts || []); })(); }));
    check("corner-pocket: a slow load's out-of-order first frame doesn't step the game's clock back", dts.length > 0 && Math.min(...dts) >= 0, { steps: dts.length, least: Math.min(...dts) });
    await done(q, "first frame");
  }

  // ---- How to play states the 8-ball rules and the aiming keys
  p = await open();
  const how8 = await p.evaluate(() => document.querySelector(".how ul").textContent.replace(/\s+/g, " "));
  check("corner-pocket: How to play says the 8 can't be hit first early, sinking it early or with the cue ball loses, a pocket must be called, and Shift fine-aims",
    /8 first/.test(how8) && /too early|before your group/.test(how8) && /cue ball/.test(how8.slice(how8.indexOf("Cleared"))) && /must call/.test(how8) && /Shift/.test(how8), how8);
  await done(p, "how to play rules");

  await ctx.close();
};
