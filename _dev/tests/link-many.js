// Link Many: a power aimed at a full column is refunded and stays armed (the
// status said "armed" while the tray had dropped it, and the next click dropped
// a plain disc); Esc with the Rules open closes them instead of leaving.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const done = async (p, what) => { check("link-many " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const open = async (mode) => {
    const p = await lib.open(ctx, base, "games/link-many/");
    await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
    if (mode) await p.click('.opts[data-target="gameModeSel"] .opt[data-value="' + mode + '"]');
    await p.click("#startGame");
    await p.waitForFunction(() => !__game.busy);
    return p;
  };

  // ---- a bomb aimed at a full column: refunded, still armed, and the next
  // column clicked gets the bomb
  let p = await open("power");
  await p.evaluate(() => { const b = __game.board; [1, 2, 1, 2, 1, 2].forEach((v, r) => { b[r][0] = v; }); });
  await p.click('#powerTray .pbtn[data-power="bomb"]');
  await p.evaluate(() => __game.humanMove(0)); await p.waitForTimeout(80);
  const full = await p.evaluate(() => ({ status: document.getElementById("status").textContent, armed: document.querySelector('.pbtn[data-power="bomb"]').classList.contains("armed"), left: __game.powers[1].bomb }));
  await p.evaluate(() => __game.humanMove(3)); await p.waitForTimeout(80);
  const next = await p.evaluate(() => ({ cell: __game.board[5][3], left: __game.powers[1].bomb }));
  check("link-many: a bomb aimed at a full column is refunded and stays armed; the next column gets the bomb",
    /armed/.test(full.status) && full.armed && full.left === 1 && next.cell === 4 && next.left === 0, { full, next });
  await done(p, "refund");

  // ---- Esc with the Rules open closes them, and stays on the page
  p = await open();
  await p.click("#rules");
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const rules = await p.evaluate(() => document.getElementById("rulesModal").classList.contains("open"));
  check("link-many: Esc with the Rules open closes them instead of leaving the game", !rules && p.leaves === 0, { rulesOpen: rules, leaves: p.leaves });
  await done(p, "rules Esc");

  // ---- mid-game, Restart and New Game ask first: Esc keeps the game, Enter
  // goes (New Game's picker only once it's said yes) and the game given up
  // goes down as a loss, as the ask says
  const title = (pg) => pg.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  const losses = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("connectfour_record") || '{"l":0}').l);
  const ask = async (btn, want, after) => {
    const pg = await open();
    await pg.evaluate(() => __game.humanMove(3));
    await pg.waitForFunction(() => !__game.busy, null, { timeout: 4000 });
    const press = () => pg.evaluate((b) => document.querySelector(b).click(), btn);
    await press(); await pg.waitForTimeout(80);
    const t = await title(pg), picker0 = await pg.evaluate(() => document.getElementById("modeModal").classList.contains("open"));
    const says = await pg.evaluate(() => (document.querySelector(".gs-dialog p") || {}).textContent || "");
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(80);
    const kept = await pg.evaluate(() => __game.board[5][3]), keptL = await losses(pg);
    await press(); await pg.waitForTimeout(80);
    await pg.keyboard.press("Enter"); await pg.waitForTimeout(150);
    const went = await pg.evaluate(after), wentL = await losses(pg), shown = await pg.evaluate(() => document.getElementById("l").textContent);
    await done(pg, btn + " asks");
    return { t, picker0, kept, went, says, keptL, wentL, shown, ok: t === want && !picker0 && kept === 1 && went && pg.leaves === 0 };
  };
  const restart = await ask("#restart", "Start over?", () => __game.board.every((r) => r.every((v) => v === 0)));
  check("link-many: Restart mid-game asks \"Start over?\"; Esc keeps the game, Enter starts it over", restart.ok, restart);
  const fresh = await ask("#reset", "Start a new game?", () => document.getElementById("modeModal").classList.contains("open"));
  check("link-many: New Game mid-game asks \"Start a new game?\" before its picker opens; Enter opens it", fresh.ok, fresh);
  const lost = (r) => /counts as a loss/i.test(r.says) && r.keptL === 0 && r.wentL === 1 && r.shown === "1";
  check("link-many: giving up a game in progress through Restart or New Game says it counts as a loss, and records one (Esc records nothing)",
    lost(restart) && lost(fresh), { restart, fresh });
  // before the player's first disc there's nothing to lose: Restart goes at once
  p = await open();
  await p.click("#restart"); await p.waitForTimeout(80);
  const none = await title(p), noneL = await losses(p);
  check("link-many: Restart before the first move starts over without asking, and records nothing (guard)", none === null && noneL === 0, { none, noneL });
  await done(p, "restart fresh");

  // ---- leaving the page mid-game asks, but records nothing
  p = await open();
  await p.evaluate(() => __game.humanMove(3));
  await p.waitForFunction(() => !__game.busy, null, { timeout: 4000 });
  await p.keyboard.press("Home"); await p.waitForTimeout(80);
  const leaveT = await title(p);
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const leftL = await losses(p);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  check("link-many: leaving the page mid-game asks \"Leave this game?\" and records no loss (guard)", leaveT === "Leave this game?" && p.leaves === 1 && leftL === 0, { leaveT, leaves: p.leaves, leftL });
  await done(p, "leave");
  await ctx.close();
};
