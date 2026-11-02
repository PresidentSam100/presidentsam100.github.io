// Neon Pinball: a flipper hits a ball rolling on it at 60 Hz (and 30 Hz), not
// only on a fast screen; a plunge too weak to clear the gate rolls back to the
// plunger instead of draining, and a quick tap on LAUNCH plunges properly;
// keys do nothing under the pause card, and a flipper held when the tab loses
// focus drops; the ball save starts at the launch and, like the skill shot,
// waits out a pause; the start card's best is current after a game; a top
// lane's points show where it was rolled over (rising with Visual FX on, still
// with it off, held by a pause), and a bumper's (several a second) don't. Frames
// (and performance.now) are stepped by the test, so physics runs at exactly
// the refresh rate asked for, however busy the machine is. On a 2× screen the
// table is drawn at the screen's own resolution.
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

  // ---- a top lane rolled over shows its points there: "+1,500", what it
  // added to the score; it rises as it fades with Visual FX on and only fades
  // with it off, is gone within a second, and a pause holds it. A bumper hit
  // (several a second) shows none.
  const LANE = () => {
    // a fresh ball dropped slowly through each top lane in turn, until one
    // scores a plain lane (not the skill shot): its delta, pops and lane
    for (let i = 0; i < NeonPinball.geom().lanes.length; i++) {
      NeonPinball.start("classic"); __frames(2); NeonPinball.launchNow(0.9); __frames(3);
      const l = NeonPinball.geom().lanes[i];
      NeonPinball.place(l.cx, l.y - l.h / 2 + 2, 0, 40);
      const s0 = NeonPinball.state().score;
      let hit = null;
      for (let k = 0; k < 20 && !hit; k++) { __frames(1); const s = NeonPinball.state().score; if (s !== s0) hit = { delta: s - s0, pops: NeonPinball.pops() }; }
      if (hit && hit.delta === 1500) return { l: { cx: l.cx, y: l.y, h: l.h }, hit };
    }
    return null;
  };
  const popRun = (off) => p.evaluate(([off, LANE]) => {
    if (!NeonPinball.pops) return null;
    const RM = window.RM_ON; window.RM_ON = () => off;
    // a bumper: scored, nothing shown
    NeonPinball.start("classic"); __frames(2); NeonPinball.launchNow(0.9); __frames(3);
    const bm = NeonPinball.bumpers()[0];
    NeonPinball.place(bm.x, bm.y - bm.r - 12, 0, 300);
    const b0 = NeonPinball.state().score;
    let bump = null;
    for (let i = 0; i < 30 && !bump; i++) { __frames(1); const s = NeonPinball.state().score; if (s !== b0) bump = { delta: s - b0, pops: NeonPinball.pops().length }; }
    const lane = eval("(" + LANE + ")")();
    NeonPinball.over();   // (nothing more scores; the pop plays out)
    const seen = [];
    for (let f = 0; f <= 60; f += 10) { seen.push(NeonPinball.pops()[0] || null); __frames(10); }
    window.RM_ON = RM;
    return { bump, lane, seen };
  }, [off, LANE.toString()]);
  const popOn = await popRun(false), popOff = await popRun(true);
  const atLane = (r) => !!r && !!r.lane && r.lane.hit.pops.length === 1 && r.lane.hit.pops[0].text === "+1,500" &&
    Math.abs(r.lane.hit.pops[0].x - r.lane.l.cx) <= 1 && r.lane.hit.pops[0].y <= r.lane.l.y + r.lane.l.h / 2 + 13 && r.lane.hit.pops[0].y >= r.lane.l.y - 30 &&
    !!r.bump && r.bump.delta % 750 === 0 && r.bump.pops === 0;
  check("neon-pinball: a top lane rolled over shows \"+1,500\" just under the lane, exactly what it added; a bumper hit shows none",
    atLane(popOn) && atLane(popOff), { on: popOn && { lane: popOn.lane, bump: popOn.bump }, off: popOff && { lane: popOff.lane, bump: popOff.bump } });
  check("neon-pinball: with Visual FX on the points rise as they fade; with it off they hold still and only fade; either way they're gone within a second",
    !!popOn && !!popOff && popOn.seen[2].y < popOn.seen[0].y - 8 && popOn.seen[4].a < 1 && popOn.seen[6] === null &&
    popOff.seen.slice(0, 5).every((q) => q && q.y === popOff.seen[0].y) && popOff.seen[4].a < 1 && popOff.seen[6] === null,
    { on: popOn && popOn.seen, off: popOff && popOff.seen });
  const popPaused = await (async () => {
    const t0 = await p.evaluate((LANE) => {
      if (!NeonPinball.pops) return null;
      const lane = eval("(" + LANE + ")")();
      return lane && NeonPinball.pops()[0] || null;
    }, LANE.toString());
    if (!t0) return { t0 };
    await p.keyboard.press("p");
    const held = await p.evaluate(() => { __frames(120); return NeonPinball.pops()[0] || null; });
    await p.keyboard.press("p");
    const after = await p.evaluate(() => { NeonPinball.over(); __frames(60); return NeonPinball.pops().length; });
    return { t0, held, after };
  })();
  check("neon-pinball: under the pause card the points stay as they were, and play out once it's put away",
    !!popPaused.t0 && !!popPaused.held && popPaused.held.t === popPaused.t0.t && popPaused.held.text === popPaused.t0.text && popPaused.after === 0, popPaused);

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

  // ---- a 2× screen: the table has at least two backing pixels for every
  // page pixel it covers, either way (it had 440 × 760 times 2, under that
  // where the table is shown larger), drawn in the game's units, before and
  // after a resize
  ctx = await lib.newContext(browser, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  p = await lib.open(ctx, base, "games/neon-pinball/");
  const fitted = () => p.evaluate(() => {
    const c = document.getElementById("pf"), t = c.getContext("2d").getTransform();
    return { k: +(c.width / c.clientWidth).toFixed(2), kh: +(c.height / c.clientHeight).toFixed(2), sx: +(t.a / (c.width / 440)).toFixed(3), sy: +(t.d / (c.height / 760)).toFixed(3) };
  });
  const big = await fitted();
  await p.setViewportSize({ width: 1280, height: 700 }); await p.waitForTimeout(300);
  const small = await fitted();
  check("neon-pinball: on a 2× screen the table is drawn at the screen's own resolution in the game's units, before and after a resize",
    [big, small].every((r) => r.k >= 1.95 && r.kh >= 1.95 && r.sx === 1 && r.sy === 1), { big, small });
  check("neon-pinball (2×): no page errors", p.errs.length === 0, p.errs);
  await ctx.close();

  // ---- the table keeps its 440 x 760 shape on a tall window and on phones
  // (a full height with a max-width squeezed it to 0.88 of its width), whole
  // on the screen
  const shapes = {};
  for (const [label, opts] of [["1920x1080", { viewport: { width: 1920, height: 1080 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }], ["phone", devices["Pixel 7"]], ["320x568", Object.assign({}, devices["iPhone SE"], { viewport: { width: 320, height: 568 } })]]) {
    ctx = await lib.newContext(browser, opts);
    p = await lib.open(ctx, base, "games/neon-pinball/");
    await p.evaluate(() => NeonPinball.start("classic")); await p.waitForTimeout(200);
    shapes[label] = await p.evaluate(() => { const c = document.getElementById("pf"), b = c.getBoundingClientRect(); return { shape: +((c.clientWidth / c.clientHeight) / (440 / 760)).toFixed(3), whole: b.top >= 0 && b.bottom <= innerHeight + 0.5 && b.left >= 0 && b.right <= innerWidth + 0.5 }; });
    await ctx.close();
  }
  check("neon-pinball: the table keeps its own shape (440 x 760), whole on the screen, on a tall window, a short one and phones",
    Object.values(shapes).every((s) => Math.abs(s.shape - 1) <= 0.01 && s.whole), shapes);

  // ---- a browser with no sound to give (no Web Audio, as Playwright's
  // WebKit on Windows): the game still starts, launches and scores, silent
  {
    const ctx = await lib.newContext(browser);
    const p = await lib.open(ctx, base, "games/neon-pinball/", { before: (pg) => pg.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; }) });
    const r = await p.evaluate(() => {
      const before = typeof window.AudioContext;
      NeonPinball.start("classic"); NeonPinball.launchNow(0.9); NeonPinball.setScore(10);
      return { before, state: NeonPinball.state().state, score: NeonPinball.state().score };
    });
    await p.waitForTimeout(300);
    check("neon-pinball: with no sound to be had (no Web Audio) the game still starts, launches and scores, with no page errors",
      r.before === "undefined" && r.state !== "ready" && r.score >= 10 && p.errs.length === 0, { r, errs: p.errs });
    await ctx.close();
  }
};
