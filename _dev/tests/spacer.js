// Spacer: the game-over screen ignores the title's hidden pickers and goes
// back to the title on Backspace; held keys let go when the window does;
// the stage banners pause when the window is away; a held P / F acts
// once; the game starts with storage blocked; capsules and explosions move
// the same at 60 and 144 Hz; the screen keeps its shape on narrow screens;
// on a phone the touch buttons work the title's pickers; S on the title
// lists all 255 stages to pick the start from (a click or a tap on the
// start stage too); and the canvas
// hints say what a tap does on a phone, the keys on a desktop; and the title
// names no Visual FX switch nor the bar under the screen a pause (the corner
// buttons are both); on a 2x screen it is drawn at the screen's resolution;
// the game's clock never steps back, even when a frame's timestamp comes
// before the moment the clock started from.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const st = (p) => p.evaluate(() => ({ mode: game.mode, stage: game.stage, startStage: game.startStage, menu: game.menuIndex, prev: game.prevMode, x: game.player && Math.round(game.player.x), input: Object.assign({}, game.input), fx: game.reducedFlash }));
  const blur = (p) => p.evaluate(() => window.dispatchEvent(new Event("blur")));
  const done = async (p, what) => { check("spacer " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  let p = await lib.open(ctx, base, "games/spacer/");
  await p.waitForFunction(() => window.game);
  // (as on a slow load: the clock's start a fifth of a second after the next frame's timestamp)
  const clock = await p.evaluate(() => new Promise((r) => {
    const t0 = game.time; game.last = performance.now() + 200;
    requestAnimationFrame(() => requestAnimationFrame(() => r({ t0, t1: game.time })));
  }));
  check("spacer: a frame stamped before the clock's start doesn't run the clock backwards (a sprite's frame would be missing)", clock.t1 >= clock.t0, clock);

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
  // (both by the game's own clock, which a busy machine can run slower or in
  // bigger steps than the wall's: the reflex tap lands in the same moment the
  // run ends, and the next waits until the screen has been up its 0.8 s)
  for (const finish of ["gameOver", "gameComplete"]) {
    const reflex = await p.evaluate((f) => {
      game.startGame(); game[f]();
      const b = document.getElementById("t-fire");   // a fire tap still going as the run ends
      b.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true }));
      b.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true }));
      return game.mode;
    }, finish);
    await p.waitForFunction(() => game.time - game.endedAt > 0.85, null, { timeout: 15000 });
    await p.tap("#t-fire"); end.push([reflex, (await st(p)).mode]);
  }
  await p.evaluate(() => { game.startGame(); game.gameOver(); });
  await p.tap("#screen"); await p.waitForTimeout(100);
  const again = (await st(p)).mode;
  check("spacer, phone: on GAME OVER and CONGRATULATIONS ● goes back to the title (not a reflex tap as the run ends); a tap on the screen plays again",
    end[0][0] === "gameover" && end[0][1] === "attract" && end[1][0] === "complete" && end[1][1] === "attract" && again === "ready", { end, again });
  await done(p, "touch pickers");
  await c.close();

  // ---- the list of stages: S on the title lists all 255 (the challenging
  // ones in gold), opening on the start stage; the arrows move along it (↓ a
  // row of 15), Enter picks the stage to start from and goes back to the
  // title, Esc goes back as it was (staying in the game); Enter on the title
  // then starts there. With a mouse a click on the title's start stage opens
  // it and a click on a stage picks it (anywhere else goes back); on a phone
  // a tap does the same, and a tap elsewhere on the title still starts
  // (a point on the screen, in screen units, on the page)
  const onScreen = (q, sx, sy) => q.evaluate(([sx, sy]) => { const cv = document.getElementById("screen"), r = cv.getBoundingClientRect(); return { x: r.left + cv.clientLeft + sx * cv.clientWidth / 448, y: r.top + cv.clientTop + sy * cv.clientHeight / 576 }; }, [sx, sy]);
  const cellOf = (n) => [14 + ((n - 1) % 15) * 28 + 14, 92 + Math.floor((n - 1) / 15) * 24 + 12];
  // (every number one frame draws, with its colour)
  const drawnNums = (q) => q.evaluate(() => new Promise((ok) => {
    const ctx = document.getElementById("screen").getContext("2d"), seen = {}, orig = ctx.fillText;
    ctx.fillText = function (s) { if (/^\d+$/.test(s)) seen[s] = this.fillStyle; return orig.apply(this, arguments); };
    requestAnimationFrame(() => requestAnimationFrame(() => { delete ctx.fillText; ok(seen); }));
  }));
  c = await lib.newContext(browser);
  p = await lib.open(c, base, "games/spacer/");
  await p.keyboard.press("s"); await p.waitForTimeout(60);
  const listed = Object.assign(await st(p), { cursor: await p.evaluate(() => game.stageCursor) });
  const nums = await drawnNums(p);
  for (const k of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowLeft"]) { await p.keyboard.press(k); await p.waitForTimeout(30); }
  const moved = await p.evaluate(() => game.stageCursor);
  await p.keyboard.press("Enter"); await p.waitForTimeout(60);
  const picked = await st(p);
  await p.keyboard.press("s"); await p.waitForTimeout(60);
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const backed = Object.assign(await st(p), { leaves: p.leaves });
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const started = await st(p);
  check("spacer: S on the title lists all 255 stages (the challenging ones in gold), opening on the start stage; the arrows move along it (↓ a row of 15), Enter picks the one to start from and goes back to the title; Esc goes back as it was, staying in the game; Enter then starts there",
    listed.mode === "stages" && listed.cursor === 1 && Object.keys(nums).length === 255 && nums["3"] === "#ffd23f" && nums["4"] !== "#ffd23f" &&
    moved === 32 && picked.mode === "attract" && picked.startStage === 32 && backed.mode === "attract" && backed.startStage === 32 && backed.leaves === 0 &&
    started.mode === "ready" && started.stage === 32,
    { listed: [listed.mode, listed.cursor], nums: Object.keys(nums).length, gold: [nums["3"], nums["4"]], moved, picked: [picked.mode, picked.startStage], backed, started: [started.mode, started.stage] });
  await p.evaluate(() => game.toTitle());
  const click = async (sx, sy) => { const at = await onScreen(p, sx, sy); await p.mouse.click(at.x, at.y); await p.waitForTimeout(60); return st(p); };
  const m1 = await click(224, 418), m2 = await click(...cellOf(100)), m3 = await click(224, 418), m4 = await click(224, 545);
  check("spacer: with a mouse a click on the title's start stage opens the list of stages, a click on a stage picks it, and a click off the list goes back",
    m1.mode === "stages" && m2.mode === "attract" && m2.startStage === 100 && m3.mode === "stages" && m4.mode === "attract" && m4.startStage === 100,
    { m1: m1.mode, m2: [m2.mode, m2.startStage], m3: m3.mode, m4: [m4.mode, m4.startStage] });
  await done(p, "stage list");
  await c.close();
  c = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(c, base, "games/spacer/");
  const tap = async (sx, sy) => { const at = await onScreen(p, sx, sy); await p.touchscreen.tap(at.x, at.y); await p.waitForTimeout(80); return st(p); };
  const t5 = await tap(224, 418), t6 = await tap(...cellOf(7)), t7 = await tap(224, 288);
  check("spacer, phone: a tap on the title's start stage opens the list of stages, a tap on a stage picks it, and a tap elsewhere on the title starts from it",
    t5.mode === "stages" && t6.mode === "attract" && t6.startStage === 7 && t7.mode === "ready" && t7.stage === 7,
    { t5: t5.mode, t6: [t6.mode, t6.startStage], t7: [t7.mode, t7.stage] });
  await done(p, "stage list, phone");
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
    phCaps.length === 0 && has(ph.title, "TAP TO START") && has(ph.pause, "TAP AN ITEM") &&
      ["over", "done"].every((s) => has(ph[s], "TAP TO PLAY AGAIN") && has(ph[s], "● TITLE")),
    { phCaps, title: ph.title.filter((s) => /TAP|FX|◀ ▶/.test(s)), pause: ph.pause.filter((s) => /RESUME/.test(s)), over: ph.over.filter((s) => /TAP|TITLE/.test(s)) });
  await done(p, "phone hints");
  await c.close();
  c = await lib.newContext(browser);
  p = await lib.open(c, base, "games/spacer/", { before: fxOff });
  const dk = await screens(p);
  // (no screen names Esc for the way out to the games: the ← Games button names its own key)
  check("spacer, desktop: the canvas hints still name the keys, and none repeats the way out to the games",
    ["ENTER", "E"].every((k) => dk.title.includes(k)) && dk.pause.includes("P") && ["ENTER", "⌫"].every((k) => dk.over.includes(k) && dk.done.includes(k)) &&
      !["title", "pause", "over", "done"].some((s) => dk[s].includes("ESC") || has(dk[s], "GAMES")) && !has(Object.values(dk).flat(), "TAP"),
    { title: dk.title.filter((s) => CAPS.includes(s)), pause: dk.pause.filter((s) => CAPS.includes(s)) });
  // the corner's ✨ and pause buttons are the Visual FX switch and the pause:
  // the title screen doesn't name Visual FX again, nor the bar under the
  // screen the pause (on a phone or a desktop)
  const bar = await p.evaluate(() => document.getElementById("controls").textContent.replace(/\s+/g, " ").trim());
  check("spacer: the title screen names no Visual FX switch and the controls under the screen no pause (the corner buttons are both)",
    !has(dk.title, "VISUAL FX") && !dk.title.includes("V") && !has(ph.title, "VISUAL FX") && !/pause/i.test(bar), { bar, title: dk.title.filter((s) => /FX|^V$/.test(s)), phone: ph.title.filter((s) => /FX/.test(s)) });

  // ---- sharp on a 2x screen: the screen's canvas has two pixels for every
  // pixel of the page it covers (it was drawn at 448 x 576 and stretched,
  // under one), and still draws in the game's own units after a resize
  {
    const sc = await lib.newContext(browser, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const q = await lib.open(sc, base, "games/spacer/");
    await q.waitForTimeout(300);
    const at = () => q.evaluate(() => { const c = document.getElementById("screen"), t = c.getContext("2d").getTransform(); return { k: +(c.width / c.clientWidth).toFixed(2), kh: +(c.height / c.clientHeight).toFixed(2), sx: +(t.a / (c.width / 448)).toFixed(3), sy: +(t.d / (c.height / 576)).toFixed(3) }; });
    const big = await at();
    await q.setViewportSize({ width: 900, height: 600 }); await q.waitForTimeout(300);
    const small = await at();
    check("spacer: on a 2x screen the screen is drawn at the screen's own resolution (two canvas pixels to a page pixel), in the game's units, before and after a resize",
      [big, small].every((r) => r.k >= 1.95 && r.kh >= 1.95 && r.sx === 1 && r.sy === 1), { big, small });
    check("spacer (2x): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await sc.close();
  }

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

  // ---- a kill's points float up where it fell, written "+N", N the points it added
  {
    const cx = await lib.newContext(browser);
    const q = await lib.open(cx, base, "games/spacer/");
    await q.waitForFunction(() => window.game);
    await q.evaluate(() => game.startGame());
    await q.waitForFunction(() => game.enemies && game.enemies.some((e) => !e.killed), null, { timeout: 20000 });
    const pop = await q.evaluate(() => {
      const e = game.enemies.find((x) => !x.killed), s0 = game.score, n0 = game.popups.length;
      game.killEnemy(e);
      const p = game.popups[game.popups.length - 1];
      return { text: p && p.text, added: game.score - s0, at: p && Math.round(Math.hypot(p.x - e.x, p.y - e.y)), n: game.popups.length - n0 };
    });
    check("spacer: a kill's points read \"+N\" where it fell, N what it added to the score", pop.n === 1 && pop.text === "+" + pop.added && pop.added > 0 && pop.at === 0, pop);
    await done(q, "points");
    await cx.close();
  }

  // ---- the title's copyright line, "© SAM LU", in white at its foot as an
  // arcade title screen carries it: drawn inside the screen, clear of every
  // other word on the title (the blinking key line lit), at least 7.5px as
  // the screen is shown on a laptop or an upright phone (a phone on its side
  // shows the whole screen small); not drawn in play; no "made by" line.
  // Every word one frame draws (the game drawn once, by hand) is caught as
  // it is written, with the box its font gives it.
  const mob = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  for (const [label, opts, least] of [["1280x900", {}, 7.5], ["1366x657", { viewport: { width: 1366, height: 657 } }, 7.5], ["1280x600", { viewport: { width: 1280, height: 600 } }, 7.5],
    ["Pixel 7", devices["Pixel 7"], 7.5], ["phone 320x568", mob(320, 568), 7.5], ["phone 375x553", mob(375, 553), 7.5], ["phone 360x560", mob(360, 560), 7.5], ["Pixel 7 sideways", devices["Pixel 7 landscape"], 0]]) {
    const cx = await lib.newContext(browser, opts);
    const q = await lib.open(cx, base, "games/spacer/");
    await q.waitForFunction(() => window.game);
    const frame = () => q.evaluate(() => new Promise((ok) => {
      const ctx = game.ctx, ft = ctx.fillText, words = [];
      ctx.fillText = function (s, x, y) {
        const size = parseFloat((/(\d+(?:\.\d+)?)px/.exec(ctx.font) || [0, 0])[1]), w = ctx.measureText(String(s)).width;
        const left = ctx.textAlign === "center" ? x - w / 2 : ctx.textAlign === "right" || ctx.textAlign === "end" ? x - w : x;
        const top = ctx.textBaseline === "middle" ? y - size * 0.62 : ctx.textBaseline === "top" ? y : y - size * 0.8;
        words.push({ s: String(s), x: left, y: top, w, h: size * 1.24, size, color: String(ctx.fillStyle) });
        return ft.apply(this, arguments);
      };
      try { game.draw(); } finally { delete ctx.fillText; }
      ok(words);
    }));
    const r = await q.evaluate(() => { game.blinkOn = () => true; return null; }).then(frame).then(async (words) => {
      const box = await q.evaluate(() => { const c = document.getElementById("screen").getBoundingClientRect(); return { ch: c.height, sh: document.documentElement.scrollHeight }; });
      const cr = words.filter((w) => /SAM LU/.test(w.s));
      const mine = cr[0];
      const pad = 3, hits = mine ? words.filter((w) => w !== mine && w.s.trim() && w.x < mine.x + mine.w + pad && w.x + w.w > mine.x - pad && w.y < mine.y + mine.h + pad && w.y + w.h > mine.y - pad).map((w) => w.s) : [];
      return { text: mine && mine.s, n: cr.length, color: mine && mine.color, inside: !!mine && mine.x >= 0 && mine.y >= 0 && mine.x + mine.w <= 448 && mine.y + mine.h <= 576,
        shown: mine ? +(mine.size * box.ch / 576).toFixed(1) : 0, hits, words: words.length };
    });
    await q.evaluate(() => { game.startGame(); game.mode = "playing"; });
    const inPlay = (await frame()).filter((w) => /SAM LU/.test(w.s)).length;
    const madeBy = await q.evaluate(() => /made by/i.test(document.body.innerText));
    check("spacer, " + label + ": the title carries \"© SAM LU\" in white at its foot, inside the screen, clear of the title's other words and readable; play doesn't draw it",
      !!r && r.text === "© SAM LU" && r.n === 1 && /^#fff(fff)?$/i.test(r.color) && r.inside && r.hits.length === 0 && r.shown >= least && inPlay === 0 && !madeBy, Object.assign({}, r, { inPlay, madeBy }));
    await done(q, "copyright, " + label);
    await cx.close();
  }

  // ---- the stars on the page around the cabinet: three layers of pixel
  // stars, falling with Visual FX on (the near ones fastest), held while the
  // run is paused and falling again once RESTART starts it over; with FX off
  // they lie still where they were painted. Read as each layer's place down
  // the page.
  {
    const sc = await lib.newContext(browser);
    const sky = (q) => q.evaluate(() => [...document.querySelectorAll("#sky i")].map((el) => {
      const cs = getComputedStyle(el);
      return { y: new DOMMatrix(cs.transform === "none" ? undefined : cs.transform).m42, img: /^url\("?data:image\/png/.test(cs.backgroundImage) };
    }));
    const over = async (q, ms) => { const a = await sky(q); await q.waitForTimeout(ms); const b = await sky(q); return a.map((l, i) => ({ img: l.img, from: l.y, by: b[i].y - l.y })); };
    // (moving is waited for, up to a few seconds: a busy machine can give a
    // page few frames, and a fixed window then sees too little of it)
    const falls = async (q) => {
      const a = await sky(q);
      await q.waitForFunction((a) => [...document.querySelectorAll("#sky i")].every((el, i) => { const cs = getComputedStyle(el); return new DOMMatrix(cs.transform === "none" ? undefined : cs.transform).m42 > a[i].y + 1; }), a, { timeout: 6000, polling: 100 }).catch(() => {});
      const b = await sky(q);
      return a.map((l, i) => ({ img: l.img, from: l.y, by: b[i].y - l.y }));
    };
    const open = (off) => lib.open(sc, base, "games/spacer/", { before: (pg) => pg.addInitScript((off) => localStorage.setItem("reduceMotion:spacer", off ? "1" : "0"), off) });
    let q = await open(false);
    await q.waitForFunction(() => window.game);
    const title = await falls(q);
    await q.evaluate(() => { game.startGame(); game.mode = "playing"; game.togglePause(); });
    await q.waitForFunction(() => document.body.classList.contains("sp-held"), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(150);   // (a CSS pause lands on the next frame)
    const paused = await over(q, 800);
    // RESTART, with nothing scored, starts over at once
    await q.keyboard.press("ArrowDown"); await q.keyboard.press("Enter");
    await q.waitForFunction(() => game.mode !== "paused" && !document.body.classList.contains("sp-held"), null, { timeout: 5000 }).catch(() => {});
    const again = await falls(q);
    check("spacer, Visual FX on: the page's stars fall past the cabinet in three layers (the near ones fastest), held while paused, falling again after RESTART",
      title.length === 3 && title.every((l) => l.img && l.by > 1) && title[2].by > title[0].by && paused.every((l) => l.by === 0) && again.every((l) => l.by > 1), { title, paused, again });
    // FX turned off on the way: the stars stop where they are (no snap back),
    // and turned on again they fall on from there
    // (each layer first a few px down, so a snap back to the top would show:
    // waited for, as a busy machine gives the page few frames)
    await q.waitForFunction(() => [...document.querySelectorAll("#sky i")].every((el) => { const cs = getComputedStyle(el); return new DOMMatrix(cs.transform === "none" ? undefined : cs.transform).m42 > 5; }), null, { timeout: 6000, polling: 100 }).catch(() => {});
    const before = await sky(q);
    await q.evaluate(() => document.querySelector(".rm-toggle").click());
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-off"), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(150);
    const stopped = await over(q, 700);
    await q.evaluate(() => document.querySelector(".rm-toggle").click());
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-on"), null, { timeout: 5000 }).catch(() => {});
    const on = await falls(q);
    check("spacer, Visual FX turned off mid-fall: the page's stars stop where they are, no jump; on again they fall on from there",
      // (never back towards where they started: a busy machine may let them
      // fall on a little before the pause lands, never return)
      before.every((l) => l.y > 5) && stopped.every((l, i) => l.by === 0 && l.from >= before[i].y - 0.5 && l.from < before[i].y + 40) &&
      on.every((l, i) => l.from >= stopped[i].from - 0.5 && l.from < stopped[i].from + 40 && l.by > 1), { before, stopped, on });
    await done(q, "page stars FX on");
    q = await open(true);
    await q.waitForFunction(() => window.game);
    const off = await over(q, 800);
    check("spacer, Visual FX off: the page's stars lie still where they were painted",
      off.length === 3 && off.every((l) => l.img && l.from === 0 && l.by === 0), off);
    await done(q, "page stars FX off");
    await sc.close();
  }

  // ---- the canvas stars' twinkle: Visual FX turned off on the way holds each
  // star at the brightness it had (not all at once to the steady shine of a
  // page opened with FX off); on again they twinkle on from there
  {
    const tc = await lib.newContext(browser);
    const q = await lib.open(tc, base, "games/spacer/", { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:spacer", "0"); } catch (e) {} }) });
    const tw = await q.evaluate(() => {
      const sf = new Starfield(6), flip = () => document.querySelector(".rm-toggle").click();
      const alphas = () => { const seen = []; sf.draw({ set globalAlpha(v) { seen.push(v); }, get globalAlpha() { return 1; }, fillRect() {}, fillStyle: "" }); return seen.slice(0, 6).map((v) => +v.toFixed(4)); };
      sf.update(0.3); const a = alphas();
      flip(); sf.update(0.3); const b = alphas();
      flip(); sf.update(0.3); const c = alphas();
      return { a, b, c };
    });
    check("spacer: Visual FX turned off on the way holds each star's twinkle at the brightness it had, on again they twinkle on",
      tw.a.some((v) => v !== 0.85) && tw.b.join() === tw.a.join() && tw.c.join() !== tw.b.join(), tw);
    await done(q, "star twinkle FX turned off on the way");
    await tc.close();
  }
};
