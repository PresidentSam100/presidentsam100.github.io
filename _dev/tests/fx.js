// The Visual FX switch: one setting per game, shared by the ✨ button, the V
// key and any in-game control, and games follow it live.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);

  // ---- Spacer: its old "reduced flash" option is now this switch (F, V, ✨, pause menu)
  let p = await lib.open(ctx, base, "games/spacer/");
  const st = () => p.evaluate(() => ({ off: RM_ON(), game: window.game.reducedFlash, label: document.querySelector(".rm-toggle").textContent }));
  const s0 = await st();
  await p.keyboard.press("v"); const s1 = await st();
  await p.keyboard.press("f"); const s2 = await st();
  await p.click(".rm-toggle"); const s3 = await st();
  await p.click(".rm-toggle");
  const inSync = [s0, s1, s2, s3].every((s) => s.off === s.game);
  check("spacer: V, F and the ✨ button all flip the one setting, and the game follows it",
    inSync && s0.off === false && s1.off === true && s2.off === false && s3.off === true, { s0, s1, s2, s3 });

  // the pause menu's Visual FX item flips it too
  await p.keyboard.press("Enter"); await p.waitForTimeout(2500); await p.keyboard.press("Escape");
  const items0 = await p.evaluate(() => window.game.pauseItems());
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter");
  const items1 = await p.evaluate(() => window.game.pauseItems());
  const m1 = await st();
  check("spacer: the pause menu item reads VISUAL FX and flips the shared switch",
    items0[2] === "VISUAL FX: ON" && items1[2] === "VISUAL FX: OFF" && m1.off === true && m1.game === true, { items0, items1, m1 });
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".rm-toggle"); await p.waitForTimeout(300);
  const r1 = await st();
  check("spacer: the choice survives a reload, game and button agreeing", r1.off === true && r1.game === true, r1);
  check("spacer: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // a reduced-flash choice saved by the old, separate toggle carries over once
  p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(base + "games/spacer/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem("galaga_reducedflash", "1"); });
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".rm-toggle"); await p.waitForTimeout(300);
  const legacy = await p.evaluate(() => ({ off: RM_ON(), game: window.game.reducedFlash, left: localStorage.getItem("galaga_reducedflash") }));
  check("spacer: an old saved reduced-flash choice turns Visual FX off once, then is cleared", legacy.off === true && legacy.game === true && legacy.left === null, legacy);
  check("spacer (carry-over): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // the corner buttons don't keep focus after a mouse click: the Enter / Space a
  // player presses next (start, flap, drop…) must not click them again
  for (const g of ["abyss/", "jam-jar/", "flappy-world/"]) {
    p = await lib.open(ctx, base, "games/" + g);
    await p.click(".mute-toggle"); const m1 = await p.evaluate(() => MUTE_ON());
    await p.keyboard.press("Enter"); await p.keyboard.press("Space"); const m2 = await p.evaluate(() => MUTE_ON());
    await p.click(".rm-toggle"); const f1 = await p.evaluate(() => RM_ON());
    await p.keyboard.press("Enter"); await p.keyboard.press("Space"); const f2 = await p.evaluate(() => RM_ON());
    const focus = await p.evaluate(() => document.activeElement.className || document.activeElement.tagName);
    check(g + " clicking 🔊 / ✨ then pressing Enter or Space doesn't flip them again", m1 === true && m2 === true && f1 === true && f2 === true && !/toggle/.test(focus), { m1, m2, f1, f2, focus });
    await p.close();
  }

  await ctx.close();

  // ---- FX-1: the ✨ switch is the only switch, and it's marked on <html>
  // Every page in a browser whose OS asks for reduced motion: untouched, FX
  // starts off; switched on, CSS motion really runs (no page's own
  // prefers-reduced-motion copy may override the player's choice).
  const os = await lib.newContext(browser, { reducedMotion: "reduce" });
  const probe = () => p.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "animation:none 1s 2s;transition:opacity 1s 2s;position:fixed;left:-99px";
    document.body.appendChild(d);
    const cs = getComputedStyle(d), h = document.documentElement.classList;
    const out = { fxOn: h.contains("fx-on"), fxOff: h.contains("fx-off"), rm: RM_ON(), FX: FX_ON(),
      anim: parseFloat(cs.animationDuration), animDelay: parseFloat(cs.animationDelay), trans: parseFloat(cs.transitionDuration) };
    d.remove(); return out;
  });
  const bad = [];
  for (const pg of lib.gamePages()) {
    const id = pg.split("/")[0];
    p = await os.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
    await p.goto(base + "games/" + pg, { waitUntil: "domcontentloaded" });
    await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(150);
    const off = await probe();
    await p.evaluate((id) => localStorage.setItem("reduceMotion:" + id, "0"), id);
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(150);
    const on = await probe();
    const ok = off.fxOff && !off.fxOn && off.rm && !off.FX && off.anim < 0.01 && off.animDelay === 0 && off.trans < 0.01 &&
      on.fxOn && !on.fxOff && !on.rm && on.FX && on.anim === 1 && on.animDelay === 2 && on.trans === 1 && !p.errs.length;
    if (!ok) bad.push({ pg, off, on, errs: p.errs });
    await p.close();
  }
  check("every page, OS reduce-motion: FX starts off (motion and delays zeroed); switched on, CSS motion runs in full", bad.length === 0, bad.slice(0, 3));
  await os.close();

  // the <html> class follows the ✨ button live
  const c2 = await lib.newContext(browser);
  p = await lib.open(c2, base, "games/2048/");
  const cls = () => p.evaluate(() => document.documentElement.className.match(/fx-(on|off)/g).join());
  const k0 = await cls(); await p.click(".rm-toggle"); const k1 = await cls(); await p.click(".rm-toggle"); const k2 = await cls();
  check("the fx-on / fx-off class on <html> follows the ✨ button live", k0 === "fx-on" && k1 === "fx-off" && k2 === "fx-on", { k0, k1, k2 });
  await p.close();

  // a game can opt out of the blunt fallback with <html data-fx-css="own">
  p = await c2.newPage();
  await p.route(/\/games\/2048\/$/, async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("<html", '<html data-fx-css="own"') }); });
  await p.goto(base + "games/2048/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.setItem("reduceMotion:2048", "1")); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(150);
  const own = await p.evaluate(() => ({ off: document.documentElement.classList.contains("fx-off"), fallback: !!document.getElementById("rm-style") }));
  check("data-fx-css=\"own\": FX off still marks <html>, but skips the blunt fallback CSS", own.off && !own.fallback, own);
  await p.close();

  // games that used to poll the setting every 400ms now follow it at once
  for (const g of ["departures/", "lights-out/", "mahjong/", "passport/"]) {
    p = await lib.open(c2, base, "games/" + g);
    const b0 = await p.evaluate(() => document.body.classList.contains("fxon"));
    await p.click(".rm-toggle");
    const b1 = await p.evaluate(() => document.body.classList.contains("fxon"));
    check(g + " body.fxon follows the ✨ button immediately", b0 === true && b1 === false, { b0, b1 });
    await p.close();
  }

  // the shared coin flip, FX off: no flashing between the names
  p = await lib.open(c2, base, "games/tic-tac-toe/");
  await p.evaluate(() => localStorage.setItem("reduceMotion:tic-tac-toe", "1")); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  const seen = await p.evaluate(() => new Promise((res) => {
    window.coinFlip({ you: "You (X)", cpu: "CPU (O)" }, () => {});
    const log = []; let last = null; const t0 = performance.now();
    const iv = setInterval(() => {
      const el = document.querySelector(".cf-nm"); const v = el ? el.textContent + "|" + el.style.color : null;
      if (v !== last) { log.push(v); last = v; }
      if (performance.now() - t0 > 3000) { clearInterval(iv); res(log); }   // (reveal is at ~0.9s; slack for a busy machine)
    }, 25);
  }));
  const shown = seen.filter(Boolean);
  check("coin flip, FX off: a neutral ? then the winner — no flashing between names", shown.length <= 2 && /^\?/.test(shown[0]) && /You|CPU/.test(shown[shown.length - 1]), seen);
  await p.close();
  await c2.close();

  // ---- FX-2a: flashing that still ran with FX off is steady now; FX on is
  // unchanged. Each check runs both modes. (Code-reviewed but not automated:
  // Flappy's warning pipe + prompts, the police light bar, Meteor Menace and
  // Demolition Row — the same one-line gates.)
  const c3 = await lib.newContext(browser);
  const setFx = async (pg, id, off) => {
    await pg.evaluate(([id, off]) => localStorage.setItem("reduceMotion:" + id, off ? "1" : "0"), [id, off]);
    await pg.reload({ waitUntil: "domcontentloaded" }); await pg.waitForTimeout(400);
  };
  const redness = (pg, x, y) => pg.evaluate(([x, y]) => { const c = document.querySelector("canvas"); const d = c.getContext("2d").getImageData(x, y, 1, 1).data; return d[0] - (d[1] + d[2]) / 2; }, [x, y]);
  const frame = (pg) => pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const res = {};
  for (const off of [true, false]) {
    const mode = off ? "off" : "on";
    // Flappy World: the invincible bird is drawn every frame (FX off), not every other
    p = await lib.open(c3, base, "games/flappy-world/"); await setFx(p, "flappy-world", off);
    await p.keyboard.press("Space"); await p.waitForTimeout(150);
    res["flappy-" + mode] = await p.evaluate(() => new Promise((done) => {
      let draws = 0, frames = 0; const orig = game.bird.draw.bind(game.bird);
      game.bird.draw = (c) => { draws++; return orig(c); };
      const t0 = performance.now();
      (function f() { game.invincibleTime = 5; frames++; if (performance.now() - t0 < 350) requestAnimationFrame(f); else done(draws / frames); })();
    }));
    await p.close();

    // Road Bird: the train signal stays lit while warning; the police glow holds one colour
    p = await c3.newPage(); p.errs = [];
    await lib.injectScript(p, "games/road-bird/game.js", [["function fxOff() {", "window.__rb = function () { return { ctx: ctx, drawSignal: drawSignal, drawPoliceWarning: drawPoliceWarning, SCENE_L: SCENE_L, TILE: TILE }; }; function fxOff() {"]]);
    await p.goto(base + "games/road-bird/", { waitUntil: "domcontentloaded" }); await setFx(p, "road-bird", off);
    res["signal-" + mode] = await p.evaluate(() => [0, 0.2, 0.4].map((blink) => {
      const { ctx, drawSignal } = __rb();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 280, 40, 50);
      drawSignal({ dir: 1, state: "warn", blink: blink }, 300);
      const d = ctx.getImageData(12, 310, 1, 1).data; ctx.restore(); return d[0];
    }));
    const glow = new Set();
    for (let i = 0; i < 5; i++) {
      glow.add(await p.evaluate(() => {
        const { ctx, drawPoliceWarning, SCENE_L, TILE } = __rb();
        const dx = 20 - SCENE_L;   // the glow starts at the scene's left edge (x < 0): shift it on-canvas
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 300, 300); ctx.translate(dx, 0);
        drawPoliceWarning({ siren: true, police: { state: "clearing", dir: 1 } }, 100);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const d = ctx.getImageData(SCENE_L + dx + 6, 100 + TILE / 2, 1, 1).data; ctx.restore();
        return d[3] === 0 ? "none" : d[0] > d[2] ? "red" : "blue";
      }));
      await p.waitForTimeout(70);
    }
    res["police-" + mode] = [...glow].sort().join();
    await p.close();

    // Poodle Jump: the grace-window ring looks the same at any moment (FX off), it blinks (FX on)
    p = await lib.open(c3, base, "games/poodle-jump/"); await setFx(p, "poodle-jump", off);
    res["poodle-" + mode] = await p.evaluate(() => {
      const cv = document.createElement("canvas"); cv.width = 200; cv.height = 200; const c = cv.getContext("2d");
      const pl = new Player(); pl.x = 80; pl.y = 80; pl.invincible = false;
      return [0.51, 0.56].map((g) => { c.clearRect(0, 0, 200, 200); pl.grace = g; pl.render(c, 0); return cv.toDataURL(); }).reduce((a, b) => a === b);
    });
    await p.close();

    // Metazac: a leaked balloon tints the edge (FX off), not the whole screen
    p = await c3.newPage(); p.errs = [];
    await lib.injectScript(p, "games/metazac/game.js", [["  function powerReady() {", "  window.__leak = function () { leakFlash = 1; }; function powerReady() {"]]);
    await p.goto(base + "games/metazac/", { waitUntil: "domcontentloaded" }); await setFx(p, "metazac", off);
    await p.keyboard.press("Enter"); await p.waitForTimeout(500);
    res["metazac-" + mode] = await p.evaluate(() => new Promise((done) => {
      const c = document.querySelector("canvas").getContext("2d");
      const red = (x, y) => { const d = c.getImageData(x, y, 1, 1).data; return d[0] - (d[1] + d[2]) / 2; };
      const m0 = { c: red(450, 300), e: red(5, 300) };
      __leak();
      requestAnimationFrame(() => requestAnimationFrame(() => done({ center: red(450, 300) - m0.c, edge: red(5, 300) - m0.e })));
    }));
    await p.close();

    // Sunset Slice: the bomb glows round the edges (FX off), not a full-screen flash
    p = await c3.newPage(); p.errs = [];
    await lib.injectScript(p, "games/sunset-slice/game.js", [["  window.SunsetSlice = {", "  window.__flash = function (v) { flash = v; }; window.SunsetSlice = {"]]);
    await p.goto(base + "games/sunset-slice/", { waitUntil: "domcontentloaded" }); await setFx(p, "sunset-slice", off);
    await p.evaluate(() => { SunsetSlice.start("calm"); SunsetSlice.hold(); }); await p.waitForTimeout(300);
    const dims = await p.evaluate(() => { const c = document.querySelector("canvas"); return { w: c.width, h: c.height }; });
    const lum = () => p.evaluate(([w, h]) => { const d = document.querySelector("canvas").getContext("2d").getImageData(w / 2, h / 2, 1, 1).data; return d[0] + d[1] + d[2]; }, [dims.w, dims.h]);
    res["sunset-" + mode] = await p.evaluate(() => new Promise((done) => {
      const cv = document.querySelector("canvas"), c = cv.getContext("2d");
      const lumC = () => { const d = c.getImageData(cv.width / 2, cv.height / 2, 1, 1).data; return d[0] + d[1] + d[2]; };
      const redE = () => { const d = c.getImageData(2, cv.height / 2, 1, 1).data; return d[0] - (d[1] + d[2]) / 2; };
      const s0 = lumC(), e0 = redE();
      __flash(0.9);   // strong, so a slow frame's decay still leaves a clear reading
      requestAnimationFrame(() => requestAnimationFrame(() => done({ center: lumC() - s0, edgeRed: redE() - e0 })));
    }));
    await p.close();
  }
  check("flappy-world: invincible bird drawn steadily with FX off, strobing with FX on", res["flappy-off"] >= 0.85 && res["flappy-on"] < 0.7, { off: res["flappy-off"], on: res["flappy-on"] });
  const lit = (a) => a.every((r) => r > 150), blinks = (a) => a.some((r) => r > 150) && a.some((r) => r < 150);
  check("road-bird: train signal lit steadily with FX off, blinking with FX on", lit(res["signal-off"]) && blinks(res["signal-on"]), { off: res["signal-off"], on: res["signal-on"] });
  check("road-bird: police glow holds one colour with FX off, alternates with FX on", res["police-off"] === "red" && res["police-on"] === "blue,red", { off: res["police-off"], on: res["police-on"] });
  check("poodle-jump: grace ring steady with FX off, blinking with FX on", res["poodle-off"] === true && res["poodle-on"] === false, { off: res["poodle-off"], on: res["poodle-on"] });
  check("metazac: a leak tints the edge, not the screen, with FX off; full tint with FX on",
    res["metazac-off"].edge > 40 && Math.abs(res["metazac-off"].center) < 15 && res["metazac-on"].center > 20, { off: res["metazac-off"], on: res["metazac-on"] });
  check("sunset-slice: a bomb glows red at the edges with FX off (centre untouched); flashes the whole screen with FX on",
    Math.abs(res["sunset-off"].center) < 12 && res["sunset-off"].edgeRed > 10 && res["sunset-on"].center > 8, { off: res["sunset-off"], on: res["sunset-on"] });
  await c3.close();

  // ---- FX-3: Passport's desk moves with FX on (postcard, jolt, ink, stamp
  // count); with FX off nothing does, the page looks the same, and turning FX
  // back on doesn't make old stamps ink in again
  {
    const c4 = await lib.newContext(browser);
    const p = await lib.open(c4, base, "games/passport/");
    const anims = (sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].flatMap((e) => e.getAnimations({ subtree: true }).map((a) => a.animationName)).sort().join(), sel);
    const ask = () => p.waitForFunction(() => Passport.state() === "ask", null, { timeout: 5000 });
    await p.evaluate(() => Passport.start("tour")); await p.waitForTimeout(30);
    const dealt = await anims("#postcard");
    await p.waitForTimeout(400);
    await p.evaluate(() => Passport.answer((Passport.current().correct + 1) % 4)); await p.waitForTimeout(30);
    const denied = { postcard: await anims("#postcard"), tag: await anims(".tag.bad"), stamp: await anims("#big-stamp") };
    await ask();
    await p.evaluate(() => Passport.answer(Passport.current().correct)); await p.waitForTimeout(30);
    const entry = { tag: await anims(".tag.hit"), mini: await anims("#stamps .mini:last-child"), score: await anims("#hud-score") };
    check("passport, FX on: the postcard drops in, a denial jolts it, the stamp spreads ink and its copy inks in",
      dealt === "deal" && denied.postcard === "jolt" && denied.tag === "wrongJolt" && denied.stamp === "inkRing,inkSpecks,thunkd" &&
      entry.tag === "tagPress" && entry.mini === "inkIn" && entry.score === "bump", { dealt, denied, entry });
    await ask();
    await p.keyboard.press("v"); await p.waitForTimeout(50);
    await p.evaluate(() => Passport.answer(Passport.current().correct)); await p.waitForTimeout(30);
    const off = await anims("#postcard, .tag, #stamps .mini, #hud-score, #big-stamp");
    const look = await p.evaluate(() => ({ postcard: getComputedStyle(document.getElementById("postcard")).transform, mini: getComputedStyle(document.querySelector("#stamps .mini:last-child")).opacity }));
    await ask();
    await p.keyboard.press("v"); await p.waitForTimeout(50);
    const again = await anims("#stamps .mini, #hud-score, .card");
    check("passport, FX off: nothing moves and the page is the same; FX back on doesn't replay old stamps",
      off === "" && /^matrix\(0\.99/.test(look.postcard) && look.mini === "0.85" && again === "", { off, look, again });
    check("passport FX: no page errors", p.errs.length === 0, p.errs);
    await p.close();
    await c4.close();
  }

  // ---- FX-3: Poodle Jump bounces with juice when FX is on (squash and stretch,
  // dust, the platform giving); with FX off it still bounces, drawn as always
  {
    const c5 = await lib.newContext(browser);
    const seen = {}, art = {}, prop = {};
    for (const off of [false, true]) {
      const p = await lib.open(c5, base, "games/poodle-jump/", { before: (pg) => pg.addInitScript((off) => localStorage.setItem("reduceMotion:poodle-jump", off ? "1" : "0"), off) });
      await p.evaluate(() => __game.start());
      // two seconds of bouncing on the starter platform
      seen[off ? "off" : "on"] = await p.evaluate(() => new Promise((res) => {
        const g = __game, s = { bounces: 0, squash: 0, dust: 0, dip: 0 };
        let lastVy = g.player.vy;
        const t0 = performance.now();
        (function tick() {
          const pl = g.player;
          if (pl.vy < -500 && lastVy >= 0) s.bounces++;
          lastVy = pl.vy;
          s.squash = Math.max(s.squash, pl.squashT || 0);
          s.dust = Math.max(s.dust, (pl.dust || []).length);
          s.dip = Math.max(s.dip, ...g.platforms.map((x) => x.dipT || 0));
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(s);
        })();
      }));
      // the poodle drawn on landing (squashed, with dust) and at rest: one
      // picture with FX off, two with it on
      art[off ? "off" : "on"] = await p.evaluate(() => {
        const cv = document.createElement("canvas"); cv.width = 120; cv.height = 140; const c = cv.getContext("2d");
        const draw = (land) => {
          const pl = new Player(); pl.x = 38; pl.y = 50; pl.vy = 0;
          if (land) { pl.bounce(0); pl.vy = 0; }
          c.clearRect(0, 0, 120, 140); pl.render(c, 0); return cv.toDataURL();
        };
        return draw(true) === draw(false);
      });
      // a propeller pickup a moment apart: its blades turn only with FX on
      prop[off ? "off" : "on"] = await p.evaluate(() => {
        const cv = document.createElement("canvas"); cv.width = 80; cv.height = 80; const c = cv.getContext("2d");
        const it = new PowerUp(new Platform(10, 60, PT.GREEN), "propeller");
        const shot = () => { c.clearRect(0, 0, 80, 80); it.render(c, 0); return cv.toDataURL(); };
        const a = shot(); it.update(0.1); return a === shot();
      });
      check("poodle-jump FX " + (off ? "off" : "on") + ": no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }
    check("poodle-jump, FX on: each landing squashes the poodle, kicks up dust and dips the platform; the landing frame looks different",
      seen.on.bounces > 0 && seen.on.squash > 0 && seen.on.dust > 0 && seen.on.dip > 0 && art.on === false, { seen: seen.on, sameArt: art.on });
    check("poodle-jump, FX off: it still bounces, with no squash, dust or dip, and the poodle is drawn exactly as always",
      seen.off.bounces > 0 && seen.off.squash === 0 && seen.off.dust === 0 && seen.off.dip === 0 && art.off === true, { seen: seen.off, sameArt: art.off });
    check("poodle-jump: a propeller's blades turn with FX on and hold still with it off", prop.on === false && prop.off === true, prop);
    await c5.close();
  }

  // ---- FX-3: 2048 with FX on: the slid key lands with a squash, the merge
  // squashes and flashes a ring, the points float up off the score; with FX
  // off the same move plays with none of that, to the same board and score
  {
    const c6 = await lib.newContext(browser);
    const HOOK = ["  newGame();\n})();", `  newGame();
  window.__set2048 = function (rows) {
    newGame(); tilesEl.innerHTML = ""; tiles = {}; grid = [];
    for (var r = 0; r < 4; r++) grid.push([null, null, null, null]);
    for (r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (rows[r][c]) makeTile(r, c, rows[r][c], null);
  };
})();`];
    const got = {};
    for (const off of [false, true]) {
      const p = await lib.open(c6, base, "games/2048/", { before: async (pg) => {
        await lib.injectScript(pg, "games/2048/game.js", [HOOK]);
        await pg.addInitScript((off) => localStorage.setItem("reduceMotion:2048", off ? "1" : "0"), off);
      } });
      // a pair of 2s to merge on the top row, a 4 to slide on the next
      await p.evaluate(() => __set2048([[2, 2, 0, 0], [0, 0, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0]]));
      const watch = p.evaluate(() => new Promise((res) => {
        const s = { rings: 0, floats: 0, scripted: 0 };
        const t0 = performance.now();
        (function tick() {
          s.rings = Math.max(s.rings, document.querySelectorAll(".merge-ring").length);
          s.floats = Math.max(s.floats, document.querySelectorAll(".score-add").length);
          // animations started from script (not the CSS appear / pop / slide)
          const n = [...document.querySelectorAll(".tile-inner")].reduce((k, e) => k + e.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length, 0);
          s.scripted = Math.max(s.scripted, n);
          if (performance.now() - t0 < 600) requestAnimationFrame(tick);
          else res(s);
        })();
      }));
      await p.keyboard.press("ArrowLeft");
      const s = await watch;
      await p.waitForTimeout(1500);   // (the float takes 0.7 s; slack for a loaded machine)
      s.after = await p.evaluate(() => ({
        score: document.getElementById("score").textContent,
        top: [...document.querySelectorAll(".tile-inner")].map((e) => e.textContent).sort().join(),
        leftover: document.querySelectorAll(".merge-ring, .score-add").length,
      }));
      got[off ? "off" : "on"] = s;
      check("2048 FX " + (off ? "off" : "on") + ": no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }
    check("2048, FX on: the slid key lands and the merge squashes (scripted motion), a ring flashes, the points float up, then all of it clears",
      got.on.scripted >= 2 && got.on.rings >= 1 && got.on.floats >= 1 && got.on.after.leftover === 0 && got.on.after.score === "4", got.on);
    check("2048, FX off: the same move to the same board and score, with no ring, float or extra motion",
      got.off.scripted === 0 && got.off.rings === 0 && got.off.floats === 0 && got.off.after.score === "4" && got.off.after.top.split(",").length === got.on.after.top.split(",").length, got.off);
    await c6.close();
  }
};
