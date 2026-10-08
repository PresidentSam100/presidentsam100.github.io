// Spacer: the game-over screen ignores the title's hidden pickers and goes
// back to the title on Backspace; held keys let go when the window does;
// the stage banners pause when the window is away; a held P / Esc / F acts
// once; the game starts with storage blocked; capsules and explosions move
// the same at 60 and 144 Hz; and the screen keeps its shape on narrow screens.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const st = (p) => p.evaluate(() => ({ mode: game.mode, stage: game.stage, startStage: game.startStage, menu: game.menuIndex, prev: game.prevMode, x: game.player && Math.round(game.player.x), input: Object.assign({}, game.input), fx: game.reducedFlash }));
  const blur = (p) => p.evaluate(() => window.dispatchEvent(new Event("blur")));
  const done = async (p, what) => { check("spacer " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  let p = await lib.open(ctx, base, "games/spacer/");
  await p.waitForFunction(() => window.game);

  // ---- game over: the arrows don't move the title's pickers behind it
  await p.evaluate(() => { game.startGame(); game.gameOver(); });
  for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowRight");
  await p.keyboard.press("ArrowDown");
  const g0 = await st(p);
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const g1 = await st(p);
  check("spacer: arrows on GAME OVER don't change the hidden start stage or life mode", g0.startStage === 1 && g0.menu === 0 && g1.stage === 1, { g0, g1 });

  // ---- Backspace on GAME OVER / CONGRATULATIONS goes to the title
  await p.evaluate(() => game.gameOver());
  await p.keyboard.press("Backspace"); await p.waitForTimeout(50);
  const b0 = (await st(p)).mode;
  await p.evaluate(() => { game.startGame(); game.gameComplete(); });
  await p.keyboard.press("Backspace"); await p.waitForTimeout(50);
  const b1 = (await st(p)).mode;
  check("spacer: Backspace on GAME OVER and on CONGRATULATIONS goes back to the title", b0 === "attract" && b1 === "attract" && p.leaves === 0, { b0, b1, leaves: p.leaves });

  // ---- a key held as the window goes away doesn't stay held
  await p.evaluate(() => { game.startGame(); game.mode = "playing"; });
  await p.keyboard.down("ArrowLeft"); await p.waitForTimeout(100);
  await blur(p); await p.waitForTimeout(50);
  const h0 = await st(p);
  await p.keyboard.press("p"); await p.waitForTimeout(50);   // back, and resume (the key is up by now, elsewhere)
  const x0 = (await st(p)).x;
  await p.waitForTimeout(400);
  const x1 = (await st(p)).x;
  await p.keyboard.up("ArrowLeft");
  check("spacer: a key held when the window loses focus lets go, so the ship doesn't drift on resume", h0.mode === "paused" && !h0.input.left && x1 === x0, { h0, x0, x1 });
  await p.keyboard.down("Space"); await p.waitForTimeout(50);
  await p.keyboard.press("p"); await p.waitForTimeout(50);
  const f0 = await st(p);
  await p.keyboard.up("Space"); await p.keyboard.press("p");
  await p.keyboard.down("ArrowRight"); await p.waitForTimeout(50);
  await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); delete document.hidden; });
  const v0 = await st(p);
  await p.keyboard.up("ArrowRight");
  check("spacer: pausing, or the tab going hidden, lets go of held keys", !f0.input.fire && f0.mode === "paused" && !v0.input.right, { f0: f0.input, v0: v0.input });

  // ---- the window going away on a stage banner pauses it
  await p.waitForTimeout(50);
  await p.evaluate(() => game.startGame());
  await blur(p); await p.waitForTimeout(50);
  const r0 = await st(p);
  await p.keyboard.press("p"); await p.waitForTimeout(50);
  const r1 = await st(p);
  check("spacer: the window going away on the READY banner pauses it; P goes back to the banner", r0.mode === "paused" && r0.prev === "ready" && r1.mode === "ready", { r0: r0.mode, prev: r0.prev, r1: r1.mode });

  // ---- a held P / Esc / F acts once
  await p.evaluate(() => { game.mode = "playing"; });
  const modes = [];
  for (const [key, repeat] of [["p", false], ["p", true], ["p", true], ["Escape", true], ["Escape", true]]) {
    await lib.fireKey(p, { key, repeat }); modes.push((await st(p)).mode);
  }
  await lib.fireKey(p, { key: "p" });
  const fx0 = (await st(p)).fx;
  for (const repeat of [false, true, true, true]) await lib.fireKey(p, { key: "f", repeat });
  const fx1 = (await st(p)).fx;
  await lib.fireKey(p, { key: "f" });
  check("spacer: holding P or Esc pauses once, holding F flips Visual FX once", modes.every((m) => m === "paused") && fx1 === !fx0, { modes, fx0, fx1 });

  // ---- capsules sway and explosions spread the same at any frame rate
  const rates = await p.evaluate(() => {
    const sway = (hz) => { const pu = new PowerUp(200, 0, "rapid"); let lo = 200, hi = 200; for (let i = 0; i < hz; i++) { pu.update(1 / hz); lo = Math.min(lo, pu.x); hi = Math.max(hi, pu.x); } return hi - lo; };
    const spread = (hz) => { const ex = new Explosion(0, 0); ex.parts = [{ x: 0, y: 0, vx: 100, vy: 0, c: "#fff", r: 2 }]; for (let i = 0; i < hz * 0.4; i++) ex.update(1 / hz); return ex.parts[0].x; };
    return { sway60: sway(60), sway144: sway(144), spread60: spread(60), spread144: spread(144) };
  });
  check("spacer: a capsule's sway and an explosion's spread are the same at 60 and 144 Hz",
    Math.abs(rates.sway60 - rates.sway144) < 1 && Math.abs(rates.spread60 - rates.spread144) < rates.spread60 * 0.05, rates);
  await done(p, "play");

  // ---- the game starts even where the page may not touch storage
  p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.addInitScript(() => { Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Access is denied for this document.", "SecurityError"); } }); });
  await p.goto(base + "games/spacer/", { waitUntil: "domcontentloaded" });
  const ok = await p.waitForFunction(() => window.game && window.game.mode === "attract", null, { timeout: 5000 }).then(() => true, () => false);
  let ran = false;
  if (ok) { await p.evaluate(() => { game.startGame(); game.addScore(500); game.gameOver(); }); ran = (await st(p)).mode === "gameover"; }
  check("spacer: with storage blocked the game still starts, scores and ends", ok && ran, { ok, ran });
  await done(p, "blocked storage");
  await ctx.close();

  // ---- the screen keeps its 448:576 shape and the cabinet fits the screen
  const { devices } = require("@playwright/test");
  for (const [label, opts, vw] of [
    ["360 px phone", { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }, 360],
    ["Pixel 7", devices["Pixel 7"], 412],
    ["narrow window", { viewport: { width: 500, height: 900 } }, 500],
  ]) {
    const c = await lib.newContext(browser, opts);
    p = await lib.open(c, base, "games/spacer/");
    const s = await p.evaluate(() => {
      const r = document.getElementById("screen").getBoundingClientRect(), cab = document.getElementById("cabinet").getBoundingClientRect();
      return { ratio: +(r.width / r.height).toFixed(3), cabL: Math.round(cab.left), cabR: Math.round(cab.right), docW: document.documentElement.scrollWidth };
    });
    check("spacer, " + label + ": the screen keeps its shape and the cabinet fits", Math.abs(s.ratio - 448 / 576) < 0.01 && s.cabL >= 0 && s.cabR <= vw && s.docW <= vw, s);
    await done(p, label);
    await c.close();
  }
};
