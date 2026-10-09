// Slither: Classic's best and its pause (steering and held keys), a level
// link arriving mid-game, share-link bounds, and in the Labyrinth: the toggle
// keys and R, a finished match's R, a pack run's last crash, Fire Eggs'
// pause, the door switch's click, where a click lands on the board, and the
// Rainbow with Visual FX off. Then the key hints: keys on a desktop, the
// touch controls on a touch-only phone.
const path = require("path");

const G_HOOK = ["  var G = {", "  var G = window.__G = {"];
// every tone the page plays, as [freq, dur, type, …]
const TONE_HOOK = ["    tone: tone,", "    tone: function () { (window.__tones = window.__tones || []).push([].slice.call(arguments)); return tone.apply(null, arguments); },"];
const LAB_HOOK = ["  function inProgress() {", "  window.__lab = { st: function () { return st; }, tally: function (t) { tally = t; }, blastTally: function (t) { blastTally = t; } };\n  function inProgress() {"];

// A wide open level with an amber click-switch and door, for the Labyrinth keys
const TEST_LEVEL = {
  id: "t", zone: "Garden", name: "Test", time: 0, grid: [
    "####################",
    "#..................#",
    "#.S..............a.#",
    "#..................#",
    "#..K........D......#",
    "#..................#",
    "#.................E#",
    "####################",
  ],
};

module.exports = async ({ browser, base, check, lib }) => {
  const Code = require(path.join(lib.ROOT, "games/slither/levelcode.js"));
  const ctx = await lib.newContext(browser);
  const classic = (url) => lib.open(ctx, base, url || "games/slither/", { before: (pg) => lib.injectScript(pg, "games/slither/game.js", [G_HOOK]) });
  const lab = (url) => lib.open(ctx, base, url || "games/slither/", { before: async (pg) => {
    await lib.injectScript(pg, "games/slither/game.js", [TONE_HOOK]);
    await lib.injectScript(pg, "games/slither/labyrinth.js", [LAB_HOOK]);
  } });
  const resultShown = (p) => p.evaluate(() => !document.getElementById("result").classList.contains("hidden"));
  const pausedCard = (p) => p.evaluate(() => !document.getElementById("pause").classList.contains("hidden"));
  // Start a run (a click on `sel`) and feed it n apples, each set on the cell
  // ahead of the head the moment the last is eaten, all in the page: on a busy
  // machine the round trips between feeds let the snake run on into the wall
  // first. While it feeds, the snake steps once every 1.5 s (a slow frame can
  // otherwise catch up several steps at once and run it past the apple); its
  // speed comes back after. With `pause`, Esc pauses it as the last apple goes
  // down, before it can run on.
  const run = (p, sel, n, pause) => p.evaluate(([sel, n, pause]) => new Promise((done) => {
    document.querySelector(sel).click();
    let eaten = 0, last = null, iv0 = null;
    const t0 = performance.now();
    (function f() {
      const sn = __G.snakes[0];
      if (last === null && sn.score !== 0) return requestAnimationFrame(f);   // (the new run's first frame)
      if (iv0 === null) iv0 = __G.interval;
      __G.interval = 1500;
      if (last === null || sn.score !== last) {
        if (last !== null) eaten++;
        last = sn.score;
        if (eaten < n) __G.food = { x: sn.body[0].x + sn.dir.x, y: sn.body[0].y + sn.dir.y };
      }
      if (eaten >= n || sn.alive === false || performance.now() - t0 > 60000) {
        __G.interval = iv0;
        if (pause) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        return done(sn.score);
      }
      requestAnimationFrame(f);
    })();
  }), [sel, n, !!pause]);
  const classicState = (p) => p.evaluate(() => ({ score: __G.snakes[0].score, stored: localStorage.getItem("snake_best"), hud: document.getElementById("best-label").textContent, msg: document.getElementById("result-msg").textContent }));

  // ---- Classic: a run left by Restart doesn't let the next, lower one overwrite the best
  let p = await classic();
  await run(p, "#play-btn", 5, true);   // (then paused, as Esc did)
  const b0 = await classicState(p);
  await run(p, "#pause-restart", 2);
  const b1 = await classicState(p);
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 20000 });
  const b2 = await classicState(p);
  check("slither classic: the HUD's best follows a score passing it", b0.stored === "5" && b0.hud === "Best: 5", b0);
  check("slither classic: after Restart, a lower score doesn't overwrite the saved best", b1.stored === "5" && b1.hud === "Best: 5" && /Best: 5/.test(b2.msg) && !/New Best/.test(b2.msg), { b1, b2 });
  await run(p, "#result-primary", 6);
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 20000 });
  const b3 = await classicState(p);
  check("slither classic: beating the best still says New Best", b3.stored === "6" && /New Best/.test(b3.msg), b3);

  // ---- Classic: steering pressed while paused is ignored; a held P doesn't flicker the pause
  await p.click("#result-primary"); await p.waitForTimeout(200);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await p.keyboard.press("ArrowUp"); await p.waitForTimeout(50);
  const q = await p.evaluate(() => __G.snakes[0].queuedDir);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const d = await p.evaluate(() => __G.snakes[0].dir);
  check("slither classic: an arrow pressed while paused doesn't turn the snake on resume", q === null && d.x === 1 && d.y === 0, { q, d });
  const held = [];
  await lib.fireKey(p, { key: "p" }); held.push(await p.evaluate(() => __G.paused));
  for (let i = 0; i < 3; i++) { await lib.fireKey(p, { key: "p", repeat: true }); held.push(await p.evaluate(() => __G.paused)); }
  check("slither classic: holding P pauses once (key repeats don't toggle it)", held.every((x) => x), held);
  check("slither classic: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- a #play= link arriving (hashchange) stops a Classic or 2-Player game under it
  const code = Code.encode(TEST_LEVEL);
  p = await classic();
  await p.click("#play-btn"); await p.waitForTimeout(200);
  await p.evaluate((c) => { location.hash = "#play=" + c; }, code);
  await p.waitForTimeout(600);
  const soloErrs = p.errs.slice();
  await p.close();
  p = await classic();
  await p.click('[data-mode="two"]'); await p.click("#play-btn"); await p.waitForTimeout(200);
  await p.evaluate((c) => { location.hash = "#play=" + c; }, code);
  await p.waitForTimeout(3600);   // (the 2-player snakes would both have hit a wall by now)
  const h = await p.evaluate(() => ({ result: !document.getElementById("result").classList.contains("hidden"), title: document.getElementById("result-title").textContent, running: __G.running }));
  check("slither: a level link arriving mid-game stops Classic (no error) and 2-Player (no stray result card)", soloErrs.length === 0 && !h.result && !h.running && p.errs.length === 0, { soloErrs, h, errs: p.errs });
  await p.close();

  // ---- share links: speeds and clocks come back within sane bounds
  const lv = Code.decode(Code.encode(Object.assign({}, TEST_LEVEL, { speed: -50, spikeMs: -1, time: -5, enemyMs: { hunt: -3, wander: 100000 } })));
  const lv2 = Code.decode(Code.encode(Object.assign({}, TEST_LEVEL, { spikeMs: 1080, time: 45, enemyMs: { hunt: 230 } })));
  check("slither share link: negative or huge speed / spike / enemy / time values are clamped or dropped",
    !(lv.speed <= 0) && !(lv.spikeMs <= 0) && lv.time >= 0 && !(lv.enemyMs.hunt <= 0) && !(lv.enemyMs.wander > 5000), lv);
  check("slither share link: ordinary values come through as they were", lv2.spikeMs === 1080 && lv2.time === 45 && lv2.enemyMs.hunt === 230, lv2);

  // ---- Labyrinth (a test level by link): where a click lands, the toggle keys, the door switch's click
  p = await lab("games/slither/#play=" + code);
  await p.waitForFunction(() => window.__lab && __lab.st() && __lab.st().level.id === "t");
  const edge = await p.evaluate(() => {
    const c = document.getElementById("board"), r = c.getBoundingClientRect(), st = __lab.st();
    const cw = c.clientWidth / st.cols, ch = c.clientHeight / st.rows, x0 = r.left + c.clientLeft, y = r.top + c.clientTop + ch * 1.5;
    return { a: { x: x0 + cw - 1.5, y, want: st.cols }, b: { x: x0 + cw * (st.cols - 1) + 1.5, y, want: st.cols * 2 - 1 } };
  });
  const cursorAt = async (pt) => { await p.mouse.move(pt.x, pt.y); return p.evaluate(() => __lab.st().cursor); };
  const ca = await cursorAt(edge.a), cb = await cursorAt(edge.b);
  check("slither labyrinth: a click at a cell's edge lands on that cell (the board's border isn't counted)", ca === edge.a.want && cb === edge.b.want, { ca, cb, edge });
  await p.mouse.move(5, 5);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(100);
  await p.evaluate(() => { window.__tones = []; });
  await lib.fireKey(p, { key: "1" });
  const f1 = await p.evaluate(() => __lab.st().flip[0]);
  for (let i = 0; i < 3; i++) await lib.fireKey(p, { key: "1", repeat: true });
  const f2 = await p.evaluate(() => __lab.st().flip[0]);
  check("slither labyrinth: holding 1 flips the amber doors once", f1 === true && f2 === true, { f1, f2 });
  await p.waitForTimeout(120);
  const tones = await p.evaluate(() => window.__tones);
  check("slither labyrinth: a door switch plays its click (not the Maze Chase flip)", tones.some((t) => t[0] === 900 && t[2] === "square"), tones);
  const lp = [];
  await lib.fireKey(p, { key: "p" }); lp.push(await pausedCard(p));
  for (let i = 0; i < 3; i++) { await lib.fireKey(p, { key: "p", repeat: true }); lp.push(await pausedCard(p)); }
  const music = () => p.evaluate(() => localStorage.getItem("slither_music"));
  await lib.fireKey(p, { key: "m" }); const m1 = await music();
  for (let i = 0; i < 3; i++) await lib.fireKey(p, { key: "m", repeat: true });
  const m2 = await music();
  check("slither labyrinth: holding P pauses once and holding M toggles the music once", lp.every((x) => x) && m1 === "0" && m2 === "0", { lp, m1, m2 });
  // (each restart makes a new state; a mark on the old one tells them apart)
  const mark = () => p.evaluate(() => { __lab.st().__mark = true; });
  const marked = () => p.evaluate(() => !!__lab.st().__mark);
  await mark(); await lib.fireKey(p, { key: "r" }); const r1 = await marked();
  await mark(); for (let i = 0; i < 3; i++) await lib.fireKey(p, { key: "r", repeat: true });
  const r2 = await marked();
  check("slither labyrinth: holding R restarts once", r1 === false && r2 === true, { r1, r2 });
  check("slither labyrinth: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the level editor paints where the pointer is too (a blank level is 24 × 15)
  p = await lib.open(ctx, base, "games/slither/editor.html");
  const ept = await p.evaluate(() => {
    const c = document.getElementById("ed-board"), r = c.getBoundingClientRect(), cw = c.clientWidth / 24, ch = c.clientHeight / 15;
    return { x: r.left + c.clientLeft + cw - 1.5, y: r.top + c.clientTop + ch * 1.5 };
  });
  await p.mouse.move(ept.x, ept.y);
  const es = await p.evaluate(() => document.getElementById("ed-status").textContent);
  check("slither editor: the pointer at a cell's edge reads as that cell", /^0,1 /.test(es), es);
  await p.close();

  // ---- Arena: R on a finished match starts a new match
  const openPanel = (p, re, btn) => p.evaluate(([re, btn]) => {
    const d = [...document.querySelectorAll("details.lab-runs")].find((x) => new RegExp(re).test(x.textContent));
    d.open = true; [...d.querySelectorAll("button")].find((x) => new RegExp(btn).test(x.textContent)).click();
  }, [re, btn]);
  const hud = (p) => p.evaluate(() => document.getElementById("lab-apples").textContent);
  p = await lab();
  await p.click('[data-mode="lab"]'); await p.waitForTimeout(300);
  await openPanel(p, "Arena", "^🏟"); await p.waitForTimeout(400);
  await p.evaluate(() => __lab.tally({ p1: 0, p2: 0, rival: 2 }));
  await p.keyboard.press("ArrowUp");
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 15000 });
  const at = await p.evaluate(() => document.getElementById("result-title").textContent);
  await p.keyboard.press("r"); await p.waitForTimeout(300);
  const ah = await hud(p);
  check("slither arena: R after the match is decided starts a fresh match", /take the match/.test(at) && /You 0 · Rivals 0/.test(ah), { at, ah });
  await p.close();

  // ---- Fire Eggs: Space doesn't resume a paused arena; R on a finished match starts a new one
  p = await lab();
  await p.click('[data-mode="lab"]'); await p.waitForTimeout(300);
  await openPanel(p, "Fire Eggs", "^🥚"); await p.waitForTimeout(500);
  await p.keyboard.down("ArrowRight"); await p.waitForTimeout(150); await p.keyboard.up("ArrowRight");
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const e0 = await pausedCard(p);
  await p.keyboard.press("Space"); await p.waitForTimeout(100);
  const e1 = await pausedCard(p);
  check("slither fire eggs: Space doesn't resume a paused arena", e0 && e1, { e0, e1 });
  if (await pausedCard(p)) { await p.keyboard.press("p"); await p.waitForTimeout(100); }
  await p.evaluate(() => __lab.blastTally({ p1: 0, p2: 0, rival: 2 }));
  await p.keyboard.press("Space"); await p.waitForTimeout(50);
  // (the egg goes off at once, under its own snake)
  await p.evaluate(() => __lab.st().blast.eggs.forEach((e) => { if (e.owner.ctrl === "p1") e.fuse = 1; }));
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 8000 });
  const bt = await p.evaluate(() => document.getElementById("result-title").textContent);
  await p.keyboard.press("r"); await p.waitForTimeout(300);
  const bh = await hud(p);
  check("slither fire eggs: R after the match is decided starts a fresh match", /take the match/.test(bt) && /You 0 · Rivals 0/.test(bh), { bt, bh });
  check("slither fire eggs / arena: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- pack run: R pressed just after the last life's crash still shows "Run over"
  p = await lab();
  await p.evaluate(() => localStorage.setItem("slither_labyrinth", JSON.stringify({ best: {}, run: { zone: "Garden", idx: 0, lives: 1, apples: 0 } })));
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(400);
  await p.click('[data-mode="lab"]'); await p.waitForTimeout(300);
  await p.click(".lab-runs .btn.cont"); await p.waitForTimeout(300);
  await p.keyboard.press("ArrowUp");
  await p.waitForFunction(() => __lab.st().status === "dead", null, { timeout: 5000 });
  await p.keyboard.press("r"); await p.waitForTimeout(1000);
  const ro = await p.evaluate(() => ({ result: !document.getElementById("result").classList.contains("hidden"), title: document.getElementById("result-title").textContent }));
  check("slither pack run: R right after the last life's crash still ends on the Run over card", ro.result && /Run over/.test(ro.title), ro);
  await p.close();

  // ---- a stage's end card: no best line before there's a best to beat (as a
  // level's first clear), and the best once there is one
  const stageEnd = async (p) => {
    await p.click('[data-mode="lab"]'); await p.waitForTimeout(200);
    await openPanel(p, "Stages", "Courtyard"); await p.waitForTimeout(300);
    await p.keyboard.press("ArrowUp");   // (straight into the top wall, no apples)
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 8000 });
    return p.evaluate(() => document.getElementById("result-msg").textContent);
  };
  p = await lab();
  const first = await stageEnd(p);
  await p.evaluate(() => localStorage.setItem("slither_labyrinth", JSON.stringify({ best: {}, stageBest: { courtyard: 5 } })));
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(400);
  const later = await stageEnd(p);
  check("slither stage: the first end card has no best line (not \"Best 0\")", /^Score 0 🍎/.test(first) && !/Best/.test(first), first);
  check("slither stage: with a best saved, the end card shows it (guard)", /Best 5/.test(later), later);
  await p.close();

  // ---- the same for a Maze Chase run caught without a bead (on its last
  // life, a guardian set down on the still-coiled snake) and a scoreless Classic run
  const chaseEnd = async (p) => {
    await p.click('[data-mode="lab"]'); await p.waitForTimeout(200);
    await openPanel(p, "Maze Chase", "^👻"); await p.waitForTimeout(300);
    await p.evaluate(() => {
      const st = __lab.st();
      st.chase.lives = 1;
      st.guards.forEach((g) => { g.timer = 1e9; });
      Object.assign(st.guards[0], { cell: st.player.body[0], state: "roam", fright: false });
      st.status = "play";
    });
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 8000 });
    return p.evaluate(() => document.getElementById("result-msg").textContent);
  };
  p = await lab();
  const chase1 = await chaseEnd(p);
  await p.evaluate(() => localStorage.setItem("slither_labyrinth", JSON.stringify({ best: {}, chaseBest: 500 })));
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(400);
  const chase2 = await chaseEnd(p);
  check("slither maze chase: the first end card has no best line (not \"Best 0\")", /^Score 0 /.test(chase1) && !/Best/.test(chase1), chase1);
  check("slither maze chase: with a best saved, the end card shows it (guard)", /Best 500/.test(chase2), chase2);
  await p.close();
  p = await classic();
  await p.click("#play-btn");   // (heading right, into the wall, with nothing eaten)
  await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 8000 });
  const c0 = await p.evaluate(() => document.getElementById("result-msg").textContent);
  check("slither classic: a scoreless first run's card has no best line (not \"Best: 0\")", /^Score: 0/.test(c0) && !/Best/.test(c0), c0);
  await p.close();

  // ---- the Rainbow serpent holds its colours still with Visual FX off
  p = await lib.open(ctx, base, "games/slither/");
  const rb = await p.evaluate(() => {
    const draw = (t, fx) => {
      const c = document.createElement("canvas"); c.width = 120; c.height = 40;
      const g = c.getContext("2d");
      SlitherArt.serpent(g, [{ x: 90, y: 20 }, { x: 70, y: 20 }, { x: 50, y: 20 }, { x: 30, y: 20 }], { cell: 20, pal: SlitherArt.SERPENTS.prism, dir: { x: 1, y: 0 }, t, fx, seed: 0 });
      return c.toDataURL();
    };
    return { off: draw(0, false) === draw(1500, false), on: draw(0, true) === draw(1500, true) };
  });
  check("slither: with Visual FX off the Rainbow's colours stand still (with it on they cycle)", rb.off && !rb.on, rb);
  await p.close();
  await ctx.close();

  // ---- key hints: the keys on a desktop; on a touch-only phone, the touch
  // controls that do the same (and no keycaps)
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const tctx = await lib.newContext(browser, opts), phone = label === "phone";
    const tlab = (url) => lib.open(tctx, base, url || "games/slither/", { before: (pg) => lib.injectScript(pg, "games/slither/labyrinth.js", [LAB_HOOK]) });
    // what an element shows: its keycaps on screen, and its visible text
    const seen = (p, sel) => p.evaluate((sel) => {
      const e = document.querySelector(sel);
      return { kbd: [...e.querySelectorAll("kbd")].filter((k) => k.getClientRects().length).length, text: e.innerText };
    }, sel);
    // keys on a desktop; on the phone, no keys and the touch wording `re`
    const hint = (s, re) => phone ? s.kbd === 0 && re.test(s.text) : s.kbd > 0;

    p = await tlab();
    const help = {};
    for (const m of ["solo", "two", "lab"]) { await p.click('[data-mode="' + m + '"]'); help[m] = await seen(p, "#keys-help"); }
    check("slither " + label + ": the menu's controls line names " + (phone ? "the touch controls" : "the keys"),
      hint(help.solo, /Swipe the board/) && hint(help.two, /d-pads/) && hint(help.lab, /tap a cell to teleport/), help);
    await p.evaluate(() => { document.getElementById("legend-lab").open = true; [...document.querySelectorAll("details.lab-runs")].forEach((d) => { d.open = true; }); });
    const legend = await seen(p, "#legend-lab"), panels = await seen(p, "#lab-levels");
    check("slither " + label + ": the Labyrinth legend and the Fire Eggs panel name " + (phone ? "the touch controls" : "the keys"),
      hint(legend, /hold 👻 to pass through/i) && hint(panels, /🥚 lays an egg/), { legend: legend.kbd, panels: panels.kbd });
    // level 2's hint, and the ready banner on the canvas (its fillText recorded)
    await p.evaluate(() => {
      const g = document.getElementById("board").getContext("2d"), fill = g.fillText.bind(g);
      window.__drawn = []; g.fillText = function (t, x, y, w) { __drawn.push(String(t)); return fill(t, x, y, w); };
      document.querySelectorAll(".lab-lv")[1].click();
    });
    await p.waitForTimeout(300);
    const lvHint = await seen(p, "#lab-hint");
    check("slither " + label + ": a level's hint names " + (phone ? "the touch control" : "the key"), hint(lvHint, /Hold ⚡ to dash/), lvHint);
    const drawn = (await p.evaluate(() => __drawn.join("|")));
    check("slither " + label + ": the ready banner says how to begin " + (phone ? "by touch (guard)" : "with keys (guard)"),
      phone ? /Swipe or tap the d-pad/.test(drawn) && !/arrow key/.test(drawn) : /arrow key/.test(drawn) && !/Swipe/.test(drawn), drawn.slice(0, 300));
    // crash at once (the start is under the top wall): the retry line
    await p.keyboard.press("ArrowUp");
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 5000 });
    const retry = await seen(p, "#result-msg");
    check("slither " + label + ": the crash card's retry line names " + (phone ? "the Retry button" : "R / Enter"), hint(retry, /tap Retry/) && (phone || !/tap Retry/.test(retry.text)), retry);
    await p.close();

    // a stage's end card
    p = await tlab();
    await p.click('[data-mode="lab"]'); await p.waitForTimeout(200);
    await p.evaluate(() => { const d = [...document.querySelectorAll("details.lab-runs")].find((x) => /Stages/.test(x.textContent)); d.open = true; d.querySelector(".row button").click(); });
    await p.waitForTimeout(300);
    await p.keyboard.press("ArrowUp");
    await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 8000 });
    const again = await seen(p, "#result-msg");
    check("slither " + label + ": a stage's end card names " + (phone ? "the Play Again button" : "R / Enter"), hint(again, /tap Play Again/) && (phone || !/tap Play Again/.test(again.text)), again);
    check("slither " + label + ": no page errors on the hints", p.errs.length === 0, p.errs);
    await p.close();
    await tctx.close();
  }
};
