// Road Bird with Visual FX off: the menu, the pause card, the eagle's swoop
// and the game-over card draw the same at any moment (no bob, pulse, ripple,
// coin spin or wing flap, the art still all there); with FX on the menu moves.
// On a phone a tap on the skin turntable changes the skin (C still does on a
// desktop), and the hints say tap / swipe instead of naming keys. The canvas
// is drawn at the screen's pixel density, and clicks still land on target.
const HOOK = ["window.__game = {", "window.__game = {\n  render: render,\n  eagle: function () { triggerEagle(); },\n  get mode() { return gameMode; },\n  get skin() { return skinSel; },"];
const W = 704, H = 768;   // the canvas's logical size (11 × 12 tiles of 64)

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/road-bird/", { before: (pg) => lib.injectScript(pg, "games/road-bird/game.js", [HOOK]) });
  // the same moment of play drawn twice, 0.7 s of clock apart: the pixels that differ
  const moved = (eagle) => p.evaluate((eagle) => {
    const c = document.getElementById("game"), g = c.getContext("2d"), now = performance.now;
    if (eagle) __game.eagle();
    const shot = (t) => { performance.now = () => t; __game.render(); return g.getImageData(0, 0, c.width, c.height).data; };
    try {
      const a = shot(10000), b = shot(10700);
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
      return n;
    } finally { performance.now = now; }
  }, eagle);
  const fxOff = (off) => p.evaluate((off) => { if (window.RM_ON() !== off) document.querySelector(".rm-toggle").click(); }, off);

  await fxOff(false);
  const menuOn = await moved();
  await fxOff(true);
  const menuOff = await moved();
  check("road-bird: the menu moves with FX on, and holds still with FX off", menuOn > 0 && menuOff === 0, { menuOn, menuOff });

  await p.keyboard.press("Space"); await p.waitForTimeout(200);
  await p.keyboard.press("ArrowUp"); await p.waitForTimeout(300);
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const paused = await moved();
  check("road-bird, FX off: the pause card and the scene under it hold still", paused === 0, paused);

  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const swoop = await moved(true);
  check("road-bird, FX off: the eagle's wings hold still as it swoops", swoop === 0, swoop);

  await p.waitForFunction(() => __game.state === "dead", null, { timeout: 20000 });   // (the swoop runs on game time: slower on a busy machine)
  const over = await moved();
  check("road-bird, FX off: the game-over card (with its NEW BEST) holds still", over === 0, over);

  check("road-bird: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the strings a render draws, and a tap / click at a logical point
  const drawn = (pg) => pg.evaluate(() => {
    const g = document.getElementById("game").getContext("2d"), out = [];
    g.fillText = function (s) { out.push(String(s)); return CanvasRenderingContext2D.prototype.fillText.apply(this, arguments); };
    try { __game.render(); } finally { delete g.fillText; }
    return out.join(" | ");
  });
  const at = async (pg, x, y, tap) => {
    const b = await pg.locator("#game").boundingBox(), px = b.x + x * b.width / W, py = b.y + y * b.height / H;
    if (tap) await pg.touchscreen.tap(px, py); else await pg.mouse.click(px, py);
  };
  const shows = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display !== "none" : null; }, sel);
  const unlocked = (pg) => pg.addInitScript(() => { try { localStorage.setItem("crossy_high_classic", "300"); } catch (e) {} });   // every skin

  // desktop: C changes the skin, the hints name the keys
  let d = await lib.open(ctx, base, "games/road-bird/", { before: async (pg) => { await unlocked(pg); await lib.injectScript(pg, "games/road-bird/game.js", [HOOK]); } });
  const s0 = await d.evaluate(() => __game.skin); await d.keyboard.press("c"); const s1 = await d.evaluate(() => __game.skin);
  const deskMenu = await drawn(d);
  const deskHint = { keys: await shows(d, "#hint .gs-keys"), touch: await shows(d, "#hint .gs-touch") };
  check("road-bird, desktop (guard): C changes the skin", s1 !== s0, { s0, s1 });
  check("road-bird, desktop: the hints name the keys", deskHint.keys && deskHint.touch === false && deskMenu.split(" | ").includes("C") && /SPACE/.test(deskMenu), { deskHint, deskMenu });
  await d.close();

  // phone: a tap on the turntable changes the skin; the hints say tap / swipe
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  let m = await lib.open(phone, base, "games/road-bird/", { before: async (pg) => { await unlocked(pg); await lib.injectScript(pg, "games/road-bird/game.js", [HOOK]); } });
  const t0 = await m.evaluate(() => __game.skin);
  await at(m, W / 2, H * 0.775, true); await m.waitForTimeout(100);
  const t1 = await m.evaluate(() => ({ skin: __game.skin, state: __game.state }));
  const phoneMenu = await drawn(m);
  const phoneHint = { keys: await shows(m, "#hint .gs-keys"), touch: await shows(m, "#hint .gs-touch") };
  check("road-bird, phone: a tap on the skin turntable changes the skin (and doesn't start a game)", t1.skin !== t0 && t1.state === "menu", { t0, t1 });
  await at(m, W / 2, H * 0.40 + 25, true); await m.waitForTimeout(200);       // Classic
  await m.tap(".gs-pause-btn"); await m.waitForTimeout(100);
  const phonePause = await drawn(m);
  await m.tap(".gs-pause-btn"); await m.waitForTimeout(100);
  await m.evaluate(() => __game.eagle()); await m.waitForFunction(() => __game.state === "dead", null, { timeout: 20000 });   // (the swoop runs on game time: slower on a busy machine)
  const phoneOver = await drawn(m);
  check("road-bird, phone: the hints say tap / swipe, not keys (menu, skin, pause card, game over, page)",
    phoneHint.keys === false && phoneHint.touch && /tap to change/.test(phoneMenu) && !/\bC\b/.test(phoneMenu) && !/SPACE|ESC/.test(phoneMenu) &&
    /tap to resume/.test(phonePause) && !/\bP\b|Esc/.test(phonePause) && !/SPACE|ESC|⌫/.test(phoneOver),
    { phoneHint, phoneMenu, phonePause, phoneOver });
  check("road-bird, phone: no page errors", m.errs.length === 0, m.errs);
  await m.close();
  await phone.close();

  // ---- a 2× screen: the canvas is drawn at twice the pixels, clicks land on target
  const retina = await lib.newContext(browser, { deviceScaleFactor: 2 });
  const r = await lib.open(retina, base, "games/road-bird/", { before: (pg) => lib.injectScript(pg, "games/road-bird/game.js", [HOOK]) });
  const size = await r.evaluate(() => ({ w: document.getElementById("game").width, h: document.getElementById("game").height }));
  await at(r, W / 2, H * 0.40 + 2 * 62 + 25); await r.waitForTimeout(300);   // the Trains button
  const picked = await r.evaluate(() => ({ mode: __game.mode, state: __game.state }));
  check("road-bird, 2× screen: the canvas has twice the pixels and a click picks the mode under it",
    size.w === 2 * W && size.h === 2 * H && picked.mode === "trains" && picked.state === "playing", { size, picked });
  check("road-bird, 2× screen: frames draw with no page errors", r.errs.length === 0, r.errs);
  await r.close();
  await retina.close();

  await ctx.close();
};
