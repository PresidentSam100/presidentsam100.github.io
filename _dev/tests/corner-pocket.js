// Corner Pocket: "Leave this rack?" holds the table (the CPU waits, Esc means
// Keep playing, Back to menu leaves no result card behind); a cue ball let go
// by a pause or a cancelled touch lands on a free spot, and no shot goes while
// it sits on another ball; losing on the 8 names the foul; with Visual FX off
// the ball-in-hand ring and the called pocket hold still.
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
  const quitShown = (p) => p.evaluate(() => !document.getElementById("confirmQuit").classList.contains("hidden"));

  // ---- the CPU waits while "Leave this rack?" is up; Esc keeps playing
  let p = await open();
  await start(p, "cpu");
  const m = await p.evaluate(() => { const r = __pool.UI.menu; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
  await p.mouse.click(m.x, m.y);
  const up = await quitShown(p);
  await p.waitForTimeout(3500);
  const held = await p.evaluate(() => ({ phase: __pool.G.phase, shots: __pool.G.shots }));
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => document.getElementById("confirmQuit").classList.contains("hidden"), null, { timeout: 5000 }).catch(() => {});
  const esc = { box: await quitShown(p), paused: await p.evaluate(() => !document.querySelector(".gs-pause:not(.gs-dialog)").hidden), leaves: p.leaves };
  const goesOn = await p.waitForFunction(() => __pool.G.shots === 1, null, { timeout: 8000 }).then(() => true, () => false);
  check("corner-pocket: while 'Leave this rack?' is up the CPU waits; Esc answers Keep playing and play goes on",
    up && held.phase === "cpu" && held.shots === 0 && !esc.box && !esc.paused && esc.leaves === 0 && goesOn, { up, held, esc, goesOn });
  await done(p, "leave this rack");

  // ---- Back to menu leaves no result card on top of the menu
  p = await open();
  await start(p, "you");
  await p.evaluate(() => { document.getElementById("over").classList.remove("hidden"); document.getElementById("confirmQuit").classList.remove("hidden"); });
  await p.click("#quitYes");
  await p.waitForFunction(() => !document.getElementById("menu").classList.contains("hidden"), null, { timeout: 5000 }).catch(() => {});
  const cards = await p.evaluate(() => ({ over: !document.getElementById("over").classList.contains("hidden"), menu: !document.getElementById("menu").classList.contains("hidden") }));
  check("corner-pocket: 'Back to menu' leaves no result card over the menu", !cards.over && cards.menu, cards);
  await done(p, "back to menu");

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
      return { keys: kbd.length, shown: kbd.filter((k) => k.getClientRects().length > 0).length, wheel: /ribbed wheel/.test(text), bar: /power bar/.test(text), spin: /tap the cue ball icon/.test(text) };
    });
    await done(p, label + " how to play");
  }
  check("corner-pocket: How to play shows its keys on a desktop and hides them on a phone, keeping the touch ways",
    how.desktop.keys > 0 && how.desktop.shown === how.desktop.keys && how.phone.shown === 0 && how.phone.wheel && how.phone.bar && how.phone.spin, how);
  await phone.close();

  // ---- quitting to the menu through ☰: a rack under way vs the CPU counts as
  // a loss (and the box says so); not before the break, not a two-player rack,
  // not one already decided
  // open ☰, read what the box says, press Back to menu; the stored records after
  const quitRack = async (p) => {
    const m = await p.evaluate(() => { const r = __pool.UI.menu; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
    await p.mouse.click(m.x, m.y);
    const said = await p.evaluate(() => /counts as a loss/.test(document.getElementById("confirmQuit").innerText));
    await p.click("#quitYes");
    await p.waitForFunction(() => !document.getElementById("menu").classList.contains("hidden"), null, { timeout: 5000 }).catch(() => {});
    const recs = await p.evaluate(() => Object.keys(localStorage).filter((k) => /^cornerpocket_record/.test(k)).map((k) => k + "=" + localStorage.getItem(k)));
    return { said, recs, menu: await p.evaluate(() => document.getElementById("recLine").textContent) };
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
    G.waitT = 1e9;   // (hold the result card back, so ☰ is still there to press)
  });
  quits.decided = await quitRack(p);
  await done(p, "quit a decided rack");
  const LOSS = "cornerpocket_record_medium=" + JSON.stringify({ w: 0, l: 1, d: 0 });
  check("corner-pocket: quitting a rack under way vs the CPU to the menu counts as a loss, and the box says so first",
    quits.underway.said && quits.underway.recs.join() === LOSS && /1 L/.test(quits.underway.menu), quits.underway);
  check("corner-pocket: quitting before the break, a two-player rack or a decided one records nothing new, and the box doesn't say it counts",
    !quits.beforeBreak.said && quits.beforeBreak.recs.length === 0 && !quits.twoPlayer.said && quits.twoPlayer.recs.length === 0 &&
    !quits.decided.said && quits.decided.recs.join() === LOSS, { beforeBreak: quits.beforeBreak, twoPlayer: quits.twoPlayer, decided: quits.decided });

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

  // ---- How to play states the 8-ball rules and the aiming keys
  p = await open();
  const how8 = await p.evaluate(() => document.querySelector(".how ul").textContent.replace(/\s+/g, " "));
  check("corner-pocket: How to play says the 8 can't be hit first early, sinking it early or with the cue ball loses, a pocket must be called, and Shift fine-aims",
    /8 first/.test(how8) && /too early|before your group/.test(how8) && /cue ball/.test(how8.slice(how8.indexOf("Cleared"))) && /must call/.test(how8) && /Shift/.test(how8), how8);
  await done(p, "how to play rules");

  await ctx.close();
};
