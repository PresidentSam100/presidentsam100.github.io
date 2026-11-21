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
  await p.waitForFunction(() => game.overTimer === 0, null, { timeout: 5000 }); await p.waitForTimeout(50);   // (game time: slower than the clock on a busy machine)
  const o1 = await p.evaluate(() => ({ bt: game.blinkTimer, px: game.particles.particles.length ? game.particles.particles[0].y : null, y: game.bird.y }));
  check("flappy-world: on the game-over card the crash burst plays out; the bird stays where it fell",
    o1.px !== o0.px && o1.y === o0.y, { o0, o1 });
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
  // (a flight started and made safe in one go: on a busy machine a bird left
  // to fall a while would hit the ground and end the run first)
  const fly = (q) => q.evaluate(() => { game.setState("PLAYING"); game.invincibleTime = 1e9; });
  const flapped = (q) => q.waitForFunction(() => window.__flaps >= 1, null, { timeout: 5000 }).catch(() => {});
  p = await open();
  await fly(p);
  await countFlaps(p);
  const c = await p.evaluate(() => { const r = game.canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.8 }; });
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await flapped(p);
  const onPress = await p.evaluate(() => window.__flaps);
  await p.mouse.up(); await p.waitForTimeout(150);
  const onRelease = await p.evaluate(() => window.__flaps);
  check("flappy-world: a mouse press flaps at once, and its release doesn't flap again", onPress === 1 && onRelease === 1, { onPress, onRelease });
  await done(p, "mouse");

  // ---- a tap flaps once (not once for the touch and again for its click)
  const tctx = await lib.newContext(browser, { hasTouch: true });
  p = await lib.open(tctx, base, "games/flappy-world/");
  await fly(p);
  await countFlaps(p);
  const tc = await p.evaluate(() => { const r = game.canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.8 }; });
  await p.touchscreen.tap(tc.x, tc.y); await flapped(p); await p.waitForTimeout(200);   // (and time for a click to follow, if one did)
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

  // ---- a phone: the game-over card's MENU goes back to the menu, whose lives
  // switch and guide take taps too; a tap anywhere else plays again; neither
  // in the half-second after the crash
  const { devices } = require("@playwright/test");
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(phone, base, "games/flappy-world/");
  // tap at a point in canvas units; the state after
  const tapAt = async (x, y) => {
    const r = await p.evaluate(([x, y]) => { const b = game.canvas.getBoundingClientRect(); return { x: b.left + x * b.width / CANVAS_W, y: b.top + y * b.height / CANVAS_H }; }, [x, y]);
    await p.touchscreen.tap(r.x, r.y); await p.waitForTimeout(80);
    return p.evaluate(() => game.gameState);
  };
  const menuAt = await p.evaluate(() => { const b = game.menuButton || { x: 160, y: 572, w: 160, h: 46 }; return [b.x + b.w / 2, b.y + b.h / 2]; });
  const run = {};
  run.start = await tapAt(240, 700);
  await p.evaluate(() => game.die());
  run.locked = await tapAt(...menuAt);
  const unlocked = () => p.waitForFunction(() => game.overTimer === 0, null, { timeout: 5000 });   // (game time: slower than the clock on a busy machine)
  await unlocked();
  run.menu = await tapAt(...menuAt);
  await tapAt(335, 415); run.lives = await p.evaluate(() => game.livesMode);   // the 3 LIVES button
  run.guide = await tapAt(240, 494);                                          // OBSTACLE GUIDE
  run.back = await tapAt(240, 300);
  run.again = await tapAt(240, 700);
  await p.evaluate(() => game.die()); await unlocked();
  run.replay = await tapAt(240, 300);                                         // the card, away from MENU
  check("flappy-world on a phone: the game-over card's MENU goes to the menu (where taps switch lives and open the guide); a tap elsewhere plays again; not in the half-second after a crash",
    run.start === "PLAYING" && run.locked === "GAMEOVER" && run.menu === "MENU" && run.lives === 3 && run.guide === "INFO" && run.back === "MENU" && run.again === "PLAYING" && run.replay === "PLAYING", run);
  await done(p, "phone menu");

  // ---- the canvas hints: keys on a desktop, touch wording on a phone
  // (Visual FX off, so the blinking prompts are drawn every frame)
  const KEYS = ["SPACE", "SPACE or ENTER", "Esc", "ESC", "1", "3", "I", "M", "⌫"];   // (not P: the FLAPPY title draws it, letter by letter)
  const hints = {};
  for (const [label, c] of [["desktop", ctx], ["phone", phone]]) {
    p = await lib.open(c, base, "games/flappy-world/", fxOff(true));
    const drawn = (set) => p.evaluate((set) => new Promise((res) => {
      eval(set);
      const g = game.ctx, o = g.fillText, seen = [];
      g.fillText = function (t) { seen.push(String(t)); return o.apply(this, arguments); };
      requestAnimationFrame(() => requestAnimationFrame(() => { g.fillText = o; res(seen); }));
    }), set);
    const all = [].concat(
      await drawn(""),                                                            // the menu
      await drawn("game.gameState = 'INFO'"),
      await drawn("game.setState('PLAYING'); game.invincibleTime = 1e9; game.togglePause()"),
      await drawn("game.togglePause(); game.die(); game.overTimer = 0"));
    hints[label] = { keys: KEYS.filter((k) => all.includes(k)), touch: ["TAP ▶ TO RESUME", "TAP TO RETURN"].filter((t) => all.includes(t)),
      // the buttons, and the lines of keys that used to stand under them
      buttons: ["PLAY", "1 LIFE", "3 LIVES", "OBSTACLE GUIDE", "PLAY AGAIN", "MENU"].filter((t) => all.includes(t)),
      lines: all.filter((t) => /to flap|switch mode|for menu|TO START|TO PLAY AGAIN/i.test(t)) };
    await done(p, label + " hints");
  }
  check("flappy-world: the canvas hints show keys on a desktop and touch wording on a phone",
    hints.desktop.keys.length >= 5 && hints.desktop.touch.length === 0 && hints.phone.keys.length === 0 && hints.phone.touch.length === 2, hints);
  check("flappy-world: the menu and the game-over card are buttons wearing their keys (1, 3, I, Space or Enter, Backspace), with no flashing prompt or line of key hints, and M is no menu key",
    hints.desktop.buttons.length === 6 && hints.phone.buttons.length === 6 && hints.desktop.lines.length === 0 && hints.phone.lines.length === 0 &&
    ["1", "3", "I", "SPACE or ENTER", "⌫"].every((k) => hints.desktop.keys.includes(k)) && !hints.desktop.keys.includes("M"), hints);

  // ---- M and V are the sound and Visual FX here too (M was the menu's key); Backspace alone goes back from the card
  {
    p = await open();
    const sw = () => p.evaluate(() => ({ muted: /🔇|off/i.test(document.querySelector(".mute-toggle").getAttribute("aria-label") || "") || document.querySelector(".mute-toggle").getAttribute("aria-pressed") === "true", fxOff: window.RM_ON(), state: game.gameState, cap: document.querySelector(".mute-toggle").getAttribute("aria-keyshortcuts") }));
    const a = await sw();
    await p.keyboard.press("m"); const b = await sw();
    await p.keyboard.press("v"); const c = await sw();
    await p.keyboard.press("m"); await p.keyboard.press("v");
    await p.keyboard.press("Space"); await p.waitForTimeout(150);
    await p.evaluate(() => { game.die(); game.overTimer = 0; });
    await p.keyboard.press("m"); const over = await sw();
    await p.keyboard.press("m");
    await p.keyboard.press("Backspace"); const back = await sw();
    check("flappy-world: M is the sound and V Visual FX (the corner buttons say so); on the game-over card M leaves the card be and Backspace goes to the menu",
      /M/.test(a.cap || "") && b.muted !== a.muted && c.fxOff !== a.fxOff && over.state === "GAMEOVER" && over.muted !== a.muted && back.state === "MENU", { a, b, c, over, back });
    await done(p, "M and V");
  }

  // ---- a 2x screen: the canvas is drawn at device pixels, taps land in place
  const hi = await lib.newContext(browser, { deviceScaleFactor: 2 });
  p = await lib.open(hi, base, "games/flappy-world/");
  const sharp = await p.evaluate(() => {
    const c = game.canvas, r = c.getBoundingClientRect();
    const corner = c.getContext("2d").getImageData(c.width - 3, c.height - 3, 1, 1).data[3];   // the ground reaches the far corner
    return { w: c.width, css: Math.round(r.width), corner };
  });
  const three = await p.evaluate(() => { const b = game.canvas.getBoundingClientRect(); return { x: b.left + 335 * b.width / CANVAS_W, y: b.top + 415 * b.height / CANVAS_H }; });
  await p.mouse.click(three.x, three.y); await p.waitForTimeout(80);
  const t2a = await p.evaluate(() => game.lastTs); await p.waitForTimeout(200);
  const hiRun = { lives: await p.evaluate(() => game.livesMode), drawing: (await p.evaluate(() => game.lastTs)) > t2a };
  check("flappy-world on a 2x screen: the canvas has twice its CSS pixels and fills them, a click lands on 3 LIVES, and it keeps drawing",
    Math.abs(sharp.w - 2 * sharp.css) <= 2 && sharp.corner === 255 && hiRun.lives === 3 && hiRun.drawing, { sharp, hiRun });
  // the scenery pictures and the page backdrop are painted at 2x too, and
  // painted again when a smaller window brings the ratio down
  const art2 = await p.evaluate(async () => {
    const a = art(), url = /url\("?([^")]+)"?\)/.exec(document.body.style.background)[1];   // (the first: the ground)
    const img = new Image(); img.src = url; await img.decode();
    return { hills: a.hills.width, bushes: a.bushes.width, ground: a.ground.width, cloud: a.clouds[0].width, page: img.naturalWidth };
  });
  await p.setViewportSize({ width: 400, height: 400 }); await p.waitForTimeout(300);
  const art1 = await p.evaluate(() => ({ hills: art().hills.width, k: game.canvas.width / CANVAS_W }));
  const t3 = await p.evaluate(() => game.lastTs); await p.waitForTimeout(200);
  const drew = (await p.evaluate(() => game.lastTs)) > t3;
  check("flappy-world on a 2x screen: the scenery and the page backdrop are painted at 2x, painted again when the ratio drops, and frames keep drawing",
    art2.hills === 1920 && art2.bushes === 1920 && art2.ground === 128 && art2.cloud === 340 && art2.page === 128 && art1.hills < 1920 && drew, { art2, art1, drew });
  await done(p, "2x");
  await hi.close();
  await phone.close();

  // ---- the ground is solid: hitting it costs a life (all of it with 1 life),
  // like a pipe, and the bird bounces off it instead of sinking through.
  // (Game time driven by game.update, frame by frame.)
  p = await open();
  const ground = await p.evaluate(() => {
    const run = (mode) => {
      game.setLivesMode(mode); game.init(); game.gameState = "PLAYING";
      game.pipeManager.spawnTimer = 1e9;                       // no pipes
      game.bird.y = GROUND_Y - 30; game.bird.vy = 400;
      for (let i = 0; i < 18 && game.gameState === "PLAYING"; i++) game.update(1 / 60);
      const hit = { state: game.gameState, lives: game.lives, above: game.bird.y + 10 <= GROUND_Y + 1 };
      let low = -1e9;
      for (let i = 0; i < 36 && game.gameState === "PLAYING"; i++) { game.update(1 / 60); low = Math.max(low, game.bird.y + 10); }
      return { hit, later: { state: game.gameState, lives: game.lives, lowest: Math.round(low) } };
    };
    const three = run(3), one = run(1);
    game.setLivesMode(1);
    return { three, one };
  });
  check("flappy-world: hitting the ground costs a life like a pipe (a bounce, then i-frames that the ground can't kill through), and ends a 1-life run",
    ground.three.hit.state === "PLAYING" && ground.three.hit.lives === 2 && ground.three.hit.above && ground.three.later.state === "PLAYING" &&
    ground.three.later.lives === 2 && ground.three.later.lowest <= 775 && ground.one.hit.state === "GAMEOVER", ground);

  // ---- the double-gap pipe scores 2, as its "x2" says, and the best is saved
  const seq = await p.evaluate(() => {
    const pass = (from) => {
      game.init(); game.gameState = "PLAYING"; game.pipeManager.spawnTimer = 1e9;
      game.score = from; game.invincibleTime = 1e9;
      game.pipeManager.pipes = [new SeqPipe(game.bird.x - PIPE_W + 4)];
      for (let i = 0; i < 30 && !game.pipeManager.pipes[0].scored; i++) { game.bird.y = 245; game.bird.vy = 0; game.update(1 / 60); }
      return { score: game.score, world: game.worldText };
    };
    localStorage.clear(); game.hiScores[game.livesMode] = 0;
    const a = pass(0), best = localStorage.getItem("flappyWorld_hiScore_" + game.livesMode);
    const b = pass(9);
    return { a, best, b };
  });
  check("flappy-world: the double-gap pipe scores 2, the best is saved as it's passed, and stepping past a multiple of 10 still starts a new world",
    seq.a.score === 2 && seq.best === "2" && seq.b.score === 11 && seq.b.world === "World 1", seq);

  // ---- a sliding pipe comes in from off-screen, never popping up inside the
  // canvas; and once the bird has passed it, it can't slide back over the bird
  const slide = await p.evaluate(() => {
    game.init(); game.gameState = "PLAYING"; game.score = 12; game.scrollSpeed = 350;
    let minLeft = 1e9, spawned = 0, jump = 0;
    for (let i = 0; i < 300; i++) {
      game.pipeManager.pipes = [];
      game.pipeManager.spawnPipe();
      const np = game.pipeManager.pipes[0];
      if (!(np instanceof HorizPipe)) continue;
      spawned++;
      const x0 = np.x;
      np.update(1 / 60, game.scrollSpeed, game.bird.x);       // its first frame mustn't jump either
      minLeft = Math.min(minLeft, x0 - 4, np.x - 4);          // (its caps stick out 4px)
      jump = Math.max(jump, Math.abs(np.x - x0));
    }
    let back = 0;
    for (let i = 0; i < 300; i++) {
      const hp = new HorizPipe(game.bird.x + 60, 400, PIPE_GAP);
      hp.amplitude = 110; hp.freq = 0.022; hp.phase = Math.random() * Math.PI * 2;   // the widest, quickest slide
      let cleared = false;
      for (let f = 0; f < 240; f++) {
        hp.update(1 / 60, 350, game.bird.x); hp.isPassed(game.bird.x);
        const right = hp.x + PIPE_W + 2;                    // its hitbox's right edge
        if (hp.scored && right < game.bird.x - 12) cleared = true;
        else if (cleared && right >= game.bird.x - 12) { back++; break; }
      }
    }
    game.pipeManager.pipes = [];
    return { spawned, minLeft: Math.round(minLeft), jump: Math.round(jump), back };
  });
  check("flappy-world: a sliding pipe slides in from off-screen (no jump on its first frame) and never slides back over a bird that has passed it",
    slide.spawned > 20 && slide.minLeft >= 480 && slide.jump <= 20 && slide.back === 0, slide);
  await done(p, "ground, double gap and sliding pipes");

  await ctx.close();

  // ---- the maker's stamp, SAM LU over PIPE CO., pressed into every length of
  // pipe back from its cap: on every kind of pipe, inside its tube (never in
  // a gap, nor under the ground), within the stripes and clear of the arrows
  // that mark the moving and shifting pipes, its letters 8 px or more on a
  // phone; the pipes' hit boxes are those they always had; no "made by" line.
  // Every kind is laid out on screen and held still, the bird kept clear.
  const mob = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  for (const [label, opts] of [["1280x900", {}], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }],
    ["Pixel 7", devices["Pixel 7"]], ["phone 320x568", mob(320, 568)], ["phone 375x553", mob(375, 553)], ["phone 360x560", mob(360, 560)]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/flappy-world/");
    await q.keyboard.press("Space");
    const runs = [];
    for (const line of ["B M N S", "H O C X E"]) {
      await q.evaluate((line) => {
        game.invincibleTime = 1e9; game.pipeManager.update = () => {};
        game.enemyManager.update = () => {}; game.enemyManager.draw = () => {};
        const mk = { B: (x) => new BasePipe(x, 330, 180), M: (x) => new MovingPipe(x, 470, 180), N: (x) => new NarrowEntryPipe(x, 380, 180), S: (x) => new SeqPipe(x),
          H: (x) => new HorizPipe(x, 300, 180), O: (x) => new OpenPipe(x, 420, 180), C: (x) => new ClosePipe(x, 330, 180), X: (x) => new NarrowExitPipe(x, 560, 180), E: (x) => new BasePipe(x, 650, 180) };
        const ks = line.split(" ");
        game.pipeManager.pipes = ks.map((k, j) => { const p = mk[k](12 + j * (ks.length > 4 ? 94 : 118)); if (k === "H") p.update = () => {}; delete p.stamps; return p; });
        if (!window.__held) { window.__held = true; (function f() { game.bird.y = 60; game.bird.vy = 0; requestAnimationFrame(f); })(); }
      }, line);
      // (until every pipe has been drawn with its stamps)
      await q.waitForFunction(() => game.pipeManager.pipes.every((p) => p.stamps), null, { timeout: 15000, polling: 100 }).catch(() => {});
      runs.push(await q.evaluate(() => {
        if (typeof game.stampsOnPage !== "function") return null;
        // where the hit boxes always were (from the gap, or the double pipe's fixed sections)
        const was = (p) => p instanceof SeqPipe ? [[-10, 172], [320, 182], [650, CANVAS_H]].map(([y, h]) => [p.x - 2, y, PIPE_W + 4, h])
          : [[p.x - 2, -10, PIPE_W + 4, p.gapY - p.gapH / 2 + 10], [p.x - 2, p.gapY + p.gapH / 2, PIPE_W + 4, CANVAS_H]];
        const hitSame = game.pipeManager.pipes.every((p) => JSON.stringify(p.getHitboxes().map((b) => [b.x, b.y, b.w, b.h])) === JSON.stringify(was(p)));
        return { hitSame, pipes: game.stampsOnPage() };
      }));
    }
    const bad = [];
    for (const r of runs) {
      if (!r) { bad.push("no stamps hook"); continue; }
      if (!r.hitSame) bad.push("hit boxes changed");
      for (const p of r.pipes) {
        const tubes = p.hitboxes.map((h) => ({ top: h.y, bottom: Math.min(h.y + h.h, p.ground) }));
        // (whole stamps: in the window, above the ground, on a tube)
        const seen = p.stamps.filter((s) => s.y >= p.top && s.y + s.h <= p.ground && tubes.some((t) => s.y >= t.top && s.y + s.h <= t.bottom));
        if (!seen.length) { bad.push(p.kind + ": no whole stamp on screen"); continue; }
        for (const s of p.stamps) {
          if (s.text !== "SAM LU PIPE CO.") bad.push(p.kind + ": reads " + s.text);
          if (s.size < 8) bad.push(p.kind + ": letters " + s.size.toFixed(1) + " px");
          // within the stripes (8 px of the tube's 70 at each edge)
          const k = p.w / 70;
          if (s.x < p.x + 8 * k - 0.5 || s.x + s.w > p.x + p.w - 8 * k + 0.5) bad.push(p.kind + ": past the tube's stripes");
          // never in a gap: a stamp that shows lies on a tube
          if (s.y + s.h > p.top && s.y < p.ground && !tubes.some((t) => s.y >= t.top - 0.5 && s.y + s.h <= t.bottom + 0.5) && !(s.y >= p.ground))
            bad.push(p.kind + ": a stamp off its tube");
          // clear of the arrows, 41 of the canvas's 854 from the gap's edge
          // (the double pipe has none: its hit boxes stop short of its caps)
          const gapEdges = tubes.flatMap((t) => [t.top, t.bottom]).filter((y) => y > p.top + 1 && y < p.ground - 1);
          if (p.kind !== "SeqPipe" && gapEdges.some((e) => s.y < e + 41 * k && s.y + s.h > e - 41 * k)) bad.push(p.kind + ": too near a cap's arrows");
        }
      }
    }
    const madeBy = await q.evaluate(() => /made by/i.test(document.body.innerText));
    check("flappy-world, " + label + ": every kind of pipe carries the maker's stamp SAM LU PIPE CO. on its tubes, readable, clear of the gaps, stripes and arrows; the hit boxes are unchanged",
      bad.length === 0 && !madeBy, bad.length ? bad.slice(0, 8) : runs.map((r) => r && r.pipes.map((p) => p.kind + " " + p.stamps.map((s) => s.size.toFixed(1)).join("/")).join(", ")));
    check("flappy-world (pipe stamp), " + label + ": no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }

  // ---- the page's own clouds, in the sky beside the canvas: with Visual FX
  // on they drift left, held while paused and moving again once Restart
  // starts the flight over; with FX off they sit where the page always had
  // them (the strip dressPage paints, at 3vh, 280 of the canvas's 854 tall,
  // from the left edge). Read as the layer's place across the page.
  {
    const cctx = await lib.newContext(browser);
    const open = (opts) => lib.open(cctx, base, "games/flappy-world/", opts);
    const layer = (q) => q.evaluate(() => {
      const cs = getComputedStyle(document.body, "::before"), m = new DOMMatrix(cs.transform === "none" ? undefined : cs.transform);
      return { x: m.m41, img: /^url\("?data:image\/png/.test(cs.backgroundImage), top: parseFloat(cs.top), h: parseFloat(cs.height), w: parseFloat(cs.width), vh: innerHeight / 100, vw: innerWidth };
    });
    const still = async (q, ms) => { const a = (await layer(q)).x; await q.waitForTimeout(ms); return { from: a, to: (await layer(q)).x }; };
    // (moving is waited for, up to a few seconds: a busy machine can give a
    // page few frames, and a fixed window then sees too little of it)
    const moves = async (q) => {
      const a = (await layer(q)).x;
      await q.waitForFunction((a) => { const cs = getComputedStyle(document.body, "::before"); return new DOMMatrix(cs.transform === "none" ? undefined : cs.transform).m41 < a - 2; }, a, { timeout: 6000, polling: 100 }).catch(() => {});
      return { from: a, to: (await layer(q)).x };
    };
    // with FX on
    let q = await open(fxOff(false));
    const at = await layer(q);
    const drift = await moves(q);
    await q.keyboard.press("Space");
    await q.evaluate(() => { game.invincibleTime = 1e9; });   // (no crash while it is looked at)
    await q.keyboard.press("p");
    await q.waitForFunction(() => game.gameState === "PAUSED" && document.body.classList.contains("fw-held"), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(150);   // (a CSS pause lands on the next frame)
    const paused = await still(q, 700);
    // Restart from the pause card asks first: Enter starts over
    await q.keyboard.press("r");
    await q.waitForTimeout(150);
    await q.keyboard.press("Enter");
    await q.waitForFunction(() => game.gameState === "PLAYING" && !document.body.classList.contains("fw-held"), null, { timeout: 5000 }).catch(() => {});
    const again = await moves(q);
    check("flappy-world, Visual FX on: the page's clouds drift left across the sky beside the canvas, held while paused, moving again after Restart",
      at.img && drift.to < drift.from - 2 && paused.to === paused.from && again.to < again.from - 2, { at, drift, paused, again });
    // FX turned off on the way: they stop where they are (no snap back to
    // where they started), and turned on again they drift on from there
    const before = (await layer(q)).x;
    await q.keyboard.press("v");
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-off"), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(150);
    const stopped = await still(q, 700);
    await q.keyboard.press("v");
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-on"), null, { timeout: 5000 }).catch(() => {});
    const on = await moves(q);
    check("flappy-world, Visual FX turned off mid-drift: the page's clouds stop where they are, no jump; on again they drift on from there",
      // (never back towards where they started: a busy machine may let them
      // drift on a little before the pause lands, never return)
      before < -5 && stopped.from === stopped.to && stopped.from <= before + 0.5 && stopped.from > before - 40 &&
      on.from <= stopped.to + 0.5 && on.from > stopped.to - 40 && on.to < on.from - 2, { before, stopped, on });
    await done(q, "page clouds FX on");
    // with FX off
    q = await open(fxOff(true));
    const off = await layer(q), offStill = await still(q, 700);
    check("flappy-world, Visual FX off: the page's clouds sit still, where they always were (3vh down, 280/854 of the height, from the left edge)",
      off.img && off.x === 0 && offStill.from === 0 && offStill.to === 0 && Math.abs(off.top - 3 * off.vh) < 0.6 && Math.abs(off.h - 32.79 * off.vh) < 0.6 &&
      off.w >= off.vw + off.h * 960 / 280 - 1, { off, offStill });
    await done(q, "page clouds FX off");
    await cctx.close();
  }
};
