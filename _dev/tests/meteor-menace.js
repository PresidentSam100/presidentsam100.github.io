// Meteor Menace!: a key held as the window loses focus (its keyup goes to
// another window) isn't stuck down once the game resumes; with Visual FX off
// the menu's rocket stands still (it's still drawn), with FX on it drifts; on a
// 2× screen the panel is drawn at the screen's own resolution; on a touch-only phone the key captions
// hide and the panel says TAP where it says PRESS [SPACE] OR [ENTER]. Three rockets under
// the score are three lives, and the next one launches soon after a crash.
// A slow load's out-of-order first frame doesn't step the clock back.
const HOOK = ["  function drawShipAt(x, y, a, opts) {\n", "  function drawShipAt(x, y, a, opts) {\n    if (opts && opts.scale === 1.6) window.__menuShip = [x, y, a];\n"];
const OVER = ["    start: start\n  };", "    start: start,\n    over: function () { lives = 0; gameOver(); }\n  };"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = () => lib.open(ctx, base, "games/meteor-menace/", { before: (pg) => lib.injectScript(pg, "games/meteor-menace/game.js", [HOOK]) });
  const done = async (p, what) => { check("meteor-menace " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- a first frame stamped before the game read its clock (a slow load) is
  // a step back: served here with the clock read 3 s late, so it always is.
  // The step the game is handed is never below 0.
  {
    const q = await lib.open(ctx, base, "games/meteor-menace/", { before: (pg) => lib.injectScript(pg, "games/meteor-menace/game.js", [HOOK,
      ["  var last = performance.now();", "  var last = performance.now() + 3000;"],
      ["if (!P.isPaused()) update(dt);", "if (!P.isPaused()) { (window.__dts = window.__dts || []).push(dt); update(dt); }"]]) });
    const dts = await q.evaluate(() => new Promise((r) => { let k = 0; (function f() { if (++k < 10) requestAnimationFrame(f); else r(window.__dts || []); })(); }));
    check("meteor-menace: a slow load's out-of-order first frame doesn't step the game's clock back", dts.length > 0 && Math.min(...dts) >= 0, { steps: dts.length, least: Math.min(...dts) });
    await done(q, "first frame");
  }

  // ---- hold ↑, lose focus (auto-pause; the keyup never comes), resume: no thrust
  let p = await open();
  await p.evaluate(() => __game.start());
  // (the ship reads its keys each frame: wait frames, not a time, which on a
  // busy machine can pass without one)
  const frames = (n) => p.evaluate((n) => new Promise((r) => { let k = 0; (function f() { if (++k >= n) r(); else requestAnimationFrame(f); })(); }), n);
  await p.keyboard.down("ArrowUp"); await frames(5);
  const held = await p.evaluate(() => !!(__game.ship && __game.ship.thrusting));
  await p.evaluate(() => window.dispatchEvent(new Event("blur"))); await p.waitForTimeout(80);
  await p.click(".gs-pause button"); await frames(5);
  const after = await p.evaluate(() => !!(__game.ship && __game.ship.thrusting));
  await p.keyboard.up("ArrowUp");
  check("meteor-menace: a key held when the window loses focus isn't stuck down after resuming", held && !after, { held, after });
  await done(p, "held keys");

  // ---- lives: the three rockets drawn are the three you get (the third crash
  // ends the issue: it used to take a fourth), and the next rocket is on the
  // pad 0.6 s after a crash (it was 1.6 s), or by 1.5 s with a rock parked on
  // the pad (it used to wait for the rock to move off, however long that took)
  p = await open();
  await p.evaluate(() => __game.start());
  const lives0 = await p.evaluate(() => __game.lives);
  // crash the rocket into a rock, then time the wait in the game's own clock
  const crash = (park) => p.evaluate((park) => new Promise((res) => {
    const out = { before: __game.lives };
    if (!__game.ship) { out.noRocket = true; return res(out); }                                 // (the last crash never gave one back)
    __game.rocks.forEach((r, i) => { if (i) { r.x = 40; r.y = 40; r.vx = r.vy = 0; } });       // (the others kept in a corner)
    const rock = __game.rocks[0], cx = __game.ship.x, cy = __game.ship.y;
    rock.x = cx; rock.y = cy; rock.vx = rock.vy = 0; __game.ship.grace = 0;
    let t0 = null, n = 0;
    (function f() {
      if (++n > 900) { out.gave = "up"; return res(out); }
      if (__game.state !== "play") { out.state = __game.state; out.after = __game.lives; return res(out); }
      if (t0 === null && !__game.ship) { t0 = __game.time; out.after = __game.lives; if (!park) { rock.x = 40; rock.y = 40; } }
      else if (t0 !== null && __game.ship) { out.wait = +(__game.time - t0).toFixed(2); out.state = __game.state; return res(out); }
      if (t0 !== null && park) { rock.x = cx; rock.y = cy; }                                    // (held on the pad)
      requestAnimationFrame(f);
    })();
  }), park);
  const c1 = await crash(false), c2 = await crash(true), c3 = await crash(false);
  check("meteor-menace: three rockets under the score are three lives: the third crash ends the issue",
    lives0 === 3 && c1.after === 2 && c1.state === "play" && c2.after === 1 && c2.state === "play" && c3.after === 0 && c3.state === "over", { lives0, c1, c2, c3 });
  check("meteor-menace: the next rocket is on the pad 0.6 s after a crash, and within 1.5 s even with a rock parked there",
    c1.wait >= 0.55 && c1.wait <= 0.75 && c2.wait >= 1.4 && c2.wait <= 1.65, { clear: c1.wait, parked: c2.wait });
  await done(p, "lives");

  // ---- the menu rocket: still with FX off, drifting with it on
  const menuShip = async (off) => {
    const pg = await open();
    await pg.evaluate((off) => localStorage.setItem("reduceMotion:meteor-menace", off ? "1" : "0"), off);
    await pg.reload({ waitUntil: "domcontentloaded" }); await pg.waitForTimeout(200);
    const a = await pg.evaluate(() => window.__menuShip);
    await pg.waitForTimeout(300);
    const b = await pg.evaluate(() => window.__menuShip);
    await done(pg, "menu ship FX " + (off ? "off" : "on"));
    return { a, b, still: !!a && !!b && a.every((v, i) => v === b[i]) };
  };
  const off = await menuShip(true), on = await menuShip(false);
  check("meteor-menace: with Visual FX off the menu rocket is drawn standing still; with FX on it drifts", off.still && !!on.a && !on.still, { off, on });
  await ctx.close();

  // ---- a 2× screen: the panel has two backing pixels for every page pixel it
  // covers (it had 720 × 560 times 2, under that where the panel is shown
  // larger), drawn in the game's units; a tap on it still starts, frames
  // draw, and a smaller window or a zoom to 1× refits it
  const hi = await lib.newContext(browser, { deviceScaleFactor: 2 });
  p = await lib.open(hi, base, "games/meteor-menace/");
  const fitted = () => p.evaluate(() => {
    const c = document.getElementById("screen"), t = c.getContext("2d").getTransform();
    return { k: +(c.width / c.clientWidth).toFixed(2), kh: +(c.height / c.clientHeight).toFixed(2), sx: +(t.a / (c.width / 720)).toFixed(3), sy: +(t.d / (c.height / 560)).toFixed(3) };
  });
  const two = await fitted();
  await p.click("#screen"); await p.waitForTimeout(200);
  const st = await p.evaluate(() => __game.state);
  await p.setViewportSize({ width: 1000, height: 600 }); await p.waitForTimeout(300);
  const small = await fitted();
  await p.evaluate(() => { Object.defineProperty(window, "devicePixelRatio", { get: () => 1, configurable: true }); window.dispatchEvent(new Event("resize")); });
  await p.waitForTimeout(100);
  const one = await p.evaluate(() => { const c = document.getElementById("screen"); return { w: c.width, shown: c.clientWidth }; });
  const sharp = (r) => r.k >= 1.95 && r.kh >= 1.95 && r.sx === 1 && r.sy === 1;
  check("meteor-menace: on a 2× screen the panel is drawn at the screen's own resolution in the game's units (also in a smaller window), a click starts the issue, and a zoom to 1× refits",
    sharp(two) && sharp(small) && st === "play" && one.w >= 720 && one.w <= Math.max(720, one.shown) + 1, { two, small, st, one });
  await done(p, "hi-DPI");
  await hi.close();

  // ---- what the panel says, and whether the key captions show: desktop vs phone
  const said = async (dev) => {
    const c = await lib.newContext(browser, dev);
    const pg = await lib.open(c, base, "games/meteor-menace/", { before: (x) => lib.injectScript(x, "games/meteor-menace/game.js", [OVER]) });
    // every string the canvas fills, over a few frames
    await pg.evaluate(() => { window.__said = []; const real = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (s) { window.__said.push(String(s)); return real.apply(this, arguments); }; });
    const texts = async () => {
      await pg.evaluate(() => { window.__said = []; });
      await pg.waitForTimeout(150);
      return pg.evaluate(() => window.__said.join("|"));
    };
    const menu = await texts();
    await pg.evaluate(() => { __game.start(); __game.over(); });
    const over = await texts();
    const caps = await pg.evaluate(() => [...document.querySelectorAll("#captions .cap")].map((e) => getComputedStyle(e).display));
    // (the row names the ship's keys only: pausing is the ⏸ corner button's, P)
    const names = await pg.evaluate(() => document.getElementById("captions").textContent.replace(/\s+/g, " ").trim());
    await done(pg, "touch hints");
    await c.close();
    return { menu, over, caps, names };
  };
  const desk = await said({}), phone = await said(require("@playwright/test").devices["Pixel 7"]);
  check("meteor-menace: on a desktop the panel says PRESS [SPACE] OR [ENTER] and the key captions show: rotate, thrust and fire, no pause among them",
    /SPACE/.test(desk.menu) && /SPACE/.test(desk.over) && /ENTER/.test(desk.menu) && /ENTER/.test(desk.over) && !/TAP/.test(desk.menu + desk.over) && desk.caps.length === 3 && desk.caps.every((d) => d !== "none") &&
    /ROTATE/.test(desk.names) && /THRUST/.test(desk.names) && /FIRE/.test(desk.names) && !/PAUSE|ESC/.test(desk.names), desk);
  check("meteor-menace: on a touch-only phone the panel says TAP instead, and the key captions are hidden",
    /TAP TO BLAST OFF/.test(phone.menu) && /TAP FOR THE NEXT ISSUE/.test(phone.over) && !/ENTER/.test(phone.menu + phone.over) && phone.caps.length === 3 && phone.caps.every((d) => d === "none"), phone);
};
