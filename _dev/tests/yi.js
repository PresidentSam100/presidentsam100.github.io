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

  // ---- the pause card's Menu (where the bar's Quit to menu went) asks mid-hand,
  // with the table waiting under the box
  p = await lib.open(ctx, base, "games/yi/");
  const adaStarts = () => p.evaluate(() => {
    const r = Math.random; Math.random = () => 0.3;   // CPU Ada starts
    document.getElementById("startBtn").click();
    Math.random = r;
  });
  // (⏸ if the card isn't up yet, then its Menu)
  const quitBtn = () => p.evaluate(() => {
    const c = document.querySelector(".gs-pause:not(.gs-dialog)");
    if (!c || c.hidden) document.querySelector(".gs-pause-btn").click();
    document.querySelector('.gs-pause [data-gs-act="menu"]').click();
  });
  const resume = () => p.evaluate(() => { const c = document.querySelector(".gs-pause:not(.gs-dialog)"); if (c && !c.hidden) c.querySelector("button").click(); });
  const onSetup = () => p.evaluate(() => getComputedStyle(document.getElementById("setup")).display !== "none");
  const adaMoved = () => p.waitForFunction(() => G && (G.discard.length > 1 || G.players[1].hand.length !== 7), null, { timeout: 6000 }).then(() => true, () => false);
  await adaStarts();
  await p.evaluate(() => { G.acted = true; });
  await quitBtn(); await settle(p);
  const box = await p.evaluate(() => { const d = document.querySelector(".gs-dialog"); return d && { title: d.querySelector("h2").textContent, ok: [...d.querySelectorAll("button")].map((b) => b.textContent).join("|") }; });
  await p.waitForTimeout(2000);
  const waited = await p.evaluate(() => G && { ada: G.players[1].hand.length, discard: G.discard.length });
  await p.keyboard.press("Escape"); await settle(p);
  const kept = { dlg: await dlg(p), setup: await onSetup(), card: await p.evaluate(() => !document.querySelector(".gs-pause:not(.gs-dialog)").hidden) };
  await resume();
  const goesOn = await adaMoved();
  await quitBtn(); await settle(p);
  await p.keyboard.press("Enter"); await settle(p);
  const quit = { setup: await onSetup(), g: await p.evaluate(() => G === null) };
  await adaStarts();
  const next = await adaMoved();   // nothing left holding the table after the box said Quit
  check("yi: mid-hand, the pause card's Menu asks 'Quit this game?' with the table waiting; Esc keeps the game (back on the card, and Resume plays on), Enter quits, and the next deal plays on",
    !!box && box.title === "Quit this game?" && /Quit/.test(box.ok) && !!waited && waited.ada === 7 && waited.discard === 1 &&
      !kept.dlg && !kept.setup && kept.card && goesOn && quit.setup && quit.g && next,
    { box, waited, kept, goesOn, quit, next });

  // ...but with nothing played yet it goes at once, and so does a finished hand's Menu (guards)
  await quitBtn(); await settle(p);
  await p.keyboard.press("Enter"); await settle(p);   // (Ada has moved: that one asks)
  await p.evaluate(() => document.getElementById("startBtn").click());
  await quitBtn();
  await settle(p);
  const idle = { dlg: await dlg(p), setup: await onSetup() };
  await deal(p);
  await p.evaluate(() => { G.acted = true; G.players[1].hand = [mk("red", "number", 5)]; endHand(0); });
  await p.click("#menuBtn"); await settle(p);
  const between = { dlg: await dlg(p), setup: await onSetup() };
  check("yi: the card's Menu before anyone has moved, and Menu on a finished hand, go straight to setup",
    !idle.dlg && idle.setup && !between.dlg && between.setup, { idle, between });
  await done(p, "yi quit asks");

  // ---- Backspace on a result screen goes to the menu, like its Menu button; Esc there still leaves
  p = await lib.open(ctx, base, "games/yi/");
  const screenNow = () => p.evaluate(() => ({ setup: getComputedStyle(document.getElementById("setup")).display !== "none", result: document.getElementById("overlay").classList.contains("show") && !!document.getElementById("menuBtn"), g: !!G }));
  const endWith = (points, total) => p.evaluate(([points, total]) => {
    document.querySelector('#modeSeg button[data-m="' + (points ? "points" : "single") + '"]').click();
    document.getElementById("startBtn").click();
    G.acted = true; totals[0] = total; G.players[1].hand = [mk("red", "number", 5)];
    endHand(0);
  }, [points, total]);
  const backs = {};
  for (const [name, points, total] of [["hand", false, 0], ["game over", true, 499]]) {
    await endWith(points, total); await settle(p);
    const at = await screenNow();
    await p.keyboard.press("Backspace"); await settle(p);
    backs[name] = { at, after: await screenNow(), dlg: await dlg(p) };
  }
  check("yi: Backspace on a finished game's result (a hand's end, the points game's end) goes to the menu, no box",
    Object.values(backs).every((b) => b.at.result && !b.at.setup && b.after.setup && !b.after.result && !b.after.g && !b.dlg), backs);

  // between hands of a points game the totals live only in memory: Menu and Backspace ask first
  await endWith(true, 100); await settle(p);
  await p.click("#menuBtn"); await settle(p);
  const viaMenu = await dlg(p);
  await p.keyboard.press("Escape"); await settle(p);
  const stayed = { s: await screenNow(), dlg: await dlg(p) };
  await p.keyboard.press("Backspace"); await settle(p);
  const viaBack = await dlg(p);
  await p.keyboard.press("Enter"); await settle(p);
  const quitTo = await screenNow();
  check("yi: between hands in a points game, Menu and Backspace ask 'Quit this game?'; Keep playing stays on the result, Quit goes to setup",
    viaMenu === "Quit this game?" && !stayed.dlg && stayed.s.result && !stayed.s.setup && viaBack === "Quit this game?" && quitTo.setup && !quitTo.g,
    { viaMenu, stayed, viaBack, quitTo });

  // mid-hand the way to the menu is the pause card's: the bar has no Quit to
  // menu any more. P brings the card up, as in every game (Pass is S), with
  // Resume, Restart and Menu, and Backspace there is Menu (at a fresh deal
  // there's nothing to lose, so it goes at once). Esc on a result screen still
  // leaves (guards)
  await p.evaluate(() => { hideOverlay(); document.getElementById("startBtn").click(); });
  await settle(p);
  const bar = await p.evaluate(() => ({ quit: !!document.getElementById("newHandBtn") || /quit/i.test(document.getElementById("controls").textContent), cap: document.querySelector(".gs-pause-btn").textContent }));
  await p.keyboard.press("Backspace"); await settle(p);
  const bare = await screenNow();            // (not paused: Backspace is nobody's key)
  await p.keyboard.press("p"); await settle(p);
  const cardBtns = await p.evaluate(() => { const c = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!c && !c.hidden && [...c.querySelectorAll("button")].map((b) => b.textContent.replace(/\s+/g, " ").trim()).join(" | "); });
  const hand0 = await p.evaluate(() => G.players[0].hand.length);
  await p.keyboard.press("d"); await settle(p);
  const hand1 = await p.evaluate(() => G.players[0].hand.length);   // (D draws nothing under the card)
  await p.keyboard.press("Backspace"); await settle(p);
  const mid = await screenNow();
  await p.evaluate(() => document.getElementById("startBtn").click());
  await endWith(false, 0); await settle(p);
  await p.keyboard.press("Escape"); await settle(p);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  check("yi: the bar has no Quit to menu; P brings up the pause card (Resume, Restart R, Menu ⌫), the table's keys held under it, and Backspace there goes to setup (a fresh deal: at once); Esc on a hand's result still leaves",
    !bar.quit && /Pause P$/.test(bar.cap) && !bare.setup && bare.g && /Resume \| .*Restart R \| .*Menu ⌫$/.test(cardBtns || "") && hand1 === hand0 && mid.setup && !mid.g && !mid.result && p.leaves === 1,
    { bar, bare, cardBtns, hand0, hand1, mid, leaves: p.leaves });
  await done(p, "yi backspace");

  // ---- a CPU that has to draw, and can play what it drew: the draw shows for
  // a beat before the card goes down, with Visual FX off as with it on (with
  // FX off it used to draw and play in the same instant). Timed in the page.
  {
    const beats = {};
    for (const off of [false, true]) {
      const q = await lib.open(ctx, base, "games/yi/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:yi", off ? "1" : "0"); } catch (e) {} }, off) });
      await deal(q);
      await q.waitForFunction(() => G && !G.over && G.currentPlayerIndex === 0 && !G.busy, null, { timeout: 20000 });
      beats[off ? "off" : "on"] = await q.evaluate(() => new Promise((res) => {
        const who = neighbor(0, 1), top = topCard(), col = G.currentColor, all = G.deck.concat(G.players[who].hand);
        const cant = all.filter((c) => c.type === "number" && c.color !== col && !(top.type === "number" && c.value === top.value)).slice(0, 3);
        const can = all.find((c) => c.type === "number" && c.color === col);
        if (cant.length < 3 || !can) return res({ ms: -2 });
        G.players[who].hand = cant;
        G.deck = all.filter((c) => cant.indexOf(c) < 0 && c !== can).concat([can]);      // (the next card off the pile)
        const t = {}, draw0 = drawCards, play0 = playCard;
        window.drawCards = function (pi) { if (pi === who && !t.draw) t.draw = performance.now(); return draw0.apply(this, arguments); };
        window.playCard = function (pi) {
          if (pi === who && t.draw && !t.play) { t.play = performance.now(); res({ ms: Math.round(t.play - t.draw), hand: G.players[who].hand.length }); }
          return play0.apply(this, arguments);
        };
        setTimeout(() => res({ ms: -1 }), 12000);
        passTurn(0);
      }));
      await done(q, "yi a CPU's draw, FX " + (off ? "off" : "on"));
    }
    check("yi: a CPU that draws a card it can play shows the draw for a beat before playing it, with Visual FX off as with it on (at least 0.35 s)",
      beats.on.ms >= 350 && beats.off.ms >= 350 && beats.off.hand === 4, beats);
  }

  // ---- the logo: its letters are slanted by the browser, which leaned their
  // ink some 4px right of the oval's middle. Measured here as the game does,
  // from the ink the font draws (so it holds in any font), with what the game
  // moved the letters by: the ink sits on the oval's middle both ways.
  // And the log: a card is named on its own colour, and so is the colour a
  // wild was played for.
  {
    const q = await lib.open(ctx, base, "games/yi/");
    const ink = await q.evaluate(() => {
      const el = document.querySelector(".uno-logo"), ink = document.getElementById("logoInk"), cs = getComputedStyle(el), c = document.createElement("canvas").getContext("2d");
      c.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      try { c.letterSpacing = cs.letterSpacing; } catch (e) {}
      const m = c.measureText(ink.textContent), f = c.measureText("Hg"), pl = parseFloat(cs.paddingLeft), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
      const base = pt + (el.clientHeight - pt - pb - (f.fontBoundingBoxAscent + f.fontBoundingBoxDescent)) / 2 + f.fontBoundingBoxAscent;
      const raw = { x: pl + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - el.clientWidth / 2, y: base + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2 - el.clientHeight / 2 };
      const moved = { x: parseFloat(ink.style.left) || 0, y: parseFloat(ink.style.top) || 0 };
      return { lean: +raw.x.toFixed(2), dx: +(raw.x + moved.x).toFixed(2), dy: +(raw.y + moved.y).toFixed(2) };
    });
    check("yi: the logo's letters sit on the middle of its oval, by their ink (the slant leans them right)", Math.abs(ink.lean) > 1 && Math.abs(ink.dx) <= 0.5 && Math.abs(ink.dy) <= 0.5, ink);
    const chips = await q.evaluate(() => {
      log([" played ", { card: { type: "draw2", color: "blue" } }]);
      log([" played ", { card: { type: "number", color: "green", value: 7 } }]);
      log([" played ", { card: { type: "wild4", color: "wild" } }, " → ", { color: "red" }]);
      const bg = (v) => { const d = document.createElement("div"); d.style.background = "var(--" + v + ")"; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
      return [...document.querySelectorAll("#log .log-card")].slice(-4).map((c) => ({ text: c.textContent, shown: getComputedStyle(c).textTransform === "capitalize" ? c.textContent.replace(/^./, (x) => x.toUpperCase()) : c.textContent,
        own: ["red", "yellow", "green", "blue"].filter((v) => getComputedStyle(c).backgroundColor === bg(v)).join(), wild: c.classList.contains("wild") }));
    });
    check("yi: the log names a card on its own colour (Blue Draw 2 on blue, Green 7 on green), a wild on its own chip, and the colour it was played for on that colour",
      chips.length === 4 && chips[0].shown === "Blue Draw 2" && chips[0].own === "blue" && chips[1].shown === "Green 7" && chips[1].own === "green" &&
      chips[2].text === "Wild Draw Four" && chips[2].wild && chips[2].own === "" && chips[3].shown === "Red" && chips[3].own === "red", chips);
    await done(q, "yi logo and log");
  }

  // ---- Pass is S (skip the rest of the turn), and P is the pause, as in
  // every game: with Pass on the bar, P brings up the card and passes nothing,
  // and S passes, its keycap on the button
  {
    const q = await lib.open(ctx, base, "games/yi/");
    await deal(q);
    await q.waitForFunction(() => G && !G.over && G.currentPlayerIndex === 0 && !G.busy, null, { timeout: 20000 });
    await q.evaluate(() => { G.drawnIndex = 0; renderControls(); });
    await settle(q);
    const shown = await q.evaluate(() => { const b = document.getElementById("passBtn"); return b && b.getAttribute("data-gs-key"); });
    await q.keyboard.press("p"); await settle(q);
    const paused = await q.evaluate(() => ({ card: !!document.querySelector(".gs-pause:not(.gs-dialog):not([hidden])"), turn: G.currentPlayerIndex, pass: !!document.getElementById("passBtn") }));
    await q.keyboard.press("p"); await settle(q);
    const back = await q.evaluate(() => ({ card: !!document.querySelector(".gs-pause:not(.gs-dialog):not([hidden])"), pass: !!document.getElementById("passBtn") }));
    await q.keyboard.press("s");
    const passed = await q.waitForFunction(() => G.currentPlayerIndex !== 0 || G.drawnIndex < 0, null, { timeout: 5000 }).then(() => true, () => false);
    check("yi: Pass wears S and S passes; P on the table pauses (the card up, nothing passed) and P again resumes",
      shown === "S" && paused.card && paused.turn === 0 && paused.pass && !back.card && back.pass && passed, { shown, paused, back, passed });
    await done(q, "yi pass and pause keys");
  }

  await ctx.close();
};
