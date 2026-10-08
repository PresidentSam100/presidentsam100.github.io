// Lights Out: Enter on a focused mode button only picks the mode, and a mode
// clicked with the mouse doesn't take over the run Enter then starts (a Zen
// tray used to run as Wind-up and fail on its first press); the buttons'
// keycaps, the end card's included, hide on a touch-only phone.
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
  await ctx.close();

  // ---- the keycaps on the menu and end-card buttons hide on a touch-only phone
  ctx = await lib.newContext(browser, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  p = await open(ctx);
  const caps = () => p.evaluate(() => [...document.querySelectorAll("button kbd")].map((k) => { const s = k.closest(".gs-keys"); return k.textContent + ":" + (s ? getComputedStyle(s).display : "unwrapped"); }));
  const onMenu = await caps();
  await p.evaluate(() => { LightsOut.start("zen"); LightsOut.solution().forEach((i) => LightsOut.press(i)); });
  await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 3000 });
  const onCard = await caps();
  const hidden = (c) => c.length > 0 && c.every((x) => /:none$/.test(x));
  check("lights-out: on a touch-only phone the buttons' keycaps are hidden, on the menu and the end card", hidden(onMenu) && hidden(onCard), { onMenu, onCard });
  await done(p, "touch keycaps");
  await ctx.close();
};
