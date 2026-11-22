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

  // ---- the maker's name on the apron: SAM LU on a plate on the left apron
  // panel, on all three tables in each table's flipper colour, its letters
  // inside the plate; clear of the left flipper's whole sweep (rest to
  // raised, its tapered bat), of the drain between the flipper tips and of
  // the tilt meter; drawn with the table, so it shakes with it (the same
  // offset as the table's wordmark in that frame); and the same every frame,
  // with Visual FX on or off and under the pause (nothing in it moves).
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/neon-pinball/", { before: (pg) => pg.addInitScript(STEPPED) });
    const r = await q.evaluate(() => {
      if (!NeonPinball.maker) return null;
      const seen = [];
      const real = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (s) { if (/^[A-Z]{5,}$/.test(String(s))) { const t = this.getTransform(); seen.push({ s: String(s), e: +t.e.toFixed(2), f: +t.f.toFixed(2) }); } return real.apply(this, arguments); };
      // (its look; where it sits is the table's shake, checked below)
      const look = (d) => d && [d.text, d.color, d.glow, d.blur, d.left, d.right].join("|");
      const out = { tables: {} };
      for (const mode of ["classic", "speedway", "tactical"]) { NeonPinball.start(mode); __frames(2); const d = NeonPinball.maker().drawn; out.tables[mode] = d && { text: d.text, color: d.color }; }
      NeonPinball.start("classic"); __frames(2);
      const m = NeonPinball.maker(); out.plate = m.plate; out.flips = m.flips; out.drawn = m.drawn;
      // the same over frames, with FX off, and paused
      const a = look(NeonPinball.maker().drawn); __frames(5); const b = look(NeonPinball.maker().drawn);
      const RM = window.RM_ON; window.RM_ON = () => true; __frames(5); const off = look(NeonPinball.maker().drawn); window.RM_ON = RM;
      out.steady = { a, b, off };
      // a shake: the plate's offset is the table's own (its wordmark's) in each frame
      const shook = [];
      for (let i = 0; i < 6; i++) { NeonPinball.shake(30); seen.length = 0; __frames(1); const d = NeonPinball.maker().drawn, w = seen.find((x) => x.s === "CLASSIC"); shook.push({ plate: [d.e, d.f], table: w && [w.e, w.f] }); }
      out.shook = shook;
      CanvasRenderingContext2D.prototype.fillText = real;
      return out;
    });
    let paused = null;
    if (r) {
      await q.keyboard.press("p");
      paused = await q.evaluate(() => { __frames(5); const d = NeonPinball.maker().drawn; return d && [d.text, d.color, d.glow, d.blur, d.left, d.right].join("|"); });
      await q.keyboard.press("p");
    }
    // ---- under the pause card the table holds still: paused mid-shake, its
    // offset stays where it was (a fresh one each frame trembled for good: the
    // shake only dies down in play); the skill lane's flash and the ball's
    // tail stay as they were (the lamp went on flashing, the tail shrank into
    // the ball)
    // (the table's offset read from its wordmark, CLASSIC, as it is drawn)
    let hold = null;
    if (await q.evaluate(() => !!NeonPinball.shake)) {
      await q.evaluate(() => { NeonPinball.start("classic"); __frames(2); NeonPinball.launchNow(0.9); __frames(2); NeonPinball.place(150, 470, 60, 300); __frames(6); NeonPinball.shake(30); __frames(1); });
      await q.keyboard.press("p");
      hold = await q.evaluate(() => {
        const real = CanvasRenderingContext2D.prototype.fillText, seen = [];
        let at = null;
        CanvasRenderingContext2D.prototype.fillText = function (s) { if (String(s) === "CLASSIC") { const t = this.getTransform(); at = t.e.toFixed(2) + "," + t.f.toFixed(2); } return real.apply(this, arguments); };
        for (let i = 0; i < 30; i++) { at = null; __frames(1); const s = NeonPinball.state(); seen.push({ at, skill: s.skillDrawn, tail: s.balls[0] && s.balls[0].tail }); }
        CanvasRenderingContext2D.prototype.fillText = real;
        return { shaken: !!seen[0].at && seen[0].at !== "0.00,0.00", at: [...new Set(seen.map((x) => x.at))], skill: [...new Set(seen.map((x) => x.skill))], tail: [...new Set(seen.map((x) => x.tail))] };
      });
      await q.keyboard.press("p");
    }
    check("neon-pinball: under the pause card the table holds still: paused mid-shake it keeps its offset, and the skill lane's flash and the ball's tail stay as they were",
      !!hold && hold.shaken && hold.at.length === 1 && hold.skill.length === 1 && /^flash/.test(hold.skill[0]) && hold.tail.length === 1 && hold.tail[0] > 5, hold);
    const THEMES = { classic: "#36f5ff", speedway: "#c060ff", tactical: "#46e6a0" };
    check("neon-pinball: SAM LU is printed on the apron of all three tables, in each table's flipper colour",
      !!r && Object.keys(THEMES).every((k) => r.tables[k] && r.tables[k].text === "SAM LU" && r.tables[k].color === THEMES[k]), r && r.tables);
    // the plate against the left apron panel, the flipper's sweep, the drain and the tilt meter
    let geo = null;
    if (r) {
      const P = r.plate, inPanel = (x, y) => {
        // the panel: (48,712) (136,700) (196,752) (48,752)
        const top = 712 - (x - 48) * 12 / 88, right = 136 + (y - 700) * 60 / 52;
        return x >= 48 && y >= top && y <= 752 && x <= right;
      };
      const corners = [[P.x, P.y], [P.x + P.w, P.y], [P.x, P.y + P.h], [P.x + P.w, P.y + P.h]];
      const L = r.flips.find((f) => f.px < 220);
      let gap = Infinity;
      for (let i = 0; i <= 40; i++) {
        const th = L.act + (L.rest - L.act) * i / 40, rb = L.r + 2.5, rt = Math.max(4, L.r - 3.5);
        for (let j = 0; j <= 32; j++) {
          const s = L.len * j / 32, cx = L.px + s * Math.cos(th), cy = L.py + s * Math.sin(th), rad = rb + (rt - rb) * j / 32;
          const dx = Math.max(P.x - cx, 0, cx - (P.x + P.w)), dy = Math.max(P.y - cy, 0, cy - (P.y + P.h));
          gap = Math.min(gap, Math.hypot(dx, dy) - rad);
        }
      }
      const tipX = L.px + L.len * Math.cos(L.rest);
      geo = { corners: corners.every(([x, y]) => inPanel(x, y)), sweepGap: +gap.toFixed(1), drain: P.x + P.w < tipX, tilt: P.y + P.h < 742 || P.x > 94,
        letters: !!r.drawn && r.drawn.left >= P.x + 3 && r.drawn.right <= P.x + P.w - 3, drawn: r.drawn };
    }
    check("neon-pinball: the maker's plate sits on the left apron panel, its letters inside it, clear of the left flipper's whole sweep, the drain between the tips and the tilt meter",
      !!geo && geo.corners && geo.sweepGap >= 3 && geo.drain && geo.tilt && geo.letters, geo);
    check("neon-pinball: the maker's plate shakes with the table (the same offset as the table's wordmark, frame by frame)",
      !!r && r.shook.every((x) => x.table && x.plate[0] === x.table[0] && x.plate[1] === x.table[1]) && r.shook.some((x) => x.plate[0] !== 0 || x.plate[1] !== 0), r && r.shook);
    check("neon-pinball: the maker's plate is the same every frame, with Visual FX on or off and under the pause",
      !!r && !!r.steady.a && r.steady.a === r.steady.b && r.steady.a === r.steady.off && r.steady.a === paused, { steady: r && r.steady, paused });
    check("neon-pinball (maker's plate): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- the plunger line keeps one line along the table's foot: on a phone
  // under the LAUNCH button (kept to the room beside it, it took two lines
  // on a small phone, the upper across the left flipper), never over the
  // button or the maker's plate; on a laptop under the plate too. The
  // plate's name reads at a clear size wherever the table is small. And the
  // table shows on every screen: its backing store is exactly 11:19, so its
  // height holds still (rounded to another shape it moved a pixel, refit,
  // and so on every frame, each refit wiping the frame: on a 360 x 560 phone
  // the table never showed).
  {
    const rows = {};
    const SIZES = [["1280x900", { viewport: { width: 1280, height: 900 } }], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }],
      ["Pixel 7", devices["Pixel 7"]], ["360x560", { viewport: { width: 360, height: 560 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ["320x568", Object.assign({}, devices["iPhone SE"], { viewport: { width: 320, height: 568 } })],
      ["375x553", { viewport: { width: 375, height: 553 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]];
    for (const [label, opts] of SIZES) {
      const c = await lib.newContext(browser, opts);
      const q = await lib.open(c, base, "games/neon-pinball/");
      await q.evaluate(() => NeonPinball.start("classic"));
      rows[label] = await q.evaluate(() => new Promise((res) => {
        const cv = document.getElementById("pf"), sizes = new Set();
        let n = 0;
        (function f() {
          sizes.add(cv.width + "x" + cv.height);
          if (++n < 12) return requestAnimationFrame(f);
          const g = cv.getContext("2d"), d = g.getImageData(0, 0, cv.width, cv.height).data;
          let lit = 0;
          for (let i = 0; i < d.length; i += 4 * 61) if (d[i] + d[i + 1] + d[i + 2] > 160) lit++;
          const b = cv.getBoundingClientRect(), s = b.height / 760, m = NeonPinball.maker ? NeonPinball.maker().plate : { x: 56, y: 716, w: 88, h: 18 };
          const plate = { l: b.left + m.x * s, t: b.top + m.y * s, r: b.left + (m.x + m.w) * s, b: b.top + (m.y + m.h) * s };
          const hint = document.getElementById("flipHint"), rg = document.createRange(); rg.selectNodeContents(hint);
          const lines = [...rg.getClientRects()].map((x) => ({ l: x.left, t: x.top, r: x.right, b: x.bottom }));
          const lb = document.getElementById("launchBtn"), launch = lb.getClientRects().length ? lb.getBoundingClientRect() : null;
          const meet = (a, z) => !!z && a.l < z.right - 0.5 && z.left < a.r - 0.5 && a.t < z.bottom - 0.5 && z.top < a.b - 0.5;
          const meetR = (a, z) => a.l < z.r - 0.5 && z.l < a.r - 0.5 && a.t < z.b - 0.5 && z.t < a.b - 0.5;
          // (one line: every piece's middle within a few px; a key cap's box
          // stands a little taller than the words round it)
          const mids = lines.map((x) => (x.t + x.b) / 2);
          // (the plate's letters as shown, in px: their size on the table times its scale)
          const drawn = NeonPinball.maker && NeonPinball.maker().drawn, letters = +(((drawn && drawn.size) || 13) * s).toFixed(1);
          res({ sizes: [...sizes], exact: cv.width * 19 === cv.height * 11, lit, lines: lines.length, oneLine: lines.length > 0 && Math.max(...mids) - Math.min(...mids) < 6, letters,
            overLaunch: lines.some((x) => meet(x, launch)), overPlate: lines.some((x) => meetR(x, plate)), launch: !!launch });
        })();
      }));
      check("neon-pinball " + label + " (foot of the table): no page errors", q.errs.length === 0, q.errs);
      await c.close();
    }
    const all = Object.values(rows);
    check("neon-pinball: the plunger line is one line along the table's foot, never over the maker's plate, and on a phone never over the LAUNCH button",
      all.every((x) => x.oneLine && !x.overPlate && !x.overLaunch) && ["Pixel 7", "360x560", "320x568"].every((k) => rows[k].launch), rows);
    // the maker's name reads where the table is shown small: the plate fills
    // the room on the apron (13 px letters on the table were 7.3 px on a
    // short phone, under 10 on a short laptop)
    check("neon-pinball: SAM LU on the apron reads on a phone and a short laptop: letters at least 8.8 px on the smallest tables (320 x 568, 360 x 560), 14 on a Pixel 7, 10.5 at 1280 x 600 and 11.5 at 1366 x 657",
      rows["320x568"].letters >= 8.8 && rows["360x560"].letters >= 8.8 && rows["Pixel 7"].letters >= 14 && rows["1280x600"].letters >= 10.5 && rows["1366x657"].letters >= 11.5,
      Object.entries(rows).map(([k, x]) => k + ": " + x.letters + " px"));
    check("neon-pinball: the table shows on every screen (a 360 x 560 phone too): its backing store is exactly 11:19 and holds its size",
      all.every((x) => x.exact && x.sizes.length === 1 && x.lit > 20), rows);
  }

  // ---- the neon haze round the table (body::before and ::after, soft pools
  // of the table's colours, under everything, taking no clicks): with Visual
  // FX on both layers drift and breathe; held while the game is paused, and
  // moving again after Restart from the pause card; FX turned off on the way
  // holds them where they are (never back towards where they started), on
  // again they carry on; with FX off from the start they hang still. Read as
  // each layer's own clock and its place on the page.
  {
    const hc = await lib.newContext(browser);
    const look = (q) => q.evaluate(() => {
      const ls = ["::before", "::after"].map((pe) => getComputedStyle(document.body, pe));
      const clocks = document.getAnimations().filter((a) => /^np-haze/.test(a.animationName || "")).map((a) => Math.round(a.currentTime || 0)).sort((x, y) => x - y);
      return { at: ls.map((l) => l.transform), clocks,
        drawn: ls.every((l) => /radial-gradient/.test(l.backgroundImage) && l.pointerEvents === "none" && l.zIndex === "-1" && l.position === "fixed") };
    });
    // (moving is waited for, up to a few seconds: a busy machine can give a
    // page few frames, and a fixed window then sees too little of it)
    const moves = async (q) => {
      const a = await look(q);
      await q.waitForFunction((a) => ["::before", "::after"].every((pe, i) => getComputedStyle(document.body, pe).transform !== a.at[i]), a, { timeout: 6000, polling: 100 }).catch(() => {});
      const b = await look(q);
      return { a, b, moving: a.at.every((t, i) => t !== b.at[i]) && b.clocks.length === 2 && b.clocks.every((c, i) => c > a.clocks[i]) };
    };
    const still = async (q, ms) => { const a = await look(q); await q.waitForTimeout(ms); const b = await look(q); return { a, b, still: a.at.every((t, i) => t === b.at[i]) && b.clocks.every((c, i) => c === a.clocks[i]) }; };
    const open = (off) => lib.open(hc, base, "games/neon-pinball/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:neon-pinball", off ? "1" : "0"); } catch (e) {} }, off) });
    let q = await open(false);
    const onCard = await moves(q);
    await q.evaluate(() => NeonPinball.start("classic"));
    await q.waitForFunction(() => NeonPinball.state().state === "ready", null, { timeout: 8000 }).catch(() => {});
    await q.keyboard.press("p");
    await q.waitForFunction(() => document.body.classList.contains("np-held"), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(150);   // (a CSS pause lands on the next frame)
    const paused = await still(q, 800);
    // Restart from the card (nothing played yet: no question)
    await q.keyboard.press("r");
    await q.waitForFunction(() => !document.body.classList.contains("np-held"), null, { timeout: 5000 }).catch(() => {});
    const again = await moves(q);
    check("neon-pinball, Visual FX on: a neon haze (two layers of soft glows, under everything, taking no clicks) drifts and breathes round the table; held while paused, moving again after Restart",
      onCard.a.drawn && onCard.moving && paused.still && again.moving, { onCard, paused, again });
    // FX turned off on the way, then on again
    const before = await look(q);
    await q.evaluate(() => document.querySelector(".rm-toggle").click());
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-off"), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(150);
    const stopped = await still(q, 700);
    await q.evaluate(() => document.querySelector(".rm-toggle").click());
    await q.waitForFunction(() => document.documentElement.classList.contains("fx-on"), null, { timeout: 5000 }).catch(() => {});
    const on = await moves(q);
    check("neon-pinball, Visual FX turned off on the way: the haze stops where it is, never back towards where it started; on again it drifts on from there",
      // (over 300 ms: well clear of a clock sent back to 0; the haze only runs
      // while it is seen moving, so on a quick machine it has had under a
      // second here)
      before.clocks.length === 2 && stopped.still && stopped.a.clocks.every((c, i) => c >= before.clocks[i] && c > 300) && on.moving && on.a.clocks.every((c, i) => c >= stopped.b.clocks[i]),
      { before, stopped, on });
    check("neon-pinball (haze): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    q = await open(true);
    const off = await still(q, 900);
    check("neon-pinball, Visual FX off: the haze hangs still, as first laid",
      off.a.drawn && off.still && off.b.clocks.every((c) => c === 0), off);
    check("neon-pinball (haze, FX off): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await hc.close();
  }
};
