// Poodle Jump: the start card carries the game's own name; with Visual FX off
// a black hole is drawn still (FX on, its spiral and ring turn).
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const done = async (p, what) => { check("poodle-jump " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- the start card's title, as drawn
  let p = await lib.open(ctx, base, "games/poodle-jump/");
  const drawn = await p.evaluate(() => new Promise((res) => {
    const c = __game.ctx, orig = c.fillText, seen = [];
    c.fillText = function (t) { seen.push(String(t)); return orig.apply(this, arguments); };
    requestAnimationFrame(() => requestAnimationFrame(() => { c.fillText = orig; res({ state: __game.state, seen }); }));
  }));
  check("poodle-jump: the start card is titled Poodle Jump", drawn.state === "start" && drawn.seen.includes("Poodle Jump") && !drawn.seen.some((t) => /Doodle/.test(t)), drawn);
  await done(p, "title");

  // ---- a black hole drawn at two moments: the same picture with FX off
  const still = {};
  for (const off of [true, false]) {
    p = await lib.open(ctx, base, "games/poodle-jump/", { before: (pg) => pg.addInitScript((off) => localStorage.setItem("reduceMotion:poodle-jump", off ? "1" : "0"), off) });
    still[off ? "off" : "on"] = await p.evaluate(() => {
      const cv = document.createElement("canvas"); cv.width = 120; cv.height = 120; const c = cv.getContext("2d");
      const e = new Enemy(30, 30, "blackhole");
      return [0.5, 1.3].map((t) => { c.clearRect(0, 0, 120, 120); e.t = t; e.render(c, 0); return cv.toDataURL(); }).reduce((a, b) => a === b);
    });
    await done(p, "fx " + (off ? "off" : "on"));
  }
  check("poodle-jump: with Visual FX off a black hole is drawn still; with it on its spiral and ring turn", still.off === true && still.on === false, still);

  // ---- the start, pause and game-over notes: keys on a desktop, touch wording on a phone
  const { devices } = require("@playwright/test");
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  const KEYS = ["←", "→", "A", "D", "Space", "↑", "P"], TOUCH = ["Tap to start", "Tap ▶ to resume", "Tap to play again"];
  const notes = {};
  for (const [label, c] of [["desktop", ctx], ["phone", phone]]) {
    p = await lib.open(c, base, "games/poodle-jump/");
    const drawn = (set) => p.evaluate((set) => new Promise((res) => {
      eval(set);
      const g = __game.ctx, o = g.fillText, seen = [];
      g.fillText = function (t) { seen.push(String(t)); return o.apply(this, arguments); };
      requestAnimationFrame(() => requestAnimationFrame(() => { g.fillText = o; res(seen); }));
    }), set);
    const start = await drawn(""), paused = await drawn("__game.start(); __game.paused = true"), over = await drawn("__game.paused = false; __game.state = 'over'");
    const all = [].concat(start, paused, over);
    notes[label] = { keys: KEYS.filter((k) => all.includes(k)), touch: TOUCH.filter((t) => all.includes(t)), menuKey: over.includes("⌫"), games: all.filter((t) => /Esc|all games/.test(t)) };
    await done(p, label + " notes");
  }
  check("poodle-jump: the start, pause and game-over notes show keys on a desktop and touch wording on a phone",
    notes.desktop.keys.length === KEYS.length && notes.desktop.touch.length === 0 && notes.phone.keys.length === 0 && notes.phone.touch.length === TOUCH.length, notes);
  check("poodle-jump: the game-over note names [⌫] for the menu on a desktop, and not on a phone (no key to press)",
    notes.desktop.menuKey && !notes.phone.menuKey, { desktop: notes.desktop.menuKey, phone: notes.phone.menuKey });
  // (the ← Games button names its own key: the notes used to say it again)
  check("poodle-jump: no note repeats the way out to the games", notes.desktop.games.length === 0 && notes.phone.games.length === 0, { desktop: notes.desktop.games, phone: notes.phone.games });
  await phone.close();

  // ---- Game Over on a touch-only phone: there's no Backspace, so the note has
  // a Menu button; a tap on it goes back to the start card, a tap anywhere
  // else plays again. With a keyboard there's no button, and a click there
  // plays again as it always did.
  {
    const got = {};
    for (const [label, opts] of [["phone", devices["Pixel 7"]], ["desktop", {}]]) {
      const c = await lib.newContext(browser, opts);
      const q = await lib.open(c, base, "games/poodle-jump/");
      const frames = "requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(";
      // a finished run with its result showing (past the beat in which a tap is ignored)
      const over = () => q.evaluate(() => new Promise((res) => {
        __game.start(); __game.score = 7; __game.finishDeath(); __game.overTimer = 0;
        requestAnimationFrame(() => requestAnimationFrame(() => { __game.overTimer = 0; res({ state: __game.state, btn: __game.menuBtn || null, w: CONFIG.W, h: CONFIG.H }); }));
      }));
      // a tap at a point given in the canvas's own units
      const tap = (x, y) => q.evaluate(([x, y]) => new Promise((res) => {
        const cv = __game.ctx.canvas, r = cv.getBoundingClientRect();
        cv.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.left + x * r.width / CONFIG.W, clientY: r.top + y * r.height / CONFIG.H, bubbles: true }));
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res({ state: __game.state, score: __game.score }))));
      }), [x, y]);
      const a = await over();
      const spot = a.btn ? [a.btn.x + a.btn.w / 2, a.btn.y + a.btn.h / 2] : [a.w / 2, a.h / 2 + 90];
      const onButton = await tap(spot[0], spot[1]);
      const b = await over();
      const elsewhere = await tap(a.w / 2, 40);
      got[label] = { over: a.state, btn: a.btn, inside: !!a.btn && a.btn.x >= 0 && a.btn.y >= 0 && a.btn.x + a.btn.w <= a.w && a.btn.y + a.btn.h <= a.h, onButton, again: b.state, elsewhere };
      check("poodle-jump " + label + " (Game Over taps): no page errors", q.errs.length === 0, q.errs);
      await q.close();
      await c.close();
    }
    check("poodle-jump, phone: Game Over's note has a Menu button; a tap on it goes back to the start card, a tap elsewhere plays again",
      got.phone.over === "over" && got.phone.inside && got.phone.onButton.state === "start" && got.phone.onButton.score === 0 && got.phone.again === "over" && got.phone.elsewhere.state === "play", got.phone);
    check("poodle-jump, desktop: no Menu button on Game Over (Backspace is the menu); a click anywhere plays again",
      got.desktop.over === "over" && got.desktop.btn === null && got.desktop.onButton.state === "play" && got.desktop.elsewhere.state === "play", got.desktop);
  }

  // ---- Game Over: Backspace goes back to the start card, but not in its first
  // second (a key held from the run); Esc still leaves for the games page
  p = await lib.open(ctx, base, "games/poodle-jump/");
  await p.evaluate(() => { __game.start(); __game.score = 42; __game.finishDeath(); });
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const early = await p.evaluate(() => __game.state);
  await p.waitForTimeout(1300);
  await p.waitForFunction(() => !(__game.menuGrace > 0), null, { timeout: 5000 });   // (game time: slower than the clock on a busy machine)
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  const back = await p.evaluate(() => ({ state: __game.state, score: __game.score }));
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const play = await p.evaluate(() => __game.state);
  check("poodle-jump: on Game Over, Backspace goes back to the start card (not in the first second), and Space plays from there",
    early === "over" && back.state === "start" && back.score === 0 && play === "play" && p.leaves === 0, { early, back, play, leaves: p.leaves });
  await p.evaluate(() => { __game.finishDeath(); });
  await p.waitForTimeout(200);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  check("poodle-jump: on Game Over, Esc still leaves for the games page", p.leaves === 1, p.leaves);
  await done(p, "game over keys");

  // ---- the propeller turns steadily: grabbed, its blades carry on from
  // where they stood on the platform; worn, they turn the same small step
  // each frame of game time (by the wall clock, a fifth of a turn a frame and
  // more on a late one, they juddered); dropped, they carry on again. The
  // game's own frames, taken by hand (60 a second).
  p = await lib.open(ctx, base, "games/poodle-jump/");
  const prop = await p.evaluate(() => {
    const g = __game, pl = g.player;
    g.start();
    const plat = g.platforms.reduce((a, b) => (Math.abs(b.y - pl.y) < Math.abs(a.y - pl.y) ? b : a));
    const it = new PowerUp(plat, "propeller");
    plat.powerup = it;
    it.spin = 1.234;
    pl.x = it.x; pl.y = it.y; pl.vy = 0;                         // (on it)
    g.update(1 / 60);
    const spinOf = () => (typeof pl.propSpin === "number" ? pl.propSpin : NaN);   // (none to read: NaN, and the check fails)
    const grabbed = { kind: pl.powerup && pl.powerup.kind, at: spinOf(), was: 1.234 };
    const steps = [];
    for (let i = 0; i < 90; i++) { const a = spinOf(); g.update(1 / 60); g.render(); steps.push(+(spinOf() - a).toFixed(4)); }
    const before = spinOf();
    pl.powerup.timer = 0.00001;
    g.update(1 / 60); g.update(1 / 60);
    const gear = g.gears.find((x) => x.kind === "propeller");
    return { grabbed, steps: [Math.min(...steps), Math.max(...steps)], dropped: gear ? { spin: +gear.spin.toFixed(3), before: +before.toFixed(3) } : null };
  });
  check("poodle-jump: a grabbed propeller's blades carry on from where they stood, turn the same small step each frame while worn, and carry on as it falls off",
    prop.grabbed.kind === "propeller" && Math.abs(prop.grabbed.at - prop.grabbed.was) < 0.2 && prop.steps[0] > 0.1 && prop.steps[1] < 0.2 && prop.steps[1] - prop.steps[0] < 0.01 &&
      !!prop.dropped && Math.abs(prop.dropped.spin - prop.dropped.before) < 0.5, prop);
  await done(p, "propeller");

  // ---- the hint line under the game names moving and shooting, and not the
  // pause (the ⏸ button in the corner row wears its key)
  p = await lib.open(ctx, base, "games/poodle-jump/");
  const hintLine = await p.evaluate(() => document.getElementById("hint").textContent.replace(/\s+/g, " ").trim());
  check("poodle-jump: the hint line names Move and Shoot, and leaves the pause to the corner's ⏸ button", /Move/.test(hintLine) && /Shoot/.test(hintLine) && !/Pause/i.test(hintLine), hintLine);
  await done(p, "hint line");

  await ctx.close();
};
