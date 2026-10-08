// Lights Out: Enter on a focused mode button only picks the mode, and a mode
// clicked with the mouse doesn't take over the run Enter then starts (a Zen
// tray used to run as Wind-up and fail on its first press); Backspace mid-tray
// asks before quitting; the keycaps, the end card's included, hide on a phone.
module.exports = async ({ browser, base, check, lib }) => {
  const open = (ctx) => lib.open(ctx, base, "games/lights-out/");
  const done = async (p, what) => { check("lights-out " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  let ctx = await lib.newContext(browser);

  // ---- Enter on a focused mode button picks that mode and starts nothing
  let p = await open(ctx);
  await p.keyboard.press("3");
  await p.evaluate(() => document.querySelector('#pick-mode button[data-v="windup"]').focus());
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await p.evaluate(() => ({ state: LightsOut.state(), mode: localStorage.getItem("lightsout_mode") }));
  check("lights-out: Enter on the focused Wind-up button picks it, without starting a Zen tray", menu.state === "menu" && menu.mode === "windup", menu);
  await done(p, "menu Enter");

  // ---- Wind-up clicked, then Zen picked by key: Enter deals a Zen tray that stays Zen
  p = await open(ctx);
  await p.click('#pick-mode button[data-v="windup"]');
  await p.keyboard.press("3");
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const dealt = await p.evaluate(() => LightsOut.state());
  if (dealt === "play") await p.evaluate(() => LightsOut.press(0));
  await p.waitForTimeout(150);
  const run = await p.evaluate(() => ({ after: LightsOut.state(), hud: document.getElementById("hud-mode").textContent, mode: localStorage.getItem("lightsout_mode"), over: document.getElementById("over-title").textContent }));
  check("lights-out: after clicking Wind-up then pressing 3, Enter deals a Zen tray and its first press doesn't end it",
    dealt === "play" && run.after === "play" && run.hud === "zen" && run.mode === "zen", Object.assign({ dealt }, run));
  await done(p, "mouse then Enter");

  // ---- a tray shut from the keyboard (Enter on each watch): Enter on the end
  // card is its New tray, not one more press of the watch still focused
  p = await open(ctx);
  await p.evaluate(() => LightsOut.start("zen"));
  for (const i of await p.evaluate(() => LightsOut.solution())) {
    await p.evaluate((i) => document.querySelectorAll("#board .watch")[i].focus(), i);
    await p.keyboard.press("Enter");
  }
  await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 3000 });
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const again = await p.evaluate(() => ({ state: LightsOut.state(), moves: LightsOut.moves(), card: !document.getElementById("over").hidden }));
  check("lights-out: after a tray shut with Enter on the watches, Enter on the end card deals a new tray", again.state === "play" && again.moves === 0 && !again.card, again);
  await done(p, "keyboard Next");

  // ---- Backspace mid-tray asks first: Esc keeps the tray, Enter quits to the menu
  p = await open(ctx);
  await p.evaluate(() => { LightsOut.start("zen"); LightsOut.press(0); });
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const ask = await p.evaluate(() => ({ state: LightsOut.state(), title: (document.querySelector(".gs-dialog h2") || {}).textContent || null }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const kept = await p.evaluate(() => ({ state: LightsOut.state(), moves: LightsOut.moves(), dialog: !!document.querySelector(".gs-dialog") }));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const quit = await p.evaluate(() => LightsOut.state());
  check("lights-out: Backspace mid-tray asks \"Quit this game?\"; Esc keeps the tray, Enter quits to the menu",
    ask.state === "play" && ask.title === "Quit this game?" && kept.state === "play" && kept.moves === 1 && !kept.dialog && quit === "menu" && p.leaves === 0, { ask, kept, quit, leaves: p.leaves });
  // a fresh tray has nothing to lose: straight back
  await p.evaluate(() => LightsOut.start("zen"));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const fresh = await p.evaluate(() => ({ state: LightsOut.state(), dialog: !!document.querySelector(".gs-dialog") }));
  check("lights-out: Backspace on a fresh tray goes straight back to the menu (guard)", fresh.state === "menu" && !fresh.dialog, fresh);
  // a wind-up's "Next level" card is still the run: Backspace and Modes ask
  // there too; a finished zen tray's card goes at once
  const card = async (m) => {
    await p.evaluate((m) => { LightsOut.start(m); LightsOut.solution().forEach((i) => LightsOut.press(i)); }, m);
    await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 8000 });
    await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  };
  const title = () => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  await card("windup");
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const nextKey = await title();
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await p.click("#to-menu"); await p.waitForTimeout(100);
  const nextBtn = await title();
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const nextQuit = await p.evaluate(() => LightsOut.state());
  await card("zen");
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const zenCard = { state: await p.evaluate(() => LightsOut.state()), title: await title() };
  check("lights-out: on a wind-up's Next level card Backspace and Modes ask \"Quit this game?\"; a finished zen tray's card goes straight back",
    nextKey === "Quit this game?" && nextBtn === "Quit this game?" && nextQuit === "menu" && zenCard.state === "menu" && !zenCard.title && p.leaves === 0,
    { nextKey, nextBtn, nextQuit, zenCard, leaves: p.leaves });
  await done(p, "Backspace");
  await ctx.close();

  // ---- every keycap of the game's own (the shared pause card's aside) hides
  // on a touch-only phone, on the menu and the end card
  ctx = await lib.newContext(browser, require("@playwright/test").devices["Pixel 7"]);
  p = await open(ctx);
  const caps = () => p.evaluate(() => [...document.querySelectorAll("kbd")].filter((k) => !k.closest(".gs-pause")).map((k) => { const s = k.closest(".gs-keys"); return k.textContent + ":" + (s ? getComputedStyle(s).display : "unwrapped"); }));
  const onMenu = await caps();
  await p.evaluate(() => { LightsOut.start("zen"); LightsOut.solution().forEach((i) => LightsOut.press(i)); });
  await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 3000 });
  const onCard = await caps();
  const hidden = (c) => c.length > 0 && c.every((x) => /:none$/.test(x));
  check("lights-out: on a touch-only phone every keycap is hidden, on the menu and the end card", hidden(onMenu) && hidden(onCard), { onMenu, onCard });
  await done(p, "touch keycaps");
  await ctx.close();
};
