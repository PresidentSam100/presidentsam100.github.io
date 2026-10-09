// Mahjong: Enter on a focused mode button only picks the mode, and a mode
// clicked with the mouse doesn't take over the run Enter then starts (a
// Classic deal used to be recorded as the Daily); Ctrl+Z does nothing while
// paused; a reshuffle drops the old selection, and one that can't re-deal
// costs nothing and points at Undo, and so does the no-pairs nudge when no
// reshuffle can fit, which also offers New deal (and on the Daily, giving
// up), asking first; the keycaps hide on a phone.
const HOOK = ["    toMenu: toMenu\n  };\n})();", `    toMenu: toMenu,
    pos: function () { return pos; },
    setLive: function (a, k) { live = new Set(a); if (k) a.forEach(function (i, j) { kinds[i] = k[j]; }); undoStack = [[0, 1]]; selected = -1; buildBoard(); hud(); },
    nudge: function () { hint(true); }
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

  // ---- the no-pairs nudge points the way on: at Undo when no reshuffle can
  // fit what's left (the four-high stack), at Shuffle when one can (a row of
  // four whose free ends don't match)
  const nudge = async (where, k) => {
    const pg = await open(ctx);
    await pg.evaluate(() => Mahjong.start("classic"));
    const idx = await pg.evaluate((where) => Mahjong.pos().map((q, i) => (where === "stack" ? q[0] === 12 && q[1] === 6 : q[1] === 0 && q[2] === 0 && q[0] >= 2 && q[0] <= 8) ? i : -1).filter((i) => i >= 0), where);
    await pg.evaluate((a) => { Mahjong.setLive(a[0], a[1]); Mahjong.nudge(); }, [idx, k]);
    const r = await pg.evaluate(() => ({ undo: document.getElementById("btn-undo").style.outline, shuffle: document.getElementById("btn-shuffle").style.outline, note: document.getElementById("hud-pairs").textContent, pairs: Mahjong.freePairsCount() }));
    await done(pg, "nudge " + where);
    return Object.assign({ n: idx.length }, r);
  };
  const dead = await nudge("stack", ["d1", "d2", "d1", "d2"]);
  check("mahjong: with no pairs and no reshuffle that fits, the nudge says so and points at Undo, not Shuffle",
    dead.n === 4 && dead.pairs === 0 && /solid/.test(dead.undo) && !dead.shuffle && /undo/i.test(dead.note), dead);
  const row = await nudge("row", ["d1", "d2", "d1", "d2"]);
  check("mahjong: with no pairs but a reshuffle that fits, the nudge still points at Shuffle (guard)",
    row.n === 4 && row.pairs === 0 && /solid/.test(row.shuffle) && !row.undo, row);

  // ---- a dead board (no pairs, no reshuffle fits) offers a way out after
  // Undo: New deal (asking first), and on the Daily, giving up (asking first,
  // recording nothing: the Daily keeps only a clear)
  const stuck = async (mode) => {
    const pg = await open(ctx);
    await pg.evaluate((m) => Mahjong.start(m), mode);
    const idx = await pg.evaluate(() => Mahjong.pos().map((q, i) => (q[0] === 12 && q[1] === 6 ? i : -1)).filter((i) => i >= 0));
    await pg.evaluate((a) => { Mahjong.setLive(a, ["d1", "d2", "d1", "d2"]); Mahjong.nudge(); }, idx);
    const bar = await pg.evaluate(() => {
      const shown = (id) => { const e = document.getElementById(id); return !!e && !!e.offsetParent; };
      return { note: document.getElementById("hud-pairs").textContent, deal: shown("btn-newdeal"), giveUp: shown("btn-giveup") };
    });
    return { pg, bar };
  };
  const ask = (pg) => pg.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  // Classic: Undo first, then New deal; Esc on its ask keeps the board, Enter deals afresh
  let s = await stuck("classic");
  await s.pg.evaluate(() => document.getElementById("btn-newdeal") && document.getElementById("btn-newdeal").click());
  const dealAsk = await ask(s.pg);
  await s.pg.keyboard.press("Escape"); await s.pg.waitForTimeout(80);
  const keptN = await s.pg.evaluate(() => Mahjong.tilesLeft());
  await s.pg.evaluate(() => document.getElementById("btn-newdeal") && document.getElementById("btn-newdeal").click());
  await s.pg.keyboard.press("Enter"); await s.pg.waitForTimeout(150);
  const dealt = await s.pg.evaluate(() => ({ state: Mahjong.state(), left: Mahjong.tilesLeft(), bar: !!(document.getElementById("hud-stuck") || {}).offsetParent }));
  check("mahjong: a dead Classic board says undo a pair, or New deal; New deal asks \"Start a new game?\", Esc keeps the board, Enter deals a fresh turtle",
    /undo a pair/.test(s.bar.note) && s.bar.deal && !s.bar.giveUp && dealAsk === "Start a new game?" && keptN === 4 && dealt.state === "play" && dealt.left === 144 && !dealt.bar && s.pg.leaves === 0,
    { bar: s.bar, dealAsk, keptN, dealt });
  await done(s.pg, "dead classic");
  // Undo takes the way-out bar away again
  s = await stuck("classic");
  await s.pg.evaluate(() => Mahjong.undoNow());
  const afterUndo = await s.pg.evaluate(() => ({ bar: !!(document.getElementById("hud-stuck") || {}).offsetParent, note: document.getElementById("hud-pairs").textContent }));
  check("mahjong: after Undo on a dead board, the way-out actions go and the pairs count is back",
    s.bar.deal && !afterUndo.bar && /pairs open/.test(afterUndo.note), { before: s.bar, afterUndo });
  await done(s.pg, "dead undo");
  // Daily: New deal is today's turtle again, so it asks "Start over?" (Esc keeps
  // the board); give up asks "Quit this game?", Enter goes to the menu and records nothing
  s = await stuck("daily");
  await s.pg.evaluate(() => document.getElementById("btn-newdeal").click());
  const again = await s.pg.evaluate(() => ({ title: (document.querySelector(".gs-dialog h2") || {}).textContent || null, text: (document.querySelector(".gs-dialog p") || {}).textContent || "", ok: [...document.querySelectorAll(".gs-dialog button")].map((b) => b.textContent).join("|") }));
  await s.pg.keyboard.press("Escape"); await s.pg.waitForTimeout(80);
  check("mahjong: on a dead Daily, New deal asks \"Start over?\", saying today's turtle is dealt again from the start",
    again.title === "Start over?" && /dealt again, from the start/.test(again.text) && /Start over/.test(again.ok) && (await s.pg.evaluate(() => Mahjong.tilesLeft())) === 4, again);
  await s.pg.evaluate(() => document.getElementById("btn-giveup") && document.getElementById("btn-giveup").click());
  const quitAsk = await ask(s.pg);
  await s.pg.keyboard.press("Enter"); await s.pg.waitForTimeout(150);
  const gaveUp = await s.pg.evaluate(() => ({ state: Mahjong.state(), done: Mahjong.daily().done, stored: localStorage.getItem("mahjong_daily") }));
  check("mahjong: a dead Daily also offers Daily: give up, which asks \"Quit this game?\" and goes to the menu, recording nothing",
    s.bar.deal && s.bar.giveUp && quitAsk === "Quit this game?" && gaveUp.state === "menu" && !gaveUp.done && gaveUp.stored === null && s.pg.leaves === 0,
    { bar: s.bar, quitAsk, gaveUp });
  await done(s.pg, "dead daily");
  await ctx.close();

  // ---- on a touch-only phone every keycap of the game's own is hidden (the
  // shared pause card's are game-shell.js's): menu, HUD, end card
  ctx = await lib.newContext(browser, require("@playwright/test").devices["Pixel 7"]);
  p = await open(ctx);
  const caps = () => p.evaluate(() => [...document.querySelectorAll("kbd")].filter((k) => !k.closest(".gs-pause")).map((k) => { const s = k.closest(".gs-keys"); return k.textContent + ":" + (s ? getComputedStyle(s).display : "unwrapped"); }));
  const onMenu = await caps();
  await p.evaluate(() => Mahjong.start("classic"));
  const inPlay = await caps();
  await clearDesk(p);
  const onCard = await caps();
  const hidden = (c) => c.length > 0 && c.every((x) => /:none$/.test(x));
  check("mahjong: on a touch-only phone every keycap is hidden, on the menu, the HUD and the end card", hidden(onMenu) && hidden(inPlay) && hidden(onCard), { onMenu, inPlay, onCard });
  await done(p, "touch keycaps");
  await ctx.close();
};
