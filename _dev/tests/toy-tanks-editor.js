// Toy Tanks' mission editor (editor.html): the palette paints the arena by
// mouse drag (a right-click clears) and by touch; there is one of your tank;
// Check finds a mission with no tank of yours, no enemy, or a tank walled in
// by blocks (cork and holes don't wall one in), and Test, Save and the links
// wait until it's fixed; Save, Save as new, Edit and Delete keep "my
// missions"; Export's text, a share link and a bare map all import back;
// Test plays the mission as drawn on the real engine and clearing it ends
// the test; Esc never leaves the editor (it stops a test), and leaving with
// unsaved work asks. In the game a mission of your own ("#play=") is played
// as drawn, in place of the campaign, and sets no records; L on the menu
// opens the editor. Also on a phone: touch paints, and a test has the sticks.
const http = require("http");

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const status = (url) => new Promise((res) => http.get(url, (r) => { r.resume(); res(r.statusCode); }).on("error", () => res(0)));
  const page = await status(base + "games/toy-tanks/editor.html");
  check("toy-tanks editor: the page is there (editor.html)", page === 200, page);
  if (page !== 200) return;

  const ctx = await lib.newContext(browser, { viewport: { width: 1366, height: 657 } });
  let p = await lib.open(ctx, base, "games/toy-tanks/editor.html");
  const ed = (fn, arg) => p.evaluate(fn, arg);
  const map = () => ed(() => ToyTanksEditor.map());
  // the middle of a square of the arena, on the page
  const at = (x, y) => ed(([x, y]) => { const r = document.getElementById("ed-board").getBoundingClientRect(), c = ToyTanksEditor.cell(); return { x: r.left + c.fr + (x + 0.5) * c.s, y: r.top + c.fr + (y + 0.5) * c.s }; }, [x, y]);
  const pick = (label) => p.click("#ed-palette button:has-text('" + label + "')");
  const say = () => ed(() => document.getElementById("ed-status").textContent);
  const off = (id) => ed((id) => document.getElementById(id).disabled, id);

  // ---- the palette, and painting with the mouse ---------------------------------------------
  {
    const tools = await ed(() => Array.from(document.querySelectorAll("#ed-palette button")).map((b) => b.textContent.trim()));
    const fresh = await map();
    await pick("Block");
    let a = await at(4, 3), b = await at(8, 3);
    await p.mouse.move(a.x, a.y); await p.mouse.down();
    for (let x = 4; x <= 8; x++) { const c = await at(x, 3); await p.mouse.move(c.x, c.y, { steps: 2 }); }
    await p.mouse.up();
    const row = (await map())[3];
    // (a right-click clears a square to floor)
    a = await at(6, 3);
    await p.mouse.click(a.x, a.y, { button: "right" });
    const row2 = (await map())[3];
    check("toy-tanks editor: the palette has floor, block, cork, hole, your tank and the nine enemies; a drag paints a line of blocks, a right-click clears one",
      tools.length === 14 && tools.join() === "Floor,Block,Cork,Hole,You,Brown,Ash,Marine,Yellow,Pink,Green,Violet,White,Black" &&
      fresh[8].charAt(2) === "P" && fresh[8].charAt(19) === "b" && row.slice(4, 9) === "#####" && row2.slice(4, 9) === "##.##" && b,
      { tools, row, row2 });

    // one tank of yours: painting it again moves it
    await pick("You");
    a = await at(5, 12); await p.mouse.click(a.x, a.y);
    const m = await map(), mine = m.join("").split("P").length - 1;
    check("toy-tanks editor: there is one of your tank (painting it again moves it)", mine === 1 && m[12].charAt(5) === "P" && m[8].charAt(2) === ".", { mine, row12: m[12], row8: m[8] });
  }

  // ---- Check: no tank of yours, no enemy, a tank walled in ---------------------------------------------
  {
    await ed(() => ToyTanksEditor.open({ name: "", map: Array.from({ length: 17 }, (_, y) => y === 8 ? "..P................b.." : ".".repeat(22)) }));
    await ed(() => ToyTanksEditor.paint(2, 8, "."));
    const noYou = { say: await say(), test: await off("ed-test"), save: await off("ed-save"), play: await off("ed-play") };
    await ed(() => { ToyTanksEditor.paint(2, 8, "P"); ToyTanksEditor.paint(19, 8, "."); });
    const noFoe = { say: await say(), test: await off("ed-test") };
    // a violet tank boxed in by blocks (and its brown neighbour in a ring of cork and holes, which is fine)
    await ed(() => {
      ToyTanksEditor.paint(15, 3, "v");
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) ToyTanksEditor.paint(15 + dx, 3 + dy, "#");
      ToyTanksEditor.paint(15, 12, "b");
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) ToyTanksEditor.paint(15 + dx, 12 + dy, (dx + dy) % 2 ? "o" : "c");
    });
    await p.click("#ed-check");
    const shut = { say: await say(), test: await off("ed-test"), save: await off("ed-save") };
    await ed(() => ToyTanksEditor.paint(15, 2, "c"));
    await p.click("#ed-check");
    const opened = { say: await say(), test: await off("ed-test") };
    check("toy-tanks editor: Check finds a mission with no tank of yours, with no enemy, or with a tank walled in by blocks (Test, Save and Play wait till it's fixed); cork and holes don't wall a tank in",
      /put your tank in the arena/i.test(noYou.say) && noYou.test && noYou.save && noYou.play &&
      /at least one enemy/i.test(noFoe.say) && noFoe.test &&
      /violet tank in row 4, column 16 is walled in/i.test(shut.say) && !/brown/i.test(shut.say) && shut.test && shut.save &&
      /can be played/i.test(opened.say) && !opened.test, { noYou, noFoe, shut, opened });
  }

  // ---- Save, Save as new, the list, Edit, Delete -------------------------------------------------------------
  const drawn = await map();
  {
    await p.fill("#ed-name", "Cork fort");
    await p.click("#ed-save");
    const one = await ed(() => ({ list: JSON.parse(localStorage.getItem("toytanks_missions") || "[]"), rows: Array.from(document.querySelectorAll("#ed-saved .saved-item .nm")).map((e) => e.textContent), dirty: ToyTanksEditor.dirty(), asNew: !document.getElementById("ed-savenew").hidden }));
    await ed(() => ToyTanksEditor.paint(1, 1, "k"));
    await p.fill("#ed-name", "Cork fort, black");
    await p.click("#ed-savenew");
    const two = await ed(() => JSON.parse(localStorage.getItem("toytanks_missions") || "[]").map((m) => m.name));
    await p.click("#ed-new");
    const blank = await map();
    await p.click("#ed-saved .saved-item:nth-child(1) button:has-text('Edit')");
    const back = { map: await map(), name: await p.inputValue("#ed-name") };
    await p.click("#ed-saved .saved-item:nth-child(2) button:has-text('Delete')");
    await p.waitForSelector(".gs-dialog");
    await p.click(".gs-dialog button:has-text('Delete')");
    await p.waitForFunction(() => !document.querySelector(".gs-dialog"));
    const after = await ed(() => JSON.parse(localStorage.getItem("toytanks_missions") || "[]").map((m) => m.name));
    check("toy-tanks editor: Save keeps the mission in My missions (listed, nothing left unsaved); Save as new adds another; New clears the arena; Edit opens one as saved; Delete asks, then takes it off the list",
      one.list.length === 1 && one.list[0].name === "Cork fort" && one.list[0].map.join() === drawn.join() && one.rows.join() === "Cork fort" && !one.dirty && one.asNew &&
      two.join() === "Cork fort,Cork fort, black" && blank[8] === "..P................b.." && back.map.join() === drawn.join() && back.name === "Cork fort" && after.join() === "Cork fort",
      { one: { n: one.list.length, rows: one.rows, dirty: one.dirty }, two, after });
  }

  // ---- Export, then Import; a share link and a bare map import too -----------------------------------------
  {
    await p.click("#ed-export");
    const text = await p.inputValue("#ed-io-text");
    await p.click("#ed-io-close");
    await ed(() => ToyTanksEditor.open({ name: "", map: Array.from({ length: 17 }, (_, y) => y === 8 ? "..P................b.." : ".".repeat(22)) }));
    const load = async (t) => {
      await p.click("#ed-import"); await p.fill("#ed-io-text", t); await p.click("#ed-io-load");
      if (await ed(() => !!document.querySelector(".gs-dialog"))) await p.click(".gs-dialog button:has-text('Open it')");
      await p.waitForTimeout(100);
      const r = { map: await map(), name: await p.inputValue("#ed-name"), open: await ed(() => !document.getElementById("ed-io").hidden), note: await ed(() => document.getElementById("ed-io-note").textContent) };
      if (r.open) await p.click("#ed-io-close");
      return r;
    };
    const fromExport = await load(text);
    const link = await ed(() => ToyTanksEditor.playUrl());
    await ed(() => ToyTanksEditor.paint(0, 0, "#"));
    const fromLink = await load(link);
    const bare = drawn.map((r) => '"' + r + '",').join("\n");
    const fromRows = await load(bare);
    const junk = await load("this is no mission");
    check("toy-tanks editor: Export's text imports back as it was (map and name); so do a share link and the map's rows alone; junk says why and loads nothing",
      /"map"/.test(text) && fromExport.map.join() === drawn.join() && fromExport.name === "Cork fort" && !fromExport.open &&
      /#play=t1\./.test(link) && fromLink.map.join() === drawn.join() && fromRows.map.join() === drawn.join() &&
      junk.open && /isn't a mission/i.test(junk.note) && junk.map.join() === drawn.join(), { text: text.slice(0, 60), link: link.slice(-30), junk: junk.note });
  }

  // ---- Test: the mission as drawn, on the real engine; clearing it ends the test; Esc stops one -------------------
  {
    await p.click("#ed-test");
    const t = await ed(() => {
      const T = ToyTanksEditor.test(), E = ToyTanksEngine, lv = E.parse({ map: ToyTanksEditor.map() });
      return { on: !!T, grid: T && T.st.grid.join("") === lv.grid.join(""), foes: T && T.st.enemies.map((e) => e.kind + e.x + "," + e.y).join() === lv.enemies.map((e) => e.kind + e.x + "," + e.y).join(),
        you: T && T.st.player.x === lv.player.x && T.st.player.y === lv.player.y, testing: document.body.classList.contains("testing") };
    });
    // (the mission card, then every enemy gone: cleared)
    await p.waitForFunction(() => ToyTanksEditor.test() && ToyTanksEditor.test().st.status === "play", null, { timeout: 15000 });
    await ed(() => ToyTanksEditor.test().st.enemies.forEach((e) => { e.alive = false; }));
    await p.waitForFunction(() => !document.getElementById("ed-over").hidden, null, { timeout: 15000 });
    const card = await ed(() => document.getElementById("ed-over-title").textContent);
    await p.keyboard.press("Enter");
    const done = await ed(() => ({ test: !!ToyTanksEditor.test(), card: !document.getElementById("ed-over").hidden, map: ToyTanksEditor.map().join() }));
    // Esc in a test stops it, and never leaves the editor
    await p.click("#ed-test"); await p.waitForTimeout(200);
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    const esc = { test: await ed(() => !!ToyTanksEditor.test()), leaves: p.leaves };
    check("toy-tanks editor: Test plays the mission as drawn on the game's engine; clearing it ends the test (Mission cleared!), and Enter goes back to editing with the arena as it was",
      t.on && t.grid && t.foes && t.you && t.testing && card === "Mission cleared!" && !done.test && !done.card && done.map === drawn.join(), { t, card, done });
    check("toy-tanks editor: Esc stops a test and doesn't leave the editor", !esc.test && esc.leaves === 0, esc);
  }

  // ---- leaving: Esc never leaves; with unsaved work Back to the game asks ---------------------------------------
  {
    await ed(() => ToyTanksEditor.paint(3, 3, "c"));
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    const esc = { leaves: p.leaves, box: await ed(() => !!document.querySelector(".gs-dialog")) };
    await p.click("#ed-back"); await p.waitForTimeout(200);
    const ask = await ed(() => (document.querySelector(".gs-dialog p") || {}).textContent || "");
    check("toy-tanks editor: Esc doesn't leave the editor (unsaved work or not); Back to the game asks while the mission isn't saved",
      esc.leaves === 0 && !esc.box && /isn't saved/.test(ask) && p.leaves === 0, { esc, ask });
    check("toy-tanks editor: no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- in the game: a mission of your own, played as drawn, and no records ---------------------------------------
  {
    const q = await lib.open(ctx, base, "games/toy-tanks/editor.html");
    await q.evaluate((m) => { ToyTanksEditor.open({ name: "Long corridor", map: m }); }, drawn);
    await q.fill("#ed-name", "Long corridor");
    await q.click("#ed-save");
    await Promise.all([q.waitForURL(/toy-tanks\/#play=t1\./, { timeout: 30000 }), q.click("#ed-saved .saved-item:nth-child(1) button:has-text('Play')")]);
    await q.waitForFunction(() => window.ToyTanks && ToyTanks.ui() === "menu", null, { timeout: 30000 });
    await q.waitForTimeout(300);
    const menu = await q.evaluate(() => ({ shared: ToyTanks.shared() && ToyTanks.shared().name, box: !document.getElementById("shared").hidden && document.getElementById("shared-name").textContent,
      pick: document.getElementById("start-pick").hidden, back: !document.getElementById("to-campaign").hidden && document.getElementById("to-campaign").getAttribute("data-gs-key") }));
    await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const run = await q.evaluate((m) => {
      const st = ToyTanks.st(), lv = ToyTanksEngine.parse({ map: m });
      return { ui: ToyTanks.ui(), grid: st.grid.join("") === lv.grid.join(""), foes: st.enemies.map((e) => e.kind).sort().join(), want: lv.enemies.map((e) => e.kind).sort().join(), banner: document.getElementById("banner").textContent };
    }, drawn);
    await q.evaluate(() => { ToyTanks.advance(1700, {}); const st = ToyTanks.st(); st.enemies.forEach((e) => { e.alive = false; }); ToyTanks.advance(2000, {}); });
    const end = await q.evaluate(() => ({ ui: ToyTanks.ui(), title: document.getElementById("over-title").textContent, msg: document.getElementById("over-msg").textContent, stats: document.getElementById("over-stats").textContent,
      cleared: localStorage.getItem("toytanks_best_cleared"), kills: localStorage.getItem("toytanks_best_kills") }));
    // (a tank destroyed in it is no record either)
    await q.evaluate(() => {
      ToyTanks.start(); ToyTanks.advance(1700, {});
      // (the brown tank: across a hole from open floor, so a shell from the left reaches it)
      const st = ToyTanks.st(), e = st.enemies.find((t) => t.alive && t.kind === "brown"), pl = st.player;
      st.enemies.forEach((t) => { t.cool = 1e9; t.spec = Object.assign({}, t.spec, { fire: 1e9, mines: 0, move: "none" }); });
      pl.x = e.x - 1.6; pl.y = e.y; st.shells = []; st.mines = [];
      ToyTanks.advance(16, { aim: 0, fire: true }); ToyTanks.advance(800, {});
    });
    const kill = await q.evaluate(() => ({ kills: ToyTanks.st().kills, saved: localStorage.getItem("toytanks_best_kills"), cleared: localStorage.getItem("toytanks_best_cleared") }));
    await q.evaluate(() => ToyTanks.end());
    await q.click("#to-menu"); await q.waitForTimeout(150);
    await q.keyboard.press("Backspace"); await q.waitForTimeout(150);
    const camp = await q.evaluate(() => ({ shared: ToyTanks.shared(), hash: location.hash, pick: document.getElementById("start-pick").hidden, box: document.getElementById("shared").hidden }));
    check("toy-tanks: a mission of your own (\"#play=\" from the editor) is on the menu in place of the campaign, and Roll out plays it as drawn, its name on the card",
      menu.shared === "Long corridor" && menu.box === "Long corridor" && menu.pick && menu.back === "⌫" &&
      run.ui === "run" && run.grid && run.foes === run.want && /Long corridor/.test(run.banner), { menu, run });
    check("toy-tanks: clearing a mission of your own ends it (Mission cleared!) and sets no records, missions cleared or a tank destroyed",
      end.ui === "over" && end.title === "Mission cleared!" && end.msg === "Long corridor" && /no records/.test(end.stats) && end.cleared === null && end.kills === null &&
      kill.kills === 1 && kill.saved === null && kill.cleared === null, { end, kill });
    check("toy-tanks: Back to the campaign (Backspace) puts your mission away: the link's gone and the mission picker is back", camp.shared === null && camp.hash === "" && !camp.pick && camp.box, camp);
    // L on the menu opens the editor
    const cap = await q.evaluate(() => document.getElementById("to-editor").getAttribute("data-gs-key"));
    await Promise.all([q.waitForURL(/editor\.html/, { timeout: 30000 }), q.keyboard.press("l")]);
    check("toy-tanks: Build a mission on the menu wears L, and L opens the editor", cap === "L" && /editor\.html/.test(q.url()), { cap, url: q.url() });
    check("toy-tanks (a mission of your own): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }
  await ctx.close();

  // ---- a phone: nothing off the side, touch paints, a test has the sticks and a tap fires ------------------------------
  for (const [w, h] of [[320, 568], [390, 664]]) {
    const c = await lib.newContext(browser, Object.assign({}, devices["iPhone 13"], { viewport: { width: w, height: h } }));
    const q = await lib.open(c, base, "games/toy-tanks/editor.html");
    const fit = await q.evaluate((w) => ({ wider: Math.max(document.documentElement.scrollWidth, innerWidth) - w,
      off: Array.from(document.querySelectorAll(".nav-back-games, .gs-corner > *")).filter((e) => e.getClientRects().length).filter((e) => { const r = e.getBoundingClientRect(); return r.right > w + 1 || r.left < -1; }).length,
      board: Math.round(document.getElementById("ed-board").getBoundingClientRect().width) }), w);
    await q.tap("#ed-palette button:has-text('Hole')");
    const pt = await q.evaluate(() => { const r = document.getElementById("ed-board").getBoundingClientRect(), k = ToyTanksEditor.cell(); return { x: r.left + k.fr + 10.5 * k.s, y: r.top + k.fr + 4.5 * k.s }; });
    await q.touchscreen.tap(pt.x, pt.y);
    const painted = (await q.evaluate(() => ToyTanksEditor.map()))[4].charAt(10);
    await q.tap("#ed-test");
    await q.waitForFunction(() => ToyTanksEditor.test() && ToyTanksEditor.test().st.status === "play", null, { timeout: 15000 });
    const pad = await q.evaluate(() => { const r = document.getElementById("move-stick").getBoundingClientRect(); return r.width > 0 && getComputedStyle(document.getElementById("pad")).display !== "none"; });
    // (the arena back in view: the Test button is under it on a phone)
    const tap = await q.evaluate(() => {
      document.getElementById("ed-board").scrollIntoView({ block: "start" });
      const r = document.getElementById("ed-board").getBoundingClientRect(), k = ToyTanksEditor.cell(), p = ToyTanksEditor.test().st.player;
      return { x: r.left + k.fr + (p.x + 3) * k.s, y: r.top + k.fr + p.y * k.s };
    });
    await q.touchscreen.tap(tap.x, tap.y);
    // (the shell goes out on the next frame, however long a busy browser takes to draw one)
    const shot = await q.waitForFunction(() => ToyTanksEditor.test().st.shells.some((s) => !s.enemy), null, { timeout: 10000 }).then(() => 1, () => 0);
    await q.tap("#ed-stop");
    const stopped = await q.evaluate(() => !ToyTanksEditor.test() && getComputedStyle(document.getElementById("pad")).display === "none");
    check("toy-tanks editor " + w + " x " + h + ": nothing off the side, the arena across the screen; a tap paints; a test shows the sticks, a tap on the arena fires, Stop ends it",
      fit.wider <= 0 && fit.off === 0 && fit.board >= w - 24 && painted === "o" && pad && shot >= 1 && stopped, { fit, painted, pad, shot, stopped });
    check("toy-tanks editor " + w + " x " + h + ": no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c.close();
  }
};
