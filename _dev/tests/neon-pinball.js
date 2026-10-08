// Neon Pinball: a flipper hits a ball rolling on it at 60 Hz (and 30 Hz), not
// only on a fast screen; a plunge too weak to clear the gate rolls back to the
// plunger instead of draining, and a quick tap on LAUNCH plunges properly;
// keys do nothing under the pause card, and a flipper held when the tab loses
// focus drops; the ball save starts at the launch and, like the skill shot,
// waits out a pause; the start card's best is current after a game. Frames
// (and performance.now) are stepped by the test, so physics runs at exactly
// the refresh rate asked for, however busy the machine is.
const HOOK = ["start: startGame,", "start: startGame, over: gameOver,"];
// set up an end of ball: the bonus waiting to count, the multiplier, which ball, no ball save left
const RIG = ["setScore: (n) => { addScore(n); },", "setScore: (n) => { addScore(n); }, rig: (o) => { if (o.bonus != null) bonus = o.bonus; if (o.mult != null) mult = o.mult; if (o.ball != null) ballNum = o.ball; saveUsed = true; },"];
const STEPPED = () => {
  let t = 1000, q = [];
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__frames = (n, hz) => {
    for (let i = 0; i < n; i++) {
      t += 1000 / (hz || 60);
      const run = q; q = [];
      run.forEach((cb) => { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } });
    }
  };
};

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  let ctx = await lib.newContext(browser);
  let p = await lib.open(ctx, base, "games/neon-pinball/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/neon-pinball/game.js", [HOOK, RIG]); } });
  const st = () => p.evaluate(() => NeonPinball.state());

  // ---- flippers: a ball fed down the left inlane, flipped as it rolls d px
  // along the flipper; and a ball at rest on the flipper, flipped
  const flips = await p.evaluate(() => {
    const out = {};
    for (const hz of [30, 60]) {
      const row = [];
      for (const dFlip of [30, 40, 50]) {
        NeonPinball.start("classic"); __frames(2, hz);
        NeonPinball.place(100, 640, 40, 120);
        let flipped = false, up = false;
        for (let i = 0; i < hz * 2; i++) {
          __frames(1, hz);
          const b = NeonPinball.state().balls[0]; if (!b || b.inLane) break;
          const d = (b.x - 138) * Math.cos(0.4) + (b.y - 694) * Math.sin(0.4);
          if (!flipped && d >= dFlip && b.y > 680) { NeonPinball.flip("L", true); flipped = true; }
          if (flipped && b.y < 600) { up = true; break; }
        }
        NeonPinball.flip("L", false);
        row.push("roll" + dFlip + (up ? ":up" : ":MISS"));
      }
      for (const d of [25, 45, 60]) {
        NeonPinball.start("classic"); __frames(2, hz);
        NeonPinball.place(138 + d * Math.cos(0.4) + 18.5 * Math.sin(0.4), 694 + d * Math.sin(0.4) - 18.5 * Math.cos(0.4), 0, 0);
        NeonPinball.flip("L", true);
        let up = false;
        for (let i = 0; i < hz; i++) { __frames(1, hz); const b = NeonPinball.state().balls[0]; if (b && !b.inLane && b.y < 600) { up = true; break; } }
        NeonPinball.flip("L", false);
        row.push("rest" + d + (up ? ":up" : ":MISS"));
      }
      out[hz] = row;
    }
    return out;
  });
  check("neon-pinball: at 60 Hz and 30 Hz a flipper hits a ball rolling or resting on it", [...flips[30], ...flips[60]].every((r) => /:up$/.test(r)), flips);

  // ---- two weak plunges in a row: the ball comes back to the plunger both times
  const weak = await p.evaluate(() => {
    NeonPinball.start("classic"); __frames(2);
    const out = [];
    for (let k = 0; k < 2; k++) {
      NeonPinball.launchNow(0.1);
      __frames(180);
      const s = NeonPinball.state();
      out.push({ state: s.state, ball: s.ballNum, inLane: s.balls[0] && s.balls[0].inLane, save: document.getElementById("lampSave").classList.contains("on") });
    }
    return out;
  });
  check("neon-pinball: a plunge too weak to clear the gate rolls back to the plunger, not down the drain",
    weak.every((w) => w.state === "ready" && w.ball === 1 && w.inLane && w.save), weak);

  // ---- keys under the pause card: no TILT from nudges, no launch from Space
  await p.evaluate(() => { NeonPinball.start("classic"); __frames(2); NeonPinball.launchNow(0.9); __frames(5); });
  await p.keyboard.press("p");
  for (let i = 0; i < 3; i++) await p.keyboard.press("z");
  const tilt = await st();
  await p.keyboard.press("p");
  await p.evaluate(() => { NeonPinball.start("classic"); __frames(2); });
  await p.keyboard.press("p");
  await p.keyboard.down(" "); await p.keyboard.up(" ");
  const plunge = await st();
  await p.keyboard.press("p");
  check("neon-pinball: keys do nothing while paused (no TILT from nudging, no launch)", !tilt.tilted && plunge.state === "ready", { tilted: tilt.tilted, state: plunge.state });

  // ---- a flipper held as the tab loses focus (it pauses; the key comes up elsewhere)
  await p.evaluate(() => { NeonPinball.start("classic"); __frames(2); NeonPinball.launchNow(0.9); __frames(5); });
  await p.keyboard.down("ArrowLeft");
  const held = await p.evaluate(() => { __frames(5); return NeonPinball.geom().flippers[0].theta; });
  await p.evaluate(() => window.dispatchEvent(new Event("blur")));
  const dropped = await p.evaluate(() => { const card = document.querySelector(".gs-pause"); const paused = !card.hidden; card.querySelector("button").click(); __frames(10); return { paused, theta: NeonPinball.geom().flippers[0].theta }; });
  await p.keyboard.up("ArrowLeft");
  check("neon-pinball: a flipper held when the tab loses focus drops", held < 0 && dropped.paused && Math.abs(dropped.theta - 0.4) < 1e-6, { held, dropped });

  // ---- the ball save starts at the launch: 8 s on the plunger, launch, drain at once
  const late = await p.evaluate(() => {
    NeonPinball.start("classic"); __frames(2);
    __frames(480);
    NeonPinball.launchNow(0.9); __frames(10);
    NeonPinball.place(220, 800, 0, 600); __frames(5);
    const s = NeonPinball.state();
    return { state: s.state, ball: s.ballNum };
  });
  check("neon-pinball: the ball save starts at the launch, not while the ball waits on the plunger", late.state === "ready" && late.ball === 1, late);

  // ---- and a pause holds it, and the skill shot: launch, pause 8 s, resume
  await p.evaluate(() => { NeonPinball.start("classic"); __frames(2); NeonPinball.launchNow(0.9); __frames(5); });
  await p.keyboard.press("p");
  await p.evaluate(() => __frames(480));
  await p.keyboard.press("p");
  const held2 = await p.evaluate(() => {
    const skill = NeonPinball.state().skillLeft;
    NeonPinball.place(220, 800, 0, 600); __frames(5);
    const s = NeonPinball.state();
    return { skill, state: s.state, ball: s.ballNum };
  });
  check("neon-pinball: a pause holds the ball save and the skill shot", held2.skill > 3500 && held2.state === "ready" && held2.ball === 1, held2);

  // ---- the end-of-ball bonus scores like any other points: 198,000 on the
  // board, a 5,000 bonus at ×2, so the count crosses the 200k extra ball
  const bonusEnd = async (ball) => {
    await p.evaluate((ball) => {
      NeonPinball.start("classic"); __frames(2);
      NeonPinball.setScore(198000);
      NeonPinball.rig({ bonus: 5000, mult: 2, ball });
      NeonPinball.launchNow(0.9); __frames(5);
      NeonPinball.place(220, 800, 0, 600); __frames(5);   // straight down the drain
    }, ball);
    // (the count runs on timers, not frames)
    await p.waitForFunction(() => NeonPinball.state().state !== "drain", null, { timeout: 8000, polling: 50 });
    return p.evaluate(() => { const s = NeonPinball.state(); return { state: s.state, ball: s.ballNum, score: s.score, extra: s.extraBalls, best: Number(localStorage.getItem("pinball_best")) }; });
  };
  const b1 = await bonusEnd(1);
  check("neon-pinball: an extra ball the end-of-ball bonus crosses is awarded: shoot again", b1.state === "ready" && b1.ball === 1 && b1.extra === 0, b1);
  check("neon-pinball: (guard) the bonus counts ×mult once, and the best is saved through it", b1.score === 208000 && b1.best === 208000, b1);
  const b3 = await bonusEnd(3);
  check("neon-pinball: on the last ball, an extra ball earned in the bonus count plays on instead of ending the game", b3.state === "ready" && b3.ball === 3 && b3.score === 208000, b3);

  // ---- the start card's best after a game (above the 208,000 just above)
  const best = await p.evaluate(() => { NeonPinball.start("classic"); NeonPinball.setScore(345678); NeonPinball.over(); document.getElementById("modesBtn").click(); return document.getElementById("startBest").textContent; });
  check("neon-pinball: the start card shows the best just set, after a game", /345,678/.test(best), best);
  check("neon-pinball: no page errors", p.errs.length === 0, p.errs);
  await ctx.close();

  // ---- touch: a quick tap on LAUNCH sends the ball past the gate
  ctx = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(ctx, base, "games/neon-pinball/", { before: (pg) => pg.addInitScript(STEPPED) });
  await p.evaluate(() => { NeonPinball.start("classic"); __frames(2); });
  await p.tap("#launchBtn", { force: true });
  const tap = await p.evaluate(() => {
    let minY = 1e9;
    for (let i = 0; i < 120; i++) { __frames(1); const b = NeonPinball.state().balls[0]; if (b) minY = Math.min(minY, b.y); }
    return { minY: Math.round(minY), state: NeonPinball.state().state };
  });
  check("neon-pinball: a quick tap on LAUNCH plunges the ball past the gate", tap.minY < 150, tap);
  check("neon-pinball: no page errors (touch)", p.errs.length === 0, p.errs);
  await ctx.close();

  // ---- key hints: the start card's controls and the plunger line name keys
  // with a keyboard, and the taps that work on a touch-only phone
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    ctx = await lib.newContext(browser, opts);
    p = await lib.open(ctx, base, "games/neon-pinball/");
    const card = await p.evaluate(() => document.getElementById("startScreen").innerText);
    await p.evaluate(() => NeonPinball.start("classic"));
    const hint = await p.evaluate(() => document.getElementById("flipHint").innerText);
    if (label === "phone") check("neon-pinball: on a touch-only phone the start card and plunger line say tap / LAUNCH, no keys",
      /tap the left or right half/.test(card) && /LAUNCH/.test(card) && !/Space|nudge/.test(card) && /LAUNCH/.test(hint) && /lane/.test(hint) && !/Space/.test(hint), { card, hint });
    else check("neon-pinball: with a keyboard the start card and plunger line name the keys",
      /Space/.test(card) && /nudge/.test(card) && !/tap the left/.test(card) && /Space/.test(hint) && !/LAUNCH/.test(hint), { card, hint });
    await ctx.close();
  }
};
