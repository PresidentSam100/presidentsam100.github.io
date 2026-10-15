// Pop the Lock: a tap while paused isn't scored; Ctrl / Alt + Space or Enter
// are left to the browser; with storage blocked the game still runs. On the
// panel, Enter on a focused colour only picks that colour. Five colours, each
// with its scene. The yellow notch ends where the window ends, and the dial
// is only too late once its ball has wholly left the yellow.
const HOOK = ["  // ---- Boot ----", `  window.__lock = { state: () => state, score: () => score,
    // the ball held still with its centre \`px\` pixels past the notch's far end (round the ring)
    place: (px) => { speed = 0; traveled = exitTravel + px / R; dial = ((target + dir * (tol + px / R)) % TAU + TAU) % TAU; },
    geom: () => ({ cx: cx, cy: cy, R: R, target: target, tol: tol, dir: dir, ballR: typeof ballR === "function" ? ballR() : Math.max(9, R * 0.075), dpr: canvas.width / W }),
    tap: () => onTap(),
  };
  // ---- Boot ----`];
const BLOCK_STORAGE = (pg) => pg.addInitScript(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const hook = (pg) => lib.injectScript(pg, "games/pop-the-lock/game.js", [HOOK]);
  const card = (p) => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });
  const st = (p) => p.evaluate(() => window.__lock ? { state: __lock.state(), score: __lock.score() } : null);

  let p = await lib.open(ctx, base, "games/pop-the-lock/", { before: hook });
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  await p.keyboard.press("p"); await p.waitForTimeout(80);
  const paused = await card(p);
  await p.keyboard.press("Space"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const during = await st(p);
  await p.keyboard.press("p"); await p.waitForTimeout(80);
  const after = await st(p);
  check("pop-the-lock: Space / Enter while paused don't tap the lock", paused && during.state === "play" && during.score === 0 && after.state === "play" && !(await card(p)), { paused, during, after });
  check("pop-the-lock: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // on the menu, the combos start nothing
  p = await lib.open(ctx, base, "games/pop-the-lock/", { before: hook });
  const claimed = [await lib.fireKey(p, { key: " ", code: "Space", ctrlKey: true }), await lib.fireKey(p, { key: "Enter", code: "Enter", altKey: true })];
  const menu = await st(p);
  check("pop-the-lock: Ctrl / Alt + Space or Enter are left to the browser", claimed.every((x) => !x) && menu.state === "menu", { claimed, menu });
  await p.close();

  p = await lib.open(ctx, base, "games/pop-the-lock/", { before: async (pg) => { await BLOCK_STORAGE(pg); await hook(pg); } });
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const blocked = await st(p);
  check("pop-the-lock: with storage blocked the game still starts", p.errs.length === 0 && !!blocked && blocked.state === "play", { errs: p.errs, blocked });
  await p.close();
  await ctx.close();

  // the hint names Space with a keyboard; on a touch-only device, just Tap
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/pop-the-lock/");
    const hint = await q.evaluate(() => document.querySelector(".hint").innerText.replace(/\s+/g, " "));
    const ok = label === "desktop" ? /^Click \/ Tap \/ Space \/ Enter • Don't miss/.test(hint) : /^Tap • Don't miss/.test(hint);
    check("pop-the-lock " + label + ": the hint " + (label === "desktop" ? "names Space and Enter" : "says Tap, no keys"), ok, hint);
    await q.close();
    await c.close();
  }

  // ---- Enter on a focused colour picks that colour and stays on the panel (it
  // used to start the game instead, leaving the colour as it was); a colour
  // picked with the mouse keeps no focus, so the next Space starts. Enter on
  // the focused PLAY button still starts.
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/pop-the-lock/", { before: hook });
    const look = () => q.evaluate(() => ({ state: __lock.state(), theme: document.querySelector(".swatch.active").dataset.theme, focus: document.activeElement.tagName }));
    await q.focus('.swatch[data-theme="plum"]'); await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const a = await look();
    await q.evaluate(() => document.activeElement.blur());
    await q.click('.swatch[data-theme="indigo"]', { timeout: 3000 }).catch(() => {}); await q.waitForTimeout(80);
    const b = await look();
    await q.keyboard.press("Space"); await q.waitForTimeout(150);
    const d = await look();
    check("pop-the-lock: Enter on a focused colour only picks it; after a mouse pick (which keeps no focus) Space starts",
      a.state === "menu" && a.theme === "plum" && b.state === "menu" && b.theme === "indigo" && b.focus !== "BUTTON" && d.state === "play", { a, b, d });
    const r = await lib.open(c, base, "games/pop-the-lock/", { before: hook });
    await r.focus("#play"); await r.keyboard.press("Enter"); await r.waitForTimeout(150);
    const play = await st(r);
    check("pop-the-lock: (guard) Enter on the focused PLAY button starts the game", play.state === "play" && play.score === 0, play);
    check("pop-the-lock: no page errors (panel keys)", q.errs.length === 0 && r.errs.length === 0, [q.errs, r.errs]);
    await q.close(); await r.close();
    await c.close();
  }

  // ---- the start panel is centred on the lock (it used to be centred on the
  // window, some 40 px above the ring, which sits below Score / Level / Best),
  // and all of it stays between that row and the foot of the window: on a
  // desktop, a phone, and a phone on its side ([wide, high, touch])
  {
    const { devices } = require("@playwright/test");
    const off = [];
    for (const [w, h, touch] of [[1280, 800, false], [1366, 657, false], [390, 664, true], [320, 568, true], [667, 331, true], [844, 390, true]]) {
      const c = await lib.newContext(browser, touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
      const q = await lib.open(c, base, "games/pop-the-lock/");
      await q.waitForTimeout(450);                                   // (the panel rises into place)
      const m = await q.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect(), ring = r("#game"), pn = r(".panel"), hud = r(".hud");
        return { dx: +((pn.left + pn.right) / 2 - (ring.left + ring.right) / 2).toFixed(1), dy: +((pn.top + pn.bottom) / 2 - (ring.top + ring.bottom) / 2).toFixed(1),
          inside: pn.top >= hud.bottom - 0.5 && pn.bottom <= innerHeight + 0.5, ringIn: ring.top >= hud.bottom - 0.5 && ring.bottom <= innerHeight + 0.5 };
      });
      if (Math.abs(m.dx) > 1 || Math.abs(m.dy) > 1 || !m.inside || !m.ringIn || q.errs.length) off.push(w + "x" + h + " " + JSON.stringify(m) + q.errs.join("; "));
      await q.close(); await c.close();
    }
    check("pop-the-lock: the start panel is centred on the lock's ring, and panel and ring both sit whole under Score / Level / Best", off.length === 0, off);

    // ---- 1 to 5 pick the colour while the panel is up, each key shown under
    // its swatch (not on a touch-only phone); in play the digits do nothing
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/pop-the-lock/", { before: hook });
    const theme = () => q.evaluate(() => document.querySelector(".swatch.active").dataset.theme);
    const caps = (pg) => pg.evaluate(() => [...document.querySelectorAll(".swatch")].map((s) => getComputedStyle(s, "::after").display === "none" ? "-" : s.getAttribute("data-gs-key")).join(""));
    const picked = [];
    for (const k of ["3", "2", "5", "4", "1", "3"]) { await q.keyboard.press(k); await q.waitForTimeout(60); picked.push(await theme()); }
    const menuStill = (await st(q)).state, deskCaps = await caps(q);
    await q.keyboard.press("Space"); await q.waitForTimeout(150);
    await q.keyboard.press("1"); await q.waitForTimeout(60);
    const inPlay = { state: (await st(q)).state, theme: await theme() };
    const pc = await lib.newContext(browser, devices["Pixel 7"]);
    const ph = await lib.open(pc, base, "games/pop-the-lock/");
    const phoneCaps = await caps(ph);
    check("pop-the-lock: 1 to 5 pick the colour on the panel (not starting the game), each key shown under its swatch; in play they do nothing; a touch-only phone shows no keys",
      picked.join() === "plum,indigo,moss,coral,teal,plum" && menuStill === "menu" && deskCaps === "12345" && inPlay.state === "play" && inPlay.theme === "plum" && phoneCaps === "-----",
      { picked, menuStill, deskCaps, inPlay, phoneCaps });
    check("pop-the-lock: no page errors (colour keys)", q.errs.length === 0 && ph.errs.length === 0, [q.errs, ph.errs]);
    await q.close(); await c.close(); await ph.close(); await pc.close();

    // ---- the fifth colour, moss: a click picks it as the key does, the page
    // takes its green, and it is remembered for the next visit
    const mc = await lib.newContext(browser);
    const mq = await lib.open(mc, base, "games/pop-the-lock/", { before: hook });
    await mq.click('.swatch[data-theme="moss"]', { timeout: 3000 }).catch(() => {}); await mq.waitForTimeout(80);
    const clicked = await mq.evaluate(() => ({ theme: document.querySelector(".swatch.active").dataset.theme, bg: getComputedStyle(document.body).backgroundColor, state: __lock.state() }));
    await mq.reload({ waitUntil: "domcontentloaded" }); await mq.waitForTimeout(300);
    const kept = await mq.evaluate(() => document.querySelector(".swatch.active").dataset.theme);
    check("pop-the-lock: a click on the fifth colour, moss, picks it (the page goes moss green, the panel stays), and it is remembered",
      clicked.theme === "moss" && clicked.bg === "rgb(74, 122, 60)" && clicked.state === "menu" && kept === "moss", { clicked, kept });
    check("pop-the-lock: no page errors (moss)", mq.errs.length === 0, mq.errs);
    await mq.close(); await mc.close();
  }

  // ---- the backdrop: a scene to each colour behind the lock. With Visual FX
  // on it moves; with it off the same scene is there, held still (never a
  // bare colour). Read as the backdrop canvas shrunk small: how much is drawn
  // on it, and a number that changes when the picture does.
  {
    const sig = (pg) => pg.evaluate(() => {
      const bg = document.getElementById("bg"), c = document.createElement("canvas");
      c.width = 320; c.height = 200;
      const g = c.getContext("2d");
      g.drawImage(bg, 0, 0, 320, 200);
      const d = g.getImageData(0, 0, 320, 200).data;
      let ink = 0, sum = 0;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 2) ink++; sum = (sum + d[i] * (1 + (i % 251))) % 1000000007; }
      return { ink, sum };
    });
    // (waits are counted in frames drawn, not in time: on a busy machine a
    // fixed wait can end before the new colour's scene has been drawn at all)
    const frames = (pg, n) => pg.evaluate((n) => new Promise((done) => { (function f() { if (n-- > 0) requestAnimationFrame(f); else done(); })(); }), n);
    const scenes = {};
    for (const fxOff of [false, true]) {
      const c = await lib.newContext(browser);
      const q = await lib.open(c, base, "games/pop-the-lock/", { before: (pg) => pg.addInitScript((off) => localStorage.setItem("reduceMotion:pop-the-lock", off ? "1" : "0"), fxOff) });
      const out = {};
      for (const [k, name] of [["1", "teal"], ["2", "indigo"], ["3", "plum"], ["4", "coral"], ["5", "moss"]]) {
        await q.keyboard.press(k);
        const there = await q.waitForFunction((name) => document.querySelector(".swatch.active").dataset.theme === name, name, { timeout: 15000 }).then(() => true, () => false);
        if (!there) continue;                                         // (no such colour: its scene counts as missing)
        await frames(q, 4);
        const a = await sig(q);
        await q.waitForTimeout(400); await frames(q, 12);
        const b = await sig(q);
        out[name] = { ink: a.ink, sum: a.sum, moved: a.sum !== b.sum };
      }
      scenes[fxOff ? "off" : "on"] = out;
      check("pop-the-lock (backdrop, FX " + (fxOff ? "off" : "on") + "): no page errors", q.errs.length === 0, q.errs);
      await q.close(); await c.close();
    }
    const names = ["teal", "indigo", "plum", "coral", "moss"];
    check("pop-the-lock: with Visual FX on, each of the five colours has a scene of its own behind the lock, and it moves",
      names.every((n) => scenes.on[n] && scenes.on[n].ink > 40 && scenes.on[n].moved) && new Set(names.map((n) => scenes.on[n] && scenes.on[n].sum)).size === 5, scenes.on);
    check("pop-the-lock: with Visual FX off the same scenes are there, held still (as much drawn as with it on, one to each colour)",
      names.every((n) => scenes.off[n] && !scenes.off[n].moved && scenes.off[n].ink > 40 && scenes.off[n].ink > scenes.on[n].ink * 0.5) && new Set(names.map((n) => scenes.off[n] && scenes.off[n].sum)).size === 5, scenes);
  }

  // ---- the window and what's drawn: the notch's yellow ends where the
  // window ends (its round ends used to reach several pixels past it), a tap
  // pops while the ball's centre is on the yellow and misses once it is past,
  // and the dial is only too late once the ball has wholly left the yellow
  // (it used to be called with the ball still lying over the yellow's end).
  // Where the yellow ends is read from the lock as drawn (the furthest solid
  // yellow along the ring's middle line, with the ball far off); the ball's
  // edge from where it is drawn and its size. Distances are pixels along the
  // ring from the window's end, + past it.
  {
    const c = await lib.newContext(browser);
    const open = () => lib.open(c, base, "games/pop-the-lock/", { before: hook });
    const frames = (pg, n) => pg.evaluate((n) => new Promise((done) => { (function f() { if (n-- > 0) requestAnimationFrame(f); else done(); })(); }), n);
    const look = (pg) => pg.evaluate(() => {
      const g = __lock.geom(), cv = document.getElementById("game"), d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      const at = (a) => { const x = Math.round((g.cx + Math.cos(a) * g.R) * g.dpr), y = Math.round((g.cy + Math.sin(a) * g.R) * g.dpr), k = (y * cv.width + x) * 4; return [d[k], d[k + 1], d[k + 2], d[k + 3]]; };
      const yellow = (p) => p[0] > 235 && p[1] > 185 && p[1] < 230 && p[2] < 110 && p[3] > 240;
      const end = g.target + g.dir * g.tol;
      let yel = null;
      for (let s = -40; s <= 80; s += 0.5) if (yellow(at(end + g.dir * s / g.R))) yel = s;
      return { yel, ballArc: Math.asin(Math.min(1, g.ballR / g.R)) * g.R, state: __lock.state(), msg: document.getElementById("overlay-msg").textContent };
    });
    // the yellow's end, with the ball far off round the ring
    let q = await open();
    await q.keyboard.press("Space"); await q.waitForTimeout(150);
    await q.evaluate(() => __lock.place(-Math.PI * 0.8 * __lock.geom().R));   // (half the ring away, still to come)
    await frames(q, 3);
    const tip = await look(q);
    check("pop-the-lock: the notch's yellow ends where the window ends (round ends and all), not past it",
      tip.yel !== null && tip.yel <= 1 && tip.yel >= -3, tip);
    // the ball's back edge, `px` past the window's end, against the yellow's end: + clear of it
    const clear = (px) => +(px - tip.ballArc - tip.yel).toFixed(1);
    // the ball's centre just past the window's end: it still lies over the
    // yellow, so no "too late"; a tap there misses (its centre is off the yellow)
    await q.evaluate(() => __lock.place(2));
    await frames(q, 6);
    const over = Object.assign(await look(q), { clear: clear(2) });
    check("pop-the-lock: with the ball's centre just past the notch, the ball still lies over the yellow and isn't called too late",
      over.state === "play" && over.clear < 0, over);
    await q.evaluate(() => __lock.tap()); await q.waitForTimeout(700);
    const tapPast = await look(q);
    check("pop-the-lock: (guard) a tap with the ball's centre past the yellow's end is a miss, not a pop", tapPast.state === "over" && /Missed the mark/.test(tapPast.msg), tapPast);
    await q.close();
    // the centre just inside the end: a tap pops
    q = await open();
    await q.keyboard.press("Space"); await q.waitForTimeout(150);
    await q.evaluate(() => __lock.place(-2));
    await frames(q, 3);
    await q.evaluate(() => __lock.tap()); await frames(q, 2);
    const inside = await q.evaluate(() => ({ state: __lock.state(), score: __lock.score() }));
    check("pop-the-lock: (guard) a tap with the ball's centre just inside the notch's end pops", inside.state === "play" && inside.score === 1, inside);
    await q.close();
    // the ball moved on a pixel at a time: the late call comes once the ball
    // is wholly clear of the yellow, by a few pixels and no more, and says
    // "too slow"
    q = await open();
    await q.keyboard.press("Space"); await q.waitForTimeout(150);
    let last = null, called = null;
    for (let px = 0; px <= 60; px++) {
      await q.evaluate((px) => __lock.place(px), px);
      await frames(q, 2);
      const s = await look(q);
      if (s.state !== "play") { called = { px, clear: clear(px), msg: s.msg }; break; }
      last = { px, clear: clear(px) };
    }
    check("pop-the-lock: the dial is called too late only once its ball has wholly left the yellow, a few pixels clear, and not long after",
      !!called && called.clear >= 2 && called.clear <= 8 && /Too slow/.test(called.msg) && (!last || last.clear < called.clear), { tip, last, called });
    check("pop-the-lock: no page errors (the window)", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }
};
