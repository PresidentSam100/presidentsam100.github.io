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

  // ---- 50-Stage: 3 colors (stages 1 to 16), then 4 (17 to 33), then 5 (34
  // to 50); every stage a little harder than the one before and never easier
  // in anything (speed, stones, colors, goal, pile), the menu's line saying how
  // each differs; no stage starts already clear or with a group of 4 in its
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
      // each stage against the one before: easier in any measure, or harder in none
      const easier = [], same = [];
      for (let n = 2; n <= 50; n++) {
        const a = all[n - 2], b = all[n - 1];
        if (b.colors < a.colors || b.fallMs > a.fallMs || b.stones < a.stones || b.goalRows > a.goalRows || b.startRows < a.startRows) easier.push(n);
        else if (!(b.colors > a.colors || b.fallMs < a.fallMs || b.stones > a.stones || b.goalRows < a.goalRows || b.startRows > a.startRows)) same.push(n);
      }
      // what the menu says of each stage, picked in turn (all 50 open)
      try { localStorage.setItem("demolitionRow_stageReached", "50"); } catch (e) {}
      const info = [];
      for (let n = 1; n <= 50; n++) { pickStage(n); info.push(document.getElementById("stage-info").textContent); }
      pickStage(1); try { localStorage.setItem("demolitionRow_stageReached", "18"); } catch (e) {}
      paintStages();
      return { colors: [1, 16, 17, 33, 34, 50].map((n) => all[n - 1].colors), easier, same, alike: info.filter((t, i) => i > 0 && t === info[i - 1]).length,
        info: [info[0], info[1], info[4], info[49]], gentle: all[0].fallMs >= CONFIG.baseFallMs && all[0].stones <= 0.03 };
    });
    check("demolition-row " + label + ": stages 1 to 16 deal 3 colors, 17 to 33 four, 34 to 50 five; every stage is harder than the one before in something and easier in nothing, and the menu's line for each differs from the last (stage 1 gentle)",
      runs.colors.join() === "3,3,4,4,5,5" && runs.easier.length === 0 && runs.same.length === 0 && runs.alike === 0 && runs.gentle, runs);
    // the list: 1 to 18 open, the rest locked
    const list = await q.evaluate(() => { const b = [...document.querySelectorAll("#stage-grid .st")]; return { n: b.length, open: b.filter((x) => !x.classList.contains("locked")).length, sel: (document.querySelector("#stage-grid .st.sel") || {}).textContent }; });
    await q.click('#stage-grid .st[data-stage="30"]');
    const locked = await q.evaluate(() => ({ note: document.getElementById("stage-info").textContent, sel: document.querySelector("#stage-grid .st.sel").textContent }));
    await q.click('#stage-grid .st[data-stage="17"]');
    const keys = [];
    if (label === "laptop") {   // (← → step through them, the first ringing the one picked; past the last open one, a locked note)
      await q.keyboard.press("ArrowRight");
      await q.keyboard.press("ArrowRight"); keys.push(await q.evaluate(() => document.querySelector("#stage-grid .st.sel").textContent));
      await q.keyboard.press("ArrowRight"); keys.push(await q.evaluate(() => document.querySelector("#stage-grid .st.sel").textContent + " " + document.getElementById("stage-info").textContent));
      await q.keyboard.press("ArrowLeft"); await q.keyboard.press("ArrowLeft");
    }
    check("demolition-row " + label + ": the stage list has all 50, open up to the furthest reached; a locked one, picked, says so and isn't picked" + (label === "laptop" ? "; ← → step through the open ones" : ""),
      list.n === 50 && list.open === 18 && /Stage 30 is locked/.test(locked.note) && locked.sel !== "30" &&
      (label !== "laptop" || (keys[0] === "18" && /^18 .*Stage 19 is locked/.test(keys[1]))), { list, locked, keys });
    await q.click("#play-btn");
    await q.waitForFunction(() => typeof GAME !== "undefined" && GAME && GAME.players[0] && GAME.players[0].board.piece);
    const at = await q.evaluate(() => { const b = GAME.players[0].board, used = new Set(), sp = stageSpec(17);
      b.grid.forEach((row) => row.forEach((x) => { if (x && x.t === "n") used.add(x.c); }));
      return { stage: b.stage, colors: b.colors, used: [...used].sort().join(), fallMs: b.fallMs, goalRows: CONFIG.rows - 1 - b.opts.goalRow, want: [sp.fallMs, sp.goalRows] }; });
    check("demolition-row " + label + ": Play starts the run at the stage picked (17: four colors, in its pile too, at its speed and goal)",
      at.stage === 17 && at.colors === 4 && at.used.split(",").every((x) => +x < 4) && at.fallMs === at.want[0] && at.goalRows === at.want[1], at);
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

  // ---- the stage list is a grid of all 50: on a laptop ten to a row, all in
  // sight, nothing scrolling; on a phone as many to a row as fit at a size to
  // tap, in a box that scrolls with the picked one in view, Play still on the
  // first screen. The arrows walk it by rows and columns, the pick going with
  // the ring (a locked one says why and isn't picked), and Enter plays from
  // the stage picked; the keys beside its heading (stages 1 to 18 open, 17 picked)
  {
    const seed = (pg) => pg.addInitScript(() => { try { if (!sessionStorage.getItem("__seeded")) { sessionStorage.setItem("__seeded", "1"); localStorage.setItem("demolitionRow_stageReached", "18"); localStorage.setItem("demolitionRow_stagePick", "17"); } } catch (e) {} });
    const lay = (pg) => pg.evaluate(() => {
      const g = document.getElementById("stage-grid"), gr = g.getBoundingClientRect(), rs = [...g.querySelectorAll(".st")].map((b) => b.getBoundingClientRect());
      const inBox = (r) => r.left >= gr.left - 0.5 && r.right <= gr.right + 0.5 && r.top >= gr.top - 0.5 && r.bottom <= gr.bottom + 0.5;
      const onScreen = (r) => r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      const play = document.getElementById("play-btn").getBoundingClientRect(), picked = g.querySelector(".st.sel").getBoundingClientRect();
      return { n: rs.length, seen: rs.filter((r) => inBox(r) && onScreen(r)).length, perRow: rs.filter((r) => Math.abs(r.top - rs[0].top) < 1).length,
        w: Math.round(Math.min(...rs.map((r) => r.width))), h: Math.round(Math.min(...rs.map((r) => r.height))),
        sideways: document.documentElement.scrollWidth > innerWidth || g.scrollWidth > g.clientWidth + 1, boxScrolls: g.scrollHeight > g.clientHeight + 1,
        page: document.getElementById("menu").scrollHeight - document.getElementById("menu").clientHeight,
        play: Math.round(play.bottom) <= innerHeight, picked: inBox(picked) && onScreen(picked),
        hint: ((document.querySelector("#stage-opts .gs-grid-keys") || {}).textContent || "").replace(/\s+/g, "") };
    });
    const sizes = {};
    for (const [w, h] of [[1366, 657], [1280, 600]]) {
      const c = await lib.newContext(browser, { viewport: { width: w, height: h } });
      const q = await lib.open(c, base, "games/demolition-row/", { before: seed });
      sizes[w + "x" + h] = await lay(q);
      if (w === 1366) {   // the arrows, from the ring on 17
        const KEY = async (k) => { await q.keyboard.press(k); await q.waitForTimeout(60); };
        const now = () => q.evaluate(() => ({ sel: document.querySelector("#stage-grid .st.sel").textContent,
          ring: (document.querySelector("#stage-grid .st[data-gs-pick]") || {}).textContent || "", info: document.getElementById("stage-info").textContent }));
        const walk = [];
        await KEY("ArrowUp"); walk.push(await now());                         // the ring on the one picked: 17
        await KEY("ArrowUp"); walk.push(await now());                         // a row up: 7, picked
        await KEY("ArrowLeft"); walk.push(await now());                       // 6
        await KEY("ArrowDown"); await KEY("ArrowDown"); walk.push(await now()); // two rows down: 26, locked (16 stays picked)
        await KEY("ArrowUp"); walk.push(await now());                         // back to 16
        await KEY("Enter");
        const stage = await q.waitForFunction(() => typeof GAME !== "undefined" && GAME && GAME.players[0] && GAME.players[0].board.piece && GAME.players[0].board.stage, null, { timeout: 20000 })
          .then((h) => h.jsonValue(), () => null);
        check("demolition-row: the arrows walk the stage grid by rows and columns, the pick going with the ring; a locked one says why and isn't picked; Enter plays from the stage picked",
          walk[0].ring === "17" && walk[0].sel === "17" && walk[1].ring === "7" && walk[1].sel === "7" && walk[2].sel === "6" &&
          walk[3].ring === "26" && walk[3].sel === "16" && /Stage 26 is locked/.test(walk[3].info) && walk[4].ring === "16" && walk[4].sel === "16" && stage === 16, { walk, stage });
      }
      check("demolition-row " + w + "x" + h + " (stage grid): no page errors", q.errs.length === 0, q.errs);
      await q.close(); await c.close();
    }
    check("demolition-row: on a laptop the stage list shows all 50 at once, ten to a row, nothing scrolling (the list or the menu), Play on the screen; the keys beside its heading",
      Object.values(sizes).every((s) => s.n === 50 && s.seen === 50 && s.perRow === 10 && !s.sideways && !s.boxScrolls && s.page <= 0 && s.play && s.hint === "←↑↓→Enter"), sizes);
    const phones = {};
    for (const [w, h] of [[390, 664], [360, 640], [320, 568], [375, 553], [360, 560]]) {
      const c = await lib.newContext(browser, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const q = await lib.open(c, base, "games/demolition-row/", { before: seed });
      phones[w + "x" + h] = await lay(q);
      await q.close(); await c.close();
    }
    check("demolition-row: on a phone the stage list's tiles are big enough to tap (40 by 36 at least), in a box that scrolls with the picked one in view, nothing sideways, Play on the first screen",
      Object.values(phones).every((s) => s.n === 50 && s.w >= 40 && s.h >= 36 && s.boxScrolls && s.picked && !s.sideways && s.play), phones);
  }

  // ---- a Crystal turning to its next color: with Visual FX on it turns over
  // about the up-down axis (squeezed across to edge-on with its old face, then
  // opened out with the new one); a second turn from a half-open face starts
  // from that width; with FX off it doesn't turn. Either way the color counts
  // at once. Drawn on the board's own clock, set by the test, frame by frame.
  for (const off of [false, true]) {
    const q = await lib.open(ctx, base, "games/demolition-row/", { before: (pg) => pg.addInitScript((v) => { try { localStorage.setItem("reduceMotion:demolition-row", v); } catch (e) {} }, off ? "1" : "0") });
    await q.click('#mode-pick [data-mode="endless"]'); await q.click("#play-btn");
    await q.waitForFunction(() => GAME && GAME.players[0].board.controllable());
    const turn = await q.evaluate(() => {
      const pl = GAME.players[0], b = pl.board;
      GAME.pause();
      b.piece.mono = true; b.piece.crystalColor = 0; for (const k of ["C", "U", "D", "L", "R"]) b.piece.cells[k] = { t: "n", c: 0, aug: null };
      let T = performance.now(), rec = null;
      b.now = () => T;
      const P = CanvasRenderingContext2D.prototype, real = { scale: P.scale, fill: P.fill };
      P.scale = function (sx, sy) { if (rec && this.canvas === pl.canvas && sy === 1 && sx < 0.999) rec.across = Math.round(sx * 100) / 100; return real.scale.apply(this, arguments); };
      P.fill = function () { if (rec && rec.across != null && rec.face == null) rec.face = COLOR_HEX.indexOf(this.fillStyle); return real.fill.apply(this, arguments); };
      // one frame drawn at `ms` after the press: how far across, and which color's face
      const at = (ms) => { T = t0 + ms; rec = {}; pl.renderer.draw(); const r = rec; rec = null; return (r.across == null ? "full" : r.across) + (r.face != null && r.face >= 0 ? " c" + r.face : ""); };
      const phase = b.phase, t0 = T;
      b.rotatePiece(1);
      const counted = b.piece.crystalColor;
      const first = [60, 120, 180, 300].map(at);
      // a second press while the new face (1) opens out, at 180 ms: it turns away again from that width
      T = t0 + 180; b.rotatePiece(1);
      const t1 = T, again = [0, 60, 120, 240].map((ms) => at(180 + ms));
      P.scale = real.scale; P.fill = real.fill; delete b.now;
      return { counted, then: b.piece.crystalColor, phase: phase === b.phase, first, again, t1: Math.round(t1 - t0) };
    });
    if (!off) check("demolition-row, FX on: a Crystal turns over to its next color about the up-down axis, squeezed to edge-on with its old face, then opening out with the new one; a press mid-turn turns on from the same width; the color counts at once",
      turn.counted === 1 && turn.then === 2 && turn.phase && turn.first.join() === "0.71 c0,0.04 c1,0.71 c1,full" && turn.again.join() === "0.71 c1,0.04 c2,0.71 c2,full", turn);
    else check("demolition-row, FX off: a Crystal changes color without turning, the color counting at once",
      turn.counted === 1 && turn.then === 2 && turn.phase && turn.first.every((s) => s === "full") && turn.again.every((s) => s === "full"), turn);
    check("demolition-row (Crystal turn, FX " + (off ? "off" : "on") + "): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- in play the whole screen fits the window, nothing to scroll: the
  // pad's buttons, the panels, the title and the byline all inside it, the
  // page no taller or wider than it, the boards on one row and none shrunk to
  // a sliver. A lone board's panel stands beside it; a VS board's Next piece
  // sits beside its panel's rows (under them only on the narrowest). Every
  // mode, on phones and on laptops.
  {
    const SIZES = [["phone", 320, 568], ["phone", 375, 553], ["phone", 390, 664], ["phone", 664, 390], ["laptop", 1366, 657], ["laptop", 1280, 600], ["laptop", 1280, 900]];
    const bad = {}, errs = [];
    for (const [kind, w, h] of SIZES) {
      const c = await lib.newContext(browser, kind === "phone" ? Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
      const q = await lib.open(c, base, "games/demolition-row/");
      for (const mode of ["stage", "endless", "vs2", "vs4"]) {
        await q.evaluate((mode) => {
          if (GAME) toMenu();
          document.querySelector('#mode-pick [data-mode="' + (mode.startsWith("vs") ? "vs" : mode) + '"]').click();
          if (mode.startsWith("vs")) document.querySelector('#count-pick [data-count="' + mode.slice(2) + '"]').click();
          document.getElementById("play-btn").click();
        }, mode);
        await q.waitForFunction(() => GAME && GAME.players.every((p) => p.board.piece));
        const m = await q.evaluate(() => {
          const R = (e) => e.getBoundingClientRect(), W = innerWidth, H = innerHeight;
          const cut = [...document.querySelectorAll("#touchpad .tbtn, .hud .name, .hud .stat, .hud .special, .hud .pmute, canvas.next, #menu-btn, #mode-label, .head .title, .head .subtitle, #byline")]
            .filter((e) => e.tagName !== "SPAN" || e.textContent.trim())   // (a VS panel's extra stat is empty until a bonus)
            .filter((e) => { const r = R(e); return !r.width || r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1; }).map((e) => e.className || e.id || e.tagName);
          const cols = [...document.querySelectorAll(".board-col")].map((col) => {
            const b = R(col.querySelector("canvas.board")), hud = R(col.querySelector(".hud")), nx = R(col.querySelector("canvas.next")), sc = R(col.querySelector("[data-score]"));
            return { w: Math.round(b.width), top: Math.round(b.top), panelBeside: hud.right <= b.left + 1 || hud.left >= b.right - 1, nextBeside: nx.top < sc.bottom, tighter: col.classList.contains("tighter") };
          });
          return { cut, sh: document.documentElement.scrollHeight, H, wide: Math.max(0, document.documentElement.scrollWidth - W), rows: new Set(cols.map((x) => x.top)).size, cols };   // (boards on one line: one top)
        });
        const solo = !mode.startsWith("vs"), least = mode === "vs4" ? 45 : mode === "vs2" ? 60 : 100;
        const ok = !m.cut.length && m.sh <= m.H && !m.wide && m.rows === 1 && m.cols.every((x) => x.w >= least && (solo ? x.panelBeside : x.tighter || x.nextBeside));
        if (!ok) bad[w + "x" + h + " " + mode] = { cut: m.cut, sh: m.sh, H: m.H, wide: m.wide, rows: m.rows, cols: m.cols.map((x) => x.w + (solo ? (x.panelBeside ? " beside" : " above") : x.nextBeside ? " next beside" : x.tighter ? " tighter" : " next under")).join() };
      }
      errs.push(...q.errs);
      await q.close(); await c.close();
    }
    check("demolition-row: in play the whole screen fits the window with nothing to scroll (pad, panels, title, byline), boards on one row and none a sliver, the Next piece beside the panel's rows (50-Stage, Endless, VS 2 and 4; phones 320x568, 375x553, 390x664 and one on its side, 664x390; laptops 1366x657, 1280x600, 1280x900)",
      Object.keys(bad).length === 0, bad);
    check("demolition-row (play screen fit): no page errors", errs.length === 0, errs);
  }

  await ctx.close();
};
