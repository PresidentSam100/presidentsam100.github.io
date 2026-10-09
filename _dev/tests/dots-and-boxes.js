// Dots and Boxes: with the Rules open, Esc closes them and stays put (before
// a move it would leave, after one it would ask to); with them shut it leaves.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/dots-and-boxes/");
  const rules = () => p.evaluate(() => ({ open: document.getElementById("rulesModal").classList.contains("open"), dialog: !!document.querySelector(".gs-dialog") }));
  await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
  await p.click("#startGame"); await p.waitForTimeout(100);

  await p.click("#rules"); await p.waitForTimeout(80);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const before = Object.assign(await rules(), { leaves: p.leaves });
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  check("dots-and-boxes: Esc closes the Rules without leaving; with them shut, Esc leaves",
    !before.open && before.leaves === 0 && p.leaves === 1, { before, leaves: p.leaves });

  await p.evaluate(() => { document.getElementById("rulesModal").classList.remove("open"); play("h", 0, 0); }); await p.waitForTimeout(50);
  await p.click("#rules"); await p.waitForTimeout(80);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const mid = await rules();
  check("dots-and-boxes: mid-game, Esc closes the Rules instead of asking to leave", !mid.open && !mid.dialog && p.leaves === 1, { mid, leaves: p.leaves });
  check("dots-and-boxes: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();
};
