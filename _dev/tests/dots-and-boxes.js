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

  // ---- the CPU takes its time: about three quarters of a second to answer,
  // and nearly half a second between the lines of a run of boxes (it used to
  // be a third of a second for both), with Visual FX off as with it on.
  // Timed in the page: three sides of the corner box are down, so the CPU
  // takes the fourth and then has to go again.
  {
    const times = {}, errs = [];
    for (const off of [false, true]) {
      const q = await lib.open(ctx, base, "games/dots-and-boxes/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:dots-and-boxes", off ? "1" : "0"); } catch (e) {} }, off) });
      await q.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
      await q.click("#startGame"); await q.waitForTimeout(200);
      times[off ? "off" : "on"] = await q.evaluate(() => new Promise((res) => {
        const theirs = () => hLines.concat(vLines).reduce((n, row) => n + row.filter((v) => v === "ai").length, 0);
        hLines[0][0] = "human"; vLines[0][0] = "human"; vLines[0][1] = "human"; draw();
        const n0 = theirs(), t0 = performance.now(), at = [];
        play("h", 2, 2);   // (a line well away from that box)
        (function poll() {
          const n = theirs() - n0;
          while (at.length < n) at.push(Math.round(performance.now() - t0));
          if (at.length >= 2 || performance.now() - t0 > 8000) res({ reply: at.length ? at[0] : -1, again: at.length > 1 ? at[1] - at[0] : -1, boxes: scores.ai });
          else setTimeout(poll, 5);
        })();
      }));
      errs.push(...q.errs);
      await q.close();
    }
    const slow = (t) => t.reply >= 600 && t.boxes >= 1 && t.again >= 430;
    check("dots-and-boxes: the CPU takes at least 0.6 s to answer and 0.43 s between the lines of a run of boxes, with Visual FX off as with it on", slow(times.on) && slow(times.off), times);
    check("dots-and-boxes (the CPU's pause): no page errors", errs.length === 0, errs);
  }
  await ctx.close();
};
