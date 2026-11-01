// Potting Shed's shed editor (editor.html): the palette paints the shed by
// mouse drag (a right-click paints floor) and by touch; there is one
// gardener, and a pot painted on a patch of sun is a pot in the sun; a shed
// with no gardener, pots and patches that don't match, an open side or a pot
// shut away says why, and Test, Check, Save and the links wait until it's
// fixed; Check finds the fewest pushes (a known shed's count) and says when
// there's no way; Test plays the shed on the game's rules, one step a key
// press (U back, R over), and potting it brings up the card (Enter back to
// editing, R again); Esc in a test stops it, otherwise Esc leaves, asking
// first while the shed isn't saved; Save, Save as new, Edit and Delete
// (asking first) keep "my sheds", and Export's text, a share link and a bare
// map import back. In the game, L on the menu opens the editor, a saved shed
// is under My sheds and plays, keeping no records, and a "#play=" link is the
// chosen shed. Also on a phone: touch paints, and nothing runs off the side.
// Every tool wears its key and the key presses it, and the actions sit in two
// even columns, every button the same size.
const http = require("http");

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const status = (url) => new Promise((res) => http.get(url, (r) => { r.resume(); res(r.statusCode); }).on("error", () => res(0)));
  const page = await status(base + "games/potting-shed/editor.html");
  check("potting-shed editor: the page is there (editor.html)", page === 200, page);
  if (page !== 200) return;

  const ctx = await lib.newContext(browser, { viewport: { width: 1366, height: 657 } });
  let p = await lib.open(ctx, base, "games/potting-shed/editor.html");
  const ed = (fn, arg) => p.evaluate(fn, arg);
  const map = () => ed(() => PottingShedEditor.map());
  const at = (x, y) => ed(([x, y]) => { const r = document.getElementById("ed-board").getBoundingClientRect(), s = PottingShedEditor.cell(); return { x: r.left + (x + 0.5) * s, y: r.top + (y + 0.5) * s }; }, [x, y]);
  const pick = (label) => p.click("#ed-palette button:has-text('" + label + "')");
  const say = () => ed(() => document.getElementById("ed-status").textContent);
  const off = (id) => ed((id) => document.getElementById(id).disabled, id);
  const settle = (ms) => ed((ms) => new Promise((r) => setTimeout(r, ms)), ms || 120);
  // Cold Frame, the game's second shed: four pushes at fewest (30 moves)
  const COLD = ["########", "#  .   #", "# $##$ #", "#  .*. #", "#  $   #", "#   @  #", "########"];

  // ---- the palette, and painting with the mouse ----------------------------------------------
  {
    const tools = await ed(() => Array.from(document.querySelectorAll("#ed-palette button")).map((b) => b.textContent.trim()));
    const fresh = await map();
    await pick("Bench");
    const a = await at(2, 1);
    await p.mouse.move(a.x, a.y); await p.mouse.down();
    for (let x = 2; x <= 5; x++) { const c = await at(x, 1); await p.mouse.move(c.x, c.y, { steps: 2 }); }
    await p.mouse.up();
    const row = (await map())[1];
    // a right-click paints floor
    const r = await at(3, 1);
    await p.mouse.click(r.x, r.y, { button: "right" });
    const cleared = (await map())[1].charAt(3);
    // a pot painted on the patch of sun is a pot in the sun; the gardener moves rather than doubles
    await pick("Pot");
    const sun = await at(5, 3); await p.mouse.click(sun.x, sun.y);
    await pick("Gardener");
    const g2 = await at(5, 4); await p.mouse.click(g2.x, g2.y);
    const m = await map();
    check("potting-shed editor: six things to paint (bench, floor, sun, pot, pot in the sun, the gardener); a drag paints benches, a right-click floor",
      tools.join() === "Bench,Floor,Sun,Pot,Pot in sun,Gardener" && fresh[3] === "# @$ . #" && row === "# #### #" && cleared === " ", { tools, fresh: fresh[3], row, cleared });
    check("potting-shed editor: a pot painted on a patch of sun is a pot in the sun, and painting the gardener moves him (one only)",
      m[3].charAt(5) === "*" && m.join("").split("").filter((c) => c === "@" || c === "+").length === 1 && m[4].charAt(5) === "@", m);
  }

  // ---- what stops a shed: each says why, and the buttons wait ------------------------------
  {
    const cases = [
      ["no gardener", ["#######", "#     #", "# $ . #", "#     #", "#######"], /put the gardener/i],
      ["pots and patches", ["#######", "#     #", "#@$$. #", "#     #", "#######"], /2 pots but 1 patch/],
      ["an open side", ["####### ", "#      #", "# @$ .  ", "#      #", "########"], /isn't closed/],
      ["a pot shut away", ["########", "#  #   #", "# @#$. #", "#  #   #", "########"], /shut away/],
      ["already potted", ["#######", "#     #", "# @ * #", "#     #", "#######"], /in the sun already/]
    ];
    const got = {};
    for (const [label, m, re] of cases) {
      await ed((m) => PottingShedEditor.open({ name: "", map: m }), m);
      got[label] = { say: await say(), off: await off("ed-test") && await off("ed-check") && await off("ed-save") && await off("ed-play") && await off("ed-share"), ok: re.test(await say()) };
    }
    await ed((m) => PottingShedEditor.open({ name: "", map: m }), COLD);
    const fine = { say: await say(), on: !(await off("ed-test")) && !(await off("ed-check")) && !(await off("ed-save")) };
    check("potting-shed editor: a shed with no gardener, pots and patches of sun that don't match, an open side, a pot shut away or every pot in the sun already says why, and Test, Check, Save and the links wait",
      Object.values(got).every((v) => v.ok && v.off) && fine.on && /^Ready: 4 pots/.test(fine.say), { got, fine });
  }

  // ---- Check: the fewest pushes, and no way when there's none ----------------------------------
  {
    await ed((m) => PottingShedEditor.open({ name: "", map: m }), COLD);
    await p.click("#ed-check");
    await p.waitForFunction(() => { const c = PottingShedEditor.checked(); return c && c !== "checking"; }, null, { timeout: 30000 });
    const solved = { say: await say(), c: await ed(() => PottingShedEditor.checked()) };
    // a pot pushed into a corner with no sun there: no way at all
    await ed(() => PottingShedEditor.open({ name: "", map: ["#######", "#$    #", "#  @ .#", "#     #", "#######"] }));
    await p.click("#ed-check");
    await p.waitForFunction(() => { const c = PottingShedEditor.checked(); return c && c !== "checking"; }, null, { timeout: 30000 });
    const none = await say();
    check("potting-shed editor: Check finds the fewest pushes (Cold Frame: 4 pushes, 30 moves) and says when there's no way to pot a shed",
      /Solvable in 4 pushes \(30 moves\)/.test(solved.say) && solved.c.found && solved.c.path.length === 30 && /No solution/.test(none), { solved: solved.say, none });
    // a change to the shed puts the answer aside
    await ed((m) => PottingShedEditor.open({ name: "", map: m }), COLD);
    await p.click("#ed-check");
    await p.waitForFunction(() => { const c = PottingShedEditor.checked(); return c && c !== "checking"; }, null, { timeout: 30000 });
    await ed(() => PottingShedEditor.paint(1, 1, "#"));
    const after = { c: await ed(() => PottingShedEditor.checked()), say: await say() };
    check("potting-shed editor: a change to the shed puts Check's answer aside", after.c === null && /^Ready/.test(after.say), after);
  }

  // ---- Test: the game's rules on the shed as drawn ---------------------------------------------------
  {
    await ed((m) => PottingShedEditor.open({ name: "Frame test", map: m }), COLD);
    await p.click("#ed-check");
    await p.waitForFunction(() => { const c = PottingShedEditor.checked(); return c && c !== "checking"; }, null, { timeout: 30000 });
    const path = (await ed(() => PottingShedEditor.checked())).path;
    await p.click("#ed-test"); await settle();
    const caps = await ed(() => Array.from(document.querySelectorAll("#ed-testbar button")).map((b) => b.getAttribute("data-gs-key")));
    // a key held walks one step; U takes it back; a bench stops him
    const key = { L: "ArrowLeft", R: "ArrowRight", U: "ArrowUp", D: "ArrowDown" };
    const me0 = (await ed(() => PottingShedEditor.test())).me;
    // (a key held: its first press, then the repeats the keyboard sends)
    await p.keyboard.press("ArrowLeft");
    await ed(() => { for (let i = 0; i < 3; i++) document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", code: "ArrowLeft", repeat: true, bubbles: true, cancelable: true })); });
    const held = await ed(() => PottingShedEditor.test());
    await p.keyboard.press("u"); await settle();
    const back = await ed(() => PottingShedEditor.test());
    for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowDown");
    const stopped = await ed(() => PottingShedEditor.test());
    await p.keyboard.press("r"); await settle();
    const over = await ed(() => PottingShedEditor.test());
    for (const ch of path) await p.keyboard.press(key[ch]);
    await p.waitForFunction(() => !document.getElementById("ed-done").hidden, null, { timeout: 8000 });
    const card = await ed(() => ({ msg: document.getElementById("ed-done-msg").textContent, stats: document.getElementById("ed-done-stats").textContent, t: PottingShedEditor.test() }));
    await p.keyboard.press("r"); await settle(200);
    const again = await ed(() => ({ t: PottingShedEditor.test(), card: !document.getElementById("ed-done").hidden }));
    for (const ch of path) await p.keyboard.press(key[ch]);
    await p.waitForFunction(() => !document.getElementById("ed-done").hidden, null, { timeout: 8000 });
    await p.keyboard.press("Enter"); await settle(200);
    const backEdit = await ed(() => ({ t: PottingShedEditor.test(), card: !document.getElementById("ed-done").hidden, map: PottingShedEditor.map() }));
    check("potting-shed editor: Test plays the shed on the game's rules, a key held walking one step (U back, a bench stopping him, R over, the keys on Undo, Start over and Stop)",
      caps.join() === "U,R,⌫" && held.moves === 1 && held.me === me0 - 1 && back.moves === 0 && back.me === me0 && stopped.moves === 0 && over.moves === 0, { caps, me0, held, back, stopped, over });
    check("potting-shed editor: the check's solution pots the shed in the test, and the card says so (R tests again, Enter back to editing, the shed as it was)",
      card.t.done && card.msg === "30 moves" && /^4 pushes/.test(card.stats) && again.t && again.t.moves === 0 && !again.card && backEdit.t === null && !backEdit.card && backEdit.map.join("|") === COLD.join("|"), { card, again, backEdit });
    // Esc in a test stops it, and doesn't leave
    await p.click("#ed-test"); await settle();
    await p.keyboard.press("Escape"); await settle(350);
    const esc = { test: await ed(() => !!PottingShedEditor.test()), leaves: p.leaves };
    check("potting-shed editor: Esc stops a test and doesn't leave the editor", !esc.test && esc.leaves === 0, esc);
  }

  // ---- saving: Save, Save as new, Edit, Delete (asking first) -------------------------------------------
  {
    await ed((m) => PottingShedEditor.open({ name: "", map: m }), COLD);
    await p.fill("#ed-name", "Cold Frame Copy");
    await p.click("#ed-save");
    const one = await ed(() => PottingShedEditor.saved());
    await ed(() => PottingShedEditor.paint(1, 1, "#"));
    await p.click("#ed-save");
    const over = await ed(() => PottingShedEditor.saved());
    await p.click("#ed-savenew");
    const two = await ed(() => PottingShedEditor.saved());
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await settle(300);
    const listed = await ed(() => Array.from(document.querySelectorAll("#ed-saved .saved-item .nm")).map((n) => n.textContent));
    const draft = await ed(() => PottingShedEditor.map());
    // Delete asks: Keep it keeps it, Delete deletes it
    await p.click("#ed-saved .saved-item:nth-child(2) button:has-text('Delete')");
    await p.waitForSelector(".gs-dialog");
    const asked = await ed(() => document.querySelector(".gs-dialog h2").textContent);
    await p.click(".gs-dialog button:has-text('Keep it')");
    await p.waitForFunction(() => !document.querySelector(".gs-dialog"));
    const kept = (await ed(() => PottingShedEditor.saved())).length;
    await p.click("#ed-saved .saved-item:nth-child(2) button:has-text('Delete')");
    await p.waitForSelector(".gs-dialog");
    await p.click(".gs-dialog button:has-text('Delete')");
    await p.waitForFunction(() => !document.querySelector(".gs-dialog"));
    const gone = await ed(() => PottingShedEditor.saved());
    // Edit opens a saved shed
    await p.click("#ed-saved .saved-item:nth-child(1) button:has-text('Edit')");
    if (await ed(() => !!document.querySelector(".gs-dialog"))) await p.click(".gs-dialog button:has-text('Open it')");
    await settle();
    const opened = { map: await map(), name: await ed(() => PottingShedEditor.name()) };
    check("potting-shed editor: Save keeps the shed (Save again overwrites it, Save as new adds another), and they're listed after a reload, the draft kept",
      one.length === 1 && one[0].name === "Cold Frame Copy" && over.length === 1 && over[0].map[1].charAt(1) === "#" && two.length === 2 && listed.join() === "Cold Frame Copy,Cold Frame Copy" && draft[1].charAt(1) === "#",
      { one, over: over.length, two: two.length, listed, draft: draft[1] });
    check("potting-shed editor: Delete asks first (Keep it keeps the shed, Delete deletes it), and Edit opens a saved one",
      /Delete this shed/.test(asked) && kept === 2 && gone.length === 1 && opened.name === "Cold Frame Copy" && opened.map[1].charAt(1) === "#", { asked, kept, gone: gone.length, opened });
  }

  // ---- export and import: Export's text, a share link and a bare map --------------------------------------
  {
    await ed((m) => PottingShedEditor.open({ name: "Round trip", map: m }), COLD);
    await p.click("#ed-export");
    const text = await ed(() => document.getElementById("ed-io-text").value);
    await p.keyboard.press("Escape"); await settle();
    const closed = await ed(() => document.getElementById("ed-io").hidden);
    const link = await ed(() => PottingShedEditor.playUrl());
    const loads = [];
    for (const paste of [text, link, ["# bare map", ...COLD].join("\n")]) {
      await ed(() => PottingShedEditor.open({ name: "", map: ["#######", "#     #", "# @$. #", "#     #", "#######"] }));
      await p.click("#ed-import");
      await p.fill("#ed-io-text", paste);
      await p.click("#ed-io-load");
      if (await ed(() => !!document.querySelector(".gs-dialog"))) await p.click(".gs-dialog button:has-text('Load it')");
      await settle();
      loads.push({ same: (await map()).join("|") === COLD.join("|"), name: await ed(() => PottingShedEditor.name()), shut: await ed(() => document.getElementById("ed-io").hidden) });
    }
    check("potting-shed editor: Export's text, a share link and a bare map all import back (Esc closes the box)",
      closed && /#play=s1\./.test(link) && loads.every((l) => l.same && l.shut) && loads[0].name === "Round trip" && loads[1].name === "Round trip", { closed, link: link.slice(-30), loads });
  }

  // ---- leaving: Esc leaves (asking first while the shed isn't saved) --------------------------------------
  {
    await ed((m) => PottingShedEditor.open({ name: "", map: m }), COLD);
    await p.keyboard.press("Escape"); await settle(350);
    const clean = p.leaves;
    await ed(() => PottingShedEditor.paint(1, 1, "#"));
    await p.mouse.move(5, 300);
    await p.keyboard.press("Escape"); await settle(350);
    const ask = await ed(() => (document.querySelector(".gs-dialog p") || {}).textContent || "");
    await p.keyboard.press("x"); await settle(300);   // (any other key stays)
    check("potting-shed editor: Esc leaves for the games page, and with the shed not saved asks first",
      clean === 1 && /isn't saved/.test(ask) && p.leaves === 1, { clean, ask, leaves: p.leaves });
  }
  check("potting-shed editor (laptop): no page errors", p.errs.length === 0, p.errs);

  // ---- in the game: L opens the editor; My sheds; a link; no records ---------------------------------------
  {
    // a saved shed (still in this tab's storage) is under My sheds on the game's menu
    await p.goto(base + "games/potting-shed/", { waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await settle(300);
    const menu = await ed(() => ({ cap: document.getElementById("to-editor").getAttribute("data-gs-key"), mine: Array.from(document.querySelectorAll("#mine-list .tile")).map((t) => t.textContent), shown: !document.getElementById("mine").hidden }));
    await p.click("#mine-list .tile");
    await settle(150);
    const playing = await ed(() => ({ state: PottingShed.state(), own: PottingShed.own() && PottingShed.own().name, hud: document.getElementById("hud-shed").textContent }));
    // pot it by the solver's path: the card keeps no records
    const path = await ed(() => { const E = PottingShedEngine, s = E.solver(E.parse(PottingShed.own().map)); let r; do { r = s.run(50); } while (!r.done); return r.path; });
    await ed((path) => { const D = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] }; for (const ch of path) PottingShed.step(D[ch][0], D[ch][1]); }, path);
    await p.waitForFunction(() => PottingShed.state() === "done", null, { timeout: 8000 });
    const card = await ed(() => ({ stats: document.getElementById("done-stats").textContent, next: document.getElementById("next").hidden, best: localStorage.getItem("pottingshed_best") }));
    check("potting-shed: the shed editor's saved sheds are under My sheds on the menu, a tile going straight in; potted, the card keeps no records (no Next shed, no best saved)",
      menu.shown && menu.mine.join() === "Cold Frame Copy" && playing.state === "play" && playing.own === "Cold Frame Copy" && playing.hud === "Cold Frame Copy" &&
        /a shed of your own keeps no records/.test(card.stats) && card.next && card.best === null, { menu, playing, card });
    // L on the menu opens the editor
    await ed(() => PottingShed.toMenu());
    await p.keyboard.press("l");
    await p.waitForURL(/editor\.html/, { timeout: 15000 }).catch(() => {});
    check("potting-shed: Build a shed wears L, and L on the menu opens the shed editor", menu.cap === "L" && /editor\.html$/.test(p.url()), { cap: menu.cap, url: p.url() });
    await p.close();
    // a "#play=" link: the chosen shed on the menu, Space going in; a shed of the thirty puts it away
    const q = await lib.open(ctx, base, "games/potting-shed/");
    const code = await q.evaluate((m) => PottingShedEngine.encode({ name: "Linked Shed", map: m }), COLD);
    await q.goto(base + "games/potting-shed/#play=" + code, { waitUntil: "domcontentloaded" }); await q.waitForSelector(".mute-toggle"); await q.waitForTimeout(300);
    const linked = await q.evaluate(() => ({ name: document.getElementById("pick-name").textContent, note: document.getElementById("pick-note").textContent }));
    await q.keyboard.press("Space"); await q.waitForTimeout(150);
    const went = await q.evaluate(() => ({ state: PottingShed.state(), own: PottingShed.own() && PottingShed.own().name, pots: PottingShed.pots().length }));
    await q.evaluate(() => PottingShed.toMenu());
    await q.click("#shed-grid .tile:nth-child(1)"); await q.waitForTimeout(150);
    const dropped = await q.evaluate(() => ({ own: PottingShed.own(), shed: PottingShed.shed(), hash: location.hash }));
    check("potting-shed: a \"#play=\" link is the chosen shed on the menu (a shed of your own), Space goes in; a shed of the thirty puts it away",
      linked.name === "Linked Shed" && /a shed of your own · 4 pots/.test(linked.note) && went.state === "play" && went.own === "Linked Shed" && went.pots === 4 &&
        dropped.own === null && dropped.shed === 0 && dropped.hash === "", { linked, went, dropped });
    check("potting-shed (my sheds and links): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- on a phone: touch paints, nothing runs off the side, the tools in reach ------------------------------
  {
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await lib.open(c, base, "games/potting-shed/editor.html");
    await q.tap("#ed-palette button:has-text('Bench')");
    const pt = await q.evaluate(() => { const r = document.getElementById("ed-board").getBoundingClientRect(), s = PottingShedEditor.cell(); return { x: r.left + 3.5 * s, y: r.top + 1.5 * s }; });
    await q.touchscreen.tap(pt.x, pt.y); await q.waitForTimeout(100);
    const painted = await q.evaluate(() => PottingShedEditor.map()[1].charAt(3));
    const fit = await q.evaluate(() => {
      const r = document.getElementById("ed-board").getBoundingClientRect(), side = document.querySelector(".ed-side").getBoundingClientRect();
      return { wide: document.documentElement.scrollWidth <= innerWidth, board: { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }, side: { left: Math.round(side.left), right: Math.round(side.right) }, iw: innerWidth };
    });
    // every name fits its palette button
    const names = await q.evaluate(() => Array.from(document.querySelectorAll("#ed-palette button")).filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent));
    // a test on a phone (Test is below the shed): the shed comes into view under the corner buttons, the pad shows and walks him
    await q.tap("#ed-test"); await q.waitForTimeout(150);
    const shown = await q.evaluate(() => { const r = document.getElementById("ed-board").getBoundingClientRect(), c = document.querySelector(".nav-back-games").getBoundingClientRect(); return { top: Math.round(r.top), below: Math.round(c.bottom), ih: innerHeight }; });
    const pad = await q.evaluate(() => getComputedStyle(document.getElementById("pad")).display);
    const me0 = await q.evaluate(() => PottingShedEditor.test().me);
    await q.tap("#t-left"); await q.waitForTimeout(100);
    const me1 = await q.evaluate(() => PottingShedEditor.test().me);
    check("potting-shed editor, phone: a tap paints, every palette name fits its button, Test brings the shed into view (under the corner buttons) and the pad walks him, and nothing is wider than the screen",
      painted === "#" && names.length === 0 && fit.wide && fit.board.left >= 0 && fit.board.right <= fit.iw && fit.side.left >= 0 && fit.side.right <= fit.iw &&
        shown.top >= shown.below && shown.top < shown.ih / 2 && pad === "grid" && me1 === me0 - 1, { painted, names, fit, shown, pad, me0, me1 });
    check("potting-shed editor (phone): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }
  // ---- the tools' keys: 1 to 6 the paint, B benches round, T test, C check,
  // S save, N new, G play in the game, L copy the link, E export, I import,
  // Backspace back to the game, each worn on its button; typed into the
  // name they're only letters. And the actions in two even columns: every
  // button the same width and height, the columns lined up edge to edge and
  // filling the packet (they were each as wide as their words), on a laptop
  // and on phones
  {
    const c = await lib.newContext(browser, { viewport: { width: 1366, height: 657 } });
    const q = await lib.open(c, base, "games/potting-shed/editor.html");
    const SHED = { name: "Keys", map: ["#######", "#@ $ .#", "#     #", "#     #", "#######"] };
    await q.evaluate((m) => { localStorage.removeItem("pottingshed_mine"); PottingShedEditor.open(m); }, SHED);
    await q.waitForTimeout(150);
    const caps = await q.evaluate(() => Object.fromEntries(["ed-test", "ed-check", "ed-save", "ed-new", "ed-play", "ed-share", "ed-export", "ed-import", "ed-frame", "ed-back"]
      .map((id) => [id, document.getElementById(id).getAttribute("data-gs-key")]).concat([["palette", [...document.querySelectorAll("#ed-palette button")].map((b) => b.getAttribute("data-gs-key")).join("")]])));
    const r = {};
    await q.keyboard.press("3"); r.three = await q.evaluate(() => PottingShedEditor.tool());
    await q.keyboard.press("1");
    await q.keyboard.press("e"); r.exported = await q.evaluate(() => !document.getElementById("ed-io").hidden && document.getElementById("ed-io-title").textContent);
    await q.keyboard.press("Escape"); await q.keyboard.press("i"); r.imported = await q.evaluate(() => !document.getElementById("ed-io").hidden && document.getElementById("ed-io-title").textContent);
    await q.keyboard.press("Escape");
    await q.keyboard.press("c");
    await q.waitForFunction(() => PottingShedEditor.checked() && PottingShedEditor.checked() !== "checking", null, { timeout: 15000 }).catch(() => {});
    r.checked = await q.evaluate(() => !!PottingShedEditor.checked());
    await q.keyboard.press("s"); await q.waitForTimeout(100);
    r.saved = await q.evaluate(() => PottingShedEditor.saved().length);
    await q.keyboard.press("t"); await q.waitForTimeout(100);
    r.testing = await q.evaluate(() => !!PottingShedEditor.test());
    await q.keyboard.press("Escape"); await q.waitForTimeout(100);
    r.stopped = await q.evaluate(() => !PottingShedEditor.test());
    // typed into the name, T and E are letters
    await q.click("#ed-name"); await q.keyboard.press("End"); await q.keyboard.type("te");
    r.typed = await q.evaluate(() => ({ name: document.getElementById("ed-name").value, testing: !!PottingShedEditor.test(), box: !document.getElementById("ed-io").hidden }));
    await q.evaluate(() => document.activeElement.blur());
    // B: benches all round (a shed with a gap in its wall gets it closed)
    await q.evaluate(() => PottingShedEditor.paint(3, 0, " "));
    await q.keyboard.press("b"); r.closed = await q.evaluate(() => PottingShedEditor.map()[0][3] === "#");
    check("potting-shed editor: every tool shows its key (1 to 6 the paints, B, T, C, S, N, G, L, E, I, ⌫ back to the game)",
      caps.palette === "123456" && caps["ed-frame"] === "B" && caps["ed-test"] === "T" && caps["ed-check"] === "C" && caps["ed-save"] === "S" && caps["ed-new"] === "N" &&
      caps["ed-play"] === "G" && caps["ed-share"] === "L" && caps["ed-export"] === "E" && caps["ed-import"] === "I" && caps["ed-back"] === "⌫", caps);
    check("potting-shed editor: the keys press their tools (3 picks sun, E export, I import, C checks, S saves, T tests and Esc stops it, B closes the walls), and typed into the name they're only letters",
      r.three === "." && r.exported === "Export" && r.imported === "Import" && r.checked && r.saved === 1 && r.testing && r.stopped &&
      r.typed.name === "Keyste" && !r.typed.testing && !r.typed.box && r.closed, r);
    check("potting-shed editor (keys): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();

    const grid = [];
    for (const [w, h, phone] of [[1366, 657, 0], [1280, 900, 0], [390, 664, 1], [320, 568, 1]]) {
      const cc = await lib.newContext(browser, phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h } });
      const qq = await lib.open(cc, base, "games/potting-shed/editor.html");
      await qq.evaluate((m) => PottingShedEditor.open(m), SHED);
      await qq.waitForTimeout(150);
      grid.push(Object.assign({ size: w + "x" + h }, await qq.evaluate(() => {
        const box = document.querySelector(".ed-acts").getBoundingClientRect(), gap = parseFloat(getComputedStyle(document.querySelector(".ed-acts")).columnGap);
        const bs = [...document.querySelectorAll(".ed-acts button")].filter((b) => b.getClientRects().length).map((b) => b.getBoundingClientRect());
        const ws = bs.map((r) => r.width), hs = bs.map((r) => r.height);
        const lefts = bs.filter((r, i) => i % 2 === 0).map((r) => r.left), rights = bs.filter((r, i) => i % 2 === 1).map((r) => r.right);
        const span = (a) => Math.max(...a) - Math.min(...a);
        return { n: bs.length, w: span(ws), h: span(hs), half: +(ws[0] - (box.width - gap) / 2).toFixed(2), left: +(span(lefts) + Math.abs(lefts[0] - box.left)).toFixed(2), right: +(span(rights) + Math.abs(rights[0] - box.right)).toFixed(2) };
      })));
      await qq.close();
      await cc.close();
    }
    check("potting-shed editor: the eight actions sit in two even columns, every button the same width and height, the columns lined up and filling the packet, on laptops and phones (1366 x 657, 1280 x 900, 390, 320)",
      grid.every((g) => g.n === 8 && g.w < 0.5 && g.h < 0.5 && Math.abs(g.half) < 0.5 && g.left < 0.5 && g.right < 0.5), grid);
  }
  await ctx.close();
};
