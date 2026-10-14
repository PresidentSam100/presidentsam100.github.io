// Road Bird with Visual FX off: the menu, the pause card, the eagle's swoop
// and the game-over card draw the same at any moment (no bob, pulse, ripple,
// coin spin or wing flap, the art still all there); with FX on the menu moves.
// On a phone a tap on the skin turntable changes the skin (C still does on a
// desktop), and the hints say tap / swipe instead of naming keys. The canvas
// is drawn at the screen's pixel density, and clicks still land on target.
// The menu: a click or a number picks a mode, the arrows that move the pick
// ride on it, and Play (Space or Enter) sits under the modes, above the skin.
// The how-to line lies inside the board's rim, and rows meet on hairlines.
const HOOK = ["window.__game = {", "window.__game = {\n  render: render,\n  eagle: function () { triggerEagle(); },\n  get mode() { return gameMode; },\n  get skin() { return skinSel; },"];
const W = 704, H = 768;   // the canvas's logical size (11 × 12 tiles of 64)
const MENU_Y = 268, PLAY_Y = MENU_Y + 3 * 62 + 50 + 22, SKIN_Y = 640;   // the first mode's top, Play's, the turntable's floor

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
  // ...the same, with where each string is drawn (the canvas's logical points)
  const drawnAt = (pg) => pg.evaluate(() => {
    const g = document.getElementById("game").getContext("2d"), out = [];
    g.fillText = function (s, x, y) { out.push({ s: String(s), x: Math.round(x), y: Math.round(y) }); return CanvasRenderingContext2D.prototype.fillText.apply(this, arguments); };
    try { __game.render(); } finally { delete g.fillText; }
    return out;
  });
  const shows = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display !== "none" : null; }, sel);
  const unlocked = (pg) => pg.addInitScript(() => { try { localStorage.setItem("crossy_high_classic", "300"); } catch (e) {} });   // every skin

  // desktop: C changes the skin, the hints name the keys
  let d = await lib.open(ctx, base, "games/road-bird/", { before: async (pg) => { await unlocked(pg); await lib.injectScript(pg, "games/road-bird/game.js", [HOOK]); } });
  const s0 = await d.evaluate(() => __game.skin); await d.keyboard.press("c"); const s1 = await d.evaluate(() => __game.skin);
  const deskMenu = await drawn(d);
  const deskHint = { keys: await shows(d, "#hint .gs-keys"), touch: await shows(d, "#hint .gs-touch") };
  check("road-bird, desktop (guard): C changes the skin", s1 !== s0, { s0, s1 });
  check("road-bird, desktop: the hints name the keys", deskHint.keys && deskHint.touch === false && deskMenu.split(" | ").includes("C") && /SPACE/.test(deskMenu), { deskHint, deskMenu });
  // the menu: ↑ and ↓ ride on the picked mode and go with it, Play wears Space
  // or Enter between the modes and the skin, and no line of keys is left
  const named = (list, s) => list.filter((t) => t.s === s);
  const onMode = (t, i) => !!t && t.y > MENU_Y + i * 62 && t.y < MENU_Y + i * 62 + 50 && t.x > (W + 380) / 2;
  const menuAt = await drawnAt(d);
  await d.keyboard.press("3"); await d.waitForTimeout(100);
  const menu3 = await drawnAt(d);
  const arrows = { up0: named(menuAt, "↑"), down0: named(menuAt, "↓"), up3: named(menu3, "↑"), down3: named(menu3, "↓") };
  check("road-bird, desktop: one ↑ and one ↓ ride beside the picked mode and go with it; no line of keys says select or tap to play",
    Object.keys(arrows).every((k) => arrows[k].length === 1) && onMode(arrows.up0[0], 0) && onMode(arrows.down0[0], 0) && onMode(arrows.up3[0], 2) && onMode(arrows.down3[0], 2) &&
    !/ select {2}•|tap to play/.test(deskMenu), { arrows, deskMenu });
  const playKey = named(menuAt, "SPACE or ENTER"), skinAt = menuAt.find((t) => /^Skin: /.test(t.s));
  check("road-bird, desktop: Play wears Space or Enter, under the four modes and above the skin",
    playKey.length === 1 && playKey[0].y > PLAY_Y && playKey[0].y < PLAY_Y + 50 && menuAt.some((t) => t.s === "Play") && !!skinAt && skinAt.y > PLAY_Y + 50 + 60, { playKey, skinAt });
  // a click picks a mode, as its number does; Play starts the picked one
  await at(d, W / 2, MENU_Y + 62 + 25); await d.waitForTimeout(150);          // Cars & Trucks
  const clicked = await d.evaluate(() => ({ state: __game.state, sel: __game.menuSel }));
  // the how-to line lies inside the board, clear of its rim, whatever the window
  const hintBox = (pg) => pg.evaluate(() => {
    const h = document.getElementById("hint").getBoundingClientRect(), c = document.getElementById("game").getBoundingClientRect();
    // (oneLine: on a short window's small board it wrapped, onto the menu's last line)
    const oneLine = h.height < 2 * parseFloat(getComputedStyle(document.getElementById("hint")).fontSize);
    return { top: Math.round(h.top), bottom: Math.round(h.bottom), board: Math.round(c.bottom), boardH: Math.round(c.height), over: Math.round(Math.max(c.left - h.left, h.right - c.right)), oneLine, win: innerHeight };
  });
  const hintAt = {};
  for (const [w, h] of [[1280, 900], [1366, 657], [1280, 600]]) {
    await d.setViewportSize({ width: w, height: h }); await d.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    hintAt[w + "x" + h] = await hintBox(d);
  }
  await d.setViewportSize({ width: 1280, height: 900 }); await d.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  check("road-bird, desktop: the how-to line lies inside the board, clear of its rim, on one line (1280 x 900, 1366 x 657, 1280 x 600)",
    Object.keys(hintAt).every((k) => { const b = hintAt[k]; return b.bottom <= b.board - 10 && b.top >= b.board - b.boardH * 0.08 && b.over <= 0 && b.oneLine; }), hintAt);
  // the keys that are on the corner buttons already (Esc for the games page,
  // M for the sound) aren't listed again on the board; on the game-over card
  // Space and Backspace ride on their own buttons, with no line of keys under
  // them; and the how-to-play line along the foot of the page is lettered
  // like the board's captions (white, with a dark outline)
  await at(d, W / 2, PLAY_Y + 25); await d.waitForTimeout(300);                // Play
  const played = await d.evaluate(() => ({ state: __game.state, mode: __game.mode }));
  check("road-bird, desktop: a click picks a mode without starting it, and Play starts the picked one",
    clicked.state === "menu" && clicked.sel === 1 && played.state === "playing" && played.mode === "cars", { clicked, played });
  await d.evaluate(() => __game.death("runover"));
  await d.waitForFunction(() => __game.state === "dead", null, { timeout: 15000 });
  const overAt = await drawnAt(d), overAll = overAt.map((t) => t.s).join(" | ");
  const on = (s, y0) => overAt.some((t) => t.s === s && t.y > y0 && t.y < y0 + 50 && t.x > (W - 300) / 2 && t.x < (W + 300) / 2);
  const hintLook = await d.evaluate(() => { const c = getComputedStyle(document.getElementById("hint")); return { color: c.color, outlined: c.textShadow !== "none" && /rgba?\(0, 0, 0/.test(c.textShadow) }; });
  check("road-bird, desktop: Esc and M aren't listed again on the menu or the game-over card; Space or Enter rides on Play Again and ⌫ on Main Menu, with no line of keys under them",
    !/ESC/i.test(deskMenu) && !/ESC|mute|play again|menu  /i.test(overAll.replace(/Play Again|Main Menu/g, "")) && on("SPACE or ENTER", H * 0.60) && on("⌫", H * 0.60 + 64), { deskMenu, overAll });
  check("road-bird, desktop: the how-to-play line is lettered like the board's captions (white, dark outline)", hintLook.color === "rgb(255, 255, 255)" && hintLook.outlined, hintLook);
  await d.close();

  // ---- rows meet on hairlines: no band across the board deeper than 2 px (they
  // were 4 to 15, and a river's near bank a brown one 7 deep), on the menu and
  // in River, where water meets the grass in front of it
  d = await lib.open(ctx, base, "games/road-bird/", { before: (pg) => lib.injectScript(pg, "games/road-bird/game.js", [HOOK]) });
  const bands = (pg) => pg.evaluate((W) => {
    const g = document.getElementById("game").getContext("2d"), fr = g.fillRect, out = {};
    g.fillRect = function (x, y, w, h) { if (w >= W && h > 2.5 && h < 40) out[Math.round(h)] = (out[Math.round(h)] || 0) + 1; return fr.apply(this, arguments); };
    try { __game.render(); } finally { delete g.fillRect; }
    return out;
  }, W);
  const bandsMenu = await bands(d);
  await d.keyboard.press("4"); await d.keyboard.press("Enter"); await d.waitForTimeout(300);
  const bandsRiver = await bands(d);
  check("road-bird: rows meet on hairlines, on the menu and in River (no band across the board deeper than 2 px)",
    Object.keys(bandsMenu).length === 0 && Object.keys(bandsRiver).length === 0 && (await d.evaluate(() => __game.mode)) === "river", { bandsMenu, bandsRiver });
  check("road-bird (seams): no page errors", d.errs.length === 0, d.errs);
  await d.close();

  // phone: a tap on the turntable changes the skin; the hints say tap / swipe
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  let m = await lib.open(phone, base, "games/road-bird/", { before: async (pg) => { await unlocked(pg); await lib.injectScript(pg, "games/road-bird/game.js", [HOOK]); } });
  const t0 = await m.evaluate(() => __game.skin);
  await at(m, W / 2, SKIN_Y - 10, true); await m.waitForTimeout(100);
  const t1 = await m.evaluate(() => ({ skin: __game.skin, state: __game.state }));
  const phoneMenu = await drawn(m);
  const phoneHint = { keys: await shows(m, "#hint .gs-keys"), touch: await shows(m, "#hint .gs-touch") };
  check("road-bird, phone: a tap on the skin turntable changes the skin (and doesn't start a game)", t1.skin !== t0 && t1.state === "menu", { t0, t1 });
  // (the how-to line is under the board there: the page has the room)
  const phoneLine = await m.evaluate(() => { const h = document.getElementById("hint").getBoundingClientRect(), c = document.getElementById("game").getBoundingClientRect(); return { top: Math.round(h.top), bottom: Math.round(h.bottom), board: Math.round(c.bottom), win: innerHeight }; });
  check("road-bird, phone: the how-to line sits just under the board, on the page", phoneLine.top >= phoneLine.board + 4 && phoneLine.top <= phoneLine.board + 24 && phoneLine.bottom <= phoneLine.win, phoneLine);
  await at(m, W / 2, MENU_Y + 3 * 62 + 25, true); await m.waitForTimeout(150);   // River: a tap picks it
  const tapped = await m.evaluate(() => ({ state: __game.state, sel: __game.menuSel }));
  await at(m, W / 2, PLAY_Y + 25, true); await m.waitForTimeout(200);            // Play
  const tapPlay = await m.evaluate(() => ({ state: __game.state, mode: __game.mode }));
  check("road-bird, phone: a tap picks a mode, and a tap on Play starts it", tapped.state === "menu" && tapped.sel === 3 && tapPlay.state === "playing" && tapPlay.mode === "river", { tapped, tapPlay });
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
  await at(r, W / 2, MENU_Y + 2 * 62 + 25); await r.waitForTimeout(150);     // the Trains button
  await at(r, W / 2, PLAY_Y + 25); await r.waitForTimeout(300);              // Play
  const picked = await r.evaluate(() => ({ mode: __game.mode, state: __game.state }));
  check("road-bird, 2× screen: the canvas has twice the pixels and a click picks the mode under it (Play then starts it)",
    size.w === 2 * W && size.h === 2 * H && picked.mode === "trains" && picked.state === "playing", { size, picked });
  check("road-bird, 2× screen: frames draw with no page errors", r.errs.length === 0, r.errs);
  await r.close();
  await retina.close();

  await ctx.close();
};
