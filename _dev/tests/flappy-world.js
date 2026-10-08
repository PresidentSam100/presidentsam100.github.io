// Flappy World: it plays with storage blocked or full; the game-over card keeps
// blinking and its crash burst plays out, and a restart waits a beat; Boos give
// up the chase instead of piling up on the bird; no pipe asks for a faster climb
// than flapping flat out can make; the mouse flaps on press and a tap flaps once;
// with Visual FX off the menu bird and the Boos hold still.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (opts) => lib.open(ctx, base, "games/flappy-world/", opts);
  const done = async (p, what) => { check("flappy-world " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const fxOff = (off) => ({ before: (pg) => pg.addInitScript((off) => localStorage.setItem("reduceMotion:flappy-world", off ? "1" : "0"), off) });
  // count flaps from here on
  const countFlaps = (p) => p.evaluate(() => { window.__flaps = 0; const f = game.bird.flap.bind(game.bird); game.bird.flap = () => { window.__flaps++; f(); }; });

  // ---- storage blocked outright: the game still starts and flies
  let p = await open({ before: (pg) => pg.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
  }) });
  const s0 = await p.evaluate(() => { try { return game.gameState; } catch (e) { return e.message; } });
  await p.keyboard.press("Space"); await p.waitForTimeout(100);
  const s1 = await p.evaluate(() => { try { return game.gameState; } catch (e) { return e.message; } });
  check("flappy-world: with storage blocked the game still starts and plays", s0 === "MENU" && s1 === "PLAYING", { s0, s1 });
  await done(p, "storage blocked");

  // ---- storage that refuses writes: passing the best doesn't stop the game
  p = await open();
  await p.keyboard.press("Space"); await p.waitForTimeout(100);
  await p.evaluate(() => {
    Storage.prototype.setItem = function () { throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); };
    game.invincibleTime = 1e9; game.score = 1;   // past the best (0) on the next frame
  });
  await p.waitForTimeout(100);
  const t0 = await p.evaluate(() => game.lastTs);
  await p.waitForTimeout(300);
  const t1 = await p.evaluate(() => game.lastTs);
  check("flappy-world: when storage refuses to save a new best the game keeps running", t1 > t0, { t0, t1 });
  await done(p, "storage full");

  // ---- the game-over card: the prompt blinks on and the burst falls, over a still bird;
  // a press the instant you crash doesn't restart, one a moment later does
  p = await open();
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  await p.evaluate(() => game.die());
  const o0 = await p.evaluate(() => ({ bt: game.blinkTimer, px: game.particles.particles[0].y, y: game.bird.y }));
  await p.keyboard.press("Space");
  const early = await p.evaluate(() => game.gameState);
  await p.waitForTimeout(600);
  const o1 = await p.evaluate(() => ({ bt: game.blinkTimer, px: game.particles.particles.length ? game.particles.particles[0].y : null, y: game.bird.y }));
  check("flappy-world: on the game-over card the prompt keeps blinking and the crash burst plays out; the bird stays where it fell",
    o1.bt > o0.bt + 0.3 && o1.px !== o0.px && o1.y === o0.y, { o0, o1 });
  await p.keyboard.press("Space");
  const later = await p.evaluate(() => game.gameState);
  check("flappy-world: a press right as you crash doesn't restart; one a moment later does", early === "GAMEOVER" && later === "PLAYING", { early, later });
  await done(p, "game over");

  // ---- Boos: two minutes of flight from score 30, the bird held in one spot
  p = await open();
  await p.keyboard.press("Space"); await p.waitForTimeout(100);
  const boos = await p.evaluate(() => {
    game.score = 30;
    let most = 0;
    for (let i = 0; i < 20 * 120; i++) {
      game.invincibleTime = 1e9; game.bird.y = 400; game.bird.vy = 0; game.gameState = "PLAYING";
      game.update(0.05);
      most = Math.max(most, game.enemyManager.boos.length);
    }
    return { most, now: game.enemyManager.boos.length };
  });
  check("flappy-world: Boos give up the chase and drift off instead of piling up on the bird", boos.most <= 2, boos);
  await done(p, "boos");

  // ---- pipes at score 60 after a gap as low as they go: a bird flapping every
  // frame from the top of that gap reaches the next one
  p = await open();
  await p.keyboard.press("Space"); await p.waitForTimeout(100);
  const climbs = await p.evaluate(() => {
    const g = game, pm = g.pipeManager;
    g.score = 60; g.scrollSpeed = 350;
    let n = 0, bad = 0, worst = null;
    for (let i = 0; i < 400; i++) {
      const prev = new BasePipe(CANVAS_W + 10 - 245, 624, PIPE_GAP);   // 0.7s of spawn timer at 350 px/s
      pm.pipes = [prev];
      pm.spawnPipe();
      const np = pm.pipes[1];
      if (np.gapY === undefined) continue;   // the double-gap pipe: its low gap is always in reach
      n++;
      const T = (np.x - prev.x - (PIPE_W + 28)) / g.scrollSpeed;   // between leaving one pipe and entering the next
      const b = new Bird(120, prev.gapY - PIPE_GAP / 2 + 10);
      for (let t = 0; t < T; t += 1 / 60) { b.flap(); b.update(1 / 60); }
      if (b.y > np.gapY + PIPE_GAP / 2 - 10) { bad++; worst = Math.round(np.gapY); }
    }
    pm.pipes = [];
    return { n, bad, worst };
  });
  check("flappy-world: no pipe asks for a climb from the last gap that flapping flat out can't make", climbs.n > 300 && climbs.bad === 0, climbs);
  await done(p, "climbs");

  // ---- the mouse flaps on press, not on release
  p = await open();
  await p.keyboard.press("Space"); await p.waitForTimeout(100);
  await p.evaluate(() => { game.invincibleTime = 1e9; });
  await countFlaps(p);
  const c = await p.evaluate(() => { const r = game.canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.8 }; });
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(80);
  const onPress = await p.evaluate(() => window.__flaps);
  await p.mouse.up(); await p.waitForTimeout(80);
  const onRelease = await p.evaluate(() => window.__flaps);
  check("flappy-world: a mouse press flaps at once, and its release doesn't flap again", onPress === 1 && onRelease === 1, { onPress, onRelease });
  await done(p, "mouse");

  // ---- a tap flaps once (not once for the touch and again for its click)
  const tctx = await lib.newContext(browser, { hasTouch: true });
  p = await lib.open(tctx, base, "games/flappy-world/");
  await p.keyboard.press("Space"); await p.waitForTimeout(100);
  await p.evaluate(() => { game.invincibleTime = 1e9; });
  await countFlaps(p);
  const tc = await p.evaluate(() => { const r = game.canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.8 }; });
  await p.touchscreen.tap(tc.x, tc.y); await p.waitForTimeout(150);
  const taps = await p.evaluate(() => window.__flaps);
  check("flappy-world: a tap flaps exactly once", taps === 1, taps);
  await done(p, "tap");
  await tctx.close();

  // ---- Visual FX off: the bird on the menu and a Boo hold still (FX on, they move)
  const still = {};
  for (const off of [true, false]) {
    p = await open(fxOff(off));
    const y0 = await p.evaluate(() => game.bird.y);
    await p.waitForTimeout(250);
    const y1 = await p.evaluate(() => game.bird.y);
    const sc = await p.evaluate(() => { const b = new Boo(300, 300); b.update(0.1, 120, 400); const a = b.scale; b.update(0.4, 120, 400); return [a, b.scale]; });
    still[off ? "off" : "on"] = { bird: y0 === y1, boo: sc[0] === 1 && sc[1] === 1 };
    await done(p, "fx " + (off ? "off" : "on"));
  }
  check("flappy-world: with Visual FX off the menu bird and the Boos hold still; with it on they bob and pulse",
    still.off.bird && still.off.boo && !still.on.bird && !still.on.boo, still);

  await ctx.close();
};
