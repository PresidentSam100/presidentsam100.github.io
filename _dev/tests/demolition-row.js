// Demolition Row: the x20 bonus, Slow and a banner don't run down while
// paused; a VS match's result card can't land on the menu or the next game;
// a pause asked for in the beat between VS rounds (the "Leave this game?"
// box, a tab switch) holds the next round paused. ☰ Menu mid-run asks first;
// the menu's key legend hides on a phone, leaving the on-screen pad's line.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = () => lib.open(ctx, base, "games/demolition-row/");
  const vs = async (p, fmt) => {
    await p.click('#mode-pick [data-mode="vs"]'); await p.click('#fmt-pick [data-fmt="' + fmt + '"]');
    await p.click("#play-btn"); await p.waitForTimeout(300);
  };
  const shown = (p, id) => p.evaluate((id) => !document.getElementById(id).classList.contains("hidden"), id);

  // ---- paused deadlines stay put
  let p = await open();
  await p.click('#mode-pick [data-mode="endless"]'); await p.click("#play-btn"); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = GAME.players[0].board, t = b.now(); b.bonusUntil = t + 8000; b.slowUntil = t + 9000; b.flashBanner("TEST", "#fff"); b.flash.until = t + 5000; window.__t0 = performance.now(); });
  await p.click(".gs-pause-btn, #pause-btn"); await p.waitForTimeout(2500); await p.click("#pause-resume"); await p.waitForTimeout(50);
  const left = await p.evaluate(() => { const b = GAME.players[0].board, t = b.now(); return { state: GAME.state, wall: Math.round(performance.now() - __t0), bonus: Math.round(b.bonusUntil - t), slow: Math.round(b.slowUntil - t), flash: Math.round(b.flash.until - t) }; });
  // Each deadline may lose the unpaused time around the pause (more on a busy
  // machine), but not the 2.5s pause itself: so it has lost at least 2s less
  // than the time that has gone by.
  const held = (lost) => lost < left.wall - 2000;
  check("demolition-row: the x20 bonus, Slow and a banner don't run down while paused",
    left.state === "playing" && held(8000 - left.bonus) && held(9000 - left.slow) && held(5000 - left.flash), left);
  check("demolition-row: no page errors (paused deadlines)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- a VS match won, then Menu and Play straight away: the old result card stays away
  p = await open();
  await vs(p, 1);
  await p.evaluate(() => { GAME.players[0].board.cleared = true; }); await p.waitForFunction(() => GAME.state === "roundpause");
  await p.evaluate(() => { document.getElementById("menu-btn").click(); setTimeout(() => document.getElementById("play-btn").click(), 200); });
  await p.waitForTimeout(900);
  const fresh = { state: await p.evaluate(() => GAME && GAME.state), result: await shown(p, "result") };
  check("demolition-row: Menu then Play right after a VS win: no old result card over the new game", fresh.state === "playing" && !fresh.result, fresh);
  check("demolition-row: no page errors (result card)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Home in the beat between VS rounds: the next round waits, paused, under the box
  p = await open();
  await vs(p, 3);
  await p.evaluate(() => { GAME.players[1].board.cleared = true; }); await p.waitForFunction(() => GAME.state === "roundpause");
  const beat = await p.evaluate(() => GAME.state);
  await p.keyboard.press("Home"); await p.waitForTimeout(1500);
  await p.waitForFunction(() => GAME.state !== "roundpause", null, { timeout: 10000 }).catch(() => {});   // (timers run late on a busy machine)
  const row0 = await p.evaluate(() => ({ state: GAME.state, r: GAME.players[0].board.piece && GAME.players[0].board.piece.pivot.r, box: !!document.querySelector(".gs-dialog") }));
  await p.waitForTimeout(900);
  const row1 = await p.evaluate(() => GAME.players[0].board.piece && GAME.players[0].board.piece.pivot.r);
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);   // the box's "Keep playing"
  const kept = { state: await p.evaluate(() => GAME.state), card: await shown(p, "pause"), box: await p.evaluate(() => !!document.querySelector(".gs-dialog")) };
  check("demolition-row: Home between VS rounds holds the next round paused under the box; Keep playing plays on",
    beat === "roundpause" && row0.box && row0.state === "paused" && row1 === row0.r && kept.state === "playing" && !kept.card && !kept.box && p.leaves === 0,
    { beat, row0, row1, kept, leaves: p.leaves });
  await p.close();

  // ---- a tab switch in that beat: the next round starts on the pause card
  p = await open();
  await vs(p, 3);
  await p.evaluate(() => { GAME.players[1].board.cleared = true; }); await p.waitForFunction(() => GAME.state === "roundpause");
  await p.evaluate(() => window.dispatchEvent(new Event("blur"))); await p.waitForTimeout(1500);
  await p.waitForFunction(() => GAME.state !== "roundpause", null, { timeout: 10000 }).catch(() => {});
  const away = { state: await p.evaluate(() => GAME.state), card: await shown(p, "pause") };
  check("demolition-row: a tab switch between VS rounds starts the next round paused", away.state === "paused" && away.card, away);
  check("demolition-row: no page errors (VS beat)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- ☰ Menu mid-run: "Quit this game?" with the game paused under it
  p = await open();
  await p.click('#mode-pick [data-mode="endless"]'); await p.click("#play-btn"); await p.waitForTimeout(300);
  const box = () => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  await p.click("#menu-btn"); await p.waitForTimeout(150);
  const asked = { box: await box(), state: await p.evaluate(() => GAME && GAME.state), menu: await shown(p, "menu") };
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const stay = { box: await box(), state: await p.evaluate(() => GAME && GAME.state), card: await shown(p, "pause") };
  await p.evaluate(() => document.getElementById("menu-btn").click()); await p.waitForTimeout(150); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const quit ={ menu: await shown(p, "menu"), game: await p.evaluate(() => !!GAME) };
  check("demolition-row: ☰ Menu mid-run asks \"Quit this game?\" (paused under it); Keep playing plays on, Quit goes to the menu",
    asked.box === "Quit this game?" && asked.state === "paused" && !asked.menu && !stay.box && stay.state === "playing" && !stay.card && quit.menu && !quit.game && p.leaves === 0,
    { asked, stay, quit, leaves: p.leaves });
  // once the game is over there's nothing to lose: straight to the menu
  await p.click("#play-btn"); await p.waitForTimeout(300);
  await p.evaluate(() => { GAME.end("t", "m"); document.getElementById("menu-btn").click(); }); await p.waitForTimeout(150);
  const after = { box: await box(), menu: await shown(p, "menu") };
  check("demolition-row (guard): ☰ Menu after the game ends goes straight to the menu", !after.box && after.menu, after);
  check("demolition-row: no page errors (Menu)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the menu's key legend: on a desktop; on a phone only the pad's line
  const legend = (pg) => pg.evaluate(() => {
    const k = document.querySelector("#keys-help .gs-keys");
    return { keys: k ? getComputedStyle(k).display !== "none" : null, text: document.getElementById("keys-help").innerText };
  });
  p = await open();
  const deskKeys = await legend(p);
  await p.close();
  const { devices } = require("@playwright/test");
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  p = await lib.open(phone, base, "games/demolition-row/");
  const phoneKeys = await legend(p);
  await p.close(); await phone.close();
  check("demolition-row: the key legend shows on a desktop and hides on a phone, where the on-screen pad's line stays",
    deskKeys.keys === true && /P1/.test(deskKeys.text) && phoneKeys.keys === false && !/P1|Esc/.test(phoneKeys.text) && /on-screen pad/.test(phoneKeys.text),
    { deskKeys, phoneKeys });

  // ---- a 2× screen: the board and the Next preview have twice the pixels; the pad still steers
  const retina = await lib.newContext(browser, { deviceScaleFactor: 2 });
  p = await lib.open(retina, base, "games/demolition-row/");
  await p.click('#mode-pick [data-mode="endless"]'); await p.click("#play-btn"); await p.waitForTimeout(500);
  const sizes = await p.evaluate(() => [".board", ".next"].map((s) => { const c = document.querySelector("canvas" + s), r = c.getBoundingClientRect(); return { w: c.width, css: Math.round(r.width) }; }));
  const c0 = await p.evaluate(() => GAME.players[0].board.piece.pivot.c);
  await p.click('#touchpad [data-act="right"]'); await p.waitForTimeout(100);
  const c1 = await p.evaluate(() => GAME.players[0].board.piece.pivot.c);
  const preview = await p.evaluate(() => {   // the Next piece's bottom arm, drawn in the preview's lowest third
    const c = document.querySelector("canvas.next"), d = c.getContext("2d").getImageData(0, Math.round(c.height * 0.7), c.width, Math.round(c.height * 0.3)).data;
    let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) lit++;
    return lit;
  });
  check("demolition-row, 2× screen: the board and the Next preview have twice the pixels, drawn full size; the pad's ▶ moves the piece",
    sizes[0].w === 2 * sizes[0].css && sizes[1].w === 132 && sizes[1].css === 66 && preview > 0 && c1 === c0 + 1, { sizes, c0, c1, preview });
  check("demolition-row, 2× screen: frames draw with no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await retina.close();

  // ---- 50-Stage: power-ups banked (in the queue, and showing in Next) carry over to the next stage
  p = await open();
  const help = await p.evaluate(() => document.querySelector("details.dict-wrap").textContent);
  await p.click('#mode-pick [data-mode="stage"]'); await p.click("#play-btn");
  await p.waitForFunction(() => GAME && GAME.players[0].board.piece);
  // what's banked: nothing to pull for Next, nothing special on it, no power-up in the queue
  const empty = () => p.evaluate(() => { const b = GAME.players[0].board, s = b.nextSpec;
    const special = !s || s.type === "iron" || s.mono || ["C", "U", "D", "L", "R"].some((k) => s.cells[k].aug);
    return { pq: b.pq.length, special, stage: b.stage }; });
  const start0 = await empty();
  check("demolition-row (guard): a new 50-Stage run starts with nothing banked", start0.pq === 0 && !start0.special && start0.stage === 1, start0);
  await p.evaluate(() => { const b = GAME.players[0].board; b.pq.push("iron", "crystal"); b.nextSpec = b.generateSpec(); b.cleared = true; });   // Iron in Next, Crystal banked; the stage is cleared
  await p.waitForFunction(() => GAME.players[0].board.stage === 2);
  const carried = await p.evaluate(() => { const b = GAME.players[0].board;
    return { piece: b.piece && b.piece.type, next: b.nextSpec && (b.nextSpec.mono ? "crystal" : b.nextSpec.type), pq: b.pq.length, banner: b.flash && b.flash.text + " / " + (b.flash.sub || "") }; });
  check("demolition-row: in 50-Stage, the power-up in Next and the banked one carry over to the next stage, and the stage banner says so",
    carried.piece === "iron" && carried.next === "crystal" && carried.pq === 0 && /STAGE 2/.test(carried.banner) && /kept/.test(carried.banner), carried);
  check("demolition-row: the power-ups help says banked ones carry over between stages", /carry over/.test(help), help);
  // Restart from the pause card: a fresh run, nothing banked
  await p.evaluate(() => { GAME.players[0].board.pq.push("thunder"); });
  await p.click(".gs-pause-btn, #pause-btn"); await p.click("#pause-restart");
  await p.waitForFunction(() => GAME && GAME.players[0].board.piece && GAME.state === "playing");
  const restarted = await empty();
  check("demolition-row (guard): Restart starts the 50-Stage run with nothing banked", restarted.pq === 0 && !restarted.special && restarted.stage === 1, restarted);
  check("demolition-row: no page errors (banked power-ups)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- 50-Stage: three runs of stages, 3 colors (1 to 16), then 4 (17 to
  // 33), then 5 (34 to 50), each run faster stage by stage with its goal line
  // coming down; no stage starts already clear or with a group of 4 in its
  // pile. A stage list is open up to the furthest stage reached (saved the
  // moment it is reached) and a run starts at the stage picked; a locked one
  // says why. At a laptop's size and a phone's.
  for (const [label, dev] of [["laptop", {}], ["phone", Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 664 } })]]) {
    const c = await lib.newContext(browser, dev);
    const reached = (pg, n) => pg.addInitScript((n) => { try { if (!sessionStorage.getItem("__seeded")) { sessionStorage.setItem("__seeded", "1"); localStorage.setItem("demolitionRow_stageReached", n); } } catch (e) {} }, n);
    const q = await lib.open(c, base, "games/demolition-row/", { before: (pg) => reached(pg, "18") });
    const runs = await q.evaluate(() => {
      const all = [];
      for (let n = 1; n <= 50; n++) all.push(stageSpec(n));
      const tier = (a, b) => all.slice(a - 1, b);
      const falls = (t) => t.every((s, i) => i === 0 || s.fallMs < t[i - 1].fallMs);
      const goals = (t) => t.every((s, i) => i === 0 || s.goalRows <= t[i - 1].goalRows) && t[0].goalRows > t[t.length - 1].goalRows;
      return { colors: [1, 16, 17, 33, 34, 50].map((n) => all[n - 1].colors), first: all[0],
        faster: [falls(tier(1, 16)), falls(tier(17, 33)), falls(tier(34, 50))], lower: [goals(tier(1, 16)), goals(tier(17, 33)), goals(tier(34, 50))] };
    });
    check("demolition-row " + label + ": stages 1 to 16 deal 3 colors, 17 to 33 four, 34 to 50 five; in each run the blocks fall faster stage by stage and the goal line comes down (stage 1: clear to 5 rows)",
      runs.colors.join() === "3,3,4,4,5,5" && runs.faster.every(Boolean) && runs.lower.every(Boolean) && runs.first.goalRows === 5, runs);
    // the list: 1 to 18 open, the rest locked
    const list = await q.evaluate(() => { const b = [...document.querySelectorAll("#stage-grid .st")]; return { n: b.length, open: b.filter((x) => !x.classList.contains("locked")).length, sel: (document.querySelector("#stage-grid .st.sel") || {}).textContent }; });
    await q.click('#stage-grid .st[data-stage="30"]');
    const locked = await q.evaluate(() => ({ note: document.getElementById("stage-info").textContent, sel: document.querySelector("#stage-grid .st.sel").textContent }));
    await q.click('#stage-grid .st[data-stage="17"]');
    const keys = [];
    if (label === "laptop") {   // (← → step through them; past the last open one, a locked note)
      await q.keyboard.press("ArrowRight"); keys.push(await q.evaluate(() => document.querySelector("#stage-grid .st.sel").textContent));
      await q.keyboard.press("ArrowRight"); keys.push(await q.evaluate(() => document.querySelector("#stage-grid .st.sel").textContent + " " + document.getElementById("stage-info").textContent));
      await q.keyboard.press("ArrowLeft");
    }
    check("demolition-row " + label + ": the stage list has all 50, open up to the furthest reached; a locked one, picked, says so and isn't picked" + (label === "laptop" ? "; ← → step through the open ones" : ""),
      list.n === 50 && list.open === 18 && /Stage 30 is locked/.test(locked.note) && locked.sel !== "30" &&
      (label !== "laptop" || (keys[0] === "18" && /^18 .*Stage 19 is locked/.test(keys[1]))), { list, locked, keys });
    await q.click("#play-btn");
    await q.waitForFunction(() => typeof GAME !== "undefined" && GAME && GAME.players[0] && GAME.players[0].board.piece);
    const at = await q.evaluate(() => { const b = GAME.players[0].board, used = new Set();
      b.grid.forEach((row) => row.forEach((x) => { if (x && x.t === "n") used.add(x.c); }));
      return { stage: b.stage, colors: b.colors, used: [...used].sort().join(), fallMs: b.fallMs, goalRows: CONFIG.rows - 1 - b.opts.goalRow }; });
    check("demolition-row " + label + ": Play starts the run at the stage picked (17: four colors, in its pile too)",
      at.stage === 17 && at.colors === 4 && at.used.split(",").every((x) => +x < 4) && at.fallMs === 900 && at.goalRows === 5, at);
    // every stage, a few times over: its pile is stable and not already clear
    const piles = await q.evaluate(() => {
      const b = GAME.players[0].board, bad = [];
      for (let n = 1; n <= 50; n++) for (let k = 0; k < 6; k++) {
        GAME.setupStage(b, n);
        const used = new Set(); b.grid.forEach((row) => row.forEach((x) => { if (x && x.t === "n") used.add(x.c); }));
        if (belowGoal(b.grid, b.opts.goalRow) || findGroups(b.grid, CONFIG.minGroup).length || [...used].some((x) => x >= stageSpec(n).colors)) bad.push(n);
      }
      return bad;
    });
    check("demolition-row " + label + ": no stage starts already clear, with a group of 4 in its pile, or with a color it doesn't deal (each of the 50, six times)", piles.length === 0, piles);
    await q.close();
    // reaching a stage opens it at once; the Crystal cycles only through the stage's colors
    const r = await lib.open(c, base, "games/demolition-row/");
    await r.evaluate(() => { try { localStorage.removeItem("demolitionRow_stageReached"); } catch (e) {} });
    await r.click('#mode-pick [data-mode="stage"]'); await r.click("#play-btn");
    await r.waitForFunction(() => typeof GAME !== "undefined" && GAME && GAME.players[0] && GAME.players[0].board.controllable());
    const cycle = await r.evaluate(() => { const b = GAME.players[0].board; b.piece.mono = true; b.piece.crystalColor = -1; const seen = [];
      for (let i = 0; i < 7; i++) { b.rotatePiece(1); seen.push(b.piece.crystalColor); } return seen; });
    await r.evaluate(() => { GAME.players[0].board.cleared = true; });
    const saved = await r.waitForFunction(() => localStorage.getItem("demolitionRow_stageReached") === "2", null, { timeout: 15000 }).then(() => true, () => false);
    check("demolition-row " + label + ": stage 1's Crystal cycles through its 3 colors only, and reaching stage 2 opens it in the list at once",
      cycle.every((x) => x >= 0 && x < 3) && new Set(cycle).size === 3 && saved, { cycle, saved });
    check("demolition-row " + label + " (stages): no page errors", r.errs.length === 0, r.errs);
    await r.close();
    await c.close();
  }
  const hub = require("fs").readFileSync(require("path").join(lib.ROOT, "games", "index.html"), "utf8");
  check("demolition-row: the games page's reset clears the stage list's progress too", /"demolitionRow_stageReached"/.test(hub));

  await ctx.close();
};
