// Link Many: a power aimed at a full column is refunded and stays armed (the
// status said "armed" while the tray had dropped it, and the next click dropped
// a plain disc); Esc with the Rules open closes them instead of leaving; the
// wall's confetti drifts with Visual FX on and holds still with it off.
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
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);   // (Esc again leaves)
  const leftL = await losses(p);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  check("link-many: leaving the page mid-game asks \"Leave this game?\" and records no loss (guard)", leaveT === "Leave this game?" && p.leaves === 1 && leftL === 0, { leaveT, leaves: p.leaves, leftL });
  await done(p, "leave");

  // ---- the CPU takes its time to answer, with Visual FX off as with it on
  // (FX off used to cut its pause to a fifth of a second: the two discs
  // landed together). Timed in the page, from your move to its disc.
  const gaps = {};
  for (const off of [false, true]) {
    const q = await lib.open(ctx, base, "games/link-many/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:link-many", off ? "1" : "0"); } catch (e) {} }, off) });
    await q.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
    await q.click("#startGame");
    await q.waitForFunction(() => !__game.busy);
    gaps[off ? "off" : "on"] = await q.evaluate(() => new Promise((res) => {
      const theirs = () => __game.board.some((row) => row.indexOf(2) >= 0), t0 = performance.now();
      __game.humanMove(3);
      (function poll() {
        if (theirs()) res(Math.round(performance.now() - t0));
        else if (performance.now() - t0 > 8000) res(-1);
        else setTimeout(poll, 5);
      })();
    }));
    await done(q, "the CPU's pause, FX " + (off ? "off" : "on"));
  }
  check("link-many: the CPU takes the same pause to answer with Visual FX off as with it on (at least 0.75 s)", gaps.on >= 750 && gaps.off >= 750, gaps);
  await ctx.close();

  // ---- the wall's confetti: FX on, the far pattern and every near piece
  // drift down (behind the picker too, where the toy is out of sight), and
  // stop where they are while paused; FX off, the same pieces held still.
  // Laptop and phone.
  {
    const { devices } = require("@playwright/test");
    for (const [label, opts] of [["laptop", null], ["phone", devices["Pixel 7"]]]) {
      const got = {};
      for (const off of [false, true]) {
        const c = await lib.newContext(browser, opts || undefined);
        const q = await lib.open(c, base, "games/link-many/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:link-many", off ? "1" : "0"); } catch (e) {} }, off) });
        const spots = () => q.evaluate(() => [...document.querySelectorAll(".wall .tile, .wall .bit")].map((b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
        const moved = async () => {
          const a = await spots(); await q.waitForTimeout(700); const b = await spots();
          return { all: a.length, moved: a.filter((x, i) => Math.hypot(x[0] - b[i][0], x[1] - b[i][1]) > 3).length };
        };
        const r = { bits: await q.evaluate(() => document.querySelectorAll(".wall .bit").length) };
        // the picker: the toy and its bars out of sight, the wall behind the card
        r.picker = await q.evaluate(() => ({
          hidden: ["h1", "#status", ".stand", ".controls", ".score"].every((s) => getComputedStyle(document.querySelector(s)).visibility === "hidden"),
          clear: getComputedStyle(document.getElementById("modeModal")).backgroundImage === "none",
        }));
        r.pickerMove = await moved();
        // (seen there: a picture with the confetti differs from one without
        // it; nothing else on the picker moves)
        const withIt = await q.screenshot();
        await q.evaluate(() => document.querySelectorAll(".wall").forEach((w) => { w.style.visibility = "hidden"; }));
        const without = await q.screenshot();
        await q.evaluate(() => document.querySelectorAll(".wall").forEach((w) => { w.style.visibility = ""; }));
        r.seen = withIt && without && Buffer.compare(withIt, without) !== 0;
        await q.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
        await q.click("#startGame");
        await q.waitForFunction(() => !__game.busy);
        r.shown = await q.evaluate(() => ["h1", ".stand", ".controls"].every((s) => getComputedStyle(document.querySelector(s)).visibility === "visible"));
        r.playMove = await moved();
        r.anims = await q.evaluate(() => [...document.querySelectorAll(".wall")].reduce((n, w) => n + w.getAnimations({ subtree: true }).length, 0));
        if (!off) {
          await q.keyboard.press("p");
          await q.waitForFunction(() => document.documentElement.classList.contains("lm-paused"), null, { timeout: 8000 }).catch(() => {});
          r.pausedMove = await moved();
          await q.keyboard.press("p");
          await q.waitForFunction(() => !document.documentElement.classList.contains("lm-paused"), null, { timeout: 8000 }).catch(() => {});
          r.resumedMove = await moved();
        }
        got[off ? "off" : "on"] = r;
        await done(q, "wall " + label + " FX " + (off ? "off" : "on"));
        await c.close();
      }
      const on = got.on, offR = got.off, all = (m) => m.all > 1 && m.moved === m.all;
      check("link-many (" + label + "): the picker shows the wall itself, the toy and its bars out of sight behind the card, the confetti seen there; back in the game, the toy shows again",
        [on, offR].every((r) => r.picker.hidden && r.picker.clear && r.seen && r.shown), got);
      check("link-many (" + label + "), FX on: the far confetti and every near piece drift down, behind the picker and in play",
        on.bits >= 10 && all(on.pickerMove) && all(on.playMove), on);
      check("link-many (" + label + "), FX on: paused, the confetti stops where it is, and drifts on again on resume",
        on.pausedMove && on.pausedMove.moved === 0 && on.pausedMove.all > 1 && all(on.resumedMove), on);
      check("link-many (" + label + "), FX off: the same confetti, every piece, held still",
        offR.bits >= 10 && offR.bits === on.bits && offR.pickerMove.moved === 0 && offR.playMove.moved === 0 && offR.playMove.all === on.playMove.all && offR.anims === 0, offR);
    }
  }
};
