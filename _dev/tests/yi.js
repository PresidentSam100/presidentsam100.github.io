// Yi: the table waits while "Leave this game?" is up and while you're away
// (the YI call, the catch window and the CPUs all pick up where they were);
// a game's late timers never reach the next deal; what's left of the old
// name is gone; and the points game's final result has a way to the menu.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const settle = (p) => p.waitForTimeout(250);
  const dlg = (p) => p.evaluate(() => { const h = document.querySelector(".gs-dialog h2"); return h ? h.textContent : null; });
  const mine = (p) => p.evaluate(() => G.players[0].hand.length);
  const done = async (p, g) => { check(g + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const deal = async (p) => { await p.click("#startBtn"); await p.waitForTimeout(300); };
  // your last-but-one card is down: the "One card left!" window opens (3.2s to call YI)
  const oneLeft = (p) => p.evaluate(() => {
    G.currentPlayerIndex = 0; G.busy = true; G.acted = true;
    G.players[0].hand = [G.players[0].hand[0]];
    unoWindow(0, function () {});
  });

  // ---- the YI call waits under "Leave this game?"; Keep playing re-arms what was left
  let p = await lib.open(ctx, base, "games/yi/");
  await deal(p);
  await oneLeft(p);
  await p.waitForTimeout(1000);
  await p.keyboard.press("Escape"); await settle(p);
  const asked = await dlg(p);
  await p.waitForTimeout(3000);
  const under = await mine(p);
  await p.keyboard.press("Escape"); await settle(p);   // Keep playing
  await p.waitForTimeout(700);
  const soon = await mine(p);
  await p.waitForTimeout(2600);
  const later = await mine(p);
  check("yi: the YI call can't run out under 'Leave this game?'; Keep playing gives back the time that was left",
    asked === "Leave this game?" && under === 1 && soon === 1 && later === 3, { asked, under, soon, later });

  // ---- ...nor while you're away; it carries on when you're back
  await oneLeft(p);
  await p.evaluate(() => window.dispatchEvent(new Event("blur")));
  await p.waitForTimeout(3600);
  const away = await mine(p);
  await p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await p.waitForTimeout(3600);
  const back = await mine(p);
  check("yi: away from the tab the YI call waits; back, it runs out as before", away === 1 && back === 3, { away, back });
  await done(p, "yi waits");

  // ---- a CPU about to move waits under the box, and moves once you keep playing
  p = await lib.open(ctx, base, "games/yi/");
  await p.evaluate(() => {
    const r = Math.random; Math.random = () => 0.3;   // CPU Ada starts
    document.getElementById("startBtn").click();
    Math.random = r;
    G.acted = true;
  });
  await p.keyboard.press("Escape"); await settle(p);
  await p.waitForTimeout(2500);
  const cpuHeld = await p.evaluate(() => ({ turn: G.currentPlayerIndex, ada: G.players[1].hand.length, discard: G.discard.length }));
  await p.keyboard.press("Escape");
  const moved = await p.waitForFunction(() => G.discard.length > 1 || G.players[1].hand.length !== 7, null, { timeout: 6000 }).then(() => true, () => false);
  check("yi: a CPU waits while 'Leave this game?' is up; after Keep playing it moves",
    cpuHeld.turn === 1 && cpuHeld.ada === 7 && cpuHeld.discard === 1 && moved, { cpuHeld, moved });
  await done(p, "yi cpu waits");

  // ---- Quit to menu mid-flight: no error, and nothing lands on the next deal
  p = await lib.open(ctx, base, "games/yi/");
  const fling = () => p.evaluate(() => { G.currentPlayerIndex = 1; G.busy = true; G.players[1].hand.push(mk("wild", "wild")); cpuTurn(); quitToMenu(); });
  await deal(p);
  await fling();
  await p.waitForTimeout(800);
  const quitErrs = p.errs.slice();
  await deal(p);
  await fling();
  await p.evaluate(() => document.getElementById("startBtn").click());
  await p.waitForTimeout(650);
  const fresh = await p.evaluate(() => ({ discard: G.discard.length, by: G.discardBy }));
  check("yi: Quit to menu while a card flies throws nothing, and that card never lands on the next deal",
    quitErrs.length === 0 && fresh.discard === 1 && fresh.by === -1, { quitErrs, fresh });

  // ---- the old name: the hand label and the card backs say YI
  const named = await p.evaluate(() => {
    G.players[0].hand = [G.players[0].hand[0]]; G.players[0].calledUno = true; render();
    return { label: document.getElementById("handLabel").textContent, back: getComputedStyle(document.querySelector("#deckStack .card.back"), "::after").content };
  });
  check("yi: with one card called the hand label says YI, and the card backs read YI", !/UNO/i.test(named.label) && /YI/.test(named.label) && named.back === '"YI"', named);
  await done(p, "yi quit / name");

  // ---- points game over: Menu goes back to setup
  p = await lib.open(ctx, base, "games/yi/");
  await p.click('#modeSeg button[data-m="points"]');
  await deal(p);
  const hasMenu = await p.evaluate(() => { totals[0] = 499; G.players[1].hand = [mk("red", "number", 5)]; endHand(0); return !!document.getElementById("menuBtn"); });
  if (hasMenu) { await p.click("#menuBtn"); await settle(p); }
  const setup = await p.evaluate(() => getComputedStyle(document.getElementById("setup")).display !== "none" && !document.getElementById("overlay").classList.contains("show"));
  check("yi: the points game's final result (500 reached) has a Menu button back to setup", hasMenu && setup, { hasMenu, setup });
  await done(p, "yi points menu");

  await ctx.close();
};
