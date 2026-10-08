// Demolition Row: the x20 bonus, Slow and a banner don't run down while
// paused; a VS match's result card can't land on the menu or the next game;
// a pause asked for in the beat between VS rounds (the "Leave this game?"
// box, a tab switch) holds the next round paused. ☰ Menu mid-run asks first;
// the menu's key legend hides on a phone, leaving the on-screen pad's line.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = () => lib.open(ctx, base, "games/demolition-row/");
  const vs = async (p, fmt) => {
    await p.click('#mode-pick [data-mode="vs"]'); await p.click('#fmt-pick [data-fmt="' + fmt + '"]');
    await p.click("#play-btn"); await p.waitForTimeout(300);
  };
  const shown = (p, id) => p.evaluate((id) => !document.getElementById(id).classList.contains("hidden"), id);

  // ---- paused deadlines stay put
  let p = await open();
  await p.click('#mode-pick [data-mode="endless"]'); await p.click("#play-btn"); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = GAME.players[0].board, t = b.now(); b.bonusUntil = t + 8000; b.slowUntil = t + 9000; b.flashBanner("TEST", "#fff"); b.flash.until = t + 5000; });
  await p.keyboard.press("Escape"); await p.waitForTimeout(2500); await p.keyboard.press("Escape"); await p.waitForTimeout(50);
  const left = await p.evaluate(() => { const b = GAME.players[0].board, t = b.now(); return { state: GAME.state, bonus: Math.round(b.bonusUntil - t), slow: Math.round(b.slowUntil - t), flash: Math.round(b.flash.until - t) }; });
  check("demolition-row: the x20 bonus, Slow and a banner don't run down while paused",
    left.state === "playing" && left.bonus > 7400 && left.slow > 8400 && left.flash > 4400, left);
  check("demolition-row: no page errors (paused deadlines)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- a VS match won, then Menu and Play straight away: the old result card stays away
  p = await open();
  await vs(p, 1);
  await p.evaluate(() => { GAME.players[0].board.cleared = true; }); await p.waitForFunction(() => GAME.state === "roundpause");
  await p.evaluate(() => { document.getElementById("menu-btn").click(); setTimeout(() => document.getElementById("play-btn").click(), 200); });
  await p.waitForTimeout(900);
  const fresh = { state: await p.evaluate(() => GAME && GAME.state), result: await shown(p, "result") };
  check("demolition-row: Menu then Play right after a VS win: no old result card over the new game", fresh.state === "playing" && !fresh.result, fresh);
  check("demolition-row: no page errors (result card)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Home in the beat between VS rounds: the next round waits, paused, under the box
  p = await open();
  await vs(p, 3);
  await p.evaluate(() => { GAME.players[1].board.cleared = true; }); await p.waitForFunction(() => GAME.state === "roundpause");
  const beat = await p.evaluate(() => GAME.state);
  await p.keyboard.press("Home"); await p.waitForTimeout(1500);
  await p.waitForFunction(() => GAME.state !== "roundpause", null, { timeout: 10000 }).catch(() => {});   // (timers run late on a busy machine)
  const row0 = await p.evaluate(() => ({ state: GAME.state, r: GAME.players[0].board.piece && GAME.players[0].board.piece.pivot.r, box: !!document.querySelector(".gs-dialog") }));
  await p.waitForTimeout(900);
  const row1 = await p.evaluate(() => GAME.players[0].board.piece && GAME.players[0].board.piece.pivot.r);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);   // the box's "Keep playing"
  const kept = { state: await p.evaluate(() => GAME.state), card: await shown(p, "pause"), box: await p.evaluate(() => !!document.querySelector(".gs-dialog")) };
  check("demolition-row: Home between VS rounds holds the next round paused under the box; Keep playing plays on",
    beat === "roundpause" && row0.box && row0.state === "paused" && row1 === row0.r && kept.state === "playing" && !kept.card && !kept.box && p.leaves === 0,
    { beat, row0, row1, kept, leaves: p.leaves });
  await p.close();

  // ---- a tab switch in that beat: the next round starts on the pause card
  p = await open();
  await vs(p, 3);
  await p.evaluate(() => { GAME.players[1].board.cleared = true; }); await p.waitForFunction(() => GAME.state === "roundpause");
  await p.evaluate(() => window.dispatchEvent(new Event("blur"))); await p.waitForTimeout(1500);
  await p.waitForFunction(() => GAME.state !== "roundpause", null, { timeout: 10000 }).catch(() => {});
  const away = { state: await p.evaluate(() => GAME.state), card: await shown(p, "pause") };
  check("demolition-row: a tab switch between VS rounds starts the next round paused", away.state === "paused" && away.card, away);
  check("demolition-row: no page errors (VS beat)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- ☰ Menu mid-run: "Quit this game?" with the game paused under it
  p = await open();
  await p.click('#mode-pick [data-mode="endless"]'); await p.click("#play-btn"); await p.waitForTimeout(300);
  const box = () => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  await p.click("#menu-btn"); await p.waitForTimeout(150);
  const asked = { box: await box(), state: await p.evaluate(() => GAME && GAME.state), menu: await shown(p, "menu") };
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const stay = { box: await box(), state: await p.evaluate(() => GAME && GAME.state), card: await shown(p, "pause") };
  await p.evaluate(() => document.getElementById("menu-btn").click()); await p.waitForTimeout(150); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const quit ={ menu: await shown(p, "menu"), game: await p.evaluate(() => !!GAME) };
  check("demolition-row: ☰ Menu mid-run asks \"Quit this game?\" (paused under it); Keep playing plays on, Quit goes to the menu",
    asked.box === "Quit this game?" && asked.state === "paused" && !asked.menu && !stay.box && stay.state === "playing" && !stay.card && quit.menu && !quit.game && p.leaves === 0,
    { asked, stay, quit, leaves: p.leaves });
  // once the game is over there's nothing to lose: straight to the menu
  await p.click("#play-btn"); await p.waitForTimeout(300);
  await p.evaluate(() => { GAME.end("t", "m"); document.getElementById("menu-btn").click(); }); await p.waitForTimeout(150);
  const after = { box: await box(), menu: await shown(p, "menu") };
  check("demolition-row (guard): ☰ Menu after the game ends goes straight to the menu", !after.box && after.menu, after);
  check("demolition-row: no page errors (Menu)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the menu's key legend: on a desktop; on a phone only the pad's line
  const legend = (pg) => pg.evaluate(() => {
    const k = document.querySelector("#keys-help .gs-keys");
    return { keys: k ? getComputedStyle(k).display !== "none" : null, text: document.getElementById("keys-help").innerText };
  });
  p = await open();
  const deskKeys = await legend(p);
  await p.close();
  const { devices } = require("@playwright/test");
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(phone, base, "games/demolition-row/");
  const phoneKeys = await legend(p);
  await p.close(); await phone.close();
  check("demolition-row: the key legend shows on a desktop and hides on a phone, where the on-screen pad's line stays",
    deskKeys.keys === true && /P1/.test(deskKeys.text) && phoneKeys.keys === false && !/P1|Esc/.test(phoneKeys.text) && /on-screen pad/.test(phoneKeys.text),
    { deskKeys, phoneKeys });

  await ctx.close();
};
