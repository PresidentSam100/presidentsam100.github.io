// Meteor Menace!: a key held as the window loses focus (its keyup goes to
// another window) isn't stuck down once the game resumes; with Visual FX off
// the menu's rocket stands still (it's still drawn), with FX on it drifts; on a
// 2× screen the panel is drawn at the screen's own resolution; on a touch-only phone the key captions
// hide and the panel says TAP where it says PRESS [SPACE] OR [ENTER]. Three rockets under
// the score are three lives, and the next one launches soon after a crash.
// A slow load's out-of-order first frame doesn't step the clock back. A hit's
// points show where it scored them (rising with Visual FX on, still with it
// off, held by a pause).
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
    await pg.reload({ waitUntil: "domcontentloaded" });
    // (by frames, not time: a busy machine can take longer than a fixed wait
    // to draw the first frame, or draw none between two reads)
    await pg.waitForFunction(() => !!window.__menuShip, null, { timeout: 15000 }).catch(() => {});
    const a = await pg.evaluate(() => window.__menuShip);
    await pg.evaluate(() => new Promise((r) => { let k = 0; (function f() { if (++k > 18) r(); else requestAnimationFrame(f); })(); }));
    const b = await pg.evaluate(() => window.__menuShip);
    await done(pg, "menu ship FX " + (off ? "off" : "on"));
    return { a, b, still: !!a && !!b && a.every((v, i) => v === b[i]) };
  };
  const off = await menuShip(true), on = await menuShip(false);
  check("meteor-menace: with Visual FX off the menu rocket is drawn standing still; with FX on it drifts", off.still && !!on.a && !on.still, { off, on });
  // FX turned off while it drifts: it stops where it is (not back to its
  // first pose), and on again it drifts on from there, a short way in a
  // short time (on the page's own clock, frame by frame)
  {
    const pg = await lib.open(ctx, base, "games/meteor-menace/", { before: async (x) => {
      await x.clock.install({ time: new Date("2026-11-22T12:00:00") });
      await x.addInitScript(() => { try { localStorage.setItem("reduceMotion:meteor-menace", "0"); } catch (e) {} });
      await lib.injectScript(x, "games/meteor-menace/game.js", [HOOK]);
    } });
    const ship = () => pg.evaluate(() => window.__menuShip && window.__menuShip.map((v) => +v.toFixed(4)));
    const flip = () => pg.evaluate(() => document.querySelector(".rm-toggle").click());
    // (the page's clock stopped, so time moves only as it's run on: no frame
    // slips in between a reading and the switch)
    await pg.clock.pauseAt(await pg.evaluate(() => Date.now() + 100));
    await pg.clock.runFor(4000);
    const a0 = await ship(); await pg.clock.runFor(300); const a = await ship();
    await flip(); await pg.clock.runFor(300); const b = await ship(); await pg.clock.runFor(600); const b2 = await ship();
    await flip(); await pg.clock.runFor(300); const c = await ship();
    const same = (p, q) => !!p && !!q && p.every((v, i) => v === q[i]);
    check("meteor-menace: Visual FX turned off while the menu rocket drifts stops it where it is (not back to its first pose); on again it drifts on from there",
      !same(a0, a) && same(b, a) && same(b2, a) && !same(c, b) && Math.hypot(c[0] - b[0], c[1] - b[1]) < 12, { a0, a, b, b2, c });
    await done(pg, "menu ship FX switched");
  }
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
    // every string the canvas fills, over a few frames (counted, not timed:
    // a busy machine can draw none in a set wait)
    await pg.evaluate(() => { window.__said = []; const real = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (s) { window.__said.push(String(s)); return real.apply(this, arguments); }; });
    const texts = () => pg.evaluate(() => new Promise((res) => {
      window.__said = [];
      let n = 0;
      (function frame() { if (++n > 4) res(window.__said.join("|")); else requestAnimationFrame(frame); })();
    }));
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

  // ---- a saucer hit shows its points where it was hit: "+N", N what it
  // added, under the sound word; a rock (shot several a second) shows none;
  // rising as it fades with Visual FX on, still with it off; gone within a
  // second; held by a pause. Frames are stepped here, so it's exact.
  {
    const STEPPED = () => {
      let t = 1000, q = [];
      performance.now = () => t;
      window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
      window.__frames = (n) => { for (let i = 0; i < n; i++) { t += 1000 / 60; const run = q; q = []; run.forEach((cb) => { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } }); } };
    };
    const ctx2 = await lib.newContext(browser);
    const q = await lib.open(ctx2, base, "games/meteor-menace/", { before: (pg) => pg.addInitScript(STEPPED) });
    // one rock left, still; a big one at (180, 150) to shoot, or one far off
    // and a saucer held still at (180, 150) instead; a shot fired at (180, 150)
    const shoot = (what, off) => q.evaluate(([what, off]) => {
      if (!("gains" in __game)) return null;
      const RM = window.RM_ON; window.RM_ON = () => off;
      __game.start(); __frames(2);
      const rocks = __game.rocks; rocks.splice(1);
      const rk = rocks[0]; rk.vx = 0; rk.vy = 0; rk.size = 3; rk.r = 44;
      if (what === "rock") { rk.x = 180; rk.y = 150; }
      else { rk.x = 60; rk.y = 400; __game.forceSaucer(what === "small"); Object.assign(__game.saucer, { x: 180, y: 150, dir: 0, shotT: 99 }); }
      __game.bullets.push({ x: 120, y: 150, vx: 540, vy: 0, life: 0.95 });
      const s0 = __game.score;
      let hit = null;
      for (let i = 0; i < 40 && !hit; i++) {
        const at = __game.saucer ? { x: __game.saucer.x, y: __game.saucer.y } : null;
        __frames(1);
        if (__game.score !== s0) hit = { delta: __game.score - s0, gains: __game.gains, at };
      }
      const seen = [];
      for (let f = 0; f <= 60; f += 10) { seen.push(__game.gains[0] || null); __frames(10); }
      window.RM_ON = RM;
      return { hit, seen };
    }, [what, off]);
    const rock = await shoot("rock", false), big = await shoot("big", false), small = await shoot("small", false), still = await shoot("big", true);
    const one = (r, text) => !!r && !!r.hit && r.hit.gains.length === 1 && r.hit.gains[0].text === text && r.hit.gains[0].text === "+" + r.hit.delta &&
      Math.abs(r.hit.gains[0].x - r.hit.at.x) < 2 && Math.abs(r.hit.gains[0].y - (r.hit.at.y + 32)) < 3;
    check("meteor-menace: a saucer shot shows \"+200\" (a small one \"+1000\") just under its sound word, exactly what it added to the score; a rock shows none",
      one(big, "+200") && one(small, "+1000") && one(still, "+200") && !!rock && !!rock.hit && rock.hit.delta === 20 && rock.hit.gains.length === 0,
      { rock: rock && rock.hit, big: big && big.hit, small: small && small.hit, still: still && still.hit });
    check("meteor-menace: with Visual FX on the points rise as they fade; with it off they hold still and only fade; either way they're gone within a second",
      !!big && !!still && big.seen[2].y < big.seen[0].y - 6 && big.seen[4].a < 1 && big.seen[6] === null &&
      still.seen.slice(0, 5).every((g) => g && g.y === still.seen[0].y) && still.seen[4].a < 1 && still.seen[6] === null, { on: big && big.seen, off: still && still.seen });
    const t0 = await q.evaluate(() => {
      if (!("gains" in __game)) return null;
      __game.start(); __frames(2);
      const rocks = __game.rocks; rocks.splice(1);
      const rk = rocks[0]; rk.x = 60; rk.y = 400; rk.vx = 0; rk.vy = 0;
      __game.forceSaucer(false); Object.assign(__game.saucer, { x: 180, y: 150, dir: 0, shotT: 99 });
      __game.bullets.push({ x: 120, y: 150, vx: 540, vy: 0, life: 0.95 });
      for (let i = 0; i < 40 && !__game.gains.length; i++) __frames(1);
      return __game.gains[0] || null;
    });
    let paused = { t0 };
    if (t0) {
      await q.keyboard.press("p");
      paused.held = await q.evaluate(() => { __frames(120); return __game.gains[0] || null; });
      await q.keyboard.press("p");
      paused.after = await q.evaluate(() => { __frames(60); return __game.gains.length; });
    }
    check("meteor-menace: under the pause card the points stay as they were, and play out once it's put away",
      !!paused.t0 && !!paused.held && paused.held.t === paused.t0.t && paused.after === 0, paused);
    check("meteor-menace (points): no page errors", q.errs.length === 0, q.errs);
    await ctx2.close();
  }

  // ---- the cover's corner box carries the publisher's band, SAM LU COMICS
  // · 10¢ on one line in letters big enough to read (9.5 px at the least, on
  // the narrowest phone), over No. 1, and it shows: on every screen the
  // title runs between the box and the star burst, never over either (on a short laptop window and
  // on phones the title hid the box), neither corner piece hangs over the
  // panel, the box is on the screen, and on a laptop the page fits its
  // window (the key captions keep one row: a second ran a short window's
  // page off the bottom). The page's paper is painted once, by html, as tall
  // as the window: a body shorter than the window painted its own and left
  // a seam where it ended. The suites keep the web fonts out, so Bangers
  // comes as a stand-in: Impact at 86%, Bangers's own widths.
  {
    const BANGERS = '@font-face { font-family: "Bangers"; src: local("Impact"); size-adjust: 86%; }';
    const { devices } = require("@playwright/test");
    const SIZES = [["1280x900", { viewport: { width: 1280, height: 900 } }], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }],
      ["Pixel 7", devices["Pixel 7"]], ["360x560", { viewport: { width: 360, height: 560 }, isMobile: true, hasTouch: true }], ["320x568", { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }],
      ["1280x720", { viewport: { width: 1280, height: 720 } }], ["1440x700", { viewport: { width: 1440, height: 700 } }], ["800x600", { viewport: { width: 800, height: 600 } }], ["700x500", { viewport: { width: 700, height: 500 } }],
      ["375x553", { viewport: { width: 375, height: 553 }, isMobile: true, hasTouch: true }]];
    const DESK = ["1280x900", "1366x657", "1280x600", "1280x720", "1440x700", "800x600", "700x500"];
    const rows = {};
    for (const [label, dev] of SIZES) {
      const c = await lib.newContext(browser, dev);
      await c.route(/fonts\.googleapis/, (r) => r.fulfill({ contentType: "text/css", body: BANGERS }));
      const q = await lib.open(c, base, "games/meteor-menace/");
      rows[label] = await q.evaluate(async () => {
        await document.fonts.ready;
        const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const meet = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
        const box = document.querySelector(".issue-box"), pub = box && box.querySelector(".publisher"), burst = document.querySelector(".star-burst");
        const h1 = document.querySelector("#masthead h1"), panel = R(document.getElementById("panel"));
        const rg = document.createRange(); rg.selectNodeContents(h1);
        const lines = [...rg.getClientRects()].map((b) => ({ l: b.left, t: b.top, r: b.right, b: b.bottom }));
        const bx = R(box), bu = R(burst);
        let pubLines = 0, pubFont = 0;
        if (pub) {
          // (lines from its height as laid out: the box is tilted, so the
          // pieces of one line stand at different heights on the screen)
          const cs = getComputedStyle(pub);
          pubFont = parseFloat(cs.fontSize);
          pubLines = Math.round((pub.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight));
        }
        const corners = [document.querySelector(".nav-back-games"), ...document.querySelectorAll(".gs-corner > *")].filter(Boolean).map(R);
        const hits = corners.filter((c) => meet(c, bx) || meet(c, bu) || lines.some((ln) => meet(c, ln)));
        return {
          font: parseFloat(getComputedStyle(h1).fontSize), corners: corners.length, cornerHits: hits.length,
          pub: pub ? pub.innerText.replace(/\s+/g, " ").trim() : null, text: box.innerText.replace(/\s+/g, " ").trim(), pubLines, pubFont,
          clear: lines.length > 0 && !lines.some((ln) => meet(ln, bx) || meet(ln, bu)) && !meet(bx, bu),
          lines: lines.length, overPanel: Math.max(bx.b, bu.b) - panel.t, onScreen: bx.l >= -2 && bx.t >= 0 && bx.r <= innerWidth,
          spill: document.documentElement.scrollHeight - innerHeight,
          painted: getComputedStyle(document.body).backgroundImage === "none" && document.documentElement.getBoundingClientRect().height >= innerHeight,
        };
      });
      check("meteor-menace " + label + " (corner box): no page errors", q.errs.length === 0, q.errs);
      await c.close();
    }
    const all = Object.values(rows);
    check("meteor-menace: the cover's corner box reads SAM LU COMICS · 10¢ on one line in its publisher band (letters at least 9.5 px), over No. 1, on laptops and phones",
      all.every((x) => x.pub === "SAM LU COMICS · 10¢" && x.pubLines === 1 && x.pubFont >= 9.5 && /^SAM LU COMICS · 10¢ ?No\. 1$/.test(x.text)),
      Object.entries(rows).map(([k, x]) => k + ": " + x.text + " (" + x.pubLines + " line, " + x.pubFont + " px)"));
    check("meteor-menace: on a laptop (seven window sizes) and on phones the title runs between the corner box and the star burst, never over either; neither hangs over the panel and the box is on screen",
      // (2 px: the turned square round the burst grazes the panel's ink
      // border, its points don't)
      all.every((x) => x.clear && x.overPanel <= 2 && x.onScreen), rows);
    check("meteor-menace: the title is one line on a laptop and two on a phone",
      ["1280x900", "1366x657", "1280x600"].every((k) => rows[k].lines === 1) && ["Pixel 7", "360x560", "320x568"].every((k) => rows[k].lines === 2), rows);
    check("meteor-menace: on a laptop the page fits its window, a short one too (the key captions keep one row)",
      ["1280x900", "1366x657", "1280x600"].every((k) => rows[k].spill <= 0), rows);
    check("meteor-menace: the page's paper is painted once, by html, as tall as the window (no seam where a shorter body ended)",
      all.every((x) => x.painted), rows);
    // The masthead keeps clear of the fixed corner buttons on a laptop or a
    // desktop window (the star burst sat under Pause at 1280x900, 1280x720
    // and in small windows), and on a short laptop it runs wider than the
    // narrowed cover rather than squeezing the title (37 px at 1280x600, 48
    // at 1366x657); where the page has height to spare the box and burst
    // drop under the buttons and the title keeps its full 84 px.
    check("meteor-menace: the corner box, star burst and title clear every corner button on a laptop or desktop window (seven sizes, small windows too)",
      DESK.every((k) => rows[k].corners >= 4 && rows[k].cornerHits === 0), DESK.map((k) => k + ": " + rows[k].cornerHits + " of " + rows[k].corners));
    check("meteor-menace: on a short laptop the title isn't squeezed by the narrow cover (at least 52 px at 1280x600, 64 at 1366x657 and 1440x700), and keeps its full 84 px at 1280x900",
      rows["1280x600"].font >= 52 && rows["1366x657"].font >= 64 && rows["1440x700"].font >= 64 && rows["1280x900"].font === 84, DESK.map((k) => k + ": " + rows[k].font));
    check("meteor-menace: in a small window and on the other laptop sizes the title keeps one line and the page fits (1280x720, 1440x700, 800x600, 700x500)",
      ["1280x720", "1440x700", "800x600", "700x500"].every((k) => rows[k].lines === 1 && rows[k].spill <= 0), rows);
  }
};
