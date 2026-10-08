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
  await ctx.close();
};
