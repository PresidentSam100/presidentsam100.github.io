// Spacer: the game-over screen ignores the title's hidden pickers and goes
// back to the title on Backspace; held keys let go when the window does;
// the stage banners pause when the window is away; a held P / F acts
// once; the game starts with storage blocked; capsules and explosions move
// the same at 60 and 144 Hz; the screen keeps its shape on narrow screens;
// on a phone the touch buttons work the title's pickers; and the canvas
// hints say what a tap does on a phone, the keys on a desktop.
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

  // ---- a held P / F acts once (and a held Esc, the way out, doesn't touch the pause)
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
  check("spacer: holding P pauses once (a held Esc leaves it paused), holding F flips Visual FX once", modes.every((m) => m === "paused") && fx1 === !fx0, { modes, fx0, fx1 });

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

  // ---- on a phone the title's pickers are the touch buttons; a tap on the screen starts
  let c = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(c, base, "games/spacer/");
  for (const id of ["#t-right", "#t-right", "#t-right", "#t-left", "#t-fire"]) await p.tap(id);
  const t0 = await st(p);
  const touch = (type) => p.evaluate((type) => document.getElementById("t-right").dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true })), type);
  await touch("touchstart"); await p.waitForTimeout(700); await touch("touchend");
  const t1 = await st(p);
  await p.tap("#screen"); await p.waitForTimeout(100);
  const t2 = Object.assign(await st(p), { lives: await p.evaluate(() => game.lives) });
  await p.evaluate(() => { game.mode = "playing"; });
  await p.tap("#t-left"); await p.tap("#t-fire");
  const t3 = await st(p);
  check("spacer, phone: on the title ◀ ▶ pick the start stage (held, they run on) and ● the life mode; a tap on the screen starts; in play they don't",
    t0.startStage === 3 && t0.menu === 1 && t1.startStage >= 6 && t2.mode === "ready" && t2.stage === t1.startStage && t2.lives === 1 && t3.startStage === t1.startStage && t3.menu === 1,
    { t0: [t0.startStage, t0.menu], t1: t1.startStage, t2: [t2.mode, t2.stage, t2.lives], t3: [t3.startStage, t3.menu] });

  // ---- ...and the end screens get back to them: ● goes to the title (as
  // Backspace does), once the screen has been up a moment; a tap plays again
  const end = [];
  for (const finish of ["gameOver", "gameComplete"]) {
    await p.evaluate((f) => { game.startGame(); game[f](); }, finish);
    await p.tap("#t-fire"); const reflex = (await st(p)).mode;   // a fire tap still going as the run ends
    await p.waitForTimeout(1000);
    await p.tap("#t-fire"); end.push([reflex, (await st(p)).mode]);
  }
  await p.evaluate(() => { game.startGame(); game.gameOver(); });
  await p.tap("#screen"); await p.waitForTimeout(100);
  const again = (await st(p)).mode;
  check("spacer, phone: on GAME OVER and CONGRATULATIONS ● goes back to the title (not a reflex tap as the run ends); a tap on the screen plays again",
    end[0][0] === "gameover" && end[0][1] === "attract" && end[1][0] === "complete" && end[1][1] === "attract" && again === "ready", { end, again });
  await done(p, "touch pickers");
  await c.close();

  // ---- the canvas hints: what a tap does on a phone, the keys on a desktop
  // (every string one frame draws, with Visual FX off so nothing is mid-blink;
  // a keycap's label is drawn on its own, so a lone "ENTER" is a keycap)
  const frameText = (p) => p.evaluate(() => new Promise((ok) => {
    const ctx = document.getElementById("screen").getContext("2d"), seen = [], orig = ctx.fillText;
    ctx.fillText = function (s) { seen.push(String(s)); return orig.apply(this, arguments); };
    requestAnimationFrame(() => requestAnimationFrame(() => { delete ctx.fillText; ok(seen); }));
  }));
  const screens = async (p) => {
    const out = { title: await frameText(p) };
    await p.evaluate(() => { game.startGame(); game.mode = "playing"; game.togglePause(); }); out.pause = await frameText(p);
    await p.evaluate(() => game.gameOver()); out.over = await frameText(p);
    await p.evaluate(() => { game.startGame(); game.gameComplete(); }); out.done = await frameText(p);
    return out;
  };
  const CAPS = ["ENTER", "ESC", "⌫", "E", "V", "P", "▲", "▼"];
  const fxOff = (pg) => pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:spacer", "1"); } catch (e) {} });
  const has = (list, text) => list.some((s) => s.includes(text));
  c = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(c, base, "games/spacer/", { before: fxOff });
  const ph = await screens(p);
  const phCaps = Object.values(ph).flat().filter((s) => CAPS.includes(s));
  check("spacer, phone: the canvas hints say what a tap does (title, pause, end screens) and name no keys",
    phCaps.length === 0 && has(ph.title, "TAP TO START") && has(ph.title, "VISUAL FX: OFF") && has(ph.pause, "TAP AN ITEM") &&
      ["over", "done"].every((s) => has(ph[s], "TAP TO PLAY AGAIN") && has(ph[s], "● TITLE")),
    { phCaps, title: ph.title.filter((s) => /TAP|FX|◀ ▶/.test(s)), pause: ph.pause.filter((s) => /RESUME/.test(s)), over: ph.over.filter((s) => /TAP|TITLE/.test(s)) });
  await done(p, "phone hints");
  await c.close();
  c = await lib.newContext(browser);
  p = await lib.open(c, base, "games/spacer/", { before: fxOff });
  const dk = await screens(p);
  check("spacer, desktop: the canvas hints still name the keys",
    ["ENTER", "E", "V"].every((k) => dk.title.includes(k)) && dk.pause.includes("P") && !dk.pause.includes("ESC") && ["ENTER", "⌫", "ESC"].every((k) => dk.over.includes(k) && dk.done.includes(k)) && !has(Object.values(dk).flat(), "TAP"),
    { title: dk.title.filter((s) => CAPS.includes(s)), pause: dk.pause.filter((s) => CAPS.includes(s)) });

  // ---- Infinite goes on past stage 255: patterns wrap, difficulty stays capped, the HUD counts on
  const run = (menu) => p.evaluate((menu) => {
    game.menuIndex = menu; game.startStage = 255; game.startGame(); game.nextStage();
    return { mode: game.mode, stage: game.stage };
  }, menu);
  const inf = await run(2);
  const hud = await frameText(p);
  const prof = await p.evaluate(() => {
    const j = (s) => { const o = stageProfile(s); delete o.stage; return JSON.stringify(o); };   // (all but its number)
    return { wraps: j(256) === j(511) && j(257) === j(512), capped: stageProfile(256).diveSpeedMul === stageProfile(255).diveSpeedMul && stageProfile(999).maxDivers === stageProfile(255).maxDivers };
  });
  check("spacer: in Infinite, clearing stage 255 goes on to stage 256 (patterns wrap, difficulty capped), and the HUD and READY banner say so",
    inf.mode === "ready" && inf.stage === 256 && prof.wraps && prof.capped && hud.includes("256") && has(hud, "STAGE 256") && has(hud, "PAST STAGE 255"),
    { inf, prof, hud: hud.filter((s) => /256|255/.test(s)) });
  const three = await run(0);
  check("spacer (guard): with 3 lives, clearing stage 255 still ends the game", three.mode === "complete", three);
  await done(p, "infinite");
  await c.close();

  // ---- the cabinet's marquee carries the game's own name
  c = await lib.newContext(browser);
  p = await lib.open(c, base, "games/spacer/");
  const marquee = await p.textContent("#marquee");
  check("spacer: the cabinet marquee reads S P A C E R", marquee.trim() === "S P A C E R", marquee);
  await done(p, "marquee");
  await c.close();

  // ---- on a phone the pause menu's items are tapped
  c = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(c, base, "games/spacer/");
  // the client point of a pause-menu row (rows sit at 576/2 - 28 + i * 30 on the 448 x 576 screen)
  const row = (i) => p.evaluate((i) => {
    const cv = document.getElementById("screen"), r = cv.getBoundingClientRect();
    return { x: r.left + cv.clientLeft + (448 / 2) * cv.clientWidth / 448, y: r.top + cv.clientTop + (576 / 2 - 28 + i * 30) * cv.clientHeight / 576 };
  }, i);
  const tapRow = async (i) => { const pt = await row(i); await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(100); };
  const pauseNow = () => p.evaluate(() => { game.mode = "playing"; if (!game.score) game.addScore(300); game.togglePause(); });
  const dlg = () => p.evaluate(() => { const d = document.querySelector(".gs-dialog"); return d ? d.querySelector("h2").textContent : null; });
  const answer = async (label) => { if (await dlg()) { await p.tap('.gs-dialog button:has-text("' + label + '")'); await p.waitForTimeout(150); } };
  await p.evaluate(() => game.startGame()); await pauseNow();
  const fxA = (await st(p)).fx;
  await tapRow(2); const fxB = (await st(p)).fx;
  await tapRow(2);
  await tapRow(0); const resumed = (await st(p)).mode;
  await pauseNow(); await tapRow(1); const askR = await dlg(); await answer("Start over");
  const restarted = await p.evaluate(() => ({ mode: game.mode, score: game.score }));
  await pauseNow(); await tapRow(3); const askQ = await dlg(); await answer("Quit");
  const quit = (await st(p)).mode;
  check("spacer, phone: the pause menu's items are tapped: VISUAL FX flips, RESUME plays on, RESTART and QUIT TO TITLE ask, then start over / go to the title",
    fxB === !fxA && resumed === "playing" && askR === "Start over?" && restarted.mode === "ready" && restarted.score === 0 && askQ === "Quit this game?" && quit === "attract",
    { fxA, fxB, resumed, askR, restarted, askQ, quit });
  await done(p, "pause taps");
  await c.close();

  // ---- RESTART / QUIT TO TITLE ask first; Esc on the box is back on the pause menu, still paused
  c = await lib.newContext(browser);
  p = await lib.open(c, base, "games/spacer/");
  const menuAt = async (i) => {
    await p.evaluate(() => { game.startGame(); game.addScore(100); game.mode = "playing"; game.togglePause(); });
    for (let k = 0; k < i; k++) await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  };
  const look = () => p.evaluate(() => { const d = document.querySelector(".gs-dialog"); return { dlg: d ? d.querySelector("h2").textContent : null, mode: game.mode, item: game.pauseIndex, score: game.score }; });
  const asks = {};
  for (const [i, name] of [[1, "restart"], [3, "quit"]]) {
    await menuAt(i);
    const a = await look();
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    const b = await look();
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    await p.keyboard.press("Enter"); await p.waitForTimeout(250);
    asks[name] = { a, b, c: await look() };
  }
  const r = asks.restart, qq = asks.quit;
  check("spacer: RESTART asks \"Start over?\" and QUIT TO TITLE \"Quit this game?\"; Esc keeps the pause menu up, still paused; Enter then does it",
    r.a.dlg === "Start over?" && r.a.mode === "paused" && !r.b.dlg && r.b.mode === "paused" && r.b.item === 1 && r.c.mode === "ready" && r.c.score === 0 &&
    qq.a.dlg === "Quit this game?" && !qq.b.dlg && qq.b.mode === "paused" && qq.b.item === 3 && qq.c.mode === "attract" && p.leaves === 0, { asks, leaves: p.leaves });

  // ---- (guard) with nothing scored there's nothing to lose: RESTART goes at once
  await p.evaluate(() => { game.startGame(); game.mode = "playing"; game.togglePause(); });
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const fresh = await look();
  check("spacer (guard): RESTART with nothing scored starts over at once", !fresh.dlg && fresh.mode === "ready", fresh);

  // ---- the stage badges never run under the power-up bars (stage 249 has eleven)
  const rowAt = (stage) => p.evaluate((stage) => new Promise((ok) => {
    game.startStage = stage; game.startGame(); game.mode = "playing"; game.player.powers.rapid = 12;
    const ctx = document.getElementById("screen").getContext("2d"), flags = Object.values(Sprites.flags), seen = { flags: [], bars: [], text: [] };
    const di = ctx.drawImage, fr = ctx.fillRect, ft = ctx.fillText;
    ctx.drawImage = function (img, x) { if (flags.includes(img)) seen.flags.push(x); return di.apply(this, arguments); };
    ctx.fillRect = function (x, y, w) { if (this.fillStyle === "#22304a") seen.bars.push(x + w); return fr.apply(this, arguments); };
    ctx.fillText = function (s) { seen.text.push(String(s)); return ft.apply(this, arguments); };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      delete ctx.drawImage; delete ctx.fillRect; delete ctx.fillText;
      ok({ left: Math.min(...seen.flags), barsRight: Math.max(...seen.bars), number: seen.text.includes(String(stage)) });
    }));
  }), stage);
  const s249 = await rowAt(249), s37 = await rowAt(37);
  check("spacer: the stage badges stay clear of the power-up bars (stage 249 shows its number by one flag)",
    s249.left >= s249.barsRight && s249.number && s37.left >= s37.barsRight && !s37.number, { s249, s37 });
  await done(p, "asks / badges");
  await c.close();
};
