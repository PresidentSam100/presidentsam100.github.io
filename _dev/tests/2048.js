// 2048: a winning move that also leaves no moves still ends the game, after
// "Keep Going" the Game Over card comes up and leaving no longer asks; the AC
// key and the mode buttons ask before wiping a game in progress, and don't
// on a fresh board or a finished game; a key slides to its cell at the same
// pace with Visual FX on or off; a merge's points pop on the key it made.
const HOOK = ["  newGame();\n})();", `  newGame();
  window.__set2048 = function (rows) {
    newGame(); tilesEl.innerHTML = ""; tiles = {}; grid = [];
    for (var r = 0; r < 4; r++) grid.push([null, null, null, null]);
    for (r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (rows[r][c]) makeTile(r, c, rows[r][c], null);
  };
})();`];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/2048/", { before: (pg) => lib.injectScript(pg, "games/2048/game.js", [HOOK]) });
  // ← merges the 1024s into 2048, and the tile that spawns in the one free
  // cell (a 2 or a 4) leaves no merge anywhere
  await p.evaluate(() => __set2048([[1024, 1024, 8, 16], [32, 64, 128, 256], [128, 256, 512, 8], [8, 16, 32, 64]]));
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(550);
  const won = await p.evaluate(() => document.getElementById("overlay-title").textContent);
  await p.click("#overlay-keepgoing"); await p.waitForTimeout(550);
  const end = await p.evaluate(() => ({ shown: document.getElementById("overlay").classList.contains("show"), title: document.getElementById("overlay-title").textContent, asks: GameShell.leaveActive() }));
  check("2048: a winning move that leaves no moves reaches Game Over after Keep Going", /win/i.test(won) && end.shown && /Game Over/.test(end.title) && !end.asks, { won, end });

  // ---- what a button press leaves: the ask (if any), the mode, the board
  const dialog = () => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  const board = () => p.evaluate(() => ({ mode: localStorage.getItem("game2048_mode") || "normal", score: document.getElementById("score").textContent, tiles: document.querySelectorAll("#tiles .tile").length }));
  const press = (sel) => p.evaluate((s) => document.querySelector(s).click(), sel);

  // a finished game: AC deals a fresh board at once
  await press("#new-game"); await p.waitForTimeout(80);
  const over = { ask: await dialog(), after: await board() };
  check("2048: after Game Over, AC deals a fresh board at once (guard)", over.ask === null && over.after.score === "0" && over.after.tiles === 2, over);

  // a fresh board: a mode button switches at once
  await press("#mode-fib"); await p.waitForTimeout(80);
  const fresh = { ask: await dialog(), after: await board() };
  check("2048: on a fresh board, a mode button switches at once (guard)", fresh.ask === null && fresh.after.mode === "fib", fresh);
  await press("#mode-normal"); await p.waitForTimeout(80);

  // mid-game (one merge made): ask first; Esc keeps the game, Enter wipes it
  const midGame = async (sel) => {
    await p.evaluate(() => __set2048([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]));
    await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(200);
    const played = await board();
    await press(sel); await p.waitForTimeout(80);
    const ask = await dialog();
    await p.keyboard.press("Escape"); await p.waitForTimeout(80);
    const kept = await board();
    await press(sel); await p.waitForTimeout(80);
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const went = await board();
    return { ask, played, kept, went, leaves: p.leaves };
  };
  const ac = await midGame("#new-game");
  check("2048: mid-game, AC asks \"Start a new game?\"; Esc keeps the game, Enter deals a fresh board",
    ac.ask === "Start a new game?" && ac.played.score === "4" && ac.kept.score === "4" && ac.kept.tiles === ac.played.tiles && ac.went.score === "0" && ac.went.tiles === 2 && ac.leaves === 0, ac);
  const fib = await midGame("#mode-fib");
  check("2048: mid-game, Fibonacci asks \"Start a new game?\"; Esc keeps the game and mode, Enter switches to a fresh Fibonacci board",
    fib.ask === "Start a new game?" && fib.kept.mode === "normal" && fib.kept.score === "4" && fib.went.mode === "fib" && fib.went.score === "0" && fib.went.tiles === 2 && fib.leaves === 0, fib);
  check("2048: no page errors", p.errs.length === 0, p.errs);

  // ---- a key slides across to its cell, the same with Visual FX on and off
  // (where a key goes is play; FX off leaves out only the squash, ring and
  // float). The test holds the slide halfway, so a busy machine can't hide it.
  const slides = {};
  for (const off of [false, true]) {
    const q = await lib.open(ctx, base, "games/2048/", { before: async (pg) => {
      await lib.injectScript(pg, "games/2048/game.js", [HOOK]);
      await pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:2048", off ? "1" : "0"); } catch (e) {} }, off);
    } });
    await q.evaluate(() => __set2048([[0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]));
    slides[off ? "off" : "on"] = await q.evaluate(() => {
      const el = [...document.querySelectorAll("#tiles .tile")].find((t) => t.textContent === "4");
      const x = () => Math.round(new DOMMatrix(getComputedStyle(el).transform).m41);
      const from = x();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      const an = el.getAnimations();
      an.forEach((a) => a.pause());
      const ms = an.length ? Math.max(...an.map((a) => a.effect.getComputedTiming().endTime)) : 0;
      an.forEach((a) => { a.currentTime = ms / 2; });
      const half = x();
      an.forEach((a) => a.finish());
      return { from, half, to: x(), ms: Math.round(ms) };
    });
    check("2048 FX " + (off ? "off" : "on") + " slide: no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }
  const slidOk = (s) => s && s.ms >= 60 && s.ms <= 150 && s.to < s.half - 10 && s.half < s.from - 10;
  check("2048: a key slides across to its cell (halfway through, it's between the two) in the same 90 ms, with Visual FX on and with it off",
    slidOk(slides.on) && slidOk(slides.off) && slides.off.ms === slides.on.ms, slides);

  // ---- every merge's points pop on the key it made: "+128" for two 64s, the
  // score's own change, centred on that key; with Visual FX on rising as it
  // fades, off the same place throughout; under a second on screen; a pause
  // holds it. The small ones come nearly every move, so they're set smaller:
  // "+4" about 0.6 of full size, "+16" between, full from 128 up
  const pops = {};
  const popNow = (q) => q.evaluate(() => [...document.querySelectorAll(".pop-pts")].map((e) => ({ text: e.textContent, size: parseFloat(getComputedStyle(e).fontSize) })));
  const merge = async (q, a) => {
    await q.waitForFunction(() => !document.querySelector(".pop-pts"), null, { timeout: 5000 }).catch(() => {});
    await q.evaluate((a) => __set2048([[a, a, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), a);
    await q.keyboard.press("ArrowLeft");
    await q.waitForFunction(() => document.querySelector(".pop-pts"), null, { timeout: 5000 }).catch(() => {});
    return popNow(q);
  };
  for (const off of [false, true]) {
    const q = await lib.open(ctx, base, "games/2048/", { before: async (pg) => {
      await lib.injectScript(pg, "games/2048/game.js", [HOOK]);
      await pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:2048", off ? "1" : "0"); } catch (e) {} }, off);
    } });
    if (!off) {
      pops.small = await merge(q, 2);
      pops.mid = await merge(q, 8);
      await q.waitForFunction(() => !document.querySelector(".pop-pts"), null, { timeout: 5000 }).catch(() => {});
    }
    await q.evaluate(() => __set2048([[64, 64, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]));
    await q.keyboard.press("ArrowLeft");
    await q.waitForFunction(() => document.querySelector(".pop-pts"), null, { timeout: 5000 });
    pops[off ? "off" : "on"] = await q.evaluate(() => {
      const el = document.querySelector(".pop-pts"), a = el.getAnimations()[0];
      const key = [...document.querySelectorAll("#tiles .tile")].find((t) => t.textContent === "128" && t.style.transform.indexOf("translate(0px, 0px)") === 0).getBoundingClientRect();
      a.pause();
      const ms = a.effect.getComputedTiming().endTime;
      const at = (f) => { a.currentTime = ms * f; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, o: +getComputedStyle(el).opacity }; };
      const early = at(0.1), late = at(0.8), end = at(0.999);
      return { text: el.textContent, size: parseFloat(getComputedStyle(el).fontSize), score: document.getElementById("score").textContent, ms: Math.round(ms), n: document.querySelectorAll(".pop-pts").length,
        onKey: Math.abs(early.x - (key.left + key.width / 2)) < 2 && early.y > key.top && early.y < key.bottom, rise: Math.round(early.y - late.y), endOpacity: end.o };
    });
    check("2048 FX " + (off ? "off" : "on") + " points: no page errors", q.errs.length === 0, q.errs);
    if (off) {
      // (a fresh merge, played in real time, then paused: it stays; resumed, it goes)
      await q.evaluate(() => __set2048([[0, 0, 0, 0], [0, 0, 0, 0], [256, 256, 0, 0], [0, 0, 0, 0]]));
      await q.keyboard.press("ArrowLeft");
      await q.waitForFunction(() => document.querySelector(".pop-pts"), null, { timeout: 5000 });
      await q.keyboard.press("p");
      await q.waitForTimeout(1300);
      pops.paused = await q.evaluate(() => { const el = document.querySelector(".pop-pts"); return el ? { text: el.textContent, state: el.getAnimations()[0].playState, size: parseFloat(getComputedStyle(el).fontSize) } : null; });
      await q.keyboard.press("p");
      await q.waitForFunction(() => !document.querySelector(".pop-pts"), null, { timeout: 3000 }).catch(() => {});
      pops.resumed = await q.evaluate(() => document.querySelectorAll(".pop-pts").length);
    }
    await q.close();
  }
  const popOk = (s) => s && s.text === "+128" && /^(128|148)$/.test(s.score) && s.n === 1 && s.onKey && s.ms >= 700 && s.ms <= 1000 && s.endOpacity < 0.05;
  check("2048: a big merge's points (+128 for two 64s, the score's change) pop on the key it made and are gone in under a second, with Visual FX on and off",
    popOk(pops.on) && popOk(pops.off) && pops.on.ms === pops.off.ms, pops);
  const sized = (sm, md, full) => sm.length === 1 && sm[0].text === "+4" && md.length === 1 && md[0].text === "+16" &&
    sm[0].size >= 10 && Math.abs(sm[0].size / full - 0.6) < 0.06 && md[0].size > sm[0].size && md[0].size < full;
  check("2048: a small merge pops its points too, set smaller: +4 about 0.6 of the +128's size, +16 between, +512 the same as +128",
    !!pops.small && !!pops.mid && !!pops.on && sized(pops.small, pops.mid, pops.on.size) && !!pops.paused && pops.paused.size === pops.off.size,
    { small: pops.small, mid: pops.mid, full: pops.on && pops.on.size, p512: pops.paused && pops.paused.size });
  {
    // (a phone: the small ones still 10 px or more, under the full size)
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await lib.open(c, base, "games/2048/", { before: (pg) => lib.injectScript(pg, "games/2048/game.js", [HOOK]) });
    const ph = { small: await merge(q, 2), mid: await merge(q, 8), full: await merge(q, 64) };
    check("2048 (phone): +4 pops at 0.6 of full size, 10 px or more; +16 between", ph.full.length === 1 && sized(ph.small, ph.mid, ph.full[0].size), ph);
    check("2048 (phone) points: no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }
  check("2048: with Visual FX on the points rise as they fade; with it off they stay where they are",
    pops.on && pops.off && pops.on.rise > 5 && Math.abs(pops.off.rise) < 1, { on: pops.on && pops.on.rise, off: pops.off && pops.off.rise });
  check("2048: a pause holds the points where they are (still there after 1.3 s), and resumed they go",
    !!pops.paused && pops.paused.text === "+512" && pops.paused.state === "paused" && pops.resumed === 0, { paused: pops.paused, resumed: pops.resumed });
  await ctx.close();
};
