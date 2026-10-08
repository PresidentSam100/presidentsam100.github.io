// Tic-Tac-Toe: Esc closes the Rules card (and stays in the game); Order &
// Chaos tells Order the rule the board plays by: five of one symbol.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  // (the coin flip always says "you", as in guard.js)
  const youFirst = (pg) => pg.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
  let p = await lib.open(ctx, base, "games/tic-tac-toe/");
  await youFirst(p);
  await p.click("#startGame"); await p.waitForTimeout(150);
  await p.click("#rules");
  const open = await p.evaluate(() => document.getElementById("rulesModal").classList.contains("open"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  const shut = await p.evaluate(() => !document.getElementById("rulesModal").classList.contains("open"));
  check("tic-tac-toe: Esc closes the Rules card and stays in the game", open && shut && p.leaves === 0, { open, shut, leaves: p.leaves });
  await p.close();

  p = await lib.open(ctx, base, "games/tic-tac-toe/");
  await youFirst(p);
  await p.click('.opt[data-value="chaos"]'); await p.click('#chaosSideGroup .opt[data-value="order"]');
  await p.click("#startGame"); await p.waitForTimeout(150);
  const prompt = await p.evaluate(() => document.getElementById("status").textContent);
  check("tic-tac-toe: Order's prompt asks for five of one symbol (not any mix)", !/any mix/i.test(prompt) && /one symbol/i.test(prompt), prompt);
  check("tic-tac-toe: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();
};
