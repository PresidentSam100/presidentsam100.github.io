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
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  const esc = { box: await quitShown(p), paused: await p.evaluate(() => !document.querySelector(".gs-pause:not(.gs-dialog)").hidden), leaves: p.leaves };
  const goesOn = await p.waitForFunction(() => __pool.G.shots === 1, null, { timeout: 8000 }).then(() => true, () => false);
  check("corner-pocket: while 'Leave this rack?' is up the CPU waits; Esc answers Keep playing and play goes on",
    up && held.phase === "cpu" && held.shots === 0 && !esc.box && !esc.paused && esc.leaves === 0 && goesOn, { up, held, esc, goesOn });
  await done(p, "leave this rack");

  // ---- Back to menu leaves no result card on top of the menu
  p = await open();
  await start(p, "you");
  await p.evaluate(() => { document.getElementById("over").classList.remove("hidden"); document.getElementById("confirmQuit").classList.remove("hidden"); });
  await p.click("#quitYes"); await p.waitForTimeout(100);
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
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  await p.mouse.up(); await p.waitForTimeout(80);
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

  await ctx.close();
};
