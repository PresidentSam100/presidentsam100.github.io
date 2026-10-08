// Mahjong: Enter on a focused mode button only picks the mode, and a mode
// clicked with the mouse doesn't take over the run Enter then starts (a
// Classic deal used to be recorded as the Daily); Ctrl+Z does nothing while
// paused; a reshuffle drops the old selection, and one that can't re-deal
// costs nothing and points at Undo; the buttons' keycaps hide on a phone.
const HOOK = ["    toMenu: toMenu\n  };\n})();", `    toMenu: toMenu,
    pos: function () { return pos; },
    setLive: function (a) { live = new Set(a); undoStack = [[0, 1]]; selected = -1; buildBoard(); hud(); }
  };
})();`];

module.exports = async ({ browser, base, check, lib }) => {
  const open = (ctx) => lib.open(ctx, base, "games/mahjong/", { before: (pg) => lib.injectScript(pg, "games/mahjong/game.js", [HOOK]) });
  const done = async (p, what) => { check("mahjong " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  // clear the desk by free pairs (reshuffling when stuck)
  const clearDesk = (p) => p.evaluate(() => { for (let n = 0; n < 500 && Mahjong.tilesLeft(); n++) if (!Mahjong.removeOnePair()) Mahjong.shuffleNow(); return Mahjong.tilesLeft(); });
  let ctx = await lib.newContext(browser);

  // ---- Enter on a focused mode button picks that mode and starts nothing
  let p = await open(ctx);
  await p.keyboard.press("1");
  await p.evaluate(() => document.querySelector('#pick-mode button[data-v="daily"]').focus());
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await p.evaluate(() => ({ state: Mahjong.state(), mode: localStorage.getItem("mahjong_mode") }));
  check("mahjong: Enter on the focused Daily button picks it, without dealing a Classic turtle", menu.state === "menu" && menu.mode === "daily", menu);
  await done(p, "menu Enter");

  // ---- Daily clicked, then Classic picked by key: the deal Enter starts is a
  // Classic one all the way to its record
  p = await open(ctx);
  await p.click('#pick-mode button[data-v="daily"]');
  await p.keyboard.press("1");
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const started = await p.evaluate(() => Mahjong.state());
  const left = started === "play" ? await clearDesk(p) : -1;
  await p.waitForTimeout(100);
  const rec = await p.evaluate(() => ({ state: Mahjong.state(), daily: Mahjong.daily().done, classic: localStorage.getItem("mahjong_best_classic") }));
  check("mahjong: after clicking Daily then pressing 1, Enter deals a Classic turtle, recorded as Classic and not as today's Daily",
    started === "play" && left === 0 && rec.state === "over" && !rec.daily && Number(rec.classic) > 0, Object.assign({ started, left }, rec));
  await done(p, "mouse then Enter");

  // ---- paused, Ctrl+Z takes nothing back; resumed, it does
  p = await open(ctx);
  await p.evaluate(() => { Mahjong.start("classic"); Mahjong.removeOnePair(); });
  const t0 = await p.evaluate(() => Mahjong.tilesLeft());
  await p.keyboard.press("Escape"); await p.waitForTimeout(80);
  await p.keyboard.press("Control+z"); await p.waitForTimeout(80);
  const paused = await p.evaluate(() => Mahjong.tilesLeft());
  await p.keyboard.press("Escape"); await p.waitForTimeout(80);
  await p.keyboard.press("Control+z"); await p.waitForTimeout(80);
  const resumed = await p.evaluate(() => Mahjong.tilesLeft());
  check("mahjong: Ctrl+Z while paused takes nothing back; after resuming it undoes", t0 === 142 && paused === 142 && resumed === 144, { t0, paused, resumed });

  // ---- a reshuffle drops the selection along with the old faces
  await p.evaluate(() => Mahjong.click(Mahjong.freeIdx()[0]));
  const selBefore = await p.evaluate(() => document.querySelectorAll(".tile.sel").length);
  await p.keyboard.press("s"); await p.waitForTimeout(80);
  const selAfter = await p.evaluate(() => document.querySelectorAll(".tile.sel").length);
  check("mahjong: a reshuffle leaves no tile looking selected", selBefore === 1 && selAfter === 0, { selBefore, selAfter });

  // ---- a reshuffle that can't re-deal (only the four-high stack under the
  // apex left) charges nothing, says so and points at Undo
  const stack = await p.evaluate(() => Mahjong.pos().map((q, i) => (q[0] === 12 && q[1] === 6 ? i : -1)).filter((i) => i >= 0));
  await p.evaluate((s) => Mahjong.setLive(s), stack);
  const before = await p.evaluate(() => ({ t: Mahjong.timeNow(), board: Mahjong.boardHash() }));
  await p.keyboard.press("s"); await p.waitForTimeout(80);
  const after = await p.evaluate(() => ({ t: Mahjong.timeNow(), board: Mahjong.boardHash(), note: document.getElementById("hud-pairs").textContent, undo: document.getElementById("btn-undo").style.outline }));
  check("mahjong: a reshuffle that can't re-deal adds no time, says so and points at Undo",
    stack.length === 4 && after.board === before.board && after.t - before.t < 2000 && /undo/i.test(after.note) && /solid/.test(after.undo), { before, after });
  await done(p, "pause and shuffle");
  await ctx.close();

  // ---- the keycaps on the buttons hide on a touch-only phone: menu, HUD, end card
  ctx = await lib.newContext(browser, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  p = await open(ctx);
  const caps = () => p.evaluate(() => [...document.querySelectorAll("button kbd")].map((k) => { const s = k.closest(".gs-keys"); return k.textContent + ":" + (s ? getComputedStyle(s).display : "unwrapped"); }));
  const onMenu = await caps();
  await p.evaluate(() => Mahjong.start("classic"));
  const inPlay = await caps();
  await clearDesk(p);
  const onCard = await caps();
  const hidden = (c) => c.length > 0 && c.every((x) => /:none$/.test(x));
  check("mahjong: on a touch-only phone the buttons' keycaps are hidden, on the menu, the HUD and the end card", hidden(onMenu) && hidden(inPlay) && hidden(onCard), { onMenu, inPlay, onCard });
  await done(p, "touch keycaps");
  await ctx.close();
};
