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

  // ---- the computer takes its time to answer on every kind of board, with
  // Visual FX off as with it on (FX off used to cut its pause to a quarter of
  // a second). Timed in the page, from your mark to its mark.
  for (const [mode, cell] of [["classic", ".cell"], ["ultimate", ".ucell"], ["gomoku", ".gcell"]]) {
    const gaps = {}, errs = [];
    for (const off of [false, true]) {
      const q = await lib.open(ctx, base, "games/tic-tac-toe/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:tic-tac-toe", off ? "1" : "0"); } catch (e) {} }, off) });
      await youFirst(q);
      await q.click('.opt[data-value="' + mode + '"]');
      await q.click("#startGame"); await q.waitForTimeout(150);
      gaps[off ? "off" : "on"] = await q.evaluate((sel) => new Promise((res) => {
        const cells = document.querySelectorAll(sel), t0 = performance.now();
        cells[Math.floor(cells.length / 2)].click();
        (function poll() {
          if (document.querySelector(sel + ".o")) res(Math.round(performance.now() - t0));
          else if (performance.now() - t0 > 8000) res(-1);
          else setTimeout(poll, 5);
        })();
      }), cell);
      errs.push(...q.errs);
      await q.close();
    }
    check("tic-tac-toe " + mode + ": the computer takes the same pause to answer with Visual FX off as with it on (at least 0.4 s)", gaps.on >= 400 && gaps.off >= 400, gaps);
    check("tic-tac-toe " + mode + " (the computer's pause): no page errors", errs.length === 0, errs);
  }
  await ctx.close();
};
